import { Link } from 'react-router'
import { ArrowRight, Clock, MapPin } from 'lucide-react'
import { Avatar, Badge, Btn, Panel } from '../components/ui'
import { employeesForTenant, isOwnDataset } from '../data/demo'
import { clock, todayKey, useAttendance } from './store'
import { TrendChart } from '../components/charts'

const HISTORY = [93, 91, 95, 92, 90, 94]

export function MyAttendanceCard({ slug, name, empId }: { slug: string; name: string; empId: string }) {
  const { records, rules } = useAttendance(slug)
  const emp = employeesForTenant(slug).find((e) => e.id === empId || e.name === name)
  const mine = records.filter((x) => x.empId === (emp?.id ?? empId))
  const t = mine.find((x) => x.date === todayKey())
  const late = mine.filter((x) => x.status === 'Late').length
  return (
    <Panel title="My attendance" action={<Link to="/admin/business/performance?tab=Attendance" className="text-xs font-semibold text-teal">Open</Link>}>
      {t ? (
        <div className="flex items-start gap-3">
          {t.in.selfie ? <img src={t.in.selfie} alt="Your check-in selfie" className="size-14 rounded-full object-cover" /> : <Avatar name={name} size={56} />}
          <div className="min-w-0 text-sm">
            <div className="flex flex-wrap items-center gap-2 font-semibold">Present since {clock(t.in.t)}<Badge tone={t.status === 'Late' ? 'amber' : 'green'}>{t.status === 'Late' ? `${t.minutesLate} min late` : 'On time'}</Badge></div>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate"><MapPin size={12} />{t.in.site}</div>
            <div className="mt-1 text-xs text-slate">{t.out ? `Clocked out at ${clock(t.out.t)}` : 'Remember to clock out when you leave.'}{t.review?.status === 'Pending' && ' · Awaiting HR verification'}</div>
          </div>
        </div>
      ) : (
        <div><p className="text-sm text-slate">You have not clocked in today. Shift starts {rules.start}, grace {rules.grace} minutes.</p>
          <Btn className="mt-3" to="/admin/business/performance?tab=Attendance"><Clock size={15} />Clock in now</Btn></div>
      )}
      <div className="mt-4 flex gap-4 border-t border-line pt-3 text-xs text-slate"><span><b className="num text-ink">{mine.length}</b> check-ins logged</span><span><b className="num text-ink">{late}</b> late</span></div>
    </Panel>
  )
}

export function HrAttendanceAnalysis({ slug, dense = false }: { slug: string; dense?: boolean }) {
  const { records, rules } = useAttendance(slug)
  const staff = employeesForTenant(slug).filter((e) => e.status === 'Active')
  const today = records.filter((x) => x.date === todayKey())
  const present = today.length
  const late = today.filter((x) => x.status === 'Late').length
  const flagged = today.filter((x) => x.review?.status === 'Pending').length
  const rate = Math.round((present / Math.max(1, staff.length)) * 100)
  const onTime = present ? Math.round(((present - late) / present) * 100) : 0
  const depts = [...new Set(staff.map((e) => e.dept))].map((d) => {
    const all = staff.filter((e) => e.dept === d)
    const here = all.filter((e) => today.some((x) => x.empId === e.id)).length
    return { d, here, total: all.length }
  }).sort((a, b) => b.total - a.total)
  const own = isOwnDataset(slug)
  const trend = [...(own ? [] : HISTORY).map((v, i) => ({ m: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i] ?? `D${i}`, actual: v })), { m: 'Today', actual: rate }]
  const latest = [...today].sort((a, b) => b.in.t.localeCompare(a.in.t)).slice(0, 4)
  return (
    <section aria-label="Attendance analysis" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div><div className="text-xs font-semibold uppercase tracking-wider text-teal">Attendance analysis</div><h2 className="mt-1 font-display text-xl font-semibold">Who is in today, and how it compares</h2></div>
        <Link to="/admin/business/performance?tab=Attendance" className="inline-flex items-center gap-1 text-xs font-semibold text-teal">Open attendance <ArrowRight size={13} /></Link>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[['Marked present', `${present}`, `${rate}% of ${staff.length} active staff`], ['On time', `${onTime}%`, `before ${rules.start} + ${rules.grace} min`], ['Late today', `${late}`, 'arrived after grace'], ['Needs HR review', `${flagged}`, 'off-site, new device or simulated']].map(([l, v, d]) => <Panel key={l}><div className="text-xs font-semibold uppercase tracking-wider text-slate">{l}</div><div className="num mt-1 text-2xl font-semibold">{v}</div><div className="mt-1 text-xs text-slate">{d}</div></Panel>)}
      </div>
      {!dense && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <Panel title="Daily attendance rate" action={own ? undefined : <span className="text-[11px] text-slate">Earlier days are sample history</span>}>
            <TrendChart data={trend} series={[{ key: 'actual', label: 'Present %' }]} fmt={(v) => `${v}%`} label="Daily attendance rate" height={190} />
          </Panel>
          <Panel title="By department">
            <div className="space-y-3">{depts.map((x) => <div key={x.d}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{x.d}</span><b className="num">{x.here}/{x.total}</b></div><div className="h-2 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-teal" style={{ width: `${(x.here / Math.max(1, x.total)) * 100}%` }} /></div></div>)}</div>
          </Panel>
        </div>
      )}
      <Panel title="Latest check-ins">
        {latest.length === 0 ? <p className="text-sm text-slate">No one has been marked present yet today.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{latest.map((x) => (
            <li key={x.id} className="flex items-center gap-3">{x.in.selfie ? <img src={x.in.selfie} alt={`Selfie of ${x.name}`} className="size-9 rounded-full object-cover" /> : <Avatar name={x.name} size={36} />}
              <div className="min-w-0 text-sm"><div className="font-semibold">{x.name}</div><div className="text-xs text-slate">{clock(x.in.t)} · {x.in.site}</div></div></li>))}</ul>
        )}
      </Panel>
    </section>
  )
}
