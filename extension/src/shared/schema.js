export const SCHEMA_VERSION = 1;
export const DEVICE_EXTENSION = 'web';

export function makeEventId() {
  return crypto.randomUUID();
}

export function buildEvent(session) {
  const durationSeconds = Math.max(1, Math.round((session.lastTs - session.startTs) / 1000));
  return {
    id: session.eventId,
    eventId: session.eventId,
    userId: session.userId || '',
    ts: session.startTs,
    timestamp: session.startTs,
    endTs: session.lastTs,
    durationSeconds,
    domain: session.domain || '',
    path: session.path || '',
    title: session.title || session.domain || '',
    category: session.category,
    eventType: session.eventType || 'tab_active',
    metadata: buildMetadata(session),
    device: DEVICE_EXTENSION,
    schemaVersion: SCHEMA_VERSION,
  };
}

function buildMetadata(session) {
  const m = {};
  if (session.eventType === 'short_video') {
    m.views = session.shorts?.views ?? 0;
    m.seconds = session.shorts?.seconds ?? 0;
  }
  if (session.eventType === 'writing_session' && (session.typingBursts || 0) > 0) {
    m.typingBursts = session.typingBursts;
  }
  if (session.eventType === 'pdf_view') {
    m.pdf = true;
  }
  return m;
}
