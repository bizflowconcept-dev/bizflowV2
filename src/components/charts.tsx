import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export const CHART = { teal: '#087E8B', navy: '#0B2530', blue: '#2878D8', amber: '#E8920B', red: '#DC3E42', green: '#16A34A', grid: '#E3EBEC', axis: '#60777D' }

export type Series = { key: string; label: string; color?: string; dashed?: boolean }

export function TrendChart({ data, x = 'm', series, fmt = (v: number) => String(v), height = 260, label }: { data: Record<string, number | string>[]; x?: string; series: Series[]; fmt?: (v: number) => string; height?: number; label: string }) {
  const colors = [CHART.teal, CHART.blue, CHART.amber, CHART.red]
  return (
    <div style={{ height }} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey={x} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickFormatter={(v) => fmt(Number(v))} width={60} />
          <Tooltip formatter={(v, n) => [fmt(Number(v)), n]} contentStyle={{ borderRadius: 8, border: '1px solid #D8E2E3', fontSize: 12, boxShadow: '0 6px 20px rgba(11,37,48,.08)' }} />
          {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
          {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? colors[i % colors.length]} strokeWidth={2.25} strokeDasharray={s.dashed ? '5 4' : undefined} dot={false} isAnimationActive={false} activeDot={{ r: 4 }} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Spark({ data, color = CHART.teal }: { data: number[]; color?: string }) {
  return (
    <div className="h-10 w-16 shrink-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 4, bottom: 4, left: 2, right: 2 }}><Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function RangeToggle({ value, onChange, options = ['3M', '6M', '12M'] }: { value: string; onChange: (v: string) => void; options?: string[] }) {
  return (
    <div role="group" aria-label="Date range" className="inline-flex overflow-hidden rounded-md border border-line bg-white">
      {options.map((o) => <button key={o} aria-pressed={value === o} onClick={() => onChange(o)} className={`h-8 cursor-pointer px-3 text-[13px] font-semibold ${value === o ? 'bg-midnight text-white' : 'text-slate hover:text-ink'}`}>{o}</button>)}
    </div>
  )
}

export function StatCard({ label, value, delta, up = true, data, hint, color }: { label: string; value: string; delta?: string; up?: boolean; data?: number[]; hint?: string; color?: string }) {
  return (
    <div className="glass-panel stat-glow flex items-end justify-between gap-2 rounded-xl border border-line bg-white p-4">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-slate">{label}</div>
        <div className="num mt-1.5 whitespace-nowrap font-display text-[26px] font-semibold leading-none">{value}</div>
        {(delta || hint) && <div className="mt-2 flex items-center gap-1.5 text-xs">{delta && <span className={`rounded px-1.5 py-0.5 font-semibold ${up ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{up ? '▲' : '▼'} {delta}</span>}{hint && <span className="text-slate">{hint}</span>}</div>}
      </div>
      {data && <Spark data={data} color={color ?? (up ? CHART.teal : CHART.red)} />}
    </div>
  )
}
