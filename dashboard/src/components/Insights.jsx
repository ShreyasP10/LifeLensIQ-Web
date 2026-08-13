import { useMemo } from 'react';
import { buildInsights } from '../lib/insights.js';

export default function Insights({ events, days }) {
  const insights = useMemo(
    () => buildInsights(events, days, Date.now()),
    [events, days]
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