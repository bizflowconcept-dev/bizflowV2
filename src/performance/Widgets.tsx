import { QUARTER, useGoalAttainment } from './Goals'
import { useState } from 'react'
import { Link } from 'react-router'
import { Badge, Btn, Field, inputCls, Overlay, Panel, Table, useToast } from '../components/ui'
import { CHART, RangeToggle, TrendChart } from '../components/charts'
import type { Employee } from '../data/demo'
import { bandOf, bandTone, bucketsFor, usePerformance, fmtHours, fmtPct, insightsFor, livePenalty, TARGETS, WEIGHTS } from './engine'
import type { Band, Card, Live, Period } from './engine'
import { addCheckIn, useCheckIns } from './checkins'

export const scoreColor = (s: number) => (s >= 85 ? 'bg-ok' : s >= 70 ? 'bg-teal' : s >= 55 ? 'bg-warn' : 'bg-err')

export function ScoreBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2" title={`${label}: ${value}`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${scoreColor(value)}`} style={{ width: `${value}%` }} /></div>
      <span className="num w-7 text-right text-sm font-semibold">{value}</span>
    </div>
  )
}

export function BandBadge({ band }: { band: Band }) { return <Badge tone={bandTone(band)}>{band}</Badge> }

export function Delta({ now, before }: { now: number; before?: number }) {
  if (before == null) return <span className="text-xs text-slate">—</span>
  const d = now - before
  if (d === 0) return <span className="num text-xs text-slate">no change</span>
  return <span className={`num text-xs font-semibold ${d > 0 ? 'text-ok' : 'text-err'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}</span>
}

function Pillar({ name, value, weight, note }: { name: string; value: number | null; weight: number; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-baseline justify-between"><div className="text-sm font-semibold">{name}</div><div className="text-[11px] text-slate">{weight}% of score</div></div>
      <div className="num mt-2 font-display text-3xl font-semibold leading-none">{value ?? '—'}</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${value == null ? '' : scoreColor(value)}`} style={{ width: `${value ?? 0}%` }} /></div>
      <p className="mt-2 text-xs text-slate">{note}</p>
    </div>
  )
}

const TONE = { good: 'bg-ok', warn: 'bg-warn', bad: 'bg-err' }

export function PerformancePanel({ slug, e, approver, live, viewerName, canCoach }: { slug: string; e: Employee; approver: boolean; live: Live; viewerName: string; canCoach: boolean }) {
  const [period, setPeriod] = useState<Period>('Month')
  const [pick, setPick] = useState(-1)
  const [coach, setCoach] = useState(false)
  const [kind, setKind] = useState<'Recognition' | 'Coaching' | 'Improvement plan'>('Coaching')
  const [note, setNote] = useState('')
  const toast = useToast()
  const checkins = useCheckIns(slug, e.id)
  const buckets = bucketsFor(e, approver, period)
  if (!buckets.length) return <Panel><p className="text-sm text-slate">No recorded activity for {e.name} yet. Performance appears as tasks, attendance and approvals are recorded.</p></Panel>
  const idx = pick >= 0 && pick < buckets.length ? pick : buckets.length - 1
  const b = buckets[idx], prev = buckets[idx - 1]
  const isLatest = idx === buckets.length - 1
  const pen = isLatest ? livePenalty(live) : 0
  const card: Card = pen ? { ...b.card, score: Math.max(0, b.card.score - pen), band: bandOf(Math.max(0, b.card.score - pen)) } : b.card
  const k = card.k
  const w = approver && card.approvals != null ? WEIGHTS.approver : WEIGHTS.staff
  const insights = insightsFor(card, prev?.card, isLive(live, isLatest), approver)
  const unit = period === 'Week' ? 'week' : period === 'Month' ? 'month' : 'year'
  const first = e.name.split(' ')[0]
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <RangeToggle value={period} onChange={(p) => { setPeriod(p as Period); setPick(-1) }} options={['Week', 'Month', 'Year']} />
          <label className="flex items-center gap-2 text-sm text-slate"><span className="sr-only sm:not-sr-only">Showing</span>
            <select aria-label="Period" value={idx} onChange={(ev) => setPick(Number(ev.target.value))} className="h-8 rounded-md border border-line bg-white px-2 text-[13px] font-semibold text-ink">
              {buckets.map((x, i) => <option key={x.long} value={i}>{x.long}{x.partial ? ' (so far)' : ''}</option>)}
            </select>
          </label>
        </div>
        {canCoach && <Btn v="secondary" s="sm" onClick={() => setCoach(true)}>Record check-in</Btn>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Panel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate">Performance score · {b.long}</div>
              <div className="mt-1 flex items-baseline gap-3"><span className="num font-display text-5xl font-semibold leading-none">{card.score}</span><span className="text-sm text-slate">/ 100</span></div>
              <div className="mt-3 flex items-center gap-3"><BandBadge band={card.band} /><Delta now={card.score} before={prev?.card.score} /><span className="text-xs text-slate">vs previous {unit}</span></div>
            </div>
          </div>
          {pen > 0 && <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">Includes −{pen} for work overdue right now ({live.overdue.length} task{live.overdue.length === 1 ? '' : 's'}{live.waiting.some((x) => x.days >= 3) ? ', approvals waiting 3+ days' : ''}). It clears once resolved. Tasks with a pending extension request are not penalised.</p>}
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 text-sm">
            <KPI label="Tasks on time" v={fmtPct(k.tasksOnTime)} target={`${TARGETS.tasksOnTime}%`} ok={k.tasksOnTime >= TARGETS.tasksOnTime} />
            <KPI label="Punctuality" v={fmtPct(k.punctuality)} target={`${TARGETS.punctuality}%`} ok={k.punctuality >= TARGETS.punctuality} />
            <KPI label="Attendance" v={fmtPct(k.attendanceRate)} target={`${TARGETS.attendance}%`} ok={k.attendanceRate >= TARGETS.attendance} />
            {approver && k.handled ? <KPI label="Approval turnaround" v={fmtHours(k.avgWait)} target={`${TARGETS.approvalHours}h`} ok={k.avgWait <= TARGETS.approvalHours} /> : <KPI label="First response" v={fmtHours(k.response)} target={`${TARGETS.responseHours}h`} ok={k.response <= TARGETS.responseHours} />}
          </div>
        </Panel>
        <Panel title={`Score trend · last ${buckets.length} ${unit}s`}>
          <TrendChart label={`Performance score by ${unit} for ${e.name}`} x="m" height={220} fmt={(v) => String(v)} data={buckets.map((x) => ({ m: x.label, Score: x.card.score, Tasks: x.card.tasks, Attendance: x.card.attendance }))} series={[{ key: 'Score', label: 'Overall', color: CHART.teal }, { key: 'Tasks', label: 'Tasks', color: CHART.blue, dashed: true }, { key: 'Attendance', label: 'Attendance', color: CHART.amber, dashed: true }]} />
        </Panel>
      </div>

      <div className={`grid gap-4 sm:grid-cols-2 ${card.approvals != null ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        <Pillar name="Task delivery" value={card.tasks} weight={w.tasks} note={`${k.done} of ${k.assigned} assigned finished, ${Math.round(k.tasksOnTime)}% on time${k.avgLate ? `, late ones ${k.avgLate.toFixed(1)}d over` : ''}`} />
        <Pillar name="Attendance" value={card.attendance} weight={w.attendance} note={`${k.presentDays} day${k.presentDays === 1 ? '' : 's'} present, ${k.lateArrivals} late${k.avgLateMins ? ` (avg ${Math.round(k.avgLateMins)} min)` : ''}, ${k.avgHours.toFixed(1)}h avg day`} />
        {card.approvals != null && <Pillar name="Approvals" value={card.approvals} weight={w.approvals} note={`${k.handled} decided, avg ${fmtHours(k.avgWait)}, ${Math.round(k.sla)}% inside ${TARGETS.approvalHours}h, ${k.rejectRate.toFixed(0)}% rejected`} />}
        <Pillar name="Engagement" value={card.engagement} weight={w.engagement} note={`Active ${Math.round(k.activeRate)}% of days, first response ${fmtHours(k.response)}, ${k.comments} comments`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title={`What stands out about ${first}`}>
          <ul className="space-y-3">
            {insights.map((i, n) => <li key={n} className="flex gap-3 text-sm"><span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${TONE[i.tone]}`} /><div><span className="sr-only">{i.tone === 'good' ? 'Strength: ' : i.tone === 'warn' ? 'Watch: ' : 'Concern: '}</span>{i.text}{i.action && canCoach && <div className="mt-0.5 text-xs font-semibold text-teal">Suggested: {i.action}</div>}</div></li>)}
          </ul>
        </Panel>
        <Panel title="Right now">
          <div className="space-y-3 text-sm">
            <Row l="Today" v={live.today ? <>{live.today.status === 'Late' ? <Badge tone="amber">Late</Badge> : <Badge tone="green">On time</Badge>}</> : e.status === 'On leave' ? <Badge>On leave</Badge> : <span className="text-slate">Not checked in</span>} sub={live.today?.detail} />
            <Row l="Open tasks" v={<b>{live.open.length}</b>} sub={live.overdue.length ? `${live.overdue.length} overdue` : live.blocked.length ? `${live.blocked.length} blocked` : 'None overdue'} bad={live.overdue.length > 0} />
            <Row l="Due in 48 hours" v={<b>{live.dueSoon.length}</b>} />
            {(live.joint.length > 0 || live.personal.length > 0) && <Row l="Not scored" v={<b>{live.joint.length + live.personal.length}</b>} sub={`${live.personal.length} personal, ${live.joint.length} joint`} />}
            {approver && <Row l="Waiting on their decision" v={<b>{live.waiting.length}</b>} sub={live.waiting.length ? live.waiting.map((x) => `${x.id} (${x.days}d)`).join(', ') : 'Nothing waiting'} bad={live.waiting.some((x) => x.days >= 3)} />}
          </div>
          {live.open.length > 0 && <Link to="/admin/business/tasks" className="mt-4 inline-block text-xs font-semibold text-teal">Open tasks</Link>}
        </Panel>
      </div>

      <Panel title={`History by ${unit}`} pad={false}>
        <Table label="Performance history" head={[period, 'Score', 'Tasks on time', 'Punctuality', 'Attendance', approver ? 'Approvals' : 'Response']} right={[2, 3, 4, 5]} pageSize={12}
          rows={[...buckets].reverse().map((x, n, arr) => [<span key="p" className="font-medium">{x.long}{x.partial && <span className="ml-1 text-xs text-slate">so far</span>}</span>, <span key="s" className="flex items-center gap-3"><ScoreBar value={x.card.score} label={`${x.long} score`} /><Delta now={x.card.score} before={arr[n + 1]?.card.score} /></span>, <span key="a" className="num">{fmtPct(x.card.k.tasksOnTime)}</span>, <span key="b" className="num">{fmtPct(x.card.k.punctuality)}</span>, <span key="c" className="num">{fmtPct(x.card.k.attendanceRate)}</span>, <span key="d" className="num">{approver && x.card.k.handled ? fmtHours(x.card.k.avgWait) : fmtHours(x.card.k.response)}</span>])} />
      </Panel>

      {checkins.length > 0 && (
        <Panel title="Check-ins and recognition">
          <ul className="divide-y divide-line">{checkins.map((c) => <li key={c.id} className="py-3 text-sm"><div className="flex items-center gap-2"><Badge tone={c.kind === 'Recognition' ? 'green' : c.kind === 'Coaching' ? 'blue' : 'amber'}>{c.kind}</Badge><span className="text-xs text-slate">{c.by} · {new Date(c.at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div><p className="mt-1.5">{c.note}</p></li>)}</ul>
        </Panel>
      )}

      <Method approver={approver} />

      <Overlay open={coach} onClose={() => setCoach(false)} title={`Check-in with ${e.name}`} side>
        <form onSubmit={(ev) => { ev.preventDefault(); addCheckIn({ slug, empId: e.id, name: e.name, by: viewerName, kind, note: note.trim() }); setCoach(false); setNote(''); toast('Check-in saved and added to the audit trail') }} className="space-y-4">
          <p className="rounded-lg bg-softmint p-3 text-sm text-slate">Visible to {first}, their manager, HR and company admins. Keep it specific: what happened, what good looks like, by when.</p>
          <Field label="Type"><select className={inputCls} value={kind} onChange={(ev) => setKind(ev.target.value as typeof kind)}><option>Recognition</option><option>Coaching</option><option>Improvement plan</option></select></Field>
          <Field label="Note"><textarea required minLength={10} rows={5} className={`${inputCls} h-auto py-2`} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={kind === 'Recognition' ? 'e.g. Closed the Ibadan payroll mismatch two days early.' : 'e.g. Three approvals this week waited over 48h. Agree a daily 4pm approval slot by Friday.'} /></Field>
          <div className="flex justify-end gap-2"><Btn type="button" v="secondary" onClick={() => setCoach(false)}>Cancel</Btn><Btn type="submit">Save check-in</Btn></div>
        </form>
      </Overlay>
    </div>
  )
}

const isLive = (live: Live, latest: boolean): Live => (latest ? live : { ...live, open: [], overdue: [], blocked: [], dueSoon: [], waiting: [] })

function KPI({ label, v, target, ok }: { label: string; v: string; target: string; ok: boolean }) {
  return <div><div className="text-xs text-slate">{label}</div><div className="mt-0.5 flex items-baseline gap-2"><span className="num text-lg font-semibold">{v}</span><span className={`text-[11px] font-semibold ${ok ? 'text-ok' : 'text-err'}`}>{ok ? 'On target' : `Target ${target}`}</span></div></div>
}
function Row({ l, v, sub, bad }: { l: string; v: React.ReactNode; sub?: string; bad?: boolean }) {
  return <div className="flex items-start justify-between gap-4"><div><div className="text-slate">{l}</div>{sub && <div className={`text-xs ${bad ? 'font-semibold text-err' : 'text-slate'}`}>{sub}</div>}</div><div>{v}</div></div>
}

export function Method({ approver }: { approver: boolean }) {
  const [open, setOpen] = useState(false)
  const w = approver ? WEIGHTS.approver : WEIGHTS.staff
  return (
    <div className="rounded-lg border border-line bg-white">
      <button aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold">How the score is calculated<span className="text-slate">{open ? 'Hide' : 'Show'}</span></button>
      {open && (
        <div className="space-y-3 border-t border-line px-5 py-4 text-sm text-slate">
          <p>Every score uses the same recorded activity and the same weights for everyone in the same kind of role, so results can be compared fairly. Approved leave is never counted against anyone.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            <li><b className="text-ink">Task delivery ({w.tasks}%)</b>: share of finished tasks that met their due date (60%) and share of assigned tasks finished (40%). Tasks you create for yourself, and work you join as a joint executor, are not counted.</li>
            <li><b className="text-ink">Attendance ({w.attendance}%)</b>: days present out of expected days, excluding leave (50%) and on-time arrival after grace (50%).</li>
            {approver && <li><b className="text-ink">Approvals ({w.approvals}%)</b>: for people who approve others' requests. Share decided within {TARGETS.approvalHours}h (60%) and average waiting time (40%).</li>}
            <li><b className="text-ink">Engagement ({w.engagement}%)</b>: active days (40%), how fast new work is first acted on (40%), and updates and comments on shared work (20%).</li>
          </ul>
          <p>The current period also loses a few points while tasks are overdue or approvals have waited 3+ days. Bands: Excellent 85+, Good 70+, Needs attention 55+, At risk below 55. Scores support conversations; they are not a verdict on a person.</p>
        </div>
      )}
    </div>
  )
}

export function MyPerformanceCard({ slug, name, empId }: { slug: string; name: string; empId: string }) {
  const { staff } = usePerformance(slug)
  const me = staff.find((x) => x.e.id === empId || x.e.name === name)
  const goals = useGoalAttainment(slug, name)
  const action = <Link to="/admin/business/performance" className="text-xs font-semibold text-teal">Open</Link>
  if (!me) return <Panel title="My performance" action={action}><p className="text-sm text-slate">Your score appears once you have recorded activity.</p></Panel>
  const bs = bucketsFor(me.e, me.approver, 'Month')
  const latest = bs[bs.length - 1]
  const fallback = !latest?.card.hasData
  const idx = fallback ? bs.length - 2 : bs.length - 1
  const cur = bs[idx], prev = bs[idx - 1]
  const score = cur?.card.hasData ? Math.max(0, cur.card.score - (fallback ? 0 : livePenalty(me.live))) : null
  if (score == null) return <Panel title="My performance" action={action}><p className="text-sm text-slate">No recorded activity yet this month.</p></Panel>
  const k = cur.card.k
  return (
    <Panel title="My performance" action={action}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div><div className="num font-display text-3xl font-semibold">{score}<span className="text-sm font-normal text-slate"> / 100</span></div><div className="mt-1 flex items-center gap-2"><BandBadge band={bandOf(score)} />{prev?.card.hasData && <Delta now={score} before={prev.card.score} />}</div></div>
        <div className="grid flex-1 grid-cols-3 gap-4 text-sm"><div><div className="text-xs text-slate">Tasks on time</div><div className="num font-semibold">{fmtPct(k.tasksOnTime)}</div></div><div><div className="text-xs text-slate">Punctuality</div><div className="num font-semibold">{fmtPct(k.punctuality)}</div></div><div><div className="text-xs text-slate">Overdue now</div><div className={`num font-semibold ${me.live.overdue.length ? 'text-err' : ''}`}>{me.live.overdue.length}</div></div></div>
      </div>
      {goals && <Link to="/admin/business/performance?tab=Goals" className="mt-3 block border-t border-line pt-3 text-sm"><span className="text-slate">Goal attainment, {QUARTER}: </span><b className="num">{goals.pct}%</b> <span className="text-xs text-slate">across {goals.count} goal{goals.count === 1 ? '' : 's'}</span></Link>}
      <p className="mt-3 border-t border-line pt-3 text-xs text-slate">{fallback ? `Not enough days recorded yet this month, so this is ${cur.long ?? 'last month'}.` : 'This month so far.'} Open to check any day, week or year.</p>
    </Panel>
  )
}
