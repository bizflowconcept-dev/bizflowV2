import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { pushVersion } from '../platform/versions'

export type Step = 'Manager' | 'Audit' | 'Compliance' | 'HR' | 'Legal' | 'MD'
export type FlowRule = { id: string; type: string; minAmount: number; steps: Step[]; placement: 'before-audit' | 'after-audit' }
export type FlowPolicy = { rules: FlowRule[] }

export const OPTIONAL_STEPS: { id: Exclude<Step, 'Manager' | 'Audit' | 'MD'>; label: string; desc: string }[] = [
  { id: 'Compliance', label: 'Compliance', desc: 'Regulatory and policy checks' },
  { id: 'HR', label: 'HR', desc: 'People and policy impact' },
  { id: 'Legal', label: 'Legal', desc: 'Contracts and legal exposure' },
]
export const REQUEST_TYPES = ['Any', 'Expense', 'Purchase', 'Salary Advance', 'Vehicle', 'Training', 'Settlement', 'Asset', 'Leave']
export const STEP_ROLES: Record<Step, string[]> = {
  Manager: ['manager', 'operations', 'bdmanager', 'hr', 'sales', 'admin', 'md'],
  Audit: ['auditor'],
  Compliance: ['compliance'],
  HR: ['hr'],
  Legal: ['compliance'],
  MD: ['md'],
}
export const STEP_OWNER: Record<Step, string> = { Manager: 'Manager', Audit: 'Audit', Compliance: 'Compliance', HR: 'HR', Legal: 'Legal / Compliance', MD: 'MD' }

const KEY = 'bizflow.approvalFlow.v1'
type State = Record<string, FlowPolicy>
const load = (): State => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
let state = load()
const subs = new Set<() => void>()
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

const PRESETS: Record<string, FlowPolicy> = {
  etranzact: { rules: [
    { id: 'p1', type: 'Settlement', minAmount: 0, steps: ['Compliance'], placement: 'after-audit' },
    { id: 'p2', type: 'Purchase', minAmount: 2000000, steps: ['Compliance'], placement: 'after-audit' },
    { id: 'p3', type: 'Any', minAmount: 10000000, steps: ['Compliance', 'Legal'], placement: 'after-audit' },
  ] },
}
export const policyOf = (slug: string): FlowPolicy => state[slug] ?? PRESETS[slug] ?? { rules: [] }
export function useFlowPolicy(slug: string) {
  useSyncExternalStore(sub, () => state)
  return policyOf(slug)
}
export function saveFlowPolicy(slug: string, next: FlowPolicy) {
  const prev = policyOf(slug)
  state = { ...state, [slug]: next }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
  subs.forEach((f) => f())
  pushVersion(slug, 'Approval flow', `${next.rules.length} extra rule(s)`, next)
  recordAudit(slug, 'Approval flow updated', `${prev.rules.length} extra rule(s)`, `${next.rules.length} extra rule(s)`)
}

/** Manager first, Audit always, company steps, then the MD (money requests only). Disbursement is outside the chain. */
export function chainFor(req: { type: string; amount: number }, p: FlowPolicy): Step[] {
  const hit = p.rules.filter((r) => (r.type === 'Any' || r.type === req.type) && req.amount >= r.minAmount)
  const pick = (placement: FlowRule['placement']) => [...new Set(hit.filter((r) => r.placement === placement).flatMap((r) => r.steps))]
  const before = pick('before-audit')
  const after = pick('after-audit').filter((s) => !before.includes(s))
  return ['Manager', ...before, 'Audit', ...after, ...(req.amount > 0 ? ['MD' as Step] : [])]
}
