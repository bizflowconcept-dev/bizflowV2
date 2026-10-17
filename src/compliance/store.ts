import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { TODAY } from '../tasks/store'
import { VEHICLES, vehiclesForTenant } from '../data/demo'
import { vendorsForTenant } from '../data/vendors'
import type { Vendor } from '../data/vendors'

/* ---------- dates ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const toIso = (s: string) => {
  const [d, m, y] = s.split(' ')
  return `${y}-${String(MONTHS.indexOf(m) + 1).padStart(2, '0')}-${d.padStart(2, '0')}`
}
const dayNum = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000)
export const daysFromToday = (iso: string) => dayNum(iso) - dayNum(TODAY)
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}
const shift = (n: number) => new Date((dayNum(TODAY) + n) * 86400000).toISOString().slice(0, 10)
export const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const REMINDER_DAYS = [30, 14, 7, 3, 1, 0] as const
export const ESCALATE_DAYS = 3
export const ESCALATE_OVERDUE_DAYS = 30

/* ---------- state ---------- */
export type Renewal = { newExpiry: string; ref: string; note: string; by: string; at: string; status: 'pending' | 'verified' | 'rejected'; checkedBy?: string; checkedAt?: string; checkNote?: string }
export type Ack = { by: string; at: string; note: string }
export type Payment = { ref: string; method: string; by: string; at: string }
export type Delay = { reason: string; promised: string; by: string; at: string }
export type LogEntry = { slug?: string; id: string; at: string; by: string; kind: 'fleet' | 'payment'; subject: string; text: string }
type State = { renewals: Record<string, Renewal>; acks: Record<string, Ack>; payments: Record<string, Payment>; delays: Record<string, Delay[]>; log: LogEntry[] }

const at = (n: number, h = 9) => new Date(Date.UTC(2026, 9, 10 + n, h, 12)).toISOString()
const seed = (): State => ({
  renewals: {},
  acks: { 'ABJ-904-GW|Insurance': { by: 'Nneka Okafor', at: at(-3, 10), note: 'Quote received from AXA Mansard; awaiting MD approval.' } },
  payments: {},
  delays: { 'INV-002-A': [{ reason: 'Disputed fuel volumes for September; reconciliation with depot in progress.', promised: shift(7), by: 'Chinedu Eze', at: at(-6, 14) }] },
  log: [
    { id: 'L-1', at: at(-3, 10), by: 'Nneka Okafor', kind: 'fleet', subject: 'ABJ-904-GW · Insurance', text: 'acknowledged the expiry warning: Quote received from AXA Mansard; awaiting MD approval.' },
    { id: 'L-2', at: at(-6, 14), by: 'Chinedu Eze', kind: 'payment', subject: 'INV-002-A · Sahara Fuel Depot', text: `logged a delay with a committed payment date of ${fmtDate(shift(7))}: Disputed fuel volumes for September; reconciliation with depot in progress.` },
  ],
})

const KEY = 'bf-compliance'
let state: State = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') ?? seed() } catch { return seed() } })()
const subs = new Set<() => void>()
const set = (s: State) => { state = s; try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } subs.forEach((f) => f()) }
export const useCompliance = () => useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l) }, () => state)
export const resetCompliance = () => set(seed())

const push = (s: State, e: Omit<LogEntry, 'id' | 'at'>, slug: string, audit: string): State => {
  recordAudit(slug, audit)
  return { ...s, log: [{ ...e, slug, id: 'L-' + Date.now() + Math.random().toString(36).slice(2, 5), at: new Date().toISOString() }, ...s.log] }
}

/* ---------- fleet documents ---------- */
export type Level = 'expired' | 'critical' | 'soon' | 'valid'
export type FleetDoc = {
  key: string; reg: string; model: string; driver: string; branch: string; type: string; expiry: string; days: number; level: Level
  owner: string; ack?: Ack; renewal?: Renewal; escalated: boolean
}
const EXTRA: Record<string, { lic: string; driverLic: string }> = {
  'ABJ-482-KMC': { lic: '2027-03-02', driverLic: '2027-06-14' },
  'LSR-217-XA': { lic: shift(-3), driverLic: '2026-11-20' },
  'ABJ-904-GW': { lic: '2027-01-10', driverLic: shift(2) },
  'PHC-331-RV': { lic: '2027-05-19', driverLic: '2026-12-28' },
}
export const ADMIN_OFFICER = 'Nneka Okafor'
export const levelOf = (days: number): Level => (days < 0 ? 'expired' : days <= 7 ? 'critical' : days <= 30 ? 'soon' : 'valid')
export const LEVEL_TONE: Record<Level, string> = { expired: 'red', critical: 'red', soon: 'amber', valid: 'green' }
export const dueText = (days: number) => (days < 0 ? `Expired ${-days}d ago` : days === 0 ? 'Expires today' : days === 1 ? 'Expires tomorrow' : `${days} days left`)

/** Without a slug the sample fleet is used (marketing previews); with one, only that workspace's vehicles. */
export const fleetDocs = (s: State, slug?: string): FleetDoc[] =>
  (slug === undefined ? VEHICLES : vehiclesForTenant(slug)).flatMap((v) => {
    const x = EXTRA[v.reg] ?? { lic: '2027-06-30', driverLic: '2027-06-30' }
    return ([['Insurance', toIso(v.ins)], ['Roadworthiness', toIso(v.road)], ['Vehicle licence', x.lic], ["Driver's licence", x.driverLic]] as const).map(([type, orig]) => {
      const key = `${v.reg}|${type}`
      const renewal = s.renewals[key]
      const expiry = renewal?.status === 'verified' ? renewal.newExpiry : orig
      const days = daysFromToday(expiry)
      const ack = s.acks[key]
      return { key, reg: v.reg, model: v.model, driver: v.driver, branch: v.branch, type, expiry, days, level: levelOf(days), owner: type === "Driver's licence" ? v.driver : ADMIN_OFFICER, ack, renewal, escalated: days <= ESCALATE_DAYS && !ack && renewal?.status !== 'pending' }
    })
  })

export const reminderSchedule = (d: FleetDoc | { expiry: string; days: number }) =>
  REMINDER_DAYS.map((n) => {
    const date = new Date((dayNum(d.expiry) - n) * 86400000).toISOString().slice(0, 10)
    return { n, date, sent: daysFromToday(date) <= 0 }
  })

/* ---------- vendor invoices ---------- */
export type Invoice = {
  id: string; vendor: Vendor; amount: number; issued: string; due: string; days: number; payment?: Payment; delays: Delay[]
  state: 'paid' | 'overdue' | 'due-soon' | 'upcoming'; overdueDays: number; escalated: boolean; needsReason: boolean
}
const OFFSETS: Record<string, [number, number]> = {
  'VEN-001': [-3, 21], 'VEN-002': [-34, -9], 'VEN-003': [4, 18], 'VEN-004': [12, 40], 'VEN-005': [-18, 2],
  'VEN-006': [9, 30], 'VEN-007': [-1, 25], 'VEN-008': [-52, -20], 'VEN-009': [6, 35],
}
export const invoicesFor = (s: State, slug?: string, only?: Vendor[]): Invoice[] =>
  (only ?? vendorsForTenant(slug)).flatMap((v) => {
    if (v.owing <= 0) return []
    const first = Math.round((v.owing * 0.6) / 1000) * 1000
    const off = OFFSETS[v.id] ?? [10, 30]
    return ([['A', first, off[0]], ['B', v.owing - first, off[1]]] as const).map(([suffix, amount, o]) => {
      const id = `INV-${v.id.slice(4)}-${suffix}`
      const due = shift(o)
      const payment = s.payments[id]
      const delays = s.delays[id] ?? []
      const days = daysFromToday(due)
      const overdueDays = payment ? 0 : Math.max(0, -days)
      return {
        id, vendor: v, amount, issued: shift(o - 30), due, days, payment, delays, overdueDays,
        state: payment ? 'paid' : days < 0 ? 'overdue' : days <= 7 ? 'due-soon' : 'upcoming',
        escalated: overdueDays > ESCALATE_OVERDUE_DAYS,
        needsReason: overdueDays > 0 && delays.length === 0,
      } as Invoice
    })
  })

/* ---------- actions ---------- */
type Ctx = { by: string; slug: string }
export const acknowledgeDoc = (key: string, note: string, c: Ctx) => {
  const d = fleetDocs(state, c.slug).find((x) => x.key === key)
  if (!d) return
  set(push({ ...state, acks: { ...state.acks, [key]: { by: c.by, at: new Date().toISOString(), note } } }, { by: c.by, kind: 'fleet', subject: `${d.reg} · ${d.type}`, text: `acknowledged the ${d.level === 'expired' ? 'expiry' : 'expiry warning'}${note ? ': ' + note : ''}.` }, c.slug, `Fleet ${d.reg} ${d.type}: expiry warning acknowledged`))
}
export const submitRenewal = (key: string, r: { newExpiry: string; ref: string; note: string }, c: Ctx) => {
  const d = fleetDocs(state, c.slug).find((x) => x.key === key)
  if (!d) return
  set(push({ ...state, renewals: { ...state.renewals, [key]: { ...r, by: c.by, at: new Date().toISOString(), status: 'pending' } } }, { by: c.by, kind: 'fleet', subject: `${d.reg} · ${d.type}`, text: `submitted a renewal (ref ${r.ref}, valid to ${fmtDate(r.newExpiry)}) for verification.` }, c.slug, `Fleet ${d.reg} ${d.type}: renewal submitted`, ))
}
export const verifyRenewal = (key: string, approve: boolean, note: string, c: Ctx): string | null => {
  const d = fleetDocs(state, c.slug).find((x) => x.key === key)
  const r = d?.renewal
  if (!d || !r || r.status !== 'pending') return 'There is no renewal waiting for verification.'
  if (r.by === c.by) return 'Separation of duties: the person who submitted a renewal cannot verify it.'
  set(push({ ...state, renewals: { ...state.renewals, [key]: { ...r, status: approve ? 'verified' : 'rejected', checkedBy: c.by, checkedAt: new Date().toISOString(), checkNote: note } } }, { by: c.by, kind: 'fleet', subject: `${d.reg} · ${d.type}`, text: `${approve ? 'verified' : 'rejected'} the renewal submitted by ${r.by}${note ? ': ' + note : ''}.` }, c.slug, `Fleet ${d.reg} ${d.type}: renewal ${approve ? 'verified' : 'rejected'}`))
  return null
}
export const recordPayment = (inv: Invoice, p: { ref: string; method: string }, c: Ctx) =>
  set(push({ ...state, payments: { ...state.payments, [inv.id]: { ...p, by: c.by, at: new Date().toISOString() } } }, { by: c.by, kind: 'payment', subject: `${inv.id} · ${inv.vendor.name}`, text: `recorded payment of ₦${inv.amount.toLocaleString('en-NG')} (${p.method}, ref ${p.ref})${inv.overdueDays ? `, ${inv.overdueDays} days after the due date` : ''}.` }, c.slug, `Vendor invoice ${inv.id}: payment recorded`))
export const logDelay = (inv: Invoice, d: { reason: string; promised: string }, c: Ctx) =>
  set(push({ ...state, delays: { ...state.delays, [inv.id]: [...(state.delays[inv.id] ?? []), { ...d, by: c.by, at: new Date().toISOString() }] } }, { by: c.by, kind: 'payment', subject: `${inv.id} · ${inv.vendor.name}`, text: `logged a delay with a committed payment date of ${fmtDate(d.promised)}: ${d.reason}` }, c.slug, `Vendor invoice ${inv.id}: delay reason logged`))

/* ---------- notifications ---------- */
export type ComplianceNote = { t: string; d: string; cta: string; to: string; pri: boolean; ago: string; m: string }
export const complianceNotes = (s: State, slug?: string): ComplianceNote[] => {
  const docs = fleetDocs(s, slug).filter((d) => d.level !== 'valid' && d.renewal?.status !== 'pending').sort((a, b) => a.days - b.days)
  const fleet = docs.slice(0, 4).map((d) => ({ t: `${d.type} · ${d.reg}`, d: `${dueText(d.days)} (${fmtDate(d.expiry)}).${d.ack ? ` Acknowledged by ${d.ack.by}.` : ' Not yet acknowledged.'}`, cta: 'Review document', to: '/admin/business/fleet', pri: d.level === 'expired' || d.level === 'critical', ago: d.days < 0 ? 'Overdue' : 'Reminder', m: 'fleet' }))
  const pending = fleetDocs(s, slug).filter((d) => d.renewal?.status === 'pending')
  const verify = pending.map((d) => ({ t: `Verify renewal · ${d.reg} ${d.type}`, d: `Submitted by ${d.renewal!.by}; a second person must verify it.`, cta: 'Verify', to: '/admin/business/fleet', pri: false, ago: 'Waiting', m: 'fleet' }))
  const inv = invoicesFor(s, slug)
  const over = inv.filter((i) => i.state === 'overdue')
  const soon = inv.filter((i) => i.state === 'due-soon')
  const money = (n: number) => '₦' + n.toLocaleString('en-NG')
  const vend: ComplianceNote[] = []
  if (over.length) vend.push({ t: `${over.length} overdue vendor payment${over.length > 1 ? 's' : ''}`, d: `${money(over.reduce((a, i) => a + i.amount, 0))} past due; ${over.filter((i) => i.needsReason).length} without a logged reason.`, cta: 'Review payments', to: '/admin/business/vendors', pri: true, ago: 'Overdue', m: 'vendors' })
  if (soon.length) vend.push({ t: `${soon.length} vendor payment${soon.length > 1 ? 's' : ''} due this week`, d: `${money(soon.reduce((a, i) => a + i.amount, 0))} falls due within 7 days.`, cta: 'Review payments', to: '/admin/business/vendors', pri: false, ago: 'Upcoming', m: 'vendors' })
  return [...fleet, ...verify, ...vend]
}
