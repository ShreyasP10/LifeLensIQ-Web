import { CATEGORY_WEIGHTS } from './categories.js';

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayKeyLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDuration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function lastNDays(n, now = Date.now()) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    days.push(dayKeyLocal(d));
  }
  return days;
}

export function aggregate(events, opts = {}) {
  const total = {
    count: 0,
    totalSeconds: 0,
    productiveSeconds: 0,
    score: 0,
    byCategory: {},
    byDomain: {},
    byDay: {},
    byHour: {},
    byWeekday: {},
    byEventType: {},
    shortsSeconds: 0,
    writingSeconds: 0,
    pdfSeconds: 0,
    activeSeconds: 0,
    activeDays: 0,
  };
  const seenDays = new Set();

  for (const ev of events || []) {
    const dur = Number(ev.durationSeconds) || 0;
    if (dur <= 0) continue;
    const category = ev.category || 'Other';
    const ts = Number(ev.ts) || 0;
    const d = ts ? new Date(ts) : null;
    total.count += 1;
    total.totalSeconds += dur;
    total.byCategory[category] = (total.byCategory[category] || 0) + dur;
    if (ev.domain) {
      total.byDomain[ev.domain] = (total.byDomain[ev.domain] || 0) + dur;
    }
    if (ts) {
      const dk = dayKey(ts);
      total.byDay[dk] = (total.byDay[dk] || 0) + dur;
      seenDays.add(dk);
      total.byHour[d.getHours()] = (total.byHour[d.getHours()] || 0) + dur;
      total.byWeekday[d.getDay()] = (total.byWeekday[d.getDay()] || 0) + dur;
    }
    const type = ev.eventType || 'tab_active';
    total.byEventType[type] = (total.byEventType[type] || 0) + dur;
    if (type === 'short_video') total.shortsSeconds += dur;
    if (type === 'writing_session') total.writingSeconds += dur;
    if (type === 'pdf_view') total.pdfSeconds += dur;
    if (type === 'tab_active') total.activeSeconds += dur;
  }

  total.activeDays = seenDays.size;
  total.productiveSeconds = Object.entries(total.byCategory).reduce(
    (acc, [c, s]) => acc + s * (CATEGORY_WEIGHTS[c] ?? 0.2),
    0
  );
  total.score =
    total.totalSeconds > 0 ? Math.round((total.productiveSeconds / total.totalSeconds) * 100) : 0;
  return total;
}

export function topEntries(map, n = 8) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, seconds]) => ({ name, seconds }));
}

export function eventsOnDay(events, key) {
  return (events || []).filter((ev) => dayKey(ev.ts) === key);
}

export function filterRange(events, fromTs, toTs) {
  return (events || []).filter((ev) => ev.ts >= fromTs && ev.ts <= toTs);
}

export function inRange(events, days, now = Date.now()) {
  const keys = new Set(lastNDays(days, now));
  return (events || []).filter((ev) => keys.has(dayKey(ev.ts)));
}

export function pctChange(cur, prev) {
  if (!prev || prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export function comparePeriods(events, days, now = Date.now()) {
  const currentKeys = new Set(lastNDays(days, now));
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  const previousKeys = new Set(lastNDays(days, start.getTime()));
  const buffered = events || [];
  return {
    current: aggregate(buffered.filter((ev) => currentKeys.has(dayKey(ev.ts)))),
    previous: aggregate(buffered.filter((ev) => previousKeys.has(dayKey(ev.ts)))),
  };
}

export function focusStreak(events, now = Date.now()) {
  const active = new Set(
    (events || [])
      .filter((ev) => (Number(ev.durationSeconds) || 0) > 0)
      .map((ev) => dayKey(ev.ts))
  );
  const days = lastNDays(366, now);
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (i === days.length - 1 && !active.has(days[i])) continue;
    if (active.has(days[i])) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export function buildStatsReport(events, range) {
  const a = aggregate(events);
  return {
    exportedAt: Date.now(),
    schemaVersion: 1,
    range,
    totals: {
      count: a.count,
      totalSeconds: a.totalSeconds,
      productiveSeconds: a.productiveSeconds,
      score: a.score,
      shortsSeconds: a.shortsSeconds,
      writingSeconds: a.writingSeconds,
      pdfSeconds: a.pdfSeconds,
      activeDays: a.activeDays,
      byEventType: a.byEventType,
    },
    byDay: a.byDay,
    byHour: a.byHour,
    byWeekday: a.byWeekday,
    byCategory: a.byCategory,
    byDomain: a.byDomain,
    topDomains: topEntries(a.byDomain, 10),
    categoryMetrics: Object.fromEntries(
      Object.entries(a.byCategory).map(([c, s]) => [
        c,
        {
          seconds: s,
          weight: CATEGORY_WEIGHTS[c] ?? 0.2,
          productiveSeconds: Math.round(s * (CATEGORY_WEIGHTS[c] ?? 0.2)),
        },
      ])
    ),
  };
}