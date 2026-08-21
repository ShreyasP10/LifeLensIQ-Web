import { initFirebase, initAuth } from './shared/firebase.js';
import { classify, SHORT_URL_RE, CATEGORIES } from './shared/categories.js';
import { buildEvent, makeEventId } from './shared/schema.js';
import { getAuth, onAuthStateChanged } from 'firebase/auth/web-extension';
import { getFirestore, writeBatch, doc, getDoc, setDoc } from 'firebase/firestore';

const SESSION_KEY = 'lifelensiq_session';
const BUFFER_KEY = 'lifelensiq_buffer';
const META_KEY = 'lifelensiq_meta';
const PAUSE_KEY = 'lifelensiq_paused';
const LAST_SYNC_KEY = 'lifelensiq_last_sync';
const FOCUS_KEY = 'lifelensiq_focus';
const OVERRIDES_KEY = 'categoryOverrides';

const MIN_SEGMENT_MS = 5000;
const MERGE_GAP_MS = 120000;
const IDLE_THRESHOLD_SECONDS = 120;
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
async function safeSetBuffer(b) {
  try {
    await setBuffer(b);
  } catch {
    try {
      await setBuffer(b.slice(-2000));
    } catch {
      await chrome.storage.local.remove(BUFFER_KEY);
    }
  }
}
async function getOverrides() {
  return (await chrome.storage.local.get(OVERRIDES_KEY))[OVERRIDES_KEY] || {};
}
async function getPaused() {
  return Boolean((await chrome.storage.local.get(PAUSE_KEY))[PAUSE_KEY]);
}
async function setLastSyncTs() {
  await chrome.storage.local.set({ [LAST_SYNC_KEY]: Date.now() });
}

/* ---------------- focus mode ---------------- */

async function getFocus() {
  return (await chrome.storage.local.get(FOCUS_KEY))[FOCUS_KEY] || { active: false, allowlist: [], startTs: 0 };
}
async function setFocus(f) {
  await chrome.storage.local.set({ [FOCUS_KEY]: f });
}
function isFocusBlocked(domain, focus) {
  if (!focus || !focus.active || !domain) return false;
  const list = focus.allowlist || [];
  return !list.some((d) => domain === d || domain.endsWith('.' + d));
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
  if (s.eventType === 'pdf_view' && s.category === CATEGORIES.OTHER) {
    s.category = CATEGORIES.STUDY;
  }
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
  if (s.eventType === 'pdf_view' && (s.category === CATEGORIES.OTHER || !s.category)) {
    s.category = CATEGORIES.STUDY;
  }
  if (s.eventType === 'short_video') {
    s.shorts.seconds = Math.round(durationMs / 1000);
  }
  s.userId = currentUser?.uid || '';
  const focus = await getFocus();
  s.focus = Boolean(focus.active && !isFocusBlocked(s.domain, focus));
  const ev = buildEvent(s);
  const buffer = await getBuffer();

  const last = buffer[buffer.length - 1];
  const sameSite =
    last &&
    last.domain === ev.domain &&
    last.eventType === ev.eventType &&
    last.category === ev.category &&
    last.endTs &&
    ev.ts >= last.ts &&
    ev.ts - last.endTs <= MERGE_GAP_MS;

  if (sameSite) {
    last.endTs = ev.endTs;
    last.durationSeconds = Math.max(1, Math.round((ev.endTs - last.ts) / 1000));
    last.title = ev.title || last.title;
    last.path = ev.path || last.path;
  } else {
    buffer.push(ev);
  }
  await safeSetBuffer(buffer);
  await chrome.storage.local.set({ lastEventTs: now });
}

async function startSegmentForTab(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !tab.url || !isHttp(tab.url)) return null;
  const focus = await getFocus();
  const domain = parseDomain(tab.url);
  if (isFocusBlocked(domain, focus)) {
    await chrome.tabs
      .update(tabId, {
        url: chrome.runtime.getURL(`focus.html?domain=${encodeURIComponent(domain)}`),
      })
      .catch(() => {});
    return null;
  }
  const s = openSegment(tab);
  await setSession(s);
  return s;
}

async function onTabChanged(tabId) {
  await flushSegment();
  if (await getPaused()) return;
  await startSegmentForTab(tabId);
}

/* ---------------- capture: tick ---------------- */

async function tick() {
  try {
    if (!authReady) await init();
    if (await getPaused()) {
      await flushSegment();
    } else {
      const idleState = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS);
      if (idleState === 'idle') {
        await flushSegment();
      } else {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
        const tab = tabs[0];
        if (tab && tab.url && isHttp(tab.url)) {
          let s = await getSession();
          if (!s || s.tabId !== tab.id) {
            await flushSegment();
            s = await startSegmentForTab(tab.id);
          }
          if (s) {
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
        }
      }
    }
    await syncBuffer();
  } catch (err) {
    console.warn('LifeLensIQ tick failed:', err);
  }
}

/* ---------------- content script messages ---------------- */

async function handleShortView(tabId, url) {
  if (await getPaused()) return;
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
  if (await getPaused()) return;
  const s = await getSession();
  if (!s || s.tabId !== tabId) return;
  s.typingBursts += count;
  if (WRITING_DOMAINS.includes(s.domain)) {
    s.eventType = 'writing_session';
  }
  s.lastTs = Date.now();
  await setSession(s);
}

async function recordPomodoro(minutes, cycles) {
  const now = Date.now();
  const session = {
    eventId: makeEventId(),
    domain: 'pomodoro',
    path: '/pomodoro',
    title: `Pomodoro ×${cycles}`,
    eventType: 'POMODORO',
    category: CATEGORIES.STUDY,
    startTs: now - minutes * 60000,
    lastTs: now,
    typingBursts: 0,
    shorts: { views: 0, seconds: 0, lastUrl: '' },
    focus: true,
  };
  const ev = buildEvent(session);
  const buffer = await getBuffer();
  buffer.push(ev);
  await safeSetBuffer(buffer);
  await syncBuffer();
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
      console.warn('LifeLensIQ sync chunk failed', err);
      break;
    }
  }

  if (committedIds.length) {
    const remaining = buffer.filter((e) => !committedIds.includes(e.id));
    await safeSetBuffer(remaining);
    syncFailures = 0;
    lastSyncAttempt = 0;
    await setLastSyncTs();
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
        console.warn('LifeLensIQ firebase init failed:', err.message);
        initPromise = null;
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
      chrome.storage.local.set({ [META_KEY]: { installedAt: Date.now(), version: '0.2.0' } });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  flushSegment().catch(() => {});
  init();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getSession().then((s) => {
    if (s && s.tabId === tabId) return flushSegment().catch(() => {});
  });
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
  } else if (msg.type === 'getState') {
    (async () => {
      const [paused, session, lastSyncTs, buffer] = await Promise.all([
        getPaused(),
        getSession(),
        chrome.storage.local.get(LAST_SYNC_KEY).then((r) => r[LAST_SYNC_KEY] || null),
        getBuffer(),
      ]);
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      const ev = session ? buildEvent(session) : null;
      sendResponse({
        paused,
        online,
        pending: buffer.length,
        lastSyncTs,
        session: session
          ? {
              domain: session.domain,
              title: session.title,
              eventType: session.eventType,
              category: session.category,
              startTs: session.startTs,
              durationSeconds: ev ? ev.durationSeconds : 0,
            }
          : null,
      });
    })();
    return true;
  } else if (msg.type === 'setPause') {
    chrome.storage.local.set({ [PAUSE_KEY]: Boolean(msg.paused) });
    if (msg.paused) flushSegment();
    sendResponse({ ok: true });
  } else if (msg.type === 'getFocusState') {
    getFocus().then((f) =>
      sendResponse({ active: Boolean(f.active), allowlist: f.allowlist || [], startTs: f.startTs || 0 })
    );
    return true;
  } else if (msg.type === 'startFocus') {
    (async () => {
      const list = (msg.allowlist || [])
        .map((d) => String(d).trim().toLowerCase().replace(/^www\./, ''))
        .filter(Boolean);
      await setFocus({ active: true, allowlist: list, startTs: Date.now() });
      sendResponse({ ok: true });
    })();
    return true;
  } else if (msg.type === 'stopFocus') {
    (async () => {
      const cur = await getFocus();
      await setFocus({ active: false, allowlist: cur.allowlist || [], startTs: 0 });
      sendResponse({ ok: true });
    })();
    return true;
  } else if (msg.type === 'pomodoroDone') {
    recordPomodoro(msg.minutes || 25, msg.cycles || 1).then(() => sendResponse({ ok: true }));
    return true;
  }
  sendResponse({ ok: true });
  return false;
});

init();