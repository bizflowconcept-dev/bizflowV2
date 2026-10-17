import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CalendarClock, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { Badge, Btn, EmptyState, PageHeader, Panel, Tabs } from '../../components/ui'
import { useRole } from '../../components/app/AppLayout'
import { useTenant } from '../../tenant/store'
import { todayKey, useAttendance } from '../../attendance/store'
import { attendanceOn, bandTone, dayFor, fmtHours, usePerformance, visibleStaff } from '../../performance/engine'
import { PerformancePanel } from '../../performance/Widgets'
import { isSelfTask, pendingExtension, useTasks } from '../../tasks/store'
import type { Task } from '../../tasks/store'
import Goals from '../../performance/Goals'
import Attendance from './Attendance'
import TeamPerformance from './Performance'

const shift = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const longDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const DOT = { green: 'bg-ok', amber: 'bg-warn', red: 'bg-err', blue: 'bg-info', gray: 'bg-line' } as const

function DayBar({ date, setDate, today }: { date: string; setDate: (d: string) => void; today: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2.5">
      <span className="px-1.5 text-[13px] font-semibold">Check a day</span>
      <button aria-label="Previous day" onClick={() => setDate(shift(date, -1))} className="grid size-9 cursor-pointer place-items-center rounded-md border border-line text-slate hover:text-ink"><ChevronLeft size={16} /></button>
      <input aria-label="Choose a date" type="date" value={date} max={today} min="2023-01-02" onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} className="h-9 rounded-md border border-line bg-white px-2.5 text-sm" />
      <button aria-label="Next day" disabled={date >= today} onClick={() => setDate(shift(date, 1))} className="grid size-9 cursor-pointer place-items-center rounded-md border border-line text-slate hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16} /></button>
      <Btn s="sm" v={date === today ? 'primary' : 'secondary'} onClick={() => setDate(today)}>Today</Btn>
      <Btn s="sm" v={date === shift(today, -1) ? 'primary' : 'secondary'} onClick={() => setDate(shift(today, -1))}>Yesterday</Btn>
      <span className="ml-auto hidden text-sm text-slate md:block">{longDate(date)}</span>
    </div>
  )
}

function TaskTag({ t, name }: { t: Task; name: string }) {
  if (isSelfTask(t)) return <Badge tone="gray">Personal · not scored</Badge>
  if (!t.assignees.includes(name)) return <Badge tone="blue">Joint · not scored</Badge>
  return null
}

function Overview({ slug, date, setDateFor, today, me, viewer }: { slug: string; date: string; setDateFor: (d: string) => void; today: string; me: ReturnType<typeof usePerformance>['staff'][number] | undefined; viewer: string }) {
  const { records } = useAttendance(slug)
  const tasks = useTasks()
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => shift(today, i - 13)), [today])
  if (!me) return <Panel><EmptyState title="No performance record yet" body="Your performance appears once you have recorded activity in this workspace." /></Panel>
  const first = me.e.name.split(' ')[0]
  const att = attendanceOn(me.e, me.approver, date, records)
  const dv = dayFor(me.e, me.approver, date)
  const dueThen = tasks.filter((t) => t.tenant === slug && t.scope === 'Business' && (t.assignees.includes(me.e.name) || t.collaborators.includes(me.e.name)) && t.due === date)
  const worked = dv.kind === 'Working'
  const k = dv.card.k
  return (
    <div className="space-y-6">
      <Panel title={`Your day · ${longDate(date)}`}>
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
              <div><div className="text-xs text-slate">Attendance</div><Badge tone={att.tone}>{att.label}</Badge></div>
              {att.in && <div><div className="text-xs text-slate">In</div><div className="num font-semibold">{att.in}</div></div>}
              {att.out && <div><div className="text-xs text-slate">Out</div><div className="num font-semibold">{att.out}</div></div>}
              {att.hours != null && <div><div className="text-xs text-slate">Hours</div><div className="num font-semibold">{att.hours.toFixed(1)} h</div></div>}
              {att.lateMins > 0 && <div><div className="text-xs text-slate">Late by</div><div className="num font-semibold text-warn">{att.lateMins} min</div></div>}
            </div>
            {worked ? (
              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 text-sm sm:grid-cols-4">
                <div><div className="text-xs text-slate">Day score</div><div className="num font-display text-2xl font-semibold">{dv.card.score}</div><Badge tone={bandTone(dv.card.band)}>{dv.card.band}</Badge></div>
                <div><div className="text-xs text-slate">Tasks finished</div><div className="num text-lg font-semibold">{k.done}</div><div className="text-xs text-slate">{dv.raw.doneOnTime} on time</div></div>
                <div><div className="text-xs text-slate">{me.approver ? 'Approvals decided' : 'Requests raised'}</div><div className="num text-lg font-semibold">{me.approver ? dv.raw.handled : dv.raw.raised}</div><div className="text-xs text-slate">{me.approver && dv.raw.handled ? `avg ${fmtHours(k.avgWait)} wait` : 'that day'}</div></div>
                <div><div className="text-xs text-slate">Comments</div><div className="num text-lg font-semibold">{dv.raw.comments}</div><div className="text-xs text-slate">first response {fmtHours(k.response)}</div></div>
              </div>
            ) : (
              <p className="mt-5 border-t border-line pt-4 text-sm text-slate">{att.label === 'Weekend' ? 'Weekend. Nothing is expected, so nothing is scored.' : att.label === 'On leave' ? 'Approved leave is never counted against anyone.' : att.label === 'Absent' ? 'No check-in was recorded and no leave was approved.' : att.label === 'Upcoming' ? 'This day has not happened yet.' : att.label === 'Not in yet' ? `Hi ${first}, you have not clocked in yet.` : 'No activity is recorded for this day.'}</p>
            )}
            {att.label === 'Not in yet' && <Link to="/admin/business/performance?tab=Attendance" className="mt-3 inline-block text-sm font-semibold text-teal">Clock in</Link>}
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">Tasks due this day</div>
            {dueThen.length === 0 ? <p className="text-sm text-slate">No task of yours is due on this day.</p> : (
              <ul className="space-y-2.5">{dueThen.map((t) => (
                <li key={t.id} className="text-sm"><div className="flex items-start justify-between gap-3"><span className="min-w-0 font-semibold">{t.title}</span><Badge tone={t.status === 'Done' ? 'green' : 'gray'}>{t.status}</Badge></div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate"><span className="num">{t.id}</span><TaskTag t={t} name={me.e.name} />{pendingExtension(t) && <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><CalendarClock size={11} />Extension requested</span>}{t.collaborators.length > 0 && !t.collaborators.includes(me.e.name) && <span className="inline-flex items-center gap-1"><Users size={11} />{t.collaborators.length} joint</span>}</div></li>
              ))}</ul>
            )}
            <p className="mt-4 text-xs text-slate">Attendance and counts for past days come from the recorded history. Tasks due are live from the task board.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Last 14 days">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(44px, 1fr))' }}>
          {days.map((d) => {
            const a = attendanceOn(me.e, me.approver, d, records)
            const dt = new Date(d + 'T00:00:00Z')
            return (
              <button key={d} onClick={() => setDateFor(d)} aria-pressed={d === date} aria-label={`${longDate(d)}: ${a.label}`} title={`${longDate(d)}: ${a.label}`} className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border py-2 text-xs ${d === date ? 'border-teal bg-softmint/50' : 'border-line hover:bg-cloud'}`}>
                <span className="text-slate">{dt.toLocaleDateString('en-NG', { weekday: 'narrow', timeZone: 'UTC' })}</span>
                <span className="num font-semibold">{dt.getUTCDate()}</span>
                <span className={`size-2.5 rounded-full ${DOT[a.tone]}`} />
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate">
          {([['green', 'On time'], ['amber', 'Late'], ['red', 'Absent'], ['blue', 'On leave'], ['gray', 'Weekend or no record']] as const).map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-full ${DOT[c]}`} />{l}</span>)}
        </div>
      </Panel>

      <PerformancePanel slug={slug} e={me.e} approver={me.approver} live={me.live} viewerName={viewer} canCoach={false} />
    </div>
  )
}

export default function Workforce() {
  const tenant = useTenant()
  const slug = tenant?.slug ?? 'etranzact'
  const { r, can } = useRole()
  const [sp, setSp] = useSearchParams()
  const { staff } = usePerformance(slug)
  const today = todayKey()
  const [date, setDate] = useState(today)

  const full = can('people.manage')
  const { scope } = useMemo(() => visibleStaff(staff.map((s) => s.e), { name: r.user, id: r.id, full }), [staff, r.user, r.id, full])
  const me = staff.find((x) => x.e.id === r.id || x.e.name === r.user)
  const hasAtt = tenant?.modules.includes('attendance') ?? true
  const tabs = ['Overview', ...(scope !== 'Only you' ? ['Team'] : []), ...(hasAtt ? ['Attendance'] : []), 'Goals']
  const wanted = sp.get('tab') ?? 'Overview'
  const tab = tabs.includes(wanted) ? wanted : 'Overview'

  return (
    <div>
      <PageHeader eyebrow="People" title="Performance & attendance" desc="One place for how work, attendance, approvals and engagement are going. Pick any day to see exactly what happened." />
      <DayBar date={date} setDate={setDate} today={today} />
      <Tabs tabs={tabs} value={tab} onChange={(t) => setSp(t === 'Overview' ? {} : { tab: t }, { replace: true })} />
      <div className="mt-6">
        {tab === 'Overview' && <Overview slug={slug} date={date} setDateFor={setDate} today={today} me={me} viewer={r.user} />}
        {tab === 'Team' && <TeamPerformance date={date} />}
        {tab === 'Attendance' && <Attendance date={date} />}
        {tab === 'Goals' && <Goals slug={slug} viewer={r.user} full={full} people={staff.map((s) => s.e.name).sort()} />}
      </div>
    </div>
  )
}
