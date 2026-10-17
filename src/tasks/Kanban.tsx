import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, getFirstCollision, pointerWithin, rectIntersection, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import type { Announcements, CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Lock, Undo2 } from 'lucide-react'
import { useToast } from '../components/ui'
import { STATUSES, byOrder, moveBlockReason, moveTask, restoreTaskPosition } from './store'
import type { Task, TaskStatus } from './store'

type Cols = Record<TaskStatus, string[]>
const buildCols = (rows: Task[]): Cols => Object.fromEntries(STATUSES.map((s) => [s, rows.filter((t) => t.status === s).sort(byOrder).map((t) => t.id)])) as Cols
const isStatus = (id: unknown): id is TaskStatus => (STATUSES as readonly string[]).includes(String(id))
const STATUS_DOT: Record<TaskStatus, string> = { 'To do': 'bg-slate/60', 'In progress': 'bg-info', 'In review': 'bg-warn', Blocked: 'bg-err', Done: 'bg-ok' }

function Card({ t, canDrag, body }: { t: Task; canDrag: boolean; body: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: t.id, disabled: !canDrag })
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} data-task={t.id}
      className={`relative rounded-md border p-3 pl-7 shadow-sm ${isDragging ? 'border-dashed border-teal bg-softmint/50 shadow-none [&>*]:invisible' : `border-line ${t.status === 'Done' ? 'bg-cloud/80 text-slate' : 'bg-white'}`}`}>
      {canDrag
        ? <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label={`Move ${t.title}. Press space to pick up.`} className="absolute inset-y-0 left-0 flex w-6 cursor-grab touch-none items-center justify-center rounded-l-md text-slate/60 hover:bg-cloud hover:text-ink focus-visible:outline-2 focus-visible:outline-teal active:cursor-grabbing"><GripVertical size={15} /></button>
        : <span className="absolute inset-y-0 left-0 flex w-6 items-center justify-center text-slate/40" title="Only assigned staff or a manager can move this task"><Lock size={12} /></span>}
      {body}
    </article>
  )
}

function Column({ status, ids, rows, highlight, blocked, canDrag, renderBody }: { status: TaskStatus; ids: string[]; rows: Map<string, Task>; highlight: boolean; blocked: string | null; canDrag: (t: Task) => boolean; renderBody: (t: Task) => ReactNode }) {
  const { setNodeRef } = useDroppable({ id: status })
  return (
    <section ref={setNodeRef} aria-label={status} data-status={status} className={`flex min-h-[320px] flex-col rounded-lg border p-2.5 transition-colors ${blocked ? 'border-err bg-red-50' : highlight ? 'border-teal bg-softmint/60' : 'border-line bg-ink/[0.03]'}`}>
      <header className="mb-2.5 flex items-center gap-2 px-1 text-[13px] font-semibold"><span className={`size-2 rounded-full ${STATUS_DOT[status]}`} />{status}<span className="num ml-auto rounded-full bg-white px-2 text-xs text-slate">{ids.length}</span></header>
      {blocked && <p role="alert" className="mb-2 rounded-md bg-white px-2 py-1.5 text-xs font-medium text-err">{blocked}</p>}
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-2">
          {ids.map((id) => { const t = rows.get(id); return t ? <Card key={id} t={t} canDrag={canDrag(t)} body={renderBody(t)} /> : null })}
          {ids.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate">Drop a task here</p>}
        </div>
      </SortableContext>
    </section>
  )
}

export default function Kanban({ rows, me, canDrag, renderBody }: { rows: Task[]; me: string; canDrag: (t: Task) => boolean; renderBody: (t: Task) => ReactNode }) {
  const toast = useToast()
  const base = useMemo(() => buildCols(rows), [rows])
  const byId = useMemo(() => new Map(rows.map((t) => [t.id, t])), [rows])
  const [cols, setCols] = useState<Cols | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<{ col: TaskStatus; reason: string } | null>(null)
  const blockedRef = useRef(blocked)
  blockedRef.current = blocked
  const [undo, setUndo] = useState<{ id: string; text: string; status: TaskStatus; order: number } | null>(null)
  useEffect(() => { if (!undo) return; const h = setTimeout(() => setUndo(null), 7000); return () => clearTimeout(h) }, [undo])

  const live = cols ?? base
  const find = (id: unknown): TaskStatus | undefined => (isStatus(id) ? id : STATUSES.find((s) => live[s].includes(String(id))))
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const collision: CollisionDetection = (args) => {
    const hits = pointerWithin(args)
    let overId = getFirstCollision(hits.length ? hits : rectIntersection(args), 'id')
    if (overId == null) return []
    if (isStatus(overId)) {
      const items = live[overId]
      const col = overId
      if (items.length) overId = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== col && items.includes(String(c.id))) })[0]?.id ?? overId
    }
    return [{ id: overId }]
  }

  const title = (id: unknown) => byId.get(String(id))?.title ?? 'Task'
  const where = (id: unknown) => { const s = find(id); return s ? `${s}, position ${live[s].indexOf(String(id)) + 1} of ${live[s].length}` : 'no column' }
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${title(active.id)}. Use arrow keys to move, space to drop, escape to cancel.`,
    onDragOver: ({ active, over }) => blockedRef.current ? `Cannot move to ${blockedRef.current.col}. ${blockedRef.current.reason}` : over ? `${title(active.id)} is now in ${where(active.id)}.` : undefined,
    onDragEnd: ({ active, over }) => over ? `${title(active.id)} dropped in ${where(active.id)}.` : `${title(active.id)} was not moved.`,
    onDragCancel: ({ active }) => `Move cancelled. ${title(active.id)} returned to ${byId.get(String(active.id))?.status}.`,
  }

  const onStart = ({ active }: DragStartEvent) => { setActiveId(String(active.id)); setCols(base); setUndo(null) }
  const onOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const id = String(active.id)
    const p = cols ?? base
    const from = STATUSES.find((s) => p[s].includes(id))
    const to = isStatus(over.id) ? over.id : STATUSES.find((s) => p[s].includes(String(over.id)))
    if (!from || !to || from === to) return setBlocked(null)
    const reason = moveBlockReason(id, to, me)
    if (reason) return setBlocked({ col: to, reason })
    setBlocked(null)
    const items = p[to]
    const overIndex = items.indexOf(String(over.id))
    const t = active.rect.current.translated
    const below = !!t && overIndex >= 0 && t.top > over.rect.top + over.rect.height / 2
    const at = isStatus(over.id) || overIndex < 0 ? items.length : overIndex + (below ? 1 : 0)
    setCols({ ...p, [from]: p[from].filter((x) => x !== id), [to]: [...items.slice(0, at), id, ...items.slice(at)] })
  }
  const reset = () => { setCols(null); setActiveId(null); setBlocked(null) }
  const onEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id), t = byId.get(id)
    let next = cols ?? base
    const reason = blockedRef.current
    if (over && t) {
      const from = STATUSES.find((s) => next[s].includes(id))
      const to = isStatus(over.id) ? over.id : STATUSES.find((s) => next[s].includes(String(over.id)))
      if (from && to && from === to) {
        const oldI = next[from].indexOf(id)
        const newI = isStatus(over.id) ? next[from].length - 1 : next[from].indexOf(String(over.id))
        if (oldI !== newI) next = { ...next, [from]: arrayMove(next[from], oldI, newI) }
      }
    }
    const fc = STATUSES.find((s) => next[s].includes(id))
    if (!t || !fc) return reset()
    const idx = next[fc].indexOf(id)
    const unchanged = fc === t.status && next[fc].join() === base[fc].join()
    if (unchanged) { if (reason && over && (over.id === reason.col || find(over.id) === reason.col)) toast(reason.reason, 'err'); return reset() }
    const was = { status: t.status, order: t.order ?? 0 }
    const err = moveTask(id, fc, next[fc][idx - 1] ?? null, next[fc][idx + 1] ?? null, me)
    if (err) toast(err, 'err')
    else setUndo({ id, text: fc === was.status ? `${t.id} reordered in ${fc}` : `${t.id} moved to ${fc}`, ...was })
    reset()
  }

  const active = activeId ? byId.get(activeId) : undefined
  const activeCol = activeId ? find(activeId) : undefined
  return (
    <>
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={reset} accessibility={{ announcements, screenReaderInstructions: { draggable: 'To pick up a task, focus its grip handle and press space. Use the arrow keys to move it between columns or up and down. Press space to drop, escape to cancel.' } }}>
        <div className="mt-4 grid grid-cols-none auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
          {STATUSES.map((s) => <Column key={s} status={s} ids={live[s]} rows={byId} highlight={!!active && activeCol === s} blocked={blocked?.col === s ? blocked.reason : null} canDrag={canDrag} renderBody={renderBody} />)}
        </div>
        <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {active ? <article className="relative cursor-grabbing rounded-md border border-teal bg-white p-3 pl-7 shadow-xl ring-2 ring-teal/30" style={{ transform: 'rotate(1.5deg)' }}><span className="absolute inset-y-0 left-0 flex w-6 items-center justify-center text-teal"><GripVertical size={15} /></span>{renderBody(active)}</article> : null}
        </DragOverlay>
      </DndContext>
      {undo && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[85] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-midnight px-4 py-2.5 text-sm text-white shadow-lg">
          <span>{undo.text}</span>
          <button type="button" onClick={() => { restoreTaskPosition(undo.id, undo.status, undo.order, me); setUndo(null) }} className="inline-flex cursor-pointer items-center gap-1 font-semibold text-softmint hover:underline"><Undo2 size={14} />Undo</button>
        </div>
      )}
    </>
  )
}
