import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Mail, Phone, MapPin, CalendarDays, Wallet, Clock, Lock, MapPinned, FileText, Send } from 'lucide-react'
import { Avatar, Badge, Btn, Panel, Table, Tabs, Timeline, Breadcrumb, EmptyState, Field, inputCls, Overlay, useToast } from '../../components/ui'
import { approvalsForTenant, employeesForTenant, isOwnDataset, ngn } from '../../data/demo'
import { emailDomainFor, profileData } from '../../data/people'
import { useRole } from '../../components/app/AppLayout'
import { dueLabel, isOverdue, isSelfTask, setTaskStatus, STATUSES, useTasks } from '../../tasks/store'
import type { TaskStatus } from '../../tasks/store'
import { gradeOfSalary, useRules } from '../../rules/store'
import { auditFor, useTenant } from '../../tenant/store'
import { PerformancePanel } from '../../performance/Widgets'
import { reportsOf, usePerformance } from '../../performance/engine'
import { balancesFor, fmtShort, useLeave } from '../../leave/store'
import { useGoals } from '../../performance/Goals'

const TABS = ['Overview', 'Employment', 'Attendance', 'Leave', 'Payroll', 'Performance', 'Tasks', 'Assets', 'Documents', 'Requests', 'Activity']

function Facts({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 1 | 2 | 3 }) {
  const c = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 xl:grid-cols-3' }[cols]
  return (
    <dl className={`grid gap-x-8 gap-y-4 text-sm ${c}`}>
      {items.map(([a, b]) => <div key={a}><dt className="text-xs text-slate">{a}</dt><dd className="mt-0.5 font-semibold text-ink">{b}</dd></div>)}
    </dl>
  )
}

function Bar({ v, tone = 'bg-teal' }: { v: number; tone?: string }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, v)}%` }} /></div>
}

function PersonLink({ name, employees }: { name: string; employees: ReturnType<typeof employeesForTenant> }) {
  const p = employees.find((x) => x.name === name)
  if (!p) return <span>{name}</span>
  return <Link to={`/admin/business/people/${p.id}`} className="inline-flex items-center gap-2 hover:text-teal"><Avatar name={p.name} size={22} />{p.name}</Link>
}

const mask = (a: string) => (a.length < 5 ? a : '••••••' + a.slice(-4))

export default function EmployeeProfile() {
  const { id } = useParams()
  const tenant = useTenant()
  const employees = employeesForTenant(tenant?.slug)
  const { can, r, role } = useRole()
  const toast = useToast()
  const found = employees.find((x) => x.id === id)
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('tab') ?? 'Overview')
  const [reveal, setReveal] = useState(false)
  const [compose, setCompose] = useState(false)
  const [editProfile, setEditProfile] = useState(false)
  const [completionPrompt, setCompletionPrompt] = useState(false)
  const [documentView, setDocumentView] = useState('')
  const [attendanceRange, setAttendanceRange] = useState('Month')
  const [dateFrom, setDateFrom] = useState('2026-10-01')
  const [dateTo, setDateTo] = useState('2026-10-31')
  const [checkIn, setCheckIn] = useState(false)
  const [verifiedLocation, setVerifiedLocation] = useState('')
  const [locationError, setLocationError] = useState('')
  const allTasks = useTasks()
  const perf = usePerformance(tenant?.slug ?? 'etranzact')
  useRules(tenant?.slug ?? 'etranzact')
  const own = isOwnDataset(tenant?.slug)
  const ownLeave = useLeave(tenant?.slug ?? 'etranzact')
  const ownGoals = useGoals(tenant?.slug ?? 'etranzact')
  if (!found) {
    return (
      <div>
        <Breadcrumb items={[['Employees', '/admin/business/people'], ['Not found']]} />
        <Panel><EmptyState title="Employee not found" body="This record does not exist in your company, or you do not have access to it." action={<Btn to="/admin/business/people">Back to employees</Btn>} /></Panel>
      </div>
    )
  }
  const e = found
  const rg = gradeOfSalary(e.dept, e.salary, own ? tenant?.slug : undefined)
  const d0 = profileData(e, employees, emailDomainFor(tenant), approvalsForTenant(tenant?.slug), tenant?.slug)
  /* Self-serve companies have no sample history: attendance, leave and grades come from their own records only. */
  const ownBal = own ? balancesFor(ownLeave, e.name).filter((b) => b.type === 'Annual' || b.type === 'Sick' || b.type === 'Compassionate') : []
  const d = own ? { ...d0, attendance: null, grade: rg?.label ?? 'Not graded', leave: ownBal.map((b) => ({ type: `${b.type} leave`, used: b.used, total: b.entitlement })), leaveLeft: ownBal[0]?.left ?? 0 } : d0
  const seesPay = can('payroll.view') || r.id === e.id
  const isSelf = r.id === e.id
  const canPrompt = !isSelf && can('people.create')
  const canEditProfile = role === 'employee' && isSelf && !d.onboarding
  const missingDetails = [
    d.dob === '—' && 'Date of birth',
    d.gender === '—' && 'Gender',
    d.marital === '—' && 'Marital status',
    d.address === '—' && 'Home address',
    d.emergency.name === '—' && 'Emergency contact',
    d.bank.name === '—' && 'Bank details',
    d.skills.length === 0 && 'Skills',
  ].filter(Boolean) as string[]
  const fullView = can('people.manage')
  const managesThem = reportsOf(r.user, employees).some((x) => x.id === e.id)
  const seesPerf = isSelf || r.user === e.name || fullView || managesThem
  const tabs = TABS.filter((t) => (t !== 'Payroll' || seesPay) && (t !== 'Performance' || seesPerf))
  const active = tabs.includes(tab) ? tab : 'Overview'
  const tone = (s: string) => ({ Done: 'green', Signed: 'green', Verified: 'green', Paid: 'green', 'In progress': 'blue', Processing: 'blue', 'Under review': 'blue', Overdue: 'red', Missing: 'red', Pending: 'amber', 'Awaiting signature': 'amber', 'To do': 'gray' } as Record<string, string>)[s] ?? 'gray'
  const periodFactor = ({ Day: 0.07, Week: 0.35, Month: 1, Year: 10, Custom: 0.65 } as Record<string, number>)[attendanceRange]
  const attendanceNumber = (value: number) => Math.max(value ? 1 : 0, Math.round(value * periodFactor))
  const verifyLocation = () => {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError('Location services are not available on this device.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      () => setVerifiedLocation(`${e.branch} · Inside approved work-site geofence`),
      () => setLocationError('Location could not be verified. Enable location services and try again.'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <div>
      <Breadcrumb items={[['Employees', '/admin/business/people'], [e.name]]} />

      <section className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="h-20 bg-gradient-to-r from-midnight to-teal-600/80" aria-hidden />
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-9 flex flex-wrap items-end gap-x-5 gap-y-3">
            <div className="rounded-full border-4 border-white bg-white"><Avatar name={e.name} size={72} /></div>
            <div className="min-w-0 flex-1 pt-10">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold sm:text-3xl">{e.name}</h1>
                <Badge>{e.status}</Badge>
                {d.onboarding && <Badge tone="amber">Profile {d.completeness}% complete</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-slate">{e.role} · {e.dept} · {e.branch} · <span className="num">{e.id}</span></p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn v="secondary" s="sm" onClick={() => setCompose(true)}>Message</Btn>
              <Btn v="secondary" s="sm" to="/admin/business/sign">Request signature</Btn>
              {canEditProfile && <Btn s="sm" onClick={() => setEditProfile(true)}>Edit my profile</Btn>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate">
            <a href={`mailto:${d.email}`} className="inline-flex items-center gap-1.5 hover:text-teal"><Mail size={14} />{d.email}</a>
            <a href={`tel:${d.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-teal"><Phone size={14} />{d.phone}</a>
            <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{d.state === 'FCT' ? 'Abuja (FCT)' : d.state}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />{d.joined === '—' ? 'Start date not recorded' : `Joined ${d.joined}`}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-line lg:grid-cols-4">
          {[
            { i: <CalendarDays size={15} />, l: 'Tenure', v: d.tenure, s: d.probation },
            { i: <Clock size={15} />, l: 'Attendance (Oct)', v: d.attendance ? `${d.attendance.rate}%` : '—', s: d.attendance ? `${d.attendance.late} late arrivals` : own ? 'No check-ins yet' : 'Not started' },
            { i: <CalendarDays size={15} />, l: 'Annual leave left', v: `${d.leaveLeft} days`, s: `of ${d.leave[0]?.total ?? 0} days` },
            { i: <Wallet size={15} />, l: 'Net pay (monthly)', v: seesPay ? (own && !e.salary ? 'Not set' : ngn(d.pay.net)) : 'Restricted', s: seesPay ? `${d.grade} · ${d.contract}` : 'Payroll permission required' },
          ].map((k, i) => (
            <div key={k.l} className={`px-5 py-4 sm:px-6 ${i % 2 ? 'border-l border-line' : ''} ${i > 1 ? 'border-t border-line lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate">{k.i}{k.l}</div>
              <div className="num mt-1 font-display text-xl font-semibold">{k.v}</div>
              <div className="text-xs text-slate">{k.s}</div>
            </div>
          ))}
        </div>
      </section>
      <Overlay open={compose} onClose={() => setCompose(false)} title={`Message ${e.name}`}>
        <form onSubmit={(event) => { event.preventDefault(); setCompose(false); toast(`Message sent to ${e.name}`) }} className="space-y-4">
          <Field label="To"><input className={inputCls} value={`${e.name} <${d.email}>`} readOnly /></Field>
          <Field label="Subject"><input className={inputCls} name="subject" required placeholder="Enter a clear subject" /></Field>
          <Field label="Message"><textarea className={`${inputCls} h-auto py-2`} name="message" required rows={6} placeholder={`Write a message to ${e.name.split(' ')[0]}…`} /></Field>
          <p className="text-xs text-slate">This message will be recorded in the employee communication log.</p>
          <div className="flex justify-end gap-2"><Btn type="button" v="secondary" onClick={() => setCompose(false)}>Cancel</Btn><Btn type="submit"><Send size={14} />Send message</Btn></div>
        </form>
      </Overlay>
      <Overlay open={editProfile} onClose={() => setEditProfile(false)} title="Edit my profile" side>
        <form onSubmit={(event) => { event.preventDefault(); setEditProfile(false); auditFor('Employee profile edited', { category: 'People', ref: `${e.id} ${e.name}` }); toast('Profile changes saved and added to the audit trail') }} className="space-y-4">
          <p className="rounded-lg bg-softmint p-3 text-sm text-slate">Only you can change your personal profile after onboarding. Employment, role and compensation changes remain controlled by authorized teams.</p>
          <Field label="Home address"><input className={inputCls} defaultValue={d.address === '—' ? '' : d.address} required /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Phone"><input className={inputCls} defaultValue={d.phone} required /></Field><Field label="Marital status"><select className={inputCls} defaultValue={d.marital === '—' ? '' : d.marital}><option value="">Select</option><option>Single</option><option>Married</option><option>Other</option></select></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Emergency contact"><input className={inputCls} defaultValue={d.emergency.name === '—' ? '' : d.emergency.name} required /></Field><Field label="Emergency phone"><input className={inputCls} defaultValue={d.emergency.phone === '—' ? '' : d.emergency.phone} required /></Field></div>
          <Field label="Skills"><input className={inputCls} defaultValue={d.skills.join(', ')} placeholder="Separate skills with commas" /></Field>
          <div className="flex justify-end gap-2 pt-2"><Btn type="button" v="secondary" onClick={() => setEditProfile(false)}>Cancel</Btn><Btn type="submit">Save changes</Btn></div>
        </form>
      </Overlay>

      <div className="mt-6"><Tabs tabs={tabs} value={active} onChange={setTab} /></div>

      <div className="mt-6">
        {active === 'Performance' && (() => {
          const row = perf.staff.find((x) => x.e.id === e.id)
          return row ? <PerformancePanel slug={tenant?.slug ?? 'etranzact'} e={e} approver={row.approver} live={row.live} viewerName={r.user} canCoach={!isSelf && (fullView || managesThem)} /> : null
        })()}
        {active === 'Overview' && (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-6">
              <Panel title="Role and reporting">
                <Facts items={[['Position', e.role], ['Department', e.dept], ['Branch', e.branch], ['Work arrangement', e.mode], ['Cost centre', e.cost], ['Employee ID', <span key="i" className="num">{e.id}</span>]]} />
                <div className="mt-5 border-t border-line pt-5">
                  <div className="mb-2 text-xs text-slate">Line Manager</div>
                  <div className="text-sm font-semibold">{d.manager ? <PersonLink name={d.manager.name} employees={employees} /> : e.manager}</div>
                  {d.manager && <div className="mt-0.5 pl-8 text-xs font-normal text-slate">{d.manager.role} · {d.manager.dept}</div>}
                </div>
              </Panel>
              <Panel title={`Goals · ${d.perf.cycle}`} action={d.onboarding || own ? undefined : <Badge tone={d.perf.rating.startsWith('Exceeds') ? 'green' : 'blue'}>{d.perf.rating}</Badge>}>
                {own ? (() => { const mine = ownGoals.filter((g) => g.owner === e.name); return mine.length ? <ul className="space-y-1 text-sm">{mine.map((g) => <li key={g.id} className="font-medium">{g.title}</li>)}</ul> : <EmptyState title="No goals yet" body={`Goals set for ${e.name.split(' ')[0]} appear here.`} action={<Btn to="/admin/business/performance?tab=Goals">Create your first goal</Btn>} /> })() : d.onboarding ? <p className="text-sm text-slate">Goals are set after the first 30 days.</p> : (
                  <ul className="space-y-4">{d.goals.map((g) => <li key={g.g}><div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{g.g}</span><span className="num text-slate">{g.p}%</span></div><Bar v={g.p} /></li>)}</ul>
                )}
              </Panel>
              <Panel title="Skills"><div className="flex flex-wrap gap-2">{d.skills.map((s) => <span key={s} className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-medium">{s}</span>)}</div></Panel>
            </div>
            <div className="space-y-6">
              {d.onboarding && (
                <Panel title="Onboarding checklist">
                  <ul className="space-y-3 text-sm">{d.tasks.map((t) => <li key={t.t} className="flex items-start justify-between gap-3"><span>{t.t}</span><Badge tone={tone(t.s)}>{t.s}</Badge></li>)}</ul>
                </Panel>
              )}
              <Panel title="Today">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-slate">Status</span><b>{e.status === 'On leave' ? 'On approved leave' : d.onboarding ? 'Starts 1 Nov' : e.mode === 'Remote' ? 'Working remotely' : e.mode === 'Field' ? 'In the field' : own ? 'Not checked in' : 'Checked in 07:42'}</b></div>
                  <div className="flex justify-between"><span className="text-slate">Open requests</span><b>{d.requests.length}</b></div>
                  <div className="flex justify-between"><span className="text-slate">Assigned assets</span><b>{d.assets.length}</b></div>
                  <div className="flex justify-between"><span className="text-slate">Pending documents</span><b>{d.docs.filter((x) => !['Signed', 'Verified'].includes(x.s)).length}</b></div>
                </div>
              </Panel>
              <Panel title="Recent activity" action={<button onClick={() => setTab('Activity')} className="text-xs font-semibold text-teal">View all</button>}>
                <p className="mb-4 text-xs text-slate">Only actions associated with {e.name}'s employee record are shown.</p>
                {d.timeline.length ? <Timeline items={d.timeline.slice(0, 4)} /> : <EmptyState title="No activity yet" body={`Changes to ${e.name.split(' ')[0]}'s record will be listed here.`} />}
              </Panel>
            </div>
          </div>
        )}

        {active === 'Employment' && (
          <div className="space-y-6">
            {missingDetails.length > 0 && (
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="min-w-0 flex-1"><div className="font-semibold">Profile needs additional information</div><p className="mt-1 text-sm text-slate">{missingDetails.join(', ')} {missingDetails.length === 1 ? 'is' : 'are'} incomplete.</p></div>
                {canPrompt ? <Btn s="sm" onClick={() => setCompletionPrompt(true)}>Request completion</Btn> : isSelf ? <Badge tone="amber">Action required</Badge> : <Badge tone="gray">Employee action</Badge>}
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Personal"><Facts items={[['Full name', e.name], ['Date of birth', d.dob], ['Gender', d.gender], ['Marital status', d.marital], ['State of residence', d.state], ['Home address', d.address], ['Work email', d.email], ['Phone', d.phone]]} /></Panel>
            <Panel title="Contract"><Facts items={[['Employment type', d.contract], ['Start date', d.joined], ['Probation', d.probation], ['Grade', d.grade],...(rg ? [['Rule probation', `${rg.grade.probation} months`], ['Annual leave', `${rg.grade.leave} days`]] as [string, string][] : []), ['Work location', d.location], ['Work arrangement', e.mode], ['Cost centre', e.cost], ['Notice period', rg ? `${rg.grade.noticeDays} days` : '30 days']]} /></Panel>
            <Panel title="Emergency contact"><Facts items={[['Name', d.emergency.name], ['Relationship', d.emergency.rel], ['Phone', d.emergency.phone]]} cols={1} /></Panel>
            <Panel title="Statutory and bank" action={seesPay ? <button onClick={() => { setReveal(!reveal); if (!reveal) auditFor('Sensitive pay and bank details viewed', { category: 'People', ref: `${e.id} ${e.name}` }); if (!reveal) toast('Sensitive details viewed. This access is logged.') }} className="text-xs font-semibold text-teal">{reveal ? 'Hide' : 'Reveal'}</button> : undefined}>
              {seesPay ? (
                <Facts items={[['Bank', d.bank.name], ['Account number', <span key="a" className="num">{reveal ? d.bank.acct : mask(d.bank.acct)}</span>], ['Tax ID (TIN)', <span key="t" className="num">{reveal ? d.tin : mask(d.tin)}</span>], ['Pension PIN', <span key="p" className="num">{reveal ? d.pension : mask(d.pension)}</span>], ['Pension fund administrator', d.pfa], ['NHF number', <span key="n" className="num">{d.nhf}</span>]]} />
              ) : <p className="flex items-center gap-2 text-sm text-slate"><Lock size={14} />Restricted to HR and Finance.</p>}
            </Panel>
            </div>
            <Overlay open={completionPrompt} onClose={() => setCompletionPrompt(false)} title="Request profile completion">
              <p className="text-sm text-slate">{e.name} will receive a secure notification to complete the following information:</p>
              <ul className="mt-4 space-y-2">{missingDetails.map((item) => <li key={item} className="flex items-center gap-2 text-sm"><Badge tone="amber">Missing</Badge>{item}</li>)}</ul>
              <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setCompletionPrompt(false)}>Cancel</Btn><Btn onClick={() => { setCompletionPrompt(false); auditFor('Profile completion requested', { category: 'People', ref: `${e.id} ${e.name}` }); toast(`Profile completion request sent to ${e.name}`) }}>Send request</Btn></div>
            </Overlay>
          </div>
        )}

        {active === 'Attendance' && (
          d.attendance ? (
            <div className="space-y-6">
              <Panel>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div><div className="text-sm font-semibold">Attendance period</div><p className="mt-1 text-xs text-slate">Review patterns by day, week, month, year or any custom date range.</p></div>
                  <div className="flex flex-wrap gap-2">{['Day', 'Week', 'Month', 'Year', 'Custom'].map((range) => <Btn key={range} s="sm" v={attendanceRange === range ? 'primary' : 'secondary'} onClick={() => setAttendanceRange(range)}>{range}</Btn>)}</div>
                </div>
                {attendanceRange === 'Custom' && <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2"><Field label="From"><input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className={inputCls} /></Field><Field label="To"><input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className={inputCls} /></Field></div>}
              </Panel>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                {[
                  ['Present days', attendanceNumber(d.attendance.present), 'green'],
                  ['On-site days', attendanceNumber(Math.max(0, d.attendance.present - d.attendance.remote)), 'teal'],
                  ['Hybrid / remote', attendanceNumber(d.attendance.remote), 'blue'],
                  ['Off days', ({ Day: 0, Week: 2, Month: 8, Year: 104, Custom: 3 } as Record<string, number>)[attendanceRange], 'gray'],
                  ['Absent days', attendanceNumber(Math.max(0, Math.round(d.attendance.present * ((100 - d.attendance.rate) / 100)))), 'red'],
                  ['Approved leave', attendanceNumber(d.attendance.leave), 'amber'],
                ].map(([label, value, badgeTone]) => <Panel key={label as string}><div className="flex items-center justify-between"><div className="text-xs text-slate">{label}</div><Badge tone={badgeTone as string}>{attendanceRange}</Badge></div><div className="num mt-2 font-display text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-slate">{attendanceRange === 'Custom' ? `${dateFrom} – ${dateTo}` : 'Selected period'}</div></Panel>)}
              </div>
              <Panel title="Attendance register" action={isSelf ? <Btn s="sm" onClick={() => { setVerifiedLocation(''); setLocationError(''); setCheckIn(true) }}><MapPinned size={14} />Location-verified check-in</Btn> : <Badge tone="blue">{d.attendance.rate}% attendance</Badge>} pad={false}>
                <Table head={['Date', 'Work mode', 'Verified location', 'Check-in', 'Check-out', 'Hours']} rows={d.log.map((l) => [l.d, <Badge key="m" tone={l.mode === 'Approved leave' ? 'gray' : l.mode === 'Remote' ? 'blue' : 'green'}>{l.mode}</Badge>, l.mode === 'Approved leave' ? '—' : l.mode === 'Remote' ? 'Approved remote location' : l.mode === 'Field' ? 'Verified field site' : e.branch, <span key="i" className="num">{l.in}</span>, <span key="o" className="num">{l.out}</span>, <span key="h" className="num">{l.hrs}</span>])} right={[5]} />
              </Panel>
              <Overlay open={checkIn} onClose={() => setCheckIn(false)} title="Location-verified check-in">
                <div className="rounded-lg border border-line bg-cloud p-4"><div className="flex items-start gap-3"><MapPinned size={20} className="mt-0.5 text-teal" /><div><div className="text-sm font-semibold">Registered work site</div><div className="mt-1 text-sm text-slate">{e.branch}</div><div className="mt-1 text-xs text-slate">Check-in is enabled only when your device is inside the approved geofence.</div></div></div></div>
                {verifiedLocation ? <div className="mt-4 rounded-lg bg-softmint p-3 text-sm"><b>Location verified</b><div className="mt-1 text-xs text-slate">{verifiedLocation}</div></div> : <Btn className="mt-4 w-full" v="secondary" onClick={verifyLocation}>Verify current GPS location</Btn>}
                {locationError && <p role="alert" className="mt-3 text-sm text-err">{locationError}</p>}
                <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setCheckIn(false)}>Cancel</Btn><Btn disabled={!verifiedLocation} onClick={() => { setCheckIn(false); toast(`Checked in at ${e.branch}`) }}>Check in now</Btn></div>
              </Overlay>
            </div>
          ) : <Panel><EmptyState title="No attendance yet" body={own ? `Attendance records for ${e.name.split(' ')[0]} appear after the first check-in.` : `${e.name.split(' ')[0]} starts on 1 November 2026. Attendance records appear after the first check-in.`} action={own ? <Btn to="/admin/business/performance?tab=Attendance">Set up attendance sites</Btn> : undefined} /></Panel>
        )}

        {active === 'Leave' && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Panel title="Balances · 2026">
              <ul className="space-y-4">{d.leave.map((l) => <li key={l.type}><div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{l.type}</span><span className="num text-slate">{l.total - l.used} left of {l.total}</span></div><Bar v={l.total ? (l.used / l.total) * 100 : 0} tone={l.total && l.used / l.total > 0.7 ? 'bg-warn' : 'bg-teal'} /></li>)}</ul>
            </Panel>
            <Panel title="Leave history" pad={false}>
              {own ? (() => { const mine = ownLeave.filter((q) => q.employee === e.name); return mine.length ? <Table head={['Type', 'Dates', 'Days', 'Status']} rows={mine.map((q) => [q.type, `${fmtShort(q.from)} – ${fmtShort(q.to)}`, String(q.days), <Badge key={q.id} tone={q.status === 'Pending' ? 'amber' : q.status === 'Declined' || q.status === 'Cancelled' ? 'gray' : 'green'}>{q.status}</Badge>])} right={[2]} /> : <EmptyState title="No leave booked" body="Approved and pending leave requests appear here." action={isSelf ? <Btn to="/admin/business/leave">Request leave</Btn> : undefined} /> })() : d.requests.some((q) => q.type === 'Leave') || e.status === 'On leave' ? (
                <Table head={['Type', 'Dates', 'Days', 'Status']} rows={[
                  ...(e.status === 'On leave' ? [['Annual', e.id === 'ETZ-0170' ? '5 – 16 Oct' : '6 – 7 Oct', e.id === 'ETZ-0170' ? '10' : '2', <Badge key="a">Approved</Badge>]] : []),
                  ...d.requests.filter((q) => q.type === 'Leave').map((q) => ['Annual', '12 – 23 Oct', '10', <Badge key={q.id} tone="amber">Pending</Badge>]),
                  ['Annual', '15 – 19 Dec 2025', '5', <Badge key="p">Approved</Badge>],
                ]} right={[2]} />
              ) : <EmptyState title="No leave booked" body="Approved and pending leave requests appear here." />}
            </Panel>
          </div>
        )}

        {active === 'Payroll' && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Monthly payslip breakdown">
                <div className="num text-sm">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate">Earnings</div>
                  {d.pay.earnings.map(([a, b]) => <div key={a} className="flex justify-between border-b border-line py-2"><span>{a}</span><b>{ngn(b)}</b></div>)}
                  <div className="flex justify-between py-2 font-semibold"><span>Gross pay</span><span>{ngn(d.pay.gross)}</span></div>
                  <div className="mb-2 mt-3 text-xs font-semibold uppercase tracking-wide text-slate">Deductions</div>
                  {d.pay.deductions.map(([a, b]) => <div key={a} className="flex justify-between border-b border-line py-2"><span>{a}</span><b className="text-err">−{ngn(b)}</b></div>)}
                  <div className="mt-3 flex items-center justify-between rounded-md bg-softmint px-3 py-3 font-display text-lg font-semibold"><span>Net pay</span><span>{ngn(d.pay.net)}</span></div>
                  <p className="mt-3 text-xs text-slate">Employer pension contribution (10%): {ngn(d.pay.employerPension)} · Paid to {d.bank.name}, {mask(d.bank.acct)}</p>
                </div>
              </Panel>
              <Panel title="Annual summary">
                <Facts cols={1} items={[['Annual gross', ngn(e.salary * 12)], ['Annual PAYE', ngn((d.pay.deductions[0][1]) * 12)], ['Annual employee pension', ngn(d.pay.deductions[1][1] * 12)], ['Annual net', ngn(d.pay.net * 12)], ['Next pay date', '28 Oct 2026']]} />
              </Panel>
            </div>
            <Panel title="Payment history" pad={false}>
              {own ? <EmptyState title="No payments yet" body="Pay runs for this employee appear here once payroll has been processed." action={<Btn to="/admin/business/payroll">Open payroll</Btn>} /> : <Table head={['Period', 'Reference', 'Gross', 'Net', 'Status']} rows={d.history.map((h) => [h.m, <span key="r" className="num text-xs">{h.ref}</span>, <span key="g" className="num">{ngn(h.gross)}</span>, <span key="n" className="num font-semibold">{ngn(h.net)}</span>, <Badge key="s" tone={tone(h.status)}>{h.status}</Badge>])} right={[2, 3]} />}
            </Panel>
          </div>
        )}

        {active === 'Tasks' && (() => {
          const mine = allTasks.filter((t) => t.scope === 'Business' && t.tenant === (tenant?.slug ?? 'etranzact') && (t.assignees.includes(e.name) || t.collaborators.includes(e.name)))
          return mine.length ? (
            <Panel title={`Tasks assigned to ${e.name.split(' ')[0]}`} action={<Link to="/admin/business/tasks" className="text-xs font-semibold text-teal">Open task board</Link>} pad={false}>
              <Table head={['Task', 'Due', 'Priority', 'Status']} rows={mine.map((t) => [
                <span key="t" className="font-semibold">{t.title}<span className="block text-xs font-normal text-slate">{t.id} · {t.related}{!t.assignees.includes(e.name) && ' · Joint, not scored'}{isSelfTask(t) && ' · Personal, not scored'}</span></span>,
                <span key="d" className={isOverdue(t) ? 'font-semibold text-err' : ''}>{dueLabel(t.due)}</span>,
                <Badge key="p" tone={{ Low: 'gray', Normal: 'blue', High: 'amber', Urgent: 'red' }[t.priority]}>{t.priority}</Badge>,
                <select key="s" aria-label={`Status of ${t.title}`} value={t.status} onChange={(ev) => { setTaskStatus(t.id, ev.target.value as TaskStatus, r.user); toast(`${t.id} moved to ${ev.target.value}`) }} className="h-8 cursor-pointer rounded-md border border-line bg-white px-2 text-[13px] font-semibold">{STATUSES.map((x) => <option key={x}>{x}</option>)}</select>,
              ])} />
            </Panel>
          ) : <Panel><EmptyState title="No tasks assigned" body={`Tasks given to ${e.name.split(' ')[0]} appear here and on the task board.`} action={<Btn to="/admin/business/tasks">Create a task</Btn>} /></Panel>
        })()}

        {active === 'Assets' && (
          d.assets.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {d.assets.map((a) => (
                <Panel key={a.id} title={a.name} action={<Badge>{a.status}</Badge>}>
                  <Facts items={[['Asset tag', <Link key="l" to={`/admin/business/assets/${a.id}`} className="num text-teal">{a.id}</Link>], ['Type', a.type], ['Serial', <span key="s" className="num">{a.serial}</span>], ['Condition', a.cond], ['Current value', ngn(a.cur)], ['Warranty', a.warranty]]} />
                </Panel>
              ))}
            </div>
          ) : <Panel><EmptyState title="No assets assigned" body={`Equipment issued to ${e.name.split(' ')[0]} appears here.`} action={<Btn to="/admin/business/assets">Assign asset</Btn>} /></Panel>
        )}

        {active === 'Documents' && (
          <Panel title="Documents and compliance" pad={false}>
            {d.docs.length === 0 ? <EmptyState title="No documents on file" body={`Employment letters and signed agreements for ${e.name.split(' ')[0]} appear here once generated or sent for signature.`} action={<Btn to="/admin/business/documents">Open Documents</Btn>} /> : <Table head={['Document', 'Date', 'Status', 'Actions']} rows={d.docs.map((x) => [<span key="n" className="flex items-center gap-2 font-semibold"><FileText size={15} className="text-slate" />{x.n}</span>, x.d, <Badge key="s" tone={tone(x.s)}>{x.s}</Badge>, <span key="a" className="flex justify-end gap-1"><Btn s="sm" v="ghost" onClick={() => setDocumentView(x.n)}>View</Btn>{canPrompt && <Btn s="sm" v="secondary" onClick={() => toast(`Update request sent to ${e.name} for ${x.n}`)}>Request update</Btn>}{isSelf && <Btn s="sm" v="secondary" onClick={() => toast(`Upload opened for ${x.n}`)}>Upload update</Btn>}</span>])} right={[3]} />}
            <Overlay open={!!documentView} onClose={() => setDocumentView('')} title={documentView || 'Employee document'} wide>
              <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-line bg-cloud p-8 text-center"><FileText size={36} className="text-teal" /><div className="mt-3 font-semibold">{documentView}</div><p className="mt-1 text-sm text-slate">Secure document preview for {e.name}. Viewing this file is recorded in the audit log.</p><Badge tone={tone(d.docs.find((item) => item.n === documentView)?.s ?? '')}>{d.docs.find((item) => item.n === documentView)?.s ?? 'Available'}</Badge></div>
              <div className="mt-5 flex justify-end gap-2">{canPrompt && <Btn v="secondary" onClick={() => { toast(`Update request sent to ${e.name} for ${documentView}`); setDocumentView('') }}>Request modification</Btn>}{isSelf && <Btn v="secondary" onClick={() => { toast(`Upload opened for ${documentView}`); setDocumentView('') }}>Upload update</Btn>}<Btn onClick={() => setDocumentView('')}>Close preview</Btn></div>
            </Overlay>
          </Panel>
        )}

        {active === 'Requests' && (
          d.requests.length ? (
            <Panel title="Requests" pad={false}>
              <Table head={['Reference', 'Type', 'Details', 'Amount', 'Stage']} rows={d.requests.map((q) => [<Link key="i" to="/admin/business/approvals" className="num font-semibold text-teal">{q.id}</Link>, q.type, q.note, <span key="a" className="num">{q.amount ? ngn(q.amount) : '—'}</span>, <Badge key="s" tone={q.stage === 'Approved' ? 'green' : 'amber'}>{q.stage}</Badge>])} right={[3]} />
            </Panel>
          ) : <Panel><EmptyState title="No open requests" body={`${e.name.split(' ')[0]} has no pending expenses, leave or asset requests.`} /></Panel>
        )}

        {active === 'Activity' && (
          <Panel title={`${e.name} · Activity log`}><p className="mb-5 text-sm text-slate">This log contains only events linked to {e.name}'s employee record. Changes made by HR, Finance or a line manager are shown as actors on that record.</p>{d.timeline.length ? <Timeline items={d.timeline} /> : <EmptyState title="No activity yet" body="Payroll, approval and record changes linked to this employee will appear here." />}</Panel>
        )}
      </div>
    </div>
  )
}
