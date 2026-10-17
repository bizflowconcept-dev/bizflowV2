import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, Avatar, Badge, Btn, Field, inputCls, Panel, PageHeader, Table, Tabs, ExportButton } from '../../components/ui'
import { employeesForTenant, isOwnDataset } from '../../data/demo'
import { useScope } from '../../components/app/AppLayout'
import { host, useTenant } from '../../tenant/store'

export default function People() {
  const { scope } = useScope()
  const tenant = useTenant()
  const employees = employeesForTenant(tenant?.slug)
  const own = isOwnDataset(tenant?.slug)
  const [tab, setTab] = useState('Directory')
  const [q, setQ] = useState('')
  const [invite, setInvite] = useState(false)
  const [link, setLink] = useState(false)
  const rows = employees.filter((e) => (scope === 'Company' || e.branch.startsWith(scope.split(' ')[0])) && (e.name + e.role + e.dept).toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <PageHeader eyebrow="People" title="Employees" desc={`${rows.length} people in ${scope} scope`} actions={<><ExportButton name="employees" head={['ID','Name','Role']} rows={rows.map((e: any) => [e.id, e.name, e.role])} /><Btn onClick={() => setInvite(true)}>Create employee</Btn></>} />
      <Tabs tabs={['Directory', 'Attendance', 'Leave', 'Organisation']} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'Directory' && (
          <Panel pad={false}>
            <div className="flex gap-2 border-b border-line p-3"><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search employees" placeholder="Search name, role or department" className={`${inputCls} max-w-xs`} /><select className="h-10 rounded-md border border-line bg-white px-2 text-sm" aria-label="Saved views"><option>All employees</option><option>On leave</option><option>Onboarding</option></select></div>
            {rows.length === 0 ? (
              <div className="p-12 text-center"><div className="font-display text-xl font-semibold">No employees yet</div><p className="mt-1 text-sm text-slate">Add your first employee or generate a secure onboarding link.</p><Btn className="mt-4" onClick={() => setInvite(true)}>Add Employee</Btn></div>
            ) : (
              <Table head={['Employee', 'ID', 'Department', 'Branch', 'Work mode', 'Status']} rows={rows.map((e) => [
                <Link key="n" to={`/admin/business/people/${e.id}`} className="flex items-center gap-3 font-semibold hover:text-teal"><Avatar name={e.name} />{e.name}<span className="hidden text-xs font-normal text-slate xl:inline">{e.role}</span></Link>,
                e.id, e.dept, e.branch, e.mode, <Badge key="s">{e.status}</Badge>])} />
            )}
          </Panel>
        )}
        {tab === 'Attendance' && (
          own && employees.length < 2 ? <Panel><EmptyState title="No attendance yet" body="Attendance appears once your team starts checking in." action={<Btn onClick={() => setInvite(true)}>Add your first employee</Btn>} /></Panel> : <Panel title="Today · 8 Oct" pad={false}>
            <Table head={['Employee', 'Expected', 'Status', 'Check-in']} rows={employees.map((e, i) => {
              const st = e.status === 'On leave' ? 'Approved Leave' : e.mode === 'Remote' || (e.mode === 'Hybrid' && i % 2) ? 'Remote' : e.mode === 'Field' ? 'Field' : i === 3 ? 'Late' : 'On-site'
              return [<span key="n" className="flex items-center gap-3 font-semibold"><Avatar name={e.name} size={24} />{e.name}</span>, e.mode === 'Hybrid' ? (i % 2 ? 'Remote' : 'Office') : e.mode, <Badge key="s" tone={st === 'Late' ? 'amber' : st === 'Approved Leave' ? 'gray' : st === 'Remote' ? 'blue' : 'green'}>{st}</Badge>, st === 'Approved Leave' ? '—' : `0${7 + (i % 3)}:${10 + i * 4}`]
            })} />
          </Panel>
        )}
        {tab === 'Leave' && (
          own ? <Panel><EmptyState title="No leave requests" body="Leave requests from your team will appear here for approval." /></Panel> : <Panel title="Leave calendar · October" pad={false}>
            <Table head={['Employee', 'Type', 'Dates', 'Days', 'Status']} rows={[
              [employees.find((e) => e.status === 'On leave')?.name ?? employees[0].name, 'Annual', '5 – 16 Oct', '10', <Badge key="a">Approved</Badge>],
              [employees.find((e) => e.dept.includes('Human'))?.name ?? employees[1].name, 'Annual', '12 – 23 Oct', '10', <Badge key="b">Pending</Badge>],
              [employees.find((e) => e.dept.includes('Operations'))?.name ?? employees[2].name, 'Sick', '6 – 7 Oct', '2', <Badge key="c">Approved</Badge>],
            ]} right={[3]} />
          </Panel>
        )}
        {tab === 'Organisation' && (
          <Panel title="Company → Branch → Department → Team">
            <div className="space-y-3 text-sm">
              {[...new Set(employees.map((e) => e.branch))].map((branch) => {
                const branchEmployees = employees.filter((e) => e.branch === branch)
                return <div key={branch} className="flex items-center justify-between border-b border-line pb-3 last:border-0"><div><div className="font-semibold">{branch}</div><div className="text-xs text-slate">{[...new Set(branchEmployees.map((e) => e.dept))].join(' · ')}</div></div><span className="num font-display text-xl font-semibold">{branchEmployees.length}</span></div>
              })}
            </div>
          </Panel>
        )}
      </div>
      {invite && (
        <div className="safe-overlay fixed inset-0 z-50 flex justify-end bg-midnight/40" onClick={() => setInvite(false)}>
          <aside role="dialog" aria-label="Create employee" className="h-full w-full max-w-md overflow-y-auto overscroll-contain bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-semibold">Invite New Employee</h2>
            <p className="mt-1 text-sm text-slate">The employee completes their own details, documents and acknowledgements. You review and approve.</p>
            <div className="mt-6 space-y-4">
              <Field label="Full name"><input className={inputCls} defaultValue={own ? undefined : "Maryam Bello"} placeholder="Full name" /></Field>
              <Field label="Position"><input className={inputCls} defaultValue={own ? undefined : "Accountant"} placeholder="Position" /></Field>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Branch"><select className={inputCls}>{[...new Set(employees.map((e) => e.branch))].map((branch) => <option key={branch}>{branch}</option>)}</select></Field><Field label="Department"><select className={inputCls}>{[...new Set(employees.map((e) => e.dept))].map((dept) => <option key={dept}>{dept}</option>)}</select></Field></div>
              <Field label="Start date"><input type="date" className={inputCls} defaultValue="2026-11-01" /></Field>
              {link ? (
                <div role="status" className="rounded-md bg-softmint p-4 text-sm"><b>Secure link generated</b><div className="num mt-1 break-all font-mono text-xs">https://{own ? host(tenant!.slug) : 'etranzact.bizflow.ng'}/join/8Kd2-xQ91-Lm4P</div><div className="mt-1 text-xs text-slate">Expires in 7 days · single use</div></div>
              ) : <Btn className="w-full" onClick={() => setLink(true)}>Generate onboarding link</Btn>}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
