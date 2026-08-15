import { describe, it, expect } from 'vitest';
import { buildInsights, domainTransitions, detectAnomalies } from '../insights.js';

const ev = (id, ts, durationSeconds, category, overrides = {}) => ({
  id,
  ts,
  endTs: ts + durationSeconds * 1000,
  durationSeconds,
  domain: 'example.com',
  path: '/',
  title: '',
  category: category || 'Other',
  eventType: 'tab_active',
  device: 'extension',
  ...overrides,
});

describe('buildInsights', () => {
  const now = new Date(2026, 7, 11, 12).getTime(); // Tuesday local
  const dayStart = (offset, hour = 10) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    d.setHours(hour, 15, 0, 0);
    return d.getTime();
  };

  it('returns empty for no events', () => {
    expect(buildInsights([], 7, now)).toEqual([]);
  });

  it('reports the top domain with a change vs previous period', () => {
    const events = [
      ev('a', dayStart(0), 3600, 'Study', { domain: 'github.com' }),
      ev('b', dayStart(1), 3600, 'Study', { domain: 'github.com' }),
      ev('c', dayStart(1, 14), 600, 'Study', { domain: 'leetcode.com' }),
      ev('p', dayStart(7), 3600, 'Study', { domain: 'github.com' }),
    ];
    const insights = buildInsights(events, 7, now);
    const top = insights.find((i) => i.title.startsWith('github.com'));
    expect(top).toBeTruthy();
    expect(top.detail).toContain('%');
    expect(insights.some((i) => i.title.includes('productive weekday'))).toBe(true);
    expect(insights.some((i) => i.title.includes('streak'))).toBe(true);
  });

  it('flags heavy distracting usage as a down insight', () => {
    const events = [
      ev('a', dayStart(0), 3600, 'Timepass', { domain: 'instagram.com' }),
      ev('b', dayStart(0, 14), 1800, 'Timepass', { domain: 'instagram.com' }),
      ev('c', dayStart(1), 1200, 'Study'),
    ];
    const insights = buildInsights(events, 7, now);
    const distract = insights.find((i) => i.title.includes('distracting'));
    expect(distract).toBeTruthy();
    expect(distract.kind).toBe('down');
  });

  it('caps at 8 insights', () => {
    const events = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 8; h <= 21; h += 2) {
        events.push(ev(`${d}-${h}`, dayStart(d, h), 2400, 'Study', { domain: 'github.com' }));
      }
    }
    const insights = buildInsights(events, 7, now);
    expect(insights.length).toBeLessThanOrEqual(8);
    expect(insights.length).toBeGreaterThan(0);
  });
});
describe('domainTransitions', () => {
  const now = new Date(2026, 7, 11, 12).getTime();

  it('finds frequent A-to-B domain switches within the gap window', () => {
    const base = now - 3600000;
    const events = [
      ev('a', base, 600, 'Entertainment', { domain: 'youtube.com', endTs: base + 600000 }),
      ev('b', base + 700000, 600, 'DSA', { domain: 'leetcode.com', endTs: base + 700000 + 600000 }),
      ev('c', base + 3600000, 600, 'Entertainment', { domain: 'youtube.com', endTs: base + 3600000 + 600000 }),
      ev('d', base + 3700000, 600, 'DSA', { domain: 'leetcode.com', endTs: base + 3700000 + 600000 }),
    ];
    const t = domainTransitions(events, 7, now);
    expect(t.length).toBe(1);
    expect(t[0].from).toBe('youtube.com');
    expect(t[0].to).toBe('leetcode.com');
    expect(t[0].count).toBe(2);
  });

  it('ignores transitions with too-large gaps', () => {
    const base = now - 3600000;
    const events = [
      ev('a', base, 600, 'Entertainment', { domain: 'youtube.com', endTs: base + 600000 }),
      ev('b', base + 3600000, 600, 'DSA', { domain: 'leetcode.com', endTs: base + 3600000 + 600000 }),
    ];
    expect(domainTransitions(events, 7, now)).toEqual([]);
  });
});

describe('detectAnomalies', () => {
  it('flags late-night activity (2-5 AM)', () => {
    const now = new Date(2026, 7, 11, 12).getTime();
    const d = new Date(now);
    d.setHours(3, 0, 0, 0);
    const events = [ev('a', d.getTime(), 1800, 'Entertainment', { endTs: d.getTime() + 1800000 })];
    const anomalies = detectAnomalies(events, now);
    expect(anomalies.some((a) => a.title.includes('Late-night'))).toBe(true);
  });

it('flags 3h+ uninterrupted distraction runs', () => {
    const now = new Date(2026, 7, 11, 12).getTime();
    const base = now - 6 * 3600000;
    const events = [];
    for (let i = 0; i < 7; i++) {
      const t = base + i * 1800000;
      events.push(ev(`e${i}`, t, 1800, 'Timepass', { domain: 'instagram.com', endTs: t + 1800000 }));
    }
    const anomalies = detectAnomalies(events, now);
    expect(anomalies.some((a) => a.title.includes('uninterrupted'))).toBe(true);
  });

  it('returns no anomalies for clean data', () => {
    const now = new Date(2026, 7, 11, 12).getTime();
    const base = now - 3600000;
    const events = [ev('a', base, 3600, 'Study', { endTs: base + 3600000 })];
    expect(detectAnomalies(events, now)).toEqual([]);
  });
});
