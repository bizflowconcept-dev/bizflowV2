import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Btn, Panel, PageHeader, Stat, Avatar, ExportButton } from '../../components/ui'
import { useRole, useScope } from '../../components/app/AppLayout'
import { approvalsForTenant, employeesForTenant, isOwnDataset, REVENUE, ngn, assetsForTenant } from '../../data/demo'
import { TaskList } from '../../tasks/Widgets'
import { useTenant } from '../../tenant/store'
import { emailDomainFor, profileData } from '../../data/people'
import GetStarted from '../../components/app/GetStarted'
import { MyAttendanceCard } from '../../attendance/Widgets'
import MyExit from '../../exit/MyExit'
import { MyPerformanceCard } from '../../performance/Widgets'

const F: Record<string, number> = { Company: 1, 'Lagos HQ': 0.42, 'Abuja Branch': 0.26, 'Port Harcourt': 0.19, Ibadan: 0.13 }
function Count({ to, pre = '', suf = '', dec = 0 }: { to: number; pre?: string; suf?: string; dec?: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setV(to)
    let r = 0, s = 0
    const step = (t: number) => { if (!s) s = t; const p = Math.min((t - s) / 700, 1); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) r = requestAnimationFrame(step) }
    r = requestAnimationFrame(step)
    return () => cancelAnimationFrame(r)
  }, [to])
  return <span className="num">{pre}{v.toLocaleString('en-NG', { maximumFractionDigits: dec, minimumFractionDigits: dec })}{suf}</span>
}

export default function Health() {
  const { scope } = useScope()
  const tenant = useTenant()
  const { r } = useRole()
  const [dept, setDept] = useState('All departments')
  const [cc, setCc] = useState('All cost centres')
  if (!tenant) return null
  if (isOwnDataset(tenant.slug)) return <div><PageHeader eyebrow="Insights" title="Business Health" desc={`${tenant.profile.name} · ${r.title} view`} /><GetStarted title="Welcome" /></div>
  const employees = employeesForTenant(tenant.slug)
  const departments = ['All departments', ...new Set(employees.map((employee) => employee.dept))]
  const costCentres = ['All cost centres', ...new Set(employees.map((employee) => employee.cost))]
  const f = (F[scope] ?? 1) * (dept === 'All departments' ? 1 : 0.3) * (cc === 'All cost centres' ? 1 : 0.4)
  const rev = 56.9 * f, exp = 41.2 * f
  const trail = [scope, dept !== 'All departments' && dept, cc !== 'All cost centres' && cc].filter(Boolean) as string[]
  const data = REVENUE.map((r) => ({ ...r, rev: +(r.rev * f).toFixed(1), exp: +(r.exp * f).toFixed(1), cash: +((r.rev - r.exp) * f).toFixed(1) }))
  const paymentCompany = tenant.slug === 'etranzact'
  return (
    <div>
      <PageHeader eyebrow="Insights" title="Business Health" desc={`${tenant.profile.name} · October 2026 · ${r.title} view`} actions={<><ExportButton name="business-health-october-2026" head={['Metric','Value']} rows={[['Revenue','48200000'],['Receivables','31700000']]} /><Btn to="/admin/business/reports">Generate report</Btn></>} />
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate">Drill:</span>
        {trail.map((t, i) => <span key={t} className="flex items-center gap-2"><b>{t}</b>{i < trail.length - 1 && <span className="text-slate">›</span>}</span>)}
        <select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="ml-2 h-8 rounded-md border border-line bg-white px-2 text-[13px]">{departments.map((d) => <option key={d}>{d}</option>)}</select>
        <select aria-label="Cost centre" value={cc} onChange={(e) => setCc(e.target.value)} className="h-8 rounded-md border border-line bg-white px-2 text-[13px]">{costCentres.map((d) => <option key={d}>{d}</option>)}</select>
      </div>

      <div className="on-dark grid gap-6 rounded-lg bg-midnight p-6 text-white lg:grid-cols-[1.1fr_1.4fr] lg:p-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-mint"><span className="size-2 rounded-full bg-mint" />Overall health</div>
          <div className="mt-3 font-display text-7xl font-semibold leading-none"><Count to={82} /><span className="text-2xl text-white/40"> / 100</span></div>
          <p className="mt-4 max-w-sm text-white/70">Revenue is up and cash is healthy. Receivables ageing and three stalled approvals are pulling the score down.</p>
          <div className="mt-6 space-y-2">
            {[['Needs attention', '3 approvals waiting over 48 hours', '/admin/business/approvals'], ['Where', paymentCompany ? 'Admin Department, ₦128.5M settlement awaiting MD approval' : 'Port Harcourt operations, ₦2.64M purchase at MD stage', '/admin/business/approvals'], ['Next', 'Approve payroll before 25 Oct', '/admin/business/payroll']].map(([a, b, to]) => (
              <Link key={a} to={to} className="flex gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm hover:bg-white/10"><span className="w-28 shrink-0 text-white/50">{a}</span><span className="font-medium">{b}</span></Link>
            ))}
          </div>
        </div>
        <div className="h-56 lg:h-auto">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ left: -20, top: 10 }}>
              <defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#35D0BA" stopOpacity=".4" /><stop offset="1" stopColor="#35D0BA" stopOpacity="0" /></linearGradient></defs>
              <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
              <XAxis dataKey="m" tick={{ fill: '#94a9ae', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a9ae', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0B2530', border: '1px solid #123340', borderRadius: 6, color: '#fff' }} formatter={(v) => `₦${v}M`} />
              <Area isAnimationActive={false} dataKey="exp" name="Expenses" stroke="#94a9ae" fill="none" strokeWidth={1.5} />
              <Area isAnimationActive={false} dataKey="rev" name="Revenue" stroke="#35D0BA" fill="url(#a)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid gap-6 border-b border-line pb-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={`₦${rev.toFixed(1)}M`} delta="8.8%" />
        <Stat label="Expenses" value={`₦${exp.toFixed(1)}M`} delta="3.5%" up={false} />
        <Stat label="Cash position" value={`₦${(128.4 * f).toFixed(1)}M`} sub="+₦6.2M this month" />
        <Stat label="Outstanding receivables" value={`₦${(31.7 * f).toFixed(1)}M`} delta="₦4.1M overdue" up={false} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="People" action={<Link to="/admin/business/people" className="text-xs font-semibold text-teal">Open</Link>}>
          <div className="grid grid-cols-2 gap-5"><Stat label="Headcount" value={String(Math.round(tenant.employees * f) || 1)} sub={`${employees.length} detailed profiles`} /><Stat label="Attendance today" value="94%" sub="incl. remote" /><Stat label="On leave" value={String(Math.round(employees.filter((employee) => employee.status === 'On leave').length * f))} /><Stat label="Payroll Oct" value={`₦${(employees.reduce((sum, employee) => sum + employee.salary, 0) * f / 1000000).toFixed(1)}M`} sub="pending" /></div>
        </Panel>
        <Panel title="Operations" action={<Link to="/admin/business/approvals" className="text-xs font-semibold text-teal">Open</Link>}>
          <div className="grid grid-cols-2 gap-5"><Stat label="Pending approvals" value={String(Math.round(14 * f) || 1)} /><Stat label="Open requests" value={String(Math.round(23 * f) || 1)} /><Stat label="Overdue tasks" value={String(Math.round(6 * f))} up={false} /><Stat label="Open POs" value={String(Math.round(9 * f))} /></div>
        </Panel>
        <Panel title={paymentCompany ? 'Assets and infrastructure' : 'Assets and fleet'} action={<Link to="/admin/business/assets" className="text-xs font-semibold text-teal">Open</Link>}>
          <div className="grid grid-cols-2 gap-5"><Stat label="Assets" value={String(Math.round(318 * f))} sub="85% assigned" /><Stat label="In maintenance" value={String(Math.round(11 * f))} /><Stat label="Vehicles" value={String(Math.round(12 * f) || 1)} /><Stat label="Expiring docs" value={String(Math.round(5 * f) || 1)} up={false} /></div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Sales pipeline by stage · ₦M">
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={[{ s: 'Lead', v: 7 }, { s: 'Qualified', v: 11.7 }, { s: 'Proposal', v: 15 }, { s: 'Won', v: 7.4 }].map((x) => ({ ...x, v: +(x.v * f).toFixed(1) }))} margin={{ left: -20 }}>
                <CartesianGrid stroke="#e7eded" vertical={false} /><XAxis dataKey="s" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#60777D' }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#60777D' }} />
                <Tooltip formatter={(v) => `₦${v}M`} /><Bar isAnimationActive={false} dataKey="v" fill="#087E8B" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Action items" action={<Link to="/admin/business/tasks" className="text-xs font-semibold text-teal">View all</Link>}>
          <TaskList scope="Business" tenant={tenant.slug} me={r.user} limit={5} />
        </Panel>
      </div>
      <p className="mt-6 text-xs text-slate">Values scale with the active scope to demonstrate drill-down. Total assets {assetsForTenant(tenant.slug).length} sampled · {ngn(2640000)} largest open purchase.</p>
    </div>
  )
}

export function My() {
  const tenant = useTenant()
  const { r } = useRole()
  if (!tenant) return null
  const employees = employeesForTenant(tenant.slug)
  const employee = employees.find((item) => item.id === r.id) ?? employees.find((item) => item.name === r.user)
  const first = r.user.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const profile = employee ? profileData(employee, employees, emailDomainFor(tenant), approvalsForTenant(tenant.slug), tenant.slug) : null
  const branch = employee?.branch ?? tenant.profile.state
  const mode = employee?.mode ?? 'Hybrid'
  const availableSalary = employee ? Math.round(employee.salary * 0.3) : 0
  const netPay = profile?.pay.net ?? 0
  const roleLinks = r.title.includes('Finance')
    ? [['Payroll workspace', '/admin/business/payroll'], ['Finance tasks', '/admin/business/tasks'], ['My documents', '/admin/business/documents']]
    : r.title.includes('Human') || r.title.includes('HR')
      ? [['People workspace', '/admin/business/people'], ['HR tasks', '/admin/business/tasks'], ['My documents', '/admin/business/documents']]
      : [[employee ? 'My employee profile' : 'My tasks', employee ? `/admin/business/people/${employee.id}` : '/admin/business/tasks'], ['My requests', '/admin/business/approvals'], ['My documents', '/admin/business/documents']]
  return (
    <div className="space-y-6">
      <div className="overview-hero">
        <PageHeader eyebrow={`My BizFlow · ${r.title}`} title={`${greeting}, ${first}`} desc={`Thursday 8 October · ${branch} · ${mode} work arrangement at ${tenant.profile.name}.`} actions={<Btn to="/admin/business/approvals">New request</Btn>} />
        <div className="flex flex-wrap gap-2"><Badge tone="blue">{r.title}</Badge><Badge tone={employee?.status === 'On leave' ? 'gray' : 'green'}>{employee?.status ?? 'Active'}</Badge>{employee && <span className="font-mono text-xs text-slate">{employee.id}</span>}</div>
      </div>
      {employee?.status === 'Onboarding' && <Panel title="Your onboarding journey" action={<Badge tone="blue">In progress</Badge>}>
        <p className="mb-4 text-sm text-slate">Welcome to {tenant.profile.name}. Complete these steps to finish setting up your Business Development workspace.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ['Profile submitted', 'Personal and contact details received', true],
          ['Documents', 'Upload identification and signed offer', false],
          ['Company orientation', 'Review policies and team structure', false],
          ['Ready to start', 'HR activates your complete employee record', false],
        ].map(([label, detail, done]) => <div key={String(label)} className={`rounded-lg border p-3 ${done ? 'border-teal bg-softmint' : 'border-line bg-white'}`}><div className="flex items-center gap-2 text-sm font-semibold"><span className={`flex size-5 items-center justify-center rounded-full text-xs ${done ? 'bg-teal text-white' : 'bg-cloud text-slate'}`}>{done ? '✓' : '○'}</span>{label}</div><p className="mt-2 text-xs text-slate">{detail}</p></div>)}</div>
        <div className="mt-4 flex flex-wrap gap-2"><Btn s="sm" to={`/admin/business/people/${employee.id}`}>Open my employee profile</Btn><Btn s="sm" v="secondary" to="/admin/business/organization">Meet the organisation</Btn></div>
      </Panel>}

      <MyExit slug={tenant.slug} employees={employees} me={employee} by={r.user} />
      <MyPerformanceCard slug={tenant.slug} name={r.user} empId={employee?.id ?? r.id} />
      {tenant.modules.includes('attendance') && <MyAttendanceCard slug={tenant.slug} name={r.user} empId={employee?.id ?? r.id} />}

      <section aria-label="Personal summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel><Stat label="Latest net pay" value={netPay ? ngn(netPay) : 'Available soon'} sub="September payslip" /></Panel>
        <Panel><Stat label="Annual leave" value={profile ? `${profile.leaveLeft} days` : '—'} sub="Available balance" /></Panel>
        <Panel><Stat label="Attendance" value={profile?.attendance ? `${profile.attendance.rate}%` : 'Not started'} sub="October to date" /></Panel>
        <Panel><Stat label="Open requests" value={String(profile?.requests.length ?? 0)} sub="Awaiting a decision" /></Panel>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Panel title="This week">
          <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-5">
            {[['Mon', mode === 'On-site' ? 'Office' : mode, 'Present'], ['Tue', mode === 'Field' ? 'Field' : 'Office', 'Present'], ['Wed', mode === 'Remote' ? 'Remote' : 'Office', 'Present'], ['Thu', mode, 'Today'], ['Fri', mode === 'Hybrid' ? 'Office' : mode, 'Upcoming']].map(([day, location, status]) => (
              <div key={day} className={`rounded-lg border p-3 ${status === 'Today' ? 'border-teal bg-softmint' : 'border-line bg-white'}`}><div className="text-xs text-slate">{day}</div><div className="mt-1 font-semibold">{location}</div><div className="mt-0.5 text-xs text-slate">{status}</div></div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate">Your schedule follows your {mode.toLowerCase()} work arrangement. Approved leave is never marked as absence.</p>
        </Panel>
        <Panel title="Role shortcuts" action={<Badge tone="teal">{r.title}</Badge>}>
          <div className="space-y-2">
            {[...roleLinks, ['Leave and handover', '/admin/business/leave']].map(([label, to]) => <Link key={label} to={to} className="flex items-center justify-between rounded-lg border border-line px-3 py-3 text-sm font-semibold hover:border-teal hover:bg-softmint/40"><span>{label}</span><span className="text-teal">Open →</span></Link>)}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="My tasks" className="lg:col-span-2" action={<Link to="/admin/business/tasks" className="text-xs font-semibold text-teal">Open task board</Link>}><TaskList scope="Business" tenant={tenant.slug} assignee={r.user} me={r.user} limit={5} empty="You are all caught up." /></Panel>
        <div className="space-y-6">
          <Panel title="Salary access">
            <Stat label="Available today" value={availableSalary ? ngn(availableSalary) : 'Not available'} sub="Up to 30% of monthly salary" />
            <Btn className="mt-4 w-full" v="secondary" to="/admin/business/approvals">Request salary</Btn>
          </Panel>
          <Panel title="Employment">
            <div className="space-y-3 text-sm"><div className="flex justify-between gap-3"><span className="text-slate">Position</span><b className="text-right">{employee?.role ?? r.title}</b></div><div className="flex justify-between gap-3"><span className="text-slate">Department</span><b>{employee?.dept ?? 'Company'}</b></div><div className="flex justify-between gap-3"><span className="text-slate">Reporting line</span><b>{employee?.manager ?? 'Company leadership'}</b></div></div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
