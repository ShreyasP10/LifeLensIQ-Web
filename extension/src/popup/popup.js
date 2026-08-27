import { initFirebase, isFirebaseConfigured, getFirebase, GoogleAuthProvider, signInWithPopup } from '../shared/firebase.js';
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc, writeBatch, orderBy, limit } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth/web-extension';
import { categoryColor, CATEGORY_KEYS, CATEGORY_WEIGHTS } from '../shared/categories.js';
import { DASHBOARD_URL } from '../shared/firebase-config.js';

let auth = null;
let db = null;
let liveTick = null;
let cachedEvents = null;
let cachedSettings = null;
let currentTab = 'overview';

const el = (id) => document.getElementById(id);

function show(view) {
  el('auth-view')?.classList.toggle('hidden', view !== 'auth');
  el('app-view')?.classList.toggle('hidden', view !== 'app');
}

function setDot(state) {
  const dot = el('status-dot');
  if (!dot) return;
  dot.className = 'dot';
  if (state === 'on') dot.classList.add('on');
  else if (state === 'off') dot.classList.add('off');
}

function fmtAgo(ts) {
  if (!ts) return 'never';
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return `${h}h ago`;
}

function fmtElapsed(startTs) {
  if (!startTs) return '';
  const sec = Math.round((Date.now() - startTs) / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDuration(sec) {
  const s = Math.round(Number(sec) || 0);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function getTodayActiveSeconds() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startTs = startOfDay.getTime();
  const now = Date.now();
  let seconds = 0;
  const { lifelensiq_buffer: buffer = [] } = await chrome.storage.local.get('lifelensiq_buffer');
  for (const ev of buffer) {
    if (ev.ts >= startTs && ev.ts <= now) seconds += ev.durationSeconds || 0;
  }
  const fb = getFirebase();
  if (fb.db && fb.auth.currentUser) {
    try {
      const q = query(collection(fb.db, 'users', fb.auth.currentUser.uid, 'events'), where('ts', '>=', startTs), where('ts', '<=', Date.now()));
      const snap = await getDocs(q);
      snap.forEach(d => { seconds += d.data().durationSeconds || 0; });
    } catch {}
  }
  return seconds;
}

function renderCategories(byCat) {
  const box = el('cat-summary');
  if (!box) return;
  box.innerHTML = '';
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!entries.length) return;
  const total = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
  for (const [name, sec] of entries) {
    const pct = Math.round((sec / total) * 100);
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `<span class="cat-name"><i style="background:${categoryColor(name)}"></i>${name}</span><span class="cat-bar"><span style="width:${pct}%;background:${categoryColor(name)}"></span></span><span class="cat-pct">${pct}%</span>`;
    box.appendChild(row);
  }
}

async function getState() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'getState' });
    if (res && typeof res.pending === 'number' && typeof res.paused === 'boolean') return res;
    return null;
  } catch { return null; }
}

const FALLBACK_STATE = { paused: false, online: true, pending: 0, lastSyncTs: null, session: null };

async function fetchEvents(limitN = 500) {
  const fb = getFirebase();
  if (!fb.db || !fb.auth.currentUser) return [];
  try {
    const q = query(collection(fb.db, 'users', fb.auth.currentUser.uid, 'events'), orderBy('ts', 'desc'), limit(limitN));
    const snap = await getDocs(q);
    const evs = snap.docs.map(d => d.data());
    cachedEvents = evs;
    return evs;
  } catch { return cachedEvents || []; }
}

async function refresh() {
  const user = auth ? auth.currentUser : null;
  const state = await getState();
  show(user ? 'app' : 'auth');
  if (!user) { setDot('off'); return; }
  if (el('user-email')) el('user-email').textContent = user.email || user.uid;
  if (el('settings-email')) el('settings-email').textContent = user.email || user.uid;
  if (el('settings-uid')) el('settings-uid').textContent = user.uid;

  const s = state || FALLBACK_STATE;
  setDot(s.paused ? 'off' : 'on');
  if (el('tracking-status')) el('tracking-status').textContent = s.paused ? 'Paused' : 'On';
  if (el('user-status')) el('user-status').textContent = s.paused ? 'Paused' : (s.online ? 'Active' : 'Offline');
  const pt = el('pause-toggle'); if (pt) pt.checked = Boolean(s.paused);
  const pl = el('pause-label'); if (pl) pl.textContent = s.paused ? 'Paused' : 'On';
  if (el('live-session')) {
    if (s.session) { el('live-session').textContent = `${s.session.domain || ''} · ${fmtElapsed(s.session.startTs)}`; el('live-session').title = s.session.title || ''; }
    else { el('live-session').textContent = '—'; el('live-session').title = ''; }
  }
  const { lifelensiq_buffer: buffer = [] } = await chrome.storage.local.get('lifelensiq_buffer');
  // local today summary for categories
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0); const startTs = startOfDay.getTime(); const now = Date.now();
  const byCat = {}; for (const ev of buffer) if (ev.ts >= startTs && ev.ts <= now) { const c = ev.category || 'Other'; byCat[c] = (byCat[c]||0)+(ev.durationSeconds||0); }
  const todayActiveSeconds = await getTodayActiveSeconds();
  if (el('today-active')) el('today-active').textContent = `${Math.round(todayActiveSeconds/60)} min`;
  if (el('pending-sync')) el('pending-sync').textContent = state ? `${s.pending}${!s.online ? ' (offline)' : ''}` : '— (reload extension)';
  if (el('last-sync')) el('last-sync').textContent = state ? fmtAgo(s.lastSyncTs) : '—';
  renderCategories(byCat);
  if (currentTab === 'timeline') renderTimeline();
  if (currentTab === 'trends') renderTrends();
  if (currentTab === 'heatmap') renderHeatmap();
}

// Tab switching
function switchTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `${name}-tab`));
  if (name === 'timeline') loadTimeline();
  if (name === 'trends') loadTrends();
  if (name === 'heatmap') loadHeatmap();
  if (name === 'settings') loadSettingsTab();
  if (name === 'anomalies') loadAnomalies();
  if (name === 'leaderboard') loadLeaderboard();
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });
}

/* ---------------- focus mode ---------------- */
let focusActive = false;
async function refreshFocus() {
  const res = await chrome.runtime.sendMessage({ type: 'getFocusState' }).catch(() => null);
  focusActive = Boolean(res && res.active);
  ['focus-status','focus-status-popup'].forEach(id => {
    const e = el(id); if (!e) return; e.textContent = focusActive ? 'on' : 'off'; e.className = focusActive ? 'focus-on' : 'focus-off';
  });
  ['focus-toggle','focus-toggle-popup'].forEach(id => {
    const e = el(id); if (e) e.textContent = focusActive ? 'Stop focus' : 'Start focus';
  });
  if (res && res.allowlist && res.allowlist.length) {
    if (el('focus-allowlist')) el('focus-allowlist').value = res.allowlist.join(', ');
    if (el('focus-allowlist-popup')) el('focus-allowlist-popup').value = res.allowlist.join(', ');
  }
}

/* ---------------- pomodoro ---------------- */
const POMO_DEFAULTS = { phase: 'idle', kind: 'focus', minutes: 25, remaining: 25*60, cycles: 0 };
let pomo = { ...POMO_DEFAULTS };
let pomoTick = null;
function savePomo() { chrome.storage.local.set({ ['lifelensiq_pomodoro']: { ...pomo, lastTs: Date.now() } }); }
function pomoRender() {
  const m = String(Math.floor(pomo.remaining/60)).padStart(2,'0');
  const s = String(pomo.remaining%60).padStart(2,'0');
  const time = `${m}:${s}`;
  const phase = pomo.phase==='idle' ? (pomo.kind==='focus'?'focus · 25m':'break · 5m') : pomo.phase;
  const toggle = pomo.phase==='running' ? 'Pause' : 'Start';
  ['pomo-time','pomo-time-popup'].forEach(id => { const e=el(id); if(e) e.textContent=time; });
  ['pomo-phase','pomo-phase-popup'].forEach(id => { const e=el(id); if(e) e.textContent=phase; });
  ['pomo-toggle','pomo-toggle-popup'].forEach(id => { const e=el(id); if(e) e.textContent=toggle; });
  const c = el('pomo-cycles-popup'); if (c) c.textContent = pomo.cycles;
}
async function pomoReset() {
  clearInterval(pomoTick); pomoTick=null;
  const { ['lifelensiq_pomodoro']: saved } = await chrome.storage.local.get('lifelensiq_pomodoro');
  pomo = { ...POMO_DEFAULTS, kind:(saved&&saved.kind)||'focus', minutes:(saved&&saved.minutes)||25, cycles:(saved&&saved.cycles)||0 };
  pomo.remaining = pomo.minutes*60; pomoRender(); savePomo();
}
function pomoFinish() {
  const finishedKind = pomo.kind;
  if (finishedKind==='focus') {
    chrome.runtime.sendMessage({ type:'pomodoroDone', minutes:pomo.minutes, cycles:pomo.cycles+1 }).catch(()=>{});
    pomo.cycles+=1; pomo.kind='break'; pomo.minutes=5;
  } else { pomo.kind='focus'; pomo.minutes=25; }
  pomo.remaining=pomo.minutes*60; pomo.phase='running'; savePomo(); pomoRender();
  chrome.notifications.create({ type:'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'), title: finishedKind==='focus'?'Pomodoro complete':'Break over', message: finishedKind==='focus'?`Focus session logged (${pomo.cycles} today). Break time.`:'Back to focus — start another 25 min.' }).catch(()=>{});
}
function pomoToggle() {
  if (pomo.phase==='running') { clearInterval(pomoTick); pomoTick=null; pomo.phase='paused'; savePomo(); }
  else { pomo.phase='running'; savePomo(); pomoTick=setInterval(()=>{ pomo.remaining-=1; if(pomo.remaining<=0){clearInterval(pomoTick);pomoTick=null;pomoFinish();return;} savePomo(); pomoRender(); },1000); }
  pomoRender();
}
async function initPomodoro() {
  const { ['lifelensiq_pomodoro']: saved } = await chrome.storage.local.get('lifelensiq_pomodoro');
  if (saved) {
    pomo = { ...POMO_DEFAULTS, ...saved };
    if (pomo.phase==='running') {
      const elapsed = Math.round((Date.now()-(saved.lastTs||Date.now()))/1000);
      pomo.remaining = Math.max(0, pomo.remaining - elapsed);
      if (pomo.remaining<=0){ pomo.phase='idle'; pomo.remaining=pomo.minutes*60; savePomo(); }
    }
  }
  pomoRender();
}

/* ---------------- weekly nudge ---------------- */
async function renderWeeklyNudge() {
  const box = el('weekly-nudge'); if (!box) return;
  const fb = getFirebase();
  if (!fb.db || !fb.auth.currentUser) return;
  const start = new Date(); start.setHours(0,0,0,0); start.setDate(start.getDate()-(start.getDay()||7)+1);
  try {
    const snap = await getDocs(query(collection(fb.db,'users',fb.auth.currentUser.uid,'events'), where('ts','>=',start.getTime())));
    let study=0, shorts=0;
    for (const d of snap.docs){ const ev=d.data(); const dur=Number(ev.durationSeconds)||0; const w=CATEGORY_WEIGHTS[ev.category]??0; if(w>=0.9) study+=dur; else if(ev.eventType==='short_video'||ev.category==='Short-form Video') shorts+=dur; }
    const h = s=>Math.round(s/3600); const studyH=h(study), shortsH=h(shorts);
    box.innerHTML=`<div class="sec-title">This week (web + app)</div><div class="nudge-line"><span>Study</span><b>${studyH}h</b></div><div class="nudge-bar"><span style="width:${Math.min(100,Math.round((study/360000)*100))}%;background:#4ade80"></span></div><div class="nudge-line"><span>Shorts</span><b>${shortsH}h</b></div><div class="nudge-bar"><span style="width:${Math.min(100,Math.round((shorts/360000)*100))}%;background:#e879f9"></span></div><p class="nudge-msg muted">${studyH>=shortsH?`Study wins — ${studyH}h vs ${shortsH}h. Keep it up.`:`Shorts beat study (${shortsH}h vs ${studyH}h). Close the gap.`}</p>`;
  } catch { box.innerHTML=''; }
}

/* ---------------- Timeline ---------------- */
async function loadTimeline() {
  const list = el('timeline-list'); if (!list) return;
  list.innerHTML = '<p class="muted">Loading...</p>';
  const evs = await fetchEvents(500);
  renderTimeline(evs);
}
function renderTimeline(evs) {
  const list = el('timeline-list'); if (!list) return;
  const dateInput = el('timeline-date');
  const search = (el('timeline-search')?.value||'').toLowerCase().trim();
  const typeFilter = el('timeline-type')?.value || '';
  const catFilter = list.dataset.catFilter || '';
  let filtered = evs;
  if (dateInput && dateInput.value) {
    const day = dateInput.value;
    filtered = filtered.filter(ev => {
      const d = new Date(ev.ts); const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      return key === day;
    });
  }
  if (search) filtered = filtered.filter(ev => `${ev.domain||''} ${ev.title||''} ${ev.path||''}`.toLowerCase().includes(search));
  if (typeFilter) filtered = filtered.filter(ev => (ev.eventType||'tab_active')===typeFilter);
  if (catFilter) filtered = filtered.filter(ev => ev.category===catFilter);
  if (el('timeline-count')) el('timeline-count').textContent = `${filtered.length} events`;
  if (!filtered.length) { list.innerHTML = '<p class="muted">No events.</p>'; return; }
  list.innerHTML = '';
  filtered.slice(0,50).forEach(ev => {
    const div = document.createElement('div'); div.className='event-item';
    div.innerHTML = `<div class="bar" style="background:${categoryColor(ev.category)}"></div><div class="meta"><div class="domain">${ev.domain||'unknown'} <span class="tag">${ev.category||'Other'}</span></div><div class="path">${formatTime(ev.ts)} → ${formatTime(ev.endTs||ev.ts)} · ${ev.title||ev.path||''}</div></div><div class="dur">${formatDuration(ev.durationSeconds)} <button class="mini danger del-btn" data-id="${ev.eventId||ev.id}">Delete</button></div>`;
    const del = div.querySelector('.del-btn'); del.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      try { const fb=getFirebase(); await deleteDoc(doc(fb.db,'users',fb.auth.currentUser.uid,'events', ev.eventId||ev.id)); div.remove(); } catch(e){ alert(e.message); }
    });
    list.appendChild(div);
  });
}

/* ---------------- Trends ---------------- */
async function loadTrends() {
  const range = parseInt(el('trends-range')?.value||'7');
  const evs = await fetchEvents(1000);
  const now = Date.now();
  const cutoff = now - range*86400000;
  const filtered = evs.filter(ev => ev.ts >= cutoff);
  const byCat = {}; let total=0;
  filtered.forEach(ev => { const c=ev.category||'Other'; byCat[c]=(byCat[c]||0)+(ev.durationSeconds||0); total+=(ev.durationSeconds||0); });
  const pie = el('trends-pie-container'); if (pie) {
    const entries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,5);
    pie.innerHTML = entries.map(([k,v])=>`<div class="cat-row"><span class="cat-name"><i style="background:${categoryColor(k)}"></i>${k}</span><span class="cat-bar"><span style="width:${Math.round((v/total)*100)}%;background:${categoryColor(k)}"></span></span><span class="cat-pct">${Math.round((v/total)*100)}%</span></div>`).join('') || '<p class="muted">No data</p>';
  }
  const domains = {}; filtered.forEach(ev=>{ const d=ev.domain||'unknown'; domains[d]=(domains[d]||0)+(ev.durationSeconds||0); });
  const top = Object.entries(domains).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const ul = el('trends-domains'); if (ul) ul.innerHTML = top.map(([d,s])=>`<li style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--border)"><span>${d}</span><strong>${formatDuration(s)}</strong></li>`).join('') || '<li class="muted">No data</li>';
  // simple bar for daily
  const canvas = el('trends-chart'); if (canvas) {
    const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
    const days = {}; filtered.forEach(ev=>{ const key=new Date(ev.ts).toISOString().split('T')[0]; days[key]=(days[key]||0)+(ev.durationSeconds||0); });
    const vals = Object.values(days); const max = Math.max(...vals,1);
    ctx.fillStyle = '#22d3ee'; const barW = canvas.width / Math.max(vals.length,1);
    vals.forEach((v,i)=>{ const h=(v/max)*160; ctx.fillRect(i*barW+2, 200-h, barW-4, h); });
  }
}

/* ---------------- Heatmap ---------------- */
async function loadHeatmap() { renderHeatmap(); }
async function renderHeatmap() {
  const container = el('heatmap-container'); if (!container) return;
  const days = parseInt(el('heatmap-days')?.value||'90');
  const evs = await fetchEvents(2000);
  const map = {}; evs.forEach(ev=>{ const k=new Date(ev.ts).toISOString().split('T')[0]; map[k]=(map[k]||0)+(ev.durationSeconds||0); });
  const today = new Date(); today.setHours(0,0,0,0);
  let html = '<div class="heat-grid" style="display:grid;grid-template-columns:repeat(7,14px);gap:3px;">';
  const weekdays = ['S','M','T','W','T','F','S'];
  weekdays.forEach(d=> html+=`<div style="font-size:9px;color:var(--muted);text-align:center;">${d}</div>`);
  for (let i=days-1;i>=0;i--) {
    const d=new Date(today); d.setDate(d.getDate()-i);
    const key=d.toISOString().split('T')[0];
    const sec = map[key]||0;
    const intensity = sec===0?0: sec<1800?1: sec<3600?2: sec<7200?3:4;
    const bg = ['var(--panel-2)','#0e4429','#006d32','#26a641','#39d353'][intensity];
    html+=`<div class="heat-cell" title="${key}: ${formatDuration(sec)}" style="width:14px;height:14px;border-radius:3px;background:${bg};"></div>`;
  }
  html+='</div>';
  container.innerHTML = html;
}

/* ---------------- Settings ---------------- */
async function loadSettingsTab() {
  const fb = getFirebase(); if (!fb.db || !fb.auth.currentUser) return;
  if (el('settings-email')) el('settings-email').textContent = fb.auth.currentUser.email || fb.auth.currentUser.uid;
  if (el('settings-uid')) el('settings-uid').textContent = fb.auth.currentUser.uid;
  try {
    const ref = doc(fb.db,'users',fb.auth.currentUser.uid,'settings','profile');
    const snap = await getDoc(ref);
    const data = snap.exists()? snap.data() : {};
    if (el('focus-target')) el('focus-target').value = data.focusTargetMinutes||120;
    // overrides
    const list = el('override-list'); if (list) {
      list.innerHTML = '';
      const overrides = data.domainCategories||{};
      // populate category select once
      const sel = el('override-category'); if (sel && sel.options.length===0) CATEGORY_KEYS.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});
      Object.entries(overrides).forEach(([d,c])=>{
        const li=document.createElement('li'); li.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed var(--border)';
        li.innerHTML=`<span><strong>${d}</strong> → <span class="tag">${c}</span></span><button class="mini danger">remove</button>`;
        li.querySelector('button').addEventListener('click', async ()=>{
          const next={...overrides}; delete next[d];
          await setDoc(ref,{domainCategories:next, updatedAt:Date.now()},{merge:true});
          await chrome.storage.local.set({categoryOverrides:next});
          loadSettingsTab();
        });
        list.appendChild(li);
      });
    }
    // sync health
    const health = el('sync-health'); if (health) {
      const q = query(collection(fb.db,'users',fb.auth.currentUser.uid,'events'), orderBy('ts','desc'), limit(100));
      const snap2 = await getDocs(q);
      const total = snap2.docs.length;
      health.innerHTML = `<div class="row"><span>Total events (recent 100)</span><strong>${total}</strong></div>`;
    }
  } catch(e){ console.warn(e); }
}

/* ---------------- Manual ---------------- */
async function loadManualTab() {
  const form = el('manual-form'); if (!form || form.dataset.bound) return; form.dataset.bound='1';
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const date = el('manual-date').value;
    const start = el('manual-start').value;
    const end = el('manual-end').value;
    const title = el('manual-title').value.trim();
    const domain = el('manual-domain').value.trim().toLowerCase().replace(/^www\./,'');
    const category = el('manual-category').value;
    if (!date||!start||!end||!domain) return alert('Fill all required fields');
    const startTs = new Date(`${date}T${start}`).getTime();
    const endTs = new Date(`${date}T${end}`).getTime();
    if (isNaN(startTs)||isNaN(endTs)||endTs<=startTs) return alert('Invalid time');
    const durationSeconds = Math.round((endTs-startTs)/1000);
    const fb=getFirebase(); const eventId = crypto.randomUUID();
    await setDoc(doc(fb.db,'users',fb.auth.currentUser.uid,'events',eventId), {
      id:eventId, eventId, userId: fb.auth.currentUser.uid, ts: startTs, timestamp: startTs, endTs, durationSeconds, domain, path:'/manual', title: title||domain, category, eventType:'STUDY_SESSION', metadata:{correction:true}, device:'web', deviceId:'web', schemaVersion:1
    });
    alert('Manual entry saved');
    form.reset(); loadManualTab();
  });
  // recent manual
  const fb=getFirebase(); if (!fb.db||!fb.auth.currentUser) return;
  const q = query(collection(fb.db,'users',fb.auth.currentUser.uid,'events'), where('device','==','web'), orderBy('ts','desc'), limit(20));
  try{
    const snap = await getDocs(q);
    const list = el('manual-list'); if(!list) return; list.innerHTML='';
    snap.docs.map(d=>d.data()).filter(ev=>ev.path==='/manual').slice(0,5).forEach(ev=>{
      const li=document.createElement('li'); li.style.cssText='padding:6px 0;border-bottom:1px dashed var(--border);display:flex;justify-content:space-between;';
      li.innerHTML=`<span>${ev.domain} · ${formatDuration(ev.durationSeconds)} · ${new Date(ev.ts).toLocaleDateString()}</span><span class="tag">${ev.category}</span>`;
      list.appendChild(li);
    });
    if(!list.children.length) list.innerHTML='<li class="muted">No manual entries</li>';
  }catch{}
}

/* ---------------- Export ---------------- */
function initExportTab() {
  const btn = el('export-btn'); if (!btn || btn.dataset.bound) return; btn.dataset.bound='1';
  btn.addEventListener('click', async ()=>{
    const from = el('export-from').value; const to = el('export-to').value;
    const format = el('export-format').value;
    const device = el('export-device').value;
    const evs = await fetchEvents(5000);
    let filtered = evs;
    if (from) filtered = filtered.filter(ev=> ev.ts >= new Date(from).getTime());
    if (to) filtered = filtered.filter(ev=> ev.ts <= new Date(to).getTime()+86400000);
    if (device!=='all') filtered = filtered.filter(ev=> (ev.deviceId||ev.device)===device);
    const prog = el('export-progress'); const res = el('export-result');
    if (prog) { prog.textContent=`Exporting ${filtered.length} events...`; prog.classList.remove('hidden'); }
    let out='';
    if (format==='csv') {
      out='ts,durationSeconds,domain,category,eventType\n'+filtered.map(ev=> `${ev.ts},${ev.durationSeconds},${ev.domain},${ev.category},${ev.eventType}`).join('\n');
    } else if (format==='json') out = JSON.stringify(filtered, null, 2);
    else out = JSON.stringify({ total: filtered.length, byCategory: filtered.reduce((a,e)=>{a[e.category]=(a[e.category]||0)+(e.durationSeconds||0);return a;},{}), events: filtered }, null,2);
    if (res){ res.textContent=out.slice(0,5000); res.classList.remove('hidden'); }
    if (prog) prog.textContent=`Done: ${filtered.length} events`;
    const blob = new Blob([out], {type: format==='csv'?'text/csv':'application/json'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`lifelensiq-${Date.now()}.${format==='csv'?'csv':'json'}`; a.click();
  });
}

/* ---------------- Anomalies & Leaderboard ---------------- */
async function loadAnomalies() {
  const list = el('anomalies-list'); if (!list) return; list.innerHTML='<li class="muted">Loading...</li>';
  const evs = await fetchEvents(1000);
  // simple anomaly: long distraction >3h or late night 2-5am
  const anomalies=[];
  const byDay={};
  evs.forEach(ev=>{ const k=new Date(ev.ts).toISOString().split('T')[0]; if(!byDay[k]) byDay[k]=[]; byDay[k].push(ev); });
  Object.entries(byDay).forEach(([day, dayEvs])=>{
    const distract = dayEvs.filter(ev=> ev.category==='Entertainment'||ev.category==='Timepass').reduce((s,e)=>s+(e.durationSeconds||0),0);
    if (distract > 3*3600) anomalies.push({ title:`Long distraction on ${day}`, detail:`${formatDuration(distract)} of Entertainment/Timepass` });
    const late = dayEvs.filter(ev=>{ const h=new Date(ev.ts).getHours(); return h>=2 && h<=5; }).reduce((s,e)=>s+(e.durationSeconds||0),0);
    if (late> 1800) anomalies.push({ title:`Late-night activity ${day}`, detail:`${formatDuration(late)} between 2-5 AM` });
  });
  if (!anomalies.length) list.innerHTML='<li class="muted">No anomalies in recent data.</li>';
  else list.innerHTML = anomalies.map(a=>`<li style="padding:8px 0;border-bottom:1px dashed var(--border)"><strong>${a.title}</strong><br><span class="muted">${a.detail}</span></li>`).join('');
}
async function loadLeaderboard() {
  const list = el('leaderboard-list'); if (!list) return; list.innerHTML='<li class="muted">Loading...</li>';
  const fb=getFirebase(); if (!fb.db) return;
  const period = parseInt(el('leaderboard-period')?.value||'30');
  const cutoff = Date.now() - period*86400000;
  try{
    const snap = await getDocs(collection(fb.db,'leaderboard'));
    const rows = snap.docs.map(d=>d.data()).filter(r=> (r.updatedAt||0) >= cutoff).sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,10);
    if (!rows.length) list.innerHTML='<li class="muted">No leaderboard data</li>';
    else list.innerHTML = rows.map((r,i)=>`<li style="display:flex;justify-content:space-between;padding:6px 0;"><span>#${i+1} ${r.displayName||r.email||r.uid.slice(0,6)}</span><strong>${r.score||0}</strong></li>`).join('');
  } catch { list.innerHTML='<li class="muted">Failed to load</li>'; }
}

function applyTheme(theme) { document.documentElement.dataset.theme = theme; }
async function initTheme() {
  const { ['lifelensiq_theme']: saved } = await chrome.storage.local.get('lifelensiq_theme');
  applyTheme(saved==='light'?'light':'dark');
}

async function main() {
  await initTheme();
  initTabs();
  el('theme-btn')?.addEventListener('click', async () => {
    const next = document.documentElement.dataset.theme==='light'?'dark':'light';
    applyTheme(next); await chrome.storage.local.set({ ['lifelensiq_theme']: next });
  });
  if (!isFirebaseConfigured()) {
    el('auth-view')?.classList.remove('hidden');
    const ae=el('auth-error'); if(ae){ ae.classList.remove('hidden'); ae.textContent='Firebase not configured. Fill extension/src/shared/firebase-config.js (see README).'; }
    setDot('off'); return;
  }
  const fb = initFirebase(); auth = fb.auth; db = fb.db;

  const loginForm = el('login-form');
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault(); el('auth-error')?.classList.add('hidden');
    try { await signInWithEmailAndPassword(auth, el('email').value.trim(), el('password').value); loginForm.reset(); refresh(); } catch (err) { const ae=el('auth-error'); if(ae){ ae.textContent=err.message||'Sign-in failed'; ae.classList.remove('hidden'); } }
  });
  el('google-signin-btn')?.addEventListener('click', async () => {
    el('auth-error')?.classList.add('hidden');
    try { const provider=new GoogleAuthProvider(); await signInWithPopup(auth, provider); refresh(); } catch (err) { const ae=el('auth-error'); if(ae){ ae.textContent=err.message||'Google sign-in failed'; ae.classList.remove('hidden'); } }
  });
  el('logout-btn')?.addEventListener('click', async () => { await signOut(auth).catch(()=>{}); refresh(); });
  el('signout-btn')?.addEventListener('click', async () => { await signOut(auth).catch(()=>{}); refresh(); });
  el('sync-btn')?.addEventListener('click', () => { chrome.runtime.sendMessage({ type:'syncNow' }).catch(()=>{}); if(el('pending-sync')) el('pending-sync').textContent='…'; setTimeout(refresh,1500); });
  el('sync-now-btn')?.addEventListener('click', () => { chrome.runtime.sendMessage({ type:'syncNow' }).catch(()=>{}); });
  el('pause-toggle')?.addEventListener('change', (e) => { const paused=e.target.checked; chrome.runtime.sendMessage({ type:'setPause', paused }).catch(()=>{}); setTimeout(refresh,300); });
  el('dashboard-btn')?.addEventListener('click', () => { chrome.tabs.create({ url: DASHBOARD_URL }); });
  el('options-btn')?.addEventListener('click', () => { chrome.runtime.openOptionsPage(); });
  // focus toggles (both overview and focus tab)
  const focusHandler = async () => {
    const input = el('focus-allowlist')?.value || el('focus-allowlist-popup')?.value || '';
    if (focusActive) await chrome.runtime.sendMessage({ type:'stopFocus' }).catch(()=>{});
    else { const allowlist=input.split(',').map(d=>d.trim()).filter(Boolean); await chrome.runtime.sendMessage({ type:'startFocus', allowlist }).catch(()=>{}); }
    refreshFocus();
  };
  el('focus-toggle')?.addEventListener('click', focusHandler);
  el('focus-toggle-popup')?.addEventListener('click', focusHandler);
  el('pomo-toggle')?.addEventListener('click', pomoToggle);
  el('pomo-toggle-popup')?.addEventListener('click', pomoToggle);
  el('pomo-reset')?.addEventListener('click', pomoReset);
  el('pomo-reset-popup')?.addEventListener('click', pomoReset);
  // timeline filters
  el('timeline-search')?.addEventListener('input', () => renderTimeline(cachedEvents||[]));
  el('timeline-type')?.addEventListener('change', () => renderTimeline(cachedEvents||[]));
  el('timeline-date')?.addEventListener('change', () => renderTimeline(cachedEvents||[]));
  el('timeline-clear')?.addEventListener('click', ()=>{ if(el('timeline-search')) el('timeline-search').value=''; if(el('timeline-type')) el('timeline-type').value=''; renderTimeline(cachedEvents||[]); });
  el('trends-range')?.addEventListener('change', loadTrends);
  el('heatmap-days')?.addEventListener('change', renderHeatmap);
  el('leaderboard-period')?.addEventListener('change', loadLeaderboard);
  // settings
  el('add-override-btn')?.addEventListener('click', async ()=>{
    const domain = el('override-domain').value.trim().toLowerCase().replace(/^www\./,''); const category = el('override-category').value; if(!domain) return;
    const fb2=getFirebase(); const ref=doc(fb2.db,'users',fb2.auth.currentUser.uid,'settings','profile'); const snap=await getDoc(ref); const data=snap.exists()?snap.data():{}; const next={...(data.domainCategories||{}), [domain]:category};
    await setDoc(ref,{domainCategories:next, updatedAt:Date.now()},{merge:true}); await chrome.storage.local.set({categoryOverrides:next}); el('override-domain').value=''; loadSettingsTab();
  });
  el('save-target-btn')?.addEventListener('click', async ()=>{
    const v=Math.max(0, Number(el('focus-target').value)||0);
    const fb2=getFirebase(); await setDoc(doc(fb2.db,'users',fb2.auth.currentUser.uid,'settings','profile'),{focusTargetMinutes:v, updatedAt:Date.now()},{merge:true});
    const s=el('target-status'); if(s){ s.textContent='Saved'; setTimeout(()=>s.textContent='',2000); }
  });
  el('delete-all-btn')?.addEventListener('click', async ()=>{
    if(!confirm('Delete ALL your data?')) return;
    const fb2=getFirebase(); const q=query(collection(fb2.db,'users',fb2.auth.currentUser.uid,'events'), orderBy('ts'), limit(450));
    let snap = await getDocs(q); while(!snap.empty){ const batch=writeBatch(fb2.db); snap.docs.forEach(d=>batch.delete(d.ref)); await batch.commit(); snap = await getDocs(q); }
    await deleteDoc(doc(fb2.db,'users',fb2.auth.currentUser.uid,'settings','profile')).catch(()=>{});
    alert('All data deleted');
  });
  initExportTab(); loadManualTab();
  auth.onAuthStateChanged(() => refresh());
  refresh(); await initPomodoro(); await refreshFocus(); renderWeeklyNudge();
  liveTick = setInterval(()=>{ refresh(); renderWeeklyNudge(); },30000);
}

window.addEventListener('unload', () => { if(liveTick) clearInterval(liveTick); });
main();
