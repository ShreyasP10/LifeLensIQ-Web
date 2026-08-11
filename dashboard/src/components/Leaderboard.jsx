import { useEffect, useMemo, useState } from 'react';
import { db, auth } from '../firebase.js';
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { aggregate, formatDuration, lastNDays, dayKey } from '../lib/stats.js';

export default function Leaderboard({ user, events }) {
  const [rows, setRows] = useState([]);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(25));
    const unsub = onSnapshot(q, (snap) => setRows(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))));
    return unsub;
  }, []);

  const myScore = useMemo(() => {
    const weekKeys = lastNDays(7);
    const weekEvents = events.filter((e) => weekKeys.includes(dayKey(e.ts)));
    return aggregate(weekEvents);
  }, [events]);

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

      <table style={{ marginTop: 14 }}>
        <thead>
          <tr><th>#</th><th>User</th><th>Score</th><th>Active (7d)</th><th>Days with data</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.uid} className={r.uid === user.uid ? 'now' : ''}>
              <td>{i + 1}</td>
              <td>{r.displayName} {r.uid === user.uid && <span className="tag">you</span>}</td>
              <td><b>{r.score}</b>/100</td>
              <td>{formatDuration(r.totalSeconds || 0)}</td>
              <td>{r.sampleDays ?? '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="muted">No scores published yet. Be the first.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
