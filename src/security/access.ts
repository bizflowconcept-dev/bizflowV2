import type { BusinessRoleKey } from '../tenant/store'

/** Single source of truth for every company permission. The type below is derived from it, and the platform docs registry enumerates it. */
export const COMPANY_PERMISSIONS = [
  'company.profile.manage', 'company.brand.manage', 'company.users.manage', 'company.roles.manage',
  'company.subscription.manage', 'company.security.manage', 'company.audit.view', 'people.create',
  'people.view', 'people.manage', 'attendance.manage', 'leave.manage',
  'organization.manage', 'payroll.view', 'payroll.process', 'payroll.approve',
  'accounting.view', 'accounting.post', 'approvals.configure', 'approvals.decide',
  'finance.tiers.manage', 'payments.disburse', 'procurement.create', 'assets.create',
  'fleet.create', 'crm.create', 'documents.upload', 'documents.templates.manage',
  'sign.create', 'reports.view', 'reports.schedule', 'billing.manage',
  'employee.rules.view', 'employee.rules.manage', 'employee.rules.override',
] as const
export type CompanyPermission = (typeof COMPANY_PERMISSIONS)[number]

export type CompanyRoleProfile = {
  title: string; user: string; id: string; scope: 'Company' | 'Own'
  can: CompanyPermission[]; modules: string[]
}

const P = (...permissions: CompanyPermission[]) => permissions

export const COMPANY_ROLES: Record<BusinessRoleKey, CompanyRoleProfile> = {
  admin: {
    title: 'Company Administrator', user: 'Nneka Okafor', id: 'ETZ-0002', scope: 'Company',
    can: P('company.profile.manage', 'company.brand.manage', 'company.users.manage', 'company.roles.manage', 'company.subscription.manage', 'company.security.manage', 'company.audit.view', 'people.create', 'people.view', 'people.manage', 'attendance.manage', 'organization.manage', 'documents.upload', 'documents.templates.manage', 'sign.create', 'reports.view', 'approvals.configure', 'employee.rules.view', 'employee.rules.manage', 'employee.rules.override'),
    modules: ['dashboard', 'health', 'my', 'leave', 'attendance', 'people', 'exit', 'organization', 'travel', 'vendors', 'reports', 'tasks', 'documents', 'sign', 'settings', 'billing', 'modules', 'inbox', 'audit-trail', 'offboarding'],
  },
  md: {
    title: 'CEO / Managing Director', user: 'Oladapo Adebayo', id: 'ETZ-0001', scope: 'Company',
    can: P('company.audit.view', 'people.view', 'payroll.view', 'approvals.configure', 'approvals.decide', 'finance.tiers.manage', 'reports.view', 'reports.schedule', 'sign.create', 'employee.rules.view', 'employee.rules.manage', 'employee.rules.override'),
    modules: ['dashboard', 'health', 'my', 'leave', 'attendance', 'organization', 'travel', 'vendors', 'payroll', 'reports', 'approvals', 'tasks', 'documents', 'sign', 'settings', 'inbox', 'audit-trail', 'offboarding'],
  },
  hr: {
    title: 'HR Department', user: 'Kemi Balogun', id: 'ETZ-0011', scope: 'Company',
    can: P('people.create', 'people.view', 'people.manage', 'attendance.manage', 'leave.manage', 'organization.manage', 'documents.upload', 'sign.create', 'payroll.view', 'payroll.process', 'reports.view', 'reports.schedule', 'employee.rules.view', 'employee.rules.manage', 'employee.rules.override'),
    modules: ['dashboard', 'performance', 'health', 'my', 'leave', 'attendance', 'people', 'exit', 'organization', 'travel', 'vendors', 'payroll', 'approvals', 'tasks', 'documents', 'sign', 'reports', 'inbox'],
  },
  finance: {
    title: 'Finance Officer / CFO', user: 'Chinedu Eze', id: 'ETZ-0018', scope: 'Company',
    can: P('payroll.view', 'payroll.process', 'payroll.approve', 'accounting.view', 'accounting.post', 'finance.tiers.manage', 'payments.disburse', 'procurement.create', 'sign.create', 'reports.view', 'reports.schedule', 'billing.manage', 'employee.rules.view'),
    modules: ['dashboard', 'performance', 'health', 'my', 'leave', 'attendance', 'organization', 'travel', 'vendors', 'payroll', 'accounting', 'reports', 'approvals', 'tasks', 'procurement', 'documents', 'sign', 'settings', 'inbox'],
  },
  operations: { title: 'Operations Manager', user: 'Ibrahim Musa', id: 'ETZ-0024', scope: 'Company', can: P('procurement.create', 'assets.create', 'fleet.create', 'sign.create', 'approvals.decide', 'reports.view', 'reports.schedule'), modules: ['dashboard', 'performance', 'my', 'leave', 'attendance', 'organization', 'travel', 'vendors', 'reports', 'approvals', 'tasks', 'procurement', 'assets', 'fleet', 'crm', 'documents', 'sign', 'inbox'] },
  sales: { title: 'Sales Lead', user: 'Tobi Adeyemi', id: 'ETZ-0031', scope: 'Company', can: P('crm.create', 'sign.create'), modules: ['dashboard', 'performance', 'my', 'leave', 'attendance', 'organization', 'travel', 'vendors', 'tasks', 'crm', 'documents', 'sign', 'inbox'] },
  bdmanager: { title: 'Business Development Manager', user: 'Morenike Adebayo', id: 'ETZ-0061', scope: 'Company', can: P('crm.create', 'sign.create', 'approvals.decide'), modules: ['dashboard', 'performance', 'my', 'leave', 'attendance', 'organization', 'travel', 'vendors', 'approvals', 'tasks', 'crm', 'documents', 'sign', 'inbox'] },
  businessdev: { title: 'Business Development Officer', user: 'Chisom Okeke', id: 'ETZ-0062', scope: 'Company', can: P('crm.create', 'sign.create'), modules: ['dashboard', 'performance', 'my', 'leave', 'attendance', 'organization', 'travel', 'vendors', 'tasks', 'crm', 'documents', 'sign', 'inbox'] },
  manager: { title: 'Department Manager', user: 'Femi Johnson', id: 'ETZ-0038', scope: 'Company', can: P('people.view', 'sign.create', 'approvals.decide', 'reports.schedule'), modules: ['dashboard', 'performance', 'my', 'leave', 'attendance', 'people', 'organization', 'travel', 'vendors', 'approvals', 'tasks', 'documents', 'sign', 'inbox'] },
  auditor: { title: 'Auditor', user: 'Adaeze Nwankwo', id: 'ETZ-0042', scope: 'Company', can: P('people.view', 'payroll.view', 'company.audit.view', 'reports.view', 'reports.schedule', 'employee.rules.view'), modules: ['dashboard', 'performance', 'health', 'my', 'leave', 'attendance', 'organization', 'travel', 'reports', 'approvals', 'tasks', 'documents', 'settings', 'audit-trail', 'inbox'] },
  compliance: { title: 'Compliance Officer', user: 'Halima Bello', id: 'ETZ-0043', scope: 'Company', can: P('people.view', 'approvals.decide', 'company.audit.view', 'reports.view', 'reports.schedule', 'employee.rules.view'), modules: ['dashboard', 'performance', 'health', 'my', 'leave', 'attendance', 'organization', 'travel', 'vendors', 'reports', 'approvals', 'tasks', 'documents', 'settings', 'audit-trail', 'inbox'] },
  employee: { title: 'Employee', user: 'Amaka Obi', id: 'ETZ-0142', scope: 'Own', can: P(), modules: ['performance', 'my', 'leave', 'attendance', 'organization', 'travel', 'approvals', 'tasks', 'documents', 'sign', 'inbox'] },
}

export type AuthAudience = 'bizflow-platform' | 'bizflow-company' | 'bizflow-support-diagnostics'
export type AuthContext = { audience: AuthAudience; subject: string; issuedAt: string; tenant?: string }
const CONTEXT_KEY = 'bf-auth-context-v1'

export const issueAuthContext = (context: Omit<AuthContext, 'issuedAt'>) =>
  localStorage.setItem(CONTEXT_KEY, JSON.stringify({ ...context, issuedAt: new Date().toISOString() }))

export const authContext = (): AuthContext | null => {
  try { return JSON.parse(localStorage.getItem(CONTEXT_KEY) || 'null') } catch { return null }
}

export const hasAudience = (audience: AuthAudience, tenant?: string) => {
  const context = authContext()
  return context?.audience === audience && (!tenant || context.tenant === tenant)
}

export const clearAuthContext = () => localStorage.removeItem(CONTEXT_KEY)

export type AuthorizationRequest = {
  audience: AuthAudience; permission?: CompanyPermission; role?: BusinessRoleKey; tenant?: string; resourceTenant?: string
}
export function authorize(request: AuthorizationRequest): { allowed: boolean; reason: string } {
  if (!hasAudience(request.audience, request.tenant)) return { allowed: false, reason: `A ${request.audience} session is required.` }
  if (request.tenant && request.resourceTenant && request.tenant !== request.resourceTenant) return { allowed: false, reason: 'Cross-company access is denied.' }
  if (request.permission && request.role && !COMPANY_ROLES[request.role].can.includes(request.permission)) return { allowed: false, reason: `${COMPANY_ROLES[request.role].title} does not have ${request.permission}.` }
  return { allowed: true, reason: 'Allowed by explicit role, permission and tenant scope.' }
}
