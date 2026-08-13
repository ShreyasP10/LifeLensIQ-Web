import { aggregate, dayKey, formatDuration, pctChange, topEntries, focusStreak, lastNDays, comparePeriods } from './stats.js';
import {
  CATEGORY_WEIGHTS,
  isDistractingCategory,
} from './categories.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const m = h % 12 || 12;
  return `${m} ${h < 12 ? 'AM' : 'PM'}`;
});

function productiveWeightedByWeekday(events) {
  const scores = {};
  for (const ev of events || []) {
    const d = new Date(ev.ts);
    const w = d.getDay();
    scores[w] =
      (scores[w] || 0) +
      Number(ev.durationSeconds) * (CATEGORY_WEIGHTS[ev.category] ?? 0.2);
  }
  return scores;
}

export function buildInsights(events, days = 7, now = Date.now()) {
  const valid = (events || []).filter((ev) => (Number(ev.durationSeconds) || 0) > 0);
  if (valid.length === 0) return [];

  const rangeKeys = new Set(lastNDays(days, now));
  const inRange = valid.filter((ev) => rangeKeys.has(dayKey(ev.ts)));
  if (inRange.length === 0) return [];

  const { current: cur, previous: prev } = comparePeriods(valid, days, now);
  const out = [];

  const topDomain = topEntries(cur.byDomain, 1)[0];
  if (topDomain) {
    const prevSeconds = prev.byDomain[topDomain.name] || 0;
    const change = pctChange(topDomain.seconds, prevSeconds);
    out.push({
      kind: change === null || change >= 0 ? 'up' : 'down',
      change,
      title:
        change === null
          ? `${topDomain.name} — new this period`
          : `${topDomain.name} is your top site`,
      detail: `${formatDuration(topDomain.seconds)} spent${
        change === null ? '' : ` (${change >= 0 ? '+' : ''}${change}% vs previous ${days}d)`
      }`,
    });
  }

  const weekdayScores = productiveWeightedByWeekday(inRange);
  const entries = Object.entries(weekdayScores);
  if (entries.length > 0) {
    const best = entries.sort((a, b) => b[1] - a[1])[0];
    const worst = [...entries].sort((a, b) => a[1] - b[1])[0];
    out.push({
      kind: 'info',
      title: `${WEEKDAYS[Number(best[0])]} is your most productive weekday`,
      detail:
        entries.length > 1
          ? `${WEEKDAYS[Number(worst[0])]} is the weakest (productive-weighted time)`
          : 'Only one weekday with activity so far',
    });
  }

  const peakHour = Object.entries(cur.byHour).sort((a, b) => b[1] - a[1])[0];
  if (peakHour) {
    out.push({
      kind: 'info',
      title: `Peak screen time around ${HOUR_LABELS[Number(peakHour[0])]}`,
      detail: `${formatDuration(peakHour[1])} across the period`,
    });
  }

  const nightSeconds = inRange
    .filter((ev) => {
      const h = new Date(ev.ts).getHours();
      return h >= 23 || h < 6;
    })
    .reduce((a, ev) => a + Number(ev.durationSeconds), 0);
  if (nightSeconds > 0) {
    out.push({
      kind: nightSeconds > cur.totalSeconds * 0.15 ? 'down' : 'info',
      title: 'Late-night usage detected',
      detail: `${formatDuration(nightSeconds)} between 11 PM and 6 AM`,
    });
  }

  const distracting = Object.entries(cur.byCategory)
    .filter(([c]) => isDistractingCategory(c))
    .reduce((a, [, s]) => a + s, 0);
  const distractPct = cur.totalSeconds > 0 ? Math.round((distracting / cur.totalSeconds) * 100) : 0;
  if (distracting > 0) {
    out.push({
      kind: distractPct >= 30 ? 'down' : 'info',
      title: `${formatDuration(distracting)} on distracting sites`,
      detail: `${distractPct}% of screen time (Entertainment / Timepass / Short-form)`,
    });
  }

  out.push({
    kind: 'info',
    title: `Daily average ${formatDuration(Math.round(cur.totalSeconds / days))}`,
    detail: `${formatDuration(cur.totalSeconds)} over ${days} days`,
  });

  const streak = focusStreak(valid, now);
  if (streak > 0) {
    out.push({
      kind: 'up',
      title: `${streak}-day activity streak`,
      detail: streak === 1 ? 'Logged again today to keep it alive' : 'Keep the momentum going',
    });
  }

  const todaySeconds = aggregate(
    inRange.filter((ev) => dayKey(ev.ts) === dayKey(now))
  ).totalSeconds;
  const avgPrev = prev.totalSeconds / days;
  const todayChange = pctChange(todaySeconds, avgPrev);
  if (todaySeconds > 0 && todayChange !== null) {
    out.push({
      kind: todayChange >= 0 ? 'up' : 'down',
      change: todayChange,
      title: `Today vs your ${days}-day average`,
      detail: `${formatDuration(todaySeconds)} so far (${todayChange >= 0 ? '+' : ''}${todayChange}%)`,
    });
  }

  return out.slice(0, 8);
}