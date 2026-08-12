import { useState } from 'react';
import { db, doc, setDoc } from '../firebase.js';
import { normalizeTimetable, todayClasses, minutesFromHHMM, sampleTimetable } from '../lib/timetable.js';

export default function TimetablePage({ user, timetable }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  function parse() {
    setError('');
    try {
      const raw = JSON.parse(text);
      const entries = normalizeTimetable(raw);
      if (!entries.length) throw new Error('No entries found.');
      setParsed(entries);
    } catch (err) {
      setError(err.message);
      setParsed(null);
    }
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result));
      setParsed(null);
    };
    reader.readAsText(file);
  }

  async function save() {
    if (!parsed) return;
    setBusy(true);
    setError('');
    try {
      await setDoc(doc(db, 'users', user.uid, 'timetable', 'data'), {
        source: 'dashboard-upload',
        generatedAt: Date.now(),
        batch: 'B1',
        entries: parsed,
      });
      setSaved('Timetable saved. It now shows on the Overview page.');
      setTimeout(() => setSaved(''), 3500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const today = todayClasses(timetable);
  const allEntries = timetable?.entries || [];

  return (
    <div>
      <div className="panel">
        <h2>Import Timetable</h2>
        <p className="muted" style={{ marginBottom: 12 }}>
          Paste or upload the JSON produced by the timetable agent program (
          <code>fetch_timetable.py</code>). Format:
          <code>{"[{ day, startTime, endTime, subject, room, faculty, batch, elective }]"}</code>.
        </p>
        <textarea
          placeholder='{"entries": [{"day": "Monday", "startTime": "09:30", "endTime": "10:30", "subject": "Internet Programming", "room": "C-302", "batch": "B1", "elective": true}]}'
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setParsed(null);
          }}
        />
        <div className="form-row" style={{ marginTop: 10 }}>
          <input type="file" accept=".json,application/json" onChange={onFile} />
          <button className="secondary" onClick={parse}>Validate & preview</button>
          <button
            className="secondary"
            onClick={() => {
              setText(JSON.stringify(sampleTimetable(), null, 2));
              setParsed(null);
            }}
          >
            Load sample
          </button>
        </div>
        {error && <p className="error">{error}</p>}

        {parsed && (
          <>
            <table style={{ marginTop: 10 }}>
              <thead>
                <tr><th>Day</th><th>Time</th><th>Subject</th><th>Room</th><th>Batch</th></tr>
              </thead>
              <tbody>
                {parsed.map((e, i) => (
                  <tr key={i}>
                    <td>{e.day}</td>
                    <td>{e.startTime}–{e.endTime}</td>
                    <td>{e.subject} {e.elective && <span className="elective">PE-1</span>}</td>
                    <td>{e.room}</td>
                    <td>{e.batch}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="btn-row">
              <button onClick={save} disabled={busy}>Save timetable to Firebase</button>
            </div>
          </>
        )}
        {saved && <p className="hint" style={{ color: 'var(--ok)' }}>{saved}</p>}
      </div>

      <div className="panel">
        <h2>Saved timetable · today</h2>
        {today.length === 0 && <p className="muted">No classes today (or timetable not imported).</p>}
        <table>
          <tbody>
            {today.map((c) => (
              <tr key={`${c.startTime}-${c.subject}`}>
                <td>{c.startTime}–{c.endTime}</td>
                <td>{c.subject} {c.elective && <span className="elective">PE-1</span>}</td>
                <td>{c.room}</td>
                <td>{c.batch}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {allEntries.length > 0 && (
          <p className="hint">{allEntries.length} entries total · next: {suggestNext(allEntries)}</p>
        )}
      </div>
    </div>
  );
}

function suggestNext(entries) {
  const now = new Date();
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long' });
  const candidates = entries
    .filter((e) => e.day === today && minutesFromHHMM(e.startTime) > now.getHours() * 60 + now.getMinutes())
    .sort((a, b) => minutesFromHHMM(a.startTime) - minutesFromHHMM(b.startTime));
  const next = candidates[0];
  if (!next) return '—';
  return `${next.subject} at ${next.startTime} (${next.room || 'no room'})`;
}
