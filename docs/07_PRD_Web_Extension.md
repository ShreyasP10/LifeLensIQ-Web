# 07 — Product Requirements Document (PRD): Web Dashboard & Browser Extension

| | |
|---|---|
| Version | 1.0 |
| Date | 10 Aug 2026 |
| Status | Draft |
| Author | TE Computer Engineering, Div B, Batch B1 (Internet Programming PE-1) |
| Scope | Chrome Extension (data capture) + Web Dashboard (visualisation, export, account) |
| Related | 01_PRD.md, 03_Data_Schema.md, 04_Architecture_Design.md, 06_Roadmap.md |

---

## 1. Product Vision

A **privacy-first, passive lifelogging system** that runs inside the browser and on the web:

- The **Chrome extension** silently captures meaningful digital activity (sites visited, short-form video consumption, PDF reading, writing sessions, idle gaps).
- The **web dashboard** turns that raw stream into categorised timelines, statistics, a productivity score, a leaderboard, and — critically — **CSV/JSON exports** that feed the final-year ML model.
- **All data lives in the user's own Firebase project** (Firestore), protected by per-user security rules. No third-party server, no analytics vendor, no data leakage.

The prototype's success criterion is not features — it is **data quality**. Every activity must be captured accurately with timestamp (epoch ms UTC), duration, domain, and category so the ML pipeline (study-schedule adherence, phone usage correlation, focus prediction) can be trained on trustworthy labels.

### 1.1 Goals (prototype)

| # | Goal | Measure |
|---|------|---------|
| G1 | Capture every meaningful browser activity passively | ≥ 95% of active tab time accounted for in Firestore events |
| G2 | Category accuracy for core buckets (Study, DSA, Development, Entertainment, Social, Productivity) | ≥ 90% of events auto-classified without manual edits |
| G3 | Zero manual logging | User never has to enter an activity manually |
| G4 | ML-ready export | Raw events exportable to CSV/JSON at any time, for any date range |
| G5 | Multi-device readiness | Same schema as the Android app (03_Data_Schema.md) so both sync into one `users/{uid}` tree |
| G6 | Privacy | Full URLs never leave the device unencrypted; security rules isolate every user's data |

### 1.2 Non-goals (prototype)

- No social network / sharing of raw data.
- No ML inference inside the dashboard (charts are rule-based; ML happens offline in Jupyter).
- No Android app work in this repo (that is a sibling project; schema is shared).
- No billing/paid tiers, no multi-team support.

---

## 2. Users & Personas

**Persona 1 — The Data Scientist (you).** Owns the Firebase project. Needs:
- a complete, timestamped, labelled dataset of own digital behaviour;
- quick exports to CSV/JSON for Pandas notebooks;
- ability to tune category rules (domain → category overrides);
- the college timetable overlaid on activity for context.

**Persona 2 — Early Tester (friends).** Signs up with email/Google. Needs:
- one-click sign-in, sees only their own data;
- at-a-glance today/week productivity score;
- opt-in leaderboard (score only, no breakdown).

**Persona 3 — The Model (consumes data).** The ML pipeline in `05_ML_Data_Strategy.md` consumes the exported events; it needs stable field names, epoch-ms timestamps, no PII, and enough volume (weeks × days).

---

## 3. User Stories

| ID | As a… | I want to… | So that… | Priority |
|----|-------|-----------|----------|----------|
| US-01 | user | install one extension and forget about it | all browsing is tracked automatically | P0 |
| US-02 | user | sign in to the dashboard with my email or Google account | my data is isolated and private | P0 |
| US-03 | user | see today's timeline colour-coded by category | I understand how my day is split | P0 |
| US-04 | user | see today / 7-day / 30-day stats | I track trends | P0 |
| US-05 | user | see my productivity score and what drives it | I can act on it | P0 |
| US-06 | user | download raw data as CSV and JSON for any date range | I feed it to my ML notebooks | P0 |
| US-07 | user | know shorts/reels watch time separately | I see the "doom-scrolling" component | P0 |
| US-08 | user | set my own domain → category rules | classification matches my reality | P1 |
| US-09 | user | have my sync buffer hold data while offline | nothing is lost on flaky Wi-Fi | P0 |
| US-10 | user | see my college timetable on the dashboard | activity has context (class vs free time) | P1 |
| US-11 | user | compare score anonymously on a leaderboard | friendly accountability | P2 |
| US-12 | user | delete all my data with one click | privacy control (GDPR-style) | P1 |

---

## 4. Functional Requirements

Priorities: **P0** = prototype must-have · **P1** = v1 production must-have · **P2** = nice to have.

### 4.1 Chrome Extension — Tracking

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-EXT-01 | Track active tab changes: on switch, record URL, domain, title, tab id, and compute time spent (epoch ms UTC start/end). | P0 |
| FR-EXT-02 | Accumulate active time only when the browser is not idle (idle threshold 15 s). Pause on idle, resume on activity. | P0 |
| FR-EXT-03 | Detect short-form video: `youtube.com/shorts/*`, `instagram.com/reel/*`, `facebook.com/reels/*`. Count each unique short viewed and total watch seconds. | P0 |
| FR-EXT-04 | Detect PDF viewing: tab URL ends in `.pdf` (or `file://` PDFs) → eventType `pdf_view`. | P0 |
| FR-EXT-05 | Detect writing sessions on `docs.google.com`, `office.com`, `live.com` (OneDrive/Word Online): keyboard burst heuristics from a content script → eventType `writing_session`. | P0 |
| FR-EXT-06 | Record browser session gaps: gap ≥ 5 min between events = new session. | P0 |
| FR-EXT-07 | Buffer events in `chrome.storage.local` and batch-sync to Firestore every 2 min when online; keep queue on failure (cap 20 000 events). | P0 |
| FR-EXT-08 | Discard segments < 5 s (noise) but keep all others. | P0 |
| FR-EXT-09 | Auto-classify each event into Study / DSA / Development / Productivity / Entertainment / Social / Short-form Video / Utilities / Other using built-in rules + user overrides. | P0 |
| FR-EXT-10 | Store only `domain + path` locally; store domain + hashed path (SHA-256) in cloud unless the user opts into full URLs. | P1 |
| FR-EXT-11 | Keep extension running reliably under Manifest V3: `chrome.alarms` wakes the service worker; all state survives worker restarts (persisted in `chrome.storage.local`). | P0 |
| FR-EXT-12 | Popup shows login state, today's local summary, pending-sync count, and buttons (Open Dashboard, Sync Now, Logout). | P1 |
| FR-EXT-13 | Options page to manage domain → category overrides (saved to Firestore settings + local cache). | P1 |

### 4.2 Web Dashboard — Data Presentation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-WEB-01 | Auth with Firebase: email/password **and** Google Sign-In. | P0 |
| FR-WEB-02 | Overview page: productivity score ring, today's numbers (active time, by-category, shorts time, writing time), 7-day bar chart, today's category pie. | P0 |
| FR-WEB-03 | Timeline page: scrollable event list for a selected date, colour-coded by category, with domain, duration, and title. | P0 |
| FR-WEB-04 | Stats page: 7-day and 30-day tables (total time, productive time, per-category totals, top domains). | P1 |
| FR-WEB-05 | Leaderboard page: opt-in, score-only ranking across users (from `/leaderboard` collection). | P2 |
| FR-WEB-06 | Timetable page: upload/paste timetable JSON (agent-generated, e.g. from `fetch_timetable.py`), preview, save to `users/{uid}/timetable`, and show today's classes. | P1 |
| FR-WEB-07 | Settings page: domain → category override editor, account info, sign out, **delete all my data**. | P1 |
| FR-WEB-08 | Realtime updates: listen to Firestore so new events appear within seconds. | P0 |

### 4.3 Data Export

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-EXP-01 | CSV export of raw events for a selected date range. Columns: `eventId, ts (epoch ms UTC), endTs, durationSeconds, domain, path, title, category, eventType, device, metadataJSON`. | P0 |
| FR-EXP-02 | JSON export of raw events (pretty-printed array, same fields, epoch ms). | P0 |
| FR-EXP-03 | JSON export of aggregated stats (by day, by category, by domain, score) for a date range. | P1 |
| FR-EXP-04 | Exports are generated client-side (fetch paginated, then Blob download); no server round-trip. | P0 |
| FR-EXP-05 | Show record count + date range before download. | P1 |

### 4.4 Authentication & Account

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-AUTH-01 | Email/password sign-in in both dashboard and extension (shared Firebase Auth project). | P0 |
| FR-AUTH-02 | Google Sign-In on the dashboard. | P1 |
| FR-AUTH-03 | Extension keeps the user signed in across browser restarts (custom persistence backed by `chrome.storage.local`). | P0 |
| FR-AUTH-04 | Firestore security rules guarantee a user can only read/write `users/{their-uid}/**`. | P0 |
| FR-AUTH-05 | Auto-create `users/{uid}/settings` on first sign-in. | P0 |

---

## 5. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | Performance (extension) | No measurable impact on page load; tick alarm ≤ 60 s; no heavy DOM work in background |
| NFR-02 | Performance (dashboard) | First meaningful paint < 3 s on broadband; timeline renders 1 000 events without jank (virtualised list) |
| NFR-03 | Data integrity | Event timestamps are epoch ms UTC (client clock); buffered events never dropped except by explicit user deletion |
| NFR-04 | Security | Firestore rules deny cross-user reads; API keys are Firebase public config only (safe by design) |
| NFR-05 | Privacy | Full URLs hashed (SHA-256) before cloud write by default; plain URLs only in local storage; no third-party analytics |
| NFR-06 | Reliability | Sync retries with backoff; buffer survives service-worker restarts |
| NFR-07 | Scalability | 2 000–5 000 events/day/user supported; dashboard queries capped at 5 000 recent docs with pagination for exports |
| NFR-08 | Offline | Extension buffers and resumes; dashboard read-only offline state handled gracefully |
| NFR-09 | Maintainability | Shared event schema module between extension & dashboard; single source of truth for categories |
| NFR-10 | Cost | All within Firebase free tier (Spark): ≤ 50k reads/day, ≤ 20k writes/day |

### 5.1 Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| MV3 service worker killed mid-session | Persist session state in `chrome.storage.local` after every change; recover on alarm tick |
| Firebase Auth IndexedDB quirks in MV3 | Custom persistence adapter using `chrome.storage.local` |
| SPA URL changes not firing `tabs.onUpdated` | Content scripts announce shorts/writing via messages; background verifies with `tabs.get` on tick |
| Clock skew (epoch ms from device) | Document limitation for prototype; ML features use durations + relative deltas, not absolute times |
| Firestore write limits with high-frequency events | Batch writes (≤ 450 ops/commit), 1 event per tab segment, never per-second writes |

---

## 6. Success Metrics (Prototype)

| Metric | Target |
|--------|--------|
| Coverage: % of active browser time represented in Firestore | ≥ 95% |
| Auto-classification accuracy on a 1-week hand-labelled sample | ≥ 90% |
| Data loss on forced offline test (30 min offline) | 0 events |
| End-to-end export → notebook load | CSV opens in Pandas without cleanup |
| ML dataset volume after 4 weeks of personal use | ≥ 30 000 events |

---

## 7. Out of Scope (later versions)

- ML scoring in-app, anomaly alerts, smart scheduling.
- Android app (sibling project).
- Multi-user sharing, team workspaces.
- In-app data visualisation beyond prototypes (e.g. Sankey of time flow).

---

## 8. Version History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 10 Aug 2026 | Initial draft |
