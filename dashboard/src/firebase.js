import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { FIREBASE_CONFIG, isConfigured } from './config.js';

if (!isConfigured()) {
  console.warn(
    'Firebase is not configured. Fill src/config.js with your Firebase web app config (see README).'
  );
}

const app = initializeApp(FIREBASE_CONFIG);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export default app;
