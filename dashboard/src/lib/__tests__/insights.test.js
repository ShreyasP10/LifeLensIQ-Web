import { describe, it, expect } from 'vitest';
import { buildInsights } from '../insights.js';

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