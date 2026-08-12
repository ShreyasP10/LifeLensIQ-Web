export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDLlTX5tUpw-wy4fuIuiUQLTvX7qq8Uwm4',
  authDomain: 'signupsignin-5aea1.firebaseapp.com',
  projectId: 'signupsignin-5aea1',
  storageBucket: 'signupsignin-5aea1.firebasestorage.app',
  messagingSenderId: '1056805592677',
  appId: '1:1056805592677:web:48b2498a0373de42daf08c',
};

export const DASHBOARD_URL = 'http://localhost:5173';

export function isConfigured() {
  return !String(FIREBASE_CONFIG.apiKey).startsWith('PASTE_');
}
