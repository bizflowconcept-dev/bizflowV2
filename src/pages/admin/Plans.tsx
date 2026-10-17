import { liveGrants, useGrants } from '../../data/grants'
import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Copy, Search } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { Badge, Btn, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, useToast } from '../../components/ui'
import { CapabilityTree } from '../../components/billing/shared'
import { GROUPS, LIMIT_DEFS, MODULES, STATUS_META, activeCurrencies, addonAddsValue, availabilityOf, defaultCurrency, depsOf, fmtDate, fmtLimit, isCustom, logAudit, modulesIn, money, moduleById, moduleKeys, nid, planWarnings, resetBilling, setBilling, useBilling } from '../../data/billing'
import type { Addon, BillingState, Limits, Plan, PricingModel, SubStatus } from '../../data/billing'
import { Gate, useAdmin } from './AdminLayout'

const Toggle = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <label className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'}`}><input type="checkbox" disabled={disabled} className="size-4 accent-teal" checked={on} onChange={(e) => onChange(e.target.checked)} />{label}</label>
)
export { Toggle }

const mrrOf = (net: number, cycle: string) => (cycle === 'annual' ? net / 12 : net)

export function Overview() {
  const s = useBilling(); const { can } = useAdmin(); const toast = useToast()
  const cur = defaultCurrency(s)
  const live = s.subs.filter((x) => ['active', 'past_due', 'payment_failed', 'grace'].includes(x.status))
  const byCur = useMemo(() => { const o: Record<string, number> = {}; live.forEach((x) => { o[x.currency] = (o[x.currency] ?? 0) + mrrOf(x.net, x.cycle) }); return o }, [s]) // eslint-disable-line
  const statuses = (Object.keys(STATUS_META) as SubStatus[]).map((k) => [k, s.subs.filter((x) => x.status === k).length] as const)
  const hot = s.subs.filter((x) => x.status !== 'cancelled' && x.status !== 'expired' && (['employees', 'storageGb', 'signatures'] as const).some((k) => { const p = s.plans.find((pl) => pl.id === x.planId); const l = p?.limits[k]; return l && (k === 'employees' ? x.employees : x.usage[k]) / l >= 0.8 }))
  const mix = s.plans.map((p) => [p.name, s.subs.filter((x) => x.planId === p.id).length] as const)
  const max = Math.max(1, ...mix.map(([, n]) => n))
  return (
    <Gate perm="view">
      <PageHeader eyebrow="Billing & Pricing" title="Overview" desc="Metrics are derived live from subscriptions. Trials and cancelled or suspended accounts are excluded from MRR." actions={can('plans') && <Btn v="secondary" onClick={() => { resetBilling(); toast('Demo data reset.') }}>Reset demo data</Btn>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`MRR · ${cur}`} value={money(Math.round(byCur[cur] ?? 0), cur, { trim: true, s })} />
        <Stat label={`ARR · ${cur}`} value={money(Math.round((byCur[cur] ?? 0) * 12), cur, { trim: true, s })} />
        <Stat label="Paying subscriptions" value={String(live.length)} />
        <Stat label="Active trials" value={String(s.subs.filter((x) => x.status === 'trial').length)} />
      </div>
      {Object.keys(byCur).filter((c) => c !== cur).length > 0 && <p className="mt-2 text-xs text-slate">Other currencies are reported separately, not converted: {Object.entries(byCur).filter(([c]) => c !== cur).map(([c, v]) => `${c} MRR ${money(Math.round(v), c, { trim: true, s })}`).join(' · ')}</p>}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Panel title="Subscriptions by status"><ul className="space-y-1.5 text-sm">{statuses.map(([k, n]) => <li key={k} className="flex items-center justify-between"><Badge tone={STATUS_META[k].tone}>{STATUS_META[k].label}</Badge><span className="num font-semibold">{n}</span></li>)}</ul></Panel>
        <Panel title="Plan mix"><ul className="space-y-3 text-sm">{mix.map(([n, c]) => <li key={n}><div className="flex justify-between"><span>{n}</span><span className="num font-semibold">{c}</span></div><div className="mt-1 h-1.5 rounded bg-ink/10"><div className="h-full rounded bg-teal" style={{ width: (c / max) * 100 + '%' }} /></div></li>)}</ul></Panel>
        <Panel title="Near usage limits"><ul className="space-y-2 text-sm">{hot.length === 0 && <li className="text-slate">No company is above 80%.</li>}{hot.slice(0, 6).map((x) => <li key={x.id} className="flex justify-between"><Link to={`/admin/billing/subscriptions/${x.id}`} className="font-medium hover:text-teal">{x.company}</Link><span className="text-xs text-slate">≥ 80% used</span></li>)}</ul></Panel>
      </div>
      <Panel title="Recent billing events" className="mt-5" pad={false}>
        <Table label="Recent billing events" pageSize={6} head={['When', 'Company', 'Event', 'By']} rows={s.audit.slice(0, 12).map((a) => [fmtDate(a.at.slice(0, 10)), a.company, a.action, a.actor])} />
      </Panel>
    </Gate>
  )
}

/* Same layout as the public pricing page card, so admins see exactly what customers see. */
export function PlanCard({ plan, cur, annual, s, compact }: { plan: Plan; cur: string; annual: boolean; s: BillingState; compact?: boolean }) {
  const custom = isCustom(plan); const pr = plan.prices[cur]
  return (
    <article className={`relative flex flex-col rounded-lg border bg-white p-5 ${plan.recommended ? 'border-teal shadow-[0_10px_30px_-18px_rgba(8,126,139,0.6)]' : 'border-line'}`}>
      {plan.recommended && <span className="absolute -top-2.5 left-5 rounded bg-teal px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">Recommended</span>}
      <h3 className="font-display text-xl font-semibold">{plan.name || 'Untitled plan'}</h3>
      <p className="mt-1 min-h-[40px] text-sm text-slate">{plan.tagline}</p>
      <div className="mt-4 min-h-[72px]">
        {custom ? <><div className="font-display text-3xl font-semibold">Custom</div><div className="mt-1 text-xs text-slate">Priced to your structure, contract and SLA.</div></>
          : pr ? <><div className="num font-display text-3xl font-semibold">{money(annual ? pr.annual / 12 : pr.monthly, cur, { trim: true, s })}<span className="text-sm font-normal text-slate"> / month</span></div>
            <div className="mt-1 text-xs text-slate">{annual ? <>Billed {money(pr.annual, cur, { trim: true, s })} yearly</> : <>Billed monthly · {money(pr.annual, cur, { trim: true, s })} if paid yearly</>}</div></>
            : <><div className="font-display text-xl font-semibold">Not priced in {cur}</div><div className="mt-1 text-xs text-slate">Customers in {cur} are sent to sales.</div></>}
      </div>
      <div className="mt-3 border-t border-line pt-3 text-sm">
        <div className="font-semibold">{custom ? 'Unlimited employees' : `Includes ${plan.includedEmployees} employees`}</div>
        <div className="text-xs text-slate">{custom ? 'Scoped to your organization' : <>Up to {fmtLimit('employees', plan.limits.employees)}{pr?.extraMonthly ? ` · +${money(annual ? pr.extraAnnual ?? 0 : pr.extraMonthly, cur, { trim: true, s })} per extra employee` : ''}</>}</div>
      </div>
      <ul className="mt-3 flex-1 space-y-1.5 text-sm">{plan.highlights.filter(Boolean).slice(0, compact ? 3 : 5).map((h, i) => <li key={i} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-teal" aria-hidden />{h}</li>)}</ul>
      <div className="mt-4 flex flex-wrap gap-1.5 text-xs"><span className="num text-slate">{plan.features.length} features · {modulesIn(plan.features).length} modules</span>{plan.trialDays > 0 && <Badge tone="teal">{plan.trialDays}-day trial</Badge>}{!plan.visible && <Badge tone="gray">Hidden</Badge>}{plan.status !== 'active' && <Badge tone="amber">{plan.status}</Badge>}</div>
    </article>
  )
}

function CompareMatrix({ plans, move, clone, canEdit }: { plans: Plan[]; move: (id: string, d: -1 | 1) => void; clone: (p: Plan) => void; canEdit: boolean }) {
  const s = useBilling(); const cur = defaultCurrency(s)
  const [q, setQ] = useState(''); const [diffOnly, setDiffOnly] = useState(false); const [closed, setClosed] = useState<string[]>([])
  const term = q.trim().toLowerCase()
  const state = (p: Plan, id: string) => (p.id === 'enterprise' ? { state: 'included' as const, partial: false } : availabilityOf(s, id, p.id))
  const rows = (g: string) => MODULES.filter((m) => m.group === g && (!term || m.name.toLowerCase().includes(term)) && (!diffOnly || new Set(plans.map((p) => state(p, m.id).state + state(p, m.id).partial)).size > 1))
  const cell = (p: Plan, id: string) => {
    const a = state(p, id)
    if (a.state === 'included') return <span className="inline-flex items-center gap-1 font-semibold text-teal"><Check size={15} aria-hidden /><span className="sr-only">Included</span>{a.partial && <span className="text-[10px] font-normal uppercase text-slate">partial</span>}</span>
    if (a.state === 'addon') return <span className="rounded-sm bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Add-on</span>
    return <span className="text-slate/50"><span aria-hidden>—</span><span className="sr-only">Not available</span></span>
  }
  const th = 'sticky top-0 z-20 border-b border-line bg-white p-3 text-left align-bottom'
  return (
    <Panel pad={false}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
        <div className="relative min-w-[200px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate" /><input aria-label="Search modules" placeholder="Search modules" className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Toggle on={diffOnly} onChange={setDiffOnly} label="Only show differences" />
      </div>
      <div className="max-h-[72vh] overflow-auto" tabIndex={0} aria-label="Plan comparison matrix">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Modules, limits and prices per plan</caption>
          <thead><tr>
            <th scope="col" className={`${th} left-0 z-30 w-[30%] text-xs uppercase tracking-wider text-slate`}>Module</th>
            {plans.map((p, i) => (
              <th scope="col" key={p.id} className={`${th} ${p.recommended ? 'bg-softmint' : ''}`}>
                <div className="font-display text-base font-semibold">{p.name}</div>
                <div className="num text-xs font-normal text-slate">{isCustom(p) ? 'Custom' : p.prices[cur] ? money(p.prices[cur].monthly, cur, { trim: true, s }) + ' / mo' : 'No ' + cur + ' price'}</div>
                {canEdit && <div className="mt-1.5 flex gap-2 text-xs font-semibold text-teal">
                  <button aria-label={`Move ${p.name} left`} disabled={i === 0} onClick={() => move(p.id, -1)} className="cursor-pointer disabled:opacity-30">←</button>
                  <button aria-label={`Move ${p.name} right`} disabled={i === plans.length - 1} onClick={() => move(p.id, 1)} className="cursor-pointer disabled:opacity-30">→</button>
                  <button onClick={() => clone(p)} className="inline-flex cursor-pointer items-center gap-1"><Copy size={11} />Clone</button>
                  <Link to={`/admin/billing/plans/${p.id}`}>Edit</Link></div>}
              </th>))}
          </tr></thead>
          <tbody>
            <tr><th scope="colgroup" colSpan={plans.length + 1} className="bg-cloud px-3 py-1.5 text-left text-xs font-bold uppercase tracking-wider text-slate">Limits</th></tr>
            {LIMIT_DEFS.map((l) => <tr key={l.key}><th scope="row" className="sticky left-0 z-10 border-b border-line/60 bg-white px-3 py-2 text-left font-normal">{l.label}{l.period ? ` ${l.period}` : ''}</th>{plans.map((p) => <td key={p.id} className="num border-b border-line/60 px-3 py-2">{fmtLimit(l.key, p.limits[l.key])}</td>)}</tr>)}
            <tr><th scope="row" className="sticky left-0 z-10 border-b border-line/60 bg-white px-3 py-2 text-left font-normal">Free trial</th>{plans.map((p) => <td key={p.id} className="border-b border-line/60 px-3 py-2">{p.trialDays ? `${p.trialDays} days` : 'None'}</td>)}</tr>
            <tr><th scope="row" className="sticky left-0 z-10 border-b border-line/60 bg-white px-3 py-2 text-left font-normal">Warnings</th>{plans.map((p) => { const w = planWarnings(s, p); return <td key={p.id} className="border-b border-line/60 px-3 py-2">{w.length ? <Link to={`/admin/billing/plans/${p.id}`} className="inline-flex items-center gap-1 font-semibold text-amber-800"><AlertTriangle size={13} />{w.length}</Link> : <span className="text-slate">None</span>}</td> })}</tr>
            {GROUPS.map((g) => { const r = rows(g.id); if (!r.length) return null; const shut = closed.includes(g.id); return [
              <tr key={g.id}><th scope="colgroup" colSpan={plans.length + 1} className="bg-cloud p-0 text-left"><button aria-expanded={!shut} onClick={() => setClosed(shut ? closed.filter((x) => x !== g.id) : [...closed, g.id])} className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate"><span aria-hidden>{shut ? '▸' : '▾'}</span>{g.name}</button></th></tr>,
              ...(shut ? [] : r.map((m) => <tr key={m.id}><th scope="row" className="sticky left-0 z-10 border-b border-line/60 bg-white px-3 py-2 text-left font-normal">{m.name}</th>{plans.map((p) => <td key={p.id} className={`border-b border-line/60 px-3 py-2 ${p.recommended ? 'bg-softmint/30' : ''}`}>{cell(p, m.id)}</td>)}</tr>))] })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function Plans() {
  useGrants()
  const s = useBilling(); const { can, actor } = useAdmin(); const toast = useToast(); const nav = useNavigate()
  const cur = defaultCurrency(s)
  const [tab, setTab] = useState('Plans'); const [pcur, setPcur] = useState(cur); const [annual, setAnnual] = useState(false)
  const sorted = [...s.plans].sort((a, b) => a.order - b.order)
  const subsOf = (id: string) => s.subs.filter((x) => x.planId === id).length
  const totalSubscribers = s.subs.length
  const publicPlans = s.plans.filter((p) => p.status === 'active' && p.visible)
  const move = (id: string, d: -1 | 1) => {
    const i = sorted.findIndex((p) => p.id === id); const j = i + d; if (j < 0 || j >= sorted.length) return
    const a = sorted[i], b = sorted[j]
    setBilling((st) => ({ ...st, plans: st.plans.map((p) => (p.id === a.id ? { ...p, order: b.order } : p.id === b.id ? { ...p, order: a.order } : p)) }))
    logAudit(actor, 'Platform', `Reordered plan ${a.name}`, `Position ${i + 1}`, `Position ${j + 1}`)
  }
  const clone = (p: Plan) => { const id = nid('plan'); setBilling((st) => ({ ...st, plans: [...st.plans, { ...structuredClone(p), id, name: `${p.name} copy`, status: 'inactive', visible: false, recommended: false, order: Math.max(...st.plans.map((x) => x.order)) + 1 }] })); logAudit(actor, 'Platform', `Cloned plan ${p.name}`, '—', `${p.name} copy (inactive)`); toast('Plan cloned as an inactive draft.'); nav(`/admin/billing/plans/${id}`) }
  const archive = (p: Plan) => { setBilling((st) => ({ ...st, plans: st.plans.map((x) => (x.id === p.id ? { ...x, status: 'archived', visible: false, recommended: false } : x)) })); logAudit(actor, 'Platform', `Archived plan ${p.name}`, p.status, `archived · ${subsOf(p.id)} subscribers keep access`); toast(`${p.name} archived. Existing subscribers are unaffected.`) }
  const restore = (p: Plan) => { setBilling((st) => ({ ...st, plans: st.plans.map((x) => (x.id === p.id ? { ...x, status: 'inactive' } : x)) })); logAudit(actor, 'Platform', `Restored plan ${p.name}`, 'archived', 'inactive') }
  const shown = sorted.filter((p) => p.status !== 'archived')
  return (
    <Gate perm="view">
      {(() => { const live = liveGrants().filter((g) => g.scope.planId); return live.length > 0 && <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-softmint/50 px-4 py-2.5 text-sm"><Badge tone="teal">Complimentary</Badge><span>{live.map((g) => `${s.plans.find((p) => p.id === g.scope.planId)?.name ?? g.scope.planId} (${g.targets.length} tenant${g.targets.length === 1 ? '' : 's'})`).join(', ')} currently given away free through a grant.</span><Link to="/admin/billing/grants" className="font-semibold text-teal hover:underline">View grants</Link></div> })()}
      <PageHeader eyebrow="Billing & Pricing" title="Plans" desc="What you publish here is what the public pricing page, checkout and every workspace read. Plans with subscribers can be archived, never deleted." actions={<>{<Btn v="secondary" to="/admin/billing/module-pricing">Module pricing</Btn>}{can('plans') && <Btn to="/admin/billing/plans/new">New plan</Btn>}</>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel><Stat label="Published plans" value={String(publicPlans.length)} sub={`${s.plans.length} total configured`} /></Panel>
        <Panel><Stat label="Total subscribers" value={String(totalSubscribers)} sub="across all plans" /></Panel>
        <Panel><Stat label="Average capabilities" value={String(Math.round(s.plans.reduce((sum, plan) => sum + plan.features.length, 0) / Math.max(1, s.plans.length)))} sub="features per plan" /></Panel>
        <Panel><Stat label="Plans with warnings" value={String(s.plans.filter((p) => p.status !== 'archived' && planWarnings(s, p).length).length)} sub="dependency or pricing checks" /></Panel>
      </div>
      <Tabs tabs={['Plans', 'Compare', 'Preview']} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'Plans' && <Panel pad={false}>
          <Table label="Plans" head={['Plan', 'Status', 'Visibility', `Price / mo (${cur})`, 'Subscribers', '']} rows={sorted.map((p, i) => [
            <span key="n"><Link to={`/admin/billing/plans/${p.id}`} className="font-semibold hover:text-teal">{p.name}</Link>{p.recommended && <span className="ml-2 rounded bg-teal px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Recommended</span>}{planWarnings(s, p).length > 0 && <span title={`${planWarnings(s, p).length} warning(s)`} className="ml-2 inline-flex align-middle text-amber-700"><AlertTriangle size={14} /></span>}</span>,
            <Badge key="s" tone={p.status === 'active' ? 'green' : p.status === 'archived' ? 'gray' : 'amber'}>{p.status}</Badge>,
            p.visible ? 'Public' : 'Hidden',
            isCustom(p) ? 'Custom' : p.prices[cur] ? money(p.prices[cur].monthly, cur, { trim: true, s }) : '—',
            String(subsOf(p.id)),
            <span key="a" className="flex justify-end gap-3 text-sm font-semibold text-teal">
              <Link to={`/admin/billing/plans/${p.id}`}>{can('plans') ? 'Edit' : 'View'}</Link>
              {can('plans') && <>
                <button aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(p.id, -1)} className="cursor-pointer disabled:opacity-30">↑</button>
                <button aria-label={`Move ${p.name} down`} disabled={i === sorted.length - 1} onClick={() => move(p.id, 1)} className="cursor-pointer disabled:opacity-30">↓</button>
                <button onClick={() => clone(p)} className="cursor-pointer">Clone</button>
                {p.status === 'archived' ? <button onClick={() => restore(p)} className="cursor-pointer">Restore</button> : <button onClick={() => archive(p)} className="cursor-pointer">Archive</button>}
              </>}
            </span>,
          ])} />
        </Panel>}
        {tab === 'Compare' && <CompareMatrix plans={shown} move={move} clone={clone} canEdit={can('plans')} />}
        {tab === 'Preview' && <div>
          <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2 font-semibold">Currency<select className={`${inputCls} w-auto`} value={pcur} onChange={(e) => setPcur(e.target.value)}>{activeCurrencies(s).map((c) => <option key={c.code}>{c.code}</option>)}</select></label>
            <Toggle on={annual} onChange={setAnnual} label="Show annual billing" />
            <span className="text-xs text-slate">Cards use the public Pricing page layout. Only active, public plans appear there.</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{shown.map((p) => <div key={p.id} className={p.status !== 'active' || !p.visible ? 'opacity-60' : ''}><PlanCard plan={p} cur={pcur} annual={annual} s={s} /></div>)}</div>
        </div>}
      </div>
    </Gate>
  )
}

const blank = (order: number): Plan => ({ id: '', name: '', tagline: '', description: '', status: 'inactive', visible: false, recommended: false, order, trialDays: 14, model: 'base_plus_employee', includedEmployees: 10, prices: {}, limits: { employees: 50, branches: 3, storageGb: 20, documents: 500, signatures: 50, leads: 100 }, features: [], highlights: [] })

export function PlanBuilder() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast()
  const s = useBilling(); const { can, actor } = useAdmin()
  const existing = s.plans.find((p) => p.id === id)
  const [d, setD] = useState<Plan>(() => existing ?? blank(Math.max(0, ...s.plans.map((p) => p.order)) + 1))
  const [err, setErr] = useState('')
  const ro = !can('plans'); const roPrice = !can('pricing') && !can('plans')
  const subs = existing ? s.subs.filter((x) => x.planId === existing.id).length : 0
  const cur = activeCurrencies(s)
  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => setD((x) => ({ ...x, [k]: v }))
  const price = (c: string, k: 'monthly' | 'annual' | 'extraMonthly' | 'extraAnnual', v: string) => setD((x) => ({ ...x, prices: { ...x.prices, [c]: { ...({ monthly: 0, annual: 0 } as object), ...x.prices[c], [k]: v === '' ? undefined : Number(v) } as Plan['prices'][string] } }))
  const lim = (k: keyof Limits, v: string) => setD((x) => ({ ...x, limits: { ...x.limits, [k]: v === '' ? null : Number(v) } }))
  const warnings = useMemo(() => planWarnings(s, d), [s, d])
  const missingDeps = useMemo(() => [...new Set(modulesIn(d.features).flatMap((m) => depsOf(s, m)).filter((m) => !modulesIn(d.features).includes(m)))], [s, d.features])
  const publish = () => {
    if (!d.name.trim()) { setErr('Plan name is required.'); return }
    if (d.status === 'active' && d.model !== 'custom' && !cur.some((c) => d.prices[c.code]?.monthly > 0)) { setErr('An active priced plan needs at least one currency price.'); return }
    const pid = existing?.id ?? nid('plan')
    const next: Plan = { ...d, id: pid, name: d.name.trim() }
    setBilling((st) => ({ ...st, plans: (existing ? st.plans.map((p) => (p.id === pid ? next : p)) : [...st.plans, next]).map((p) => (next.recommended && p.id !== pid ? { ...p, recommended: false } : p)) }))
    logAudit(actor, 'Platform', existing ? `Updated plan ${next.name}` : `Created plan ${next.name}`, existing ? `${existing.features.length} features · ${existing.status}` : '—', `${next.features.length} features · ${next.status}`)
    toast(existing ? 'Plan published. The pricing page is updated.' : 'Plan created.'); nav('/admin/billing/plans')
  }
  return (
    <Gate perm="view">
      <PageHeader eyebrow="Plans" title={existing ? `Edit ${existing.name}` : 'New plan'} desc={subs ? `${subs} subscriber${subs > 1 ? 's' : ''} on this plan. Changes to features and limits apply to them on save; their data is never deleted.` : undefined} actions={<><Btn v="secondary" to="/admin/billing/plans">Back</Btn>{!ro && <Btn onClick={publish}>Publish changes</Btn>}</>} />
      {ro && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You can view this plan but your role cannot change it.</p>}
      {err && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {warnings.length > 0 && (
            <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} />{warnings.length} thing{warnings.length > 1 ? 's' : ''} to check before publishing</div>
              <ul className="mt-2 space-y-1.5">{warnings.map((w, i) => <li key={i} className="flex flex-wrap items-center gap-2"><span className={w.level === 'error' ? 'font-semibold text-red-800' : ''}>{w.text}</span></li>)}</ul>
              {!ro && missingDeps.length > 0 && <Btn v="secondary" s="sm" className="mt-3" onClick={() => setD((x) => ({ ...x, features: [...new Set([...x.features, ...missingDeps.flatMap((m) => moduleKeys(m))])] }))}>Add {missingDeps.map((m) => moduleById(m)?.name).join(', ')}</Btn>}
            </div>
          )}
          <Panel title="Details">
            <fieldset disabled={ro} className="grid gap-4 sm:grid-cols-2">
              <Field label="Plan name"><input className={inputCls} value={d.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Tagline"><input className={inputCls} value={d.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
              <div className="sm:col-span-2"><Field label="Description"><textarea rows={2} className={`${inputCls} h-auto py-2`} value={d.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
              <Field label="Status"><select className={inputCls} value={d.status} onChange={(e) => set('status', e.target.value as Plan['status'])}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></Field>
              <Field label="Free trial (days)" hint="0 for no trial"><input type="number" min={0} className={inputCls} value={d.trialDays} onChange={(e) => set('trialDays', Math.max(0, Number(e.target.value) || 0))} /></Field>
              <Toggle on={d.visible} onChange={(v) => set('visible', v)} label="Visible on public pricing page" />
              <Toggle on={d.recommended} onChange={(v) => set('recommended', v)} label="Recommended plan" />
            </fieldset>
          </Panel>
          <Panel title="Pricing">
            <fieldset disabled={roPrice} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pricing model"><select className={inputCls} value={d.model} onChange={(e) => set('model', e.target.value as PricingModel)}><option value="flat">Flat price</option><option value="base_plus_employee">Base + extra employees</option><option value="per_employee">Per employee</option><option value="custom">Custom (Talk to Sales)</option></select></Field>
                <Field label="Included employees"><input type="number" min={0} className={inputCls} value={d.includedEmployees} onChange={(e) => set('includedEmployees', Math.max(0, Number(e.target.value) || 0))} /></Field>
              </div>
              {d.model !== 'custom' && (
                <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wider text-slate"><th className="pb-2">Currency</th><th>Monthly</th><th>Annual</th><th>Extra / mo</th><th>Extra / yr</th></tr></thead>
                  <tbody>{cur.map((c) => (
                    <tr key={c.code} className="border-t border-line"><th scope="row" className="py-2 text-left">{c.code} <span className="font-normal text-slate">{c.symbol}</span></th>
                      {(['monthly', 'annual', 'extraMonthly', 'extraAnnual'] as const).map((k) => <td key={k} className="py-1.5 pr-2"><input aria-label={`${c.code} ${k}`} type="number" min={0} className={`${inputCls} num`} value={d.prices[c.code]?.[k] ?? ''} onChange={(e) => price(c.code, k, e.target.value)} /></td>)}</tr>
                  ))}</tbody></table><p className="mt-2 text-xs text-slate">Leave a currency blank to make the plan unavailable in it. Add currencies under Currency &amp; tax.</p></div>
              )}
            </fieldset>
          </Panel>
          <Panel title="Limits">
            <fieldset disabled={ro} className="grid gap-4 sm:grid-cols-3">
              {LIMIT_DEFS.map((l) => (
                <div key={l.key}>
                  <Field label={`${l.label}${l.period ? ' ' + l.period : ''}${l.unit ? ` (${l.unit})` : ''}`}><input type="number" min={0} disabled={d.limits[l.key] === null} className={`${inputCls} num`} value={d.limits[l.key] ?? ''} placeholder="Unlimited" onChange={(e) => lim(l.key, e.target.value)} /></Field>
                  <div className="mt-1.5"><Toggle on={d.limits[l.key] === null} onChange={(v) => setD((x) => ({ ...x, limits: { ...x.limits, [l.key]: v ? null : (existing?.limits[l.key] ?? 10) } }))} label="Unlimited" /></div>
                </div>
              ))}
            </fieldset>
            {d.limits.employees !== null && d.includedEmployees > d.limits.employees && <p role="alert" className="mt-3 text-xs text-amber-800">Included employees ({d.includedEmployees}) exceed the employee limit ({d.limits.employees}).</p>}
          </Panel>
          <Panel title="Capabilities by pillar"><CapabilityTree disabled={ro} features={d.features} onChange={(f) => set('features', f)} /></Panel>
          <Panel title="Highlights on the pricing card"><textarea disabled={ro} rows={5} aria-label="Highlights, one per line" className={`${inputCls} h-auto py-2`} value={d.highlights.join('\n')} onChange={(e) => set('highlights', e.target.value.split('\n'))} /><p className="mt-1 text-xs text-slate">One per line. The first five are shown.</p></Panel>
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 text-sm font-semibold">Pricing page preview</div>
          <PlanCard plan={d} cur={cur[0]?.code ?? 'NGN'} annual={false} s={s} />
          <p className="mt-2 text-xs text-slate">Shown in {cur[0]?.code ?? 'NGN'}. {d.visible && d.status === 'active' ? 'This plan is live on the public page.' : 'This plan is not shown publicly.'}</p>
        </aside>
      </div>
    </Gate>
  )
}

export function Addons() {
  const s = useBilling(); const { can, actor } = useAdmin(); const toast = useToast()
  const [edit, setEdit] = useState<Addon | null>(null); const [isNew, setIsNew] = useState(false)
  const cur = activeCurrencies(s)
  const open = (a?: Addon) => {
    setIsNew(!a)
    if (!a) { setEdit({ id: '', name: '', description: '', category: 'Capability', active: true, freq: 'cycle', prices: {}, costs: {}, grants: [], limitBoosts: {}, plans: [] }); return }
    const copy = structuredClone(a)
    copy.costs ??= Object.fromEntries(Object.entries(copy.prices).map(([code, price]) => [code, { monthly: Math.round(price.monthly * 0.4), annual: Math.round(price.annual * 0.4) }]))
    setEdit(copy)
  }
  const save = () => {
    if (!edit || !edit.name.trim()) return
    const a = { ...edit, id: edit.id || nid('addon'), plans: edit.plans.filter((id) => {
      const plan = s.plans.find((candidate) => candidate.id === id)
      return !!plan && addonAddsValue(edit, plan)
    }) }
    setBilling((st) => ({ ...st, addons: isNew ? [...st.addons, a] : st.addons.map((x) => (x.id === a.id ? a : x)) }))
    logAudit(actor, 'Platform', `${isNew ? 'Created' : 'Updated'} add-on ${a.name}`, isNew ? '—' : 'Previous version', a.active ? 'Active' : 'Inactive'); toast('Add-on saved.'); setEdit(null)
  }
  return (
    <Gate perm="view">
      <PageHeader eyebrow="Billing & Pricing" title="Add-ons" desc="Optional capabilities sold on top of a plan. Per-module rates, bands, bundles and scheduled price changes live in Module pricing." actions={<>{can('view') && <Btn v="secondary" to="/admin/billing/module-pricing">Module pricing</Btn>}{can('addons') && <Btn onClick={() => open()}>New add-on</Btn>}</>} />
      <Panel pad={false}><Table label="Priced modules and add-ons" head={['Module / add-on', 'Category', `Price / mo (${defaultCurrency(s)})`, 'Est. cost', 'Gross margin', 'Status', '']} rows={s.addons.map((a) => {
        const code = defaultCurrency(s)
        const price = a.prices[code]?.monthly ?? 0
        const cost = a.costs?.[code]?.monthly ?? Math.round(price * 0.4)
        const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0
        return [<b key="n">{a.name}</b>, a.category, price ? money(price, code, { trim: true, s }) : 'Not priced', cost ? money(cost, code, { trim: true, s }) : '—', price ? `${margin}%` : '—', <Badge key="s" tone={a.active ? 'green' : 'gray'}>{a.active ? 'Active' : 'Inactive'}</Badge>, <button key="e" onClick={() => open(a)} className="cursor-pointer text-sm font-semibold text-teal">{can('addons') ? 'Edit' : 'View'}</button>]
      })} /></Panel>
      <Panel title="Complete module pricing coverage" className="mt-5" pad={false}>
        <Table label="Every module and its current commercial treatment" pageSize={40} head={['Module', 'Area', 'Current pricing', 'Available on']} rows={MODULES.map((m) => {
          const a = s.addons.find((x) => x.grants.some((g) => m.features.some((f) => f.key === g)))
          const included = s.plans.filter((p) => p.features.some((f) => m.features.some((mf) => mf.key === f))).map((p) => p.name)
          const code = defaultCurrency(s)
          const price = a?.prices[code]?.monthly
          return [<b key="m">{m.name}</b>, m.group, a && price !== undefined ? `${money(price, code, { trim: true, s })} / month add-on` : 'No standalone price', [...included, ...(a ? ['Add-on'] : [])].join(', ') || 'Not currently sold']
        })} />
      </Panel>
      <Overlay open={!!edit} onClose={() => setEdit(null)} title={isNew ? 'New add-on' : `Edit ${edit?.name ?? ''}`} side>
        {edit && (
          <fieldset disabled={!can('addons')} className="space-y-4">
            <Field label="Name"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description"><input className={inputCls} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category"><input className={inputCls} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
              <Field label="Billing"><select className={inputCls} value={edit.freq} onChange={(e) => setEdit({ ...edit, freq: e.target.value as Addon['freq'] })}><option value="cycle">With plan cycle</option><option value="monthly">Monthly rate</option><option value="annual">Annual rate</option></select></Field>
            </div>
            <Toggle on={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" />
            <div><div className="mb-1 text-sm font-medium">Available on plans</div><div className="flex flex-wrap gap-3">{s.plans.map((p) => <Toggle key={p.id} on={edit.plans.includes(p.id)} onChange={(v) => setEdit({ ...edit, plans: v ? [...edit.plans, p.id] : edit.plans.filter((x) => x !== p.id) })} label={p.name} />)}</div></div>
            <div><div className="mb-1 text-sm font-medium">Customer prices</div>{cur.map((c) => <div key={c.code} className="mb-2 grid grid-cols-[48px_1fr_1fr] items-center gap-2 text-sm"><span>{c.code}</span>{(['monthly', 'annual'] as const).map((k) => <input key={k} aria-label={`${c.code} ${k} price`} placeholder={k} type="number" min={0} className={`${inputCls} num`} value={edit.prices[c.code]?.[k] ?? ''} onChange={(e) => setEdit({ ...edit, prices: { ...edit.prices, [c.code]: { ...({ monthly: 0, annual: 0 } as object), ...edit.prices[c.code], [k]: Number(e.target.value) } as Addon['prices'][string] } })} />)}</div>)}</div>
            <div><div className="mb-1 text-sm font-medium">Estimated delivery cost</div><p className="mb-2 text-xs text-slate">Used for internal margin analysis; never shown to customers.</p>{cur.map((c) => <div key={c.code} className="mb-2 grid grid-cols-[48px_1fr_1fr] items-center gap-2 text-sm"><span>{c.code}</span>{(['monthly', 'annual'] as const).map((k) => <input key={k} aria-label={`${c.code} ${k} cost`} placeholder={k} type="number" min={0} className={`${inputCls} num`} value={edit.costs?.[c.code]?.[k] ?? Math.round((edit.prices[c.code]?.[k] ?? 0) * 0.4)} onChange={(e) => setEdit({ ...edit, costs: { ...edit.costs, [c.code]: { monthly: edit.costs?.[c.code]?.monthly ?? 0, annual: edit.costs?.[c.code]?.annual ?? 0, [k]: Number(e.target.value) } } })} />)}</div>)}</div>
            <div><div className="mb-1 text-sm font-medium">Capacity boost</div><div className="grid gap-2 sm:grid-cols-2">{(['storageGb', 'signatures', 'employees', 'leads'] as const).map((k) => <Field key={k} label={LIMIT_DEFS.find((l) => l.key === k)!.label}><input type="number" min={0} className={`${inputCls} num`} value={edit.limitBoosts[k] ?? ''} onChange={(e) => setEdit({ ...edit, limitBoosts: { ...edit.limitBoosts, [k]: e.target.value === '' ? undefined : Number(e.target.value) } })} /></Field>)}</div></div>
            <div><div className="mb-1 text-sm font-medium">Capabilities granted</div><CapabilityTree features={edit.grants} onChange={(g) => setEdit({ ...edit, grants: g })} /></div>
            {can('addons') && <Btn className="w-full" onClick={save}>Save add-on</Btn>}
          </fieldset>
        )}
      </Overlay>
    </Gate>
  )
}
