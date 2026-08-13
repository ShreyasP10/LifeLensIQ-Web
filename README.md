# LifeLensIQ — Life Intelligence Quotient

**Personal life-data collection app (prototype → production)** for building an ML model that computes and improves your *Life Intelligence Quotient*.

> Owner: TE Computer Engineering student (Division B, Batch B1, Program Elective-1: Internet Programming).
> Motivation: the final-year ML model needs real personal data (study schedule adherence, phone usage, class attendance, productivity patterns). This repo is the **web half** of the data-collection prototype: a **Chrome extension** (passive browser activity capture) + a **React web dashboard** (visualisation, export, account). The Android app is a sibling project; both share one Firestore schema.

## Repo Layout

| Path | What it is |
|------|-----------|
| `docs/01..06` | App docs (PRD, TRD, data schema, architecture, ML strategy, roadmap) |
| `docs/07_PRD_Web_Extension.md` | PRD — dashboard + extension |
| `docs/08_TRD_Web_Extension.md` | TRD — dashboard + extension |
| `docs/09_Firestore_Schema.md` | Firestore schema for web + extension (shared with app) |
| `extension/` | Chrome extension (MV3). Captures activity → Firestore |
| `dashboard/` | React + Vite dashboard. Auth, stats, charts, CSV/JSON export |
| `TE-B.pdf` | Official college timetable (source of truth) |
| `fetch_timetable.py` | Agent-built parser → full + personalised (B1/IP) timetable |
| `TE-B_Timetable_Detailed.html` | Human-readable timetable document |

## System at a Glance

- **Extension** passively tracks active tabs, time per domain, idle gaps, YouTube Shorts / Instagram / Facebook Reels, PDF viewing, and writing sessions (keyboard heuristics on Docs/Office). Buffers offline in `chrome.storage.local`, batch-syncs to Firestore.
- **Dashboard** (Firebase Hosting) provides login (email/password + Google), colour-coded timelines, category stats, a productivity score, opt-in leaderboard, college timetable import (from the agent's `fetch_timetable.py` output), and **CSV/JSON export** for ML training.
- **All data** lives in `users/{uid}/…` in **your own** Firebase project, isolated by Firestore security rules.

## Features (v0.4)

**Dashboard**
- Overview with a **Today / 7 days / 30 days** range switcher: score ring, stacked daily bar chart (productive vs neutral vs distracting), category pie, trend badges (score + active time vs the previous period), a **focus streak** counter, an **AI-ready insights panel** (top-site trend vs previous period, most/least productive weekday, peak hour, late-night usage, distracting-time share) and a **GitHub-style productivity heatmap** (26 weeks, weighted by category).
- Timeline with **category filter chips** (with counts), event-type filter, free-text search, pagination, and a per-site **Analyse drilldown** (per-hour pattern, weekday comparison, 14-day trend) — click the Analyse button on any event.
- **Log tab for manual entry** — record non-browser activities (mobile, offline study, phone calls) tagged `eventType = "manual"`; they flow into every view and the ML export.
- Leaderboard with user search and sort by score or active time.
- Export fetches **paged ranges (1000 docs/page, up to 100k events)**, plus a dedicated **ML dataset export**: engineered rows (hour, day_of_week, day_segment, duration, gap_seconds, prev_category, is_productive…) split chronologically **70/15/15** into `train.csv`, `val.csv`, `test.csv` (no temporal leakage) with a schema `manifest.json` documenting class distribution per split.
- **Light/Dark theme toggle** (persisted in localStorage) — charts, tooltips, and all components adapt.

**Extension**
- Popup shows the **live tracked session** (domain + elapsed time), a mini bar breakdown of today's activity by category, pending-sync count, **last sync time**, online/offline status, and a **Pause/resume tracking** toggle (privacy).
- Sync hardening: last-sync timestamp persisted, exponential backoff on repeated chunk failures, offline detection (skips attempts while disconnected).
- `getState` message API lets the popup query background state instead of guessing from stale local data.
- **Light/Dark theme toggle** (persisted in chrome.storage) in popup and options page.
- Smart categorisation: AI assistants → Productivity, PDFs → Study, College Moodle → Study, Instagram/X/Reddit → Timepass, GitHub/LinkedIn → Productivity.

## Quick Start for Users (No Code)

### 1. Install the Extension
1. Download the latest `extension-dist.zip` from [Releases](https://github.com/ShreyasP10/LifeLensIQ-Web/releases) (or build: `cd extension && npm run build`).
2. Unzip the folder.
3. Open `chrome://extensions` → toggle **Developer mode** (top right) → **Load unpacked** → select the unzipped `dist` folder.
4. Pin the **LifeLensIQ Tracker** icon to your toolbar.

### 2. Open the Dashboard
Go to **https://lifelensiq-dashboard.web.app** (or your deployed URL) — no install needed.

### 3. Create an Account
- Click **Sign up** on the dashboard.
- Use **Email/Password** or **Continue with Google**.

### 4. Sign In on the Extension
- Click the LifeLensIQ icon in Chrome → **Sign in** with the same account.
- You're live — browse normally. The popup shows your **live session**, today's minutes, pending sync, last sync time, and a **Pause** switch.

### 5. View Your Data
Open the dashboard → tabs: **Overview** (score, charts, heatmap, insights, streak), **Timeline** (filter/search + Analyse drilldown), **Leaderboard** (opt-in), **Timetable** (import your class schedule), **Log** (manual entries), **Export** (raw CSV/JSON + ML train/val/test dataset), **Settings** (category overrides).

### 6. Export for Your ML Model
Dashboard → **Export** → pick date range → **CSV (raw)**, **JSON (raw)**, **JSON (stats)**, or **ML dataset** — the last downloads `train.csv`, `val.csv`, `test.csv` (chronological 70/15/15 split) plus `manifest.json` with the schema and per-split class distribution, ready for `pandas.read_csv()`.

---

## Setup for Developers (Full Build & Deploy)

### Prerequisites
- Node.js 18+
- Firebase CLI: `npm i -g firebase-tools`
- A Firebase project (or use the shared one)

### 1. Firebase Project Setup
1. Go to [Firebase Console](https://console.firebase.google.com) → **Add project**.
2. **Authentication** → Sign-in method → enable **Email/Password** and **Google**.
3. **Firestore Database** → Create database → Native mode → Production mode.
4. **Project Settings** → Your apps → **Web app (`</>`)** → copy the `firebaseConfig` object.

### 2. Configure Keys (Demo Mode Works Without)
> **Demo mode:** if no keys are configured, the dashboard runs instantly with realistic sample data stored locally in your browser. Add keys when ready.

| File | Action |
|------|--------|
| `dashboard/.env` | Copy `dashboard/.env.example` → fill the 6 `VITE_FIREBASE_*` values. Restart `npm run dev`. |
| `extension/src/shared/firebase-config.js` | Paste the same `firebaseConfig` object into `FIREBASE_CONFIG`. |

> Never commit `.env` — it is git-ignored.

### 3. Deploy Security Rules
```bash
cd dashboard
npm install
npx firebase login
npx firebase deploy --only firestore:rules
```
(Or paste `dashboard/firestore.rules` into Console → Firestore → Rules.)

### 4. Run Dashboard Locally
```bash
cd dashboard
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npm run test       # unit tests (vitest) — stats, categories, timetable, export, demo-db
```

### 5. Build & Load Extension
```bash
cd extension
npm install
npm run build      # bundles into extension/dist/
```
Then: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/dist`.

### 6. Deploy Dashboard to Firebase Hosting
```bash
cd dashboard
npx firebase deploy --only hosting
```
Gives you a live URL like `https://lifelensiq-xxxx.web.app`.

### 7. (Optional) Import Timetable
Run `fetch_timetable.py` to produce JSON (see `docs/09_Firestore_Schema.md §5`), then on the dashboard → **Timetable** → paste or upload.

---

## GitHub Setup (CI/CD)

### Repository Secrets
Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `FIREBASE_SERVICE_ACCOUNT` | JSON from Firebase Console → Project Settings → Service Accounts → Generate new private key |
| `FIREBASE_PROJECT_ID` | Your Firebase project ID (e.g., `signupsignin-5aea1`) |

### Workflows Included
| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `.github/workflows/dashboard.yml` | Push to `main`, PR to `main` | Install deps → `npm run test` → `npm run build` → deploy to Firebase Hosting (on `main`) |
| `.github/workflows/extension.yml` | Push to `main`, PR to `main` | Install deps → `npm run build` → upload `dist/` as artifact; on `main`, create GitHub Release with `extension-dist.zip` |

### First Push
```bash
git init
git add .
git commit -m "feat: initial LifeLensIQ v0.4 — dashboard + extension + smart analytics + ML dataset export"
git branch -M main
git remote add origin https://github.com/ShreyasP10/LifeLensIQ-Web.git
git push -u origin main
```
The workflows will run automatically.

---

## Data Flow & Architecture

See `flow.md` for a detailed diagram and explanation of:
- Extension capture → buffer → sync → Firestore
- Dashboard real-time listeners → UI updates
- Export pagination → ML-ready CSV/JSON
- Theme persistence (localStorage / chrome.storage)
- Categorisation rules and override flow

---

## Export for ML (Reference)

```python
import pandas as pd
df = pd.read_csv("lifelensiq-events-2026-08-01_2026-08-07.csv")
# Columns: id, ts, endTs, durationSeconds, domain, path, title, category,
# eventType, device, schemaVersion, metadata (JSON)
```

Stats JSON includes: `totals`, `byDay`, `byHour`, `byWeekday`, `byEventType`, `topDomains`, `categoryMetrics` (weighted productive seconds per category).

The **ML dataset** rows add engineered features per event: `day_of_week`, `is_weekend`, `hour`, `minute`, `day_segment`, `duration_minutes`, `nth_event_of_day`, `gap_seconds`, `prev_category`, `prev_duration_minutes`, `is_productive`. Splits are chronological — train (oldest), val, test (newest) — so no future information leaks into training.

---

## Documentation Index

| # | Document | Status |
|---|----------|--------|
| 1 | `01_PRD.md` | Draft |
| 2 | `02_TRD.md` | Draft |
| 3 | `03_Data_Schema.md` | Draft |
| 4 | `04_Architecture_Design.md` | Draft |
| 5 | `05_ML_Data_Strategy.md` | Draft |
| 6 | `06_Roadmap.md` | Draft |
| 7 | `07_PRD_Web_Extension.md` | Draft |
| 8 | `08_TRD_Web_Extension.md` | Draft |
| 9 | `09_Firestore_Schema.md` | Draft |
| 10 | `flow.md` | **Auto-generated / current** |

---

### Conventions

- Requirement IDs: FR-xx, NFR-xx, DR-xx, ML-xx.
- Priorities: **P0** (prototype must-have), **P1** (v1 production must-have), **P2** (nice to have).
- All timestamps stored as **epoch milliseconds (UTC)** in cloud, rendered device-local in UI.
- Version: **0.4.0** (2026-08-13).