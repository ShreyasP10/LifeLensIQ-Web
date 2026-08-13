import { describe, it, expect } from 'vitest';
import {
  ML_COLUMNS,
  daySegment,
  engineerFeatures,
  splitMLRows,
  classDistribution,
  mlManifest,
  rowsToCSV,
  buildMLDataset,
} from '../ml.js';

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

const base = new Date(2026, 7, 11, 10, 30).getTime(); // Tuesday

describe('daySegment', () => {
  it('maps hours to segments', () => {
    expect(daySegment(3)).toBe('night');
    expect(daySegment(8)).toBe('morning');
    expect(daySegment(14)).toBe('afternoon');
    expect(daySegment(20)).toBe('evening');
    expect(daySegment(23)).toBe('night');
  });
});

describe('engineerFeatures', () => {
  it('produces documented columns and sorts chronologically', () => {
    const events = [
      ev('late', base + 600000, 120, 'Timepass'),
      ev('early', base, 300, 'Study'),
    ];
    const rows = engineerFeatures(events);
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0]).sort()).toEqual([...ML_COLUMNS].sort());
    expect(rows[0].id).toBe('early');
    expect(rows[1].id).toBe('late');
    expect(rows[0].prev_category).toBe('');
    expect(rows[1].prev_category).toBe('Study');
  });

  it('engineers temporal features', () => {
    const rows = engineerFeatures([
      ev('a', base, 600, 'Study'),
      ev('b', base + 90000, 300, 'Development'),
    ]);
    expect(rows[0].day_of_week).toBe(2);
    expect(rows[0].is_weekend).toBe(0);
    expect(rows[0].hour).toBe(10);
    expect(rows[0].day_segment).toBe('morning');
    expect(rows[0].gap_seconds).toBe(0);
    expect(rows[1].gap_seconds).toBe(90);
    expect(rows[1].prev_duration_minutes).toBe(10);
    expect(rows[0].nth_event_of_day).toBe(1);
    expect(rows[1].nth_event_of_day).toBe(2);
  });

  it('flags productive categories and weekend days', () => {
    const sat = new Date(2026, 7, 8, 12).getTime();
    const rows = engineerFeatures([
      ev('a', sat, 100, 'Study'),
      ev('b', sat + 1000, 100, 'Entertainment'),
    ]);
    expect(rows[0].is_productive).toBe(1);
    expect(rows[0].is_weekend).toBe(1);
    expect(rows[1].is_productive).toBe(0);
  });

  it('skips zero/negative durations and missing timestamps', () => {
    const rows = engineerFeatures([
      ev('a', base, 0, 'Study'),
      ev('b', base + 1000, -5, 'Study'),
      { id: 'c', durationSeconds: 60, domain: 'x.com', category: 'Timepass' },
      ev('d', base + 2000, 60, 'Study'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('d');
  });
});

describe('splitMLRows', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({
    id: `e${i}`,
    ts: base + i * 60000,
    category: 'Study',
  }));

  it('splits chronologically into train/val/test without overlap', () => {
    const { train, val, test } = splitMLRows(rows);
    expect(train).toHaveLength(70);
    expect(val).toHaveLength(15);
    expect(test).toHaveLength(15);
    expect(new Set([...train, ...val, ...test]).size).toBe(100);
    expect(train[69].id).toBe('e69');
    expect(test[0].id).toBe('e85');
  });

  it('supports custom ratios', () => {
    const { train, val, test } = splitMLRows(rows, { trainPct: 0.6, valPct: 0.2 });
    expect(train).toHaveLength(60);
    expect(val).toHaveLength(20);
    expect(test).toHaveLength(20);
  });

  it('rejects ratios exceeding 1', () => {
    expect(() => splitMLRows(rows, { trainPct: 0.9, valPct: 0.2 })).toThrow();
  });

  it('handles empty input', () => {
    const s = splitMLRows([]);
    expect(s.train).toEqual([]);
    expect(s.val).toEqual([]);
    expect(s.test).toEqual([]);
  });
});

describe('classDistribution', () => {
  it('counts categories', () => {
    expect(
      classDistribution([
        { category: 'Study' },
        { category: 'Study' },
        { category: 'Timepass' },
      ])
    ).toEqual({ Study: 2, Timepass: 1 });
  });
});

describe('mlManifest / rowsToCSV / buildMLDataset', () => {
  const events = [
    ev('a', base, 600, 'Study'),
    ev('b', base + 600000, 300, 'Timepass'),
  ];

  it('serialises a schema manifest with split metadata', () => {
    const ds = buildMLDataset(events, { from: 'a', to: 'b' });
    const manifest = JSON.parse(ds.manifest);
    expect(manifest.totalRows).toBe(2);
    expect(manifest.range).toEqual({ from: 'a', to: 'b' });
    expect(manifest.counts.train + manifest.counts.val + manifest.counts.test).toBe(2);
    expect(manifest.columns.target_columns).toContain('category');
    expect(manifest.columns.feature_columns).toContain('prev_category');
    expect(manifest.classDistribution.train).toBeTruthy();
  });

  it('renders train/val/test CSVs with headers', () => {
    const ds = buildMLDataset(events, { from: 'a', to: 'b' });
    for (const csv of [ds.trainCSV, ds.valCSV, ds.testCSV]) {
      const lines = csv.trim().split(/\r?\n/);
      expect(lines[0].split(',')).toEqual(ML_COLUMNS);
    }
    expect(ds.trainCSV).toContain('Study');
  });

  it('rowsToCSV matches ML_COLUMNS header for arbitrary rows', () => {
    const csv = rowsToCSV([{ id: 'x', category: 'Study' }]);
    expect(csv.trim().split(/\r?\n/)[0].split(',')).toEqual(ML_COLUMNS);
  });
});