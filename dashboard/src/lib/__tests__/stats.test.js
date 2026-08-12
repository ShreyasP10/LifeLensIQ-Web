import { describe, it, expect } from 'vitest';
import {
  pad,
  dayKey,
  dayKeyLocal,
  formatDuration,
  formatTime,
  lastNDays,
  aggregate,
  topEntries,
  eventsOnDay,
  filterRange,
  inRange,
  pctChange,
  comparePeriods,
  focusStreak,
  buildStatsReport,
} from '../stats.js';

const ev = (id, ts, durationSeconds, category, overrides = {}) => ({
  id,
  ts,
  domain: 'example.com',
  path: '/',
  title: '',
  category: category || 'Other',
  eventType: 'tab_active',
  durationSeconds,
  ...overrides,
});

describe('formatting', () => {
  it('pads numbers', () => {
    expect(pad(3)).toBe('03');
    expect(pad(12)).toBe('12');
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(65)).toBe('1m');
    expect(formatDuration(3661)).toBe('1h 1m');
  });

  it('formats epoch milliseconds to local day keys', () => {
    const d = new Date(2026, 7, 11, 15, 30); // Aug 11 2026 local
    expect(dayKey(d.getTime())).toBe('2026-08-11');
    expect(dayKeyLocal(d)).toBe('2026-08-11');
  });

  it('formats time', () => {
    const d = new Date(2026, 7, 11, 9, 5);
    expect(formatTime(d.getTime())).toContain('9:05');
  });
});

describe('lastNDays', () => {
  it('returns n unique keys ending today (local)', () => {
    const now = new Date(2026, 7, 11, 12).getTime();
    const days = lastNDays(7, now);
    expect(days).toHaveLength(7);
    expect(new Set(days).size).toBe(7);
    expect(days[6]).toBe('2026-08-11');
    expect(days[0]).toBe('2026-08-05');
  });
});

describe('aggregate', () => {
  const base = new Date(2026, 7, 11, 10).getTime();

  it('sums totals across categories and types', () => {
    const events = [
      ev('a', base, 3600, 'Study'),
      ev('b', base + 60000, 600, 'Entertainment', { eventType: 'short_video' }),
      ev('c', base + 120000, 1200, 'Development', { eventType: 'writing_session' }),
    ];
    const a = aggregate(events);
    expect(a.count).toBe(3);
    expect(a.totalSeconds).toBe(5400);
    expect(a.shortsSeconds).toBe(600);
    expect(a.writingSeconds).toBe(1200);
    expect(a.productiveSeconds).toBe(3600 * 1.0 + 1200 * 1.0 + 600 * 0.05);
    expect(a.score).toBe(Math.round((4830 / 5400) * 100));
  });

  it('buckets by day, hour, weekday, event type', () => {
    const t1 = new Date(2026, 7, 11, 9, 10).getTime(); // Tuesday local
    const t2 = new Date(2026, 7, 12, 22, 0).getTime();
    const a = aggregate([ev('a', t1, 100, 'Study'), ev('b', t2, 50, 'Timepass')]);
    expect(a.byDay['2026-08-11']).toBe(100);
    expect(a.byDay['2026-08-12']).toBe(50);
    expect(a.byHour[9]).toBe(100);
    expect(a.byHour[22]).toBe(50);
    expect(a.byWeekday[2]).toBe(100);
    expect(a.byEventType.tab_active).toBe(150);
    expect(a.activeDays).toBe(2);
  });

  it('ignores zero/negative durations', () => {
    const a = aggregate([
      ev('a', base, 0, 'Study'),
      ev('b', base + 1, -5, 'Study'),
    ]);
    expect(a.count).toBe(0);
    expect(a.totalSeconds).toBe(0);
    expect(a.score).toBe(0);
  });
});

describe('topEntries', () => {
  it('sorts descending and limits', () => {
    const res = topEntries({ b: 2, a: 10, c: 4 }, 2);
    expect(res).toEqual([
      { name: 'a', seconds: 10 },
      { name: 'c', seconds: 4 },
    ]);
  });
});

describe('eventsOnDay / filterRange / inRange', () => {
  const base = new Date(2026, 7, 11, 8).getTime();
  const events = [
    ev('a', base, 100, 'Study'),
    ev('b', base + 4000, 200, 'Timepass'),
    ev('c', base + 86400000, 300, 'Study'),
  ];

  it('filters by local day key', () => {
    expect(eventsOnDay(events, '2026-08-11').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('filters by epoch range', () => {
    const inRangeRes = filterRange(events, base + 1000, base + 10000).map((e) => e.id);
    expect(inRangeRes).toEqual(['b']);
  });

  it('inRange uses local day keys', () => {
    expect(inRange(events, 1, base + 3600).map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('pctChange / comparePeriods', () => {
  it('computes percentage change', () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(10, 0)).toBeNull();
  });

  it('compares current vs previous window', () => {
    const now = new Date(2026, 7, 11, 12).getTime();
    const events = [
      ev('a', now - 86400000, 1000, 'Study'), // yesterday
      ev('b', now, 2000, 'Study'), // today
    ];
    const { current, previous } = comparePeriods(events, 1, now);
    expect(current.totalSeconds).toBe(2000);
    expect(previous.totalSeconds).toBe(1000);
  });
});

describe('focusStreak', () => {
  const now = new Date(2026, 7, 11, 12).getTime();
  const dayStart = (offset) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offset);
    return d.getTime();
  };

  it('counts consecutive days ending today', () => {
    const events = [
      ev('a', dayStart(0), 100, 'Study'),
      ev('b', dayStart(1), 100, 'Study'),
      ev('c', dayStart(2), 100, 'Study'),
      ev('d', dayStart(4), 100, 'Study'),
    ];
    expect(focusStreak(events, now)).toBe(3);
  });

  it('does not break the streak when today is still empty, but breaks on a gap', () => {
    const events = [
      ev('a', dayStart(1), 100, 'Study'),
      ev('b', dayStart(2), 100, 'Study'),
      ev('c', dayStart(6), 100, 'Study'),
    ];
    expect(focusStreak(events, now)).toBe(2);
  });

  it('returns 0 with no events', () => {
    expect(focusStreak([], now)).toBe(0);
  });
});

describe('buildStatsReport', () => {
  it('exports rich ML-ready aggregates', () => {
    const base = new Date(2026, 7, 11, 10).getTime();
    const report = buildStatsReport(
      [ev('a', base, 3600, 'Study'), ev('b', base + 1000, 600, 'Entertainment')],
      { from: '2026-08-05', to: '2026-08-11' }
    );
    expect(report.range).toEqual({ from: '2026-08-05', to: '2026-08-11' });
    expect(report.totals.count).toBe(2);
    expect(report.totals.score).toBe(Math.round((3600 / 4200) * 100));
    expect(report.byHour[10]).toBe(4200);
    expect(report.topDomains[0].name).toBe('example.com');
    expect(report.categoryMetrics.Study).toEqual({
      seconds: 3600,
      weight: 1,
      productiveSeconds: 3600,
    });
  });
});