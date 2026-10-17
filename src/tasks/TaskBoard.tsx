import { useMemo, useState } from 'react'
import { AlertCircle, ArrowRightLeft, CalendarClock, Lightbulb, CalendarDays, CheckCircle2, Circle, LayoutList, Columns3, History as HistoryIcon, MessageSquare, Plus, Search, Trash2, Users } from 'lucide-react'
import { Avatar, Badge, Btn, EmptyState, Overlay, Timeline, useToast } from '../components/ui'
import { PRIORITIES, STATUSES, TODAY, addComment, byOrder, canDecideExtension, createTask, decideExtension, deleteTask, dueLabel, isOverdue, isSelfTask, moveBlockReason, pendingExtension, requestExtension, setTaskStatus, updateTask, useTaskActivity, useTasks, useVisibleTasks } from './store'
import Kanban from './Kanban'
import { DEPT_TEMPLATES, deptStyle, suggestTasks } from './departments'
import type { Suggestion } from './departments'
import { DEPARTMENTS, deptOfUser, staffInDept } from '../pages/admin/roles'
import { useTenants } from '../tenant/store'
import { useReadOnly } from '../platform/readOnly'
import type { Priority, Task, TaskStatus } from './store'

const STATUS_DOT: Record<TaskStatus, string> = { 'To do': 'bg-slate/60', 'In progress': 'bg-info', 'In review': 'bg-warn', Blocked: 'bg-err', Done: 'bg-ok' }
const PRI_TONE: Record<Priority, string> = { Low: 'gray', Normal: 'blue', High: 'amber', Urgent: 'red' }
const sel = 'h-9 rounded-md border border-line bg-white px-2.5 text-sm'

type Props = {
  scope: 'Platform' | 'Business'
  tenant: string
  me: string
  people: string[]
  canManage: boolean
  mineOnly?: boolean
  relatedHint?: string
  title?: string
  tenantOnly?: boolean
}

function StatusSelect({ t, disabled, onChange, compact }: { t: Task; disabled: boolean; onChange: (s: TaskStatus) => void; compact?: boolean }) {
  return (
    <span className="relative inline-flex items-center">
      <span className={`pointer-events-none absolute left-2.5 size-2 rounded-full ${STATUS_DOT[t.status]}`} />
      <select aria-label={`Status of ${t.title}`} disabled={disabled} value={t.status} onChange={(e) => onChange(e.target.value as TaskStatus)} className={`cursor-pointer appearance-none rounded-md border border-line bg-white pl-6 pr-2 text-[13px] font-semibold hover:border-teal disabled:cursor-not-allowed disabled:opacity-60 ${compact ? 'h-7' : 'h-8'}`}>
        {STATUSES.map((s) => <option key={s}>{s}</option>)}
      </select>
    </span>
  )
}

function DueChip({ t }: { t: Task }) {
  const over = isOverdue(t)
  const soon = !over && t.status !== 'Done' && t.due === TODAY
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[13px] ${over ? 'font-semibold text-err' : soon ? 'font-semibold text-amber-700' : 'text-slate'}`}>{over ? <AlertCircle size={13} /> : <CalendarDays size={13} />}{dueLabel(t.due)}{over && ' · overdue'}</span>
}

function DeptChip({ t }: { t: Task }) {
  if (t.scope !== 'Platform' || !t.dept) return null
  return (
    <>
      <span className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${deptStyle(t.dept).chip}`}><span className={`size-1.5 rounded-full ${deptStyle(t.dept).dot}`} />{t.dept}</span>
      {t.category && <span className="ml-1.5 text-[11px] text-slate">{t.category}</span>}
      {t.handoff && <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800" title={`Handed off${t.handoffFrom ? ` from ${t.handoffFrom}` : ''} to ${t.dept}`}><ArrowRightLeft size={10} />Handoff{t.handoffFrom ? ` from ${t.handoffFrom}` : ''}</span>}
    </>
  )
}

function TaskTags({ t, me }: { t: Task; me: string }) {
  const pend = pendingExtension(t)
  return (
    <>
      <DeptChip t={t} />
      {isSelfTask(t) && <span className="ml-2 font-semibold text-slate" title="Created by and for the same person. Not counted in performance.">Personal · not scored</span>}
      {!t.assignees.includes(me) && t.collaborators.includes(me) && <span className="ml-2 font-semibold text-teal">Joint · not assigned</span>}
      {t.collaborators.length > 0 && !t.collaborators.includes(me) && <span className="ml-2 inline-flex items-center gap-1 text-slate"><Users size={11} />+{t.collaborators.length} joint</span>}
      {t.covers?.map((c) => c.cover === me
        ? <span key={c.leaveId} className="ml-2 inline-flex items-center gap-1 rounded-full bg-softmint px-2 py-0.5 font-semibold text-teal" title={`Temporary cover until ${c.until}. Joint, not assigned, not scored.`}>Covering for {c.leaver}</span>
        : <span key={c.leaveId} className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800" title={`${c.leaver} is away until ${c.until}`}>{c.leaver === me ? 'On leave' : `${c.leaver} on leave`} · covered by {c.cover}</span>)}
      {pend && <span className="ml-2 inline-flex items-center gap-1 font-semibold text-amber-700"><CalendarClock size={11} />Extension requested</span>}
    </>
  )
}

function AssigneeFaces({ names, compact = false }: { names: string[]; compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2" title={names.join(', ')}>
      <span className="flex shrink-0 -space-x-2">{names.slice(0, 3).map((name) => <span key={name} className="rounded-full ring-2 ring-white"><Avatar name={name} size={compact ? 20 : 24} /></span>)}</span>
      <span className="whitespace-nowrap text-[13px]">{compact ? names.map((name) => name.split(' ')[0]).join(', ') : names.join(', ')}</span>
      {names.length > 3 && <span className="shrink-0 text-xs text-slate">+{names.length - 3}</span>}
    </span>
  )
}

function AssigneePicker({ people, selected, disabled, onChange, optional = false }: { people: string[]; selected: string[]; disabled: boolean; onChange: (names: string[]) => void; optional?: boolean }) {
  const toggle = (name: string) => {
    if (disabled) return
    if (selected.includes(name)) {
      if (optional || selected.length > 1) onChange(selected.filter((person) => person !== name))
    } else {
      onChange([...selected, name])
    }
  }
  return (
    <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-line bg-white p-1.5 sm:grid-cols-2">
      {people.map((person) => {
        const on = selected.includes(person)
        return (
          <button key={person} type="button" aria-pressed={on} disabled={disabled} onClick={() => toggle(person)} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] disabled:cursor-default ${on ? 'bg-softmint font-semibold text-ink' : 'text-slate hover:bg-cloud'}`}>
            <Avatar name={person} size={22} /><span className="min-w-0 flex-1 truncate">{person}</span><span className={on ? 'text-teal' : 'text-slate/40'}>{on ? '✓' : '+'}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function TaskBoard({ scope, tenant, me, people, canManage, mineOnly, relatedHint = 'Related record', title, tenantOnly = false }: Props) {
  const all = useTasks()
  const visible = useVisibleTasks(me)
  const tenants = useTenants()
  const activity = useTaskActivity()
  const toast = useToast()
  const myDept = deptOfUser(me)
  const platform = scope === 'Platform'
  const [tab, setTab] = useState<'mine' | 'dept' | 'all'>(platform && myDept && !canManage ? 'dept' : platform && canManage ? 'all' : 'all')
  const [deptFilter, setDeptFilter] = useState('all')
  const source = platform ? visible : all
  const base = useMemo(() => source.filter((t) => t.scope === scope && (scope === 'Platform' ? !tenantOnly || t.tenant === tenant : t.tenant === tenant) && (!mineOnly || t.assignees.includes(me) || t.collaborators.includes(me)) &&
    (!platform || (tab === 'mine' ? t.assignees.includes(me) || t.collaborators.includes(me) : tab === 'dept' ? t.dept === myDept : canManage && (deptFilter === 'all' || t.dept === deptFilter)))), [source, scope, tenant, mineOnly, me, tenantOnly, platform, tab, myDept, canManage, deptFilter])
  const [view, setView] = useState<'List' | 'Board' | 'History'>('List')
  const [q, setQ] = useState('')
  const [who, setWho] = useState(mineOnly ? 'me' : 'all')
  const [pri, setPri] = useState('all')
  const [stat, setStat] = useState<'open' | 'all' | TaskStatus>('all')
  const [historyUser, setHistoryUser] = useState('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [prefill, setPrefill] = useState<Suggestion | null>(null)

  const readOnly = useReadOnly()
  const editable = (t: Task) => !readOnly && (canManage || t.assignees.includes(me) || t.collaborators.includes(me))
  const rows = base.filter((t) =>
    (who === 'all' || (who === 'me' ? t.assignees.includes(me) || t.collaborators.includes(me) : who === 'by' ? t.creator === me : t.assignees.includes(who) || t.collaborators.includes(who))) &&
    (pri === 'all' || t.priority === pri) &&
    (stat === 'all' || (stat === 'open' ? t.status !== 'Done' : t.status === stat)) &&
    (t.title + t.id + t.related + t.assignees.join(' ') + t.collaborators.join(' ')).toLowerCase().includes(q.toLowerCase()))
  const sorted = [...rows].sort((a, b) => (a.status === 'Done' ? 1 : 0) - (b.status === 'Done' ? 1 : 0) || a.due.localeCompare(b.due) || byOrder(a, b))
  const count = (s: TaskStatus) => base.filter((t) => t.status === s).length
  const kpi = [
    { l: 'Open', v: base.filter((t) => t.status !== 'Done').length, c: 'text-ink' },
    { l: 'Due today', v: base.filter((t) => t.status !== 'Done' && t.due === TODAY).length, c: 'text-amber-700' },
    { l: 'Overdue', v: base.filter(isOverdue).length, c: 'text-err' },
    { l: 'Blocked', v: count('Blocked'), c: 'text-err' },
    { l: 'Completed', v: count('Done'), c: 'text-ok' },
  ]
  const open = source.find((t) => t.id === openId) ?? null
  const suggestions = useMemo(() => (platform ? suggestTasks(Object.values(tenants).filter((x) => !tenantOnly || x.slug === tenant), all).filter((g) => canManage || g.dept === myDept) : []), [platform, tenants, all, tenantOnly, tenant, canManage, myDept])

  const move = (t: Task, s: TaskStatus) => {
    if (!editable(t)) return toast('You can only change status on tasks assigned to you.', 'err')
    const why = moveBlockReason(t.id, s, me)
    if (why) return toast(why, 'err')
    setTaskStatus(t.id, s, me)
    toast(`${t.id} moved to ${s}`)
  }
  const opts = [...new Set([...people, ...base.flatMap((t) => [...t.assignees, ...t.collaborators])])]
  const historyBase = activity.filter((item) => item.scope === scope && (scope === 'Platform' ? !tenantOnly || item.tenant === tenant : item.tenant === tenant))
  const historyUsers = [...new Set(historyBase.map((item) => item.by))].sort()
  const history = historyBase.filter((item) =>
    (historyUser === 'all' || item.by === historyUser) &&
    `${item.taskId} ${item.title} ${item.by} ${item.text}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-teal">{scope === 'Platform' ? 'BizFlow Platform' : 'Operations'}</div>
          <h1 className="text-3xl font-semibold">{title ?? (mineOnly ? 'My tasks' : 'Tasks')}</h1>
          <p className="mt-1 text-sm text-slate">{scope === 'Platform' ? 'Work for the BizFlow team: provisioning, payments, renewals and support follow-ups.' : 'Assign work, track progress and move tasks through each stage.'}</p>
        </div>
        <Btn onClick={() => setCreating(true)}><Plus size={16} />New task</Btn>
      </div>

      <div className="grid grid-cols-2 divide-x divide-line rounded-lg border border-line bg-white sm:grid-cols-5">
        {kpi.map((k) => <div key={k.l} className="px-5 py-3.5"><div className="text-xs font-medium text-slate">{k.l}</div><div className={`num font-display text-2xl font-semibold ${k.c}`}>{k.v}</div></div>)}
      </div>

      {platform && !mineOnly && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Task scope" className="flex overflow-hidden rounded-md border border-line bg-white">
            {([['mine', 'My tasks'], ['dept', `My department${myDept ? ` · ${myDept}` : ''}`], ...(canManage ? [['all', 'All departments'] as const] : [])] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`h-9 cursor-pointer px-3 text-[13px] font-semibold ${tab === k ? 'bg-midnight text-white' : 'text-slate hover:text-ink'}`}>{l}</button>)}
          </div>
          {canManage && tab === 'all' && <select aria-label="Filter by department" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={sel}><option value="all">Every department</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select>}
          {canManage && tab === 'all' && <span className="flex flex-wrap gap-1.5">{DEPARTMENTS.map((d) => <span key={d} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${deptStyle(d).chip}`}><span className={`size-1.5 rounded-full ${deptStyle(d).dot}`} />{d}</span>)}</span>}
        </div>
      )}
      {platform && !mineOnly && suggestions.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-amber-900"><Lightbulb size={14} />Suggested from what is happening on the platform</div>
          <ul className="space-y-1.5">
            {suggestions.slice(0, 3).map((g) => (
              <li key={g.key} className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${deptStyle(g.dept).chip}`}>{g.dept}</span>
                <span className="min-w-0 flex-1 truncate"><b>{g.title}</b> <span className="text-xs text-slate">· {g.reason}</span></span>
                <Btn s="sm" v="secondary" onClick={() => { setPrefill(g); setCreating(true) }}>Create task</Btn>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate" /><input aria-label={view === 'History' ? 'Search task history' : 'Search tasks'} value={q} onChange={(e) => setQ(e.target.value)} placeholder={view === 'History' ? 'Search history' : 'Search tasks'} className="h-9 w-56 rounded-md border border-line bg-white pl-8 pr-3 text-sm" /></div>
        {view === 'History' ? (
          <select aria-label="Filter history by user" value={historyUser} onChange={(e) => setHistoryUser(e.target.value)} className={sel}><option value="all">All users</option>{historyUsers.map((user) => <option key={user}>{user}</option>)}</select>
        ) : !mineOnly && (
          <select aria-label="Filter by assignee" value={who} onChange={(e) => setWho(e.target.value)} className={sel}>
            <option value="all">Everyone</option><option value="me">Mine (assigned or joint)</option><option value="by">Created by me</option>
            {opts.filter((p) => p !== me).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {view !== 'History' && <><select aria-label="Filter by priority" value={pri} onChange={(e) => setPri(e.target.value)} className={sel}><option value="all">Any priority</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
        <select aria-label="Filter by status" value={stat} onChange={(e) => setStat(e.target.value as typeof stat)} className={sel}><option value="open">Open tasks</option><option value="all">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></>}
        <div role="group" aria-label="View" className="ml-auto flex overflow-hidden rounded-md border border-line bg-white">
          {([['List', LayoutList], ['Board', Columns3], ...(!mineOnly ? [['History', HistoryIcon] as const] : [])] as const).map(([v, Ic]) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className={`flex h-9 cursor-pointer items-center gap-1.5 px-3 text-[13px] font-semibold ${view === v ? 'bg-midnight text-white' : 'text-slate hover:text-ink'}`}><Ic size={14} />{v}</button>)}
        </div>
      </div>

      {view === 'List' && (
        <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
          {sorted.length === 0 ? <EmptyState title="No tasks match" body={base.length ? 'Try clearing a filter.' : 'Create the first task to get started.'} action={<Btn onClick={() => setCreating(true)}>New task</Btn>} /> : (
            <ul>
              {sorted.map((t) => (
                <li key={t.id} className={`group flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/70 px-4 py-3 last:border-0 ${t.status === 'Done' ? 'bg-cloud/70 text-slate' : 'hover:bg-cloud'}`}>
                  <button aria-label={t.status === 'Done' ? `Reopen ${t.title}` : `Complete ${t.title}`} onClick={() => move(t, t.status === 'Done' ? 'To do' : 'Done')} className="cursor-pointer text-slate hover:text-ok">{t.status === 'Done' ? <CheckCircle2 size={20} className="text-ok" /> : <Circle size={20} />}</button>
                  <button onClick={() => setOpenId(t.id)} className="min-w-0 flex-1 basis-60 cursor-pointer text-left">
                    <span className={`block truncate text-sm font-semibold ${t.status === 'Done' ? 'text-slate line-through' : ''}`}>{t.title}</span>
                    <span className="block truncate text-xs text-slate"><span className="num">{t.id}</span> · {t.related}{t.status === 'Done' && <span className="ml-2 font-semibold text-ok">Completed</span>}{t.comments.length > 0 && <span className="ml-2 inline-flex items-center gap-1"><MessageSquare size={11} />{t.comments.length}</span>}<TaskTags t={t} me={me} /></span>
                  </button>
                  <Badge tone={PRI_TONE[t.priority]}>{t.priority}</Badge>
                  <DueChip t={t} />
                  <span className="hidden md:block md:w-52"><AssigneeFaces names={t.assignees} compact /></span>
                  <StatusSelect t={t} disabled={!editable(t)} onChange={(s) => move(t, s)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {view === 'Board' && (
        <Kanban rows={rows} me={me} canDrag={editable} renderBody={(t) => (
          <>
            <button onClick={() => setOpenId(t.id)} className={`block w-full cursor-pointer text-left text-sm font-semibold leading-snug hover:text-teal ${t.status === 'Done' ? 'line-through' : ''}`}>{t.title}</button>
            <div className="mt-1 truncate text-xs text-slate">{t.related}</div>
            {t.scope === 'Platform' && t.dept && <div className="mt-1.5 flex flex-wrap items-center gap-y-1 text-xs"><DeptChip t={t} /></div>}
            <div className="mt-2.5 flex items-center justify-between gap-2"><Badge tone={PRI_TONE[t.priority]}>{t.priority}</Badge><DueChip t={t} /></div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-line/70 pt-2.5">
              <AssigneeFaces names={t.assignees} compact />
              <StatusSelect t={t} compact disabled={!editable(t)} onChange={(x) => move(t, x)} />
            </div>
          </>
        )} />
      )}

      {view === 'History' && (
        <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-cloud/70 px-5 py-3 text-sm">
            <div><b>{history.length} activity events</b><span className="ml-2 text-slate">across {historyUsers.length} users</span></div>
            <span className="text-xs text-slate">Create, assignment, status, edits, comments and deletion activity</span>
          </div>
          {history.length === 0 ? <EmptyState title="No task history matches" body="Try another user or clear the search." /> : (
            <ol className="divide-y divide-line/70">
              {history.map((item) => {
                const task = all.find((candidate) => candidate.id === item.taskId)
                const completed = item.text.includes('to Done')
                const destructive = item.text.includes('deleted')
                return (
                  <li key={item.id} className="flex gap-3 px-5 py-3.5 hover:bg-cloud/60">
                    <Avatar name={item.by} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><b>{item.by}</b><span className="text-slate">{item.text}</span>{completed && <Badge tone="green">Completed</Badge>}{destructive && <Badge tone="red">Deleted</Badge>}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate">
                        {task ? <button onClick={() => setOpenId(task.id)} className="cursor-pointer font-mono font-semibold text-teal">{item.taskId}</button> : <span className="font-mono">{item.taskId}</span>}
                        <span>·</span><span className="truncate">{item.title}</span>
                      </div>
                    </div>
                    <time className="shrink-0 text-right text-xs text-slate">{new Date(item.at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}

      <TaskDrawer key={open?.id ?? 'none'} task={open} onClose={() => setOpenId(null)} me={me} people={opts.length ? opts : [me]} editable={open ? editable(open) : false} canManage={canManage} />
      {creating && <CreateDrawer prefill={prefill} onClose={() => { setCreating(false); setPrefill(null) }} scope={scope} tenant={tenant} me={me} people={opts.length ? opts : [me]} canManage={canManage} relatedHint={relatedHint} onCreated={(t) => { setCreating(false); setPrefill(null); setStat('all'); setWho('all'); setPri('all'); toast(`${t.id} created`) }} />}
    </div>
  )
}

const fld = 'h-10 w-full rounded-md border border-line bg-white px-3 text-sm disabled:bg-cloud disabled:text-slate'

function CreateDrawer({ prefill, onClose, scope, tenant, me, people: allPeople, canManage, relatedHint, onCreated }: { prefill: Suggestion | null; onClose: () => void; scope: 'Platform' | 'Business'; tenant: string; me: string; people: string[]; canManage: boolean; relatedHint: string; onCreated: (t: Task) => void }) {
  const platform = scope === 'Platform'
  const myDept = deptOfUser(me)
  const [dept, setDept] = useState<string>(platform ? (canManage ? prefill?.dept : undefined) ?? myDept ?? 'Executive' : '')
  const [category, setCategory] = useState(prefill?.category ?? '')
  const people = platform ? staffInDept(dept) : allPeople
  const [f, setF] = useState({ title: prefill?.title ?? '', desc: prefill?.desc ?? '', priority: (prefill?.priority ?? 'Normal') as Priority, assignees: platform && !staffInDept(dept).includes(me) ? staffInDept(dept).slice(0, 1) : [me], collaborators: [] as string[], due: '2026-10-15', related: prefill?.related ?? '' })
  const pickDept = (d: string) => { setDept(d); setCategory(''); const pool = staffInDept(d); setF({ ...f, assignees: pool.includes(me) ? [me] : pool.slice(0, 1), collaborators: [] }) }
  const applyTemplate = (c: string) => { setCategory(c); const tpl = (DEPT_TEMPLATES[dept] ?? []).find((x) => x.category === c); if (tpl) setF({ ...f, title: f.title.trim() ? f.title : tpl.title, desc: tpl.desc, priority: tpl.priority }) }
  const handoff = platform && !!myDept && dept !== myDept
  const [err, setErr] = useState(false)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.title.trim()) return setErr(true)
    onCreated(createTask({ ...f, title: f.title.trim(), related: f.related.trim() || (scope === 'Platform' ? 'Platform' : 'General'), scope, tenant, creator: me, dept: platform ? dept : undefined, category: category || undefined }))
  }
  return (
    <Overlay open onClose={onClose} title="New task" side>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {platform && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[13px] font-semibold">Department<select value={dept} disabled={!canManage} onChange={(e) => pickDept(e.target.value)} className={`mt-1.5 ${fld} font-normal`}>{(canManage ? DEPARTMENTS : DEPARTMENTS.filter((d) => d === myDept)).map((d) => <option key={d}>{d}</option>)}</select></label>
            <label className="block text-[13px] font-semibold">Category<select value={category} onChange={(e) => applyTemplate(e.target.value)} className={`mt-1.5 ${fld} font-normal`}><option value="">No template</option>{(DEPT_TEMPLATES[dept] ?? []).map((x) => <option key={x.category}>{x.category}</option>)}</select></label>
            {handoff && <p className="rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-900 sm:col-span-2"><b>Handoff:</b> this task goes to {dept} and is flagged as a handoff from {myDept}. Only people in {dept} can be assigned.</p>}
            {!canManage && <p className="text-xs text-slate sm:col-span-2">Tasks you create stay in {myDept}. Managers can hand work to other departments.</p>}
          </div>
        )}
        <label className="block text-[13px] font-semibold">Title<input autoFocus aria-invalid={err} value={f.title} onChange={(e) => { setF({ ...f, title: e.target.value }); setErr(false) }} placeholder="What needs to be done?" className={`mt-1.5 ${fld} font-normal ${err ? 'border-err' : ''}`} />{err && <span role="alert" className="mt-1 block text-xs font-normal text-err">Give the task a title.</span>}</label>
        <label className="block text-[13px] font-semibold">Description<textarea value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} rows={3} className="mt-1.5 w-full rounded-md border border-line p-3 text-sm font-normal" /></label>
        <div>
          <div className="mb-1.5 text-[13px] font-semibold">Assign staff <span className="font-normal text-slate">({f.assignees.length} selected)</span></div>
          <AssigneePicker people={people} selected={f.assignees} disabled={!canManage} onChange={(assignees) => setF({ ...f, assignees, collaborators: f.collaborators.filter((n) => !assignees.includes(n)) })} />
          {f.assignees.length > 0 && f.assignees.every((a) => a === me) && <p className="mt-1.5 rounded-md bg-cloud px-3 py-2 text-xs text-slate">A task you create for yourself is personal. It is tracked here but has no value in your performance score.</p>}
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-semibold">Joint executors <span className="font-normal text-slate">(optional, {f.collaborators.length} selected)</span></div>
          <AssigneePicker optional people={people.filter((n) => !f.assignees.includes(n))} selected={f.collaborators} disabled={false} onChange={(collaborators) => setF({ ...f, collaborators })} />
          <p className="mt-1.5 text-xs text-slate">People who help deliver the task. They are not assigned to it, so it does not count towards their workload or score.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[13px] font-semibold">Priority<select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })} className={`mt-1.5 ${fld} font-normal`}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="block text-[13px] font-semibold">Due date<input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className={`mt-1.5 ${fld} font-normal`} /></label>
          <label className="block text-[13px] font-semibold">{relatedHint}<input value={f.related} onChange={(e) => setF({ ...f, related: e.target.value })} className={`mt-1.5 ${fld} font-normal`} /></label>
        </div>
        {!canManage && <p className="text-xs text-slate">Your role can create tasks for yourself. Managers can assign to others.</p>}
        <div className="flex justify-end gap-2 pt-2"><Btn v="secondary" type="button" onClick={onClose}>Cancel</Btn><Btn type="submit">Create task</Btn></div>
      </form>
    </Overlay>
  )
}

function TaskDrawer({ task, onClose, me, people, editable, canManage }: { task: Task | null; onClose: () => void; me: string; people: string[]; editable: boolean; canManage: boolean }) {
  const toast = useToast()
  const [c, setC] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [draft, setDraft] = useState<{ title: string; desc: string } | null>(null)
  const [extOpen, setExtOpen] = useState(false)
  const [extDue, setExtDue] = useState('')
  const [extWhy, setExtWhy] = useState('')
  const [declineNote, setDeclineNote] = useState('')
  if (!task) return null
  const t = task
  const owner = canManage || t.creator === me
  const canSetDue = owner
  const pend = pendingExtension(t)
  const closeToDue = t.status !== 'Done' && t.due <= '2026-10-11'
  const canAsk = !owner && (t.assignees.includes(me) || t.collaborators.includes(me)) && closeToDue && !pend
  const canDecide = pend && canDecideExtension(t, me, canManage) && pend.by !== me
  const sendExt = () => { if (extDue <= t.due || extWhy.trim().length < 10) return toast('Pick a later date and give a reason of at least 10 characters.', 'err'); requestExtension(t.id, me, extDue, extWhy.trim()); setExtOpen(false); setExtWhy(''); toast(`Extension requested from ${t.creator}`) }
  const save = () => { if (draft) { updateTask(t.id, { title: draft.title.trim() || t.title, desc: draft.desc }, me); setDraft(null); toast('Task updated') } }
  const post = (e: React.FormEvent) => { e.preventDefault(); if (c.trim()) { addComment(t.id, me, c.trim()); setC('') } }
  const hist = [...t.history, ...t.comments.map((x) => ({ at: x.at, by: x.by, text: `commented: "${x.text}"` }))].sort((a, b) => b.at.localeCompare(a.at))
  return (
    <Overlay open onClose={onClose} title={t.id} side wide>
      <div className="-mt-2 space-y-5">
        {draft ? (
          <div className="space-y-3">
            <input aria-label="Task title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={`${fld} text-base font-semibold`} />
            <textarea aria-label="Description" value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} rows={4} className="w-full rounded-md border border-line p-3 text-sm" />
            <div className="flex gap-2"><Btn s="sm" onClick={save}>Save</Btn><Btn s="sm" v="secondary" onClick={() => setDraft(null)}>Cancel</Btn></div>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3"><h3 className={`min-w-0 text-xl font-semibold leading-snug ${t.status === 'Done' ? 'text-slate line-through' : ''}`}>{t.title}</h3>{editable && <Btn s="sm" v="secondary" onClick={() => setDraft({ title: t.title, desc: t.desc })}>Edit</Btn>}</div>
            <p className="mt-2 text-sm text-slate">{t.desc || 'No description yet.'}</p>
          </div>
        )}

        {t.status === 'Done' && <div role="status" className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={18} /><div><b>Task completed</b><div className="text-xs">This task remains visible and can be reopened when needed.</div></div></div>}
        <div className="grid gap-3 rounded-lg border border-line bg-cloud p-4 sm:grid-cols-2">
          <div><div className="mb-1.5 text-xs text-slate">Status</div><StatusSelect t={t} disabled={!editable} onChange={(s) => { setTaskStatus(t.id, s, me); toast(`${t.id} moved to ${s}`) }} /></div>
          <div><div className="mb-1.5 text-xs text-slate">Priority</div><select aria-label="Priority" disabled={!canManage} value={t.priority} onChange={(e) => updateTask(t.id, { priority: e.target.value as Priority }, me)} className={sel}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><div className="mb-1.5 text-xs text-slate">Due date</div><input aria-label="Due date" type="date" disabled={!canSetDue} value={t.due} onChange={(e) => updateTask(t.id, { due: e.target.value }, me)} className={sel} /></div>
          {t.scope === 'Platform' && t.dept && (
            <div className="sm:col-span-2">
              <div className="mb-1.5 text-xs text-slate">Department</div>
              {canManage
                ? <select aria-label="Department" value={t.dept} onChange={(e) => { updateTask(t.id, { dept: e.target.value }, me); toast(`Handed to ${e.target.value}`) }} className={sel}>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select>
                : <span className="text-[13px]"><DeptChip t={t} /></span>}
              {canManage && <div className="mt-1 text-[13px]"><DeptChip t={t} /></div>}
            </div>
          )}
          <div className="sm:col-span-2"><div className="mb-1.5 text-xs text-slate">Assigned staff ({t.assignees.length})</div><AssigneeFaces names={t.assignees} /></div>
          {canManage && <div className="sm:col-span-2"><AssigneePicker people={t.scope === 'Platform' && t.dept ? staffInDept(t.dept) : [...new Set([...people, ...t.assignees])]} selected={t.assignees} disabled={false} onChange={(assignees) => { updateTask(t.id, { assignees, collaborators: t.collaborators.filter((n) => !assignees.includes(n)) }, me); toast('Task assignees updated') }} /></div>}
          <div className="sm:col-span-2"><div className="mb-1.5 text-xs text-slate">Joint executors ({t.collaborators.length}) <span className="text-slate/70">· help deliver it, not assigned, not scored</span></div>{t.collaborators.length ? <AssigneeFaces names={t.collaborators} /> : <span className="text-[13px] text-slate">None</span>}</div>
          {owner && <div className="sm:col-span-2"><AssigneePicker optional people={[...new Set([...people, ...t.collaborators])].filter((n) => !t.assignees.includes(n))} selected={t.collaborators} disabled={false} onChange={(collaborators) => { updateTask(t.id, { collaborators }, me); toast('Joint executors updated') }} /></div>}
          {isSelfTask(t) && <div className="rounded-md bg-white px-3 py-2 text-xs text-slate sm:col-span-2">Personal task: created by and for {t.creator}. It has no value in the performance score.</div>}
          <div className="text-xs text-slate sm:col-span-2">Related: <b className="break-words text-ink">{t.related}</b> · Created by {t.creator} · {dueLabel(t.due)}{isOverdue(t) && <span className="font-semibold text-err"> (overdue)</span>}</div>
        </div>
        {pend && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold"><CalendarClock size={16} />Extension requested by {pend.by}</div>
            <p className="mt-1">Move due date from <b>{dueLabel(pend.fromDue)}</b> to <b>{dueLabel(pend.toDue)}</b>.</p>
            <p className="mt-1 text-[13px]">&ldquo;{pend.reason}&rdquo;</p>
            {canDecide ? (
              <div className="mt-3 space-y-2">
                <input aria-label="Note if declining" value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} placeholder="Note (required to decline)" className={fld} />
                <div className="flex gap-2"><Btn s="sm" onClick={() => { decideExtension(t.id, pend.id, true, me, ''); toast(`New due date ${dueLabel(pend.toDue)}`) }}>Approve new date</Btn><Btn s="sm" v="secondary" onClick={() => { if (declineNote.trim().length < 5) return toast('Add a short reason before declining.', 'err'); decideExtension(t.id, pend.id, false, me, declineNote.trim()); setDeclineNote(''); toast('Extension declined') }}>Decline</Btn></div>
              </div>
            ) : <p className="mt-2 text-xs">Waiting for {t.creator} to decide. Until then, the overdue penalty is paused for this task.</p>}
          </div>
        )}
        {canAsk && (
          <div className="rounded-lg border border-line p-4">
            {extOpen ? (
              <div className="space-y-3">
                <div className="text-sm font-semibold">Ask {t.creator} for more time</div>
                <label className="block text-[13px] font-semibold">New due date<input type="date" min={t.due} value={extDue} onChange={(e) => setExtDue(e.target.value)} className={`mt-1.5 ${fld} font-normal`} /></label>
                <label className="block text-[13px] font-semibold">Reason<textarea rows={3} value={extWhy} onChange={(e) => setExtWhy(e.target.value)} placeholder="What is holding the work up, and why does this date work?" className="mt-1.5 w-full rounded-md border border-line p-3 text-sm font-normal" /></label>
                <div className="flex gap-2"><Btn s="sm" onClick={sendExt}>Send request</Btn><Btn s="sm" v="secondary" onClick={() => setExtOpen(false)}>Cancel</Btn></div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm"><b>{isOverdue(t) ? 'This task is past its due date.' : 'Due soon and may not finish in time?'}</b><div className="text-xs text-slate">Only {t.creator} or a manager can move the date. Ask with a reason.</div></div><Btn s="sm" v="secondary" onClick={() => { setExtDue(''); setExtOpen(true) }}><CalendarClock size={14} />Request extension</Btn></div>
            )}
          </div>
        )}
        {t.extensions.filter((x) => x.status !== 'Pending').length > 0 && (
          <section>
            <h4 className="mb-2 text-sm font-semibold">Extension requests</h4>
            <ul className="space-y-2">{t.extensions.filter((x) => x.status !== 'Pending').map((x) => <li key={x.id} className="rounded-md bg-cloud px-3 py-2 text-[13px]"><div className="flex items-center gap-2"><Badge tone={x.status === 'Approved' ? 'green' : 'red'}>{x.status}</Badge><span>{x.by}: {dueLabel(x.fromDue)} to {dueLabel(x.toDue)}</span></div><div className="mt-1 text-xs text-slate">&ldquo;{x.reason}&rdquo; · decided by {x.decidedBy}{x.note ? ` · ${x.note}` : ''}</div></li>)}</ul>
          </section>
        )}
        {editable && <Btn v={t.status === 'Done' ? 'secondary' : 'primary'} className="w-full" onClick={() => { const next = t.status === 'Done' ? 'To do' : 'Done'; setTaskStatus(t.id, next, me); toast(`${t.id} ${next === 'Done' ? 'marked completed' : 'reopened'}`) }}>{t.status === 'Done' ? 'Reopen task' : 'Mark task completed'}</Btn>}
        {!editable && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">This task is assigned to {t.assignees.join(', ')}. You can read and comment, but only assigned staff or a manager can change it.</p>}

        <section>
          <h4 className="mb-2 text-sm font-semibold">Comments ({t.comments.length})</h4>
          <ul className="space-y-3">{t.comments.map((x) => <li key={x.id} className="flex gap-3"><Avatar name={x.by} size={26} /><div className="rounded-lg bg-cloud px-3 py-2 text-sm"><b className="text-[13px]">{x.by}</b> <span className="text-xs text-slate">{new Date(x.at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><div>{x.text}</div></div></li>)}</ul>
          <form onSubmit={post} className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label="Add a comment" value={c} onChange={(e) => setC(e.target.value)} placeholder="Write a comment" className={fld} /><Btn type="submit" v="secondary">Post</Btn></form>
        </section>

        <section>
          <h4 className="mb-3 text-sm font-semibold">History</h4>
          <Timeline items={hist.slice(0, 8).map((h) => ({ t: new Date(h.at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), a: h.by, x: h.text }))} />
        </section>

        {canManage && (
          <div className="border-t border-line pt-4">
            {confirmDel ? (
              <div className="flex items-center gap-2 text-sm"><span>Delete this task?</span><Btn s="sm" onClick={() => { deleteTask(t.id, me); onClose(); toast(`${t.id} deleted`) }}>Delete</Btn><Btn s="sm" v="secondary" onClick={() => setConfirmDel(false)}>Keep</Btn></div>
            ) : <button onClick={() => setConfirmDel(true)} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-err"><Trash2 size={14} />Delete task</button>}
          </div>
        )}
      </div>
    </Overlay>
  )
}
