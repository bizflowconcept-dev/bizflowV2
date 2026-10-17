import { recordAudit } from '../tenant/store'
import { createStore, uid } from './persist'
import { policyFor } from './helpdeskConfig'
import type { TPriority } from './helpdeskConfig'

export { PRIORITIES, CANNED } from './helpdeskConfig'
export type { TPriority } from './helpdeskConfig'
export const STATUSES = ['New', 'Open', 'Waiting on customer', 'Resolved'] as const
export type TStatus = (typeof STATUSES)[number]
/** Default first-response hours for the Professional plan. Kept for older importers; live targets come from the SLA policy table (policyFor). */
export const SLA_HOURS: Record<TPriority, number> = { Urgent: 1, High: 4, Normal: 8, Low: 24 }
export type Msg = { id: string; at: string; by: string; text: string; kind: 'reply' | 'note' | 'system' }
export type Csat = { score: number | null; comment: string; at: string; by: string }
export type Escalation = { dept: string; reason: string; by: string; at: string; from: string }
export type Ticket = {
  id: string; slug: string; requester: string; subject: string; body: string; category: string
  priority: TPriority; status: TStatus; assignee: string; createdAt: string; respondedAt?: string; resolvedAt?: string
  messages: Msg[]; session?: { at: string; by: string; reason: string }
  /** Plan at the time the ticket was logged; selects the SLA policy row. */
  plan?: string
  /** Resolution clock pause bookkeeping (Waiting on customer). */
  pausedAt?: string; pausedMs?: number
  escalatedTo?: string; escalation?: Escalation
  /** score null means the customer gave no response. */
  csat?: Csat
}
export const CATEGORIES = ['Billing & access', 'Payroll', 'People import', 'Approvals', 'Sign & documents', 'Bug report', 'How-to']
const ago = (h: number) => new Date(Date.now() - h * 36e5).toISOString()
const m = (h: number, by: string, text: string, kind: Msg['kind'] = 'reply'): Msg => ({ id: uid('M'), at: ago(h), by, text, kind })
/** Resolved history so the KPI and trend charts are populated: [days ago, priority, first response h, resolution h, CSAT or null for no response]. */
const HISTORY: [number, TPriority, number, number, number | null][] = [
  [3, 'Normal', 3, 30, 5], [5, 'High', 2.5, 10, 3], [8, 'Urgent', 0.4, 3, 5], [10, 'Low', 8, 60, null], [13, 'Normal', 5, 70, 2], [16, 'High', 1.5, 9, 4],
  [19, 'Normal', 3, 40, 5], [22, 'Urgent', 0.7, 6, 2], [26, 'Low', 10, 90, 4], [29, 'Normal', 2, 20, 5], [33, 'High', 1, 8, 4], [38, 'Normal', 4.5, 50, 3],
  [42, 'Low', 6, 40, null], [47, 'High', 1.8, 11, 4], [52, 'Normal', 3.5, 36, 4], [56, 'Urgent', 0.3, 3.5, 5],
]
const SUBJECTS = ['Cannot sign in after password reset', 'Payslip PDF missing logo', 'Leave balance mismatch', 'Invoice download fails', 'Role permissions not applying', 'Bulk import timeout']
const history = (): Ticket[] => HISTORY.map(([d, priority, f, r, c], i) => {
  const created = Date.now() - d * 864e5
  const at = (h: number) => new Date(created + h * 36e5).toISOString()
  return {
    id: `TK-0${901 + i}`, slug: 'etranzact', requester: ['Chinedu Eze', 'Nneka Okafor', 'Morenike Adebayo'][i % 3], subject: SUBJECTS[i % SUBJECTS.length], body: 'Reported by the company administrator.', category: CATEGORIES[i % CATEGORIES.length],
    priority, status: 'Resolved', assignee: ['Dayo Martins', 'Seun Adeyemi'][i % 2], plan: 'Enterprise', createdAt: at(0), respondedAt: at(f), resolvedAt: at(r),
    messages: [{ id: uid('M'), at: at(f), by: 'Dayo Martins', text: 'We are on it.', kind: 'reply' }],
    csat: c === null ? { score: null, comment: '', at: at(r), by: 'Dayo Martins' } : { score: c, comment: c >= 4 ? 'Quick and helpful.' : c === 3 ? 'Fixed, but it took a while.' : 'Slow to get an answer.', at: at(r + 2), by: 'Customer survey' },
  }
})
const seed = (): Ticket[] => [
  { id: 'TK-1042', slug: 'etranzact', plan: 'Enterprise', requester: 'Chinedu Eze', subject: 'PAYE schedule export shows wrong band', body: 'The October PAYE export puts one employee in the previous tax band.', category: 'Payroll', priority: 'High', status: 'Open', assignee: 'Dayo Martins', createdAt: ago(3), respondedAt: ago(2.5), messages: [m(2.5, 'Dayo Martins', 'Looking at the tax table now.'), m(2.4, 'Dayo Martins', 'Employee was promoted mid-month, checking proration.', 'note')] },
  { id: 'TK-1040', slug: 'etranzact', plan: 'Enterprise', requester: 'Morenike Adebayo', subject: 'Approval flow skips Compliance on purchases', body: 'Purchase requests above 5m go straight from Audit to MD.', category: 'Approvals', priority: 'Urgent', status: 'New', assignee: '', createdAt: ago(0.2), messages: [] },
  { id: 'TK-1039', slug: 'etranzact', plan: 'Enterprise', requester: 'Nneka Okafor', subject: 'Import 127 employees from CSV', body: 'Import stops at row 84.', category: 'People import', priority: 'Normal', status: 'Waiting on customer', assignee: 'Seun Adeyemi', createdAt: ago(20), respondedAt: ago(19), pausedAt: ago(19), messages: [m(19, 'Seun Adeyemi', 'Row 84 has a duplicate staff ID. Could you send a corrected file?')] },
  { id: 'TK-1037', slug: 'etranzact', plan: 'Enterprise', requester: 'Chinedu Eze', subject: 'How do we schedule recurring payroll runs?', body: 'We want the run to start automatically on the 25th.', category: 'How-to', priority: 'Low', status: 'Open', assignee: 'Dayo Martins', createdAt: ago(40), respondedAt: ago(38), messages: [m(38, 'Dayo Martins', 'Sharing the scheduling guide now.')] },
  ...history(),
]
const store = createStore<Ticket[]>('bizflow.helpdesk.v1', seed)
export const useTickets = store.use

/* ---------- SLA engine ----------
   Two clocks per ticket, both from the policy for its plan and priority (SLA policies tab):
   - First response: runs from creation until the first PUBLIC reply. Internal notes never stop it. It never pauses.
   - Resolution: runs from creation until Resolved. It PAUSES while the status is "Waiting on customer" (time spent waiting on the customer does not count against us).
   A live ticket is "at risk" when any running clock has used more than 75% of its window or has under 1 hour left. */
export const AT_RISK_PCT = 0.75
export type SlaPart = { label: string; breached: boolean; warn: boolean; met: boolean; done: boolean; pct: number; leftMs: number; paused: boolean; targetH: number }
export type Sla = { label: string; breached: boolean; warn: boolean; met: boolean; first: SlaPart; resolve: SlaPart; state: 'breached' | 'at-risk' | 'ok' | 'done'; paused: boolean }
const fmtDur = (ms: number) => { const mins = Math.round(Math.abs(ms) / 6e4); return mins >= 1440 ? `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h` : mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m` }
export const fmtHours = (h: number) => (h < 1 ? `${Math.round(h * 60)}m` : h >= 48 && h % 24 === 0 ? `${h / 24}d` : `${h}h`)
const part = (windowMs: number, elapsed: number, done: boolean, paused: boolean, targetH: number, noun: string): SlaPart => {
  const left = windowMs - elapsed, pct = windowMs ? elapsed / windowMs : 0
  const breached = left < 0
  const label = done ? (breached ? `${noun} ${fmtDur(left)} late` : `${noun} on time`) : breached ? `${noun} breached by ${fmtDur(left)}` : paused ? `${noun} paused, ${fmtDur(left)} left` : `${fmtDur(left)} left`
  return { label, breached, warn: !done && !breached && !paused && (pct > AT_RISK_PCT || left < 36e5), met: done && !breached, done, pct, leftMs: left, paused, targetH }
}
export const pausedMsOf = (t: Ticket, now: number) => (t.pausedMs ?? 0) + (t.pausedAt ? Math.max(0, (t.resolvedAt ? new Date(t.resolvedAt).getTime() : now) - new Date(t.pausedAt).getTime()) : 0)
export function slaOf(t: Ticket, now = Date.now(), plan = t.plan): Sla {
  const pol = policyFor(plan, t.priority)
  const c = new Date(t.createdAt).getTime()
  const live = t.status !== 'Resolved'
  const fDone = !!t.respondedAt || (!live && !!t.resolvedAt)
  const fEnd = t.respondedAt ? new Date(t.respondedAt).getTime() : t.resolvedAt ? new Date(t.resolvedAt).getTime() : now
  const first = part(pol.first * 36e5, fEnd - c, fDone, false, pol.first, 'First response')
  const rDone = !live && !!t.resolvedAt
  const rEnd = rDone ? new Date(t.resolvedAt!).getTime() : now
  const paused = live && t.status === 'Waiting on customer'
  const resolve = part(pol.resolve * 36e5, rEnd - c - pausedMsOf(t, now), rDone, paused, pol.resolve, 'Resolution')
  const pick = [first, resolve].filter((p) => !p.done)
  const shown = pick.find((p) => p.breached) ?? pick.sort((a, b) => a.leftMs - b.leftMs)[0] ?? resolve
  const state = !live ? 'done' : first.breached || resolve.breached ? 'breached' : first.warn || resolve.warn ? 'at-risk' : 'ok'
  return { label: shown.label, breached: first.breached || resolve.breached, warn: first.warn || resolve.warn, met: first.met && resolve.met, first, resolve, state, paused }
}
export const dueAt = (t: Ticket) => new Date(t.createdAt).getTime() + policyFor(t.plan, t.priority).first * 36e5

/* ---------- KPIs and weekly trends ---------- */
const weekStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime() }
export type WeekRow = { m: string; breach: number; csat: number | null; tickets: number }
export function helpdeskKpis(tickets: Ticket[], now = Date.now(), weeks = 8) {
  const withFirst = tickets.filter((t) => t.respondedAt)
  const avgFirstMin = withFirst.length ? withFirst.reduce((n, t) => n + (new Date(t.respondedAt!).getTime() - new Date(t.createdAt).getTime()) / 6e4, 0) / withFirst.length : 0
  const done = tickets.filter((t) => t.status === 'Resolved' && t.resolvedAt)
  const avgResolveH = done.length ? done.reduce((n, t) => n + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime() - pausedMsOf(t, now)) / 36e5, 0) / done.length : 0
  const breachedN = tickets.filter((t) => slaOf(t, now).breached).length
  const rated = tickets.filter((t) => t.csat && t.csat.score !== null)
  const csatAvg = rated.length ? rated.reduce((n, t) => n + t.csat!.score!, 0) / rated.length : 0
  const base = weekStart(now)
  const rows: WeekRow[] = Array.from({ length: weeks }, (_, i) => {
    const s = base - (weeks - 1 - i) * 7 * 864e5, e = s + 7 * 864e5
    const created = tickets.filter((t) => { const c = new Date(t.createdAt).getTime(); return c >= s && c < e })
    const scored = tickets.filter((t) => t.csat?.score != null && t.resolvedAt && new Date(t.resolvedAt).getTime() >= s && new Date(t.resolvedAt).getTime() < e)
    return {
      m: new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), tickets: created.length,
      breach: created.length ? Math.round((created.filter((t) => slaOf(t, now).breached).length / created.length) * 100) : 0,
      csat: scored.length ? Math.round((scored.reduce((n, t) => n + t.csat!.score!, 0) / scored.length) * 10) / 10 : null,
    }
  })
  return { avgFirstMin, avgResolveH, breachRate: tickets.length ? Math.round((breachedN / tickets.length) * 100) : 0, breachedN, csatAvg, csatCount: rated.length, noResponse: tickets.filter((t) => { const c = csatState(t, now); return c === 'declined' || c === 'lapsed' }).length, awaitingRating: tickets.filter((t) => csatState(t, now) === 'awaiting').length, weekly: rows }
}

const patch = (id: string, fn: (t: Ticket) => Partial<Ticket>) => store.set((l) => l.map((t) => (t.id === id ? { ...t, ...fn(t) } : t)))
const get = (id: string) => store.get().find((t) => t.id === id)!
const sys = (text: string, by: string): Msg => ({ id: uid('M'), at: new Date().toISOString(), by, text, kind: 'system' })

/** Status transition with resolution-clock pause bookkeeping. */
function moveTo(x: Ticket, status: TStatus): Partial<Ticket> {
  const nowIso = new Date().toISOString()
  const wasPaused = x.status === 'Waiting on customer' && !!x.pausedAt
  const closed = wasPaused && status !== 'Waiting on customer' ? (x.pausedMs ?? 0) + (Date.now() - new Date(x.pausedAt!).getTime()) : x.pausedMs
  return {
    status,
    pausedAt: status === 'Waiting on customer' ? (x.pausedAt && wasPaused ? x.pausedAt : nowIso) : undefined,
    pausedMs: closed,
    resolvedAt: status === 'Resolved' ? nowIso : undefined,
  }
}

export function createTicket(input: Pick<Ticket, 'slug' | 'requester' | 'subject' | 'body' | 'category' | 'priority'> & { plan?: string }, by: string) {
  const n = Math.max(1000, ...store.get().map((t) => Number(t.id.slice(3)) || 0)) + 1
  const t: Ticket = { ...input, id: `TK-${n}`, status: 'New', assignee: '', createdAt: new Date().toISOString(), messages: [sys('Ticket logged by platform support', by)] }
  store.set((l) => [t, ...l])
  recordAudit(t.slug, 'Support ticket created', undefined, `${t.id} ${t.subject}`, { category: 'Support', ref: t.id })
  return t
}
export function assignTicket(id: string, who: string, by: string) {
  const t = get(id); patch(id, (x) => ({ assignee: who, ...(x.status === 'New' ? moveTo(x, 'Open') : {}), messages: [...x.messages, sys(`Assigned to ${who || 'nobody'}`, by)] }))
  recordAudit(t.slug, 'Support ticket assigned', t.assignee || 'Unassigned', who || 'Unassigned', { category: 'Support', ref: id })
}
export function setTicketStatus(id: string, status: TStatus, by: string) {
  const t = get(id)
  patch(id, (x) => ({ ...moveTo(x, status), messages: [...x.messages, sys(`Status changed to ${status}`, by)] }))
  recordAudit(t.slug, 'Support ticket status changed', t.status, status, { category: 'Support', ref: id })
}
/** Resolve flow. The agent never enters a CSAT score: the company is asked to rate the support from its own inbox (see rateTicket). */
export function resolveTicket(id: string, by: string) {
  const t = get(id)
  patch(id, (x) => ({ ...moveTo(x, 'Resolved'), csat: undefined, messages: [...x.messages, sys('Resolved. The company has been asked to rate this support from its inbox', by)] }))
  recordAudit(t.slug, 'Support ticket status changed', t.status, 'Resolved', { category: 'Support', ref: id })
}
/** A resolved ticket with no rating after this many days counts as "no response". */
export const CSAT_WINDOW_DAYS = 7
export type CsatState = 'rated' | 'declined' | 'awaiting' | 'lapsed' | 'none'
export function csatState(t: Ticket, now = Date.now()): CsatState {
  if (t.csat) return t.csat.score === null ? 'declined' : 'rated'
  if (t.status !== 'Resolved') return 'none'
  return t.resolvedAt && now - new Date(t.resolvedAt).getTime() > CSAT_WINDOW_DAYS * 864e5 ? 'lapsed' : 'awaiting'
}
export const canRate = (t: Ticket) => t.status === 'Resolved' && !t.csat
/** Captured by the company from its own inbox: "Rate this support". score null = the company declined to rate. */
export function rateTicket(id: string, score: number | null, comment: string, by: string): string | null {
  const t = store.get().find((x) => x.id === id)
  if (!t) return 'This ticket no longer exists.'
  if (!canRate(t)) return t.status !== 'Resolved' ? 'You can rate support once the ticket is resolved.' : 'This ticket has already been rated.'
  if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) return 'Choose a rating from 1 to 5.'
  patch(id, (x) => ({ csat: { score, comment: comment.trim().slice(0, 500), at: new Date().toISOString(), by: `${by} (company)` }, messages: [...x.messages, sys(score === null ? 'The company chose not to rate this support' : `The company rated this support ${score}/5`, by)] }))
  recordAudit(t.slug, score === null ? 'Support CSAT skipped' : 'Support CSAT recorded', undefined, score === null ? 'No response' : `${score}/5`, { category: 'Support', ref: id })
  return null
}
export function setTicketPriority(id: string, priority: TPriority, by: string) {
  const t = get(id); patch(id, (x) => ({ priority, messages: [...x.messages, sys(`Priority changed to ${priority}`, by)] }))
  recordAudit(t.slug, 'Support ticket priority changed', t.priority, priority, { category: 'Support', ref: id })
}
/** A public reply stops the first-response clock and moves the ticket to Waiting on customer. An internal note changes neither clock nor status. */
export function addMessage(id: string, kind: 'reply' | 'note', text: string, by: string) {
  const t = get(id)
  patch(id, (x) => ({
    ...(kind === 'reply' && x.status !== 'Resolved' ? moveTo(x, 'Waiting on customer') : {}),
    respondedAt: kind === 'reply' && !x.respondedAt ? new Date().toISOString() : x.respondedAt,
    messages: [...x.messages, { id: uid('M'), at: new Date().toISOString(), by, text, kind }],
  }))
  if (kind === 'reply') recordAudit(t.slug, 'Support reply sent', undefined, id, { category: 'Support', ref: id })
  else recordAudit(t.slug, 'Support internal note added', undefined, id, { category: 'Support', ref: id })
}
export function escalateTicket(id: string, dept: string, reason: string, by: string, assignTo?: string) {
  const t = get(id)
  patch(id, (x) => ({
    escalatedTo: dept, escalation: { dept, reason, by, at: new Date().toISOString(), from: x.escalation?.from ?? 'Customer Support' },
    ...(assignTo ? { assignee: assignTo } : {}),
    messages: [...x.messages, sys(`Escalated to ${dept}${assignTo ? ` (assigned to ${assignTo})` : ''}: ${reason}`, by)],
  }))
  recordAudit(t.slug, 'Support ticket escalated', t.escalatedTo ?? 'Customer Support', dept, { category: 'Support', ref: id })
}
export function deEscalateTicket(id: string, by: string) {
  const t = get(id)
  patch(id, (x) => ({ escalatedTo: undefined, escalation: undefined, messages: [...x.messages, sys(`De-escalated from ${x.escalatedTo} back to Customer Support`, by)] }))
  recordAudit(t.slug, 'Support ticket de-escalated', t.escalatedTo, 'Customer Support', { category: 'Support', ref: id })
}
export function linkSession(id: string, reason: string, by: string) {
  patch(id, (x) => ({ session: { at: new Date().toISOString(), by, reason }, messages: [...x.messages, sys(`Support session opened: ${reason}`, by)] }))
}
