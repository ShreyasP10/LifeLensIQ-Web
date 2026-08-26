import { initFirebase, isFirebaseConfigured, getFirebase, GoogleAuthProvider, signInWithPopup } from '../shared/firebase.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { categoryColor, CATEGORY_WEIGHTS } from '../shared/categories.js';
import { DASHBOARD_URL } from '../shared/firebase-config.js';

let auth = null;
let liveTick = null;

const el = (id) => document.getElementById(id);

function show(view) {
  el('auth-view').classList.toggle('hidden', view !== 'auth');
  el('app-view').classList.toggle('hidden', view !== 'app');
}

function setDot(state) {
  const dot = el('status-dot');
  dot.className = 'dot';
  if (state === 'on') dot.classList.add('on');
  else if (state === 'off') dot.classList.add('off');
}

function fmtAgo(ts) {
  if (!ts) return 'never';
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return `${h}h ago`;
}

function fmtElapsed(startTs) {
  if (!startTs) return '';
  const sec = Math.round((Date.now() - startTs) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function getTodayActiveSeconds() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startTs = startOfDay.getTime();
  const now = Date.now();
  let seconds = 0;

  // Local buffer
  const { lifelensiq_buffer: buffer = [] } = await chrome.storage.local.get('lifelensiq_buffer');
  for (const ev of buffer) {
    if (ev.ts >= startTs && ev.ts <= now) seconds += ev.durationSeconds || 0;
  }

  // Firestore synced events
  const fb = getFirebase();
  if (fb.db && fb.auth.currentUser) {
    try {
      const q = query(
        collection(fb.db, 'users', fb.auth.currentUser.uid, 'events'),
        where('ts', '>=', startTs),
        where('ts', '<=', Date.now())
      );
      const snap = await getDocs(q);
      snap.forEach(doc => { seconds += doc.data().durationSeconds || 0; });
    } catch {
      // Ignore errors
    }
  }
  return seconds;
}

function renderCategories(byCat) {
  const box = el('cat-summary');
  box.innerHTML = '';
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!entries.length) return;
  const total = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
  for (const [name, sec] of entries) {
    const pct = Math.round((sec / total) * 100);
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <span class="cat-name"><i style="background:${categoryColor(name)}"></i>${name}</span>
      <span class="cat-bar"><span style="width:${pct}%;background:${categoryColor(name)}"></span></span>
      <span class="cat-pct">${pct}%</span>
    `;
    box.appendChild(row);
  }
}

async function getState() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'getState' });
    if (res && typeof res.pending === 'number' && typeof res.paused === 'boolean') {
      return res;
    }
    return null;
  } catch {
    return null;
  }
}

const FALLBACK_STATE = { paused: false, online: true, pending: 0, lastSyncTs: null, session: null };

async function refresh() {
  const user = auth ? auth.currentUser : null;
  const state = await getState();
  show(user ? 'app' : 'auth');
  if (!user) {
    setDot('off');
    return;
  }

  el('user-email').textContent = user.email || user.uid;

  const s = state || FALLBACK_STATE;
  setDot(s.paused ? 'off' : 'on');
  el('pause-toggle').checked = Boolean(s.paused);
  el('pause-label').textContent = s.paused ? 'Paused' : 'On';

  if (s.session) {
    el('live-session').textContent = `${s.session.domain || ''} · ${fmtElapsed(s.session.startTs)}`;
    el('live-session').title = s.session.title || '';
  } else {
    el('live-session').textContent = '—';
    el('live-session').title = '';
  }

  const { lifelensiq_buffer: buffer = [] } = await chrome.storage.local.get('lifelensiq_buffer');
  const today = todaySummary(buffer);
  const todayActiveSeconds = await getTodayActiveSeconds();
  el('today-active').textContent = `${Math.round(todayActiveSeconds / 60)} min`;
  el('pending-sync').textContent = state
    ? `${s.pending}${!s.online ? ' (offline)' : ''}`
    : '— (reload extension)';
  el('last-sync').textContent = state ? fmtAgo(s.lastSyncTs) : '—';
  renderCategories(today.byCat);
}

const THEME_KEY = 'lifelensiq_theme';
const POMO_KEY = 'lifelensiq_pomodoro';

/* ---------------- focus mode ---------------- */

let focusActive = false;

async function refreshFocus() {
  const res = await chrome.runtime.sendMessage({ type: 'getFocusState' }).catch(() => null);
  focusActive = Boolean(res && res.active);
  const status = el('focus-status');
  status.textContent = focusActive ? 'on' : 'off';
  status.className = focusActive ? 'focus-on' : 'focus-off';
  el('focus-toggle').textContent = focusActive ? 'Stop focus' : 'Start focus';
  if (res && res.allowlist && res.allowlist.length) {
    el('focus-allowlist').value = res.allowlist.join(', ');
  }
}

/* ---------------- pomodoro ---------------- */

const POMO_DEFAULTS = {
  phase: 'idle',
  kind: 'focus',
  minutes: 25,
  remaining: 25 * 60,
  cycles: 0,
};

let pomo = { ...POMO_DEFAULTS };
let pomoTick = null;

function savePomo() {
  chrome.storage.local.set({ [POMO_KEY]: { ...pomo, lastTs: Date.now() } });
}

function pomoRender() {
  const m = String(Math.floor(pomo.remaining / 60)).padStart(2, '0');
  const s = String(pomo.remaining % 60).padStart(2, '0');
  el('pomo-time').textContent = `${m}:${s}`;
  el('pomo-phase').textContent =
    pomo.phase === 'idle' ? (pomo.kind === 'focus' ? 'focus · 25m' : 'break · 5m') : pomo.phase;
  el('pomo-toggle').textContent = pomo.phase === 'running' ? 'Pause' : 'Start';
}

async function pomoReset() {
  clearInterval(pomoTick);
  pomoTick = null;
  const { [POMO_KEY]: saved } = await chrome.storage.local.get(POMO_KEY);
  pomo = {
    ...POMO_DEFAULTS,
    kind: (saved && saved.kind) || 'focus',
    minutes: (saved && saved.minutes) || 25,
    cycles: (saved && saved.cycles) || 0,
  };
  pomo.remaining = pomo.minutes * 60;
  pomoRender();
  savePomo();
}

function pomoFinish() {
  const finishedKind = pomo.kind;
  if (finishedKind === 'focus') {
    chrome.runtime.sendMessage({ type: 'pomodoroDone', minutes: pomo.minutes, cycles: pomo.cycles + 1 }).catch(() => {});
    pomo.cycles += 1;
    pomo.kind = 'break';
    pomo.minutes = 5;
  } else {
    pomo.kind = 'focus';
    pomo.minutes = 25;
  }
  pomo.remaining = pomo.minutes * 60;
  pomo.phase = 'running';
  savePomo();
  pomoRender();
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: finishedKind === 'focus' ? 'Pomodoro complete' : 'Break over',
    message:
      finishedKind === 'focus'
        ? `Focus session logged (${pomo.cycles} today). Break time.`
        : 'Back to focus — start another 25 min.',
  }).catch(() => {});
}

function pomoToggle() {
  if (pomo.phase === 'running') {
    clearInterval(pomoTick);
    pomoTick = null;
    pomo.phase = 'paused';
    savePomo();
  } else {
    pomo.phase = 'running';
    savePomo();
    pomoTick = setInterval(() => {
      pomo.remaining -= 1;
      if (pomo.remaining <= 0) {
        clearInterval(pomoTick);
        pomoTick = null;
        pomoFinish();
        return;
      }
      savePomo();
      pomoRender();
    }, 1000);
  }
  pomoRender();
}

async function initPomodoro() {
  const { [POMO_KEY]: saved } = await chrome.storage.local.get(POMO_KEY);
  if (saved) {
    pomo = { ...POMO_DEFAULTS, ...saved };
    if (pomo.phase === 'running') {
      const elapsed = Math.round((Date.now() - (saved.lastTs || Date.now())) / 1000);
      pomo.remaining = Math.max(0, pomo.remaining - elapsed);
      if (pomo.remaining <= 0) {
        pomo.phase = 'idle';
        pomo.remaining = pomo.minutes * 60;
        savePomo();
      }
    }
  }
  pomoRender();
}

/* ---------------- weekly nudge ---------------- */

async function renderWeeklyNudge() {
  const box = el('weekly-nudge');
  const fb = getFirebase();
  if (!fb.db || !fb.auth.currentUser) return;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (start.getDay() || 7) + 1);
  try {
    const snap = await getDocs(
      query(collection(fb.db, 'users', fb.auth.currentUser.uid, 'events'), where('ts', '>=', start.getTime()))
    );
    let study = 0;
    let shorts = 0;
    for (const d of snap.docs) {
      const ev = d.data();
      const dur = Number(ev.durationSeconds) || 0;
      const w = CATEGORY_WEIGHTS[ev.category] ?? 0;
      if (w >= 0.9) study += dur;
      else if (ev.eventType === 'short_video' || ev.category === 'Short-form Video') shorts += dur;
    }
    const h = (s) => Math.round(s / 3600);
    const studyH = h(study);
    const shortsH = h(shorts);
    box.innerHTML = `
      <div class="sec-title">This week (web + app)</div>
      <div class="nudge-line"><span>Study</span><b>${studyH}h</b></div>
      <div class="nudge-bar"><span style="width:${Math.min(100, Math.round((study / 360000) * 100))}%;background:#4ade80"></span></div>
      <div class="nudge-line"><span>Shorts</span><b>${shortsH}h</b></div>
      <div class="nudge-bar"><span style="width:${Math.min(100, Math.round((shorts / 360000) * 100))}%;background:#e879f9"></span></div>
      <p class="nudge-msg muted">${studyH >= shortsH ? `Study wins — ${studyH}h vs ${shortsH}h. Keep it up.` : `Shorts beat study (${shortsH}h vs ${studyH}h). Close the gap.`}</p>
    `;
  } catch {
    box.innerHTML = '';
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

async function initTheme() {
  const { [THEME_KEY]: saved } = await chrome.storage.local.get(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

async function main() {
  await initTheme();
  el('theme-btn').addEventListener('click', async () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    await chrome.storage.local.set({ [THEME_KEY]: next });
  });

  if (!isFirebaseConfigured()) {
    el('auth-view').classList.remove('hidden');
    el('auth-error').classList.remove('hidden');
    el('auth-error').textContent =
      'Firebase not configured. Fill extension/src/shared/firebase-config.js (see README).';
    setDot('off');
    return;
  }
  const fb = initFirebase();
  auth = fb.auth;

  const loginForm = el('login-form');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el('auth-error').classList.add('hidden');
    try {
      await signInWithEmailAndPassword(auth, el('email').value.trim(), el('password').value);
      loginForm.reset();
      refresh();
    } catch (err) {
      el('auth-error').textContent = err.message || 'Sign-in failed';
      el('auth-error').classList.remove('hidden');
    }
  });

  el('google-signin-btn').addEventListener('click', async () => {
    el('auth-error').classList.add('hidden');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      refresh();
    } catch (err) {
      el('auth-error').textContent = err.message || 'Google sign-in failed';
      el('auth-error').classList.remove('hidden');
    }
  });

  el('logout-btn').addEventListener('click', async () => {
    await signOut(auth).catch(() => {});
    refresh();
  });

  el('sync-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'syncNow' }).catch(() => {});
    el('pending-sync').textContent = '…';
    setTimeout(refresh, 1500);
  });

  el('pause-toggle').addEventListener('change', (e) => {
    const paused = e.target.checked;
    chrome.runtime.sendMessage({ type: 'setPause', paused }).catch(() => {});
    setTimeout(refresh, 300);
  });

  el('dashboard-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: DASHBOARD_URL });
  });

  el('options-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  el('focus-toggle').addEventListener('click', async () => {
    if (focusActive) {
      await chrome.runtime.sendMessage({ type: 'stopFocus' }).catch(() => {});
    } else {
      const allowlist = el('focus-allowlist').value.split(',').map((d) => d.trim()).filter(Boolean);
      await chrome.runtime.sendMessage({ type: 'startFocus', allowlist }).catch(() => {});
    }
    refreshFocus();
  });

  el('pomo-toggle').addEventListener('click', pomoToggle);
  el('pomo-reset').addEventListener('click', pomoReset);

  auth.onAuthStateChanged(() => refresh());
  refresh();
  await initPomodoro();
  await refreshFocus();
  renderWeeklyNudge();
  liveTick = setInterval(() => {
    refresh();
    renderWeeklyNudge();
  }, 30000);
}

window.addEventListener('unload', () => {
  if (liveTick) clearInterval(liveTick);
});

main();