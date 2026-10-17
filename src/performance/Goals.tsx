import { useMemo, useState, useSyncExternalStore } from 'react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, Panel, useToast } from '../components/ui'
import { recordAudit } from '../tenant/store'
import { useTasks } from '../tasks/store'
import type { Task } from '../tasks/store'

/* Quarterly goals (objectives) with key results. A key result is either a manual number or linked to tasks (progress = share done). */
export type KeyResult = { id: string; title: string; target: number; current: number; taskIds: string[] }
export type Goal = { id: string; tenant: string; owner: string; quarter: string; title: string; krs: KeyResult[] }
export const QUARTER = 'Q4 2026'

const KEY = 'bf-goals-v1'
const seed: Goal[] = [
  { id: 'G-1', tenant: 'etranzact', owner: 'Kunle Ogunleye', quarter: QUARTER, title: 'Run a smooth year-end close', krs: [{ id: 'K-1', title: 'Close open reconciliation tasks', target: 10, current: 0, taskIds: [] }, { id: 'K-2', title: 'Department budgets submitted', target: 8, current: 5, taskIds: [] }] },
  { id: 'G-2', tenant: 'etranzact', owner: 'Fatima Sule', quarter: QUARTER, title: 'Grow the qualified pipeline', krs: [{ id: 'K-3', title: 'New qualified leads', target: 20, current: 12, taskIds: [] }, { id: 'K-4', title: 'Proposals sent', target: 8, current: 3, taskIds: [] }] },
  { id: 'G-3', tenant: 'etranzact', owner: 'Tobi Adeyemi', quarter: QUARTER, title: 'Hit Q4 revenue plan', krs: [{ id: 'K-5', title: 'Enterprise deals closed', target: 6, current: 2, taskIds: [] }] },
]
let goals: Goal[] = (() => { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s) as Goal[] } catch { /* fall through */ } return seed })()
const subs = new Set<() => void>()
const commit = (next: Goal[]) => { goals = next; try { localStorage.setItem(KEY, JSON.stringify(goals)) } catch { /* storage full */ } subs.forEach((f) => f()) }
const useGoalList = () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => goals)
export const useGoals = (slug: string) => { const all = useGoalList(); return useMemo(() => all.filter((g) => g.tenant === slug), [all, slug]) }

export const krProgress = (k: KeyResult, tasks: Task[]) => {
  const linked = tasks.filter((t) => k.taskIds.includes(t.id))
  if (linked.length) return Math.round((linked.filter((t) => t.status === 'Done').length / linked.length) * 100)
  return k.target > 0 ? Math.min(100, Math.round((k.current / k.target) * 100)) : 0
}
export const goalProgress = (g: Goal, tasks: Task[]) => g.krs.length ? Math.round(g.krs.reduce((a, k) => a + krProgress(k, tasks), 0) / g.krs.length) : 0
export function useGoalAttainment(slug: string, owner: string) {
  const list = useGoals(slug), tasks = useTasks()
  const mine = list.filter((g) => g.owner === owner && g.quarter === QUARTER)
  return mine.length ? { count: mine.length, pct: Math.round(mine.reduce((a, g) => a + goalProgress(g, tasks), 0) / mine.length) } : null
}

const Bar = ({ pct }: { pct: number }) => <div className="h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${pct >= 70 ? 'bg-ok' : pct >= 40 ? 'bg-teal' : 'bg-warn'}`} style={{ width: `${pct}%` }} /></div>

export default function Goals({ slug, viewer, full, people }: { slug: string; viewer: string; full: boolean; people: string[] }) {
  const toast = useToast()
  const list = useGoals(slug), tasks = useTasks()
  const [draft, setDraft] = useState<{ id: string; owner: string; title: string; krs: KeyResult[] } | null>(null)
  const [filter, setFilter] = useState(full ? 'Everyone' : viewer)
  const visible = list.filter((g) => (full ? filter === 'Everyone' || g.owner === filter : g.owner === viewer))
  const startNew = () => setDraft({ id: '', owner: viewer, title: '', krs: [{ id: 'K-' + Date.now().toString(36), title: '', target: 10, current: 0, taskIds: [] }] })
  const save = () => {
    if (!draft || !draft.title.trim()) return
    const krs = draft.krs.filter((k) => k.title.trim())
    if (!krs.length) return
    const isNew = !draft.id
    const goal: Goal = { id: draft.id || 'G-' + Date.now().toString(36), tenant: slug, owner: draft.owner, quarter: QUARTER, title: draft.title.trim(), krs }
    commit(isNew ? [goal, ...goals] : goals.map((g) => (g.id === goal.id ? goal : g)))
    recordAudit(slug, isNew ? 'Goal created' : 'Goal updated', undefined, `${goal.owner}: ${goal.title}`, { category: 'People', ref: goal.id })
    setDraft(null); toast(isNew ? 'Goal added' : 'Goal updated')
  }
  const remove = (g: Goal) => { commit(goals.filter((x) => x.id !== g.id)); recordAudit(slug, 'Goal removed', `${g.owner}: ${g.title}`, undefined, { category: 'People', ref: g.id }); toast('Goal removed') }
  const bump = (g: Goal, k: KeyResult, v: number) => commit(goals.map((x) => (x.id === g.id ? { ...x, krs: x.krs.map((y) => (y.id === k.id ? { ...y, current: Math.max(0, v) } : y)) } : x)))
  const ownerTasks = (o: string) => tasks.filter((t) => t.tenant === slug && t.scope === 'Business' && t.assignees.includes(o))
  const setKr = (id: string, patch: Partial<KeyResult>) => draft && setDraft({ ...draft, krs: draft.krs.map((k) => (k.id === id ? { ...k, ...patch } : k)) })
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-lg font-semibold">Goals, {QUARTER}</h2>
        {full && <select aria-label="Filter by person" className="h-9 rounded-md border border-line bg-white px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}><option>Everyone</option>{people.map((p) => <option key={p}>{p}</option>)}</select>}
        <Btn className="ml-auto" onClick={startNew}>Add goal</Btn>
      </div>
      {visible.length === 0 ? <Panel><EmptyState title="No goals yet" body="Set an objective for the quarter and add measurable key results. Link key results to tasks and progress follows completion." action={<Btn onClick={startNew}>Create your first goal</Btn>} /></Panel> : visible.map((g) => {
        const pct = goalProgress(g, tasks), canEdit = full || g.owner === viewer
        return (
          <Panel key={g.id} title={g.title} action={<div className="flex items-center gap-2"><Badge>{g.owner}</Badge>{canEdit && <><Btn s="sm" v="ghost" onClick={() => setDraft({ id: g.id, owner: g.owner, title: g.title, krs: g.krs.map((k) => ({ ...k, taskIds: [...k.taskIds] })) })}>Edit</Btn><Btn s="sm" v="ghost" onClick={() => remove(g)}>Delete</Btn></>}</div>}>
            <div className="mb-4 flex items-center gap-3"><div className="flex-1"><Bar pct={pct} /></div><span className="num text-sm font-semibold">{pct}%</span></div>
            <ul className="space-y-3">
              {g.krs.map((k) => {
                const linked = tasks.filter((t) => k.taskIds.includes(t.id)), p = krProgress(k, tasks)
                return (
                  <li key={k.id}>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{k.title}</span>
                      {linked.length ? <span className="text-xs text-slate">{linked.filter((t) => t.status === 'Done').length} of {linked.length} linked tasks done</span> : canEdit ? <span className="flex items-center gap-1 text-xs text-slate"><input type="number" aria-label={`Current value for ${k.title}`} className="h-7 w-16 rounded border border-line px-1 text-right" value={k.current} onChange={(e) => bump(g, k, Number(e.target.value))} /> / {k.target}</span> : <span className="num text-xs text-slate">{k.current} / {k.target}</span>}
                    </div>
                    <Bar pct={p} />
                  </li>
                )
              })}
            </ul>
          </Panel>
        )
      })}
      <Overlay open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit goal' : 'Add goal'} wide>
        {draft && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Objective"><input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Improve onboarding speed" /></Field>
              {full && <Field label="Owner"><select className={inputCls} value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })}>{people.map((p) => <option key={p}>{p}</option>)}</select></Field>}
            </div>
            <div className="space-y-3">
              {draft.krs.map((k, i) => (
                <div key={k.id} className="rounded-lg border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_6rem_6rem]">
                    <input aria-label={`Key result ${i + 1}`} className={inputCls} placeholder="Key result" value={k.title} onChange={(e) => setKr(k.id, { title: e.target.value })} />
                    <input aria-label="Target" type="number" min={1} className={inputCls} value={k.target} onChange={(e) => setKr(k.id, { target: Number(e.target.value) })} />
                    <input aria-label="Current" type="number" min={0} className={inputCls} value={k.current} onChange={(e) => setKr(k.id, { current: Number(e.target.value) })} />
                  </div>
                  <label className="mt-2 block text-xs font-medium text-slate">Link tasks (progress follows completion)
                    <select multiple className="mt-1 h-24 w-full rounded-md border border-line bg-white p-1 text-sm" value={k.taskIds} onChange={(e) => setKr(k.id, { taskIds: Array.from(e.target.selectedOptions, (o) => o.value) })}>{ownerTasks(draft.owner).map((t) => <option key={t.id} value={t.id}>{t.id} · {t.title} ({t.status})</option>)}</select>
                  </label>
                  {draft.krs.length > 1 && <Btn s="sm" v="ghost" onClick={() => setDraft({ ...draft, krs: draft.krs.filter((x) => x.id !== k.id) })}>Remove key result</Btn>}
                </div>
              ))}
              <Btn s="sm" v="secondary" onClick={() => setDraft({ ...draft, krs: [...draft.krs, { id: 'K-' + Date.now().toString(36), title: '', target: 10, current: 0, taskIds: [] }] })}>Add key result</Btn>
            </div>
            <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setDraft(null)}>Cancel</Btn><Btn disabled={!draft.title.trim() || !draft.krs.some((k) => k.title.trim())} onClick={save}>Save goal</Btn></div>
          </div>
        )}
      </Overlay>
    </div>
  )
}
