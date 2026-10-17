import { useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, Building2, CreditCard, Hourglass, MessageSquare, Rocket, ShieldCheck } from 'lucide-react'
import { Avatar, Badge, Btn, ExportButton, Field, inputCls, Overlay, PageHeader, Panel, Table, Tabs, Timeline, useToast } from '../../components/ui'
import { RangeToggle, StatCard, TrendChart } from '../../components/charts'
import { useAudit, useTenants } from '../../tenant/store'
import type { Tenant } from '../../tenant/store'
import { ngn } from '../../data/demo'
import { GROWTH, SYSTEM, TICKETS } from '../../data/platform'
import { isOverdue, useTasks } from '../../tasks/store'
import TaskBoard from '../../tasks/TaskBoard'
import { TaskList } from '../../tasks/Widgets'
import { ADMIN_ROLES, PERMS, useAdmin } from './AdminLayout'
import { getCompanyPolicies, getPlatformAccess, saveCompanyPolicies, savePlatformAccess } from './roles'
import type { CompanyPolicy, Perm, PlatformAccessRole } from './roles'
import { AuditTable } from './Platform'
import { AuditAnomalies } from './Operations'
import { healthOf } from '../../platform/health'
import { HealthExplainerButton } from './HealthExplainer'
import { Overview as BillingOverview } from './Plans'

const PRICE: Record<string, number> = { Starter: 2500, Professional: 4200, Enterprise: 6800 }
const isOn = (t: Tenant) => t.status === 'Active' || t.status === 'Renewal Due' || t.status === 'Grace Period'
const mrr = (t: Tenant) => (isOn(t) ? PRICE[t.plan] * t.employees : 0)
const slice = (r: string) => (r === '3M' ? 3 : r === '6M' ? 6 : 12)
const m = (v: number) => `₦${v}m`
const STAFF = Object.values(ADMIN_ROLES).map((r) => r.user)

export function AdminTasks() {
  const { role, actor } = useAdmin()
  const me = actor.split(' (')[0]
  return <TaskBoard scope="Platform" tenant="platform" me={me} people={STAFF} canManage={role === 'super' || role === 'billing'} relatedHint="Business or area" />
}

export function PlatformOverview() {
  const ts = Object.values(useTenants())
  const tasks = useTasks()
  const { actor, role } = useAdmin()
  const me = actor.split(' (')[0]
  const [range, setRange] = useState('12M')
  const [metric, setMetric] = useState<'mrr' | 'businesses' | 'users'>('mrr')
  if (role === 'billing') return <BillingOverview />
  if (role === 'finance') return <Finance />
  if (role === 'support') return <Support />
  const g = GROWTH.slice(-slice(range))
  const last = GROWTH[11], prev = GROWTH[10]
  const by = (s: Tenant['status']) => ts.filter((t) => t.status === s).length
  const total = ts.reduce((a, t) => a + mrr(t), 0)
  const users = ts.reduce((a, t) => a + t.employees, 0)
  const pct = (a: number, b: number) => `${(((a - b) / b) * 100).toFixed(1)}%`
  const spark = (k: 'mrr' | 'users' | 'businesses') => GROWTH.slice(-8).map((x) => x[k])

  const attention = [
    ...ts.filter((t) => t.status === 'Grace Period').map((t) => ({ t, icon: CreditCard, text: 'Payment failed, in grace period', tone: 'red' })),
    ...ts.filter((t) => t.status === 'Pending Setup').map((t) => ({ t, icon: Rocket, text: 'Workspace awaiting setup', tone: 'amber' })),
    ...ts.filter((t) => t.status === 'Renewal Due').map((t) => ({ t, icon: Hourglass, text: 'Renewal due', tone: 'amber' })),
    ...ts.filter((t) => t.status === 'Suspended').map((t) => ({ t, icon: AlertTriangle, text: 'Suspended, awaiting payment', tone: 'red' })),
    ...ts.filter((t) => t.status === 'Trial').map((t) => ({ t, icon: Hourglass, text: 'Trial in progress', tone: 'blue' })),
  ].slice(0, 6)
  const audit = useAudit()
  const risk = ts.map((t) => ({ t, h: healthOf(t, audit) })).sort((x, y) => x.h.score - y.h.score).slice(0, 4)
  const overdue = tasks.filter((t) => t.scope === 'Platform' && isOverdue(t)).length
  const plans = ['Starter', 'Professional', 'Enterprise'].map((p) => ({ p, n: ts.filter((t) => t.plan === p).length }))
  const maxPlan = Math.max(1, ...plans.map((x) => x.n))
  const statuses = ['Active', 'Trial', 'Renewal Due', 'Grace Period', 'Pending Setup', 'Suspended'] as const
  const tone: Record<string, string> = { Active: 'bg-ok', Trial: 'bg-info', 'Renewal Due': 'bg-warn', 'Grace Period': 'bg-warn', 'Pending Setup': 'bg-slate/50', Suspended: 'bg-err' }

  const metrics = {
    mrr: { label: 'Monthly recurring revenue (₦ millions)', series: [{ key: 'mrr', label: 'MRR' }], fmt: m },
    businesses: { label: 'Businesses on BizFlow', series: [{ key: 'businesses', label: 'Total businesses' }], fmt: (v: number) => String(v) },
    users: { label: 'Active users across companies', series: [{ key: 'users', label: 'Active users' }], fmt: (v: number) => v.toLocaleString('en-NG') },
  }[metric]

  return (
    <div>
      <div className="overview-hero mb-6">
        <PageHeader eyebrow="BizFlow Platform · Live control centre" title="Platform overview" desc="Growth, revenue and what needs attention today across every company. Company employee and payroll data is never shown here." actions={<><Btn v="secondary" to="/admin/tasks">Platform tasks</Btn><Btn to="/admin/businesses">View all businesses</Btn></>} />
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-teal/10 pt-4 text-xs text-slate">
          <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-ok" />All core systems operational</span>
          <span>{ts.length} connected workspaces</span>
          <span>{users.toLocaleString('en-NG')} active users</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Monthly recurring revenue" value={`₦${(total / 1e6).toFixed(2)}m`} delta={pct(last.mrr, prev.mrr)} hint="vs Sep" data={spark('mrr')} />
        <StatCard label="Businesses" value={String(ts.length)} delta={`${ts.filter((t) => t.created >= '2026-09-08').length} new`} hint="last 30 days" data={spark('businesses')} />
        <StatCard label="Active users" value={users.toLocaleString('en-NG')} delta={pct(last.users, prev.users)} hint="vs Sep" data={spark('users')} />
        <StatCard label="Collection rate" value={`${((last.collected / last.invoiced) * 100).toFixed(1)}%`} delta="0.8 pts" up={false} hint="vs Sep" data={GROWTH.slice(-8).map((x) => +((x.collected / x.invoiced) * 100).toFixed(1))} color="#E8920B" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Panel title="Growth" action={<div className="flex flex-wrap items-center gap-2"><div role="group" aria-label="Metric" className="inline-flex overflow-hidden rounded-md border border-line bg-white">{([['mrr', 'Revenue'], ['businesses', 'Businesses'], ['users', 'Users']] as const).map(([k, l]) => <button key={k} aria-pressed={metric === k} onClick={() => setMetric(k)} className={`h-8 cursor-pointer px-3 text-[13px] font-semibold ${metric === k ? 'bg-midnight text-white' : 'text-slate hover:text-ink'}`}>{l}</button>)}</div><RangeToggle value={range} onChange={setRange} /></div>}>
          <TrendChart data={g} series={metrics.series} fmt={metrics.fmt} label={metrics.label} height={280} />
        </Panel>
        <Panel title="Needs attention" action={<span className="text-xs text-slate">{attention.length} businesses</span>}>
          <ul className="divide-y divide-line/70">
            {attention.map(({ t, icon: Ic, text, tone: tn }) => (
              <li key={t.slug + text} className="flex items-center gap-3 py-2.5">
                <span className={`grid size-8 shrink-0 place-items-center rounded-md ${tn === 'red' ? 'bg-red-50 text-err' : tn === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-info'}`}><Ic size={15} /></span>
                <div className="min-w-0 flex-1"><Link to={`/admin/businesses/${t.slug}`} className="block truncate text-sm font-semibold hover:text-teal">{t.profile.name}</Link><div className="truncate text-xs text-slate">{text}</div></div>
                <Btn s="sm" v="secondary" to={`/admin/businesses/${t.slug}?tab=Subscription`}>Open</Btn>
              </li>
            ))}
            {attention.length === 0 && <li className="py-6 text-center text-sm text-slate">Nothing needs attention.</li>}
          </ul>
        </Panel>
      </div>

      <Panel title="Accounts to look after" className="mt-5" action={<span className="flex items-center gap-4"><HealthExplainerButton tenant={risk[0]?.t} audit={audit} /><Link to="/admin/businesses" className="text-xs font-semibold text-teal hover:underline">All businesses</Link></span>}>
        <ul className="grid gap-x-8 sm:grid-cols-2">
          {risk.map(({ t, h }) => (
            <li key={t.slug}><Link to={`/admin/businesses/${t.slug}`} className="flex min-h-[44px] items-center gap-3 border-b border-line/70 py-2.5 hover:bg-cloud/60">
              <span title={`Health score ${h.score} out of 100`} className="num grid size-9 shrink-0 place-items-center rounded-md bg-cloud font-display text-sm font-semibold">{h.score}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{t.profile.name}</span><span className="block truncate text-xs text-slate">{h.actions[0] ?? 'On track'}</span></span>
              <Badge tone={h.tone}>{h.label}</Badge>
            </Link></li>
          ))}
        </ul>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="New vs churned businesses"><TrendChart data={g} series={[{ key: 'new', label: 'New' }, { key: 'churned', label: 'Churned', color: '#DC3E42' }]} label="New and churned businesses per month" height={220} /></Panel>
        <Panel title="Invoiced vs collected (₦ millions)"><TrendChart data={g} series={[{ key: 'invoiced', label: 'Invoiced', dashed: true, color: '#60777D' }, { key: 'collected', label: 'Collected' }]} fmt={m} label="Invoiced versus collected revenue" height={220} /></Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr_1.3fr]">
        <Panel title="Business status">
          <div className="space-y-2.5">
            {statuses.map((s) => <Link key={s} to={`/admin/businesses?status=${s}`} className="flex items-center gap-3 text-sm hover:text-teal"><span className={`size-2.5 rounded-full ${tone[s]}`} /><span className="flex-1">{s}</span><b className="num">{by(s)}</b></Link>)}
          </div>
        </Panel>
        <Panel title="Plan mix">
          <div className="space-y-3">
            {plans.map(({ p, n }) => <div key={p}><div className="mb-1 flex justify-between text-sm"><span>{p}</span><b className="num">{n}</b></div><div className="h-2 rounded-full bg-cloud"><div className="h-2 rounded-full bg-teal" style={{ width: `${(n / maxPlan) * 100}%` }} /></div></div>)}
          </div>
        </Panel>
        <Panel title="My platform tasks" action={<span className="flex items-center gap-3 text-xs">{overdue > 0 && <span className="font-semibold text-err">{overdue} overdue</span>}<Link to="/admin/tasks" className="font-semibold text-teal">View all</Link></span>}>
          <TaskList scope="Platform" assignee={me} me={me} limit={4} empty="No platform tasks assigned to you." />
        </Panel>
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-slate"><Building2 size={13} />Revenue history is shown in ₦ millions. Figures are demo data.</p>
    </div>
  )
}

type RevenuePeriod = 'all' | 'year' | 'month' | 'week' | 'day' | 'custom'
type PaymentOutcome = 'Collected' | 'Pending confirmation' | 'Failed renewal'
type PlatformPayment = { ref: string; company: string; amount: number; method: 'Bank transfer' | 'Card' | 'Direct debit'; date: string; status: PaymentOutcome }
const PAYMENTS: PlatformPayment[] = [
  { ref: 'PAY-90476', company: 'eTranzact International Plc', amount: 840000, method: 'Bank transfer', date: '2026-10-08', status: 'Pending confirmation' },
  { ref: 'PAY-90412', company: 'eTranzact International Plc', amount: 1540000, method: 'Card', date: '2026-10-03', status: 'Collected' },
  { ref: 'PAY-89940', company: 'eTranzact International Plc', amount: 18500000, method: 'Bank transfer', date: '2026-08-15', status: 'Collected' },
  { ref: 'PAY-89411', company: 'eTranzact International Plc', amount: 1540000, method: 'Card', date: '2026-07-03', status: 'Collected' },
  { ref: 'PAY-88722', company: 'eTranzact International Plc', amount: 6800000, method: 'Direct debit', date: '2026-05-18', status: 'Collected' },
  { ref: 'PAY-87421', company: 'eTranzact International Plc', amount: 1140000, method: 'Card', date: '2026-01-12', status: 'Collected' },
]
const REVENUE_TODAY = '2026-10-08'
const PERIODS: { id: RevenuePeriod; label: string }[] = [
  { id: 'all', label: 'All earnings' },
  { id: 'year', label: 'This year' },
  { id: 'month', label: 'This month' },
  { id: 'week', label: 'This week' },
  { id: 'day', label: 'Today' },
  { id: 'custom', label: 'Custom period' },
]
const displayPaymentDate = (date: string) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Not set'

export function Finance() {
  const [period, setPeriod] = useState<RevenuePeriod>('all')
  const [start, setStart] = useState('2026-10-01')
  const [end, setEnd] = useState(REVENUE_TODAY)
  const [f, setF] = useState('All')
  const bounds: Record<Exclude<RevenuePeriod, 'all' | 'custom'>, [string, string]> = {
    year: ['2026-01-01', REVENUE_TODAY],
    month: ['2026-10-01', REVENUE_TODAY],
    week: ['2026-10-02', REVENUE_TODAY],
    day: [REVENUE_TODAY, REVENUE_TODAY],
  }
  const [from, to] = period === 'all' ? ['', ''] : period === 'custom' ? [start, end] : bounds[period]
  const periodRows = PAYMENTS.filter((payment) => (!from || payment.date >= from) && (!to || payment.date <= to))
  const rows = periodRows.filter((payment) => f === 'All' || payment.status === f)
  const collectedRows = periodRows.filter((payment) => payment.status === 'Collected')
  const collected = collectedRows.reduce((sum, payment) => sum + payment.amount, 0)
  const pendingConfirmation = periodRows.filter((payment) => payment.status === 'Pending confirmation').reduce((sum, payment) => sum + payment.amount, 0)
  const renewalRisk = periodRows.filter((payment) => payment.status === 'Failed renewal').reduce((sum, payment) => sum + payment.amount, 0)
  const paidCount = collectedRows.length
  const periodLabel = period === 'custom' ? `${displayPaymentDate(start)} – ${displayPaymentDate(end)}` : PERIODS.find((item) => item.id === period)?.label ?? ''
  const methods = (['Bank transfer', 'Card', 'Direct debit'] as const).map((method) => {
    const value = periodRows.filter((payment) => payment.status === 'Collected' && payment.method === method).reduce((sum, payment) => sum + payment.amount, 0)
    return [method, collected ? Math.round((value / collected) * 100) : 0] as const
  })
  const trend = Object.values(periodRows.reduce<Record<string, { m: string; date: string; collected: number; pending: number; failed: number }>>((acc, payment) => {
    const point = acc[payment.date] ?? { m: new Date(`${payment.date}T00:00:00Z`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'UTC' }), date: payment.date, collected: 0, pending: 0, failed: 0 }
    if (payment.status === 'Collected') point.collected += payment.amount / 1000000
    if (payment.status === 'Pending confirmation') point.pending += payment.amount / 1000000
    if (payment.status === 'Failed renewal') point.failed += payment.amount / 1000000
    acc[payment.date] = point
    return acc
  }, {})).sort((a, b) => a.date.localeCompare(b.date))
  return (
    <div>
      <PageHeader eyebrow="BizFlow Platform" title="Revenue & payments" desc="Confirmed prepaid earnings, payment verification and renewal risk across any reporting period." actions={<ExportButton name="payments" head={['Reference', 'Business', 'Amount', 'Method', 'Date', 'Outcome']} rows={rows.map((payment) => [payment.ref, payment.company, String(payment.amount), payment.method, payment.date, payment.status])} />} />
      <Panel className="mb-5" title="Earnings period" action={<span className="text-xs font-semibold text-teal">{periodLabel}</span>}>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((item) => <button key={item.id} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)} className={`h-9 cursor-pointer rounded-full border px-3 text-[13px] font-semibold ${period === item.id ? 'border-teal bg-teal text-white' : 'border-line bg-white text-slate hover:text-ink'}`}>{item.label}</button>)}
        </div>
        {period === 'custom' && <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
          <Field label="From"><input type="date" max={end} value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
          <Field label="To"><input type="date" min={start} max={REVENUE_TODAY} value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></Field>
        </div>}
      </Panel>
      <div role="note" className="mb-5 flex items-start gap-3 rounded-xl border border-teal/20 bg-softmint/60 p-4">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-teal"><ShieldCheck size={17} /></span>
        <div><div className="text-sm font-semibold">Prepaid revenue policy</div><p className="mt-0.5 text-[13px] leading-relaxed text-slate">Only confirmed payments count as earnings. Transfers awaiting verification and failed renewal attempts are operational follow-ups—not receivables or outstanding debt.</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Platform earnings collected" value={ngn(collected)} hint={`${paidCount} successful payment${paidCount === 1 ? '' : 's'}`} />
        <StatCard label="Average confirmed payment" value={paidCount ? ngn(Math.round(collected / paidCount)) : ngn(0)} hint="successful payments only" />
        <StatCard label="Pending confirmation" value={ngn(pendingConfirmation)} hint={`${periodRows.filter((payment) => payment.status === 'Pending confirmation').length} bank transfer${periodRows.filter((payment) => payment.status === 'Pending confirmation').length === 1 ? '' : 's'}`} color="#E8920B" />
        <StatCard label="Renewal value at risk" value={ngn(renewalRisk)} delta={`${periodRows.filter((payment) => payment.status === 'Failed renewal').length} failed`} up={false} hint="not recognized as revenue" color="#DC3E42" />
        <StatCard label="VAT in collected earnings" value={ngn(Math.round(collected * 0.075 / 1.075))} hint="7.5% inclusive estimate" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Panel title={`Payment outcomes · ${periodLabel}`}>
          {trend.length > 1 ? <TrendChart data={trend} series={[{ key: 'collected', label: 'Collected' }, { key: 'pending', label: 'Pending confirmation', color: '#E8920B', dashed: true }, { key: 'failed', label: 'Failed renewal', color: '#DC3E42', dashed: true }]} fmt={m} label={`Prepaid payment outcomes for ${periodLabel}`} height={270} /> : <div className="flex h-[270px] items-center justify-center text-sm text-slate">{trend.length ? 'One day of payment activity in this period. See the payment table below.' : 'No payment activity recorded in this period.'}</div>}
        </Panel>
        <Panel title="Payment methods">
          <div className="space-y-3.5">{methods.map(([name, value]) => <div key={name}><div className="mb-1 flex justify-between text-sm"><span>{name}</span><b className="num">{value}%</b></div><div className="h-2 rounded-full bg-cloud"><div className="h-2 rounded-full bg-teal" style={{ width: `${value}%` }} /></div></div>)}</div>
          <p className="mt-5 border-t border-line pt-4 text-xs text-slate">Share of successfully collected earnings for the selected period.</p>
        </Panel>
      </div>
      <div className="mb-3 mt-6 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 font-display text-lg font-semibold">Payments · {periodLabel}</h2>
        {['All', 'Collected', 'Pending confirmation', 'Failed renewal'].map((s) => <button key={s} aria-pressed={f === s} onClick={() => setF(s)} className={`h-8 cursor-pointer rounded-full border px-3 text-[13px] font-semibold ${f === s ? 'border-teal bg-teal text-white' : 'border-line bg-white text-slate'}`}>{s}</button>)}
      </div>
      <Table label="Payments" right={[2]} head={['Reference', 'Business', 'Amount', 'Method', 'Date', 'Outcome']} rows={rows.map((payment) => [payment.ref, payment.company, ngn(payment.amount), payment.method, displayPaymentDate(payment.date), <Badge key="s" tone={payment.status === 'Collected' ? 'green' : payment.status === 'Pending confirmation' ? 'amber' : 'red'}>{payment.status}</Badge>])} />
    </div>
  )
}

type TicketStatus = 'Pending' | 'In Progress' | 'Completed'
type Ticket = {
  id: string; company: string; subject: string; priority: 'High' | 'Normal' | 'Low'; status: TicketStatus
  requester: string; email: string; channel: string; category: string; assigned: string; created: string; updated: string; sla: string
  summary: string; impact: string; environment: string; messages: { at: string; by: string; text: string }[]
}
const TICKET_ROWS: Ticket[] = [
  { id: '#4833', company: 'eTranzact International Plc', subject: 'Confirm bank transfer for add-on invoice', priority: 'High', status: 'Pending', requester: 'Chinedu Eze', email: 'finance.demo@etranzact.com', channel: 'Email', category: 'Billing & access', assigned: 'Dayo Martins', created: '8 Oct, 08:14', updated: '8 Oct, 09:42', sla: '34 min remaining', summary: 'The customer completed a bank transfer for the add-on invoice and needs the payment confirmed before today’s payroll approval.', impact: 'Payroll approval is waiting on invoice confirmation for 486 employees across four offices.', environment: 'Production · etranzact.bizflow.com · Chrome 129 / Windows', messages: [{ at: '2026-10-08T08:14', by: 'Chinedu Eze', text: 'Sent payment evidence and requested immediate confirmation.' }, { at: '2026-10-08T08:31', by: 'Dayo Martins', text: 'Acknowledged the request and asked Finance to verify the transfer.' }, { at: '2026-10-08T09:42', by: 'Ngozi Eze', text: 'Bank transfer located; settlement reference matches the invoice.' }] },
  { id: '#4829', company: 'eTranzact International Plc', subject: 'Import 127 employees from CSV', priority: 'Normal', status: 'In Progress', requester: 'Kemi Balogun', email: 'hr.demo@etranzact.com', channel: 'In-app', category: 'People import', assigned: 'Dayo Martins', created: '7 Oct, 14:20', updated: '8 Oct, 08:06', sla: '5 hr remaining', summary: 'Employee import stops at row 84 because several legacy employee IDs contain spaces.', impact: '43 employees are waiting for onboarding invitations.', environment: 'Production · etranzact.bizflow.com · CSV import v2', messages: [{ at: '2026-10-07T14:20', by: 'Kemi Balogun', text: 'Uploaded the source CSV and error screenshot.' }, { at: '2026-10-08T08:06', by: 'Dayo Martins', text: 'Cleaned invalid IDs and started a validation run.' }] },
  { id: '#4821', company: 'eTranzact International Plc', subject: 'PAYE schedule export', priority: 'Normal', status: 'In Progress', requester: 'Chinedu Eze', email: 'finance.demo@etranzact.com', channel: 'In-app', category: 'Payroll', assigned: 'Dayo Martins', created: '6 Oct, 11:05', updated: '7 Oct, 16:40', sla: 'Within SLA', summary: 'The October PAYE export shows one employee under the previous branch jurisdiction.', impact: 'Statutory filing cannot be submitted until the schedule is corrected.', environment: 'Production · etranzact.bizflow.com · Payroll Oct 2026', messages: [{ at: '2026-10-06T11:05', by: 'Chinedu Eze', text: 'Attached PAYE schedule and highlighted the affected employee.' }] },
  { id: '#4817', company: 'eTranzact International Plc', subject: 'Payment not confirmed', priority: 'High', status: 'Pending', requester: 'Nneka Okafor', email: 'admin.demo@etranzact.com', channel: 'Phone', category: 'Provisioning', assigned: 'Dayo Martins', created: '6 Oct, 09:12', updated: '6 Oct, 10:03', sla: 'Breached by 1 day', summary: 'Paystack confirms the charge but the new Port Harcourt office workspace remains pending.', impact: 'The customer cannot invite staff at the new office or finish setup.', environment: 'Production · provisioning job PRV-90318', messages: [{ at: '2026-10-06T09:12', by: 'Nneka Okafor', text: 'Called support after waiting 45 minutes for setup.' }] },
  { id: '#4790', company: 'eTranzact International Plc', subject: 'Add second administrator', priority: 'Low', status: 'Completed', requester: 'Oladapo Adebayo', email: 'ceo.demo@etranzact.com', channel: 'Email', category: 'Access', assigned: 'Dayo Martins', created: '2 Oct, 12:10', updated: '2 Oct, 13:02', sla: 'Resolved in 52 min', summary: 'Company requested a second administrator with company-wide scope.', impact: 'No service interruption.', environment: 'Production · etranzact.bizflow.com', messages: [{ at: '2026-10-02T12:10', by: 'Oladapo Adebayo', text: 'Requested administrator access for the Finance lead.' }, { at: '2026-10-02T13:02', by: 'Dayo Martins', text: 'Access granted and verified with the requester.' }] },
]

const escalation = (sla: string) => (sla.includes('Breached') ? 'Escalated to the support lead' : /^\d+ min/.test(sla) ? 'Near breach: reply now' : '')
export function Support() {
  const toast = useToast()
  const [f, setF] = useState('All')
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [statuses, setStatuses] = useState<Record<string, TicketStatus>>({})
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, Ticket['messages']>>({})
  const [note, setNote] = useState('')
  const statusOf = (ticket: Ticket) => statuses[ticket.id] ?? ticket.status
  const assignedTo = (ticket: Ticket) => assignments[ticket.id] ?? ticket.assigned
  const rows = TICKET_ROWS.filter((ticket) => f === 'All' || statusOf(ticket) === f)
  return (
    <div>
      <PageHeader eyebrow="BizFlow Platform" title="Support tickets" desc="Requests from company administrators across all workspaces." actions={<Btn v="secondary" to="/admin/tasks">Create follow-up task</Btn>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open tickets" value="14" hint="3 urgent" data={[9, 11, 10, 13, 12, 15, 14, 14]} color="#E8920B" />
        <StatCard label="Median first response" value="42 min" delta="9 min" hint="faster than Sep" data={[58, 55, 51, 49, 52, 47, 44, 42]} />
        <StatCard label="Resolved this week" value="38" delta="2.7%" hint="vs last week" data={TICKETS.map((x) => x.resolved)} />
        <StatCard label="Satisfaction" value="4.7 / 5" hint="from 112 ratings" />
      </div>
      <Panel title="Ticket volume, last 8 weeks" className="mt-5"><TrendChart data={TICKETS} series={[{ key: 'opened', label: 'Opened' }, { key: 'resolved', label: 'Resolved', color: '#16A34A' }]} label="Tickets opened versus resolved per week" height={240} /></Panel>
      <div className="mb-3 mt-6 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 font-display text-lg font-semibold">Queue</h2>
        {['All', 'Pending', 'In Progress', 'Completed'].map((s) => <button key={s} aria-pressed={f === s} onClick={() => setF(s)} className={`h-8 cursor-pointer rounded-full border px-3 text-[13px] font-semibold ${f === s ? 'border-teal bg-teal text-white' : 'border-line bg-white text-slate'}`}>{s}</button>)}
      </div>
      <Table label="Tickets" head={['Ticket', 'Business', 'Subject', 'Category', 'Priority', 'SLA', 'Status']} rows={rows.map((ticket) => [
        <button key="id" onClick={() => setSelected(ticket)} className="cursor-pointer font-mono font-semibold text-teal">{ticket.id}</button>,
        ticket.company,
        <button key="subject" onClick={() => setSelected(ticket)} className="cursor-pointer text-left font-semibold hover:text-teal">{ticket.subject}</button>,
        ticket.category,
        <Badge key="p" tone={ticket.priority === 'High' ? 'red' : ticket.priority === 'Low' ? 'gray' : 'blue'}>{ticket.priority}</Badge>,
        <span key="sla" className="flex flex-col"><span className={ticket.sla.includes('Breached') ? 'font-semibold text-err' : 'text-slate'}>{ticket.sla}</span>{escalation(ticket.sla) && <span className="text-[11px] font-semibold text-err">{escalation(ticket.sla)}</span>}</span>,
        <Badge key="s">{statusOf(ticket)}</Badge>,
      ])} />
      <Overlay open={!!selected} onClose={() => { setSelected(null); setNote('') }} title={selected ? `${selected.id} · ${selected.subject}` : 'Ticket'} side wide>
        {selected && <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={selected.priority === 'High' ? 'red' : selected.priority === 'Low' ? 'gray' : 'blue'}>{selected.priority}</Badge><Badge>{statusOf(selected)}</Badge><span className={`ml-auto text-xs font-semibold ${selected.sla.includes('Breached') ? 'text-err' : 'text-slate'}`}>{selected.sla}</span></div>
          <Panel title="Customer and case">
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div><div className="text-xs text-slate">Company</div><div className="font-semibold">{selected.company}</div></div>
              <div><div className="text-xs text-slate">Requester</div><div className="flex items-center gap-2 font-semibold"><Avatar name={selected.requester} size={24} />{selected.requester}</div><div className="text-xs text-slate">{selected.email}</div></div>
              <div><div className="text-xs text-slate">Category / channel</div><div>{selected.category} · {selected.channel}</div></div>
              <div><div className="text-xs text-slate">Assigned to</div><div className="font-semibold">{assignedTo(selected)}</div></div>
              <div><div className="text-xs text-slate">Created</div><div>{selected.created}</div></div>
              <div><div className="text-xs text-slate">Last updated</div><div>{selected.updated}</div></div>
            </div>
          </Panel>
          <Panel title="Issue details"><p className="text-sm leading-relaxed">{selected.summary}</p><div className="mt-4 rounded-md bg-amber-50 p-3 text-sm"><b>Customer impact</b><p className="mt-1 text-amber-900">{selected.impact}</p></div><div className="mt-3 font-mono text-xs text-slate">{selected.environment}</div></Panel>
          <Panel title="Conversation and activity"><Timeline items={[...selected.messages, ...(notes[selected.id] ?? [])].sort((a, b) => b.at.localeCompare(a.at)).map((message) => ({ t: new Date(message.at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), a: message.by, x: message.text }))} /></Panel>
          <Panel title="Resolution controls">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status"><select className={inputCls} value={statusOf(selected)} onChange={(e) => { const status = e.target.value as TicketStatus; setStatuses({ ...statuses, [selected.id]: status }); toast(`${selected.id} moved to ${status}`) }}>{['Pending', 'In Progress', 'Completed'].map((status) => <option key={status}>{status}</option>)}</select></Field>
              <Field label="Assigned agent"><select className={inputCls} value={assignedTo(selected)} onChange={(e) => { setAssignments({ ...assignments, [selected.id]: e.target.value }); toast(`${selected.id} assigned to ${e.target.value}`) }}>{STAFF.map((person) => <option key={person}>{person}</option>)}</select></Field>
            </div>
            <Field label="Internal note"><textarea rows={3} className={`${inputCls} mt-3 h-auto py-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add troubleshooting context or next steps" /></Field>
            <Btn className="mt-3" disabled={!note.trim()} onClick={() => { setNotes({ ...notes, [selected.id]: [...(notes[selected.id] ?? []), { at: new Date().toISOString(), by: assignedTo(selected), text: `Internal note: ${note.trim()}` }] }); toast('Internal note added to ticket'); setNote('') }}><MessageSquare size={15} />Add internal note</Btn>
          </Panel>
        </div>}
      </Overlay>
    </div>
  )
}

export function PlatformUsers() {
  const access = getPlatformAccess()
  const tasks = useTasks()
  return (
    <div>
      <PageHeader eyebrow="BizFlow Platform" title="Platform users" desc="BizFlow staff with console access, their assigned roles and operational workload." actions={<Btn to="/admin/settings">Manage roles & permissions</Btn>} />
      <Table label="Platform users" head={['Name', 'Role', 'Scope', 'Sign-in check (MFA)', 'Open tasks', 'Last sign-in', 'Status']} right={[4]} rows={access.users.map((user, i) => {
        const role = access.roles.find((item) => item.id === user.roleId)
        return [
        <span key="n" className="font-semibold">{user.name}</span>, role?.name ?? 'Unassigned', role?.scope ?? '—',
        <Badge key="m" tone="green">{Object.values(ADMIN_ROLES).find((r) => r.email === user.email)?.mfa ?? 'Authenticator app'}</Badge>,
        String(tasks.filter((t) => t.scope === 'Platform' && t.assignees.includes(user.name) && t.status !== 'Done').length),
        ['Today, 08:30', 'Today, 09:02', 'Yesterday', 'Today, 07:55'][i] ?? 'Never', <Badge key="s" tone={user.status === 'Active' ? 'green' : 'gray'}>{user.status}</Badge>]
      })} />
      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Role permissions</h2>
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead><tr className="border-b border-line bg-cloud/60 text-xs text-slate"><th scope="col" className="px-4 py-2.5 font-semibold">Permission</th>{access.roles.map((role) => <th key={role.id} scope="col" className="px-4 py-2.5 text-center font-semibold">{role.name}</th>)}</tr></thead>
          <tbody>{(Object.entries(PERMS) as [Perm, string][]).map(([permission, label]) => <tr key={permission} className="border-b border-line/70 last:border-0"><th scope="row" className="px-4 py-2.5 font-medium">{label}</th>{access.roles.map((role) => <td key={role.id} className="px-4 py-2.5 text-center">{role.permissions.includes(permission) ? <span className="font-semibold text-ok" aria-label="Allowed">✓</span> : <span className="text-slate/50" aria-label="Not allowed">—</span>}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

const blankRole = (): PlatformAccessRole => ({ id: '', name: '', scope: 'Platform', description: '', permissions: ['view'] })

export function PlatformSettings() {
  const toast = useToast()
  const companies = Object.values(useTenants())
  const [access, setAccess] = useState(getPlatformAccess)
  const [companyPolicies, setCompanyPolicies] = useState(getCompanyPolicies)
  const [tab, setTab] = useState('Roles & permissions')
  const [edit, setEdit] = useState<PlatformAccessRole | null>(null)
  const commit = (next: typeof access, message: string) => { setAccess(next); savePlatformAccess(next); toast(message) }
  const commitCompanyDefaults = (next: CompanyPolicy) => {
    const policies = { ...companyPolicies, defaults: next }
    setCompanyPolicies(policies)
    saveCompanyPolicies(policies)
    toast('Default company policies saved.')
  }
  const saveRole = () => {
    if (!edit?.name.trim()) return
    const role = { ...edit, id: edit.id || `custom-${Date.now().toString(36)}`, name: edit.name.trim() }
    const exists = access.roles.some((item) => item.id === role.id)
    commit({ ...access, roles: exists ? access.roles.map((item) => item.id === role.id ? role : item) : [...access.roles, role] }, exists ? 'Role permissions updated.' : 'Custom role created.')
    setEdit(null)
  }
  return (
    <div>
      <PageHeader eyebrow="BizFlow Platform" title="Platform settings" desc="Configure platform access, company governance defaults and the staff assigned to each permission set." />
      <Tabs tabs={['Roles & permissions', 'User access', 'Company defaults', 'General']} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'Roles & permissions' && <div className="space-y-5">
          <div className="flex justify-end"><Btn onClick={() => setEdit(blankRole())}>New custom role</Btn></div>
          <Panel pad={false}><Table label="Platform roles" head={['Role', 'Scope', 'Users', 'Permissions', 'Type', '']} right={[2, 3]} rows={access.roles.map((role) => [
            <span key="name"><b>{role.name}</b><span className="block text-xs text-slate">{role.description}</span></span>,
            role.scope,
            String(access.users.filter((user) => user.roleId === role.id).length),
            String(role.permissions.length),
            <Badge key="type" tone={role.system ? 'blue' : 'teal'}>{role.system ? 'System' : 'Custom'}</Badge>,
            <button key="edit" className="cursor-pointer font-semibold text-teal" onClick={() => setEdit(structuredClone(role))}>Modify</button>,
          ])} /></Panel>
        </div>}
        {tab === 'User access' && <Panel pad={false}><Table label="User role assignments" head={['Platform user', 'Email', 'Assigned role', 'Status']} rows={access.users.map((user) => [
          <span key="user" className="flex items-center gap-2 font-semibold"><Avatar name={user.name} size={26} />{user.name}</span>,
          user.email,
          <select key="role" aria-label={`Role for ${user.name}`} className={`${inputCls} min-w-44`} value={user.roleId} onChange={(e) => commit({ ...access, users: access.users.map((item) => item.email === user.email ? { ...item, roleId: e.target.value } : item) }, `${user.name}'s role updated.`)}>{access.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>,
          <button key="status" onClick={() => commit({ ...access, users: access.users.map((item) => item.email === user.email ? { ...item, status: item.status === 'Active' ? 'Suspended' : 'Active' } : item) }, `${user.name}'s access updated.`)} className="cursor-pointer"><Badge tone={user.status === 'Active' ? 'green' : 'gray'}>{user.status}</Badge></button>,
        ])} /></Panel>}
        {tab === 'Company defaults' && <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Security & access defaults">
              <div className="space-y-4">
                {([
                  ['requireMfa', 'Require multi-factor authentication', 'New companies require MFA for privileged company roles.'],
                  ['requireSupportApproval', 'Require support approval', 'Platform support must be authorised before entering company data.'],
                ] as [keyof CompanyPolicy, string, string][]).map(([key, label, detail]) => <label key={key} className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 size-4 accent-teal" checked={Boolean(companyPolicies.defaults[key])} onChange={(event) => commitCompanyDefaults({ ...companyPolicies.defaults, [key]: event.target.checked })} /><span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-slate">{detail}</span></span></label>)}
                <Field label="Default idle session timeout"><select className={inputCls} value={companyPolicies.defaults.sessionTimeout} onChange={(event) => commitCompanyDefaults({ ...companyPolicies.defaults, sessionTimeout: Number(event.target.value) })}>{[15, 30, 60, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></Field>
              </div>
            </Panel>
            <Panel title="Workspace capability defaults">
              <div className="space-y-4">
                {([
                  ['allowBranding', 'Allow company branding', 'Company administrators can manage logos, colours and workspace appearance.'],
                  ['allowEmployeeInvites', 'Allow employee invitations', 'Company HR and administrators can issue onboarding links.'],
                ] as [keyof CompanyPolicy, string, string][]).map(([key, label, detail]) => <label key={key} className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 size-4 accent-teal" checked={Boolean(companyPolicies.defaults[key])} onChange={(event) => commitCompanyDefaults({ ...companyPolicies.defaults, [key]: event.target.checked })} /><span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-slate">{detail}</span></span></label>)}
              </div>
              <div className="mt-5 rounded-lg bg-softmint px-3 py-2.5 text-xs text-slate">These defaults apply to every company unless a platform administrator adds an override on the company record.</div>
            </Panel>
          </div>
          <Panel pad={false} title="Company exceptions"><Table label="Company policy exceptions" head={['Company', 'Plan', 'Overrides', 'Policy source', '']} right={[2]} rows={companies.map((company) => {
            const count = Object.keys(companyPolicies.overrides[company.slug] ?? {}).length
            return [<span key="c" className="font-semibold">{company.profile.name}</span>, company.plan, String(count), <Badge key="s" tone={count ? 'amber' : 'gray'}>{count ? 'Custom' : 'Defaults'}</Badge>, <Link key="l" to={`/admin/businesses/${company.slug}?tab=Platform%20settings`} className="font-semibold text-teal">Manage</Link>]
          })} /></Panel>
        </div>}
        {tab === 'General' && <div className="grid gap-5 lg:grid-cols-2"><Panel title="Console identity"><Field label="Platform name"><input className={inputCls} defaultValue="BizFlow" /></Field><Field label="Support email"><input className={`${inputCls} mt-4`} defaultValue="support@bizflow.com" /></Field><Btn className="mt-4" onClick={() => toast('Platform settings saved.')}>Save changes</Btn></Panel><Panel title="Security defaults"><div className="space-y-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="accent-teal" />Require multi-factor authentication for Superadmins</label><label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="accent-teal" />Expire support sessions automatically</label><label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="accent-teal" />Log every permission change</label></div></Panel></div>}
      </div>
      <Overlay open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Modify ${edit.name}` : 'New custom role'} side>
        {edit && <div className="space-y-4">
          <Field label="Role name"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Description"><input className={inputCls} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <Field label="Scope"><input className={inputCls} value={edit.scope} onChange={(e) => setEdit({ ...edit, scope: e.target.value })} /></Field>
          <div><div className="mb-2 text-sm font-semibold">Permissions</div><div className="grid gap-2 rounded-lg border border-line p-3">{(Object.entries(PERMS) as [Perm, string][]).map(([permission, label]) => <label key={permission} className={`flex items-center gap-2 text-sm ${permission === 'view' ? 'opacity-70' : 'cursor-pointer'}`}><input type="checkbox" disabled={permission === 'view'} className="size-4 accent-teal" checked={edit.permissions.includes(permission)} onChange={(e) => setEdit({ ...edit, permissions: e.target.checked ? [...edit.permissions, permission] : edit.permissions.filter((item) => item !== permission) })} />{label}{permission === 'view' && <span className="ml-auto text-xs text-slate">Required</span>}</label>)}</div></div>
          <Btn className="w-full" onClick={saveRole}>Save role</Btn>
        </div>}
      </Overlay>
    </div>
  )
}

export function System() {
  const a = useAudit()
  const [range, setRange] = useState('30D')
  const d = SYSTEM.slice(-(range === '7D' ? 7 : range === '14D' ? 14 : 30))
  return (
    <div>
      <PageHeader eyebrow="BizFlow Platform" title="System health & audit" desc="Service performance and every platform and business action across tenants, clearly separated by type." actions={<RangeToggle value={range} onChange={setRange} options={['7D', '14D', '30D']} />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="API uptime (30d)" value="99.97%" hint="target 99.9%" />
        <StatCard label="p95 latency" value={`${d[d.length - 1].p95} ms`} hint="today" data={SYSTEM.slice(-10).map((x) => x.p95)} color="#2878D8" />
        <StatCard label="Provisioning time" value={`${d[d.length - 1].prov}s`} hint="avg, last job" data={SYSTEM.slice(-10).map((x) => x.prov)} />
        <StatCard label="Failed provisioning" value="1" hint="retrying" up={false} color="#DC3E42" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="API latency, p95 (ms)"><TrendChart data={d} series={[{ key: 'p95', label: 'p95 latency', color: '#2878D8' }]} fmt={(v) => `${v}ms`} label="API p95 latency" height={220} /></Panel>
        <Panel title="Workspace provisioning time (seconds)"><TrendChart data={d} series={[{ key: 'prov', label: 'Average provisioning' }]} fmt={(v) => `${v}s`} label="Provisioning time" height={220} /></Panel>
      </div>
      <div className="mt-6"><AuditAnomalies /></div>
      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-display text-lg font-semibold">Audit log</h2><p className="text-xs text-slate">Append-only. Entries cannot be edited or deleted.</p></div><ExportButton name="platform-audit-trail" head={['When', 'Type', 'Tenant', 'User', 'Role', 'Action', 'Previous', 'New', 'Device']} rows={a.map((r) => [r.at, r.scope, r.tenant, r.actor, r.role, r.action, r.from ?? '', r.to ?? '', r.device])} /></div>
      <AuditTable rows={a} />
    </div>
  )
}
