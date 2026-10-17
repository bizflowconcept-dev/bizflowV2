import { recordAudit } from '../tenant/store'
import { createStore, uid } from './persist'

/* ---------- SLA policies: first-response and resolution hours per plan x priority ---------- */
export const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'] as const
export type TPriority = (typeof PRIORITIES)[number]
export const SLA_PLANS = ['Starter', 'Professional', 'Enterprise'] as const
export type Policy = { first: number; resolve: number }
export type PolicyTable = Record<string, Record<TPriority, Policy>>
const row = (f: number[], r: number[]): Record<TPriority, Policy> => ({ Urgent: { first: f[0], resolve: r[0] }, High: { first: f[1], resolve: r[1] }, Normal: { first: f[2], resolve: r[2] }, Low: { first: f[3], resolve: r[3] } })
export const DEFAULT_POLICIES = (): PolicyTable => ({
  Starter: row([2, 8, 24, 48], [24, 72, 120, 240]),
  Professional: row([1, 4, 8, 24], [8, 24, 72, 168]),
  Enterprise: row([0.5, 2, 4, 12], [4, 12, 48, 120]),
})
const policies = createStore<PolicyTable>('bizflow.helpdesk.sla.v1', DEFAULT_POLICIES)
export const usePolicies = policies.use
export const policyFor = (plan: string | undefined, p: TPriority): Policy => {
  const t = policies.get()
  return (t[plan ?? ''] ?? t.Professional ?? DEFAULT_POLICIES().Professional)[p]
}
/** Saves the whole table and writes one audit line per changed cell. */
export function savePolicies(next: PolicyTable, by: string) {
  const prev = policies.get()
  for (const plan of Object.keys(next)) for (const p of PRIORITIES) {
    const a = prev[plan]?.[p], b = next[plan][p]
    if (!a || a.first !== b.first || a.resolve !== b.resolve) recordAudit('platform', `SLA policy changed: ${plan} ${p}`, a ? `${a.first}h / ${a.resolve}h` : undefined, `${b.first}h / ${b.resolve}h`, { category: 'Settings', actor: by, ref: `${plan}:${p}` })
  }
  policies.set(next)
}
export function resetPolicies(by: string) { savePolicies(DEFAULT_POLICIES(), by) }

/* ---------- Canned replies with merge fields ---------- */
export type Canned = { id: string; label: string; text: string }
export const CANNED: { label: string; text: string }[] = [
  { label: 'Acknowledge', text: 'Thanks for getting in touch. We have your request and an agent is looking into it now. We will update you within the hour.' },
  { label: 'Need more details', text: 'To investigate this we need a few more details: the exact steps you took, the time it happened and a screenshot if you can. Reply here and we will pick it straight back up.' },
  { label: 'Payment confirmed', text: 'We have confirmed your payment and your workspace has been updated. Please refresh and sign in again. Tell us if anything still looks wrong.' },
  { label: 'Support session request', text: 'To resolve this faster we would like to join your workspace. Your company administrator can approve a time-limited support session, and everything we do is logged in your audit trail.' },
  { label: 'Resolved', text: 'This is now resolved. We are closing the ticket, but you can reply at any time to reopen it.' },
]
export const MERGE_FIELDS = ['customer_name', 'company', 'ticket_id', 'agent', 'plan'] as const
export type MergeCtx = Record<(typeof MERGE_FIELDS)[number], string>
const canned = createStore<Canned[]>('bizflow.helpdesk.canned.v1', () => [
  ...CANNED.map((c) => ({ id: uid('CR'), label: c.label, text: c.text })),
  { id: uid('CR'), label: 'Personal greeting', text: 'Hi {{customer_name}}, this is {{agent}} from BizFlow support. I am now handling {{ticket_id}} for {{company}} and will keep you posted.' },
  { id: uid('CR'), label: 'Plan entitlement check', text: 'Hi {{customer_name}}, I have checked {{company}} on the {{plan}} plan and confirmed what is included. Let me know if you would like to review upgrade options.' },
])
export const useCanned = canned.use
export function renderCanned(text: string, ctx: MergeCtx) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, k: string) => (k in ctx ? ctx[k as keyof MergeCtx] || all : all))
}
export function saveCanned(c: { id?: string; label: string; text: string }, by: string) {
  const label = c.label.trim(), text = c.text.trim()
  if (c.id) canned.set((l) => l.map((x) => (x.id === c.id ? { ...x, label, text } : x)))
  else canned.set((l) => [...l, { id: uid('CR'), label, text }])
  recordAudit('platform', c.id ? 'Canned reply edited' : 'Canned reply created', undefined, label, { category: 'Support', actor: by })
}
export function deleteCanned(id: string, by: string) {
  const c = canned.get().find((x) => x.id === id)
  canned.set((l) => l.filter((x) => x.id !== id))
  if (c) recordAudit('platform', 'Canned reply deleted', c.label, undefined, { category: 'Support', actor: by })
}
