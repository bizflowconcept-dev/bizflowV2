import { anonymiseTenant, recordAudit, slugTaken } from '../tenant/store'
import { createStore } from './persist'

/* ---------- Tenant offboarding ----------
   Requested -> Retention (save attempt) -> Approved by a second platform admin -> Grace (read-only) -> Export ready ->
   Deletion scheduled -> Deleted (tombstone only). Reinstating is possible at any point before Deleted.
   Everything is written to the audit trail. The workspace is read-only from Grace until it is deleted or reinstated. */

export const DAY = 864e5
export const DEMO_SLUG = 'etranzact'
export const REASONS = ['Price or budget', 'Missing features', 'Switched to a competitor', 'Low adoption or usage', 'Business closing or merging', 'Poor support experience', 'Data or compliance concerns', 'Non-payment or contract end', 'Other'] as const
export type Reason = (typeof REASONS)[number]
export const OFFERS = ['20% off for 6 months', 'Pause the subscription for 60 days', 'Downgrade to a smaller plan', 'Free onboarding and training session', 'Dedicated success manager for 90 days', 'Custom offer'] as const
export type OffState = 'Requested' | 'Retention' | 'Grace' | 'Export ready' | 'Deletion scheduled' | 'Deleted' | 'Saved' | 'Reinstated' | 'Withdrawn'
export const STAGES = ['Requested', 'Retention', 'Approved', 'Grace', 'Export', 'Deletion scheduled', 'Deleted'] as const
export const OPEN_STATES: OffState[] = ['Requested', 'Retention']
export const READONLY_STATES: OffState[] = ['Grace', 'Export ready', 'Deletion scheduled']
export const LIVE_STATES: OffState[] = [...OPEN_STATES, ...READONLY_STATES]
export const REVERSIBLE: OffState[] = LIVE_STATES

export type Entry = { at: string; by: string; text: string }
export type ExportFile = { name: string; rows: number; bytes: number; sha256: string }
export type Tombstone = { legalName: string; cac: string; plan: string; joined: string; closedAt: string; lastInvoiceRef: string; deletionRef: string; invoicesRetainUntil: string; auditRetainUntil: string; purged: string[] }
export type Offboarding = {
  id: string; slug: string; company: string; plan: string; employees: number; mrr: number
  origin: 'Company' | 'Platform'; test?: boolean; requestedBy: string; requestedRole: string; requestedAt: string
  reason: Reason; detail: string; nps: number | null; competitor?: string; keptUs?: string; wantsExport: boolean
  state: OffState; graceDays: number
  retention?: { offer: string; terms: string; offeredBy: string; offeredAt: string; outcome: 'Pending' | 'Accepted' | 'Declined' | 'Waived'; decidedBy?: string; decidedAt?: string; note?: string }
  approvedBy?: string; approvedAt?: string; graceStart?: string; graceEnds?: string
  attest: Partial<Record<'invoices' | 'payroll' | 'exits', { by: string; at: string; note: string }>>
  hold: { by: string; at: string; reason: string } | null
  export?: { at: string; by: string; files: ExportFile[]; expiresAt: string; digest: string }
  exportWaived?: { by: string; at: string; reason: string }
  deletionDue?: string; scheduledBy?: string; scheduledAt?: string
  deletedAt?: string; deletedBy?: string; tombstone?: Tombstone
  closedAt?: string; closedBy?: string
  snapshot: { invoices: number; payroll: boolean; openExits: number; lastInvoiceRef: string; cac: string; joined: string }
  timeline: Entry[]
}
export type Settings = { graceDays: number; coolingDays: number }
type Data = { items: Offboarding[]; settings: Settings }

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString()
const idN = () => `OFF-${1000 + Math.floor(Math.random() * 9000)}`

function mk(o: Partial<Offboarding> & Pick<Offboarding, 'id' | 'slug' | 'company' | 'plan' | 'employees' | 'reason' | 'state' | 'requestedBy'>, log: [number, string, string][]): Offboarding {
  return {
    mrr: estimateMrr(o.plan, o.employees), origin: 'Company', requestedRole: 'Company Administrator', requestedAt: iso(-30), detail: '', nps: null, wantsExport: true, graceDays: 30, attest: {}, hold: null,
    snapshot: { invoices: 0, payroll: false, openExits: 0, lastInvoiceRef: `INV-2026-${String(o.employees * 3).padStart(4, '0')}`, cac: 'RC 000000', joined: '2024-06-01' },
    timeline: log.map(([d, by, text]) => ({ at: iso(d), by, text })).reverse(), ...o,
  }
}
export const estimateMrr = (plan: string, employees: number) => ({ Starter: 2500, Professional: 4200, Enterprise: 6800 }[plan] ?? 2500) * employees

/** No seeded requests: the queue only ever holds real tenants (eTranzact and companies created at runtime). */
const seed = (): Data => ({ settings: { graceDays: 30, coolingDays: 7 }, items: [] })

const store = createStore<Data>('bf-offboarding-v2', seed)
const load = (): Data => { const d = store.get(); return d?.items && d?.settings ? d : seed() }
export const useOffboarding = (slug?: string) => { const d = store.use(); const all = d?.items ?? []; return slug ? all.filter((o) => o.slug === slug) : all }
export const useOffSettings = () => store.use().settings
/** The request that currently governs a workspace (live, or deleted with a tombstone). */
export const offboardingOf = (slug: string) => load().items.find((o) => o.slug === slug && (LIVE_STATES.includes(o.state) || o.state === 'Deleted'))
export const useActiveOffboarding = (slug?: string) => { const all = useOffboarding(slug); return slug ? all.find((o) => LIVE_STATES.includes(o.state) || o.state === 'Deleted') : undefined }
export const isReadOnly = (o?: Offboarding) => !!o && READONLY_STATES.includes(o.state)
export const daysLeft = (iso?: string, now = Date.now()) => (iso ? Math.ceil((new Date(iso).getTime() - now) / DAY) : 0)
export const stageIndex = (o: Offboarding) => o.state === 'Requested' ? 0 : o.state === 'Retention' ? 1 : o.state === 'Grace' ? 3 : o.state === 'Export ready' ? 4 : o.state === 'Deletion scheduled' ? 5 : o.state === 'Deleted' ? 7 : o.approvedBy ? 3 : 1

/* ---------- internals ---------- */
const find = (id: string) => load().items.find((o) => o.id === id)
const upd = (id: string, fn: (o: Offboarding) => Partial<Offboarding>, by: string, text: string) =>
  store.set((d) => ({ ...load(), ...d, items: d.items.map((o) => (o.id === id ? { ...o, ...fn(o), timeline: [{ at: new Date().toISOString(), by, text }, ...o.timeline] } : o)) }))
const aud = (o: Offboarding, action: string, by: string, role: string, scope: 'Platform' | 'Business', from?: string, to?: string) =>
  recordAudit(slugTaken(o.slug) ? o.slug : 'platform', action, from ?? o.company, to ?? o.id, { scope, actor: by, role, category: 'Settings', ref: o.id })
const PLATFORM_ROLE = 'Platform administrator'
export const FOUR_EYES = 'A different platform administrator must do this. The person who raised or handled the request cannot also approve it.'

/* ---------- transitions: each returns an error message, or null on success ---------- */
export type RequestInput = { test?: boolean; slug: string; company: string; plan: string; employees: number; origin: 'Company' | 'Platform'; by: string; role: string; reason: Reason; detail: string; nps: number | null; competitor?: string; keptUs?: string; wantsExport: boolean; snapshot: Offboarding['snapshot'] }
export function requestOffboarding(i: RequestInput): string | { id: string } {
  if (offboardingOf(i.slug)) return 'This workspace already has an active offboarding request.'
  if (i.origin === 'Company' && !['Company Administrator', 'CEO / Managing Director'].includes(i.role)) return 'Only the Company Administrator or the CEO / MD can request cancellation.'
  if (!i.detail.trim() && i.reason === 'Other') return 'Tell us a little more about your reason.'
  const o = mk({ id: idN(), slug: i.slug, company: i.company, plan: i.plan, employees: i.employees, reason: i.reason, state: 'Requested', requestedBy: i.by, requestedRole: i.role, origin: i.origin, test: i.test, detail: i.detail.trim(), nps: i.nps, competitor: i.competitor?.trim() || undefined, keptUs: i.keptUs?.trim() || undefined, wantsExport: i.wantsExport, requestedAt: new Date().toISOString(), snapshot: i.snapshot, graceDays: load().settings.graceDays },
    [[0, i.by, i.origin === 'Company' ? `Requested cancellation: ${i.reason}` : `Platform-initiated: ${i.reason}`]])
  store.set((d) => ({ ...load(), ...d, items: [o, ...d.items] }))
  aud(o, i.origin === 'Company' ? 'Cancellation requested' : 'Offboarding initiated by the platform', i.by, i.role, i.origin === 'Company' ? 'Business' : 'Platform', i.reason, o.id)
  return { id: o.id }
}

export function makeOffer(id: string, by: string, offer: string, terms: string): string | null {
  const o = find(id); if (!o) return 'Request not found.'
  if (!OPEN_STATES.includes(o.state)) return 'A retention offer can only be made before approval.'
  if (!offer) return 'Choose an offer.'
  upd(id, () => ({ state: 'Retention', retention: { offer, terms: terms.trim(), offeredBy: by, offeredAt: new Date().toISOString(), outcome: 'Pending' } }), by, `Retention offer made: ${offer}`)
  aud(o, 'Retention offer made', by, PLATFORM_ROLE, 'Platform', undefined, offer)
  return null
}
export function respondOffer(id: string, by: string, role: string, accepted: boolean, note = '', viaPlatform = false): string | null {
  const o = find(id); if (!o?.retention || o.state !== 'Retention' || o.retention.outcome !== 'Pending') return 'There is no pending offer to answer.'
  const scope = viaPlatform ? 'Platform' : 'Business'
  upd(id, (x) => accepted
    ? { state: 'Saved', closedAt: new Date().toISOString(), closedBy: by, retention: { ...x.retention!, outcome: 'Accepted', decidedBy: by, decidedAt: new Date().toISOString(), note } }
    : { retention: { ...x.retention!, outcome: 'Declined', decidedBy: by, decidedAt: new Date().toISOString(), note } }, by, accepted ? `${viaPlatform ? 'Customer accepted by phone' : 'Accepted the offer'}. Request closed, workspace stays open` : `${viaPlatform ? 'Customer declined by phone' : 'Declined the retention offer'}${note ? `: ${note}` : ''}`)
  aud(o, accepted ? 'Retention offer accepted: cancellation closed' : 'Retention offer declined', by, role, scope, undefined, o.retention.offer)
  return null
}
export function waiveRetention(id: string, by: string, reason: string): string | null {
  const o = find(id); if (!o) return 'Request not found.'
  if (!OPEN_STATES.includes(o.state)) return 'Retention can only be skipped before approval.'
  if (reason.trim().length < 8) return 'Give a reason for skipping the save attempt (for example, the company is closing).'
  upd(id, (x) => ({ state: 'Retention', retention: { ...(x.retention ?? { offer: 'No offer made', terms: '', offeredBy: by, offeredAt: new Date().toISOString() }), outcome: 'Waived', decidedBy: by, decidedAt: new Date().toISOString(), note: reason.trim() } }), by, `Save attempt skipped: ${reason.trim()}`)
  aud(o, 'Retention attempt skipped', by, PLATFORM_ROLE, 'Platform', undefined, reason.trim())
  return null
}
export function approveOffboarding(id: string, by: string): string | null {
  const o = find(id); if (!o) return 'Request not found.'
  if (o.state !== 'Retention' || !o.retention || !['Declined', 'Waived'].includes(o.retention.outcome)) return 'Make a retention offer and record the answer (or skip it with a reason) before approval.'
  if (by === o.requestedBy || by === o.retention.offeredBy || by === o.retention.decidedBy) return FOUR_EYES
  const now = new Date(), days = o.graceDays
  upd(id, () => ({ state: 'Grace', approvedBy: by, approvedAt: now.toISOString(), graceStart: now.toISOString(), graceEnds: new Date(now.getTime() + days * DAY).toISOString() }), by, `Approved. ${days}-day read-only grace period started`)
  aud(o, 'Offboarding approved: workspace is read-only', by, PLATFORM_ROLE, 'Platform', 'Retention', `Grace ${days} days`)
  return null
}
export function setGraceDays(id: string, by: string, days: number): string | null {
  const o = find(id); if (!o || !LIVE_STATES.includes(o.state)) return 'Request not found.'
  if (days < 7 || days > 90) return 'Grace period must be between 7 and 90 days.'
  upd(id, (x) => ({ graceDays: days, ...(x.graceStart ? { graceEnds: new Date(new Date(x.graceStart).getTime() + days * DAY).toISOString() } : {}) }), by, `Grace period set to ${days} days`)
  aud(o, 'Offboarding grace period changed', by, PLATFORM_ROLE, 'Platform', String(o.graceDays), String(days))
  return null
}
export function setHold(id: string, by: string, on: boolean, reason: string): string | null {
  const o = find(id); if (!o || o.state === 'Deleted') return 'Request not found.'
  if (on && reason.trim().length < 8) return 'Give a reason for the legal hold (case or notice reference).'
  upd(id, () => ({ hold: on ? { by, at: new Date().toISOString(), reason: reason.trim() } : null }), by, on ? `Legal hold placed: ${reason.trim()}` : 'Legal hold released')
  aud(o, on ? 'Legal hold placed: deletion blocked' : 'Legal hold released', by, PLATFORM_ROLE, 'Platform', undefined, on ? reason.trim() : undefined)
  return null
}
export function attest(id: string, key: 'invoices' | 'payroll' | 'exits', by: string, note: string): string | null {
  const o = find(id); if (!o || !LIVE_STATES.includes(o.state)) return 'Request not found.'
  if (note.trim().length < 5) return 'Add a short note saying how this was resolved.'
  const label = { invoices: 'Outstanding invoices settled or written off', payroll: 'Final payroll run archived', exits: 'Open exit cases closed or transferred' }[key]
  upd(id, (x) => ({ attest: { ...x.attest, [key]: { by, at: new Date().toISOString(), note: note.trim() } } }), by, `Confirmed: ${label}`)
  aud(o, `Offboarding checklist confirmed: ${label}`, by, PLATFORM_ROLE, 'Platform', undefined, note.trim())
  return null
}
export function recordExport(id: string, by: string, role: string, scope: 'Platform' | 'Business', files: ExportFile[], digest: string): string | null {
  const o = find(id); if (!o) return 'Request not found.'
  if (!READONLY_STATES.includes(o.state)) return 'The export package is available once the grace period has started.'
  upd(id, (x) => ({ state: x.state === 'Grace' ? 'Export ready' : x.state, export: { at: new Date().toISOString(), by, files, digest, expiresAt: new Date(Date.now() + 14 * DAY).toISOString() } }), by, `Generated the data export package (${files.length} files)`)
  aud(o, 'Data export package generated', by, role, scope, undefined, `${files.length} files · digest ${digest.slice(0, 12)}`)
  return null
}
export function waiveExport(id: string, by: string, reason: string): string | null {
  const o = find(id); if (!o || !READONLY_STATES.includes(o.state)) return 'Request not found.'
  if (reason.trim().length < 8) return 'Record who declined the export and why.'
  upd(id, () => ({ exportWaived: { by, at: new Date().toISOString(), reason: reason.trim() } }), by, `Export waived: ${reason.trim()}`)
  aud(o, 'Data export waived', by, PLATFORM_ROLE, 'Platform', undefined, reason.trim())
  return null
}
export function scheduleDeletion(id: string, by: string, externalBlockers: string[]): string | null {
  const o = find(id); if (!o) return 'Request not found.'
  if (!['Grace', 'Export ready'].includes(o.state)) return 'Deletion can only be scheduled during the grace period.'
  const blockers = [...externalBlockers]
  if (o.graceEnds && new Date(o.graceEnds).getTime() > Date.now()) blockers.push(`Grace period runs for ${daysLeft(o.graceEnds)} more day(s)`)
  if (o.hold) blockers.push('Legal hold is on')
  if (!o.export && !o.exportWaived) blockers.push('The data export has not been generated or waived')
  if (blockers.length) return `Cannot schedule deletion: ${blockers.join('; ')}.`
  const due = new Date(Date.now() + load().settings.coolingDays * DAY).toISOString()
  upd(id, () => ({ state: 'Deletion scheduled', deletionDue: due, scheduledBy: by, scheduledAt: new Date().toISOString() }), by, `Deletion scheduled for ${new Date(due).toLocaleDateString('en-GB')}`)
  aud(o, 'Workspace deletion scheduled', by, PLATFORM_ROLE, 'Platform', undefined, new Date(due).toLocaleDateString('en-GB'))
  return null
}
export function executeDeletion(id: string, by: string, facts: { cac: string; joined: string }): string | null {
  const o = find(id); if (!o) return 'Request not found.'
  if (o.state !== 'Deletion scheduled') return 'Schedule the deletion first.'
  if (o.hold) return 'Deletion is blocked by a legal hold.'
  if (o.slug === DEMO_SLUG) return 'The eTranzact demo company is never deleted. Reinstate the workspace to finish this test.'
  if (by === o.scheduledBy) return FOUR_EYES
  if (o.deletionDue && new Date(o.deletionDue).getTime() > Date.now()) return `The cooling-off period ends in ${daysLeft(o.deletionDue)} day(s). The company can still reinstate until then.`
  const at = new Date().toISOString()
  const tombstone: Tombstone = {
    legalName: o.company, cac: facts.cac || o.snapshot.cac, plan: o.plan, joined: facts.joined || o.snapshot.joined, closedAt: at, lastInvoiceRef: o.snapshot.lastInvoiceRef, deletionRef: `DEL-${o.slug.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`,
    invoicesRetainUntil: new Date(Date.now() + 365 * 6 * DAY).toISOString(), auditRetainUntil: new Date(Date.now() + 365 * 7 * DAY).toISOString(),
    purged: [`Employee records (${o.employees})`, 'Payroll runs and payslips', 'Documents and signatures', 'Approvals, tasks and CRM data', 'Brand assets and contact details', 'Integrations and API keys'],
  }
  if (slugTaken(o.slug)) anonymiseTenant(o.slug)
  upd(id, () => ({ state: 'Deleted', deletedAt: at, deletedBy: by, closedAt: at, closedBy: by, tombstone }), by, 'Deleted and anonymised. Tombstone kept for billing and legal retention')
  aud(o, 'Workspace deleted and anonymised', by, PLATFORM_ROLE, 'Platform', 'Deletion scheduled', tombstone.deletionRef)
  return null
}
export function reinstate(id: string, by: string, role: string, scope: 'Platform' | 'Business', reason = ''): string | null {
  const o = find(id); if (!o) return 'Request not found.'
  if (!REVERSIBLE.includes(o.state)) return o.state === 'Deleted' ? 'The workspace has already been deleted and cannot be reinstated.' : 'This request is already closed.'
  upd(id, () => ({ state: 'Reinstated', closedAt: new Date().toISOString(), closedBy: by }), by, `Workspace reinstated${reason ? `: ${reason}` : ''}. Full access restored`)
  aud(o, 'Workspace reinstated after offboarding request', by, role, scope, o.state, 'Active')
  return null
}
export function withdraw(id: string, by: string, role: string, scope: 'Platform' | 'Business'): string | null {
  const o = find(id); if (!o || !OPEN_STATES.includes(o.state)) return 'Only an unapproved request can be withdrawn. After approval, reinstate the workspace instead.'
  upd(id, () => ({ state: 'Withdrawn', closedAt: new Date().toISOString(), closedBy: by }), by, 'Request withdrawn')
  aud(o, 'Cancellation request withdrawn', by, role, scope, o.state, 'Withdrawn')
  return null
}
/** Demo clock: moves the grace end and deletion dates earlier so the later steps can be tried without waiting. */
export function advanceDays(id: string, by: string, days: number) {
  const o = find(id); if (!o) return
  const back = (v?: string) => (v ? new Date(new Date(v).getTime() - days * DAY).toISOString() : v)
  upd(id, (x) => ({ graceEnds: back(x.graceEnds), deletionDue: back(x.deletionDue) }), by, `Demo clock advanced by ${days} day(s)`)
  aud(o, 'Demo clock advanced', by, PLATFORM_ROLE, 'Platform', undefined, `${days} days`)
}
export function saveSettings(by: string, s: Settings): string | null {
  if (s.graceDays < 7 || s.graceDays > 90) return 'Grace period must be between 7 and 90 days.'
  if (s.coolingDays < 3 || s.coolingDays > 30) return 'Cooling-off must be between 3 and 30 days.'
  const prev = load().settings
  store.set((d) => ({ ...load(), ...d, settings: s }))
  recordAudit('platform', 'Offboarding defaults changed', `${prev.graceDays}d grace / ${prev.coolingDays}d cooling`, `${s.graceDays}d grace / ${s.coolingDays}d cooling`, { scope: 'Platform', actor: by, role: PLATFORM_ROLE, category: 'Settings' })
  return null
}

/* ---------- analytics ---------- */
export type OffStats = {
  open: number; inGrace: number; dueSoon: number; deleted: number; saved: number; lost: number; saveRate: number | null; mrrAtRisk: number; mrrSaved: number; mrrLost: number
  reasons: { reason: string; total: number; saved: number; lost: number; open: number }[]; offers: { offer: string; saved: number; declined: number }[]
}
export function offStats(list: Offboarding[], now = Date.now()): OffStats {
  const counted = list.filter((o) => o.state !== 'Withdrawn' && o.state !== 'Reinstated')
  const saved = list.filter((o) => o.state === 'Saved'), lost = list.filter((o) => o.approvedBy)
  const open = list.filter((o) => OPEN_STATES.includes(o.state)), grace = list.filter((o) => READONLY_STATES.includes(o.state))
  const reasons = REASONS.map((reason) => {
    const r = counted.filter((o) => o.reason === reason)
    return { reason, total: r.length, saved: r.filter((o) => o.state === 'Saved').length, lost: r.filter((o) => o.approvedBy).length, open: r.filter((o) => OPEN_STATES.includes(o.state)).length }
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total)
  const offerMap = new Map<string, { saved: number; declined: number }>()
  list.forEach((o) => { const x = o.retention; if (!x || x.outcome === 'Waived' || x.outcome === 'Pending') return; const e = offerMap.get(x.offer) ?? { saved: 0, declined: 0 }; if (x.outcome === 'Accepted') e.saved++; else e.declined++; offerMap.set(x.offer, e) })
  return {
    open: open.length, inGrace: grace.length, dueSoon: list.filter((o) => o.state === 'Deletion scheduled' && o.deletionDue && new Date(o.deletionDue).getTime() - now <= 7 * DAY).length, deleted: list.filter((o) => o.state === 'Deleted').length,
    saved: saved.length, lost: lost.length, saveRate: saved.length + lost.length ? Math.round((saved.length / (saved.length + lost.length)) * 100) : null,
    mrrAtRisk: [...open, ...grace].reduce((n, o) => n + o.mrr, 0), mrrSaved: saved.reduce((n, o) => n + o.mrr, 0), mrrLost: lost.reduce((n, o) => n + o.mrr, 0),
    reasons, offers: [...offerMap].map(([offer, v]) => ({ offer, ...v })).sort((a, b) => b.saved - a.saved),
  }
}
