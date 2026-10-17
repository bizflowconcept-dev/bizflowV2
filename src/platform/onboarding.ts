import { useMemo } from 'react'
import { recordAudit, useAudit, useTenants } from '../tenant/store'
import type { AuditEntry, Tenant } from '../tenant/store'
import { postNotification } from '../notifications/store'
import { ADMIN_ROLES } from '../pages/admin/roles'
import { GROWTH } from '../data/platform'
import { onboardingItems, onboardingPctOf } from './onboardingCore'
import type { OnbItem } from './onboardingCore'
import { createStore, uid } from './persist'
import { logSuccessAction } from './success'

export type { OnbItem }
export type Stage = 'Not started' | 'In progress' | 'Stalled' | 'Complete'
export const STAGES: Stage[] = ['Not started', 'In progress', 'Stalled', 'Complete']
export const STAGE_TONE: Record<Stage, string> = { 'Not started': 'gray', 'In progress': 'blue', Stalled: 'red', Complete: 'green' }
export const STAGE_RULES: Record<Stage, string> = {
  'Not started': 'No checklist item done yet and the workspace is under 14 days old.',
  'In progress': 'Some items done and the company has been active in the last 7 days.',
  Stalled: 'Not complete, and no business activity for 7 days (or nothing done after 14 days).',
  Complete: 'Every checklist item is done.',
}
/** Target for a healthy tenant: first real work inside a week. */
export const TTFV_TARGET_DAYS = 7
/** Actions that count as "first value": real work done in the workspace, not configuration. */
const VALUE_CATEGORIES = ['Requests', 'Finance', 'People', 'Leave', 'Tasks', 'Documents', 'Customers', 'Attendance']
const DAY = 864e5

/* Customer-success owners are platform staff who can handle support. */
export const CS_OWNERS = Object.values(ADMIN_ROLES).filter((r) => (r.can as readonly string[]).includes('support')).map((r) => r.user)
export const OWNER_ITEM_ROUTE: Record<string, string> = {
  profile: '/admin/business/settings/profile', branding: '/admin/business/settings/branding', modules: '/admin/business/modules', employees: '/admin/business/people',
  departments: '/admin/business/organization', payroll: '/admin/business/payroll', leave: '/admin/business/settings/employee-rules', approvals: '/admin/business/settings/approvals',
  'first-approval': '/admin/business/approvals', templates: '/admin/business/settings/document-templates', mfa: '/admin/business/settings', active: '/admin/business/dashboard',
}

export type Nudge = { id: string; slug: string; at: string; by: string; items: string[]; note: string }
type State = { owners: Record<string, string>; nudges: Nudge[] }
const store = createStore<State>('bizflow.onboarding.v1', () => ({ owners: {}, nudges: [] }))
export const useOnboardingState = store.use

/** Stable default owner so every company has someone accountable from day one. */
export const defaultOwner = (slug: string) => { let x = 0; for (const c of slug) x = (x * 31 + c.charCodeAt(0)) % 997; return CS_OWNERS[x % CS_OWNERS.length] }
export const ownerOf = (slug: string, s = store.get()) => s.owners[slug] ?? defaultOwner(slug)

export type OnbRow = {
  t: Tenant; items: OnbItem[]; done: number; pct: number; stage: Stage; owner: string; ownerSet: boolean
  ageDays: number; lastActivityDays: number | null; firstValueAt: string | null; ttfvDays: number | null
  nextStep: OnbItem | null; lastNudge: Nudge | null
}

export function onboardingRow(t: Tenant, audit: AuditEntry[], s: State): OnbRow {
  const items = onboardingItems(t, audit)
  const done = items.filter((i) => i.done).length
  const pct = onboardingPctOf(items)
  const log = audit.filter((a) => a.tenant === t.slug && a.scope === 'Business')
  const last = log.reduce<string | null>((m, a) => (!m || a.at > m ? a.at : m), null)
  const lastActivityDays = last ? Math.floor((Date.now() - new Date(last).getTime()) / DAY) : null
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(t.created).getTime()) / DAY))
  const value = log.filter((a) => a.category && VALUE_CATEGORIES.includes(a.category)).reduce<string | null>((m, a) => (!m || a.at < m ? a.at : m), null)
  const ttfvDays = value ? Math.max(0, Math.round((new Date(value).getTime() - new Date(t.created).getTime()) / DAY)) : null
  const stage: Stage = done === items.length ? 'Complete'
    : done === 0 ? (ageDays > 14 ? 'Stalled' : 'Not started')
      : (lastActivityDays === null ? ageDays > 7 : lastActivityDays > 7) ? 'Stalled' : 'In progress'
  const mineNudges = s.nudges.filter((n) => n.slug === t.slug)
  return { t, items, done, pct, stage, owner: ownerOf(t.slug, s), ownerSet: !!s.owners[t.slug], ageDays, lastActivityDays, firstValueAt: value, ttfvDays, nextStep: items.find((i) => !i.done) ?? null, lastNudge: mineNudges[0] ?? null }
}

export function useOnboarding() {
  const tenants = useTenants()
  const audit = useAudit()
  const s = store.use()
  const rows = useMemo(() => Object.values(tenants).map((t) => onboardingRow(t, audit, s)), [tenants, audit, s])
  return { rows, state: s }
}

/* ---------- Actions ---------- */
export function assignOwner(slug: string, owner: string, by: string) {
  const prev = ownerOf(slug)
  store.set((s) => ({ ...s, owners: { ...s.owners, [slug]: owner } }))
  recordAudit(slug, 'Onboarding owner assigned', prev, owner, { category: 'Support', actor: by })
}

export const NUDGE_COOLDOWN_HOURS = 24
export const nudgeBlockedFor = (slug: string, now = Date.now()) => {
  const last = store.get().nudges.find((n) => n.slug === slug)
  return last && now - new Date(last.at).getTime() < NUDGE_COOLDOWN_HOURS * 36e5 ? last : null
}
/** Creates an in-app notification for the tenant (visible in its inbox), logs a customer-success action and an audit entry. */
export function sendNudge(slug: string, itemKeys: string[], note: string, by: string, items: OnbItem[]): { ok: boolean; error?: string } {
  if (!itemKeys.length) return { ok: false, error: 'Pick at least one checklist item.' }
  const blocked = nudgeBlockedFor(slug)
  if (blocked) return { ok: false, error: `A nudge was already sent ${new Date(blocked.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Wait ${NUDGE_COOLDOWN_HOURS} hours between nudges.` }
  const picked = items.filter((i) => itemKeys.includes(i.key))
  const id = uid('NG')
  const first = picked[0]
  postNotification(slug, {
    id: `onb-nudge:${id}`, type: 'System', urgent: false, to: OWNER_ITEM_ROUTE[first.key] ?? '/admin/business/dashboard',
    title: `Finish setting up your workspace (${picked.length} step${picked.length === 1 ? '' : 's'} left)`,
    body: `${note ? note + ' ' : ''}Next: ${picked.map((p) => p.label).join(', ')}. From your BizFlow customer success team (${by}).`,
  })
  store.set((s) => ({ ...s, nudges: [{ id, slug, at: new Date().toISOString(), by, items: itemKeys, note }, ...s.nudges].slice(0, 300) }))
  logSuccessAction(slug, 'Onboarding nudge sent', picked.map((p) => p.label).join(', '), by)
  recordAudit(slug, 'Onboarding nudge sent', undefined, picked.map((p) => p.label).join(', '), { category: 'Support', actor: by })
  return { ok: true }
}

/* ---------- Cohorts: time to first value ---------- */
/** Platform history before per-tenant tracking began. Signups per month are the real GROWTH series; days and completion are benchmarks. */
const HISTORY_TTFV = [14, 13, 12, 12, 11, 10, 10, 9, 9, 8, 8, 7]
const HISTORY_COMPLETE = [38, 41, 44, 47, 50, 54, 57, 60, 62, 66, 68, 72]
export type Cohort = { m: string; signups: number; avgDays: number | null; completePct: number; live: number; source: 'Benchmark' | 'Measured' }
export function cohorts(rows: OnbRow[]): Cohort[] {
  const out: Cohort[] = GROWTH.map((g, i) => ({ m: g.m, signups: g.new, avgDays: HISTORY_TTFV[i], completePct: HISTORY_COMPLETE[i], live: 0, source: 'Benchmark' as const }))
  const label = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' })
  const now = new Date()
  const cur = out[out.length - 1]
  const recent = rows.filter((r) => now.getTime() - new Date(r.t.created).getTime() < 365 * DAY)
  recent.forEach((r) => {
    const m = label(new Date(r.t.created))
    const c = out.find((x) => x.m === m)
    if (c) c.live += 1
  })
  /* Overlay measured values for the current month when live tenants exist. */
  const measured = rows.filter((r) => r.ttfvDays !== null && r.ageDays <= 90)
  if (measured.length) { cur.avgDays = Math.round(measured.reduce((n, r) => n + (r.ttfvDays ?? 0), 0) / measured.length); cur.source = 'Measured' }
  const young = rows.filter((r) => r.ageDays <= 90)
  if (young.length) cur.completePct = Math.round(young.reduce((n, r) => n + r.pct, 0) / young.length)
  return out
}
