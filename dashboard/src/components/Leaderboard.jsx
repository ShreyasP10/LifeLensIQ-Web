import { useEffect, useMemo, useState } from 'react';
import {
  db,
  auth,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
} from '../firebase.js';
import { aggregate, formatDuration, lastNDays, dayKey } from '../lib/stats.js';

export default function Leaderboard({ user, events }) {
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState('');
  const [sortBy, setSortBy] = useState('score');
  const [queryText, setQueryText] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'));
    const unsub = onSnapshot(q, (snap) => setRows(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const myScore = useMemo(() => {
    const weekKeys = lastNDays(7);
    const weekEvents = events.filter((e) => weekKeys.includes(dayKey(e.ts)));
    return aggregate(weekEvents);
  }, [events]);

  const visible = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => (r.displayName || '').toLowerCase().includes(q))
      : rows;
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'active') return (b.totalSeconds || 0) - (a.totalSeconds || 0);
      return (b.score || 0) - (a.score || 0);
    });
    return sorted;
  }, [rows, sortBy, queryText]);

  async function refreshMyScore() {
    const name = user.email ? user.email.split('@')[0] : 'anonymous';
    await setDoc(doc(db, 'leaderboard', user.uid), {
      displayName: name,
      score: myScore.score,
      totalSeconds: Math.round(myScore.totalSeconds),
      sampleDays: Object.keys(myScore.byDay).length,
      lastUpdated: Date.now(),
    });
    setSaved('Score published. It is visible to other users (score only).');
    setTimeout(() => setSaved(''), 3000);
  }

  return (
    <div className="panel">
      <h2>Leaderboard (score only)</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Opt-in. Publishing your score reveals nothing about your actual activity — just one number
        (0–100) computed from the last 7 days.
      </p>

      <div className="btn-row">
        <button onClick={refreshMyScore}>Publish my score ({myScore.score})</button>
        {saved && <span className="hint" style={{ alignSelf: 'center' }}>{saved}</span>}
      </div>

      <div className="filter-row" style={{ marginTop: 14 }}>
        <input
          className="search-input"
          type="search"
          placeholder="Search users…"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
        />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="score">Sort by score</option>
          <option value="active">Sort by active time</option>
        </select>
      </div>

      <table style={{ marginTop: 14 }}>
        <thead>
          <tr><th>#</th><th>User</th><th>Score</th><th>Active (7d)</th><th>Days with data</th></tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr key={r.uid} className={r.uid === user.uid ? 'now' : ''}>
              <td>{i + 1}</td>
              <td>{r.displayName} {r.uid === user.uid && <span className="tag">you</span>}</td>
              <td><b>{r.score}</b>/100</td>
              <td>{formatDuration(r.totalSeconds || 0)}</td>
              <td>{r.sampleDays ?? '—'}</td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr><td colSpan={5} className="muted">No scores published yet. Be the first.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}