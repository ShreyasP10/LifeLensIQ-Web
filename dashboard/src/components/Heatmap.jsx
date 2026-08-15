import { useMemo, useState } from 'react';
import { dayKeyLocal, formatDuration } from '../lib/stats.js';
import { predictFocusWindow } from '../lib/ml.js';
import {
  CATEGORY_WEIGHTS,
  isProductiveCategory,
  isDistractingCategory,
} from '../lib/categories.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MODES = [
  ['productive', 'Productivity'],
  ['distracting', 'Distraction'],
  ['neutral', 'Neutral'],
];

function intensityFor(seconds) {
  const minutes = seconds / 60;
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

function secondsFor(ev, mode) {
  const dur = Number(ev.durationSeconds) || 0;
  const c = ev.category;
  if (mode === 'productive') {
    return isProductiveCategory(c) ? dur * (CATEGORY_WEIGHTS[c] ?? 0.2) : 0;
  }
  if (mode === 'distracting') {
    return isDistractingCategory(c) ? dur : 0;
  }
  return isProductiveCategory(c) || isDistractingCategory(c) ? 0 : dur;
}

export default function Heatmap({ events, days = 365 }) {
  const [mode, setMode] = useState('productive');
  const modeName = MODES.find(([v]) => v === mode)[1].toLowerCase();

  const prediction = useMemo(() => predictFocusWindow(events, {}), [events]);
  const hourCells = useMemo(() => {
    if (!prediction) return null;
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      inWindow: h >= prediction.start && h < prediction.end,
    }));
  }, [prediction]);

  const cells = useMemo(() => {
    const byDay = {};
    for (const ev of events || []) {
      const seconds = secondsFor(ev, mode);
      if (seconds <= 0) continue;
      const key = dayKeyLocal(new Date(Number(ev.ts)));
      byDay[key] = (byDay[key] || 0) + seconds;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

    const out = [];
    const d = new Date(start);
    while (d <= today) {
      const key = dayKeyLocal(d);
      const seconds = byDay[key] || 0;
      out.push({
        key,
        date: new Date(d),
        seconds,
        level: intensityFor(seconds),
        label: `${key} · ${formatDuration(Math.round(seconds))} ${modeName}`,
      });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [events, days, mode, modeName]);

  const columns = useMemo(() => {
    const cols = [];
    let prevMonth = -1;
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      const month = week[0].date.getMonth();
      const monthLabel =
        month !== prevMonth
          ? week[0].date.toLocaleString([], { month: 'short' })
          : '';
      prevMonth = month;
      cols.push({ week, monthLabel });
    }
    return cols;
  }, [cells]);

  return (
    <div className={`heatmap mode-${mode}`}>
      <div className="heatmap-toolbar">
        <select
          className="heatmap-select"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          aria-label="Calendar metric"
        >
          {MODES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {prediction && hourCells && (
        <div className="predict-strip" title={`Predicted best ${prediction.end - prediction.start}h window for tomorrow`}>
          <span className="predict-label">Predicted focus window — tomorrow</span>
          <div className="predict-hours">
            {hourCells.map((c) => (
              <span
                key={c.hour}
                className={c.inWindow ? 'predict-hour on' : 'predict-hour'}
                title={c.inWindow ? `${String(c.hour).padStart(2, '0')}:00–${String(c.hour + 1).padStart(2, '0')}:00 (in window)` : `${String(c.hour).padStart(2, '0')}:00`}
              />
            ))}
          </div>
          <span className="predict-meta">
            {String(prediction.start).padStart(2, '0')}:00–{String(prediction.end).padStart(2, '0')}:00
            · {prediction.confidence}% confidence · {prediction.rows} recent sessions
          </span>
        </div>
      )}
      <div className="heatmap-head">
        {columns.map((c, i) => (
          <span key={i} className="heatmap-month">{c.monthLabel}</span>
        ))}
      </div>
      <div className="heatmap-body">
        <div className="heatmap-days">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {columns.map((c, i) => (
          <div className="heatmap-col" key={i}>
            {c.week.map((cell) => (
              <div
                key={cell.key}
                className={`heat-cell lv${cell.level}`}
                title={cell.label}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`heat-cell lv${l}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}