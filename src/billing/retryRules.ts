/* Payment retry rules (pure data, no ledger imports so dunning.ts can use it safely).
 * Payment retry and recovery rules, one rule set per payment method. The card rule also drives the dunning schedule
 * used by src/platform/dunning.ts and the Collections page. The retry run is a SIMULATION: outcomes are deterministic
 * per invoice and attempt, but any recovered payment is written to the ledger like a real one. */
import { createStore } from '../platform/persist'
import { METHODS } from './ledgerStore'
import type { Method } from './ledgerStore'

export type RetryRule = {
  enabled: boolean
  /** Days after the due date at which each retry happens. */
  spacing: number[]
  /** Days overdue at which the workspace drops to the starter limits (grace). */
  downgradeAfter: number
  /** Days overdue at which the workspace is suspended. */
  suspendAfter: number
  notify: boolean
}
export type Rules = Record<Method, RetryRule>
export const DEFAULT_RULES: Rules = {
  Card: { enabled: true, spacing: [1, 3, 5, 7], downgradeAfter: 10, suspendAfter: 15, notify: true },
  'Bank transfer': { enabled: true, spacing: [3, 7, 10], downgradeAfter: 14, suspendAfter: 21, notify: true },
  'Direct debit': { enabled: true, spacing: [2, 5, 9], downgradeAfter: 12, suspendAfter: 18, notify: true },
}
/* Modelled chance that attempt n succeeds. Bank transfers rely on the customer acting, debits succeed most often early. */
export const SUCCESS_ODDS: Record<Method, number[]> = {
  Card: [0.38, 0.32, 0.26, 0.2, 0.15, 0.1],
  'Bank transfer': [0.22, 0.3, 0.24, 0.18, 0.12, 0.08],
  'Direct debit': [0.52, 0.42, 0.3, 0.2, 0.12, 0.08],
}
export const MAX_ATTEMPTS = 6

export type LogEntry = {
  id: string; invoiceId: string; number: string; tenant: string; method: Method; attempt: number; daysOverdue: number; amount: number
  outcome: 'Recovered' | 'Failed' | 'Escalated' | 'Waiting'; action?: 'Downgrade' | 'Suspend'; note: string
}
export type Run = { id: string; at: string; by: string; offset: number; applied: boolean; entries: LogEntry[]; recovered: number; attempts: number }
type RecoveryState = { rules: Rules; updatedBy: string; updatedAt: string; history: { at: string; by: string; summary: string }[]; runs: Run[]; escalations: Record<string, { action: 'Downgrade' | 'Suspend'; at: string; applied: boolean }> }

export const store = createStore<RecoveryState>('bizflow.retry-rules.v1', () => ({ rules: DEFAULT_RULES, updatedBy: 'System default', updatedAt: '2026-10-01', history: [], runs: [], escalations: {} }))
export const useRecovery = store.use
export const getRules = (): Rules => normalise(store.get().rules)
/* Persisted state from earlier shapes must never break the schedule. */
function normalise(r: Rules | undefined): Rules {
  const out = {} as Rules
  METHODS.forEach((m) => { const x = r?.[m]; out[m] = x && Array.isArray(x.spacing) ? x : DEFAULT_RULES[m] })
  return out
}

export function validateRule(r: RetryRule): string[] {
  const e: string[] = []
  if (r.spacing.length < 1 || r.spacing.length > MAX_ATTEMPTS) e.push(`Use between 1 and ${MAX_ATTEMPTS} attempts.`)
  if (r.spacing.some((d) => !Number.isFinite(d) || d < 0 || d > 60)) e.push('Each retry day must be between 0 and 60.')
  if (r.spacing.some((d, i) => i > 0 && d <= r.spacing[i - 1])) e.push('Retry days must increase from one attempt to the next.')
  const last = r.spacing[r.spacing.length - 1] ?? 0
  if (r.downgradeAfter <= last) e.push(`Downgrade must come after the last retry (day ${last}).`)
  if (r.suspendAfter <= r.downgradeAfter) e.push('Suspension must come after the downgrade.')
  if (r.suspendAfter > 90) e.push('Suspension cannot be later than day 90.')
  return e
}

export function saveRules(next: Rules, actor: string, summary: string) {
  for (const m of METHODS) { const e = validateRule(next[m]); if (e.length) return `${m}: ${e[0]}` }
  store.set((s) => ({ ...s, rules: next, updatedBy: actor, updatedAt: '2026-10-08', history: [{ at: '2026-10-08', by: actor, summary }, ...s.history].slice(0, 20) }))
  return ''
}

/* ---------- schedule that feeds dunning.ts and Collections ---------- */
export type ScheduleStep = { step: string; day: number; note: string }
export function scheduleFromRules(r: Rules): ScheduleStep[] {
  const c = r.Card; const s = c.spacing
  const at = (i: number) => s[Math.min(i, s.length - 1)]
  const others = `Bank transfer day ${r['Bank transfer'].spacing[0]}, direct debit day ${r['Direct debit'].spacing[0]}`
  return [
    { step: 'Reminder 1', day: at(0), note: `Friendly email and in-app banner; first card retry (${others})` },
    { step: 'Reminder 2', day: at(1), note: 'Retry saved card, second email' },
    { step: 'Reminder 3', day: at(2), note: 'Final notice before the downgrade' },
    { step: 'Grace ends', day: c.downgradeAfter, note: 'Limits drop to the starter level, billing banner shown' },
    { step: 'Suspend', day: c.suspendAfter, note: 'Workspace locked except billing' },
  ]
}
export const getSchedule = () => scheduleFromRules(getRules())
export const useSchedule = () => scheduleFromRules(normalise(store.use().rules))

