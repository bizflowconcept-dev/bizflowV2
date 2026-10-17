import type { Tenant } from '../tenant/store'
import type { Priority, Task } from './store'

export const DEPT_STYLE: Record<string, { chip: string; dot: string }> = {
  Executive: { chip: 'bg-violet-50 text-violet-800', dot: 'bg-violet-500' },
  'Billing & Revenue': { chip: 'bg-sky-50 text-sky-800', dot: 'bg-sky-500' },
  Finance: { chip: 'bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  'Customer Support': { chip: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  'Audit & Compliance': { chip: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
}
export const deptStyle = (d?: string) => DEPT_STYLE[d ?? ''] ?? DEPT_STYLE['Audit & Compliance']

export type TaskTemplate = { category: string; title: string; desc: string; priority: Priority }
export const DEPT_TEMPLATES: Record<string, TaskTemplate[]> = {
  'Billing & Revenue': [
    { category: 'Dunning follow-up', title: 'Dunning follow-up: ', desc: 'Contact the billing owner about the failed or overdue payment and agree a payment date.', priority: 'High' },
    { category: 'Refund review', title: 'Refund review: ', desc: 'Check the refund request against the plan terms and usage, then recommend approve or decline.', priority: 'Normal' },
    { category: 'Renewal quote', title: 'Prepare renewal quote: ', desc: 'Prepare the renewal quote with current seats, add-ons and any approved discount.', priority: 'Normal' },
  ],
  Finance: [
    { category: 'Reconciliation', title: 'Reconcile settlements: ', desc: 'Match gateway settlements to invoices and flag unmatched references.', priority: 'High' },
    { category: 'Tax and compliance', title: 'Tax filing check: ', desc: 'Confirm VAT and withholding configuration before the filing date.', priority: 'Normal' },
  ],
  'Customer Support': [
    { category: 'Ticket escalation', title: 'Escalate ticket: ', desc: 'Escalate the open ticket with reproduction steps and customer impact.', priority: 'High' },
    { category: 'Onboarding help', title: 'Onboarding follow-up: ', desc: 'Check the workspace setup is complete and offer a walkthrough.', priority: 'Normal' },
  ],
  Executive: [
    { category: 'Access review', title: 'Access review: ', desc: 'Review platform staff access and remove anything no longer needed.', priority: 'Normal' },
    { category: 'Escalation decision', title: 'Decision needed: ', desc: 'Make a call on the escalated item and record the outcome.', priority: 'High' },
  ],
  'Audit & Compliance': [
    { category: 'Audit trail review', title: 'Audit trail review: ', desc: 'Review the audit trail for unusual activity and note findings.', priority: 'Low' },
  ],
}

export type Suggestion = { key: string; tenant: string; dept: string; reason: string } & TaskTemplate & { related: string }
/* Context-linked suggestions, e.g. a past-due subscription suggests a Billing task. Skips anything already open. */
export function suggestTasks(tenants: Tenant[], tasks: Task[]): Suggestion[] {
  const out: Suggestion[] = []
  const open = (related: string, category: string) => tasks.some((t) => t.status !== 'Done' && t.category === category && t.related === related)
  for (const t of tenants) {
    const n = t.profile.name
    const add = (dept: string, category: string, title: string, desc: string, priority: Priority, reason: string) => {
      const related = `${n} · ${category}`
      if (!open(related, category)) out.push({ key: `${t.slug}-${category}`, tenant: t.slug, dept, category, title, desc, priority, related, reason })
    }
    if (t.status === 'Grace Period') add('Billing & Revenue', 'Dunning follow-up', `Dunning follow-up: ${n}`, 'Payment failed and the workspace is in its grace period. Contact the billing owner before access is restricted.', 'Urgent', 'Subscription past due')
    if (t.status === 'Suspended') add('Billing & Revenue', 'Dunning follow-up', `Recover suspended workspace: ${n}`, 'Workspace is suspended pending payment. Agree a payment date and reactivate once cleared.', 'Urgent', 'Workspace suspended')
    if (t.status === 'Renewal Due') add('Billing & Revenue', 'Renewal quote', `Prepare renewal quote: ${n}`, 'Renewal is due. Prepare and send the quote.', 'High', 'Renewal due')
    if (t.status === 'Pending Setup') add('Customer Support', 'Onboarding help', `Onboarding follow-up: ${n}`, 'Workspace is awaiting setup. Offer help to finish onboarding.', 'Normal', 'Awaiting setup')
  }
  return out
}
