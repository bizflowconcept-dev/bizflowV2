import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Info } from 'lucide-react'
import { Badge, Btn, ExportButton, Field, PageHeader, Panel, Table, inputCls } from '../../components/ui'
import { CHART, StatCard } from '../../components/charts'
import { breakdowns, complimentary, compactN, concentration, forecast, insights, metrics, movements, usePortfolioTenants } from '../../billing/portfolio'
import type { Slice } from '../../billing/portfolio'
import { fmtN, ledgerStats, useInvoices } from '../../billing/ledger'
import { STATUS_META } from '../../data/billing'
import { complimentaryLabel } from '../../data/grants'

const TIP = { borderRadius: 8, border: '1px solid #D8E2E3', fontSize: 12, boxShadow: '0 6px 20px rgba(11,37,48,.08)' }
const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`

function ShareBars({ rows, empty, limit = 8 }: { rows: Slice[]; empty: string; limit?: number }) {
  if (!rows.length) return <p className="text-sm text-slate">{empty}</p>
  const max = rows[0].value
  return (
    <ul className="space-y-3">
      {rows.slice(0, limit).map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium">{r.name}</span><span className="num shrink-0 text-slate">{compactN(r.value)} <b className="text-ink">{pct(r.share, 1)}</b></span></div>
          <div className="mt-1 h-1.5 rounded bg-ink/10" role="progressbar" aria-label={`${r.name} share of MRR`} aria-valuenow={Math.round(r.share * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded bg-teal" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
        </li>
      ))}
      {rows.length > limit && <li className="text-xs text-slate">{rows.length - limit} smaller lines not shown.</li>}
    </ul>
  )
}

const TONE_ICON = { good: CheckCircle2, warn: AlertTriangle, bad: ArrowDownRight, info: Info } as const
const TONE_CLS = { good: 'text-ok', warn: 'text-[#b07100]', bad: 'text-err', info: 'text-info' } as const

export default function Revenue() {
  const { s, tenants } = usePortfolioTenants()
  const { invoices } = useInvoices()
  const mv = useMemo(() => movements(tenants), [tenants])
  const mt = useMemo(() => metrics(tenants, mv), [tenants, mv])
  const bd = useMemo(() => breakdowns(s, tenants), [s, tenants])
  const conc = useMemo(() => concentration(tenants), [tenants])
  const fc = useMemo(() => forecast(mv, mt.mrr), [mv, mt.mrr])
  const stats = useMemo(() => ledgerStats(invoices), [invoices])
  const list = useMemo(() => insights(tenants, mv, mt, compactN, { amount: stats.overdueAmt, count: stats.overdueCount }), [tenants, mv, mt, stats])
  const [bridgeIdx, setBridgeIdx] = useState(mv.length - 1)
  const [cacInput, setCacInput] = useState<string>('')
  const cac = cacInput.trim() === '' ? mt.cacDefault : Math.max(0, Number(cacInput) || 0)
  const comp = useMemo(() => tenants.flatMap((t) => complimentary(s, t.sub).lines.map((l) => ({ t, ...l }))), [s, tenants])
  const compTotal = comp.reduce((n, c) => n + c.value, 0)
  const real = tenants.length; const thin = mt.payingAccounts < 3
  const b = mv[bridgeIdx]
  const bridge = useMemo(() => {
    const steps = [['Opening', b.opening, 'total'], ['New', b.newMrr, 'up'], ['Expansion', b.expansion, 'up'], ['Reactivation', b.reactivation, 'up'], ['Contraction', b.contraction, 'down'], ['Complimentary', b.complimentary, 'down'], ['Churn', b.churn, 'down'], ['Closing', b.closing, 'total']] as const
    let run = 0
    return steps.map(([name, v, kind]) => {
      if (kind === 'total') { run = v; return { name, base: 0, value: v, kind } }
      const start = run; run += v
      return { name, base: Math.min(start, run), value: Math.abs(v), kind }
    })
  }, [b])
  const chart = mv.map((m) => ({ m: m.label, New: m.newMrr, Expansion: m.expansion, Reactivation: m.reactivation, Contraction: m.contraction, Complimentary: m.complimentary, Churn: m.churn, MRR: m.closing }))
  const fcChart = [...mv.slice(-4).map((m) => ({ m: m.label, actual: m.closing })), ...fc.rows.map((r, i) => ({ m: r.label, ...(i === 0 ? { actual: mt.mrr } : {}), low: r.low, base: r.base, high: r.high }))]
  const ltvCac = cac > 0 ? mt.ltv / cac : 0
  const payback = mt.arpa * mt.margin > 0 ? cac / (mt.arpa * mt.margin) : 0
  const up = mt.momPct >= 0

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Finance" title="Revenue operations" desc="Where recurring revenue came from, what moved it this month and where it is heading." actions={<>
        <Btn v="secondary" to="/admin/billing/invoices">Invoices</Btn>
        <ExportButton name="revenue-movements" head={['Month', 'Opening', 'New', 'Expansion', 'Reactivation', 'Contraction', 'Complimentary', 'Churn', 'Closing']} rows={mv.map((m) => [m.label, ...[m.opening, m.newMrr, m.expansion, m.reactivation, m.contraction, m.complimentary, m.churn, m.closing].map(String)])} />
      </>} />

      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-softmint/40 p-3.5 text-[13px] text-slate" role="note">
        <Info size={16} className="mt-0.5 shrink-0 text-teal" aria-hidden />
        <p className="min-w-0 flex-1">Built from <b className="text-ink">{real} real subscription{real === 1 ? '' : 's'}</b> in the billing store, including any workspace created through Get Started. The store keeps no history, so earlier months are <b className="text-ink">modelled</b> from each subscription&apos;s current price and start date. {thin ? 'Insights appear as more companies subscribe.' : ''}</p>
        <Badge tone="amber">Modelled history</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="MRR" value={compactN(mt.mrr)} delta={`${Math.abs(mt.momPct).toFixed(1)}%`} up={up} hint="vs last month" data={mv.map((m) => m.closing)} />
        <StatCard label="ARR (MRR x 12)" value={compactN(mt.arr)} hint={`${mt.payingAccounts} paying accounts`} data={mv.map((m) => m.closing * 12)} />
        <StatCard label="Net revenue retention (6 mo)" value={thin ? 'Not yet' : `${mt.nrr.toFixed(0)}%`} {...(thin ? {} : { up: mt.nrr >= 100, delta: mt.nrr >= 100 ? 'Expanding' : 'Shrinking' })} hint={thin ? 'Needs three paying companies' : 'same accounts, then vs now'} />
        <StatCard label="Gross revenue retention (6 mo)" value={thin ? 'Not yet' : `${mt.grr.toFixed(0)}%`} {...(thin ? {} : { up: mt.grr >= 90, delta: mt.grr >= 90 ? 'Healthy' : 'Leaky' })} hint={thin ? 'Needs three paying companies' : 'ignores expansion'} />
        <StatCard label="ARPA (revenue per account)" value={compactN(mt.arpa)} hint="MRR / paying accounts" />
        <StatCard label="LTV : CAC (proxy)" value={thin || cac <= 0 ? (thin ? 'Not yet' : 'Set CAC') : `${ltvCac.toFixed(1)} : 1`} {...(thin || cac <= 0 ? {} : { up: ltvCac >= 3, delta: ltvCac >= 3 ? 'Above 3:1' : 'Below 3:1' })} hint={thin ? 'Needs churn history from more companies' : `LTV ${compactN(mt.ltv)}`} />
      </div>

      <Panel title="Billed MRR and complimentary MRR" action={<Badge tone={comp.length ? 'blue' : 'gray'}>{comp.length} live grant{comp.length === 1 ? '' : 's'}</Badge>}>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div><div className="text-xs text-slate">Billed MRR</div><div className="num text-xl font-bold">{compactN(mt.mrr)}</div></div>
          <div><div className="text-xs text-slate">Complimentary MRR (forgone)</div><div className="num text-xl font-bold">{compactN(compTotal)}</div></div>
          <div><div className="text-xs text-slate">Value at list price</div><div className="num text-xl font-bold">{compactN(mt.mrr + compTotal)}</div></div>
        </div>
        {comp.length === 0 ? <p className="mt-3 text-sm text-slate">No complimentary periods are running. Free periods you grant appear here, and are left out of MRR.</p> : (
          <div className="mt-4"><Table label="Complimentary lines" head={['Tenant', 'Grant', 'Line', 'List per month', 'Discount', 'Billed']} right={[3, 4, 5]} pageSize={5}
            rows={comp.map((c) => [c.t.name, c.grant.name, complimentaryLabel(c.grant), fmtN(c.value), '100%', fmtN(0)])} /></div>
        )}
        <p className="mt-3 text-xs text-slate">When a grant ends, its conversion setting decides the next invoice: auto-bill adds the kept modules at the normal price, revert returns to the previous plan, and tenant action waits for the company to choose. Billed MRR rises from that renewal.</p>
      </Panel>

      <Panel title="MRR movements by month"  action={<span className="text-xs text-slate">Bars: movement. Line: closing MRR</span>}>
        <div className="h-[320px]" role="img" aria-label="Stacked bars of new, expansion, reactivation, contraction, complimentary and churn MRR by month, with closing MRR as a line">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} stackOffset="sign" margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickMargin={8} />
              <YAxis yAxisId="mv" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickFormatter={compactN} width={64} />
              <YAxis yAxisId="tot" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickFormatter={compactN} width={64} domain={['dataMin - 1000000', 'dataMax + 1000000']} />
              <Tooltip formatter={(v, n) => [fmtN(Number(v)), n]} contentStyle={TIP} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar yAxisId="mv" dataKey="New" stackId="a" fill={CHART.teal} isAnimationActive={false} />
              <Bar yAxisId="mv" dataKey="Expansion" stackId="a" fill={CHART.green} isAnimationActive={false} />
              <Bar yAxisId="mv" dataKey="Reactivation" stackId="a" fill={CHART.blue} isAnimationActive={false} />
              <Bar yAxisId="mv" dataKey="Contraction" stackId="a" fill={CHART.amber} isAnimationActive={false} />
              <Bar yAxisId="mv" dataKey="Complimentary" stackId="a" fill="#8b5cf6" isAnimationActive={false} />
              <Bar yAxisId="mv" dataKey="Churn" stackId="a" fill={CHART.red} isAnimationActive={false} />
              <Line yAxisId="tot" type="monotone" dataKey="MRR" name="Closing MRR" stroke={CHART.navy} strokeWidth={2.25} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="What changed this month" action={<Badge tone={up ? 'green' : 'red'}>{up ? 'MRR up' : 'MRR down'}</Badge>}>
          <ul className="space-y-3.5">
            {list.map((i, n) => {
              const Icon = TONE_ICON[i.tone]
              return <li key={n} className="flex gap-3"><Icon size={18} className={`mt-0.5 shrink-0 ${TONE_CLS[i.tone]}`} aria-hidden /><div className="min-w-0"><div className="text-sm font-semibold leading-snug">{i.title}</div><p className="mt-0.5 text-[13px] leading-snug text-slate">{i.detail}</p></div></li>
            })}
          </ul>
        </Panel>
        <Panel title="Month bridge" action={<select aria-label="Month" className="h-8 rounded-md border border-line bg-white px-2 text-[13px]" value={bridgeIdx} onChange={(e) => setBridgeIdx(Number(e.target.value))}>{mv.map((m, i) => <option key={m.label} value={i}>{m.label}</option>)}</select>}>
          <div className="h-[250px]" role="img" aria-label={`MRR bridge for ${b.label}: opening ${fmtN(b.opening)}, closing ${fmtN(b.closing)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={bridge} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: CHART.axis }} interval={0} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickFormatter={compactN} width={64} domain={[(min: number) => Math.max(0, Math.floor(min * 0.9)), 'auto']} />
                <Tooltip formatter={(v, n) => (n === 'base' ? [null, null] : [fmtN(Number(v)), 'Amount'])} contentStyle={TIP} />
                <Bar dataKey="base" stackId="b" fill="transparent" isAnimationActive={false} legendType="none" />
                <Bar dataKey="value" stackId="b" isAnimationActive={false}>{bridge.map((p) => <Cell key={p.name} fill={p.kind === 'total' ? CHART.navy : p.kind === 'up' ? CHART.green : p.name === 'Complimentary' ? '#8b5cf6' : CHART.red} />)}</Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate">{b.logosNew} account{b.logosNew === 1 ? '' : 's'} started or returned and {b.logosChurned} left in {b.label}.{b.complimentary < 0 && ' Complimentary is fee waived by a grant: the account stays, so it is not churn or contraction.'}</p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Revenue by plan"><ShareBars rows={bd.byPlan} empty="No paying accounts yet." /></Panel>
        <Panel title="Revenue by add-on"><ShareBars rows={bd.byAddon} empty="No add-ons are sold yet." /></Panel>
        <Panel title="Revenue by module" action={<span className="text-xs text-slate">Allocated</span>}>
          <ShareBars rows={bd.byModule} empty="No module revenue yet." limit={8} />
          <p className="mt-3 text-xs text-slate">Plan revenue is split across the modules a plan includes, weighted by module importance (Foundation 4, Essential 3, Recommended 2, Specialist 1). Add-on revenue goes to the modules it grants.</p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel title="Top 10 tenant concentration" className="lg:col-span-3" action={<Badge tone={conc.top10Share > 0.8 ? 'amber' : 'green'}>{pct(conc.top10Share)} of MRR</Badge>}>
          {conc.rows.length < 2 ? <p className="text-sm text-slate">Insights appear as more companies subscribe. Concentration needs at least two paying companies{conc.rows[0] ? `; today ${conc.rows[0].tenant.name} is the only one.` : '.'}</p> : (
            <Table label="Top ten tenants by MRR" head={['Tenant', 'Plan', 'MRR', 'Share', 'Cumulative']} right={[2, 3, 4]} pageSize={10}
              rows={conc.rows.map((r) => [<span key="n" className="font-semibold">{r.rank}. {r.tenant.name}</span>, r.tenant.sub.planId, fmtN(r.mrr), pct(r.share, 1), pct(r.cumulative, 1)])} />
          )}
        </Panel>
        <Panel title="Unit economics" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div><dt className="text-xs text-slate">Monthly logo churn (6 mo avg)</dt><dd className="num font-semibold">{pct(mt.logoChurnMonthly, 1)}</dd></div>
            <div><dt className="text-xs text-slate">Monthly revenue churn</dt><dd className="num font-semibold">{pct(mt.revenueChurnMonthly, 1)}</dd></div>
            <div><dt className="text-xs text-slate">Gross margin (assumed)</dt><dd className="num font-semibold">{pct(mt.margin)}</dd></div>
            <div><dt className="text-xs text-slate">LTV = ARPA x margin / churn</dt><dd className="num font-semibold">{thin ? 'n/a' : compactN(mt.ltv)}</dd></div>
            <div><dt className="text-xs text-slate">CAC payback</dt><dd className="num font-semibold">{payback ? `${payback.toFixed(1)} months` : 'n/a'}</dd></div>
            <div><dt className="text-xs text-slate">MRR in payment trouble</dt><dd className="num font-semibold">{compactN(mt.atRiskMrr)} <Link to="/admin/billing/recovery" className="text-xs font-semibold text-teal">Recover</Link></dd></div>
          </dl>
          <div className="mt-4"><Field label="Customer acquisition cost (NGN, per account)" hint={cacInput === '' ? 'Default: three times the average new-account MRR over six months. Type your own figure.' : 'Your figure replaces the default.'}><input inputMode="numeric" className={inputCls} value={cacInput} placeholder={String(mt.cacDefault)} onChange={(e) => setCacInput(e.target.value.replace(/[^\d]/g, ''))} /></Field></div>
          <p className="mt-3 text-xs text-slate">BizFlow does not store sales and marketing spend, so CAC is a proxy you can overwrite, and gross margin is an assumption.</p>
        </Panel>
      </div>

      <Panel title="Three-month forecast" action={<span className="text-xs text-slate">Trailing three-month average, applied forward</span>}>
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <div className="h-[260px]" role="img" aria-label="MRR forecast with low, base and high cases for the next three months">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={fcChart} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickFormatter={compactN} width={64} domain={['dataMin - 500000', 'dataMax + 500000']} />
                  <Tooltip formatter={(v, n) => [fmtN(Number(v)), n]} contentStyle={TIP} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="high" name="High case" stroke="none" fill={CHART.teal} fillOpacity={0.08} isAnimationActive={false} />
                  <Line type="monotone" dataKey="actual" name="Actual" stroke={CHART.navy} strokeWidth={2.25} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="base" name="Base case" stroke={CHART.teal} strokeWidth={2.25} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="low" name="Low case" stroke={CHART.amber} strokeWidth={1.5} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="high" name="High case line" stroke={CHART.green} strokeWidth={1.5} strokeDasharray="2 3" dot={false} legendType="none" isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="lg:col-span-2">
            <Table label="Forecast by month" head={['Month', 'Low', 'Base', 'High']} right={[1, 2, 3]} pageSize={3} rows={fc.rows.map((r) => [r.label, compactN(r.low), compactN(r.base), compactN(r.high)])} />
            <p className="mt-3 text-[13px] leading-snug text-slate"><b className="text-ink">Method.</b> Each month adds the average of the last three months of gains (new {compactN(fc.drivers.newMrr)}, expansion {compactN(fc.drivers.expansion)}, reactivation {compactN(fc.drivers.reactivation)}) and losses (contraction {compactN(-fc.drivers.contraction)}, churn {compactN(-fc.drivers.churn)}). Net {fc.netPerMonth >= 0 ? '+' : '-'}{compactN(Math.abs(fc.netPerMonth))} a month. Low case: gains x0.6, losses x1.4. High case: gains x1.25, losses x0.6. It does not know about planned launches or price changes.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Account status behind the numbers" pad={false}>
        <Table label="Portfolio accounts" head={['Account', 'Source', 'Plan', 'Status', 'Cycle', 'MRR']} right={[5]} pageSize={8}
          rows={[...tenants].sort((a, c) => c.series[11] - a.series[11]).map((t) => [t.name, t.real ? <Badge key="s" tone="teal">Real</Badge> : <Badge key="s" tone="gray">Modelled</Badge>, t.sub.planId, <Badge key="st" tone={['past_due', 'payment_failed', 'grace'].includes(t.sub.status) ? 'amber' : ['cancelled', 'suspended', 'expired'].includes(t.sub.status) ? 'red' : t.sub.status === 'trial' ? 'blue' : 'green'}>{STATUS_META[t.sub.status].label}</Badge>, t.sub.cycle, fmtN(t.series[11])])} />
      </Panel>
      <p className="flex items-center gap-1.5 text-xs text-slate">{up ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />} Figures are in naira. Credit notes flagged recurring reduce MRR from the month they are approved; refunds and voids affect cash and balances, not contracted MRR, unless the subscription is also cancelled.</p>
    </div>
  )
}
