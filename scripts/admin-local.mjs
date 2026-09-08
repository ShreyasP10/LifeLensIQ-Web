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
    // fetch events (cap 5000 per user to keep local fast)
    const snap = await db.collection(`users/${uid}/events`).orderBy('ts','desc').limit(5000).get().catch(()=>({docs:[]}));
    const events = snap.docs.map(d=>d.data());
    // aggregate
    let totalSec=0, prodSec=0, byCat={}, byDomain={}, lastTs=0;
    for (const ev of events) {
      const s = Number(ev.durationSeconds)||0;
      totalSec+=s;
      const w = ({Study:1,DSA:1,Development:1,Productivity:0.9}[ev.category] ?? 0.2);
      if (w>=0.9) prodSec+=s;
      byCat[ev.category||'Other']=(byCat[ev.category||'Other']||0)+s;
      if (ev.domain) byDomain[ev.domain]=(byDomain[ev.domain]||0)+s;
      if (Number(ev.ts)>lastTs) lastTs=Number(ev.ts);
    }
    const topDomain = Object.entries(byDomain).sort((a,b)=>b[1]-a[1])[0];
    const score = totalSec ? Math.round((prodSec/totalSec)*100) : 0;
    users.push({
      uid, email: u.email||'', displayName: u.displayName||'',
      createdAt: u.metadata.creationTime,
      lastSignIn: u.metadata.lastSignInTime,
      events: events.length,
      totalSec, prodSec, score,
      byCat, topDomain: topDomain? {domain:topDomain[0], sec:topDomain[1]}: null,
      lastActive: lastTs? new Date(lastTs).toLocaleString(): '—'
    });
    console.log(`  • ${u.email||uid} → ${events.length} events, score ${score}, ${fmt(totalSec)} total`);
  }

  users.sort((a,b)=> b.score - a.score);

  mkdirSync(OUT_DIR,{recursive:true});
  writeFileSync(join(OUT_DIR,'report.json'), JSON.stringify({generatedAt: new Date().toISOString(), users}, null, 2));
  console.log(`\n✔ Wrote ${join('local-data','report.json')}`);

  // --- build self-contained HTML ---
  const html = `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LifeLensIQ — Local Admin (OFFLINE)</title>
<style>
  :root{--bg:#0a0f1c;--panel:#111a2e;--border:#1e2d4a;--text:#e6edf7;--muted:#8b9bb4;--accent:#38bdf8}
  *{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--text);padding:24px}
  h1{margin:0 0 6px;font-size:22px} .muted{color:var(--muted);font-size:13px}
  .warn{background:#1a2a12;border:1px solid #2a4a1a;color:#a3e635;padding:10px 14px;border-radius:10px;margin:14px 0;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:18px}
  .card{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:14px}
  .card h3{margin:0 0 4px;font-size:15px} .k{color:var(--muted);font-size:12px} .v{font-size:20px;font-weight:800}
  table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}
  th{color:var(--muted);text-align:left;font-size:11px;letter-spacing:.05em;padding:8px;border-bottom:1px solid var(--border)}
  td{padding:8px;border-bottom:1px solid rgba(255,255,255,.06)} tr:hover td{background:rgba(255,255,255,.03)}
  input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:#070c18;color:var(--text);margin:14px 0}
  a{color:var(--accent)}
</style>
<h1>LifeLensIQ — Local Admin Viewer</h1>
<p class="muted">Generated ${new Date().toLocaleString()} · <b>LOCAL ONLY</b> — this file is in <code>local-data/</code> (gitignored, never pushed to GitHub/Vercel). Open via <code>file://</code> or <code>http://localhost:${PORT}</code>.</p>
<div class="warn">🔒 Offline & private — data was read with <code>serviceAccountKey.json</code> on your machine only. Delete <code>local-data/</code> when done. Do NOT commit it.</div>
<input id="q" placeholder="Search email, uid, domain...">
<div class="grid" id="grid"></div>
<table><thead><tr><th>#</th><th>User</th><th>Events</th><th>Score</th><th>Total</th><th>Productive</th><th>Top domain</th><th>Last active</th></tr></thead><tbody id="tbody"></tbody></table>
<script>
const data = ${JSON.stringify({users}).replace(/</g,'\\u003c')};
const q=document.getElementById('q'), grid=document.getElementById('grid'), tbody=document.getElementById('tbody');
function fmt(s){ s=Math.round(s); if(s<60) return s+'s'; const h=Math.floor(s/3600), m=Math.floor((s%3600)/60); return h? h+'h '+m+'m' : m+'m'; }
function render(){
  const needle=q.value.toLowerCase();
  const rows=data.users.filter(u=> !needle || (u.email+u.uid+ (u.topDomain?.domain||'') ).toLowerCase().includes(needle));
  grid.innerHTML = rows.slice(0,6).map(u=>\`<div class="card"><h3>\${u.email||u.uid.slice(0,8)}</h3><div class="k">\${u.uid}</div><div style="display:flex;gap:12px;margin-top:8px"><div><div class="k">Score</div><div class="v">\${u.score}</div></div><div><div class="k">Events</div><div class="v">\${u.events}</div></div><div><div class="k">Total</div><div class="v">\${fmt(u.totalSec)}</div></div></div><div class="k" style="margin-top:8px">Top: \${u.topDomain? u.topDomain.domain+' ('+fmt(u.topDomain.sec)+')' : '—'}</div></div>\`).join('');
  tbody.innerHTML = rows.map((u,i)=>\`<tr><td>\${i+1}</td><td><b>\${u.email||'—'}</b><br><span class="muted" style="font-size:11px">\${u.uid}</span></td><td>\${u.events}</td><td>\${u.score}</td><td>\${fmt(u.totalSec)}</td><td>\${fmt(u.prodSec)}</td><td>\${u.topDomain? u.topDomain.domain: '—'}</td><td>\${u.lastActive}</td></tr>\`).join('');
}
q.addEventListener('input', render); render();
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
