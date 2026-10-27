/**
 * Analytical charts (Recharts). Colors follow fixed roles: industry = blue, you = orange,
 * professionals = aqua. Every multi-series chart has a legend; values appear in tooltips and tables.
 */
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const C = { industry: '#2a78d6', you: '#eb6834', pro: '#1baf7a', grid: '#e3e8ef', axis: '#64748b' };
const tick = { fill: C.axis, fontSize: 12 };

function Box({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip-box">
      <strong>{label ?? payload[0]?.payload?.name}</strong>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill }} />
          {p.name}: <b>{typeof p.value === 'number' ? Math.round(p.value * 10) / 10 : p.value}{suffix}</b>
        </div>
      ))}
    </div>
  );
}

/** Ranked skills, horizontal bars. data: [{name, score}] */
export function SkillRankingChart({ data, height }) {
  const h = height || Math.max(220, data.length * 30 + 30);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" domain={[0, 100]} tick={tick} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={150} tick={{ ...tick, fill: '#0f172a' }} axisLine={false} tickLine={false} />
        <Tooltip content={<Box />} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
        <Bar dataKey="score" name="Score" fill={C.industry} radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Industry expectation vs student level, on the 0-3 proficiency scale. data: [{name, required, you}] */
export function IndustryVsYouRadar({ data, height = 320 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={C.grid} />
        <PolarAngleAxis dataKey="name" tick={{ ...tick, fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 3]} tickCount={4} tick={{ fontSize: 10, fill: C.axis }} axisLine={false} />
        <Radar name="Expected level" dataKey="required" stroke={C.industry} fill={C.industry} fillOpacity={0.18} strokeWidth={2} />
        <Radar name="Your level" dataKey="you" stroke={C.you} fill={C.you} fillOpacity={0.22} strokeWidth={2} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Tooltip content={<Box />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/** Gap per skill (0-3 levels), sorted. data: [{name, gap}] */
export function GapChart({ data, height }) {
  const h = height || Math.max(200, data.length * 30 + 30);
  const shade = (g) => (g >= 3 ? '#9a3412' : g === 2 ? '#ea580c' : '#fdba74');
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" domain={[0, 3]} ticks={[0, 1, 2, 3]} tick={tick} axisLine={false} tickLine={false}
          tickFormatter={(v) => ['0', '1 level', '2 levels', '3 levels'][v]} />
        <YAxis type="category" dataKey="name" width={150} tick={{ ...tick, fill: '#0f172a' }} axisLine={false} tickLine={false} />
        <Tooltip content={<Box suffix=" level(s)" />} cursor={{ fill: 'rgba(234,88,12,0.06)' }} />
        <Bar dataKey="gap" name="Gap" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {data.map((d) => <Cell key={d.name} fill={shade(d.gap)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Share of postings vs share of professionals, per skill (percent). data: [{name, industry, professional}] */
export function IndustryVsProfessionalChart({ data, height }) {
  const h = height || Math.max(240, data.length * 34 + 50);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }} barGap={2} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" domain={[0, 100]} tick={tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" width={150} tick={{ ...tick, fill: '#0f172a' }} axisLine={false} tickLine={false} />
        <Tooltip content={<Box suffix="%" />} cursor={{ fill: 'rgba(42,120,214,0.05)' }} />
        <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="industry" name="% of job postings" fill={C.industry} radius={[0, 4, 4, 0]} maxBarSize={12} />
        <Bar dataKey="professional" name="% of professionals using it" fill={C.pro} radius={[0, 4, 4, 0]} maxBarSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Survey answer distribution. data: [{label, count, share}] */
export function DistributionChart({ data, height, showShare = true }) {
  const rows = data.map((d) => ({ name: d.label, value: showShare ? Math.round(d.share * 1000) / 10 : d.count, count: d.count }));
  const h = height || Math.max(160, rows.length * 30 + 30);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" domain={showShare ? [0, 100] : [0, 'auto']} tick={tick} axisLine={false} tickLine={false}
          tickFormatter={(v) => (showShare ? `${v}%` : v)} allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={190} tick={{ ...tick, fill: '#0f172a', fontSize: 11.5 }} axisLine={false} tickLine={false} />
        <Tooltip content={({ active, payload }) => (active && payload?.length ? (
          <div className="tooltip-box"><strong>{payload[0].payload.name}</strong>{payload[0].payload.count} response(s){showShare ? ` · ${payload[0].value}%` : ''}</div>
        ) : null)} cursor={{ fill: 'rgba(42,120,214,0.06)' }} />
        <Bar dataKey="value" name={showShare ? 'Share' : 'Count'} fill={C.industry} radius={[0, 4, 4, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
