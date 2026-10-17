import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Building2, ExternalLink } from 'lucide-react'
import { Badge, Breadcrumb, Btn, EmptyState, ExportButton, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, Timeline, useToast } from '../../components/ui'
import { MODULE_LIST, AUDIT_CATEGORIES, categoryOf, endSupport, host, requestSupport, setModule, setStatus, useAudit, useSupport, useTenant, useTenants } from '../../tenant/store'
import type { AuditEntry, TStatus, Tenant } from '../../tenant/store'
import { ngn } from '../../data/demo'
import { GROWTH } from '../../data/platform'
import { CHART, RangeToggle, TrendChart } from '../../components/charts'
import { useAdmin } from './AdminLayout'
import { PLAN_LIMITS, healthOf } from '../../platform/health'
import { FactorBars, HealthExplainerButton, ScoreGauge } from './HealthExplainer'
import { useChanges } from '../../platform/changes'
import TaskBoard from '../../tasks/TaskBoard'
import { ADMIN_ROLES } from './AdminLayout'
import { getCompanyPolicies, resolveCompanyPolicy, saveCompanyPolicies } from './roles'
import type { CompanyPolicy } from './roles'
import { closeBreakGlass, decideBreakGlass, requestBreakGlass, useBreakGlass } from '../../security/breakglass'

const PRICE: Record<string, number> = { Starter: 2500, Professional: 4200, Enterprise: 6800 }
const mrr = (t: Tenant) => (isOn(t) ? PRICE[t.plan] * t.employees : 0)
const TONE: Record<TStatus, string> = { Active: 'green', Trial: 'blue', Suspended: 'red', 'Pending Setup': 'amber', 'Renewal Due': 'amber', 'Grace Period': 'amber', Expired: 'gray' }
const when = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
const lastAct = (t: Tenant) => (t.status === 'Suspended' ? '12 Sep 2026' : t.status === 'Pending Setup' ? 'Never' : ['Today, 09:14', 'Today, 08:02', 'Yesterday', '2 days ago'][t.employees % 4])
const SUBSTATUS: Record<TStatus, string> = { Active: 'Paid', Trial: 'Trial · 14 days', Suspended: 'Overdue', 'Pending Setup': 'Awaiting payment', 'Renewal Due': 'Renewal due', 'Grace Period': 'Payment failed · grace', Expired: 'Expired' }
const LIFE: TStatus[] = ['Trial', 'Active', 'Renewal Due', 'Grace Period', 'Suspended']
const isOn = (t: Tenant) => t.status === 'Active' || t.status === 'Renewal Due' || t.status === 'Grace Period'
const isOff = (t: Tenant) => t.status === 'Suspended' || t.status === 'Pending Setup' || t.status === 'Expired'

export function Businesses() {
  const ts = Object.values(useTenants())
  const nav = useNavigate()
  const { can, role } = useAdmin()
  const toast = useToast()
  const allAudit = useAudit()
  const [sp, setSp] = useSearchParams()
  const status = sp.get('status') ?? 'All'
  const [range, setRange] = useState('12M')
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<Tenant | null>(null)
  const [confirm, setConfirm] = useState<{ t: Tenant; to: Tenant['status'] } | null>(null)
  const rows = ts.filter((t) => (status === 'All' || t.status === status || (status === 'Active' && isOn(t))) && (t.profile.name + t.slug).toLowerCase().includes(q.toLowerCase()))
  const growth = GROWTH.slice(-(range === '3M' ? 3 : range === '6M' ? 6 : 12))
  const first = growth[0]
  const latest = growth[growth.length - 1]
  const netGrowth = latest.businesses - first.businesses
  const open = (t: Tenant, to = '') => nav(`/admin/businesses/${t.slug}${to}`)
  return (
    <div>
      <PageHeader eyebrow="Businesses" title={status === 'All' ? 'All businesses' : `${status} businesses`} desc="Companies using BizFlow. Opening a business here shows platform controls only; their staff data stays inside their own workspace." actions={<ExportButton name="businesses" head={['Company', 'Workspace', 'Plan', 'Employees', 'Status']} rows={rows.map((t) => [t.profile.name, host(t.slug), t.plan, String(t.employees), t.status])} />} />
      <div className="mb-5 grid grid-cols-2 divide-x divide-line rounded-lg border border-line bg-white sm:grid-cols-4">
        {[['Businesses', ts.length], ['Paying', ts.filter(isOn).length], ['On trial', ts.filter((t) => t.status === 'Trial').length], ['Needs action', ts.filter((t) => ['Suspended', 'Pending Setup', 'Grace Period', 'Renewal Due'].includes(t.status)).length]].map(([l, v]) => <div key={l} className="px-5 py-3.5"><div className="text-xs font-medium text-slate">{l}</div><div className="num font-display text-2xl font-semibold">{v}</div></div>)}
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Business growth" action={<RangeToggle value={range} onChange={setRange} />}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div><div className="text-xs font-medium text-slate">Total businesses on BizFlow</div><div className="num mt-1 font-display text-2xl font-semibold">{latest.businesses}</div></div>
            <Badge tone="green">+{netGrowth} net growth</Badge>
          </div>
          <TrendChart data={growth} series={[{ key: 'businesses', label: 'Total businesses' }]} label={`Total businesses on BizFlow over the last ${range}`} height={230} />
        </Panel>
        <Panel title="New vs churned" action={<span className="text-xs text-slate">All companies · {range}</span>}>
          <div className="mb-4 flex gap-6 text-sm">
            <span><b className="num text-ink">{growth.reduce((sum, item) => sum + item.new, 0)}</b><span className="ml-1.5 text-slate">new</span></span>
            <span><b className="num text-ink">{growth.reduce((sum, item) => sum + item.churned, 0)}</b><span className="ml-1.5 text-slate">churned</span></span>
          </div>
          <TrendChart data={growth} series={[{ key: 'new', label: 'New' }, { key: 'churned', label: 'Churned', color: CHART.red }]} label={`New and churned businesses over the last ${range}`} height={230} />
        </Panel>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {['All', 'Active', 'Trial', 'Pending Setup', 'Suspended', 'Expired'].map((s) => <button key={s} aria-pressed={status === s} onClick={() => setSp(s === 'All' ? {} : { status: s })} className={`h-8 cursor-pointer rounded-full border px-3 text-[13px] font-semibold ${status === s ? 'border-teal bg-teal text-white' : 'border-line bg-white text-slate hover:text-ink'}`}>{s}</button>)}
        <input aria-label="Search businesses" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company or workspace" className="ml-auto h-9 w-full rounded-md border border-line bg-white px-3 text-sm sm:w-64" />
      </div>
      {rows.length === 0 ? <div className="rounded-lg border border-line bg-white"><EmptyState title="No businesses match" body="Try another status or clear the search." /></div> : (
        <Table label="Businesses" pageSize={10} right={[3]} head={['Company', 'Workspace', 'Plan', 'Employees', 'Subscription', 'Date joined', 'Last activity', 'Health', 'Status', 'Actions']}
          rows={rows.map((t) => [
            <button key="c" onClick={() => open(t)} className="cursor-pointer text-left font-semibold hover:text-teal">{t.profile.name}</button>,
            <code key="w" className="font-mono text-[12px]">{host(t.slug)}</code>, t.plan, String(t.employees), <span key="sb" className="whitespace-nowrap">{SUBSTATUS[t.status]}</span>, <span key="d" className="whitespace-nowrap">{when(t.created)}</span>, <span key="l" className="whitespace-nowrap">{lastAct(t)}</span>,
            (() => { const h = healthOf(t, allAudit); return <Badge key="h" tone={h.tone}>{`${h.score} · ${h.label}`}</Badge> })(),
            <Badge key="s" tone={TONE[t.status]}>{t.status}</Badge>,
            <div key="a" className="flex gap-1.5">
              <Btn s="sm" v="secondary" onClick={() => open(t)}>View</Btn>
              <Btn s="sm" v="secondary" onClick={() => setMenu(t)} aria-label={`Manage ${t.profile.name}`}>Manage</Btn>
            </div>,
          ])} />
      )}
      <Overlay open={!!menu} onClose={() => setMenu(null)} title={menu ? `Manage ${menu.profile.name}` : ''}>
        {menu && (
          <div className="grid gap-2">
            <Btn v="secondary" onClick={() => open(menu, '?tab=Modules')}>Modules and plan</Btn>
            {(can('payments') || can('pricing')) && <Btn v="secondary" onClick={() => open(menu, '?tab=Billing')}>Billing</Btn>}
            {(role === 'super' || role === 'support' || role === 'billing') && <Btn v="secondary" onClick={() => open(menu, '?tab=Support')}>Support access</Btn>}
            {can('plans') && (isOff(menu) ? <Btn v="secondary" onClick={() => { setConfirm({ t: menu, to: 'Active' }); setMenu(null) }}>Activate</Btn> : <Btn v="secondary" onClick={() => { setConfirm({ t: menu, to: 'Suspended' }); setMenu(null) }}>Suspend</Btn>)}
          </div>
        )}
      </Overlay>
      <Overlay open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.to === 'Suspended' ? 'Suspend this business?' : 'Activate this business?'} alert>
        <p className="text-sm text-slate">{confirm?.to === 'Suspended' ? `${confirm?.t.profile.name} staff will be signed out and unable to use ${confirm && host(confirm.t.slug)} until reactivated. Data is kept.` : `${confirm?.t.profile.name} will regain full access to their workspace.`}</p>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setConfirm(null)}>Cancel</Btn><Btn onClick={() => { if (confirm) { setStatus(confirm.t.slug, confirm.to); toast(`${confirm.t.profile.name} is now ${confirm.to}`) } setConfirm(null) }}>{confirm?.to === 'Suspended' ? 'Suspend business' : 'Activate business'}</Btn></div>
      </Overlay>
    </div>
  )
}

export function AuditTable({ rows }: { rows: AuditEntry[] }) {
  const [f, setF] = useState('All')
  const [cat, setCat] = useState('All')
  const [ten, setTen] = useState('All')
  const [who, setWho] = useState('All')
  const [res, setRes] = useState('All')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const toast = useToast()
  const day = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const catOf = (r: AuditEntry) => r.category ?? categoryOf(r.action)
  const tenants = ['All', ...Array.from(new Set(rows.map((r) => r.tenant))).sort()]
  const actors = ['All', ...Array.from(new Set(rows.map((r) => r.actor))).sort()]
  const list = rows.filter((r) => (f === 'All' || r.scope === f) && (cat === 'All' || catOf(r) === cat) && (ten === 'All' || r.tenant === ten) && (who === 'All' || r.actor === who)
    && (res === 'All' || (r.result ?? 'Success') === res) && (!from || day(r.at) >= from) && (!to || day(r.at) <= to)
    && (!q.trim() || `${r.action} ${r.ref ?? ''} ${r.from ?? ''} ${r.to ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  const alerts = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000
    const m = new Map<string, number>()
    rows.forEach((r) => { if (r.result === 'Failed' && catOf(r) === 'Security' && Date.parse(r.at) >= cutoff) m.set(r.tenant, (m.get(r.tenant) ?? 0) + 1) })
    return [...m.entries()].filter(([, n]) => n >= 3)
  }, [rows]) // eslint-disable-line
  const stamp = (iso: string) => new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const exportCsv = () => {
    const head = ['When', 'Type', 'Tenant', 'User', 'Role', 'Category', 'Action', 'Ref', 'Previous', 'New', 'Result', 'Device']
    const csv = [head, ...list.map((r) => [stamp(r.at), r.scope, r.tenant, r.actor, r.role, catOf(r), r.action, r.ref ?? '', r.from ?? '', r.to ?? '', r.result ?? 'Success', r.device])].map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'bizflow-platform-audit.csv'
    a.click()
    toast(`${list.length} audit events exported`)
  }
  return (
    <div>
      <div role="status" className={`mb-3 rounded-lg border px-4 py-2.5 text-[13px] ${alerts.length ? 'border-err/40 bg-red-50 text-red-900' : 'border-line bg-white text-slate'}`}>
        <b className={alerts.length ? '' : 'text-ink'}>Security alerts</b>{' '}
        {alerts.length ? alerts.map(([t, n]) => <span key={t} className="mr-3">{n} failed sign-ins for <code className="font-mono">{t}</code> in the last 24h</span>) : 'No tenant has 3 or more failed sign-ins in the last 24 hours.'}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">{['All', 'Platform', 'Business'].map((x) => <button key={x} aria-pressed={f === x} onClick={() => setF(x)} className={`h-8 cursor-pointer rounded-full border px-3 text-[13px] font-semibold ${f === x ? 'border-teal bg-teal text-white' : 'border-line bg-white text-slate'}`}>{x === 'All' ? 'All actions' : `${x} actions`}</button>)}</div>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="From date"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To date"><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Category"><select className={inputCls} value={cat} onChange={(e) => setCat(e.target.value)}>{['All', ...AUDIT_CATEGORIES].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Result"><select className={inputCls} value={res} onChange={(e) => setRes(e.target.value)}>{['All', 'Success', 'Failed'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Tenant"><select className={inputCls} value={ten} onChange={(e) => setTen(e.target.value)}>{tenants.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Actor"><select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}>{actors.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <div className="col-span-2"><Field label="Search action or reference"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></Field></div>
      </div>
      <div className="mb-3 flex items-center justify-between text-[13px] text-slate"><span>{list.length} of {rows.length} events</span><Btn s="sm" v="secondary" onClick={exportCsv}>Export CSV</Btn></div>
      {list.length === 0 ? <div className="rounded-lg border border-line bg-white"><EmptyState title="No activity yet" body="Actions will appear here as they happen, or widen the filters." /></div> : (
        <Table label="Audit log" head={['When', 'Type', 'Tenant', 'User', 'Category', 'Action', 'Ref', 'Previous', 'New', 'Result', 'Device']} rows={list.map((r) => [
          <span key="w" className="whitespace-nowrap">{stamp(r.at)}</span>,
          <Badge key="t" tone={r.scope === 'Platform' ? 'blue' : 'teal'}>{r.scope}</Badge>, <code key="x" className="font-mono text-xs">{r.tenant}</code>, `${r.actor} (${r.role})`, catOf(r), r.action, r.ref ?? '—', r.from ?? '—', r.to ?? '—',
          <Badge key="r" tone={(r.result ?? 'Success') === 'Failed' ? 'red' : 'green'}>{r.result ?? 'Success'}</Badge>, r.device])} />
      )}
    </div>
  )
}

const TABS = [
  ['Overview', 'businesses'],
  ['Platform settings', 'settings'],
  ['Subscription', 'view'],
  ['Modules', 'plans'],
  ['Billing', 'payments'],
  ['Support', 'support'],
  ['Tasks', 'tasks'],
  ['Audit Logs', 'audit'],
] as const

const POLICY_ROWS: [keyof CompanyPolicy, string, string][] = [
  ['requireMfa', 'Multi-factor authentication', 'Require MFA for privileged company roles.'],
  ['allowBranding', 'Company branding', 'Allow company administrators to change workspace identity.'],
  ['allowEmployeeInvites', 'Employee invitations', 'Allow onboarding links to be generated by the company.'],
  ['requireSupportApproval', 'Support approval', 'Require company authorisation before support access.'],
]

function CompanyPlatformSettings({ company }: { company: Tenant }) {
  const toast = useToast()
  const [policies, setPolicies] = useState(getCompanyPolicies)
  const overrides = policies.overrides[company.slug] ?? {}
  const effective = resolveCompanyPolicy(company.slug, policies)
  const saveOverride = (key: keyof CompanyPolicy, value: CompanyPolicy[keyof CompanyPolicy] | undefined) => {
    const nextOverride = { ...overrides }
    if (value === undefined) delete nextOverride[key]
    else Object.assign(nextOverride, { [key]: value })
    const next = { ...policies, overrides: { ...policies.overrides, [company.slug]: nextOverride } }
    if (Object.keys(nextOverride).length === 0) delete next.overrides[company.slug]
    setPolicies(next)
    saveCompanyPolicies(next)
    toast(`${company.profile.name} policy updated.`)
  }
  const reset = () => {
    const next = { ...policies, overrides: { ...policies.overrides } }
    delete next.overrides[company.slug]
    setPolicies(next)
    saveCompanyPolicies(next)
    toast('Company overrides cleared.')
  }
  return (
    <div className="space-y-5">
      <Panel title="Company policy source" action={<Badge tone={Object.keys(overrides).length ? 'amber' : 'gray'}>{Object.keys(overrides).length ? `${Object.keys(overrides).length} overrides` : 'Using defaults'}</Badge>}>
        <p className="text-sm text-slate">Company-specific values take priority over the platform defaults. Choose “Inherit platform default” to keep future policy updates automatic.</p>
      </Panel>
      <Panel title="Security and workspace capabilities">
        <div className="divide-y divide-line">
          {POLICY_ROWS.map(([key, label, detail]) => <div key={key} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[1fr_auto] md:items-center"><div><div className="text-sm font-semibold">{label}</div><div className="text-xs text-slate">{detail}</div></div><div className="flex items-center gap-3"><Badge tone={effective[key] ? 'green' : 'gray'}>Effective: {effective[key] ? 'Enabled' : 'Disabled'}</Badge><select aria-label={`${label} override`} className={`${inputCls} w-52`} value={key in overrides ? String(overrides[key]) : 'inherit'} onChange={(event) => saveOverride(key, event.target.value === 'inherit' ? undefined : event.target.value === 'true')}><option value="inherit">Inherit platform default</option><option value="true">Enabled for company</option><option value="false">Disabled for company</option></select></div></div>)}
        </div>
      </Panel>
      <Panel title="Session policy">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="text-sm font-semibold">Idle session timeout</div><div className="mt-1 text-xs text-slate">Effective timeout: {effective.sessionTimeout} minutes</div></div><Field label="Company override"><select className={`${inputCls} w-52`} value={'sessionTimeout' in overrides ? String(overrides.sessionTimeout) : 'inherit'} onChange={(event) => saveOverride('sessionTimeout', event.target.value === 'inherit' ? undefined : Number(event.target.value))}><option value="inherit">Inherit platform default</option>{[15, 30, 60, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></Field></div>
      </Panel>
      {Object.keys(overrides).length > 0 && <div className="flex justify-end"><Btn v="secondary" onClick={reset}>Reset all to platform defaults</Btn></div>}
    </div>
  )
}

function Meter({ label, used, max, unit = '', warn = true }: { label: string; used: number; max: number; unit?: string; warn?: boolean }) {
  const pct = Math.min(100, Math.round((used / max) * 100))
  return (
    <div>
      <div className="mb-1 flex justify-between text-[13px]"><span>{label}</span><span className="num font-semibold">{used}{unit} of {max}{unit}</span></div>
      <div className="h-2 rounded-full bg-ink/5" role="meter" aria-label={label} aria-valuenow={used} aria-valuemax={max}><div className={`h-2 rounded-full ${warn && pct > 90 ? 'bg-err' : warn && pct > 75 ? 'bg-warn' : 'bg-teal'}`} style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

function HealthPanel({ t, audit }: { t: Tenant; audit: AuditEntry[] }) {
  const h = healthOf(t, audit)
  const lim = PLAN_LIMITS[t.plan] ?? PLAN_LIMITS.Starter
  const open = useChanges(t.slug).filter((c) => c.status === 'Requested' || c.status === 'Recommended')
  return (
    <div className="mb-5 grid gap-5 lg:grid-cols-3">
      <Panel title="Account health" action={<Badge tone={h.tone}>{h.label}</Badge>}>
        <ScoreGauge health={h} />
        <div className="mt-4"><FactorBars health={h} /></div>
        <div className="mt-3"><HealthExplainerButton tenant={t} audit={audit} /></div>
      </Panel>
      <Panel title={`Usage against the ${t.plan} plan`}>
        <div className="space-y-4">
          <Meter label="Seats" used={t.employees} max={lim.seats} />
          <Meter label="Storage" used={Math.round(t.employees * 0.12 * 10) / 10} max={lim.storageGb} unit=" GB" />
          <Meter label="Modules on" used={t.modules.length} max={MODULE_LIST.length} warn={false} />
        </div>
        {h.seatUse > 0.9 && <p className="mt-4 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900">Seats are nearly full. This is a good moment to suggest an upgrade.</p>}
      </Panel>
      <Panel title="Suggested next steps" action={<Link to="/admin/changes" className="text-xs font-semibold text-teal hover:underline">{open.length} open change{open.length === 1 ? '' : 's'}</Link>}>
        <ul className="list-disc space-y-2 pl-4 text-[13px]">{(h.actions.length ? h.actions : ['Nothing to do. This account is on track.']).map((a) => <li key={a}>{a}</li>)}</ul>
      </Panel>
    </div>
  )
}

export function BusinessDetail() {
  const { slug = 'etranzact' } = useParams()
  const [sp, setSp] = useSearchParams()
  const t = useTenant(slug)
  const { can, actor, role } = useAdmin()
  const toast = useToast()
  const audit = useAudit(slug)
  const platformAudit = audit.filter((entry) => entry.scope === 'Platform')
  const support = useSupport()
  const [susp, setSusp] = useState(false)
  const [ask, setAsk] = useState(false)
  const [reason, setReason] = useState('Unpaid subscription')
  const [supportReason, setSupportReason] = useState('Login or authentication issue')
  const [mins, setMins] = useState('60')
  const [ticket, setTicket] = useState('BF-SUP-4821')
  const [emergency, setEmergency] = useState(false)
  const [incident, setIncident] = useState('INC-2026-')
  const [emergencyReason, setEmergencyReason] = useState('')
  const breakGlass = useBreakGlass(slug)
  if (!t) return <div className="rounded-lg border border-line bg-white"><EmptyState title="Business not found" body="It may have been removed." action={<Btn to="/admin/businesses">Back to businesses</Btn>} /></div>
  const tabs: string[] = TABS.filter(([name, permission]) => name === 'Billing' ? can('payments') || can('pricing') : can(permission)).map(([name]) => name)
  const tab = tabs.includes(sp.get('tab') ?? '') ? sp.get('tab')! : tabs[0]
  const inv = [0, 1, 2].map((i) => [`INV-${2026}-${String(t.employees * 3 + i).padStart(4, '0')}`, ['1 Oct 2026', '1 Sep 2026', '1 Aug 2026'][i], ngn(Math.round(mrr(t) * 1.075 || PRICE[t.plan] * t.employees * 1.075)), i === 0 && t.status !== 'Active' ? 'Pending' : 'Paid'])
  const events = [
    { t: '6 Oct 2026, 10:12', a: 'Subscription', x: `${t.plan} plan renewed for ${t.employees} employees` },
    { t: '2 Oct 2026, 16:40', a: 'Platform', x: 'Workspace health check completed' },
    { t: when(t.created), a: 'Platform', x: `Workspace ${host(t.slug)} created` },
  ]
  return (
    <div>
      <Breadcrumb items={[['Businesses', '/admin/businesses'], [t.profile.name]]} />
      <div className="mb-4 flex items-center gap-2 rounded-md border border-teal/30 bg-softmint px-3 py-2 text-sm"><Building2 size={15} className="text-teal" /><b>Viewing {t.profile.name}</b><code className="font-mono text-xs text-slate">{host(t.slug)}</code><span className="ml-auto text-xs text-slate">Platform view. Actions are logged.</span></div>
      <PageHeader eyebrow={host(t.slug)} title={t.profile.name} desc={`${t.profile.industry} · ${t.profile.state} · joined ${when(t.created)}`} actions={<><Badge tone={TONE[t.status]}>{t.status}</Badge>{can('support') && <Btn v="secondary" onClick={() => setAsk(true)}><ExternalLink size={14} />Request diagnostics</Btn>}</>} />
      <Tabs tabs={tabs} value={tab} onChange={(x) => setSp({ tab: x })} />
      <div className="mt-6">
        {tab === 'Overview' && (<>
          <HealthPanel t={t} audit={audit} />
          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Account metadata"><dl className="space-y-2 text-sm">{[['Workspace', host(t.slug)], ['Primary contact', 'Configured · hidden'], ['Phone', t.profile.phone ? `•••• ${t.profile.phone.slice(-4)}` : 'Not configured'], ['Size band', t.profile.size + ' employees'], ['Registration', t.profile.cac ? 'Verified' : 'Not verified']].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-slate">{k}</dt><dd className="truncate font-medium">{v}</dd></div>)}</dl></Panel>
            <Panel title="Usage"><div className="grid grid-cols-2 gap-4"><Stat label="Employees" value={String(t.employees)} /><Stat label="Modules" value={`${t.modules.length} / ${MODULE_LIST.length}`} /><Stat label="MRR" value={ngn(mrr(t))} /><Stat label="Last activity" value={lastAct(t)} /></div></Panel>
            <Panel title="Branding"><div className="flex items-center gap-2">{[t.brand.primary, t.brand.secondary, t.brand.accent].map((c) => <span key={c} title={c} className="size-8 rounded-md border border-line" style={{ background: c }} />)}</div><p className="mt-3 text-sm text-slate">{t.brand.logo ? 'Custom logo uploaded' : 'No logo uploaded yet'} · {t.brand.theme} theme</p></Panel>
          </div>
        </>)}
        {tab === 'Platform settings' && <CompanyPlatformSettings company={t} />}
        {tab === 'Subscription' && (
          <Panel title="Subscription" action={<Badge tone={TONE[t.status]}>{SUBSTATUS[t.status]}</Badge>}>
            <div className="grid gap-5 sm:grid-cols-4"><Stat label="Plan" value={t.plan} /><Stat label="Billing" value="Annual" /><Stat label="Seats" value={String(t.employees)} /><Stat label="Next renewal" value="1 Mar 2027" /></div>
            <h3 className="mt-6 text-sm font-semibold">Subscription lifecycle</h3>
            <ol className="mt-3 flex flex-wrap gap-2" aria-label="Lifecycle">
              {LIFE.map((x) => <li key={x} aria-current={x === t.status ? 'step' : undefined} className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${x === t.status ? 'border-teal bg-teal text-white' : 'border-line text-slate'}`}>{x}</li>)}
            </ol>
            <p className="mt-2 text-xs text-slate">Trial or Pending, then Active. Renewal Due leads either back to Active on payment, or through Grace Period to Suspended. A suspended workspace is Reactivated on payment.</p>
            {can('payments') ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <Btn v="secondary" onClick={() => { setStatus(t.slug, 'Renewal Due'); toast('Renewal reminder sent') }}>Mark renewal due</Btn>
                <Btn v="secondary" onClick={() => { setStatus(t.slug, 'Active', 'payment verified'); toast('Subscription marked as paid') }}>Mark as paid</Btn>
                <Btn v="secondary" onClick={() => { setStatus(t.slug, 'Grace Period', 'payment failed'); toast('Payment failure recorded. 7-day grace period started') }}>Record payment failure</Btn>
              </div>
            ) : <p className="mt-5 text-sm text-slate">Your role can view this subscription but not change payment status.</p>}
            <div className="mt-3">{can('subscriptions') && <Btn v="ghost" to="/admin/billing/subscriptions">Open in subscriptions</Btn>}</div>
          </Panel>
        )}
        {tab === 'Modules' && (
          <div className="grid gap-3 md:grid-cols-2">
            {MODULE_LIST.map((m) => { const on = t.modules.includes(m.id); return (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white p-4"><div className="min-w-0"><div className="font-semibold">{m.name}</div><div className="text-xs text-slate">{m.tier} tier</div></div>
                <button role="switch" aria-checked={on} aria-label={`${m.name} module`} disabled={!can('plans')} onClick={() => { const { added, removed } = setModule(t.slug, m.id, !on); const names = (ids: string[]) => ids.map((x) => MODULE_LIST.find((y) => y.id === x)?.name ?? x).join(', '); toast(`${m.name} ${on ? 'disabled' : 'enabled'} for ${t.profile.name}${added.length ? `. Also enabled (required): ${names(added)}` : ''}${removed.length ? `. Also disabled (depends on it): ${names(removed)}` : ''}`) }} className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-teal' : 'bg-line'}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} /></button></div>
            ) })}
          </div>
        )}
        {tab === 'Overview' && <Panel title="Recent platform lifecycle events" className="mt-5"><Timeline items={events} /></Panel>}
        {tab === 'Billing' && <Table label="Invoices" right={[2]} head={['Invoice', 'Date', 'Amount (incl. VAT)', 'Status']} rows={inv.map((r) => [r[0], r[1], r[2], <Badge key="s">{r[3]}</Badge>])} />}
        {tab === 'Support' && (
          <div className="space-y-5">
            <Panel title="Support diagnostics" action={<Btn s="sm" onClick={() => setAsk(true)}>Request diagnostics</Btn>}>
              <p className="text-sm text-slate">Support never receives company membership or operational permissions. Company-authorised sessions expose only workspace metadata, authentication diagnostics, integration health and redacted error logs.</p>
              {support?.slug === t.slug && <div className="mt-4 rounded-lg bg-cloud p-4 text-sm"><div className="flex items-center justify-between gap-3"><b>{support.status}</b><Badge tone={support.status === 'Active' ? 'green' : 'amber'}>{support.ticket}</Badge></div><p className="mt-1 text-slate">{support.reason} · requested by {support.by}</p><p className="mt-2 text-xs text-slate">Scope: {support.scopes.join(' · ')}</p>{support.status === 'Active' && <Btn s="sm" v="secondary" className="mt-3" onClick={() => endSupport()}>End diagnostic session</Btn>}</div>}
            </Panel>
            <Panel title="Emergency diagnostics" action={can('breakglass') ? <Btn s="sm" v="secondary" onClick={() => setEmergency(true)}>Request break-glass</Btn> : undefined}>
              <p className="text-sm text-slate">For severe incidents only. Requires approval by a different platform administrator, expires after 30 minutes, and still cannot access payroll, accounting, approvals, payments, documents or employee records.</p>
              {breakGlass.length > 0 && <div className="mt-4 space-y-2">{breakGlass.slice(0, 4).map((entry) => <div key={entry.id} className="rounded-lg border border-line p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><b>{entry.id}</b><Badge tone={entry.status === 'Active' ? 'red' : entry.status === 'Requested' ? 'amber' : 'gray'}>{entry.status}</Badge><span className="ml-auto text-xs text-slate">{entry.incident}</span></div><p className="mt-1 text-slate">{entry.reason}</p><div className="mt-2 flex flex-wrap gap-2">{entry.status === 'Requested' && can('breakglass') && entry.requestedBy !== actor.split(' (')[0] && <><Btn s="sm" onClick={() => { const error = decideBreakGlass(entry.id, true, actor.split(' (')[0]); toast(error ?? 'Emergency diagnostics approved for 30 minutes') }}>Approve</Btn><Btn s="sm" v="secondary" onClick={() => { decideBreakGlass(entry.id, false, actor.split(' (')[0]); toast('Request rejected') }}>Reject</Btn></>}{entry.status === 'Active' && <Btn s="sm" v="secondary" onClick={() => { closeBreakGlass(entry.id, actor.split(' (')[0]); toast('Emergency diagnostics closed') }}>Close now</Btn>}</div></div>)}</div>}
            </Panel>
            <Panel title="Support tickets"><Table label="Tickets" head={['Ticket', 'Subject', 'Priority', 'Status']} rows={[['#4821', 'Payroll PAYE schedule export', 'Normal', 'In Progress'], ['#4790', 'Add second administrator', 'Low', 'Completed']].map((r) => [r[0], r[1], r[2], <Badge key="s">{r[3]}</Badge>])} /></Panel>
          </div>
        )}
        {tab === 'Tasks' && <TaskBoard scope="Platform" tenant={t.slug} tenantOnly title={`Tasks for ${t.profile.name}`} me={actor.split(' (')[0]} people={Object.values(ADMIN_ROLES).map((r) => r.user)} canManage={role === 'super' || role === 'billing'} />}
        {tab === 'Audit Logs' && <AuditTable rows={platformAudit} />}
      </div>
      {can('plans') && (
        <div className="mt-8 flex flex-wrap gap-2 border-t border-line pt-5">
          {isOff(t) ? <Btn v="secondary" onClick={() => { setStatus(t.slug, 'Active', 'reactivated'); toast(`${t.profile.name} reactivated`) }}>Activate business</Btn> : <Btn v="secondary" onClick={() => setSusp(true)}>Suspend business</Btn>}
        </div>
      )}
      <Overlay open={susp} onClose={() => setSusp(false)} title="Suspend this business?" alert>
        <p className="text-sm text-slate">Staff at {t.profile.name} will see "Workspace Suspended" and lose operational access. Their data is retained.</p>
        <label className="mt-4 block text-sm font-semibold">Reason shown to the company<select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-normal">{['Unpaid subscription', 'Terms of use review', 'Requested by company'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setSusp(false)}>Cancel</Btn><Btn onClick={() => { setStatus(t.slug, 'Suspended', reason); setSusp(false); toast(`${t.profile.name} suspended`) }}>Suspend business</Btn></div>
      </Overlay>
      <Overlay open={ask} onClose={() => setAsk(false)} title={`Support access: ${t.profile.name}`}>
        <p className="text-sm text-slate">The company administrator ({t.profile.email}) must authorise a time-limited, read-only diagnostic session. This does not permit access to payroll, accounting, approvals, documents, employee records or company settings.</p>
        <Field label="Support ticket"><input value={ticket} onChange={(e) => setTicket(e.target.value)} className={inputCls} /></Field>
        <label className="mt-4 block text-sm font-semibold">Reason<select value={supportReason} onChange={(e) => setSupportReason(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-normal">{['Login or authentication issue', 'Integration health investigation', 'Workspace provisioning issue', 'Bug investigation'].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="mt-3 block text-sm font-semibold">Duration<select value={mins} onChange={(e) => setMins(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-sm font-normal"><option value="30">30 minutes</option><option value="60">1 hour</option><option value="240">4 hours</option></select></label>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setAsk(false)}>Cancel</Btn><Btn disabled={!ticket.trim()} onClick={() => { requestSupport(t.slug, actor.split(' (')[0], supportReason, ticket.trim(), Number(mins)); setAsk(false); toast('Diagnostic request sent to the company administrator') }}>Send authorisation request</Btn></div>
      </Overlay>
      <Overlay open={emergency} onClose={() => setEmergency(false)} title={`Break-glass request: ${t.profile.name}`} alert>
        <p className="text-sm text-slate">This creates a pending emergency-diagnostics request. It grants nothing until a different Platform Super Admin approves it.</p>
        <div className="mt-4 space-y-3"><Field label="Incident reference"><input className={inputCls} value={incident} onChange={(e) => setIncident(e.target.value)} /></Field><Field label="Why normal diagnostics are insufficient"><textarea rows={3} className={`${inputCls} h-auto py-2`} value={emergencyReason} onChange={(e) => setEmergencyReason(e.target.value)} /></Field></div>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setEmergency(false)}>Cancel</Btn><Btn disabled={!incident.trim() || !emergencyReason.trim()} onClick={() => { requestBreakGlass(t.slug, incident.trim(), emergencyReason.trim(), actor.split(' (')[0]); setEmergency(false); setEmergencyReason(''); toast('Break-glass request created. A different administrator must approve it.') }}>Request emergency diagnostics</Btn></div>
      </Overlay>
    </div>
  )
}
