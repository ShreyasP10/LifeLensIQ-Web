import { useState } from 'react';
import { db, doc, setDoc } from '../firebase.js';
import { CATEGORY_KEYS, CATEGORIES } from '../lib/categories.js';
import { pad } from '../lib/stats.js';
import { buildWebEvent, makeEventId } from '../lib/events.js';

const EVENT_TYPES = ['STUDY_SESSION', 'APP_SESSION', 'manual'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ManualEntry({ user }) {
  const [date, setDate] = useState(todayStr());
  const [startTime, setStartTime] = useState('10:00');
  const [minutes, setMinutes] = useState('30');
  const [domain, setDomain] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES.STUDY);
  const [eventType, setEventType] = useState(EVENT_TYPES[0]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  function flash(msg, ok = true) {
    setStatus({ msg, ok });
    setTimeout(() => setStatus(null), 4000);
  }

  async function save() {
    const d = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    const min = Number(minutes);
    if (!d) return flash('Domain is required.', false);
    if (!min || min <= 0) return flash('Duration must be a positive number of minutes.', false);
    if (!date || !startTime) return flash('Date and start time are required.', false);

    const ts = new Date(`${date}T${startTime}`).getTime();
    if (Number.isNaN(ts)) return flash('Invalid date or time.', false);

    const endTs = ts + min * 60000;
    const name = title.trim() || `Manual — ${d}`;
    const metadata =
      eventType === 'STUDY_SESSION'
        ? { subject: title.trim() || d, startedAt: ts, endedAt: endTs, durationMs: min * 60000, locationType: 'web' }
        : { source: 'manual-entry' };

    setBusy(true);
    try {
      const eventId = makeEventId();
      await setDoc(
        doc(db, 'users', user.uid, 'events', eventId),
        buildWebEvent({
          eventId,
          ts,
          endTs,
          durationSeconds: min * 60,
          domain: d,
          path: eventType === 'STUDY_SESSION' ? '/manual/study' : '/manual',
          title: name,
          category,
          eventType,
          metadata,
          userId: user.uid,
        })
      );
      flash(
        `${d} · ${min} min logged as ${eventType}. Appears in Overview, Timeline, ML exports — and the Android app after its next sync (≤15 min).`
      );
      setDomain('');
      setTitle('');
    } catch (err) {
      flash(err.message, false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Manual Entry</h2>
      <p className="muted" style={{ marginBottom: 14 }}>
        Log activities the extension cannot see (mobile, offline study, phone calls, real life).
        Written to the same <code>users/&#123;uid&#125;/events</code> collection as the Android app —
        pick <b>Study session</b> and it counts in both calendars. Events are upserted by{' '}
        <code>eventId</code> (idempotent, no duplicates).
      </p>

      <div className="form-row">
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Start time</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="field">
          <label>Duration (minutes)</label>
          <input
            type="number"
            min="1"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            style={{ width: 110 }}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label>Domain (e.g. offline-study, phone-call, gym)</label>
          <input
            placeholder="e.g. offline-study"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 2, minWidth: 260 }}>
          <label>Title / description (optional)</label>
          <input
            placeholder="e.g. ML notes revision — offline"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Event type</label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_KEYS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 0 }}>
        <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Log entry'}</button>
      </div>

      {status && (
        <p className="hint" style={{ color: status.ok ? 'var(--ok)' : 'var(--danger)' }}>
          {status.msg}
        </p>
      )}
    </div>
  );
}