import { describe, it, expect } from 'vitest';
import { normalizeEvent, buildWebEvent, makeEventId } from '../events.js';

describe('normalizeEvent', () => {
  it('accepts the Android app envelope (eventId/timestamp keys)', () => {
    const appEvent = {
      id: 'ev-1',
      eventId: 'ev-1',
      userId: 'u1',
      device: 'android',
      ts: 1700000000000,
      timestamp: 1700000000000,
      endTs: 1700000360000,
      durationSeconds: 360,
      domain: 'com.example.app',
      path: 'com.example.app',
      title: 'App Label',
      category: 'Study',
      eventType: 'APP_SESSION',
      metadata: { packageName: 'com.example.app', durationMs: 360000 },
      schemaVersion: 1,
    };
    const n = normalizeEvent(appEvent);
    expect(n.id).toBe('ev-1');
    expect(n.eventId).toBe('ev-1');
    expect(n.ts).toBe(1700000000000);
    expect(n.timestamp).toBe(1700000000000);
    expect(n.device).toBe('android');
    expect(n.category).toBe('Study');
  });

  it('accepts legacy web/extension shape (id/ts only) and synthesises missing keys', () => {
    const legacy = {
      id: 'x1',
      ts: 1700000000000,
      durationSeconds: 60,
      category: 'Development',
      eventType: 'tab_active',
    };
    const n = normalizeEvent(legacy);
    expect(n.eventId).toBe('x1');
    expect(n.timestamp).toBe(1700000000000);
    expect(n.endTs).toBe(1700000000000 + 60000);
    expect(n.device).toBe('web');
    expect(n.domain).toBe('');
    expect(n.metadata).toEqual({});
  });

  it('tolerates null domain, empty metadata and title == path', () => {
    const n = normalizeEvent({
      id: 'y',
      eventId: 'y',
      ts: 1,
      timestamp: 1,
      durationSeconds: 10,
      domain: null,
      path: '/x',
      title: '/x',
      category: 'Other',
      eventType: 'SCREEN_ON',
      metadata: {},
    });
    expect(n.domain).toBe('');
    expect(n.title).toBe('/x');
    expect(n.metadata).toEqual({});
  });

  it('handles missing timestamps (ts=0 stays 0, duration kept)', () => {
    const n = normalizeEvent({ id: 'z', durationSeconds: 30, category: 'Study' });
    expect(n.ts).toBe(0);
    expect(n.endTs).toBe(30000);
    expect(n.durationSeconds).toBe(30);
  });
});

describe('buildWebEvent', () => {
  it('emits the full app-compatible envelope with device web', () => {
    const ev = buildWebEvent({
      eventId: 'fixed-id',
      userId: 'u1',
      ts: 1000,
      endTs: 4000,
      durationSeconds: 3,
      domain: 'offline-study',
      title: 'ML revision',
      category: 'Study',
      eventType: 'STUDY_SESSION',
      metadata: { subject: 'ML' },
    });
    expect(ev.id).toBe('fixed-id');
    expect(ev.eventId).toBe('fixed-id');
    expect(ev.device).toBe('web');
    expect(ev.ts).toBe(1000);
    expect(ev.timestamp).toBe(1000);
    expect(ev.schemaVersion).toBe(1);
    expect(ev.userId).toBe('u1');
    expect(ev.metadata.subject).toBe('ML');
  });

  it('generates a uuid eventId when not provided', () => {
    const ev = buildWebEvent({ ts: 1, endTs: 2, durationSeconds: 1, category: 'Other' });
    expect(ev.id).toBe(ev.eventId);
    expect(typeof ev.eventId).toBe('string');
    expect(ev.eventId.length).toBeGreaterThan(8);
  });

  it('makeEventId returns unique values', () => {
    expect(makeEventId()).not.toBe(makeEventId());
  });
});
describe('deviceId and category normalization', () => {
  it('keeps deviceId and normalizes unknown categories to Other', () => {
    const n = normalizeEvent({
      id: 'd1',
      eventId: 'd1',
      ts: 1,
      timestamp: 1,
      durationSeconds: 10,
      device: 'android',
      deviceId: 'abc-123',
      category: 'SomeNewAppCategory',
      eventType: 'APP_SESSION',
    });
    expect(n.deviceId).toBe('abc-123');
    expect(n.category).toBe('Other');
  });

  it('defaults deviceId to web for web events', () => {
    const n = normalizeEvent({ id: 'w', ts: 1, durationSeconds: 10, device: 'web' });
    expect(n.deviceId).toBe('web');
  });

  it('buildWebEvent stamps deviceId web', () => {
    const ev = buildWebEvent({ ts: 1, endTs: 2, durationSeconds: 1, category: 'Study' });
    expect(ev.deviceId).toBe('web');
  });
});
