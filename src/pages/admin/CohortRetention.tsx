import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CircleHelp, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge, ExportButton, Panel } from '../../components/ui'
import { useTenants } from '../../tenant/store'
import { useBilling } from '../../data/billing'
import { recurring } from '../../billing/insights'

/* ---------- Model ---------- */
type Rec = { id: string; signup: number; plan: string; seg: string; churn: number | null; mrr0: number; growth: number }
type Metric = 'logo' | 'revenue'
type Cell = { k: number; n: number; kept: number; mrr0: number; mrrK: number; pct: number }
type Cohort = { key: number; label: string; n: number; mrr0: number; cells: Cell[] }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const idxOf = (d: Date) => d.getFullYear() * 12 + d.getMonth()
const labelOf = (i: number) => `${MONTHS[i % 12]} ${Math.floor(i / 12)}`
const segOf = (employees: number) => (employees >= 250 ? '250+ staff' : employees >= 50 ? '50 to 249 staff' : 'Under 50 staff')
const SEGS = ['Under 50 staff', '50 to 249 staff', '250+ staff']
const PLANS = ['Starter', 'Professional', 'Enterprise']
const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`
const mrrAt = (r: Rec, k: number) => (r.churn !== null && k >= r.churn ? 0 : r.mrr0 * Math.pow(r.growth, k))

/* Heat-map buckets. The number is always printed in the cell, so colour is never the only signal. */
const BUCKETS = [
  { min: 100, bg: '#0a4f5a', fg: '#ffffff', label: '100% or more' },
  { min: 90, bg: '#167a87', fg: '#ffffff', label: '90 to 99%' },
  { min: 80, bg: '#5fb1ba', fg: '#102a30', label: '80 to 89%' },
  { min: 70, bg: '#9fd0d5', fg: '#102a30', label: '70 to 79%' },
  { min: 60, bg: '#cfe6e8', fg: '#102a30', label: '60 to 69%' },
  { min: -1, bg: '#f1f4f4', fg: '#102a30', label: 'Under 60%' },
]
const bucketOf = (v: number) => BUCKETS.find((b) => v >= b.min) ?? BUCKETS[BUCKETS.length - 1]

/* Rule-of-thumb benchmark for B2B SaaS selling to SMEs. Not measured from BizFlow data. */
const benchmark = (metric: Metric, k: number) => (metric === 'logo' ? 100 * Math.pow(0.99, k) : 100 * Math.pow(1.003, k))

/* ---------- Illustrative data: deterministic, anonymous, never mixed with real data ---------- */
function modelled(nowIdx: number): Rec[] {
  let s = 20260901
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const out: Rec[] = []
  const planCfg: Record<string, { mult: number; mrr: number; growth: number; seg: string }> = {
    Starter: { mult: 1.8, mrr: 90_000, growth: 1.004, seg: SEGS[0] },
    Professional: { mult: 1, mrr: 420_000, growth: 1.012, seg: SEGS[1] },
    Enterprise: { mult: 0.35, mrr: 1_600_000, growth: 1.02, seg: SEGS[2] },
  }
  for (let c = nowIdx - 17; c <= nowIdx - 1; c++) {
    const size = 8 + Math.floor(rnd() * 11)
    for (let i = 0; i < size; i++) {
      const p = rnd(); const plan = p < 0.5 ? 'Starter' : p < 0.85 ? 'Professional' : 'Enterprise'
      const cfg = planCfg[plan]
      let churn: number | null = null
      for (let k = 1; k <= nowIdx - c; k++) { const hazard = (k === 1 ? 0.04 : Math.max(0.006, 0.02 - k * 0.0012)) * cfg.mult; if (rnd() < hazard) { churn = k; break } }
      out.push({ id: `m-${c}-${i}`, signup: c, plan, seg: cfg.seg, churn, mrr0: cfg.mrr * (0.8 + rnd() * 0.5), growth: cfg.growth })
    }
  }
  return out
}

function buildCohorts(recs: Rec[], nowIdx: number): Cohort[] {
  const by = new Map<number, Rec[]>()
  recs.forEach((r) => by.set(r.signup, [...(by.get(r.signup) ?? []), r]))
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([key, rs]) => {
    const mrr0 = rs.reduce((n, r) => n + r.mrr0, 0)
    const cells: Cell[] = []
    for (let k = 0; k <= nowIdx - key; k++) cells.push({ k, n: rs.length, kept: rs.filter((r) => r.churn === null || k < r.churn).length, mrr0, mrrK: rs.reduce((n, r) => n + mrrAt(r, k), 0), pct: 0 })
    return { key, label: labelOf(key), n: rs.length, mrr0, cells }
  })
}
const pctOf = (c: { kept: number; n: number; mrrK: number; mrr0: number }, m: Metric) => (m === 'logo' ? (c.n ? (c.kept / c.n) * 100 : 0) : c.mrr0 ? (c.mrrK / c.mrr0) * 100 : 0)

/* ---------- Small UI helpers ---------- */
function usePrefersReducedMotion() {
  const [r, setR] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => { if (typeof matchMedia !== 'function') return; const q = matchMedia('(prefers-reduced-motion: reduce)'); const h = () => setR(q.matches); q.addEventListener('change', h); return () => q.removeEventListener('change', h) }, [])
  return r
}
function Seg<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-white p-0.5">
      {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`min-h-9 cursor-pointer rounded px-3 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-teal ${value === v ? 'bg-teal text-white' : 'text-slate hover:bg-ink/5'}`}>{l}</button>)}
    </div>
  )
}
const LINE_COLORS = ['#087e8b', '#2878d8', '#d97706', '#8b5cf6', '#dc3e42', '#16a34a', '#be185d', '#0f766e']

/* ---------- Component ---------- */
export default function CohortRetention() {
  const tenants = useTenants()
  const { subs } = useBilling()
  const reduced = usePrefersReducedMotion()
  const [source, setSource] = useState<'real' | 'model'>('real')
  const [metric, setMetric] = useState<Metric>('logo')
  const [plan, setPlan] = useState('All')
  const [seg, setSeg] = useState('All')
  const [hover, setHover] = useState<string>('')
  const [off, setOff] = useState<Set<number>>(new Set())
  const nowIdx = idxOf(new Date())

  const real = useMemo<Rec[]>(() => Object.values(tenants).map((t) => {
    const sub = subs.find((s) => s.company === t.profile.name)
    const signup = idxOf(new Date(t.created))
    let churn: number | null = null
    const endedAt = sub && (sub.status === 'cancelled' || sub.status === 'expired') ? new Date(sub.status === 'cancelled' ? sub.endsAt ?? sub.renewsAt : sub.renewsAt) : null
    if (endedAt && endedAt.getTime() <= Date.now()) churn = Math.max(0, idxOf(endedAt) - signup)
    else if (!sub && t.status === 'Expired') churn = Math.max(0, nowIdx - signup)
    return { id: t.slug, signup, plan: t.plan, seg: segOf(t.employees), churn, mrr0: sub ? recurring(sub) : 0, growth: 1 }
  }), [tenants, subs, nowIdx])
  const model = useMemo(() => modelled(nowIdx), [nowIdx])

  const all = source === 'real' ? real : model
  const recs = all.filter((r) => (plan === 'All' || r.plan === plan) && (seg === 'All' || r.seg === seg))
  const cohorts = useMemo(() => buildCohorts(recs, nowIdx).map((c) => ({ ...c, cells: c.cells.map((x) => ({ ...x, pct: pctOf(x, metric) })) })), [recs, nowIdx, metric])
  const maxK = Math.min(24, Math.max(0, ...cohorts.map((c) => c.cells.length - 1)))
  const cols = Array.from({ length: maxK + 1 }, (_, k) => k)

  const avg = cols.map((k) => {
    const cs = cohorts.map((c) => c.cells[k]).filter(Boolean)
    if (!cs.length) return null
    const sum = cs.reduce((a, x) => ({ n: a.n + x.n, kept: a.kept + x.kept, mrr0: a.mrr0 + x.mrr0, mrrK: a.mrrK + x.mrrK }), { n: 0, kept: 0, mrr0: 0, mrrK: 0 })
    return { ...sum, pct: pctOf(sum, metric), cohorts: cs.length }
  })
  const totalCos = recs.length
  const realCount = real.length

  /* Insights: compare cohorts at the latest month that at least two cohorts have reached. */
  const cmpK = [...cols].reverse().find((k) => cohorts.filter((c) => c.cells[k]).length >= 2)
  const ranked = cmpK === undefined ? [] : cohorts.filter((c) => c.cells[cmpK]).sort((a, b) => b.cells[cmpK].pct - a.cells[cmpK].pct)
  const best = ranked[0], worst = ranked[ranked.length - 1]
  const drops = avg.map((a, k) => (k > 0 && a && avg[k - 1] ? { k, d: avg[k - 1]!.pct - a.pct } : null)).filter(Boolean) as { k: number; d: number }[]
  const biggest = drops.length ? drops.reduce((m, x) => (x.d > m.d ? x : m)) : null
  const latest = avg.filter(Boolean).slice(-1)[0]

  const chartRows = cols.map((k) => {
    const row: Record<string, number | null> = { k, avg: avg[k] ? +avg[k]!.pct.toFixed(1) : null, bench: +benchmark(metric, k).toFixed(1) }
    cohorts.forEach((c, i) => { row[`c${i}`] = c.cells[k] ? +c.cells[k].pct.toFixed(1) : null })
    return row
  })
  const shown = cohorts.map((c, i) => ({ c, i })).filter(({ c }) => !off.has(c.key))
  const lineCohorts = shown.slice(-8)
  const describe = (c: Cohort, x: Cell) => metric === 'logo'
    ? `${c.label} cohort, month ${x.k}: ${x.kept} of ${x.n} ${x.n === 1 ? 'company' : 'companies'} still active (${x.pct.toFixed(0)}%)`
    : `${c.label} cohort, month ${x.k}: ${naira(x.mrrK)} of ${naira(x.mrr0)} starting monthly revenue kept (${x.pct.toFixed(0)}%)`

  const csvHead = ['Cohort', 'Companies', 'Starting MRR (NGN)', ...cols.map((k) => `M${k} ${metric === 'logo' ? 'logo %' : 'revenue %'}`)]
  const csvRows = [
    ...cohorts.map((c) => [c.label, String(c.n), String(Math.round(c.mrr0)), ...cols.map((k) => (c.cells[k] ? c.cells[k].pct.toFixed(1) : ''))]),
    ['Weighted average', String(totalCos), '', ...cols.map((k) => (avg[k] ? avg[k]!.pct.toFixed(1) : ''))],
  ]
  const toggleCohort = (key: number) => setOff((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  return (
    <Panel title="Cohort retention" action={<div className="flex items-center gap-2">{source === 'model' && <Badge tone="amber">Illustrative model</Badge>}<ExportButton name={`cohort-retention-${source === 'model' ? 'illustrative-' : ''}${metric}`} head={csvHead} rows={csvRows} /></div>}>
      <div className="space-y-5">
        <details className="group rounded-md border border-line bg-cloud/60 p-3 text-[13px]">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-teal [&::-webkit-details-marker]:hidden"><CircleHelp size={15} aria-hidden />What is this?</summary>
          <div className="mt-2 space-y-2 text-slate">
            <p>Customers are grouped by the month they signed up (a cohort). Each row shows what share of that group is still a customer N months later, so you can tell whether newer customers stick around better or worse than older ones.</p>
            <p><b className="text-ink">Logo retention</b> counts companies: 14 of 16 still active is 88%. <b className="text-ink">Revenue retention</b> (net dollar retention) compares the monthly revenue the cohort pays now with what it paid at signup. It can pass 100% when survivors upgrade. BizFlow does not keep a revenue history, so revenue retention here assumes surviving companies pay today&apos;s MRR throughout and cannot show upgrades or downgrades for real data.</p>
            <p>Churn counts a cancelled or expired subscription once its end date has passed. Suspended workspaces still count as active. Month 0 is the signup month, and the newest column may be a partial month.</p>
          </div>
        </details>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <Seg label="Data source" value={source} onChange={(v) => { setSource(v); setOff(new Set()) }} options={[['real', 'Real tenants'], ['model', 'Illustrative model']]} />
          <Seg label="Retention type" value={metric} onChange={setMetric} options={[['logo', 'Logo retention'], ['revenue', 'Revenue retention']]} />
          <label className="text-xs font-medium text-slate">Plan<select className="ml-2 h-9 rounded-md border border-line bg-white px-2 text-xs text-ink" value={plan} onChange={(e) => setPlan(e.target.value)}>{['All', ...PLANS].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="text-xs font-medium text-slate">Segment<select className="ml-2 h-9 rounded-md border border-line bg-white px-2 text-xs text-ink" value={seg} onChange={(e) => setSeg(e.target.value)}>{['All', ...SEGS].map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>

        {source === 'model' ? (
          <div role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900"><b>Illustrative model, not real customers.</b> These {model.length} anonymous companies are generated from assumed churn and upgrade rates (Starter churns most, Enterprise least) so you can see how the report reads at scale. Nothing here comes from BizFlow tenants or billing.</div>
        ) : (
          <div role="note" className="rounded-md border border-line bg-softmint/50 p-3 text-[13px]"><b>Real data: {realCount} {realCount === 1 ? 'company' : 'companies'}.</b> {realCount < 20 ? 'Percentages move in huge steps (100% or 0%) with so few customers, so treat this as a record, not a trend. Switch to Illustrative model to preview the report at scale.' : 'Cohorts are large enough to read trends, but compare cohorts of similar size.'}</div>
        )}

        {cohorts.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-slate">No companies match these filters.</p>
        ) : (<>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-line p-3"><div className="text-xs text-slate">Weighted average, latest month</div><div className="num font-display text-2xl font-semibold">{latest ? `${latest.pct.toFixed(0)}%` : 'n/a'}</div><div className="text-xs text-slate">{latest ? `across ${latest.cohorts} cohort${latest.cohorts === 1 ? '' : 's'}, ${totalCos} ${totalCos === 1 ? 'company' : 'companies'}` : ''}</div></div>
            <div className="rounded-md border border-line p-3"><div className="flex items-center gap-1 text-xs text-slate"><TrendingUp size={13} aria-hidden />Best cohort{cmpK !== undefined ? ` at month ${cmpK}` : ''}</div>{best && worst && best !== worst ? <><div className="font-display text-lg font-semibold">{best.label}</div><div className="text-xs text-slate">{best.cells[cmpK!].pct.toFixed(0)}% ({best.n} {best.n === 1 ? 'company' : 'companies'})</div></> : <div className="mt-1 text-xs text-slate">Needs at least two cohorts old enough to compare.</div>}</div>
            <div className="rounded-md border border-line p-3"><div className="flex items-center gap-1 text-xs text-slate"><TrendingDown size={13} aria-hidden />Weakest cohort{cmpK !== undefined ? ` at month ${cmpK}` : ''}</div>{best && worst && best !== worst ? <><div className="font-display text-lg font-semibold">{worst.label}</div><div className="text-xs text-slate">{worst.cells[cmpK!].pct.toFixed(0)}% ({worst.n} {worst.n === 1 ? 'company' : 'companies'}){biggest ? `. Biggest average drop is in month ${biggest.k}.` : ''}</div></> : <div className="mt-1 text-xs text-slate">{biggest ? `Biggest drop is in month ${biggest.k}.` : 'No drop-off recorded yet.'}</div>}</div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate" aria-label="Colour legend"><span className="font-semibold text-ink">Colour scale</span>{[...BUCKETS].reverse().map((b) => <span key={b.label} className="inline-flex items-center gap-1"><span className="size-3 rounded-sm border border-ink/10" style={{ background: b.bg }} aria-hidden />{b.label}</span>)}</div>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-max border-collapse text-center text-xs" aria-label={`Cohort ${metric === 'logo' ? 'logo' : 'revenue'} retention by month since signup`}>
                <thead><tr className="bg-cloud text-slate">
                  <th scope="col" className="sticky left-0 z-10 bg-cloud px-3 py-2 text-left font-semibold">Signed up</th>
                  <th scope="col" className="px-2 py-2 font-semibold" title="Companies in the cohort">Size</th>
                  {cols.map((k) => <th key={k} scope="col" className="px-1 py-2 font-semibold" title={`Month ${k} since signup`}>M{k}</th>)}
                </tr></thead>
                <tbody>
                  {cohorts.map((c) => (
                    <tr key={c.key} className="border-t border-line">
                      <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1 text-left font-medium">{c.label}</th>
                      <td className="num px-2 text-slate">{c.n}</td>
                      {cols.map((k) => { const x = c.cells[k]; if (!x) return <td key={k} className="p-0.5"><div className="h-7 min-w-11" /></td>; const b = bucketOf(x.pct); const d = describe(c, x); return (
                        <td key={k} className="p-0.5"><div tabIndex={0} title={d} aria-label={d} onMouseEnter={() => setHover(d)} onFocus={() => setHover(d)} className="num grid h-7 min-w-11 cursor-default place-items-center rounded font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink" style={{ background: b.bg, color: b.fg }}>{x.pct.toFixed(0)}%</div></td>) })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-ink/20 bg-cloud/60">
                    <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-cloud px-3 py-1.5 text-left font-semibold">Weighted average</th>
                    <td className="num px-2 text-slate">{totalCos}</td>
                    {cols.map((k) => { const a = avg[k]; if (!a) return <td key={k} />; const b = bucketOf(a.pct); const d = metric === 'logo' ? `All cohorts, month ${k}: ${a.kept} of ${a.n} companies still active (${a.pct.toFixed(0)}%), ${a.cohorts} cohort${a.cohorts === 1 ? '' : 's'}` : `All cohorts, month ${k}: ${naira(a.mrrK)} of ${naira(a.mrr0)} (${a.pct.toFixed(0)}%)`; return (
                      <td key={k} className="p-0.5"><div tabIndex={0} title={d} aria-label={d} onMouseEnter={() => setHover(d)} onFocus={() => setHover(d)} className="num grid h-7 min-w-11 place-items-center rounded font-bold ring-1 ring-ink/30 focus-visible:outline-2 focus-visible:outline-ink" style={{ background: b.bg, color: b.fg }}>{a.pct.toFixed(0)}%</div></td>) })}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 min-h-5 text-xs text-slate" aria-live="polite">{hover || 'Hover or focus a cell for the exact counts. The weighted average counts each company once, so larger cohorts matter more.'}</p>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-semibold">Retention curves</h3>
            <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Choose cohorts to plot">
              {cohorts.map((c, i) => <label key={c.key} className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line px-2 py-1 text-[11px]"><input type="checkbox" className="accent-teal" checked={!off.has(c.key)} onChange={() => toggleCohort(c.key)} /><span className="size-2 rounded-full" style={{ background: LINE_COLORS[i % LINE_COLORS.length] }} aria-hidden />{c.label}</label>)}
            </div>
            <div className="h-72 w-full" role="img" aria-label={`Line chart of ${metric === 'logo' ? 'logo' : 'revenue'} retention by month since signup for selected cohorts, the weighted average and a benchmark line.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 18, left: 0 }}>
                  <CartesianGrid stroke="#d8e2e3" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="k" tickFormatter={(k) => `M${k}`} tick={{ fontSize: 11, fill: '#60777d' }} label={{ value: 'Months since signup', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#60777d' }} />
                  <YAxis domain={['dataMin - 5', metric === 'revenue' ? 'dataMax + 5' : 100]} tickFormatter={(v) => `${Math.round(v)}%`} tick={{ fontSize: 11, fill: '#60777d' }} width={44} />
                  <Tooltip formatter={(v, n) => [`${v}%`, String(n)]} labelFormatter={(k) => `Month ${k}`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {lineCohorts.map(({ c, i }) => <Line key={c.key} type="monotone" dataKey={`c${i}`} name={c.label} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.5} dot={cols.length < 4} connectNulls={false} isAnimationActive={!reduced} />)}
                  <Line type="monotone" dataKey="avg" name="Weighted average" stroke="#102a30" strokeWidth={3} dot={false} isAnimationActive={!reduced} />
                  <Line type="monotone" dataKey="bench" name="Benchmark" stroke="#60777d" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={!reduced} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-slate">Benchmark is a rule of thumb for B2B SaaS, not measured from BizFlow: about {metric === 'logo' ? '89% of companies still active' : '104% of starting revenue'} after 12 months. Shows the latest {Math.min(8, shown.length)} selected cohorts.</p>
          </div>
        </>)}

        <div className="rounded-md border border-line p-3 text-[13px]">
          <b>Does this matter at your scale?</b>{' '}
          <span className="text-slate">{realCount < 20
            ? `Not yet. With ${realCount} ${realCount === 1 ? 'company' : 'companies'} each cohort holds one or two customers, so a single cancellation swings retention by 50 to 100 points and no pattern is statistically meaningful. For now, watch Tenant health, renewals and payment failures instead. Cohort retention starts to pay off once monthly cohorts reach roughly 10 or more companies, usually past 100 customers in total. The report is wired to live tenant and subscription data, so it fills in on its own as you grow.`
            : 'Yes. You have enough companies per cohort to compare signup months, spot onboarding or pricing changes that helped or hurt, and set a retention target against the benchmark.'}</span>
        </div>
      </div>
    </Panel>
  )
}
