import { recordAudit, useTenants } from '../tenant/store'
import type { Sub } from '../billing/engine'
import { daysUntil } from '../billing/engine'
import { createStore } from './persist'
import { getSchedule, useSchedule } from '../billing/retryRules'

export type Reminder = { n: 1 | 2 | 3; at: string; by: string }
const store = createStore<Record<string, Reminder[]>>('bizflow.dunning.v1', () => ({}))
export const useReminders = store.use

/** Days overdue at which each step is due. Derived from the retry rules edited on Payment recovery (card rule). */
export const SCHEDULE = getSchedule()
export { getSchedule, useSchedule }
const dayOf = (step: string) => getSchedule().find((x) => x.step === step)?.day ?? 0
export type Stage = 'Current' | 'Upcoming' | 'Reminder 1' | 'Reminder 2' | 'Reminder 3' | 'Grace' | 'Suspend'
export const overdueDays = (s: Sub) => Math.max(0, -daysUntil(s.renewsAt))
export function stageOf(s: Sub): Stage {
  if (s.status === 'Suspended' || s.status === 'Expired') return 'Suspend'
  if (s.status === 'Grace Period') return 'Grace'
  if (s.status === 'Payment Failed') return 'Reminder 2'
  if (s.status === 'Past Due') return overdueDays(s) >= dayOf('Reminder 3') ? 'Reminder 3' : overdueDays(s) >= dayOf('Reminder 2') ? 'Reminder 2' : 'Reminder 1'
  if (['Active'].includes(s.status) && daysUntil(s.renewsAt) <= 7 && daysUntil(s.renewsAt) >= 0) return 'Upcoming'
  return 'Current'
}
export const inDunning = (s: Sub) => ['Reminder 1', 'Reminder 2', 'Reminder 3', 'Grace', 'Suspend'].includes(stageOf(s)) && s.status !== 'Expired' && s.status !== 'Cancelled'

export function sendReminder(s: Sub, by: string, tenantSlug?: string) {
  const sent = store.get()[s.id] ?? []
  const n = Math.min(3, sent.length + 1) as 1 | 2 | 3
  store.set((m) => ({ ...m, [s.id]: [...(m[s.id] ?? []), { n, at: new Date().toISOString(), by }] }))
  recordAudit(tenantSlug ?? 'platform', `Dunning reminder ${n} sent`, s.status, s.company, { category: 'Finance', ref: s.id })
  return n
}
export function useTenantSlugByName() {
  const tenants = Object.values(useTenants())
  return (name: string) => tenants.find((t) => t.profile.name === name)?.slug
}
