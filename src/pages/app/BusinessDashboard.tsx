import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { Activity, ArrowRight, ArrowUpRight, BarChart3, BriefcaseBusiness, Building2, CheckCircle2, Clock3, Copy, Eye, FileCheck2, Landmark, ListChecks, Send, ShieldCheck, ShoppingCart, Truck, Upload, UserPlus, UsersRound, WalletCards } from 'lucide-react'
import { Badge, Btn, Field, Fold, inputCls, Overlay, Panel, useToast } from '../../components/ui'
import { createInvite, host, inviteState, MODULE_LIST, reviewOnboarding, revokeInvite, useAudit, useInvites, useOnboardingSubmissions, useTenant } from '../../tenant/store'
import { TenantMark, WorkspaceTag } from '../../tenant/ui'
import { approvalsForTenant, employeesForTenant, isOwnDataset, ngn, vehiclesForTenant } from '../../data/demo'
import { useRole } from '../../components/app/AppLayout'
import type { RoleKey } from '../../components/app/AppLayout'
import { CHART, TrendChart } from '../../components/charts'
import SetupChecklist from '../../components/app/SetupChecklist'
import GetStarted from '../../components/app/GetStarted'
import VendorAnalytics from '../../compliance/VendorAnalytics'
import { HrAttendanceAnalysis, MyAttendanceCard } from '../../attendance/Widgets'
import { MyPerformanceCard } from '../../performance/Widgets'

export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTenant()
  const toast = useToast()
  const invites = useInvites(t?.slug ?? '')
  const [code, setCode] = useState('')
  if (!t) return null
  const cur = code && invites.find((i) => i.code === code) ? code : invites.find((i) => inviteState(i, t.slug) === 'ok')?.code ?? ''
  const link = cur ? `${host(t.slug)}/onboarding/${cur}` : ''
  const live = invites.filter((i) => inviteState(i, t.slug) === 'ok')
  return (
    <Overlay open={open} onClose={onClose} title="Invite employee">
      <p className="text-sm text-slate">HR starts the process, then the new employee owns completion. The secure link only works inside {t.profile.name}'s branded workspace.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          ['1', 'HR sends invite', 'Generate and share a secure, single-use link.'],
          ['2', 'Employee completes', 'Personal, bank, emergency and document details.'],
          ['3', 'HR reviews', 'Verify the submission and activate the employee record.'],
        ].map(([number, title, detail]) => <div key={number} className="rounded-lg border border-line bg-cloud p-3"><span className="flex size-6 items-center justify-center rounded-full bg-midnight text-xs font-bold text-white">{number}</span><div className="mt-2 text-sm font-semibold">{title}</div><p className="mt-1 text-xs text-slate">{detail}</p></div>)}
      </div>
      {cur ? (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-md border border-line bg-cloud p-1.5 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{link}</code>
            <Btn s="sm" v="secondary" onClick={() => { navigator.clipboard?.writeText('https://' + link); toast('Onboarding link copied') }}><Copy size={14} />Copy</Btn>
          </div>
          <div className="mt-2 text-xs text-slate">Expires in 7 days · single use · revocable</div>
        </>
      ) : <p className="mt-4 rounded-md bg-cloud px-3 py-2 text-sm">No active link. Generate one to invite an employee.</p>}
      {live.length > 1 && <ul className="mt-3 divide-y divide-line rounded-md border border-line text-sm">{live.map((i) => <li key={i.code} className="flex items-center justify-between gap-2 px-3 py-1.5"><code className="font-mono text-xs">{i.code}</code><button onClick={() => { revokeInvite(i.code); toast('Link revoked') }} className="cursor-pointer text-xs font-semibold text-err">Revoke</button></li>)}</ul>}
      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <div className="flex gap-1"><Btn v="ghost" onClick={() => { setCode(createInvite(t.slug)); toast('New secure link generated') }}>Generate new link</Btn>{cur && <Btn v="ghost" onClick={() => { revokeInvite(cur); setCode(''); toast('Link revoked') }}>Revoke</Btn>}</div>
        {cur && <div className="flex gap-2"><Btn v="secondary" to={`/w/${t.slug}/onboarding/${cur}`}>Preview employee view</Btn><Btn onClick={() => { toast('Invitation sent by email'); onClose() }}><Send size={14} />Email link</Btn></div>}
      </div>
    </Overlay>
  )
}

const TaskRow = ({ count: n, label, detail, to, tone = 'teal' }: { count: number; label: string; detail: string; to: string; tone?: string }) => (
  <Link to={to} className="group flex items-center gap-3 border-b border-line/70 py-2.5 last:border-0">
    <span className="num flex size-9 items-center justify-center rounded-lg bg-cloud font-display text-sm font-semibold text-ink">{n}</span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block truncate text-xs text-slate">{detail}</span></span>
    <Badge tone={tone}>Open</Badge><ArrowUpRight size={15} className="text-slate transition-colors group-hover:text-teal" />
  </Link>
)

type DashboardAction = { label: string; to: string }
type DashboardFocus = { label: string; detail: string; to: string; count: number; tone?: string }
type DashboardBlueprint = {
  eyebrow: string
  title: string
  summary: string
  actions: DashboardAction[]
  focus: DashboardFocus[]
  responsibilities: [string, string, string][]
}

const BLUEPRINTS: Record<Exclude<RoleKey, 'employee' | 'platform' | 'support'>, DashboardBlueprint> = {
  md: {
    eyebrow: 'Executive command centre', title: 'Company performance and decisions', summary: 'Monitor enterprise health, unblock high-value decisions and keep leadership priorities moving.',
    actions: [{ label: 'Review approvals', to: '/admin/business/approvals' }, { label: 'Open reports', to: '/admin/business/reports' }, { label: 'View business health', to: '/admin/business/health' }],
    focus: [
      { count: 4, label: 'Executive approvals', detail: 'High-value requests awaiting final decision', to: '/admin/business/approvals', tone: 'amber' },
      { count: 3, label: 'Business risks', detail: 'Control or performance signals requiring attention', to: '/admin/business/health', tone: 'red' },
      { count: 2, label: 'Leadership tasks', detail: 'Strategic actions due this week', to: '/admin/business/tasks' },
    ],
    responsibilities: [['Performance', 'Revenue, costs and operating health', '/admin/business/health'], ['Governance', 'Approvals, controls and accountability', '/admin/business/approvals'], ['People', 'Leadership capacity and workforce health', '/admin/business/people']],
  },
  admin: {
    eyebrow: 'Workspace administration', title: 'Company setup and access', summary: 'Keep people, permissions, modules and company configuration accurate and secure.',
    actions: [{ label: 'Add employee', to: '/admin/business/people' }, { label: 'Manage users', to: '/admin/business/settings' }, { label: 'Company settings', to: '/admin/business/settings/profile' }],
    focus: [
      { count: 3, label: 'Onboarding records', detail: 'Profiles or documents still incomplete', to: '/admin/business/people', tone: 'amber' },
      { count: 2, label: 'Access reviews', detail: 'Permission changes awaiting confirmation', to: '/admin/business/settings' },
      { count: 1, label: 'Workspace configuration', detail: 'Company profile field needs attention', to: '/admin/business/settings/profile' },
    ],
    responsibilities: [['People access', 'Accounts, roles and permissions', '/admin/business/settings'], ['Configuration', 'Company profile, branding and modules', '/admin/business/settings/profile'], ['Compliance', 'Activity log and workspace security', '/admin/business/settings?tab=security']],
  },
  hr: {
    eyebrow: 'Human capital', title: 'People operations', summary: 'Prioritise onboarding, attendance, leave and employee records across the organisation.',
    actions: [{ label: 'Create employee', to: '/admin/business/people' }, { label: 'Review requests', to: '/admin/business/approvals' }, { label: 'People report', to: '/admin/business/reports' }],
    focus: [
      { count: 3, label: 'New joiners', detail: 'Onboarding steps to complete this month', to: '/admin/business/people', tone: 'amber' },
      { count: 5, label: 'Leave requests', detail: 'Manager or HR decisions are pending', to: '/admin/business/approvals' },
      { count: 4, label: 'Employee documents', detail: 'Signatures or acknowledgements outstanding', to: '/admin/business/documents' },
    ],
    responsibilities: [['Employee lifecycle', 'Records, onboarding and offboarding', '/admin/business/people'], ['Attendance & leave', 'Daily exceptions and time away', '/admin/business/people'], ['People compliance', 'Contracts and employee documents', '/admin/business/documents']],
  },
  finance: {
    eyebrow: 'Finance control desk', title: 'Payroll, cash and controls', summary: 'Close financial work accurately, disburse approved payments and keep statutory obligations on schedule.',
    actions: [{ label: 'Review payroll', to: '/admin/business/payroll' }, { label: 'Open accounting', to: '/admin/business/accounting' }, { label: 'Payments queue', to: '/admin/business/approvals' }],
    focus: [
      { count: 1, label: 'Payroll approval', detail: 'October run is under review before the MD approves', to: '/admin/business/payroll', tone: 'amber' },
      { count: 6, label: 'Approved payments', detail: 'MD-approved expenses and purchases awaiting disbursement', to: '/admin/business/approvals' },
      { count: 3, label: 'Reconciliation items', detail: 'Exceptions require investigation', to: '/admin/business/accounting', tone: 'red' },
    ],
    responsibilities: [['Payroll', 'Review payroll and disburse once the MD approves', '/admin/business/payroll'], ['Accounting', 'Reconciliations, journals and period close', '/admin/business/accounting'], ['Controls', 'Disbursement controls and statutory remittances', '/admin/business/approvals']],
  },
  operations: {
    eyebrow: 'Operations control room', title: 'Service delivery and exceptions', summary: 'Keep daily operations flowing, resolve exceptions and coordinate resources across locations.',
    actions: [{ label: 'Operations tasks', to: '/admin/business/tasks' }, { label: 'Procurement', to: '/admin/business/procurement' }, { label: 'Review requests', to: '/admin/business/approvals' }],
    focus: [
      { count: 7, label: 'Operational exceptions', detail: 'Items outside service or settlement targets', to: '/admin/business/tasks', tone: 'red' },
      { count: 4, label: 'Purchase requests', detail: 'Requests waiting for operational review', to: '/admin/business/procurement', tone: 'amber' },
      { count: 2, label: 'Asset actions', detail: 'Assignments or maintenance due', to: '/admin/business/assets' },
    ],
    responsibilities: [['Daily operations', 'Queues, exceptions and service levels', '/admin/business/tasks'], ['Procurement', 'Requests, orders and receipts', '/admin/business/procurement'], ['Resources', 'Assets, vendors and operating capacity', '/admin/business/assets']],
  },
  sales: {
    eyebrow: 'Commercial workspace', title: 'Pipeline and customer growth', summary: 'Move priority opportunities forward, coordinate follow-ups and protect revenue momentum.',
    actions: [{ label: 'Open pipeline', to: '/admin/business/crm' }, { label: 'Sales tasks', to: '/admin/business/tasks' }, { label: 'Generate report', to: '/admin/business/reports' }],
    focus: [
      { count: 5, label: 'Follow-ups due', detail: 'Customer actions due today or overdue', to: '/admin/business/tasks', tone: 'amber' },
      { count: 3, label: 'Proposals in review', detail: 'Commercial proposals awaiting feedback', to: '/admin/business/crm' },
      { count: 2, label: 'Renewal risks', detail: 'Accounts needing an engagement plan', to: '/admin/business/crm', tone: 'red' },
    ],
    responsibilities: [['Pipeline', 'Leads, opportunities and forecasts', '/admin/business/crm'], ['Customer actions', 'Meetings, proposals and follow-ups', '/admin/business/tasks'], ['Performance', 'Conversion and revenue reporting', '/admin/business/reports']],
  },
  bdmanager: {
    eyebrow: 'Business development command centre', title: 'Partnerships, markets and growth', summary: 'Lead partnership development, coordinate market expansion and keep cross-functional growth initiatives moving.',
    actions: [{ label: 'Open growth pipeline', to: '/admin/business/crm' }, { label: 'Review team travel', to: '/admin/business/travel' }, { label: 'Growth reports', to: '/admin/business/reports' }],
    focus: [
      { count: 6, label: 'Active partnerships', detail: 'Strategic conversations in qualification or negotiation', to: '/admin/business/crm' },
      { count: 4, label: 'Growth initiatives', detail: 'Cross-functional market actions due this month', to: '/admin/business/tasks', tone: 'amber' },
      { count: 2, label: 'Team travel requests', detail: 'Market visits requiring review or preparation', to: '/admin/business/travel' },
    ],
    responsibilities: [['Partnership portfolio', 'Pipeline, partners and commercial opportunities', '/admin/business/crm'], ['Market expansion', 'New locations, segments and strategic initiatives', '/admin/business/tasks'], ['Team leadership', 'Business Development people, travel and delivery', '/admin/business/organization']],
  },
  businessdev: {
    eyebrow: 'Business development', title: 'Partnerships and new markets', summary: 'Complete your onboarding, develop priority partnerships and coordinate growth opportunities across the company.',
    actions: [{ label: 'Open my workspace', to: '/admin/business/my' }, { label: 'View organisation', to: '/admin/business/organization' }, { label: 'Create travel request', to: '/admin/business/travel' }],
    focus: [
      { count: 3, label: 'Onboarding actions', detail: 'Profile, documents and orientation steps to complete', to: '/admin/business/my', tone: 'amber' },
      { count: 4, label: 'Partnership follow-ups', detail: 'Growth conversations requiring an update', to: '/admin/business/crm' },
      { count: 2, label: 'Market visits', detail: 'Travel requests and preparations in progress', to: '/admin/business/travel' },
    ],
    responsibilities: [['Partnerships', 'Develop strategic relationships and opportunities', '/admin/business/crm'], ['New markets', 'Research and coordinate growth initiatives', '/admin/business/tasks'], ['Company collaboration', 'Work across teams, branches and travel', '/admin/business/organization']],
  },
  manager: {
    eyebrow: 'Team leadership', title: 'Team delivery and support', summary: 'Manage team workload, approve employee requests and keep performance conversations on track.',
    actions: [{ label: 'View team', to: '/admin/business/people' }, { label: 'Team approvals', to: '/admin/business/approvals' }, { label: 'Assign task', to: '/admin/business/tasks' }],
    focus: [
      { count: 4, label: 'Team approvals', detail: 'Leave and expense requests need a decision', to: '/admin/business/approvals', tone: 'amber' },
      { count: 6, label: 'Open team tasks', detail: 'Work due before the end of this week', to: '/admin/business/tasks' },
      { count: 2, label: 'People check-ins', detail: 'One-to-ones and reviews to complete', to: '/admin/business/people' },
    ],
    responsibilities: [['Team capacity', 'Attendance, availability and workload', '/admin/business/people'], ['Approvals', 'Leave, expenses and team requests', '/admin/business/approvals'], ['Delivery', 'Tasks, outcomes and follow-through', '/admin/business/tasks']],
  },
  compliance: {
    eyebrow: 'Regulatory oversight', title: 'Compliance and policy checks', summary: 'Review requests that your company routes through Compliance, and keep regulatory evidence current.',
    actions: [{ label: 'Approval queue', to: '/admin/business/approvals' }, { label: 'Vendor compliance', to: '/admin/business/vendors' }, { label: 'Review documents', to: '/admin/business/documents' }],
    focus: [
      { count: 2, label: 'Requests awaiting compliance', detail: 'Routed to you by the company approval flow', to: '/admin/business/approvals', tone: 'red' },
      { count: 4, label: 'Vendor documents expiring', detail: 'Licences and certificates due within 60 days', to: '/admin/business/vendors', tone: 'amber' },
      { count: 1, label: 'Policy acknowledgements', detail: 'Staff yet to acknowledge the latest policy', to: '/admin/business/documents' },
    ],
    responsibilities: [['Approvals', 'Compliance step on regulated requests', '/admin/business/approvals'], ['Vendors', 'Licences, tax and registration evidence', '/admin/business/vendors'], ['Evidence', 'Policies, documents and traceability', '/admin/business/documents']],
  },
  auditor: {
    eyebrow: 'Risk and assurance', title: 'Controls and audit readiness', summary: 'Review exceptions, verify evidence and maintain independent oversight of company controls.',
    actions: [{ label: 'Audit queue', to: '/admin/business/approvals' }, { label: 'Audit reports', to: '/admin/business/reports' }, { label: 'Review documents', to: '/admin/business/documents' }, { label: 'Activity log', to: '/admin/business/settings' }],
    focus: [
      { count: 3, label: 'Requests awaiting audit', detail: 'Audit reviews every request before the MD', to: '/admin/business/approvals', tone: 'red' },
      { count: 3, label: 'Control exceptions', detail: 'Items requiring evidence or remediation', to: '/admin/business/reports', tone: 'red' },
      { count: 7, label: 'Evidence requests', detail: 'Documents awaiting review or verification', to: '/admin/business/documents', tone: 'amber' },
      { count: 2, label: 'Access observations', detail: 'Role or permission changes to inspect', to: '/admin/business/settings' },
    ],
    responsibilities: [['Assurance', 'Control testing and exception follow-up', '/admin/business/reports'], ['Evidence', 'Documents, signatures and traceability', '/admin/business/documents'], ['Access oversight', 'Roles, permissions and audit activity', '/admin/business/settings']],
  },
}

const B = '/admin/business'
const METRIC_ROUTES: [RegExp, string][] = [
  [/pending decisions|approvals|open requests|leave queue|payments pipeline|purchase value/i, `${B}/approvals`],
  [/workforce|workspace users|team members|new joiners|people records|onboarding/i, `${B}/people`],
  [/present today|attendance/i, `${B}/attendance`],
  [/payroll/i, `${B}/payroll`],
  [/settlement|receivables|close readiness|cash/i, `${B}/accounting`],
  [/active modules|module adoption/i, `${B}/modules`],
  [/fleet/i, `${B}/fleet`],
  [/document/i, `${B}/documents`],
  [/pipeline|win rate|follow-ups|proposals|conversion|partnership/i, `${B}/crm`],
  [/tasks|initiatives|growth/i, `${B}/tasks`],
  [/travel|market visits/i, `${B}/travel`],
  [/evidence|findings|control|access|risks/i, `${B}/reports`],
  [/service level|exceptions|transactions|jobs|payment success|service delivery/i, `${B}/reports`],
]
const metricTo = (label: string) => METRIC_ROUTES.find(([re]) => re.test(label))?.[1]

function MetricCard({ label, value, detail, icon, tone = 'text-teal' }: { label: string; value: string; detail: string; icon: ReactNode; tone?: string }) {
  const to = metricTo(label)
  const body = (
    <Panel className={to ? 'h-full transition-colors group-hover:border-teal group-active:bg-cloud' : ''}>
      <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-wide text-slate">{label}</div><div className="num mt-2 break-words font-display text-xl font-semibold sm:text-3xl">{value}</div></div><span className={`rounded-lg bg-cloud p-2.5 max-sm:hidden ${tone}`}>{icon}</span></div>
      <p className="mt-2 text-xs text-slate">{detail}</p>
      {to && <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-teal">Open <ArrowRight size={12} /></span>}
    </Panel>
  )
  return to ? <Link to={to} aria-label={`${label}: ${value}. Open details`} className="group block">{body}</Link> : body
}

const PERF_PARTS: [string, number, number, string][] = [
  ['Revenue vs budget', 30, 94, 'Accounting'], ['Operating margin vs target', 20, 92, 'Accounting'], ['Collections on time', 15, 87, 'Receivables'],
  ['Approval turnaround vs SLA', 15, 88, 'Approvals'], ['Attendance rate', 10, 93, 'Attendance'], ['Task completion', 10, 89, 'Tasks'],
]
const PERFORMANCE = [
  { m: 'May', actual: 72, target: 78 },
  { m: 'Jun', actual: 77, target: 80 },
  { m: 'Jul', actual: 75, target: 82 },
  { m: 'Aug', actual: 84, target: 84 },
  { m: 'Sep', actual: 87, target: 86 },
  { m: 'Oct', actual: 91, target: 88 },
]

const PERFORMANCE_TITLES: Partial<Record<RoleKey, string>> = {
  md: 'Company performance',
  admin: 'Workspace readiness',
  hr: 'People operations completion',
  finance: 'Finance close performance',
  operations: 'Service delivery performance',
  sales: 'Commercial target attainment',
  bdmanager: 'Growth portfolio performance',
  manager: 'Team delivery performance',
  auditor: 'Control completion',
  compliance: 'Policy compliance',
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }

export default function BusinessDashboard() {
  const t = useTenant()
  const { r, role } = useRole()
  const toast = useToast()
  const [invite, setInvite] = useState(false)
  const [reviewing, setReviewing] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const audit = useAudit(t?.slug)
  const onboardingSubmissions = useOnboardingSubmissions(t?.slug)
  if (!t) return null
  if (r.scope === 'Own') return <Navigate to="/admin/business/my" replace />
  if (isOwnDataset(t.slug)) return <><GetStarted onInvite={() => setInvite(true)} title={greeting()} /><InviteDialog open={invite} onClose={() => setInvite(false)} /></>
  const employees = employeesForTenant(t.slug)
  const approvals = approvalsForTenant(t.slug)
  const blueprint = BLUEPRINTS[(role in BLUEPRINTS ? role : 'admin') as keyof typeof BLUEPRINTS]
  const active = employees.filter((employee) => employee.status === 'Active').length
  const onLeave = employees.filter((employee) => employee.status === 'On leave').length
  const onboarding = employees.filter((employee) => employee.status === 'Onboarding').length
  const pendingApprovals = approvals.filter((approval) => approval.stage !== 'Approved').length
  const gross = employees.reduce((sum, employee) => sum + employee.salary, 0)
  const paymentCompany = t.slug === 'etranzact'
  const first = r.user.split(' ')[0]
  const hr = new Date().getHours()
  const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'
  const roleMetrics: Partial<Record<RoleKey, [string, string, string, ReactNode][]>> = {
    md: [['Workforce', String(t.employees), `${active} active demo records`, <UsersRound size={19} />], ['Pending decisions', String(pendingApprovals), 'Final approval rests with you', <CheckCircle2 size={19} />], [paymentCompany ? 'Payment success' : 'Service delivery', paymentCompany ? '99.2%' : '94.8%', 'Current month performance', <BarChart3 size={19} />], ['Open risks', '3', 'Two require leadership action', <ShieldCheck size={19} />]],
    admin: [['Workspace users', String(employees.length), 'Configured demo accounts and staff', <UsersRound size={19} />], ['Onboarding', String(onboarding), 'Profiles still being completed', <UserPlus size={19} />], ['Active modules', `${t.modules.length}/${MODULE_LIST.length}`, `${t.plan} workspace`, <Building2 size={19} />], ['Access reviews', '2', 'Due this week', <ShieldCheck size={19} />]],
    hr: [['Company workforce', String(t.employees), `${employees.length} detailed demo records`, <UsersRound size={19} />], ['Present today', `${Math.round((active / Math.max(1, employees.length)) * 100)}%`, `${onLeave} currently on leave`, <CheckCircle2 size={19} />], ['New joiners', String(onboarding), 'Onboarding in progress', <UserPlus size={19} />], ['Leave queue', '5', 'Three need HR review', <Clock3 size={19} />]],
    finance: [['Gross payroll sample', ngn(gross), `${employees.length} detailed records`, <WalletCards size={19} />], ['Payments pipeline', String(pendingApprovals), 'MD approves, Finance disburses', <CheckCircle2 size={19} />], [paymentCompany ? 'Settlement value' : 'Receivables', paymentCompany ? '₦128.5M' : '₦31.7M', 'Reconciliation in progress', <Landmark size={19} />], ['Close readiness', '82%', 'Three exceptions open', <BarChart3 size={19} />]],
    operations: [[paymentCompany ? 'Transactions today' : 'Jobs today', paymentCompany ? '1.84M' : '148', 'Across all service channels', <BriefcaseBusiness size={19} />], ['Service level', '98.7%', 'Above the current target', <CheckCircle2 size={19} />], ['Exceptions', '7', 'Three are high priority', <ShieldCheck size={19} />], ['Open requests', String(pendingApprovals), 'Operational decisions pending', <ListChecks size={19} />]],
    sales: [['Qualified pipeline', '₦117M', '14 active opportunities', <BriefcaseBusiness size={19} />], ['Win rate', '31%', 'Up 4 points this quarter', <BarChart3 size={19} />], ['Follow-ups due', '5', 'Two are overdue', <Clock3 size={19} />], ['Proposals', '3', 'Awaiting customer response', <FileCheck2 size={19} />]],
    bdmanager: [['Partnership pipeline', '₦84M', 'Six strategic opportunities', <BriefcaseBusiness size={19} />], ['Market initiatives', '4', 'Two due this week', <ListChecks size={19} />], ['Team travel', '2', 'One awaiting preparation', <Building2 size={19} />], ['Conversion outlook', '37%', 'Up 5 points this quarter', <BarChart3 size={19} />]],
    businessdev: [['Onboarding', '25%', 'Profile submitted; documents remain', <UserPlus size={19} />], ['Partnerships', '6', 'Four active conversations', <BriefcaseBusiness size={19} />], ['Market visits', '2', 'One awaiting preparation', <Building2 size={19} />], ['Growth tasks', '4', 'Due this week', <ListChecks size={19} />]],
    manager: [['Team members', '12', `${Math.max(0, 12 - onLeave)} available today`, <UsersRound size={19} />], ['Team attendance', '92%', 'One late arrival', <CheckCircle2 size={19} />], ['Approvals', '4', 'Leave and expense requests', <ListChecks size={19} />], ['Tasks due', '6', 'Before Friday', <Clock3 size={19} />]],
    auditor: [['Control coverage', '86%', 'Current audit plan', <ShieldCheck size={19} />], ['Open findings', '3', 'One high-risk observation', <FileCheck2 size={19} />], ['Evidence requests', '7', 'Four received this week', <ListChecks size={19} />], ['Access changes', '2', 'Awaiting independent review', <UsersRound size={19} />]],
  }
  const metrics = roleMetrics[role] ?? roleMetrics.admin!
  const insightAccess = role === 'admin' || role === 'md'
  const branchNames = [...new Set(employees.map((employee) => employee.branch))]
  const branchPurchases = branchNames.map((branch) => {
    const items = approvals.filter((approval) => approval.branch === branch && approval.amount > 0)
    return { branch, count: items.length, value: items.reduce((sum, item) => sum + item.amount, 0), pending: items.filter((item) => item.stage !== 'Approved').length }
  }).sort((a, b) => b.value - a.value)
  const maxBranchPurchase = Math.max(1, ...branchPurchases.map((branch) => branch.value))
  const fleetBranches = t.slug === 'etranzact'
    ? [{ branch: 'Victoria Island HQ', total: 8, attention: 1 }, { branch: 'Ikeja Technology Hub', total: 4, attention: 0 }, { branch: 'Abuja Office', total: 3, attention: 1 }, { branch: 'Port Harcourt Office', total: 2, attention: 0 }]
    : branchNames.map((branch) => {
      const vehicles = vehiclesForTenant(t.slug).filter((vehicle) => vehicle.branch === branch)
      return { branch, total: vehicles.length, attention: vehicles.filter((vehicle) => vehicle.status !== 'Active').length }
    }).filter((branch) => branch.total > 0)
  const fleetTotal = fleetBranches.reduce((sum, branch) => sum + branch.total, 0)
  const fleetAttention = fleetBranches.reduce((sum, branch) => sum + branch.attention, 0)
  const documentInsights = t.slug === 'etranzact'
    ? [{ name: 'Policy & compliance', uploads: 42, views: 318 }, { name: 'Employee files', uploads: 31, views: 204 }, { name: 'Commercial agreements', uploads: 18, views: 167 }]
    : [{ name: 'Employee files', uploads: 24, views: 186 }, { name: 'Fleet documents', uploads: 17, views: 129 }, { name: 'Purchase records', uploads: 13, views: 94 }]
  const onboardingReview = onboardingSubmissions.find((submission) => submission.id === reviewing)
  const pendingOnboarding = onboardingSubmissions.filter((submission) => submission.status !== 'Approved')

  return (
    <div className="space-y-6">
      <div className="overview-hero">
        <div className="flex flex-wrap items-start gap-4">
          <div className="rounded-xl bg-white/80 p-2 shadow-sm ring-1 ring-teal/10"><TenantMark t={t} size={48} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-teal">{blueprint.eyebrow}</p>
            <h1 className="mt-1 text-3xl font-semibold leading-tight">{greet}, {first}</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate">{blueprint.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2"><WorkspaceTag t={t} /><Badge tone="green">Workspace active</Badge><Badge tone="blue">{r.title}</Badge></div>
          </div>
          <div className="w-full rounded-xl border border-white/80 bg-white/70 px-4 py-3 shadow-sm sm:w-auto"><div className="text-xs text-slate">{t.profile.name}</div><div className="mt-1 text-sm font-semibold">October 2026 cycle</div><div className="mt-1 font-mono text-xs text-slate">{host(t.slug)}</div></div>
        </div>
        <section aria-label="Role actions" className="mt-5 flex flex-wrap gap-2 border-t border-teal/10 pt-4">
          {blueprint.actions.map((action, index) => <Btn key={action.label} to={action.to} v={index === 0 ? 'primary' : 'secondary'}>{action.label}{index === 0 && <ArrowRight size={15} />}</Btn>)}
          {(role === 'admin' || role === 'hr') && <Btn v="secondary" onClick={() => setInvite(true)}><Send size={15} />Invite employee</Btn>}
        </section>
      </div>
      <InviteDialog open={invite} onClose={() => setInvite(false)} />
      {(role === 'admin' || role === 'operations') && <Fold title="Vendor analytics" hint="Payables, ageing and vendors needing action" defaultOpen><VendorAnalytics slug={t.slug} /></Fold>}
      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Panel title="Needs you now" action={<Link to="/admin/business/tasks" className="text-xs font-semibold text-teal">Open all tasks</Link>}>
          <div>{blueprint.focus.map((item) => <TaskRow key={item.label} {...item} />)}</div>
        </Panel>
        <Panel title="Your responsibilities" action={<Badge tone="blue">{r.title}</Badge>}>
          <div className="space-y-1">
            {blueprint.responsibilities.map(([label, detail, to]) => <Link key={label} to={to} className="group flex items-start gap-3 rounded-lg p-3 hover:bg-cloud"><span className="mt-0.5 rounded-md bg-softmint p-1.5 text-teal"><CheckCircle2 size={15} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-slate">{detail}</span></span><ArrowRight size={15} className="mt-1 text-slate group-hover:text-teal" /></Link>)}
          </div>
        </Panel>
      </div>

      {(role === 'admin' || role === 'md') && <SetupChecklist slug={t.slug} employees={employees.length} showAttendance={t.modules.includes('attendance')} />}
      <MyPerformanceCard slug={t.slug} name={r.user} empId={r.id} />
      {t.modules.includes('attendance') && (['hr', 'md', 'admin'].includes(role)
        ? <><Fold title="Attendance analysis" hint="Today, trend and departments" defaultOpen={role === 'hr'}><HrAttendanceAnalysis slug={t.slug} dense={role !== 'hr'} /></Fold><MyAttendanceCard slug={t.slug} name={r.user} empId={r.id} /></>
        : <MyAttendanceCard slug={t.slug} name={r.user} empId={r.id} />)}
      {(role === 'hr' || role === 'admin' || role === 'md') && <Panel title="New staff onboarding review" action={<Badge tone={pendingOnboarding.length ? 'amber' : 'green'}>{pendingOnboarding.length} awaiting HR</Badge>}>
        {pendingOnboarding.length === 0 ? <div className="rounded-lg bg-cloud p-4 text-sm text-slate">No onboarding submissions currently need HR attention. New submissions appear here immediately.</div> : <div className="divide-y divide-line">{pendingOnboarding.map((submission) => <div key={submission.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="flex size-10 items-center justify-center rounded-full bg-softmint font-semibold text-teal">{submission.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span className="min-w-0 flex-1"><b className="block text-sm">{submission.name}</b><span className="block text-xs text-slate">{submission.title} · {submission.department} · {submission.documents.length} documents</span></span><Badge tone={submission.status === 'More details required' ? 'amber' : 'blue'}>{submission.status}</Badge><Btn s="sm" v="secondary" onClick={() => { setReviewing(submission.id); setReviewNote(submission.note ?? '') }}>Review now</Btn></div>)}</div>}
        {onboardingSubmissions.some((submission) => submission.status === 'Approved') && <div className="mt-4 border-t border-line pt-4"><div className="text-xs font-semibold uppercase tracking-wider text-slate">Recently approved</div><div className="mt-2 flex flex-wrap gap-2">{onboardingSubmissions.filter((submission) => submission.status === 'Approved').slice(0, 3).map((submission) => <Badge key={submission.id} tone="green">{submission.name} · Activated</Badge>)}</div></div>}
      </Panel>}
      <Overlay open={!!onboardingReview} onClose={() => setReviewing('')} title="Review staff onboarding" wide>
        {onboardingReview && <div>
          <div className="grid gap-4 rounded-lg bg-cloud p-4 text-sm sm:grid-cols-2"><div><span className="text-xs text-slate">Employee</span><div className="font-semibold">{onboardingReview.name}</div></div><div><span className="text-xs text-slate">Role</span><div className="font-semibold">{onboardingReview.title}</div></div><div><span className="text-xs text-slate">Department</span><div className="font-semibold">{onboardingReview.department}</div></div><div><span className="text-xs text-slate">Contact</span><div className="font-semibold">{onboardingReview.email}<br />{onboardingReview.phone}</div></div></div>
          <div className="mt-5"><div className="text-sm font-semibold">Uploaded documents</div><div className="mt-2 flex flex-wrap gap-2">{onboardingReview.documents.length ? onboardingReview.documents.map((document) => <Badge key={document} tone="gray">{document}</Badge>) : <span className="text-sm text-slate">No documents were uploaded.</span>}</div></div>
          <div className="mt-5"><Field label="HR review note" hint="Required when asking the employee for more information."><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={3} placeholder="Explain missing or incorrect information clearly." className={`${inputCls} h-auto py-2`} /></Field></div>
          <div className="mt-5 rounded-lg border border-line p-4"><div className="text-sm font-semibold">On approval, BizFlow will notify</div><div className="mt-2 grid gap-2 text-xs text-slate sm:grid-cols-2"><span>IT · account and equipment setup</span><span>Finance · payroll and bank setup</span><span>Branch admin · access and orientation</span><span>Employee · workspace activated</span></div></div>
          <div className="mt-6 flex flex-wrap justify-end gap-2"><Btn v="secondary" disabled={!reviewNote.trim()} onClick={() => { reviewOnboarding(onboardingReview.id, 'More details required', r.user, reviewNote.trim()); setReviewing(''); toast('Employee notified to provide more onboarding details.') }}>Ask for more details</Btn><Btn onClick={() => { reviewOnboarding(onboardingReview.id, 'Approved', r.user, reviewNote.trim()); setReviewing(''); toast('Onboarding approved. IT, Finance, branch admin and the employee were notified.') }}>Approve & activate</Btn></div>
        </div>}
      </Overlay>

      <section aria-label={`${blueprint.title} metrics`} className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {metrics.map(([label, value, detail, icon]) => <MetricCard key={label} label={label} value={value} detail={detail} icon={icon} />)}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Panel title={PERFORMANCE_TITLES[role] ?? 'Operating performance'} action={<div className="text-right"><div className="num text-sm font-semibold text-ok">91% current</div><div className="text-[11px] text-slate">3 pts above target</div></div>}>
          <TrendChart data={PERFORMANCE} series={[{ key: 'actual', label: 'Actual' }, { key: 'target', label: 'Target', color: CHART.axis, dashed: true }]} fmt={(value) => `${value}%`} label={`${PERFORMANCE_TITLES[role] ?? 'Operating performance'} actual versus target`} height={220} />
          {(role === 'md' || role === 'admin') && (
            <details className="mt-4 rounded-lg bg-cloud p-3 text-sm">
              <summary className="min-h-9 cursor-pointer font-semibold">How this score is calculated</summary>
              <p className="mt-2 text-xs text-slate">A weighted index from six measures, each scored against its own target. Target line = the index if every measure just met target.</p>
              <ul className="mt-2 divide-y divide-line/70 text-xs">
                {PERF_PARTS.map(([n, w, sc, src]) => <li key={n} className="flex items-center justify-between gap-3 py-1.5"><span><b className="text-ink">{n}</b> <span className="text-slate">· {w}% · {src}</span></span><span className="num font-semibold">{sc}</span></li>)}
              </ul>
            </details>
          )}
        </Panel>
        <Panel title="Operating health" action={<Badge tone="green">On track</Badge>}>
          <div className="space-y-4">
            {[
              ['Approvals completed', '84%', 'w-5/6'],
              ['People records ready', '92%', 'w-11/12'],
              ['Module adoption', `${Math.round((t.modules.length / MODULE_LIST.length) * 100)}%`, t.modules.length >= MODULE_LIST.length - 1 ? 'w-11/12' : t.modules.length >= 5 ? 'w-3/4' : 'w-1/2'],
              ['Control checks', '67%', 'w-2/3'],
            ].map(([label, value, width]) => <div key={label}><div className="mb-1.5 flex items-center justify-between text-sm"><span>{label}</span><b className="num">{value}</b></div><div className="h-2 overflow-hidden rounded-full bg-cloud"><div className={`h-full rounded-full bg-teal ${width}`} /></div></div>)}
          </div>
          <div className="mt-5 border-t border-line pt-4"><Link to="/admin/business/reports" className="inline-flex items-center gap-1 text-xs font-semibold text-teal">Open performance reports <ArrowRight size={13} /></Link></div>
        </Panel>
      </div>

      {insightAccess && <Fold title="Administrative insights" hint="Purchases, fleet, documents and activity"><section aria-label="Administrative insights" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
          <div><div className="text-xs font-semibold uppercase tracking-wider text-teal">Administrative insights</div><h2 className="mt-1 font-display text-xl font-semibold">Activity across the company</h2><p className="mt-1 text-sm text-slate">Purchases, fleet readiness, document engagement and administrator actions in one view.</p></div>
          <Btn s="sm" v="secondary" to="/admin/business/reports">Open detailed reports</Btn>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Purchase value" value={ngn(approvals.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0))} detail={`${approvals.filter((item) => item.amount > 0 && item.stage !== 'Approved').length} requests still in approval`} icon={<ShoppingCart size={19} />} />
          <MetricCard label="Fleet readiness" value={`${fleetTotal - fleetAttention}/${fleetTotal}`} detail={`${fleetAttention} vehicle${fleetAttention === 1 ? '' : 's'} need attention`} icon={<Truck size={19} />} tone="text-info" />
          <MetricCard label="Document uploads" value={String(documentInsights.reduce((sum, item) => sum + item.uploads, 0))} detail="Uploaded across active document areas" icon={<Upload size={19} />} tone="text-ok" />
          <MetricCard label="Document views" value={String(documentInsights.reduce((sum, item) => sum + item.views, 0))} detail="Views recorded during this reporting cycle" icon={<Eye size={19} />} tone="text-warn" />
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Panel title="Company purchases by branch" action={<Link to="/admin/business/procurement" className="text-xs font-semibold text-teal">Open procurement</Link>}>
            <div className="space-y-4">
              {branchPurchases.map((branch) => <div key={branch.branch}>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold">{branch.branch}</span><span className="num font-semibold">{ngn(branch.value)} <span className="font-sans text-xs font-normal text-slate">· {branch.count} request{branch.count === 1 ? '' : 's'}</span></span></div>
                <div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-cloud"><div className={`h-full rounded-full bg-teal ${branch.value / maxBranchPurchase > 0.8 ? 'w-full' : branch.value / maxBranchPurchase > 0.55 ? 'w-3/4' : branch.value / maxBranchPurchase > 0.3 ? 'w-1/2' : branch.value > 0 ? 'w-1/4' : 'w-1'}`} /></div><Badge tone={branch.pending ? 'amber' : 'green'}>{branch.pending ? `${branch.pending} pending` : 'Clear'}</Badge></div>
              </div>)}
            </div>
          </Panel>
          <Panel title="Fleet status by branch" action={<Link to="/admin/business/fleet" className="text-xs font-semibold text-teal">Open fleet</Link>}>
            <div className="space-y-2">{fleetBranches.map((branch) => <div key={branch.branch} className="flex items-center gap-3 rounded-lg border border-line p-3"><span className={`flex size-9 items-center justify-center rounded-lg ${branch.attention ? 'bg-amber-50 text-warn' : 'bg-softmint text-teal'}`}><Truck size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{branch.branch}</span><span className="text-xs text-slate">{branch.total} vehicle{branch.total === 1 ? '' : 's'}</span></span><Badge tone={branch.attention ? 'amber' : 'green'}>{branch.attention ? 'Attention' : 'Ready'}</Badge></div>)}</div>
          </Panel>
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <Panel title="Document uploads and views" action={<Link to="/admin/business/documents" className="text-xs font-semibold text-teal">Open documents</Link>}>
            <div className="divide-y divide-line">{documentInsights.map((document) => <div key={document.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3 first:pt-0 last:pb-0"><span className="text-sm font-semibold">{document.name}</span><span className="flex items-center gap-1.5 text-xs text-slate"><Upload size={14} className="text-teal" /><b className="num text-ink">{document.uploads}</b> uploads</span><span className="flex items-center gap-1.5 text-xs text-slate"><Eye size={14} className="text-info" /><b className="num text-ink">{document.views}</b> views</span></div>)}</div>
          </Panel>
          <Panel title="Recent administrator activity" action={<Link to="/admin/business/settings/activity" className="text-xs font-semibold text-teal">Full activity log</Link>}>
            <div className="space-y-3">{(audit.length ? audit.slice(0, 4).map((item) => ({ actor: item.actor, action: item.action, time: new Date(item.at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) })) : [
              { actor: 'Nneka Okafor', action: 'Updated Finance department access', time: 'Today' },
              { actor: 'Kemi Balogun', action: 'Sent a new employee onboarding invite', time: 'Today' },
              { actor: 'Chinedu Eze', action: 'Reviewed a branch purchase request', time: 'Yesterday' },
            ]).map((item) => <div key={`${item.actor}-${item.action}`} className="flex gap-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-cloud text-teal"><Activity size={15} /></span><span className="min-w-0 flex-1"><span className="block text-sm"><b>{item.actor}</b> {item.action.toLowerCase()}</span><span className="text-xs text-slate">{item.time}</span></span></div>)}</div>
          </Panel>
        </div>
      </section></Fold>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Company context" className="lg:col-span-2">
          <div className="grid gap-5 sm:grid-cols-3">
            <div><div className="text-xs text-slate">Active company</div><div className="mt-1 text-sm font-semibold">{t.profile.name}</div><div className="mt-1 text-xs text-slate">{t.profile.industry}</div></div>
            <div><div className="text-xs text-slate">Workforce</div><div className="num mt-1 text-sm font-semibold">{t.employees.toLocaleString('en-NG')} employees</div><div className="mt-1 text-xs text-slate">{employees.length} detailed demo profiles</div></div>
            <div><div className="text-xs text-slate">Workspace plan</div><div className="mt-1 text-sm font-semibold">{t.plan}</div><div className="mt-1 text-xs text-slate">{t.modules.length} modules enabled</div></div>
          </div>
        </Panel>
        <Panel title="Workspace security">
          <div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 text-teal" /><p className="text-sm text-slate">You are viewing only <b className="text-ink">{t.profile.name}</b> data with {r.title} permissions.</p></div>
          <Link to="/admin/business/settings?tab=security" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-teal">Review security <ArrowRight size={13} /></Link>
        </Panel>
      </div>
    </div>
  )
}
