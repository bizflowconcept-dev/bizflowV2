import { useCompanyPwa } from '../pwa/pwa'
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import { clearAuthContext } from '../security/access'
import { registerOwnDataset } from '../data/demo'
import type { PasswordRecord } from '../security/credentials'

/* ---------- colour utilities ---------- */
export const isHex = (v: string) => /^#([0-9a-f]{6})$/i.test(v)
export const normHex = (v: string) => {
  let x = v.trim().replace(/^#?/, '#')
  if (/^#[0-9a-f]{3}$/i.test(x)) x = '#' + x.slice(1).split('').map((c) => c + c).join('')
  return x.toUpperCase()
}
export const hexToRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
export const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('').toUpperCase()
export function hexToHsl(h: string): [number, number, number] {
  const [r, g, b] = hexToRgb(h).map((n) => n / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, Math.round(l * 100)]
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round(hh * 60), Math.round(s * 100), Math.round(l * 100)]
}
export const mix = (a: string, b: string, t: number) => {
  const x = hexToRgb(a), y = hexToRgb(b)
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t)
}
export const shade = (h: string, t: number) => mix(h, '#000000', t)
export const tint = (h: string, t: number) => mix(h, '#FFFFFF', t)
const lum = (h: string) => {
  const [r, g, b] = hexToRgb(h).map((n) => { const c = n / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
export const onColor = (bg: string) => (contrast(bg, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0B1A1F')
export const MIN_CONTRAST = 4.5
/** Nearest colour to `text` (same hue, shifted toward white or black) that reaches 4.5:1 on `bg`. */
export function nearestAccessible(text: string, bg: string, min = MIN_CONTRAST): string {
  if (!isHex(text)) return onColor(bg)
  if (contrast(text, bg) >= min) return text
  const target = contrast('#FFFFFF', bg) >= contrast('#000000', bg) ? '#FFFFFF' : '#000000'
  for (let i = 1; i <= 100; i++) { const c = mix(text, target, i / 100); if (contrast(c, bg) >= min) return c }
  return onColor(bg)
}
/** Merge persisted brand data with defaults so older stored brands (missing newer fields) stay valid. */
export function migrateBrand(raw: Partial<Brand> | undefined): Brand {
  const b = { ...DEFAULT_BRAND, ...(raw ?? {}) } as Brand
  const hex = (v: unknown) => (typeof v === 'string' && isHex(normHex(v)) ? normHex(v) : '')
  b.sidebarText = hex(b.sidebarText)
  b.sidebarActive = hex(b.sidebarActive)
  b.sidebarColor = hex(b.sidebarColor) || DEFAULT_BRAND.sidebarColor
  if (b.sidebarBackground !== 'solid' && b.sidebarBackground !== 'gradient') b.sidebarBackground = 'gradient'
  return b
}

/* ---------- types ---------- */
export type Theme = 'light' | 'dark' | 'system'
export type Brand = {
  primary: string; secondary: string; accent: string
  theme: Theme; nav: 'sidebar' | 'compact'; sidebarBackground: 'gradient' | 'solid'; sidebarColor: string; sidebarText: string; sidebarActive: string; density: 'comfortable' | 'compact'; layout: 'standard' | 'compact'
  logo: string | null; logoLight: string | null; favicon: string | null; loginBackground: string | null
  loginSlides: string[]; loginSlideSeconds: number
}
export const DEFAULT_BRAND: Brand = {
  primary: '#087E8B', secondary: '#0B2530', accent: '#35D0BA',
  theme: 'light', nav: 'sidebar', sidebarBackground: 'gradient', sidebarColor: '#0B2530', sidebarText: '', sidebarActive: '', density: 'comfortable', layout: 'standard',
  logo: null, logoLight: null, favicon: null, loginBackground: null,
  loginSlides: [], loginSlideSeconds: 6,
}
export const SIDEBAR_PRESETS = [
  { id: 'midnight', name: 'Midnight (default)', bg: '', text: '', active: '' },
  { id: 'teal', name: 'Brand teal', bg: '#087E8B', text: '#FFFFFF', active: '' },
  { id: 'primary', name: 'Brand primary', bg: '@primary', text: '', active: '' },
  { id: 'charcoal', name: 'Charcoal', bg: '#1F2937', text: '#F3F4F6', active: '' },
  { id: 'navy', name: 'Deep navy', bg: '#0A1F44', text: '#FFFFFF', active: '#35D0BA' },
  { id: 'light', name: 'White / Light', bg: '#FFFFFF', text: '#102A30', active: '#E6F4F1' },
] as const
export const SUGGESTED = [
  { name: 'BizFlow Teal', primary: '#087E8B', secondary: '#0B2530', accent: '#35D0BA' },
  { name: 'Naija Green', primary: '#006B3F', secondary: '#1E3A5F', accent: '#F5A623' },
  { name: 'Lagos Navy', primary: '#1D3C6E', secondary: '#0F766E', accent: '#E8A33D' },
  { name: 'Terracotta', primary: '#B4472C', secondary: '#3B2A20', accent: '#E9B44C' },
  { name: 'Indigo Ink', primary: '#3F3FA8', secondary: '#1F2A44', accent: '#F59E0B' },
]

export type Profile = { name: string; email: string; phone: string; address: string; website: string; industry: string; size: string; state: string; country: string; cac: string; description: string }
export const MODULE_LIST = [
  { id: 'hr', name: 'Core HR', desc: 'Employee records, departments, org chart and documents.', tier: 'Starter' },
  { id: 'payroll', name: 'Payroll', desc: 'PAYE, pension, NHF and NSITF with bank-ready payment files.', tier: 'Starter' },
  { id: 'leave', name: 'Leave Management', desc: 'Leave policies, balances, approvals and public holidays.', tier: 'Starter' },
  { id: 'attendance', name: 'Attendance', desc: 'Clock-in, shifts, late tracking and field check-ins.', tier: 'Professional' },
  { id: 'expenses', name: 'Expenses & Approvals', desc: 'Claims, salary advances and multi-step approval chains.', tier: 'Starter' },
  { id: 'travel', name: 'Travel Management', desc: 'Travel requests, allowance policies, preparation, disbursement and retirement.', tier: 'Starter' },
  { id: 'sign', name: 'Documents & Sign', desc: 'Contracts, offer letters and e-signature.', tier: 'Professional' },
  { id: 'vendors', name: 'Vendor Management', desc: 'Department vendor registers, financial analysis and performance evaluation.', tier: 'Professional' },
  { id: 'exit', name: 'Exit Management', desc: 'Resignation, clearance and final settlement workflow.', tier: 'Professional' },
  { id: 'orgchart', name: 'Organisation Chart', desc: 'Interactive organisation chart and hierarchy insights.', tier: 'Starter' },
  { id: 'rules', name: 'Employee Rules', desc: 'Grade structure, salary matrix and department overrides.', tier: 'Professional' },
  { id: 'branding', name: 'Branding & White-label', desc: 'Brand colours, sidebar theme and white-label login.', tier: 'Professional' },
  { id: 'security', name: 'Security Governance', desc: 'Company permissions, consent-based support access and break-glass controls.', tier: 'Professional' },
  { id: 'fleet', name: 'Fleet Management', desc: 'Vehicles, drivers, fuel, servicing and document expiry.', tier: 'Enterprise' },
  { id: 'crm', name: 'CRM', desc: 'Customers, pipeline, proposals and follow-ups.', tier: 'Enterprise' },
] as const
export type ModuleId = (typeof MODULE_LIST)[number]['id']
/** Company-module dependencies (catalog ids): a module cannot stay on while something it needs is off. */
export const TENANT_MODULE_DEPS: Record<string, string[]> = { payroll: ['hr'], leave: ['hr'], attendance: ['hr'], exit: ['hr'], orgchart: ['hr'], rules: ['hr'], travel: ['expenses'], vendors: ['expenses'] }
/** Add every transitive dependency of the given modules (unknown ids are dropped). */
export const withModuleDeps = (ids: string[]) => {
  const known = new Set<string>(MODULE_LIST.map((m) => m.id)); const out = [...new Set(ids)].filter((id) => known.has(id))
  for (let i = 0; i < out.length; i++) for (const d of TENANT_MODULE_DEPS[out[i]] ?? []) if (!out.includes(d)) out.push(d)
  return out
}
/** Every enabled module that (transitively) needs `id`. */
export const moduleDependents = (id: string, enabled: string[]) => {
  const out: string[] = []; const queue = [id]
  while (queue.length) { const cur = queue.shift()!; for (const m of enabled) if (!out.includes(m) && m !== id && (TENANT_MODULE_DEPS[m] ?? []).includes(cur)) { out.push(m); queue.push(m) } }
  return out
}
export const TIERS = ['Starter', 'Professional', 'Enterprise']
export const tierModules = (plan: string) => MODULE_LIST.filter((m) => TIERS.indexOf(m.tier) <= TIERS.indexOf(plan)).map((m) => m.id as string)

export type TStatus = 'Active' | 'Trial' | 'Pending Setup' | 'Renewal Due' | 'Grace Period' | 'Suspended' | 'Expired'
/** First administrator created during self-serve signup. Only a salted hash is stored, never the password. */
export type TenantAdmin = { name: string; email: string; phone: string; credential: PasswordRecord; createdAt: string }
/** Commercial snapshot captured at signup (the billing store holds the live subscription as `c-<slug>`). */
export type TenantSignup = { id: string; ref: string; cycle: 'monthly' | 'annual'; addons: string[]; paid: number; coupon?: string; method: 'card' | 'transfer' | 'sales' }
export type Tenant = { slug: string; profile: Profile; brand: Brand; plan: string; employees: number; status: TStatus; created: string; modules: string[]; admin?: TenantAdmin; signup?: TenantSignup }
export type BusinessRoleKey = 'admin' | 'md' | 'hr' | 'finance' | 'operations' | 'sales' | 'bdmanager' | 'businessdev' | 'manager' | 'auditor' | 'compliance' | 'employee'
export type DemoAccount = { id: string; name: string; title: string; email: string; password: string; roleKey: BusinessRoleKey; scope: 'Company' | 'Own'; onboarding?: boolean; /** Verified against the tenant's salted password hash instead of a demo password. */ hashed?: boolean }
export type Department = { id: string; name: string; roleKey: BusinessRoleKey; memberEmails: string[]; modules: string[]; features: string[] }
export const DEPARTMENT_MODULES = [
  { id: 'health', name: 'Business Health', desc: 'Company performance and operating signals.', features: [{ id: 'health.view', name: 'View dashboard' }] },
  { id: 'people', name: 'People', desc: 'Employee records and organisation structure.', features: [{ id: 'people.view', name: 'View employees', permission: 'people.view' }, { id: 'people.create', name: 'Create employees', permission: 'people.create' }] },
  { id: 'payroll', name: 'Payroll', desc: 'Payroll runs, review and approvals.', features: [{ id: 'payroll.view', name: 'View payroll', permission: 'payroll.view' }, { id: 'payroll.approve', name: 'Approve payroll', permission: 'payroll.approve' }] },
  { id: 'accounting', name: 'Accounting', desc: 'Transactions, journals and reporting.', features: [{ id: 'accounting.view', name: 'View accounting' }, { id: 'accounting.post', name: 'Post journals', permission: 'accounting.post' }] },
  { id: 'approvals', name: 'Approvals', desc: 'Department requests and decisions.', features: [{ id: 'approvals.view', name: 'View requests' }, { id: 'approvals.decide', name: 'Review requests' }] },
  { id: 'tasks', name: 'Tasks', desc: 'Team work and assigned actions.', features: [{ id: 'tasks.view', name: 'View tasks' }, { id: 'tasks.assign', name: 'Assign tasks' }] },
  { id: 'procurement', name: 'Procurement', desc: 'Purchase requests and vendors.', features: [{ id: 'procurement.view', name: 'View procurement' }, { id: 'procurement.create', name: 'Create requests', permission: 'procurement.create' }] },
  { id: 'assets', name: 'Assets', desc: 'Asset register and custody.', features: [{ id: 'assets.view', name: 'View assets' }, { id: 'assets.create', name: 'Manage assets', permission: 'assets.create' }] },
  { id: 'fleet', name: 'Fleet', desc: 'Vehicles, fuel and maintenance.', features: [{ id: 'fleet.view', name: 'View fleet' }, { id: 'fleet.create', name: 'Manage fleet', permission: 'fleet.create' }] },
  { id: 'crm', name: 'CRM', desc: 'Customers, pipeline and follow-ups.', features: [{ id: 'crm.view', name: 'View customers' }, { id: 'crm.create', name: 'Manage pipeline', permission: 'crm.create' }] },
  { id: 'documents', name: 'Documents', desc: 'Shared department documents.', features: [{ id: 'documents.view', name: 'View documents' }, { id: 'documents.upload', name: 'Upload documents' }] },
  { id: 'sign', name: 'BizFlow Sign', desc: 'Signature requests and agreements.', features: [{ id: 'sign.view', name: 'View agreements' }, { id: 'sign.create', name: 'Create signature requests', permission: 'sign.create' }] },
  { id: 'reports', name: 'Reports', desc: 'Operational and management reporting.', features: [{ id: 'reports.view', name: 'View reports' }, { id: 'reports.export', name: 'Export reports' }] },
  { id: 'travel', name: 'Travel', desc: 'Requests, preparation and expense retirement.', features: [{ id: 'travel.view', name: 'View travel requests' }, { id: 'travel.create', name: 'Create travel requests' }] },
  { id: 'performance', name: 'Staff performance', desc: 'Team delivery, attendance and approval turnaround.', features: [{ id: 'performance.view', name: 'View team performance' }] },
  { id: 'vendors', name: 'Vendor Management', desc: 'Department vendors, financial position and performance evaluation.', features: [{ id: 'vendors.view', name: 'View department vendors' }, { id: 'vendors.evaluate', name: 'Evaluate vendor performance' }] },
] as const
export const host = (slug: string) => `${slug}.bizflow.com`

const PROFILE_BASE = { website: '', country: 'Nigeria', cac: '', description: '' }
const SEED: Record<string, Tenant> = {
  etranzact: {
    slug: 'etranzact', plan: 'Enterprise', employees: 486, status: 'Active', created: '2025-02-18', modules: tierModules('Enterprise'),
    brand: { ...DEFAULT_BRAND, primary: '#D71920', secondary: '#172B4D', accent: '#F2B134' },
    profile: { ...PROFILE_BASE, name: 'eTranzact International Plc', email: 'admin.demo@etranzact.com', phone: '+234 1 270 1060', address: 'Fortune Towers, 27/29 Adeyemo Alakija Street, Victoria Island, Lagos', website: 'https://etranzact.com', industry: 'Financial Technology & Payments', size: '201–500', state: 'Lagos', cac: 'RC 657256', description: 'Demo enterprise workspace for a multi-department digital payments and financial technology organization.' },
  },
}

const PASSWORD = 'demo-password'
const COMPANY_RBAC_KEY = 'bf-company-rbac-v1'
const completedOnboardingNames = (): string[] => {
  const runtime = globalThis as typeof globalThis & { __bfOnboardingComplete?: string[] }
  return runtime.__bfOnboardingComplete ?? []
}
const companyRbac = (): Record<string, Record<string, BusinessRoleKey>> => {
  try { return JSON.parse(localStorage.getItem(COMPANY_RBAC_KEY) || '{}') } catch { return {} }
}
export const setDemoAccountRole = (slug: string, email: string, roleKey: BusinessRoleKey) => {
  const roles = companyRbac()
  localStorage.setItem(COMPANY_RBAC_KEY, JSON.stringify({ ...roles, [slug]: { ...(roles[slug] ?? {}), [email]: roleKey } }))
}
const ETRANZACT_ACCOUNTS: DemoAccount[] = [
  { id: 'ETZ-0001', name: 'Oladapo Adebayo', title: 'Managing Director / CEO', email: 'ceo.demo@etranzact.com', password: PASSWORD, roleKey: 'md', scope: 'Company' },
  { id: 'ETZ-0002', name: 'Nneka Okafor', title: 'Company Administrator', email: 'admin.demo@etranzact.com', password: PASSWORD, roleKey: 'admin', scope: 'Company' },
  { id: 'ETZ-0011', name: 'Kemi Balogun', title: 'HR Department', email: 'hr.demo@etranzact.com', password: PASSWORD, roleKey: 'hr', scope: 'Company' },
  { id: 'ETZ-0018', name: 'Chinedu Eze', title: 'Chief Finance Officer', email: 'finance.demo@etranzact.com', password: PASSWORD, roleKey: 'finance', scope: 'Company' },
  { id: 'ETZ-0024', name: 'Ibrahim Musa', title: 'Admin Department Lead', email: 'operations.demo@etranzact.com', password: PASSWORD, roleKey: 'operations', scope: 'Company' },
  { id: 'ETZ-0031', name: 'Tobi Adeyemi', title: 'Head, Enterprise Sales', email: 'sales.demo@etranzact.com', password: PASSWORD, roleKey: 'sales', scope: 'Company' },
  { id: 'ETZ-0061', name: 'Morenike Adebayo', title: 'Business Development Manager', email: 'businessdevelopmentmanager.demo@etranzact.com', password: PASSWORD, roleKey: 'bdmanager', scope: 'Company' },
  { id: 'ETZ-0038', name: 'Femi Johnson', title: 'Customer Service Manager', email: 'manager.demo@etranzact.com', password: PASSWORD, roleKey: 'manager', scope: 'Company' },
  { id: 'ETZ-0042', name: 'Adaeze Nwankwo', title: 'Risk & Compliance Auditor', email: 'audit.demo@etranzact.com', password: PASSWORD, roleKey: 'auditor', scope: 'Company' },
  { id: 'ETZ-0043', name: 'Halima Bello', title: 'Head, Compliance', email: 'compliance.demo@etranzact.com', password: PASSWORD, roleKey: 'compliance', scope: 'Company' },
  { id: 'ETZ-0062', name: 'Chisom Okeke', title: 'Business Development Officer', email: 'businessdevelopment.demo@etranzact.com', password: PASSWORD, roleKey: 'businessdev', scope: 'Company', onboarding: true },
  { id: 'ETZ-0142', name: 'Amaka Obi', title: 'Software Engineer', email: 'employee.demo@etranzact.com', password: PASSWORD, roleKey: 'employee', scope: 'Own' },
]

/** True when an email already belongs to a workspace administrator, a workspace contact or a demo account. */
export const emailInUse = (email: string) => {
  const e = email.trim().toLowerCase()
  return !!e && (ETRANZACT_ACCOUNTS.some((a) => a.email.toLowerCase() === e) || Object.values(state.tenants).some((t) => t.admin?.email.toLowerCase() === e || t.profile.email.toLowerCase() === e))
}
export const tenantBySignup = (id: string) => Object.values(state.tenants).find((t) => t.signup?.id === id)

export function demoAccountsFor(tenant: Tenant): DemoAccount[] {
  if (tenant.signup && !tenant.admin) return []
  if (tenant.admin) return [{ id: `${tenant.slug.slice(0, 3).toUpperCase()}-0001`, name: tenant.admin.name, title: 'Company Administrator', email: tenant.admin.email, password: '', roleKey: 'admin', scope: 'Company', hashed: true }]
  const assigned = companyRbac()[tenant.slug] ?? {}
  return ETRANZACT_ACCOUNTS.map((account) => {
    const roleKey = assigned[account.email] ?? account.roleKey
    return { ...account, roleKey, scope: roleKey === 'employee' ? 'Own' : 'Company', onboarding: account.onboarding && !completedOnboardingNames().includes(account.name) }
  })
}

const BUSINESS_SESSION_KEY = 'bf-business-session'
export const setBusinessSession = (slug: string, email: string) => localStorage.setItem(BUSINESS_SESSION_KEY, JSON.stringify({ slug, email }))
export const recordLogin = (slug: string, who: { name: string; role: string; department?: string; id?: string }, ok: boolean, detail?: string) =>
  recordAudit(slug, ok ? 'Signed in' : 'Failed sign-in attempt', undefined, detail, { category: 'Security', actor: who.name, role: who.role, department: who.department ?? '', actorId: who.id, result: ok ? 'Success' : 'Failed' })
export const clearBusinessSession = () => {
  const sess = businessSession()
  if (sess) recordAudit(sess.slug, 'Signed out', undefined, undefined, { category: 'Security' })
  localStorage.removeItem(BUSINESS_SESSION_KEY)
  localStorage.removeItem('bf-role')
  clearAuthContext()
}
export const businessSession = (): { slug: string; email: string } | null => {
  try { return JSON.parse(localStorage.getItem(BUSINESS_SESSION_KEY) || 'null') } catch { return null }
}

const defaultDepartmentsFor = (tenant: Tenant): Department[] => {
  const domain = tenant.profile.email.split('@')[1] || `${tenant.slug}.demo`
  const email = (prefix: string) => `${prefix}.demo@${domain}`
  return [
    { id: 'hr-department', name: 'HR Department', roleKey: 'hr', memberEmails: [email('hr')], modules: ['dashboard', 'performance', 'health', 'my', 'leave', 'attendance', 'people', 'exit', 'organization', 'travel', 'vendors', 'payroll', 'approvals', 'tasks', 'documents', 'sign', 'reports'], features: ['people.view', 'people.create', 'people.manage', 'organization.manage', 'travel.view', 'travel.create', 'vendors.view', 'vendors.evaluate', 'payroll.view', 'documents.view', 'documents.upload', 'sign.view', 'sign.create'] },
    { id: 'business-development', name: 'Business Development', roleKey: 'businessdev', memberEmails: [email('businessdevelopmentmanager'), email('businessdevelopment')], modules: ['dashboard', 'performance', 'my', 'leave', 'attendance', 'organization', 'travel', 'vendors', 'tasks', 'crm', 'documents', 'sign'], features: ['health.view', 'travel.view', 'travel.create', 'vendors.view', 'vendors.evaluate', 'tasks.view', 'tasks.assign', 'crm.view', 'crm.create', 'documents.view', 'sign.view', 'sign.create'] },
    { id: 'operations', name: 'Admin Department', roleKey: 'operations', memberEmails: [email('operations')], modules: ['dashboard', 'performance', 'my', 'leave', 'attendance', 'organization', 'travel', 'vendors', 'approvals', 'tasks', 'procurement', 'assets', 'fleet', 'documents', 'sign'], features: ['health.view', 'travel.view', 'travel.create', 'vendors.view', 'vendors.evaluate', 'approvals.view', 'approvals.decide', 'tasks.view', 'tasks.assign', 'procurement.view', 'procurement.create', 'assets.view', 'assets.create', 'fleet.view', 'documents.view', 'sign.view', 'sign.create'] },
    { id: 'finance', name: 'Finance', roleKey: 'finance', memberEmails: [email('finance')], modules: ['dashboard', 'performance', 'health', 'my', 'leave', 'attendance', 'organization', 'travel', 'vendors', 'payroll', 'accounting', 'approvals', 'tasks', 'procurement', 'documents', 'reports'], features: ['health.view', 'travel.view', 'travel.create', 'vendors.view', 'vendors.evaluate', 'payroll.view', 'payroll.approve', 'accounting.view', 'accounting.post', 'approvals.view', 'approvals.decide', 'tasks.view', 'procurement.view', 'documents.view', 'reports.view', 'reports.export'] },
  ]
}

/* ---------- store ---------- */
export const AUDIT_CATEGORIES = ['Security', 'Requests', 'Finance', 'People', 'Tasks', 'Leave', 'Exit', 'Documents', 'Customers', 'Attendance', 'Settings', 'Support', 'General'] as const
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]
export type AuditEntry = {
  id: string; at: string; scope: 'Platform' | 'Business'; tenant: string; actor: string; role: string; action: string; from?: string; to?: string; device: string
  category?: AuditCategory; department?: string; actorId?: string; ref?: string; result?: 'Success' | 'Failed'; seq?: number; prevHash?: string; hash?: string
}
export type AuditExtra = { scope?: 'Platform' | 'Business'; category?: AuditCategory; ref?: string; result?: 'Success' | 'Failed'; actor?: string; role?: string; department?: string; actorId?: string }
const CATEGORY_RULES: [RegExp, AuditCategory][] = [
  [/sign(ed)? (in|out)|login|logout|password|session|2fa|locked/i, 'Security'],
  [/leave|handover/i, 'Leave'], [/exit|resign|offboard|clearance|final pay/i, 'Exit'],
  [/request|approv|reject|disburs|escalat/i, 'Requests'], [/payment|payroll|invoice|expense|budget|earning|finance|paid/i, 'Finance'],
  [/task|extension/i, 'Tasks'], [/document|signature|sign |template/i, 'Documents'], [/lead|customer|crm/i, 'Customers'],
  [/attendance|check-in|check in|clock/i, 'Attendance'], [/employee|staff|onboard|profile|department|role|invite/i, 'People'],
  [/support/i, 'Support'], [/brand|setting|module|logo|colour|flow|tier|plan|enabled|disabled/i, 'Settings'],
]
export const categoryOf = (action: string): AuditCategory => CATEGORY_RULES.find(([re]) => re.test(action))?.[1] ?? 'General'
export type Invite = { code: string; slug: string; created: string; expires: string; status: 'Active' | 'Revoked' | 'Used'; name?: string }
export type OnboardingSubmission = {
  id: string; inviteCode: string; slug: string; name: string; email: string; title: string; department: string; phone: string; documents: string[]
  submitted: string; status: 'Submitted' | 'More details required' | 'Approved'; note?: string; reviewedBy?: string; reviewedAt?: string; notifications: string[]
}
export type Support = {
  id: string; slug: string; by: string; reason: string; ticket: string; requested: string; minutes: number
  status: 'Requested' | 'Active'; scopes: ('Workspace metadata' | 'Authentication diagnostics' | 'Integration health' | 'Error logs')[]
  audience: 'bizflow-support-diagnostics'; approvedBy?: string; started?: string; expires?: string
} | null
type State = { tenants: Record<string, Tenant>; active: string; audit: AuditEntry[]; invites: Invite[]; onboarding: OnboardingSubmission[]; support: Support; departments: Record<string, Department[]> }
/* ---------- demo audit history ---------- */
const SEED_PEOPLE: Record<string, { n: string; r: string; d: string; id: string }[]> = {
  etranzact: [
    { n: 'Morenike Adebayo', r: 'Company Administrator', d: 'Administration', id: 'ET-0002' }, { n: 'Tobi Adeyemi', r: 'Managing Director', d: 'Executive', id: 'ET-0001' },
    { n: 'Chinedu Eze', r: 'Finance Manager', d: 'Finance', id: 'ET-0031' }, { n: 'Chisom Okeke', r: 'Business Development Officer', d: 'Business Development', id: 'ET-0077' },
    { n: 'Funmi Balogun', r: 'HR Manager', d: 'HR', id: 'ET-0015' }, { n: 'Emeka Nwankwo', r: 'Employee', d: 'Engineering', id: 'ET-0120' },
  ],
}
const SEED_EVENTS: [AuditCategory, string, string?, string?][] = [
  ['Security', 'Signed in'], ['Security', 'Signed out'], ['Requests', 'Submitted a request', undefined, 'Pending Audit'], ['Requests', 'Approved a request', 'Pending MD', 'Approved'],
  ['Tasks', 'Created a task'], ['Tasks', 'Completed a task', 'In progress', 'Done'], ['Documents', 'Uploaded a document'], ['Documents', 'Sent a document for signature'],
  ['Customers', 'Moved a lead', 'Qualified', 'Proposal'], ['Attendance', 'Checked in'], ['People', 'Updated an employee profile'], ['Finance', 'Disbursed a payment', 'Approved', 'Paid'],
  ['Security', 'Failed sign-in attempt'], ['Leave', 'Submitted a leave request', undefined, 'Pending approval'], ['Settings', 'Updated approval flow'],
]
function seedAudit(): AuditEntry[] {
  const out: AuditEntry[] = []
  Object.entries(SEED_PEOPLE).forEach(([tenant, people]) => {
    for (let i = 0; i < 70; i++) {
      const p = people[(i * 7 + 3) % people.length], ev = SEED_EVENTS[(i * 5 + 1) % SEED_EVENTS.length]
      const at = new Date(Date.now() - (i * 11.3 + 2) * 36e5 * (1 + (i % 4) * 0.4)).toISOString()
      const failed = ev[1].startsWith('Failed')
      out.push({ id: `seed-${tenant}-${i}`, at, scope: 'Business', tenant, actor: p.n, role: p.r, department: p.d, actorId: p.id, category: ev[0], action: ev[1], from: ev[2], to: ev[3], ref: ev[0] === 'Requests' ? `REQ-${1040 + i}` : undefined, device: i % 3 ? 'Chrome on Windows · Lagos, NG' : 'Safari on iOS · Lagos, NG', result: failed ? 'Failed' : 'Success', seq: 1 + i })
    }
  })
  return out
}

const KEY = 'bf-tenants-v5'
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString()
const fresh = (): State => ({ tenants: SEED, active: 'etranzact', support: null,
  departments: Object.fromEntries(Object.values(SEED).map((tenant) => [tenant.slug, defaultDepartmentsFor(tenant)])),
  onboarding: [],
  invites: [
    { code: 'etz2k9', slug: 'etranzact', created: day(-1), expires: day(6), status: 'Active' },
    { code: 'etz0ld', slug: 'etranzact', created: day(-20), expires: day(-13), status: 'Active' },
    { code: 'etzrv3', slug: 'etranzact', created: day(-3), expires: day(4), status: 'Revoked' },
  ],
  audit: [
    ...seedAudit(),
    { id: 'a1', at: day(-1), scope: 'Business', tenant: 'etranzact', actor: 'Nneka Okafor', role: 'Business Admin', action: 'Changed primary brand colour', from: '#087E8B', to: '#D71920', device: 'Chrome · Lagos, NG' },
    { id: 'a4', at: day(-4), scope: 'Platform', tenant: 'etranzact', actor: 'Dayo Martins', role: 'Support', action: 'Support session ended (billing question)', device: 'Chrome · Lagos, NG' },
    { id: 'a5', at: day(-5), scope: 'Business', tenant: 'etranzact', actor: 'Nneka Okafor', role: 'Business Admin', action: 'Enabled Attendance module', device: 'Edge · Lagos, NG' },
  ] })
const load = (): State => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (s?.tenants?.etranzact && s.audit) {
      const base = fresh()
      const departments = { ...base.departments, ...Object.fromEntries(Object.entries((s.departments ?? {}) as Record<string, Department[]>).filter(([slug]) => slug in SEED || !!(s.tenants as Record<string, Tenant>)[slug]?.signup)) }
      Object.entries(base.departments).forEach(([slug, defaults]) => {
        const saved = departments[slug] ?? []
        departments[slug] = [
          ...saved.map((item: Department) => {
            const baseline = defaults.find((candidate) => candidate.id === item.id)
            if (!baseline) return item
            if (item.id === 'business-development' || item.id === 'operations') return baseline
            return { ...item, modules: [...new Set([...item.modules, 'vendors'])], features: [...new Set([...item.features, 'vendors.view', 'vendors.evaluate'])] }
          }),
          ...defaults.filter((item) => !saved.some((existing: Department) => existing.id === item.id)),
        ]
      })
      const tenants: Record<string, Tenant> = { ...SEED, ...Object.fromEntries(Object.entries(s.tenants as Record<string, Tenant>).filter(([slug, t]) => slug in SEED || !!t.signup)) }
      Object.keys(tenants).forEach((slug) => {
        const tenant = { ...tenants[slug], brand: migrateBrand(tenants[slug].brand) }
        if (!(slug in SEED)) { tenants[slug] = { ...tenant, modules: withModuleDeps(tenant.modules) }; registerOwnDataset(slug, tenant.admin); return }
        tenants[slug] = { ...tenant, modules: withModuleDeps([...tenant.modules, 'travel', ...(tenant.plan === 'Enterprise' ? tierModules('Enterprise') : [])]) }
      })
      const known = (s.audit as AuditEntry[]).filter((a) => a.hash || a.tenant in SEED || a.tenant in tenants) /* hash-chained entries are never dropped, or the chain would break */
      const have = new Set(known.map((a) => a.id))
      const audit = [...known, ...seedAudit().filter((a) => !have.has(a.id))].sort((a: AuditEntry, b: AuditEntry) => b.at.localeCompare(a.at))
      const support = (s.support?.status === 'Requested' || s.support?.status === 'Active') && s.support.slug in SEED ? s.support : null
      const invites = ((s.invites ?? base.invites) as Invite[]).filter((i) => i.slug in SEED)
      return { ...s, active: s.active in SEED || s.active in tenants ? s.active : 'etranzact', invites, onboarding: [], departments, tenants, audit, support }
    }
  } catch { /* ignore */ }
  return fresh()
}
let state: State = load()
let who = { name: 'Nneka Okafor', role: 'Business Admin', scope: 'Business' as 'Platform' | 'Business', department: '' as string, id: '' as string }
export const getActor = () => who
export const setActor = (name: string, role: string, scope: 'Platform' | 'Business', department = '', id = '') => { who = { name, role, scope, department, id } }
const deviceLabel = () => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Device'
  return `${b} on ${os} · Lagos, NG`
}
/** Chain checksum for one audit entry (32-bit djb2 over the previous hash and the entry fields). Used when writing and when verifying the chain. */
export const auditHash = (prevHash: string, base: Pick<AuditEntry, 'id' | 'at' | 'scope' | 'tenant' | 'actor' | 'role' | 'action' | 'from' | 'to' | 'ref' | 'result'>) => {
  let value = 5381
  const payload = [prevHash, base.id, base.at, base.scope, base.tenant, base.actor, base.role, base.action, base.from ?? '', base.to ?? '', base.ref ?? '', base.result ?? 'Success'].join('|')
  for (let index = 0; index < payload.length; index++) value = ((value << 5) + value + payload.charCodeAt(index)) >>> 0
  return value.toString(16).toUpperCase().padStart(8, '0')
}
let auditSeq = Date.now()
const log = (tenant: string, action: string, from?: string, to?: string, over?: Partial<AuditEntry>) => {
  const base: AuditEntry = { id: Math.random().toString(36).slice(2, 9), seq: ++auditSeq, at: new Date().toISOString(), scope: who.scope, tenant, actor: who.name, role: who.role, department: who.department, actorId: who.id, action, from, to, device: deviceLabel(), category: categoryOf(action), result: 'Success', ...over }
  const prevHash = state.audit.find((x) => x.hash)?.hash ?? 'GENESIS'
  const e: AuditEntry = { ...base, prevHash, hash: auditHash(prevHash, base) }
  state = { ...state, audit: [e, ...state.audit].slice(0, 5000) }
}
export const useAudit = (slug?: string) => { const s = useStore(); return slug ? s.audit.filter((a) => a.tenant === slug) : s.audit }
export const recordAudit = (tenant: string, action: string, from?: string, to?: string, extra: AuditExtra = {}) => {
  const { actor, role, ...rest } = extra
  log(tenant, action, from, to, { ...rest, ...(actor ? { actor } : {}), ...(role ? { role } : {}) }); set(state)
}
/** Record an action for the currently signed-in company (session or active tenant). */
export const auditFor = (action: string, opts: AuditExtra & { from?: string; to?: string; tenant?: string } = {}) => {
  const { from, to, tenant, ...extra } = opts
  const slug = tenant ?? businessSession()?.slug ?? state.active
  if (!slug) return
  recordAudit(slug, action, from, to, extra)
}
const subs = new Set<() => void>()
const set = (s: State) => {
  state = s
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage full */ }
  subs.forEach((f) => f())
}
const useStore = () => useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l) }, () => state)

export const useTenants = () => useStore().tenants
export const useDepartments = (slug?: string) => {
  const s = useStore()
  return s.departments[slug ?? s.active] ?? []
}
export const useDepartmentAccess = (slug?: string, email?: string) => {
  const departments = useDepartments(slug)
  return email ? departments.find((department) => department.memberEmails.includes(email)) : undefined
}
export const saveDepartment = (slug: string, department: Department) => {
  if (!department.modules.includes('performance')) department = { ...department, modules: [...department.modules, 'performance'] }
  const existing = state.departments[slug] ?? []
  const before = existing.find((item) => item.id === department.id)
  department.memberEmails.forEach((email) => setDemoAccountRole(slug, email, department.roleKey))
  log(slug, `${before ? 'Updated' : 'Created'} department access: ${department.name}`, before?.roleKey, department.roleKey)
  set({ ...state, departments: { ...state.departments, [slug]: before ? existing.map((item) => item.id === department.id ? department : item) : [...existing, department] } })
}
export const deleteDepartment = (slug: string, id: string) => {
  const department = (state.departments[slug] ?? []).find((item) => item.id === id)
  if (!department) return
  log(slug, `Deleted department access: ${department.name}`)
  set({ ...state, departments: { ...state.departments, [slug]: state.departments[slug].filter((item) => item.id !== id) } })
}
export function useTenant(slug?: string): Tenant | undefined {
  const s = useStore()
  return s.tenants[slug ?? s.active]
}
export const activeSlug = () => state.active
export const setActive = (slug: string) => { if (state.tenants[slug]) set({ ...state, active: slug }) }
const patch = (slug: string, fn: (t: Tenant) => Tenant, entry?: [string, string?, string?]) => {
  if (!state.tenants[slug]) return
  if (entry) log(slug, ...entry)
  set({ ...state, tenants: { ...state.tenants, [slug]: fn(state.tenants[slug]) } })
}
export const saveBrand = (slug: string, input: Brand) => {
  const brand = migrateBrand(input), prev = state.tenants[slug]?.brand
  if (prev && (prev.sidebarColor !== brand.sidebarColor || prev.sidebarText !== brand.sidebarText || prev.sidebarActive !== brand.sidebarActive || prev.sidebarBackground !== brand.sidebarBackground)) {
    const d = (b: Brand) => b.sidebarBackground === 'solid' ? `${b.sidebarColor} / text ${b.sidebarText || 'auto'}${b.sidebarActive ? ` / active ${b.sidebarActive}` : ''}` : 'default gradient'
    log(slug, 'Changed sidebar colours (Branding & Appearance)', d(prev), d(brand))
  }
  patch(slug, (t) => ({ ...t, brand }), ['Updated Branding & Appearance', prev?.primary, brand.primary])
}
export const saveProfile = (slug: string, profile: Profile) => patch(slug, (t) => ({ ...t, profile }), ['Updated Company Profile', state.tenants[slug]?.profile.name, profile.name])
export const setModule = (slug: string, id: string, on: boolean) => {
  const cur = state.tenants[slug]; if (!cur) return { added: [] as string[], removed: [] as string[] }
  const next = on ? withModuleDeps([...cur.modules, id]) : cur.modules.filter((m) => m !== id && !moduleDependents(id, cur.modules).includes(m))
  const added = next.filter((m) => !cur.modules.includes(m) && m !== id), removed = cur.modules.filter((m) => !next.includes(m) && m !== id)
  patch(slug, (t) => ({ ...t, modules: next }), [`${on ? 'Enabled' : 'Disabled'} module: ${id}${added.length ? ` (also enabled: ${added.join(', ')})` : ''}${removed.length ? ` (also disabled: ${removed.join(', ')})` : ''}`])
  return { added, removed }
}
export const setPlan = (slug: string, plan: string) => patch(slug, (t) => ({ ...t, plan, modules: tierModules(plan) }), ['Changed plan', state.tenants[slug]?.plan, plan])
export const setStatus = (slug: string, status: TStatus, reason?: string) => patch(slug, (t) => ({ ...t, status }), [`Workspace ${status === 'Suspended' ? 'suspended' : status === 'Active' ? 'activated' : 'set to ' + status}${reason ? ` (${reason})` : ''}`, state.tenants[slug]?.status, status])
/** Offboarding: reduce a closed workspace to a tombstone that keeps only the billing and legal facts. Personal and brand data is removed. */
export const anonymiseTenant = (slug: string) => {
  const t = state.tenants[slug]; if (!t) return
  const profile: Profile = { ...t.profile, email: '', phone: '', address: '', website: '', description: '', industry: '', size: '', state: '' }
  patch(slug, (x) => ({ ...x, profile, brand: { ...DEFAULT_BRAND }, modules: [], employees: 0, status: 'Expired' }), ['Workspace data deleted and anonymised (tombstone kept)', t.status, 'Expired'])
}
export const resetDemo = () => set(fresh())

/* invites */
export const useInvites = (slug: string) => useStore().invites.filter((i) => i.slug === slug)
export const useOnboardingSubmissions = (slug?: string) => {
  const s = useStore()
  return s.onboarding.filter((submission) => !slug || submission.slug === slug)
}
export const onboardingForAccount = (slug: string, email: string) => state.onboarding.find((submission) => submission.slug === slug && submission.email === email && submission.status !== 'Approved')
export const findInvite = (code: string) => state.invites.find((i) => i.code === code)
export const createInvite = (slug: string) => {
  const code = Math.random().toString(36).slice(2, 8)
  log(slug, `Generated employee onboarding link ${code}`)
  set({ ...state, invites: [{ code, slug, created: day(0), expires: day(7), status: 'Active' }, ...state.invites] })
  return code
}
export const revokeInvite = (code: string) => { const i = findInvite(code); if (i) { log(i.slug, `Revoked onboarding link ${code}`); set({ ...state, invites: state.invites.map((x) => (x.code === code ? { ...x, status: 'Revoked' } : x)) }) } }
export const inviteState = (i: Invite | undefined, slug: string): 'ok' | 'invalid' | 'expired' | 'revoked' | 'used' | 'wrong-tenant' =>
  !i ? 'invalid' : i.slug !== slug ? 'wrong-tenant' : i.status === 'Revoked' ? 'revoked' : i.status === 'Used' ? 'used' : new Date(i.expires) < new Date() ? 'expired' : 'ok'
export const completeInvite = (code: string, name: string, details?: { email?: string; phone?: string; title?: string; department?: string; documents?: string[] }) => {
  const i = findInvite(code); if (!i) return
  const t = state.tenants[i.slug]
  const session = businessSession()
  const account = session?.slug === i.slug ? demoAccountsFor(t).find((item) => item.email === session.email && item.roleKey === 'businessdev') : undefined
  const employeeName = account?.name ?? name
  const submission: OnboardingSubmission = {
    id: `ONB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, inviteCode: code, slug: i.slug, name: employeeName,
    email: account?.email ?? details?.email ?? '', title: account?.title ?? details?.title ?? 'New employee', department: details?.department ?? 'To be assigned',
    phone: details?.phone ?? '', documents: details?.documents ?? [], submitted: new Date().toISOString(), status: 'Submitted', notifications: [],
  }
  log(i.slug, `Employee self-onboarding submitted for HR approval: ${employeeName}`, undefined, undefined, { scope: 'Business', actor: employeeName, role: account?.title ?? 'Employee' })
  set({ ...state, onboarding: [submission, ...state.onboarding.filter((item) => !(item.slug === submission.slug && item.email === submission.email && item.status !== 'Approved'))], invites: state.invites.map((x) => (x.code === code ? { ...x, status: 'Used', name: employeeName } : x)) })
}
export const reviewOnboarding = (id: string, decision: 'Approved' | 'More details required', reviewer: string, note = '') => {
  const submission = state.onboarding.find((item) => item.id === id)
  if (!submission) return
  const notifications = decision === 'Approved'
    ? ['HR employee record activated', 'IT notified for equipment and account setup', 'Finance notified for payroll and bank setup', 'Branch admin notified for access and orientation']
    : ['Employee notified to update onboarding information']
  if (decision === 'Approved') {
    const runtime = globalThis as typeof globalThis & { __bfOnboardingComplete?: string[] }
    runtime.__bfOnboardingComplete = [...new Set([...(runtime.__bfOnboardingComplete ?? []), submission.name])]
  }
  log(submission.slug, `${decision === 'Approved' ? 'Approved' : 'Returned'} staff onboarding: ${submission.name}`, submission.status, decision, { actor: reviewer, role: 'HR Department', scope: 'Business' })
  set({ ...state, onboarding: state.onboarding.map((item) => item.id === id ? { ...item, status: decision, note, reviewedBy: reviewer, reviewedAt: new Date().toISOString(), notifications } : item) })
}

/* Support access is metadata-only. It never creates a company membership or tenant session. */
export const useSupport = () => useStore().support
export const requestSupport = (slug: string, by: string, reason: string, ticket: string, minutes = 60) => {
  const support: NonNullable<Support> = { id: `SUP-${Date.now().toString(36).toUpperCase()}`, slug, by, reason, ticket, minutes, requested: new Date().toISOString(), status: 'Requested', audience: 'bizflow-support-diagnostics', scopes: ['Workspace metadata', 'Authentication diagnostics', 'Integration health', 'Error logs'] }
  log(slug, `Support diagnostics requested: ${reason}`, undefined, `${ticket} · ${minutes} min`, { scope: 'Platform', actor: by, role: 'Support' })
  set({ ...state, support })
}
export const approveSupport = (slug: string, approvedBy: string) => {
  if (!state.support || state.support.slug !== slug || state.support.status !== 'Requested') return
  const started = new Date().toISOString()
  const support: NonNullable<Support> = { ...state.support, status: 'Active', approvedBy, started, expires: new Date(Date.now() + state.support.minutes * 60000).toISOString() }
  log(slug, 'Approved metadata-only support diagnostics', state.support.ticket, `${state.support.minutes} minutes`, { scope: 'Business', actor: approvedBy, role: 'Company Administrator' })
  set({ ...state, support })
}
export const declineSupport = (slug: string, declinedBy: string) => {
  if (!state.support || state.support.slug !== slug) return
  log(slug, 'Declined support diagnostics request', state.support.ticket, state.support.reason, { scope: 'Business', actor: declinedBy, role: 'Company Administrator' })
  set({ ...state, support: null })
}
export const endSupport = (expired = false) => {
  if (!state.support) return
  log(state.support.slug, expired ? 'Support diagnostics expired automatically' : 'Support diagnostics ended', state.support.ticket, undefined, { scope: 'Platform', actor: state.support.by, role: 'Support' })
  set({ ...state, support: null })
}

export const slugify = (name: string) => {
  const base = name.toLowerCase().replace(/\b(plc|limited|ltd|nigeria|international|ng|inc|llc)\b/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '').slice(0, 24)
  return base || 'workspace'
}
export const freeSlug = (name: string) => {
  const b = slugify(name); let s = b, i = 2
  while (state.tenants[s]) { s = b + i++; if (i > 99) break }
  return s
}
export const slugTaken = (slug: string) => !!state.tenants[slug]
export function createTenant(input: { slug?: string; name: string; email: string; phone: string; state: string; size: string; industry: string; cac: string; plan: string; employees: number; modules?: string[]; admin?: TenantAdmin; signup?: TenantSignup }) {
  /* Idempotent: a retried provisioning for the same signup returns the workspace that already exists. */
  const existing = input.signup && tenantBySignup(input.signup.id)
  if (existing) return existing.slug
  const slug = input.slug && !state.tenants[input.slug] ? input.slug : freeSlug(input.name)
  const t: Tenant = {
    slug, plan: input.plan, employees: input.employees, status: 'Active', created: new Date().toISOString().slice(0, 10), modules: input.modules ? withModuleDeps(input.modules) : tierModules(input.plan), brand: { ...DEFAULT_BRAND },
    profile: { ...PROFILE_BASE, name: input.name, email: input.email, phone: input.phone, address: '', industry: input.industry, size: input.size, state: input.state, cac: input.cac },
    admin: input.admin, signup: input.signup,
  }
  log(slug, 'Workspace provisioned after verified payment', undefined, t.plan, { scope: 'Platform', actor: 'BizFlow system', role: 'System', ref: input.signup?.ref })
  if (input.admin) log(slug, 'Company administrator account created', undefined, input.admin.email, { scope: 'Business', category: 'Security', actor: input.admin.name, role: 'Company Administrator' })
  if (input.signup) registerOwnDataset(slug, input.admin)
  set({ ...state, tenants: { ...state.tenants, [slug]: t }, active: slug })
  return slug
}

/* ---------- applying a brand to the document ---------- */
export const useSystemDark = () => {
  const [d, setD] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)'), f = () => setD(m.matches)
    m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [])
  return d
}
export const isDark = (b: Brand, sys: boolean) => b.theme === 'dark' || (b.theme === 'system' && sys)

export function brandVars(b: Brand, dark: boolean): Record<string, string> {
  const sidebar = b.sidebarColor || b.secondary
  const autoOn = onColor(sidebar)
  const sidebarOn = b.sidebarText && isHex(b.sidebarText) && contrast(b.sidebarText, sidebar) >= MIN_CONTRAST ? b.sidebarText : autoOn
  const activeBg = b.sidebarActive && isHex(b.sidebarActive) ? b.sidebarActive : ''
  const v: Record<string, string> = {
    '--brand': b.primary,
    '--brand-2': b.secondary,
    '--brand-accent': b.accent,
    '--brand-on': onColor(b.primary),
    '--sidebar-solid': sidebar,
    '--sidebar-on': sidebarOn,
    '--sidebar-muted': `color-mix(in oklab, ${sidebarOn} 66%, transparent)`,
    '--sidebar-subtle': `color-mix(in oklab, ${sidebarOn} 42%, transparent)`,
    '--sidebar-hover': `color-mix(in oklab, ${sidebarOn} 8%, transparent)`,
    '--sidebar-border': `color-mix(in oklab, ${sidebarOn} 14%, transparent)`,
    '--sidebar-active-bg': activeBg || `color-mix(in oklab, ${sidebarOn} 13%, transparent)`,
    '--sidebar-active-fg': activeBg ? (contrast(sidebarOn, activeBg) >= MIN_CONTRAST ? sidebarOn : onColor(activeBg)) : sidebarOn,
  }
  const custom = b.primary !== DEFAULT_BRAND.primary || b.accent !== DEFAULT_BRAND.accent || b.secondary !== DEFAULT_BRAND.secondary
  if (custom) {
    v['--color-teal'] = b.primary
    v['--color-teal-600'] = shade(b.primary, 0.18)
    v['--color-midnight'] = shade(b.primary, 0.58)
    v['--color-midnight-2'] = b.secondary
    v['--color-mint'] = b.accent
  }
  if (!dark) Object.assign(v, { '--color-cloud': '#F7F9F8', '--color-ink': '#102A30', '--color-slate': '#60777D', '--color-line': '#D8E2E3', '--surface': '#FFFFFF' })
  v['--color-softmint'] = dark ? mix(b.primary, '#0E1417', 0.8) : tint(b.primary, 0.88)
  if (dark) {
    Object.assign(v, { '--color-cloud': '#0E1417', '--color-ink': '#E8EFF1', '--color-slate': '#9FB2B8', '--color-line': '#2A383E', '--surface': '#162024' })
    if (!custom) v['--color-teal'] = '#2FB6C4'
    else v['--color-teal'] = contrast(b.primary, '#162024') < 3.2 ? tint(b.primary, 0.35) : b.primary
  }
  if (b.density === 'compact') v['--spacing'] = '0.215rem'
  return v
}
export const brandStyle = (b: Brand, dark: boolean) => brandVars(b, dark) as CSSProperties

export function useApplyBrand(t: Tenant | undefined) {
  useCompanyPwa(t)
  const sys = useSystemDark()
  const b = t?.brand
  const dark = b ? isDark(b, sys) : false
  useLayoutEffect(() => {
    if (!b) return
    const el = document.documentElement
    const vars = brandVars(b, dark)
    Object.entries(vars).forEach(([k, val]) => el.style.setProperty(k, val))
    el.classList.toggle('bf-dark', dark)
    return () => { Object.keys(vars).forEach((k) => el.style.removeProperty(k)); el.classList.remove('bf-dark') }
  }, [b, dark])
  const name = t?.profile.name
  useEffect(() => {
    if (!name) return
    const prev = document.title
    document.title = `${name} · BizFlow`
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel='icon']"))
    const olds = links.map((l) => l.href)
    if (b?.favicon) links.forEach((l) => { l.removeAttribute('type'); l.removeAttribute('sizes'); l.href = b.favicon! })
    return () => { document.title = prev; if (b?.favicon) links.forEach((l, i) => { l.href = olds[i] }) }
  }, [name, b?.favicon])
}
