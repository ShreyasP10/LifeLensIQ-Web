import { initFirebase, isFirebaseConfigured } from '../shared/firebase.js';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { DASHBOARD_URL } from '../shared/firebase-config.js';

let auth = null;

const el = (id) => document.getElementById(id);

function show(view) {
  el('auth-view').classList.toggle('hidden', view !== 'auth');
  el('app-view').classList.toggle('hidden', view !== 'app');
}

async function todaySummary() {
  const { lifeiq_buffer: buffer = [] } = await chrome.storage.local.get('lifeiq_buffer');
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startTs = start.getTime();
  const now = Date.now();
  let seconds = 0;
  let count = 0;
  for (const ev of buffer) {
    if (ev.ts >= startTs && ev.ts <= now) {
      seconds += ev.durationSeconds;
      count += 1;
    }
  }
  return { seconds, count };
}

async function refresh() {
  const user = auth ? auth.currentUser : null;
  show(user ? 'app' : 'auth');
  if (!user) return;

  el('user-email').textContent = user.email || user.uid;
  const { seconds, count } = await todaySummary();
  el('today-active').textContent = `${Math.round(seconds / 60)} min`;
  const { lifeiq_buffer: buffer = [] } = await chrome.storage.local.get('lifeiq_buffer');
  el('pending-sync').textContent = String(buffer.length);
}

async function main() {
  if (!isFirebaseConfigured()) {
    el('auth-view').classList.remove('hidden');
    el('auth-error').classList.remove('hidden');
    el('auth-error').textContent =
      'Firebase not configured. Fill extension/src/shared/firebase-config.js (see README).';
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

  el('dashboard-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: DASHBOARD_URL });
  });

  el('options-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  auth.onAuthStateChanged(() => refresh());
  refresh();
}

main();
