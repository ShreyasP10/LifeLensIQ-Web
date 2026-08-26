import { initializeApp } from 'firebase/app';
import { getAuth as getAuthWebExtension, onAuthStateChanged } from 'firebase/auth/web-extension';
import { getAuth as getAuthRegular, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
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
    auth = getAuthWebExtension(app);
    db = getFirestore(app);
  }
  return { app, auth, db };
}

export function getFirebase() {
  return { app, auth, db };
}

// Regular auth for popup-based sign-in (Google sign-in with popup)
export function getRegularAuth() {
  return getAuthRegular(app);
}

export { GoogleAuthProvider, signInWithPopup };

export async function initAuth(authInstance) {
  await authInstance.authStateReady();
  return new Promise((resolve) => {
    onAuthStateChanged(authInstance, (user) => resolve(user));
  });
}