/* Commercial model: catalog (modules → features), limits, and seed configuration.
   Everything commercial lives in Config; nothing in components is hard-coded to a plan, price or currency. */

export type GroupId = 'people' | 'money' | 'operations' | 'customers' | 'workflow' | 'insights'
export const GROUPS: { id: GroupId; name: string }[] = [
  { id: 'people', name: 'People' },
  { id: 'money', name: 'Money' },
  { id: 'operations', name: 'Operations' },
  { id: 'customers', name: 'Customers' },
  { id: 'workflow', name: 'Workflow & Documents' },
  { id: 'insights', name: 'Insights & Control' },
]

export type Feature = { key: string; name: string }
export type CatalogModule = { id: string; name: string; group: GroupId; routes: string[]; features: Feature[] }

const M = (id: string, name: string, group: GroupId, routes: string[], feats: [string, string][]): CatalogModule => ({
  id, name, group, routes, features: feats.map(([k, n]) => ({ key: `${id}.${k}`, name: n })),
})

export const CATALOG: CatalogModule[] = [
  M('hr', 'HR & People', 'people', ['people'], [['core', 'HR & People']]),
  M('recruitment', 'Recruitment', 'people', [], [['core', 'Recruitment']]),
  M('onboarding', 'Employee Onboarding', 'people', [], [['core', 'Employee Onboarding']]),
  M('attendance', 'Attendance & Time', 'people', [], [['core', 'Attendance & Time']]),
  M('hybrid', 'Hybrid & Remote Work', 'people', [], [['core', 'Hybrid & Remote Work']]),
  M('leave', 'Leave Management', 'people', [], [['core', 'Leave Management']]),
  M('performance', 'Performance', 'people', [], [['basic', 'Goals and reviews'], ['advanced', 'Advanced performance']]),
  M('ess', 'Employee Self-Service', 'people', ['my'], [['core', 'Employee Self-Service']]),

  M('payroll', 'Payroll', 'money', ['payroll'], [['basic', 'Payroll processing'], ['paye', 'PAYE'], ['pension', 'Pension'], ['nhf', 'NHF'], ['nsitf', 'NSITF'], ['advance', 'Salary Advance'], ['sod', 'Salary-on-Demand'], ['adv', 'Advanced payroll and automation']]),
  M('accounting', 'Accounting', 'money', ['accounting'], [['ledger', 'General ledger'], ['ap', 'Accounts Payable'], ['ar', 'Accounts Receivable'], ['budgeting', 'Budgeting']]),
  M('expenses', 'Expenses', 'money', [], [['core', 'Expenses']]),
  M('wallet', 'Employee Wallet', 'money', [], [['core', 'Employee Wallet']]),

  M('requests', 'Requests & Approvals', 'operations', ['approvals'], [['core', 'Requests'], ['basic', 'Basic approvals'], ['adv', 'Advanced approvals']]),
  M('procurement', 'Procurement', 'operations', ['procurement'], [['pr', 'Purchase requests'], ['po', 'Purchase orders'], ['vendors', 'Vendors'], ['adv', 'Advanced procurement']]),
  M('vendors', 'Vendor Management', 'operations', ['vendors'], [['register', 'Department vendor registers'], ['financials', 'Vendor financial analysis'], ['performance', 'Vendor performance evaluation']]),
  M('assets', 'Assets', 'operations', ['assets'], [['register', 'Asset register'], ['assignment', 'Assignment'], ['transfers', 'Transfers'], ['maintenance', 'Maintenance'], ['disposal', 'Disposal']]),
  M('fleet', 'Fleet', 'operations', ['fleet'], [['vehicles', 'Vehicles and documents'], ['trips', 'Trips and drivers'], ['maintenance', 'Fleet maintenance']]),
  M('travel', 'Travel', 'operations', ['travel'], [['requests', 'Travel requests and approvals'], ['allowances', 'Allowances and disbursement'], ['retirement', 'Travel retirement and receipts']]),
  M('tasks', 'Tasks', 'operations', ['tasks'], [['core', 'Tasks']]),

  M('crm', 'CRM', 'customers', ['crm'], [['leads', 'Leads'], ['customers', 'Customers'], ['opportunities', 'Opportunities'], ['pipeline', 'Sales pipeline'], ['adv', 'Advanced CRM']]),

  M('documents', 'Documents', 'workflow', ['documents'], [['storage', 'Documents'], ['templates', 'Document templates']]),
  M('sign', 'BizFlow Sign', 'workflow', ['sign'], [['sign', 'Sign'], ['approve', 'Approve'], ['acknowledge', 'Acknowledge'], ['templates', 'Signing templates'], ['smart', 'Smart Documents']]),
  M('workflows', 'Business Workflows', 'workflow', [], [['basic', 'Workflow automation'], ['advanced', 'Advanced workflows']]),
  M('audit', 'Audit Trail', 'workflow', [], [['basic', 'Audit trail'], ['enhanced', 'Enhanced audit']]),
  M('messaging', 'Email Notifications', 'workflow', [], [['core', 'Email activity notifications']]),

  M('health', 'Business Health', 'insights', ['health'], [['basic', 'Company overview'], ['insights', 'Business Health score']]),
  M('reports', 'Reports & Analytics', 'insights', ['reports'], [['basic', 'Basic reporting'], ['advanced', 'Advanced reporting'], ['analytics', 'Operational analytics']]),
  M('branches', 'Branch Management', 'insights', [], [['core', 'Multi-branch management']]),
  M('costcentres', 'Cost Centres', 'insights', [], [['basic', 'Cost-centre reporting'], ['advanced', 'Advanced cost centres']]),
  M('permissions', 'Permissions', 'insights', [], [['basic', 'Role-based permissions'], ['advanced', 'Advanced permissions']]),
  M('integrations', 'Integrations', 'insights', [], [['core', 'Integrations'], ['api', 'API access']]),
  M('enterprise', 'Enterprise Controls', 'insights', [], [['sso', 'Single sign-on'], ['approvals', 'Custom approval architecture'], ['multi', 'Multi-company'], ['support', 'Dedicated support and SLA']]),
]

export const ALL_FEATURES = CATALOG.flatMap((m) => m.features.map((f) => ({ ...f, module: m.id })))
export const featureName = (key: string) => ALL_FEATURES.find((f) => f.key === key)?.name ?? key
export const moduleOf = (key: string) => CATALOG.find((m) => m.id === key.split('.')[0])
export const moduleByRoute = (route: string) => CATALOG.find((m) => m.routes.includes(route))
export const moduleFeatures = (id: string) => CATALOG.find((m) => m.id === id)?.features.map((f) => f.key) ?? []

/* ---------- Limits ---------- */
export type LimitKey = 'employees' | 'branches' | 'storageGb' | 'documents' | 'signatures' | 'leads'
export const LIMITS: { key: LimitKey; name: string; unit: string; per?: string }[] = [
  { key: 'employees', name: 'Employees', unit: '' },
  { key: 'branches', name: 'Branches', unit: '' },
  { key: 'storageGb', name: 'Storage', unit: 'GB' },
  { key: 'documents', name: 'Documents', unit: '', per: '/month' },
  { key: 'signatures', name: 'Signature requests', unit: '', per: '/month' },
  { key: 'leads', name: 'CRM leads', unit: '' },
]

/* ---------- Types ---------- */
export type Money = Record<string, number | undefined>
export type Plan = {
  id: string; name: string; tagline: string; description: string
  status: 'active' | 'archived'; visible: boolean; recommended: boolean; order: number
  custom: boolean; trialDays: number; includedEmployees: number
  prices: { monthly: Money; annual: Money; extraMonthly: Money; extraAnnual: Money }
  limits: Record<LimitKey, number | null>
  features: string[]; highlights: string[]; inherits?: string
}
export type Addon = {
  id: string; name: string; description: string; category: string
  active: boolean; visible: boolean; billing: 'recurring' | 'one_time'
  prices: { monthly: Money; annual: Money }
  features: string[]; limitBoost: Partial<Record<LimitKey, number>>; compatible: string[]
}
export type Currency = { code: string; symbol: string; name: string; decimals: number; locale: string; enabled: boolean; regions: string[] }
export type TaxRule = { currency: string; name: string; rate: number; enabled: boolean; inclusive: boolean }
export type Promo = {
  id: string; name: string; code?: string; kind: 'percent' | 'fixed'; percent: number; fixed: Money
  appliesTo: 'plan' | 'addon' | 'all'; plans: string[]; period: 'first' | 'recurring' | 'annual_only'
  start: string; end: string; maxRedemptions: number | null; redeemed: number
  eligibility: 'new' | 'all'; currencies: string[]; active: boolean
}
export type Config = { plans: Plan[]; addons: Addon[]; currencies: Currency[]; defaultCurrency: string; taxes: TaxRule[]; promos: Promo[] }

/* ---------- Seed ---------- */
const m = (ngn: number, usd: number): Money => ({ NGN: ngn, USD: usd, GBP: Math.round(usd * 0.8 * 100) / 100, EUR: Math.round(usd * 0.92 * 100) / 100 })
const yr = (x: Money): Money => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v === undefined ? v : Math.round(v * 10 * 100) / 100]))
const mod = (...ids: string[]) => ids.flatMap(moduleFeatures)

const STARTER = ['hr.core', 'onboarding.core', 'leave.core', 'attendance.core', 'ess.core', 'payroll.basic', 'expenses.core', 'requests.core', 'requests.basic', 'tasks.core', 'documents.storage', 'documents.templates', 'reports.basic', 'health.basic', 'audit.basic', 'permissions.basic']
const GROWTH = [...STARTER, 'recruitment.core', 'hybrid.core', 'performance.basic', 'payroll.paye', 'payroll.pension', 'payroll.nhf', 'payroll.nsitf', 'payroll.advance', 'payroll.sod',
  ...mod('accounting'), 'procurement.pr', 'procurement.po', 'procurement.vendors', 'assets.register', 'assets.assignment', 'requests.adv',
  'crm.leads', 'crm.customers', 'crm.opportunities', 'crm.pipeline', ...mod('sign'), 'workflows.basic', 'health.insights', 'reports.advanced', 'costcentres.basic']
const BUSINESS = [...GROWTH, ...mod('fleet'), ...mod('travel'), 'assets.transfers', 'assets.maintenance', 'assets.disposal', 'procurement.adv', 'performance.advanced', 'crm.adv', 'branches.core',
  ...mod('vendors'), 'costcentres.advanced', 'reports.analytics', 'workflows.advanced', 'permissions.advanced', 'audit.enhanced', 'integrations.core', 'payroll.adv']
const ENTERPRISE = [...BUSINESS, ...mod('enterprise'), 'integrations.api', 'wallet.core', 'messaging.core']

const lim = (employees: number | null, branches: number | null, storageGb: number | null, documents: number | null, signatures: number | null, leads: number | null): Record<LimitKey, number | null> => ({ employees, branches, storageGb, documents, signatures, leads })
const addonPrices = (ngn: number, usd: number) => {
  const monthly = m(ngn / 2, usd / 2)
  return { monthly, annual: yr(monthly) }
}

export const SEED_CONFIG: Config = {
  defaultCurrency: 'NGN',
  currencies: [
    { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', decimals: 0, locale: 'en-NG', enabled: true, regions: ['NG'] },
    { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, locale: 'en-US', enabled: true, regions: ['*'] },
    { code: 'GBP', symbol: '£', name: 'Pound Sterling', decimals: 2, locale: 'en-GB', enabled: true, regions: ['GB'] },
    { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, locale: 'de-DE', enabled: true, regions: ['DE', 'FR', 'IE', 'NL'] },
  ],
  taxes: [
    { currency: 'NGN', name: 'VAT', rate: 7.5, enabled: true, inclusive: false },
    { currency: 'GBP', name: 'VAT', rate: 20, enabled: true, inclusive: false },
    { currency: 'EUR', name: 'VAT', rate: 0, enabled: false, inclusive: false },
    { currency: 'USD', name: 'Sales tax', rate: 0, enabled: false, inclusive: false },
  ],
  plans: [
    {
      id: 'starter', name: 'Starter', tagline: 'Essential tools for getting your business organized.', description: 'For small businesses beginning to formalize operations.',
      status: 'active', visible: true, recommended: false, order: 1, custom: false, trialDays: 14, includedEmployees: 10,
      prices: { monthly: m(45000, 39), annual: yr(m(45000, 39)), extraMonthly: m(3000, 2.5), extraAnnual: yr(m(3000, 2.5)) },
      limits: lim(50, 1, 5, 100, 20, 100), features: STARTER,
      highlights: ['HR, onboarding, leave and attendance', 'Basic payroll and expenses', 'Requests, approvals and tasks', 'Documents and basic templates', 'Basic reporting'],
    },
    {
      id: 'growth', name: 'Growth', tagline: 'Connected tools for businesses ready to scale.', description: 'For growing businesses that need connected business operations.',
      status: 'active', visible: true, recommended: true, order: 2, custom: false, trialDays: 14, includedEmployees: 25, inherits: 'starter',
      prices: { monthly: m(125000, 99), annual: yr(m(125000, 99)), extraMonthly: m(4500, 3.5), extraAnnual: yr(m(4500, 3.5)) },
      limits: lim(100, 5, 25, 500, 100, 1000), features: GROWTH,
      highlights: ['Payroll with PAYE, pension, NHF and NSITF', 'Accounting, payables, receivables, budgeting', 'CRM, pipeline and procurement', 'BizFlow Sign and Smart Documents', 'Business Health and advanced reports'],
    },
    {
      id: 'business', name: 'Business', tagline: 'Advanced control for established and multi-branch businesses.', description: 'For companies with multiple departments, branches or operational teams.',
      status: 'active', visible: true, recommended: false, order: 3, custom: false, trialDays: 14, includedEmployees: 50, inherits: 'growth',
      prices: { monthly: { ...m(295000, 229), EUR: undefined }, annual: { ...yr(m(295000, 229)), EUR: undefined }, extraMonthly: m(6500, 5), extraAnnual: yr(m(6500, 5)) },
      limits: lim(500, 15, 100, 2000, 500, null), features: BUSINESS,
      highlights: ['Travel, fleet and vendor performance management', 'Multi-branch management and cost centres', 'Advanced CRM, procurement and performance', 'Advanced workflows, permissions and audit', 'Integrations and operational analytics'],
    },
    {
      id: 'enterprise', name: 'Enterprise', tagline: 'A configurable operating platform for complex organizations.', description: 'Custom deployment, security and contracts for larger organizations.',
      status: 'active', visible: true, recommended: false, order: 4, custom: true, trialDays: 0, includedEmployees: 500, inherits: 'business',
      prices: { monthly: {}, annual: {}, extraMonthly: {}, extraAnnual: {} },
      limits: lim(null, null, null, null, null, null), features: ENTERPRISE,
      highlights: ['Custom deployment and advanced security', 'Email activity notifications', 'Multi-company and multi-branch structures', 'API access and advanced integrations', 'Dedicated support, SLAs and implementation help'],
    },
  ],
  addons: [
    { id: 'fleet', name: 'Fleet', description: 'Vehicles, documents, trips, drivers and fleet maintenance.', category: 'Operations', active: true, visible: true, billing: 'recurring', prices: addonPrices(40000, 32), features: mod('fleet'), limitBoost: {}, compatible: ['growth'] },
    { id: 'travel', name: 'Travel', description: 'Travel requests, approvals, allowances, preparation, disbursement and retirement.', category: 'Operations', active: true, visible: true, billing: 'recurring', prices: addonPrices(45000, 35), features: mod('travel'), limitBoost: {}, compatible: ['starter', 'growth'] },
    { id: 'vendors', name: 'Vendor Management', description: 'Department vendor registers, obligations, payments and performance evaluation.', category: 'Operations', active: true, visible: true, billing: 'recurring', prices: addonPrices(25000, 20), features: mod('vendors'), limitBoost: {}, compatible: ['starter', 'growth'] },
    { id: 'adv-crm', name: 'Advanced CRM', description: 'Forecasting, territories and sales automation.', category: 'Customers', active: true, visible: true, billing: 'recurring', prices: addonPrices(30000, 24), features: ['crm.adv'], limitBoost: { leads: 5000 }, compatible: ['growth'] },
    { id: 'adv-procurement', name: 'Advanced Procurement', description: 'Multi-level sourcing, tenders and vendor scorecards.', category: 'Operations', active: true, visible: true, billing: 'recurring', prices: addonPrices(30000, 22), features: ['procurement.adv'], limitBoost: {}, compatible: ['growth'] },
    { id: 'adv-performance', name: 'Advanced Performance', description: '360 feedback, calibration and succession planning.', category: 'People', active: true, visible: true, billing: 'recurring', prices: addonPrices(25000, 20), features: ['performance.advanced'], limitBoost: {}, compatible: ['growth'] },
    { id: 'sod', name: 'Salary-on-Demand', description: 'Let employees access earned pay before payday.', category: 'Money', active: true, visible: true, billing: 'recurring', prices: addonPrices(35000, 28), features: ['payroll.sod', 'payroll.advance'], limitBoost: {}, compatible: ['starter'] },
    { id: 'wallet', name: 'Employee Wallet', description: 'Hold, spend and move employee funds inside BizFlow.', category: 'Money', active: true, visible: true, billing: 'recurring', prices: addonPrices(30000, 24), features: ['wallet.core'], limitBoost: {}, compatible: ['growth', 'business'] },
    { id: 'adv-reporting', name: 'Advanced Reporting', description: 'Custom reports, scheduled delivery and exports.', category: 'Insights', active: true, visible: true, billing: 'recurring', prices: addonPrices(28000, 22), features: ['reports.advanced', 'reports.analytics'], limitBoost: {}, compatible: ['starter', 'growth'] },
    { id: 'messaging', name: 'Email Notifications', description: 'Send activity alerts, approvals, reminders and payslip notices by email.', category: 'Workflow', active: true, visible: true, billing: 'recurring', prices: addonPrices(20000, 16), features: ['messaging.core'], limitBoost: {}, compatible: ['starter', 'growth', 'business'] },
    { id: 'storage', name: 'Additional storage · 25 GB', description: 'Extra document and attachment storage.', category: 'Usage', active: true, visible: true, billing: 'recurring', prices: addonPrices(8000, 7), features: [], limitBoost: { storageGb: 25 }, compatible: ['starter', 'growth', 'business'] },
    { id: 'signatures', name: 'Signature pack · +100 / month', description: 'More signature requests every month.', category: 'Usage', active: true, visible: true, billing: 'recurring', prices: addonPrices(12000, 10), features: [], limitBoost: { signatures: 100 }, compatible: ['starter', 'growth', 'business'] },
    { id: 'api', name: 'API access', description: 'REST API and webhooks for your own systems.', category: 'Integrations', active: true, visible: true, billing: 'recurring', prices: addonPrices(45000, 36), features: ['integrations.api'], limitBoost: {}, compatible: ['business'] },
  ],
  promos: [
    { id: 'p1', name: 'Annual billing welcome', kind: 'percent', percent: 5, fixed: {}, appliesTo: 'plan', plans: [], period: 'annual_only', start: '2026-01-01', end: '2026-12-31', maxRedemptions: null, redeemed: 41, eligibility: 'new', currencies: [], active: true },
    { id: 'p2', name: 'Launch partner', code: 'FLOW20', kind: 'percent', percent: 20, fixed: {}, appliesTo: 'all', plans: ['growth', 'business'], period: 'first', start: '2026-09-01', end: '2026-12-31', maxRedemptions: 200, redeemed: 37, eligibility: 'new', currencies: [], active: true },
    { id: 'p3', name: 'Onboarding credit', code: 'SETUP50K', kind: 'fixed', percent: 0, fixed: { NGN: 50000, USD: 35 }, appliesTo: 'plan', plans: [], period: 'first', start: '2026-01-01', end: '2026-06-30', maxRedemptions: 100, redeemed: 100, eligibility: 'new', currencies: ['NGN', 'USD'], active: false },
  ],
}
