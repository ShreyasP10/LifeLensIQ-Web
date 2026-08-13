import { initFirebase, isFirebaseConfigured } from '../shared/firebase.js';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth/web-extension';
import { categoryColor } from '../shared/categories.js';
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

function todaySummary(buffer) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startTs = start.getTime();
  const now = Date.now();
  let seconds = 0;
  let count = 0;
  const byCat = {};
  for (const ev of buffer) {
    if (ev.ts >= startTs && ev.ts <= now) {
      seconds += ev.durationSeconds;
      count += 1;
      const c = ev.category || 'Other';
      byCat[c] = (byCat[c] || 0) + ev.durationSeconds;
    }
  }
  return { seconds, count, byCat };
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
  el('today-active').textContent = `${Math.round(today.seconds / 60)} min`;
  el('pending-sync').textContent = state
    ? `${s.pending}${!s.online ? ' (offline)' : ''}`
    : '— (reload extension)';
  el('last-sync').textContent = state ? fmtAgo(s.lastSyncTs) : '—';
  renderCategories(today.byCat);
}

const THEME_KEY = 'lifelensiq_theme';

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

  auth.onAuthStateChanged(() => refresh());
  refresh();
  liveTick = setInterval(refresh, 5000);
}

window.addEventListener('unload', () => {
  if (liveTick) clearInterval(liveTick);
});

main();