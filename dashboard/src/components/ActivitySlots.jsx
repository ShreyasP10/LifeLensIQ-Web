import { useMemo } from 'react';
import { lastNDays, dayKeyLocal } from '../lib/stats.js';

const SLOT_LABELS = [
  '12 AM', '2 AM', '4 AM', '6 AM', '8 AM', '10 AM',
  '12 PM', '2 PM', '4 PM', '6 PM', '8 PM', '10 PM'
];

function calculateSlots(events, days, now) {
  const calendarKeys = lastNDays(days, now);
  const slotsByDay = {};
  for (const k of calendarKeys) {
    slotsByDay[k] = new Array(12).fill(0);
  }

  for (const ev of events || []) {
    const dur = Number(ev.durationSeconds) || 0;
    const ts = Number(ev.ts) || 0;
    if (dur <= 0 || !ts) continue;
    
    const d = new Date(ts);
    const k = dayKeyLocal(d);
    if (!slotsByDay[k]) continue;

    const slotIndex = Math.floor(d.getHours() / 2);
    slotsByDay[k][slotIndex] += dur;
  }

  return calendarKeys.map(key => {
    return {
      day: key,
      slots: slotsByDay[key]
    };
  });
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function ActivitySlots({ events, days = 7 }) {
  const data = useMemo(() => calculateSlots(events, days, Date.now()), [events, days]);

  return (
    <div className="card" style={{ gridColumn: 'span 2' }}>
      <h3>Daily Activity Slots (2-hour blocks)</h3>
      <div className="sub" style={{ marginBottom: 16 }}>Shows active vs inactive periods throughout the day</div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 600, paddingBottom: 10 }}>
          <div style={{ display: 'flex', marginBottom: 6, paddingLeft: 60 }}>
            {SLOT_LABELS.map(label => (
              <div key={label} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                {label}
              </div>
            ))}
          </div>
          {data.map(row => {
            const [, m, d] = row.day.split('-');
            const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1];
            const displayDay = `${Number(d)} ${month}`;
            
            return (
              <div key={row.day} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ width: 60, fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                  {displayDay}
                </div>
                <div style={{ display: 'flex', flex: 1, gap: 4 }}>
                  {row.slots.map((seconds, idx) => {
                    let opacity = 0.05;
                    if (seconds > 0) {
                      opacity = Math.min(1, 0.2 + (seconds / 7200) * 0.8);
                    }
                    
                    return (
                      <div 
                        key={idx} 
                        title={`${SLOT_LABELS[idx]} - ${SLOT_LABELS[(idx+1)%12] || '12 AM'}:\n${formatDuration(seconds)} active`}
                        style={{
                          flex: 1,
                          height: 28,
                          borderRadius: 6,
                          background: seconds > 0 ? `rgba(56, 189, 248, ${opacity})` : 'rgba(148, 163, 184, 0.05)',
                          border: seconds > 0 ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                          transition: 'transform 0.15s ease, background 0.15s ease',
                          cursor: 'pointer'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="legend-line" style={{ marginTop: 12, justifyContent: 'flex-end', gap: 10 }}>
         <span style={{ fontSize: 11, color: 'var(--muted)' }}>Inactive</span>
         <div style={{ display: 'flex', gap: 3 }}>
           <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(148, 163, 184, 0.05)' }} />
           <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(56, 189, 248, 0.2)' }} />
           <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(56, 189, 248, 0.6)' }} />
           <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(56, 189, 248, 1)' }} />
         </div>
         <span style={{ fontSize: 11, color: 'var(--muted)' }}>Highly Active</span>
      </div>
    </div>
  );
}
