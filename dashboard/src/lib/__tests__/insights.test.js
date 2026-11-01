import { describe, it, expect } from 'vitest';
import { buildInsights, domainTransitions, detectAnomalies, buildCorrelations } from '../insights.js';

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

  it('ranks distraction runs by cost inside scheduled classes', () => {
    let base = new Date(2026, 8, 1, 9, 0);
    while (base.getDay() !== 1) base.setDate(base.getDate() + 1); // a Monday
    const now = base.getTime() + 7 * 3600000;
    const classRun = [];
    for (let i = 0; i < 8; i++) {
      const t = base.getTime() + 30 * 60000 + i * 1800000; // 09:30 → 13:30, inside 09–11 class
      classRun.push(ev(`c${i}`, t, 1800, 'Timepass', { domain: 'instagram.com', endTs: t + 1800000 }));
    }
    const offRun = [];
    for (let i = 0; i < 7; i++) {
      const t = base.getTime() + 5.5 * 3600000 + i * 1800000; // 14:30 same day, outside class
      offRun.push(ev(`o${i}`, t, 1800, 'Entertainment', { domain: 'hotstar.com', endTs: t + 1800000 }));
    }
    const timetable = { entries: [{ day: 'Monday', startTime: '09:00', endTime: '11:00' }] };
    const [first, second] = detectAnomalies([...classRun, ...offRun], now, { timetable });
    expect(first.costMinutes).toBeGreaterThan(second.costMinutes);
    expect(first.detail).toContain('scheduled classes');
    expect(second.costMinutes).toBe(0);
  });
});

describe('buildCorrelations', () => {
  function daysOfEvents(builder, n, now) {
    const events = [];
    for (let i = 0; i < n; i++) {
      const day = now - i * 86400000;
      events.push(...builder(i, day));
    }
    return events;
  }

  it('links morning distraction to lower productive time', () => {
    const now = new Date(2026, 8, 15, 21, 0).getTime();
    const events = daysOfEvents(
      (i, day) => {
        const morning = new Date(day);
        morning.setHours(7, 0, 0, 0);
        const afternoon = new Date(day);
        afternoon.setHours(15, 0, 0, 0);
        const studyLen = i % 2 === 0 ? 1200 : 2400; // 20 or 40 min
        const evs = [ev(`s${i}`, afternoon.getTime(), studyLen, 'DSA', { domain: 'leetcode.com', endTs: afternoon.getTime() + studyLen * 1000 })];
        if (i % 2 === 0) {
          evs.unshift(ev(`m${i}`, morning.getTime(), 1800, 'Entertainment', { domain: 'hotstar.com', endTs: morning.getTime() + 1800000 }));
        }
        return evs;
      },
      9,
      now
    );
    const corr = buildCorrelations(events, 30, now);
    const c = corr.find((r) => r.title.includes('morning distraction'));
    expect(c).toBeTruthy();
    expect(c.pct).toBeLessThan(0);
    expect(c.kind).toBe('down');
  });

  it('returns [] with too little data', () => {
    const now = new Date(2026, 8, 15, 21, 0).getTime();
    expect(buildCorrelations([ev('a', now - 1000, 600, 'Study')], 30, now)).toEqual([]);
  });
});
