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
  deepFocusSessions,
  daySummary,
  bestFocusWindow,
streakForTarget,
  weekdayAgg,
  weekdayAverages,
  weekOverWeek,
  focusSessions,
  manualStudyEvents,
  wakeSleepForDay,
  chargeSessions,
  trendSeries,
  monthComparison,
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
describe('deepFocusSessions', () => {
  it('merges consecutive same-domain events with small gaps into one session', () => {
    const base = 1700000000000;
    const sessions = deepFocusSessions([
      ev('a', base, 1200, 'Study', { domain: 'leetcode.com', endTs: base + 1200000 }),
      ev('b', base + 1250000, 1200, 'Study', { domain: 'leetcode.com', endTs: base + 2450000 }),
      ev('c', base + 2500000, 600, 'Study', { domain: 'leetcode.com', endTs: base + 3100000 }),
      ev('d', base + 4000000, 300, 'Other', { domain: 'reddit.com', endTs: base + 4300000 }),
    ]);
    expect(sessions.length).toBe(1);
    expect(sessions[0].domain).toBe('leetcode.com');
    expect(sessions[0].seconds).toBe(3000);
  });

  it('does not merge across long gaps or different domains', () => {
    const base = 1700000000000;
    const sessions = deepFocusSessions([
      ev('a', base, 2000, 'Study', { domain: 'leetcode.com', endTs: base + 2000000 }),
      ev('b', base + 3600000, 2000, 'Study', { domain: 'leetcode.com', endTs: base + 5600000 }),
    ]);
    expect(sessions.length).toBe(2);
  });

  it('skips events below the min threshold', () => {
    const base = 1700000000000;
    const sessions = deepFocusSessions([
      ev('a', base, 1000, 'Study', { domain: 'leetcode.com', endTs: base + 1000000 }),
    ]);
    expect(sessions.length).toBe(0);
  });
});

describe('daySummary', () => {
  it('computes today study, shorts and deep sessions', () => {
    const now = 1700000000000;
    const base = 1700000000000 - 3600000;
    const summary = daySummary(
      [
        ev('a', base, 3600, 'Study', { domain: 'leetcode.com', endTs: base + 3600000 }),
        ev('b', base + 3700000, 600, 'Short-form Video', { domain: 'youtube.com', endTs: base + 4300000 }),
        ev('c', base + 4400000, 900, 'Entertainment', { domain: 'netflix.com', endTs: base + 5300000 }),
      ],
      now
    );
    expect(summary.studySeconds).toBe(3600);
    expect(summary.shortsSeconds).toBe(600);
    expect(summary.deepSessions).toBe(1);
    expect(summary.score).toBeGreaterThan(0);
  });
});

describe('bestFocusWindow', () => {
  it('finds the top 3-hour productive window from recent history', () => {
    const now = new Date(2026, 7, 11, 12).getTime();
    const base = new Date(now);
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() - 2);
    const events = [];
    for (let h = 0; h < 3; h++) {
      const t = base.getTime() + (9 + h) * 3600000;
      events.push(ev(`e${h}`, t, 3500, 'Study', { endTs: t + 3500000 }));
    }
    const w = bestFocusWindow(events, { now });
    expect(w.start).toBe(9);
    expect(w.end).toBe(12);
    expect(w.profile.length).toBe(24);
  });

  it('returns null with no data', () => {
    expect(bestFocusWindow([], { now: Date.now() })).toBeNull();
  });
});

describe('streakForTarget', () => {
  it('counts only days meeting the target (and allows today in progress)', () => {
    const now = 1700000000000;
    const day = 86400000;
    const events = [
      ev('a', now - day, 7200, 'Study', { endTs: now - day + 7200000 }),
      ev('b', now - 2 * day, 7200, 'Study', { endTs: now - 2 * day + 7200000 }),
      ev('c', now - 3 * day, 600, 'Study', { endTs: now - 3 * day + 600000 }),
      ev('d', now - 4 * day, 7200, 'Study', { endTs: now - 4 * day + 7200000 }),
      ev('e', now - 1, 3600, 'Study', { endTs: now - 1 + 3600000 }),
    ];
    expect(streakForTarget(events, 120, now)).toBe(2);
    expect(streakForTarget(events, 0, now)).toBe(focusStreak(events, now));
  });
});

describe('weekdayAgg and weekOverWeek', () => {
  it('returns 7 weekday entries with seconds', () => {
    const agg = weekdayAgg([ev('a', 1700000000000, 3600, 'Study', { endTs: 1700000000000 + 3600000 })]);
    expect(agg.length).toBe(7);
    expect(agg.some((w) => w.seconds > 0)).toBe(true);
  });

  it('returns per-category deltas between periods', () => {
    const now = 1700000000000;
    const day = 86400000;
    const events = [
      ev('a', now - 3 * 3600000, 3600, 'Study', { endTs: now - 3 * 3600000 + 3600000 }),
      ev('b', now - 7 * day - 3600000, 3600, 'Study', { endTs: now - 7 * day - 3600000 + 3600000 }),
    ];
const wows = weekOverWeek(events, 7, now);
    const study = wows.find((w) => w.category === 'Study');
    expect(study).toBeDefined();
    expect(study.current).toBe(3600);
    expect(study.change).toBe(0);
  });
});

describe('weekdayAverages', () => {
  it('averages per-weekday time across all events', () => {
    const base = new Date(2026, 7, 10, 12).getTime();
    const day = 86400000;
    const events = [
      ev('a', base, 3600, 'Study'),
      ev('b', base + day, 1800, 'Study'),
      ev('c', base + 7 * day, 7200, 'Study'),
    ];
    const out = weekdayAverages(events);
    expect(out[1].label).toBe('Mon');
    expect(out[1].occurrences).toBe(2);
    expect(out[1].productive).toBe(1.5);
    expect(out[1].distracting).toBe(0);
    expect(out[2].label).toBe('Tue');
    expect(out[2].occurrences).toBe(1);
    expect(out[2].productive).toBe(0.5);
  });
});

describe('focusSessions', () => {
  it('counts STUDY_SESSION events with locationType FOCUS separately', () => {
    const base = 1700000000000;
    const study = (id, sec, locationType) => ({
      id,
      ts: base,
      endTs: base + sec * 1000,
      durationSeconds: sec,
      domain: 'focus',
      category: 'Study',
      eventType: 'STUDY_SESSION',
      metadata: { subject: 'ML', locationType },
    });
    const events = [
      study('f1', 1500, 'FOCUS'),
      study('f2', 2100, 'FOCUS'),
      study('m1', 600, 'MANUAL'),
      study('h1', 900, 'HOME'),
    ];
    const f = focusSessions(events);
    expect(f.count).toBe(2);
    expect(f.minutes).toBe(60);
    expect(f.longestSeconds).toBe(2100);
  });

  it('manualStudyEvents returns only MANUAL logs', () => {
    const base = 1700000000000;
    const events = [
      { id: 'a', ts: base, endTs: base, durationSeconds: 600, eventType: 'STUDY_SESSION', metadata: { locationType: 'MANUAL' } },
      { id: 'b', ts: base, endTs: base, durationSeconds: 900, eventType: 'STUDY_SESSION', metadata: { locationType: 'FOCUS' } },
    ];
    expect(manualStudyEvents(events).map((e) => e.id)).toEqual(['a']);
  });
});

describe('wakeSleepForDay', () => {
  const day = (y, m, d, h, min) => new Date(y, m - 1, d, h, min, 0, 0).getTime();

  it('computes pickups, first wake, last shutdown and sleep estimate', () => {
    const events = [
      { id: 'on1', ts: day(2026, 8, 10, 23, 0), endTs: 0, durationSeconds: 0, eventType: 'SCREEN_OFF' },
      { id: 'on2', ts: day(2026, 8, 11, 6, 10), endTs: 0, durationSeconds: 0, eventType: 'SCREEN_ON' },
      { id: 'on3', ts: day(2026, 8, 11, 8, 30), endTs: 0, durationSeconds: 0, eventType: 'SCREEN_ON' },
      { id: 'off1', ts: day(2026, 8, 11, 21, 45), endTs: 0, durationSeconds: 0, eventType: 'SCREEN_OFF' },
    ];
    const r = wakeSleepForDay(events, '2026-08-11');
    expect(r.pickups).toBe(2);
    expect(r.firstWake).toBe(day(2026, 8, 11, 6, 10));
    expect(r.lastShutdown).toBe(day(2026, 8, 11, 21, 45));
    expect(r.sleepMs).toBe(day(2026, 8, 11, 6, 10) - day(2026, 8, 10, 23, 0));
  });

  it('returns nulls when data is missing', () => {
    const r = wakeSleepForDay([], '2026-08-11');
    expect(r.pickups).toBe(0);
    expect(r.firstWake).toBeNull();
    expect(r.lastShutdown).toBeNull();
    expect(r.sleepMs).toBeNull();
  });

  it('rejects implausible sleep estimates (outside 45 min - 14 h)', () => {
    const events = [
      { id: 'a', ts: day(2026, 8, 10, 23, 0), endTs: 0, durationSeconds: 0, eventType: 'SCREEN_OFF' },
      { id: 'b', ts: day(2026, 8, 11, 14, 0), endTs: 0, durationSeconds: 0, eventType: 'SCREEN_ON' },
    ];
    const r = wakeSleepForDay(events, '2026-08-11');
    expect(r.firstWake).not.toBeNull();
    expect(r.sleepMs).toBeNull();
  });
});

describe('chargeSessions', () => {
  it('pairs CHARGE_START/END into sessions with avg and overnight count', () => {
    const now = new Date(2026, 7, 12, 12).getTime();
    const s1 = new Date(2026, 7, 10, 23, 0).getTime();
    const s2 = new Date(2026, 7, 11, 10, 0).getTime();
    const events = [
      { id: 'c1', ts: s1, endTs: 0, durationSeconds: 0, eventType: 'CHARGE_START' },
      { id: 'c2', ts: s1 + 3600000, endTs: 0, durationSeconds: 0, eventType: 'CHARGE_END' },
      { id: 'c3', ts: s2, endTs: 0, durationSeconds: 0, eventType: 'CHARGE_START' },
      { id: 'c4', ts: s2 + 1500000, endTs: 0, durationSeconds: 0, eventType: 'CHARGE_END' },
    ];
    const c = chargeSessions(events, 7, now);
    expect(c.sessions).toBe(2);
    expect(c.avgMinutes).toBe(43);
    expect(c.overnight).toBe(1);
  });
});

describe('trendSeries', () => {
  const now = new Date(2026, 7, 11, 12).getTime();
  const day = 86400000;

  it('builds daily buckets for 7D with steps and pickups', () => {
    const events = [
      { id: 'a', ts: now - 2 * day, endTs: 0, durationSeconds: 3600, category: 'Study', eventType: 'tab_active' },
      { id: 'b', ts: now - 2 * day, endTs: 0, durationSeconds: 0, category: 'Other', eventType: 'SCREEN_ON' },
      { id: 'c', ts: now - 2 * day, endTs: 0, durationSeconds: 0, category: 'Other', eventType: 'STEPS', metadata: { stepDelta: 1200 } },
    ];
    const series = trendSeries(events, 7, now);
    expect(series.length).toBe(7);
    const twoDaysAgo = series[series.length - 3];
    expect(twoDaysAgo.screen).toBe(3600);
    expect(twoDaysAgo.study).toBe(3600);
    expect(twoDaysAgo.pickups).toBe(1);
    expect(twoDaysAgo.steps).toBe(1200);
  });

  it('builds 12 monthly buckets for 1Y', () => {
    const events = [
      { id: 'a', ts: now - 60 * day, endTs: 0, durationSeconds: 3600, category: 'Study', eventType: 'tab_active' },
    ];
    const series = trendSeries(events, 365, now);
    expect(series.length).toBe(12);
    const total = series.reduce((a, b) => a + b.screen, 0);
    expect(total).toBe(3600);
  });
});

describe('monthComparison', () => {
  it('computes deltas between this month and last month', () => {
    const now = new Date(2026, 7, 15, 12).getTime();
    const events = [
      { id: 'a', ts: new Date(2026, 7, 5, 12).getTime(), endTs: 0, durationSeconds: 3600, category: 'Study', eventType: 'tab_active' },
      { id: 'b', ts: new Date(2026, 6, 5, 12).getTime(), endTs: 0, durationSeconds: 3600, category: 'Study', eventType: 'tab_active' },
    ];
    const c = monthComparison(events, now);
    const study = c.find((m) => m.metric === 'study');
    expect(study.current).toBe(3600);
    expect(study.previous).toBe(3600);
    expect(study.change).toBe(0);
  });
});
