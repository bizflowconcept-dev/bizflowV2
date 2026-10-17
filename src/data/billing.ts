import { useSyncExternalStore } from 'react'
import { businessSession } from '../tenant/store'
import { profileFor, reconcile, seedCrm, seedLedger } from './promoLedger'
import type { PromoCrm, Redemption } from './promoLedger'
import { complimentaryLabel, convertedModulesFor, grantCoversModule, grantFeatures, liveGrantsFor, useGrants } from './grants'

/* =====================================================================
   BizFlow commercial architecture
   Plan → Modules → Features → Limits → Entitlements → Subscription → Access
   Admin edits this store; the public site, checkout and the app read it.
   NOTE: this is a client-side model for the prototype. In production the
   same rules must be enforced authoritatively on the server.
   ===================================================================== */

export const TODAY = new Date('2026-10-08T09:00:00')
export const addDays = (d: Date | string, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const daysUntil = (d: Date | string) => Math.ceil((new Date(d).getTime() - TODAY.getTime()) / 86400000)
const addMonths = (d: Date | string, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }

/* ---------- Capability catalog ---------- */
export type GroupId = 'people' | 'money' | 'operations' | 'customers' | 'workflow' | 'insights'
export const GROUPS: { id: GroupId; name: string }[] = [
  { id: 'people', name: 'People' }, { id: 'money', name: 'Money' }, { id: 'operations', name: 'Operations' },
  { id: 'customers', name: 'Customers' }, { id: 'workflow', name: 'Workflow & Documents' }, { id: 'insights', name: 'Insights & Control' },
]
export type Module = { id: string; group: GroupId; name: string; features: { key: string; name: string }[] }
const M = (id: string, group: GroupId, name: string, f?: [string, string][]): Module => ({ id, group, name, features: (f ?? [['core', name]]).map(([k, n]) => ({ key: `${id}.${k}`, name: n })) })
export const MODULES: Module[] = [
  M('people', 'people', 'HR & People', [['core', 'Employee records'], ['structure', 'Departments & structure']]),
  M('recruitment', 'people', 'Recruitment'),
  M('onboarding', 'people', 'Employee Onboarding', [['core', 'Onboarding portal & HR review'], ['wizard', '8-step employee onboarding wizard']]),
  M('orgchart', 'people', 'Organisation Chart', [['core', 'Interactive organisation chart'], ['insights', 'Hierarchy insights (spans, layers, vacancies)']]),
  M('rules', 'people', 'Employee Rules', [['grades', 'Grade structure'], ['matrix', 'Salary matrix'], ['overrides', 'Department overrides']]),
  M('exit', 'people', 'Exit Management', [['core', 'Resignation & exit workflow'], ['clearance', 'Clearance & final settlement']]),
  M('attendance', 'people', 'Attendance & Time', [['core', 'Time tracking'], ['shifts', 'Shifts & exceptions']]),
  M('hybrid', 'people', 'Hybrid & Remote Work'),
  M('leave', 'people', 'Leave Management'),
  M('performance', 'people', 'Performance', [['core', 'Goals & reviews'], ['advanced', 'Advanced performance (360, calibration)']]),
  M('ess', 'people', 'Employee Self-Service'),
  M('my', 'people', 'My BizFlow'),
  M('payroll', 'money', 'Payroll', [['core', 'Payroll processing'], ['paye', 'PAYE'], ['pension', 'Pension'], ['nhf', 'NHF'], ['nsitf', 'NSITF'], ['advance', 'Salary Advance'], ['sod', 'Salary-on-Demand'], ['automation', 'Payroll automation & advanced reporting']]),
  M('accounting', 'money', 'Accounting'),
  M('expenses', 'money', 'Expenses'),
  M('payables', 'money', 'Accounts Payable'),
  M('receivables', 'money', 'Accounts Receivable'),
  M('budgeting', 'money', 'Budgeting'),
  M('wallet', 'money', 'Employee Wallet'),
  M('requests', 'operations', 'Requests'),
  M('approvals', 'operations', 'Approvals', [['core', 'Basic approvals'], ['advanced', 'Advanced approval rules']]),
  M('procurement', 'operations', 'Procurement', [['core', 'Purchase requests'], ['advanced', 'Advanced procurement (RFQ, matching)']]),
  M('assets', 'operations', 'Assets', [['register', 'Asset register'], ['assignment', 'Assignment'], ['transfers', 'Transfers'], ['maintenance', 'Maintenance'], ['disposal', 'Disposal']]),
  M('fleet', 'operations', 'Fleet', [['core', 'Vehicle register'], ['trips', 'Trips & fuel'], ['documents', 'Documents & renewals']]),
  M('travel', 'operations', 'Travel', [['requests', 'Travel requests & approvals'], ['allowances', 'Allowances & disbursement'], ['retirement', 'Travel retirement & receipts']]),
  M('vendors', 'operations', 'Vendor Management', [['register', 'Department vendor registers'], ['financials', 'Vendor financial analysis'], ['performance', 'Vendor performance evaluation']]),
  M('tasks', 'operations', 'Tasks'),
  M('crm', 'customers', 'CRM', [['leads', 'Leads'], ['customers', 'Customers'], ['opportunities', 'Opportunities'], ['pipeline', 'Sales pipeline'], ['followups', 'Follow-ups'], ['advanced', 'Advanced CRM (forecasting, automation)']]),
  M('documents', 'workflow', 'Documents', [['core', 'Document storage'], ['templates', 'Document templates'], ['letterhead', 'Letterhead & branded company documents']]),
  M('sign', 'workflow', 'BizFlow Sign', [['sign', 'Sign'], ['approve', 'Approve'], ['acknowledge', 'Acknowledge'], ['templates', 'Signing templates'], ['smart', 'Smart Documents']]),
  M('workflows', 'workflow', 'Business Workflows', [['core', 'Workflow automation'], ['advanced', 'Advanced workflows']]),
  M('messaging', 'workflow', 'Email Notifications', [['core', 'Email activity notifications']]),
  M('health', 'insights', 'Business Health'),
  M('reports', 'insights', 'Reports', [['basic', 'Standard reports'], ['advanced', 'Advanced reporting'], ['analytics', 'Operational analytics']]),
  M('branches', 'insights', 'Branch Management'),
  M('costcentres', 'insights', 'Cost Centres', [['core', 'Cost centre reporting'], ['advanced', 'Advanced cost centres']]),
  M('permissions', 'insights', 'Permissions', [['core', 'Role-based permissions'], ['advanced', 'Scoped & custom roles']]),
  M('audit', 'insights', 'Audit', [['core', 'Audit log'], ['enhanced', 'Enhanced audit & export']]),
  M('security', 'insights', 'Security Governance', [['core', 'Company permission governance'], ['consent', 'Consent-based support diagnostics'], ['breakglass', 'Break-glass emergency access']]),
  M('branding', 'insights', 'Branding & White-label', [['core', 'Logo & brand colours'], ['sidebar', 'Sidebar & theme colours'], ['whitelabel', 'White-label login & domain']]),
  M('integrations', 'insights', 'Integrations & API', [['webhooks', 'Integrations'], ['api', 'API access']]),
]
export const ALL_FEATURES = MODULES.flatMap((m) => m.features.map((f) => f.key))
export const moduleById = (id: string) => MODULES.find((m) => m.id === id)
export const featureName = (key: string) => { const [m] = key.split('.'); const mod = moduleById(m); return `${mod?.name ?? m} · ${mod?.features.find((f) => f.key === key)?.name ?? key}` }
export const moduleKeys = (id: string) => moduleById(id)?.features.map((f) => f.key) ?? []
const allOf = (...ids: string[]) => ids.flatMap(moduleKeys)
/* Default module dependencies; the Module pricing workspace can override these per module (ModulePrice.requires). */
export const MODULE_DEPS: Record<string, string[]> = {
  payroll: ['people'], attendance: ['people'], hybrid: ['attendance'], leave: ['people'], performance: ['people'], recruitment: ['people'], onboarding: ['people'],
  orgchart: ['people'], rules: ['people'], exit: ['people'], branches: ['people'], travel: ['approvals', 'expenses'], expenses: ['approvals'], vendors: ['approvals', 'procurement'], procurement: ['approvals'], fleet: ['assets'], assets: ['approvals'],
  sign: ['documents'], budgeting: ['accounting'], payables: ['accounting'], receivables: ['accounting'], costcentres: ['accounting'],
}

/* ---------- Limits ---------- */
export type LimitKey = 'employees' | 'branches' | 'storageGb' | 'documents' | 'signatures' | 'leads'
export type Limits = Record<LimitKey, number | null> // null = unlimited
export const LIMIT_DEFS: { key: LimitKey; label: string; unit: string; period?: string }[] = [
  { key: 'employees', label: 'Employees', unit: '' },
  { key: 'branches', label: 'Branches', unit: '' },
  { key: 'storageGb', label: 'Storage', unit: 'GB' },
  { key: 'documents', label: 'Documents', unit: '', period: '/ month' },
  { key: 'signatures', label: 'Signature requests', unit: '', period: '/ month' },
  { key: 'leads', label: 'CRM leads', unit: '' },
]
export const fmtLimit = (k: LimitKey, v: number | null) => (v === null ? 'Unlimited' : k === 'storageGb' ? `${v} GB` : v.toLocaleString('en-US'))
export const EMPLOYEE_TIERS = [10, 25, 50, 100, 250, 500]
export const tierLabel = (n: number) => { const i = EMPLOYEE_TIERS.findIndex((t) => n <= t); if (i < 0) return '500+'; return i === 0 ? 'Up to 10' : `${EMPLOYEE_TIERS[i - 1] + 1}–${EMPLOYEE_TIERS[i]}` }

/* ---------- Currency & tax ---------- */
export type Currency = { code: string; name: string; symbol: string; decimals: number; enabled: boolean; isDefault: boolean; regions: string[]; tax: { applies: boolean; label: string; rate: number; inclusive: boolean } }

/* ---------- Plans ---------- */
export type PricingModel = 'flat' | 'base_plus_employee' | 'per_employee' | 'custom'
export type PlanPrice = { monthly: number; annual: number; extraMonthly?: number; extraAnnual?: number }
export type Plan = {
  id: string; name: string; tagline: string; description: string
  status: 'active' | 'inactive' | 'archived'; visible: boolean; recommended: boolean; order: number
  trialDays: number; model: PricingModel; includedEmployees: number
  prices: Record<string, PlanPrice>; limits: Limits; features: string[]; highlights: string[]
}
export type Addon = {
  id: string; name: string; description: string; category: string; active: boolean
  freq: 'cycle' | 'monthly' | 'annual'; prices: Record<string, { monthly: number; annual: number }>
  costs?: Record<string, { monthly: number; annual: number }>
  grants: string[]; limitBoosts: Partial<Limits>; plans: string[]
}
export type ModuleBand = {
  id: string; label: string; minEmployees: number; maxEmployees: number | null
  prices: Record<string, { monthly: number; annual: number }>
  costs: Record<string, { monthly: number; annual: number }>
  custom?: boolean
}
export type BillingModel = 'flat' | 'per_employee' | 'per_band' | 'usage'
export const BILLING_MODELS: { id: BillingModel; name: string; hint: string }[] = [
  { id: 'flat', name: 'Flat fee', hint: 'One price regardless of company size.' },
  { id: 'per_band', name: 'Per employee band', hint: 'Price steps up with the employee capacity band.' },
  { id: 'per_employee', name: 'Per employee', hint: 'Band rate multiplied by headcount.' },
  { id: 'usage', name: 'Usage-based', hint: 'Band rate multiplied by usage units (defaults to headcount).' },
]
export type Availability = 'included' | 'addon' | 'hidden'
export type ModulePrice = {
  moduleId: string; active: boolean; required: boolean; importance: 'Foundation' | 'Essential' | 'Recommended' | 'Specialist'
  summary: string; bands: ModuleBand[]
  /* Module pricing workspace extensions (all optional so persisted state stays valid) */
  model?: BillingModel; unitLabel?: string
  setupFee?: Record<string, number>
  minCharge?: Record<string, { monthly: number; annual: number }>
  discountMonthly?: number; discountAnnual?: number
  trialDays?: number
  /** Currencies whose band prices are set manually; every other currency is derived from NGN at the reference FX rate. */
  overrides?: string[]
  requires?: string[]
  /** Pending availability per plan; applied to plans/add-ons when the draft is published. */
  availability?: Record<string, Availability>
}
export type Bundle = { id: string; name: string; description: string; moduleIds: string[]; discountPct: number; active: boolean; validFrom?: string }
export type PricingSnapshot = { rates: ModulePrice[]; bundles: Bundle[]; starterMinimum: Record<string, { monthly: number; annual: number }> }
export type PricingDraft = PricingSnapshot & { createdAt: string; by: string; note: string }
export type ScheduledChange = PricingSnapshot & { id: string; effectiveFrom: string; createdAt: string; by: string; note: string; summary: string; status: 'scheduled' | 'applied' | 'cancelled' }
export type PriceHistoryEntry = { id: string; at: string; by: string; moduleId: string; kind: 'price' | 'setting' | 'availability' | 'bundle' | 'minimum'; label: string; from: string; to: string; effectiveFrom: string; release: number; note: string }
export type Promo = {
  id: string; kind: 'coupon' | 'automatic'; code?: string; name: string; description: string
  type: 'percent' | 'fixed'; value: number; appliesTo: 'plan' | 'addon' | 'all'; plans: string[]; currencies: string[]
  cycles: ('monthly' | 'annual')[]; firstPeriodOnly: boolean; start: string; end: string; limit: number | null; redeemed: number
  eligibility: 'new' | 'all'; active: boolean
  /** Promo insights and rules (all optional so persisted state stays valid). */
  channel?: string; campaign?: string; stacking?: 'stackable' | 'exclusive'; perCompanyCap?: number | null
}

export type SubStatus = 'trial' | 'active' | 'past_due' | 'payment_failed' | 'grace' | 'cancelled' | 'expired' | 'suspended'
export const STATUS_META: Record<SubStatus, { label: string; tone: string }> = {
  trial: { label: 'Trial', tone: 'blue' }, active: { label: 'Active', tone: 'green' }, past_due: { label: 'Past due', tone: 'amber' },
  payment_failed: { label: 'Payment failed', tone: 'red' }, grace: { label: 'Grace period', tone: 'amber' }, cancelled: { label: 'Cancelled', tone: 'gray' },
  expired: { label: 'Expired', tone: 'gray' }, suspended: { label: 'Suspended', tone: 'red' },
}
export type Subscription = {
  id: string; company: string; country: string; planId: string; cycle: 'monthly' | 'annual'; currency: string; employees: number
  status: SubStatus; startedAt: string; trialEndsAt?: string; renewsAt: string; endsAt?: string; net: number; addons: string[]
  overrides: { module: string; reason: string; by: string; at: string }[]; coupon?: string; credit: number
  pendingChange?: { planId: string; effectiveAt: string }; usage: Record<LimitKey, number>; card: { brand: string; last4: string; exp: string } | null
  customFeatures?: string[]; customLimits?: Limits
  /** Created by the public signup wizard (id is `c-<workspace slug>`). */
  selfServe?: boolean
}
export type Payment = { id: string; subId: string; at: string; amount: number; currency: string; status: 'successful' | 'failed' | 'refunded'; ref: string; description: string }
export type AuditEntry = { id: string; at: string; actor: string; company: string; action: string; prev: string; next: string }

export type BillingState = {
  plans: Plan[]; addons: Addon[]; currencies: Currency[]; promos: Promo[]; subs: Subscription[]; payments: Payment[]; audit: AuditEntry[]
  modulePrices: ModulePrice[]; starterMinimum: Record<string, { monthly: number; annual: number }>
  bundles: Bundle[]; draft: PricingDraft | null; scheduled: ScheduledChange[]; priceHistory: PriceHistoryEntry[]; pricingRelease: number
  redemptions: Redemption[]; promoCrm: PromoCrm
  companyId: string; version: number
}

/* ---------- Seed ---------- */
const STARTER = [
  ...allOf('leave', 'ess', 'my', 'requests', 'tasks', 'health'), 'onboarding.core', 'orgchart.core', 'branding.core', 'security.consent', 'people.core', 'people.structure', 'attendance.core', 'payroll.core', 'approvals.core',
  'documents.core', 'documents.templates', 'reports.basic', 'permissions.core', 'audit.core',
].filter((k) => k !== 'health.core')
const GROWTH = [
  ...STARTER, ...allOf('recruitment', 'hybrid', 'accounting', 'expenses', 'payables', 'receivables', 'budgeting', 'health'),
  'performance.core', 'attendance.shifts', 'payroll.paye', 'payroll.pension', 'payroll.nhf', 'payroll.nsitf', 'payroll.advance', 'payroll.sod', 'approvals.advanced',
  'procurement.core', 'assets.register', 'assets.assignment', 'crm.leads', 'crm.customers', 'crm.opportunities', 'crm.pipeline', 'crm.followups',
  'sign.sign', 'sign.approve', 'sign.acknowledge', 'sign.templates', 'sign.smart', 'workflows.core', 'reports.advanced', 'costcentres.core',
  'onboarding.wizard', 'orgchart.insights', 'rules.grades', 'exit.core', 'documents.letterhead', 'branding.sidebar', 'security.core',
]
const BUSINESS = [
  ...GROWTH, ...allOf('fleet', 'branches'), 'assets.transfers', 'assets.maintenance', 'assets.disposal', 'procurement.advanced', 'performance.advanced', 'crm.advanced',
  ...allOf('travel', 'vendors'), 'costcentres.advanced', 'reports.analytics', 'workflows.advanced', 'permissions.advanced', 'audit.enhanced', 'integrations.webhooks', 'payroll.automation',
  'rules.matrix', 'rules.overrides', 'exit.clearance', 'branding.whitelabel', 'security.breakglass',
]
const uniq = (a: string[]) => [...new Set(a)]

const lim = (employees: number | null, branches: number | null, storageGb: number | null, documents: number | null, signatures: number | null, leads: number | null): Limits => ({ employees, branches, storageGb, documents, signatures, leads })
const px = (monthly: number, annual: number, extraMonthly: number, extraAnnual: number): PlanPrice => ({ monthly, annual, extraMonthly, extraAnnual })

const SEED_PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', tagline: 'Essential tools for getting your business organized.', description: 'For small businesses beginning to formalize operations.', status: 'active', visible: true, recommended: false, order: 1, trialDays: 14, model: 'base_plus_employee', includedEmployees: 10,
    prices: { NGN: px(35000, 350000, 1800, 18000), USD: px(29, 290, 1.5, 15), GBP: px(24, 240, 1.2, 12), EUR: px(27, 270, 1.4, 14) }, limits: lim(50, 1, 5, 100, 20, 100),
    features: uniq(STARTER), highlights: ['HR, leave, attendance and onboarding portal', 'Basic payroll, approvals and tasks', 'Interactive organisation chart', 'Document templates and brand colours', 'Consent-based support access'] },
  { id: 'growth', name: 'Growth', tagline: 'Connected tools for businesses ready to scale.', description: 'For growing businesses that need connected business operations.', status: 'active', visible: true, recommended: true, order: 2, trialDays: 14, model: 'base_plus_employee', includedEmployees: 25,
    prices: { NGN: px(95000, 950000, 2500, 25000), USD: px(79, 790, 2, 20), GBP: px(62, 620, 1.6, 16), EUR: px(73, 730, 1.9, 19) }, limits: lim(250, 5, 25, 500, 100, 1000),
    features: uniq(GROWTH), highlights: ['Everything in Starter', 'Payroll with PAYE, pension, NHF and NSITF', 'Accounting, CRM, procurement and BizFlow Sign', '8-step onboarding wizard, exit management and grade structure', 'Letterhead documents and sidebar colours'] },
  { id: 'business', name: 'Business', tagline: 'Advanced control for established and multi-branch businesses.', description: 'For established companies with several departments, branches or operational teams.', status: 'active', visible: true, recommended: false, order: 3, trialDays: 14, model: 'base_plus_employee', includedEmployees: 100,
    prices: { NGN: px(260000, 2600000, 2200, 22000), USD: px(199, 1990, 1.6, 16), GBP: px(155, 1550, 1.3, 13) }, limits: lim(500, 15, 100, 2000, 500, null),
    features: uniq(BUSINESS), highlights: ['Everything in Growth', 'Salary matrix and department overrides', 'Travel, fleet and vendor performance management', 'White-label branding and break-glass governance', 'Multi-branch, advanced workflows, audit and analytics'] },
  { id: 'enterprise', name: 'Enterprise', tagline: 'A configurable operating platform for complex organizations.', description: 'Custom deployment, security, integrations and contracts for larger organizations.', status: 'active', visible: true, recommended: false, order: 4, trialDays: 0, model: 'custom', includedEmployees: 0,
    prices: {}, limits: lim(null, null, null, null, null, null), features: uniq(ALL_FEATURES),
    highlights: ['Every BizFlow module, no add-ons required', 'Custom deployment and advanced security governance', 'Multi-branch and multi-company structures', 'API access, email notifications and integrations', 'Dedicated support, implementation and custom SLAs'] },
]
const p3 = (n: number, u: number, g: number, e: number) => ({ NGN: { monthly: n, annual: n * 10 }, USD: { monthly: u, annual: u * 10 }, GBP: { monthly: g, annual: g * 10 }, EUR: { monthly: e, annual: e * 10 } })
const p50 = (n: number, u: number, g: number, e: number) => p3(n / 2, u / 2, g / 2, e / 2)
export const FX_REFERENCE: Record<string, number> = { USD: 1200, GBP: 1550, EUR: 1400 }
/** Derive every currency from an NGN amount at the reference FX rate (used for non-overridden currencies). */
export const moduleMoney = (ngn: number) => ({
  NGN: { monthly: ngn, annual: ngn * 10 },
  USD: { monthly: Math.round(ngn / 1200), annual: Math.round((ngn / 1200) * 10) },
  GBP: { monthly: Math.round(ngn / 1550), annual: Math.round((ngn / 1550) * 10) },
  EUR: { monthly: Math.round(ngn / 1400), annual: Math.round((ngn / 1400) * 10) },
})
const band = (id: string, label: string, minEmployees: number, maxEmployees: number | null, ngn: number, custom = false): ModuleBand => {
  const prices = moduleMoney(ngn)
  const costs = Object.fromEntries(Object.entries(prices).map(([code, price]) => [code, { monthly: Math.round(price.monthly * 0.38), annual: Math.round(price.annual * 0.38) }]))
  return { id, label, minEmployees, maxEmployees, prices, costs, custom }
}
const flatModule = (moduleId: string, ngn: number, importance: ModulePrice['importance'], summary: string, required = false): ModulePrice => ({
  moduleId, active: true, required, importance, summary, bands: [band('standard', 'Standard', 1, null, ngn)],
})
const employeeModule = (moduleId: string, prices: [number, number, number], importance: ModulePrice['importance'], summary: string, required = false): ModulePrice => ({
  moduleId, active: true, required, importance, summary,
  bands: [band('starter', '1–20 staff', 1, 20, prices[0]), band('growth', '21–50 staff', 21, 50, prices[1]), band('business', '51–200 staff', 51, 200, prices[2]), band('custom', '201+ staff', 201, null, 0, true)],
})
const SEED_MODULE_PRICES: ModulePrice[] = [
  employeeModule('people', [18000, 30000, 55000], 'Foundation', 'Employee records, departments, company structure and staff lifecycle.', true),
  flatModule('onboarding', 4000, 'Foundation', 'Secure staff data collection, document capture and HR review.', true),
  flatModule('ess', 3000, 'Foundation', 'Employee self-service for profiles, requests and records.', true),
  employeeModule('payroll', [12000, 22000, 45000], 'Essential', 'Nigeria-ready payroll, PAYE, pension, NHF and bank-ready schedules.'),
  employeeModule('attendance', [7000, 14000, 28000], 'Essential', 'Geofenced attendance, shifts, exceptions and field check-ins.'),
  flatModule('leave', 6000, 'Essential', 'Leave policies, balances, approvals, holidays and handover.'),
  flatModule('performance', 10000, 'Recommended', 'Goals, reviews, check-ins, calibration and performance insight.'),
  flatModule('recruitment', 9000, 'Recommended', 'Vacancies, applicants, interview stages and hiring decisions.'),
  flatModule('accounting', 18000, 'Essential', 'General ledger, receivables, payables and management accounts.'),
  flatModule('expenses', 7000, 'Essential', 'Claims, receipts, policy checks and reimbursement tracking.'),
  flatModule('approvals', 8000, 'Foundation', 'Configurable requests and multi-level approval routing.', true),
  flatModule('procurement', 14000, 'Recommended', 'Purchase requests, sourcing, purchase orders and controls.'),
  flatModule('vendors', 10000, 'Recommended', 'Vendor records, obligations, performance and financial position.'),
  flatModule('assets', 10000, 'Recommended', 'Asset register, custody, transfers, maintenance and disposal.'),
  flatModule('fleet', 20000, 'Specialist', 'Vehicles, drivers, trips, fuel, servicing and renewals.'),
  flatModule('travel', 15000, 'Specialist', 'Travel requests, allowances, disbursement and retirement.'),
  flatModule('tasks', 5000, 'Foundation', 'Assigned work, deadlines, collaboration and accountability.', true),
  flatModule('crm', 18000, 'Recommended', 'Leads, customers, pipeline, earnings and follow-ups.'),
  flatModule('documents', 6000, 'Foundation', 'Role-scoped business documents and reusable templates.', true),
  flatModule('sign', 10000, 'Recommended', 'Signature requests, approvals, acknowledgements and smart documents.'),
  flatModule('workflows', 9000, 'Recommended', 'Connected business workflow automation across teams.'),
  flatModule('reports', 9000, 'Essential', 'Operational reports, exports and decision-ready analytics.'),
  flatModule('health', 5000, 'Recommended', 'Business health score and executive operating signals.'),
  flatModule('branches', 7000, 'Specialist', 'Branch structures, controls and branch-scoped reporting.'),
  flatModule('orgchart', 4000, 'Essential', 'Interactive organisation chart with reporting lines and hierarchy insights.'),
  flatModule('rules', 8000, 'Recommended', 'Grade structure, salary matrix and department-level employee rule overrides.'),
  flatModule('exit', 6000, 'Recommended', 'Resignations, clearance, final settlement and exit interviews.'),
  flatModule('security', 8000, 'Essential', 'Company permission governance, consent-based support diagnostics and break-glass controls.'),
  flatModule('branding', 7000, 'Specialist', 'Brand colours, sidebar theme and white-label login for your workspace.'),
  flatModule('budgeting', 8000, 'Recommended', 'Department budgets, commitments and variance tracking.'),
  flatModule('costcentres', 7000, 'Recommended', 'Cost centre reporting and allocation across departments.'),
  flatModule('hybrid', 5000, 'Recommended', 'Hybrid and remote work schedules, check-ins and office capacity.'),
  flatModule('messaging', 5000, 'Recommended', 'Email activity alerts, reminders and payslip notices.'),
  flatModule('wallet', 8000, 'Specialist', 'Employee wallet for disbursements and payouts.'),
  flatModule('integrations', 15000, 'Specialist', 'Integrations, webhooks and API access for your own systems.'),
]
const SEED_BUNDLES: Bundle[] = [
  { id: 'bundle-people', name: 'People Pack', description: 'Core HR plus the full employee lifecycle.', moduleIds: ['people', 'onboarding', 'leave', 'attendance', 'orgchart', 'exit'], discountPct: 10, active: true },
  { id: 'bundle-finance', name: 'Finance Pack', description: 'Payroll, accounting, expenses and budgeting working as one.', moduleIds: ['payroll', 'accounting', 'expenses', 'budgeting'], discountPct: 12, active: true },
  { id: 'bundle-ops', name: 'Operations Pack', description: 'Procurement, vendors, assets and fleet under one control.', moduleIds: ['procurement', 'vendors', 'assets', 'fleet'], discountPct: 10, active: true },
]
const STARTER_MINIMUM = moduleMoney(35000)
const SEED_ADDONS: Addon[] = [
  { id: 'fleet', name: 'Fleet', description: 'Vehicle register, trips, fuel and document renewals.', category: 'Operations', active: true, freq: 'cycle', prices: p50(40000, 32, 26, 30), grants: moduleKeys('fleet'), limitBoosts: {}, plans: ['growth'] },
  { id: 'travel', name: 'Travel', description: 'Travel requests, approval, allowances, preparation, disbursement and retirement.', category: 'Operations', active: true, freq: 'cycle', prices: p50(45000, 35, 28, 32), costs: p3(18000, 14, 11, 13), grants: moduleKeys('travel'), limitBoosts: {}, plans: ['growth'] },
  { id: 'vendors', name: 'Vendor Management', description: 'Department vendor registers, obligations, payments and performance evaluation.', category: 'Operations', active: true, freq: 'cycle', prices: p50(25000, 20, 16, 18), grants: moduleKeys('vendors'), limitBoosts: {}, plans: ['growth'] },
  { id: 'crm-advanced', name: 'Advanced CRM', description: 'Forecasting, automation and deeper pipeline analytics.', category: 'Customers', active: true, freq: 'cycle', prices: p50(30000, 24, 20, 22), grants: ['crm.advanced'], limitBoosts: {}, plans: ['growth'] },
  { id: 'procurement-advanced', name: 'Advanced Procurement', description: 'RFQs, supplier comparison and matching controls.', category: 'Operations', active: true, freq: 'cycle', prices: p50(30000, 24, 20, 22), grants: ['procurement.advanced'], limitBoosts: {}, plans: ['growth'] },
  { id: 'performance-advanced', name: 'Advanced Performance', description: '360 feedback and calibration cycles.', category: 'People', active: true, freq: 'cycle', prices: p50(25000, 20, 16, 18), grants: ['performance.advanced'], limitBoosts: {}, plans: ['growth'] },
  { id: 'sod', name: 'Salary-on-Demand', description: 'Let employees draw earned wages between pay days.', category: 'Money', active: true, freq: 'cycle', prices: p50(35000, 28, 22, 26), grants: ['payroll.sod', 'payroll.advance'], limitBoosts: {}, plans: ['starter'] },
  { id: 'wallet', name: 'Employee Wallet', description: 'A BizFlow wallet for disbursements and payouts.', category: 'Money', active: true, freq: 'cycle', prices: p50(30000, 24, 20, 22), grants: ['wallet.core'], limitBoosts: {}, plans: ['growth', 'business'] },
  { id: 'reporting-advanced', name: 'Advanced Reporting', description: 'Custom reports, exports and operational analytics.', category: 'Insights', active: true, freq: 'cycle', prices: p50(28000, 22, 18, 21), grants: ['reports.advanced', 'reports.analytics'], limitBoosts: {}, plans: ['starter', 'growth'] },
  { id: 'messaging', name: 'Email Notifications', description: 'Send activity alerts, approvals, reminders and payslip notices by email.', category: 'Workflow', active: true, freq: 'cycle', prices: p50(20000, 16, 13, 15), grants: ['messaging.core'], limitBoosts: {}, plans: ['starter', 'growth', 'business'] },
  { id: 'storage', name: 'Additional storage (25 GB)', description: 'Extra document and attachment storage.', category: 'Capacity', active: true, freq: 'cycle', prices: p50(8000, 7, 5, 6), grants: [], limitBoosts: { storageGb: 25 }, plans: ['starter', 'growth', 'business'] },
  { id: 'signatures', name: 'Signature pack (+100 requests)', description: 'Additional monthly BizFlow Sign volume.', category: 'Capacity', active: true, freq: 'cycle', prices: p50(12000, 10, 8, 9), grants: [], limitBoosts: { signatures: 100 }, plans: ['starter', 'growth', 'business'] },
  { id: 'exit', name: 'Exit Management', description: 'Resignation, clearance and final settlement workflow.', category: 'People', active: true, freq: 'cycle', prices: p50(30000, 24, 20, 22), grants: moduleKeys('exit'), limitBoosts: {}, plans: ['starter'] },
  { id: 'rules', name: 'Employee Rules & Salary Matrix', description: 'Grade structure, salary matrix and department overrides.', category: 'People', active: true, freq: 'cycle', prices: p50(36000, 29, 23, 27), grants: moduleKeys('rules'), limitBoosts: {}, plans: ['starter', 'growth'] },
  { id: 'orgchart-insights', name: 'Org chart hierarchy insights', description: 'Span of control, layers and vacancy insights on the organisation chart.', category: 'People', active: true, freq: 'cycle', prices: p50(16000, 13, 10, 12), grants: ['orgchart.insights'], limitBoosts: {}, plans: ['starter'] },
  { id: 'onboarding-wizard', name: 'Employee onboarding wizard', description: 'Guided 8-step employee onboarding with HR review.', category: 'People', active: true, freq: 'cycle', prices: p50(20000, 16, 13, 15), grants: ['onboarding.wizard'], limitBoosts: {}, plans: ['starter'] },
  { id: 'letterhead', name: 'Letterhead & branded documents', description: 'Company letterhead applied to templates, letters and payslips.', category: 'Workflow', active: true, freq: 'cycle', prices: p50(12000, 10, 8, 9), grants: ['documents.letterhead'], limitBoosts: {}, plans: ['starter'] },
  { id: 'whitelabel', name: 'White-label branding', description: 'Sidebar colours, theme, custom login and domain.', category: 'Insights', active: true, freq: 'cycle', prices: p50(30000, 24, 20, 22), grants: ['branding.sidebar', 'branding.whitelabel'], limitBoosts: {}, plans: ['starter', 'growth'] },
  { id: 'security-governance', name: 'Security governance & break-glass', description: 'Company permission governance and audited emergency access.', category: 'Insights', active: true, freq: 'cycle', prices: p50(40000, 32, 26, 30), grants: ['security.core', 'security.breakglass'], limitBoosts: {}, plans: ['starter', 'growth'] },
  { id: 'api', name: 'API access', description: 'Authenticated API and webhooks for your own systems.', category: 'Integrations', active: true, freq: 'cycle', prices: p50(45000, 36, 29, 33), grants: ['integrations.api'], limitBoosts: {}, plans: ['business'] },
]
const SEED_CURRENCIES: Currency[] = [
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', decimals: 0, enabled: true, isDefault: true, regions: ['NG'], tax: { applies: true, label: 'VAT', rate: 7.5, inclusive: false } },
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, enabled: true, isDefault: false, regions: ['US', 'GH', 'KE', 'ZA'], tax: { applies: false, label: 'Tax', rate: 0, inclusive: false } },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2, enabled: true, isDefault: false, regions: ['GB'], tax: { applies: true, label: 'VAT', rate: 20, inclusive: false } },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, enabled: true, isDefault: false, regions: ['DE', 'FR', 'IE'], tax: { applies: true, label: 'VAT', rate: 19, inclusive: true } },
]
const SEED_PROMOS: Promo[] = [
  { id: 'pr1', kind: 'coupon', code: 'WELCOME10', name: 'Welcome offer', description: '10% off the first billing period for new customers.', type: 'percent', value: 10, appliesTo: 'all', plans: [], currencies: [], cycles: [], firstPeriodOnly: true, start: '2026-01-01', end: '2026-12-31', limit: 500, redeemed: 0, eligibility: 'new', active: true, channel: 'Website checkout', campaign: 'Always-on welcome', stacking: 'exclusive', perCompanyCap: null },
  { id: 'pr2', kind: 'coupon', code: 'LAUNCH50K', name: 'Growth launch credit', description: '₦50,000 off Growth annual plans.', type: 'fixed', value: 50000, appliesTo: 'plan', plans: ['growth'], currencies: ['NGN'], cycles: ['annual'], firstPeriodOnly: true, start: '2026-09-01', end: '2026-11-30', limit: 100, redeemed: 0, eligibility: 'new', active: true, channel: 'Email campaign', campaign: 'Q4 Growth launch', stacking: 'exclusive', perCompanyCap: null },
  { id: 'pr3', kind: 'coupon', code: 'PARTNER15', name: 'Partner referral', description: '15% off for referred customers.', type: 'percent', value: 15, appliesTo: 'plan', plans: [], currencies: [], cycles: [], firstPeriodOnly: true, start: '2026-01-01', end: '2026-06-30', limit: null, redeemed: 0, eligibility: 'new', active: true, channel: 'Partner / referral', campaign: 'Partner programme 2026', stacking: 'exclusive', perCompanyCap: null },
  { id: 'pr4', kind: 'automatic', name: 'Fleet add-on launch discount', description: '20% off the Fleet add-on until the end of the year.', type: 'percent', value: 20, appliesTo: 'addon', plans: [], currencies: [], cycles: [], firstPeriodOnly: false, start: '2026-10-01', end: '2026-12-31', limit: null, redeemed: 0, eligibility: 'all', active: false, channel: 'In-app', campaign: 'Fleet launch Q4', stacking: 'stackable', perCompanyCap: null },
]

type SeedSub = [string, string, string, 'monthly' | 'annual', string, number, SubStatus, number, number | undefined, string[]]
const SEED_SUBS_RAW: SeedSub[] = [
  ['c-etranzact', 'eTranzact International Plc', 'enterprise', 'annual', 'NGN', 486, 'active', -234, undefined, []],
]

function buildSeed(): BillingState {
  const base: BillingState = { plans: SEED_PLANS, addons: SEED_ADDONS, modulePrices: SEED_MODULE_PRICES, starterMinimum: STARTER_MINIMUM, currencies: SEED_CURRENCIES, promos: SEED_PROMOS, subs: [], payments: [], audit: [], bundles: SEED_BUNDLES, draft: null, scheduled: [], priceHistory: [], pricingRelease: 1, redemptions: [], promoCrm: seedCrm(), companyId: 'c-etranzact', version: 6 }
  const payments: Payment[] = []
  const subs = SEED_SUBS_RAW.map(([id, company, planId, cycle, currency, employees, status, startOffset, trialLeft, addons], i) => {
    const started = addDays(TODAY, startOffset)
    const q = quote(base, { planId, cycle, currency, employees, addonIds: addons })
    const net = planId === 'enterprise' ? 18500000 : q.ok ? q.subtotal : 0
    const renews = status === 'trial' ? addDays(TODAY, trialLeft ?? 0) : cycle === 'annual' ? addMonths(started, 12) : addMonths(started, 1 + Math.floor((TODAY.getTime() - started.getTime()) / 2629800000))
    const plan = base.plans.find((p) => p.id === planId)!
    const usageFor = (k: LimitKey) => { const l = plan.limits[k]; const r = [0.78, 0.55, 0.9, 0.4, 0.62][(i + k.length) % 5]; return l === null ? Math.round(employees * (k === 'storageGb' ? 0.4 : 3)) : Math.round(Math.min(l, k === 'employees' ? employees : l * r)) }
    const usage = { employees, branches: usageFor('branches'), storageGb: usageFor('storageGb'), documents: usageFor('documents'), signatures: usageFor('signatures'), leads: usageFor('leads') }
    if (id === 'c-etranzact') Object.assign(usage, { branches: 4, storageGb: 212, documents: 6480, signatures: 1320, leads: 640 })
    if (status !== 'trial') payments.push({ id: `pay-${id}-1`, subId: id, at: iso(started), amount: Math.round(net * (1 + (base.currencies.find((c) => c.code === currency)!.tax.applies && !base.currencies.find((c) => c.code === currency)!.tax.inclusive ? base.currencies.find((c) => c.code === currency)!.tax.rate / 100 : 0))), currency, status: 'successful', ref: `BF-TX-${(48210 + i * 37).toString()}`, description: `${plan.name} · ${cycle}` })
    if (status === 'past_due' || status === 'payment_failed' || status === 'grace') payments.push({ id: `pay-${id}-2`, subId: id, at: iso(addDays(TODAY, -3)), amount: net, currency, status: 'failed', ref: `BF-TX-${(49100 + i * 11).toString()}`, description: `Renewal · card declined` })
    if (status === 'suspended') payments.push({ id: `pay-${id}-3`, subId: id, at: iso(addDays(TODAY, -45)), amount: net, currency, status: 'failed', ref: `BF-TX-48990`, description: 'Renewal · card expired' })
    return {
      id, company, country: currency === 'GBP' ? 'GB' : currency === 'USD' ? 'GH' : 'NG', planId, cycle, currency, employees, status, startedAt: iso(started),
      trialEndsAt: status === 'trial' ? iso(addDays(TODAY, trialLeft ?? 0)) : undefined, renewsAt: iso(renews), endsAt: status === 'cancelled' ? iso(addDays(TODAY, 21)) : undefined, net, addons, overrides: [], credit: 0, usage,
      card: status === 'trial' ? null : { brand: 'Mastercard', last4: id === 'c-etranzact' ? '4242' : String(1000 + i * 137).slice(-4), exp: '09/29' },
    } as Subscription
  })
  const audit: AuditEntry[] = [
    { id: 'a1', at: iso(addDays(TODAY, -6)) + 'T10:12', actor: 'Folake Adeyinka (Super Admin)', company: 'eTranzact International Plc', action: 'Renewal reminder sent to billing contact', prev: 'Active', next: 'Active' },
    { id: 'a2', at: iso(addDays(TODAY, -3)) + 'T15:40', actor: 'Folake Adeyinka (Super Admin)', company: 'eTranzact International Plc', action: 'Enterprise contract terms reviewed', prev: 'Draft', next: 'Approved' },
    { id: 'a3', at: iso(addDays(TODAY, -2)) + 'T09:05', actor: 'Adaeze Nwankwo (Billing Manager)', company: 'Platform', action: 'Published coupon LAUNCH50K', prev: '—', next: 'Active · ₦50,000 off Growth annual' },
  ]
  return reconcile({ ...base, subs, payments, audit, redemptions: seedLedger(subs[0]?.startedAt ?? iso(addDays(TODAY, -234))) })
}

/* ---------- Store ---------- */
const KEY = 'bf-commercial-v4'
const LEGACY_KEYS = ['bf-commercial-v3', 'bf-commercial-v2']
/* Feature keys introduced in release 5 (company templates, Employee Rules, org chart, branding, security governance, exit, onboarding wizard). */
const NEW_KEYS = new Set([...allOf('orgchart', 'rules', 'exit', 'security', 'branding'), 'onboarding.wizard', 'onboarding.core', 'documents.letterhead'])
const migrate = (s: BillingState): BillingState => {
  const legacy = s.version < 2
  const addons = s.addons.map((addon) => {
    const prices = legacy ? Object.fromEntries(Object.entries(addon.prices).map(([code, price]) => [code, { monthly: price.monthly / 2, annual: price.annual / 2 }])) : addon.prices
    return addon.id === 'messaging' && s.version < 4
      ? { ...addon, name: 'Email Notifications', description: 'Send activity alerts, approvals, reminders and payslip notices by email.', prices }
      : addon.id === 'travel' && s.version < 4 ? { ...addon, plans: ['starter', 'growth'], prices } : { ...addon, prices }
  })
  for (const addon of SEED_ADDONS) if (!addons.some((a) => a.id === addon.id)) addons.push(addon)
  const vendorFeatures = moduleKeys('vendors')
  let plans = s.plans
  if (s.version < 4) plans = plans.map((plan) => ['business', 'enterprise'].includes(plan.id)
    ? { ...plan, features: uniq([...plan.features, ...moduleKeys('travel'), ...vendorFeatures]) }
    : { ...plan, features: plan.features.filter((feature) => !feature.startsWith('vendors.')) })
  if (s.version < 5) plans = plans.map((plan) => {
    const seed = SEED_PLANS.find((p) => p.id === plan.id)
    if (!seed) return plan
    if (plan.id === 'enterprise') return { ...plan, features: uniq(ALL_FEATURES), highlights: seed.highlights }
    return { ...plan, features: uniq([...plan.features, ...seed.features.filter((k) => NEW_KEYS.has(k))]), highlights: seed.highlights }
  })
  const depState = { modulePrices: s.modulePrices ?? SEED_MODULE_PRICES } as BillingState
  const normalizedAddons = addons.map((addon) => ({ ...addon, plans: addon.plans.filter((id) => {
    const plan = plans.find((candidate) => candidate.id === id)
    return !!plan && (Object.values(addon.limitBoosts).some((value) => (value ?? 0) > 0) || addon.grants.some((feature) => !plan.features.includes(feature))) && addonMissingDeps(addon, plan, depState).length === 0
  }) }))
  const subs = s.subs.map((sub) => {
    const plan = plans.find((candidate) => candidate.id === sub.planId)
    return { ...sub, addons: sub.addons.filter((id) => {
      const addon = normalizedAddons.find((candidate) => candidate.id === id)
      return !!plan && !!addon && (Object.values(addon.limitBoosts).some((value) => (value ?? 0) > 0) || addon.grants.some((feature) => !plan.features.includes(feature))) && addonMissingDeps(addon, plan, depState).length === 0
    }) }
  })
  const modulePrices = [...(s.modulePrices ?? SEED_MODULE_PRICES)]
  for (const rate of SEED_MODULE_PRICES) if (!modulePrices.some((r) => r.moduleId === rate.moduleId)) modulePrices.push(rate)
  const redemptions = Array.isArray(s.redemptions) ? s.redemptions : seedLedger(subs[0]?.startedAt ?? iso(addDays(TODAY, -234)))
  return applyDue(reconcile({ ...s, plans, addons: normalizedAddons, subs, modulePrices, starterMinimum: s.starterMinimum ?? STARTER_MINIMUM,
    bundles: s.bundles ?? SEED_BUNDLES, draft: s.draft ?? null, scheduled: s.scheduled ?? [], priceHistory: s.priceHistory ?? [], pricingRelease: s.pricingRelease ?? 1, redemptions, promoCrm: s.promoCrm ?? seedCrm(), version: 6 }))
}
/** Promote scheduled price changes whose effective date has arrived. */
export function applyDue(s: BillingState): BillingState {
  const t = iso(TODAY); const due = s.scheduled.filter((c) => c.status === 'scheduled' && c.effectiveFrom <= t)
  if (!due.length) return s
  let next = s
  for (const c of [...due].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))) next = { ...next, ...snapshotApply(next, c), scheduled: next.scheduled.map((x) => (x.id === c.id ? { ...x, status: 'applied' as const } : x)) }
  return next
}
const snapshotApply = (s: BillingState, c: PricingSnapshot) => ({
  modulePrices: [...s.modulePrices.filter((r) => !c.rates.some((x) => x.moduleId === r.moduleId)), ...c.rates].sort((a, b) => SEED_MODULE_PRICES.findIndex((x) => x.moduleId === a.moduleId) - SEED_MODULE_PRICES.findIndex((x) => x.moduleId === b.moduleId)),
  bundles: c.bundles, starterMinimum: c.starterMinimum,
})
/** Billing state as it will be on a given date: scheduled price changes up to that date are applied. */
export function ratesAsOf(s: BillingState, date: string): BillingState {
  let next = s
  for (const c of [...s.scheduled].filter((x) => x.status === 'scheduled' && x.effectiveFrom <= date).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))) next = { ...next, ...snapshotApply(next, c) }
  return next
}
const load = (): BillingState => {
  for (const key of [KEY, ...LEGACY_KEYS]) {
    try { const s = JSON.parse(localStorage.getItem(key) || 'null'); if ([1, 2, 3, 4, 5, 6].includes(s?.version) && s.companyId === 'c-etranzact' && s.subs?.every((x: Subscription) => x.id === 'c-etranzact' || x.selfServe)) return migrate(s) } catch { /* ignore */ }
  }
  return buildSeed()
}
let state: BillingState | undefined
const subs = new Set<() => void>()
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(getBilling())) } catch { /* ignore */ } subs.forEach((f) => f()) }
export const getBilling = (): BillingState => (state ??= load())
export const setBilling = (fn: (s: BillingState) => BillingState) => { state = fn(getBilling()); emit() }
export const resetBilling = () => { state = buildSeed(); emit() }
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useBilling = () => useSyncExternalStore(subscribe, getBilling)
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY) { state = load(); subs.forEach((f) => f()) } })

let uid = Date.now()
export const nid = (p: string) => `${p}-${(uid++).toString(36)}`

/* ---------- Money ---------- */
export const currencyOf = (s: BillingState, code: string) => s.currencies.find((c) => c.code === code)
export function money(amount: number, code: string, opts: { trim?: boolean; s?: BillingState } = {}) {
  const c = currencyOf(opts.s ?? getBilling(), code)
  const d = c?.decimals ?? 2
  const dec = opts.trim && Number.isInteger(amount) ? 0 : d
  return `${c?.symbol ?? code + ' '}${amount.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`
}
export const round = (n: number, code: string, s: BillingState = getBilling()) => { const d = currencyOf(s, code)?.decimals ?? 2; const f = 10 ** d; return Math.round(n * f) / f }
export const activeCurrencies = (s: BillingState) => s.currencies.filter((c) => c.enabled)
export const defaultCurrency = (s: BillingState) => (s.currencies.find((c) => c.isDefault && c.enabled) ?? s.currencies.find((c) => c.enabled))?.code ?? 'NGN'

/* ---------- Plan helpers ---------- */
export const publicPlans = (s: BillingState) => s.plans.filter((p) => p.status === 'active' && p.visible).sort((a, b) => a.order - b.order)
export const planById = (s: BillingState, id: string) => s.plans.find((p) => p.id === id)
export const isCustom = (p: Plan) => p.model === 'custom'
export const priceIn = (p: Plan, cur: string) => p.prices[cur]
export const addonAddsValue = (a: Addon, p: Plan) =>
  Object.values(a.limitBoosts).some((value) => (value ?? 0) > 0) || a.grants.some((feature) => !p.features.includes(feature))
/** Modules an add-on needs that neither the plan nor the add-on itself provides (e.g. Travel add-on on a plan without Expenses). */
export const addonMissingDeps = (a: Addon, p: Plan, s: BillingState = getBilling()) => {
  const have = new Set([...modulesIn(p.features), ...modulesIn(a.grants)])
  return [...new Set(modulesIn(a.grants).flatMap((m) => depsOf(s, m)).filter((d) => !have.has(d)))]
}
export const addonFits = (a: Addon, planId: string, s: BillingState = getBilling()) => {
  const plan = planById(s, planId)
  return !!plan && a.active && a.plans.includes(planId) && addonAddsValue(a, plan) && addonMissingDeps(a, plan, s).length === 0
}
export const addonPrice = (a: Addon, cur: string, cycle: 'monthly' | 'annual') => {
  const p = a.prices[cur]; if (!p) return null
  if (a.freq === 'monthly') return cycle === 'annual' ? p.monthly * 12 : p.monthly
  if (a.freq === 'annual') return cycle === 'annual' ? p.annual : p.annual / 12
  return cycle === 'annual' ? p.annual : p.monthly
}

/* Cost of the plan base plus employee-driven charges for one period */
export function planCost(p: Plan, cur: string, cycle: 'monthly' | 'annual', employees: number) {
  const pr = p.prices[cur]; if (!pr || p.model === 'custom') return null
  const unit = cycle === 'annual' ? pr.annual : pr.monthly
  const extra = cycle === 'annual' ? pr.extraAnnual ?? 0 : pr.extraMonthly ?? 0
  if (p.model === 'per_employee') return { base: unit * employees, extra: 0, extraCount: 0 }
  const extraCount = p.model === 'base_plus_employee' ? Math.max(0, employees - p.includedEmployees) : 0
  return { base: unit, extra: extra * extraCount, extraCount }
}
export const fitsEmployees = (p: Plan, n: number) => p.limits.employees === null || p.limits.employees >= n
export function recommendPlan(s: BillingState, employees: number, cur: string) {
  const list = publicPlans(s).filter((p) => isCustom(p) || p.prices[cur])
  const priced = list.filter((p) => !isCustom(p) && fitsEmployees(p, employees))
  const rec = priced.find((p) => p.recommended)
  return rec ?? priced[0] ?? list.find(isCustom) ?? null
}

/* ---------- Promotions / quote ---------- */
export function couponCheck(s: BillingState, code: string, ctx: { planId: string; currency: string; cycle: 'monthly' | 'annual'; isNew?: boolean; companyId?: string }): { ok: boolean; promo?: Promo; message: string } {
  const c = code.trim().toUpperCase(); if (!c) return { ok: false, message: '' }
  const p = s.promos.find((x) => x.kind === 'coupon' && x.code === c)
  if (!p || !p.active) return { ok: false, message: 'That code is not valid.' }
  const t = iso(TODAY)
  if (t < p.start) return { ok: false, message: 'That code is not active yet.' }
  if (t > p.end) return { ok: false, message: 'That code has expired.' }
  if (p.limit !== null && p.redeemed >= p.limit) return { ok: false, message: 'That code has reached its redemption limit.' }
  if (p.perCompanyCap && (s.redemptions ?? []).filter((r) => r.promoId === p.id && r.status === 'applied' && r.subId === (ctx.companyId ?? s.companyId)).length >= p.perCompanyCap) return { ok: false, message: 'Your company has already used this code the maximum number of times.' }
  if (p.plans.length && !p.plans.includes(ctx.planId)) return { ok: false, message: `That code does not apply to the ${planById(s, ctx.planId)?.name ?? ''} plan.` }
  if (p.currencies.length && !p.currencies.includes(ctx.currency)) return { ok: false, message: `That code is not available in ${ctx.currency}.` }
  if (p.cycles.length && !p.cycles.includes(ctx.cycle)) return { ok: false, message: `That code applies to ${p.cycles.join('/')} billing only.` }
  if (p.eligibility === 'new' && ctx.isNew === false) return { ok: false, message: 'That code is for new customers.' }
  return { ok: true, promo: p, message: `${p.name} applied.` }
}
const promoAmount = (pr: Promo, base: number) => (pr.type === 'percent' ? (base * pr.value) / 100 : Math.min(pr.value, base))

export type QuoteLine = { label: string; detail?: string; amount: number; kind: 'plan' | 'employees' | 'addon'; addonId?: string; complimentary?: string }
export type Quote = {
  ok: boolean; reason?: string; lines: QuoteLine[]; subtotal: number; discounts: { label: string; amount: number; promoId?: string; grantId?: string }[]; discount: number; complimentary: number
  taxLabel: string; taxRate: number; inclusive: boolean; tax: number; total: number; currency: string; cycle: 'monthly' | 'annual'; perMonthEquivalent: number
}
export function quote(s: BillingState, i: { planId: string; cycle: 'monthly' | 'annual'; currency: string; employees: number; addonIds?: string[]; coupon?: string; isNew?: boolean; subId?: string; on?: string }): Quote {
  const empty: Quote = { ok: false, lines: [], subtotal: 0, discounts: [], discount: 0, complimentary: 0, taxLabel: '', taxRate: 0, inclusive: false, tax: 0, total: 0, currency: i.currency, cycle: i.cycle, perMonthEquivalent: 0 }
  const plan = planById(s, i.planId); const cur = currencyOf(s, i.currency)
  if (!plan || !cur || !cur.enabled) return { ...empty, reason: 'Currency or plan unavailable.' }
  const pc = planCost(plan, i.currency, i.cycle, i.employees)
  if (!pc) return { ...empty, reason: plan.model === 'custom' ? 'Custom pricing — contact sales.' : `${plan.name} is not priced in ${i.currency}.` }
  const lines: QuoteLine[] = [{ label: `${plan.name} plan`, detail: plan.model === 'per_employee' ? `${i.employees} employees` : `Includes ${plan.includedEmployees} employees`, amount: pc.base, kind: 'plan' }]
  if (pc.extraCount > 0) lines.push({ label: 'Additional employees', detail: `${pc.extraCount} × ${money(pc.extra / pc.extraCount, i.currency, { s, trim: true })}`, amount: pc.extra, kind: 'employees' })
  for (const id of i.addonIds ?? []) {
    const a = s.addons.find((x) => x.id === id); if (!a || !addonFits(a, plan.id, s)) continue
    const ap = addonPrice(a, i.currency, i.cycle); if (ap === null) continue
    lines.push({ label: a.name, detail: 'Add-on', amount: ap, kind: 'addon', addonId: a.id })
  }
  const subtotal = round(lines.reduce((a, l) => a + l.amount, 0), i.currency, s)
  const t = iso(TODAY)
  /* Complimentary grants come first: a covered line is 100% discounted, and coupons only see the lines that remain paid. */
  const gl = i.subId ? liveGrantsFor(i.subId, i.on ?? t) : []
  const grantRows: Quote['discounts'] = []
  for (const g of gl) {
    const amt = lines.filter((l) => !l.complimentary && (l.kind === 'addon' ? !!l.addonId && g.scope.addons.includes(l.addonId) : !!g.scope.planId)).reduce((a, l) => { l.complimentary = complimentaryLabel(g); return a + l.amount }, 0)
    if (amt > 0) grantRows.push({ label: complimentaryLabel(g), amount: round(amt, i.currency, s), grantId: g.id })
  }
  const compTotal = round(grantRows.reduce((a, d) => a + d.amount, 0), i.currency, s)
  const planBase = lines.filter((l) => l.kind !== 'addon' && !l.complimentary).reduce((a, l) => a + l.amount, 0)
  const addonBase = lines.filter((l) => l.kind === 'addon' && !l.complimentary).reduce((a, l) => a + l.amount, 0)
  const applicable: Promo[] = s.promos.filter((p) => p.kind === 'automatic' && p.active && t >= p.start && t <= p.end && (!p.plans.length || p.plans.includes(plan.id)) && (!p.currencies.length || p.currencies.includes(i.currency)) && (!p.cycles.length || p.cycles.includes(i.cycle)))
  const cc = i.coupon ? couponCheck(s, i.coupon, { planId: plan.id, currency: i.currency, cycle: i.cycle, isNew: i.isNew ?? true }) : null
  if (cc?.ok && cc.promo) applicable.push(cc.promo)
  let discounts = applicable.map((p) => ({ promo: p, label: p.code ? `Code ${p.code}` : p.name, promoId: p.id, amount: round(promoAmount(p, p.appliesTo === 'plan' ? planBase : p.appliesTo === 'addon' ? addonBase : subtotal - compTotal), i.currency, s) })).filter((d) => d.amount > 0)
  /* An exclusive promo cannot be combined: the single richest exclusive offer wins over everything else. */
  if (discounts.some((d) => d.promo.stacking === 'exclusive') && discounts.length > 1) discounts = [[...discounts].sort((a, b) => b.amount - a.amount)[0]]
  const discount = Math.min(subtotal, round(compTotal + Math.min(subtotal - compTotal, discounts.reduce((a, d) => a + d.amount, 0)), i.currency, s))
  const discountRows = [...grantRows, ...discounts.map(({ label, amount, promoId }) => ({ label, amount, promoId }))]
  const net = subtotal - discount
  const taxRate = cur.tax.applies ? cur.tax.rate : 0
  const inclusive = cur.tax.applies && cur.tax.inclusive
  const tax = round(inclusive ? net - net / (1 + taxRate / 100) : (net * taxRate) / 100, i.currency, s)
  const total = round(inclusive ? net : net + tax, i.currency, s)
  return { ok: true, lines, subtotal, discounts: discountRows, discount, complimentary: compTotal, taxLabel: cur.tax.applies ? cur.tax.label : '', taxRate, inclusive, tax, total, currency: i.currency, cycle: i.cycle, perMonthEquivalent: i.cycle === 'annual' ? subtotal / 12 : subtotal }
}

export type ModuleQuoteLine = { moduleId: string; label: string; band: string; amount: number; model: BillingModel; list: number; discount: number; note?: string; complimentary?: string }
export type ModuleQuote = {
  ok: boolean; custom: boolean; reason?: string; currency: string; cycle: 'monthly' | 'annual'
  selected: string[]; autoAdded: string[]; lines: ModuleQuoteLine[]
  moduleSubtotal: number; bundles: { id: string; name: string; amount: number }[]; bundleDiscount: number
  minimumAdjustment: number; subtotal: number; setup: number; tax: number; total: number
}
export const modelOf = (rate: ModulePrice): BillingModel => rate.model ?? (rate.bands.length > 1 ? 'per_band' : 'flat')
export const depsOf = (s: BillingState, id: string): string[] => s.modulePrices.find((r) => r.moduleId === id)?.requires ?? MODULE_DEPS[id] ?? []
export const bandFor = (rate: ModulePrice, employees: number) => rate.bands.find((b) => employees >= b.minEmployees && (b.maxEmployees === null || employees <= b.maxEmployees))
/** Resolve the module list a customer ends up with: required modules plus transitive dependencies. */
export function expandModules(s: BillingState, ids: string[]) {
  const live = (id: string) => s.modulePrices.some((r) => r.active && r.moduleId === id)
  const base = [...new Set([...s.modulePrices.filter((r) => r.active && r.required).map((r) => r.moduleId), ...ids])].filter(live)
  const out = [...base]; const auto: string[] = []
  for (let i = 0; i < out.length; i++) for (const d of depsOf(s, out[i])) if (live(d) && !out.includes(d)) { out.push(d); if (!base.includes(d)) auto.push(d) }
  const order = (id: string) => s.modulePrices.findIndex((r) => r.moduleId === id)
  return { selected: out.sort((a, b) => order(a) - order(b)), autoAdded: auto }
}
/** Customer-visible charge for one module at a given size (before bundle discounts). null = unpriced, 'custom' = sales-assisted. */
export function rateAmount(s: BillingState, rate: ModulePrice, employees: number, currency: string, cycle: 'monthly' | 'annual', usage?: number): number | 'custom' | null {
  const model = modelOf(rate)
  const tier = model === 'flat' ? (rate.bands.find((b) => !b.custom) ?? bandFor(rate, employees)) : bandFor(rate, employees)
  if (!tier || tier.custom) return 'custom'
  const unit = tier.prices[currency]?.[cycle]; if (unit === undefined) return null
  const list = unit * (model === 'per_employee' ? employees : model === 'usage' ? usage ?? employees : 1)
  const pct = (cycle === 'annual' ? rate.discountAnnual : rate.discountMonthly) ?? 0
  return round(Math.max(list * (1 - pct / 100), rate.minCharge?.[currency]?.[cycle] ?? 0), currency, s)
}
export function quoteModules(s0: BillingState, input: { moduleIds: string[]; employees: number; currency: string; cycle: 'monthly' | 'annual'; usage?: Record<string, number>; asOf?: string; subId?: string }): ModuleQuote {
  const s = input.asOf ? ratesAsOf(s0, input.asOf) : s0
  const { selected, autoAdded } = expandModules(s, input.moduleIds)
  const cur = currencyOf(s, input.currency)
  const empty = { ok: false, custom: false, currency: input.currency, cycle: input.cycle, selected, autoAdded, lines: [], moduleSubtotal: 0, bundles: [], bundleDiscount: 0, minimumAdjustment: 0, subtotal: 0, setup: 0, tax: 0, total: 0 } satisfies ModuleQuote
  if (!cur?.enabled) return { ...empty, reason: 'Currency unavailable.' }
  const lines: ModuleQuote['lines'] = []
  let setup = 0
  const gl = input.subId ? liveGrantsFor(input.subId, input.asOf) : []
  for (const id of selected) {
    const rate = s.modulePrices.find((item) => item.moduleId === id)!
    const model = modelOf(rate); const name = moduleById(id)?.name ?? id
    const tier = model === 'flat' ? (rate.bands.find((b) => !b.custom) ?? bandFor(rate, input.employees)) : bandFor(rate, input.employees)
    if (!tier) return { ...empty, custom: true, reason: `${name} needs a custom quote for this company size.` }
    if (tier.custom) return { ...empty, custom: true, reason: `${name} is custom-priced for ${input.employees.toLocaleString()} staff.` }
    const unit = tier.prices[input.currency]?.[input.cycle]
    if (unit === undefined) return { ...empty, reason: `${name} is not priced in ${input.currency}.` }
    const units = model === 'per_employee' ? input.employees : model === 'usage' ? input.usage?.[id] ?? input.employees : 1
    const list = unit * units
    const pct = (input.cycle === 'annual' ? rate.discountAnnual : rate.discountMonthly) ?? 0
    const discounted = list * (1 - pct / 100)
    const floor = rate.minCharge?.[input.currency]?.[input.cycle] ?? 0
    const paid = round(Math.max(discounted, floor), input.currency, s)
    const free = gl.find((g) => grantCoversModule(s, g, id))
    const amount = free ? 0 : paid
    lines.push({ moduleId: id, label: name, band: tier.label, amount, model, list: round(list, input.currency, s), discount: Math.max(0, round(list - amount, input.currency, s)), complimentary: free ? complimentaryLabel(free) : undefined, note: free ? complimentaryLabel(free) : units !== 1 ? `${units.toLocaleString()} × ${money(unit, input.currency, { s, trim: true })}${rate.unitLabel ? ` per ${rate.unitLabel}` : ''}` : floor > discounted ? 'Minimum charge applied' : undefined })
    if (!free) setup += rate.setupFee?.[input.currency] ?? 0
  }
  const moduleSubtotal = round(lines.reduce((sum, line) => sum + line.amount, 0), input.currency, s)
  /* Bundles: a module can belong to one discounted bundle per quote; richest discount wins. */
  const used = new Set<string>(); const bundles: ModuleQuote['bundles'] = []; const t = input.asOf ?? iso(TODAY)
  for (const b of [...s.bundles].filter((x) => x.active && x.moduleIds.length > 1 && (!x.validFrom || x.validFrom <= t)).sort((a, c) => c.discountPct - a.discountPct)) {
    if (!b.moduleIds.every((id) => selected.includes(id) && !used.has(id))) continue
    b.moduleIds.forEach((id) => used.add(id))
    const base = lines.filter((l) => b.moduleIds.includes(l.moduleId)).reduce((sum, l) => sum + l.amount, 0)
    const amount = round(base * b.discountPct / 100, input.currency, s)
    if (amount > 0) bundles.push({ id: b.id, name: b.name, amount })
  }
  const bundleDiscount = round(bundles.reduce((sum, b) => sum + b.amount, 0), input.currency, s)
  const minimum = s.starterMinimum[input.currency]?.[input.cycle] ?? 0
  const minimumAdjustment = lines.some((l) => l.complimentary) ? 0 : Math.max(0, minimum - (moduleSubtotal - bundleDiscount))
  const subtotal = round(moduleSubtotal - bundleDiscount + minimumAdjustment, input.currency, s)
  setup = round(setup, input.currency, s)
  const tax = round(cur.tax.applies && !cur.tax.inclusive ? (subtotal + setup) * cur.tax.rate / 100 : 0, input.currency, s)
  return { ok: true, custom: false, currency: input.currency, cycle: input.cycle, selected, autoAdded, lines, moduleSubtotal, bundles, bundleDiscount, minimumAdjustment, subtotal, setup, tax, total: subtotal + setup + tax }
}

/* ---------- Entitlements ---------- */
export type Ent = { enabled: boolean; source: string; kind: 'plan' | 'addon' | 'override' | 'grant' | 'none' }
/** `grants: false` returns what the subscription is entitled to without any complimentary overlay (used by health scoring). */
export function entitlements(s: BillingState, sub: Subscription | undefined, opts: { grants?: boolean } = {}): Record<string, Ent> {
  const out: Record<string, Ent> = {}
  const plan = sub && planById(s, sub.planId)
  const dead = !sub || sub.status === 'suspended' || sub.status === 'expired'
  for (const f of ALL_FEATURES) out[f] = { enabled: false, source: dead && sub ? `Subscription ${sub.status}` : 'Not included', kind: 'none' }
  if (!sub || !plan || dead) return out
  for (const f of sub.customFeatures ?? plan.features) out[f] = { enabled: true, source: sub.customFeatures ? 'Custom contract' : plan.name, kind: 'plan' }
  for (const id of sub.addons) { const a = s.addons.find((x) => x.id === id); a?.grants.forEach((f) => { if (!out[f].enabled) out[f] = { enabled: true, source: `Add-on: ${a.name}`, kind: 'addon' } }) }
  for (const o of sub.overrides) moduleKeys(o.module).forEach((f) => { if (!out[f].enabled) out[f] = { enabled: true, source: `Admin override: ${o.reason}`, kind: 'override' } })
  if (opts.grants !== false) {
    convertedModulesFor(sub.id).forEach((m) => moduleKeys(m).forEach((f) => { if (!out[f].enabled) out[f] = { enabled: true, source: 'Kept after a complimentary period, billed at the normal price', kind: 'addon' } }))
    for (const g of liveGrantsFor(sub.id)) grantFeatures(s, g).forEach((f) => { if (out[f] && !out[f].enabled) out[f] = { enabled: true, source: `${complimentaryLabel(g)} · ${g.name}`, kind: 'grant' } })
  }
  return out
}
export const moduleState = (ent: Record<string, Ent>, id: string): Ent => {
  const ks = moduleKeys(id); const on = ks.find((k) => ent[k]?.enabled)
  return on ? ent[on] : ent[ks[0]] ?? { enabled: false, source: 'Not included', kind: 'none' }
}
export function effectiveLimits(s: BillingState, sub: Subscription | undefined, opts: { grants?: boolean } = {}): Limits {
  const plan = sub && planById(s, sub.planId)
  const l: Limits = sub?.customLimits ? { ...sub.customLimits } : plan ? { ...plan.limits } : lim(0, 0, 0, 0, 0, 0)
  sub?.addons.forEach((id) => { const a = s.addons.find((x) => x.id === id); if (!a) return; (Object.keys(a.limitBoosts) as LimitKey[]).forEach((k) => { if (l[k] !== null) l[k] = (l[k] as number) + (a.limitBoosts[k] ?? 0) }) })
  if (sub && opts.grants !== false && sub.status !== 'suspended' && sub.status !== 'expired') {
    for (const g of liveGrantsFor(sub.id)) {
      const gp = g.scope.planId ? planById(s, g.scope.planId) : undefined
      for (const k of Object.keys(l) as LimitKey[]) {
        if (gp && l[k] !== null && (gp.limits[k] === null || gp.limits[k]! > (l[k] as number))) l[k] = gp.limits[k]
        const boost = g.scope.addons.reduce((n, id) => n + (s.addons.find((x) => x.id === id)?.limitBoosts[k] ?? 0), 0)
        if (l[k] !== null && boost && !sub.addons.some((id) => g.scope.addons.includes(id))) l[k] = (l[k] as number) + boost
      }
    }
  }
  return l
}
export const minPlanFor = (s: BillingState, moduleId: string) => publicPlans(s).find((p) => moduleKeys(moduleId).some((k) => p.features.includes(k)))
export const addonFor = (s: BillingState, moduleId: string, planId: string) => s.addons.find((a) => addonFits(a, planId, s) && a.grants.some((g) => moduleKeys(moduleId).includes(g)))
export const planDiff = (from: Plan, to: Plan) => {
  const has = (p: Plan, m: Module) => m.features.some((f) => p.features.includes(f.key))
  return { gained: MODULES.filter((m) => !has(from, m) && has(to, m)), lost: MODULES.filter((m) => has(from, m) && !has(to, m)),
    featureGained: ALL_FEATURES.filter((f) => !from.features.includes(f) && to.features.includes(f)), featureLost: ALL_FEATURES.filter((f) => from.features.includes(f) && !to.features.includes(f)) }
}
export const currentSub = (s: BillingState) => s.subs.find((x) => x.id === s.companyId)

/* ---------- App route → catalog module ---------- */
export const ROUTE_MODULE: Record<string, string> = { organization: 'orgchart', exit: 'exit', my: 'my', people: 'people', payroll: 'payroll', accounting: 'accounting', reports: 'reports', approvals: 'approvals', tasks: 'tasks', travel: 'travel', procurement: 'procurement', vendors: 'vendors', assets: 'assets', fleet: 'fleet', crm: 'crm', documents: 'documents', sign: 'sign', health: 'health' }

export function useEntitlements() {
  const s = useBilling()
  useGrants()
  /* A self-serve company is entitled by its own subscription (`c-<slug>`), never by the demo company's. */
  const slug = businessSession()?.slug
  const sub = (slug && s.subs.find((x) => x.selfServe && x.id === `c-${slug}`)) || currentSub(s)
  const plan = sub ? planById(s, sub.planId) : undefined
  const ent = entitlements(s, sub)
  const limits = effectiveLimits(s, sub)
  return {
    s, sub, plan, ent, limits, status: sub?.status,
    has: (feature: string) => !!ent[feature]?.enabled,
    hasModule: (id: string) => moduleState(ent, id).enabled,
    moduleSource: (id: string) => moduleState(ent, id).source,
    blocked: !sub || sub.status === 'suspended' || sub.status === 'expired',
  }
}

/* ---------- Mutations (each writes an audit record) ---------- */
export function logAudit(actor: string, company: string, action: string, prev: string, next: string) {
  setBilling((s) => ({ ...s, audit: [{ id: nid('au'), at: new Date(TODAY.getTime() + (s.audit.length + 1) * 60000).toISOString().slice(0, 16), actor, company, action, prev, next }, ...s.audit] }))
}
const patchSub = (id: string, fn: (x: Subscription) => Subscription) => setBilling((s) => ({ ...s, subs: s.subs.map((x) => (x.id === id ? fn(x) : x)) }))
const payRef = () => `BF-TX-${Math.floor(50000 + Math.random() * 49999)}`
export const addPayment = (p: Omit<Payment, 'id' | 'ref'> & { ref?: string }) => { const pay = { ...p, id: nid('pay'), ref: p.ref ?? payRef() }; setBilling((s) => ({ ...s, payments: [pay, ...s.payments] })); return pay }

export const subActions = {
  changePlan(id: string, planId: string, actor: string, reason = '') {
    const s = getBilling(); const sub = s.subs.find((x) => x.id === id)!; const from = planById(s, sub.planId)!; const to = planById(s, planId)!
    const addons = sub.addons.filter((a) => { const ad = s.addons.find((x) => x.id === a); return ad && addonFits(ad, planId, s) })
    const q = quote(s, { planId, cycle: sub.cycle, currency: sub.currency, employees: sub.employees, addonIds: addons, isNew: false })
    patchSub(id, (x) => ({ ...x, planId, addons, net: q.ok ? q.subtotal : x.net, pendingChange: undefined, status: x.status === 'trial' ? 'trial' : x.status }))
    logAudit(actor, sub.company, `Changed plan ${from.name} → ${to.name}${reason ? ` (${reason})` : ''}`, from.name, to.name)
  },
  schedulePlan(id: string, planId: string, actor: string) {
    const s = getBilling(); const sub = s.subs.find((x) => x.id === id)!
    patchSub(id, (x) => ({ ...x, pendingChange: { planId, effectiveAt: x.renewsAt } }))
    logAudit(actor, sub.company, `Scheduled downgrade to ${planById(s, planId)?.name} at renewal`, planById(s, sub.planId)!.name, `${planById(s, planId)?.name} from ${fmtDate(sub.renewsAt)}`)
  },
  cancelScheduled(id: string, actor: string) { const sub = getBilling().subs.find((x) => x.id === id)!; patchSub(id, (x) => ({ ...x, pendingChange: undefined })); logAudit(actor, sub.company, 'Cancelled scheduled plan change', 'Scheduled change', 'No change') },
  extendTrial(id: string, days: number, actor: string) {
    const sub = getBilling().subs.find((x) => x.id === id)!; const from = sub.trialEndsAt ?? iso(TODAY); const to = iso(addDays(from, days))
    patchSub(id, (x) => ({ ...x, status: 'trial', trialEndsAt: to, renewsAt: to })); logAudit(actor, sub.company, `Trial extended by ${days} days`, `Trial ends ${fmtDate(from)}`, `Trial ends ${fmtDate(to)}`)
  },
  cancel(id: string, actor: string) { const sub = getBilling().subs.find((x) => x.id === id)!; patchSub(id, (x) => ({ ...x, status: 'cancelled', endsAt: x.renewsAt })); logAudit(actor, sub.company, 'Subscription cancelled', STATUS_META[sub.status].label, `Cancelled · access until ${fmtDate(sub.renewsAt)}`) },
  reactivate(id: string, actor: string) { const sub = getBilling().subs.find((x) => x.id === id)!; patchSub(id, (x) => ({ ...x, status: 'active', endsAt: undefined })); logAudit(actor, sub.company, 'Subscription reactivated', STATUS_META[sub.status].label, 'Active') },
  suspend(id: string, actor: string) { const sub = getBilling().subs.find((x) => x.id === id)!; patchSub(id, (x) => ({ ...x, status: 'suspended' })); logAudit(actor, sub.company, 'Subscription suspended', STATUS_META[sub.status].label, 'Suspended') },
  setStatus(id: string, status: SubStatus, actor: string) { const sub = getBilling().subs.find((x) => x.id === id)!; patchSub(id, (x) => ({ ...x, status })); logAudit(actor, sub.company, 'Subscription status changed', STATUS_META[sub.status].label, STATUS_META[status].label) },
  credit(id: string, amount: number, actor: string) { const sub = getBilling().subs.find((x) => x.id === id)!; patchSub(id, (x) => ({ ...x, credit: x.credit + amount })); logAudit(actor, sub.company, 'Applied account credit', money(sub.credit, sub.currency), money(sub.credit + amount, sub.currency)) },
  setOverride(id: string, module: string, on: boolean, reason: string, actor: string) {
    const s = getBilling(); const sub = s.subs.find((x) => x.id === id)!; const name = moduleById(module)?.name ?? module
    const ent = entitlements(s, sub); const nm = (m: string) => moduleById(m)?.name ?? m
    /* Enabling pulls in unmet dependencies; removing also removes override-only modules that depend on it. */
    const needs: string[] = []
    if (on) { const queue = [module]; while (queue.length) for (const d of depsOf(s, queue.shift()!)) if (!needs.includes(d) && d !== module && !moduleState(ent, d).enabled) { needs.push(d); queue.push(d) } }
    const drop: string[] = []
    if (!on) { const queue = [module]; while (queue.length) { const cur = queue.shift()!; for (const o of sub.overrides) if (!drop.includes(o.module) && o.module !== module && depsOf(s, o.module).includes(cur)) { drop.push(o.module); queue.push(o.module) } } }
    const gone = new Set([module, ...drop])
    patchSub(id, (x) => ({ ...x, overrides: on ? [...x.overrides.filter((o) => o.module !== module && !needs.includes(o.module)), { module, reason, by: actor, at: iso(TODAY) }, ...needs.map((m) => ({ module: m, reason: `Required by ${name}`, by: actor, at: iso(TODAY) }))] : x.overrides.filter((o) => !gone.has(o.module)) }))
    logAudit(actor, sub.company, on ? `Enabled ${name} by override${needs.length ? ` (also: ${needs.map(nm).join(', ')})` : ''}` : `Removed ${name} override${drop.length ? ` (also: ${drop.map(nm).join(', ')})` : ''}`, on ? 'Not included' : 'Override', on ? reason : 'Not included')
  },
  setAddons(id: string, addons: string[], actor: string) {
    const s = getBilling(); const sub = s.subs.find((x) => x.id === id)!; const q = quote(s, { planId: sub.planId, cycle: sub.cycle, currency: sub.currency, employees: sub.employees, addonIds: addons, isNew: false })
    const nm = (ids: string[]) => ids.map((a) => s.addons.find((x) => x.id === a)?.name).join(', ') || 'None'
    patchSub(id, (x) => ({ ...x, addons, net: q.ok ? q.subtotal : x.net })); logAudit(actor, sub.company, 'Updated add-ons', nm(sub.addons), nm(addons))
  },
  setCard(id: string, card: { brand: string; last4: string; exp: string }, actor: string) { const sub = getBilling().subs.find((x) => x.id === id)!; patchSub(id, (x) => ({ ...x, card })); logAudit(actor, sub.company, 'Payment method updated', sub.card ? `${sub.card.brand} ${sub.card.last4}` : 'None', `${card.brand} ${card.last4}`) },
  setCycle(id: string, cycle: 'monthly' | 'annual', actor: string) {
    const s = getBilling(); const sub = s.subs.find((x) => x.id === id)!; const q = quote(s, { planId: sub.planId, cycle, currency: sub.currency, employees: sub.employees, addonIds: sub.addons, isNew: false })
    patchSub(id, (x) => ({ ...x, cycle, net: q.ok ? q.subtotal : x.net })); logAudit(actor, sub.company, 'Changed billing cycle', sub.cycle, cycle)
  },
  subscribe(input: { company: string; planId: string; cycle: 'monthly' | 'annual'; currency: string; employees: number; addonIds: string[]; coupon?: string; trial: boolean; card: { brand: string; last4: string; exp: string }; paid: number; ref: string }) {
    const s = getBilling(); const plan = planById(s, input.planId)!
    const q = quote(s, { planId: input.planId, cycle: input.cycle, currency: input.currency, employees: input.employees, addonIds: input.addonIds, coupon: input.coupon })
    const trial = input.trial && plan.trialDays > 0
    const renews = trial ? addDays(TODAY, plan.trialDays) : input.cycle === 'annual' ? addMonths(TODAY, 12) : addMonths(TODAY, 1)
    const old = currentSub(s)
    const sub: Subscription = {
      id: s.companyId, company: input.company, country: old?.country ?? 'NG', planId: input.planId, cycle: input.cycle, currency: input.currency, employees: input.employees, status: trial ? 'trial' : 'active',
      startedAt: iso(TODAY), trialEndsAt: trial ? iso(renews) : undefined, renewsAt: iso(renews), net: q.ok ? q.subtotal : 0, addons: input.addonIds.filter((a) => { const ad = s.addons.find((x) => x.id === a); return ad && addonFits(ad, plan.id, s) }), overrides: [], coupon: input.coupon, credit: 0,
      usage: { employees: input.employees, branches: 1, storageGb: 0, documents: 0, signatures: 0, leads: 0 }, card: input.card,
    }
    /* Redemption ledger: every promo the quote actually applied (coupon or automatic) is recorded once per checkout. */
    const redeemed: Redemption[] = q.ok ? q.discounts.flatMap((d) => {
      const p = s.promos.find((x) => x.id === d.promoId); if (!p) return []
      return [{ id: nid('rd'), promoId: p.id, promoName: p.name, code: p.code, subId: sub.id, company: input.company, at: iso(TODAY), planId: input.planId, cycle: input.cycle, currency: input.currency, employees: input.employees,
        list: q.subtotal, discount: d.amount, net: Math.max(0, q.subtotal - q.discount), trial, channel: p.channel ?? 'Website checkout', source: 'Self-serve checkout', status: 'applied' as const, profile: profileFor(sub.id) }]
    }) : []
    setBilling((st) => reconcile({ ...st, subs: st.subs.some((x) => x.id === sub.id) ? st.subs.map((x) => (x.id === sub.id ? sub : x)) : [...st.subs, sub], redemptions: [...redeemed, ...(st.redemptions ?? [])] }))
    if (!trial) addPayment({ subId: sub.id, at: iso(TODAY), amount: input.paid, currency: input.currency, status: 'successful', ref: input.ref, description: `${plan.name} · ${input.cycle}` })
    logAudit(`${input.company} (customer)`, input.company, trial ? `Started ${plan.trialDays}-day ${plan.name} trial` : `Subscribed to ${plan.name} (${input.cycle})`, old ? `${planById(s, old.planId)?.name ?? '—'} · ${STATUS_META[old.status].label}` : 'No subscription', `${plan.name} · ${trial ? 'Trial' : 'Active'}`)
    return sub
  },
}

/* ---------- Plan selection persistence (pricing → register → checkout) ---------- */
export type Selection = { planId: string; cycle: 'monthly' | 'annual'; currency: string; employees: number; addons: string[]; coupon?: string }
export const saveSelection = (x: Selection) => { try { sessionStorage.setItem('bf-selection', JSON.stringify(x)) } catch { /* ignore */ } }
export const loadSelection = (): Selection | null => { try { return JSON.parse(sessionStorage.getItem('bf-selection') || 'null') } catch { return null } }
export const selectionQuery = (x: Selection) => `?plan=${x.planId}&cycle=${x.cycle}&cur=${x.currency}&emp=${x.employees}${x.addons.length ? `&addons=${x.addons.join(',')}` : ''}${x.coupon ? `&coupon=${x.coupon}` : ''}`

/* ---------- Billing notifications (deduplicated, derived from state) ---------- */
export function billingNotes(s: BillingState, sub: Subscription | undefined) {
  const out: { t: string; d: string; cta: string; to: string; pri: boolean; ago: string; m: string }[] = []
  if (!sub) return out
  const plan = planById(s, sub.planId); const lim = effectiveLimits(s, sub); const B = '/admin/business/settings?tab=billing'
  if (sub.status === 'trial' && sub.trialEndsAt && daysUntil(sub.trialEndsAt) <= 7) out.push({ t: 'Trial ending soon', d: `Your ${plan?.name} trial ends on ${fmtDate(sub.trialEndsAt)}.`, cta: 'Upgrade now', to: B, pri: true, ago: 'Today', m: 'billing' })
  if (sub.status === 'payment_failed' || sub.status === 'past_due') out.push({ t: 'Payment failed', d: 'We could not renew your subscription. Update your payment method to avoid interruption.', cta: 'Update payment', to: B, pri: true, ago: 'Today', m: 'billing' })
  if (sub.status === 'active' && daysUntil(sub.renewsAt) <= 14 && daysUntil(sub.renewsAt) >= 0) out.push({ t: 'Payment upcoming', d: `${plan?.name} renews on ${fmtDate(sub.renewsAt)}.`, cta: 'View billing', to: B, pri: false, ago: 'Today', m: 'billing' })
  ;(['employees', 'storageGb', 'signatures'] as LimitKey[]).forEach((k) => { const l = lim[k]; if (l && sub.usage[k] / l >= 0.8) out.push({ t: `${LIMIT_DEFS.find((d) => d.key === k)!.label} limit approaching`, d: `${Math.round((sub.usage[k] / l) * 100)}% of your ${plan?.name} allowance is used.`, cta: 'Upgrade plan', to: B, pri: false, ago: 'Today', m: 'billing' }) })
  return out
}

export function convertTrial(id: string, planId: string, paid: number, ref: string, actor: string) {
  const s = getBilling(); const sub = s.subs.find((x) => x.id === id)!; const plan = planById(s, planId)!
  const renews = sub.cycle === 'annual' ? addMonths(TODAY, 12) : addMonths(TODAY, 1)
  subActions.changePlan(id, planId, actor, 'trial converted')
  patchSub(id, (x) => ({ ...x, status: 'active', trialEndsAt: undefined, renewsAt: iso(renews) }))
  addPayment({ subId: id, at: iso(TODAY), amount: paid, currency: sub.currency, status: 'successful', ref, description: `${plan.name} · ${sub.cycle}` })
  logAudit(actor, sub.company, `Trial converted to paid ${plan.name}`, 'Trial', 'Active')
}

/* ---------- Plan composition helpers (validation, availability) ---------- */
/** Modules that have at least one feature in the given feature set. */
export const modulesIn = (features: string[]) => MODULES.filter((m) => m.features.some((f) => features.includes(f.key))).map((m) => m.id)
export type PlanWarning = { level: 'error' | 'warn'; text: string; moduleId?: string }
/** Non-blocking checks surfaced in the plan builder and comparison matrix. */
/** Features that are deliberately offered without their module's core feature (every plan carries consent-based support diagnostics). */
const STANDALONE_FEATURES = new Set(['security.consent'])
export function planWarnings(s: BillingState, plan: Plan): PlanWarning[] {
  const out: PlanWarning[] = []; const have = modulesIn(plan.features); const nm = (id: string) => moduleById(id)?.name ?? id
  for (const id of have) for (const dep of depsOf(s, id)) if (!have.includes(dep)) out.push({ level: 'error', moduleId: id, text: `${nm(id)} needs ${nm(dep)}, which this plan does not include.` })
  for (const id of have) { const keys = moduleKeys(id); if (!keys.some((k) => plan.features.includes(k) && !STANDALONE_FEATURES.has(k))) continue; const missing = keys.filter((k) => !plan.features.includes(k)); if (missing.length && missing.length < keys.length && keys.includes(`${id}.core`) && !plan.features.includes(`${id}.core`)) out.push({ level: 'warn', moduleId: id, text: `${nm(id)} has advanced features without its core feature.` }) }
  if (plan.model !== 'custom' && plan.status === 'active' && !plan.prices.NGN?.monthly) out.push({ level: 'warn', text: 'No NGN price: Nigerian customers cannot buy this plan.' })
  if (plan.model !== 'custom') for (const [code, p] of Object.entries(plan.prices)) if (p.annual > p.monthly * 12) out.push({ level: 'warn', text: `${code} annual price is higher than twelve monthly payments.` })
  if (plan.limits.employees !== null && plan.model !== 'custom' && plan.includedEmployees > plan.limits.employees) out.push({ level: 'warn', text: 'Included employees exceed the employee limit.' })
  if (plan.recommended && !plan.visible) out.push({ level: 'warn', text: 'Recommended plan is hidden from the public pricing page.' })
  if (plan.visible && plan.status !== 'active') out.push({ level: 'warn', text: 'Plan is marked visible but is not active, so it will not be shown.' })
  if (plan.id === 'enterprise' || plan.model === 'custom') { const miss = MODULES.filter((m) => !have.includes(m.id)); if (miss.length && plan.id === 'enterprise') out.push({ level: 'error', text: `Enterprise must include every module. Missing: ${miss.map((m) => m.name).join(', ')}.` }) }
  return out
}
export function availabilityOf(s: BillingState, moduleId: string, planId: string): { state: Availability; partial: boolean } {
  const plan = planById(s, planId); const keys = moduleKeys(moduleId)
  if (!plan) return { state: 'hidden', partial: false }
  const n = keys.filter((k) => plan.features.includes(k)).length
  if (n > 0) return { state: 'included', partial: n < keys.length }
  if (s.addons.some((a) => a.active && a.plans.includes(planId) && a.grants.some((g) => keys.includes(g)))) return { state: 'addon', partial: false }
  return { state: 'hidden', partial: false }
}
const normalizeAddonPlans = (s: BillingState): BillingState => ({ ...s, addons: s.addons.map((a) => ({ ...a, plans: a.plans.filter((id) => { const p = planById(s, id); return !!p && addonAddsValue(a, p) && addonMissingDeps(a, p, s).length === 0 }) })) })
/** Make a module included in, sold as an add-on to, or hidden from one plan. */
export function applyAvailability(s: BillingState, moduleId: string, planId: string, to: Availability): BillingState {
  const plan = planById(s, planId); const keys = moduleKeys(moduleId); if (!plan || planId === 'enterprise') return s
  let next: BillingState = { ...s, plans: s.plans.map((p) => (p.id === planId ? { ...p, features: to === 'included' ? uniq([...p.features, ...keys]) : p.features.filter((f) => !keys.includes(f)) } : p)) }
  if (to === 'addon') {
    const existing = next.addons.find((a) => a.id === `mod-${moduleId}` || keys.every((k) => a.grants.includes(k)))
    if (existing) next = { ...next, addons: next.addons.map((a) => (a.id === existing.id ? { ...a, active: true, plans: uniq([...a.plans, planId]) } : a)) }
    else {
      const rate = next.modulePrices.find((r) => r.moduleId === moduleId); const band = rate?.bands.find((b) => !b.custom) ?? rate?.bands[0]
      const mod = moduleById(moduleId)
      next = { ...next, addons: [...next.addons, { id: `mod-${moduleId}`, name: mod?.name ?? moduleId, description: rate?.summary ?? '', category: GROUPS.find((g) => g.id === mod?.group)?.name ?? 'Capability', active: true, freq: 'cycle', prices: band ? structuredClone(band.prices) : {}, grants: keys, limitBoosts: {}, plans: [planId] }] }
    }
  }
  if (to === 'hidden') next = { ...next, addons: next.addons.map((a) => (a.grants.some((g) => keys.includes(g)) ? { ...a, plans: a.plans.filter((id) => id !== planId) } : a)) }
  return normalizeAddonPlans(next)
}
