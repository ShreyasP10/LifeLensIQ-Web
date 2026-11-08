// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../firebase.js', () => ({
  live: true,
  auth: {},
  db: {},
  onAuthStateChanged: (_a, cb) => {
    cb({ uid: 'test-user', email: 't@example.com' });
    return () => {};
  },
  query: () => ({}),
  collection: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: (_q, next) => {
    next({ docs: [], exists: () => false, data: () => undefined });
    return () => {};
  },
  doc: () => ({}),
  getDocs: async () => ({ docs: [] }),
  deleteDoc: async () => {},
}));

globalThis.ResizeObserver =
  globalThis.ResizeObserver ||
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

import App from '../../App.jsx';

describe('App initial load (reload path)', () => {
  it('renders without blanking after first load data arrives', async () => {
    const { container } = render(<App />);
    // let timers/transition/rAF settle
    await new Promise((r) => setTimeout(r, 30));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    // either skeleton or real content must be on screen — never nothing
    const hasSkeleton = !!container.querySelector('.sk-overlay, .sk-tab');
    const hasContent = !!container.querySelector('.brand');
    expect(hasSkeleton || hasContent).toBe(true);
    expect(container.innerHTML.length).toBeGreaterThan(200);
    // the whole app must not have unmounted
    expect(container.querySelector('main')).toBeTruthy();
  });

  it('renders the Overview skeleton/content path with empty data', async () => {
    const { container } = render(<App />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).not.toBe('');
    expect(container.querySelector('#root')).toBeFalsy();
  });
});
