import { useMemo } from 'react';
import { wakeSleepForDay, formatTime, formatDuration } from '../lib/stats.js';

export default function WakeSleepCard({ events, day }) {
  const data = useMemo(() => wakeSleepForDay(events, day), [events, day]);

  const rows = [
    ['Pickups', data.pickups > 0 ? String(data.pickups) : '—'],
    ['First wake', data.firstWake ? formatTime(data.firstWake) : '—'],
    ['Last shutdown', data.lastShutdown ? formatTime(data.lastShutdown) : '—'],
    ['Sleep estimate', data.sleepMs ? formatDuration(Math.round(data.sleepMs / 1000)) : '—'],
  ];

  const hasData = data.pickups > 0 || data.firstWake || data.lastShutdown || data.sleepMs;
  if (!hasData) return null;

  return (
    <div className="panel">
      <h2>Wake &amp; sleep</h2>
      <p className="muted" style={{ marginBottom: 10 }}>
        From app SCREEN_ON / SCREEN_OFF events. Sleep = last shutdown yesterday (after 12:00)
        minus first screen-on today (after 04:00).
      </p>
      {rows.map(([label, value]) => (
        <div className="row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}