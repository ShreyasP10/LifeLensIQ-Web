import { initFirebase, initAuth, chromeStoragePersistence } from './shared/firebase.js';
import { classify, SHORT_URL_RE, CATEGORIES } from './shared/categories.js';
import { buildEvent, makeEventId } from './shared/schema.js';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, writeBatch, doc, getDoc, setDoc } from 'firebase/firestore';

const SESSION_KEY = 'lifeiq_session';
const BUFFER_KEY = 'lifeiq_buffer';
const META_KEY = 'lifeiq_meta';
const OVERRIDES_KEY = 'categoryOverrides';

const MIN_SEGMENT_MS = 5000;
const IDLE_THRESHOLD_SECONDS = 15;
const TICK_MINUTES = 1;
const MAX_BUFFER = 20000;
const BATCH_SIZE = 450;
const WRITING_DOMAINS = ['docs.google.com', 'office.com', 'live.com', 'onedrive.com'];

let auth = null;
let db = null;
let authReady = false;
let currentUser = null;
let syncFailures = 0;
let lastSyncAttempt = 0;

/* ---------------- storage helpers ---------------- */

async function getSession() {
  return (await chrome.storage.local.get(SESSION_KEY))[SESSION_KEY] || null;
}
async function setSession(s) {
  await chrome.storage.local.set({ [SESSION_KEY]: s });
}
async function clearSession() {
  await chrome.storage.local.remove(SESSION_KEY);
}
async function getBuffer() {
  return (await chrome.storage.local.get(BUFFER_KEY))[BUFFER_KEY] || [];
}
async function setBuffer(b) {
  await chrome.storage.local.set({ [BUFFER_KEY]: b.slice(-MAX_BUFFER) });
}
async function getOverrides() {
  return (await chrome.storage.local.get(OVERRIDES_KEY))[OVERRIDES_KEY] || {};
}

/* ---------------- url helpers ---------------- */

function parseDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}
function parsePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}
function isPdfUrl(url) {
  return /\.pdf($|\?)/i.test(url) || /^file:\/\/.*\.pdf$/i.test(url);
}
function isHttp(url) {
  return /^https?:/i.test(url);
}

/* ---------------- segment lifecycle ---------------- */

function openSegment(tab) {
  const domain = parseDomain(tab.url);
  const path = parsePath(tab.url);
  const s = {
    eventId: makeEventId(),
    tabId: tab.id,
    domain,
    path,
    title: tab.title || '',
    eventType: 'tab_active',
    category: null,
    startTs: Date.now(),
    lastTs: Date.now(),
    typingBursts: 0,
    shorts: { views: 0, seconds: 0, lastUrl: '' },
    device: 'extension',
  };
  if (isPdfUrl(tab.url)) {
    s.eventType = 'pdf_view';
  } else if (SHORT_URL_RE.test(tab.url)) {
    s.eventType = 'short_video';
    s.category = CATEGORIES.SHORT_VIDEO;
    s.shorts.views = 1;
    s.shorts.lastUrl = tab.url;
  } else if (WRITING_DOMAINS.includes(domain)) {
    s.eventType = 'writing_session';
  }
  s.category = s.category || classify(domain, path, {});
  return s;
}

async function flushSegment() {
  const s = await getSession();
  if (!s) return;
  const now = Date.now();
  const durationMs = now - s.startTs;
  await clearSession();
  if (durationMs < MIN_SEGMENT_MS) return;
  s.lastTs = now;
  s.category = classify(s.domain, s.path, await getOverrides());
  if (s.eventType === 'short_video') {
    s.shorts.seconds = Math.round(durationMs / 1000);
  }
  const ev = buildEvent(s);
  const buffer = await getBuffer();
  buffer.push(ev);
  await setBuffer(buffer);
  await chrome.storage.local.set({ lastEventTs: now });
}

async function startSegmentForTab(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !tab.url || !isHttp(tab.url)) return null;
  const s = openSegment(tab);
  await setSession(s);
  return s;
}

async function onTabChanged(tabId) {
  await flushSegment();
  await startSegmentForTab(tabId);
}

/* ---------------- capture: tick ---------------- */

async function tick() {
  if (!authReady) await init();
  const idleState = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS);
  if (idleState === 'idle') {
    await flushSegment();
    return;
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const tab = tabs[0];
  if (!tab || !tab.url || !isHttp(tab.url)) return;

  let s = await getSession();
  if (!s || s.tabId !== tab.id) {
    await flushSegment();
    s = await startSegmentForTab(tab.id);
    if (!s) return;
  } else {
    if (isPdfUrl(tab.url) && s.eventType === 'tab_active') {
      s.eventType = 'pdf_view';
    }
    if (SHORT_URL_RE.test(tab.url) && s.eventType !== 'short_video') {
      s.eventType = 'short_video';
      s.category = CATEGORIES.SHORT_VIDEO;
      if (s.shorts.lastUrl !== tab.url) {
        s.shorts.views += 1;
        s.shorts.lastUrl = tab.url;
      }
    }
    s.title = tab.title || s.title;
    s.lastTs = Date.now();
    await setSession(s);
  }
  await syncBuffer();
}

/* ---------------- content script messages ---------------- */

async function handleShortView(tabId, url) {
  const s = await getSession();
  if (!s || s.tabId !== tabId) return;
  if (s.shorts.lastUrl === url) return;
  s.shorts.lastUrl = url;
  s.shorts.views += 1;
  s.eventType = 'short_video';
  s.category = CATEGORIES.SHORT_VIDEO;
  s.lastTs = Date.now();
  await setSession(s);
}

async function handleTypingBurst(tabId, count) {
  const s = await getSession();
  if (!s || s.tabId !== tabId) return;
  s.typingBursts += count;
  if (WRITING_DOMAINS.includes(s.domain)) {
    s.eventType = 'writing_session';
  }
  s.lastTs = Date.now();
  await setSession(s);
}

/* ---------------- firestore sync ---------------- */

async function syncBuffer() {
  if (!currentUser || !db) return;
  const buffer = await getBuffer();
  if (!buffer.length) {
    syncFailures = 0;
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const backoffMs = Math.min(syncFailures, 5) * 60 * 1000;
  if (Date.now() - lastSyncAttempt < backoffMs) return;
  lastSyncAttempt = Date.now();

  const chunks = [];
  for (let i = 0; i < buffer.length; i += BATCH_SIZE) {
    chunks.push(buffer.slice(i, i + BATCH_SIZE));
  }

  const committedIds = [];
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const ev of chunk) {
      batch.set(doc(db, 'users', currentUser.uid, 'events', ev.id), ev);
    }
    try {
      await batch.commit();
      committedIds.push(...chunk.map((e) => e.id));
    } catch (err) {
      syncFailures += 1;
      console.warn('LifeIQ sync chunk failed', err);
      break;
    }
  }

  if (committedIds.length) {
    const remaining = buffer.filter((e) => !committedIds.includes(e.id));
    await setBuffer(remaining);
    syncFailures = 0;
    lastSyncAttempt = 0;
    broadcastSyncStatus();
  }
}

function broadcastSyncStatus() {
  chrome.runtime
    .sendMessage({ type: 'syncStatus', pending: 0 })
    .catch(() => {});
}

/* ---------------- init & listeners ---------------- */

let initPromise = null;
function init() {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const fb = initFirebase();
        auth = fb.auth;
        db = fb.db;
        await initAuth(auth);
        onAuthStateChanged(auth, (user) => {
          currentUser = user;
          if (user) {
            ensureSettingsDoc(user);
            loadOverrides(user);
          }
        });
        authReady = true;
        syncBuffer();
      } catch (err) {
        console.warn('LifeIQ firebase init failed:', err.message);
      }
    })();
  }
  return initPromise;
}

async function ensureSettingsDoc(user) {
  const ref = doc(db, 'users', user.uid, 'settings', 'profile');
  const snap = await getDoc(ref).catch(() => null);
  if (snap && snap.exists()) return;
  await setDoc(ref, {
    email: user.email,
    createdAt: Date.now(),
    domainCategories: {},
    updatedAt: Date.now(),
  }).catch(() => {});
}

async function loadOverrides(user) {
  const ref = doc(db, 'users', user.uid, 'settings', 'profile');
  const snap = await getDoc(ref).catch(() => null);
  if (snap && snap.exists()) {
    const data = snap.data();
    if (data.domainCategories) {
      await chrome.storage.local.set({ [OVERRIDES_KEY]: data.domainCategories });
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  init();
  chrome.storage.local.get(META_KEY).then((res) => {
    if (!res[META_KEY]) {
      chrome.storage.local.set({ [META_KEY]: { installedAt: Date.now(), version: '0.1.0' } });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  clearSession();
  init();
});

chrome.alarms.create('tick', { periodInMinutes: TICK_MINUTES });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tick') tick();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  onTabChanged(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'loading') {
    onTabChanged(tabId);
  } else if (changeInfo.title && tab) {
    getSession().then((s) => {
      if (s && s.tabId === tabId) {
        s.title = tab.title || s.title;
        setSession(s);
      }
    });
  }
});

chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle') {
    flushSegment();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'short_view' && sender.tab) {
    handleShortView(sender.tab.id, msg.url);
  } else if (msg.type === 'typing_burst' && sender.tab) {
    handleTypingBurst(sender.tab.id, msg.count || 1);
  } else if (msg.type === 'syncNow') {
    init().then(syncBuffer);
  }
  sendResponse({ ok: true });
  return false;
});

init();
