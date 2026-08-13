import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { aggregate, dayKeyLocal, formatDuration, formatTime, lastNDays } from '../lib/stats.js';
import { categoryColor } from '../lib/categories.js';

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const m = h % 12 || 12;
  return `${m}${h < 12 ? 'AM' : 'PM'}`;
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(key) {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export default function SiteDrilldown({ events, domain, onClose }) {
  const siteEvents = useMemo(
    () =>
      (events || []).filter(
        (ev) => (Number(ev.durationSeconds) || 0) > 0 && ev.domain === domain
      ),
    [events, domain]
  );

  const cur = useMemo(() => aggregate(siteEvents), [siteEvents]);

  const byHour = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => ({
        hour: HOUR_LABELS[h],
        minutes: Math.round((cur.byHour[h] || 0) / 60),
      })),
    [cur]
  );

  const now = Date.now();
  const dayKeys = lastNDays(14, now);
  const byDay = dayKeys.map((k) => ({
    day: dayLabel(k),
    minutes: Math.round(
      (siteEvents.filter((ev) => dayKeyLocal(new Date(Number(ev.ts))) === k).reduce(
        (a, ev) => a + Number(ev.durationSeconds),
        0
      ) /
        60) *
        10
    ) / 10,
  }));

  const byWeekday = WEEKDAYS.map((name, w) => ({
    name,
    minutes: Math.round((cur.byWeekday[w] || 0) / 60),
  }));

  const categories = useMemo(() => {
    const m = {};
    for (const ev of siteEvents) m[ev.category] = (m[ev.category] || 0) + Number(ev.durationSeconds);
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [siteEvents]);

  const peakIdx = useMemo(
    () => byHour.reduce((best, b, i) => (b.minutes > byHour[best].minutes ? i : best), 0),
    [byHour]
  );
  const peak = byHour[peakIdx];

  const peakSeconds = siteEvents
    .filter((ev) => new Date(ev.ts).getHours() === peakIdx)
    .reduce((a, ev) => a + Number(ev.durationSeconds), 0);

  const avgSession = cur.count > 0 ? Math.round(cur.totalSeconds / cur.count) : 0;
  const tooltipStyle = {
    background: 'var(--tooltip-bg)',
    border: '1px solid var(--tooltip-border)',
    borderRadius: 10,
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="head-row">
          <h2>{domain}</h2>
          <button className="secondary modal-close" onClick={onClose}>×</button>
        </div>

        <div className="grid drill-stats">
          <div className="card">
            <h3>Total time (14d visible)</h3>
            <div className="big" style={{ fontSize: 20 }}>{formatDuration(cur.totalSeconds)}</div>
            <div className="sub">{cur.count} sessions · avg {formatDuration(avgSession)}</div>
          </div>
          <div className="card">
            <h3>Peak hour</h3>
            <div className="big" style={{ fontSize: 20 }}>{peak.hour}</div>
            <div className="sub">{formatDuration(peakSeconds)} in that hour</div>
          </div>
          <div className="card">
            <h3>Categories</h3>
            <div className="big" style={{ fontSize: 20 }}>{categories.length}</div>
            <div className="sub">{categories.map(([c]) => c).join(', ') || '—'}</div>
          </div>
        </div>

        <div className="grid" style={{ marginTop: 18 }}>
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <h3>Per-hour pattern (minutes)</h3>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byHour}>
                  <XAxis dataKey="hour" stroke="var(--muted)" fontSize={10} interval={2} />
                  <YAxis stroke="var(--muted)" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} min`, 'usage']} />
                  <Bar dataKey="minutes" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <h3>Weekday comparison (minutes)</h3>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byWeekday}>
                  <XAxis dataKey="name" stroke="var(--muted)" fontSize={10} />
                  <YAxis stroke="var(--muted)" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} min`, 'usage']} />
                  <Bar dataKey="minutes" fill="#818cf8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <h3>Last 14 days (minutes)</h3>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay}>
                <XAxis dataKey="day" stroke="var(--muted)" fontSize={10} />
                <YAxis stroke="var(--muted)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} min`, 'usage']} />
                <Bar dataKey="minutes" fill="#4ade80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="hint">
          Recent sessions: {siteEvents.slice(-3).reverse().map((ev) => `${formatTime(ev.ts)} · ${formatDuration(ev.durationSeconds)}`).join('   ·   ') || 'none'}
        </div>
      </div>
    </div>
  );
}