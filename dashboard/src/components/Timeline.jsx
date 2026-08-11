import { useMemo, useState } from 'react';
import { dayKeyLocal, eventsOnDay, formatDuration, formatTime, pad } from '../lib/stats.js';
import { categoryColor } from '../lib/categories.js';

const PAGE = 200;

export default function Timeline({ events }) {
  const today = new Date();
  const [date, setDate] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  const [shown, setShown] = useState(PAGE);

  const dayEvents = useMemo(() => eventsOnDay(events, date), [events, date]);
  const visible = dayEvents.slice(0, shown);

  return (
    <div className="panel">
      <h2>Timeline</h2>
      <div className="form-row">
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setShown(PAGE);
          }}
        />
        <span className="muted">{dayEvents.length} events · {formatDuration(dayEvents.reduce((a, e) => a + (e.durationSeconds || 0), 0))}</span>
      </div>

      <div className="event-list">
        {visible.length === 0 && <p className="muted">No events on this day.</p>}
        {visible.map((ev) => (
          <div className="event-item" key={ev.id}>
            <div className="bar" style={{ background: categoryColor(ev.category) }} />
            <div className="meta">
              <div className="domain">{ev.domain} <span className="tag">{ev.category}</span></div>
              <div className="path">
                {formatTime(ev.ts)} → {formatTime(ev.endTs || ev.ts)} · {ev.title || ev.path || ''}
                {ev.eventType !== 'tab_active' && <span> · <b>{ev.eventType}</b></span>}
              </div>
            </div>
            <div className="dur">{formatDuration(ev.durationSeconds)}</div>
          </div>
        ))}
      </div>

      {dayEvents.length > shown && (
        <div className="btn-row">
          <button className="secondary" onClick={() => setShown(shown + PAGE)}>
            Load more ({dayEvents.length - shown} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
