import { lazy, Suspense } from 'react'
import type { ComponentType } from 'react'
import { createBrowserRouter, Link, Navigate, redirect, useRouteError } from 'react-router'
import SiteLayout from './components/site/SiteLayout'
import AppLayout from './components/app/AppLayout'
import { PageSkeleton } from './components/ui'
import AdminLayout, { Gate, type Perm } from './pages/admin/AdminLayout'
import { businessSession, demoAccountsFor, useTenants } from './tenant/store'
import { hasAudience } from './security/access'

const L = (load: () => Promise<Record<string, unknown>>, name = 'default') => {
  const C = lazy(async () => ({ default: (await load())[name] as ComponentType }))
  return function Lazy() { return <Suspense fallback={<PageSkeleton />}><C /></Suspense> }
}
const Home = L(() => import('./pages/site/Home'))
const Billing = L(() => import('./pages/app/Billing'))
const Pricing = L(() => import('./pages/site/Pricing'))
const Product = L(() => import('./pages/site/Pages'), 'Product')
const Capabilities = L(() => import('./pages/site/Capabilities'))
const Solutions = L(() => import('./pages/site/Solutions'), 'Solutions')
const Security = L(() => import('./pages/site/Pages'), 'Security')
const About = L(() => import('./pages/site/Pages'), 'About')
const Contact = L(() => import('./pages/site/Pages'), 'Contact')
const SignIn = L(() => import('./pages/auth/Auth'), 'SignIn')
const Forgot = L(() => import('./pages/auth/Auth'), 'Forgot')
const Invite = L(() => import('./pages/auth/Auth'), 'Invite')
const Register = L(() => import('./pages/auth/Auth'), 'Register')
const Welcome = L(() => import('./pages/auth/Auth'), 'Welcome')
const BusinessDashboard = L(() => import('./pages/app/BusinessDashboard'))
const DocumentTemplates = L(() => import('./pages/app/DocumentTemplates'))
const EmployeeRules = L(() => import('./pages/app/EmployeeRules'))
const Branding = L(() => import('./pages/app/Branding'))
const CompanyProfile = L(() => import('./pages/app/CompanySettings'), 'CompanyProfile')
const ApprovalFlow = L(() => import('./pages/app/CompanySettings'), 'ApprovalFlow')
const FinanceTiers = L(() => import('./pages/app/CompanySettings'), 'FinanceTiers')
const Activity = L(() => import('./pages/app/CompanySettings'), 'Activity')
const Modules = L(() => import('./pages/app/CompanySettings'), 'Modules')
const GetStarted = L(() => import('./pages/start/GetStarted'))
const TenantLogin = L(() => import('./pages/tenant/Login'))
const CompanyForgot = L(() => import('./pages/tenant/Recovery'), 'CompanyForgot')
const NewPassword = L(() => import('./pages/tenant/Recovery'), 'NewPassword')
const BusinessLogin = L(() => import('./pages/tenant/Login'), 'BusinessLogin')
const EmployeeOnboarding = L(() => import('./pages/tenant/EmployeeOnboarding'))
const OnboardingStatus = L(() => import('./pages/tenant/EmployeeOnboarding'), 'OnboardingStatus')
const WorkspaceEntry = L(() => import('./pages/tenant/Gate'), 'WorkspaceEntry')
const SessionExpired = L(() => import('./pages/tenant/Gate'), 'SessionExpired')
const Prototype = L(() => import('./pages/Prototype'))
const AdminLogin = L(() => import('./pages/admin/AdminLogin'))
const C = (name: string) => L(() => import('./pages/admin/Console'), name)
const O = (name: string) => L(() => import('./pages/admin/Operations'), name)
const P = (name: string) => L(() => import('./pages/admin/Platform'), name)
const Health = L(() => import('./pages/app/Health'))
const Leave = L(() => import('./pages/app/Leave'))
const My = L(() => import('./pages/app/Health'), 'My')
const People = L(() => import('./pages/app/People'))
const Organization = L(() => import('./pages/app/Organization'))
const Travel = L(() => import('./pages/app/Travel'))
const Profile = L(() => import('./pages/app/EmployeeProfile'))
const Payroll = L(() => import('./pages/app/Money'), 'Payroll')
const Accounting = L(() => import('./pages/app/Money'), 'Accounting')
const Approvals = L(() => import('./pages/app/Ops'), 'Approvals')
const Tasks = L(() => import('./pages/app/Ops'), 'Tasks')
const Inbox = L(() => import('./pages/app/Inbox'))
const Procurement = L(() => import('./pages/app/Ops'), 'Procurement')
const Vendors = L(() => import('./pages/app/Vendors'))
const Assets = L(() => import('./pages/app/Ops'), 'Assets')
const AssetDetail = L(() => import('./pages/app/Ops'), 'AssetDetail')
const Performance = L(() => import('./pages/app/Workforce'))
const Fleet = L(() => import('./pages/app/Ops'), 'Fleet')
const Exit = L(() => import('./pages/app/Exit'), 'default')
const CRM = L(() => import('./pages/app/Control'), 'CRM')
const AuditTrail = L(() => import('./pages/app/AuditTrail'))
const Documents = L(() => import('./pages/app/Control'), 'Documents')
const Sign = L(() => import('./pages/app/Control'), 'Sign')
const Signing = L(() => import('./pages/app/Control'), 'Signing')
const Reports = L(() => import('./pages/app/Control'), 'Reports')
const Settings = L(() => import('./pages/app/Control'), 'Settings')
const A = (name: string, f: 'Plans' | 'Subs' = 'Plans') => L(() => (f === 'Plans' ? import('./pages/admin/Plans') : import('./pages/admin/Subs')), name)
const ResetPassword = L(() => import('./pages/auth/Auth'), 'ResetPassword')
const guard = (Component: ComponentType, perm: Perm) => function AdminPermissionRoute() {
  return <Gate perm={perm}><Component /></Gate>
}

/** An installed app (or ?source=pwa launch) never shows the marketing page: route straight to the workspace before anything renders. */
function launchRedirect() {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (!standalone && new URLSearchParams(location.search).get('source') !== 'pwa') return null
  const session = businessSession()
  return redirect(session ? '/admin/business/dashboard' : '/admin/business/login')
}

function BusinessWorkspace() {
  const tenants = useTenants()
  const session = businessSession()
  const tenant = session ? tenants[session.slug] : undefined
  const validAccount = !!tenant && demoAccountsFor(tenant).some((account) => account.email === session?.email)
  return validAccount && hasAudience('bizflow-company', tenant?.slug) ? <AppLayout /> : <Navigate to="/admin/business" replace />
}

function ErrorPage() {
  const e = useRouteError()
  console.error(e)
  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl font-semibold">Something went wrong on this page</h1>
      <p className="mt-2 max-w-md text-slate">Your data is safe. Try loading the page again, or head back to your workspace.</p>
      <div className="mt-5 flex gap-3"><button onClick={() => location.reload()} className="cursor-pointer rounded-md bg-teal px-4 py-2 font-semibold text-white">Try again</button><Link to="/admin/business" className="rounded-md border border-line px-4 py-2 font-semibold">Go to workspace</Link></div>
    </div>
  )
}

const NotFound = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
    <h1 className="text-4xl font-semibold">We could not find that page</h1>
    <p className="mt-2 text-slate">It may have moved, or the link may be incorrect.</p>
    <Link to="/" className="mt-4 font-semibold text-teal">Go to BizFlow home</Link>
  </div>
)

export const router = createBrowserRouter([
  { path: '/', ErrorBoundary: ErrorPage, children: [
  {
    Component: SiteLayout,
    children: [
      { index: true, Component: Home, loader: launchRedirect },
      { path: 'product', Component: Product },
      { path: 'capabilities', Component: Capabilities },
      { path: 'solutions', Component: Solutions },
      { path: 'pricing', Component: Pricing },
      { path: 'security', Component: Security },
      { path: 'about', Component: About },
      { path: 'contact', Component: Contact },
    ],
  },
  { path: 'sign-in', Component: SignIn },
  { path: 'forgot-password', Component: Forgot },
  { path: 'reset-password', Component: ResetPassword },
  { path: 'register', loader: () => redirect('/get-started') },
  { path: 'get-started', Component: GetStarted },
  { path: 'prototype', Component: Prototype },
  { path: 'w/:slug/login', Component: TenantLogin },
  { path: 'w/:slug/forgot-password', Component: CompanyForgot },
  { path: 'w/:slug/new-password', Component: NewPassword },
  { path: 'w/:slug/workspace', Component: WorkspaceEntry },
  { path: 'session-expired', Component: SessionExpired },
  { path: 'w/:slug/onboarding/:code', Component: EmployeeOnboarding },
  { path: 'w/:slug/onboarding-status', Component: OnboardingStatus },
  { path: 'admin/login', Component: AdminLogin },
  { path: 'invite', Component: Invite },
  { path: 'welcome', Component: Welcome },
  { path: 'checkout', element: <Navigate to="/get-started" replace /> },
  {
    path: 'admin/business',
    children: [
      { index: true, Component: BusinessLogin },
      { path: 'login', Component: BusinessLogin },
      {
        Component: BusinessWorkspace,
        children: [
          { path: 'dashboard', Component: BusinessDashboard },
          { path: 'health', Component: Health },
          { path: 'modules', Component: Modules },
          { path: 'settings/profile', Component: CompanyProfile },
          { path: 'settings/activity', Component: Activity },
          { path: 'settings/approvals', Component: ApprovalFlow },
          { path: 'settings/finance', Component: FinanceTiers },
          { path: 'settings/branding', Component: Branding },
          { path: 'settings/document-templates', Component: DocumentTemplates },
          { path: 'settings/employee-rules', Component: EmployeeRules },
          { path: 'my', Component: My },
          { path: 'people', Component: People },
          { path: 'organization', Component: Organization },
          { path: 'travel', Component: Travel },
          { path: 'people/:id', Component: Profile },
          { path: 'payroll', Component: Payroll },
          { path: 'accounting', Component: Accounting },
          { path: 'reports', Component: Reports },
          { path: 'approvals', Component: Approvals },
          { path: 'tasks', Component: Tasks },
          { path: 'inbox', Component: Inbox },
          { path: 'procurement', Component: Procurement },
          { path: 'vendors', Component: Vendors },
          { path: 'assets', Component: Assets },
          { path: 'assets/:id', Component: AssetDetail },
          { path: 'fleet', Component: Fleet },
          { path: 'attendance', element: <Navigate to="/admin/business/performance?tab=Attendance" replace /> },
          { path: 'performance', Component: Performance },
          { path: 'crm', Component: CRM },
          { path: 'exit', Component: Exit },
          { path: 'leave', Component: Leave },
          { path: 'audit-trail', Component: AuditTrail },
          { path: 'offboarding', Component: L(() => import('./pages/app/Offboarding')) },
          { path: 'documents', Component: Documents },
          { path: 'sign', Component: Sign },
          { path: 'sign/signing', Component: Signing },
          { path: 'settings', Component: Settings },
          { path: 'billing', Component: Billing },
          { path: 'admin/billing', element: <Navigate to="/admin/business/billing" replace /> },
        ],
      },
    ],
  },
  {
    path: 'app/*',
    loader: ({ request }) => {
      const url = new URL(request.url)
      return redirect(`/admin/business${url.pathname.slice(4)}${url.search}`)
    },
  },
  {
    path: 'admin',
    Component: () => <Suspense fallback={<PageSkeleton />}><AdminLayout /></Suspense>,
    children: [
      { index: true, Component: C('PlatformOverview') },
      { path: 'businesses', Component: guard(P('Businesses'), 'businesses') },
      { path: 'businesses/:slug', Component: guard(P('BusinessDetail'), 'businesses') },
      { path: 'tasks', Component: guard(C('AdminTasks'), 'tasks') },
      { path: 'password-resets', Component: guard(O('PasswordResets'), 'support') },
      { path: 'finance', Component: guard(C('Finance'), 'revenue') },
      { path: 'support', Component: guard(C('Support'), 'support') },
      { path: 'users', Component: guard(C('PlatformUsers'), 'users') },
      { path: 'system', Component: guard(C('System'), 'system') },
      { path: 'changes', Component: guard(O('ChangeRequests'), 'businesses') },
      { path: 'announcements', Component: guard(L(() => import('./pages/admin/AnnouncementsCenter')), 'support') },
      { path: 'onboarding', Component: guard(L(() => import('./pages/admin/Onboarding')), 'businesses') },
      { path: 'compliance', Component: guard(L(() => import('./pages/admin/Compliance')), 'businesses') },
      { path: 'partners', Component: guard(L(() => import('./pages/admin/Partners')), 'revenue') },
      { path: 'partners/:id', Component: guard(L(() => import('./pages/admin/Partners')), 'revenue') },
      { path: 'reliability', Component: guard(O('Reliability'), 'system') },
      { path: 'health', element: <Navigate to="/admin/businesses" replace /> },
      { path: 'rollout', Component: guard(L(() => import('./pages/admin/Rollout')), 'settings') },
      { path: 'helpdesk', Component: guard(L(() => import('./pages/admin/Helpdesk')), 'support') },
      { path: 'billing/operations', element: <Navigate to="/admin/billing" replace /> },
      { path: 'status', Component: guard(L(() => import('./pages/admin/SystemStatus')), 'system') },
      { path: 'offboarding', Component: guard(L(() => import('./pages/admin/Offboarding')), 'businesses') },
      { path: 'audit-trail', Component: guard(L(() => import('./pages/admin/AuditTrail')), 'system') },
      { path: 'backups', Component: guard(L(() => import('./pages/admin/Backups')), 'backups') },
      { path: 'templates', Component: guard(L(() => import('./pages/admin/Templates')), 'settings') },
      { path: 'docs', Component: guard(L(() => import('./pages/admin/Docs')), 'docs') },
      { path: 'billing/collections', Component: guard(O('Collections'), 'discounts') },
      { path: 'billing/revenue-ops', Component: guard(L(() => import('./pages/admin/Revenue')), 'revenue') },
      { path: 'billing/invoices', Component: guard(L(() => import('./pages/admin/Invoices')), 'revenue') },
      { path: 'billing/recovery', Component: guard(L(() => import('./pages/admin/PaymentRecovery')), 'revenue') },
      { path: 'billing/usage', Component: guard(L(() => import('./pages/admin/UsageLimits')), 'view') },
      { path: 'settings', Component: guard(C('PlatformSettings'), 'settings') },
      { path: 'billing', Component: A('Overview') },
      { path: 'billing/plans', Component: guard(A('Plans'), 'plans') },
      { path: 'billing/plans/:id', Component: guard(A('PlanBuilder'), 'plans') },
      { path: 'billing/addons', Component: guard(A('Addons'), 'addons') },
      { path: 'billing/module-pricing', Component: guard(L(() => import('./pages/admin/ModulePricing')), 'view') },
      { path: 'billing/quotes', Component: guard(L(() => import('./pages/admin/QuoteRequests')), 'view') },
      { path: 'billing/currency', Component: guard(A('CurrencyTax', 'Subs'), 'pricing') },
      { path: 'billing/promotions', Component: guard(A('Promotions', 'Subs'), 'discounts') },
      { path: 'billing/grants', Component: guard(L(() => import('./pages/admin/Grants')), 'discounts') },
      { path: 'billing/subscriptions', Component: A('Subscriptions', 'Subs') },
      { path: 'billing/subscriptions/custom', Component: guard(A('CustomSubscription', 'Subs'), 'subscriptions') },
      { path: 'billing/subscriptions/:id', Component: A('SubscriptionDetail', 'Subs') },
      { path: 'billing/audit', Component: guard(A('AuditLog', 'Subs'), 'audit') },
    ],
  },
  { path: '*', Component: NotFound },
  ] },
])
