import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Sector,
} from 'recharts';
import {
  aggregate,
  formatDuration,
  topEntries,
  lastNDays,
  dayKeyLocal,
  eventsOnDay,
  inRange,
  comparePeriods,
  pctChange,
  focusStreak,
  daySummary,
  bestFocusWindow,
  streakForTarget,
  weekOverWeek,
  deepFocusSessions,
  formatTime,
} from '../lib/stats.js';
import {
  categoryColor,
  CATEGORY_KEYS,
  isProductiveCategory,
  isDistractingCategory,
} from '../lib/categories.js';
import { todayClasses, currentClass } from '../lib/timetable.js';
import Insights from './Insights.jsx';
import Heatmap from './Heatmap.jsx';

const RANGES = [
  ['today', 'Today'],
  ['7d', '7 days'],
  ['30d', '30 days'],
];

const STACK_COLORS = { productive: '#4ade80', neutral: '#94a3b8', distracting: '#f87171' };

function dayLabel(key, range) {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export default function Overview({ events, settings, timetable }) {
  const now = Date.now();
  const [range, setRange] = useState('7d');
const [activeSlice, setActiveSlice] = useState(null);

  const rangeDays = range === 'today' ? 1 : range === '30d' ? 30 : 7;
  const todayKey = dayKeyLocal(new Date());

  const rangeEvents = useMemo(() => {
    return range === 'today' ? eventsOnDay(events, todayKey) : inRange(events, rangeDays, now);
  }, [events, range, todayKey, rangeDays, now]);

  const cur = useMemo(() => aggregate(rangeEvents), [rangeEvents]);
  const prev = useMemo(() => {
    if (range === 'today') {
      return aggregate(eventsOnDay(events, dayKeyLocal(new Date(now - 86400000))));
    }
    return comparePeriods(events, rangeDays, now).previous;
  }, [events, range, rangeDays, now]);

  const rangeKeys = range === 'today' ? [todayKey] : lastNDays(rangeDays, now);
  const stackBars = rangeKeys.map((k) => {
    const dayEvents = eventsOnDay(events, k);
    const a = aggregate(dayEvents);
    let productive = 0;
    let distracting = 0;
    let neutral = 0;
    for (const [c, s] of Object.entries(a.byCategory)) {
      if (isProductiveCategory(c)) productive += s;
      else if (isDistractingCategory(c)) distracting += s;
      else neutral += s;
    }
    return {
      day: dayLabel(k, range),
      productive: Math.round((productive / 3600) * 10) / 10,
      neutral: Math.round((neutral / 3600) * 10) / 10,
      distracting: Math.round((distracting / 3600) * 10) / 10,
    };
  });

  const pieData = useMemo(
    () =>
      CATEGORY_KEYS.map((c) => ({ name: c, value: Math.round((cur.byCategory[c] || 0) / 60) }))
        .filter((d) => d.value > 0),
    [cur]
  );

  const topDomains = topEntries(cur.byDomain, 5);
  const summary = useMemo(() => daySummary(events, now), [events, now]);
  const focusWindow = useMemo(() => bestFocusWindow(events, { now }), [events, now]);
  const streak = useMemo(
    () => streakForTarget(events, settings.focusTargetMinutes, now),
    [events, settings.focusTargetMinutes, now]
  );
  const target = Number(settings.focusTargetMinutes) || 0;
  const wows = useMemo(
    () => (range === '7d' ? weekOverWeek(events, 7, now) : []),
    [events, range, now]
  );
  const deepCount = useMemo(
    () => (range === 'today' ? summary.deepSessions : deepFocusSessions(rangeEvents).length),
    [range, summary, rangeEvents]
  );
  const weekdayBars = useMemo(() => {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = labels.map((label) => ({ label, productive: 0, neutral: 0, distracting: 0 }));
    for (const ev of rangeEvents) {
      const dur = Number(ev.durationSeconds) || 0;
      if (dur <= 0) continue;
      const w = new Date(Number(ev.ts)).getDay();
      const c = ev.category;
      if (isProductiveCategory(c)) data[w].productive += dur / 3600;
      else if (isDistractingCategory(c)) data[w].distracting += dur / 3600;
      else data[w].neutral += dur / 3600;
    }
    return data.map((r) => ({
      ...r,
      productive: Math.round(r.productive * 10) / 10,
      neutral: Math.round(r.neutral * 10) / 10,
      distracting: Math.round(r.distracting * 10) / 10,
    }));
  }, [rangeEvents]);
  const scoreDelta = cur.score - prev.score;
  const activePct = pctChange(cur.totalSeconds, prev.totalSeconds);
  const classes = todayClasses(timetable);
  const current = currentClass(timetable);
  const rangeLabel = range === 'today' ? 'today' : `last ${rangeDays} days`;

  const tooltipStyle = {
    background: 'var(--tooltip-bg)',
    border: '1px solid var(--tooltip-border)',
    borderRadius: 10,
  };

  return (
    <div>
      {range === 'today' && (
        <div className="panel day-summary">
          <div className="head-row">
            <h2>Today at a glance</h2>
            <span className="muted">{formatTime(now)}</span>
          </div>
          <div className="summary-stats">
            <div>
              <span className="label">Study / productive</span>
              <strong>{formatDuration(summary.studySeconds)}</strong>
            </div>
            <div>
              <span className="label">Shorts / reels</span>
              <strong>{formatDuration(summary.shortsSeconds)}</strong>
            </div>
            <div>
              <span className="label">Deep focus sessions</span>
              <strong>{summary.deepSessions}</strong>
            </div>
            <div>
              <span className="label">Productivity score</span>
              <strong>{summary.score}</strong>
            </div>
          </div>
          {focusWindow && (
            <p className="hint">
              Typical best focus window (last 14 days):{' '}
              <b>{focusWindow.start}:00 – {focusWindow.end}:00</b> — schedule your hardest work there.
            </p>
          )}
        </div>
      )}

      <div className="panel">
        <div className="head-row">
          <h2>{range === 'today' ? 'Today' : `Last ${rangeDays} days`} · Productivity Score</h2>
          <div className="range-pills">
            {RANGES.map(([key, label]) => (
              <button
                key={key}
                className={range === key ? 'active' : ''}
                onClick={() => setRange(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ring-wrap">
          <div className="ring">
            <svg width="150" height="150">
              <circle cx="75" cy="75" r="64" stroke="var(--ring-track)" strokeWidth="13" fill="none" />
              <circle
                cx="75" cy="75" r="64"
                stroke="#38bdf8"
                strokeWidth="13" fill="none"
                strokeLinecap="round"
                className="ring-fg"
                strokeDasharray={`${(cur.score / 100) * 2 * Math.PI * 64} ${2 * Math.PI * 64}`}
              />
            </svg>
            <div className="val">
              {cur.score}<small>/100</small>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="row">
              <span>Active time ({rangeLabel})</span><strong>{formatDuration(cur.totalSeconds)}</strong>
            </div>
            <div className="row">
              <span>Productive time</span><strong>{formatDuration(cur.productiveSeconds)}</strong>
            </div>
            <div className="row">
              <span>Shorts/reels</span><strong>{formatDuration(cur.shortsSeconds)}</strong>
            </div>
            <div className="row">
              <span>Writing sessions</span><strong>{formatDuration(cur.writingSeconds)}</strong>
            </div>
            {range === 'today' && current && (
              <div className="row">
                <span>Now in class</span>
                <strong style={{ color: 'var(--accent)' }}>
                  {current.subject} · {current.room}
                </strong>
              </div>
            )}
            <div className="trend-row">
              <span className={`trend ${scoreDelta >= 0 ? 'up' : 'down'}`}>
                Score {scoreDelta >= 0 ? '▲' : '▼'} {Math.abs(scoreDelta)} pts vs previous
                {range === 'today' ? ' day' : ` ${rangeDays}d`}
              </span>
              <span className={`trend ${activePct === null ? '' : activePct >= 0 ? 'up' : 'down'}`}>
                {activePct === null
                  ? 'No prior data to compare'
                  : `Active time ${activePct >= 0 ? '+' : ''}${activePct}% vs previous period`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Insights events={events} days={range === 'today' ? 1 : rangeDays} />

      {range === 'today' && classes.length > 0 && (
        <div className="panel">
          <h2>Today's Classes (from timetable)</h2>
          <table>
            <thead>
              <tr><th>Time</th><th>Subject</th><th>Room</th><th>Batch</th></tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={`${c.startTime}-${c.subject}`} className={current && current.subject === c.subject && current.startTime === c.startTime ? 'now' : ''}>
                  <td>{c.startTime}–{c.endTime}</td>
                  <td>{c.subject} {c.elective && <span className="elective">PE-1</span>}</td>
                  <td>{c.room}</td>
                  <td>{c.batch}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>Screen time — daily ({rangeLabel}, hours)</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stackBars}>
                <XAxis dataKey="day" stroke="var(--muted)" fontSize={11} />
                <YAxis stroke="var(--muted)" fontSize={11} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, name) => [`${v} h`, name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => (
                    <span style={{ color: 'var(--muted)', marginRight: 8 }}>{value}</span>
                  )}
                />
                <Bar dataKey="productive" stackId="a" fill={STACK_COLORS.productive} radius={[0, 0, 0, 0]} />
                <Bar dataKey="neutral" stackId="a" fill={STACK_COLORS.neutral} />
                <Bar dataKey="distracting" stackId="a" fill={STACK_COLORS.distracting} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="legend-line">
            {Object.entries(STACK_COLORS).map(([name, color]) => (
              <span key={name} className="chip">
                <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
                {name}
              </span>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>By category ({rangeLabel}, minutes)</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  className="pie-hover"
                  activeIndex={activeSlice}
                  activeShape={(p) => (
                    <Sector {...p} outerRadius={p.outerRadius + 8} />
                  )}
                  onMouseEnter={(_, i) => setActiveSlice(i)}
                  onMouseLeave={() => setActiveSlice(null)}
                >
                  {pieData.map((d, i) => (
                    <Cell
                      key={d.name}
                      fill={categoryColor(d.name)}
                      opacity={activeSlice === null || activeSlice === i ? 1 : 0.35}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="hint" style={{ textAlign: 'center' }}>
            {pieData.slice(0, 4).map((d) => (
              <span key={d.name} className="chip" style={{ margin: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: categoryColor(d.name) }} />
                {d.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h3>Events ({rangeLabel})</h3>
          <div className="big">{cur.count}</div>
        </div>
        <div className="card">
          <h3>Top domain ({rangeLabel})</h3>
          <div className="big" style={{ fontSize: 18 }}>{topDomains[0]?.name || '—'}</div>
          <div className="sub">{topDomains[0] ? formatDuration(topDomains[0].seconds) : 'no data'}</div>
        </div>
        <div className="card">
          <h3>Deep focus sessions</h3>
          <div className="big">{deepCount}</div>
          <div className="sub">≥ 30 min on one site, no 5-min gaps</div>
        </div>
        <div className="card">
          <h3>Focus streak</h3>
          <div className="big">
            <span className="flame">🔥</span> {streak}<small style={{ fontSize: 13 }}> days</small>
          </div>
          <div className="sub">
            {target ? `≥ ${target} min/day (set in Settings)` : 'any activity (set a target in Settings)'}
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>By weekday ({rangeLabel}, hours)</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayBars}>
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} />
                <YAxis stroke="var(--muted)" fontSize={11} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, name) => [`${v} h`, name]}
                />
                <Bar dataKey="productive" stackId="a" fill={STACK_COLORS.productive} />
                <Bar dataKey="neutral" stackId="a" fill={STACK_COLORS.neutral} />
                <Bar dataKey="distracting" stackId="a" fill={STACK_COLORS.distracting} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {wows.length > 0 && (
        <div className="panel">
          <div className="head-row">
            <h2>Week over week — last 7d vs previous 7d</h2>
            <span className="muted">per category, by time spent</span>
          </div>
          <div className="list-inline">
            {wows.map((w) => (
              <span key={w.category} className="chip">
                {w.category}
                <b style={{ color: w.change === null ? 'var(--muted)' : w.change >= 0 ? 'var(--danger)' : 'var(--ok)' }}>
                  {' '}{w.change === null ? 'new' : `${w.change >= 0 ? '+' : ''}${w.change}%`}
                </b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Activity calendar — last 365 days</h3>
        <Heatmap events={events} days={365} />
      </div>
    </div>
  );
}