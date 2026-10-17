import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { pushVersion } from '../platform/versions'

export type Desk = 'officer' | 'cfo'
export type FinancePolicy = { mode: 'default' | 'custom'; officerLimit: number }
export const DEFAULT_LIMIT = 500000
export const DESK_LABEL: Record<Desk, string> = { officer: 'Finance Officer', cfo: 'CFO' }

const KEY = 'bizflow.financePolicy.v1'
const DESK_KEY = 'bizflow.financeDesk.v1'
type State = { policies: Record<string, FinancePolicy>; desk: Record<string, Desk> }
const load = (): State => {
  try { return { policies: {}, desk: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { policies: {}, desk: {} } }
}
let state = load()
const subs = new Set<() => void>()
const commit = (next: State) => { state = next; try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ } subs.forEach((f) => f()) }
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
void DESK_KEY

const base: FinancePolicy = { mode: 'default', officerLimit: DEFAULT_LIMIT }
export const policyOf = (slug: string): FinancePolicy => state.policies[slug] ?? base
export const handlerFor = (amount: number, p: FinancePolicy): Desk => (amount <= p.officerLimit ? 'officer' : 'cfo')

export function useFinancePolicy(slug: string) {
  useSyncExternalStore(sub, () => state)
  return policyOf(slug)
}

export function saveFinancePolicy(slug: string, next: FinancePolicy) {
  const prev = policyOf(slug)
  const eff = next.mode === 'default' ? { mode: 'default' as const, officerLimit: DEFAULT_LIMIT } : next
  commit({ ...state, policies: { ...state.policies, [slug]: eff } })
  pushVersion(slug, 'Finance tiers', eff.mode === 'default' ? 'BizFlow default' : `Officer up to ${eff.officerLimit}`, eff)
  recordAudit(slug, 'Finance disbursement tiers updated', `Officer up to ${prev.officerLimit}`, `Officer up to ${eff.officerLimit}${eff.mode === 'default' ? ' (default)' : ' (custom)'}`)
}

/** The desk a signed-in Finance user is working from. CFO titles default to the CFO desk. */
export function deskFor(slug: string, title: string): Desk {
  return state.desk[slug] ?? (/chief|cfo/i.test(title) ? 'cfo' : 'officer')
}
export function useDesk(slug: string, title: string): [Desk, (d: Desk) => void] {
  useSyncExternalStore(sub, () => state)
  return [deskFor(slug, title), (d) => commit({ ...state, desk: { ...state.desk, [slug]: d } })]
}
