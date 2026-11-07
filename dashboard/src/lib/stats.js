import { CATEGORY_WEIGHTS, isProductiveCategory, isDistractingCategory } from './categories.js';

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

export const DAY_RESET_HOUR = 3;

export function dayKeyAt3am(ts) {
  const d = new Date(Number(ts));
  d.setHours(d.getHours() - DAY_RESET_HOUR);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKeyAt3am(now = Date.now()) {
  return dayKeyAt3am(now);
}

export function lastNDaysAt3am(n, now = Date.now()) {
  const days = [];
  const base = new Date(now);
  base.setHours(base.getHours() - DAY_RESET_HOUR);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    days.push(dayKeyLocal(d));
  }
  return days;
}

export function eventsOnDayAt3am(events, key) {
  return (events || []).filter((ev) => dayKeyAt3am(ev.ts) === key);
}

export function firstLastSeenForDay(events, day) {
  const dayEvents = eventsOnDayAt3am(events, day);
  if (dayEvents.length === 0) {
    return {
      day,
      firstSeen: null,
      lastSeen: null,
      firstSeenFormatted: '—',
      lastSeenFormatted: '—',
      activeSeconds: 0,
      count: 0,
      durationFormatted: formatDuration(0),
    };
  }
  let first = Infinity;
  let last = -Infinity;
  let activeSeconds = 0;
  for (const ev of dayEvents) {
    const s = Number(ev.ts) || 0;
    const e = Number(ev.endTs) || s + (Number(ev.durationSeconds) || 0) * 1000;
    if (s < first) first = s;
    if (e > last) last = e;
    activeSeconds += Number(ev.durationSeconds) || 0;
  }
  return {
    day,
    firstSeen: first,
    lastSeen: last,
    firstSeenFormatted: formatTime(first),
    lastSeenFormatted: formatTime(last),
    activeSeconds,
    count: dayEvents.length,
    durationFormatted: formatDuration(activeSeconds),
  };
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
      const dk = dayKeyAt3am(ts);
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
      .map((ev) => dayKeyAt3am(ev.ts))
  );
  const days = lastNDaysAt3am(366, now);
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
    .filter((ev) => (Number(ev.durationSeconds) || 0) > 0 && ev.domain && isProductiveCategory(ev.category))
    .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  const sessions = [];
  let cur = null;
  for (const ev of sorted) {
    const ts = Number(ev.ts) || 0;
    const end = Number(ev.endTs) || ts + (Number(ev.durationSeconds) || 0) * 1000;
    const sameDay = cur ? dayKey(ts) === dayKey(cur.start) : true;
    if (cur && sameDay && ev.domain === cur.domain && ts - cur.end <= gapMinutes * 60000) {
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

export function activeIdleForDay(events, day) {
  const fl = firstLastSeenForDay(events, day);
  const hasData = Boolean(fl.firstSeen && fl.lastSeen);
  const windowSeconds = hasData ? Math.max(0, Math.round((fl.lastSeen - fl.firstSeen) / 1000)) : 0;
  const activeSeconds = Math.max(0, Math.min(Math.round(fl.activeSeconds || 0), windowSeconds));
  const idleSeconds = Math.max(0, windowSeconds - activeSeconds);
  const utilization = windowSeconds > 0 ? Math.round((activeSeconds / windowSeconds) * 100) : 0;
  return {
    day,
    hasData,
    windowSeconds,
    activeSeconds,
    idleSeconds,
    utilization,
    activeFormatted: formatDuration(activeSeconds),
    idleFormatted: formatDuration(idleSeconds),
    windowFormatted: formatDuration(windowSeconds),
  };
}

export function attentionScore(events, days = 1, now = Date.now()) {
  const keys = days == null ? null : new Set(lastNDays(days, now));
  const valid = (events || [])
    .filter((ev) => {
      if ((Number(ev.durationSeconds) || 0) <= 0 || !ev.domain) return false;
      return !keys || keys.has(dayKey(ev.ts));
    })
    .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  if (valid.length === 0) {
    return {
      score: 0,
      avgBlockSeconds: 0,
      switches: 0,
      switchesPerHour: 0,
      activeSeconds: 0,
      focusShare: 0,
    };
  }
  let activeSeconds = 0;
  let weighted = 0;
  let switches = 0;
  const blockSeconds = [];
  let cur = null;
  for (const ev of valid) {
    const dur = Number(ev.durationSeconds) || 0;
    const ts = Number(ev.ts) || 0;
    const end = Number(ev.endTs) || ts + dur * 1000;
    activeSeconds += dur;
    weighted += dur * (CATEGORY_WEIGHTS[ev.category] ?? 0.2);
    if (cur && ev.domain === cur.domain && ts - cur.end <= 5 * 60000) {
      cur.seconds += dur;
      cur.end = Math.max(cur.end, end);
    } else {
      if (cur) blockSeconds.push(cur.seconds);
      cur = { domain: ev.domain, seconds: dur, end };
    }
  }
  if (cur) blockSeconds.push(cur.seconds);
  for (let i = 1; i < valid.length; i++) {
    const a = valid[i - 1];
    const b = valid[i];
    const gap = (Number(b.ts) || 0) - (Number(a.endTs) || Number(a.ts) || 0);
    if (gap <= 2 * 60000 && a.domain !== b.domain) switches += 1;
  }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const avgBlockSeconds = blockSeconds.reduce((a, s) => a + s, 0) / blockSeconds.length;
  const focusShare = activeSeconds > 0 ? weighted / activeSeconds : 0;
  const perHour = activeSeconds > 0 ? switches / (activeSeconds / 3600) : 0;
  const score = Math.round(
    100 *
      (0.45 * clamp01(avgBlockSeconds / (30 * 60)) +
        0.35 * clamp01(focusShare) +
        0.2 * (1 - clamp01((perHour - 5) / 20)))
  );
  return {
    score,
    avgBlockSeconds: Math.round(avgBlockSeconds),
    switches,
    switchesPerHour: Math.round(perHour * 10) / 10,
    activeSeconds: Math.round(activeSeconds),
    focusShare: Math.round(focusShare * 100),
  };
}

export function daySummary(events, now = Date.now()) {  const today = eventsOnDay(events, dayKeyLocal(new Date(now)));
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
    const dk = dayKeyAt3am(ts);
    perDay.set(dk, (perDay.get(dk) || 0) + dur * w);
  }
  const days = lastNDaysAt3am(366, now);
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

export function weekdayAverages(events) {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sum = labels.map(() => ({ productive: 0, neutral: 0, distracting: 0 }));
  const days = new Set();
  for (const ev of events || []) {
    const dur = Number(ev.durationSeconds) || 0;
    if (dur <= 0 || !ev.ts) continue;
    const w = new Date(Number(ev.ts)).getDay();
    if (isProductiveCategory(ev.category)) sum[w].productive += dur;
    else if (isDistractingCategory(ev.category)) sum[w].distracting += dur;
    else sum[w].neutral += dur;
    days.add(dayKeyLocal(new Date(Number(ev.ts))));
  }
  const occ = [0, 0, 0, 0, 0, 0, 0];
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number);
    occ[new Date(y, m - 1, d, 12).getDay()] += 1;
  }
  return labels.map((label, i) => {
    const n = occ[i] || 0;
    const avg = (v) => Math.round(((n ? v / n : 0) / 3600) * 10) / 10;
    return {
      label,
      occurrences: n,
      productive: avg(sum[i].productive),
      neutral: avg(sum[i].neutral),
      distracting: avg(sum[i].distracting),
    };
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

export function addDaysKey(day, offset) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() + offset);
  return dayKeyLocal(dt);
}

export function focusSessions(events) {
  const sessions = (events || []).filter(
    (ev) =>
      ev.eventType === 'STUDY_SESSION' &&
      ev.metadata &&
      ev.metadata.locationType === 'FOCUS'
  );
  const minutes = sessions.reduce(
    (a, ev) => a + (Number(ev.durationSeconds) || 0) / 60,
    0
  );
  const longest = sessions.reduce(
    (a, ev) => Math.max(a, Number(ev.durationSeconds) || 0),
    0
  );
  return { count: sessions.length, minutes: Math.round(minutes), longestSeconds: longest };
}

export function manualStudyEvents(events) {
  return (events || []).filter(
    (ev) =>
      ev.eventType === 'STUDY_SESSION' &&
      ev.metadata &&
      ev.metadata.locationType === 'MANUAL'
  );
}

export function wakeSleepForDay(events, day) {
  const dayEvents = eventsOnDay(events, day);
  const prevDayEvents = eventsOnDay(events, addDaysKey(day, -1));

  const pickups = dayEvents.filter((ev) => ev.eventType === 'SCREEN_ON').length;

  const firstWake = dayEvents
    .filter(
      (ev) => ev.eventType === 'SCREEN_ON' && new Date(Number(ev.ts) || 0).getHours() >= 5
    )
    .sort((a, b) => a.ts - b.ts)[0];

  const firstOn = dayEvents
    .filter(
      (ev) => ev.eventType === 'SCREEN_ON' && new Date(Number(ev.ts) || 0).getHours() >= 4
    )
    .sort((a, b) => a.ts - b.ts)[0];

  const lastShutdown = dayEvents
    .filter((ev) => ev.eventType === 'SCREEN_OFF')
    .sort((a, b) => b.ts - a.ts)[0];

  let sleepMs = null;
  if (firstOn) {
    const prevOff = prevDayEvents
      .filter(
        (ev) => ev.eventType === 'SCREEN_OFF' && new Date(Number(ev.ts) || 0).getHours() >= 12
      )
      .sort((a, b) => b.ts - a.ts)[0];
    if (prevOff) {
      const gap = Number(firstOn.ts) - Number(prevOff.ts);
      if (gap >= 45 * 60000 && gap <= 14 * 3600000) sleepMs = gap;
    }
  }

  return {
    day,
    pickups,
    firstWake: firstWake ? Number(firstWake.ts) : null,
    lastShutdown: lastShutdown ? Number(lastShutdown.ts) : null,
    sleepMs,
  };
}

export function chargeSessions(events, days = 7, now = Date.now()) {
  const keys = new Set(lastNDays(days, now));
  const inRange = (events || [])
    .filter((ev) => keys.has(dayKey(ev.ts)) || keys.has(dayKey(ev.endTs || ev.ts)))
    .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  const sessions = [];
  let start = null;
  for (const ev of inRange) {
    const ts = Number(ev.ts) || 0;
    if (ev.eventType === 'CHARGE_START') {
      if (start && ts - start >= 60000) sessions.push({ startTs: start, endTs: ts, durationMs: ts - start });
      start = ts;
    } else if (ev.eventType === 'CHARGE_END' && start) {
      if (ts - start >= 60000) sessions.push({ startTs: start, endTs: ts, durationMs: ts - start });
      start = null;
    }
  }
  const totalMs = sessions.reduce((a, s) => a + s.durationMs, 0);
  const overnight = sessions.filter((s) => {
    const h = new Date(s.startTs).getHours();
    return h >= 21 || h <= 6;
  }).length;
  return {
    sessions: sessions.length,
    avgMinutes: sessions.length ? Math.round(totalMs / sessions.length / 60000) : 0,
    overnight,
  };
}

function emptyBucket() {
  return { screen: 0, study: 0, steps: 0, shorts: 0, pickups: 0 };
}

export function trendSeries(events, period, now = Date.now()) {
  const out = [];
  if (period === 365) {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 11);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const buckets = new Map();
    for (const ev of events || []) {
      const ts = Number(ev.ts) || 0;
      if (!ts || ts < start.getTime()) continue;
      const d = new Date(ts);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const b = buckets.get(key) || emptyBucket();
      const dur = Number(ev.durationSeconds) || 0;
      b.screen += dur;
      if (isProductiveCategory(ev.category)) b.study += dur;
      if (ev.eventType === 'short_video' || ev.category === 'Short-form Video') b.shorts += dur;
      if (ev.eventType === 'SCREEN_ON') b.pickups += 1;
      b.steps += Number(ev.metadata && ev.metadata.stepDelta) || 0;
      buckets.set(key, b);
    }
    const d = new Date(start);
    for (let i = 0; i < 12; i++) {
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      out.push({
        key,
        label: d.toLocaleString([], { month: 'short' }),
        ...(buckets.get(key) || emptyBucket()),
      });
      d.setMonth(d.getMonth() + 1);
    }
  } else {
    const days = period === 1 ? 1 : period === 7 ? 7 : 30;
    for (const key of lastNDaysAt3am(days, now)) {
      const b = emptyBucket();
      for (const ev of eventsOnDayAt3am(events, key)) {
        const dur = Number(ev.durationSeconds) || 0;
        b.screen += dur;
        if (isProductiveCategory(ev.category)) b.study += dur;
        if (ev.eventType === 'short_video' || ev.category === 'Short-form Video') b.shorts += dur;
        if (ev.eventType === 'SCREEN_ON') b.pickups += 1;
        b.steps += Number(ev.metadata && ev.metadata.stepDelta) || 0;
      }
      out.push({
        key,
        label: `${Number(key.slice(8, 10))} ${new Date(2026, Number(key.slice(5, 7)) - 1, 1).toLocaleString([], { month: 'short' })}`,
        ...b,
      });
    }
  }
  return out;
}

export function monthComparison(events, now = Date.now()) {
  const d = new Date(now);
  const curStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const cur = emptyBucket();
  const prev = emptyBucket();
  for (const ev of events || []) {
    const ts = Number(ev.ts) || 0;
    if (!ts) continue;
    const dur = Number(ev.durationSeconds) || 0;
    const bucket = ts >= curStart ? cur : ts >= prevStart ? prev : null;
    if (!bucket) continue;
    bucket.screen += dur;
    if (isProductiveCategory(ev.category)) bucket.study += dur;
    if (ev.eventType === 'short_video' || ev.category === 'Short-form Video') bucket.shorts += dur;
    if (ev.eventType === 'SCREEN_ON') bucket.pickups += 1;
    bucket.steps += Number(ev.metadata && ev.metadata.stepDelta) || 0;
  }
  return [
    ['screen', 'Screen time'],
    ['study', 'Study'],
    ['steps', 'Steps'],
    ['shorts', 'Shorts'],
    ['pickups', 'Pickups'],
  ].map(([metric, label]) => ({
    metric,
    label,
    current: cur[metric],
    previous: prev[metric],
    change: pctChange(cur[metric], prev[metric]),
  }));
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

// Never dedupe these: they represent real-world sessions, not per-browser tracking.
const DEDUPE_EXCLUDED = new Set(['POMODORO', 'STUDY_SESSION']);

// Collapse overlapping per-category intervals so one wall-clock second is only
// counted once, no matter which device (Brave + Chrome + phone) wrote events.
// Fully-covered events are dropped; partially-overlapping ones are trimmed.
export function dedupeOverlaps(events) {
  if (!Array.isArray(events)) return events;
  const untouched = [];
  const byKey = new Map();
  for (const ev of events) {
    if (!ev || DEDUPE_EXCLUDED.has(ev.eventType)) { untouched.push(ev); continue; }
    const start = Number(ev.ts) || 0;
    if (!start) { untouched.push(ev); continue; }
    const durS = Number(ev.durationSeconds) || 0;
    const end = Number(ev.endTs) || (start + durS * 1000);
    if (end - start <= 0) { untouched.push(ev); continue; }
    const key = ev.category || 'Other';
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ ev, start, end });
  }
  const out = untouched;
  for (const items of byKey.values()) {
    items.sort((a, b) => a.start - b.start || b.end - a.end);
    const kept = [];
    for (const it of items) {
      const last = kept[kept.length - 1];
      if (!last) { kept.push(it); continue; }
      if (it.end <= last.end) continue;
      kept.push({ ...it, start: it.start < last.end ? last.end : it.start });
    }
    for (const k of kept) {
      const originalEnd =
        Number(k.ev.endTs) || (k.ev.ts + (Number(k.ev.durationSeconds) || 0) * 1000);
      if (k.start === k.ev.ts && k.end === originalEnd) { out.push(k.ev); continue; }
      const durationSeconds = Math.round((k.end - k.start) / 1000);
      if (durationSeconds <= 0) continue;
      out.push({ ...k.ev, ts: k.start, endTs: k.end, durationSeconds });
    }
  }
  return out.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
}