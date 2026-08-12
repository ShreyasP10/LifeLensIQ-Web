function env(name) {
  const v = import.meta.env?.[name];
  return typeof v === 'string' && v.length > 0 ? v : '';
}

export const FIREBASE_CONFIG = {
  apiKey: env('VITE_FIREBASE_API_KEY') || 'PASTE_YOUR_API_KEY',
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN') || 'PASTE_YOUR_PROJECT.firebaseapp.com',
  projectId: env('VITE_FIREBASE_PROJECT_ID') || 'PASTE_YOUR_PROJECT_ID',
  storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET') || 'PASTE_YOUR_PROJECT.appspot.com',
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID') || 'PASTE_YOUR_SENDER_ID',
  appId: env('VITE_FIREBASE_APP_ID') || 'PASTE_YOUR_APP_ID',
};

export function isConfigured() {
  return !String(FIREBASE_CONFIG.apiKey).startsWith('PASTE_');
}