import { useMemo, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { Badge, Btn, Field, inputCls, Overlay, useToast } from '../../../components/ui'
import { iso, money, quote, TODAY } from '../../../data/billing'
import type { BillingState, Promo } from '../../../data/billing'
import { CHANNELS } from '../../../data/promoLedger'
import { Toggle } from '../Plans'
import { promoState } from './calc'
import { eligibilityLines, valueLabel } from './ui'

export const blankPromo = (kind: Promo['kind']): Promo => ({ id: '', kind, code: kind === 'coupon' ? '' : undefined, name: '', description: '', type: 'percent', value: 10, appliesTo: 'all', plans: [], currencies: [], cycles: [], firstPeriodOnly: false, start: iso(TODAY), end: '2026-12-31', limit: null, redeemed: 0, eligibility: 'all', active: false, channel: 'Website checkout', campaign: '', stacking: 'exclusive', perCompanyCap: 1 })

export const duplicateOf = (p: Promo, s: BillingState): Promo => {
  let code = p.code; if (code) { let n = 2; const base = code.replace(/-\d+$/, ''); code = `${base}-${n}`; while (s.promos.some((x) => x.code === code)) code = `${base}-${++n}` }
  return { ...structuredClone(p), id: '', code, name: `${p.name} (copy)`, redeemed: 0, active: false, start: iso(TODAY) }
}

const makeCode = (p: Promo) => {
  const stem = (p.campaign || p.name || 'PROMO').toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(' ').filter(Boolean)[0]?.slice(0, 8) || 'PROMO'
  const tail = Math.random().toString(36).slice(2, 4).toUpperCase()
  return `${stem}${p.type === 'percent' ? p.value : Math.round(p.value / 1000) + 'K'}${tail}`
}

function Preview({ s, edit }: { s: BillingState; edit: Promo }) {
  const candidates = useMemo(() => s.plans.filter((p) => p.status === 'active' && p.model !== 'custom' && (!edit.plans.length || edit.plans.includes(p.id))), [s.plans, edit.plans])
  const [planId, setPlanId] = useState(''); const [cycle, setCycle] = useState<'monthly' | 'annual'>('annual')
  const plan = candidates.find((p) => p.id === planId) ?? candidates.find((p) => p.recommended) ?? candidates[0]
  const cycles = edit.cycles.length ? edit.cycles : (['monthly', 'annual'] as const)
  const cyc = cycles.includes(cycle) ? cycle : cycles[0]
  const curs = (edit.currencies.length ? edit.currencies : s.currencies.filter((c) => c.enabled).map((c) => c.code))
  const [cur0, setCur] = useState('NGN'); const cur = curs.includes(cur0) ? cur0 : curs[0]
  const code = edit.code?.trim().toUpperCase() || (edit.kind === 'coupon' ? 'YOURCODE' : undefined)
  const pv: BillingState = { ...s, redemptions: [], promos: [{ ...edit, id: 'preview', code, active: true, start: '2000-01-01', end: '2999-12-31', limit: null, perCompanyCap: null, redeemed: 0 }] }
  const q = plan && cur ? quote(pv, { planId: plan.id, cycle: cyc, currency: cur, employees: 40, coupon: edit.kind === 'coupon' ? code : undefined, isNew: true }) : null
  const sel = 'h-8 rounded-md border border-line bg-white px-2 text-xs'
  return (
    <section aria-label="How a customer sees this offer" className="rounded-xl border border-teal/30 bg-softmint/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-ink">Customer preview</h3>
        <div className="flex flex-wrap gap-1.5">
          <select aria-label="Preview plan" className={sel} value={plan?.id ?? ''} onChange={(e) => setPlanId(e.target.value)}>{candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select aria-label="Preview billing cycle" className={sel} value={cyc} onChange={(e) => setCycle(e.target.value as 'monthly' | 'annual')}>{cycles.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <select aria-label="Preview currency" className={sel} value={cur} onChange={(e) => setCur(e.target.value)}>{curs.map((c) => <option key={c}>{c}</option>)}</select>
        </div></div>
      <div className="rounded-lg border border-line bg-white p-3.5 text-sm">
        {edit.kind === 'coupon' && <div className="mb-3 flex items-center gap-2"><span className="h-9 flex-1 rounded-md border border-dashed border-teal/50 bg-cloud px-3 font-mono leading-9 text-ink">{code}</span><Badge tone={q?.discounts.length ? 'green' : 'amber'}>{q?.discounts.length ? 'Applied' : 'Not applicable'}</Badge></div>}
        {!q ? <p className="text-slate">No eligible plan or currency for these rules.</p> : !q.ok ? <p className="text-slate">{q.reason}</p> : <dl className="space-y-1.5">
          <div className="flex justify-between gap-3"><dt className="text-slate">{plan?.name} · {cyc} · 40 staff</dt><dd className="num">{money(q.subtotal, q.currency, { s, trim: true })}</dd></div>
          {q.discounts.map((d) => <div key={d.label} className="flex justify-between gap-3 text-ok"><dt>{edit.name || 'Discount'} ({valueLabel(edit, s)} off)</dt><dd className="num">−{money(d.amount, q.currency, { s, trim: true })}</dd></div>)}
          {!q.discounts.length && <p className="text-xs text-slate">This combination is outside the rules above, so no discount shows.</p>}
          <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold"><dt>Total due{q.taxLabel ? ` (+ ${q.taxLabel})` : ''}</dt><dd className="num">{money(q.total, q.currency, { s, trim: true })}</dd></div>
        </dl>}
      </div>
    </section>
  )
}

export default function Editor({ s, edit, setEdit, canEdit, onSave, onClose }: { s: BillingState; edit: Promo | null; setEdit: (p: Promo) => void; canEdit: boolean; onSave: () => void; onClose: () => void }) {
  const toast = useToast(); const [tried, setTried] = useState(false)
  if (!edit) return <Overlay open={false} onClose={onClose} title="" side wide>{null}</Overlay>
  const set = (patch: Partial<Promo>) => setEdit({ ...edit, ...patch })
  const toggleIn = <K extends 'plans' | 'currencies' | 'cycles'>(k: K, v: Promo[K][number], on: boolean) => set({ [k]: on ? [...(edit[k] as string[]), v as string] : (edit[k] as string[]).filter((x) => x !== v) } as Partial<Promo>)
  const dupCode = edit.kind === 'coupon' && !!edit.code && s.promos.some((p) => p.kind === 'coupon' && p.code?.toUpperCase() === edit.code!.toUpperCase() && p.id !== edit.id)
  const problems = [
    !edit.name.trim() && 'Add a name.',
    edit.kind === 'coupon' && !/^[A-Za-z0-9_-]{3,24}$/.test(edit.code ?? '') && 'Code must be 3 to 24 letters, numbers, hyphens or underscores.',
    dupCode && 'That code already exists.',
    edit.value <= 0 && 'Value must be above zero.',
    edit.type === 'percent' && edit.value > 100 && 'A percentage cannot exceed 100.',
    edit.end < edit.start && 'The end date is before the start date.',
  ].filter(Boolean) as string[]
  const state = promoState(edit)
  return (
    <Overlay open onClose={() => { setTried(false); onClose() }} title={edit.id ? (canEdit ? 'Edit promotion' : 'Promotion rules') : 'New promotion'} side wide>
      <fieldset disabled={!canEdit} className="space-y-6">
        <Preview s={s} edit={edit} />
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">Offer</h3>
          <Field label="Name"><input className={inputCls} value={edit.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          {edit.kind === 'coupon' && <Field label="Code" hint={dupCode ? undefined : 'Customers type this at checkout. Not case sensitive.'}>
            <div className="flex gap-2"><input className={`${inputCls} font-mono uppercase ${dupCode ? 'border-err' : ''}`} value={edit.code ?? ''} onChange={(e) => set({ code: e.target.value.replace(/\s/g, '') })} aria-invalid={dupCode} />
              <Btn v="secondary" type="button" onClick={() => set({ code: makeCode(edit) })}><Wand2 size={14} aria-hidden />Generate</Btn></div>
            {dupCode && <span className="mt-1 block text-xs text-err">That code already exists.</span>}</Field>}
          <Field label="Description shown to customers"><textarea rows={2} className={`${inputCls} h-auto py-2`} value={edit.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type"><select className={inputCls} value={edit.type} onChange={(e) => set({ type: e.target.value as Promo['type'] })}><option value="percent">Percentage</option><option value="fixed">Fixed amount (NGN)</option></select></Field>
            <Field label={edit.type === 'percent' ? 'Percent off' : 'Amount off (₦)'}><input type="number" min={0} className={`${inputCls} num`} value={edit.value} onChange={(e) => set({ value: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            <Field label="Applies to"><select className={inputCls} value={edit.appliesTo} onChange={(e) => set({ appliesTo: e.target.value as Promo['appliesTo'] })}><option value="all">Plans and add-ons</option><option value="plan">Plans only</option><option value="addon">Add-ons only</option></select></Field>
            <Field label="Who can use it"><select className={inputCls} value={edit.eligibility} onChange={(e) => set({ eligibility: e.target.value as Promo['eligibility'] })}><option value="all">All customers</option><option value="new">New customers only</option></select></Field>
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">Schedule and caps</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts"><input type="date" className={inputCls} value={edit.start} onChange={(e) => set({ start: e.target.value })} /></Field>
            <Field label="Ends"><input type="date" className={inputCls} value={edit.end} onChange={(e) => set({ end: e.target.value })} /></Field>
            <Field label="Total redemption limit" hint="Blank = unlimited"><input type="number" min={0} className={`${inputCls} num`} value={edit.limit ?? ''} onChange={(e) => set({ limit: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} /></Field>
            <Field label="Uses per company" hint="Blank = no cap"><input type="number" min={1} className={`${inputCls} num`} value={edit.perCompanyCap ?? ''} onChange={(e) => set({ perCompanyCap: e.target.value === '' ? null : Math.max(1, Number(e.target.value)) })} /></Field>
          </div>
          <Field label="Stacking" hint="Exclusive offers replace any other discount the customer qualifies for; the richest exclusive offer wins."><select className={inputCls} value={edit.stacking ?? 'exclusive'} onChange={(e) => set({ stacking: e.target.value as 'stackable' | 'exclusive' })}><option value="exclusive">Exclusive: cannot be combined</option><option value="stackable">Stackable with other discounts</option></select></Field>
        </div>
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">Scope</h3>
          <div><div className="mb-1.5 text-sm font-medium">Plans <span className="font-normal text-slate">(none selected = all)</span></div><div className="flex flex-wrap gap-x-4 gap-y-2">{s.plans.map((p) => <Toggle key={p.id} on={edit.plans.includes(p.id)} onChange={(v) => toggleIn('plans', p.id, v)} label={p.name} />)}</div></div>
          <div><div className="mb-1.5 text-sm font-medium">Currencies <span className="font-normal text-slate">(none = all)</span></div><div className="flex flex-wrap gap-x-4 gap-y-2">{s.currencies.map((c) => <Toggle key={c.code} on={edit.currencies.includes(c.code)} onChange={(v) => toggleIn('currencies', c.code, v)} label={c.code} />)}</div></div>
          <div><div className="mb-1.5 text-sm font-medium">Billing cycles <span className="font-normal text-slate">(none = both)</span></div><div className="flex gap-4">{(['monthly', 'annual'] as const).map((c) => <Toggle key={c} on={edit.cycles.includes(c)} onChange={(v) => toggleIn('cycles', c, v)} label={c} />)}</div></div>
          <Toggle on={edit.firstPeriodOnly} onChange={(v) => set({ firstPeriodOnly: v })} label="First billing period only" />
        </div>
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate">Tracking</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Channel / source"><select className={inputCls} value={edit.channel ?? ''} onChange={(e) => set({ channel: e.target.value })}>{!CHANNELS.includes((edit.channel ?? '') as (typeof CHANNELS)[number]) && edit.channel && <option>{edit.channel}</option>}{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Campaign label" hint="Groups promotions in reports"><input className={inputCls} value={edit.campaign ?? ''} onChange={(e) => set({ campaign: e.target.value })} placeholder="e.g. Q4 Growth launch" /></Field>
          </div>
        </div>
        <section className="rounded-lg bg-cloud p-3.5" aria-label="Eligibility summary"><h3 className="mb-2 text-sm font-semibold">Eligibility summary</h3><ul className="space-y-1 text-[13px] text-ink">{eligibilityLines(edit, s).map((l) => <li key={l} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal" aria-hidden />{l}</li>)}</ul></section>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3.5"><Toggle on={edit.active} onChange={(v) => set({ active: v })} label={edit.active ? 'Published' : 'Draft (not applied at checkout)'} /><Badge tone={state === 'Live' ? 'green' : state === 'Scheduled' ? 'blue' : 'gray'}>{state}</Badge></div>
        {tried && problems.length > 0 && <ul role="alert" className="space-y-1 rounded-md bg-err/10 px-3 py-2.5 text-xs text-err">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {canEdit && <Btn className="w-full" onClick={() => { if (problems.length) { setTried(true); toast(problems[0], 'err'); return } onSave() }}>{edit.id ? 'Save changes' : 'Create promotion'}</Btn>}
      </fieldset>
    </Overlay>
  )
}
