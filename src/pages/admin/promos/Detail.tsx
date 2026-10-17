import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, BadgePercent, CalendarClock, Check, Coins, Copy, Pause, Pencil, Play, Receipt, Repeat, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Badge, Btn, Panel, useToast } from '../../../components/ui'
import { CHART } from '../../../components/charts'
import { daysUntil, fmtDate } from '../../../data/billing'
import type { BillingState, Promo } from '../../../data/billing'
import { compactNgn, promoRange, promoState, redemptionsOf, seriesFor, STATE_TONE, statsOf } from './calc'
import Companies from './Companies'
import type { Perms } from './Companies'
import { Kpi, Meter, MixBars, Tag, chartTip, eligibilityLines, reducedMotion, valueLabel } from './ui'
import { setPromoActive } from './actions'

export default function Detail({ s, promo, perms, canEdit, actor, onBack, onEdit, onDuplicate }: { s: BillingState; promo: Promo; perms: Perms; canEdit: boolean; actor: string; onBack: () => void; onEdit: () => void; onDuplicate: () => void }) {
  const toast = useToast(); const [copied, setCopied] = useState(false); const anim = !reducedMotion()
  const rows = redemptionsOf(s, promo.id); const st = statsOf(s, rows); const state = promoState(promo)
  const series = seriesFor([promo], rows, promoRange(promo, rows))
  const left = daysUntil(promo.end)
  const conv = st.trialStarted ? `${Math.round((st.converted / st.trialStarted) * 100)}%` : '—'
  const copy = () => { if (!promo.code) return; navigator.clipboard?.writeText(promo.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) }, () => toast('Copy failed. Select the code and copy it manually.', 'err')) }
  const plans = s.plans.filter((p) => p.status === 'active').map((p) => ({ key: p.id, label: p.name, value: st.byPlan.find((x) => x.key === p.id)?.count ?? 0, note: st.byPlan.find((x) => x.key === p.id) ? compactNgn(st.byPlan.find((x) => x.key === p.id)!.discount) + ' off' : undefined })).filter((p) => !promo.plans.length || promo.plans.includes(p.key))
  const cycles = (['monthly', 'annual'] as const).filter((c) => !promo.cycles.length || promo.cycles.includes(c)).map((c) => ({ key: c, label: c === 'annual' ? 'Annual billing' : 'Monthly billing', value: st.byCycle.find((x) => x.key === c)?.count ?? 0 }))

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-sm font-semibold text-teal"><ArrowLeft size={15} aria-hidden />All discounts and coupons</button>
      <section className="sub-fade rounded-xl border border-line bg-white p-4 sm:p-5" aria-label="Promotion summary">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={STATE_TONE[state]}>{state}</Badge><Badge tone="gray">{promo.kind === 'coupon' ? 'Coupon code' : 'Automatic discount'}</Badge>{promo.channel && <Badge tone="blue">{promo.channel}</Badge>}{promo.campaign && <Badge tone="teal">{promo.campaign}</Badge>}</div>
            <h1 className="mt-2 break-words text-2xl font-semibold leading-tight text-ink">{promo.code ? <span className="font-mono">{promo.code}</span> : promo.name}</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate">{promo.code ? `${promo.name}. ` : ''}{promo.description}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {promo.code && <Btn v="secondary" s="sm" onClick={copy}>{copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{copied ? 'Copied' : 'Copy code'}</Btn>}
            {canEdit && <Btn v="secondary" s="sm" onClick={onDuplicate}><Copy size={14} aria-hidden />Duplicate</Btn>}
            {canEdit && <Btn v="secondary" s="sm" onClick={() => { setPromoActive(actor, promo, !promo.active); toast(promo.active ? 'Moved to draft. It no longer applies at checkout.' : 'Published.') }}>{promo.active ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}{promo.active ? 'Move to draft' : 'Publish'}</Btn>}
            <Btn s="sm" onClick={onEdit}><Pencil size={14} aria-hidden />{canEdit ? 'Edit' : 'View rules'}</Btn>
          </div>
        </div>
        <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-slate"><span>{promo.redeemed}{promo.limit ? ` of ${promo.limit.toLocaleString()}` : ''} redeemed</span><span>{promo.limit ? `${Math.max(0, promo.limit - promo.redeemed).toLocaleString()} left` : 'Unlimited'}</span></div><Meter value={promo.redeemed} max={promo.limit} label="Redemption limit used" /></div>
      </section>

      <section aria-label="Performance" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi i={0} icon={<BadgePercent size={15} />} label="Offer" value={valueLabel(promo, s)} sub={promo.type === 'percent' ? 'Percentage off' : 'Fixed amount off'} />
        <Kpi i={1} icon={<Repeat size={15} />} label="Redemptions" value={String(st.count)} sub={`${st.companies} compan${st.companies === 1 ? 'y' : 'ies'}`} tone="blue" />
        <Kpi i={2} icon={<Coins size={15} />} label="Discount given" value={compactNgn(st.discount)} sub={st.count ? `${compactNgn(st.avg)} average` : 'None yet'} tone="amber" />
        <Kpi i={3} icon={<Receipt size={15} />} label="Revenue influenced" value={compactNgn(st.revenue)} sub="Net of discount" tone="green" />
        <Kpi i={4} icon={<TrendingUp size={15} />} label="Trial to paid" value={conv} sub={st.trialStarted ? `${st.converted} of ${st.trialStarted}` : 'No trial redemptions'} tone="blue" />
        <Kpi i={5} icon={<CalendarClock size={15} />} label={left >= 0 ? 'Days left' : 'Ended'} value={left >= 0 ? String(left) : `${-left}d ago`} sub={`Ends ${fmtDate(promo.end)}`} tone={left >= 0 && left <= 30 ? 'red' : 'teal'} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Redemptions across the promotion window" action={<span className="flex gap-1.5"><Tag kind="actual" /><Tag kind="modelled" /></span>}>
          <div className="h-56" role="img" aria-label="Monthly redemptions from the ledger against modelled demand for this promotion">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="m" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip {...chartTip} formatter={(v, n) => [Number(v).toLocaleString(), n === 'actual' ? 'Redemptions (ledger)' : 'Modelled demand']} />
                <Bar dataKey="actual" fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={30} isAnimationActive={anim} />
                <Line dataKey="modelled" stroke={CHART.blue} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={anim} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate">Dashed line: modelled demand ({promo.limit ? `40% of the ${promo.limit}-use cap` : 'a nominal 60 uses'} spread across the window). Not a forecast.</p>
        </Panel>
        <Panel title="Who uses it" action={<Tag kind="actual" />}>
          <div className="space-y-5"><div><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate">Plan</div><MixBars rows={plans} fmt={(n) => `${n} use${n === 1 ? '' : 's'}`} empty="No eligible plans." /></div>
            <div><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate">Billing cycle</div><MixBars rows={cycles} fmt={(n) => `${n} use${n === 1 ? '' : 's'}`} empty="" /></div></div>
        </Panel>
      </div>

      <Panel title="Eligibility and rules">
        <ul className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">{eligibilityLines(promo, s).map((l) => <li key={l} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal" aria-hidden />{l}</li>)}</ul>
      </Panel>

      <Companies s={s} promo={promo} rows={rows} perms={perms} actor={actor} />
    </div>
  )
}
