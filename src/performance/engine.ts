import { useMemo } from 'react'
import { EMPLOYEES, approvalsForTenant, employeesForTenant } from '../data/demo'
import type { Employee } from '../data/demo'
import { chainFor, policyOf } from '../approvals/flow'
import { isOverdue, isScored, pendingExtension, useTasks } from '../tasks/store'
import type { Task } from '../tasks/store'
import { isOnLeave } from '../leave/store'
import { clock, todayKey, useAttendance } from '../attendance/store'
import type { Rec } from '../attendance/store'

/* ---------- Targets and weights (shown to staff so the score is never a black box) ---------- */
export const TARGETS = { tasksOnTime: 85, punctuality: 90, attendance: 95, approvalSla: 80, approvalHours: 24, responseHours: 4 }
export const WEIGHTS = {
  staff: { tasks: 40, attendance: 30, engagement: 30, approvals: 0 },
  approver: { tasks: 30, attendance: 25, engagement: 20, approvals: 25 },
}
export type Period = 'Day' | 'Week' | 'Month' | 'Year'
export const PERIODS: Period[] = ['Day', 'Week', 'Month', 'Year']
export type Band = 'Excellent' | 'Good' | 'Needs attention' | 'At risk'
export const bandOf = (s: number): Band => (s >= 85 ? 'Excellent' : s >= 70 ? 'Good' : s >= 55 ? 'Needs attention' : 'At risk')
export const bandTone = (b: Band) => ({ Excellent: 'green', Good: 'blue', 'Needs attention': 'amber', 'At risk': 'red' } as const)[b]

/* ---------- Deterministic history (stands in for the company's recorded activity) ---------- */
const ANCHOR_MONDAY = Date.UTC(2026, 9, 5)
const DAY = 86400000
const WEEKS = 160
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))

export type Raw = {
  days: number; leave: number; present: number; onTime: number; lateMins: number; hours: number; flagged: number
  assigned: number; done: number; doneOnTime: number; lateDays: number
  handled: number; withinSla: number; waitHours: number; rejected: number; raised: number; returned: number
  comments: number; activeDays: number; respHours: number; respN: number
}
export const EMPTY_RAW: Raw = { days: 0, leave: 0, present: 0, onTime: 0, lateMins: 0, hours: 0, flagged: 0, assigned: 0, done: 0, doneOnTime: 0, lateDays: 0, handled: 0, withinSla: 0, waitHours: 0, rejected: 0, raised: 0, returned: 0, comments: 0, activeDays: 0, respHours: 0, respN: 0 }
export const addRaw = (a: Raw, b: Raw): Raw => { const o = { ...a }; (Object.keys(b) as (keyof Raw)[]).forEach((k) => { o[k] += b[k] }); return o }

export const isApprover = (e: Employee, all: Employee[]) =>
  all.some((x) => x.manager === e.name) || /audit|compliance|risk|legal|human|\bhr\b|manager|head|lead|director/i.test(`${e.role} ${e.dept}`)

type Week = { start: number; raw: Raw; daily: Raw[]; leaveAt: boolean[] }
type DayLog = { present: boolean; onTime: boolean; lateMins: number; flagged: boolean }
/* Spread a week's counts over its five weekdays so day, week, month and year views always add up. */
function splitDays(w: Raw, log: DayLog[], seed: number): { daily: Raw[]; leaveAt: boolean[] } {
  const r = rng(seed)
  const leaveStart = w.leave ? Math.floor(r() * (5 - w.leave + 1)) : 5
  const leaveAt = [0, 1, 2, 3, 4].map((i) => i >= leaveStart && i < leaveStart + w.leave)
  const work = [0, 1, 2, 3, 4].filter((i) => !leaveAt[i])
  const daily: Raw[] = [0, 1, 2, 3, 4].map(() => ({ ...EMPTY_RAW }))
  work.forEach((slot, n) => {
    const l = log[n]; const d = daily[slot]
    d.days = 1; d.present = l.present ? 1 : 0; d.onTime = l.onTime ? 1 : 0; d.lateMins = l.lateMins; d.flagged = l.flagged ? 1 : 0
  })
  leaveAt.forEach((on, i) => { if (on) daily[i].leave = 1 })
  const presentSlots = work.filter((i) => daily[i].present)
  const give = (key: keyof Raw, total: number, slots: number[], cap?: (i: number) => number) => {
    if (!slots.length) return
    const left = new Map(slots.map((i) => [i, cap ? cap(i) : Infinity]))
    for (let n = 0; n < total; n++) {
      const open = slots.filter((i) => (left.get(i) ?? 0) > 0)
      if (!open.length) return
      const i = open[Math.floor(r() * open.length)]
      daily[i][key] += 1; left.set(i, (left.get(i) ?? 0) - 1)
    }
  }
  const prop = (key: keyof Raw, total: number, by: keyof Raw) => {
    const sum = daily.reduce((a, d) => a + d[by], 0); if (!sum || !total) return
    let used = 0; const last = daily.map((d, i) => (d[by] ? i : -1)).filter((i) => i >= 0).pop() as number
    daily.forEach((d, i) => { if (!d[by]) return; const v = i === last ? total - used : Math.round((total * d[by]) / sum); d[key] = v; used += v })
  }
  give('assigned', w.assigned, work)
  give('done', w.done, work)
  give('doneOnTime', w.doneOnTime, work, (i) => daily[i].done)
  give('lateDays', w.lateDays, work.filter((i) => daily[i].done > daily[i].doneOnTime))
  give('handled', w.handled, work)
  give('withinSla', w.withinSla, work, (i) => daily[i].handled)
  give('rejected', w.rejected, work, (i) => daily[i].handled)
  prop('waitHours', w.waitHours, 'handled')
  give('raised', w.raised, work)
  give('returned', w.returned, work, (i) => daily[i].raised)
  give('comments', w.comments, presentSlots.length ? presentSlots : work)
  give('activeDays', w.activeDays, presentSlots, (i) => daily[i].present)
  give('respN', w.respN, work)
  prop('respHours', w.respHours, 'respN')
  const hs = daily.filter((d) => d.present); let hu = 0
  hs.forEach((d, n) => { const v = n === hs.length - 1 ? Math.round((w.hours - hu) * 10) / 10 : Math.round((w.hours / hs.length) * 10) / 10; d.hours = v; hu += v })
  return { daily, leaveAt }
}

const cache = new Map<string, Week[]>()
function weeksFor(e: Employee, approver: boolean): Week[] {
  if (!e.id.startsWith('ETZ-') || !EMPLOYEES.some((x) => x.id === e.id && x.name === e.name)) return [] // self-serve companies have no synthetic history
  const key = `${e.id}|${approver}|${e.status}`
  const hit = cache.get(key); if (hit) return hit
  const h = hash(e.id)
  const u = (n: number) => rng(h + n * 7919)()
  const trait = (n: number, lo: number, hi: number) => lo + (hi - lo) * Math.pow(u(n), 1.1)
  const dil = trait(1, 0.38, 0.98), pun = trait(2, 0.4, 0.99), res = trait(3, 0.3, 0.98), eng = trait(4, 0.35, 0.98)
  const drift = (u(5) - 0.45) * 0.0016
  const load = /sales|operations|technology/i.test(e.dept) ? 1.3 : 1
  const out: Week[] = []
  const recent = e.status === 'Onboarding' ? 2 : WEEKS
  for (let w = recent - 1; w >= 0; w--) {
    const start = ANCHOR_MONDAY - w * 7 * DAY
    const r = rng(h ^ (w * 2654435761))
    const t = (WEEKS - w) * drift
    const adj = (base: number) => clamp(base + t + (r() - 0.5) * 0.14, 0.2, 1)
    const onLeave = r() < 0.05
    const leave = onLeave ? 2 + Math.floor(r() * 3) : 0
    const days = 5 - leave
    let present = 0, onTime = 0, lateMins = 0, flagged = 0
    const dayLog: DayLog[] = []
    for (let d = 0; d < days; d++) {
      if (r() < 0.035 * (2 - dil)) { dayLog.push({ present: false, onTime: false, lateMins: 0, flagged: false }); continue }
      present++
      const ot = r() < adj(pun); let lm = 0
      if (ot) onTime++; else { lm = 6 + Math.floor(r() * 38); lateMins += lm }
      const fl = r() < 0.02 * (1.4 - pun)
      if (fl) flagged++
      dayLog.push({ present: true, onTime: ot, lateMins: lm, flagged: fl })
    }
    const assigned = Math.round((2 + r() * 4) * load)
    const done = Math.min(assigned + (r() < 0.2 ? 1 : 0), Math.round(assigned * adj(0.78 + dil * 0.22) + (r() < 0.3 ? 1 : 0)))
    const doneOnTime = Math.min(done, Math.round(done * adj(dil)))
    const lateDays = (done - doneOnTime) * (1 + Math.floor(r() * 4))
    const handled = approver ? Math.round(3 + r() * 9) : 0
    const withinSla = approver ? Math.min(handled, Math.round(handled * adj(res))) : 0
    const waitHours = approver ? Math.round(handled * (3 + (1 - adj(res)) * 52 + r() * 6)) : 0
    const rejected = approver ? Math.round(handled * 0.08 * r() * 2) : 0
    const raised = approver ? Math.round(r() * 2) : Math.round(r() * 3)
    const returned = Math.round(raised * (1 - dil) * r() * 1.6)
    const activeDays = Math.min(present, Math.round(present * adj(0.55 + eng * 0.45)))
    const comments = Math.round((assigned + handled * 0.4) * adj(eng) * (1 + r()))
    const respN = assigned + (approver ? Math.round(handled * 0.5) : 0)
    const respHours = respN ? Math.round(respN * (1.2 + (1 - adj(res)) * 22 + r() * 2)) : 0
    const hoursTotal = Math.round(present * (7.1 + r() * 1.3) * 10) / 10
    const weekRaw: Raw = { days, leave, present, onTime, lateMins, hours: hoursTotal, flagged, assigned, done, doneOnTime, lateDays, handled, withinSla, waitHours, rejected, raised, returned, comments, activeDays, respHours, respN }
    out.push({ start, raw: weekRaw, ...splitDays(weekRaw, dayLog, h ^ (w * 40503) ^ 0x9e3779b1) })
  }
  cache.set(key, out)
  return out
}

/* ---------- Scoring ---------- */
export type Card = {
  score: number; band: Band; hasData: boolean
  tasks: number; attendance: number; engagement: number; approvals: number | null
  k: {
    tasksOnTime: number; completion: number; avgLate: number; punctuality: number; attendanceRate: number; avgLateMins: number; avgHours: number
    sla: number; avgWait: number; handled: number; rejectRate: number; response: number; activeRate: number; comments: number; flagged: number; assigned: number; done: number; presentDays: number; lateArrivals: number
  }
}
const pct = (a: number, b: number, fallback = 100) => (b > 0 ? (a / b) * 100 : fallback)
export function scoreOf(raw: Raw, approver: boolean, minDays = 3): Card {
  const hasData = raw.days >= minDays
  const tasksOnTime = pct(raw.doneOnTime, raw.done)
  const completion = pct(raw.done, raw.assigned)
  const tasks = clamp(tasksOnTime * 0.6 + completion * 0.4)
  const attendanceRate = pct(raw.present, raw.days)
  const punctuality = pct(raw.onTime, raw.present)
  const attendance = clamp(attendanceRate * 0.5 + punctuality * 0.5)
  const avgWait = raw.handled ? raw.waitHours / raw.handled : 0
  const sla = pct(raw.withinSla, raw.handled)
  const approvals = approver && raw.handled ? clamp(sla * 0.6 + clamp(100 - Math.max(0, avgWait - 8) * 2.5) * 0.4) : null
  const response = raw.respN ? raw.respHours / raw.respN : 0
  const activeRate = pct(raw.activeDays, raw.present)
  const collab = clamp((raw.comments / Math.max(1, raw.assigned + raw.handled * 0.5)) * 55)
  const engagement = clamp(activeRate * 0.4 + clamp(100 - Math.max(0, response - TARGETS.responseHours) * 3.5) * 0.4 + collab * 0.2)
  const w = approver && approvals != null ? WEIGHTS.approver : WEIGHTS.staff
  const score = Math.round((tasks * w.tasks + attendance * w.attendance + engagement * w.engagement + (approvals ?? 0) * w.approvals) / 100)
  return {
    score, band: bandOf(score), hasData, tasks: Math.round(tasks), attendance: Math.round(attendance), engagement: Math.round(engagement), approvals: approvals == null ? null : Math.round(approvals),
    k: { tasksOnTime, completion, avgLate: raw.done - raw.doneOnTime ? raw.lateDays / (raw.done - raw.doneOnTime) : 0, punctuality, attendanceRate, avgLateMins: raw.present - raw.onTime ? raw.lateMins / (raw.present - raw.onTime) : 0, avgHours: raw.present ? raw.hours / raw.present : 0, sla, avgWait, handled: raw.handled, rejectRate: pct(raw.rejected, raw.handled, 0), response, activeRate, comments: raw.comments, flagged: raw.flagged, assigned: raw.assigned, done: raw.done, presentDays: raw.present, lateArrivals: raw.present - raw.onTime },
  }
}

/* ---------- Periods ---------- */
export type Bucket = { label: string; long: string; raw: Raw; card: Card; partial: boolean }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDay = (ms: number) => { const d = new Date(ms); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` }
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayLong = (ms: number) => { const d = new Date(ms); return `${WD[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` }
export const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const LAST_RECORDED = isoOf(ANCHOR_MONDAY + 4 * DAY)

export type DayKind = 'Working' | 'Leave' | 'Weekend' | 'Absent' | 'Future' | 'NoRecord'
export type DayView = { date: string; long: string; kind: DayKind; raw: Raw; card: Card; clockIn?: string; clockOut?: string; lateMins: number }
/* One calendar day from the recorded history. Weekends and days before the person started have no record. */
export function dayFor(e: Employee, approver: boolean, iso: string): DayView {
  const ms = Date.parse(iso + 'T00:00:00Z')
  const dow = (new Date(ms).getUTCDay() + 6) % 7
  const base = { date: iso, long: dayLong(ms), raw: EMPTY_RAW, card: scoreOf(EMPTY_RAW, approver, 1), lateMins: 0 }
  if (dow > 4) return { ...base, kind: 'Weekend' }
  if (iso > LAST_RECORDED) return { ...base, kind: 'Future' }
  const wk = weeksFor(e, approver).find((w) => w.start === ms - dow * DAY)
  if (!wk) return { ...base, kind: 'NoRecord' }
  const raw = wk.daily[dow]
  if (wk.leaveAt[dow]) return { ...base, kind: 'Leave', raw }
  const card = scoreOf(raw, approver, 1)
  if (!raw.present) return { ...base, kind: 'Absent', raw, card }
  const inMin = raw.onTime ? 7 * 60 + 48 + (hash(`${e.id}|${iso}`) % 38) : 8 * 60 + 45 + raw.lateMins
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { ...base, kind: 'Working', raw, card, lateMins: raw.lateMins, clockIn: hhmm(inMin), clockOut: hhmm(inMin + Math.round(raw.hours * 60)) }
}

export type DayAtt = { label: 'On time' | 'Late' | 'Absent' | 'On leave' | 'Weekend' | 'Not in yet' | 'Upcoming' | 'No record'; tone: 'green' | 'amber' | 'red' | 'blue' | 'gray'; in?: string; out?: string; hours?: number; site?: string; lateMins: number; rec?: Rec }
/* Attendance for one person on one day: a real clock-in when one exists, otherwise the recorded history. */
export function attendanceOn(e: Employee, approver: boolean, iso: string, records: Rec[]): DayAtt {
  const rec = records.find((x) => x.empId === e.id && x.date === iso)
  if (rec) {
    const hours = rec.out ? (new Date(rec.out.t).getTime() - new Date(rec.in.t).getTime()) / 3.6e6 : undefined
    return { label: rec.status, tone: rec.status === 'Late' ? 'amber' : 'green', in: clock(rec.in.t), out: rec.out ? clock(rec.out.t) : undefined, hours, site: rec.in.site, lateMins: rec.minutesLate, rec }
  }
  if (isOnLeave(undefined, e.name, iso)) return { label: 'On leave', tone: 'blue', lateMins: 0 }
  const dv = dayFor(e, approver, iso)
  if (dv.kind === 'Weekend') return { label: 'Weekend', tone: 'gray', lateMins: 0 }
  if (dv.kind === 'Leave') return { label: 'On leave', tone: 'blue', lateMins: 0 }
  if (dv.kind === 'Absent') return { label: 'Absent', tone: 'red', lateMins: 0 }
  if (dv.kind === 'Working') return { label: dv.raw.onTime ? 'On time' : 'Late', tone: dv.raw.onTime ? 'green' : 'amber', in: dv.clockIn, out: dv.clockOut, hours: dv.raw.hours, lateMins: dv.lateMins }
  if (iso === todayKey()) return { label: 'Not in yet', tone: 'gray', lateMins: 0 }
  return { label: dv.kind === 'Future' ? 'Upcoming' : 'No record', tone: 'gray', lateMins: 0 }
}

export function bucketsFor(e: Employee, approver: boolean, period: Period, count = period === 'Day' ? 14 : period === 'Week' ? 12 : period === 'Month' ? 12 : 3): Bucket[] {
  const weeks = weeksFor(e, approver)
  if (!weeks.length) return []
  if (period === 'Day') {
    const days = weeks.slice(-4).flatMap((w) => w.daily.map((raw, i) => ({ ms: w.start + i * DAY, raw })))
    return days.slice(-count).map((x, n, arr) => ({ label: `${WD[(new Date(x.ms).getUTCDay() + 6) % 7]} ${new Date(x.ms).getUTCDate()}`, long: dayLong(x.ms), raw: x.raw, card: scoreOf(x.raw, approver, 1), partial: n === arr.length - 1 }))
  }
  const key = (w: Week) => { const d = new Date(w.start); return period === 'Week' ? String(w.start) : period === 'Month' ? `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2, '0')}` : String(d.getUTCFullYear()) }
  const groups = new Map<string, Week[]>()
  weeks.forEach((w) => { const k = key(w); groups.set(k, [...(groups.get(k) ?? []), w]) })
  const lastKey = key(weeks[weeks.length - 1])
  return [...groups.entries()].slice(-count).map(([k, ws]) => {
    const raw = ws.reduce((a, w) => addRaw(a, w.raw), EMPTY_RAW)
    const d = new Date(ws[0].start)
    const label = period === 'Week' ? fmtDay(ws[0].start) : period === 'Month' ? MONTHS[d.getUTCMonth()] : String(d.getUTCFullYear())
    const long = period === 'Week' ? `Week of ${fmtDay(ws[0].start)}` : period === 'Month' ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : String(d.getUTCFullYear())
    return { label, long, raw, card: scoreOf(raw, approver), partial: k === lastKey }
  })
}

/* ---------- Live signals from the real task, attendance and approval records ---------- */
export type Live = {
  personal: Task[]; joint: Task[]; open: Task[]; overdue: Task[]; blocked: Task[]; dueSoon: Task[]; doneRecent: number
  today: { status: string; detail: string } | null
  waiting: { id: string; type: string; who: string; days: number; step: string }[]
}
const stepOwner = (step: string, e: Employee, req: { who: string }, all: Employee[]) => {
  if (step === 'Manager') return all.find((x) => x.name === req.who)?.manager === e.name
  if (step === 'Audit') return /audit/i.test(e.dept)
  if (step === 'Compliance') return /compliance|risk/i.test(e.dept)
  if (step === 'HR') return /hr|human|people/i.test(e.dept)
  if (step === 'Legal') return /legal/i.test(e.dept)
  return /managing director|chief executive/i.test(e.role)
}
const dayDiff = (label: string) => { const [d, m] = label.split(' '); return Math.max(0, Math.round((Date.UTC(2026, 9, 11) - Date.UTC(2026, MONTHS.indexOf(m), Number(d))) / DAY)) }

export function usePerformance(slug: string) {
  const tasks = useTasks()
  const { records } = useAttendance(slug)
  const employees = useMemo(() => employeesForTenant(slug), [slug])
  return useMemo(() => {
    const reqs = approvalsForTenant(slug).filter((r) => r.stage === 'Pending')
    const policy = policyOf(slug)
    const staff = employees.map((e) => {
      const approver = isApprover(e, employees)
      const own = tasks.filter((t) => t.tenant === slug && t.assignees.includes(e.name))
      const mine = own.filter(isScored)
      const personal = own.filter((t) => !isScored(t) && t.status !== 'Done')
      const joint = tasks.filter((t) => t.tenant === slug && t.collaborators.includes(e.name) && !t.assignees.includes(e.name) && t.status !== 'Done')
      const open = mine.filter((t) => t.status !== 'Done')
      const overdue = open.filter(isOverdue).filter((t) => !t.covers?.some((c) => c.leaver === e.name && t.due >= c.from && t.due <= c.until)) // due on a covered leave day: not counted against the leaver
      const rec = records.find((r) => r.empId === e.id && r.date === todayKey())
      const waiting = reqs.flatMap((r) => {
        const step = chainFor(r, policy).find((s) => !r.done.includes(s))
        return step && stepOwner(step, e, r, employees) ? [{ id: r.id, type: r.type, who: r.who, days: dayDiff(r.date), step }] : []
      })
      const live: Live = {
        personal, joint, open, overdue, blocked: open.filter((t) => t.status === 'Blocked'), dueSoon: open.filter((t) => !isOverdue(t) && t.due <= '2026-10-12'),
        doneRecent: mine.filter((t) => t.status === 'Done').length,
        today: rec ? { status: rec.status, detail: `Checked in ${new Date(rec.in.t).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })} at ${rec.in.site}${rec.minutesLate ? `, ${rec.minutesLate} min late` : ''}` } : null,
        waiting,
      }
      return { e, approver, live }
    })
    return { employees, staff }
  }, [slug, tasks, records, employees])
}

/* Current-period card with the live penalty for work that is overdue right now. */
export const livePenalty = (live: Live) => Math.min(15, live.overdue.filter((t) => !pendingExtension(t)).length * 4 + live.waiting.filter((w) => w.days >= 3).length * 3)

/* ---------- Visibility ---------- */
export function reportsOf(name: string, all: Employee[], seen = new Set<string>()): Employee[] {
  const direct = all.filter((x) => x.manager === name && !seen.has(x.id))
  direct.forEach((x) => seen.add(x.id))
  return [...direct, ...direct.flatMap((x) => reportsOf(x.name, all, seen))]
}
export function visibleStaff(all: Employee[], me: { name: string; id: string; full: boolean }): { list: Employee[]; scope: 'Everyone' | 'Your team' | 'Only you' } {
  if (me.full) return { list: all, scope: 'Everyone' }
  const team = reportsOf(me.name, all)
  if (team.length) return { list: [...all.filter((x) => x.id === me.id || x.name === me.name), ...team], scope: 'Your team' }
  return { list: all.filter((x) => x.id === me.id || x.name === me.name), scope: 'Only you' }
}

/* ---------- Plain-language insights ---------- */
export type Insight = { tone: 'good' | 'warn' | 'bad'; text: string; action?: string }
export function insightsFor(c: Card, prev: Card | undefined, live: Live, approver: boolean): Insight[] {
  const k = c.k; const out: Insight[] = []
  if (!c.hasData) return [{ tone: 'warn', text: 'No recorded activity yet for this period.' }]
  if (k.tasksOnTime >= TARGETS.tasksOnTime && k.assigned) out.push({ tone: 'good', text: `${Math.round(k.tasksOnTime)}% of finished tasks were on time (target ${TARGETS.tasksOnTime}%).` })
  else if (k.assigned) out.push({ tone: k.tasksOnTime < 70 ? 'bad' : 'warn', text: `Only ${Math.round(k.tasksOnTime)}% of finished tasks met their due date${k.avgLate ? `; late ones ran ${k.avgLate.toFixed(1)} days over` : ''}.`, action: 'Review workload and due dates with them' })
  if (k.punctuality < TARGETS.punctuality) out.push({ tone: k.punctuality < 75 ? 'bad' : 'warn', text: `Arrived late on ${k.lateArrivals} of ${k.presentDays} working day${k.presentDays === 1 ? '' : 's'}${k.avgLateMins ? ` (about ${Math.round(k.avgLateMins)} min each)` : ''}.`, action: 'Agree a start-time plan or check the commute and shift' })
  else out.push({ tone: 'good', text: `Punctual on ${Math.round(k.punctuality)}% of working days.` })
  if (k.attendanceRate < TARGETS.attendance) out.push({ tone: k.attendanceRate < 85 ? 'bad' : 'warn', text: `Unplanned absence: present on ${Math.round(k.attendanceRate)}% of expected days (leave excluded).` })
  if (approver && k.handled) {
    if (k.avgWait > TARGETS.approvalHours) out.push({ tone: 'bad', text: `Approvals wait ${Math.round(k.avgWait)}h on average with them, and ${Math.round(100 - k.sla)}% miss the ${TARGETS.approvalHours}h target. This holds up the people behind them.`, action: 'Nominate a deputy or set a daily approval slot' })
    else if (k.sla >= TARGETS.approvalSla) out.push({ tone: 'good', text: `Approvals are quick: ${Math.round(k.sla)}% decided within ${TARGETS.approvalHours}h (avg ${Math.round(k.avgWait)}h).` })
    else out.push({ tone: 'warn', text: `${Math.round(k.sla)}% of approvals met the ${TARGETS.approvalHours}h target (avg ${Math.round(k.avgWait)}h).` })
  }
  if (k.response > 12) out.push({ tone: 'warn', text: `Takes about ${Math.round(k.response)}h to first act on new work (target under ${TARGETS.responseHours}h).` })
  if (live.overdue.length) out.push({ tone: 'bad', text: `${live.overdue.length} open task${live.overdue.length > 1 ? 's are' : ' is'} overdue right now.`, action: 'Reassign or re-plan overdue tasks' })
  if (live.blocked.length) out.push({ tone: 'warn', text: `${live.blocked.length} task${live.blocked.length > 1 ? 's are' : ' is'} blocked and waiting on someone else.`, action: 'Unblock: find out who they are waiting for' })
  const stale = live.waiting.filter((w) => w.days >= 3)
  if (stale.length) out.push({ tone: 'bad', text: `${stale.length} request${stale.length > 1 ? 's' : ''} waiting ${Math.max(...stale.map((s) => s.days))}+ days for their decision.`, action: 'Ask them to decide or hand over' })
  if (prev?.hasData) {
    const delta = c.score - prev.score
    if (delta >= 5) out.push({ tone: 'good', text: `Score is up ${delta} points on the previous period.` })
    else if (delta <= -5) out.push({ tone: 'bad', text: `Score is down ${Math.abs(delta)} points on the previous period.`, action: 'Have a check-in to understand what changed' })
  }
  return out
}

export const fmtPct = (n: number) => `${Math.round(n)}%`
export const fmtHours = (n: number) => (n < 1 ? '<1h' : n >= 48 ? `${(n / 24).toFixed(1)}d` : `${Math.round(n)}h`)
