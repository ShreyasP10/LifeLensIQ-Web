import { useState } from 'react';
import { auth, db } from '../firebase.js';
import { signOut } from 'firebase/auth';
import {
  collection, getDocs, query, orderBy, limit, writeBatch, doc, setDoc, deleteDoc,
} from 'firebase/firestore';
import { CATEGORY_KEYS } from '../lib/categories.js';

export default function SettingsPage({ user, settings }) {
  const overrides = settings.domainCategories || {};
  const [domain, setDomain] = useState('');
  const [category, setCategory] = useState(CATEGORY_KEYS[0]);
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  function flash(msg, ok = true) {
    setStatus(msg);
    setTimeout(() => setStatus(''), 3000);
  }

  function addOverride() {
    const d = domain.trim().toLowerCase().replace(/^www\./, '');
    if (!d) return;
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
          These rules are applied by the extension at capture time. Add e.g.
          <code> youtube.com → Study</code> if you watch coding channels.
        </p>
        <div className="form-row">
          <input
            placeholder="domain, e.g. youtube.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORY_KEYS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button onClick={addOverride}>Add</button>
        </div>
        <div className="list-inline">
          {Object.entries(overrides).map(([d, c]) => (
            <span className="chip" key={d}>
              {d} → {c}
              <button onClick={() => removeOverride(d)}>×</button>
            </span>
          ))}
          {Object.keys(overrides).length === 0 && <span className="muted">No overrides yet.</span>}
        </div>
        {status && <p className="hint" style={{ color: status.startsWith('Category') ? 'var(--ok)' : 'var(--danger)' }}>{status}</p>}
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
