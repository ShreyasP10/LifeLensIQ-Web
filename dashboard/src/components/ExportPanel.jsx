import { useState } from 'react';
import { db } from '../firebase.js';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { toCSV, toRawJSON, toStatsJSON, downloadBlob } from '../lib/export.js';
import { pad } from '../lib/stats.js';

const MAX_FETCH = 20000;

export default function ExportPanel({ user }) {
  const [from, setFrom] = useState(defaultRange()[0]);
  const [to, setTo] = useState(defaultRange()[1]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  function defaultRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return [toDateStr(start), toDateStr(end)];
  }

  function toDateStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async function fetchRange() {
    const fromTs = new Date(`${from}T00:00:00`).getTime();
    const toTs = new Date(`${to}T23:59:59.999`).getTime();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const q = query(
        collection(db, 'users', user.uid, 'events'),
        where('ts', '>=', fromTs),
        where('ts', '<=', toTs),
        orderBy('ts', 'desc'),
        limit(MAX_FETCH)
      );
      const snap = await getDocs(q);
      const events = snap.docs.map((d) => d.data());
      setResult({ events, range: { from, to }, truncated: events.length === MAX_FETCH });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function ensureData() {
    if (!result) await fetchRange();
    return result;
  }

  async function exportCSV() {
    const r = await ensureData();
    if (!r) return;
    downloadBlob(toCSV(r.events), `lifeiq-events-${r.range.from}_${r.range.to}.csv`, 'text/csv');
  }

  async function exportJSON() {
    const r = await ensureData();
    if (!r) return;
    downloadBlob(toRawJSON(r.events, r.range), `lifeiq-events-${r.range.from}_${r.range.to}.json`, 'application/json');
  }

  async function exportStats() {
    const r = await ensureData();
    if (!r) return;
    downloadBlob(toStatsJSON(r.events, r.range), `lifeiq-stats-${r.range.from}_${r.range.to}.json`, 'application/json');
  }

  return (
    <div className="panel">
      <h2>Export Data (for your ML pipeline)</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Raw events export directly to CSV/JSON with epoch-ms (UTC) timestamps — ready for
        <code> pandas.read_csv()</code>. See <code>docs/09_Firestore_Schema.md §7</code>.
      </p>

      <div className="form-row">
        <div className="field">
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="secondary" onClick={fetchRange} disabled={busy}>
          {busy ? 'Loading…' : 'Count records'}
        </button>
      </div>

      {result && (
        <p className="hint">
          {result.events.length} events{result.truncated ? ` (truncated at ${MAX_FETCH})` : ''} in range.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="btn-row">
        <button onClick={exportCSV} disabled={busy}>Download CSV (raw events)</button>
        <button onClick={exportJSON} disabled={busy}>Download JSON (raw events)</button>
        <button onClick={exportStats} disabled={busy}>Download JSON (aggregated stats)</button>
      </div>
      <p className="hint">
        Note: if a date range query fails, create the suggested composite index (ts asc, ts desc)
        in the Firebase console — the link appears in the error.
      </p>
    </div>
  );
}
