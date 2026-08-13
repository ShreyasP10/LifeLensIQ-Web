import { initFirebase, isFirebaseConfigured } from '../shared/firebase.js';
import { getFirestore, getDoc, setDoc, doc } from 'firebase/firestore';
import { CATEGORY_KEYS } from '../shared/categories.js';

const OVERRIDES_KEY = 'categoryOverrides';
let db = null;
let auth = null;

const el = (id) => document.getElementById(id);

function render(overrides) {
  const list = el('list');
  list.innerHTML = '';
  for (const [domain, category] of Object.entries(overrides)) {
    const li = document.createElement('li');
    li.innerHTML = `<span><strong>${domain}</strong> → <span class="tag">${category}</span></span>`;
    const del = document.createElement('button');
    del.textContent = 'remove';
    del.addEventListener('click', () => {
      delete overrides[domain];
      render(overrides);
    });
    li.appendChild(del);
    list.appendChild(li);
  }
}

async function load() {
  const { [OVERRIDES_KEY]: overrides = {} } = await chrome.storage.local.get(OVERRIDES_KEY);
  render(overrides);
  return overrides;
}

async function persistLocal(overrides) {
  await chrome.storage.local.set({ [OVERRIDES_KEY]: overrides });
}

async function persistCloud(overrides) {
  const user = auth ? auth.currentUser : null;
  if (!user || !db) throw new Error('Not signed in — save locally instead.');
  const ref = doc(db, 'users', user.uid, 'settings', 'profile');
  await setDoc(ref, { domainCategories: overrides, updatedAt: Date.now() }, { merge: true });
}

function flash(msg, ok = true) {
  const s = el('status');
  s.textContent = msg;
  s.style.color = ok ? '#4ade80' : '#f87171';
  setTimeout(() => (s.textContent = ''), 2500);
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

  const categorySel = el('category');
  for (const c of CATEGORY_KEYS) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    categorySel.appendChild(opt);
  }

  let overrides = await load();

  el('add-btn').addEventListener('click', () => {
    const domain = el('domain').value.trim().toLowerCase().replace(/^www\./, '');
    const category = el('category').value;
    if (!domain) return;
    overrides[domain] = category;
    el('domain').value = '';
    render(overrides);
  });

  el('save-btn').addEventListener('click', async () => {
    try {
      await persistCloud(overrides);
      await persistLocal(overrides);
      flash('Saved to Firebase + local cache');
    } catch (err) {
      flash(err.message, false);
    }
  });

  el('local-btn').addEventListener('click', async () => {
    await persistLocal(overrides);
    flash('Saved locally only');
  });

  el('clear-btn').addEventListener('click', async () => {
    overrides = {};
    render(overrides);
    await persistLocal(overrides);
    flash('Cleared');
  });

  if (isFirebaseConfigured()) {
    const fb = initFirebase();
    auth = fb.auth;
    db = fb.db;
    if (auth.currentUser) {
      const ref = doc(db, 'users', auth.currentUser.uid, 'settings', 'profile');
      const snap = await getDoc(ref).catch(() => null);
      if (snap && snap.exists() && snap.data().domainCategories) {
        overrides = { ...snap.data().domainCategories };
        await persistLocal(overrides);
        render(overrides);
      }
    }
  }
}

main();
