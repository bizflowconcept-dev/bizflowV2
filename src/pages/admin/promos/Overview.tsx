import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BadgePercent, CalendarClock, Coins, Gauge, Receipt, Repeat, Tag as TagIcon, TrendingUp } from 'lucide-react'
import { Panel } from '../../../components/ui'
import { CHART } from '../../../components/charts'
import type { BillingState } from '../../../data/billing'
import { compactNgn, overview, unitDiscountNgn } from './calc'
import { Kpi, MixBars, Meter, Tag, chartTip, reducedMotion, valueLabel } from './ui'

function ChartCard({ title, tag, note, children, className = '' }: { title: string; tag: ('actual' | 'modelled')[]; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <Panel title={title} className={className} action={<span className="flex gap-1.5">{tag.map((t) => <Tag key={t} kind={t} />)}</span>}>
      {children}
      {note && <p className="mt-3 text-xs leading-relaxed text-slate">{note}</p>}
    </Panel>
  )
}

export default function Overview({ s, onOpen }: { s: BillingState; onOpen: (id: string) => void }) {
  const o = overview(s); const anim = !reducedMotion()
  const conv = o.st.trialStarted ? `${Math.round((o.st.converted / o.st.trialStarted) * 100)}%` : '—'
  const exposure = s.promos.filter((p) => p.active && p.limit).map((p) => {
    const st = o.per.find((x) => x.p.id === p.id)!.st
    return { name: p.code ?? p.name, given: Math.round(st.discount / 1e6 * 100) / 100, headroom: Math.round(Math.max(0, p.limit! - p.redeemed) * unitDiscountNgn(p) / 1e6 * 100) / 100 }
  })
  const board = [...o.per].sort((a, b) => b.st.revenue - a.st.revenue || b.st.count - a.st.count || a.p.name.localeCompare(b.p.name))
  const planRows = s.plans.filter((p) => p.status === 'active').map((p) => ({ key: p.id, label: p.name, value: o.st.byPlan.find((x) => x.key === p.id)?.count ?? 0, note: o.st.byPlan.find((x) => x.key === p.id) ? compactNgn(o.st.byPlan.find((x) => x.key === p.id)!.discount) + ' off' : undefined }))
  const channels = [...new Set([...s.promos.map((p) => p.channel ?? 'Unassigned'), ...o.st.byChannel.map((c) => c.key)])]
  const chanRows = channels.map((c) => { const x = o.st.byChannel.find((y) => y.key === c); return { key: c, label: c, value: x?.count ?? 0, note: x ? compactNgn(x.discount) + ' off' : undefined } }).sort((a, b) => b.value - a.value)
  const monthNow = [...o.series].reverse().find((p) => !p.future)?.m

  return (
    <div className="space-y-5">
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi i={0} icon={<BadgePercent size={15} />} label="Live promotions" value={String(o.live.length)} sub={`${s.promos.length} total · ${s.promos.filter((p) => !p.active).length} draft`} />
        <Kpi i={1} icon={<Repeat size={15} />} label="Total redemptions" value={String(o.st.count)} sub={`${o.st.companies} compan${o.st.companies === 1 ? 'y' : 'ies'}`} tone="blue" />
        <Kpi i={2} icon={<Coins size={15} />} label="Discount value given" value={compactNgn(o.st.discount)} sub="At reference FX rates" tone="amber" />
        <Kpi i={3} icon={<Receipt size={15} />} label="Revenue influenced" value={compactNgn(o.st.revenue)} sub="Net of discount, first charge" tone="green" />
        <Kpi i={4} icon={<TagIcon size={15} />} label="Avg discount / redemption" value={o.st.count ? compactNgn(o.st.avg) : '—'} sub={o.st.revenue ? `${Math.round((o.st.discount / (o.st.discount + o.st.revenue)) * 100)}% of list value` : 'No redemptions yet'} />
        <Kpi i={5} icon={<TrendingUp size={15} />} label="Trial to paid with promo" value={conv} sub={o.st.trialStarted ? `${o.st.converted} of ${o.st.trialStarted} trials` : 'No trial-started redemptions'} tone="blue" />
        <Kpi i={6} icon={<Gauge size={15} />} label="Redemption limit used" value={o.cap ? `${Math.round((o.used / o.cap) * 100)}%` : '—'} sub={o.cap ? `${o.used} of ${o.cap.toLocaleString()} capped uses` : 'No capped promotions'} tone={o.cap && o.used / o.cap >= 0.8 ? 'red' : 'amber'} />
        <Kpi i={7} icon={<CalendarClock size={15} />} label="Expiring in 30 days" value={String(o.expiring.length)} sub={o.expiring.length ? o.expiring.map((p) => p.code ?? p.name).join(', ') : 'Nothing expiring soon'} tone={o.expiring.length ? 'red' : 'green'} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Redemptions over time" tag={['actual', 'modelled']} note="Bars are redemptions recorded in the ledger. The dashed line is modelled demand: each active promotion's planned volume spread across its window. It is a planning aid, not a forecast.">
          <div className="h-60" role="img" aria-label="Monthly redemptions from the ledger against modelled demand">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={o.series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="m" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip {...chartTip} formatter={(v, n) => [Number(v).toLocaleString(), n === 'actual' ? 'Redemptions (ledger)' : 'Modelled demand']} />
                {monthNow && <ReferenceLine x={monthNow} stroke={CHART.navy} strokeDasharray="2 3" label={{ value: 'Today', fill: CHART.axis, fontSize: 10, position: 'insideTopRight' }} />}
                <Bar dataKey="actual" fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={anim} />
                <Line dataKey="modelled" stroke={CHART.blue} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={anim} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Discount value by promotion" tag={['actual', 'modelled']} note="Solid segment is discount given so far. Light segment is modelled remaining exposure if each capped promotion is redeemed to its limit at a typical Growth annual price.">
          {exposure.length ? (
            <div className="h-60" role="img" aria-label="Discount given and modelled remaining exposure per promotion, in millions of naira">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={exposure} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `₦${v}m`} />
                  <YAxis type="category" dataKey="name" width={88} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip {...chartTip} formatter={(v, n) => [`₦${Number(v).toLocaleString()}m`, n === 'given' ? 'Discount given' : 'Modelled exposure left']} />
                  <Bar dataKey="given" stackId="a" fill={CHART.teal} isAnimationActive={anim} />
                  <Bar dataKey="headroom" stackId="a" fill="#BFE3E6" radius={[0, 4, 4, 0]} isAnimationActive={anim} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="py-10 text-center text-sm text-slate">No capped promotions are active.</p>}
        </ChartCard>

        <ChartCard title="Redemptions by plan" tag={['actual']} note="Plans with no redemptions are shown so gaps in take-up are visible.">
          <MixBars rows={planRows} fmt={(n) => `${n} redemption${n === 1 ? '' : 's'}`} empty="No active plans." />
        </ChartCard>
        <ChartCard title="Redemptions by channel and source" tag={['actual']} note="Channel is set on each promotion; the ledger records it at the moment of redemption.">
          <MixBars rows={chanRows} fmt={(n) => `${n} redemption${n === 1 ? '' : 's'}`} empty="No channels tagged yet." />
        </ChartCard>
      </div>

      <Panel title="Top promotions" action={<span className="text-xs text-slate">Ranked by revenue influenced</span>} pad={false}>
        <ol className="divide-y divide-line/70">
          {board.slice(0, 6).map(({ p, st }, i) => (
            <li key={p.id}>
              <button onClick={() => onOpen(p.id)} className="grid w-full cursor-pointer grid-cols-[1.75rem_1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-softmint/25 sm:px-5">
                <span className={`num grid size-7 place-items-center rounded-full text-xs font-bold ${i === 0 && st.count ? 'bg-teal text-white' : 'bg-ink/5 text-slate'}`}>{i + 1}</span>
                <span className="min-w-0"><b className="block truncate text-sm text-ink">{p.code ?? p.name}</b><span className="block truncate text-xs text-slate">{p.name} · {valueLabel(p, s)} off{p.campaign ? ` · ${p.campaign}` : ''}</span></span>
                <span className="num text-right text-sm font-semibold text-ink">{st.count ? compactNgn(st.revenue) : '—'}<span className="block text-xs font-normal text-slate">{st.count} used{st.count ? ` · ${compactNgn(st.discount)} off` : ''}</span></span>
                <span className="col-span-3 sm:col-start-2 sm:col-span-2"><Meter value={p.redeemed} max={p.limit} label={`${p.name} usage`} /></span>
              </button>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}
