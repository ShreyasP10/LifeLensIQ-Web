import { describe, it, expect } from 'vitest';
import { toCSV, toRawJSON, toStatsJSON, CSV_COLUMNS } from '../export.js';

const events = [
  {
    id: 'e1',
    ts: 1700000000000,
    endTs: 1700000360000,
    durationSeconds: 360,
    domain: 'youtube.com',
    path: '/shorts/x',
    title: 'A short',
    category: 'Short-form Video',
    eventType: 'short_video',
    device: 'extension',
    schemaVersion: 1,
    metadata: { views: 12 },
  },
  {
    id: 'e2',
    ts: 1700000400000,
    endTs: 1700000760000,
    durationSeconds: 360,
    domain: 'github.com',
    path: '/',
    title: 'Repo',
    category: 'Development',
    eventType: 'tab_active',
    device: 'extension',
    schemaVersion: 1,
    metadata: {},
  },
];

describe('toCSV', () => {
  it('produces a CSV with the documented columns', () => {
    const csv = toCSV(events);
    const lines = csv.trim().split(/\r?\n/);
    const header = lines[0].split(',');
    expect(header).toEqual(CSV_COLUMNS);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('e1');
    expect(lines[1]).toContain('Short-form Video');
  });

  it('serialises metadata as quoted JSON (Papa quotes + escapes)', () => {
    const csv = toCSV(events);
    expect(csv).toContain('"{""views"":12}"');
  });

  it('handles empty input', () => {
    expect(toCSV([]).trim().split('\n')).toHaveLength(1);
  });
});

describe('toRawJSON', () => {
  it('embeds range, count and events', () => {
    const parsed = JSON.parse(toRawJSON(events, { from: 'a', to: 'b' }));
    expect(parsed.count).toBe(2);
    expect(parsed.range).toEqual({ from: 'a', to: 'b' });
    expect(parsed.events[0].id).toBe('e1');
    expect(parsed.schemaVersion).toBe(1);
  });
});

describe('toStatsJSON', () => {
  it('includes ML-ready aggregates', () => {
    const parsed = JSON.parse(toStatsJSON(events, { from: 'a', to: 'b' }));
    expect(parsed.totals.count).toBe(2);
    expect(parsed.totals.totalSeconds).toBe(720);
    expect(parsed.totals.shortsSeconds).toBe(360);
    expect(parsed.byCategory['Short-form Video']).toBe(360);
    expect(parsed.byDomain['github.com']).toBe(360);
    expect(parsed.byHour[new Date(1700000000000).getHours()]).toBe(720);
    expect(parsed.topDomains[0].name).toBe('youtube.com');
    expect(parsed.categoryMetrics.Development.productiveSeconds).toBe(360);
  });
});