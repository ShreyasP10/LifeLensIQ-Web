import { useEffect, useMemo, useRef, useState, startTransition } from 'react';
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
  getDocs,
  deleteDoc,
} from './firebase.js';
import { isLight, toggleTheme } from './lib/theme.js';
import { normalizeEvent } from './lib/events.js';
import { dedupeOverlaps } from './lib/stats.js';
import { CATEGORIES } from './lib/categories.js';
import { classify, matchOverride } from '../../extension/src/shared/categories.js';
import { detectAnomalies } from './lib/insights.js';
import { normalizeTimetable } from './lib/timetable.js';
import Login from './components/Login.jsx';
import Overview from './components/Overview.jsx';
import Timeline from './components/Timeline.jsx';
import Trends from './components/Trends.jsx';
import ExportPanel from './components/ExportPanel.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import SettingsPage from './components/SettingsPage.jsx';
import ManualEntry from './components/ManualEntry.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import TabSkeleton, { Sk } from './components/Skeleton.jsx';

const TABS = [
  ['overview', 'Overview'],
  ['trends', 'Trends'],
  ['timeline', 'Timeline'],
  ['export', 'Export'],
  ['leaderboard', 'Leaderboard'],
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

  if (loading)
    return (
      <div className="app" aria-busy="true">
        <div className="sk-nav">
          <Sk h={24} w={104} r={8} />
          <div style={{ flex: 1 }} />
          <Sk h={30} w={70} r={12} />
          <Sk h={30} w={64} r={12} />
          <Sk h={30} w={68} r={12} />
          <Sk h={30} w={58} r={12} />
          <Sk h={30} w={62} r={12} />
        </div>
        <main>
          <TabSkeleton kind="overview" />
        </main>
      </div>
    );
  if (!user) return <Login />;
  return (
    <ErrorBoundary>
      <Dashboard user={user} />
    </ErrorBoundary>
  );
}

function Dashboard({ user }) {
  const [tab, setTabState] = useState('overview');
  // visited tabs stay mounted and are only hidden — switching them is instant
  // and heavy memos are not recomputed on every visit
  const [mounted, setMounted] = useState(() => new Set(['overview']));
  const [pending, setPending] = useState(false);
  const switchTimer = useRef(0);
  const switchId = useRef(0);

  const setTab = (key) => {
    if (key === tab) return;
    setTabState(key);
    if (mounted.has(key)) return;
    clearTimeout(switchTimer.current);
    const id = ++switchId.current;
    setPending(true);
    // paint the skeleton first, then mount the (potentially heavy) tab
    // underneath it, then drop the overlay once its first frame exists
    switchTimer.current = setTimeout(() => {
      setMounted((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (switchId.current === id) setPending(false);
        })
      );
    }, 150);
  };
  useEffect(() => () => clearTimeout(switchTimer.current), []);
  const [events, setEvents] = useState(null);
  const [settings, setSettings] = useState({ domainCategories: {} });
  const [dataError, setDataError] = useState('');
  const [light, setLight] = useState(isLight());
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [timetable, setTimetable] = useState(null);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const q = query(collection(db, 'users', user.uid, 'events'), orderBy('ts', 'desc'), limit(10000));
      const snap = await getDocs(q);
      setEvents(dedupeOverlaps(snap.docs.map((d) => normalizeEvent(d.data()))));
      setLastSync(Date.now());
    } catch (err) {
      setDataError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const anomalies = useMemo(
    () => (events ? detectAnomalies(events, Date.now(), { timetable }) : []),
    [events, timetable]
  );
  const [dismissed, setDismissed] = useState({});
  const activeAlerts = anomalies.filter((a) => !dismissed[`${a.title}-${a.detail}`]);

  const eventDevice = (ev) =>
    ev.deviceId ||
    (ev.device && ev.device !== 'web' && ev.device !== 'extension' ? ev.device : 'web');

  const deviceOptions = useMemo(() => {
    const set = new Set();
    for (const ev of events || []) set.add(eventDevice(ev));
    return ['all', ...set];
  }, [events]);

  const deviceLabel = (id) => {
    if (id === 'all') return 'All devices';
    if (id === 'web') return 'Laptop';
    if (id === 'unknown') return 'Unknown';
    return `Phone · ${id.slice(0, 4)}`;
  };

  const effectiveEvents = useMemo(() => {
    if (!events) return null;
    const overrides = settings.domainCategories || {};
    return events.map((ev) => {
      if (!ev.domain) return ev;
      const forced = matchOverride(ev.domain, ev.path || '', overrides);
      if (forced && forced !== ev.category) return { ...ev, category: forced };
      if (ev.category !== CATEGORIES.OTHER) return ev;
      const c = classify(ev.domain, ev.path || '', overrides);
      return c !== CATEGORIES.OTHER ? { ...ev, category: c } : ev;
    });
  }, [events, settings]);

  const filteredEvents = useMemo(() => {
    const base = effectiveEvents || [];
    if (deviceFilter === 'all') return base;
    return base.filter((ev) => eventDevice(ev) === deviceFilter);
  }, [effectiveEvents, deviceFilter]);

  const syncRef = useRef(null);
  syncRef.current = syncNow;
  useEffect(() => {
    const t = setInterval(() => syncRef.current(), 24 * 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Fast first paint: a small recent slice loads within ~1-2s so the page
  // shows real content as early as possible; the full snapshot flight
  // below replaces it a few seconds later.
  useEffect(() => {
    let alive = true;
    const fastQ = query(collection(db, 'users', user.uid, 'events'), orderBy('ts', 'desc'), limit(1500));
    getDocs(fastQ)
      .then((small) => {
        if (!alive) return;
        const fast = dedupeOverlaps(small.docs.map((d) => normalizeEvent(d.data())));
        setEvents((full) => (full && full.length >= fast.length ? full : fast));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.uid]);

  const deleteEvent = async (eventId) => {
    if (!window.confirm('Delete this timeline entry?')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'events', eventId));
      // Optimistic update
      setEvents((prev) => prev ? prev.filter((e) => e.id !== eventId) : null);
    } catch (err) {
      setDataError(err.message);
    }
  };

  // Live updates: the extension writes events continuously while you browse,
  // so every snapshot used to re-normalise + re-dedupe 10k records and re-render
  // every open tab. Coalesce them: apply at most once per 10s (first snapshot
  // applies immediately), always the newest snapshot, wrapped in a transition
  // so a big recompute never blocks the current frame.
  const latestSnap = useRef(null);
  const applyTimer = useRef(0);
  const lastApply = useRef(0);
  useEffect(() => {
    const apply = () => {
      const snap = latestSnap.current;
      latestSnap.current = null;
      clearTimeout(applyTimer.current);
      applyTimer.current = 0;
      if (!snap) return;
      lastApply.current = Date.now();
      const next = dedupeOverlaps(snap.docs.map((d) => normalizeEvent(d.data())));
      startTransition(() => setEvents(next));
    };
    const unsub = onSnapshot(
      query(collection(db, 'users', user.uid, 'events'), orderBy('ts', 'desc'), limit(10000)),
      (snap) => {
        latestSnap.current = snap;
        const since = Date.now() - lastApply.current;
        if (lastApply.current && since < 10000) {
          if (!applyTimer.current) {
            applyTimer.current = setTimeout(apply, 10000 - since);
          }
        } else {
          apply();
        }
      },
      (err) => setDataError(err.message)
    );
    return () => {
      unsub();
      clearTimeout(applyTimer.current);
      latestSnap.current = null;
    };
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
      (d) => {
        try {
          setTimetable(d.exists() ? normalizeTimetable(d.data()) : null);
        } catch {
          setTimetable(null);
        }
      },
      () => {}
    );
    return unsub;
  }, [user.uid]);

  const renderTab = (key) => {
    switch (key) {
      case 'overview':
        return <Overview user={user} events={filteredEvents} settings={settings} />;
      case 'trends':
        return <Trends events={filteredEvents} />;
      case 'timeline':
        return <Timeline events={filteredEvents} onDelete={deleteEvent} />;
      case 'export':
        return <ExportPanel user={user} />;
      case 'leaderboard':
        return <Leaderboard user={user} events={filteredEvents} />;
      case 'log':
        return <ManualEntry user={user} />;
      case 'settings':
        return <SettingsPage user={user} settings={settings} events={events || []} />;
      default:
        return null;
    }
  };

  const skeleton = events === null || pending;

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
            title="Anomaly alerts — unusual usage patterns (late-night screen time 2–5 AM, 3h+ uninterrupted distraction runs)"
            aria-label="Anomaly alerts"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="alerts-label">Anomalies</span>
            {activeAlerts.length > 0 && <span className="alerts-badge">{activeAlerts.length}</span>}
          </button>
          {alertsOpen && (
            <div className="alerts-pop">
              {activeAlerts.length === 0 && (
                <div style={{ padding: 8 }}>
                  <p className="muted">No anomalies detected in the last 7 days.</p>
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Anomalies are unusual patterns in your usage — e.g. screen time between 2–5 AM,
                    or an uninterrupted distraction run of 3+ hours. They appear here automatically
                    when detected.
                  </p>
                </div>
              )}
              {activeAlerts.map((a, i) => {
                const key = `${a.title}-${a.detail}`;
                return (
                <div key={key} className={`insight ${a.kind}`}>
                  <div className="insight-title">{a.title}</div>
                  <div className="insight-detail">{a.detail}</div>
                  <button className="mini" onClick={() => setDismissed({ ...dismissed, [key]: true })}>
                    Dismiss
                  </button>
                </div>
                );
              })}
            </div>
          )}
        </div>
        <button
          className="sync-btn"
          onClick={syncNow}
          disabled={syncing}
          title={
            lastSync
              ? `Sync data from all devices — last synced ${new Date(lastSync).toLocaleTimeString()}`
              : 'Sync data from all devices'
          }
          aria-label="Sync"
        >
          <svg
            className={syncing ? 'sync-spin' : ''}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          <span className="sync-label">{syncing ? 'Syncing…' : 'Sync'}</span>
        </button>
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

      <main aria-busy={skeleton ? true : undefined}>
        {Array.from(mounted).map((key) => (
          <div key={key} style={{ display: tab === key ? '' : 'none' }}>
            <ErrorBoundary>{renderTab(key)}</ErrorBoundary>
          </div>
        ))}
        {skeleton && <div className="sk-overlay"><TabSkeleton kind={tab} /></div>}
      </main>
    </div>
  );
}
