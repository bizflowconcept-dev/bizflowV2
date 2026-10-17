import { MODULE_LIST, tierModules } from '../tenant/store'
import type { AuditEntry, Tenant } from '../tenant/store'
import { onboardingItems } from './onboardingCore'

export const PLAN_LIMITS: Record<string, { seats: number; storageGb: number }> = {
  Starter: { seats: 25, storageGb: 10 },
  Professional: { seats: 100, storageGb: 50 },
  Enterprise: { seats: 1000, storageGb: 500 },
}
export type HealthFactor = { key: string; name: string; pts: number; max: number; note: string; source: string; why: string; improve: string }
export type Health = { score: number; label: 'Healthy' | 'Watch' | 'At risk'; tone: 'green' | 'amber' | 'red'; factors: HealthFactor[]; seatUse: number; moduleUse: number; actions: string[]; recent: number }

/* ---------- The ONE health model (single source of truth, also drives the explainer UI and successOf) ----------
   Score = sum of five factors, 100 points in total.
   Healthy >= 70, Watch >= 45, At risk below 45.
   Churn risk (see success.ts) is derived from this score plus hard signals. There is no second score. */
export const HEALTH_THRESHOLDS = { healthy: 70, watch: 45 }
export const HEALTH_MODEL: { key: string; name: string; max: number; source: string; rule: string; improve: string }[] = [
  { key: 'status', name: 'Subscription status', max: 20, source: 'Workspace status in Businesses', rule: 'Active 20, Trial 12, Renewal Due 10, Pending Setup 6, Grace Period 5, Suspended or Expired 0.', improve: 'Resolve payment problems and move Pending Setup or Trial workspaces to Active.' },
  { key: 'modules', name: 'Module adoption', max: 20, source: 'Modules switched on versus modules in the plan', rule: 'Share of the plan modules that are on, times 20.', improve: 'Share a module walkthrough and enable the modules the company has already paid for.' },
  { key: 'seats', name: 'Seat use', max: 15, source: 'Employees versus the plan seat limit', rule: '30% to 95% full scores 15. Above 95% scores 10 (about to outgrow the plan). Below 30% scales down to 0.', improve: 'Ask the administrator to invite the rest of the staff. If seats are nearly full, suggest an upgrade.' },
  { key: 'activity', name: 'Recent activity', max: 25, source: 'Business audit log, last 14 days (staff actions only, platform admin actions are ignored)', rule: '4 points per logged action, capped at 25 (7 or more actions).', improve: 'Check in with the administrator and run a training session so staff use the workspace weekly.' },
  { key: 'setup', name: 'Setup completeness', max: 20, source: 'The onboarding checklist (the same 12 items shown on Platform, Onboarding)', rule: 'Twelve items derived from real data: company profile, branding, modules, employees, departments, payroll, leave policies, approval flow, first approval, document template, administrator MFA and active staff. Points are the share completed times 20.', improve: 'Offer an onboarding call to finish the profile, branding and approval flow.' },
]
export const HEALTH_BANDS = [
  { label: 'Healthy', min: 70, tone: 'green', meaning: 'On track. Keep the relationship warm and look for upsell.' },
  { label: 'Watch', min: 45, tone: 'amber', meaning: 'Some signals are weak. Reach out before they become churn.' },
  { label: 'At risk', min: 0, tone: 'red', meaning: 'Likely to churn without action. Act this week.' },
] as const

const STATUS_PTS: Record<string, number> = { Active: 20, Trial: 12, 'Renewal Due': 10, 'Pending Setup': 6, 'Grace Period': 5, Suspended: 0, Expired: 0 }

export function healthOf(t: Tenant, audit: AuditEntry[]): Health {
  const limit = PLAN_LIMITS[t.plan] ?? PLAN_LIMITS.Starter
  const seatUse = t.employees / limit.seats
  const planMods = tierModules(t.plan).length || MODULE_LIST.length
  const moduleUse = Math.min(1, t.modules.length / planMods)
  const recent = audit.filter((a) => a.tenant === t.slug && a.scope === 'Business' && Date.now() - new Date(a.at).getTime() < 14 * 864e5).length
  const onb = onboardingItems(t, audit)
  const setup = onb.filter((i) => i.done).length
  const seatPts = seatUse >= 0.3 && seatUse <= 0.95 ? 15 : seatUse > 0.95 ? 10 : Math.round(seatUse / 0.3 * 15)
  const m = (k: string) => HEALTH_MODEL.find((x) => x.key === k)!
  const mk = (k: string, pts: number, note: string, why: string): HealthFactor => ({ key: k, name: m(k).name, pts, max: m(k).max, note, source: m(k).source, why, improve: m(k).improve })
  const sp = STATUS_PTS[t.status] ?? 0
  const setupPts = Math.round(setup / onb.length * 20)
  const actPts = Math.min(25, recent * 4)
  const factors: HealthFactor[] = [
    mk('status', sp, t.status, `Status is ${t.status}, which earns ${sp} of 20.`),
    mk('modules', Math.round(moduleUse * 20), `${t.modules.length} of ${planMods} modules on`, `${Math.round(moduleUse * 100)}% of plan modules are switched on.`),
    mk('seats', seatPts, `${t.employees} of ${limit.seats} seats`, seatUse > 0.95 ? 'Seats are almost full, so some headroom points are held back.' : seatUse < 0.3 ? `Only ${Math.round(seatUse * 100)}% of seats are used, below the 30% healthy floor.` : `${Math.round(seatUse * 100)}% of seats used, inside the healthy 30% to 95% band.`),
    mk('activity', actPts, `${recent} logged actions in 14 days`, recent >= 7 ? 'At or above the 7-action cap.' : `${recent} action${recent === 1 ? '' : 's'} x 4 points. ${7 - recent} more would reach the cap.`),
    mk('setup', setupPts, `${setup} of ${onb.length} setup items done`, setup === onb.length ? 'Every setup item is complete.' : `${onb.length - setup} setup item${onb.length - setup === 1 ? '' : 's'} still to do (${onb.filter((i) => !i.done).slice(0, 3).map((i) => i.label.toLowerCase()).join(', ')}).`),
  ]
  const score = factors.reduce((a, f) => a + f.pts, 0)
  const actions: string[] = []
  if (t.status === 'Grace Period' || t.status === 'Renewal Due') actions.push('Chase payment before the grace period ends')
  if (t.status === 'Pending Setup') actions.push('Offer an onboarding call')
  if (seatUse > 0.9) actions.push('Seats nearly full. Suggest an upgrade')
  if (seatUse < 0.3) actions.push('Few seats in use. Check adoption with the administrator')
  if (moduleUse < 0.5) actions.push('Under half of the modules are on. Share a module walkthrough')
  if (recent < 3) actions.push('Low activity. Reach out to the administrator')
  return { score, label: score >= HEALTH_THRESHOLDS.healthy ? 'Healthy' : score >= HEALTH_THRESHOLDS.watch ? 'Watch' : 'At risk', tone: score >= HEALTH_THRESHOLDS.healthy ? 'green' : score >= HEALTH_THRESHOLDS.watch ? 'amber' : 'red', factors, seatUse, moduleUse, actions, recent }
}
