import { DEFAULT_BRAND, demoAccountsFor } from '../tenant/store'
import type { AuditEntry, Tenant } from '../tenant/store'
import { policyOf } from '../approvals/flow'
import { resolveCompanyPolicy } from '../pages/admin/roles'

/* ---------- The ONE onboarding checklist ----------
   Every item is derived from data the tenant has really produced (profile, branding, accounts, departments, audit log, stored
   configuration). The Onboarding tracker, the Tenant health "setup" factor and the Customer-success onboarding column all call this
   same function, so the three can never disagree. Pure and import-light on purpose: health.ts imports it. */
export type OnbGroup = 'Company' | 'People' | 'Operations' | 'Security'
export type OnbItem = { key: string; label: string; group: OnbGroup; done: boolean; evidence: string; fix: string }

const DAY = 864e5
const has = (key: string) => { try { return localStorage.getItem(key) !== null } catch { return false } }
const departmentsWithMembers = (slug: string) => {
  try {
    const s = JSON.parse(localStorage.getItem('bf-tenants-v5') || 'null') as { departments?: Record<string, { memberEmails?: string[] }[]> } | null
    return (s?.departments?.[slug] ?? []).filter((d) => (d.memberEmails?.length ?? 0) > 0).length
  } catch { return 0 }
}
const mine = (t: Tenant, audit: AuditEntry[]) => audit.filter((a) => a.tenant === t.slug && a.scope === 'Business')
const said = (list: AuditEntry[], re: RegExp, category?: string) => list.some((a) => re.test(a.action) && (!category || a.category === category))

export const ONB_TOTAL = 12

export function onboardingItems(t: Tenant, audit: AuditEntry[]): OnbItem[] {
  const log = mine(t, audit)
  const recent = log.filter((a) => Date.now() - new Date(a.at).getTime() < 30 * DAY)
  const actors = new Set(recent.map((a) => a.actor)).size
  const p = t.profile
  const mods = new Set(t.modules)
  const accounts = demoAccountsFor(t).length
  const depts = departmentsWithMembers(t.slug)
  const payrollRun = (() => { try { return !!(JSON.parse(localStorage.getItem('bizflow.payrollRun.v2') || '{}') as Record<string, unknown>)[t.slug] } catch { return false } })()
  const payrollOn = mods.has('payroll')
  const leaveOn = mods.has('leave')
  const item = (key: string, label: string, group: OnbGroup, done: boolean, evidence: string, fix: string): OnbItem => ({ key, label, group, done, evidence, fix })
  return [
    item('profile', 'Company profile complete', 'Company', !!(p.cac && p.address && p.phone), p.cac && p.address && p.phone ? 'CAC number, address and phone on file' : `Missing ${[!p.cac && 'CAC number', !p.address && 'address', !p.phone && 'phone'].filter(Boolean).join(', ')}`, 'Ask the administrator to complete Settings, Company profile.'),
    item('branding', 'Branding customised', 'Company', t.brand.primary !== DEFAULT_BRAND.primary || !!t.brand.logo, t.brand.primary !== DEFAULT_BRAND.primary || t.brand.logo ? 'Custom colour or logo saved' : 'Still on the BizFlow default theme', 'Share the branding guide. It takes two minutes.'),
    item('modules', 'Three or more modules enabled', 'Company', t.modules.length >= 3, `${t.modules.length} module${t.modules.length === 1 ? '' : 's'} switched on`, 'Walk through the modules the plan already includes.'),
    item('employees', 'Employees added', 'People', accounts > 1 || said(log, /employee|onboarding link|import/i, 'People'), accounts > 1 ? `${accounts} people have workspace accounts` : 'Only the administrator account exists', 'Offer a CSV import session or share the staff onboarding link.'),
    item('departments', 'Departments set up with members', 'People', depts > 0, depts ? `${depts} department${depts === 1 ? '' : 's'} with members` : 'No department has any member', 'Help the administrator assign people to departments.'),
    item('payroll', 'Payroll configured', 'Operations', payrollOn && (payrollRun || said(log, /payroll|salary|payslip/i)), !payrollOn ? 'Payroll module is off' : payrollRun || said(log, /payroll|salary|payslip/i) ? 'A payroll run exists for this company' : 'Payroll is on but no run has been prepared', 'Prepare a first payroll run with the company finance lead.'),
    item('leave', 'Leave policies configured', 'Operations', leaveOn && (has(`bf-employee-rules-v1:${t.slug}`) || said(log, /leave polic|employee rule/i)), !leaveOn ? 'Leave module is off' : has(`bf-employee-rules-v1:${t.slug}`) || said(log, /leave polic|employee rule/i) ? 'Employee and leave rules have been published' : 'Leave module is on but no policy was published', 'Publish leave entitlements under Employee rules.'),
    item('approvals', 'Approval flow configured', 'Operations', policyOf(t.slug).rules.length > 0, policyOf(t.slug).rules.length ? `${policyOf(t.slug).rules.length} approval rule${policyOf(t.slug).rules.length === 1 ? '' : 's'} saved` : 'No approval rules saved', 'Set up the approval chain for expenses and purchases.'),
    item('first-approval', 'First approval completed', 'Operations', said(log, /approv/i, 'Requests'), said(log, /approv/i, 'Requests') ? 'A request has been approved' : 'No request has been approved yet', 'Ask a manager to raise and approve a first request.'),
    item('templates', 'Document template saved', 'Operations', has(`bf-doc-templates-v3:${t.slug}`) || has(`bf-doc-templates-v2:${t.slug}`) || said(log, /template/i), has(`bf-doc-templates-v3:${t.slug}`) || said(log, /template/i) ? 'Letterhead or template customised' : 'Using untouched default templates', 'Customise the letterhead and the offer letter template.'),
    item('mfa', 'Administrator MFA enforced', 'Security', resolveCompanyPolicy(t.slug).requireMfa, resolveCompanyPolicy(t.slug).requireMfa ? 'Company policy requires MFA' : 'MFA is not required by policy', 'Recommend switching on MFA for all staff.'),
    item('active', 'Staff actively using the workspace', 'People', actors >= 3, `${actors} active user${actors === 1 ? '' : 's'} in 30 days`, 'Run a training session so more people log in.'),
  ]
}

export const onboardingPctOf = (items: OnbItem[]) => Math.round((items.filter((i) => i.done).length / items.length) * 100)
