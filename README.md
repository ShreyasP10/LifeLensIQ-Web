# LifeIQ — Life Intelligence Quotient

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

## Setup (one-time)

### 1. Firebase project

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Enable **Authentication** → Sign-in method → enable **Email/Password** and **Google**.
3. Enable **Cloud Firestore** (native mode).
4. Add a **Web app** (`</>`) → copy the `firebaseConfig` object.

### 2. Paste your Firebase config

| File | Field |
|------|-------|
| `extension/src/shared/firebase-config.js` | `FIREBASE_CONFIG` |
| `dashboard/src/config.js` | `FIREBASE_CONFIG` |

### 3. Deploy security rules

```
cd dashboard
npm install
npx firebase login
npx firebase deploy --only firestore:rules
```

(Or paste `dashboard/firestore.rules` into Console → Firestore → Rules.)

### 4. Run the dashboard

```
cd dashboard
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
npx firebase deploy --only hosting   # deploy
```

### 5. Load the extension

```
cd extension
npm install
npm run build      # bundles into extension/dist/
```

Then: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `extension/dist`.

Open the extension popup → **Sign in** with your Firebase account. Tracking starts automatically.

### 6. Import the timetable (optional)

Run the agent's timetable program to produce JSON in the shape described in `docs/09_Firestore_Schema.md §5`, then on the dashboard → **Timetable** → paste or upload.

## Export for ML

Dashboard → **Export** → choose range → **CSV (raw)** / **JSON (raw)** / **JSON (stats)**. The raw events CSV opens directly in `pandas.read_csv()`:

```python
import pandas as pd
df = pd.read_csv("lifeiq-events-2026-08-01_2026-08-07.csv")
```

See `docs/05_ML_Data_Strategy.md` and `docs/09_Firestore_Schema.md §7` for the expected fields.

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

### Conventions

- Requirement IDs: FR-xx, NFR-xx, DR-xx, ML-xx.
- Priorities: **P0** (prototype must-have), **P1** (v1 production must-have), **P2** (nice to have).
- All timestamps stored as **epoch milliseconds (UTC)** in cloud, rendered device-local in UI.
- First version date: **10 Aug 2026**.
