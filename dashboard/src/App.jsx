import { useEffect, useMemo, useState } from 'react';
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
import { isLight, toggleTheme } from './lib/theme.js';
import { normalizeEvent } from './lib/events.js';
import { detectAnomalies } from './lib/insights.js';
import Login from './components/Login.jsx';
import Overview from './components/Overview.jsx';
import Timeline from './components/Timeline.jsx';
import ExportPanel from './components/ExportPanel.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import TimetablePage from './components/TimetablePage.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import ManualEntry from './components/ManualEntry.jsx';

const TABS = [
  ['overview', 'Overview'],
  ['timeline', 'Timeline'],
  ['export', 'Export'],
  ['leaderboard', 'Leaderboard'],
  ['timetable', 'Timetable'],
  ['log', 'Log'],
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
  const [light, setLight] = useState(isLight());
  const [alertsOpen, setAlertsOpen] = useState(false);

  const anomalies = useMemo(
    () => (events ? detectAnomalies(events) : []),
    [events]
  );
  const [dismissed, setDismissed] = useState({});
  const activeAlerts = anomalies.filter((a) => !dismissed[a.title]);

  useEffect(() => {
    const q = query(collection(db, 'users', user.uid, 'events'), orderBy('ts', 'desc'), limit(10000));
    const unsub = onSnapshot(
      q,
      (snap) => setEvents(snap.docs.map((d) => normalizeEvent(d.data()))),
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
          <span className="logo">LLIQ</span> LifeLensIQ
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
        <div className="alerts-wrap">
          <button
            className="alerts-btn"
            onClick={() => setAlertsOpen(!alertsOpen)}
            title="Anomaly alerts"
            aria-label="Anomaly alerts"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {activeAlerts.length > 0 && <span className="alerts-badge">{activeAlerts.length}</span>}
          </button>
          {alertsOpen && (
            <div className="alerts-pop">
              {activeAlerts.length === 0 && (
                <p className="muted" style={{ padding: 8 }}>No anomalies detected in the last 7 days.</p>
              )}
              {activeAlerts.map((a) => (
                <div key={a.title} className={`insight ${a.kind}`}>
                  <div className="insight-title">{a.title}</div>
                  <div className="insight-detail">{a.detail}</div>
                  <button className="mini" onClick={() => setDismissed({ ...dismissed, [a.title]: true })}>
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          className="theme-toggle"
          onClick={() => setLight(toggleTheme())}
          title={light ? 'Switch to dark theme' : 'Switch to light theme'}
          aria-label="Toggle theme"
        >
          <svg
            className={light ? 'hidden-ico' : ''}
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
          <svg
            className={light ? '' : 'hidden-ico'}
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
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
        {tab === 'log' && <ManualEntry user={user} />}
        {tab === 'settings' && <SettingsPage user={user} settings={settings} events={events || []} />}
      </main>
    </div>
  );
}
