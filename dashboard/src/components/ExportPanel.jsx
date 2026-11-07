import { useState } from 'react';
import {
  db,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
} from '../firebase.js';
import { toCSV, toRawJSON, toStatsJSON, downloadBlob } from '../lib/export.js';
import { buildMLDataset } from '../lib/ml.js';
import { pad } from '../lib/stats.js';

const PAGE = 1000;
const MAX_TOTAL = 100000;

export default function ExportPanel({ user }) {
  const [from, setFrom] = useState(defaultRange()[0]);
  const [to, setTo] = useState(defaultRange()[1]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState('');
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

  async function fetchAll() {
    const fromTs = new Date(`${from}T00:00:00`).getTime();
    const toTs = new Date(`${to}T23:59:59.999`).getTime();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const out = [];
      let lastDoc = null;
      let page = 0;
      while (true) {
        page += 1;
        const constraints = [
          where('ts', '>=', fromTs),
          where('ts', '<=', toTs),
          orderBy('ts', 'desc'),
          limit(PAGE),
        ];
        if (lastDoc) constraints.push(startAfter(lastDoc));
        const snap = await getDocs(query(collection(db, 'users', user.uid, 'events'), ...constraints));
        if (snap.empty || snap.docs.length === 0) break;
        for (const d of snap.docs) {
          out.push(d.data());
        }
        lastDoc = snap.docs[snap.docs.length - 1];
        setProgress(`page ${page} · ${out.length} events…`);
        if (snap.docs.length < PAGE || out.length >= MAX_TOTAL) break;
      }
      setProgress('');
      setResult({ events: out, range: { from, to }, truncated: out.length >= MAX_TOTAL });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function ensureData() {
    if (!result) await fetchAll();
    return result;
  }

  async function exportCSV() {
    const r = await ensureData();
    if (!r) return;
    downloadBlob(toCSV(r.events), `lifelensiq-events-${r.range.from}_${r.range.to}.csv`, 'text/csv');
  }

  async function exportJSON() {
    const r = await ensureData();
    if (!r) return;
    downloadBlob(toRawJSON(r.events, r.range), `lifelensiq-events-${r.range.from}_${r.range.to}.json`, 'application/json');
  }

  async function exportStats() {
    const r = await ensureData();
    if (!r) return;
    downloadBlob(toStatsJSON(r.events, r.range), `lifelensiq-stats-${r.range.from}_${r.range.to}.json`, 'application/json');
  }

  async function exportML() {
    const r = await ensureData();
    if (!r) return;
    const ds = buildMLDataset(r.events, r.range);
    const base = `lifelensiq-ml-${r.range.from}_${r.range.to}`;
    const files = [
      [ds.trainCSV, `${base}-train.csv`, 'text/csv'],
      [ds.valCSV, `${base}-val.csv`, 'text/csv'],
      [ds.testCSV, `${base}-test.csv`, 'text/csv'],
      [ds.manifest, `${base}-manifest.json`, 'application/json'],
    ];
    for (const [content, name, mime] of files) {
      downloadBlob(content, name, mime);
      await new Promise((res) => setTimeout(res, 400));
    }
  }

  return (
    <div className="panel">
      <h2>Export data</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Save your records as files — open them in Excel or give them to any data program.
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
        <button className="secondary" onClick={fetchAll} disabled={busy}>
          {busy ? 'Fetching…' : result ? 'Get records again' : 'Get records'}
        </button>
      </div>

      {progress && (
        <div className="progress">
          <div className="progress-fill animate" />
          <span>{progress}</span>
        </div>
      )}

      {result && (
        <p className="hint">
          {result.events.length} records{result.truncated ? ' (stopped at 100,000 to stay fast)' : ''} in range.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="btn-row">
        <button onClick={exportCSV} disabled={busy}>Download spreadsheet (CSV)</button>
        <button onClick={exportJSON} disabled={busy}>Download data file (JSON)</button>
        <button onClick={exportStats} disabled={busy}>Download summary (JSON)</button>
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="secondary" onClick={exportML} disabled={busy}>
          Download study dataset (CSV files)
        </button>
      </div>
      <p className="hint">
        Study dataset: your records turned into ready-to-learn rows and split into three files for
        building or checking a personal prediction model.
      </p>
      <p className="hint">
        If nothing loads, follow the one-time setup link shown in the error message.
      </p>
    </div>
  );
}