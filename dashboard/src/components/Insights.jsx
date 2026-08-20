import { useEffect, useMemo, useState } from 'react';
import { buildInsights } from '../lib/insights.js';

export default function Insights({ events, days }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const insights = useMemo(
    () => buildInsights(events, days, now),
    [events, days, now]
  );

  if (insights.length === 0) return null;

  return (
    <div className="insights">
      {insights.map((ins, i) => (
        <div key={i} className={`insight ${ins.kind}`}>
          <div className="insight-title">{ins.title}</div>
          {ins.detail && <div className="insight-detail">{ins.detail}</div>}
        </div>
      ))}
    </div>
  );
}