import { useSyncExternalStore } from 'react'

/** Per-tenant persisted payroll run state. Prepared -> Under review -> Reviewed -> Approved -> Disbursed, with a rejection loop. */
export type PayrollStatus = 'under-review' | 'reviewed' | 'approved' | 'rejected' | 'disbursed'
export type PayrollNote = { t: string; a: string; x: string }
export type PayrollRun = { status: PayrollStatus; notes: PayrollNote[] }

export const PAYROLL_RUN_KEY = 'bizflow.payrollRun.v2'
const STATUSES: PayrollStatus[] = ['under-review', 'reviewed', 'approved', 'rejected', 'disbursed']
/** Segregation of duties: a run can only move forward one control step; disbursed is terminal. */
const NEXT: Record<PayrollStatus, PayrollStatus[]> = {
  'under-review': ['reviewed', 'rejected'],
  reviewed: ['approved', 'rejected'],
  approved: ['disbursed'],
  rejected: ['under-review'],
  disbursed: [],
}
export const canTransition = (from: PayrollStatus, to: PayrollStatus) => from === to || NEXT[from].includes(to)

const seed = (): PayrollRun => ({
  status: 'under-review',
  notes: [
    { t: 'Today · 09:14', a: 'Payroll team', x: 'submitted the October payroll run for review' },
    { t: 'Yesterday · 16:42', a: 'BizFlow', x: 'completed statutory and duplicate-account checks' },
  ],
})

const load = (): Record<string, PayrollRun> => {
  try {
    const raw = JSON.parse(localStorage.getItem(PAYROLL_RUN_KEY) || '{}') as Record<string, PayrollRun>
    const out: Record<string, PayrollRun> = {}
    for (const [slug, run] of Object.entries(raw)) if (run && STATUSES.includes(run.status) && Array.isArray(run.notes)) out[slug] = run
    return out
  } catch { return {} }
}
let state = load()
const subs = new Set<() => void>()
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
const commit = (next: Record<string, PayrollRun>) => {
  state = next
  try { localStorage.setItem(PAYROLL_RUN_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  subs.forEach((f) => f())
}
const cache = new Map<string, PayrollRun>()
export const runOf = (slug: string): PayrollRun => state[slug] ?? (cache.get(slug) ?? (cache.set(slug, seed()), cache.get(slug)!))

export function setPayrollStatus(slug: string, to: PayrollStatus) {
  const run = runOf(slug)
  if (!canTransition(run.status, to)) return false
  commit({ ...state, [slug]: { ...run, status: to } })
  return true
}
export function addPayrollNote(slug: string, note: PayrollNote) {
  const run = runOf(slug)
  commit({ ...state, [slug]: { ...run, notes: [note, ...run.notes].slice(0, 100) } })
}
export const usePayrollRun = (slug: string) => useSyncExternalStore(subscribe, () => runOf(slug))
