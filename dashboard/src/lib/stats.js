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
  const s = Math.round(seconds);
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
    shortsSeconds: 0,
    writingSeconds: 0,
    pdfSeconds: 0,
    activeSeconds: 0,
  };

  for (const ev of events || []) {
    const dur = Number(ev.durationSeconds) || 0;
    if (dur <= 0) continue;
    const category = ev.category || 'Other';
    total.count += 1;
    total.totalSeconds += dur;
    total.byCategory[category] = (total.byCategory[category] || 0) + dur;
    if (ev.domain) {
      total.byDomain[ev.domain] = (total.byDomain[ev.domain] || 0) + dur;
    }
    const dk = dayKey(ev.ts);
    total.byDay[dk] = (total.byDay[dk] || 0) + dur;
    if (ev.eventType === 'short_video') total.shortsSeconds += dur;
    if (ev.eventType === 'writing_session') total.writingSeconds += dur;
    if (ev.eventType === 'pdf_view') total.pdfSeconds += dur;
    if (ev.eventType === 'tab_active') total.activeSeconds += dur;
  }

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
