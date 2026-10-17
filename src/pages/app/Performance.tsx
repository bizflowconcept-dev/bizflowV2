import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Avatar, Btn, EmptyState, ExportButton, inputCls, Panel, Stat, Table } from '../../components/ui'
import { RangeToggle } from '../../components/charts'
import { useRole } from '../../components/app/AppLayout'
import { useTenant } from '../../tenant/store'
import { addRaw, bandOf, bucketsFor, dayFor, EMPTY_RAW, fmtHours, fmtPct, insightsFor, livePenalty, scoreOf, TARGETS, usePerformance, visibleStaff } from '../../performance/engine'
import type { Bucket, Period } from '../../performance/engine'
import { BandBadge, Delta, Method, ScoreBar, scoreColor } from '../../performance/Widgets'

const SORTS = ['Score: low to high', 'Score: high to low', 'Name', 'Slowest approvals', 'Most late arrivals', 'Most overdue tasks'] as const

export default function TeamPerformance({ date }: { date: string }) {
  const tenant = useTenant()
  const slug = tenant?.slug ?? 'etranzact'
  const { r, can } = useRole()
  const { staff } = usePerformance(slug)
  const [period, setPeriod] = useState<Period>('Day')
  const [dept, setDept] = useState('All departments')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Score: low to high')

  const full = can('people.manage')
  const { list, scope } = useMemo(() => visibleStaff(staff.map((s) => s.e), { name: r.user, id: r.id, full }), [staff, r.user, r.id, full])
  const rows = useMemo(() => {
    const ids = new Set(list.map((e) => e.id))
    return staff.filter((s) => ids.has(s.e.id)).map((s) => {
      let cur: Bucket, prev: Bucket | undefined, kind = ''
      if (period === 'Day') {
        const dv = dayFor(s.e, s.approver, date)
        cur = { label: dv.date, long: dv.long, raw: dv.raw, card: dv.card, partial: false }; kind = dv.kind
      } else {
        const bs = bucketsFor(s.e, s.approver, period)
        cur = bs[bs.length - 1]; prev = bs[bs.length - 2]
      }
      const pen = period === 'Day' ? 0 : livePenalty(s.live)
      const score = cur?.card.hasData ? Math.max(0, cur.card.score - pen) : null
      return { ...s, kind, cur, prev, pen, score, band: score == null ? null : bandOf(score) }
    })
  }, [staff, list, period, date])

  const depts = ['All departments', ...new Set(rows.map((x) => x.e.dept))]
  const shown = rows.filter((x) => (dept === 'All departments' || x.e.dept === dept) && x.e.name.toLowerCase().includes(q.toLowerCase()))
  const scored = shown.filter((x) => x.score != null)
  const sorted = [...shown].sort((a, b) => {
    if (sort === 'Name') return a.e.name.localeCompare(b.e.name)
    if (sort === 'Slowest approvals') return (b.cur?.card.k.avgWait ?? 0) - (a.cur?.card.k.avgWait ?? 0)
    if (sort === 'Most late arrivals') return (b.cur?.card.k.lateArrivals ?? 0) - (a.cur?.card.k.lateArrivals ?? 0)
    if (sort === 'Most overdue tasks') return b.live.overdue.length - a.live.overdue.length
    const d = (a.score ?? 999) - (b.score ?? 999)
    return sort === 'Score: high to low' ? -d : d
  })
  const avg = (xs: (number | null)[]) => { const v = xs.filter((n): n is number => n != null); return v.length ? Math.round(v.reduce((a, n) => a + n, 0) / v.length) : 0 }
  const avgNow = avg(scored.map((x) => x.score)), avgPrev = avg(scored.map((x) => x.prev?.card.hasData ? x.prev.card.score : null))
  const sumNow = scored.reduce((a, x) => addRaw(a, x.cur.raw), EMPTY_RAW)
  const kAll = scoreOf(sumNow, false).k
  const approvers = scored.filter((x) => x.approver && x.cur.card.k.handled > 0)
  const approverRaw = approvers.reduce((a, x) => addRaw(a, x.cur.raw), EMPTY_RAW)
  const kApp = scoreOf(approverRaw, true).k
  const needs = scored.filter((x) => (x.score ?? 100) < 70).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
  const top = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 4)
  const bottlenecks = [...approvers].filter((x) => x.cur.card.k.avgWait > TARGETS.approvalHours || x.live.waiting.some((w) => w.days >= 3)).sort((a, b) => b.cur.card.k.avgWait - a.cur.card.k.avgWait).slice(0, 4)
  const byDept = [...new Set(scored.map((x) => x.e.dept))].map((d) => ({ d, n: scored.filter((x) => x.e.dept === d).length, v: avg(scored.filter((x) => x.e.dept === d).map((x) => x.score)) })).sort((a, b) => b.v - a.v)
  const unit = period === 'Day' ? 'day' : period.toLowerCase()
  const link = (id: string) => `/admin/business/people/${id}?tab=Performance`

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <RangeToggle value={period} onChange={(p) => setPeriod(p as Period)} options={['Day', 'Week', 'Month', 'Year']} />
        <span className="text-sm text-slate">{period === 'Day' ? `${new Date(date + 'T00:00:00Z').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}. Change the date above to check another day.` : period === 'Week' ? 'This week so far, compared with last week' : period === 'Month' ? 'This month so far, compared with last month' : 'This year so far, compared with last year'}</span>
        <span className="ml-auto text-xs text-slate">{scope === 'Everyone' ? 'Every employee' : 'You and your team'}</span>
        <ExportButton name={`performance-${unit}`} head={['Employee', 'Department', 'Score', 'Tasks on time %', 'Punctuality %', 'Approval hours', 'Overdue tasks']} rows={sorted.map((x) => [x.e.name, x.e.dept, String(x.score ?? ''), x.cur ? String(Math.round(x.cur.card.k.tasksOnTime)) : '', x.cur ? String(Math.round(x.cur.card.k.punctuality)) : '', x.cur?.card.k.handled ? String(Math.round(x.cur.card.k.avgWait)) : '', String(x.live.overdue.length)])} />
      </div>

      <div className="mt-5 grid gap-6 rounded-lg border border-line bg-white p-5 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Average score" value={String(avgNow)} delta={avgPrev ? `${Math.abs(avgNow - avgPrev)} pts` : undefined} up={avgNow >= avgPrev} sub={`${scored.length} people`} />
        <Stat label="Tasks finished on time" value={fmtPct(kAll.tasksOnTime)} sub={`target ${TARGETS.tasksOnTime}%`} />
        <Stat label="Punctuality" value={fmtPct(kAll.punctuality)} sub={`target ${TARGETS.punctuality}%`} />
        <Stat label="Approval turnaround" value={approvers.length ? fmtHours(kApp.avgWait) : '—'} sub={approvers.length ? `${Math.round(kApp.sla)}% within ${TARGETS.approvalHours}h` : 'no approvers in view'} />
        <Stat label="Need attention" value={String(needs.length)} sub={needs.length ? 'score under 70' : 'everyone on track'} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Where approvals are getting stuck">
          {bottlenecks.length === 0 ? <p className="text-sm text-slate">No approval is held up beyond {TARGETS.approvalHours} hours.</p> : (
            <ul className="space-y-3">{bottlenecks.map((x) => (
              <li key={x.e.id} className="text-sm"><Link to={link(x.e.id)} className="flex items-center justify-between gap-3 hover:text-teal"><span className="flex min-w-0 items-center gap-2"><Avatar name={x.e.name} size={24} /><span className="truncate font-semibold">{x.e.name}</span></span><span className="num shrink-0 font-semibold text-err">{fmtHours(x.cur.card.k.avgWait)} avg</span></Link>
                <div className="mt-0.5 pl-8 text-xs text-slate">{x.live.waiting.length ? `${x.live.waiting.length} waiting now: ${x.live.waiting.map((w) => `${w.id} (${w.days}d)`).join(', ')}` : `${Math.round(100 - x.cur.card.k.sla)}% of decisions missed ${TARGETS.approvalHours}h`}</div></li>
            ))}</ul>
          )}
        </Panel>
        <Panel title="Needs attention">
          {needs.length === 0 ? <p className="text-sm text-slate">Nobody is below 70 for this {unit}.</p> : (
            <ul className="space-y-3">{needs.slice(0, 4).map((x) => {
              const why = insightsFor(x.cur.card, x.prev?.card, x.live, x.approver).find((i) => i.tone === 'bad') ?? insightsFor(x.cur.card, x.prev?.card, x.live, x.approver).find((i) => i.tone === 'warn')
              return <li key={x.e.id} className="text-sm"><Link to={link(x.e.id)} className="flex items-center justify-between gap-3 hover:text-teal"><span className="flex min-w-0 items-center gap-2"><Avatar name={x.e.name} size={24} /><span className="truncate font-semibold">{x.e.name}</span></span><span className="num font-semibold">{x.score}</span></Link>{why && <div className="mt-0.5 pl-8 text-xs text-slate">{why.text}</div>}</li>
            })}</ul>
          )}
        </Panel>
        <Panel title="Doing well">
          <ul className="space-y-3">{top.map((x) => (
            <li key={x.e.id} className="text-sm"><Link to={link(x.e.id)} className="flex items-center justify-between gap-3 hover:text-teal"><span className="flex min-w-0 items-center gap-2"><Avatar name={x.e.name} size={24} /><span className="truncate font-semibold">{x.e.name}</span></span><span className="num font-semibold text-ok">{x.score}</span></Link><div className="mt-0.5 pl-8 text-xs text-slate">{x.e.role}</div></li>
          ))}</ul>
        </Panel>
      </div>

      {byDept.length > 1 && (
        <Panel title="By department" className="mt-6">
          <ul className="grid gap-x-10 gap-y-3 sm:grid-cols-2">{byDept.map((d) => (
            <li key={d.d} className="text-sm"><div className="mb-1 flex justify-between"><span className="font-medium">{d.d} <span className="text-xs font-normal text-slate">· {d.n}</span></span><span className="num font-semibold">{d.v}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${scoreColor(d.v)}`} style={{ width: `${d.v}%` }} /></div></li>
          ))}</ul>
        </Panel>
      )}

      <Panel pad={false} className="mt-6">
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search staff" placeholder="Search staff" className={`${inputCls} max-w-[14rem]`} />
          <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department" className="h-10 rounded-md border border-line bg-white px-2 text-sm">{depts.map((d) => <option key={d}>{d}</option>)}</select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort by" className="h-10 rounded-md border border-line bg-white px-2 text-sm">{SORTS.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        {sorted.length === 0 ? <EmptyState title="No staff match" body="Try a different department or search." action={<Btn v="secondary" onClick={() => { setQ(''); setDept('All departments') }}>Clear filters</Btn>} /> : (
          <Table label="Staff performance" head={['Employee', 'Score', 'Tasks on time', 'Punctuality', 'Approvals', 'Open / overdue', 'Status']} right={[2, 3, 4, 5]} pageSize={10}
            rows={sorted.map((x) => {
              const k = x.cur?.card.k
              return [
                <Link key="n" to={link(x.e.id)} className="flex items-center gap-3 font-semibold hover:text-teal"><Avatar name={x.e.name} size={28} /><span><span className="block">{x.e.name}</span><span className="block text-xs font-normal text-slate">{x.e.role} · {x.e.dept}</span></span></Link>,
                x.score == null ? <span key="s" className="text-xs text-slate">{({ Weekend: 'Weekend', Leave: 'On leave', Absent: 'Absent', Future: 'Upcoming' } as Record<string, string>)[x.kind] ?? 'No data yet'}</span> : <span key="s" className="flex items-center gap-3"><ScoreBar value={x.score} label={`${x.e.name} score`} />{x.prev?.card.hasData && <Delta now={x.score} before={x.prev.card.score} />}</span>,
                <span key="t" className="num">{k && x.score != null ? fmtPct(k.tasksOnTime) : '—'}</span>,
                <span key="p" className="num">{k && x.score != null ? fmtPct(k.punctuality) : '—'}</span>,
                <span key="a" className="num">{k?.handled ? fmtHours(k.avgWait) : '—'}</span>,
                <span key="o" className={`num ${x.live.overdue.length ? 'font-semibold text-err' : ''}`}>{x.live.open.length} / {x.live.overdue.length}</span>,
                x.band ? <BandBadge key="b" band={x.band} /> : <span key="b" className="text-xs text-slate">{x.e.status === 'Onboarding' ? 'Onboarding' : '—'}</span>,
              ]
            })} />
        )}
      </Panel>
      <div className="mt-6"><Method approver /></div>
    </div>
  )
}
