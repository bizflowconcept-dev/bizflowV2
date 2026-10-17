import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Area, AreaChart, Bar as RBar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, MoreHorizontal, Search, Star, X } from 'lucide-react'
import { Badge, Btn, inputCls, PageHeader, Panel, useToast } from '../../../components/ui'
import { StatusBadge } from '../../../components/billing/shared'
import { STATUS_META, fmtDate, money, subActions, useBilling } from '../../../data/billing'
import type { SubStatus } from '../../../data/billing'
import { HEALTH_META, TROUBLED, portfolio, rowInsights } from '../../../billing/insights'
import type { HealthBand, RowInsight } from '../../../billing/insights'
import { useTickets } from '../../../platform/helpdesk'
import { Gate, useAdmin } from '../AdminLayout'
import { Bar, CountUp, Fade, HealthPill, RenewChip, Spark, toneFor, useMounted, useReducedMotion } from './kit'

type Filters = { q: string; tab: string; plan: string; cycle: string; currency: string; status: string; health: string }
const NONE: Filters = { q: '', tab: 'all', plan: '', cycle: '', currency: '', status: '', health: '' }
type SortKey = 'company' | 'plan' | 'status' | 'health' | 'seats' | 'mrr' | 'renews'
const TABS: [string, string][] = [['all', 'All'], ['active', 'Active'], ['trial', 'Trial'], ['past_due', 'Past due'], ['suspended', 'Suspended'], ['ended', 'Ended']]
const tabOf = (st: SubStatus) => (st === 'active' ? 'active' : st === 'trial' ? 'trial' : TROUBLED.includes(st) ? 'past_due' : st === 'suspended' ? 'suspended' : 'ended')
const BUILTIN: { name: string; f: Partial<Filters> }[] = [
  { name: 'At risk', f: { health: 'risk' } }, { name: 'Needs attention', f: { tab: 'past_due' } }, { name: 'Annual contracts', f: { cycle: 'annual' } }, { name: 'Trials', f: { tab: 'trial' } },
]
const VIEWS_KEY = 'bf-sub-views'
const loadViews = (): { name: string; f: Filters }[] => { try { const v = JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => x && typeof x.name === 'string' && x.f) : [] } catch { return [] } }
const safeCell = (v: string | number) => { const t = String(v); return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"` }

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open, close])
  return ref
}

function RowMenu({ r, canManage, canPay }: { r: RowInsight; canManage: boolean; canPay: boolean }) {
  const [open, setOpen] = useState(false); const nav = useNavigate(); const toast = useToast(); const { actor } = useAdmin()
  const ref = useDismiss(open, () => setOpen(false)); const sub = r.sub; const base = `/admin/billing/subscriptions/${sub.id}`
  const go = (q = '') => { setOpen(false); nav(base + q) }
  const dead = sub.status === 'cancelled' || sub.status === 'suspended' || sub.status === 'expired'
  const items: { label: string; run: () => void; danger?: boolean }[] = [{ label: 'Open details', run: () => go() }, { label: 'Usage and limits', run: () => go('?tab=usage') }, { label: 'Billing and invoices', run: () => go('?tab=billing') }]
  if (canManage && !sub.customFeatures) items.push({ label: 'Change plan', run: () => go('?do=plan') })
  if (canManage && sub.status === 'trial') items.push({ label: 'Extend trial', run: () => go('?do=trial') })
  if (canPay) items.push({ label: 'Apply credit', run: () => go('?do=credit') })
  if (canManage && dead) items.push({ label: 'Reactivate', run: () => { subActions.reactivate(sub.id, actor); setOpen(false); toast('Subscription reactivated.') } })
  if (canManage && !dead) items.push({ label: 'Suspend', run: () => go('?do=suspend'), danger: true })
  return (
    <div ref={ref} className="relative">
      <button aria-label={`Actions for ${sub.company}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-9 cursor-pointer place-items-center rounded-md text-slate transition-colors hover:bg-ink/5 hover:text-ink"><MoreHorizontal size={18} /></button>
      {open && <div role="menu" className="sub-fade absolute right-0 top-10 z-30 w-52 rounded-lg border border-line bg-white p-1 shadow-xl">
        {items.map((i) => <button key={i.label} role="menuitem" onClick={i.run} className={`block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm hover:bg-cloud ${i.danger ? 'text-err' : 'text-ink'}`}>{i.label}</button>)}
      </div>}
    </div>
  )
}

function Meter({ label, pct, used }: { label: string; pct: number | null; used: string }) {
  return (
    <div className="min-w-[84px]">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]"><span className="text-slate">{label}</span><span className="num font-semibold">{pct === null ? used : `${pct}%`}</span></div>
      <Bar pct={pct ?? 0} tone={toneFor(pct)} h="h-1" label={`${label} usage`} />
    </div>
  )
}

function Kpi({ label, children, sub, spark, accent }: { label: string; children: React.ReactNode; sub?: React.ReactNode; spark?: number[]; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-midnight bg-midnight text-white' : 'border-line bg-white'}`}>
      <div className={`text-xs font-medium ${accent ? 'text-white/70' : 'text-slate'}`}>{label}</div>
      <div className="mt-1.5 flex items-end justify-between gap-2"><div className="font-display text-[26px] font-semibold leading-none">{children}</div>{spark && <Spark values={spark} color={accent ? '#35d0ba' : '#087e8b'} />}</div>
      {sub && <div className={`mt-2 text-xs ${accent ? 'text-white/70' : 'text-slate'}`}>{sub}</div>}
    </div>
  )
}
function Tile({ label, value, sub, tone, onClick }: { label: string; value: number; sub?: string; tone?: 'red' | 'amber'; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="cursor-pointer rounded-lg border border-line bg-white p-3 text-left transition-all hover:-translate-y-px hover:border-teal/40 hover:shadow-md">
      <div className="text-[11px] font-medium text-slate">{label}</div>
      <div className={`num mt-1 font-display text-2xl font-semibold leading-none ${value > 0 && tone === 'red' ? 'text-err' : value > 0 && tone === 'amber' ? 'text-[#9a6200]' : ''}`}><CountUp value={value} /></div>
      {sub && <div className="mt-1 truncate text-[11px] text-slate">{sub}</div>}
    </button>
  )
}

const PIE = ['#087e8b', '#35d0ba', '#2878d8', '#f59e0b', '#8b6fd6', '#60777d']
const ttStyle = { borderRadius: 8, border: '1px solid #d8e2e3', fontSize: 12, boxShadow: '0 8px 24px rgba(11,37,48,.12)' }

export function SubscriptionsList() {
  const s = useBilling(); const { can } = useAdmin(); const toast = useToast(); const tickets = useTickets(); const reduced = useReducedMotion(); const on = useMounted()
  const [f, setF] = useState<Filters>(NONE); const [sort, setSort] = useState<{ k: SortKey; d: 1 | -1 }>({ k: 'mrr', d: -1 }); const [page, setPage] = useState(0)
  const [views, setViews] = useState(loadViews); const [vOpen, setVOpen] = useState(false); const [vName, setVName] = useState('')
  const vRef = useDismiss(vOpen, () => setVOpen(false))
  const set = (p: Partial<Filters>) => { setF((x) => ({ ...x, ...p })); setPage(0) }
  const rows = useMemo(() => rowInsights(s, tickets), [s, tickets])
  const pf = useMemo(() => portfolio(s, rows), [s, rows])
  const cur = pf.currency; const fm = (n: number) => money(Math.round(n), cur, { trim: true, s })
  const shown = useMemo(() => {
    const q = f.q.trim().toLowerCase()
    const list = rows.filter((r) => (f.tab === 'all' || tabOf(r.sub.status) === f.tab) && (!f.plan || (f.plan === 'custom' ? !!r.sub.customFeatures : r.sub.planId === f.plan && !r.sub.customFeatures)) && (!f.cycle || r.sub.cycle === f.cycle) && (!f.currency || r.sub.currency === f.currency) && (!f.status || r.sub.status === f.status) && (!f.health || r.health.band === f.health) && (!q || `${r.sub.company} ${r.plan?.name ?? ''}`.toLowerCase().includes(q)))
    const val = (r: RowInsight): string | number => ({ company: r.sub.company.toLowerCase(), plan: (r.sub.customFeatures ? 'custom' : r.plan?.name ?? '').toLowerCase(), status: r.sub.status, health: r.health.score, seats: r.seatPct ?? -1, mrr: r.mrr, renews: r.days })[sort.k]
    return [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.d })
  }, [rows, f, sort])
  const PAGE = 10; const pages = Math.max(1, Math.ceil(shown.length / PAGE)); const cp = Math.min(page, pages - 1); const view = shown.slice(cp * PAGE, cp * PAGE + PAGE)
  const filtered = JSON.stringify(f) !== JSON.stringify(NONE)
  const th = (k: SortKey, label: string, right = false) => (
    <th scope="col" aria-sort={sort.k === k ? (sort.d === 1 ? 'ascending' : 'descending') : 'none'} className={`px-3 py-2.5 font-semibold ${right ? 'text-right' : 'text-left'}`}>
      <button onClick={() => setSort((x) => (x.k === k ? { k, d: (x.d * -1) as 1 | -1 } : { k, d: k === 'company' || k === 'plan' || k === 'renews' ? 1 : -1 }))} className={`inline-flex cursor-pointer items-center gap-1 ${right ? 'flex-row-reverse' : ''} hover:text-ink`}>{label}{sort.k === k ? (sort.d === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} className="opacity-40" />}</button>
    </th>
  )
  const exportCsv = () => {
    const head = ['Company', 'Plan', 'Status', 'Cycle', 'Currency', 'Employees', 'Seat use %', 'Storage use %', 'Signature use %', 'MRR', 'Contract value', 'Health score', 'Health', 'Renews', 'Days to renewal']
    const body = shown.map((r) => [r.sub.company, r.sub.customFeatures ? 'Custom contract' : r.plan?.name ?? '', STATUS_META[r.sub.status].label, r.sub.cycle, r.sub.currency, r.sub.employees, r.seatPct ?? 'Unlimited', r.storagePct ?? 'Unlimited', r.signPct ?? 'Unlimited', Math.round(r.mrr), r.sub.net, r.health.score, r.health.label, r.sub.renewsAt, r.days])
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[head, ...body].map((r) => r.map(safeCell).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'bizflow-subscriptions.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    toast(`${shown.length} subscription${shown.length === 1 ? '' : 's'} exported as CSV`)
  }
  const saveView = () => { const name = vName.trim(); if (!name) return; const next = [...views.filter((v) => v.name !== name), { name, f }]; setViews(next); try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)) } catch { /* ignore */ } setVName(''); toast(`View "${name}" saved.`) }
  const delView = (name: string) => { const next = views.filter((v) => v.name !== name); setViews(next); try { localStorage.setItem(VIEWS_KEY, JSON.stringify(next)) } catch { /* ignore */ } }
  const plans = [...s.plans.map((p) => [p.id, p.name] as const), ['custom', 'Custom contract'] as const]
  const currencies = [...new Set(s.subs.map((x) => x.currency))]
  const sel = 'h-9 rounded-md border border-line bg-white px-2.5 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20'
  const trend = pf.history.map((h) => h.mrr); const modelled = rows.length > 0
  const hasMix = pf.planMix.some((m) => m.mrr > 0)

  return (
    <Gate perm="view">
      <PageHeader eyebrow="Billing & Pricing" title="Subscriptions" desc="Revenue, renewal and health across every company subscription." actions={<>
        <Btn v="secondary" onClick={exportCsv} disabled={!shown.length}><Download size={15} className="mr-1.5" />Export CSV</Btn>
        {can('subscriptions') && <Btn to="/admin/billing/subscriptions/custom">New custom subscription</Btn>}
      </>} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi accent label={`Monthly recurring revenue · ${cur}`} spark={trend} sub={<>{pf.mrrDelta !== null ? <b className={pf.mrrDelta >= 0 ? 'text-mint' : 'text-red-300'}>{pf.mrrDelta >= 0 ? '▲' : '▼'} {Math.abs(pf.mrrDelta).toFixed(1)}%</b> : <span>Paying subscriptions</span>} {pf.mrrDelta !== null && 'vs last month'}</>}><CountUp value={pf.mrr} format={fm} /></Kpi>
        <Kpi label="Annual run rate (ARR)" sub="MRR × 12"><CountUp value={pf.arr} format={fm} /></Kpi>
        <Kpi label="Net revenue retention · 6 mo" sub={pf.nrr === null ? 'Needs a paying cohort 6 months old' : pf.nrr >= 100 ? 'Expansion outweighs churn' : 'Churn outweighs expansion'}>{pf.nrr === null ? '—' : <CountUp value={pf.nrr} format={(n) => `${n.toFixed(0)}%`} />}</Kpi>
        <Kpi label="Avg revenue per company" sub="per month, paying only">{pf.arpa === null ? '—' : <CountUp value={pf.arpa} format={fm} />}</Kpi>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Tile label="Active" value={pf.counts.active} sub={`of ${pf.counts.all} total`} onClick={() => set({ tab: 'active' })} />
        <Tile label="On trial" value={pf.counts.trial} sub="in pipeline" onClick={() => set({ tab: 'trial' })} />
        <Tile label="Past due" value={pf.counts.past_due} sub="payment trouble" tone="amber" onClick={() => set({ tab: 'past_due' })} />
        <Tile label="Suspended" value={pf.counts.suspended} sub="no access" tone="red" onClick={() => set({ tab: 'suspended' })} />
        <Tile label="Trials converting" value={pf.trialsConverting} sub="ending this month" />
        <Tile label="Renewals ≤ 30 days" value={pf.renewals30} sub={pf.renewals30 ? fm(pf.renewals30Value) : 'none due'} tone="amber" />
        <Tile label="At risk" value={pf.atRisk} sub={pf.atRisk ? `${fm(pf.atRiskValue)}/mo exposed` : 'all healthy'} tone="red" onClick={() => set({ health: 'risk' })} />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Panel title="MRR trend · 12 months" action={modelled ? <span className="text-[11px] text-slate" title="The store holds today's contract only; earlier months are modelled from start date and contract value.">history modelled</span> : undefined}>
          <div className="h-40" aria-label="MRR trend chart" role="img">
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={pf.history} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
              <defs><linearGradient id="mrrg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#087e8b" stopOpacity={0.3} /><stop offset="100%" stopColor="#087e8b" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#60777d' }} interval={1} />
              <YAxis hide domain={[0, 'dataMax']} />
              <Tooltip contentStyle={ttStyle} formatter={(v) => [fm(Number(v)), 'MRR']} />
              <Area type="monotone" dataKey="mrr" stroke="#087e8b" strokeWidth={2} fill="url(#mrrg)" isAnimationActive={!reduced} animationDuration={900} />
            </AreaChart></ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="MRR movement">
          <div className="h-40" aria-label="MRR movement chart" role="img">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={pf.history} stackOffset="sign" margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#60777d' }} interval={1} />
              <YAxis hide />
              <Tooltip contentStyle={ttStyle} cursor={{ fill: 'rgba(8,126,139,.06)' }} formatter={(v, n) => [fm(Number(v)), String(n)]} />
              <RBar dataKey="newMrr" name="New" stackId="m" fill="#087e8b" isAnimationActive={!reduced} />
              <RBar dataKey="expansion" name="Expansion" stackId="m" fill="#35d0ba" isAnimationActive={!reduced} />
              <RBar dataKey="contraction" name="Contraction" stackId="m" fill="#f59e0b" isAnimationActive={!reduced} />
              <RBar dataKey="churn" name="Churn" stackId="m" fill="#dc3e42" radius={[0, 0, 3, 3]} isAnimationActive={!reduced} />
            </BarChart></ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate">{[['New', '#087e8b'], ['Expansion', '#35d0ba'], ['Contraction', '#f59e0b'], ['Churn', '#dc3e42']].map(([n, c]) => <span key={n} className="inline-flex items-center gap-1"><i className="size-2 rounded-sm" style={{ background: c }} />{n}</span>)}</div>
        </Panel>
        <Panel title="Plan mix">
          <div className="flex items-center gap-4">
            <div className="relative size-32 shrink-0" role="img" aria-label="Plan mix by recurring revenue">
              <ResponsiveContainer width="100%" height="100%"><PieChart>
                <Pie data={pf.planMix.length ? pf.planMix.map((m) => ({ ...m, v: hasMix ? m.mrr : m.count })) : [{ name: 'None', v: 1 }]} dataKey="v" innerRadius={38} outerRadius={58} paddingAngle={pf.planMix.length > 1 ? 3 : 0} stroke="none" isAnimationActive={!reduced} animationDuration={900}>
                  {(pf.planMix.length ? pf.planMix : [{ id: 'x' }]).map((m, i) => <Cell key={m.id} fill={pf.planMix.length ? PIE[i % PIE.length] : '#e4ebec'} />)}
                </Pie>
              </PieChart></ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center leading-tight"><div><div className="num font-display text-xl font-semibold">{pf.counts.all - pf.counts.ended}</div><div className="text-[10px] text-slate">live</div></div></div>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
              {pf.planMix.map((m, i) => <li key={m.id} className="flex items-center justify-between gap-2"><span className="inline-flex min-w-0 items-center gap-2"><i className="size-2.5 shrink-0 rounded-sm" style={{ background: PIE[i % PIE.length] }} /><span className="truncate">{m.name}</span></span><span className="num text-xs text-slate">{hasMix && pf.mrr ? `${Math.round((m.mrr / pf.mrr) * 100)}%` : m.count}</span></li>)}
              {!pf.planMix.length && <li className="text-slate">No live subscriptions.</li>}
            </ul>
          </div>
        </Panel>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Status" className="inline-flex flex-wrap gap-1 rounded-lg bg-ink/5 p-1">
          {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={f.tab === k} onClick={() => set({ tab: k })} className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold transition-all ${f.tab === k ? 'bg-white text-ink shadow-sm' : 'text-slate hover:text-ink'}`}>{label}<span className={`num ml-1.5 rounded-full px-1.5 text-[11px] ${f.tab === k ? 'bg-softmint text-teal-600' : 'bg-ink/5'}`}>{pf.counts[k]}</span></button>)}
        </div>
        <div ref={vRef} className="relative ml-auto">
          <Btn v="secondary" s="sm" onClick={() => setVOpen(!vOpen)} aria-expanded={vOpen} aria-haspopup="menu"><Star size={14} className="mr-1.5" />Saved views</Btn>
          {vOpen && <div role="menu" className="sub-fade absolute right-0 top-10 z-30 w-64 rounded-lg border border-line bg-white p-2 shadow-xl">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate">Built in</div>
            {BUILTIN.map((v) => <button key={v.name} role="menuitem" onClick={() => { setF({ ...NONE, ...v.f }); setPage(0); setVOpen(false) }} className="block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-cloud">{v.name}</button>)}
            {views.length > 0 && <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate">Yours</div>}
            {views.map((v) => <div key={v.name} className="flex items-center rounded-md hover:bg-cloud"><button role="menuitem" onClick={() => { setF({ ...NONE, ...v.f }); setPage(0); setVOpen(false) }} className="min-w-0 flex-1 cursor-pointer truncate px-2 py-1.5 text-left text-sm">{v.name}</button><button aria-label={`Delete view ${v.name}`} onClick={() => delView(v.name)} className="grid size-7 cursor-pointer place-items-center text-slate hover:text-err"><X size={14} /></button></div>)}
            <div className="mt-2 flex gap-1.5 border-t border-line pt-2"><input aria-label="View name" placeholder="Name this view" value={vName} maxLength={40} onChange={(e) => setVName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveView()} className="h-8 min-w-0 flex-1 rounded-md border border-line px-2 text-sm focus:border-teal focus:outline-none" /><Btn s="sm" disabled={!vName.trim()} onClick={saveView}>Save</Btn></div>
          </div>}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate" /><input aria-label="Search companies" placeholder="Search company or plan" value={f.q} onChange={(e) => set({ q: e.target.value })} className={`${inputCls} h-9 pl-9`} /></div>
        <select aria-label="Filter by plan" className={sel} value={f.plan} onChange={(e) => set({ plan: e.target.value })}><option value="">All plans</option>{plans.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select aria-label="Filter by billing cycle" className={sel} value={f.cycle} onChange={(e) => set({ cycle: e.target.value })}><option value="">Any cycle</option><option value="monthly">Monthly</option><option value="annual">Annual</option></select>
        <select aria-label="Filter by currency" className={sel} value={f.currency} onChange={(e) => set({ currency: e.target.value })}><option value="">Any currency</option>{currencies.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Filter by status" className={sel} value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">Any status</option>{(Object.keys(STATUS_META) as SubStatus[]).map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}</select>
        <select aria-label="Filter by health" className={sel} value={f.health} onChange={(e) => set({ health: e.target.value })}><option value="">Any health</option>{(Object.keys(HEALTH_META) as HealthBand[]).map((k) => <option key={k} value={k}>{HEALTH_META[k].label}</option>)}</select>
        {filtered && <button onClick={() => { setF(NONE); setPage(0) }} className="cursor-pointer text-sm font-semibold text-teal">Clear filters</button>}
      </div>

      <Fade k={`${f.tab}|${f.plan}|${f.health}|${sort.k}${sort.d}|${cp}`}>
        <Panel pad={false}>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-sm">
              <caption className="sr-only">Subscriptions</caption>
              <thead className="border-b border-line bg-cloud/60 text-xs text-slate"><tr>{th('company', 'Company')}{th('plan', 'Plan')}{th('status', 'Status')}{th('health', 'Health')}{th('seats', 'Usage')}{th('mrr', 'MRR', true)}{th('renews', 'Renewal')}<th scope="col" className="w-12"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-line/70">
                {view.map((r) => (
                  <tr key={r.sub.id} className="transition-colors hover:bg-softmint/30">
                    <td className="px-3 py-3"><Link to={`/admin/billing/subscriptions/${r.sub.id}`} className="font-semibold hover:text-teal">{r.sub.company}</Link><div className="num text-xs text-slate">{r.sub.employees.toLocaleString()} employees · {r.sub.cycle} · {r.sub.currency}</div></td>
                    <td className="px-3 py-3">{r.sub.customFeatures ? <Badge tone="teal">Custom contract</Badge> : r.plan?.name ?? '—'}{r.sub.pendingChange && <div className="text-[11px] text-slate">→ {s.plans.find((p) => p.id === r.sub.pendingChange!.planId)?.name} on renewal</div>}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.sub.status} /></td>
                    <td className="px-3 py-3"><HealthPill score={r.health.score} band={r.health.band} /></td>
                    <td className="px-3 py-3"><div className="grid grid-cols-3 gap-3"><Meter label="Seats" pct={r.seatPct} used={r.sub.employees.toLocaleString()} /><Meter label="Storage" pct={r.storagePct} used={`${r.sub.usage.storageGb} GB`} /><Meter label="Sign" pct={r.signPct} used={r.sub.usage.signatures.toLocaleString()} /></div></td>
                    <td className="num px-3 py-3 text-right"><div className="font-semibold">{r.mrr ? money(Math.round(r.mrr), r.sub.currency, { trim: true, s }) : '—'}</div><div className="text-xs text-slate">{money(r.sub.net, r.sub.currency, { trim: true, s })}/{r.sub.cycle === 'annual' ? 'yr' : 'mo'}</div></td>
                    <td className="px-3 py-3"><RenewChip days={r.days} status={r.sub.status} /><div className="mt-1 text-xs text-slate">{fmtDate(r.sub.status === 'trial' && r.sub.trialEndsAt ? r.sub.trialEndsAt : r.sub.renewsAt)}</div></td>
                    <td className="px-2 py-3 text-right"><RowMenu r={r} canManage={can('subscriptions')} canPay={can('payments')} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {view.map((r) => (
              <li key={r.sub.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><Link to={`/admin/billing/subscriptions/${r.sub.id}`} className="font-semibold">{r.sub.company}</Link><div className="text-xs text-slate">{r.sub.customFeatures ? 'Custom contract' : r.plan?.name} · {r.sub.cycle} · {r.sub.employees.toLocaleString()} employees</div></div><RowMenu r={r} canManage={can('subscriptions')} canPay={can('payments')} /></div>
                <div className="flex flex-wrap items-center gap-2"><StatusBadge status={r.sub.status} /><HealthPill score={r.health.score} band={r.health.band} /><RenewChip days={r.days} status={r.sub.status} /></div>
                <div className="grid grid-cols-3 gap-3"><Meter label="Seats" pct={r.seatPct} used={r.sub.employees.toLocaleString()} /><Meter label="Storage" pct={r.storagePct} used={`${r.sub.usage.storageGb} GB`} /><Meter label="Sign" pct={r.signPct} used={r.sub.usage.signatures.toLocaleString()} /></div>
                <div className="num flex justify-between text-sm"><span className="text-slate">MRR</span><b>{r.mrr ? money(Math.round(r.mrr), r.sub.currency, { trim: true, s }) : '—'}</b></div>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <div className="px-6 py-12 text-center"><p className="font-semibold">No subscriptions match</p><p className="mt-1 text-sm text-slate">Adjust or clear the filters to see more.</p></div>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-slate">
            <span>{shown.length} of {rows.length} subscription{rows.length === 1 ? '' : 's'}{pf.otherCurrency > 0 && ` · ${pf.otherCurrency} in other currencies excluded from ${cur} totals`}</span>
            {pages > 1 && <span className="flex items-center gap-2"><Btn s="sm" v="secondary" disabled={cp === 0} onClick={() => setPage(cp - 1)}>Previous</Btn>Page {cp + 1} of {pages}<Btn s="sm" v="secondary" disabled={cp >= pages - 1} onClick={() => setPage(cp + 1)}>Next</Btn></span>}
          </div>
        </Panel>
      </Fade>
      <p className="mt-3 text-xs text-slate" aria-hidden={on ? undefined : true}>Health blends payment standing, seat use, module adoption, support load and renewal outlook. Revenue figures come from the billing store; module activity and pre-store MRR history are modelled.</p>
    </Gate>
  )
}

