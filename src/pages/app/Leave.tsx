import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useRole } from '../../components/app/AppLayout'
import { Avatar, Badge, Btn, EmptyState, Field, inputCls, Overlay, Panel, PageHeader, Stat, Table, Tabs, useToast } from '../../components/ui'
import { approvalsForTenant, employeesForTenant, ngn } from '../../data/demo'
import { useTenant } from '../../tenant/store'
import { TODAY, dueLabel, useTasks } from '../../tasks/store'
import { useLeads, OPEN_STAGES } from '../../crm/store'
import {
  ENTITLEMENT, LEAVE_TYPES, addDays, affectedTasks, applyForLeave, balancesFor, cancelLeave, coverConflict, decideLeave, effectiveTo, fmtDate, fmtShort, handoverState, holidayName, isWorkingDay,
  returnFromLeave, useLeave, validate, workingDays,
} from '../../leave/store'
import type { HandoverItem, LeaveInput, LeaveReq, LeaveStatus, LeaveType } from '../../leave/store'

const textarea = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-slate/70 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20'
const STATUS_TONE: Record<LeaveStatus, string> = { Pending: 'amber', Approved: 'green', Declined: 'red', Cancelled: 'gray', Completed: 'blue' }
const HAND_TONE: Record<string, string> = { 'Awaiting approval': 'amber', Scheduled: 'blue', 'In effect': 'green', 'Handed back': 'gray', Cancelled: 'gray' }
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const range = (r: LeaveReq) => (r.from === r.to ? `${fmtDate(r.from)}${r.half ? ` (${r.half === 'AM' ? 'morning' : 'afternoon'})` : ''}` : `${fmtShort(r.from)} to ${fmtDate(r.to)}`)

function Bar({ value, max, color = 'bg-teal' }: { value: number; max: number; color?: string }) {
  return <div className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]"><div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.max(2, Math.min(100, (value / max) * 100)) : 0}%` }} /></div>
}

export default function Leave() {
  const { r, can } = useRole()
  const tenant = useTenant()
  const slug = tenant?.slug ?? 'etranzact'
  const all = useLeave(slug)
  const tasks = useTasks()
  const employees = useMemo(() => employeesForTenant(slug), [slug])
  const me = employees.find((e) => e.name === r.user)
  const isHr = can('people.manage') || can('leave.manage')
  const isManager = employees.some((e) => e.manager === r.user)
  const canDecide = (q: LeaveReq) => q.employee !== r.user && (isHr || employees.find((e) => e.name === q.employee)?.manager === r.user)
  const tabs = ['My leave', 'Team calendar', ...(isHr || isManager ? ['Approvals'] : []), ...(isHr ? ['Insights'] : [])]
  const [sp, setSp] = useSearchParams()
  const [tab, setTab] = useState(tabs.includes(sp.get('tab') ?? '') ? (sp.get('tab') as string) : 'My leave')
  const [applying, setApplying] = useState(false)
  const [openId, setOpenId] = useState<string | null>(sp.get('req'))
  const open = all.find((x) => x.id === openId)
  const waiting = all.filter((x) => x.status === 'Pending' && canDecide(x))
  const closeDrawer = () => { setOpenId(null); if (sp.get('req')) { sp.delete('req'); setSp(sp, { replace: true }) } }

  return (
    <div>
      <PageHeader eyebrow="People" title="Leave and handover" desc="Time away is planned, approved and covered. Every task has someone looking after it while you are out, and it comes back to you when you return."
        actions={me ? <Btn onClick={() => setApplying(true)}>Apply for leave</Btn> : undefined} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'My leave' && <MyLeave all={all} me={r.user} hasProfile={!!me} onOpen={setOpenId} onApply={() => setApplying(true)} waiting={waiting.length} goApprovals={() => setTab('Approvals')} />}
        {tab === 'Team calendar' && <Calendar all={all} />}
        {tab === 'Approvals' && <Approvals all={all} canDecide={canDecide} onOpen={setOpenId} />}
        {tab === 'Insights' && <Insights all={all} slug={slug} onOpen={setOpenId} />}
      </div>
      {me && applying && <Apply slug={slug} me={me.name} all={all} onClose={() => setApplying(false)} onDone={(id) => { setApplying(false); setOpenId(id) }} />}
      {open && <Detail q={open} me={r.user} isHr={isHr} canDecide={canDecide(open)} onClose={closeDrawer} />}
    </div>
  )
}

/* ---------------- My leave ---------------- */
function MyLeave({ all, me, hasProfile, onOpen, onApply, waiting, goApprovals }: { all: LeaveReq[]; me: string; hasProfile: boolean; onOpen: (id: string) => void; onApply: () => void; waiting: number; goApprovals: () => void }) {
  const mine = all.filter((x) => x.employee === me).sort((a, b) => b.from.localeCompare(a.from))
  const bal = balancesFor(all, me)
  const live = mine.find((x) => x.status === 'Approved' && x.from <= TODAY && TODAY <= x.to)
  if (!hasProfile) return <Panel><EmptyState title="No employee record for this account" body="Leave is taken by employees of this workspace. Use the Team calendar or Approvals tabs to oversee leave." /></Panel>
  return (
    <div className="space-y-5">
      {live && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal/30 bg-softmint px-4 py-3 text-sm"><span><b>You are on leave until {fmtDate(live.to)}.</b> {live.handover.items.filter((i) => i.cover && !i.canWait).length} task(s) are being covered. They come back to you when you return.</span><Btn s="sm" onClick={() => onOpen(live.id)}>Open handover</Btn></div>}
      {waiting > 0 && <button onClick={goApprovals} className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900"><span><b>{waiting} leave request{waiting === 1 ? '' : 's'}</b> waiting for your decision.</span><span className="font-semibold">Review →</span></button>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {bal.filter((b) => ['Annual', 'Sick', 'Casual', 'Study'].includes(b.type)).map((b) => (
          <Panel key={b.type}>
            <div className="text-[13px] text-slate">{b.type} leave</div>
            <div className="mt-1 text-2xl font-semibold text-ink">{Math.max(0, b.left)} <span className="text-sm font-normal text-slate">of {b.entitlement} days left</span></div>
            <div className="mt-2"><Bar value={b.used + b.pending} max={b.entitlement} /></div>
            <div className="mt-1.5 text-xs text-slate">{b.used} taken{b.pending ? `, ${b.pending} pending` : ''}</div>
          </Panel>
        ))}
      </div>
      <Panel title="My requests" action={<Btn s="sm" onClick={onApply}>Apply for leave</Btn>} pad={false}>
        {mine.length === 0 ? <div className="p-5"><EmptyState title="No leave requests yet" body="When you apply, you will hand over your open tasks before the request goes to your manager." action={<Btn onClick={onApply}>Request leave</Btn>} /></div> :
          <Table label="My leave requests" head={['Request', 'Type', 'Dates', 'Days', 'Status', 'Handover', '']} right={[3]} rows={mine.map((x) => [
            <span key="i" className="font-mono text-xs">{x.id}</span>, x.type, range(x), String(x.days), <Badge key="s" tone={STATUS_TONE[x.status]}>{x.status}</Badge>,
            <Badge key="h" tone={HAND_TONE[handoverState(x)]}>{handoverState(x)}</Badge>, <button key="o" onClick={() => onOpen(x.id)} className="text-xs font-semibold text-teal">View</button>,
          ])} />}
      </Panel>
      <Panel title="Entitlements">
        <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{bal.map((b) => <div key={b.type} className="flex justify-between border-b border-line/60 py-1.5"><span className="text-slate">{b.type}</span><span><b>{Math.max(0, b.left)}</b> / {ENTITLEMENT[b.type]} days</span></div>)}</div>
        <p className="mt-3 text-xs text-slate">Days are counted on working days only. Weekends and Nigerian public holidays (for example 1 Oct, 25 and 26 Dec, 1 Jan) are never deducted.</p>
      </Panel>
    </div>
  )
}

/* ---------------- Apply + mandatory handover ---------------- */
type Ov = Record<string, { cover?: string; note: string; canWait: boolean; why: string }>
function Apply({ slug, me, all, onClose, onDone }: { slug: string; me: string; all: LeaveReq[]; onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast()
  const tasks = useTasks()
  const leads = useLeads(slug)
  const employees = useMemo(() => employeesForTenant(slug), [slug])
  const emp = employees.find((e) => e.name === me)
  const [f, setF] = useState({ type: 'Annual' as LeaveType, from: '2026-11-23', to: '2026-11-27', half: '' as '' | 'AM' | 'PM', reason: '', relief: '' })
  const [ov, setOv] = useState<Ov>({})
  const [note, setNote] = useState('')
  const myApprovals = emp && employees.some((x) => x.manager === me) ? approvalsForTenant(slug).filter((a) => a.stage === 'Pending').length : 0
  const myLeads = leads.filter((l) => l.owner === me && OPEN_STAGES.includes(l.stage)).length
  const affected = useMemo(() => (f.to || f.from ? affectedTasks(tasks, slug, me, f.to || f.from) : []), [tasks, slug, me, f.to, f.from])
  const people = employees.filter((e) => e.name !== me && e.status !== 'Onboarding')
  const days = workingDays(f.from, f.to, f.half || undefined)
  const eff = (t: { id: string }): { cover: string; note: string; canWait: boolean; why: string } => { const o = ov[t.id]; return { cover: o?.cover === undefined ? f.relief : o.cover, note: o?.note ?? '', canWait: o?.canWait ?? false, why: o?.why ?? '' } }
  const setItem = (id: string, p: Partial<Ov[string]>) => setOv({ ...ov, [id]: { ...{ note: '', canWait: false, why: '' }, ...ov[id], ...p } })
  const items: HandoverItem[] = affected.map((t) => ({ taskId: t.id, title: t.title, due: t.due, ...eff(t) }))
  const input: LeaveInput = { type: f.type, from: f.from, to: f.to, half: f.half || undefined, reason: f.reason, relief: f.relief, handover: { items, approvals: myApprovals, leads: myLeads, note } }
  const chk = validate(all, me, input)
  const bal = balancesFor(all, me).find((b) => b.type === f.type)
  const holidays = (() => { const out: string[] = []; if (f.from && f.to >= f.from && f.to <= addDays(f.from, 120)) for (let d = f.from; d <= f.to; d = addDays(d, 1)) { const h = holidayName(d); if (h) out.push(`${fmtShort(d)} ${h}`) } return out })()
  const submit = () => {
    const res = applyForLeave(slug, me, input)
    if (!res.ok) { toast(res.error ?? 'Could not submit'); return }
    toast('Leave request and handover submitted for approval'); onDone(res.id!)
  }
  return (
    <Overlay open onClose={onClose} title="Apply for leave" wide>
      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-ink">1. Your leave</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Leave type"><select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as LeaveType })}>{LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Relief officer" hint={people.length ? "Default cover for your tasks" : "Add a colleague under Employees first so someone can cover for you."}><select className={inputCls} value={f.relief} onChange={(e) => setF({ ...f, relief: e.target.value })}><option value="">Choose a colleague</option>{people.map((p) => <option key={p.id}>{p.name}</option>)}</select></Field>
            <Field label="First day"><input type="date" className={inputCls} value={f.from} min={f.type === 'Sick' ? undefined : TODAY} onChange={(e) => setF({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to })} /></Field>
            <Field label="Last day"><input type="date" className={inputCls} value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
            <Field label="Half day" hint="Single day only"><select className={inputCls} value={f.half} onChange={(e) => setF({ ...f, half: e.target.value as '' | 'AM' | 'PM' })} disabled={f.from !== f.to}><option value="">Full day</option><option value="AM">Morning only</option><option value="PM">Afternoon only</option></select></Field>
            <div className="rounded-md bg-cloud px-3 py-2 text-sm"><div className="text-slate">Working days to be deducted</div><div className="text-lg font-semibold text-ink">{days}{bal ? <span className="ml-2 text-xs font-normal text-slate">{Math.max(0, bal.left)} {f.type.toLowerCase()} days available</span> : null}</div>{holidays.length > 0 && <div className="mt-1 text-xs text-slate">Public holidays in range: {holidays.join(', ')}</div>}</div>
          </div>
          <div className="mt-3"><Field label="Reason"><textarea className={textarea} rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="A short reason for your manager" /></Field></div>
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold text-ink">2. Handover (required)</h3>
          <p className="mb-3 text-[13px] text-slate">Your work does not stop while you are away. Each open task that is due, or being worked on, up to your last day needs a cover person, or an honest reason it can wait. Cover people join as joint executors, so no one is scored unfairly.</p>
          {affected.length === 0 ? <p className="rounded-md bg-cloud px-3 py-3 text-sm text-slate">You have no open tasks in this window. Nothing to hand over except the notes below.</p> : (
            <ul className="space-y-3">
              {affected.map((t) => {
                const e = eff(t); const conflict = e.cover && !e.canWait ? coverConflict(all, e.cover, f.from, f.to) : undefined
                return (
                  <li key={t.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="text-sm font-semibold text-ink">{t.title}</div><div className="text-xs text-slate"><span className="font-mono">{t.id}</span> · {t.status} · due {dueLabel(t.due)}{t.due >= f.from && t.due <= f.to ? ' (during your leave)' : t.due < f.from ? ' (already due)' : ''}</div></div>
                      <label className="flex items-center gap-2 text-xs text-slate"><input type="checkbox" checked={e.canWait} onChange={(x) => setItem(t.id, { canWait: x.target.checked })} />Can wait until I return</label></div>
                    {e.canWait ? <div className="mt-2"><input className={inputCls} aria-label={`Why ${t.id} can wait`} placeholder="Why can this wait? (required)" value={e.why} onChange={(x) => setItem(t.id, { why: x.target.value })} /></div> : (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <select aria-label={`Cover for ${t.id}`} className={inputCls} value={e.cover} onChange={(x) => setItem(t.id, { cover: x.target.value })}><option value="">Choose cover person</option>{people.map((p) => <option key={p.id}>{p.name}</option>)}</select>
                        <input className={inputCls} aria-label={`Handover note for ${t.id}`} placeholder="Note for the cover person" value={e.note} onChange={(x) => setItem(t.id, { note: x.target.value })} />
                      </div>)}
                    {conflict && <p className="mt-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800">{e.cover} is on leave {fmtShort(conflict.from)} to {fmtShort(conflict.to)}. Pick someone who will be in.</p>}
                  </li>)
              })}
            </ul>)}
          <div className="mt-4 rounded-lg border border-line p-3">
            <div className="flex flex-wrap gap-4 text-sm"><span><b>{myApprovals}</b> <span className="text-slate">pending approvals waiting on you</span></span><span><b>{myLeads}</b> <span className="text-slate">open sales leads you own</span></span></div>
            <div className="mt-2"><textarea className={textarea} rows={2} aria-label="Handover note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={myApprovals + myLeads > 0 ? 'Who handles your approvals and leads, and anything they should know (required)' : 'Anything else your cover should know (optional)'} /></div>
          </div>
        </section>

        {chk.warnings.length > 0 && <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{chk.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        {chk.errors.length > 0 && <div className="rounded-md bg-cloud px-3 py-2 text-xs text-slate"><div className="mb-1 font-semibold text-ink">Before you can submit</div><ul className="list-disc space-y-0.5 pl-4">{chk.errors.map((w) => <li key={w}>{w}</li>)}</ul></div>}
        <div className="flex justify-end gap-2"><Btn v="secondary" onClick={onClose}>Close</Btn><Btn onClick={submit} disabled={!chk.ok}>Submit leave and handover</Btn></div>
      </div>
    </Overlay>
  )
}

/* ---------------- Detail ---------------- */
function Detail({ q, me, isHr, canDecide, onClose }: { q: LeaveReq; me: string; isHr: boolean; canDecide: boolean; onClose: () => void }) {
  const toast = useToast()
  const tasks = useTasks()
  const [comment, setComment] = useState('')
  const state = handoverState(q)
  const mine = q.employee === me
  const live = q.status === 'Approved' && q.from <= TODAY
  const act = (fn: () => void, msg: string) => { fn(); toast(msg) }
  return (
    <Overlay open onClose={onClose} title={`${q.type} leave · ${q.employee}`} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[q.status]}>{q.status}</Badge><Badge tone={HAND_TONE[state]}>Handover: {state}</Badge><span className="font-mono text-xs text-slate">{q.id}</span></div>
        <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><span className="text-slate">Dates </span><b>{range(q)}</b></div><div><span className="text-slate">Working days </span><b>{q.days}</b></div>
          <div><span className="text-slate">Relief officer </span><b>{q.relief}</b></div><div><span className="text-slate">Applied </span><b>{fmtDate(q.applied)}</b></div>
          <div className="sm:col-span-2"><span className="text-slate">Reason </span>{q.reason}</div>
          {q.decidedBy && <div className="sm:col-span-2"><span className="text-slate">{q.status === 'Declined' ? 'Declined' : 'Approved'} by </span><b>{q.decidedBy}</b>{q.comment ? <span className="text-slate"> · "{q.comment}"</span> : null}</div>}
          {q.returnedOn && <div className="sm:col-span-2"><span className="text-slate">{q.returnKind} </span><b>Back on {fmtDate(q.returnedOn)}</b>{q.handback ? <span className="text-slate"> · {q.handback}</span> : null}</div>}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Task handover</h3>
          {q.handover.items.length === 0 ? <p className="rounded-md bg-cloud px-3 py-2 text-sm text-slate">No open tasks needed cover.</p> : (
            <ul className="space-y-2">{q.handover.items.map((i) => {
              const t = tasks.find((x) => x.id === i.taskId)
              return (
                <li key={i.taskId} className="rounded-lg border border-line px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-ink">{i.title}</span>
                    {i.canWait ? <Badge tone="gray">Can wait</Badge> : <span className="flex items-center gap-1.5 text-xs text-slate"><Avatar name={i.cover} size={20} />{state === 'In effect' || state === 'Scheduled' ? 'Covered by' : 'Cover'} <b className="text-ink">{i.cover}</b></span>}</div>
                  <div className="text-xs text-slate"><Link to="/admin/business/tasks" className="font-mono text-teal">{i.taskId}</Link> · due {dueLabel(i.due)}{t ? ` · now ${t.status}` : ''}</div>
                  {(i.note || i.why) && <p className="mt-1 text-[13px] text-slate">{i.canWait ? `Can wait: ${i.why}` : i.note}</p>}
                </li>)
            })}</ul>)}
          <div className="mt-3 rounded-lg border border-line px-3 py-2.5 text-sm"><div className="text-slate"><b className="text-ink">{q.handover.approvals}</b> pending approvals · <b className="text-ink">{q.handover.leads}</b> open leads</div>{q.handover.note && <p className="mt-1 text-[13px]">{q.handover.note}</p>}</div>
        </div>

        {(canDecide && q.status === 'Pending') && (
          <div className="space-y-2 rounded-lg border border-line p-3"><Field label="Comment" hint="Shown to the employee"><textarea className={textarea} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
            <div className="flex gap-2"><Btn onClick={() => act(() => decideLeave(q.id, true, me, comment), 'Leave approved. Handover is now in effect.')}>Approve</Btn><Btn v="secondary" onClick={() => comment.trim() ? act(() => decideLeave(q.id, false, me, comment), 'Leave declined. Handover cancelled.') : toast('Add a comment before declining')}>Decline</Btn></div></div>)}
        <div className="flex flex-wrap gap-2">
          {mine && (q.status === 'Pending' || (q.status === 'Approved' && q.from > TODAY)) && <Btn v="secondary" onClick={() => act(() => cancelLeave(q.id, me), 'Leave cancelled')}>Cancel leave</Btn>}
          {mine && live && <Btn onClick={() => act(() => returnFromLeave(q.id, me, 'Early return', comment || 'Returned early'), 'Welcome back. Your tasks are handed back to you.')}>I am back early</Btn>}
          {isHr && live && !mine && <Btn v="secondary" onClick={() => act(() => returnFromLeave(q.id, me, 'Simulated return', 'Leave period ended'), 'Leave ended. Tasks handed back.')}>Simulate return</Btn>}
          {isHr && live && mine && <Btn v="secondary" onClick={() => act(() => returnFromLeave(q.id, me, 'Simulated return', 'Leave period ended'), 'Leave ended. Tasks handed back.')}>Simulate end of leave</Btn>}
        </div>
        {live && <Field label="Handback note" hint="Optional, recorded when tasks return to the original owner"><input className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything the cover person should know" /></Field>}
      </div>
    </Overlay>
  )
}

/* ---------------- Team calendar ---------------- */
function Calendar({ all }: { all: LeaveReq[] }) {
  const [month, setMonth] = useState(TODAY.slice(0, 7))
  const first = `${month}-01`
  const dow = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7
  const dim = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()
  const shift = (n: number) => { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)) }
  const live = all.filter((x) => x.status === 'Pending' || x.status === 'Approved' || x.status === 'Completed')
  const on = (iso: string) => live.filter((x) => x.from <= iso && iso <= effectiveTo(x))
  const monthEnd = `${month}-${String(dim).padStart(2, '0')}`
  const list = live.filter((x) => x.from <= monthEnd && effectiveTo(x) >= first).sort((a, b) => a.from.localeCompare(b.from))
  const cells = Array.from({ length: Math.ceil((dow + dim) / 7) * 7 }, (_, i) => i - dow + 1)
  return (
    <div className="space-y-5">
      <Panel title={new Date(first + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })} action={<div className="flex gap-1"><Btn s="sm" v="secondary" onClick={() => shift(-1)}>Previous</Btn><Btn s="sm" v="secondary" onClick={() => shift(1)}>Next</Btn></div>}>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line text-xs">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="bg-cloud px-2 py-1.5 font-semibold text-slate">{d}</div>)}
          {cells.map((n, i) => {
            if (n < 1 || n > dim) return <div key={i} className="min-h-20 bg-cloud/60" />
            const iso = `${month}-${String(n).padStart(2, '0')}`; const who = on(iso); const hol = holidayName(iso); const off = !isWorkingDay(iso)
            return (
              <div key={i} className={`min-h-20 bg-white p-1.5 ${off ? 'bg-cloud/50' : ''} ${iso === TODAY ? 'ring-2 ring-inset ring-teal' : ''}`}>
                <div className={`mb-1 flex justify-between ${iso === TODAY ? 'font-bold text-teal' : 'text-slate'}`}><span>{n}</span>{hol && <span className="truncate text-[10px] text-amber-700" title={hol}>{hol}</span>}</div>
                <div className="space-y-0.5">{who.slice(0, 3).map((x) => <div key={x.id} title={`${x.employee} · ${x.type}${x.status === 'Pending' ? ' (pending)' : ''}${x.relief ? ` · relief ${x.relief}` : ''}`} className={`truncate rounded px-1 py-0.5 text-[11px] ${x.status === 'Pending' ? 'border border-dashed border-amber-300 bg-amber-50 text-amber-800' : 'bg-softmint text-ink'}`}>{x.employee.split(' ')[0]}</div>)}{who.length > 3 && <div className="text-[11px] text-slate">+{who.length - 3} more</div>}</div>
              </div>)
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate"><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-softmint ring-1 ring-teal/40" />Approved</span><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded border border-dashed border-amber-300 bg-amber-50" />Pending</span></div>
      </Panel>
      <Panel title="Who is away this month" pad={false}>
        {list.length === 0 ? <div className="p-5"><EmptyState title="Everyone is in" body="No leave is booked for this month." /></div> :
          <Table label="Away this month" head={['Employee', 'Dates', 'Type', 'Status', 'Cover']} rows={list.map((x) => {
            const covers = [...new Set(x.handover.items.filter((i) => i.cover && !i.canWait).map((i) => i.cover))]
            return [<span key="e" className="inline-flex items-center gap-2"><Avatar name={x.employee} size={22} />{x.employee}</span>, range(x), x.type, <Badge key="s" tone={STATUS_TONE[x.status]}>{x.status}</Badge>, covers.length ? covers.join(', ') : x.relief ? `${x.relief} (relief)` : 'None']
          })} />}
      </Panel>
    </div>
  )
}

/* ---------------- Approvals ---------------- */
function Approvals({ all, canDecide, onOpen }: { all: LeaveReq[]; canDecide: (q: LeaveReq) => boolean; onOpen: (id: string) => void }) {
  const pending = all.filter((x) => x.status === 'Pending' && canDecide(x))
  const recent = all.filter((x) => x.status !== 'Pending' && x.decidedBy && canDecide(x)).sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''))
  return (
    <div className="space-y-5">
      <Panel title={`Waiting for your decision (${pending.length})`} pad={false}>
        {pending.length === 0 ? <div className="p-5"><EmptyState title="Nothing waiting" body="Leave requests from your team appear here with their handover plan." /></div> :
          <Table label="Pending leave" head={['Employee', 'Type', 'Dates', 'Days', 'Handover', '']} right={[3]} rows={pending.map((x) => {
            const open = x.handover.items.length; const wait = x.handover.items.filter((i) => i.canWait).length
            return [<span key="e" className="inline-flex items-center gap-2"><Avatar name={x.employee} size={22} />{x.employee}</span>, x.type, range(x), String(x.days), `${open} task${open === 1 ? '' : 's'}${wait ? `, ${wait} can wait` : ''}`, <button key="o" onClick={() => onOpen(x.id)} className="text-xs font-semibold text-teal">Review</button>]
          })} />}
      </Panel>
      <Panel title="Recent decisions" pad={false}>
        {recent.length === 0 ? <div className="p-5 text-sm text-slate">No decisions yet.</div> :
          <Table label="Recent leave decisions" head={['Employee', 'Type', 'Dates', 'Status', 'Decided by', '']} rows={recent.map((x) => [x.employee, x.type, range(x), <Badge key="s" tone={STATUS_TONE[x.status]}>{x.status}</Badge>, x.decidedBy ?? '', <button key="o" onClick={() => onOpen(x.id)} className="text-xs font-semibold text-teal">View</button>])} />}
      </Panel>
    </div>
  )
}

/* ---------------- Insights ---------------- */
function Insights({ all, slug, onOpen }: { all: LeaveReq[]; slug: string; onOpen: (id: string) => void }) {
  const tasks = useTasks()
  const employees = useMemo(() => employeesForTenant(slug).filter((e) => e.status !== 'Onboarding'), [slug])
  const horizon = addDays(TODAY, 30)
  const away = all.filter((x) => x.status === 'Approved' && x.from <= TODAY && TODAY <= x.to)
  const upcoming = all.filter((x) => (x.status === 'Approved' || x.status === 'Pending') && x.from > TODAY && x.from <= horizon).sort((a, b) => a.from.localeCompare(b.from))
  const rows = employees.map((e) => ({ e, a: balancesFor(all, e.name).find((b) => b.type === 'Annual')! }))
  const depts = Object.values(rows.reduce<Record<string, { dept: string; n: number; used: number; ent: number }>>((m, { e, a }) => { const d = (m[e.dept] ??= { dept: e.dept, n: 0, used: 0, ent: 0 }); d.n++; d.used += a.used; d.ent += a.entitlement; return m }, {})).sort((a, b) => pct(b.used, b.ent) - pct(a.used, a.ent))
  const liab = rows.map(({ e, a }) => ({ e, days: Math.max(0, a.left), value: Math.round((Math.max(0, a.left) * e.salary) / 22) })).sort((a, b) => b.value - a.value)
  const total = liab.reduce((s, x) => s + x.value, 0)
  const uncovered = all.filter((x) => (x.status === 'Approved' || x.status === 'Pending') && effectiveTo(x) >= TODAY).flatMap((x) => {
    const cov = new Set(x.handover.items.filter((i) => i.cover && !i.canWait).map((i) => i.taskId))
    const waits = x.handover.items.filter((i) => i.canWait).map((i) => ({ q: x, id: i.taskId, title: i.title, due: i.due, why: `Marked can wait: ${i.why}` }))
    const missed = x.status === 'Approved' ? affectedTasks(tasks, slug, x.employee, x.to).filter((t) => !cov.has(t.id) && !x.handover.items.some((i) => i.taskId === t.id)).map((t) => ({ q: x, id: t.id, title: t.title, due: t.due, why: 'Assigned after the handover was agreed' })) : []
    return [...waits, ...missed]
  })
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Away today" value={String(away.length)} sub={away.map((x) => x.employee.split(' ')[0]).join(', ') || 'Everyone is in'} />
        <Stat label="Starting in 30 days" value={String(upcoming.length)} sub={`${upcoming.filter((x) => x.status === 'Pending').length} awaiting approval`} />
        <Stat label="Annual leave liability" value={ngn(total)} sub="Unused days at daily pay" />
        <Stat label="Tasks without cover" value={String(uncovered.length)} sub="Marked can wait or added later" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Annual leave used by department">
          <ul className="space-y-3">{depts.map((d) => <li key={d.dept}><div className="mb-1 flex justify-between text-sm"><span className="text-ink">{d.dept} <span className="text-slate">({d.n})</span></span><span className="text-slate">{pct(d.used, d.ent)}% · {d.used} of {d.ent} days</span></div><Bar value={d.used} max={d.ent} /></li>)}</ul>
        </Panel>
        <Panel title="Leave liability" pad={false}>
          <Table label="Leave liability" head={['Employee', 'Unused days', 'Value']} right={[1, 2]} rows={liab.slice(0, 7).map((x) => [x.e.name, String(x.days), ngn(x.value)])} pageSize={7} />
        </Panel>
      </div>
      <Panel title="Upcoming absences" pad={false}>
        {upcoming.length === 0 ? <div className="p-5 text-sm text-slate">No leave starts in the next 30 days.</div> :
          <Table label="Upcoming absences" head={['Employee', 'Dates', 'Days', 'Status', 'Relief', '']} right={[2]} rows={upcoming.map((x) => [x.employee, range(x), String(x.days), <Badge key="s" tone={STATUS_TONE[x.status]}>{x.status}</Badge>, x.relief, <button key="o" onClick={() => onOpen(x.id)} className="text-xs font-semibold text-teal">View</button>])} />}
      </Panel>
      <Panel title="Who is uncovered" pad={false}>
        {uncovered.length === 0 ? <div className="p-5 text-sm text-slate">Every task of people who are away or about to be away has a cover person.</div> :
          <Table label="Uncovered tasks" head={['Employee', 'Task', 'Due', 'Why', '']} rows={uncovered.map((u) => [u.q.employee, `${u.id} ${u.title}`, dueLabel(u.due), u.why, <button key="o" onClick={() => onOpen(u.q.id)} className="text-xs font-semibold text-teal">View</button>])} />}
      </Panel>
    </div>
  )
}
