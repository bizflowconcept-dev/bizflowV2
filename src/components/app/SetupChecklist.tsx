import { useState } from 'react'
import { Link } from 'react-router'
import { Check, X } from 'lucide-react'
import { useInvites } from '../../tenant/store'
import { openInstall, usePwa } from '../../pwa/pwa'

type Step = { id: string; title: string; detail: string; to?: string; auto?: boolean }

export default function SetupChecklist({ slug, employees, showAttendance }: { slug: string; employees: number; showAttendance: boolean }) {
  const key = `bf-setup-${slug}`
  const read = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } }
  const [flags, setFlags] = useState(read)
  const invites = useInvites(slug)
  const pwa = usePwa()
  if (flags.dismissed) return null
  const mark = (id: string) => { const n = { ...flags, [id]: true }; localStorage.setItem(key, JSON.stringify(n)); setFlags(n) }
  const steps: Step[] = [
    { id: 'staff', title: 'Add your staff', detail: 'Import or invite employees so approvals have owners.', to: '/admin/business/people', auto: employees > 0 && invites.length > 0 },
    { id: 'finance', title: 'Set finance tiers', detail: 'Adopt the ₦500,000 default or set your own ceiling.', to: '/admin/business/settings/finance' },
    ...(showAttendance ? [{ id: 'sites', title: 'Confirm attendance sites', detail: 'Check branch locations and the clock-in radius.', to: '/admin/business/performance?tab=Attendance' }] : []),
    { id: 'approvers', title: 'Set your approval flow', detail: 'Audit is in every request. Add Compliance or Legal where needed.', to: '/admin/business/settings/approvals' },
    { id: 'install', title: 'Install the app', detail: 'Add BizFlow to your home screen for quick clock-in and approvals.', auto: pwa.installed },
  ]
  const done = steps.filter((s) => s.auto || flags[s.id]).length
  if (done === steps.length) return null
  const pct = Math.round((done / steps.length) * 100)
  return (
    <section aria-label="Workspace setup" className="rounded-xl border border-line bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">Finish setting up your workspace</h2>
          <p className="mt-0.5 text-[13px] text-slate">{done} of {steps.length} complete</p>
        </div>
        <button onClick={() => mark('dismissed')} aria-label="Dismiss setup checklist" className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate hover:bg-ink/5"><X size={16} /></button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cloud" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-teal transition-all" style={{ width: `${pct}%` }} /></div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => {
          const ok = s.auto || flags[s.id]
          const body = (
            <>
              <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${ok ? 'border-teal bg-teal text-white' : 'border-line'}`}>{ok && <Check size={12} strokeWidth={3} />}</span>
              <span className="min-w-0"><span className={`block text-sm font-semibold ${ok ? 'text-slate line-through decoration-slate/40' : 'text-ink'}`}>{s.title}</span><span className="block text-xs text-slate">{s.detail}</span></span>
            </>
          )
          const cls = 'flex min-h-14 w-full items-start gap-3 rounded-lg border border-line p-3 text-left hover:border-teal'
          return <li key={s.id}>{s.to ? <Link to={s.to} onClick={() => mark(s.id)} className={cls}>{body}</Link> : <button onClick={() => { openInstall(); mark(s.id) }} className={`${cls} cursor-pointer`}>{body}</button>}</li>
        })}
      </ol>
    </section>
  )
}
