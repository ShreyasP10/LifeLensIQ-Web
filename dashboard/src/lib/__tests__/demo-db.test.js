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

  it('applies every where constraint (both ts bounds)', async () => {
    const db = demo.createDemoDb();
    const col = demo.demoCollection(db, 'users', 'demo001', 'events');
    const all = (await demo.demoGetDocs(demo.demoQuery(col, demo.demoLimit(100000)))).docs.map((x) => x.data());
    const ts = all.map((e) => e.ts).sort((a, b) => a - b);
    const lo = ts[0];
    const mid = lo + Math.floor((ts[ts.length - 1] - lo) / 2);
    const q = demo.demoQuery(
      col,
      demo.demoWhere('ts', '>=', lo),
      demo.demoWhere('ts', '<=', mid),
      demo.demoOrderBy('ts', 'desc')
    );
    const res = (await demo.demoGetDocs(q)).docs.map((x) => x.data());
    expect(res.length).toBeGreaterThan(0);
    expect(res.length).toBeLessThan(all.length);
    for (const ev of res) {
      expect(ev.ts).toBeGreaterThanOrEqual(lo);
      expect(ev.ts).toBeLessThanOrEqual(mid);
    }
  });

  it('live snapshots fire after writes', async () => {
    const db = demo.createDemoDb();
    const col = demo.demoCollection(db, 'users', 'demo001', 'events');
    const seen = [];
    const off = demo.demoOnSnapshot(demo.demoQuery(col, demo.demoLimit(100000)), (s) =>
      seen.push(s.docs.length)
    );
    const before = seen[seen.length - 1];
    await demo.demoSetDoc(demo.demoDoc(col, 'extra-live-1'), { ts: 1, id: 'extra-live-1' });
    expect(seen[seen.length - 1]).toBe(before + 1);
    await demo.demoDeleteDoc(demo.demoDoc(col, 'extra-live-1'));
    expect(seen[seen.length - 1]).toBe(before);
    off();
  });
});