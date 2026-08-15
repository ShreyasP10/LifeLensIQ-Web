import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { trendSeries, monthComparison, chargeSessions, formatDuration } from '../lib/stats.js';

const PERIODS = [
  [1, '1D'],
  [7, '7D'],
  [30, '30D'],
  [365, '1Y'],
];

function fmtHours(seconds) {
  return `${Math.round((seconds / 3600) * 10) / 10} h`;
}

function fmtSteps(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function Trends({ events }) {
  const now = Date.now();
  const [period, setPeriod] = useState(7);

  const series = useMemo(() => trendSeries(events, period, now), [events, period, now]);
  const comparison = useMemo(() => monthComparison(events, now), [events, now]);
  const charging = useMemo(() => chargeSessions(events, 7, now), [events, now]);

  const totals = useMemo(() => {
    const t = { screen: 0, study: 0, steps: 0, shorts: 0, pickups: 0 };
    for (const b of series) {
      t.screen += b.screen;
      t.study += b.study;
      t.steps += b.steps;
      t.shorts += b.shorts;
      t.pickups += b.pickups;
    }
    return t;
  }, [series]);

  const bars = series.map((b) => ({
    label: b.label,
    screen: Math.round((b.screen / 3600) * 10) / 10,
    study: Math.round((b.study / 3600) * 10) / 10,
  }));

  const tooltipStyle = {
    background: 'var(--tooltip-bg)',
    border: '1px solid var(--tooltip-border)',
    borderRadius: 10,
  };

  const periodLabel = period === 1 ? 'today' : period === 365 ? 'last 12 months' : `last ${period} days`;

  return (
    <div>
      <div className="panel">
        <div className="head-row">
          <h2>Trends · {periodLabel}</h2>
          <div className="range-pills">
            {PERIODS.map(([days, label]) => (
              <button
                key={days}
                className={period === days ? 'active' : ''}
                onClick={() => setPeriod(days)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Screen time per {period === 365 ? 'month' : 'day'} (hours)</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} interval={period === 30 ? 4 : period === 365 ? 0 : 0} />
                <YAxis stroke="var(--muted)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${v} h`, name]} />
                <Bar dataKey="screen" fill="#38bdf8" radius={[3, 3, 0, 0]} name="Screen" />
                <Bar dataKey="study" fill="#4ade80" radius={[3, 3, 0, 0]} name="Study" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <h3>Screen time</h3>
            <div className="big">{fmtHours(totals.screen)}</div>
            <div className="sub">across the period</div>
          </div>
          <div className="card">
            <h3>Study</h3>
            <div className="big">{fmtHours(totals.study)}</div>
            <div className="sub">productive categories</div>
          </div>
          <div className="card">
            <h3>Steps (app)</h3>
            <div className="big">{fmtSteps(totals.steps)}</div>
            <div className="sub">from STEPS events</div>
          </div>
          <div className="card">
            <h3>Shorts</h3>
            <div className="big">{fmtHours(totals.shorts)}</div>
            <div className="sub">short-form video</div>
          </div>
          <div className="card">
            <h3>Pickups</h3>
            <div className="big">{totals.pickups}</div>
            <div className="sub">screen-on events</div>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h3>This month vs last month</h3>
          <div className="list-inline">
            {comparison.map((m) => (
              <span key={m.metric} className="chip">
                {m.label}
                <b
                  style={{
                    color:
                      m.change === null
                        ? 'var(--muted)'
                        : m.metric === 'study' || m.metric === 'steps'
                          ? m.change >= 0
                            ? 'var(--ok)'
                            : 'var(--danger)'
                          : m.change >= 0
                            ? 'var(--danger)'
                            : 'var(--ok)',
                  }}
                >
                  {' '}
                  {m.change === null
                    ? 'no prior data'
                    : `${m.change >= 0 ? '+' : ''}${m.change}%`}
                </b>
              </span>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Charging discipline · last 7 days</h3>
          <div className="row"><span>Charge sessions</span><strong>{charging.sessions}</strong></div>
          <div className="row"><span>Avg session</span><strong>{formatDuration(charging.avgMinutes * 60)}</strong></div>
          <div className="row">
            <span>Overnight charges (21:00–06:00)</span>
            <strong style={{ color: charging.overnight > 0 ? 'var(--ok)' : 'var(--muted)' }}>{charging.overnight}</strong>
          </div>
          <div className="sub">from CHARGE_START / CHARGE_END events</div>
        </div>
      </div>
    </div>
  );
}