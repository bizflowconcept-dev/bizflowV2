import { useRef, useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useRole } from '../../components/app/AppLayout'
import BillingTab from '../../components/billing/BillingTab'
import { Badge, Btn, ExportButton, Field, inputCls, EmptyState, Overlay, Panel, PageHeader, Table, Tabs, Timeline, Flow, Avatar, QuickAction, useToast } from '../../components/ui'
import { AUDIT, employeesForTenant, isOwnDataset, ngn } from '../../data/demo'
import { DEPARTMENT_MODULES, deleteDepartment, demoAccountsFor, saveDepartment, setDemoAccountRole, useAudit, useDepartments, useSupport, useTenant } from '../../tenant/store'
import type { BusinessRoleKey, Department } from '../../tenant/store'
import { SettingsNav, TenantMark } from '../../tenant/ui'
import { CHART, TrendChart } from '../../components/charts'
import { PermissionsMatrix, ReportSchedules } from './ReportExtras'
import { COMPANY_ROLES } from '../../security/access'

export { default as CRM } from './Crm'

export { default as Documents } from './Documents'

export { Sign, Signing } from './SignModule'

type ReportView = { id: string; name: string; report: string; period: string; scope: string }

const REPORT_ACCESS: Record<string, string[]> = {
  finance: ['health', 'financial', 'payroll', 'cost', 'branch', 'assets'],
  hr: ['people', 'payroll'],
  operations: ['assets', 'fleet', 'branch'],
}

export function Reports() {
  const { r, role, can } = useRole()
  const tenant = useTenant()
  const toast = useToast()
  const [report, setReport] = useState('health')
  const [period, setPeriod] = useState('Last 6 months')
  const [scope, setScope] = useState('Company')
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const storageKey = `bf-report-views-${tenant?.slug ?? 'company'}`
  const [saved, setSaved] = useState<ReportView[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] }
  })
  if (!tenant) return null
  if (isOwnDataset(tenant.slug)) return <div className="space-y-6"><PageHeader eyebrow="Insights" title="Reports" desc="Explore trends, compare performance with targets and drill into the decisions behind each result." /><div className="rounded-lg border border-line bg-white"><EmptyState title="No report data yet" body="Reports appear once your team adds employees, runs payroll, raises expenses and records activity. Start by adding your first employee." action={<Btn to="/admin/business/people">Add your first employee</Btn>} /></div></div>
  const employees = employeesForTenant(tenant.slug)
  const payroll = employees.reduce((sum, employee) => sum + employee.salary, 0)
  const allReports = [
    { id: 'health', title: 'Business Health', desc: 'Company to cost centre', metric: '91%', label: 'Overall performance', delta: '+3 pts vs target', data: [72, 77, 75, 84, 87, 91], target: [78, 80, 82, 84, 86, 88], insights: ['Performance moved above target in August and has continued to improve.', 'Finance close and service delivery are the strongest contributors.', 'Three control exceptions remain open and require owners.'] },
    { id: 'people', title: 'People Reports', desc: 'Headcount, attendance, leave', metric: String(tenant.employees), label: 'Company headcount', delta: `${employees.filter((employee) => employee.status === 'Active').length} active demo profiles`, data: [82, 84, 86, 89, 92, 94], target: [86, 87, 88, 89, 90, 91], insights: ['Attendance is three points above the current operating target.', 'Onboarding records need completion for new joiners.', 'Leave concentration is highest in Operations this period.'] },
    { id: 'payroll', title: 'Payroll Reports', desc: 'Runs, statutory, variance', metric: ngn(payroll), label: 'Detailed payroll sample', delta: `${employees.length} employee records`, data: [31, 32, 32.8, 33.4, 34.1, 35.5], target: [31.5, 32, 32.5, 33, 33.5, 34], insights: ['Payroll increased primarily from new joiners and approved adjustments.', 'All statutory schedules reconcile to the approved payroll run.', 'One payroll journal remains in the checker queue.'] },
    { id: 'financial', title: 'Financial Reports', desc: 'P&L, balance sheet, cash flow', metric: '₦56.9M', label: 'Revenue this month', delta: '+8.8% vs September', data: [41.2, 44.8, 43.1, 49.6, 52.3, 56.9], target: [42, 44, 46, 48, 51, 54], insights: ['Revenue is above plan while operating margin remains above 25%.', 'Receivable days improved from 38 to 34 days.', 'Technology spend requires review after an annual licence renewal.'] },
    { id: 'assets', title: 'Asset Reports', desc: 'Register, custody, maintenance', metric: '96', label: 'Tracked assets', delta: '92% assigned', data: [76, 79, 81, 86, 89, 92], target: [82, 83, 85, 87, 89, 91], insights: ['Asset assignment is one point above target.', 'Four devices are awaiting employee acknowledgement.', 'Two maintenance actions are due within seven days.'] },
    { id: 'fleet', title: 'Fleet Reports', desc: 'Fuel, service, documents', metric: '94.8%', label: 'Fleet availability', delta: '+1.6 pts this month', data: [88, 90, 89, 92, 93, 94.8], target: [90, 90, 91, 92, 93, 93], insights: ['Vehicle availability has remained above target since August.', 'Fuel cost per kilometre declined by 3.2%.', 'One roadworthiness document expires this month.'] },
    { id: 'crm', title: 'CRM Reports', desc: 'Pipeline and follow-ups', metric: '₦117M', label: 'Qualified pipeline', delta: '31% win rate', data: [62, 68, 74, 82, 96, 117], target: [66, 72, 78, 86, 98, 108], insights: ['Qualified pipeline is 8% above the current target.', 'Five customer follow-ups are due; two are overdue.', 'Enterprise opportunities account for 61% of pipeline value.'] },
    { id: 'branch', title: 'Branch Reports', desc: 'Compare branches', metric: '94%', label: 'Top branch performance', delta: 'Lagos HQ', data: [81, 84, 86, 88, 91, 94], target: [84, 85, 86, 87, 89, 90], insights: ['Lagos HQ leads on revenue and completion rate.', 'Abuja improved four points after resolving its task backlog.', 'Ibadan requires attention on fleet-document compliance.'] },
    { id: 'cost', title: 'Cost Centre Reports', desc: 'Allocation and spend', metric: '89%', label: 'Budget utilized', delta: '₦9.7M remaining', data: [58, 64, 69, 75, 82, 89], target: [60, 65, 70, 76, 83, 90], insights: ['Overall spend remains within the approved monthly budget.', 'Technology is the only cost centre currently above plan.', 'Fleet and Compliance have the strongest favourable variances.'] },
  ]
  const allowedIds = role === 'md' || role === 'auditor' || role === 'compliance' ? null : REPORT_ACCESS[role] ?? []
  const reports = allowedIds ? allReports.filter((item) => allowedIds.includes(item.id)) : allReports
  const active = reports.find((item) => item.id === report) ?? reports[0]
  if (!active) return <div><PageHeader eyebrow="Insights" title="Reports" /><div className="rounded-lg border border-line bg-white"><EmptyState title="No reports for your role" body="Reports are limited to the roles that need them. Ask a company administrator if you need one." /></div></div>
  const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']
  const trend = months.map((month, index) => ({ m: month, actual: active.data[index], target: active.target[index] }))
  const saveView = () => {
    if (!viewName.trim()) return
    const next = [...saved, { id: Date.now().toString(36), name: viewName.trim(), report: active.id, period, scope }]
    setSaved(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
    setViewName('')
    setSaveOpen(false)
    toast('Report view saved for quick access.')
  }
  const openView = (view: ReportView) => {
    setReport(view.report)
    setPeriod(view.period)
    setScope(view.scope)
    toast(`Opened “${view.name}”.`)
  }
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Insights" title="Reports" desc="Explore trends, compare performance with targets and drill into the decisions behind each result." actions={<><ExportButton name={`${active.id}-${period.toLowerCase().replace(/ /g, '-')}`} head={['Month', 'Actual', 'Target']} rows={trend.map((item) => [item.m, String(item.actual), String(item.target)])} /><Btn v="secondary" onClick={() => setSaveOpen(true)}>Save current view</Btn></>} />
      <Panel>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <Field label="Reporting period"><select className={inputCls} value={period} onChange={(event) => setPeriod(event.target.value)}>{['This month', 'Last 3 months', 'Last 6 months', 'Year to date'].map((option) => <option key={option}>{option}</option>)}</select></Field>
          <Field label="Data scope"><select className={inputCls} value={scope} onChange={(event) => setScope(event.target.value)}>{['Company', 'Lagos HQ', 'Abuja Branch', 'Port Harcourt'].map((option) => <option key={option}>{option}</option>)}</select></Field>
          <div className="self-end pb-2 text-xs text-slate">Updated 8 Oct 2026</div>
        </div>
        {saved.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"><span className="text-xs font-semibold text-slate">Saved views</span>{saved.map((view) => <Btn key={view.id} s="sm" v="ghost" onClick={() => openView(view)}>{view.name}</Btn>)}</div>}
      </Panel>
      <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((item) => (
          <button key={item.id} aria-pressed={report === item.id} onClick={() => setReport(item.id)} className={`cursor-pointer p-5 text-left transition-colors ${report === item.id ? 'bg-softmint ring-2 ring-inset ring-teal/30' : 'bg-white hover:bg-softmint/40'}`}><div className="font-display text-base font-semibold">{item.title}</div><div className="mt-0.5 text-sm text-slate">{item.desc}</div><div className="mt-3 text-xs font-semibold text-teal">{report === item.id ? 'Viewing report' : 'Open insights'}</div></button>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title={`${active.title} · ${period}`} action={<Badge tone="teal">{scope}</Badge>}>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><div className="text-xs font-medium text-slate">{active.label}</div><div className="num mt-1 font-display text-3xl font-semibold">{active.metric}</div></div><Badge tone="green">{active.delta}</Badge></div>
          <TrendChart data={trend} series={[{ key: 'actual', label: 'Actual' }, { key: 'target', label: 'Target', color: CHART.axis, dashed: true }]} label={`${active.title} actual versus target`} height={260} />
        </Panel>
        <Panel title="Management insights">
          <div className="space-y-3">{active.insights.map((insight, index) => <div key={insight} className="flex gap-3 rounded-lg border border-line p-3"><span className={`mt-1 size-2 shrink-0 rounded-full ${index === 1 ? 'bg-warn' : 'bg-teal'}`} /><p className="text-sm text-slate">{insight}</p></div>)}</div>
          <div className="mt-5 rounded-lg bg-softmint p-3 text-xs text-slate"><b className="text-ink">View context:</b> {active.title}, {period.toLowerCase()}, {scope.toLowerCase()} scope. Exports and saved views use these filters.</div>
        </Panel>
      </div>
      <ReportSchedules slug={tenant.slug} by={r.user} reports={reports.map((item) => ({ id: item.id, title: item.title }))} activeId={active.id} canManage={can('reports.schedule')} />
      <Panel pad={false} title="Performance breakdown"><Table right={[1, 2, 3]} head={['Period', 'Actual', 'Target', 'Variance']} rows={trend.map((item) => [item.m, String(item.actual), String(item.target), <span key="v" className={item.actual >= item.target ? 'font-semibold text-ok' : 'font-semibold text-warn'}>{item.actual >= item.target ? '+' : ''}{Number(item.actual) - Number(item.target)}</span>])} /></Panel>
      <Overlay open={saveOpen} onClose={() => setSaveOpen(false)} title="Save current report view">
        <p className="mb-4 text-sm text-slate">A saved view remembers the selected report, reporting period and data scope. It does not create a frozen copy of the data.</p>
        <Field label="View name"><input autoFocus value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder={`${active.title} · ${scope}`} className={inputCls} /></Field>
        <div className="mt-4 rounded-lg bg-cloud p-3 text-xs text-slate"><b className="text-ink">{active.title}</b><br />{period} · {scope}</div>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setSaveOpen(false)}>Cancel</Btn><Btn disabled={!viewName.trim()} onClick={saveView}>Save view</Btn></div>
      </Overlay>
    </div>
  )
}

export function Settings() {
  const [sp] = useSearchParams()
  const t = useTenant()
  const { r, can } = useRole()
  const toast = useToast()
  const [, setRbacVersion] = useState(0)
  const departments = useDepartments(t?.slug)
  const [departmentOpen, setDepartmentOpen] = useState(false)
  const [departmentDraft, setDepartmentDraft] = useState<Department | null>(null)
  const canBilling = can('company.subscription.manage')
  const tabs = canBilling ? ['Overview', 'Staff & RBAC', 'Billing & Subscription', 'Audit', 'Security'] : ['Overview', 'Staff & RBAC', 'Audit', 'Security']
  const requested = sp.get('tab') === 'billing' ? 'Billing & Subscription' : sp.get('tab') === 'rbac' ? 'Staff & RBAC' : sp.get('tab') === 'security' ? 'Security' : sp.get('tab') === 'audit' ? 'Audit' : 'Overview'
  const [tab, setTab] = useState(tabs.includes(requested) ? requested : 'Overview')
  useEffect(() => { if (tabs.includes(requested)) setTab(requested) }, [requested]) // eslint-disable-line
  if (!t) return null
  const accounts = demoAccountsFor(t)
  const support = useSupport()
  const ownAudit = useAudit(t.slug)
  const own = isOwnDataset(t.slug)
  const privileged = accounts.filter((account) => ['admin', 'md', 'finance', 'hr'].includes(account.roleKey))
  const highRisk = accounts.filter((account) => COMPANY_ROLES[account.roleKey].can.some((permission) => ['payroll.approve', 'accounting.post', 'approvals.decide', 'finance.tiers.manage', 'payments.disburse', 'company.roles.manage'].includes(permission)))
  const openDepartment = (department?: Department) => {
    setDepartmentDraft(department ? { ...department, memberEmails: [...department.memberEmails], modules: [...department.modules], features: [...department.features] } : { id: '', name: '', roleKey: 'manager', memberEmails: [], modules: ['tasks'], features: ['tasks.view'] })
    setDepartmentOpen(true)
  }
  const toggleModule = (moduleId: string) => {
    if (!departmentDraft) return
    const module = DEPARTMENT_MODULES.find((item) => item.id === moduleId)
    if (!module) return
    const enabled = departmentDraft.modules.includes(moduleId)
    setDepartmentDraft({
      ...departmentDraft,
      modules: enabled ? departmentDraft.modules.filter((id) => id !== moduleId) : [...departmentDraft.modules, moduleId],
      features: enabled ? departmentDraft.features.filter((id) => !module.features.some((feature) => feature.id === id)) : [...new Set([...departmentDraft.features, ...module.features.map((feature) => feature.id)])],
    })
  }
  const toggleFeature = (moduleId: string, featureId: string) => {
    if (!departmentDraft) return
    const enabled = departmentDraft.features.includes(featureId)
    const features = enabled ? departmentDraft.features.filter((id) => id !== featureId) : [...departmentDraft.features, featureId]
    setDepartmentDraft({ ...departmentDraft, features, modules: !enabled && !departmentDraft.modules.includes(moduleId) ? [...departmentDraft.modules, moduleId] : departmentDraft.modules })
  }
  const commitDepartment = () => {
    if (!departmentDraft?.name.trim()) return
    const id = departmentDraft.id || departmentDraft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36).slice(-4)
    saveDepartment(t.slug, { ...departmentDraft, id, name: departmentDraft.name.trim() })
    setRbacVersion((version) => version + 1)
    setDepartmentOpen(false)
    toast(`${departmentDraft.name.trim()} access policy saved.`)
  }
  return (
    <div>
      <PageHeader eyebrow="Company administration" title="Company settings" desc={`Identity, login experience, staff access and governance for ${t.profile.name}.`} actions={<Btn v="secondary" to={`/w/${t.slug}/login`}>Preview company login</Btn>} />
      <SettingsNav />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'Overview' && <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Company identity" action={<Btn s="sm" v="secondary" to="/admin/business/settings/profile">Manage</Btn>}><div className="flex items-center gap-3"><TenantMark t={t} size={44} /><div><div className="font-semibold">{t.profile.name}</div><div className="text-xs text-slate">Display name, registration and contact details</div></div></div></Panel>
          <Panel title="Brand identity" action={<Btn s="sm" v="secondary" to="/admin/business/settings/branding">Manage</Btn>}><div className="flex items-center gap-2">{[t.brand.primary, t.brand.secondary, t.brand.accent].map((color) => <span key={color} className="size-7 rounded-md border border-line" style={{ background: color }} />)}<span className="ml-2 text-xs text-slate">{t.brand.logo ? 'Custom logo' : 'Generated mark'}</span></div></Panel>
          <Panel title="Login experience" action={<Btn s="sm" v="secondary" to="/admin/business/settings/branding">Customize</Btn>}><div className="text-sm font-semibold">{t.brand.loginBackground ? 'Custom background active' : 'Brand color background'}</div><div className="mt-1 text-xs text-slate">Logo, login image, company colors and favicon</div></Panel>
          <Panel title="Staff access" action={<Btn s="sm" v="secondary" onClick={() => setTab('Staff & RBAC')}>Review RBAC</Btn>}><div className="num text-2xl font-semibold">{accounts.length}</div><div className="text-xs text-slate">Demo identities across company and own-data scopes</div></Panel>
        </div>}
        {tab === 'Staff & RBAC' && <div className="space-y-5">
          <Panel title="Department access" action={can('company.roles.manage') ? <Btn s="sm" onClick={() => openDepartment()}>Create department</Btn> : undefined}>
            <div className="mb-4 max-w-2xl text-sm text-slate">Group staff by department, assign an operating role, then choose exactly which modules and features that team can use. Performance & attendance is included for every employee.</div>
            {departments.length === 0 ? <div className="rounded-lg border border-dashed border-line bg-cloud p-6 text-center"><div className="font-semibold">No department access policies yet</div><p className="mt-1 text-sm text-slate">Create a department to configure role-based module access.</p></div> : <div className="grid gap-3 md:grid-cols-2">
              {departments.map((department) => <div key={department.id} className="rounded-lg border border-line p-4">
                <div className="flex items-start justify-between gap-3"><div><div className="font-display text-base font-semibold">{department.name}</div><div className="mt-1 flex flex-wrap gap-2"><Badge tone="teal">{department.roleKey}</Badge><Badge tone="gray">{department.memberEmails.length} member{department.memberEmails.length === 1 ? '' : 's'}</Badge></div></div>{can('company.roles.manage') && <Btn s="sm" v="secondary" onClick={() => openDepartment(department)}>Edit</Btn>}</div>
                <div className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate">Module access</div>
                <div className="mt-2 flex flex-wrap gap-1.5">{department.modules.map((moduleId) => <span key={moduleId} className="rounded bg-softmint px-2 py-1 text-xs font-semibold text-teal">{DEPARTMENT_MODULES.find((item) => item.id === moduleId)?.name ?? moduleId}</span>)}</div>
              </div>)}
            </div>}
          </Panel>
          <PermissionsMatrix departments={departments} />
          <Panel title="Role-based access control"><p className="text-sm text-slate">Access is assigned by job role and constrained by company, department or own-record scope. Department policies override the standard module list for assigned members.</p></Panel>
          <Panel pad={false} title="Staff roles and scope"><Table head={['Staff member', 'Email', 'Department', 'Access role', 'Scope', 'Status']} rows={accounts.map((account) => {
            const department = departments.find((item) => item.memberEmails.includes(account.email))
            return [<span key="n" className="flex items-center gap-2 font-semibold"><Avatar name={account.name} size={26} />{account.name}</span>, account.email, department?.name ?? <span key="none" className="text-slate">Unassigned</span>, can('company.roles.manage') ? <select key="r" aria-label={`Access role for ${account.name}`} className={`${inputCls} min-w-44`} value={account.roleKey} disabled={!!department} onChange={(event) => { setDemoAccountRole(t.slug, account.email, event.target.value as BusinessRoleKey); setRbacVersion((version) => version + 1); toast(`${account.name}'s access role updated.`) }}>{[['md', 'CEO / Managing Director'], ['admin', 'Company administrator'], ['hr', 'HR department'], ['finance', 'Finance Officer / CFO'], ['operations', 'Operations manager'], ['sales', 'Sales lead'], ['bdmanager', 'Business Development Manager'], ['businessdev', 'Business Development Officer'], ['manager', 'Department manager'], ['auditor', 'Auditor'], ['employee', 'Employee']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <code key="r" className="font-mono text-xs">{account.roleKey}</code>, <Badge key="s" tone={account.scope === 'Own' ? 'gray' : 'teal'}>{department ? 'Department' : account.scope}</Badge>, <Badge key="a" tone="green">Active</Badge>]
          })} /></Panel>
        </div>}
        {tab === 'Billing & Subscription' && canBilling && <BillingTab actor={`${r.user} (customer)`} openChange={sp.get('change') === '1'} />}
        {tab === 'Audit' && <Panel title="Audit log · append-only">{own ? (ownAudit.length === 0 ? <EmptyState title="No audit events yet" body="Actions taken in your workspace are recorded here automatically." /> : <Timeline items={ownAudit.slice(0, 50).map((a) => ({ t: new Date(a.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), a: a.actor, x: a.action }))} />) : <Timeline items={[...AUDIT.map((a) => ({ t: 'Today ' + a.t, a: a.a, x: a.x })), { t: 'Yesterday 17:04', a: 'Chinedu Eze', x: 'prepared October payroll run' }]} />}</Panel>}
        {tab === 'Security' && (can('company.security.manage') || can('company.audit.view') ? <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Panel><div className="text-xs font-medium text-slate">Privileged identities</div><div className="num mt-1 text-3xl font-semibold">{privileged.length}</div><p className="mt-2 text-xs text-slate">Company Admin, CEO/MD, Finance and HR roles</p></Panel>
            <Panel><div className="text-xs font-medium text-slate">High-risk authorities</div><div className="num mt-1 text-3xl font-semibold">{highRisk.length}</div><p className="mt-2 text-xs text-slate">Approval, payroll, accounting, payment or role-management access</p></Panel>
            <Panel><div className="text-xs font-medium text-slate">Support diagnostics</div><div className="mt-1 text-lg font-semibold">{support?.slug === t.slug ? support.status : 'None'}</div><p className="mt-2 text-xs text-slate">{support?.slug === t.slug ? `${support.ticket} · ${support.reason}` : 'No active or pending grant'}</p></Panel>
          </div>
          <Panel title="Responsibility separation">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-line p-4"><div className="font-semibold">Company Administrator</div><p className="mt-1 text-sm text-slate">Manages users, roles, workspace identity, modules, subscriptions and security. Does not approve payroll, post journals, give MD approval or disburse payments.</p></div>
              <div className="rounded-lg border border-line p-4"><div className="font-semibold">CEO / Managing Director</div><p className="mt-1 text-sm text-slate">Owns executive reporting, final financial approval and governance. Does not administer passwords, subscriptions or routine workspace configuration.</p></div>
            </div>
          </Panel>
          <Panel pad={false} title="Privileged access review">
            <Table head={['Identity', 'Role', 'Sensitive authorities', 'MFA', 'Review']} rows={privileged.map((account) => {
              const permissions = COMPANY_ROLES[account.roleKey].can.filter((permission) => ['payroll.approve', 'accounting.post', 'approvals.decide', 'finance.tiers.manage', 'payments.disburse', 'company.roles.manage'].includes(permission))
              return [<span key="n" className="font-semibold">{account.name}</span>, account.title, permissions.length ? permissions.join(', ') : 'Administrative only', <Badge key="m" tone="green">Required</Badge>, <Badge key="r" tone="blue">Review quarterly</Badge>]
            })} />
          </Panel>
          <Panel title="Security controls"><ul className="space-y-3 text-sm"><li className="flex items-center justify-between gap-3">MFA required for privileged identities <Badge tone="green">Active</Badge></li><li className="flex items-center justify-between gap-3">Support access requires company approval and expires automatically <Badge tone="green">Enforced</Badge></li><li className="flex items-center justify-between gap-3">Platform and company sessions use separate token audiences <Badge tone="green">Separated</Badge></li><li className="flex items-center justify-between gap-3">Audit events are append-only and hash chained <Badge tone="green">Verified</Badge></li></ul></Panel>
        </div> : <div className="rounded-lg border border-line bg-white"><EmptyState title="Security governance is restricted" body="Only authorised company governance roles can review privileged access." /></div>)}
      </div>
      <Overlay open={departmentOpen && !!departmentDraft} onClose={() => setDepartmentOpen(false)} title={departmentDraft?.id ? 'Edit department access' : 'Create department'} wide>
        {departmentDraft && <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department name"><input autoFocus value={departmentDraft.name} onChange={(event) => setDepartmentDraft({ ...departmentDraft, name: event.target.value })} placeholder="e.g. Customer Service" className={inputCls} /></Field>
            <Field label="Department role" hint="Sets the baseline permissions for everyone assigned here."><select value={departmentDraft.roleKey} onChange={(event) => setDepartmentDraft({ ...departmentDraft, roleKey: event.target.value as BusinessRoleKey })} className={inputCls}>{[['hr', 'HR department'], ['finance', 'Finance administrator'], ['operations', 'Operations manager'], ['sales', 'Sales lead'], ['bdmanager', 'Business Development Manager'], ['businessdev', 'Business Development Officer'], ['manager', 'Department manager'], ['auditor', 'Auditor'], ['employee', 'Employee']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          </div>
          <div className="mt-6"><div className="text-sm font-semibold">Assign members</div><p className="mt-1 text-xs text-slate">A staff member can belong to one access department at a time.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{accounts.filter((account) => {
              const assigned = departments.find((department) => department.id !== departmentDraft.id && department.memberEmails.includes(account.email))
              return !assigned && account.roleKey !== 'admin' && account.roleKey !== 'md'
            }).map((account) => {
              const selected = departmentDraft.memberEmails.includes(account.email)
              return <button key={account.email} type="button" aria-pressed={selected} onClick={() => setDepartmentDraft({ ...departmentDraft, memberEmails: selected ? departmentDraft.memberEmails.filter((email) => email !== account.email) : [...departmentDraft.memberEmails, account.email] })} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left ${selected ? 'border-teal bg-softmint' : 'border-line hover:border-teal/50'}`}><Avatar name={account.name} size={28} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{account.name}</span><span className="block truncate text-xs text-slate">{account.title}</span></span><span className={`flex size-5 items-center justify-center rounded border text-xs font-bold ${selected ? 'border-teal bg-teal text-white' : 'border-line'}`}>{selected ? '✓' : ''}</span></button>
            })}</div>
          </div>
          <div className="mt-6"><div className="text-sm font-semibold">Modules and features</div><p className="mt-1 text-xs text-slate">Turn on a module, then refine what this department can do inside it.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{DEPARTMENT_MODULES.filter((module) => module.id !== 'performance').map((module) => {
              const selected = departmentDraft.modules.includes(module.id)
              return <div key={module.id} className={`rounded-lg border p-4 ${selected ? 'border-teal/40 bg-softmint/30' : 'border-line'}`}>
                <button type="button" aria-pressed={selected} onClick={() => toggleModule(module.id)} className="flex w-full cursor-pointer items-start gap-3 text-left"><span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${selected ? 'border-teal bg-teal text-white' : 'border-line'}`}>{selected ? '✓' : ''}</span><span><span className="block text-sm font-semibold">{module.name}</span><span className="mt-0.5 block text-xs text-slate">{module.desc}</span></span></button>
                {selected && <div className="mt-3 space-y-1.5 border-t border-line/70 pt-3">{module.features.map((feature) => {
                  const featureSelected = departmentDraft.features.includes(feature.id)
                  return <label key={feature.id} className="flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={featureSelected} onChange={() => toggleFeature(module.id, feature.id)} className="size-4 accent-teal" />{feature.name}</label>
                })}</div>}
              </div>
            })}</div>
          </div>
          <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-line pt-4">
            <div>{departmentDraft.id && <Btn v="ghost" className="text-err" onClick={() => { deleteDepartment(t.slug, departmentDraft.id); setDepartmentOpen(false); toast(`${departmentDraft.name} deleted.`) }}>Delete department</Btn>}</div>
            <div className="flex gap-2"><Btn v="secondary" onClick={() => setDepartmentOpen(false)}>Cancel</Btn><Btn disabled={!departmentDraft.name.trim() || departmentDraft.modules.length === 0} onClick={commitDepartment}>Save department</Btn></div>
          </div>
        </div>}
      </Overlay>
    </div>
  )
}
