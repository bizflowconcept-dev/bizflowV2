import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDot, Info, Lightbulb, XCircle } from 'lucide-react'
import { Badge, Btn, Field, inputCls, Overlay, Panel, Table, Tabs, useToast } from '../../../components/ui'
import { EntitlementsTable, StatusBadge } from '../../../components/billing/shared'
import { MODULES, TODAY, addDays, daysUntil, entitlements, fmtDate, moduleState, money, planById, subActions, useBilling } from '../../../data/billing'
import { HEALTH_META, bandPrice, dunning, healthOf, lifecycle, mrrOf, moduleAdoption, moduleWhatIf, openTickets, planWhatIf, recommendations, recurring, slugOf, upcomingInvoice, usageRows } from '../../../billing/insights'
import type { Rec } from '../../../billing/insights'
import { slaOf, useTickets } from '../../../platform/helpdesk'
import { CONVERSION_LABEL, OUTCOME_LABEL, describeScope, grantsForSub, ngn, remaining, useGrants } from '../../../data/grants'
import { Gate, useAdmin } from '../AdminLayout'
import { Bar, Chip, CountUp, Fade, RenewChip, Ring, toneFor } from './kit'

type Dlg = '' | 'plan' | 'trial' | 'credit' | 'module' | 'cancel' | 'suspend'
const DO: Record<string, Dlg> = { plan: 'plan', trial: 'trial', credit: 'credit', module: 'module', cancel: 'cancel', suspend: 'suspend' }
const TAB_Q: Record<string, string> = { overview: 'Overview', usage: 'Usage & limits', billing: 'Billing', modules: 'Modules & add-ons', activity: 'Activity', support: 'Support' }
const SEV_UI: Record<Rec['severity'], { icon: typeof Info; cls: string; ring: string }> = {
  critical: { icon: XCircle, cls: 'text-err', ring: 'border-red-200 bg-red-50/60' },
  warn: { icon: AlertTriangle, cls: 'text-[#b36b00]', ring: 'border-amber-200 bg-amber-50/60' },
  info: { icon: Lightbulb, cls: 'text-info', ring: 'border-blue-100 bg-blue-50/50' },
  good: { icon: CheckCircle2, cls: 'text-ok', ring: 'border-green-200 bg-green-50/60' },
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-slate">{k}</dt><dd className="num mt-0.5 break-words text-sm font-semibold text-ink">{children}</dd></div>
}

export default function SubscriptionDetailPage() {
  const { id } = useParams(); const s = useBilling(); const { can, actor } = useAdmin(); const toast = useToast(); const tickets = useTickets()
  const gst = useGrants()
  const [sp, setSp] = useSearchParams()
  const sub = s.subs.find((x) => x.id === id)
  const [tab, setTab] = useState(TAB_Q[sp.get('tab') ?? ''] ?? 'Overview')
  const [dlg, setDlg] = useState<Dlg>('')
  const [plan, setPlan] = useState(''); const [days, setDays] = useState(7); const [amt, setAmt] = useState(0); const [mod, setMod] = useState('fleet'); const [why, setWhy] = useState('')
  const m = can('subscriptions'); const pay = can('payments'); const audit = can('audit')
  const wanted = sp.get('do')
  useEffect(() => {
    if (!wanted || !sub) return
    const d = DO[wanted]
    if (d && (d === 'credit' ? pay : m) && !(d === 'plan' && sub.customFeatures)) { if (d === 'plan') setPlan(sub.planId); setDlg(d) }
    setSp((p) => { p.delete('do'); return p }, { replace: true })
  }, [wanted, sub, m, pay, setSp])

  const data = useMemo(() => {
    if (!sub) return null
    const health = healthOf(s, sub, tickets)
    return { health, usage: usageRows(s, sub), adoption: moduleAdoption(s, sub), recs: recommendations(s, sub, tickets), invoice: upcomingInvoice(s, sub), dun: dunning(s, sub), planWhat: planWhatIf(s, sub), modWhat: moduleWhatIf(s, sub) }
  }, [s, sub, tickets])
  if (!sub || !data) return <Navigate to="/admin/billing/subscriptions" replace />
  const p = planById(s, sub.planId); const { health, usage, adoption, recs, invoice, dun, planWhat, modWhat } = data
  const fm = (n: number, cur = sub.currency) => money(Math.round(n), cur, { trim: true, s })
  const pays = s.payments.filter((x) => x.subId === sub.id); const log = s.audit.filter((a) => a.company === sub.company)
  const ent = entitlements(s, sub)
  const tabs = ['Overview', 'Usage & limits', 'Billing', ...(m ? ['Modules & add-ons'] : []), ...(audit ? ['Activity'] : []), 'Support']
  const activeTab = tabs.includes(tab) ? tab : 'Overview'
  const done = (msg: string) => { setDlg(''); setWhy(''); toast(msg) }
  const dead = sub.status === 'cancelled' || sub.status === 'suspended' || sub.status === 'expired'
  const days2 = sub.status === 'trial' && sub.trialEndsAt ? daysUntil(sub.trialEndsAt) : sub.status === 'cancelled' && sub.endsAt ? daysUntil(sub.endsAt) : daysUntil(sub.renewsAt)
  const mrr = mrrOf(sub); const tix = tickets.filter((t) => t.slug === slugOf(sub)); const open = openTickets(tickets, sub)
  const act = (r: Rec) => {
    const a = r.action; if (!a) return
    if (a.kind === 'tab') setTab(a.arg!)
    if (a.kind === 'plan') { if (m && !sub.customFeatures) { setPlan(a.arg ?? sub.planId); setDlg('plan') } else setTab('Modules & add-ons') }
  }
  const activeMods = adoption.filter((a) => a.active).length

  return (
    <Gate perm="view">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-slate"><Link to="/admin/billing/subscriptions" className="font-semibold text-teal hover:underline">Subscriptions</Link> <span aria-hidden="true">/</span> {sub.company}</nav>

      <header className="reveal mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-midnight-2 to-midnight text-white shadow-lg">
        <div className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
          <div className="text-white"><Ring score={health.score} band={health.band} size={84} /></div>
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="break-words font-display text-2xl font-semibold leading-tight sm:text-[28px]">{sub.company}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge status={sub.status} />
              <Chip tone="teal">{sub.customFeatures ? 'Custom contract' : p?.name}</Chip>
              <span className="text-white/70">{sub.cycle} · {sub.currency} · {sub.employees.toLocaleString()} employees</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/80"><span className="font-semibold" style={{ color: HEALTH_META[health.band].bar }}>{health.label}</span><span aria-hidden="true">·</span><span>{sub.status === 'trial' ? 'Trial ends' : sub.status === 'cancelled' ? 'Access ends' : 'Renews'} {fmtDate(sub.status === 'trial' && sub.trialEndsAt ? sub.trialEndsAt : sub.status === 'cancelled' && sub.endsAt ? sub.endsAt : sub.renewsAt)}</span><RenewChip days={days2} status={sub.status} /></div>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
            <div><dt className="text-xs text-white/60">MRR</dt><dd className="font-display text-xl font-semibold">{mrr ? <CountUp value={mrr} format={(n) => fm(n)} /> : '—'}</dd></div>
            <div><dt className="text-xs text-white/60">Contract / {sub.cycle === 'annual' ? 'year' : 'month'}</dt><dd className="font-display text-xl font-semibold"><CountUp value={sub.net} format={(n) => fm(n)} /></dd></div>
            <div><dt className="text-xs text-white/60">Account credit</dt><dd className="font-display text-xl font-semibold">{fm(sub.credit)}</dd></div>
          </dl>
        </div>
        {(m || pay) && <div className="flex flex-wrap gap-2 border-t border-white/10 bg-black/10 px-5 py-3 sm:px-6">
          {m && !sub.customFeatures && <Btn s="sm" onClick={() => { setPlan(sub.planId); setDlg('plan') }}>Change plan</Btn>}
          {m && sub.status === 'trial' && <Btn s="sm" v="secondary" onClick={() => setDlg('trial')}>Extend trial</Btn>}
          {pay && <Btn s="sm" v="secondary" onClick={() => setDlg('credit')}>Apply credit</Btn>}
          {m && <Btn s="sm" v="secondary" onClick={() => setDlg('module')}>Enable module override</Btn>}
          {m && (dead ? <Btn s="sm" v="secondary" onClick={() => { subActions.reactivate(sub.id, actor); toast('Subscription reactivated.') }}>Reactivate</Btn> : <>
            <Btn s="sm" v="secondary" onClick={() => setDlg('suspend')}>Suspend</Btn>
            <Btn s="sm" v="ghost" className="!text-red-200 hover:!bg-white/10" onClick={() => setDlg('cancel')}>Cancel</Btn></>)}
        </div>}
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Tabs tabs={tabs} value={activeTab} onChange={setTab} />
          <Fade k={activeTab} className="mt-5 space-y-5">
            {activeTab === 'Overview' && <>
              {(() => {
                const mine = grantsForSub(gst, sub.id)
                if (!mine.length) return null
                return (
                  <Panel title="Complimentary access and grants" action={<Link to="/admin/billing/grants" className="text-sm font-semibold text-teal hover:underline">Manage grants</Link>}>
                    <ul className="divide-y divide-line text-sm">
                      {mine.map((g) => { const o = g.outcomes.find((x) => x.subId === sub.id); return (
                        <li key={g.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                          <div className="min-w-0"><b>{g.name}</b> <span className="text-xs text-slate">{g.id}</span><div className="text-slate">{describeScope(g.scope, s)} · {g.startsAt} to {g.endsAt ?? 'on activation'}</div><div className="text-xs text-slate">At the end: {CONVERSION_LABEL[g.conversion]} · {ngn(g.mrr)} per month across the audience</div></div>
                          <div className="flex flex-wrap gap-1.5"><Badge tone={g.status === 'Active' ? 'green' : g.status === 'Scheduled' ? 'blue' : g.status === 'Revoked' ? 'red' : 'gray'}>{g.status}</Badge>{g.status === 'Active' && <Badge tone="teal">{remaining(g)} days left</Badge>}{o && <Badge tone="gray">{OUTCOME_LABEL[o.result]}</Badge>}</div>
                        </li>) })}
                    </ul>
                  </Panel>
                )
              })()}
              <Panel title="Key facts">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                  <Fact k="Plan">{sub.customFeatures ? 'Custom contract' : p?.name}</Fact>
                  <Fact k="Billing cycle"><span className="capitalize">{sub.cycle}</span></Fact>
                  <Fact k="Country · currency">{sub.country} · {sub.currency}</Fact>
                  <Fact k="Employees">{sub.employees.toLocaleString()}</Fact>
                  <Fact k="Revenue per employee">{fm(recurring(sub) / Math.max(1, sub.employees))}/mo</Fact>
                  <Fact k="Customer since">{fmtDate(sub.startedAt)}</Fact>
                  <Fact k="Next renewal">{fmtDate(sub.renewsAt)}</Fact>
                  <Fact k="Add-ons · overrides">{sub.addons.length} · {sub.overrides.length}</Fact>
                  <Fact k="Coupon">{sub.coupon ?? 'None'}</Fact>
                  <Fact k="Payment method">{sub.card ? `${sub.card.brand} ${sub.card.last4}` : 'None on file'}</Fact>
                  <Fact k="Open tickets">{open.length}</Fact>
                  <Fact k="Pending change">{sub.pendingChange ? `${planById(s, sub.pendingChange.planId)?.name} on ${fmtDate(sub.pendingChange.effectiveAt)}` : 'None'}</Fact>
                </dl>
              </Panel>
              <Panel title="Health breakdown" action={<span className={`text-xs font-semibold ${HEALTH_META[health.band].text}`}>{health.score}/100 · {health.label}</span>}>
                <ul className="grid gap-4 sm:grid-cols-2">{health.factors.map((f, i) => <li key={f.label}><div className="mb-1 flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{f.label}</span><span className="num text-xs text-slate">{f.score}/{f.max}</span></div><Bar pct={(f.score / f.max) * 100} tone={f.score / f.max >= 0.75 ? 'ok' : f.score / f.max >= 0.5 ? 'warn' : 'err'} label={f.label} delay={i * 70} /><div className="mt-1 text-xs text-slate">{f.note}</div></li>)}</ul>
              </Panel>
              <Panel title="Lifecycle timeline">
                <ol className="relative ml-2 space-y-4 border-l border-line pl-5">
                  {lifecycle(s, sub, audit).slice(0, 12).map((e, i) => (
                    <li key={`${e.at}-${e.title}-${i}`} className="relative">
                      <span className={`absolute -left-[27px] top-1 grid size-3.5 place-items-center rounded-full border-2 border-white ${e.kind === 'fail' ? 'bg-err' : e.future ? 'bg-info' : e.kind === 'payment' ? 'bg-ok' : e.kind === 'start' ? 'bg-teal' : 'bg-slate'}`} />
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className={`text-sm font-semibold ${e.future ? 'text-info' : ''}`}>{e.title}</span><time className="num text-xs text-slate">{e.future ? 'Upcoming · ' : ''}{fmtDate(e.at)}</time></div>
                      {e.detail && <div className="text-xs text-slate">{e.detail}</div>}
                    </li>
                  ))}
                </ol>
              </Panel>
            </>}

            {activeTab === 'Usage & limits' && <>
              <Panel title="Limits and forecast" action={<span className="text-[11px] text-slate">Forecast extrapolates recent growth (modelled)</span>}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {usage.map((u, i) => {
                    const tone = u.status === 'over' ? 'err' : toneFor(u.pct)
                    return (
                      <div key={u.key} className="rounded-lg border border-line p-3.5">
                        <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold">{u.label}</span>{u.pct !== null ? <span className={`num text-sm font-semibold ${tone === 'err' ? 'text-err' : tone === 'warn' ? 'text-[#9a6200]' : 'text-ink'}`}>{Math.round(u.pct)}%</span> : <Chip tone="teal">Unlimited</Chip>}</div>
                        <div className="num mb-2 mt-0.5 text-xs text-slate">{u.used.toLocaleString()}{u.unitLabel && ` ${u.unitLabel}`} of {u.limit === null ? 'unlimited' : `${u.limit.toLocaleString()}${u.unitLabel ? ` ${u.unitLabel}` : ''}`}{u.period && ` ${u.period}`}</div>
                        <Bar pct={u.pct ?? 100} tone={u.pct === null ? 'ok' : tone} h="h-2" label={`${u.label} usage`} delay={i * 60} />
                        <div className="mt-2 text-xs text-slate">
                          {u.pct === null ? `${u.used.toLocaleString()} in use, no cap on this plan.` : u.status === 'over' ? <b className="text-err">Over the limit</b> : u.daysToLimit !== null ? <>Likely to reach the limit in <b className="text-ink">~{u.daysToLimit} days</b> ({fmtDate(addDays(TODAY, u.daysToLimit))}) at +{(u.growth * 100).toFixed(1)}%/mo.</> : 'No exhaustion expected within 2 years.'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>
              <Panel title="Module adoption" action={<span className="text-xs font-semibold text-slate"><span className="num">{activeMods}</span> of <span className="num">{adoption.length}</span> active in 30 days</span>}>
                {adoption.length === 0 ? <p className="text-sm text-slate">No modules are enabled for this subscription.</p> : <>
                  {adoption.some((a) => !a.active && !a.foundation) && <div role="note" className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-[#7a5200]"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>Paying for but not using: <b>{adoption.filter((a) => !a.active && !a.foundation).map((a) => a.name).join(', ')}</b>.</span></div>}
                  <ul className="divide-y divide-line/70">
                    {[...adoption].sort((a, b) => Number(a.active) - Number(b.active) || a.lastActiveDays - b.lastActiveDays).map((a, i) => (
                      <li key={a.moduleId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_110px]">
                        <div className="min-w-0"><div className="truncate text-sm font-medium">{a.name}</div><div className="truncate text-xs text-slate">{a.kind === 'plan' ? 'In plan' : a.kind === 'addon' ? 'Add-on' : 'Override'}{a.real ? ' · live counters' : ''}</div></div>
                        <div className="order-3 col-span-2 sm:order-none sm:col-span-1"><Bar pct={a.level} tone={a.active ? (a.level >= 60 ? 'ok' : 'teal') : 'err'} label={`${a.name} activity`} delay={i * 25} /></div>
                        <div className="text-right text-xs"><Chip tone={a.active ? 'green' : 'red'}>{a.active ? 'Active' : 'Idle'}</Chip><div className="num mt-0.5 text-slate">{a.lastActiveDays === 0 ? 'Today' : `${a.lastActiveDays}d ago`}</div></div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-slate">Document, Sign, CRM, branch and people activity read the live usage counters. Other modules use modelled telemetry until product analytics are connected.</p>
                </>}
              </Panel>
            </>}

            {activeTab === 'Billing' && <>
              <div className="grid gap-5 lg:grid-cols-2">
                <Panel title={sub.status === 'trial' ? 'First invoice preview' : 'Upcoming invoice'} action={invoice && <span className="text-xs text-slate">{fmtDate(invoice.date)}</span>}>
                  {!invoice ? <p className="text-sm text-slate">No invoice is scheduled while the subscription is {sub.status}.</p> : <>
                    <ul className="space-y-2 text-sm">{invoice.lines.map((l, i) => <li key={i} className="flex justify-between gap-3"><span>{l.label}{l.detail && <span className="block text-xs text-slate">{l.detail}</span>}</span><span className="num">{fm(l.amount)}</span></li>)}</ul>
                    <div className="num mt-3 space-y-1 border-t border-line pt-3 text-sm">
                      {invoice.discount > 0 && <div className="flex justify-between text-ok"><span>Discounts</span><span>-{fm(invoice.discount)}</span></div>}
                      <div className="flex justify-between"><span className="text-slate">Subtotal</span><span>{fm(invoice.subtotal - invoice.discount)}</span></div>
                      {invoice.taxLabel && <div className="flex justify-between"><span className="text-slate">{invoice.taxLabel} {invoice.taxRate}%</span><span>{fm(invoice.tax)}</span></div>}
                      {invoice.credit > 0 && <div className="flex justify-between text-ok"><span>Credit applied</span><span>-{fm(invoice.credit)}</span></div>}
                      <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Amount due</span><span>{fm(invoice.due)}</span></div>
                    </div>
                    <p className="mt-2 text-xs text-slate">{invoice.source === 'quote' ? 'Priced with the live quote engine.' : 'Contract-priced; tax added from the currency settings.'}{invoice.drift !== 0 && ` Stored contract value differs from the list quote by ${fm(Math.abs(invoice.drift))}.`}</p>
                  </>}
                </Panel>
                <div className="space-y-5">
                  <Panel title="Payment method and credit">
                    <dl className="grid grid-cols-2 gap-4"><Fact k="Card">{sub.card ? `${sub.card.brand} ending ${sub.card.last4}` : 'None on file'}</Fact><Fact k="Expires">{sub.card?.exp ?? '—'}</Fact><Fact k="Credit balance">{fm(sub.credit)}</Fact><Fact k="Coupon">{sub.coupon ?? 'None'}</Fact></dl>
                  </Panel>
                  <Panel title="Dunning" action={<Badge tone={dun.active ? 'amber' : 'green'}>{dun.active ? 'Running' : 'Clear'}</Badge>}>
                    <p className="text-sm text-slate">{dun.note}</p>
                    {dun.active && <ol className="mt-3 space-y-2">{dun.steps.map((st) => <li key={st.label} className="flex items-center gap-2 text-sm">{st.state === 'done' ? <CheckCircle2 size={16} className="text-ok" /> : st.state === 'current' ? <CircleDot size={16} className="text-warn" /> : <span className="size-4 rounded-full border border-line" />}<span className={st.state === 'pending' ? 'text-slate' : 'font-medium'}>{st.label}</span><span className="num ml-auto text-xs text-slate">{fmtDate(st.at)}</span></li>)}</ol>}
                  </Panel>
                </div>
              </div>
              <Panel title="Invoices and payments" pad={false}><Table label="Payments" head={['Date', 'Description', 'Reference', 'Amount', 'Status']} right={[3]} rows={pays.map((x) => [fmtDate(x.at), x.description, <span key="r" className="font-mono text-xs">{x.ref}</span>, money(x.amount, x.currency, { trim: true, s }), <Badge key="b" tone={x.status === 'successful' ? 'green' : x.status === 'failed' ? 'red' : 'gray'}>{x.status}</Badge>])} /></Panel>
            </>}

            {activeTab === 'Modules & add-ons' && m && <>
              <Panel title="Modules in this subscription" action={<span className="text-xs text-slate">Prices are list value for {sub.employees.toLocaleString()} employees</span>}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {MODULES.map((mod2) => {
                    const st = moduleState(ent, mod2.id); const rate = s.modulePrices.find((r) => r.moduleId === mod2.id)
                    const list = rate ? bandPrice(rate, sub.employees, sub.currency, sub.cycle) : null; const o = sub.overrides.find((x) => x.module === mod2.id)
                    const addon = st.kind === 'addon' ? s.addons.find((a) => sub.addons.includes(a.id) && a.grants.some((g) => mod2.features.some((f) => f.key === g))) : undefined
                    return (
                      <div key={mod2.id} className={`rounded-lg border p-3 text-sm transition-colors ${st.enabled ? 'border-line bg-white' : 'border-dashed border-line bg-cloud/60 text-slate'}`}>
                        <div className="flex items-start justify-between gap-2"><span className="font-semibold">{mod2.name}</span><Chip tone={st.kind === 'plan' ? 'teal' : st.kind === 'addon' ? 'blue' : st.kind === 'override' || st.kind === 'grant' ? 'amber' : 'gray'}>{st.kind === 'plan' ? 'Included' : st.kind === 'addon' ? 'Add-on' : st.kind === 'grant' ? 'Complimentary' : st.kind === 'override' ? 'Override' : 'Not included'}</Chip></div>
                        <div className="num mt-1 text-xs text-slate">{st.kind === 'plan' ? (list !== null ? `List value ${fm(sub.cycle === 'annual' ? list / 12 : list)}/mo` : 'Custom-priced') : st.kind === 'override' ? `${o?.reason ?? 'Override'}` : st.kind === 'addon' ? (addon ? `${fm(sub.cycle === 'annual' ? (addon.prices[sub.currency]?.annual ?? 0) / 12 : addon.prices[sub.currency]?.monthly ?? 0)}/mo` : st.source) : '—'}</div>
                        {o && <button className="mt-1.5 cursor-pointer text-xs font-semibold text-teal" onClick={() => { subActions.setOverride(sub.id, o.module, false, '', actor); toast('Override removed.') }}>Remove override</button>}
                      </div>
                    )
                  })}
                </div>
              </Panel>
              <Panel title="What-if: plan comparison" action={<span className="text-xs text-slate">Same employees, cycle and add-ons</span>} pad={false}>
                <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="border-b border-line bg-cloud/60 text-left text-xs text-slate"><tr><th className="px-4 py-2.5 font-semibold">Plan</th><th className="px-3 py-2.5 text-right font-semibold">Monthly equivalent</th><th className="px-3 py-2.5 text-right font-semibold">Change</th><th className="px-3 py-2.5 font-semibold">Modules</th></tr></thead><tbody className="divide-y divide-line/70">
                  {planWhat.map((w) => (
                    <tr key={w.plan.id} className={w.current ? 'bg-softmint/40' : ''}>
                      <td className="px-4 py-3 font-semibold">{w.plan.name}{w.current && <span className="ml-2"><Chip tone="teal">Current</Chip></span>}{!w.fits && !w.custom && <div className="text-xs font-normal text-err">Employee cap {w.plan.limits.employees?.toLocaleString()} is too low</div>}</td>
                      <td className="num px-3 py-3 text-right">{w.monthly === null ? (w.custom ? 'Custom quote' : 'Not priced') : fm(w.monthly)}</td>
                      <td className={`num px-3 py-3 text-right font-semibold ${w.delta === null || w.current ? 'text-slate' : w.delta > 0 ? 'text-ok' : 'text-[#9a6200]'}`}>{w.delta === null || w.current ? '—' : `${w.delta >= 0 ? '+' : '-'}${fm(Math.abs(w.delta))}/mo`}</td>
                      <td className="px-3 py-3 text-xs text-slate">{w.current ? 'As today' : [w.gained.length ? `+${w.gained.length} gained` : '', w.lost.length ? `-${w.lost.length} lost (${w.lost.slice(0, 3).join(', ')}${w.lost.length > 3 ? '…' : ''})` : ''].filter(Boolean).join(' · ') || 'Same modules'}</td>
                    </tr>
                  ))}
                </tbody></table></div>
              </Panel>
              <Panel title="What-if: add a module">
                {modWhat.length === 0 ? <p className="text-sm text-slate">Every priced module is already available to this company.</p> : <ul className="divide-y divide-line/70">{modWhat.map((w) => <li key={w.moduleId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"><div><span className="font-semibold">{w.name}</span><span className="ml-2 text-xs text-slate">{w.importance} · {w.route}</span></div><span className="num font-semibold text-ok">{w.monthly === null ? 'Custom quote' : `+${fm(w.monthly)}/mo`}</span></li>)}</ul>}
              </Panel>
              <Panel title="Feature-level entitlements"><EntitlementsTable sub={sub} /></Panel>
            </>}

            {activeTab === 'Activity' && audit && <Panel title="Company billing audit" pad={false}><Table label="Audit" pageSize={8} head={['When', 'Actor', 'Action', 'Previous', 'New']} rows={log.map((a) => [a.at.replace('T', ' '), a.actor, a.action, a.prev, a.next])} /></Panel>}

            {activeTab === 'Support' && <Panel title="Support tickets" action={<Link to="/admin/helpdesk" className="text-sm font-semibold text-teal">Open support console</Link>}>
              {tix.length === 0 ? <p className="text-sm text-slate">No tickets from this company.</p> : <ul className="divide-y divide-line/70">{tix.map((t) => { const sla = slaOf(t); return (
                <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0"><div className="text-sm font-semibold"><span className="num mr-2 text-xs text-slate">{t.id}</span>{t.subject}</div><div className="mt-0.5 text-xs text-slate">{t.category} · {t.requester} · {t.assignee || 'Unassigned'}</div></div>
                  <div className="flex flex-wrap items-center gap-1.5"><Chip tone={t.priority === 'Urgent' ? 'red' : t.priority === 'High' ? 'amber' : 'gray'}>{t.priority}</Chip><Chip tone={t.status === 'Resolved' ? 'green' : t.status === 'New' ? 'blue' : 'gray'}>{t.status}</Chip><Chip tone={sla.breached ? 'red' : sla.warn ? 'amber' : 'gray'}>{sla.label}</Chip></div>
                </li>) })}</ul>}
            </Panel>}
          </Fade>
        </div>

        <aside aria-label="Insights" className="xl:sticky xl:top-4">
          <Panel title="Insights" action={<span className="text-xs text-slate">{recs.length} recommendation{recs.length === 1 ? '' : 's'}</span>}>
            <ul className="space-y-3">
              {recs.map((r, i) => { const U = SEV_UI[r.severity]; const Icon = U.icon; return (
                <li key={r.id} style={{ animationDelay: `${i * 60}ms` }} className={`sub-fade rounded-lg border p-3 ${U.ring}`}>
                  <div className="flex gap-2.5"><Icon size={17} className={`mt-0.5 shrink-0 ${U.cls}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2"><span className="text-sm font-semibold leading-snug">{r.title}</span>{r.uplift && <span className="num text-xs font-semibold text-ok">{r.uplift}</span>}</div>
                      <p className="mt-1 text-[13px] leading-snug text-slate">{r.detail}</p>
                      {r.action && <button onClick={() => act(r)} className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-teal hover:underline">{r.action.label}<ArrowRight size={12} /></button>}
                    </div>
                  </div>
                </li>) })}
            </ul>
          </Panel>
        </aside>
      </div>

      <Overlay open={dlg === 'plan'} onClose={() => setDlg('')} title="Change plan" alert><div className="space-y-4"><p className="text-sm text-slate">Applies immediately. No data is deleted; capabilities follow the new plan.</p><select aria-label="Plan" className={inputCls} value={plan} onChange={(e) => setPlan(e.target.value)}>{s.plans.filter((x) => x.status !== 'archived' || x.id === sub.planId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><Field label="Reason"><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} /></Field><Btn className="w-full" disabled={plan === sub.planId} onClick={() => { subActions.changePlan(sub.id, plan, actor, why); done('Plan changed.') }}>Change plan</Btn></div></Overlay>
      <Overlay open={dlg === 'trial'} onClose={() => setDlg('')} title="Extend trial" alert><div className="space-y-4"><Field label="Extra days"><input type="number" min={1} max={90} className={`${inputCls} num`} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} /></Field><Btn className="w-full" onClick={() => { subActions.extendTrial(sub.id, days, actor); done(`Trial extended by ${days} days.`) }}>Extend</Btn></div></Overlay>
      <Overlay open={dlg === 'credit'} onClose={() => setDlg('')} title="Apply credit" alert><div className="space-y-4"><Field label={`Amount (${sub.currency})`}><input type="number" min={1} className={`${inputCls} num`} value={amt || ''} onChange={(e) => setAmt(Number(e.target.value) || 0)} /></Field><Btn className="w-full" disabled={amt <= 0} onClick={() => { subActions.credit(sub.id, amt, actor); setAmt(0); done('Credit applied.') }}>Apply credit</Btn></div></Overlay>
      <Overlay open={dlg === 'module'} onClose={() => setDlg('')} title="Enable module override" alert><div className="space-y-4"><p className="text-sm text-slate">Grants a module outside the plan. A reason is required and the change is audited.</p><select aria-label="Module" className={inputCls} value={mod} onChange={(e) => setMod(e.target.value)}>{MODULES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><Field label="Reason"><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} /></Field><Btn className="w-full" disabled={!why.trim()} onClick={() => { subActions.setOverride(sub.id, mod, true, why.trim(), actor); done('Override enabled.') }}>Enable override</Btn></div></Overlay>
      <Overlay open={dlg === 'cancel'} onClose={() => setDlg('')} title={`Cancel ${sub.company}?`} alert><div className="space-y-4 text-sm"><p>Access continues to {fmtDate(sub.renewsAt)}. Data is retained.</p><Btn v="dark" onClick={() => { subActions.cancel(sub.id, actor); done('Subscription cancelled.') }}>Cancel subscription</Btn></div></Overlay>
      <Overlay open={dlg === 'suspend'} onClose={() => setDlg('')} title={`Suspend ${sub.company}?`} alert><div className="space-y-4 text-sm"><p>Users lose access immediately. Data is retained and access returns on reactivation.</p><Btn v="dark" onClick={() => { subActions.suspend(sub.id, actor); done('Subscription suspended.') }}>Suspend</Btn></div></Overlay>
    </Gate>
  )
}
