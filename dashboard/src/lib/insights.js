import { aggregate, dayKey, formatDuration, pctChange, topEntries, focusStreak, lastNDays, comparePeriods } from './stats.js';
import {
  CATEGORY_WEIGHTS,
  isProductiveCategory,
  isDistractingCategory,
} from './categories.js';
import { minutesFromHHMM } from './timetable.js';

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

export function domainTransitions(events, days, now = Date.now(), gapMaxMinutes = 10, top = 3) {
  const rangeKeys = new Set(lastNDays(days, now));
  const sorted = (events || [])
    .filter(
      (ev) =>
        (Number(ev.durationSeconds) || 0) > 0 &&
        ev.domain &&
        rangeKeys.has(dayKey(ev.ts))
    )
    .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  const counts = new Map();
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const gap = (Number(b.ts) || 0) - (Number(a.endTs) || Number(a.ts) || 0);
    if (gap > gapMaxMinutes * 60000) continue;
    if (!a.domain || !b.domain || a.domain === b.domain) continue;
    const key = `${a.domain}|${b.domain}`;
    const rec = counts.get(key) || { count: 0, totalGap: 0 };
    rec.count += 1;
    rec.totalGap += gap;
    counts.set(key, rec);
  }
  return [...counts.entries()]
    .map(([key, rec]) => {
      const [from, to] = key.split('|');
      return { from, to, count: rec.count, avgGapMs: rec.totalGap / rec.count };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, top);
}

function classSlotMinutes(timetable, weekday) {
  const entries = timetable?.entries || [];
  return entries
    .filter((e) => e.day === WEEKDAYS[weekday])
    .map((e) => [minutesFromHHMM(e.startTime), minutesFromHHMM(e.endTime)])
    .filter(([s, e]) => e > s);
}

function overlapMinutes(startMs, seconds, slots) {
  if (!slots || slots.length === 0 || !startMs) return 0;
  const d = new Date(startMs);
  const startMin = d.getHours() * 60 + d.getMinutes();
  const endMin = startMin + seconds / 60;
  let total = 0;
  for (const [s, e] of slots) {
    total += Math.max(0, Math.min(endMin, e) - Math.max(startMin, s));
  }
  return total;
}

export function detectAnomalies(events, now = Date.now(), opts = {}) {
  const out = [];
  const keys = new Set(lastNDays(7, now));
  const recent = (events || []).filter((ev) => keys.has(dayKey(ev.ts)));

  const nightMinutes =
    recent
      .filter((ev) => {
        const h = new Date(Number(ev.ts) || 0).getHours();
        return h >= 2 && h < 5;
      })
      .reduce((a, ev) => a + (Number(ev.durationSeconds) || 0), 0) / 60;
  if (nightMinutes >= 15) {
    out.push({
      kind: 'down',
      title: 'Late-night screen time (2–5 AM)',
      detail: `${Math.round(nightMinutes)} min in the last 7 days — sleep is part of the recovery`,
      cost: nightMinutes,
      costMinutes: 0,
    });
  }

  const distracting = new Set(['Entertainment', 'Timepass', 'Short-form Video']);
  const sorted = [...recent].sort(
    (a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0)
  );
  let runStart = null;
  let runEnd = 0;
  let runSeconds = 0;
  const runCats = new Set();
  const runs = [];
  const finishRun = () => {
    if (runStart !== null && runSeconds >= 3 * 3600) {
      runs.push({ start: runStart, seconds: runSeconds, cats: [...runCats] });
    }
  };
  for (const ev of sorted) {
    const dur = Number(ev.durationSeconds) || 0;
    const ts = Number(ev.ts) || 0;
    if (dur <= 0) continue;
    if (!distracting.has(ev.category)) {
      finishRun();
      runStart = null;
      runSeconds = 0;
      runCats.clear();
      continue;
    }
    if (runStart === null) {
      runStart = ts;
      runEnd = ts + dur * 1000;
      runSeconds = dur;
      runCats.add(ev.category);
    } else if (ts - runEnd <= 5 * 60000) {
      runSeconds += dur;
      runEnd = Math.max(runEnd, ts + dur * 1000);
      runCats.add(ev.category);
    } else {
      finishRun();
      runStart = ts;
      runEnd = ts + dur * 1000;
      runSeconds = dur;
      runCats.clear();
      runCats.add(ev.category);
    }
  }
  finishRun();
  for (const run of runs) {
    const costMin = opts.timetable
      ? overlapMinutes(run.start, run.seconds, classSlotMinutes(opts.timetable, new Date(run.start).getDay()))
      : 0;
    out.push({
      kind: 'down',
      title: `${formatDuration(run.seconds)} of uninterrupted distraction`,
      detail: `One stretch of ${run.cats.join(' / ')} without a 5-min break${
        costMin > 0 ? ` · ~${Math.round(costMin)} min during scheduled classes` : ''
      }`,
      cost: run.seconds,
      costMinutes: costMin,
    });
  }
  if (opts.timetable) {
    out.sort((a, b) => (b.costMinutes || 0) - (a.costMinutes || 0) || (b.cost || 0) - (a.cost || 0));
  }
  return out.slice(0, 4);
}

export function buildCorrelations(events, days = 30, now = Date.now()) {
  const keys = new Set(lastNDays(days, now));
  const perDay = new Map();
  for (const ev of events || []) {
    const dur = Number(ev.durationSeconds) || 0;
    const ts = Number(ev.ts) || 0;
    if (dur <= 0 || !keys.has(dayKey(ts))) continue;
    const key = dayKey(ts);
    const rec =
      perDay.get(key) || { morningDistraction: 0, lateNight: 0, morningStudy: 0, productive: 0 };
    const h = new Date(ts).getHours();
    const distract = isDistractingCategory(ev.category);
    if (h >= 6 && h < 12 && distract) rec.morningDistraction += dur;
    if (h >= 23 || h < 3) rec.lateNight += dur;
    if (h >= 6 && h < 12 && isProductiveCategory(ev.category)) rec.morningStudy += dur;
    rec.productive += dur * (CATEGORY_WEIGHTS[ev.category] ?? 0.2);
    perDay.set(key, rec);
  }
  if (perDay.size < 6) return [];
  const defs = [
    {
      signal: 'morningDistraction',
      label: 'Days with 20+ min of morning distraction',
      threshold: 20 * 60,
      positiveTrigger: false,
    },
    {
      signal: 'lateNight',
      label: 'Days with 45+ min of late-night use',
      threshold: 45 * 60,
      positiveTrigger: false,
    },
    {
      signal: 'morningStudy',
      label: 'Days with 60+ min of morning study',
      threshold: 60 * 60,
      positiveTrigger: true,
    },
  ];
  const out = [];
  for (const def of defs) {
    const high = [];
    const low = [];
    for (const rec of perDay.values()) {
      (rec[def.signal] >= def.threshold ? high : low).push(rec.productive);
    }
    if (high.length < 2 || low.length < 2) continue;
    const mean = (arr) => arr.reduce((a, v) => a + v, 0) / arr.length;
    const meanHigh = mean(high);
    const meanLow = mean(low);
    if (meanLow <= 0) continue;
    const pct = Math.round(((meanHigh - meanLow) / meanLow) * 100);
    if (Math.abs(pct) < 10) continue;
    const kind = def.positiveTrigger
      ? pct > 0
        ? 'up'
        : 'down'
      : pct < 0
        ? 'down'
        : 'info';
    out.push({
      kind,
      pct,
      title: `${def.label} → ${pct > 0 ? '+' : ''}${pct}% productive time`,
      detail: `Avg ${formatDuration(meanHigh)} vs ${formatDuration(meanLow)} on other days · ${high.length} days vs ${low.length} days`,
    });
  }
  return out.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 3);
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

  const studySeconds = Object.entries(cur.byCategory)
    .filter(([c]) => isProductiveCategory(c))
    .reduce((a, [, s]) => a + s, 0);
  if (cur.shortsSeconds > 0 && studySeconds > 0) {
    const ratio = cur.shortsSeconds / studySeconds;
    out.push({
      kind: ratio > 1 ? 'down' : 'up',
      title: `Shorts : Study = ${ratio.toFixed(1)} : 1`,
      detail: `${formatDuration(cur.shortsSeconds)} Shorts vs ${formatDuration(studySeconds)} productive time this period`,
    });
  }

  const transitions = domainTransitions(inRange, days, now);
  if (transitions.length > 0) {
    const t = transitions[0];
    out.push({
      kind: 'info',
      title: `After ${t.from} you usually switch to ${t.to}`,
      detail: `${t.count}× in the last ${days}d, typically within ${Math.max(1, Math.round(t.avgGapMs / 60000))} min`,
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