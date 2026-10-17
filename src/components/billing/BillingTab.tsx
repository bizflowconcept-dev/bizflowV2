import { useState } from 'react'
import { Link } from 'react-router'
import { Badge, Btn, Overlay, Panel, Table, useToast } from '../ui'
import { LIMIT_DEFS, STATUS_META, TODAY, addPayment, addonFits, addonPrice, daysUntil, fmtDate, iso, money, planById, quote, subActions, useEntitlements } from '../../data/billing'
import { useGrants, CONVERSION_LABEL, answerConversion, awaitingFor, complimentaryLabel, describeScope, grantsForSub, remaining } from '../../data/grants'
import { meterCells, useMetering } from '../../billing/metering'
import { LimitsSummary, PlanChangeDialog, StatusBadge, UsageBar } from './shared'

export default function BillingTab({ actor, openChange }: { actor: string; openChange?: boolean }) {
  const { s, sub, plan, limits } = useEntitlements()
  const toast = useToast()
  const gs = useGrants()
  const meter = useMetering()
  const [change, setChange] = useState(!!openChange)
  const [dlg, setDlg] = useState<'' | 'addons' | 'cancel' | 'card' | 'cycle'>('')
  const [picked, setPicked] = useState<string[]>(sub?.addons ?? [])
  const [cardNo, setCardNo] = useState('')
  if (!sub || !plan) return <Panel title="Billing & Subscription"><p className="text-sm text-slate">No active subscription. <a className="font-semibold text-teal" href="/pricing">View plans</a></p></Panel>

  const cur = sub.currency
  const m = (n: number) => money(n, cur, { trim: true, s })
  const q = quote(s, { planId: sub.planId, cycle: sub.cycle, currency: cur, employees: sub.employees, addonIds: sub.addons, isNew: false, subId: sub.id })
  const cy = sub.cycle === 'annual' ? 'year' : 'month'
  const pend = sub.pendingChange && planById(s, sub.pendingChange.planId)
  const pays = s.payments.filter((p) => p.subId === sub.id)
  const hist = s.audit.filter((a) => a.company === sub.company).slice(0, 8)
  const bad = sub.status === 'past_due' || sub.status === 'payment_failed' || sub.status === 'grace'
  const otherCycle = sub.cycle === 'annual' ? 'monthly' : 'annual'
  const oq = quote(s, { planId: sub.planId, cycle: otherCycle, currency: cur, employees: sub.employees, addonIds: sub.addons, isNew: false })
  const fitting = s.addons.filter((a) => addonFits(a, plan.id, s) || sub.addons.includes(a.id))
  const pickedQuote = quote(s, { planId: sub.planId, cycle: sub.cycle, currency: cur, employees: sub.employees, addonIds: picked, isNew: false })

  const payNow = () => {
    addPayment({ subId: sub.id, at: iso(TODAY), amount: q.total, currency: cur, status: 'successful', description: `${plan.name} · ${sub.cycle} renewal` })
    subActions.setStatus(sub.id, 'active', actor); toast('Payment received. Your subscription is active.')
  }

  return (
    <div className="space-y-5">
      {pend && <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">Downgrade to <b>{pend.name}</b> is scheduled for {fmtDate(sub.pendingChange!.effectiveAt)}. You keep every current capability until then.<button onClick={() => { subActions.cancelScheduled(sub.id, actor); toast('Scheduled change cancelled.') }} className="ml-auto cursor-pointer font-semibold text-teal">Keep {plan.name}</button></div>}
      {bad && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">We couldn't collect your last payment. Update your payment method or pay now to avoid interruption.<Btn s="sm" className="ml-auto" onClick={payNow}>Pay now</Btn></div>}

      {(() => {
        const mine = grantsForSub(gs, sub.id).filter((g) => g.status === 'Active' && g.targets.includes(sub.id) && g.notify === 'tenant' || g.status === 'Active' && g.targets.includes(sub.id) && remaining(g) <= 7)
        const waiting = awaitingFor(gs, sub.id)
        if (!mine.length && !waiting.length) return null
        return (
          <Panel title="Complimentary access">
            <ul className="space-y-3">
              {mine.map((g) => { const d = remaining(g); return (
                <li key={g.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line p-3 text-sm">
                  <div><div className="flex flex-wrap items-center gap-2"><b>{g.name}</b><Badge tone="teal">Complimentary</Badge><Badge tone={d <= 7 ? 'amber' : 'green'}>{d} day{d === 1 ? '' : 's'} remaining</Badge></div>
                    <p className="mt-1 text-slate">{describeScope(g.scope, s)} · {complimentaryLabel(g)}</p>
                    <p className="mt-1">What happens next: {CONVERSION_LABEL[g.conversion].toLowerCase()}{g.conversion === 'auto_bill' ? ' from the end date.' : g.conversion === 'revert' ? ', so these features switch off on the end date.' : '. We will ask you to choose before the end date.'}</p></div>
                </li>) })}
              {waiting.map(({ g }) => (
                <li key={`w-${g.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <span><b>{g.name}</b> has ended. Keep it on your plan at the normal price, or release it.</span>
                  <span className="flex gap-2"><Btn s="sm" onClick={() => { const r = answerConversion(g.id, sub.id, true, actor); toast(r.ok ? 'Kept. It will be billed at the normal price.' : r.error) }}>Keep and pay</Btn><Btn s="sm" v="secondary" onClick={() => { const r = answerConversion(g.id, sub.id, false, actor); toast(r.ok ? 'Released. Your plan is unchanged.' : r.error) }}>Release</Btn></span>
                </li>))}
            </ul>
          </Panel>
        )
      })()}

      <Panel title="Subscription">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3">
            {([
              ['Plan', <b key="p" className="font-display text-lg">{plan.name}</b>],
              ['Status', <StatusBadge key="s" status={sub.status} />],
              ['Billing cycle', <span key="c" className="capitalize">{sub.cycle}</span>],
              [sub.status === 'trial' ? 'Trial ends' : sub.status === 'cancelled' ? 'Access ends' : 'Next renewal', `${fmtDate(sub.status === 'cancelled' ? sub.endsAt ?? sub.renewsAt : sub.renewsAt)}${sub.status === 'trial' && sub.trialEndsAt ? ` · ${Math.max(0, daysUntil(sub.trialEndsAt))} days left` : ''}`],
              ['Amount', q.ok ? <span key="a" className="num font-semibold">{m(q.total)} / {cy}{q.taxRate > 0 && !q.inclusive ? ' incl. tax' : ''}</span> : '—'],
              ['Employees', <span key="e" className="num">{sub.employees} of {limits.employees ?? 'unlimited'}</span>],
            ] as [string, React.ReactNode][]).map(([k, v]) => <div key={k}><dt className="text-xs text-slate">{k}</dt><dd className="mt-0.5">{v}</dd></div>)}
          </dl>
          <div className="flex flex-wrap content-start gap-2 lg:w-52 lg:flex-col">
            <Btn onClick={() => setChange(true)}>{sub.status === 'trial' ? 'Upgrade Now' : 'Upgrade / change plan'}</Btn>
            <Btn v="secondary" onClick={() => setDlg('cycle')}>Change Billing Cycle</Btn>
            <Btn v="secondary" onClick={() => { setPicked(sub.addons); setDlg('addons') }}>Manage Add-ons</Btn>
            {sub.status === 'cancelled' ? <Btn v="secondary" onClick={() => { subActions.reactivate(sub.id, actor); toast('Subscription reactivated.') }}>Reactivate</Btn> : <Btn v="ghost" className="text-err" onClick={() => setDlg('cancel')}>Cancel subscription</Btn>}
          </div>
        </div>
      </Panel>

      <Panel title="Usage">
        {meterCells(s, sub, meter.grants).filter((c) => c.state === 'full' || c.state === 'warn').map((c) => (
          <div key={c.key} role={c.state === 'full' ? 'alert' : 'status'} className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${c.state === 'full' ? 'border-err/40 bg-err/5 text-err' : 'border-[#b07100]/40 bg-[#b07100]/5 text-[#7a5000]'}`}>
            <span>{c.state === 'full' ? `You have reached your ${c.label.toLowerCase()} limit.` : `You have used ${Math.round(c.pct ?? 0)}% of your ${c.label.toLowerCase()} limit.`}{c.extra > 0 ? ` Includes ${c.extra.toLocaleString()} temporary extra.` : ''}</span>
            <button type="button" className="font-semibold underline" onClick={() => setChange(true)}>Upgrade</button>
          </div>
        ))}
        <div className="grid gap-5 sm:grid-cols-2">
          {LIMIT_DEFS.map((d) => <UsageBar key={d.key} label={d.label} used={d.key === 'employees' ? sub.employees : sub.usage[d.key]} limit={meterCells(s, sub, meter.grants).find((c) => c.key === d.key)?.limit ?? limits[d.key]} unit={d.unit ? ` ${d.unit}` : ''} period={d.period} />)}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Add-ons">
          {sub.addons.length === 0 ? <p className="text-sm text-slate">No add-ons yet.</p> : <ul className="divide-y divide-line text-sm">{sub.addons.map((id) => { const a = s.addons.find((x) => x.id === id); const p = a && addonPrice(a, cur, sub.cycle); return a && <li key={id} className="flex justify-between py-2"><span>{a.name}</span><span className="num text-slate">{p !== null && p !== undefined ? `${m(p)} / ${cy}` : ''}</span></li> })}</ul>}
        </Panel>
        <Panel title="Payment method" action={<button onClick={() => setDlg('card')} className="cursor-pointer text-sm font-semibold text-teal">Update</button>}>
          {sub.card ? <div className="text-sm"><b>{sub.card.brand}</b> ending <span className="num">{sub.card.last4}</span><div className="text-xs text-slate">Expires {sub.card.exp}</div></div> : <p className="text-sm text-slate">No payment method on file.</p>}
          <p className="mt-3 text-xs text-slate">Included in your plan: <span className="sr-only">limits</span></p><div className="mt-2"><LimitsSummary limits={limits} /></div>
        </Panel>
      </div>

      <Panel title="Invoices and payments" pad={false}>
        <Table label="Payments" head={['Date', 'Description', 'Reference', 'Amount', 'Status']} right={[3]} rows={pays.map((p) => [fmtDate(p.at), p.description, <span key="r" className="font-mono text-xs">{p.ref}</span>, money(p.amount, p.currency, { trim: true, s }), <Badge key="b" tone={p.status === 'successful' ? 'green' : p.status === 'failed' ? 'red' : 'gray'}>{p.status}</Badge>])} />
      </Panel>

      <Panel title="Subscription history">
        {hist.length === 0 ? <p className="text-sm text-slate">No changes recorded.</p> : <ul className="space-y-2 text-sm">{hist.map((h) => <li key={h.id} className="flex flex-wrap gap-x-3"><span className="num text-xs text-slate">{fmtDate(h.at.slice(0, 10))}</span><span>{h.action}</span><span className="text-slate">{h.prev} → {h.next}</span></li>)}</ul>}
      </Panel>

      <PlanChangeDialog open={change} onClose={() => setChange(false)} sub={sub} actor={actor} />

      <Overlay open={dlg === 'cycle'} onClose={() => setDlg('')} title="Change billing cycle" alert>
        <div className="space-y-4 text-sm">
          <p>Switch from <b>{sub.cycle}</b> to <b>{otherCycle}</b> billing. The change applies from your next renewal on {fmtDate(sub.renewsAt)}.</p>
          {oq.ok && <p className="rounded-lg bg-cloud p-3">New price: <b className="num">{m(oq.total)} / {otherCycle === 'annual' ? 'year' : 'month'}</b></p>}
          <div className="flex gap-2"><Btn onClick={() => { subActions.setCycle(sub.id, otherCycle, actor); setDlg(''); toast(`Billing cycle changed to ${otherCycle}.`) }}>Confirm</Btn><Btn v="secondary" onClick={() => setDlg('')}>Cancel</Btn></div>
        </div>
      </Overlay>

      <Overlay open={dlg === 'addons'} onClose={() => setDlg('')} title="Manage add-ons" side>
        <div className="space-y-3 text-sm">
          {fitting.map((a) => { const p = addonPrice(a, cur, sub.cycle); return (
            <label key={a.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3">
              <input type="checkbox" className="mt-1 accent-teal" checked={picked.includes(a.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, a.id] : picked.filter((x) => x !== a.id))} />
              <span className="flex-1"><b>{a.name}</b><span className="block text-xs text-slate">{a.description}</span></span>
              <span className="num whitespace-nowrap">{p !== null && m(p)}</span>
            </label>
          ) })}
          {pickedQuote.ok && <dl className="rounded-lg bg-cloud p-3">
            <div className="flex justify-between"><dt className="text-slate">Plan and employees</dt><dd className="num">{m(pickedQuote.lines.filter((line) => line.kind !== 'addon').reduce((sum, line) => sum + line.amount, 0))}</dd></div>
            <div className="mt-1 flex justify-between"><dt className="text-slate">Selected add-ons</dt><dd className="num">{m(pickedQuote.lines.filter((line) => line.kind === 'addon').reduce((sum, line) => sum + line.amount, 0))}</dd></div>
            {pickedQuote.tax > 0 && !pickedQuote.inclusive && <div className="mt-1 flex justify-between"><dt className="text-slate">{pickedQuote.taxLabel}</dt><dd className="num">{m(pickedQuote.tax)}</dd></div>}
            <div className="mt-2 flex justify-between border-t border-line pt-2 font-semibold"><dt>New {sub.cycle} total</dt><dd className="num">{m(pickedQuote.total)}</dd></div>
          </dl>}
          <p className="text-xs text-slate">Removing an add-on hides its capabilities; the data stays safe and returns if you add it back.</p>
          <Btn className="w-full" onClick={() => { subActions.setAddons(sub.id, picked, actor); setDlg(''); toast('Add-ons updated.') }}>Save add-ons</Btn>
        </div>
      </Overlay>

      <Overlay open={dlg === 'cancel'} onClose={() => setDlg('')} title="Cancel subscription?" alert>
        <div className="space-y-4 text-sm">
          <p>You keep full access until <b>{fmtDate(sub.renewsAt)}</b>. After that, BizFlow becomes read-only for your team. Your data is retained and returns if you reactivate.</p>
          <p className="rounded-md bg-ink/5 p-3 text-xs text-slate">Want to close the whole workspace and have your data exported and deleted? Use <Link to="/admin/business/offboarding" className="font-semibold text-teal-600 underline">Close workspace</Link>. It needs a second BizFlow approval and starts a read-only grace period.</p>
          <div className="flex gap-2"><Btn v="dark" onClick={() => { subActions.cancel(sub.id, actor); setDlg(''); toast('Subscription cancelled. Access continues until the period ends.') }}>Cancel subscription</Btn><Btn v="secondary" onClick={() => setDlg('')}>Keep subscription</Btn></div>
        </div>
      </Overlay>

      <Overlay open={dlg === 'card'} onClose={() => setDlg('')} title="Update payment method" alert>
        <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); const d = cardNo.replace(/\D/g, ''); if (d.length < 12) { toast('Enter a valid card number.'); return } subActions.setCard(sub.id, { brand: d.startsWith('4') ? 'Visa' : 'Mastercard', last4: d.slice(-4), exp: '12 / 29' }, actor); setDlg(''); setCardNo(''); toast('Payment method updated.') }}>
          <label className="block"><span className="mb-1 block font-medium">Card number</span><input value={cardNo} onChange={(e) => setCardNo(e.target.value)} inputMode="numeric" placeholder="0000 0000 0000 0000" className="h-10 w-full rounded-md border border-line px-3 font-mono" /></label>
          <p className="text-xs text-slate">Processed by a PCI-compliant gateway. BizFlow never stores your card.</p>
          <Btn type="submit" className="w-full">Save card</Btn>
        </form>
      </Overlay>
      <span hidden>{STATUS_META[sub.status].label}</span>
    </div>
  )
}
