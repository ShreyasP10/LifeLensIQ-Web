# 09 — Firestore Data Schema: Web Dashboard & Browser Extension

| | |
|---|---|
| Version | 1.0 |
| Date | 10 Aug 2026 |
| Status | Draft |
| Related | 03_Data_Schema.md (app/global model), 07_PRD, 08_TRD |

> Conventions (from project README): **all timestamps are epoch milliseconds (UTC)** stored as numbers. Cloud storage is Firestore; the extension mirrors events locally in `chrome.storage.local`.

---

## 1. Collections Overview

```
users/{uid}                      ← per-user root (uid = Firebase Auth UID)
├── settings                     (doc)    user preferences
├── events/{eventId}             (collection) raw activity events — THE ML dataset
├── dailyStats/{date}            (collection) pre-aggregated rolls (date = 'YYYY-MM-DD')
└── timetable                    (doc)    college timetable (from agent program)

leaderboard/{uid}                (collection) score-only rows
```

---

## 2. users/{uid}/settings (doc)

| Field | Type | Notes |
|-------|------|-------|
| email | string | display convenience |
| createdAt | number | epoch ms |
| domainCategories | map<string,string> | user override: `"github.com": "Development"` |
| shortUrlLength | number (default 1) | per-day leaderboard freshness (future) |
| updatedAt | number | epoch ms |

---

## 3. users/{uid}/events/{eventId} — the ML dataset

`eventId` = `crypto.randomUUID()` generated on the extension.

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| id | string | `"3f2a…"` | eventId |
| ts | number | `1754812800000` | segment start, epoch ms UTC |
| endTs | number | `1754813100000` | segment end, epoch ms UTC |
| durationSeconds | number | `300` | `(endTs - ts) / 1000` |
| domain | string | `"github.com"` | lowercased, no www |
| path | string | `"/owner/repo"` | full path (stored plain in prototype) |
| pathHash | string | `"9b74…"` (sha-256) | future privacy mode |
| title | string | `"README · owner/repo"` | tab title |
| category | string | `"Development"` | one of the 9 categories |
| eventType | string | `"short_video"` | `tab_active` \| `short_video` \| `pdf_view` \| `writing_session` |
| metadata | map | see below | typed extras |
| device | string | `"extension"` | `extension` \| `android` |
| schemaVersion | number | `1` | for future migrations |

### metadata sub-fields

| eventType | metadata keys | Notes |
|-----------|---------------|-------|
| `short_video` | `{views: 3, seconds: 180}` | shorts/reels consumed in segment |
| `writing_session` | `{typingBursts: 24}` | keyboard bursts counted |
| `pdf_view` | `{pdf: true}` | marker |
| `tab_active` | — | plain browsing segment |

---

## 4. users/{uid}/dailyStats/{date}

Pre-aggregated by the dashboard on demand (and later by a Cloud Function).

| Field | Type | Notes |
|-------|------|-------|
| date | string | `"2026-08-10"` |
| totalSeconds | number | active time |
| productiveSeconds | number | weighted-productive sum |
| byCategory | map<string,number> | seconds per category |
| byDomain | map<string,number> | seconds per domain (top 20 kept) |
| shortsSeconds | number | short-form video seconds |
| writingSeconds | number | writing-session seconds |
| score | number | 0–100 productivity score |
| updatedAt | number | epoch ms |

---

## 5. users/{uid}/timetable (doc)

Format matches the output the agent's `fetch_timetable.py` should produce. The dashboard accepts an array of entries (file upload or paste).

| Field | Type | Example |
|-------|------|---------|
| source | string | `"TE-B_Timetable_Detailed.html"` |
| generatedAt | number | epoch ms |
| batch | string | `"B1"` |
| entries | array<object> | see row shape |

### entry row shape

| Field | Type | Example |
|-------|------|---------|
| day | string | `"Monday"` |
| startTime | string | `"09:30"` (24 h) |
| endTime | string | `"10:30"` |
| subject | string | `"Internet Programming"` |
| room | string | `"C-302"` |
| faculty | string | `"Prof. X"` |
| batch | string | `"B1"` |
| elective | boolean | `true` for PE-1 subjects |
| group | string | `"A"` / `"B"` if split |

---

## 6. leaderboard/{uid}

| Field | Type | Notes |
|-------|------|-------|
| displayName | string | user-chosen (default email prefix) |
| score | number | 0–100 |
| totalSeconds | number | last 7 days active time |
| sampleDays | number | days with data in last 7 |
| lastUpdated | number | epoch ms |

Rules: anyone may read; only the owner may write (and only the 5 score fields above).

---

## 7. Export Formats (ML consumption)

### 7.1 events CSV (raw)

```csv
eventId,ts,endTs,durationSeconds,domain,path,title,category,eventType,device,metadata
3f2a...,1754812800000,1754813100000,300,github.com,/owner/repo,"README · owner/repo",Development,tab_active,extension,"{}"
3f2b...,1754814000000,1754814300000,300,youtube.com,/shorts/abc,Shorts,Short-form Video,short_video,extension,"{""views"":1,""seconds"":300}"
```

### 7.2 events JSON (raw)

```json
{
  "exportedAt": 1754900000000,
  "schemaVersion": 1,
  "range": { "from": "2026-08-01", "to": "2026-08-07" },
  "count": 1234,
  "events": [ { "id": "…", "ts": 1754812800000, "endTs": 1754813100000, "durationSeconds": 300, "domain": "github.com", "path": "/owner/repo", "title": "README · owner/repo", "category": "Development", "eventType": "tab_active", "device": "extension", "metadata": {} } ]
}
```

### 7.3 stats JSON (aggregated)

```json
{
  "exportedAt": 1754900000000,
  "range": { "from": "2026-08-01", "to": "2026-08-07" },
  "totals": { "totalSeconds": 216000, "productiveSeconds": 72000, "score": 33.3 },
  "byDay": { "2026-08-01": { "totalSeconds": 28800, "score": 30 } },
  "byCategory": { "Development": 40000, "Entertainment": 90000 },
  "byDomain": { "github.com": 30000 }
}
```

---

## 8. Firestore Index Requirements (prototype)

| Query | Index |
|-------|-------|
| `events where ts >= X and ts < Y order by ts desc` | composite on `(ts desc)` — add via console if prompted |
| `leaderboard order by score desc limit 25` | composite on `(score desc)` |

Both are one-click auto-suggestions in the Firebase Console when the first query fails.

---

## 9. Version History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 10 Aug 2026 | Initial schema for web + extension |
