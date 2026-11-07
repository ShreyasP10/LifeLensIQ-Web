export function Sk({ w = '100%', h = 12, r = 8, style }) {
  return (
    <span
      className="sk"
      style={{ width: w, height: h, borderRadius: r, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkCard({ big = true, sub = true, h3 = true }) {
  return (
    <div className="card sk-card" aria-hidden="true">
      {h3 && <Sk h={10} w="46%" r={5} />}
      {big && <Sk h={30} w="34%" r={9} style={{ marginTop: 14 }} />}
      {sub && <Sk h={9} w="62%" r={5} style={{ marginTop: 12 }} />}
    </div>
  );
}

export function SkChart({ h = 230 }) {
  const bars = [0.42, 0.66, 0.35, 0.8, 0.55, 0.72, 0.3, 0.62, 0.48, 0.76, 0.4, 0.58];
  return (
    <div className="panel sk-chart" style={{ height: h + 34 }} aria-hidden="true">
      <Sk h={10} w="30%" r={5} />
      <div className="sk-bars">
        {bars.map((b, i) => (
          <Sk key={i} h={Math.round(b * (h - 40))} w="6.5%" r={7} style={{ alignSelf: 'flex-end' }} />
        ))}
        <Sk h={10} w="86%" r={5} style={{ position: 'absolute', bottom: 18, left: 22 }} />
      </div>
    </div>
  );
}

export function SkRows({ rows = 5, tall = false }) {
  return (
    <div className="sk-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`sk-row ${tall ? 'tall' : ''}`}>
          <span className="sk sk-dot" />
          <div style={{ flex: 1, display: 'grid', gap: 7 }}>
            <Sk h={tall ? 12 : 10} w={`${58 - i * 6}%`} r={6} />
            <Sk h={tall ? 10 : 8} w={`${38 - i * 4}%`} r={5} />
          </div>
          <Sk h={tall ? 12 : 10} w={64} r={6} />
        </div>
      ))}
    </div>
  );
}

export function SkChips({ n = 5 }) {
  const widths = [54, 72, 46, 64, 58, 50, 70];
  return (
    <div className="sk-chips" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <Sk key={i} h={28} w={widths[i % widths.length]} r={14} />
      ))}
    </div>
  );
}

export function SkForm({ fields = 4 }) {
  return (
    <div className="panel sk-form" aria-hidden="true">
      <Sk h={10} w="34%" r={5} />
      <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
        {Array.from({ length: fields }, (_, i) => (
          <Sk key={i} h={36} w={`${88 - (i % 2) * 22}%`} r={10} />
        ))}
      </div>
      <Sk h={34} w={110} r={12} style={{ marginTop: 18 }} />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="grid" aria-hidden="true">
        <SkCard />
        <SkCard />
        <SkCard />
        <SkCard />
      </div>
      <SkChart />
      <div className="panel sk-mt" aria-hidden="true">
        <Sk h={10} w="28%" r={5} />
        <SkRows rows={4} />
      </div>
    </>
  );
}

function TrendsSkeleton() {
  return (
    <>
      <SkChips n={4} />
      <div className="grid" aria-hidden="true">
        <SkCard h3={false} big />
        <SkCard h3={false} big />
        <SkCard h3={false} big />
        <SkCard h3={false} big />
      </div>
      <SkChart h={200} />
      <div className="grid sk-mt" aria-hidden="true">
        <SkCard />
        <SkCard />
      </div>
    </>
  );
}

function TimelineSkeleton() {
  return (
    <>
      <SkChips n={3} />
      <div className="panel sk-mt" aria-hidden="true">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }} aria-hidden="true">
          <Sk h={32} w={140} r={10} />
          <Sk h={32} w={110} r={10} />
          <Sk h={32} w={180} r={10} />
        </div>
        <SkRows rows={6} tall />
      </div>
    </>
  );
}

function ExportSkeleton() {
  return (
    <>
      <SkForm fields={2} />
      <div className="sk-actions" aria-hidden="true">
        <Sk h={40} w="46%" r={12} />
        <Sk h={40} w="46%" r={12} />
        <Sk h={40} w="46%" r={12} />
      </div>
      <div className="panel sk-mt" aria-hidden="true">
        <SkRows rows={3} />
      </div>
    </>
  );
}

function LeaderboardSkeleton() {
  return (
    <>
      <SkChips n={2} />
      <div className="grid" aria-hidden="true">
        <SkCard h3={false} />
        <SkCard h3={false} />
        <SkCard h3={false} />
      </div>
      <div className="panel sk-mt" aria-hidden="true">
        <SkRows rows={5} />
      </div>
    </>
  );
}

function LogSkeleton() {
  return <SkForm fields={5} />;
}

function SettingsSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 16 }} aria-hidden="true">
      <div className="panel">
        <Sk h={10} w="30%" r={5} />
        <SkForm fields={2} />
      </div>
      <div className="panel">
        <Sk h={10} w="22%" r={5} />
        <SkRows rows={4} />
        <Sk h={34} w={120} r={12} style={{ marginTop: 16 }} />
      </div>
    </div>
  );
}

const TAB_SKELETONS = {
  overview: OverviewSkeleton,
  trends: TrendsSkeleton,
  timeline: TimelineSkeleton,
  export: ExportSkeleton,
  leaderboard: LeaderboardSkeleton,
  log: LogSkeleton,
  settings: SettingsSkeleton,
};

export default function TabSkeleton({ kind = 'overview' }) {
  const C = TAB_SKELETONS[kind] || OverviewSkeleton;
  return (
    <div className="sk-tab" aria-busy="true">
      <C />
    </div>
  );
}
