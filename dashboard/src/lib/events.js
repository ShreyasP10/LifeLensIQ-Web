export const DEVICE_WEB = 'web';
export const SCHEMA_VERSION = 1;

export function makeEventId() {
  return crypto.randomUUID();
}

export function normalizeEvent(doc) {
  const ts = Number(doc.ts ?? doc.timestamp) || 0;
  const id = doc.id || doc.eventId || `ev-${ts}-${doc.domain || 'unknown'}`;
  const durationSeconds = Number(doc.durationSeconds) || 0;
  return {
    id,
    eventId: doc.eventId || doc.id || id,
    ts,
    timestamp: doc.timestamp ?? ts,
    endTs: Number(doc.endTs) || ts + durationSeconds * 1000,
    durationSeconds,
    category: doc.category || 'Other',
    domain: doc.domain || '',
    path: doc.path || '',
    title: doc.title || '',
    eventType: doc.eventType || 'tab_active',
    device: doc.device || DEVICE_WEB,
    schemaVersion: doc.schemaVersion ?? SCHEMA_VERSION,
    metadata: doc.metadata || {},
    userId: doc.userId || '',
  };
}

export function buildWebEvent({ ts, endTs, durationSeconds, domain, path, title, category, eventType, metadata = {}, userId, eventId: providedId }) {
  const eventId = providedId || makeEventId();
  return {
    id: eventId,
    eventId,
    userId,
    device: DEVICE_WEB,
    ts,
    timestamp: ts,
    endTs,
    durationSeconds,
    eventType,
    category,
    domain: domain || '',
    path: path || '',
    title: title || '',
    metadata,
    schemaVersion: SCHEMA_VERSION,
  };
}