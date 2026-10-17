import { useMemo, useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { applyCover, releaseCover, TODAY } from '../tasks/store'
import type { Task } from '../tasks/store'
import { employeesForTenant } from '../data/demo'
import type { Employee } from '../data/demo'

export const LEAVE_TYPES = ['Annual', 'Sick', 'Casual', 'Maternity/Paternity', 'Compassionate', 'Study', 'Unpaid'] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]
export const ENTITLEMENT: Record<LeaveType, number> = { Annual: 20, Sick: 12, Casual: 5, 'Maternity/Paternity': 90, Compassionate: 5, Study: 10, Unpaid: 30 }
export type LeaveStatus = 'Pending' | 'Approved' | 'Declined' | 'Cancelled' | 'Completed'

export type HandoverItem = { taskId: string; title: string; due: string; cover: string; note: string; canWait: boolean; why: string }
export type Handover = { items: HandoverItem[]; approvals: number; leads: number; note: string }
export type LeaveReq = {
  id: string; tenant: string; employee: string; empId: string; type: LeaveType; from: string; to: string; half?: 'AM' | 'PM'; days: number
  reason: string; relief: string; status: LeaveStatus; applied: string; handover: Handover
  decidedBy?: string; decidedAt?: string; comment?: string; returnedOn?: string; returnKind?: 'Scheduled end' | 'Early return' | 'Simulated return'; handback?: string
}
export type LeaveInput = Pick<LeaveReq, 'type' | 'from' | 'to' | 'half' | 'reason' | 'relief' | 'handover'>

/* ---------- dates and Nigerian public holidays ---------- */
const parse = (iso: string) => new Date(iso + 'T00:00:00Z')
export const addDays = (iso: string, n: number) => new Date(parse(iso).getTime() + n * 86400000).toISOString().slice(0, 10)
export const fmtDate = (iso: string) => parse(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const fmtShort = (iso: string) => parse(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const FIXED_HOLIDAYS: Record<string, string> = { '01-01': "New Year's Day", '05-01': "Workers' Day", '06-12': 'Democracy Day', '10-01': 'Independence Day', '12-25': 'Christmas Day', '12-26': 'Boxing Day' }
const MOVEABLE: Record<string, string> = {
  '2026-03-20': 'Eid al-Fitr', '2026-04-03': 'Good Friday', '2026-04-06': 'Easter Monday', '2026-05-27': 'Eid al-Adha', '2026-08-25': 'Eid-el-Maulud',
  '2027-03-10': 'Eid al-Fitr', '2027-03-26': 'Good Friday', '2027-03-29': 'Easter Monday', '2027-05-17': 'Eid al-Adha', '2027-08-14': 'Eid-el-Maulud',
}
export const holidayName = (iso: string) => MOVEABLE[iso] ?? FIXED_HOLIDAYS[iso.slice(5)]
export const isWeekend = (iso: string) => { const g = parse(iso).getUTCDay(); return g === 0 || g === 6 }
export const isWorkingDay = (iso: string) => !isWeekend(iso) && !holidayName(iso)
export function workingDays(from: string, to: string, half?: 'AM' | 'PM'): number {
  if (!from || !to || to < from) return 0
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d)) n++
  return half && from === to && n === 1 ? 0.5 : n
}
export const nextWorkingDay = (iso: string) => { let d = addDays(iso, 1); while (!isWorkingDay(d)) d = addDays(d, 1); return d }
const overlaps = (a: { from: string; to: string }, b: { from: string; to: string }) => a.from <= b.to && b.from <= a.to

/* The last day the person was actually away (an early return shortens the window). */
export const effectiveTo = (r: LeaveReq) => (r.status === 'Completed' && r.returnedOn ? (addDays(r.returnedOn, -1) < r.to ? addDays(r.returnedOn, -1) : r.to) : r.to)
export const isLive = (r: LeaveReq) => r.status === 'Approved' && r.from <= TODAY && TODAY <= r.to
export const handoverState = (r: LeaveReq): 'Awaiting approval' | 'Scheduled' | 'In effect' | 'Handed back' | 'Cancelled' =>
  r.status === 'Pending' ? 'Awaiting approval' : r.status === 'Approved' ? (r.from <= TODAY ? 'In effect' : 'Scheduled') : r.status === 'Completed' ? 'Handed back' : 'Cancelled'

/* ---------- seed ---------- */
const hash = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0)
const NONE: Handover = { items: [], approvals: 0, leads: 0, note: '' }
const item = (taskId: string, title: string, due: string, cover: string, note: string): HandoverItem => ({ taskId, title, due, cover, note, canWait: false, why: '' })
function req(id: string, tenant: string, employee: string, type: LeaveType, from: string, to: string, status: LeaveStatus, relief: string, reason: string, x: Partial<LeaveReq> = {}): LeaveReq {
  const e = employeesForTenant(tenant).find((y) => y.name === employee)
  return { id, tenant, employee, empId: e?.id ?? '', type, from, to, days: workingDays(from, to, x.half), reason, relief, status, applied: addDays(from, -10), handover: NONE, ...x }
}
function seed(): LeaveReq[] {
  const tsk = (id: string, due: string, title: string, cover: string, note: string) => item(id, title, due, cover, note)
  return [
    req('LV-1001', 'etranzact', 'Amaka Obi', 'Annual', '2026-10-07', '2026-10-16', 'Approved', 'Kunle Ogunleye', 'Family wedding in Enugu and a few days of rest.', {
      decidedBy: 'Kunle Ogunleye', decidedAt: '2026-10-05T09:30:00.000Z', comment: 'Approved. Kunle will cover the laptop handover.',
      handover: { items: [tsk('TSK-862', '2026-10-10', 'Confirm laptop handover with Ikeja IT', 'Kunle Ogunleye', 'Ikeja IT replies via Mrs Okeke. Asset tag AST-00418.'), tsk('TSK-838', '2026-10-15', 'Complete data-protection training', 'Kemi Balogun', 'Module 3 still pending, certificate goes to HR.'), tsk('TSK-834', '2026-10-30', 'Submit October timesheet', 'Kunle Ogunleye', 'Submit on 30 Oct if I am not yet back.')], approvals: 1, leads: 0, note: 'One pending asset approval, REQ-2271, is already with the MD. Nothing else is waiting on me.' } }),
    req('LV-1002', 'etranzact', 'Fatima Sule', 'Annual', '2026-10-05', '2026-10-16', 'Approved', 'Chisom Okeke', 'Annual rest before the Q4 push.', {
      decidedBy: 'Chisom Okeke', decidedAt: '2026-09-28T10:00:00.000Z', comment: 'Enjoy the break.',
      handover: { items: [], approvals: 1, leads: 1, note: 'Rivers Transit Authority negotiation: Chisom to keep the lead warm. Salary advance REQ-2285 is with HR.' } }),
    req('LV-1003', 'etranzact', 'Kemi Balogun', 'Annual', '2026-10-12', '2026-10-23', 'Pending', 'Kunle Ogunleye', 'Two weeks away for a family trip.', {
      handover: { items: [tsk('TSK-871', '2026-10-08', 'Upload signed pension forms for new hires', 'Kunle Ogunleye', 'Forms are in the Onboarding folder, three still need countersigning.')], approvals: 2, leads: 0, note: 'Two onboarding approvals will need an HR sign-off, Sarah to act as delegate.' } }),
    req('LV-1004', 'etranzact', 'Emmanuel Ojo', 'Sick', '2026-09-14', '2026-09-16', 'Completed', 'Ibrahim Musa', 'Malaria, doctor note attached.', { decidedBy: 'Ibrahim Musa', decidedAt: '2026-09-14T08:10:00.000Z', returnedOn: '2026-09-17', returnKind: 'Scheduled end', handback: 'All quiet while away.' }),
    req('LV-1005', 'etranzact', 'Chinedu Eze', 'Annual', '2026-10-26', '2026-10-30', 'Approved', 'Maryam Bello', 'Short break after month-end close.', {
      decidedBy: 'Oladapo Adebayo', decidedAt: '2026-10-06T14:00:00.000Z', comment: 'Fine, provided payroll is signed off first.',
      handover: { items: [tsk('TSK-868', '2026-10-09', 'Review October payroll variance report', 'Maryam Bello', 'Anything above 5% movement goes to the MD.'), tsk('TSK-843', '2026-10-06', 'Resolve Port Harcourt office payroll bank mismatch', 'Maryam Bello', 'Wema Bank rejected two accounts. Ask Port Harcourt HR for fresh details.')], approvals: 3, leads: 0, note: 'Payroll approvals REQ-2291 and REQ-2288 should clear before I leave.' } }),
    req('LV-1006', 'etranzact', 'Kunle Ogunleye', 'Casual', '2026-11-02', '2026-11-03', 'Pending', 'Amaka Obi', 'Personal errand in Kaduna.', {
      handover: { items: [tsk('TSK-846', '2026-10-17', 'Finalise Q4 hiring plan for Technology', 'Amaka Obi', 'Plan is due before I am back; Amina is co-owner.')], approvals: 0, leads: 0, note: '' } }),
    req('LV-1007', 'etranzact', 'Maryam Bello', 'Study', '2026-11-09', '2026-11-13', 'Declined', 'Chinedu Eze', 'ICAN professional exam week.', { decidedBy: 'Chinedu Eze', decidedAt: '2026-10-04T12:00:00.000Z', comment: 'Year-end audit prep overlaps. Please apply for the following week.' }),
    req('LV-1008', 'etranzact', 'Morenike Adebayo', 'Annual', '2026-12-22', '2027-01-05', 'Pending', 'Chisom Okeke', 'Christmas in the village.', { handover: { items: [], approvals: 1, leads: 3, note: 'Three open proposals: Chisom takes Nile Distribution and Rivers Transit Authority.' } }),
    req('LV-1009', 'etranzact', 'Gbenga Lawal', 'Compassionate', '2026-09-22', '2026-09-24', 'Completed', 'Chioma Nwosu', 'Bereavement in the family.', { decidedBy: 'Adaeze Nwankwo', decidedAt: '2026-09-22T07:50:00.000Z', returnedOn: '2026-09-25', returnKind: 'Scheduled end' }),
    req('LE-2001', 'etranzact', 'Aisha Mohammed', 'Annual', '2026-10-05', '2026-10-16', 'Approved', 'Precious Ibe', 'Annual leave.', { decidedBy: 'Femi Johnson', decidedAt: '2026-09-25T11:00:00.000Z', comment: 'Approved.', handover: { items: [], approvals: 0, leads: 0, note: 'Service quality audit report is complete. Precious to cover merchant escalations.' } }),
    req('LE-2002', 'etranzact', 'Samuel Udo', 'Annual', '2026-10-19', '2026-10-23', 'Pending', 'Yetunde Salami', 'Family holiday.', { handover: { items: [], approvals: 2, leads: 0, note: 'Treasury sweeps run automatically. Two settlement approvals will need Yetunde.' } }),
    req('LE-2003', 'etranzact', 'Fatima Sule', 'Sick', '2026-10-02', '2026-10-02', 'Completed', 'Emmanuel Ojo', 'Migraine.', { decidedBy: 'Tobi Adeyemi', decidedAt: '2026-10-02T08:00:00.000Z', returnedOn: '2026-10-05', returnKind: 'Scheduled end' }),
    req('LE-2004', 'etranzact', 'Rita Nnamani', 'Casual', '2026-11-05', '2026-11-05', 'Approved', 'Kabiru Abdullahi', 'Child school event.', { half: 'PM', decidedBy: 'Ibrahim Musa', decidedAt: '2026-10-07T13:00:00.000Z', comment: 'Approved.' }),
    req('LE-2005', 'etranzact', 'Kunle Ogunleye', 'Study', '2026-11-16', '2026-11-20', 'Pending', 'Chioma Nwosu', 'Cloud architecture certification.', { handover: { items: [], approvals: 1, leads: 0, note: 'On-call rota covered by Chioma.' } }),
  ]
}

/* ---------- store ---------- */
const KEY = 'bf-leave-v2'
let reqs: LeaveReq[] = (() => { try { const s = localStorage.getItem(KEY); if (s) { const all = JSON.parse(s) as LeaveReq[]; return all.some((r) => r.tenant === 'etranzact') ? all : [...all, ...seed()] } } catch { /* fall through */ } return seed() })()
const subs = new Set<() => void>()
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(reqs)) } catch { /* storage full */ } subs.forEach((f) => f()) }
const nowIso = () => new Date().toISOString()

/* Make sure approved handovers are reflected on the task board (idempotent) and finished leave is handed back. */
function reconcile() {
  let changed = false
  reqs = reqs.map((r) => {
    if (r.status === 'Approved' && r.to < TODAY) { changed = true; r.handover.items.forEach((i) => releaseCover(i.taskId, r.id, 'BizFlow', 'leave ended')); return { ...r, status: 'Completed' as const, returnedOn: nextWorkingDay(r.to), returnKind: 'Scheduled end' as const } }
    if (r.status === 'Approved') r.handover.items.filter((i) => i.cover && !i.canWait).forEach((i) => applyCover(i.taskId, { leaveId: r.id, leaver: r.employee, cover: i.cover, from: r.from, until: r.to }, r.decidedBy ?? 'BizFlow'))
    return r
  })
  if (changed) emit()
}
try { reconcile() } catch { /* tasks store unavailable */ }

export function useLeave(slug: string) {
  const all = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => reqs)
  return useMemo(() => all.filter((r) => r.tenant === slug), [all, slug])
}
const patch = (id: string, fn: (r: LeaveReq) => LeaveReq) => { reqs = reqs.map((r) => (r.id === id ? fn(r) : r)); emit() }
const audit = (r: LeaveReq, action: string, by: string, from?: string, to?: string) => recordAudit(r.tenant, action, from, to, { category: 'Leave', ref: r.id, actor: by })
const label = (r: LeaveReq) => `${r.employee}, ${r.type} leave ${fmtShort(r.from)} to ${fmtShort(r.to)}`

/* Used by attendance and performance: approved leave days (working days only) show as On leave. */
export function isOnLeave(slug: string | undefined, name: string, iso: string): boolean {
  if (!isWorkingDay(iso)) return false
  return reqs.some((r) => (!slug || r.tenant === slug) && r.employee === name && (r.status === 'Approved' || r.status === 'Completed') && !r.half && r.from <= iso && iso <= effectiveTo(r))
}
export const leaveOn = (list: LeaveReq[], name: string, from: string, to: string, ignoreId = '') =>
  list.find((r) => r.employee === name && r.id !== ignoreId && (r.status === 'Pending' || r.status === 'Approved') && overlaps(r, { from, to }))

/* ---------- balances ---------- */
export type Balance = { type: LeaveType; entitlement: number; used: number; pending: number; left: number }
const carried = (name: string, t: LeaveType) => (t === 'Annual' ? 2 + (hash(name) % 5) : t === 'Sick' ? hash(name) % 3 : t === 'Casual' ? hash(name) % 3 : 0)
export function balancesFor(list: LeaveReq[], name: string): Balance[] {
  const mine = list.filter((r) => r.employee === name && r.from.startsWith(TODAY.slice(0, 4)))
  return LEAVE_TYPES.map((type) => {
    const days = (r: LeaveReq) => (r.status === 'Completed' && r.returnedOn ? workingDays(r.from, effectiveTo(r), r.half) : r.days)
    const used = carried(name, type) + mine.filter((r) => r.type === type && (r.status === 'Approved' || r.status === 'Completed')).reduce((a, r) => a + days(r), 0)
    const pending = mine.filter((r) => r.type === type && r.status === 'Pending').reduce((a, r) => a + r.days, 0)
    return { type, entitlement: ENTITLEMENT[type], used, pending, left: ENTITLEMENT[type] - used - pending }
  })
}

/* ---------- handover helpers ---------- */
/* Open tasks the leaver owns that fall due, or are being worked on, during the leave window. */
export function affectedTasks(tasks: Task[], slug: string, name: string, to: string): Task[] {
  return tasks.filter((t) => t.tenant === slug && t.scope === 'Business' && t.assignees.includes(name) && t.status !== 'Done' && !(t.assignees.length > 0 && t.assignees.every((a) => a === t.creator)) && (t.due <= to || t.status !== 'To do'))
}
export const coverConflict = (list: LeaveReq[], cover: string, from: string, to: string, ignoreId = '') => leaveOn(list, cover, from, to, ignoreId)

export type Check = { ok: boolean; errors: string[]; warnings: string[] }
export function validate(list: LeaveReq[], name: string, i: LeaveInput, ignoreId = ''): Check {
  const errors: string[] = []; const warnings: string[] = []
  const days = workingDays(i.from, i.to, i.half)
  if (!i.from || !i.to) errors.push('Choose the first and last day of leave.')
  else if (i.to < i.from) errors.push('The last day cannot be before the first day.')
  else if (i.from < TODAY && i.type !== 'Sick') errors.push('Only sick leave can be back-dated. Choose a start date from today.')
  else if (days === 0) errors.push('The chosen dates are all weekends or public holidays, so no leave is needed.')
  if (i.half && i.from !== i.to) errors.push('A half day can only be taken on a single day.')
  const clash = i.from && i.to >= i.from ? leaveOn(list, name, i.from, i.to, ignoreId) : undefined
  if (clash) errors.push(`These dates overlap ${clash.id} (${clash.type}, ${fmtShort(clash.from)} to ${fmtShort(clash.to)}).`)
  const bal = balancesFor(list, name).find((b) => b.type === i.type)
  if (bal && i.type !== 'Unpaid' && days > bal.left) errors.push(`Not enough ${i.type.toLowerCase()} leave: ${days} day${days === 1 ? '' : 's'} requested, ${Math.max(0, bal.left)} available.`)
  if (bal && i.type === 'Unpaid' && days > bal.left) errors.push('Unpaid leave is capped at 30 days a year.')
  if (!i.reason.trim()) errors.push('Give a short reason for the leave.')
  if (!i.relief) errors.push('Choose a relief officer.')
  i.handover.items.forEach((h) => {
    if (h.canWait) { if (!h.why.trim()) errors.push(`${h.taskId}: say why this can wait until you return.`) }
    else if (!h.cover) errors.push(`${h.taskId}: choose who covers this task.`)
    else if (h.cover === name) errors.push(`${h.taskId}: you cannot cover your own task.`)
    else { const c = coverConflict(list, h.cover, i.from, i.to); if (c) warnings.push(`${h.cover} is also on leave ${fmtShort(c.from)} to ${fmtShort(c.to)}, so ${h.taskId} may be uncovered.`) }
  })
  if ((i.handover.approvals > 0 || i.handover.leads > 0) && !i.handover.note.trim()) errors.push('Add a handover note for your pending approvals and leads.')
  if (i.relief) { const c = coverConflict(list, i.relief, i.from, i.to); if (c) warnings.push(`Your relief officer ${i.relief} is on leave ${fmtShort(c.from)} to ${fmtShort(c.to)}.`) }
  return { ok: errors.length === 0, errors, warnings }
}

/* ---------- actions ---------- */
export function applyForLeave(slug: string, name: string, input: LeaveInput): { ok: boolean; error?: string; id?: string } {
  const chk = validate(reqs.filter((r) => r.tenant === slug), name, input)
  if (!chk.ok) return { ok: false, error: chk.errors[0] }
  const e = employeesForTenant(slug).find((x) => x.name === name)
  const prefix = slug === 'etranzact' ? 'LE-' : 'LV-'
  const n = Math.max(prefix === 'LE-' ? 2000 : 1000, ...reqs.filter((r) => r.id.startsWith(prefix)).map((r) => Number(r.id.slice(3)) || 0)) + 1
  const r: LeaveReq = { id: `${prefix}${n}`, tenant: slug, employee: name, empId: e?.id ?? '', ...input, days: workingDays(input.from, input.to, input.half), status: 'Pending', applied: TODAY }
  reqs = [r, ...reqs]; emit()
  audit(r, `Leave applied: ${label(r)} (${r.days} day${r.days === 1 ? '' : 's'})`, name, undefined, 'Pending')
  const covered = r.handover.items.filter((h) => !h.canWait).length
  if (r.handover.items.length) audit(r, `Handover submitted: ${covered} task${covered === 1 ? '' : 's'} with cover, ${r.handover.items.length - covered} can wait`, name, undefined, `Relief: ${r.relief}`)
  return { ok: true, id: r.id }
}

export function decideLeave(id: string, approve: boolean, by: string, comment: string) {
  const r = reqs.find((x) => x.id === id); if (!r || r.status !== 'Pending') return
  patch(id, (x) => ({ ...x, status: approve ? 'Approved' : 'Declined', decidedBy: by, decidedAt: nowIso(), comment }))
  if (approve) {
    audit(r, `Leave approved: ${label(r)}`, by, 'Pending', 'Approved')
    const live = r.handover.items.filter((h) => h.cover && !h.canWait)
    live.forEach((h) => applyCover(h.taskId, { leaveId: r.id, leaver: r.employee, cover: h.cover, from: r.from, until: r.to }, by))
    if (live.length) audit(r, `Handover assigned: ${live.map((h) => `${h.taskId} to ${h.cover}`).join(', ')}`, by, r.employee, [...new Set(live.map((h) => h.cover))].join(', '))
  } else audit(r, `Leave declined, handover cancelled: ${label(r)}${comment ? ` (${comment})` : ''}`, by, 'Pending', 'Declined')
}

export function cancelLeave(id: string, by: string) {
  const r = reqs.find((x) => x.id === id); if (!r || !(r.status === 'Pending' || (r.status === 'Approved' && r.from > TODAY))) return
  const was = r.status
  r.handover.items.forEach((h) => releaseCover(h.taskId, r.id, by, 'leave cancelled'))
  patch(id, (x) => ({ ...x, status: 'Cancelled' }))
  audit(r, `Leave cancelled: ${label(r)}`, by, was, 'Cancelled')
  if (was === 'Approved' && r.handover.items.length) audit(r, 'Handover cancelled, tasks stay with the original owner', by, undefined, r.employee)
}

/* Back at work: early return, or a simulated end of leave so handback can be shown on the fixed demo date. */
export function returnFromLeave(id: string, by: string, kind: 'Early return' | 'Simulated return', note = '') {
  const r = reqs.find((x) => x.id === id); if (!r || r.status !== 'Approved' || r.from > TODAY) return
  const back = kind === 'Early return' ? TODAY : nextWorkingDay(r.to)
  r.handover.items.forEach((h) => releaseCover(h.taskId, r.id, by, note))
  patch(id, (x) => ({ ...x, status: 'Completed', returnedOn: back, returnKind: kind, handback: note }))
  audit(r, `${kind}: ${r.employee} is back${kind === 'Early return' ? ' ahead of schedule' : ''}`, by, 'Approved', 'Completed')
  const n = r.handover.items.filter((h) => h.cover && !h.canWait).length
  audit(r, `Handback: ${n} task${n === 1 ? '' : 's'} returned to ${r.employee}, temporary cover released`, by, r.handover.items.map((h) => h.cover).filter(Boolean).join(', ') || undefined, r.employee)
}

export const resetLeave = () => { reqs = [...seed(), ...reqs.filter((r) => r.tenant !== 'etranzact')]; emit(); reconcile() }

/* ---------- people helpers ---------- */
export const employeeNamed = (slug: string, name: string): Employee | undefined => employeesForTenant(slug).find((e) => e.name === name)
export const managerOf = (slug: string, name: string) => employeeNamed(slug, name)?.manager ?? ''
