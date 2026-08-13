import { useState } from 'react';
import { db, doc, setDoc } from '../firebase.js';
import { CATEGORY_KEYS, CATEGORIES } from '../lib/categories.js';
import { pad } from '../lib/stats.js';

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

    const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setBusy(true);
    try {
      await setDoc(doc(db, 'users', user.uid, 'events', id), {
        id,
        ts,
        endTs: ts + min * 60000,
        durationSeconds: min * 60,
        domain: d,
        path: '/manual',
        title: title.trim() || `Manual — ${d}`,
        category,
        eventType: 'manual',
        device: 'manual',
        schemaVersion: 1,
        metadata: { source: 'manual-entry' },
      });
      flash(`${d} · ${min} min logged. It appears in Overview, Timeline and ML exports instantly.`);
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
        These events flow into every dashboard view and the ML dataset export, tagged{' '}
        <code>eventType = "manual"</code>.
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