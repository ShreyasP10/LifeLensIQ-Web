import { useEffect, useState } from 'react';
import {
  auth,
  db,
  signOut,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  writeBatch,
  doc,
  setDoc,
  deleteDoc,
} from '../firebase.js';
import { CATEGORY_KEYS, CATEGORY_COLORS } from '../lib/categories.js';
import { formatTime, formatDuration } from '../lib/stats.js';
import { rulesByCategory } from '../../../extension/src/shared/categories.js';

const SITE_CATALOG = rulesByCategory();

export default function SettingsPage({ user, settings, events }) {
  const overrides = settings.domainCategories || {};
  const [domain, setDomain] = useState('');
  const [category, setCategory] = useState(CATEGORY_KEYS[0]);
  const [target, setTarget] = useState(String(settings.focusTargetMinutes || 120));
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  useEffect(() => {
    setTarget(String(settings.focusTargetMinutes || 120));
  }, [settings.focusTargetMinutes]);

  const devices = (() => {
    const m = new Map();
    let legacy = 0;
    const seenIds = new Set();
    let dupes = 0;
    for (const ev of events || []) {
      const dev = ev.device || 'unknown';
      const rec = m.get(dev) || { count: 0, lastTs: 0 };
      rec.count += 1;
      if (Number(ev.ts) > rec.lastTs) rec.lastTs = Number(ev.ts);
      m.set(dev, rec);
      if (!ev.eventId) {
        legacy += 1;
        if (ev.id && seenIds.has(ev.id)) dupes += 1;
        seenIds.add(ev.id || '');
      } else {
        if (seenIds.has(ev.eventId)) dupes += 1;
        seenIds.add(ev.eventId);
      }
    }
    return {
      list: [...m.entries()].sort((a, b) => b[1].lastTs - a[1].lastTs),
      total: (events || []).length,
      legacy,
      dupes,
    };
  })();

  async function saveTarget() {
    const minutes = Math.max(0, Number(target) || 0);
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'settings', 'profile'),
        { focusTargetMinutes: minutes, updatedAt: Date.now() },
        { merge: true }
      );
      flash('Daily focus target saved.');
    } catch (err) {
      flash(err.message, false);
    }
  }

  function flash(msg, ok = true) {
    setStatus(msg);
    setTimeout(() => setStatus(''), 3000);
  }

  function extractKey(input) {
    let raw = String(input || '').trim().toLowerCase();
    if (!raw) return '';
    raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    raw = raw.split(/[?#]/)[0].replace(/\/+$/, '');
    const slash = raw.indexOf('/');
    let host = slash >= 0 ? raw.slice(0, slash) : raw;
    const rest = slash >= 0 ? raw.slice(slash) : '';
    if (!host.includes(']')) host = host.replace(/:\d+$/, '');
    host = host.replace(/^www\./, '');
    if (!host || /\s/.test(host + rest) || /[\\<>"]/.test(host + rest)) return '';
    return host + rest;
  }

  function addOverride() {
    const d = extractKey(domain);
    if (!d) {
      flash('Enter a valid link, domain or domain + path.', false);
      return;
    }
    const next = { ...overrides, [d]: category };
    saveOverrides(next);
    setDomain('');
  }

  function removeOverride(d) {
    const next = { ...overrides };
    delete next[d];
    saveOverrides(next);
  }

  async function saveOverrides(next) {
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'settings', 'profile'),
        { domainCategories: next, updatedAt: Date.now() },
        { merge: true }
      );
      flash('Category overrides saved.');
    } catch (err) {
      flash(err.message, false);
    }
  }

  async function deleteAllData() {
    setBusyDelete(true);
    try {
      while (true) {
        const q = query(collection(db, 'users', user.uid, 'events'), orderBy('ts'), limit(450));
        const snap = await getDocs(q);
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, 'users', user.uid, 'settings', 'profile')).catch(() => {});
      await deleteDoc(doc(db, 'users', user.uid, 'timetable', 'data')).catch(() => {});
      await deleteDoc(doc(db, 'leaderboard', user.uid)).catch(() => {});
      flash('All your data has been deleted from Firestore.');
    } catch (err) {
      flash('Delete failed: ' + err.message, false);
    } finally {
      setBusyDelete(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div>
      <div className="panel">
        <h2>Category Overrides</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          Paste any website link, domain, or domain + path (like <code>youtube.com/watch</code>),
          pick a category, and Add. Path rules apply to deeper links only — a domain rule like{' '}
          <code>youtube.com</code> covers the rest. Saved to your account and applied to your
          tracked data (including old Other events) on this dashboard and future captures.
        </p>
        <div className="form-row">
          <input
            placeholder="paste a link, domain, or domain + path e.g. youtube.com/watch"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addOverride(); }}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_KEYS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button onClick={addOverride}>Add</button>
        </div>
        <div className="btn-row">
          <button className="secondary" onClick={() => setCatalogOpen(true)}>
            View all categorized sites
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            your rules and the built-in catalog, grouped by category
          </span>
        </div>
        {status && <p className="hint" style={{ color: status.startsWith('Category') ? 'var(--ok)' : 'var(--danger)' }}>{status}</p>}
      </div>

      {catalogOpen && (
        <div className="modal-backdrop" onClick={() => setCatalogOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="head-row">
              <h2>All categorized sites</h2>
              <button className="modal-close secondary" onClick={() => setCatalogOpen(false)}>×</button>
            </div>
            <p className="muted" style={{ marginBottom: 14 }}>
              Your rules always win over the built-in list. Short video link paths count as
              Short-form Video, your computer's own addresses (localhost, home network IPs) count
              as Development, and anything unknown falls under Other.
            </p>
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  margin: '6px 0',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 99,
                    background: 'var(--grad)',
                    boxShadow: '0 0 7px var(--accent)',
                  }}
                />
                Your overrides
                <span className="chip-count">{Object.keys(overrides).length}</span>
              </div>
              <div className="chip-row" style={{ marginBottom: 0 }}>
                {Object.entries(overrides).map(([d, c]) => (
                  <span className="chip" key={d} style={{ fontSize: 11.5 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        background: CATEGORY_COLORS[c] || CATEGORY_COLORS.Other,
                      }}
                    />
                    {d}
                    <strong style={{ fontWeight: 600, opacity: 0.75 }}>{c}</strong>
                    <button onClick={() => removeOverride(d)} title="Remove override">×</button>
                  </span>
                ))}
                {Object.keys(overrides).length === 0 && (
                  <span className="muted">No overrides yet — add one above.</span>
                )}
              </div>
            </div>
            {CATEGORY_KEYS.map((c) =>
              SITE_CATALOG[c] && SITE_CATALOG[c].length > 0 ? (
                <div key={c} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      margin: '6px 0',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 99,
                        background: CATEGORY_COLORS[c],
                        boxShadow: `0 0 7px ${CATEGORY_COLORS[c]}`,
                      }}
                    />
                    {c}
                    <span className="chip-count">{SITE_CATALOG[c].length}</span>
                  </div>
                  <div className="chip-row" style={{ marginBottom: 0 }}>
                    {SITE_CATALOG[c]
                      .filter((d) => !(d in overrides))
                      .map((d) => (
                        <span className="chip" key={d} style={{ fontSize: 11.5 }}>{d}</span>
                      ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Daily Focus Target</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          Your streak counts a day only when productive-weighted time reaches this target.
        </p>
        <div className="form-row">
          <input
            type="number"
            min="0"
            step="15"
            style={{ width: 140 }}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <span className="muted">minutes / day</span>
          <button onClick={saveTarget}>Save target</button>
        </div>
      </div>

      <div className="panel">
        <h2>Sync health</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          All devices (Android app, Chrome extension, manual web entries) share one{' '}
          <code>users/&#123;uid&#125;/events</code> collection. Events are upserted by{' '}
          <code>eventId</code>, so duplicates should not exist.
        </p>
        <div className="row"><span>Total events</span><strong>{devices.total}</strong></div>
        {devices.list.map(([dev, rec]) => (
          <div className="row" key={dev}>
            <span>
              <span className="chip">{dev}</span> {rec.count} events
            </span>
            <strong>{rec.lastTs ? `last seen ${formatTime(rec.lastTs)}` : 'never'}</strong>
          </div>
        ))}
        <div className="row">
          <span>Legacy events (no eventId — written before the shared contract)</span>
          <strong>{devices.legacy}</strong>
        </div>
        <div className="row">
          <span>Duplicate eventIds in the last 10k events</span>
          <strong style={{ color: devices.dupes > 0 ? 'var(--danger)' : 'var(--ok)' }}>
            {devices.dupes}
          </strong>
        </div>
        <p className="hint">Web → app appears after the app's next sync (≤ 15 min). App → web is live within seconds.</p>
      </div>

      <div className="panel">
        <h2>Account</h2>
        <div className="row"><span>Email</span><strong>{user.email || user.uid}</strong></div>
        <div className="row"><span>UID</span><strong style={{ fontSize: 12 }}>{user.uid}</strong></div>
        <div className="btn-row">
          <button className="secondary" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </div>

      <div className="panel" style={{ borderColor: 'var(--danger)' }}>
        <h2 style={{ color: 'var(--danger)' }}>Danger zone</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          Deletes every event, settings, timetable and leaderboard entry for this account from
          Firestore. This cannot be undone. Local extension buffer is untouched (it will re-sync
          unless you also clear it in the extension).
        </p>
        {!confirmDelete ? (
          <button className="danger" onClick={() => setConfirmDelete(true)}>Delete all my data…</button>
        ) : (
          <div className="btn-row">
            <button className="danger" onClick={deleteAllData} disabled={busyDelete}>
              {busyDelete ? 'Deleting…' : 'Yes, delete everything'}
            </button>
            <button className="secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
