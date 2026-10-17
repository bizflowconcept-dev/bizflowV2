import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Lock, Check, Minus, ChevronDown, Search } from 'lucide-react'
import { Badge, Btn, Overlay, Table, useToast } from '../ui'
import {
  GROUPS, MODULES, STATUS_META, addonFor, addPayment, convertTrial, daysUntil, entitlements, fmtDate, fmtLimit, LIMIT_DEFS, minPlanFor, money, moduleById, moduleState, planById, planDiff, publicPlans, quote, subActions,
  isCustom, useBilling, addonPrice,
} from '../../data/billing'
import { useGrants } from '../../data/grants'
import type { LimitKey, Limits, Subscription, SubStatus } from '../../data/billing'

export const StatusBadge = ({ status }: { status: SubStatus }) => <Badge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</Badge>

export function UsageBar({ label, used, limit, unit = '', period }: { label: string; used: number; limit: number | null; unit?: string; period?: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const hot = limit !== null && pct >= 80
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm"><span className="font-medium">{label}</span><span className="num text-slate">{used.toLocaleString()}{unit} / {limit === null ? 'Unlimited' : limit.toLocaleString() + unit}{period ? ` ${period}` : ''}</span></div>
      <div className="mt-1.5 h-1.5 rounded bg-ink/10" role="progressbar" aria-label={`${label} usage`} aria-valuenow={limit ? pct : 0} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded transition-all ${hot ? 'bg-warn' : 'bg-teal'}`} style={{ width: (limit ? pct : 4) + '%' }} />
      </div>
      {hot && <div className="mt-1 flex items-center gap-2 text-xs"><b className="text-[#9a6200]">{pct}% used</b><Link to="/admin/business/settings?tab=billing&change=1" className="font-semibold text-teal">Upgrade plan</Link></div>}
    </div>
  )
}

export function LimitsSummary({ limits }: { limits: Limits }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">{LIMIT_DEFS.map((d) => <div key={d.key}><dt className="text-xs text-slate">{d.label}{d.period ? ` ${d.period}` : ''}</dt><dd className="num font-semibold">{fmtLimit(d.key, limits[d.key])}</dd></div>)}</dl>
}

/* Module → Feature tree used by the plan builder (Admin) */
export function CapabilityTree({ features, onChange, disabled }: { features: string[]; onChange: (f: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ people: true })
  const [q, setQ] = useState('')
  const set = new Set(features)
  const toggle = (keys: string[], on: boolean) => { const n = new Set(set); keys.forEach((k) => (on ? n.add(k) : n.delete(k))); onChange([...n]) }
  const term = q.trim().toLowerCase()
  const match = (m: (typeof MODULES)[number]) => !term || m.name.toLowerCase().includes(term) || m.features.some((f) => f.name.toLowerCase().includes(term))
  const shown = GROUPS.map((g) => ({ g, mods: MODULES.filter((m) => m.group === g.id && match(m)) })).filter((x) => x.mods.length)
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate" /><input type="search" aria-label="Search features" placeholder="Search modules and features" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20" /></div>
        <span className="num text-xs text-slate">{features.length} of {MODULES.reduce((n, m) => n + m.features.length, 0)} features on</span>
      </div>
      {shown.length === 0 && <p className="rounded-lg border border-line p-4 text-sm text-slate">No module or feature matches &ldquo;{q}&rdquo;.</p>}
      <div className="divide-y divide-line rounded-lg border border-line bg-white">
        {shown.map(({ g, mods }) => {
          const every = MODULES.filter((m) => m.group === g.id).flatMap((m) => m.features.map((f) => f.key)); const n = every.filter((k) => set.has(k)).length
          const isOpen = !!term || !!open[g.id]
          return (
            <div key={g.id}>
              <div className="flex items-center justify-between hover:bg-cloud">
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })} className="flex flex-1 cursor-pointer items-center px-4 py-3 text-left">
                  <span className="font-display text-[15px] font-semibold uppercase tracking-wide">{g.name}</span>
                </button>
                <span className="flex items-center gap-3 pr-4 text-xs text-slate">
                  {!disabled && <span className="flex gap-2 font-semibold text-teal"><button type="button" className="cursor-pointer" onClick={() => toggle(every, true)}>All</button><button type="button" className="cursor-pointer" onClick={() => toggle(every, false)}>None</button></span>}
                  <span className="num">{n} / {every.length}</span><ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </div>
              {isOpen && (
                <div className="grid gap-x-8 gap-y-4 border-t border-line bg-cloud/60 p-4 md:grid-cols-2">
                  {mods.map((m) => {
                    const ks = m.features.map((f) => f.key); const c = ks.filter((k) => set.has(k)).length
                    return (
                      <fieldset key={m.id} disabled={disabled} className="min-w-0">
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                          <input type="checkbox" className="size-4 accent-teal" checked={c === ks.length} ref={(el) => { if (el) el.indeterminate = c > 0 && c < ks.length }} onChange={(e) => toggle(ks, e.target.checked)} />
                          {m.name}
                        </label>
                        {m.features.length > 1 && (
                          <div className="mt-1.5 space-y-1 border-l border-line pl-4">
                            {m.features.map((f) => <label key={f.key} className="flex cursor-pointer items-center gap-2 text-[13px] text-slate"><input type="checkbox" className="size-3.5 accent-teal" checked={set.has(f.key)} onChange={(e) => toggle([f.key], e.target.checked)} />{f.name}</label>)}
                          </div>
                        )}
                      </fieldset>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Company entitlements: capability · source · status (support & troubleshooting) */
export function EntitlementsTable({ sub }: { sub: Subscription }) {
  const s = useBilling(); useGrants(); const ent = entitlements(s, sub)
  const [all, setAll] = useState(false)
  const rows = MODULES.map((m) => ({ m, st: moduleState(ent, m.id) })).filter((r) => all || r.st.enabled || r.m.id === 'fleet' || r.st.kind !== 'none')
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm"><span className="text-slate"><b className="text-ink">{MODULES.filter((m) => moduleState(ent, m.id).enabled).length}</b> of {MODULES.length} capabilities enabled</span><label className="flex cursor-pointer items-center gap-2 text-xs font-semibold"><input type="checkbox" className="accent-teal" checked={all} onChange={(e) => setAll(e.target.checked)} />Show disabled</label></div>
      <div className="max-h-[420px] overflow-y-auto rounded-lg border border-line">
        <Table label="Company entitlements" pageSize={50} head={['Capability', 'Source', 'Status']} rows={rows.map(({ m, st }) => [m.name, st.enabled ? st.source : st.source, <Badge key={m.id} tone={st.enabled ? 'green' : 'gray'}>{st.enabled ? 'Enabled' : 'Disabled'}</Badge>])} />
      </div>
    </div>
  )
}

/* Shown in place of a module the subscription does not include */
export function UpgradeGate({ moduleId, canManage }: { moduleId: string; canManage: boolean }) {
  const s = useBilling(); const sub = s.subs.find((x) => x.id === s.companyId)
  const mod = moduleById(moduleId); const need = minPlanFor(s, moduleId); const add = sub ? addonFor(s, moduleId, sub.planId) : undefined
  const ap = add && sub ? addonPrice(add, sub.currency, sub.cycle) : null
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-line bg-white p-6 text-center sm:p-10" role="region" aria-label={`${mod?.name} not included`}>
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-softmint text-teal"><Lock size={20} /></span>
      <h1 className="mt-5 text-3xl font-semibold">{mod?.name}</h1>
      <p className="mt-2 text-slate">{mod?.name} is not included in your current plan{need ? <> and is available on <b className="text-ink">{need.name}</b></> : ''}.</p>
      {add && ap !== null && sub && <p className="mt-2 text-sm text-slate">It is also available as the <b className="text-ink">{add.name}</b> add-on for {money(ap, sub.currency, { trim: true })} / {sub.cycle === 'annual' ? 'year' : 'month'}.</p>}
      <p className="mt-2 text-sm text-slate">Any existing {mod?.name} data is retained and becomes available again as soon as the capability is reactivated.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {canManage ? <Btn to="/admin/business/settings?tab=billing&change=1">Explore upgrade</Btn> : <p className="text-sm font-semibold">Ask your BizFlow administrator to upgrade.</p>}
        <Btn v="secondary" to="/admin/business/my">Back to my workspace</Btn>
      </div>
    </div>
  )
}

/* Upgrade / downgrade flow */
export function PlanChangeDialog({ open, onClose, sub, actor, initialPlan }: { open: boolean; onClose: () => void; sub: Subscription; actor: string; initialPlan?: string }) {
  const s = useBilling(); const toast = useToast()
  const cur = planById(s, sub.planId)!
  const [target, setTarget] = useState<string | undefined>(initialPlan)
  const [busy, setBusy] = useState(false)
  const plans = publicPlans(s).filter((p) => p.id !== sub.planId || p.id === cur.id)
  const to = target ? planById(s, target) : undefined
  const base = { cycle: sub.cycle, currency: sub.currency, employees: sub.employees, isNew: false }
  const keepAddons = (pid: string) => sub.addons.filter((a) => { const ad = s.addons.find((x) => x.id === a); return ad && ad.plans.includes(pid) })
  const curQ = quote(s, { ...base, planId: cur.id, addonIds: sub.addons })
  const newQ = to && !isCustom(to) ? quote(s, { ...base, planId: to.id, addonIds: keepAddons(to.id) }) : null
  const up = !!to && to.order > cur.order
  const diff = to ? planDiff(cur, to) : null
  const periodDays = sub.cycle === 'annual' ? 365 : 30
  const frac = sub.status === 'trial' ? 1 : Math.max(0, Math.min(1, daysUntil(sub.renewsAt) / periodDays))
  const delta = newQ?.ok && curQ.ok ? newQ.subtotal - curQ.subtotal : 0
  const chargeNow = newQ?.ok && curQ.ok ? (sub.status === 'trial' ? newQ.total : Math.max(0, (newQ.total - curQ.total) * frac)) : 0
  const dropped = sub.addons.filter((a) => to && !keepAddons(to.id).includes(a)).map((a) => s.addons.find((x) => x.id === a)?.name)
  const cy = sub.cycle === 'annual' ? 'year' : 'month'
  const confirm = () => {
    if (!to) return
    setBusy(true)
    setTimeout(() => {
      if (up) {
        const ref = `BF-TX-${Math.floor(50000 + Math.random() * 49999)}`
        if (sub.status === 'trial') convertTrial(sub.id, to.id, Math.round(chargeNow), ref, actor)
        else { subActions.changePlan(sub.id, to.id, actor); if (chargeNow > 0) addPayment({ subId: sub.id, at: new Date().toISOString().slice(0, 10), amount: Math.round(chargeNow * 100) / 100, currency: sub.currency, status: 'successful', ref, description: `Upgrade to ${to.name} (prorated)` }) }
        toast(`Upgraded to ${to.name}. New capabilities are active now.`)
      } else if (sub.status === 'trial') { subActions.changePlan(sub.id, to.id, actor); toast(`Trial moved to ${to.name}.`) }
      else { subActions.schedulePlan(sub.id, to.id, actor); toast(`Downgrade to ${to.name} scheduled for ${fmtDate(sub.renewsAt)}.`) }
      setBusy(false); setTarget(undefined); onClose()
    }, 700)
  }
  return (
    <Overlay open={open} onClose={() => { setTarget(initialPlan); onClose() }} title={to ? (up ? `Upgrade to ${to.name}` : `Change to ${to.name}`) : 'Change plan'} side>
      {!to ? (
        <div className="space-y-3">
          <p className="text-sm text-slate">You are on <b className="text-ink">{cur.name}</b>. Choose a plan to see exactly what changes before you confirm.</p>
          {plans.map((p) => {
            const q = isCustom(p) ? null : quote(s, { ...base, planId: p.id, addonIds: keepAddons(p.id) })
            return (
              <button key={p.id} disabled={p.id === cur.id} onClick={() => (isCustom(p) ? (location.href = '/contact') : setTarget(p.id))} className="flex w-full cursor-pointer flex-col items-start justify-between gap-2 rounded-lg border border-line bg-white p-4 text-left hover:border-teal disabled:cursor-default disabled:bg-cloud disabled:opacity-70 sm:flex-row sm:items-center">
                <span><b>{p.name}</b> {p.id === cur.id && <Badge tone="teal">Current</Badge>}<span className="block text-sm text-slate">{p.tagline}</span></span>
                <span className="num text-right text-sm font-semibold">{isCustom(p) ? 'Talk to Sales' : q?.ok ? `${money(q.subtotal, sub.currency, { trim: true })}/${cy}` : 'Not in ' + sub.currency}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-5 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line p-3"><div className="text-xs text-slate">Current plan</div><div className="font-display text-lg font-semibold">{cur.name}</div><div className="num text-slate">{curQ.ok ? `${money(curQ.subtotal, sub.currency, { trim: true })} / ${cy}` : ''}</div></div>
            <div className="rounded-lg border-2 border-teal p-3"><div className="text-xs text-slate">New plan</div><div className="font-display text-lg font-semibold">{to.name}</div><div className="num text-slate">{newQ?.ok ? `${money(newQ.subtotal, sub.currency, { trim: true })} / ${cy}` : ''}</div></div>
          </div>
          {diff && diff.gained.length > 0 && <div><div className="mb-1.5 font-semibold">Additional capabilities</div><ul className="grid gap-1 sm:grid-cols-2">{diff.gained.map((m) => <li key={m.id} className="flex items-center gap-1.5"><Check size={14} className="text-teal" />{m.name}</li>)}</ul></div>}
          {diff && diff.gained.length === 0 && diff.featureGained.length > 0 && <p className="text-slate">Adds {diff.featureGained.length} feature-level capabilities to modules you already use.</p>}
          {!up && diff && (diff.lost.length > 0 || diff.featureLost.length > 0) && (
            <div className="rounded-lg border border-warn/40 bg-amber-50 p-4">
              <div className="font-semibold">Changing to {to.name} will remove access to:</div>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">{diff.lost.map((m) => <li key={m.id} className="flex items-center gap-1.5"><Minus size={14} className="text-[#9a6200]" />{m.name}</li>)}</ul>
              {diff.lost.length === 0 && <p className="mt-1">Some advanced features inside modules you use ({diff.featureLost.length} in total).</p>}
              {dropped.length > 0 && <p className="mt-2">Add-ons not available on {to.name}: {dropped.join(', ')}.</p>}
              <p className="mt-2 text-slate">Your data is not deleted. It is retained, and those modules become available again if you reactivate them.</p>
            </div>
          )}
          {newQ?.ok && (
            <div className="rounded-lg bg-cloud p-4">
              <div className="flex flex-wrap justify-between gap-2"><span>Price difference</span><b className="num">{delta >= 0 ? '+' : '−'}{money(Math.abs(delta), sub.currency, { trim: true })} / {cy}</b></div>
              {up && <div className="mt-1 flex flex-wrap justify-between gap-2"><span>{sub.status === 'trial' ? 'Charged today' : 'Prorated charge today (incl. tax)'}</span><b className="num">{money(chargeNow, sub.currency)}</b></div>}
              <p className="mt-2 text-xs text-slate">{up ? 'New capabilities are active as soon as payment is confirmed.' : sub.status === 'trial' ? 'Applies immediately during your trial.' : `To protect payroll runs, approvals and signing already in progress, the change takes effect at renewal on ${fmtDate(sub.renewsAt)}. You keep your current plan until then.`}</p>
            </div>
          )}
          {up && sub.card && <p className="text-xs text-slate">Payment method: {sub.card.brand} ending {sub.card.last4}</p>}
          <div className="flex gap-2"><Btn v="secondary" onClick={() => setTarget(undefined)}>Back</Btn><Btn className="flex-1" disabled={busy || !newQ?.ok} onClick={confirm}>{busy ? 'Processing…' : up ? `Pay ${money(chargeNow, sub.currency)} and upgrade` : sub.status === 'trial' ? `Switch to ${to.name}` : `Schedule change to ${to.name}`}</Btn></div>
        </div>
      )}
    </Overlay>
  )
}

export const Section = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
  <section className="mb-8"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-sans text-[15px] font-semibold tracking-normal">{title}</h2>{action}</div>{children}</section>
)
export type { LimitKey }
