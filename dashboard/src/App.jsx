import { useEffect, useState } from 'react';
import {
  auth,
  db,
  live,
  onAuthStateChanged,
  query,
  collection,
  orderBy,
  limit,
  onSnapshot,
  doc,
} from './firebase.js';
import Login from './components/Login.jsx';
import Overview from './components/Overview.jsx';
import Timeline from './components/Timeline.jsx';
import ExportPanel from './components/ExportPanel.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import TimetablePage from './components/TimetablePage.jsx';
import SettingsPage from './components/SettingsPage.jsx';

const TABS = [
  ['overview', 'Overview'],
  ['timeline', 'Timeline'],
  ['export', 'Export'],
  ['leaderboard', 'Leaderboard'],
  ['timetable', 'Timetable'],
  ['settings', 'Settings'],
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Login />;
  return <Dashboard user={user} />;
}

function Dashboard({ user }) {
  const [tab, setTab] = useState('overview');
  const [events, setEvents] = useState(null);
  const [settings, setSettings] = useState({ domainCategories: {} });
  const [timetable, setTimetable] = useState(null);
  const [dataError, setDataError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'users', user.uid, 'events'), orderBy('ts', 'desc'), limit(5000));
    const unsub = onSnapshot(
      q,
      (snap) => setEvents(snap.docs.map((d) => d.data())),
      (err) => setDataError(err.message)
    );
    return unsub;
  }, [user.uid]);

  useEffect(() => {
    const ref = doc(db, 'users', user.uid, 'settings', 'profile');
    const unsub = onSnapshot(
      ref,
      (d) => {
        if (d.exists()) setSettings(d.data());
      },
      () => {}
    );
    return unsub;
  }, [user.uid]);

  useEffect(() => {
    const ref = doc(db, 'users', user.uid, 'timetable', 'data');
    const unsub = onSnapshot(
      ref,
      (d) => setTimetable(d.exists() ? d.data() : null),
      () => {}
    );
    return unsub;
  }, [user.uid]);

  return (
    <div className="app">
      <nav>
        <div className="brand">
          <span className="logo">LQ</span> LifeIQ
        </div>
        <div className="tabs">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'active' : ''}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="muted email">{user.email}</span>
      </nav>

      {dataError && <div className="banner error">{dataError}</div>}

      {!live && (
        <div className="demo-banner">
          <span className="demo-dot" /> Demo mode — sample data stored locally in your browser.
          Add your Firebase keys in <code>dashboard/.env</code> (see <code>.env.example</code>) and
          restart <code>npm run dev</code> to go live.
        </div>
      )}

      <main>
        {tab === 'overview' && (
          <Overview user={user} events={events || []} settings={settings} timetable={timetable} />
        )}
        {tab === 'timeline' && <Timeline events={events || []} />}
        {tab === 'export' && <ExportPanel user={user} />}
        {tab === 'leaderboard' && <Leaderboard user={user} events={events || []} />}
        {tab === 'timetable' && <TimetablePage user={user} timetable={timetable} />}
        {tab === 'settings' && <SettingsPage user={user} settings={settings} />}
      </main>
    </div>
  );
}
