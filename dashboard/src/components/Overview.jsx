import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import {
  aggregate,
  formatDuration,
  topEntries,
  lastNDays,
  dayKeyLocal,
  eventsOnDay,
} from '../lib/stats.js';
import { categoryColor, CATEGORY_KEYS } from '../lib/categories.js';
import { todayClasses, currentClass } from '../lib/timetable.js';

export default function Overview({ events, settings, timetable }) {
  const now = Date.now();

  const todayKey = dayKeyLocal(new Date());
  const todayEvents = useMemo(() => eventsOnDay(events, todayKey), [events, todayKey]);
  const today = useMemo(() => aggregate(todayEvents), [todayEvents]);

  const weekKeys = lastNDays(7, now);
  const week = useMemo(() => aggregate(events), [events]);
  const weekBars = weekKeys.map((k) => ({
    day: k.slice(5).replace('-', '/'),
    seconds: Math.round(((week.byDay[k] || 0) / 3600) * 10) / 10,
  }));

  const pieData = useMemo(
    () =>
      CATEGORY_KEYS.map((c) => ({ name: c, value: Math.round((today.byCategory[c] || 0) / 60) }))
        .filter((d) => d.value > 0),
    [today]
  );

  const topDomains = topEntries(today.byDomain, 5);
  const classes = todayClasses(timetable);
  const current = currentClass(timetable);

  return (
    <div>
      <div className="panel">
        <h2>Today · Productivity Score</h2>
        <div className="ring-wrap">
          <div className="ring">
            <svg width="140" height="140">
              <circle cx="70" cy="70" r="60" stroke="#334155" strokeWidth="12" fill="none" />
              <circle
                cx="70" cy="70" r="60"
                stroke="#22d3ee"
                strokeWidth="12" fill="none"
                strokeLinecap="round"
                strokeDasharray={`${(today.score / 100) * 2 * Math.PI * 60} ${2 * Math.PI * 60}`}
              />
            </svg>
            <div className="val">
              {today.score}<small>/100</small>
            </div>
          </div>
          <div>
            <div className="row">
              <span>Active time today</span><strong>{formatDuration(today.totalSeconds)}</strong>
            </div>
            <div className="row">
              <span>Productive time</span><strong>{formatDuration(today.productiveSeconds)}</strong>
            </div>
            <div className="row">
              <span>Shorts/reels</span><strong>{formatDuration(today.shortsSeconds)}</strong>
            </div>
            <div className="row">
              <span>Writing sessions</span><strong>{formatDuration(today.writingSeconds)}</strong>
            </div>
            {current && (
              <div className="row">
                <span>Now in class</span>
                <strong style={{ color: 'var(--accent)' }}>
                  {current.subject} · {current.room}
                </strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {classes.length > 0 && (
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
          <h3>Events today</h3>
          <div className="big">{today.count}</div>
        </div>
        <div className="card">
          <h3>Top domain today</h3>
          <div className="big" style={{ fontSize: 18 }}>{topDomains[0]?.name || '—'}</div>
          <div className="sub">{topDomains[0] ? formatDuration(topDomains[0].seconds) : 'no data'}</div>
        </div>
        <div className="card">
          <h3>Categories active today</h3>
          <div className="big">{pieData.length}</div>
          <div className="sub">of {CATEGORY_KEYS.length}</div>
        </div>
      </div>

      <div className="grid">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>Screen time — last 7 days (hours)</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekBars}>
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={(v) => [`${v} h`, 'active']}
                />
                <Bar dataKey="seconds" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>Today by category (minutes)</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={2}>
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={categoryColor(d.name)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
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
