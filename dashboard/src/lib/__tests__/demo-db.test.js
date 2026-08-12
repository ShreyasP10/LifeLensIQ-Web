import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

let demo;
beforeEach(async () => {
  store.clear();
  demo = await import('../demo-db.js?purge=1');
  demo = await import('../demo-db.js?purge=2').then((m) => m);
});

describe('demo getDocs with pagination', () => {
  it('startAfter iterates a full collection in descending order', async () => {
    const db = demo.createDemoDb();
    const col = demo.demoCollection(db, 'users', 'demo001', 'events');
    const out = [];
    let last = null;
    let pages = 0;
    while (true) {
      pages += 1;
      if (pages > 100) throw new Error('pagination loop did not terminate');
      const constraints = [
        demo.demoOrderBy('ts', 'desc'),
        demo.demoLimit(100),
      ];
      if (last) {
        constraints.push(demo.demoStartAfter(last));
      }
      const q = demo.demoQuery(col, ...constraints);
      const snap = await demo.demoGetDocs(q);
      if (!snap.docs.length) break;
      out.push(...snap.docs.map((x) => x.data()));
      last = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < 100) break;
    }
    expect(out.length).toBeGreaterThan(100);
    const all = await demo.demoGetDocs(demo.demoQuery(col, demo.demoLimit(100000)));
    expect(out.length).toBe(all.docs.length);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].ts).toBeGreaterThanOrEqual(out[i].ts);
    }
  });

  it('startAfter composes with where + orderBy', async () => {
    const db = demo.createDemoDb();
    const col = demo.demoCollection(db, 'users', 'demo001', 'events');
    const fromTs = 0;
    const toTs = Date.now();
    const q = demo.demoQuery(
      col,
      demo.demoWhere('ts', '>=', fromTs),
      demo.demoWhere('ts', '<=', toTs),
      demo.demoOrderBy('ts', 'desc')
    );
    const snap = await demo.demoGetDocs(q);
    const res = snap.docs.map((x) => x.data());
    expect(res.length).toBeGreaterThan(0);
    for (const ev of res) {
      expect(ev.ts).toBeGreaterThanOrEqual(fromTs);
      expect(ev.ts).toBeLessThanOrEqual(toTs);
    }
  });
});