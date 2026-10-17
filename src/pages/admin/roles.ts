export type Perm =
  | 'view'
  | 'businesses'
  | 'tasks'
  | 'plans'
  | 'pricing'
  | 'discounts'
  | 'addons'
  | 'subscriptions'
  | 'payments'
  | 'revenue'
  | 'support'
  | 'users'
  | 'system'
  | 'audit'
  | 'settings'
  | 'changes'
  | 'approve'
  | 'breakglass'
  | 'docs'
  | 'offboard'
  | 'auditexport'
  | 'backups'

export const PERMS: Record<Perm, string> = {
  view: 'View Platform Billing',
  businesses: 'View Businesses',
  tasks: 'Manage Platform Tasks',
  plans: 'Manage Plans',
  pricing: 'Manage Pricing',
  discounts: 'Manage Discounts',
  addons: 'Manage Add-ons',
  subscriptions: 'Manage Subscriptions',
  payments: 'Manage BizFlow Subscription Payments',
  revenue: 'View BizFlow Revenue & Payments',
  support: 'Manage Support',
  users: 'View Platform Users',
  system: 'View System Health',
  audit: 'View Billing Audit',
  settings: 'Manage Platform Settings',
  changes: 'Raise and recommend settings changes',
  approve: 'Approve settings changes (second approver)',
  breakglass: 'Request or approve emergency diagnostics',
  docs: 'View platform documentation',
  offboard: 'Start, approve and run tenant offboarding',
  auditexport: 'Verify the audit chain and export signed audit reports',
  backups: 'Request and approve tenant restores',
}

const ALL = Object.keys(PERMS) as Perm[]

export const ADMIN_ROLES = {
  super: {
    department: 'Executive',
    title: 'Platform Super Admin',
    user: 'Folake Bankole',
    email: 'folake.bankole@bizflow.com',
    password: 'demo-password',
    scope: 'Platform',
    mfa: 'Authenticator app',
    can: ALL,
  },
  billing: {
    department: 'Billing & Revenue',
    title: 'Platform Billing Operations',
    user: 'Seun Adeyemi',
    email: 'seun.adeyemi@bizflow.com',
    password: 'demo-password',
    scope: 'Billing & subscriptions',
    mfa: 'Authenticator app',
    can: ['view', 'businesses', 'tasks', 'plans', 'pricing', 'discounts', 'addons', 'subscriptions', 'support', 'audit', 'changes', 'approve', 'docs', 'offboard'] as Perm[],
  },
  finance: {
    department: 'Finance',
    title: 'Platform Finance Operations',
    user: 'Ngozi Eze',
    email: 'ngozi.eze@bizflow.com',
    password: 'demo-password',
    scope: 'Revenue & collections',
    mfa: 'Hardware key',
    can: ['view', 'businesses', 'tasks', 'payments', 'revenue', 'discounts', 'audit', 'docs'] as Perm[],
  },
  support: {
    department: 'Customer Support',
    title: 'Platform Support Agent',
    user: 'Dayo Martins',
    email: 'dayo.martins@bizflow.com',
    password: 'demo-password',
    scope: 'Assigned companies',
    mfa: 'Authenticator app',
    can: ['view', 'businesses', 'tasks', 'subscriptions', 'support', 'changes', 'docs', 'backups'] as Perm[],
  },
  readonly: {
    department: 'Audit & Compliance',
    title: 'Read-only',
    user: 'Tolu Adebayo',
    email: 'tolu.adebayo@bizflow.com',
    password: 'demo-password',
    scope: 'View only, for auditors',
    mfa: 'Authenticator app',
    can: ['view', 'businesses', 'revenue', 'system', 'audit', 'docs', 'auditexport'] as Perm[],
  },
}

export type AdminRole = keyof typeof ADMIN_ROLES

/** Platform console navigation: [label, route, permission]. Exported so the docs registry can map every admin permission to the screens it unlocks. */
export const ADMIN_NAV: { g: string; items: [string, string, Perm][] }[] = [
  { g: 'Overview', items: [['Platform overview', '/admin', 'view']] },
  { g: 'Work', items: [['Platform tasks', '/admin/tasks', 'tasks']] },
  { g: 'Configuration', items: [['Change requests', '/admin/changes', 'businesses'], ['Tenant health', '/admin/health', 'businesses'], ['Onboarding', '/admin/onboarding', 'businesses'], ['Compliance calendar', '/admin/compliance', 'businesses'], ['Feature rollout', '/admin/rollout', 'settings'], ['Template marketplace', '/admin/templates', 'settings']] },
  { g: 'Businesses', items: [['All businesses', '/admin/businesses', 'businesses'], ['Active', '/admin/businesses?status=Active', 'businesses'], ['Trial', '/admin/businesses?status=Trial', 'businesses'], ['Suspended', '/admin/businesses?status=Suspended', 'businesses'], ['Pending Setup', '/admin/businesses?status=Pending Setup', 'businesses'], ['Offboarding', '/admin/offboarding', 'businesses']] },
  { g: 'Subscriptions', items: [['Company subscriptions', '/admin/billing/subscriptions', 'view'], ['Platform plans', '/admin/billing/plans', 'plans'], ['Module pricing', '/admin/billing/module-pricing', 'view'], ['Quote requests', '/admin/billing/quotes', 'view'], ['Add-ons', '/admin/billing/addons', 'addons']] },
  { g: 'Finance', items: [['BizFlow revenue & payments', '/admin/finance', 'revenue'], ['Partners', '/admin/partners', 'revenue'], ['Platform billing overview', '/admin/billing', 'view'], ['Platform billing operations', '/admin/billing/operations', 'revenue'], ['Currency & tax', '/admin/billing/currency', 'pricing'], ['Discounts & coupons', '/admin/billing/promotions', 'discounts'], ['Free periods & grants', '/admin/billing/grants', 'discounts'], ['Collections & reports', '/admin/billing/collections', 'discounts'], ['Revenue operations', '/admin/billing/revenue-ops', 'revenue'], ['Invoices & credit notes', '/admin/billing/invoices', 'revenue'], ['Payment recovery', '/admin/billing/recovery', 'revenue'], ['Usage & limits', '/admin/billing/usage', 'view'], ['Platform billing audit', '/admin/billing/audit', 'audit']] },
  { g: 'Support', items: [['Tickets', '/admin/support', 'support'], ['Support console', '/admin/helpdesk', 'support'], ['Password resets', '/admin/password-resets', 'support'], ['Announcements', '/admin/announcements', 'support']] },
  { g: 'Users', items: [['Platform users', '/admin/users', 'users']] },
  { g: 'System', items: [['Health & audit', '/admin/system', 'system'], ['Reliability', '/admin/reliability', 'system'], ['Status & releases', '/admin/status', 'system'], ['Audit trail & integrity', '/admin/audit-trail', 'system'], ['Data residency & backups', '/admin/backups', 'backups']] },
  { g: 'Documentation', items: [['Platform documentation', '/admin/docs', 'docs']] },
  { g: 'Settings', items: [['Platform settings', '/admin/settings', 'settings']] },
]

/* Departments for platform staff. Tasks are scoped by these. */
export const DEPARTMENTS = ['Executive', 'Billing & Revenue', 'Finance', 'Customer Support', 'Audit & Compliance'] as const
export type Department = (typeof DEPARTMENTS)[number]
const staffRole = (name: string) => Object.values(ADMIN_ROLES).find((r) => r.user === name)
export const deptOfUser = (name: string): Department | undefined => (staffRole(name)?.department as Department | undefined)
export const staffInDept = (dept: string) => Object.values(ADMIN_ROLES).filter((r) => r.department === dept).map((r) => r.user)
/* Managers (super admin and the billing lead) may see every department and hand work across departments. */
export const isStaffManager = (name: string) => { const r = staffRole(name); return r === ADMIN_ROLES.super || r === ADMIN_ROLES.billing }

export type PlatformAccessRole = { id: string; name: string; scope: string; description: string; permissions: Perm[]; system?: boolean }
export type PlatformAccessUser = { email: string; name: string; roleId: string; status: 'Active' | 'Suspended' }
export type PlatformAccess = { roles: PlatformAccessRole[]; users: PlatformAccessUser[] }

const ACCESS_KEY = 'bf-platform-access-v1'
const defaultAccess = (): PlatformAccess => ({
  roles: (Object.entries(ADMIN_ROLES) as [AdminRole, (typeof ADMIN_ROLES)[AdminRole]][]).map(([id, role]) => ({
    id,
    name: role.title,
    scope: role.scope,
    description: `${role.title} access profile`,
    permissions: [...role.can],
    system: true,
  })),
  users: Object.values(ADMIN_ROLES).map((role, index) => ({
    email: role.email,
    name: role.user,
    roleId: (Object.keys(ADMIN_ROLES) as AdminRole[])[index],
    status: 'Active',
  })),
})

export const getPlatformAccess = (): PlatformAccess => {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCESS_KEY) || 'null')
    if (saved?.roles?.length && saved?.users?.length) {
      /* Documentation is read-only: roles saved before it existed keep it wherever they can already view the platform. */
      saved.roles = saved.roles.map((role: PlatformAccessRole) => (role.permissions.includes('view') && !role.permissions.includes('docs') ? { ...role, permissions: [...role.permissions, 'docs'] } : role))
      return saved
    }
  } catch { /* use defaults */ }
  return defaultAccess()
}

export const savePlatformAccess = (access: PlatformAccess) => {
  localStorage.setItem(ACCESS_KEY, JSON.stringify(access))
  window.dispatchEvent(new Event('bf-platform-access'))
}

export const resolveAdminAccount = (key: AdminRole) => {
  const base = ADMIN_ROLES[key]
  const access = getPlatformAccess()
  const user = access.users.find((item) => item.email === base.email)
  const role = access.roles.find((item) => item.id === user?.roleId)
  return role ? { ...base, title: role.name, scope: role.scope, can: role.permissions, active: user?.status !== 'Suspended' } : { ...base, active: true }
}

export const isAdminRole = (value: string | null): value is AdminRole =>
  !!value && value in ADMIN_ROLES

export type CompanyPolicy = {
  requireMfa: boolean
  allowBranding: boolean
  allowEmployeeInvites: boolean
  requireSupportApproval: boolean
  sessionTimeout: number
}
export type CompanyPolicyState = {
  defaults: CompanyPolicy
  overrides: Record<string, Partial<CompanyPolicy>>
}

const COMPANY_POLICY_KEY = 'bf-company-policies-v1'
const defaultCompanyPolicy = (): CompanyPolicyState => ({
  defaults: {
    requireMfa: true,
    allowBranding: true,
    allowEmployeeInvites: true,
    requireSupportApproval: true,
    sessionTimeout: 30,
  },
  overrides: {},
})

export const getCompanyPolicies = (): CompanyPolicyState => {
  try {
    const saved = JSON.parse(localStorage.getItem(COMPANY_POLICY_KEY) || 'null')
    if (saved?.defaults && saved?.overrides) return { defaults: { ...defaultCompanyPolicy().defaults, ...saved.defaults }, overrides: saved.overrides }
  } catch { /* use defaults */ }
  return defaultCompanyPolicy()
}

export const saveCompanyPolicies = (policies: CompanyPolicyState) => {
  localStorage.setItem(COMPANY_POLICY_KEY, JSON.stringify(policies))
  window.dispatchEvent(new Event('bf-company-policies'))
}

export const resolveCompanyPolicy = (slug: string, policies = getCompanyPolicies()): CompanyPolicy => ({
  ...policies.defaults,
  ...(policies.overrides[slug] ?? {}),
})
