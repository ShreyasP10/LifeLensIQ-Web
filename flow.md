# LifeLensIQ Data Flow & Architecture

## Overview

This document describes the end-to-end data flow from browser activity capture to ML-ready exports, including the categorisation logic, sync pipeline, and theme persistence.

---

## 1. Extension Capture Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BROWSER TAB ACTIVITY                         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  chrome.tabs.onActivated / onUpdated / chrome.idle / alarms.tick   │
│  (every 1 min, on idle, on tab switch, on URL change)              │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SEGMENT LIFECYCLE (background.js)               │
│  • openSegment()  – new domain/tab → create segment with eventId   │
│  • flushSegment() – on tab switch, idle, pause, tick               │
│    - duration < 5s → discarded                                      │
│    - classify() with overrides → category                          │
│    - buildEvent() → {id, ts, endTs, durationSeconds, domain, ...}  │
│    - COALESCE: if last buffer event same site/type/category        │
│      and gap ≤ 45s → merge (extend endTs, sum duration)            │
│    - push to chrome.storage.local buffer (max 20k)                 │
└─────────────────────────────────────────────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │ Content      │    │ Writing      │    │ chrome.alarms│
   │ scripts:     │    │ heuristic:   │    │ tick (1 min):│
   │ shorts.js    │    │ keydown      │    │ flush + sync │
   │ (YouTube     │    │ bursts ≥12   │    │ (if online & │
   │  Shorts,     │    │ in 15s →     │    │ not paused)  │
   │  Reels)      │    │ typing_burst │    │              │
   └──────────────┘    └──────────────┘    └──────────────┘
            │                   │                   │
            └───────────────────┼───────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SYNC BUFFER → FIRESTORE                          │
│  • Chunk size: 450 docs per batch write                            │
│  • Exponential backoff (1–5 min) on failures                       │
│  • Skip if navigator.onLine === false                              │
│  • On success: remove committed IDs, update lastSyncTs             │
│  • Safe buffer write (quota fallback: trim to 2k, then clear)      │
└─────────────────────────────────────────────────────────────────────┘
```

### Categorisation Rules (`extension/src/shared/categories.js`)

| Category | Weight | Key Domains |
|----------|--------|-------------|
| **Study** | 1.0 | moodle.org, elearn.apsit.edu.in, coursera, nptel, khanacademy, byjus, unacademy |
| **DSA** | 1.0 | leetcode, codeforces, hackerrank, codechef, geeksforgeeks, cses |
| **Development** | 1.0 | stackoverflow, mdn, stackblitz, codesandbox, w3schools, kaggle, huggingface, colab, replit |
| **Productivity** | 0.9 | docs/sheets/slides/drive/gmail/google, notion, todoist, github, gitlab, linkedin, **AI: chatgpt, claude, gemini, deepseek, perplexity, copilot, poe, grok** |
| **Entertainment** | 0.05 | youtube (watch), netflix, prime, spotify, twitch |
| **Timepass** | 0.05 | instagram, x/twitter, facebook, whatsapp, telegram, discord, reddit, snapchat |
| **Short-form Video** | 0 | youtube.com/shorts, /reels, /reel |
| **Utilities** | 0.3 | google search, wikipedia, translate, maps, paytm |
| **Other** | 0.2 | fallback |

**Override Precedence**: user overrides → exact domain match → suffix match (e.g. `mail.google.com` → `google.com`) → built-in rules → `Other`.

**PDF Handling**: `pdf_view` eventType defaults to **Study** unless domain rules say otherwise (e.g. Drive PDF → Productivity, LeetCode PDF → DSA).

---

## 1b. App ↔ Web Shared Event Contract

All clients (Android app, Chrome extension, web dashboard) read and write the **same flat**
`users/{uid}/events` collection — one event = one doc, doc id == `eventId` (UUID), written with
`set()` so retries are idempotent.

Shared envelope (`lib/events.js` on web, FirestoreEventSource on Android):

```
id: string        (= eventId)      eventId: string  (UUID)
userId: string    deviceId: string
device: "android" | "web"          ts: epoch ms     timestamp: number (= ts)
endTs: number     durationSeconds: number
eventType: string                  category: string (shared vocabulary)
domain: string (package/host)      path: string     title: string
metadata: object                   schemaVersion: 1
```

- **Dashboard reads**: `App.jsx` maps every doc through `normalizeEvent()` (tolerant of both
  app-style `eventId/timestamp` and web-style `id/ts` keys; null domain, empty metadata ok).
  No view filters by device — app + extension + manual data aggregate together.
- **Dashboard writes**: Manual Entry writes via `buildWebEvent()` (device `web`, uuid eventId);
  `STUDY_SESSION` payloads carry `{subject, startedAt, endedAt, durationMs, locationType}`
  so the Android app's productive calendar counts them.
- **Extension writes**: `shared/schema.js` emits the same envelope (device `web`, plus
  `eventId`/`timestamp`/`userId`) so the app's dedupe-by-eventId works.
- **Category vocabulary** is identical on both sides: Study, DSA, Development, Productivity,
  Entertainment, Timepass, Short-form Video, Utilities, Other.

## 1c. v0.5 Features

- **Day summary** (Overview, Today): study, shorts, deep-focus sessions, score at a glance.
- **Focus streak with target**: daily productive-minute target set in Settings; streak counts
  only days meeting it (`streakForTarget`).
- **Week-over-week deltas** (7d view) and **per-weekday stacked bars**.
- **Shorts : Study ratio** insight; **domain transitions** ("after youtube.com you usually switch
  to leetcode.com within N min"); **anomaly alerts** bell (2–5 AM screen time, 3h+ distraction
  runs) with dismiss.
- **Focus-window prediction**: `predictFocusWindow` (14-day hourly productive profile, top 3h)
  rendered as a strip on the heatmap with confidence.
- **Deep-focus sessions**: ≥ 30 min on one domain without 5-min gaps — gold badge in Timeline,
  counter in Overview.
- **PWA**: manifest + service worker + icons (installable, offline shell).
- **Sync health** (Settings): per-device last-seen/counts, legacy docs, duplicate eventIds.
- **Extension**: Focus mode with allowlist (blocked tabs redirect to `focus.html`, events tagged
  `metadata.focus`), Pomodoro 25/5 timer writing `POMODORO` events, weekly study-vs-shorts nudge
  in the popup, YouTube distraction-free toggle (hides home feed + related).

## 2. Dashboard Real-Time Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FIRESTORE COLLECTIONS                       │
│  users/{uid}/events (ordered by ts desc)                           │
│  users/{uid}/settings/profile {domainCategories, email, ...}       │
│  users/{uid}/timetable/data {entries[], batch, source}             │
│  leaderboard/{uid} {displayName, score, totalSeconds, sampleDays}  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│              DASHBOARD ADAPTER (dashboard/src/firebase.js)          │
│  • live = isConfigured() → real Firebase SDK                       │
│  • demo = localStorage shim (demo-db.js) with seeded 7-day data    │
│  • Unified API: collection, doc, query, where, orderBy, limit,     │
│    onSnapshot, getDocs, setDoc, deleteDoc, writeBatch,             │
│    onAuthStateChanged, signIn*, signOut                            │
│  • startAfter support for paginated export                         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    REACT COMPONENTS (real-time)                     │
│  App.jsx: onAuthStateChanged → loads events/settings/timetable     │
│  Overview: aggregate(range) → score, stacked bars, pie, streak     │
│  Timeline: eventsOnDay + filters (category chips, type, search)    │
│  Leaderboard: onSnapshot(leaderboard) + local myScore              │
│  Export: paginated getDocs with startAfter cursor (1k/page, 100k)  │
│  Settings: domainCategories overrides → Firestore + local          │
│  Timetable: JSON import → normalise → save to Firestore            │
└─────────────────────────────────────────────────────────────────────┘
```

### Aggregation (`dashboard/src/lib/stats.js`)

- `aggregate(events)`: totals, byCategory, byDomain, byDay, byHour, byWeekday, byEventType, shorts/writing/pdf seconds, productiveSeconds (weighted), score.
- `focusStreak(events)`: consecutive days with activity (skips today if empty).
- `comparePeriods(events, days)`: current vs previous equal-length window → trend deltas.
- `buildStatsReport(events, range)`: ML-ready export payload (totals, byHour, byWeekday, byEventType, categoryMetrics with weighted productive seconds).

---

## 3. Export Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│  ExportPanel: user picks [from, to]                                │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PAGINATED FETCH (1000 docs/page, max 100k)                        │
│  while (true) {                                                     │
│    q = where(ts>=from, ts<=to).orderBy(ts desc).limit(1000)        │
│    if (lastDoc) q = q.startAfter(lastDoc)                          │
│    snap = await getDocs(q)                                         │
│    if (snap.empty) break                                           │
│    out.push(...snap.docs.map(d=>d.data()))                         │
│    lastDoc = snap.docs[snap.docs.length-1]                         │
│    if (snap.docs.length < 1000 || out.length >= 100000) break      │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
    ┌───────────┐       ┌───────────┐       ┌───────────┐
    │ CSV (raw) │       │ JSON      │       │ JSON      │
    │ events    │       │ (raw)     │       │ (stats)   │
    └───────────┘       └───────────┘       └───────────┘
    PapaParse        toRawJSON()          buildStatsReport()
            │
            ▼
    ┌───────────────────────────────────────────────┐
    │ ML DATASET (buildMLDataset @ lib/ml.js)       │
    │ engineerFeatures: chronological rows with     │
    │   hour, day_of_week, is_weekend, day_segment, │
    │   duration, nth_event_of_day, gap_seconds,    │
    │   prev_category, prev_duration, is_productive │
    │ splitMLRows: train 70% / val 15% / test 15%  │
    │   (time-ordered → no temporal leakage)        │
    │ outputs: train.csv, val.csv, test.csv,        │
    │          manifest.json (schema + class dist)  │
    └───────────────────────────────────────────────┘
```

**Stats JSON includes**: `totals`, `byDay`, `byHour`, `byWeekday`, `byEventType`, `byCategory`, `byDomain`, `topDomains`, `categoryMetrics` (seconds, weight, productiveSeconds per category).

---

## 3b. Insights & Drilldowns

- **Insights** (`lib/insights.js` → `components/Insights.jsx`): rule-based summaries over the live range events — top-domain trend vs previous period (`pctChange`), most/least productive weekday (productive-weighted), peak hour (`byHour`), late-night usage share, distracting-time share, daily average, streak status, today-vs-average. Capped at 8 cards, rendered in Overview.
- **Heatmap** (`components/Heatmap.jsx`): 26-week product of category-weighted seconds per day → 5 intensity levels; placed in Overview.
- **Manual entry** (`components/ManualEntry.jsx`): writes an event doc (`eventType: "manual"`) into `users/{uid}/events` via `setDoc`; realtime listeners pick it up instantly.
- **Site drilldown** (`components/SiteDrilldown.jsx`): Timeline "Analyse" button → modal with per-hour pattern, weekday comparison, and 14-day trend for a single domain.

---

## 4. Theme Persistence

| Platform | Storage | Key | Values | Applied On |
|----------|---------|-----|--------|------------|
| Dashboard | localStorage | `lifelensiq.theme` | `light` \| `dark` | `main.jsx` → `initTheme()` before render |
| Popup | chrome.storage.local | `lifelensiq_theme` | `light` \| `dark` | `popup.js` → `initTheme()` on open |
| Options | chrome.storage.local | `lifelensiq_theme` | `light` \| `dark` | `options.js` → `initTheme()` on open |

CSS uses `html[data-theme='light']` overrides for all color variables.

---

## 5. Auth & Security Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  SIGN IN (Email/Password or Google)                                 │
│  → Firebase Auth → UID                                              │
│  → ensureSettingsDoc(uid) creates users/{uid}/settings/profile     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FIRESTORE RULES (dashboard/firestore.rules)                        │
│  match /users/{uid}/{doc=**} { allow read, write: if request.auth.uid == uid; } │
│  match /leaderboard/{uid} { allow read: if true; allow write: if request.auth.uid == uid; } │
└─────────────────────────────────────────────────────────────────────┘
```

- Each user's data isolated under `users/{uid}/...`
- Leaderboard: opt-in write (publish my score), public read.

---

## 6. Offline & Resilience

| Scenario | Handling |
|----------|----------|
| Offline (no network) | Extension buffers locally; `syncBuffer()` skips when `!navigator.onLine`; dashboard demo mode works fully offline via localStorage. |
| Sync failure | Exponential backoff (1m, 2m, 3m, 4m, 5m max); retries on next tick. |
| Storage quota | `safeSetBuffer()`: on quota error → trim to last 2k events; if still fails → clear buffer (last resort). |
| Segment fragmentation | `flushSegment()` coalesces consecutive same-site/type/category segments within 45s gap. |
| Auth token expiry | Firebase SDK auto-refreshes; `onAuthStateChanged` keeps UI in sync. |

---

## 7. File → Component Map

| File | Responsibility |
|------|----------------|
| `extension/src/background.js` | Capture lifecycle, sync, pause, getState/setPause messages |
| `extension/src/popup.js` | UI: live session, pause toggle, theme, sync now |
| `extension/src/options.js` | Override management + theme |
| `extension/src/shared/categories.js` | Classifier rules, weights, colors |
| `extension/src/shared/schema.js` | Event builder, eventId |
| `dashboard/src/App.jsx` | Auth guard, tab routing, theme toggle |
| `dashboard/src/components/Overview.jsx` | Score ring, stacked bars, pie, streak, trends |
| `dashboard/src/components/Timeline.jsx` | Filtered event list, chips, search |
| `dashboard/src/components/Leaderboard.jsx` | Live leaderboard + my score publish |
| `dashboard/src/components/ExportPanel.jsx` | Paged fetch + 3 download formats |
| `dashboard/src/components/SettingsPage.jsx` | Overrides editor, danger zone |
| `dashboard/src/components/TimetablePage.jsx` | JSON import + preview |
| `dashboard/src/lib/stats.js` | All aggregations, streak, trends, report builder |
| `dashboard/src/lib/export.js` | CSV/JSON/Stats serializers |
| `dashboard/src/lib/demo-db.js` | localStorage shim + seeded demo data |
| `dashboard/src/lib/theme.js` | Theme get/set/toggle + init |
| `dashboard/src/lib/ml.js` | ML feature engineering, chronological split, manifest |
| `dashboard/src/lib/insights.js` | Rule-based insight generation |
| `dashboard/src/components/SiteDrilldown.jsx` | Per-domain drilldown modal (hour/weekday/14d) |
| `dashboard/src/components/Heatmap.jsx` | 26-week productivity heatmap |
| `dashboard/src/components/Insights.jsx` | Insight card grid |
| `dashboard/src/components/ManualEntry.jsx` | Manual activity logging (Log tab) |

---

## 8. Version History

| Version | Date | Key Changes |
|---------|------|-------------|
| 0.1.0 | 2026-08-10 | Initial prototype: extension + dashboard + demo mode |
| 0.2.0 | 2026-08-11 | Analytics (range, streak, trends), popup revamp, pause, export pagination, tests |
| 0.3.0 | 2026-08-12 | Light/dark theme, smart categorisation (AI, PDF, Moodle, Timepass, GitHub), GitHub CI/CD, flow docs |
| 0.4.0 | 2026-08-13 | ML dataset export (train/val/test + manifest), site drilldowns, productivity heatmap, AI-ready insights, manual entry (Log tab) |

---

*Generated 2026-08-13 — reflects code state after v0.4 features.*