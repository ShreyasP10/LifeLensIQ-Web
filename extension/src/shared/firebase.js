import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { FIREBASE_CONFIG, isConfigured } from './firebase-config.js';

let app = null;
let auth = null;
let db = null;

export function isFirebaseConfigured() {
  return isConfigured();
}

export function initFirebase() {
  if (!isConfigured()) {
    throw new Error(
      'Firebase is not configured. Fill in FIREBASE_CONFIG in src/shared/firebase-config.js (see README).'
    );
  }
  if (!app) {
    app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
  }
  return { app, auth, db };
}

export function getFirebase() {
  return { app, auth, db };
}

export const chromeStoragePersistence = {
  type: 'lifeiq-chrome-storage',
  async _get() {
    return (await chrome.storage.local.get('authToken')).authToken;
  },
  async _set(token, user) {
    await chrome.storage.local.set({ authToken: token, authUser: user });
  },
  async _remove() {
    await chrome.storage.local.remove(['authToken', 'authUser']);
  },
};

export async function initAuth(authInstance) {
  await setPersistence(authInstance, chromeStoragePersistence);
  await authInstance.authStateReady();
  return new Promise((resolve) => {
    onAuthStateChanged(authInstance, (user) => resolve(user));
  });
}
