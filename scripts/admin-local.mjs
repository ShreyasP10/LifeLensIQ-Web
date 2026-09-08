#!/usr/bin/env node
// Local-only Admin Viewer — fetches ALL user data and writes to local-data/ (gitignored)
// Usage:
//   1) npm i firebase-admin   (in project root)
//   2) put serviceAccountKey.json in project root (already gitignored)
//   3) node scripts/admin-local.mjs            -> writes local-data/report.json + report.html
//   4) node scripts/admin-local.mjs --serve    -> also starts http://localhost:8787
// Data NEVER touches GitHub/Vercel — local-data/ is gitignored.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'local-data');
const KEY_PATH = join(ROOT, 'serviceAccountKey.json');

const args = process.argv.slice(2);
const SERVE = args.includes('--serve');
const PORT = 8787;

if (!existsSync(KEY_PATH)) {
  console.error('✖ Missing serviceAccountKey.json in project root.');
  console.error('  Download from Firebase Console > Project Settings > Service Accounts > Generate new private key');
  process.exit(1);
}

let admin, getFirestore, getAuth;
try {
  const { initializeApp, cert } = await import('firebase-admin/app');
  ({ getFirestore } = await import('firebase-admin/firestore'));
  ({ getAuth } = await import('firebase-admin/auth'));
  const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  try { initializeApp({ credential: cert(key) }); } catch (e) { if (!String(e.message).includes('already exists')) throw e; }
} catch (e) {
  console.error('✖ Need firebase-admin: run  npm i firebase-admin  in project root');
  console.error(e.message);
  process.exit(1);
}

const db = getFirestore();
const auth = getAuth();

// --- helpers: reuse dashboard logic (inline, no import) ---
function fmt(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

async function buildReport() {
  console.log('→ Listing users...');
  const list = await auth.listUsers(1000);
  console.log(`  found ${list.users.length} users`);

  const users = [];
  for (const u of list.users) {
    const uid = u.uid;
    const snap = await db.collection(`users/${uid}/events`).orderBy('ts','desc').limit(5000).get().catch(()=>({docs:[]}));
    const events = snap.docs.map(d=>d.data());
    let totalSec=0, prodSec=0, byCat={}, byDomain={}, byDay={}, lastTs=0;
    const recent = events.slice(0,20);
    for (const ev of events) {
      const s = Number(ev.durationSeconds)||0;
      totalSec+=s;
      const w = ({Study:1,DSA:1,Development:1,Productivity:0.9}[ev.category] ?? 0.2);
      if (w>=0.9) prodSec+=s;
      byCat[ev.category||'Other']=(byCat[ev.category||'Other']||0)+s;
      if (ev.domain) byDomain[ev.domain]=(byDomain[ev.domain]||0)+s;
      if (Number(ev.ts)>lastTs) lastTs=Number(ev.ts);
      const day = ev.ts ? new Date(Number(ev.ts)).toISOString().split('T')[0] : null;
      if (day) byDay[day]=(byDay[day]||0)+s;
    }
    const topDomain = Object.entries(byDomain).sort((a,b)=>b[1]-a[1])[0];
    const score = totalSec ? Math.round((prodSec/totalSec)*100) : 0;
    const topDomains = Object.entries(byDomain).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([d,s])=>({domain:d, sec:s}));
    users.push({
      uid, email: u.email||'', displayName: u.displayName||'',
      createdAt: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime,
      events: events.length,
      totalSec, prodSec, score,
      byCat, byDomain: topDomains, byDay,
      recent: recent.map(ev=>({ts:ev.ts, endTs:ev.endTs, domain:ev.domain, title:ev.title, category:ev.category, durationSeconds:ev.durationSeconds, path:ev.path})),
      topDomain: topDomain? {domain:topDomain[0], sec:topDomain[1]}: null,
      lastActive: lastTs? new Date(lastTs).toLocaleString(): '—'
    });
    console.log(`  • ${u.email||uid} → ${events.length} events, score ${score}, ${fmt(totalSec)} total`);
  }

  users.sort((a,b)=> b.score - a.score);

  mkdirSync(OUT_DIR,{recursive:true});
  writeFileSync(join(OUT_DIR,'report.json'), JSON.stringify({generatedAt: new Date().toISOString(), users}, null, 2));
  console.log(`\n✔ Wrote ${join('local-data','report.json')}`);

  // --- build self-contained HTML (Vercel-like, per-user full stats) ---
  const html = `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LifeLensIQ — Local Admin (OFFLINE) — Full Dashboard</title>
<style>
  :root{--bg:#070c16;--panel:#10192c;--panel2:#16233c;--border:rgba(148,163,184,.14);--text:#e6edf7;--muted:#8b9bb4;--accent:#38bdf8;--ok:#4ade80;--warn:#fbbf24}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:radial-gradient(900px 500px at 85% -10%, rgba(99,102,241,.14), transparent 60%), var(--bg);color:var(--text);padding:20px}
  h1{margin:0 0 4px;font-size:22px}h2{margin:18px 0 8px;font-size:16px}h3{margin:12px 0 6px;font-size:13px;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}
  .muted{color:var(--muted);font-size:13px}.warn{background:#1a2a12;border:1px solid #2a4a1a;color:#a3e635;padding:10px 14px;border-radius:10px;margin:14px 0;font-size:13px}
  .bar{height:8px;background:#0a1220;border-radius:99px;overflow:hidden;border:1px solid var(--border)}.fill{height:100%;background:linear-gradient(90deg,var(--accent),#818cf8)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:12px}
  .card{background:linear-gradient(180deg, rgba(22,33,58,.72), rgba(14,21,38,.68));border:1px solid var(--border);border-radius:16px;padding:14px;cursor:pointer;transition:.15s}
  .card:hover{transform:translateY(-2px);border-color:rgba(148,163,184,.3)} .card.active{outline:2px solid var(--accent)}
  .k{color:var(--muted);font-size:11px;letter-spacing:.04em;text-transform:uppercase} .v{font-size:20px;font-weight:800}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
  th{color:var(--muted);text-align:left;font-size:11px;letter-spacing:.05em;padding:8px;border-bottom:1px solid var(--border)}
  td{padding:8px;border-bottom:1px solid rgba(255,255,255,.06);font-variant-numeric:tabular-nums} tr:hover td{background:rgba(255,255,255,.03)}
  input,select{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:#070c18;color:var(--text);margin:8px 0}
  .panel{background:linear-gradient(180deg, rgba(21,32,56,.78), rgba(13,20,37,.72));border:1px solid var(--border);border-radius:18px;padding:16px;margin:14px 0}
  .heat{display:grid;grid-template-columns:repeat(53,1fr);gap:3px}.heat div{aspect-ratio:1;border-radius:3px;background:#0f1a2e}
  .heat .l1{background:rgba(74,222,128,.18)}.heat .l2{background:rgba(74,222,128,.42)}.heat .l3{background:rgba(74,222,128,.68)}.heat .l4{background:var(--ok)}
  .chip{display:inline-flex;gap:6px;align-items:center;padding:4px 8px;border-radius:99px;background:rgba(148,163,184,.12);border:1px solid var(--border);font-size:12px;margin:2px}
  .tag{padding:2px 6px;border-radius:99px;font-size:11px;background:rgba(148,163,184,.14)}
  a{color:var(--accent)} .hidden{display:none}
</style>
<h1>LifeLensIQ — Local Admin <span style="font-size:12px;background:var(--accent);color:#062033;padding:3px 8px;border-radius:99px;vertical-align:middle">OFFLINE</span></h1>
<p class="muted">Generated ${new Date().toLocaleString()} · <b>LOCAL ONLY</b> — <code>local-data/</code> is gitignored (never on GitHub/Vercel). Mirrors Vercel dashboard per user. Open via <code>file://</code> or <code>http://localhost:${PORT}</code>.</p>
<div class="warn">🔒 Private — read with <code>serviceAccountKey.json</code> on your machine only. Delete <code>local-data/</code> when done.</div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><input id="q" placeholder="Search email, uid, domain..." style="flex:1;min-width:220px"><select id="sort" style="width:180px"><option value="score">Sort: Score</option><option value="total">Sort: Total time</option><option value="events">Sort: Events</option></select></div>
<div class="grid" id="grid"></div>
<table><thead><tr><th>#</th><th>User</th><th>Events</th><th>Score</th><th>Total</th><th>Prod</th><th>Top domain</th><th>Last active</th></tr></thead><tbody id="tbody"></tbody></table>
<div id="detail" class="hidden"></div>
<script>
const data = ${JSON.stringify({users}).replace(/</g,'\\u003c')};
const q=document.getElementById('q'), sort=document.getElementById('sort'), grid=document.getElementById('grid'), tbody=document.getElementById('tbody'), detail=document.getElementById('detail');
function fmt(s){ s=Math.round(s); if(s<60) return s+'s'; const h=Math.floor(s/3600), m=Math.floor((s%3600)/60); return h? h+'h '+m+'m' : m+'m'; }
function catColor(c){ return ({Study:'#4ade80',DSA:'#38bdf8',Development:'#818cf8',Productivity:'#fbbf24',Entertainment:'#f87171',Timepass:'#fb923c','Short-form Video':'#e879f9',Utilities:'#94a3b8'})[c]||'#64748b'; }
let selected=null;
function render(){
  const needle=q.value.toLowerCase();
  let rows=[...data.users].filter(u=> !needle || (u.email+u.uid+ (u.topDomain?.domain||'') ).toLowerCase().includes(needle));
  const s=sort.value; rows.sort((a,b)=> s==='score'? b.score-a.score : s==='total'? b.totalSec-a.totalSec : b.events-a.events);
  grid.innerHTML = rows.slice(0,12).map(u=>\`<div class="card \${selected===u.uid?'active':''}" onclick="selectUser('\${u.uid}')"><div style="display:flex;justify-content:space-between"><h3 style="margin:0">\${u.email||u.uid.slice(0,8)}</h3><span class="tag">\${u.score}/100</span></div><div class="k">\${u.uid}</div><div style="display:flex;gap:10px;margin-top:8px"><div><div class="k">Events</div><div class="v" style="font-size:16px">\${u.events}</div></div><div><div class="k">Total</div><div class="v" style="font-size:16px">\${fmt(u.totalSec)}</div></div><div><div class="k">Prod</div><div class="v" style="font-size:16px">\${fmt(u.prodSec)}</div></div></div><div class="k" style="margin-top:8px">Top: \${u.topDomain? u.topDomain.domain+' ('+fmt(u.topDomain.sec)+')' : '—'}</div></div>\`).join('');
  tbody.innerHTML = rows.map((u,i)=>\`<tr style="cursor:pointer" onclick="selectUser('\${u.uid}')"><td>\${i+1}</td><td><b>\${u.email||'—'}</b><br><span class="muted" style="font-size:11px">\${u.uid.slice(0,12)}…</span></td><td>\${u.events}</td><td>\${u.score}</td><td>\${fmt(u.totalSec)}</td><td>\${fmt(u.prodSec)}</td><td>\${u.topDomain? u.topDomain.domain: '—'}</td><td>\${u.lastActive}</td></tr>\`).join('');
}
window.selectUser = (uid)=>{
  selected=uid; render();
  const u=data.users.find(x=>x.uid===uid); if(!u) return;
  // build per-user full dashboard (like Vercel Overview)
  const byCat = u.byCat||{}; const total = Object.values(byCat).reduce((a,b)=>a+b,0)||1;
  const catBars = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([c,s])=>\`<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><span style="width:90px;font-size:12px">\${c}</span><div class="bar" style="flex:1"><div class="fill" style="width:\${Math.round(s/total*100)}%;background:\${catColor(c)}"></div></div><span style="font-size:12px;width:40px;text-align:right">\${fmt(s)}</span></div>\`).join('');
  const domains = (u.byDomain||[]).map(d=>\`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--border)"><span>\${d.domain}</span><b>\${fmt(d.sec)}</b></div>\`).join('') || '<span class="muted">No domains</span>';
  // heatmap 90 days from byDay
  const today=new Date(); today.setHours(0,0,0,0);
  let heat=''; for(let i=89;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); const k=d.toISOString().split('T')[0]; const sec=u.byDay?.[k]||0; const lv= sec===0?0: sec<1800?1: sec<3600?2: sec<7200?3:4; const cls=lv===0?'': lv===1?'l1':lv===2?'l2':lv===3?'l3':'l4'; heat+=\`<div title="\${k}: \${fmt(sec)}" class="\${cls}"></div>\`; }
  const recent = (u.recent||[]).map(ev=>\`<tr><td>\${new Date(ev.ts).toLocaleString()}</td><td>\${ev.domain||'—'}</td><td><span class="chip" style="border-color:\${catColor(ev.category)}">\${ev.category||'Other'}</span></td><td>\${fmt(ev.durationSeconds||0)}</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${ev.title||ev.path||''}</td></tr>\`).join('');
  detail.className='panel'; detail.innerHTML = \`
    <div style="display:flex;justify-content:space-between;align-items:center"><h2>\${u.email||u.uid} — Full Dashboard (like Vercel)</h2><button onclick="detail.classList.add('hidden');selected=null;render();" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--panel);color:var(--text);cursor:pointer">Close</button></div>
    <div class="grid" style="margin-top:12px">
      <div class="card"><div class="k">Productivity Score</div><div class="v" style="font-size:28px;background:linear-gradient(135deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent">\${u.score}/100</div><div class="k">\${u.prodSec? Math.round(u.prodSec/u.totalSec*100):0}% productive</div></div>
      <div class="card"><div class="k">Total time</div><div class="v">\${fmt(u.totalSec)}</div><div class="k">\${u.events} events</div></div>
      <div class="card"><div class="k">Productive</div><div class="v">\${fmt(u.prodSec)}</div><div class="k">Top: \${u.topDomain? u.topDomain.domain : '—'}</div></div>
      <div class="card"><div class="k">Last active</div><div class="v" style="font-size:14px">\${u.lastActive}</div><div class="k">\${u.displayName||''}</div></div>
    </div>
    <h3>By category (like Vercel Overview)</h3><div style="margin:8px 0">\${catBars || '<span class=muted>No data</span>'}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div><h3>Top domains (hours)</h3>\${domains}</div>
      <div><h3>Heatmap — last 90 days</h3><div class="heat">\${heat}</div><div style="display:flex;gap:4px;justify-content:flex-end;margin-top:6px;font-size:10px;color:var(--muted)"><span>Less</span><div style="width:11px;height:11px;background:#0f1a2e;border-radius:3px"></div><div style="width:11px;height:11px;background:rgba(74,222,128,.18);border-radius:3px"></div><div style="width:11px;height:11px;background:rgba(74,222,128,.42);border-radius:3px"></div><div style="width:11px;height:11px;background:var(--ok);border-radius:3px"></div><span>More</span></div></div>
    </div>
    <h3>Recent timeline (last 20)</h3><table><thead><tr><th>Time</th><th>Domain</th><th>Category</th><th>Dur</th><th>Title</th></tr></thead><tbody>\${recent||'<tr><td colspan=5 class=muted>No events</td></tr>'}</tbody></table>
    <p class="muted" style="margin-top:10px">This mirrors your Vercel deployment's Overview/Trends/Heatmap/Timeline — but 100% local. Data from <code>local-data/report.json</code>, never pushed.</p>
  \`;
  detail.scrollIntoView({behavior:'smooth'});
}
q.addEventListener('input', render); sort.addEventListener('change', render); render();
</script>
`;
  writeFileSync(join(OUT_DIR,'report.html'), html);
  console.log(`✔ Wrote ${join('local-data','report.html')}  → open it in your browser (file://)`);
  return { users };
}

const { users } = await buildReport();

if (SERVE) {
  const handler = (req,res)=>{
    try{
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname==='/' || url.pathname==='/report.html') {
        res.writeHead(200,{'Content-Type':'text/html'}); res.end(readFileSync(join(OUT_DIR,'report.html')));
      } else if (url.pathname==='/report.json') {
        res.writeHead(200,{'Content-Type':'application/json'}); res.end(readFileSync(join(OUT_DIR,'report.json')));
      } else { res.writeHead(404); res.end('not found'); }
    } catch(e){ res.writeHead(500); res.end(String(e)); }
  };
  createServer(handler).listen(PORT, ()=> console.log(`\n▶ Local viewer at http://localhost:${PORT}  (Ctrl+C to stop)\n  JSON: http://localhost:${PORT}/report.json`));
}
