# 08 — Technical Requirements Document (TRD): Web Dashboard & Browser Extension

| | |
|---|---|
| Version | 1.0 |
| Date | 10 Aug 2026 |
| Status | Draft |
| Scope | Implementation blueprint for the Chrome extension and web dashboard |
| Related | 07_PRD_Web_Extension.md, 09_Firestore_Schema.md, 03_Data_Schema.md |

---

## 1. Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Browser extension | **Chrome MV3, plain ES modules source, bundled with esbuild** | MV3 is the only supported manifest; esbuild keeps the build trivial (no config) |
| Extension data layer | **Firebase JS SDK v10 (modular)** — `firebase/auth`, `firebase/firestore` | Same API as dashboard; serverless sync |
| Extension storage | `chrome.storage.local` (session + event buffer) | Survives service-worker restarts, quota 10 MB (≈ 20 000 events) |
| Dashboard | **React 18 + Vite 5** | Fast dev server, trivial build, good for a prototype that grows |
| Charts | **Recharts** | Declarative, React-native, pie/bar/line out of the box |
| Export | **PapaParse** (CSV) + native Blob downloads | Reliable CSV escaping |
| Styling | **Plain CSS (single stylesheet)** | Zero build complexity; Tailwind can come later |
| Auth | Firebase Auth (email/password + Google OAuth popup) | Free, integrated with Firestore rules |
| Database | Cloud Firestore (native mode) | Realtime listeners, security rules, free tier |
| Hosting | Firebase Hosting (dashboard), Chrome Web Store unlisted (extension) | Static hosting + CDN; deploy via `firebase deploy` |
| Functions | None in prototype; optional later for heavy exports | Keep cost = 0 |
| Node tooling | Node 22, npm | Available on dev machine |

---

## 2. System Architecture

```
┌────────────────────────────┐      ┌──────────────────────────────┐
│  CHROME EXTENSION (MV3)    │      │  WEB DASHBOARD (React/Vite)  │
│                            │      │                              │
│  ┌─────────────┐  ┌──────┐ │      │  Login ─┐                    │
│  │ background  │  │ popup│ │      │  ┌──────┴──────┐              │
│  │ service wk  │  │options││      │  │ Overview    │              │
│  └──────┬──────┘  └──────┘ │      │  │ Timeline    │  Firebase    │
│  ┌──────┴──────┐           │      │  │ Export      │  JS SDK     │
│  │ content     │           │      │  │ Leaderboard │              │
│  │ scripts     │           │      │  │ Timetable   │              │
│  └─────────────┘           │      │  │ Settings    │              │
└───────────┬────────────────┘      └──────────┬───────────────────┘
            │ Firestore SDK (batch writes)     │ Firestore SDK (listeners)
            ▼                                  ▼
   ┌────────────────────────────────────────────────────┐
   │            CLOUD FIRESTORE (user's project)        │
   │  users/{uid}/events  users/{uid}/dailyStats        │
   │  users/{uid}/settings  users/{uid}/timetable       │
   │  leaderboard/{uid}                                 │
   │  security rules: user can touch only their own     │
   └────────────────────────────────────────────────────┘
            │
            ▼  (offline, later)  CSV / JSON → Jupyter → ML model (05_ML_Data_Strategy.md)
```

**Design principles**

1. **No backend server.** All reads/writes go straight from client to Firestore. Authentication is enforced by rules, not by an API layer.
2. **One schema, two clients.** The extension and dashboard share the event shape defined in `09_Firestore_Schema.md`; the Android app will append events into the same tree.
3. **Capture is local-first.** The extension writes to `chrome.storage.local` immediately and syncs in batches; the dashboard is purely a reader + exporter.
4. **Realtime by listener, not by poll.** Dashboard subscribes with `onSnapshot`; extension never listens (writes only) — this keeps the service worker cheap.

---

## 3. Repository Layout

```
LifeLensIQ-Web/
├── docs/                     # 01..06 (app), 07..09 (web/extension)
├── extension/                # Chrome extension (buildable)
│   ├── manifest.json         # source manifest (paths relative to dist/)
│   ├── package.json          # dev deps: esbuild, firebase
│   ├── scripts/build.mjs     # esbuild bundle + static copy → dist/
│   ├── assets/icons/         # generated PNG icons
│   └── src/
│       ├── background.js     # service worker: capture, buffer, sync
│       ├── content/shorts.js # shorts/reels announcement
│       ├── content/writing.js# keyboard-burst detection
│       ├── popup/            # popup.html/css/js
│       ├── options/          # options.html/css/js (domain overrides)
│       └── shared/           # firebase.js, firebase-config.js, schema.js, categories.js
└── dashboard/                # React dashboard
    ├── package.json, vite.config.js, index.html
    ├── firestore.rules, firebase.json
    └── src/
        ├── main.jsx, App.jsx, firebase.js, config.js
        ├── lib/ (categories.js, stats.js, export.js, timetable.js)
        └── components/ (Login, Overview, Timeline, ExportPanel,
                         Leaderboard, TimetablePage, SettingsPage, shared UI)
```

---

## 4. Chrome Extension Design

### 4.1 Manifest (MV3) — key decisions

- `permissions: ["storage", "tabs", "idle", "alarms"]`
- `host_permissions: ["<all_urls>"]` — needed to read `tab.url` for arbitrary sites.
- Content scripts:
  - `content-shorts.js` on `*://*.youtube.com/*`, `*://*.instagram.com/*`, `*://*.facebook.com/*`
  - `content-writing.js` on `*://docs.google.com/*`, `*://*.office.com/*`, `*://*.live.com/*`
- Background: single `service_worker` (bundled to IIFE — no `"type": "module"` needed).
- Popup + Options pages are plain HTML loading bundled JS.

### 4.2 Background service worker (src/background.js)

State model (persisted in `chrome.storage.local`):

```
session = {
  tabId, domain, path, title,
  eventType: 'tab_active'|'short_video'|'pdf_view'|'writing_session',
  category,                    // computed from rules + overrides
  startTs, lastTs,             // epoch ms
  typingBursts,                // count for writing heuristics
  shorts: { views, seconds },
  device: 'extension'
}
buffer = [ event, ... ]        // unsynced events, cap 20 000
```

Capture loop:

1. `tabs.onActivated` / `tabs.onUpdated` (url/title change) → flush current segment, open a new one.
2. `idle.onStateChanged('idle')` → flush + pause; `'active'` → resume tracking on next tick.
3. `chrome.alarms.create('tick', {periodInMinutes: 1})` → wake worker, advance `lastTs` for the current tab (also refreshes `title`), check PDF URL, then trigger sync attempt.
4. Content-script messages (`short_view`, `typing_burst`) mutate the open segment in place.
5. Flush rule: drop segments < 5 s; else push event with `durationSeconds = (lastTs - startTs)/1000` and `endTs = lastTs`.

Sync (`syncBuffer`):

- If `buffer.length > 0` and `getAuth().currentUser` exists and `navigator.onLine` → chunk 450 events into `writeBatch` commits to `users/{uid}/events/{id}`; remove committed ids from buffer. On failure, leave buffer intact (retry on next tick). Exponential backoff: skip sync for `2^n` ticks after failures.

PDF detection: on tick, if `tab.url` matches `/(\.pdf$)|(^file:\/\/.*\.pdf)/i` and current segment is `tab_active`, upgrade to `pdf_view`.

### 4.3 Content script: shorts/reels (src/content/shorts.js)

- Runs at `document_idle` on YouTube/Instagram/Facebook.
- Polls `location.href` every 1.5 s; when URL matches `/(youtube\.com\/shorts\/|instagram\.com\/reel\/|facebook\.com\/reels\/)/` and differs from `lastAnnouncedUrl`, sends `{type:'short_view', url}` to the background.
- Background increments `session.shorts.views` and switches the segment to `eventType: 'short_video'`, `category: 'Short-form Video'`. Watch seconds are the segment duration — accurate because shorts replace the whole page.

### 4.4 Content script: writing (src/content/writing.js)

- Counts `keydown` events. Every 12 keystrokes in a 15 s rolling window → sends `{type:'typing_burst', count:12}`.
- Background adds to `session.typingBursts` and, if the domain is a document workspace (`docs.google.com`, `office.com`, `live.com`), upgrades the segment to `eventType:'writing_session'`.

### 4.5 Popup

Shows: auth state (email or sign-in form), today's local totals (sum of buffered segments for today — fast, no network), pending sync count, buttons: Open Dashboard, Sync Now, Options, Sign out.

### 4.6 Options page

Editable list of `domain → category` overrides. Saved to `users/{uid}/settings` (Firestore) **and** `chrome.storage.local` (`categoryOverrides`) so classification works offline.

### 4.7 Authentication in the extension

- **Custom persistence adapter** (avoids MV3/IndexedDB quirks):

```js
export const chromeStoragePersistence = {
  type: 'lifeiq-chrome-storage',
  async _get() { return (await chrome.storage.local.get('authToken')).authToken; },
  async _set(token, user) { await chrome.storage.local.set({ authToken: token, authUser: user }); },
  async _remove() { await chrome.storage.local.remove(['authToken', 'authUser']); },
};
// setPersistence(auth, chromeStoragePersistence) once, at startup
```

- Sign-in happens in the **popup** (email/password). Background reads the same session from `chrome.storage.local`, so `onAuthStateChanged` fires in both contexts.

### 4.8 Build (scripts/build.mjs)

- esbuild bundles: `background.js`, `content-shorts.js`, `content-writing.js`, `popup/popup.js`, `options/options.js` → `dist/` (IIFE, target chrome110).
- Static copy: `manifest.json`, popup/options HTML+CSS, icons.
- Output `dist/` is the loadable extension folder ("Load unpacked").

---

## 5. Web Dashboard Design

### 5.1 App shell (src/App.jsx)

- `useAuthState(auth)` gate: unauthenticated → `<Login/>`; authenticated → `<Dashboard/>` with tab nav (Overview · Timeline · Export · Leaderboard · Timetable · Settings).
- Single CSS file, dark theme, category colours from one shared palette (matches extension).

### 5.2 Data access (src/firebase.js, src/lib/)

| Module | Responsibility |
|--------|----------------|
| `firebase.js` | `initializeApp`, `getAuth`, `getFirestore` exports |
| `lib/categories.js` | Category definitions, weights, `classify(domain, overrides)` (same rules as extension) |
| `lib/stats.js` | Pure functions: `aggregate(events, range)` → `{totalSeconds, byCategory, byDay, byDomain, shortsSeconds, writingSeconds, productiveSeconds, score}` |
| `lib/export.js` | `toCSV(events)` (PapaParse), `toJSON(events)`, `download(blob, filename)` |
| `lib/timetable.js` | Parse agent-generated timetable JSON → `{day, startTime, endTime, subject, room, batch, elective}` entries; helpers `todayClasses(timetable)` |

**Productivity score** (rule-based, ML later):

```
score = 100 × Σ(weight(category) × seconds(category)) / totalSeconds
weights: Study 1.0, DSA 1.0, Development 1.0, Productivity 0.8,
         Utilities 0.3, Other 0.2, Social 0.1, Entertainment 0.05, Short-form Video 0
```

### 5.3 Pages

| Page | Behaviour |
|------|-----------|
| **Login** | Email/password form + Google popup; on success auto-ensure `users/{uid}/settings` exists |
| **Overview** | Score ring (SVG circle), stat cards (Today: active, productive, shorts, writing), 7-day bar chart (Recharts), today's category pie (Recharts), top 5 domains today |
| **Timeline** | Date picker (default today); `query(events, where ts in [start,end], orderBy ts desc, limit 5000)`; virtualised-ish capped list (render 500 + "load more"); colour strip per category |
| **Export** | Range picker (from/to date), live count query, buttons: CSV raw · JSON raw · JSON stats |
| **Leaderboard** | `collection('leaderboard')` ordered by `score` desc, limit 25; own row highlighted; button "refresh my score" writes current score (own doc only) |
| **Timetable** | Textarea paste or file upload (JSON from agent's `fetch_timetable.py`); validate + preview table; save to `users/{uid}/timetable`; show today's classes card on Overview |
| **Settings** | Override editor (add/remove domain→category), sign out, **Delete all my data** (batch delete events + settings + leaderboard doc with confirmation dialog) |

### 5.4 Export implementation

1. Fetch events in the range paginated (5000/page via `startAfter`).
2. CSV: fixed column order, `metadata` flattened to JSON string; Papa `unparse`.
3. JSON: `JSON.stringify({exportedAt, range, schemaVersion, events}, null, 2)`.
4. Blob download with `Content-Disposition` filename `lifeiq-events-YYYY-MM-DD_YYYY-MM-DD.csv/.json`.

---

## 6. Firebase Project Setup (required before anything works)

1. console.firebase.google.com → Add project `lifeiq` (or any name).
2. Enable **Authentication**: Email/Password + Google providers.
3. Enable **Cloud Firestore** (native, `asia-south1` or nearest region).
4. Register a **Web app** → copy `firebaseConfig` into:
   - `extension/src/shared/firebase-config.js`
   - `dashboard/src/config.js`
5. Deploy security rules (`dashboard/firestore.rules`) via Firebase Console **or** `firebase deploy --only firestore:rules`.
6. Dashboard deploy: `cd dashboard && npm run build && firebase deploy --only hosting`.
7. Extension: `cd extension && npm install && npm run build` → `chrome://extensions` → Developer mode → Load unpacked → select `extension/dist`.

---

## 7. Firestore Security Rules (abridged — full in dashboard/firestore.rules)

```
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
match /leaderboard/{uid} {
  allow read: if true;                    // score-only visibility
  allow write: if request.auth.uid == uid && onlyScoreFields(request.resource.data);
}
```

---

## 8. Testing & Verification

| Area | Method |
|------|--------|
| Extension tracking | Manual: switch tabs, idle 20 s, watch segments in popup; inspect Firestore docs |
| Buffer/offline | DevTools offline, browse 10 min, go online, verify zero loss |
| Rules | Console "simulate" for a second UID → expect deny |
| Dashboard | `npm run dev`, log in with test user, verify timeline + charts |
| Export | Export week of data, `pandas.read_csv` locally, assert column set |
| Builds | `npm run build` in both projects, zero errors |

---

## 9. Deployment

| Artifact | Target | Command |
|----------|--------|---------|
| Dashboard | Firebase Hosting | `firebase deploy --only hosting` |
| Extension | Chrome Web Store (unlisted) or load unpacked | `npm run build` → zip `dist/` |
| Rules | Firestore | `firebase deploy --only firestore:rules` |

---

## 10. Version History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 10 Aug 2026 | Initial draft |
