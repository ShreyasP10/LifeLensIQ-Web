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
} from '../lib/stats.js';
import {
  categoryColor,
  CATEGORY_KEYS,
  isProductiveCategory,
  isDistractingCategory,
} from '../lib/categories.js';
import { todayClasses, currentClass } from '../lib/timetable.js';

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
  const streak = useMemo(() => focusStreak(events, now), [events, now]);
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
                strokeDasharray={`${(cur.score / 100) * 2 * Math.PI * 64} ${2 * Math.PI * 64}`}
                style={{ filter: 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.5))' }}
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
          <h3>Categories active</h3>
          <div className="big">{pieData.length}</div>
          <div className="sub">of {CATEGORY_KEYS.length}</div>
        </div>
        <div className="card">
          <h3>Focus streak</h3>
          <div className="big">{streak}<small style={{ fontSize: 13 }}> days</small></div>
          <div className="sub">consecutive days with activity</div>
        </div>
      </div>

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
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={2}>
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={categoryColor(d.name)} />
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
    </div>
  );
}