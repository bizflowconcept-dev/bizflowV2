/** Company app navigation (plain data, no JSX) so the platform docs registry and the sidebar share one source. Icons are attached in AppLayout by module key. */
export type NavEntry = { n: string; to: string; m: string }
export const NAV_DATA: { g: string; items: NavEntry[] }[] = [
  { g: 'Workspace', items: [{ n: 'Inbox', to: '/admin/business/inbox', m: 'inbox' }, { n: 'Dashboard', to: '/admin/business/dashboard', m: 'dashboard' }, { n: 'Modules', to: '/admin/business/modules', m: 'modules' }] },
  { g: 'People', items: [{ n: 'My BizFlow', to: '/admin/business/my', m: 'my' }, { n: 'Performance & Attendance', to: '/admin/business/performance', m: 'performance' }, { n: 'Employees', to: '/admin/business/people', m: 'people' }, { n: 'Organisation', to: '/admin/business/organization', m: 'organization' }, { n: 'Leave', to: '/admin/business/leave', m: 'leave' }, { n: 'Staff Exit', to: '/admin/business/exit', m: 'exit' }] },
  { g: 'Money', items: [{ n: 'Payroll', to: '/admin/business/payroll', m: 'payroll' }, { n: 'Accounting', to: '/admin/business/accounting', m: 'accounting' }] },
  { g: 'Operations', items: [{ n: 'Approvals', to: '/admin/business/approvals', m: 'approvals' }, { n: 'Tasks', to: '/admin/business/tasks', m: 'tasks' }, { n: 'Travel', to: '/admin/business/travel', m: 'travel' }, { n: 'Procurement', to: '/admin/business/procurement', m: 'procurement' }, { n: 'Vendors', to: '/admin/business/vendors', m: 'vendors' }, { n: 'Assets', to: '/admin/business/assets', m: 'assets' }, { n: 'Fleet', to: '/admin/business/fleet', m: 'fleet' }] },
  { g: 'Customers', items: [{ n: 'CRM', to: '/admin/business/crm', m: 'crm' }] },
  { g: 'Workflow & Documents', items: [{ n: 'Documents', to: '/admin/business/documents', m: 'documents' }, { n: 'BizFlow Sign', to: '/admin/business/sign', m: 'sign' }] },
  { g: 'Insights & Control', items: [{ n: 'Business Health', to: '/admin/business/health', m: 'health' }, { n: 'Reports', to: '/admin/business/reports', m: 'reports' }, { n: 'Audit trail', to: '/admin/business/audit-trail', m: 'audit-trail' }, { n: 'Company Settings', to: '/admin/business/settings', m: 'settings' }, { n: 'Billing & Subscription', to: '/admin/business/billing', m: 'billing' }] },
]

/** Sidebar page key -> company module catalog id (tenant.modules). A locked module shows an upgrade prompt instead of the page. */
export const NAV_TENANT_MODULE: Record<string, string> = { people: 'hr', payroll: 'payroll', fleet: 'fleet', crm: 'crm', sign: 'sign', approvals: 'expenses', travel: 'travel', attendance: 'attendance', vendors: 'vendors', exit: 'exit', organization: 'orgchart', leave: 'leave' }
