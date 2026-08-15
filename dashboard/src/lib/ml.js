import Papa from 'papaparse';
import { CATEGORY_WEIGHTS } from './categories.js';
import { dayKey } from './stats.js';

export const ML_COLUMNS = [
  'id',
  'ts',
  'ts_iso',
  'day_key',
  'day_of_week',
  'is_weekend',
  'hour',
  'minute',
  'day_segment',
  'duration_seconds',
  'duration_minutes',
  'domain',
  'path',
  'title',
  'category',
  'is_productive',
  'event_type',
  'device',
  'nth_event_of_day',
  'gap_seconds',
  'prev_category',
  'prev_duration_minutes',
];

export function daySegment(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

export function engineerFeatures(events) {
  const sorted = (events || [])
    .filter((ev) => (Number(ev.durationSeconds) || 0) > 0 && Number(ev.ts))
    .sort((a, b) => a.ts - b.ts);

  const perDay = {};
  let prev = null;

  return sorted.map((ev) => {
    const d = new Date(ev.ts);
    const dk = dayKey(ev.ts);
    perDay[dk] = (perDay[dk] || 0) + 1;
    const gap = prev ? Math.max(0, Math.round((ev.ts - prev.ts) / 1000)) : 0;
    const row = {
      id: ev.id,
      ts: ev.ts,
      ts_iso: d.toISOString(),
      day_key: dk,
      day_of_week: d.getDay(),
      is_weekend: d.getDay() === 0 || d.getDay() === 6 ? 1 : 0,
      hour: d.getHours(),
      minute: d.getMinutes(),
      day_segment: daySegment(d.getHours()),
      duration_seconds: Math.round(ev.durationSeconds),
      duration_minutes: Math.round(ev.durationSeconds / 60),
      domain: ev.domain || '',
      path: ev.path || '',
      title: ev.title || '',
      category: ev.category || 'Other',
      is_productive: (CATEGORY_WEIGHTS[ev.category] ?? 0) >= 0.8 ? 1 : 0,
      event_type: ev.eventType || 'tab_active',
      device: ev.device || 'extension',
      nth_event_of_day: perDay[dk],
      gap_seconds: gap,
      prev_category: prev ? prev.category : '',
      prev_duration_minutes: prev ? Math.round(prev.durationMinutes) : 0,
    };
    prev = { ts: ev.ts, category: row.category, durationMinutes: row.duration_minutes };
    return row;
  });
}

export function splitMLRows(rows, { trainPct = 0.7, valPct = 0.15 } = {}) {
  const testPct = 1 - trainPct - valPct;
  if (testPct < 0 || testPct > 1) throw new Error('trainPct + valPct must be <= 1');
  const n = rows.length;
  const trainEnd = Math.floor(n * trainPct);
  const valEnd = trainEnd + Math.floor(n * valPct);
  return {
    train: rows.slice(0, trainEnd),
    val: rows.slice(trainEnd, valEnd),
    test: rows.slice(valEnd),
  };
}

export function classDistribution(rows) {
  const dist = {};
  for (const r of rows) dist[r.category] = (dist[r.category] || 0) + 1;
  return dist;
}

export function mlManifest(rows, split, range) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: Date.now(),
      range,
      description:
        'LifeLensIQ ML-ready dataset. Rows are chronologically ordered activity sessions; splits are chronological ' +
        '(no random shuffle) to avoid temporal leakage. Use train.csv to fit, val.csv to tune, test.csv for final evaluation.',
      totalRows: rows.length,
      counts: {
        train: split.train.length,
        val: split.val.length,
        test: split.test.length,
      },
      trainRatio: (split.train.length / rows.length).toFixed(3),
      valRatio: (split.val.length / rows.length).toFixed(3),
      testRatio: (split.test.length / rows.length).toFixed(3),
      classDistribution: {
        train: classDistribution(split.train),
        val: classDistribution(split.val),
        test: classDistribution(split.test),
      },
      columns: {
        target_columns: ['category', 'is_productive'],
        feature_columns: [
          'day_of_week',
          'is_weekend',
          'hour',
          'minute',
          'day_segment',
          'duration_seconds',
          'domain',
          'path',
          'is_productive',
          'event_type',
          'nth_event_of_day',
          'gap_seconds',
          'prev_category',
          'prev_duration_minutes',
        ],
        all: ML_COLUMNS,
      },
    },
    null,
    2
  );
}

export function rowsToCSV(rows) {
  return Papa.unparse({ fields: ML_COLUMNS, data: rows });
}

export function buildMLDataset(events, range) {
  const rows = engineerFeatures(events);
  const split = splitMLRows(rows);
  return {
    rows,
    split,
    manifest: mlManifest(rows, split, range),
    trainCSV: rowsToCSV(split.train),
    valCSV: rowsToCSV(split.val),
    testCSV: rowsToCSV(split.test),
  };
}

export function predictFocusWindow(events, { trainDays = 14, windowHours = 3, now = Date.now() } = {}) {
  const rows = engineerFeatures(events).filter(
    (r) => r.ts >= now - trainDays * 86400000
  );
  if (rows.length < 7) return null;
  const hourly = new Array(24).fill(0);
  for (const r of rows) {
    hourly[r.hour] += r.duration_seconds * (CATEGORY_WEIGHTS[r.category] ?? 0.2);
  }
  let best = { start: 0, score: 0 };
  for (let h = 0; h <= 24 - windowHours; h++) {
    let score = 0;
    for (let k = 0; k < windowHours; k++) score += hourly[h + k];
    if (score > best.score) best = { start: h, score };
  }
  if (best.score <= 0) return null;
  return {
    start: best.start,
    end: best.start + windowHours,
    score: Math.round(best.score / 60),
    trainDays,
    rows: rows.length,
    confidence: Math.min(100, Math.round((best.score / hourly.reduce((a, s) => a + s, 1)) * 100)),
  };
}