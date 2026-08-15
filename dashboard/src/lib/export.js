import Papa from 'papaparse';
import { buildStatsReport } from './stats.js';

export const CSV_COLUMNS = [
  'id',
  'eventId',
  'userId',
  'ts',
  'timestamp',
  'endTs',
  'durationSeconds',
  'domain',
  'path',
  'title',
  'category',
  'eventType',
  'device',
  'schemaVersion',
  'metadata',
];

export function toCSV(events) {
  const rows = (events || []).map((ev) => ({
    id: ev.id,
    eventId: ev.eventId || ev.id || '',
    userId: ev.userId || '',
    ts: ev.ts,
    timestamp: ev.timestamp ?? ev.ts,
    endTs: ev.endTs,
    durationSeconds: ev.durationSeconds,
    domain: ev.domain,
    path: ev.path,
    title: ev.title,
    category: ev.category,
    eventType: ev.eventType,
    device: ev.device,
    schemaVersion: ev.schemaVersion,
    metadata: JSON.stringify(ev.metadata || {}),
  }));
  return Papa.unparse({ fields: CSV_COLUMNS, data: rows });
}

export function toRawJSON(events, range) {
  return JSON.stringify(
    {
      exportedAt: Date.now(),
      schemaVersion: 1,
      range,
      count: events.length,
      events,
    },
    null,
    2
  );
}

export function toStatsJSON(events, range) {
  return JSON.stringify(buildStatsReport(events, range), null, 2);
}

export function downloadBlob(content, filename, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
