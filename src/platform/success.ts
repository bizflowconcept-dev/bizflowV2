import { MODULE_LIST, demoAccountsFor, recordAudit, tierModules } from '../tenant/store'
import type { AuditEntry, Tenant } from '../tenant/store'
import type { Task } from '../tasks/store'
import type { Sub } from '../billing/engine'
import { onboardingItems } from './onboardingCore'
import { HEALTH_THRESHOLDS, healthOf } from './health'
import type { Health } from './health'
import { createStore, uid } from './persist'
import { offboardingOf } from './offboarding'

/* ---------- Customer-success action log (check-ins, nudges), persisted ---------- */
export type SuccessAction = { id: string; slug: string; at: string; by: string; action: string; note: string }
const log = createStore<SuccessAction[]>('bizflow.success.v1', () => [])
export const useSuccessLog = (slug?: string) => { const all = log.use(); return slug ? all.filter((a) => a.slug === slug) : all }
export function logSuccessAction(slug: string, action: string, note: string, by: string) {
  log.set((l) => [{ id: uid('CS'), slug, at: new Date().toISOString(), by, action, note }, ...l].slice(0, 500))
  recordAudit(slug, `Customer success: ${action}`, undefined, note || undefined, { category: 'Support' })
}

/* ---------- Scoring ---------- */
export type Risk = 'Low' | 'Medium' | 'High'
export type Success = {
  slug: string; adoption: number; health: Health; modulesUsed: number; modulesEntitled: number; activeStaff: number; staffPct: number
  lastActivity: string | null; daysSince: number | null; tasks30: number; crm30: number
  risk: Risk; reasons: string[]; onboarding: { label: string; done: boolean }[]; onboardingPct: number
  renewal: string; renewalSource: 'Billing' | 'Estimated'; actions: string[]
}
/* One model: `adoption` is the health score from health.ts (0-100). Churn risk below is derived from that score plus hard signals.
   The engagement figures (modules used, active staff, task and CRM actions) are supporting evidence only and are not scored separately. */
export const RISK_RULES: { level: Risk; rule: string }[] = [
  { level: 'High', rule: 'Workspace suspended, expired or in grace period; or no activity for more than 30 days; or three or more warning signals.' },
  { level: 'Medium', rule: 'One or two warning signals, or the health score is below Healthy (under 70).' },
  { level: 'Low', rule: 'No warning signals and a Healthy score (70 or more).' },
]
export const RISK_SIGNALS = ['Suspended or expired workspace', 'Grace period or renewal due', 'Subscription past due or payment failed', 'No activity recorded, or none for over 14 days', 'Under 25% of staff active in 30 days', 'Health score in the At risk band (under 45)', 'Onboarding under 50% complete']
const DAY = 864e5
const AREAS = ['Requests', 'Finance', 'People', 'Tasks', 'Leave', 'Exit', 'Documents', 'Customers', 'Attendance']

export function successOf(t: Tenant, audit: AuditEntry[], tasks: Task[], subs: Sub[]): Success {
  const mine = audit.filter((a) => a.tenant === t.slug && a.scope === 'Business')
  const recent = mine.filter((a) => Date.now() - new Date(a.at).getTime() < 30 * DAY)
  const last = mine.reduce<string | null>((m, a) => (!m || a.at > m ? a.at : m), null)
  const daysSince = last ? Math.floor((Date.now() - new Date(last).getTime()) / DAY) : null
  const entitled = Math.max(1, tierModules(t.plan).length || MODULE_LIST.length)
  const areas = new Set(recent.map((a) => a.category).filter((c) => c && AREAS.includes(c)))
  const modulesUsed = Math.min(t.modules.length, Math.max(areas.size, t.modules.length ? 1 : 0) + (areas.size > 3 ? 1 : 0))
  const seats = Math.max(1, demoAccountsFor(t).length)
  const actors = new Set(recent.map((a) => a.actor)).size
  const staffPct = Math.min(100, Math.round((actors / seats) * 100))
  const tasks30 = tasks.filter((x) => x.scope === 'Business' && x.tenant === t.slug && Date.now() - new Date(x.created).getTime() < 30 * DAY).length + recent.filter((a) => a.category === 'Tasks').length
  const crm30 = recent.filter((a) => a.category === 'Customers').length
  const health = healthOf(t, audit)
  const adoption = health.score

  const onboarding = onboardingItems(t, audit).map((o) => ({ label: o.label, done: o.done }))
  const onboardingPct = Math.round((onboarding.filter((o) => o.done).length / onboarding.length) * 100)

  const sub = subs.find((s) => s.company === t.profile.name)
  const anniv = new Date(t.created); anniv.setFullYear(new Date().getFullYear()); if (anniv.getTime() < Date.now()) anniv.setFullYear(anniv.getFullYear() + 1)
  const renewal = sub?.renewsAt ?? anniv.toISOString()

  const reasons: string[] = []
  if (t.status === 'Suspended' || t.status === 'Expired') reasons.push(`Workspace is ${t.status.toLowerCase()}`)
  if (t.status === 'Grace Period') reasons.push('Payment failed, in grace period')
  const off = offboardingOf(t.slug)
  if (off && off.state !== 'Deleted') reasons.unshift(`Cancellation ${off.state === 'Requested' || off.state === 'Retention' ? 'requested' : 'approved'}: ${off.reason}`)
  if (t.status === 'Renewal Due') reasons.push('Renewal is due')
  if (sub && ['Past Due', 'Payment Failed'].includes(sub.status)) reasons.push(`Subscription ${sub.status.toLowerCase()}`)
  if (daysSince === null) reasons.push('No activity recorded')
  else if (daysSince > 14) reasons.push(`No activity for ${daysSince} days`)
  if (staffPct < 25 && t.status !== 'Pending Setup') reasons.push(`Only ${staffPct}% of staff active in 30 days`)
  if (adoption < HEALTH_THRESHOLDS.watch) reasons.push(`Health score ${adoption} is in the At risk band`)
  if (onboardingPct < 50 && t.status !== 'Pending Setup') reasons.push('Onboarding stalled')
  const hard = !!off || t.status === 'Suspended' || t.status === 'Expired' || t.status === 'Grace Period' || (daysSince !== null && daysSince > 30)
  const risk: Risk = hard || reasons.length >= 3 ? 'High' : reasons.length >= 1 || adoption < HEALTH_THRESHOLDS.healthy ? 'Medium' : 'Low'
  if (!reasons.length && risk === 'Medium') reasons.push(`Health score ${adoption} is in the Watch band`)

  const actions: string[] = []
  if (onboardingPct < 100) actions.push('Send onboarding nudge')
  if (risk !== 'Low') actions.push('Schedule check-in')
  if (staffPct < 40) actions.push('Offer training session')
  if (['Renewal Due', 'Grace Period'].includes(t.status) || (sub && ['Past Due', 'Payment Failed'].includes(sub.status))) actions.push('Send renewal reminder')
  if (off && (off.state === 'Requested' || off.state === 'Retention')) actions.unshift('Make a retention offer')
  if (risk === 'High') actions.push('Escalate to account manager')
  if (!actions.length) actions.push('Request feedback (NPS)')
  return { slug: t.slug, adoption, health, modulesUsed, modulesEntitled: entitled, activeStaff: actors, staffPct, lastActivity: last, daysSince, tasks30, crm30, risk, reasons, onboarding, onboardingPct, renewal, renewalSource: sub ? 'Billing' : 'Estimated', actions }
}
