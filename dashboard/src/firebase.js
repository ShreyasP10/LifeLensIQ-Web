import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged as f_onAuthStateChanged,
  signOut as f_signOut,
  signInWithEmailAndPassword as f_signInWithEmailAndPassword,
  createUserWithEmailAndPassword as f_createUserWithEmailAndPassword,
  signInWithPopup as f_signInWithPopup,
} from 'firebase/auth';
import {
  getFirestore,
  collection as f_collection,
  doc as f_doc,
  query as f_query,
  where as f_where,
  orderBy as f_orderBy,
  limit as f_limit,
  startAfter as f_startAfter,
  onSnapshot as f_onSnapshot,
  getDocs as f_getDocs,
  setDoc as f_setDoc,
  deleteDoc as f_deleteDoc,
  writeBatch as f_writeBatch,
} from 'firebase/firestore';
import { FIREBASE_CONFIG, isConfigured } from './config.js';
import {
  createDemoDb,
  createDemoAuth,
  demoCollection,
  demoDoc,
  demoQuery,
  demoWhere,
  demoOrderBy,
  demoLimit,
  demoStartAfter,
  demoOnSnapshot,
  demoGetDocs,
  demoSetDoc,
  demoDeleteDoc,
  demoWriteBatch,
  demoOnAuthStateChanged,
  demoSignOut,
  demoSignInWithEmailAndPassword,
  demoCreateUserWithEmailAndPassword,
  demoSignInWithPopup,
} from './lib/demo-db.js';

export const live = isConfigured();

let app = null;
if (live) {
  app = initializeApp(FIREBASE_CONFIG);
} else {
  console.info(
    'LifeIQ: Firebase keys not configured — running in DEMO MODE with local sample data. ' +
      'Create dashboard/.env from .env.example and restart to go live.'
  );
}

export const db = live ? getFirestore(app) : createDemoDb();
export const auth = live ? getAuth(app) : createDemoAuth();
export const googleProvider = new GoogleAuthProvider();

export function collection(parent, ...segments) {
  return live ? f_collection(parent, ...segments) : demoCollection(parent, ...segments);
}
export function doc(parent, ...segments) {
  return live ? f_doc(parent, ...segments) : demoDoc(parent, ...segments);
}
export function query(parent, ...constraints) {
  return live ? f_query(parent, ...constraints) : demoQuery(parent, ...constraints);
}
export function where(field, op, value) {
  return live ? f_where(field, op, value) : demoWhere(field, op, value);
}
export function orderBy(field, dir) {
  return live ? f_orderBy(field, dir) : demoOrderBy(field, dir);
}
export function limit(n) {
  return live ? f_limit(n) : demoLimit(n);
}
export function startAfter(refOrValue) {
  return live ? f_startAfter(refOrValue) : demoStartAfter(refOrValue);
}
export function onSnapshot(ref, onNext, onError) {
  return live ? f_onSnapshot(ref, onNext, onError) : demoOnSnapshot(ref, onNext, onError);
}
export function getDocs(ref) {
  return live ? f_getDocs(ref) : demoGetDocs(ref);
}
export function setDoc(ref, data, opts) {
  return live ? f_setDoc(ref, data, opts) : demoSetDoc(ref, data, opts);
}
export function deleteDoc(ref) {
  return live ? f_deleteDoc(ref) : demoDeleteDoc(ref);
}
export function writeBatch(_db) {
  return live ? f_writeBatch(_db) : demoWriteBatch();
}
export function onAuthStateChanged(_auth, cb) {
  return live ? f_onAuthStateChanged(_auth, cb) : demoOnAuthStateChanged(_auth, cb);
}
export function signOut(_auth) {
  return live ? f_signOut(_auth) : demoSignOut();
}
export function signInWithEmailAndPassword(_auth, email, password) {
  return live
    ? f_signInWithEmailAndPassword(_auth, email, password)
    : demoSignInWithEmailAndPassword(_auth, email, password);
}
export function createUserWithEmailAndPassword(_auth, email, password) {
  return live
    ? f_createUserWithEmailAndPassword(_auth, email, password)
    : demoCreateUserWithEmailAndPassword(_auth, email, password);
}
export function signInWithPopup(_auth, _provider) {
  return live ? f_signInWithPopup(_auth, _provider) : demoSignInWithPopup();
}

export default app;