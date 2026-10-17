import { useMemo, useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { deptOfUser, isStaffManager, staffInDept } from '../pages/admin/roles'

export const STATUSES = ['To do', 'In progress', 'In review', 'Blocked', 'Done'] as const
export const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const
export type TaskStatus = (typeof STATUSES)[number]
export type Priority = (typeof PRIORITIES)[number]
export type Task = {
  id: string; title: string; desc: string; status: TaskStatus; priority: Priority
  assignees: string[]; collaborators: string[]; extensions: Extension[]; creator: string; due: string; scope: 'Platform' | 'Business'; tenant: string; related: string
  created: string; comments: { id: string; at: string; by: string; text: string }[]; history: { at: string; by: string; text: string }[]
  covers?: TaskCover[]
  /* Platform tasks belong to a staff department. handoff = created for a department other than the creator's. */
  dept?: string; team?: string; category?: string; handoff?: boolean; handoffFrom?: string
  /* Position within a board column (ascending). */
  order?: number
}
/* Temporary leave cover: the cover person joins as a joint executor (not assigned, not scored) until the leaver returns. */
export type TaskCover = { leaveId: string; leaver: string; cover: string; from: string; until: string; wasCollab: boolean }
export type Extension = {
  id: string; by: string; at: string; fromDue: string; toDue: string; reason: string
  status: 'Pending' | 'Approved' | 'Declined'; decidedBy?: string; decidedAt?: string; note?: string
}
export type TaskActivity = {
  id: string; taskId: string; title: string; scope: Task['scope']; tenant: string; at: string; by: string; text: string
}

/* Fill department, handoff and order on any task (seed data or older persisted data). Existing values win. */
function normalize(t: Task, i: number): Task {
  const platform = t.scope === 'Platform'
  const dept = platform ? t.dept ?? deptOfUser(t.assignees[0] ?? '') ?? deptOfUser(t.creator) ?? 'Executive' : t.dept
  const from = deptOfUser(t.creator)
  const handoff = t.handoff ?? (platform && !!from && dept !== from)
  return { ...t, dept, handoff, handoffFrom: t.handoffFrom ?? (handoff ? from : undefined), order: typeof t.order === 'number' ? t.order : i * 1000 }
}

/* Demo "today" so due-date states are stable in the prototype */
export const TODAY = '2026-10-08'
const d = (n: number) => new Date(Date.UTC(2026, 9, 8 + n)).toISOString().slice(0, 10)
const T = (id: string, scope: Task['scope'], tenant: string, title: string, status: TaskStatus, priority: Priority, assigned: string | string[], creator: string, due: number, related: string, desc = ''): Task => {
  const assignees = Array.isArray(assigned) ? assigned : [assigned]
  return {
    id, scope, tenant, title, status, priority, assignees, collaborators: [], extensions: [], creator, due: d(due), related, desc, created: d(-9),
    comments: status === 'Blocked' ? [{ id: id + 'c', at: new Date(Date.UTC(2026, 9, 6, 11, 20)).toISOString(), by: assignees[0], text: 'Waiting on the other team before I can continue.' }] : [],
    history: [{ at: new Date(Date.UTC(2026, 9, 1, 9, 0)).toISOString(), by: creator, text: `created this task and assigned it to ${assignees.join(', ')}` }],
  }
}

const withExtras = (list: Task[]): Task[] => list.map((t) => {
  if (t.id === 'TSK-862') return { ...t, collaborators: ['Kemi Balogun'], extensions: [{ id: 'x1', by: 'Amaka Obi', at: new Date(Date.UTC(2026, 9, 7, 15, 10)).toISOString(), fromDue: t.due, toDue: d(7), reason: 'Ikeja IT cannot confirm a handover slot until next week. I will hand over the laptop as soon as they reply.', status: 'Pending' as const }] }
  if (t.id === 'TSK-849') return { ...t, collaborators: ['Amaka Obi'] }
  if (t.id === 'TSK-846') return { ...t, assignees: ['Kunle Ogunleye'], collaborators: ['Kemi Balogun'] }
  return t
})
const finalize = (list: Task[]): Task[] => list.map((t, i) => normalize(t, i))
const seed = (): Task[] => finalize(withExtras([
  T('TSK-871', 'Business', 'etranzact', 'Upload signed pension forms for new hires', 'In progress', 'High', 'Kemi Balogun', 'Kemi Balogun', 0, 'Onboarding · Maryam Bello', 'PFA forms for the November intake. Upload to the employee record once countersigned.'),
  T('TSK-868', 'Business', 'etranzact', 'Review October payroll variance report', 'To do', 'High', 'Chinedu Eze', 'Chinedu Eze', 1, 'Payroll · Oct 2026', 'Check anything above 5% movement against September.'),
  T('TSK-862', 'Business', 'etranzact', 'Confirm laptop handover with Ikeja IT', 'To do', 'Normal', 'Amaka Obi', 'Kunle Ogunleye', 2, 'Asset · AST-00418'),
  T('TSK-855', 'Business', 'etranzact', 'Renew Hiace insurance before expiry', 'To do', 'Urgent', 'Ibrahim Musa', 'Ibrahim Musa', 6, 'Fleet · ABJ-904-GW', 'Quote from AXA Mansard received. Needs MD approval.'),
  T('TSK-849', 'Business', 'etranzact', 'Approve daily settlement exception batch', 'In review', 'High', 'Nneka Okafor', 'Emmanuel Ojo', 0, 'Approval · ETZ-REQ-431'),
  T('TSK-846', 'Business', 'etranzact', 'Finalise Q4 hiring plan for Technology', 'In progress', 'Normal', ['Kunle Ogunleye', 'Kemi Balogun'], 'Oladapo Adebayo', 9, 'People · Technology'),
  T('TSK-843', 'Business', 'etranzact', 'Resolve Port Harcourt office payroll bank mismatch', 'Blocked', 'High', 'Chinedu Eze', 'Chinedu Eze', -2, 'Payroll · Port Harcourt', 'Two accounts rejected by Wema Bank.'),
  T('TSK-840', 'Business', 'etranzact', 'Prepare Q3 branch cost-centre summary', 'Done', 'Normal', 'Chinedu Eze', 'Chinedu Eze', -6, 'Reports'),
  T('TSK-838', 'Business', 'etranzact', 'Complete data-protection training', 'To do', 'Low', 'Amaka Obi', 'Kemi Balogun', 7, 'Compliance'),
  T('TSK-834', 'Business', 'etranzact', 'Submit October timesheet', 'In progress', 'Normal', 'Amaka Obi', 'Kunle Ogunleye', 22, 'Attendance · Oct 2026'),
  T('TSK-830', 'Business', 'etranzact', 'Update employee handbook leave section', 'Done', 'Low', 'Kemi Balogun', 'Nneka Okafor', -4, 'People · Policy'),
  T('TSK-826', 'Business', 'etranzact', 'Audit user roles before month-end', 'To do', 'Normal', 'Nneka Okafor', 'Nneka Okafor', 12, 'Settings · Users'),

  T('PTK-120', 'Platform', 'etranzact', 'Confirm add-on bank transfer', 'In progress', 'Urgent', 'Ngozi Eze', 'Seun Adeyemi', 0, 'eTranzact International Plc · Add-on invoice', 'Customer sent payment evidence. Finance is matching the settlement reference.'),
  T('PTK-118', 'Platform', 'etranzact', 'Retry workspace provisioning', 'Blocked', 'Urgent', 'Dayo Martins', 'Folake Bankole', -1, 'eTranzact International Plc · Port Harcourt office', 'Paystack confirmed payment. Provisioning job failed at module activation.'),
  T('PTK-116', 'Platform', 'etranzact', 'Prepare enterprise renewal quote', 'In review', 'High', 'Seun Adeyemi', 'Folake Bankole', 3, 'eTranzact International Plc · Renewal'),
  T('PTK-113', 'Platform', 'etranzact', 'Import 127 employees from CSV', 'In progress', 'Normal', 'Dayo Martins', 'Dayo Martins', 2, 'eTranzact International Plc · People import'),
  T('PTK-108', 'Platform', 'etranzact', 'Review support session audit trail', 'To do', 'Low', 'Folake Bankole', 'Folake Bankole', 8, 'eTranzact International Plc'),
  T('PTK-105', 'Platform', 'platform', 'Reconcile September Paystack settlements', 'In progress', 'High', 'Ngozi Eze', 'Ngozi Eze', 1, 'Finance · Reconciliation'),
  T('PTK-102', 'Platform', 'platform', 'Publish updated VAT configuration notice', 'Done', 'Normal', 'Folake Bankole', 'Folake Bankole', -3, 'Finance · Currency and tax'),
  T('PTK-099', 'Platform', 'platform', 'Quarterly access review of platform users', 'To do', 'Normal', 'Folake Bankole', 'Folake Bankole', 14, 'Platform users'),
]))

type S = { tasks: Task[]; activity: TaskActivity[]; seq: number }
const KEY = 'bf-tasks-v3'
const OLD_KEY = 'bf-tasks-v2'
const activityFrom = (tasks: Task[]): TaskActivity[] => tasks.flatMap((task) => [
  ...task.history.map((item, index) => ({ id: `${task.id}-h-${index}`, taskId: task.id, title: task.title, scope: task.scope, tenant: task.tenant, ...item })),
  ...task.comments.map((item) => ({ id: `${task.id}-c-${item.id}`, taskId: task.id, title: task.title, scope: task.scope, tenant: task.tenant, at: item.at, by: item.by, text: `commented: "${item.text}"` })),
]).sort((a, b) => b.at.localeCompare(a.at))
const load = (): S => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || 'null')
    if (s?.tasks?.length) {
      const tasks = (s.tasks as Task[]).filter((task) => !!task.tenant).map((task: Task & { assignee?: string }) => {
        const { assignee, ...rest } = task
        return { ...rest, assignees: task.assignees?.length ? task.assignees : assignee ? [assignee] : [], collaborators: task.collaborators ?? [], extensions: task.extensions ?? [] }
      }).map((task, i) => normalize(task, i))
      return {
        ...s,
        tasks,
        activity: s.activity?.length ? s.activity : activityFrom(tasks),
      }
    }
  } catch { /* ignore */ }
  const tasks = seed()
  return { tasks, activity: activityFrom(tasks), seq: 1 }
}
let state = load()
const subs = new Set<() => void>()
const set = (s: S) => { state = s; try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } subs.forEach((f) => f()) }
export const useTasks = () => useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l) }, () => state).tasks
export const useTaskActivity = () => useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l) }, () => state).activity
/* ---- Visibility and rights. Enforced here, not only in the UI. ---- */
const involved = (t: Task, name: string) => t.assignees.includes(name) || t.collaborators.includes(name) || t.creator === name
export function canViewTask(t: Task, name: string) {
  if (t.scope !== 'Platform') return true
  return involved(t, name) || isStaffManager(name) || (!!t.dept && t.dept === deptOfUser(name))
}
export function canEditTask(t: Task, name: string) {
  if (t.scope !== 'Platform') return true
  return canViewTask(t, name) && (t.assignees.includes(name) || t.collaborators.includes(name) || isStaffManager(name))
}
export const visibleTasks = (tasks: Task[], name: string) => tasks.filter((t) => canViewTask(t, name))
export function useVisibleTasks(name: string) {
  const all = useTasks()
  return useMemo(() => visibleTasks(all, name), [all, name])
}
export const byOrder = (a: Task, b: Task) => (a.order ?? 0) - (b.order ?? 0) || a.due.localeCompare(b.due)

export const WIP_LIMIT = 4
/* Why a task cannot move into a status, or null when allowed. Reordering inside a column is always fine. */
export function moveBlockReason(id: string, to: TaskStatus, by: string): string | null {
  const t = state.tasks.find((x) => x.id === id)
  if (!t) return 'This task no longer exists.'
  if (!canViewTask(t, by)) return 'You cannot see this task.'
  if (!canEditTask(t, by)) return 'Only assigned staff or a manager can move this task.'
  if (t.status === to) return null
  if (to === 'In progress') {
    const full = t.assignees.find((a) => state.tasks.filter((x) => x.id !== id && x.scope === t.scope && x.tenant === t.tenant && x.status === 'In progress' && x.assignees.includes(a)).length >= WIP_LIMIT)
    if (full) return `${full} already has ${WIP_LIMIT} tasks in progress (WIP limit). Finish one first.`
  }
  return null
}

export const resetTasks = () => { const tasks = seed(); set({ tasks, activity: activityFrom(tasks), seq: 1 }) }

const now = () => new Date().toISOString()
const put = (id: string, f: (t: Task) => Task) => set({ ...state, tasks: state.tasks.map((t) => (t.id === id ? f(t) : t)) })
const audit = (t: Task, action: string, from?: string, to?: string) => recordAudit(t.tenant, `Task ${t.id}: ${action}`, from, to, { category: 'Tasks', ref: t.id })
const addActivity = (t: Task, by: string, text: string, at = now()) => set({ ...state, activity: [{ id: `${t.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, taskId: t.id, title: t.title, scope: t.scope, tenant: t.tenant, at, by, text }, ...state.activity] })

const t0 = (scope: Task['scope'], dept: string | undefined, handoff: boolean, from?: string) => scope === 'Platform' && dept ? (handoff ? ` as a handoff from ${from} to ${dept}` : ` in ${dept}`) : ''

export function createTask(p: Pick<Task, 'title' | 'desc' | 'priority' | 'assignees' | 'due' | 'related' | 'scope' | 'tenant'> & { collaborators?: string[]; creator: string; status?: TaskStatus; dept?: string; team?: string; category?: string }): Task {
  const id = (p.scope === 'Platform' ? 'PTK-' : 'TSK-') + (950 + state.seq)
  let { assignees, dept } = p
  let handoff = false
  const creatorDept = deptOfUser(p.creator)
  if (p.scope === 'Platform') {
    /* Only managers may create work for another department; everyone else is kept in their own. */
    dept = (isStaffManager(p.creator) ? p.dept : undefined) ?? creatorDept ?? 'Executive'
    const pool = staffInDept(dept)
    assignees = assignees.filter((n) => pool.includes(n))
    if (!assignees.length) assignees = pool.includes(p.creator) ? [p.creator] : pool.slice(0, 1)
    handoff = !!creatorDept && dept !== creatorDept
  }
  const collaborators = (p.collaborators ?? []).filter((n) => !assignees.includes(n))
  const minOrder = state.tasks.reduce((m, x) => Math.min(m, x.order ?? 0), 0)
  const t: Task = { ...p, assignees, dept, handoff, handoffFrom: handoff ? creatorDept : undefined, order: minOrder - 1000, collaborators, extensions: [], id, status: p.status ?? 'To do', created: d(0), comments: [], history: [{ at: now(), by: p.creator, text: `created this task${t0(p.scope, dept, handoff, creatorDept)} and assigned it to ${assignees.join(', ')}${collaborators.length ? `, with ${collaborators.join(', ')} as joint executor${collaborators.length > 1 ? 's' : ''}` : ''}` }] }
  set({ ...state, tasks: [t, ...state.tasks], activity: [{ id: `${id}-created`, taskId: id, title: t.title, scope: t.scope, tenant: t.tenant, ...t.history[0] }, ...state.activity], seq: state.seq + 1 })
  audit(t, `created "${t.title}"${t.dept ? ` for ${t.dept}` : ''}${handoff ? ` (handoff from ${creatorDept})` : ''}`)
  return t
}

export function updateTask(id: string, patch: Partial<Pick<Task, 'title' | 'desc' | 'priority' | 'assignees' | 'collaborators' | 'due' | 'related' | 'dept'>>, by: string) {
  const t = state.tasks.find((x) => x.id === id); if (!t || !canViewTask(t, by)) return
  if (t.scope === 'Platform') {
    patch = { ...patch }
    if (patch.dept && patch.dept !== t.dept && !isStaffManager(by)) delete patch.dept
    const dept = patch.dept ?? t.dept
    if (patch.assignees && dept) { const pool = staffInDept(dept); const ok = patch.assignees.filter((n) => pool.includes(n)); patch.assignees = ok.length ? ok : t.assignees }
    if (patch.dept && patch.dept !== t.dept && !(patch.assignees ?? t.assignees).some((n) => staffInDept(patch.dept!).includes(n))) patch.assignees = staffInDept(patch.dept).slice(0, 1)
  }
  const notes: string[] = []
  ;(Object.keys(patch) as (keyof typeof patch)[]).forEach((k) => {
    const before = Array.isArray(t[k]) ? t[k].join(', ') : String(t[k] || 'none')
    const after = Array.isArray(patch[k]) ? patch[k].join(', ') : String(patch[k] || 'none')
    if (patch[k] !== undefined && before !== after) {
      notes.push(k === 'desc' ? 'edited the description' : `changed ${k === 'due' ? 'due date' : k} from ${before} to ${after}`)
      if (k === 'assignees' || k === 'collaborators' || k === 'priority' || k === 'due' || k === 'dept') audit(t, `changed ${k}`, before, after)
    }
  })
  if (!notes.length) return
  const moved = patch.dept && patch.dept !== t.dept
  put(id, (x) => ({ ...x, ...patch, handoff: moved ? patch.dept !== deptOfUser(x.creator) : x.handoff, handoffFrom: moved ? deptOfUser(x.creator) : x.handoffFrom, history: [...notes.map((text) => ({ at: now(), by, text })), ...x.history] }))
  notes.forEach((text) => addActivity({ ...t, ...patch }, by, text))
}

export function setTaskStatus(id: string, status: TaskStatus, by: string) {
  const t = state.tasks.find((x) => x.id === id); if (!t || t.status === status || !canEditTask(t, by)) return
  put(id, (x) => ({ ...x, status, history: [{ at: now(), by, text: `moved this task from ${x.status} to ${status}` }, ...x.history] }))
  addActivity(t, by, `moved this task from ${t.status} to ${status}`)
  audit(t, 'status changed', t.status, status)
}

/* Move a card to a status and position, between prevId and nextId in the displayed column. Returns an error reason or null. */
export function moveTask(id: string, status: TaskStatus, prevId: string | null, nextId: string | null, by: string): string | null {
  const reason = moveBlockReason(id, status, by); if (reason) return reason
  const t = state.tasks.find((x) => x.id === id)!
  const ord = (x?: string | null) => state.tasks.find((y) => y.id === x)?.order
  const p = ord(prevId), n = ord(nextId)
  const order = p !== undefined && n !== undefined ? (p + n) / 2 : p !== undefined ? p + 1000 : n !== undefined ? n - 1000 : 0
  const changed = t.status !== status
  put(id, (x) => ({ ...x, status, order, history: changed ? [{ at: now(), by, text: `moved this task from ${x.status} to ${status}` }, ...x.history] : x.history }))
  if (changed) { addActivity(t, by, `moved this task from ${t.status} to ${status}`); audit(t, 'status changed', t.status, status) }
  return null
}
/* Undo a board move. */
export function restoreTaskPosition(id: string, status: TaskStatus, order: number, by: string) {
  const t = state.tasks.find((x) => x.id === id); if (!t || !canEditTask(t, by)) return
  const changed = t.status !== status
  put(id, (x) => ({ ...x, status, order, history: changed ? [{ at: now(), by, text: `undid the move and returned this task to ${status}` }, ...x.history] : x.history }))
  if (changed) { addActivity(t, by, `undid the move and returned this task to ${status}`); audit(t, 'status change undone', t.status, status) }
}

export function applyCover(id: string, c: Omit<TaskCover, 'wasCollab'>, by: string) {
  const t = state.tasks.find((x) => x.id === id); if (!t || t.covers?.some((x) => x.leaveId === c.leaveId)) return
  const wasCollab = t.collaborators.includes(c.cover)
  const text = `${c.cover} is covering for ${c.leaver} (on leave until ${c.until})`
  put(id, (x) => ({ ...x, collaborators: x.assignees.includes(c.cover) || wasCollab ? x.collaborators : [...x.collaborators, c.cover], covers: [...(x.covers ?? []), { ...c, wasCollab: wasCollab || x.assignees.includes(c.cover) }], history: [{ at: now(), by, text }, ...x.history] }))
  addActivity(t, by, text)
}
export function releaseCover(id: string, leaveId: string, by: string, note = '') {
  const t = state.tasks.find((x) => x.id === id); const c = t?.covers?.find((x) => x.leaveId === leaveId); if (!t || !c) return
  const text = `${c.leaver} is back. Cover by ${c.cover} ended and the task is handed back${note ? `: ${note}` : ''}`
  put(id, (x) => ({ ...x, collaborators: c.wasCollab ? x.collaborators : x.collaborators.filter((n) => n !== c.cover), covers: (x.covers ?? []).filter((y) => y.leaveId !== leaveId), history: [{ at: now(), by, text }, ...x.history] }))
  addActivity(t, by, text)
}

export function addComment(id: string, by: string, text: string) {
  const t = state.tasks.find((x) => x.id === id); if (!t || !canViewTask(t, by)) return
  put(id, (x) => ({ ...x, comments: [...x.comments, { id: Math.random().toString(36).slice(2, 8), at: now(), by, text }] }))
  addActivity(t, by, `commented: "${text}"`)
}

export function deleteTask(id: string, by: string) {
  const t = state.tasks.find((x) => x.id === id); if (!t || (t.scope === 'Platform' && !isStaffManager(by))) return
  set({ ...state, tasks: state.tasks.filter((x) => x.id !== id), activity: [{ id: `${id}-deleted-${Date.now()}`, taskId: id, title: t.title, scope: t.scope, tenant: t.tenant, at: now(), by, text: 'deleted this task' }, ...state.activity] })
  audit(t, `deleted "${t.title}"`)
}

export function requestExtension(id: string, by: string, toDue: string, reason: string) {
  const t = state.tasks.find((x) => x.id === id); if (!t || toDue <= t.due || !canViewTask(t, by)) return
  const ext: Extension = { id: Math.random().toString(36).slice(2, 8), by, at: now(), fromDue: t.due, toDue, reason, status: 'Pending' }
  put(id, (x) => ({ ...x, extensions: [ext, ...x.extensions] }))
  addActivity(t, by, `asked to move the due date from ${t.due} to ${toDue}: "${reason}"`)
  audit(t, 'extension requested', t.due, toDue)
}

export function decideExtension(id: string, extId: string, approve: boolean, by: string, note: string) {
  const t = state.tasks.find((x) => x.id === id); const ext = t?.extensions.find((x) => x.id === extId)
  if (!t || !ext || ext.status !== 'Pending') return
  const text = approve ? `approved ${ext.by}'s extension to ${ext.toDue}` : `declined ${ext.by}'s extension request${note ? `: "${note}"` : ''}`
  put(id, (x) => ({
    ...x, due: approve ? ext.toDue : x.due,
    extensions: x.extensions.map((e) => (e.id === extId ? { ...e, status: approve ? 'Approved' : 'Declined', decidedBy: by, decidedAt: now(), note } : e)),
    history: [{ at: now(), by, text }, ...x.history],
  }))
  addActivity(t, by, text)
  audit(t, approve ? 'extension approved' : 'extension declined', ext.fromDue, approve ? ext.toDue : ext.fromDue)
}

/* A task counts towards performance only when someone other than the creator is assigned.
   Joint executors are never "assigned" and are not scored on it. */
export const isSelfTask = (t: Task) => t.assignees.length > 0 && t.assignees.every((a) => a === t.creator)
export const isScored = (t: Task) => !isSelfTask(t)
export const pendingExtension = (t: Task) => t.extensions.find((x) => x.status === 'Pending')
export const canDecideExtension = (t: Task, me: string, canManage: boolean) => t.creator === me || canManage
export const isOverdue = (t: Task) => t.status !== 'Done' && t.due < TODAY
export const dueLabel = (iso: string) => {
  if (!iso) return 'No date'
  if (iso === TODAY) return 'Today'
  if (iso === d(1)) return 'Tomorrow'
  if (iso === d(-1)) return 'Yesterday'
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
