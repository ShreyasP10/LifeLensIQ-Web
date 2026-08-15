import { CATEGORY_WEIGHTS, isProductiveCategory } from './categories.js';

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
    if (type === 'short_video' || category === 'Short-form Video') total.shortsSeconds += dur;
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

export function deepFocusSessions(events, minMinutes = 30, gapMinutes = 5) {
  const sorted = [...(events || [])]
    .filter((ev) => (Number(ev.durationSeconds) || 0) > 0 && ev.domain)
    .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  const sessions = [];
  let cur = null;
  for (const ev of sorted) {
    const ts = Number(ev.ts) || 0;
    const end = Number(ev.endTs) || ts;
    if (cur && ev.domain === cur.domain && ts - cur.end <= gapMinutes * 60000) {
      cur.seconds += Number(ev.durationSeconds) || 0;
      cur.events += 1;
      cur.end = Math.max(cur.end, end);
    } else {
      if (cur && cur.seconds >= minMinutes * 60) sessions.push(cur);
      cur = {
        domain: ev.domain,
        start: ts,
        end,
        seconds: Number(ev.durationSeconds) || 0,
        events: 1,
      };
    }
  }
  if (cur && cur.seconds >= minMinutes * 60) sessions.push(cur);
  return sessions;
}

export function daySummary(events, now = Date.now()) {
  const today = eventsOnDay(events, dayKeyLocal(new Date(now)));
  const a = aggregate(today);
  let studySeconds = 0;
  for (const [c, s] of Object.entries(a.byCategory)) {
    if (isProductiveCategory(c)) studySeconds += s;
  }
  return {
    studySeconds,
    shortsSeconds: a.shortsSeconds,
    score: a.score,
    deepSessions: deepFocusSessions(today).length,
    events: today.length,
  };
}

export function bestFocusWindow(events, { days = 14, windowHours = 3, now = Date.now() } = {}) {
  const keys = new Set(lastNDays(days, now));
  const hours = new Array(24).fill(0);
  for (const ev of events || []) {
    const dur = Number(ev.durationSeconds) || 0;
    const ts = Number(ev.ts) || 0;
    if (dur <= 0 || !ts || !keys.has(dayKey(ts))) continue;
    const w = CATEGORY_WEIGHTS[ev.category] ?? 0.2;
    hours[new Date(ts).getHours()] += dur * w;
  }
  let best = { start: 0, score: 0 };
  for (let h = 0; h <= 24 - windowHours; h++) {
    let score = 0;
    for (let k = 0; k < windowHours; k++) score += hours[h + k];
    if (score > best.score) best = { start: h, score };
  }
  if (best.score <= 0) return null;
  return { start: best.start, end: best.start + windowHours, profile: hours };
}

export function streakForTarget(events, targetMinutes, now = Date.now()) {
  if (!targetMinutes || targetMinutes <= 0) return focusStreak(events, now);
  const perDay = new Map();
  for (const ev of events || []) {
    const dur = Number(ev.durationSeconds) || 0;
    const ts = Number(ev.ts) || 0;
    if (dur <= 0 || !ts) continue;
    const w = CATEGORY_WEIGHTS[ev.category] ?? 0.2;
    const dk = dayKey(ts);
    perDay.set(dk, (perDay.get(dk) || 0) + dur * w);
  }
  const days = lastNDays(366, now);
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (i === days.length - 1 && (perDay.get(days[i]) || 0) < targetMinutes * 60) continue;
    if ((perDay.get(days[i]) || 0) >= targetMinutes * 60) streak += 1;
    else break;
  }
  return streak;
}

export function weekdayAgg(events) {
  const a = aggregate(events);
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return labels.map((label, i) => {
    const seconds = a.byWeekday[i] || 0;
    return { label, seconds, hours: Math.round((seconds / 3600) * 10) / 10 };
  });
}

export function weekOverWeek(events, days, now = Date.now()) {
  const { current, previous } = comparePeriods(events, days, now);
  const cats = new Set([...Object.keys(current.byCategory), ...Object.keys(previous.byCategory)]);
  return [...cats]
    .map((c) => ({
      category: c,
      current: current.byCategory[c] || 0,
      previous: previous.byCategory[c] || 0,
      change: pctChange(current.byCategory[c] || 0, previous.byCategory[c] || 0),
    }))
    .sort((x, y) => y.current + y.previous - (x.current + x.previous));
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