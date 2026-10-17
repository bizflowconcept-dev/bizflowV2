import { useMemo, useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { approvalsForTenant, assetsForTenant, isOwnDataset, vehiclesForTenant } from '../data/demo'
import type { Employee } from '../data/demo'
import { addDays, daysBetween, fmtDate } from '../crm/store'

export const EXIT_TYPES = ['Resignation', 'Termination', 'End of contract', 'Retirement', 'Redundancy'] as const
export type ExitType = (typeof EXIT_TYPES)[number]
export const EXIT_STATUSES = ['Initiated', 'In clearance', 'Final pay review', 'Completed', 'Cancelled'] as const
export type ExitStatus = (typeof EXIT_STATUSES)[number]
export const REASONS = ['Better opportunity', 'Compensation', 'Career growth', 'Relocation', 'Personal or family', 'Health', 'Management', 'Work-life balance', 'Performance', 'Misconduct', 'Contract ended', 'Retirement', 'Restructuring'] as const
export const REHIRE = ['Eligible', 'Review', 'Not eligible'] as const
export const ASSET_STATES = ['Assigned', 'Returned', 'Damaged', 'Missing'] as const
export type AssetState = (typeof ASSET_STATES)[number]
export const CLEAR_STATES = ['Pending', 'Cleared', 'Blocked'] as const
export type ClearState = (typeof CLEAR_STATES)[number]
export const RATINGS = ['Role and responsibilities', 'Line management', 'Pay and benefits', 'Career growth', 'Culture and team', 'Tools and resources'] as const
export const DEFAULT_NOTICE = 30
export const LEAVE_DAYS_DEFAULT = 4

export type Act = { id: string; at: string; by: string; text: string }
export type AccessItem = { id: string; label: string; done: boolean; by?: string; date?: string }
export type MoveRec = { kind: 'Task' | 'Lead'; ref: string; label: string; to: string; at: string; by: string }
export type HItem = { id: string; kind: 'Document' | 'Knowledge' | 'Approval'; label: string; to: string }
export type Handover = { successor: string; notes: string; moves: MoveRec[]; items: HItem[]; ack: { by: string; at: string } | null }
export type AssetItem = { id: string; name: string; kind: string; ref: string; value: number; state: AssetState; recovery: number; note: string }
export type Recovery = { id: string; label: string; kind: 'Loan' | 'Advance' | 'Expense' | 'Other'; amount: number; recover: number }
export type Signoff = { dept: string; approver: string; status: ClearState; date: string; comment: string }
export type Settlement = {
  payableDays: number | null; leaveDays: number; gratuity: number; otherPay: number; tax: number; otherDeduct: number; note: string
  approval: { status: 'Draft' | 'Approved'; by: string; at: string } | null; paidOn: string
}
export type Interview = { done: boolean; declined: boolean; date: string; interviewer: string; ratings: Record<string, number>; recommend: boolean | null; primary: string; comments: string }
export type ExitCase = {
  id: string; tenant: string; employeeId: string; name: string; role: string; dept: string; manager: string; salary: number
  type: ExitType; reasonCat: string; reason: string; noticeGiven: string; noticePeriodDays: number; noticeWaived: boolean; lastWorkingDay: string; rehire: string; regretted: boolean
  status: ExitStatus; initiatedBy: string; selfSubmitted: boolean; accepted: { by: string; at: string } | null; created: string; completedAt?: string; cancelReason?: string
  access: AccessItem[]; handover: Handover; assets: AssetItem[]; recoveries: Recovery[]; clearance: Signoff[]; settlement: Settlement; interview: Interview; activity: Act[]
}
export type ExitInput = { type: ExitType; reasonCat: string; reason: string; noticeGiven: string; noticePeriodDays: number; noticeWaived: boolean; lastWorkingDay: string; rehire: string }

/* ---------- helpers ---------- */
export const TODAY = new Date().toISOString().slice(0, 10)
export { addDays, daysBetween }
export const fmtDateX = (iso: string) => (iso ? fmtDate(iso.slice(0, 10)) : '-')
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const nowIso = () => new Date().toISOString()
let counter = 0
const uid = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`
const at = (iso: string, h = 10) => `${iso}T${String(h).padStart(2, '0')}:00:00.000Z`
export const tenureYears = (e: { id: string }) => 1 + (hash(e.id) % 8)
export const ngnx = (n: number) => (n < 0 ? '-₦' : '₦') + Math.abs(Math.round(n)).toLocaleString('en-NG')

const CLEARERS: Record<string, Record<string, string>> = {
  etranzact: { 'IT & access': 'Kunle Ogunleye', 'Operations & assets': 'Ibrahim Musa', Finance: 'Chinedu Eze', HR: 'Kemi Balogun' },
}
export const DEPTS = ['Line manager', 'IT & access', 'Operations & assets', 'Finance', 'HR']
const ACCESS = ['Company email and calendar', 'System role and app access (BizFlow)', 'VPN and remote access', 'Building access card and ID badge', 'Vehicle keys and fuel card', 'Company phone and SIM', 'Shared mailboxes, groups and approval limits']

/* ---------- derived calculations ---------- */
const monthDays = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate()
export const servedDays = (c: Pick<ExitCase, 'noticeGiven' | 'lastWorkingDay'>) => Math.max(0, daysBetween(c.noticeGiven, c.lastWorkingDay))
export const shortfallDays = (c: Pick<ExitCase, 'noticeGiven' | 'lastWorkingDay' | 'noticePeriodDays' | 'noticeWaived'>) => (c.noticeWaived ? 0 : Math.max(0, c.noticePeriodDays - servedDays(c)))
export const recoveryTotal = (c: ExitCase) => c.assets.filter((a) => a.state === 'Damaged' || a.state === 'Missing').reduce((a, x) => a + x.recovery, 0) + c.recoveries.reduce((a, x) => a + x.recover, 0)
export function settle(c: ExitCase) {
  const s = c.settlement, sal = c.salary
  const days = s.payableDays ?? Number(c.lastWorkingDay.slice(8))
  const prorated = Math.round((sal * Math.min(days, monthDays(c.lastWorkingDay))) / monthDays(c.lastWorkingDay))
  const leavePay = Math.round((sal / 22) * s.leaveDays)
  const short = shortfallDays(c)
  const lieu = c.type === 'Redundancy' ? Math.round((sal / 30) * short) : 0
  const noticeDeduct = c.type === 'Resignation' ? Math.round((sal / 30) * short) : 0
  const assets = c.assets.filter((a) => a.state === 'Damaged' || a.state === 'Missing').reduce((a, x) => a + x.recovery, 0)
  const loans = c.recoveries.reduce((a, x) => a + x.recover, 0)
  const gross = prorated + leavePay + lieu + s.gratuity + s.otherPay
  const deductions = noticeDeduct + assets + loans + s.tax + s.otherDeduct
  return { days, prorated, leavePay, short, lieu, noticeDeduct, assets, loans, gross, deductions, net: gross - deductions }
}
export const openTaskCount = (c: ExitCase, open: number, leads: number) => open + leads + c.handover.items.filter((i) => !i.to).length
export function stepsDone(c: ExitCase, openTasks: number, openLeads: number): boolean[] {
  const h = c.handover
  return [
    !!c.accepted,
    openTasks === 0 && openLeads === 0 && h.items.every((i) => i.to) && !!h.ack,
    c.assets.every((a) => a.state !== 'Assigned'),
    c.clearance.every((s) => s.status === 'Cleared') && c.access.every((a) => a.done),
    c.settlement.approval?.status === 'Approved',
    c.interview.done || c.interview.declined,
    c.status === 'Completed',
  ]
}
export function blockers(c: ExitCase, openTasks: number, openLeads: number): string[] {
  const d = stepsDone(c, openTasks, openLeads), out: string[] = []
  if (!d[0]) out.push('Exit has not been accepted yet')
  if (!d[1]) out.push('Handover is incomplete (open tasks or leads, unassigned items, or successor has not acknowledged)')
  if (!d[2]) out.push('Company assets are still marked as assigned')
  if (c.clearance.some((s) => s.status !== 'Cleared')) out.push('Not every department has cleared the leaver')
  if (c.access.some((a) => !a.done)) out.push('Access revocation checklist is incomplete')
  if (!d[4]) out.push('Final settlement has not been approved by Finance')
  if (!d[5]) out.push('Exit interview has not been held or declined')
  return out
}

/* ---------- builders ---------- */
const blankInterview = (): Interview => ({ done: false, declined: false, date: '', interviewer: '', ratings: {}, recommend: null, primary: '', comments: '' })
const blankSettle = (): Settlement => ({ payableDays: null, leaveDays: LEAVE_DAYS_DEFAULT, gratuity: 0, otherPay: 0, tax: 0, otherDeduct: 0, note: '', approval: null, paidOn: '' })

function assetsFor(slug: string, e: Pick<Employee, 'name' | 'salary' | 'mode' | 'dept' | 'id'>): AssetItem[] {
  const out: AssetItem[] = []
  const mk = (id: string, name: string, kind: string, ref: string, value: number): AssetItem => ({ id, name, kind, ref, value, state: 'Assigned', recovery: 0, note: '' })
  const ASSETS = assetsForTenant(slug)
  const own = isOwnDataset(slug)
  ASSETS.filter((a) => a.who === e.name && a.type !== 'Vehicle').forEach((a) => out.push(mk(a.id, a.name, a.type, a.serial, a.cur)))
  vehiclesForTenant(slug).filter((v) => v.driver === e.name).forEach((v) => out.push(mk(v.reg, v.model, 'Vehicle', v.reg, ASSETS.find((a) => a.name === v.model)?.cur ?? 18000000)))
  const h = hash(e.id)
  if (!own && !out.some((a) => a.kind === 'Laptop') && !out.some((a) => a.kind === 'Vehicle')) out.push(mk(`AST-${10000 + (h % 80000)}`, 'Dell Latitude 5420', 'Laptop', `DL${h % 99999}`, 780000))
  out.push(mk(`ID-${e.id}`, 'Staff ID card and access fob', 'ID card', e.id, 5000))
  if (!own && e.salary >= 700000) out.push(mk(`PH-${h % 9000}`, 'Company phone and SIM', 'Phone', `SIM-${h % 99999}`, 150000))
  if (!own && (e.mode === 'Field' || /operations|admin/i.test(e.dept))) out.push(mk(`FC-${h % 9000}`, 'Fuel card', 'Fuel card', `FC${h % 999999}`, 0))
  return out
}
function recoveriesFor(slug: string, e: Pick<Employee, 'name' | 'salary' | 'id'>): Recovery[] {
  const out: Recovery[] = []
  const adv = approvalsForTenant(slug).find((a) => a.who === e.name && a.type === 'Salary Advance')
  if (adv) out.push({ id: uid('rc'), label: `Salary advance ${adv.id}`, kind: 'Advance', amount: adv.amount, recover: adv.amount })
  const k = hash(e.id) % 3
  if (k === 0) { const v = Math.round((e.salary * 0.4) / 1000) * 1000; out.push({ id: uid('rc'), label: 'Staff loan, outstanding balance', kind: 'Loan', amount: v, recover: v }) }
  if (k === 1 && !adv) { const v = Math.round((e.salary * 0.15) / 1000) * 1000; out.push({ id: uid('rc'), label: 'Salary advance, unrecovered', kind: 'Advance', amount: v, recover: v }) }
  if (k === 2) out.push({ id: uid('rc'), label: 'Unretired travel expense', kind: 'Expense', amount: 48500, recover: 48500 })
  return out
}

export function buildCase(id: string, slug: string, e: Pick<Employee, 'id' | 'name' | 'role' | 'dept' | 'manager' | 'salary' | 'mode'>, input: ExitInput, by: string, self: boolean, day = TODAY): ExitCase {
  const own = isOwnDataset(slug)
  const clearers = own ? {} as Record<string, string> : CLEARERS[slug] ?? CLEARERS.etranzact
  const items: HItem[] = [
    { id: uid('hi'), kind: 'Document', label: `Shared documents and files owned by ${e.name}`, to: '' },
    { id: uid('hi'), kind: 'Knowledge', label: 'Knowledge notes, runbooks and process write-ups', to: '' },
    ...approvalsForTenant(slug).filter((a) => a.who === e.name && a.stage === 'Pending').map((a) => ({ id: uid('hi'), kind: 'Approval' as const, label: `Pending request ${a.id} (${a.type}): follow up or withdraw`, to: '' })),
  ]
  const needsAccept = self
  return {
    id, tenant: slug, employeeId: e.id, name: e.name, role: e.role, dept: e.dept, manager: e.manager, salary: e.salary, ...input,
    regretted: false, status: 'Initiated', initiatedBy: by, selfSubmitted: self, accepted: needsAccept ? null : { by, at: at(day) }, created: day,
    access: ACCESS.map((label) => ({ id: uid('ac'), label, done: false })),
    handover: { successor: '', notes: '', moves: [], items, ack: null },
    assets: assetsFor(slug, e), recoveries: recoveriesFor(slug, e),
    clearance: DEPTS.map((dept) => ({ dept, approver: dept === 'Line manager' ? (own && (!e.manager || e.manager === '—') ? 'Company administrator' : e.manager) : clearers[dept] ?? (own ? `${dept} lead` : dept), status: 'Pending' as ClearState, date: '', comment: '' })),
    settlement: blankSettle(), interview: blankInterview(),
    activity: [{ id: uid('act'), at: at(day), by, text: self ? `Submitted a ${input.type.toLowerCase()} request` : `Initiated a ${input.type.toLowerCase()} exit` }],
  }
}

/* ---------- seed ---------- */
type SeedEmp = Parameters<typeof buildCase>[2]
const clearAll = (c: ExitCase, day: string): ExitCase => ({
  ...c,
  assets: c.assets.map((a) => ({ ...a, state: 'Returned' as AssetState })),
  clearance: c.clearance.map((s) => ({ ...s, status: 'Cleared' as ClearState, date: day, comment: s.dept === 'Finance' ? 'No outstanding advances beyond recorded recoveries' : 'Cleared' })),
  access: c.access.map((a) => ({ ...a, done: true, by: c.clearance[1].approver, date: day })),
  handover: { ...c.handover, ack: { by: c.handover.successor, at: at(day) }, items: c.handover.items.map((i) => ({ ...i, to: c.handover.successor })) },
})
const A = (iso: string, by: string, text: string): Act => ({ id: uid('act'), at: at(iso), by, text })
function seed(): ExitCase[] {
  const mkIn = (type: ExitType, cat: string, reason: string, given: string, days: number, lwd: string, rehire = 'Eligible'): ExitInput => ({ type, reasonCat: cat, reason, noticeGiven: given, noticePeriodDays: days, noticeWaived: false, lastWorkingDay: lwd, rehire })
  const out: ExitCase[] = []
  const e1 = (id: string, e: SeedEmp, i: ExitInput, by: string, self: boolean, day: string) => buildCase(id, 'etranzact', e, i, by, self, day)

  // etranzact
  let c = clearAll(e1('EX-2001', { id: 'ETZ-0099', name: 'Lanre Fashola', role: 'Customer Service Officer', dept: 'Customer Service', manager: 'Femi Johnson', salary: 520000, mode: 'Hybrid' }, mkIn('Termination', 'Misconduct', 'Repeated breach of the merchant data-handling policy after a final written warning.', '2026-07-14', 0, '2026-07-14', 'Not eligible'), 'Kemi Balogun', false, '2026-07-14'), '2026-07-20')
  c = { ...c, status: 'Completed', completedAt: at('2026-07-28'), accepted: { by: 'Kemi Balogun', at: at('2026-07-14') }, handover: { ...c.handover, successor: 'Femi Johnson', notes: 'Open merchant tickets reassigned to the support queue.' }, settlement: { ...blankSettle(), leaveDays: 2, otherDeduct: 25000, note: 'Deduction for unreturned training materials.', approval: { status: 'Approved', by: 'Chinedu Eze', at: at('2026-07-25') }, paidOn: '2026-07-28' },
    interview: { ...blankInterview(), declined: true }, activity: [A('2026-07-28', 'Kemi Balogun', 'Completed the exit. Access revoked and employee archived'), A('2026-07-14', 'Kemi Balogun', 'Initiated a termination exit')] }
  out.push(c)
  let d = e1('EX-2002', { id: 'ETZ-0031', name: 'Tobi Adeyemi', role: 'Head, Enterprise Sales', dept: 'Enterprise Sales', manager: 'Oladapo Adebayo', salary: 1950000, mode: 'Hybrid' }, mkIn('Resignation', 'Career growth', 'Moving into a chief commercial officer role elsewhere.', '2026-10-01', 60, '2026-11-30'), 'Tobi Adeyemi', true, '2026-10-01')
  d = { ...d, status: 'In clearance', accepted: { by: 'Kemi Balogun', at: at('2026-10-02') }, regretted: true, rehire: 'Eligible', handover: { ...d.handover, successor: 'Morenike Adebayo', notes: 'Pipeline review notes are in the CRM. Introduce the successor to LASRS procurement before 30 Nov.' },
    clearance: d.clearance.map((s) => s.dept === 'Line manager' ? { ...s, status: 'Cleared' as ClearState, date: '2026-10-06', comment: 'Handover plan agreed' } : s),
    activity: [A('2026-10-06', 'Oladapo Adebayo', 'Cleared the leaver as line manager'), A('2026-10-02', 'Kemi Balogun', 'Accepted the resignation'), A('2026-10-01', 'Tobi Adeyemi', 'Submitted a resignation request')] }
  out.push(d)
  let f = clearAll(e1('EX-2003', { id: 'ETZ-0151', name: 'Paul Akinola', role: 'Internal Audit Officer', dept: 'Internal Audit', manager: 'Ngozi Umeh', salary: 910000, mode: 'Hybrid' }, mkIn('End of contract', 'Contract ended', 'Fixed-term audit engagement ended and was not renewed.', '2026-09-01', 30, '2026-10-02', 'Eligible'), 'Kemi Balogun', false, '2026-09-01'), '2026-10-05')
  f = { ...f, status: 'Final pay review', accepted: { by: 'Kemi Balogun', at: at('2026-09-01') }, handover: { ...f.handover, successor: 'Ngozi Umeh', notes: 'Open audit workpapers are in the Internal Audit folder.' }, settlement: { ...blankSettle(), leaveDays: 5, otherPay: 120000, note: 'Contract completion bonus.' },
    interview: { done: true, declined: false, date: '2026-09-28', interviewer: 'Bolanle Ajayi', ratings: { 'Role and responsibilities': 5, 'Line management': 4, 'Pay and benefits': 3, 'Career growth': 3, 'Culture and team': 5, 'Tools and resources': 4 }, recommend: true, primary: 'Contract ended', comments: 'Would return on a permanent contract.' },
    activity: [A('2026-10-05', 'Chinedu Eze', 'Cleared the leaver for Finance'), A('2026-09-01', 'Kemi Balogun', 'Initiated an end-of-contract exit')] }
  out.push(f)
  return out
}

/* ---------- history for insights ---------- */
export type Hist = { dept: string; reason: string; tenure: number; regretted: boolean; month: string }
const H = (dept: string, reason: string, tenure: number, regretted: boolean, month: string): Hist => ({ dept, reason, tenure, regretted, month })
const HISTORY: Record<string, Hist[]> = {
  etranzact: [H('Technology', 'Better opportunity', 3, true, '2026-01'), H('Technology', 'Compensation', 2, true, '2026-02'), H('Customer Service', 'Career growth', 1, false, '2026-02'), H('Enterprise Sales', 'Better opportunity', 4, true, '2026-03'), H('Finance', 'Relocation', 7, false, '2026-04'), H('Customer Service', 'Work-life balance', 2, false, '2026-05'), H('Admin Department', 'Performance', 1, false, '2026-06'), H('Risk & Compliance', 'Compensation', 5, true, '2026-08'), H('Technology', 'Health', 6, false, '2026-09')],
}
export const historyFor = (slug: string) => (isOwnDataset(slug) ? [] : HISTORY[slug] ?? HISTORY.etranzact)
export const tenureBucket = (y: number) => (y < 1 ? '< 1 yr' : y <= 2 ? '1-2 yrs' : y <= 5 ? '3-5 yrs' : '6+ yrs')

/* ---------- store ---------- */
const KEY = 'bf-exit-v2'
let cases: ExitCase[] = (() => { try { const s = localStorage.getItem(KEY); if (s) return (JSON.parse(s) as ExitCase[]).filter((c) => !!c.tenant) } catch { /* fall through */ } return seed() })()
const subs = new Set<() => void>()
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(cases)) } catch { /* storage full */ } subs.forEach((f) => f()) }

export function useExits(slug: string) {
  const all = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => cases)
  return useMemo(() => all.filter((c) => c.tenant === slug), [all, slug])
}
export const exitById = (id: string) => cases.find((c) => c.id === id)
export const activeExit = (slug: string, employeeId: string) => cases.find((c) => c.tenant === slug && c.employeeId === employeeId && c.status !== 'Completed' && c.status !== 'Cancelled')
const nextId = (slug: string) => { const base = slug === 'etranzact' ? 2000 : 1000; return `EX-${Math.max(base, ...cases.filter((c) => c.tenant === slug).map((c) => Number(c.id.slice(3)) || 0)) + 1}` }

/** Applies a change, appends an activity line and writes the audit trail. */
function mut(id: string, by: string, text: string, fn: (c: ExitCase) => Partial<ExitCase>, action = text, from?: string, to?: string) {
  const cur = exitById(id); if (!cur) return
  cases = cases.map((c) => (c.id === id ? { ...c, ...fn(c), activity: [{ id: uid('act'), at: nowIso(), by, text }, ...c.activity] } : c))
  emit()
  recordAudit(cur.tenant, action, from, to ?? `${cur.name} (${id})`, { category: 'Exit', ref: id })
}

export function initiateExit(slug: string, emp: Employee, input: ExitInput, by: string, self: boolean) {
  const c = buildCase(nextId(slug), slug, emp, input, by, self)
  cases = [c, ...cases]; emit()
  recordAudit(slug, self ? 'Resignation submitted' : 'Exit initiated', undefined, `${emp.name}: ${input.type}`, { category: 'Exit', ref: c.id })
  return c
}
export function acceptExit(id: string, by: string) {
  mut(id, by, 'Accepted the exit request and opened clearance', () => ({ accepted: { by, at: nowIso() }, status: 'In clearance' as ExitStatus }), 'Exit accepted')
}
export function cancelExit(id: string, by: string, reason: string) {
  mut(id, by, `Cancelled the exit: ${reason || 'no reason given'}`, () => ({ status: 'Cancelled' as ExitStatus, cancelReason: reason }), 'Exit cancelled')
}
export function updateDetails(id: string, patch: Partial<Pick<ExitCase, 'type' | 'reasonCat' | 'reason' | 'noticeGiven' | 'noticePeriodDays' | 'noticeWaived' | 'lastWorkingDay' | 'rehire' | 'regretted'>>, by: string, text: string) {
  mut(id, by, text, () => patch, 'Exit details updated')
}
export function setStatus(id: string, status: ExitStatus, by: string) {
  const cur = exitById(id); if (!cur) return
  mut(id, by, `Moved the exit to ${status}`, () => ({ status }), 'Exit stage changed', cur.status, status)
}
export function setSuccessor(id: string, successor: string, by: string) { mut(id, by, `Set ${successor || 'no one'} as the main successor`, (c) => ({ handover: { ...c.handover, successor, ack: null } }), 'Handover successor set') }
export function setHandoverNotes(id: string, notes: string, by: string) { mut(id, by, 'Updated the handover notes', (c) => ({ handover: { ...c.handover, notes, ack: c.handover.notes === notes ? c.handover.ack : null } }), 'Handover notes updated') }
export function recordMove(id: string, m: Omit<MoveRec, 'at'>) {
  mut(id, m.by, `Reassigned ${m.kind.toLowerCase()} ${m.label} to ${m.to}`, (c) => ({ handover: { ...c.handover, ack: null, moves: [{ ...m, at: nowIso() }, ...c.handover.moves] } }), `Handover ${m.kind.toLowerCase()} reassigned`, m.ref, m.to)
}
export function assignItem(id: string, itemId: string, to: string, by: string) {
  mut(id, by, `Handed over an item to ${to || 'no one'}`, (c) => ({ handover: { ...c.handover, ack: null, items: c.handover.items.map((i) => (i.id === itemId ? { ...i, to } : i)) } }), 'Handover item assigned')
}
export function ackHandover(id: string, by: string) { mut(id, by, 'Acknowledged the handover as successor', (c) => ({ handover: { ...c.handover, ack: { by, at: nowIso() } } }), 'Handover acknowledged') }
export function setAsset(id: string, assetId: string, patch: Partial<AssetItem>, by: string) {
  const cur = exitById(id)?.assets.find((a) => a.id === assetId); if (!cur) return
  const next = { ...cur, ...patch }
  const text = patch.state && patch.state !== cur.state ? `Marked ${cur.name} as ${patch.state.toLowerCase()}` : `Updated ${cur.name}`
  mut(id, by, text, (c) => ({ assets: c.assets.map((a) => (a.id === assetId ? { ...next, recovery: next.state === 'Damaged' || next.state === 'Missing' ? (patch.state && patch.recovery === undefined ? cur.value : next.recovery) : 0 } : a)) }), 'Exit asset updated', cur.state, next.state)
}
export function addRecovery(id: string, r: Omit<Recovery, 'id'>, by: string) { mut(id, by, `Added recovery: ${r.label} (${ngnx(r.recover)})`, (c) => ({ recoveries: [...c.recoveries, { ...r, id: uid('rc') }] }), 'Exit recovery added') }
export function setRecovery(id: string, rid: string, patch: Partial<Recovery>, by: string) { mut(id, by, 'Updated an amount to recover', (c) => ({ recoveries: c.recoveries.map((r) => (r.id === rid ? { ...r, ...patch } : r)) }), 'Exit recovery updated') }
export function removeRecovery(id: string, rid: string, by: string) { mut(id, by, 'Removed a recovery line', (c) => ({ recoveries: c.recoveries.filter((r) => r.id !== rid) }), 'Exit recovery removed') }
export function signOff(id: string, dept: string, status: ClearState, comment: string, by: string) {
  mut(id, by, `${dept}: ${status === 'Cleared' ? 'cleared' : status === 'Blocked' ? 'blocked clearance' : 'reset to pending'}${comment ? ` (${comment})` : ''}`, (c) => ({ clearance: c.clearance.map((s) => (s.dept === dept ? { ...s, status, comment, date: status === 'Pending' ? '' : TODAY } : s)) }), 'Clearance sign-off', dept, status)
}
export function toggleAccess(id: string, itemId: string, done: boolean, by: string) {
  mut(id, by, `${done ? 'Revoked' : 'Restored'}: ${exitById(id)?.access.find((a) => a.id === itemId)?.label}`, (c) => ({ access: c.access.map((a) => (a.id === itemId ? { ...a, done, by: done ? by : undefined, date: done ? TODAY : undefined } : a)) }), done ? 'Access revoked' : 'Access restored')
}
export function updateSettlement(id: string, patch: Partial<Settlement>, by: string, text = 'Updated the final settlement') {
  mut(id, by, text, (c) => ({ settlement: { ...c.settlement, ...patch, approval: c.settlement.approval?.status === 'Approved' && !('approval' in patch) ? null : (patch.approval ?? c.settlement.approval) } }), 'Final settlement updated')
}
export function approveSettlement(id: string, by: string) {
  const c = exitById(id); if (!c) return
  mut(id, by, `Approved the final settlement for payment (${ngnx(settle(c).net)})`, (x) => ({ settlement: { ...x.settlement, approval: { status: 'Approved', by, at: nowIso() } } }), 'Final settlement approved', undefined, ngnx(settle(c).net))
}
export function saveInterview(id: string, iv: Interview, by: string) { mut(id, by, iv.declined ? 'Recorded that the leaver declined the exit interview' : 'Saved the exit interview', () => ({ interview: iv, regretted: exitById(id)!.regretted }), 'Exit interview saved') }
export function completeExit(id: string, by: string) {
  const c = exitById(id); if (!c) return
  mut(id, by, 'Completed the exit. Access revoked and employee archived', (x) => ({ status: 'Completed' as ExitStatus, completedAt: nowIso(), settlement: { ...x.settlement, paidOn: x.settlement.paidOn || TODAY } }), 'Exit completed', c.status, 'Completed')
  recordAudit(c.tenant, 'Demo access revoked', undefined, c.name, { category: 'Exit', ref: id })
}
