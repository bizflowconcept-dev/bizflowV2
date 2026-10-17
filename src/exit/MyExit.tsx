import { useState } from 'react'
import { Badge, Btn, Panel, Stepper } from '../components/ui'
import type { Employee } from '../data/demo'
import ExitForm from './ExitForm'
import { cancelExit, fmtDateX, useExits } from './store'

const TONE: Record<string, string> = { Initiated: 'amber', 'In clearance': 'blue', 'Final pay review': 'teal', Completed: 'green', Cancelled: 'gray' }

/** "My BizFlow" entry: submit a resignation and follow its status. Shows nothing sensitive. */
export default function MyExit({ slug, employees, me, by }: { slug: string; employees: Employee[]; me?: Employee; by: string }) {
  const all = useExits(slug)
  const [open, setOpen] = useState(false)
  if (!me) return null
  const mine = all.filter((c) => c.employeeId === me.id).sort((a, b) => b.created.localeCompare(a.created))[0]
  const live = mine && mine.status !== 'Completed' && mine.status !== 'Cancelled'
  if (!live) {
    return (
      <>
        <Panel title="Resignation" action={mine?.status === 'Cancelled' ? <Badge tone="gray">Last request withdrawn</Badge> : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-sm text-slate">Thinking of leaving? Submit your resignation here. Your line manager and HR review it, and you can follow every step in this card.</p>
            <Btn s="sm" v="secondary" onClick={() => setOpen(true)}>Submit resignation</Btn>
          </div>
        </Panel>
        <ExitForm open={open} onClose={() => setOpen(false)} slug={slug} employees={employees} me={me} by={by} />
      </>
    )
  }
  const stage = !mine.accepted ? 0 : mine.status === 'In clearance' ? 1 : 2
  return (
    <Panel title="Your resignation" action={<Badge tone={TONE[mine.status]}>{mine.accepted ? mine.status : 'Awaiting acceptance'}</Badge>}>
      <div className="overflow-x-auto pb-1"><Stepper steps={['Submitted', 'Clearance', 'Final pay']} at={stage} /></div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-slate">Type</dt><dd className="font-semibold">{mine.type}</dd></div>
        <div><dt className="text-xs text-slate">Notice given</dt><dd className="font-semibold">{fmtDateX(mine.noticeGiven)}</dd></div>
        <div><dt className="text-xs text-slate">Proposed last working day</dt><dd className="font-semibold">{fmtDateX(mine.lastWorkingDay)}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-slate">
        {mine.accepted ? `Accepted by ${mine.accepted.by}. HR will confirm your handover, clearance and final pay dates with you.` : 'Waiting for your line manager or HR to accept it.'}
      </p>
      {!mine.accepted && <div className="mt-3"><Btn s="sm" v="secondary" onClick={() => cancelExit(mine.id, by, 'Withdrawn by the employee')}>Withdraw resignation</Btn></div>}
    </Panel>
  )
}
