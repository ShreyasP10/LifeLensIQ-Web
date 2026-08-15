const DB_KEY = 'lifelensiq.demo.db.v1';
const SESSION_KEY = 'lifelensiq.demo.session.v1';

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

let dbState = null;
let listeners = [];
let authState;
let authListeners = [];

function notify() {
  const list = listeners.slice();
  for (const l of list) {
    try {
      l.cb(l.makeSnapshot());
    } catch (err) {
      l.errCb && l.errCb(err);
    }
  }
}

function notifyAuth() {
  const list = authListeners.slice();
  for (const l of list) l.cb(authState);
}

function state() {
  if (!dbState) {
    dbState = loadLS(DB_KEY, null);
    if (!dbState) {
      dbState = { seeds: buildSeed() };
      saveLS(DB_KEY, dbState);
    }
  }
  return dbState;
}

export function createDemoDb() {
  return { __demo: true };
}

export function createDemoAuth() {
  return { __demo: true };
}

function resolvePath(parent, segments) {
  const base = parent && parent.__demo && parent.path ? parent.path : '';
  const parts = base ? base.split('/') : [];
  for (const s of segments) {
    for (const piece of String(s).split('/')) {
      if (piece) parts.push(piece);
    }
  }
  return parts.join('/');
}

export function demoCollection(parent, ...segments) {
  return { __demo: true, kind: 'collection', path: resolvePath(parent, segments) };
}

export function demoDoc(parent, ...segments) {
  return { __demo: true, kind: 'doc', path: resolvePath(parent, segments) };
}

export function demoQuery(parent, ...constraints) {
  return {
    __demo: true,
    kind: 'query',
    path: parent.path,
    constraints: constraints.filter(Boolean),
  };
}

export function demoWhere(field, op, value) {
  return { type: 'where', field, op, value };
}

export function demoOrderBy(field, dir = 'asc') {
  return { type: 'orderBy', field, dir };
}

export function demoLimit(n) {
  return { type: 'limit', n };
}

export function demoStartAfter(docOrValue) {
  return { type: 'startAfter', doc: docOrValue };
}

function collectionOf(docPath) {
  const parts = docPath.split('/');
  return [parts.slice(0, -1).join('/'), parts[parts.length - 1]];
}

function readQuery(q) {
  const store = state().seeds;
  const where = q.constraints.find((c) => c.type === 'where');
  const orderBy = q.constraints.find((c) => c.type === 'orderBy');
  const limit = q.constraints.find((c) => c.type === 'limit');

  let entries = Object.entries(store[q.path] || {});
  if (where) {
    entries = entries.filter(([, d]) => {
      const v = d[where.field];
      if (where.op === '==') return v === where.value;
      if (where.op === '>=') return v >= where.value;
      if (where.op === '<=') return v <= where.value;
      if (where.op === '>') return v > where.value;
      if (where.op === '<') return v < where.value;
      return true;
    });
  }
  if (orderBy) {
    const dir = orderBy.dir === 'desc' ? -1 : 1;
    entries.sort((a, b) => {
      const va = a[1][orderBy.field] ?? 0;
      const vb = b[1][orderBy.field] ?? 0;
      if (va === vb) return a[0] < b[0] ? -1 : 1;
      return va < vb ? -dir : dir;
    });
  }
  const startAfter = q.constraints.find((c) => c.type === 'startAfter');
  if (startAfter && orderBy) {
    const dir = orderBy.dir === 'desc' ? -1 : 1;
    const val = startAfter.doc?.data?.()?.[orderBy.field] ?? startAfter.doc?.[orderBy.field];
    if (val !== undefined) {
      entries = entries.filter(([, d]) => {
        const v = d[orderBy.field] ?? 0;
        return dir === -1 ? v < val : v > val;
      });
    }
  }
  if (limit) entries = entries.slice(0, limit.n);
  return entries;
}

function snapshot(qOrRef) {
  const store = state().seeds;
  if (qOrRef.kind === 'doc') {
    const [coll, id] = collectionOf(qOrRef.path);
    const data = store[coll]?.[id];
    const docs = data
      ? [{ id, data: () => ({ ...data }), ref: { __demo: true, kind: 'doc', path: qOrRef.path } }]
      : [];
    return { docs, empty: docs.length === 0, size: docs.length };
  }
  const entries = readQuery(qOrRef);
  const docs = entries.map(([id, data]) => ({
    id,
    data: () => ({ ...data }),
    ref: { __demo: true, kind: 'doc', path: `${qOrRef.path}/${id}` },
  }));
  return { docs, empty: docs.length === 0, size: docs.length };
}

export function demoGetDocs(qOrRef) {
  return Promise.resolve(snapshot(qOrRef));
}

export function demoOnSnapshot(qOrRef, onNext, onError) {
  const cb = () => onNext(snapshot(qOrRef));
  const entry = { cb, errCb: onError };
  listeners.push(entry);
  cb();
  return () => {
    listeners = listeners.filter((l) => l !== entry);
  };
}

export function demoSetDoc(ref, data, opts = {}) {
  const store = state().seeds;
  const [coll, id] = collectionOf(ref.path);
  store[coll] = store[coll] || {};
  if (opts.merge && store[coll][id]) {
    store[coll][id] = { ...store[coll][id], ...data };
  } else {
    store[coll][id] = { ...data };
  }
  persist();
  notify();
  return Promise.resolve();
}

export function demoDeleteDoc(ref) {
  const store = state().seeds;
  const [coll, id] = collectionOf(ref.path);
  if (store[coll]) delete store[coll][id];
  persist();
  notify();
  return Promise.resolve();
}

export function demoWriteBatch() {
  const ops = [];
  return {
    delete(ref) {
      ops.push({ type: 'delete', path: ref.path });
    },
    async commit() {
      const store = state().seeds;
      for (const op of ops) {
        const [coll, id] = collectionOf(op.path);
        if (store[coll]) delete store[coll][id];
      }
      persist();
      notify();
    },
  };
}

function persist() {
  saveLS(DB_KEY, dbState);
}

export const DEMO_USER = {
  uid: 'demo001',
  email: 'demo@student.lifelensiq',
  displayName: 'Demo Student',
};

function currentUser() {
  if (authState === undefined) {
    authState = loadLS(SESSION_KEY, null);
    if (!authState) authState = { ...DEMO_USER };
  }
  return authState;
}

export function demoOnAuthStateChanged(_auth, cb) {
  currentUser();
  const l = { cb };
  authListeners.push(l);
  cb(authState);
  return () => {
    authListeners = authListeners.filter((x) => x !== l);
  };
}

function signInUser(user) {
  authState = user;
  saveLS(SESSION_KEY, user);
  notifyAuth();
  return user;
}

export function demoSignedInAs(_auth) {
  return currentUser();
}

export function demoSignOut() {
  authState = null;
  saveLS(SESSION_KEY, null);
  notifyAuth();
  return Promise.resolve();
}

export function demoSignInWithEmailAndPassword(_auth, email, password) {
  return Promise.resolve({ user: signInUser({ uid: 'demo001', email, displayName: email.split('@')[0] }) });
}

export function demoCreateUserWithEmailAndPassword(_auth, email, password) {
  return demoSignInWithEmailAndPassword(_auth, email, password);
}

export function demoSignInWithPopup() {
  return Promise.resolve({ user: signInUser({ ...DEMO_USER }) });
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SITES = [
  ['moodle.org', '/course/view.php?id=101', 'Machine Learning — week slides', 'Study', 'tab_active', 5, 900, 2700],
  ['elearn.apsit.edu.in', '/moodle/course/view.php?id=5', 'Moodle — CN course page', 'Study', 'tab_active', 4, 600, 2100],
  ['leetcode.com', '/problems/two-sum', 'Two Sum — attempt', 'DSA', 'tab_active', 6, 1200, 3600],
  ['leetcode.com', '/problems/longest-substring', 'Longest substring — attempt', 'DSA', 'tab_active', 5, 900, 3000],
  ['geeksforgeeks.org', '/graph-shortest-path', 'Graphs: shortest paths notes', 'DSA', 'tab_active', 4, 600, 1800],
  ['github.com', '/life-lens-iq', 'LifeLensIQ — code', 'Productivity', 'tab_active', 5, 1200, 3600],
  ['linkedin.com', '/feed', 'Internships — browsing', 'Productivity', 'tab_active', 3, 300, 1200],
  ['chat.openai.com', '/', 'GPT: explaining gradient descent', 'Productivity', 'tab_active', 5, 600, 1800],
  ['chat.deepseek.com', '/chat', 'DeepSeek: debugging Python', 'Productivity', 'tab_active', 4, 600, 1800],
  ['stackoverflow.com', '/questions/435', 'Python async — reading answers', 'Development', 'tab_active', 3, 300, 1200],
  ['docs.google.com', '/document/d/xyz', 'Seminar report — drafting', 'Productivity', 'writing_session', 6, 900, 3000],
  ['sheets.google.com', '/spreadsheets/d/abc', 'Marks tracker — updating', 'Productivity', 'tab_active', 3, 300, 1200],
  ['mail.google.com', '/', 'Inbox — clearing', 'Productivity', 'tab_active', 3, 120, 600],
  ['youtube.com', '/watch?v=lecture-1', 'NPTEL: Operating Systems', 'Study', 'tab_active', 4, 600, 2400],
  ['youtube.com', '/watch?v=music-1', 'Lo-fi playlist', 'Entertainment', 'tab_active', 4, 600, 1800],
  ['netflix.com', '/browse', 'Browsing next show', 'Entertainment', 'tab_active', 2, 600, 1800],
  ['youtube.com', '/shorts/abc', 'Shorts — binge', 'Short-form Video', 'short_video', 6, 40, 300],
  ['instagram.com', '/', 'Feed — scrolling', 'Timepass', 'tab_active', 5, 300, 1200],
  ['web.whatsapp.com', '/', 'Chats — replying', 'Timepass', 'tab_active', 4, 300, 900],
  ['x.com', '/home', 'Timeline — scrolling', 'Timepass', 'tab_active', 3, 300, 900],
  ['wikipedia.org', '/Linear_regression', 'Linear regression — reading', 'Utilities', 'tab_active', 3, 600, 1500],
  ['drive.google.com', '/file/d/pdf123', 'CN unit notes (PDF)', 'Study', 'pdf_view', 4, 600, 2400],
  ['google.com', '/search?q=latex+matrix', 'Search: latex matrix syntax', 'Utilities', 'tab_active', 3, 60, 300],
];

const HOUR_WEIGHTS = [0, 0, 0, 0, 0, 1, 1, 3, 5, 6, 6, 5, 5, 6, 6, 5, 4, 4, 4, 4, 3, 3, 2, 2];

const SHORTS_TITLE = ['/shorts/abc', '/shorts/def', '/shorts/ghi', '/shorts/jkl', '/shorts/mno', '/shorts/pqr'];

const WEEK = [
  { day: 'Monday', startTime: '09:30', endTime: '10:30', subject: 'Internet Programming', room: 'C-302', batch: 'B1', elective: true },
  { day: 'Monday', startTime: '11:30', endTime: '12:30', subject: 'Machine Learning', room: 'C-401', batch: 'B1', elective: false },
  { day: 'Monday', startTime: '14:00', endTime: '15:00', subject: 'Computer Networks', room: 'C-202', batch: 'B1', elective: false },
  { day: 'Monday', startTime: '15:15', endTime: '17:15', subject: 'DSA Lab', room: 'L-104', batch: 'B1', elective: false },
  { day: 'Tuesday', startTime: '09:30', endTime: '10:30', subject: 'Software Engineering', room: 'C-201', batch: 'B1', elective: false },
  { day: 'Tuesday', startTime: '11:30', endTime: '13:30', subject: 'ML Lab', room: 'L-203', batch: 'B1', elective: false },
  { day: 'Tuesday', startTime: '14:00', endTime: '15:00', subject: 'Internet Programming', room: 'C-302', batch: 'B1', elective: true },
  { day: 'Wednesday', startTime: '09:30', endTime: '10:30', subject: 'Machine Learning', room: 'C-401', batch: 'B1', elective: false },
  { day: 'Wednesday', startTime: '11:30', endTime: '12:30', subject: 'Computer Networks', room: 'C-202', batch: 'B1', elective: false },
  { day: 'Wednesday', startTime: '14:00', endTime: '15:00', subject: 'Software Engineering', room: 'C-201', batch: 'B1', elective: false },
  { day: 'Thursday', startTime: '09:30', endTime: '11:30', subject: 'IP Lab', room: 'L-105', batch: 'B1', elective: true },
  { day: 'Thursday', startTime: '11:45', endTime: '12:45', subject: 'Software Engineering', room: 'C-201', batch: 'B1', elective: false },
  { day: 'Thursday', startTime: '14:00', endTime: '16:00', subject: 'CN Lab', room: 'L-107', batch: 'B1', elective: false },
  { day: 'Friday', startTime: '09:30', endTime: '10:30', subject: 'Machine Learning', room: 'C-401', batch: 'B1', elective: false },
  { day: 'Friday', startTime: '11:30', endTime: '12:30', subject: 'DSA', room: 'C-102', batch: 'B1', elective: false },
  { day: 'Friday', startTime: '14:00', endTime: '15:00', subject: 'Internet Programming', room: 'C-302', batch: 'B1', elective: true },
];

function buildSeed() {
  const rnd = mulberry32(20260811);
  const rand = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const totalWeight = SITES.reduce((a, s) => a + s[5], 0);

  const events = {};
  const now = Date.now();
  const nowHour = new Date().getHours();
  let seq = 0;

  for (let d = 6; d >= 0; d--) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - d);
    dayStart.setHours(0, 0, 0, 0);
    const dayMs = dayStart.getTime();
    const isToday = d === 0;
    const count = rand(16, 22);

    for (let i = 0; i < count; i++) {
      let weight = rnd() * totalWeight;
      let site = SITES[0];
      for (const s of SITES) {
        weight -= s[5];
        if (weight <= 0) {
          site = s;
          break;
        }
      }
      const [domain, path, title, category, eventType, , minDur, maxDur] = site;

      let hours = 7;
      let roll = rnd();
      if (roll < 0.25) hours = rand(8, 12);
      else if (roll < 0.55) hours = rand(12, 16);
      else if (roll < 0.8) hours = rand(16, 20);
      else hours = rand(20, 23);
      if (isToday && hours >= nowHour) hours = Math.max(7, nowHour - 1);
      const minutes = rand(0, 59);
      const start = dayMs + hours * 3600000 + minutes * 60000;
      const duration = rand(minDur, maxDur);
      const end = start + duration * 1000;
      if (isToday && end > now) {
        if (start > now) continue;
        const remaining = (now - start) / 1000;
        if (remaining < 30) continue;
      }

      const id = `demo-${d}-${seq++}`;
      const meta = {};
      if (eventType === 'short_video') {
        meta.views = rand(50, 900);
        meta.seconds = duration;
      }
      if (eventType === 'writing_session') meta.typingBursts = rand(2, 8);
      if (eventType === 'pdf_view') meta.pdf = true;

      events[id] = {
        id,
        eventId: id,
        userId: 'demo001',
        device: 'extension',
        ts: start,
        timestamp: start,
        endTs: end,
        durationSeconds: Math.round(duration),
        domain,
        path: eventType === 'short_video' ? pick(SHORTS_TITLE) : path,
        title,
        category: eventType === 'short_video' ? 'Short-form Video' : category,
        eventType,
        metadata: meta,
        schemaVersion: 1,
      };
    }
  }

  return {
    'users/demo001/events': events,
    'users/demo001/settings/profile': {
      email: DEMO_USER.email,
      createdAt: now - 14 * 86400000,
      domainCategories: { 'youtube.com': 'Study' },
      updatedAt: now,
    },
    'users/demo001/timetable/data': {
      source: 'demo-seed',
      generatedAt: now,
      batch: 'B1',
      entries: WEEK,
    },
    leaderboard: {
      demo001: { displayName: 'DemoStudent', score: 68, totalSeconds: 158400, sampleDays: 6, lastUpdated: now - 3600000 },
      u_alice: { displayName: 'alice', score: 87, totalSeconds: 184200, sampleDays: 7, lastUpdated: now - 7200000 },
      u_bob: { displayName: 'bob', score: 61, totalSeconds: 131700, sampleDays: 5, lastUpdated: now - 5400000 },
      u_carla: { displayName: 'carla', score: 93, totalSeconds: 198300, sampleDays: 7, lastUpdated: now - 1800000 },
      u_dan: { displayName: 'dan', score: 49, totalSeconds: 104400, sampleDays: 4, lastUpdated: now - 8640000 },
      u_erin: { displayName: 'erin', score: 74, totalSeconds: 166800, sampleDays: 6, lastUpdated: now - 250000 },
    },
  };
}