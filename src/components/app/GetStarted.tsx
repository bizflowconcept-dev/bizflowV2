import { Link } from 'react-router'
import { Check } from 'lucide-react'
import { Btn, Panel, Stat } from '../ui'
import { employeesForTenant } from '../../data/demo'
import { useDepartments, useInvites, useTenant } from '../../tenant/store'
import { useTasks } from '../../tasks/store'

type Step = { id: string; title: string; detail: string; to: string; done: boolean }

/** Empty-state dashboard for a self-serve workspace: real zeros and a short checklist, never sample numbers. */
export default function GetStarted({ onInvite, title = 'Welcome' }: { onInvite?: () => void; title?: string }) {
  const tenant = useTenant()
  const slug = tenant?.slug ?? ''
  const departments = useDepartments(slug)
  const invites = useInvites(slug)
  const tasks = useTasks()
  if (!tenant) return null
  const employees = employeesForTenant(slug)
  const people = employees.length
  const openTasks = tasks.filter((t) => t.tenant === slug && t.scope === 'Business' && t.status !== 'Done').length
  const steps: Step[] = [
    { id: 'employees', title: 'Add your first employee', detail: 'Create staff records so approvals, leave and payroll have owners.', to: '/admin/business/people', done: people > 1 },
    { id: 'departments', title: 'Set up departments', detail: 'Group people and decide which modules each department can use.', to: '/admin/business/settings?tab=rbac', done: departments.length > 0 },
    { id: 'invite', title: 'Invite colleagues', detail: 'Send a secure onboarding link so staff complete their own details.', to: '/admin/business/people', done: invites.length > 0 },
    { id: 'approvals', title: 'Set your approval flow', detail: 'Choose who reviews requests before they reach you.', to: '/admin/business/settings/approvals', done: false },
    { id: 'profile', title: 'Complete your company profile', detail: 'Add your address, website and branding.', to: '/admin/business/settings/profile', done: !!tenant.profile.address },
  ]
  const done = steps.filter((s) => s.done).length
  const pct = Math.round((done / steps.length) * 100)
  return (
    <div className="space-y-6">
      <div className="overview-hero">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal">Get started</p>
        <h1 className="mt-1 text-3xl font-semibold leading-tight">{title}, {tenant.profile.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate">Your workspace is empty and ready. Add your people and set up departments, and this dashboard will fill with your own numbers.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn to="/admin/business/people">Add your first employee</Btn>
          {onInvite ? <Btn v="secondary" onClick={onInvite}>Invite colleagues</Btn> : <Btn v="secondary" to="/admin/business/people">Invite colleagues</Btn>}
        </div>
      </div>
      <Panel>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Employees" value={String(people)} sub={people <= 1 ? 'Just you so far' : undefined} />
          <Stat label="Departments" value={String(departments.length)} />
          <Stat label="Pending approvals" value="0" />
          <Stat label="Open tasks" value={String(openTasks)} />
        </div>
      </Panel>
      <section aria-label="Get started checklist" className="rounded-xl border border-line bg-white p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold">Get started checklist</h2>
        <p className="mt-0.5 text-[13px] text-slate">{done} of {steps.length} complete</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cloud" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-teal transition-all" style={{ width: `${pct}%` }} /></div>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s) => (
            <li key={s.id}>
              <Link to={s.to} className="flex min-h-14 w-full items-start gap-3 rounded-lg border border-line p-3 text-left hover:border-teal">
                <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${s.done ? 'border-teal bg-teal text-white' : 'border-line'}`}>{s.done && <Check size={12} strokeWidth={3} />}</span>
                <span className="min-w-0"><span className={`block text-sm font-semibold ${s.done ? 'text-slate line-through decoration-slate/40' : 'text-ink'}`}>{s.title}</span><span className="block text-xs text-slate">{s.detail}</span></span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
