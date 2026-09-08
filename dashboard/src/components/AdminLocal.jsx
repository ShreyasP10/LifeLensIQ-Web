import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import { getAuth } from 'firebase/auth';
import Overview from './Overview.jsx';
import Trends from './Trends.jsx';
import Timeline from './Timeline.jsx';
import Heatmap from './Heatmap.jsx';
import { normalizeEvent } from '../lib/events.js';

const ADMIN_UID = 'YsM8jSagROdTa1inGzKJNweljUG3';
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export default function AdminLocal({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [selectedUid, setSelectedUid] = useState(null);
  const [events, setEvents] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);

  const isAdmin = currentUser?.uid === ADMIN_UID;
  const showAdmin = isLocal && isAdmin;

  useEffect(() => {
    if (!showAdmin) return;
    // list users from local report if available, else from auth (fallback)
    // For live view, fetch user list via Firestore users collection (admin can read)
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), limit(100)));
        const list = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        // also try to get emails from events' userId
        if (list.length === 0) {
          // fallback: use known admin
          setUsers([{ uid: ADMIN_UID, email: 'shreyaspawar1011@gmail.com' }]);
        } else {
          setUsers(list);
        }
      } catch {
        setUsers([{ uid: ADMIN_UID, email: 'shreyaspawar1011@gmail.com' }]);
      }
    })();
  }, [showAdmin]);

  useEffect(() => {
    if (!selectedUid) return;
    setLoading(true);
    (async () => {
      const q = query(collection(db, `users/${selectedUid}/events`), orderBy('ts','desc'), limit(5000));
      const snap = await getDocs(q);
      setEvents(snap.docs.map(d=> normalizeEvent(d.data())));
      const sSnap = await getDocs(query(collection(db, `users/${selectedUid}/settings`), limit(1))).catch(()=>null);
      // settings is at users/{uid}/settings/profile
      try {
        const { getDoc, doc } = await import('firebase/firestore');
        const p = await getDoc(doc(db, `users/${selectedUid}/settings`, 'profile'));
        if (p.exists()) setSettings(p.data());
      } catch {}
      setLoading(false);
    })();
  }, [selectedUid]);

  if (!showAdmin) return null;

  return (
    <div className="panel" style={{borderColor: 'var(--accent)', marginBottom: 16}}>
      <h2>🔒 Local Admin — All Users (localhost only)</h2>
      <p className="muted">This panel only shows on <code>localhost</code> for admin UID. Never deployed to Vercel.</p>
      <div className="form-row">
        <select value={selectedUid||''} onChange={e=> setSelectedUid(e.target.value)} style={{flex:1}}>
          <option value="">— Select user to view full dashboard —</option>
          {users.map(u=> <option key={u.uid} value={u.uid}>{u.email||u.uid} — {u.uid.slice(0,6)}</option>)}
        </select>
        {selectedUid && <button className="secondary" onClick={()=> setSelectedUid(null)}>Clear</button>}
      </div>
      {loading && <p className="muted">Loading {selectedUid}...</p>}
      {selectedUid && events && !loading && (
        <div style={{marginTop:16, borderTop:'1px solid var(--border)', paddingTop:16}}>
          <p className="muted">Viewing as <b>{selectedUid}</b> — {events.length} events</p>
          <Overview user={{uid:selectedUid}} events={events} settings={settings} />
          <div style={{marginTop:20}}><Trends events={events} /></div>
          <div style={{marginTop:20}}><Heatmap events={events} days={90} /></div>
          <div style={{marginTop:20}}><Timeline events={events} onDelete={()=>{}} /></div>
        </div>
      )}
    </div>
  );
}
