import { useMemo, useState } from 'react';
import { dayKeyLocal, eventsOnDay, formatDuration, formatTime, pad } from '../lib/stats.js';
import { categoryColor, CATEGORY_KEYS } from '../lib/categories.js';

const PAGE = 200;

export default function Timeline({ events }) {
  const today = new Date();
  const [date, setDate] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  const [shown, setShown] = useState(PAGE);
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');

  const dayEvents = useMemo(() => eventsOnDay(events, date), [events, date]);
  const typeKeys = useMemo(() => {
    const set = new Set();
    for (const ev of dayEvents) set.add(ev.eventType || 'tab_active');
    return [...set].sort();
  }, [dayEvents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dayEvents.filter((ev) => {
      if (category && ev.category !== category) return false;
      if (type && (ev.eventType || 'tab_active') !== type) return false;
      if (q) {
        const hay = `${ev.domain || ''} ${ev.title || ''} ${ev.path || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [dayEvents, category, type, query]);

  const visible = filtered.slice(0, shown);
  const totalDur = filtered.reduce((a, e) => a + (e.durationSeconds || 0), 0);

  const counts = useMemo(() => {
    const m = {};
    for (const ev of dayEvents) m[ev.category] = (m[ev.category] || 0) + 1;
    return m;
  }, [dayEvents]);

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
        <span className="muted">
          {filtered.length}/{dayEvents.length} events · {formatDuration(totalDur)}
        </span>
      </div>

      <div className="filter-row">
        <input
          className="search-input"
          type="search"
          placeholder="Search domain, title or path…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
        />
        <select value={type} onChange={(e) => { setType(e.target.value); setShown(PAGE); }}>
          <option value="">All types</option>
          {typeKeys.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {(category || type || query) && (
          <button className="secondary" onClick={() => { setCategory(''); setType(''); setQuery(''); setShown(PAGE); }}>
            Clear filters
          </button>
        )}
      </div>

      <div className="chip-row">
        {CATEGORY_KEYS.map((c) => (
          <button
            key={c}
            className={`chip filter ${category === c ? 'active' : ''}`}
            style={{ borderColor: category === c ? categoryColor(c) : undefined }}
            onClick={() => {
              setCategory(category === c ? '' : c);
              setShown(PAGE);
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 4, background: categoryColor(c) }} />
            {c}
            <span className="chip-count">{counts[c] || 0}</span>
          </button>
        ))}
      </div>

      <div className="event-list">
        {visible.length === 0 && <p className="muted">No events on this day with the current filters.</p>}
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

      {filtered.length > shown && (
        <div className="btn-row">
          <button className="secondary" onClick={() => setShown(shown + PAGE)}>
            Load more ({filtered.length - shown} remaining)
          </button>
        </div>
      )}
    </div>
  );
}