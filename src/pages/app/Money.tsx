import { useState } from 'react'
import { Badge, Btn, EmptyState, Panel, PageHeader, Stat, Table, Tabs, Stepper, QuickAction, ExportButton, Field, inputCls, Overlay, Timeline, useToast } from '../../components/ui'
import { CrmReceivables } from '../../crm/Extras'
import { useRole } from '../../components/app/AppLayout'
import { employeesForTenant, isOwnDataset, ngn } from '../../data/demo'
import { auditFor, useTenant } from '../../tenant/store'
import { addPayrollNote, setPayrollStatus, usePayrollRun } from '../../finance/payrollRun'
import type { PayrollStatus } from '../../finance/payrollRun'
import { DESK_LABEL, handlerFor, useDesk, useFinancePolicy } from '../../finance/policy'
import { CheckCircle2, CircleDollarSign, FileSearch, MessageSquareText, Send, ShieldCheck, TriangleAlert, ArrowDownRight, ArrowUpRight, BookOpenCheck, Landmark } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const calc = (g: number) => {
  const paye = Math.round(g * 0.14), pen = Math.round(g * 0.5 * 0.08), nhf = Math.round(g * 0.25 * 0.025)
  return { paye, pen, nhf, net: g - paye - pen - nhf }
}

type ReviewAction = 'comment' | 'instruction' | 'reject'

export function Payroll() {
  const { role, r, can } = useRole()
  const tenant = useTenant()
  const employees = employeesForTenant(tenant?.slug)
  const [tab, setTab] = useState('October run')
  const payrollSlug = tenant?.slug ?? 'demo'
  const run = usePayrollRun(payrollSlug)
  const status = run.status
  const setStatus = (next: PayrollStatus) => setPayrollStatus(payrollSlug, next)
  const reviewNotes = run.notes
  const setReviewNotes = (update: (items: typeof reviewNotes) => typeof reviewNotes) => { const [added] = update([]); if (added) addPayrollNote(payrollSlug, added) }
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null)
  const [confirmAction, setConfirmAction] = useState<'approve' | 'disburse' | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const toast = useToast()
  const stages = ['Prepared', 'Under review', 'Reviewed', 'Approved', 'Disbursed']
  const tot = employees.reduce((a, e) => a + e.salary, 0)
  const deductions = employees.map((e) => calc(e.salary))
  const payeTotal = deductions.reduce((sum, item) => sum + item.paye, 0)
  const pensionTotal = deductions.reduce((sum, item) => sum + item.pen * 2, 0)
  const nhfTotal = deductions.reduce((sum, item) => sum + item.nhf, 0)
  const netTotal = deductions.reduce((sum, item) => sum + item.net, 0)
  const totalDeductions = tot - netTotal
  const own = isOwnDataset(tenant?.slug)
  const previousGross = own ? tot : Math.round(tot * 0.976)
  const variance = tot - previousGross
  const selected = employees.find((employee) => employee.id === selectedEmployee)
  const canReview = ['md', 'admin', 'hr', 'finance'].includes(role)
  const canApprove = role === 'md' || role === 'admin'
  const policy = useFinancePolicy(tenant?.slug ?? '')
  const [desk] = useDesk(tenant?.slug ?? '', r.title)
  const handler = handlerFor(netTotal, policy)
  const canDisburse = role === 'finance' && desk === handler
  const canPrepare = (role === 'hr' || role === 'admin' || role === 'finance') && can('payroll.process')
  const step = status === 'disbursed' ? 4 : status === 'approved' ? 3 : status === 'reviewed' ? 2 : 1
  const statusMeta: Record<PayrollStatus, { label: string; tone: string; message: string }> = {
    'under-review': { label: 'Under review', tone: 'blue', message: 'Reviewers can inspect employees, add comments, give instructions or reject with a reason.' },
    reviewed: { label: 'Reviewed', tone: 'teal', message: 'Review is complete. An authorized executive can now approve this payroll.' },
    approved: { label: 'Approved · with Finance', tone: 'green', message: 'Approval is complete. The run is now routed by the finance tiers for disbursement.' },
    rejected: { label: 'Rejected', tone: 'red', message: 'The payroll team must resolve the rejection reason and resubmit the run for review.' },
    disbursed: { label: 'Disbursed', tone: 'green', message: 'Payments were released by Finance and the payroll run is now complete.' },
  }
  const currentStatus = statusMeta[status]
  const departments = [...new Set(employees.map((employee) => employee.dept))].map((dept) => {
    const people = employees.filter((employee) => employee.dept === dept)
    const gross = people.reduce((sum, employee) => sum + employee.salary, 0)
    return { dept, people: people.length, gross, share: Math.round((gross / (tot || 1)) * 100) }
  }).sort((a, b) => b.gross - a.gross)
  const submitReviewAction = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reviewAction) return
    const data = new FormData(event.currentTarget)
    const text = String(data.get('review-note') || '').trim()
    const labels = { comment: 'commented', instruction: 'gave a payroll instruction', reject: 'rejected the payroll' }
    setReviewNotes((items) => [{ t: 'Just now', a: r.user, x: `${labels[reviewAction]}: ${text}` }, ...items])
    if (reviewAction === 'reject') setStatus('rejected')
    auditFor(reviewAction === 'reject' ? 'Payroll rejected' : reviewAction === 'instruction' ? 'Payroll instruction given' : 'Payroll review comment', { category: 'Finance', ref: 'PAY-OCT-2026', from: status, to: reviewAction === 'reject' ? 'rejected' : undefined, result: 'Success' })
    setReviewAction(null)
    toast(reviewAction === 'reject' ? 'Payroll rejected and returned to the payroll team' : 'Review note added')
  }
  const markReviewed = () => {
    setStatus('reviewed')
    auditFor('Payroll marked as reviewed', { category: 'Finance', ref: 'PAY-OCT-2026', from: status, to: 'reviewed' })
    setReviewNotes((items) => [{ t: 'Just now', a: r.user, x: 'completed the payroll review and marked the run Reviewed' }, ...items])
    toast('Payroll marked as reviewed')
  }
  const approve = () => {
    setStatus('approved')
    auditFor('Payroll approved', { category: 'Finance', ref: 'PAY-OCT-2026', from: status, to: 'approved' })
    setReviewNotes((items) => [{ t: 'Just now', a: r.user, x: 'approved the payroll and sent it to CFO / Finance for disbursement' }, ...items])
    setConfirmAction(null)
    toast('Payroll approved and sent to Finance')
  }
  const disburse = () => {
    setStatus('disbursed')
    auditFor('Payroll disbursed', { category: 'Finance', ref: 'PAY-OCT-2026', from: status, to: `disbursed ${ngn(netTotal)}` })
    setReviewNotes((items) => [{ t: 'Just now', a: r.user, x: `released ${ngn(netTotal)} for employee disbursement` }, ...items])
    setConfirmAction(null)
    toast('Payroll disbursement completed')
  }
  if (own && tot === 0) return <div className="space-y-6"><PageHeader eyebrow="Payroll control" title="Payroll" desc={`${tenant?.profile.name ?? 'Company'} · No payroll run yet`} /><div className="rounded-lg border border-line bg-white"><EmptyState title="No payroll to run yet" body="Add employees and set their salaries to prepare your first payroll run. Review, approval and disbursement are tracked here." action={<Btn to="/admin/business/people">Add your first employee</Btn>} /></div></div>
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Payroll control" title="October 2026 payroll" desc={`${tenant?.profile.name ?? 'Company'} · ${employees.length} detailed employee records · Pay date 25 Oct`} actions={<><ExportButton name="payroll-summary-october-2026" head={['Employee','Gross','Net']} rows={employees.map((e) => [e.name, String(e.salary), String(calc(e.salary).net)])} /><Badge tone={currentStatus.tone}>{currentStatus.label}</Badge></>} />

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0 flex-1"><Stepper steps={stages} at={step} /><p className="mt-3 max-w-3xl text-sm text-slate">{currentStatus.message}</p></div>
          <div className="flex flex-wrap gap-2">
            {canReview && ['under-review', 'reviewed'].includes(status) && <><Btn v="secondary" onClick={() => setReviewAction('comment')}><MessageSquareText size={15} />Comment</Btn><Btn v="secondary" onClick={() => setReviewAction('instruction')}><Send size={15} />Give instruction</Btn><Btn v="secondary" onClick={() => setReviewAction('reject')}>Reject</Btn></>}
            {status === 'under-review' && canReview && <Btn onClick={markReviewed}><FileSearch size={15} />Mark reviewed</Btn>}
            {status === 'reviewed' && canApprove && <Btn onClick={() => setConfirmAction('approve')}><CheckCircle2 size={15} />Approve payroll</Btn>}
            {status === 'reviewed' && !canApprove && <Badge tone="amber">Awaiting executive approval</Badge>}
            {status === 'approved' && canDisburse && <Btn onClick={() => setConfirmAction('disburse')}><CircleDollarSign size={15} />Disburse payroll</Btn>}
            {status === 'approved' && !canDisburse && <Badge tone="blue">Assigned to {DESK_LABEL[handler]}</Badge>}
            {status === 'rejected' && canPrepare && <Btn onClick={() => { setStatus('under-review'); setReviewNotes((items) => [{ t: 'Just now', a: r.user, x: 'resolved the rejection and resubmitted payroll for review' }, ...items]); toast('Payroll resubmitted for review') }}>Resubmit for review</Btn>}
            {status === 'disbursed' && <Badge tone="green">Payment complete</Badge>}
          </div>
        </div>
      </Panel>

      <section aria-label="Payroll summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Panel className="sm:col-span-2 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wide text-slate">October payroll commitment</div><div className="num mt-2 font-display text-4xl font-semibold">{ngn(tot)}</div><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate"><Badge tone={currentStatus.tone}>{currentStatus.label}</Badge><span>{employees.length} employees · Pay date 25 Oct</span></div></div><CircleDollarSign size={28} className="text-teal" /></div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4"><div><div className="text-xs text-slate">Net employee pay</div><div className="num mt-1 text-lg font-semibold">{ngn(netTotal)}</div></div><div><div className="text-xs text-slate">Net-to-gross ratio</div><div className="num mt-1 text-lg font-semibold">{Math.round((netTotal / (tot || 1)) * 100)}%</div></div></div>
        </Panel>
        <Panel><Stat label="Statutory deductions" value={ngn(totalDeductions)} sub={`PAYE ${ngn(payeTotal)}`} /><div className="mt-4 border-t border-line pt-3 text-xs text-slate">Pension and NHF are fully provisioned.</div></Panel>
        <Panel><Stat label="Month variance" value={own ? ngn(0) : `+${ngn(variance)}`} delta={own ? undefined : "2.4%"} sub="vs September" /><div className="mt-4"><Badge tone="green">Within 5% threshold</Badge></div></Panel>
        <Panel><Stat label="Average gross" value={ngn(Math.round(tot / Math.max(1, employees.length)))} sub="Per employee" /><div className="mt-4 border-t border-line pt-3 text-xs text-slate">{employees.filter((employee) => employee.salary > tot / employees.length).length} employees above average</div></Panel>
      </section>

      <Tabs tabs={['October run', 'Insights', 'Review history', 'Salary-on-demand', 'Statutory']} value={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'October run' && (<>
          <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
            <Panel pad={false} title={`Employee payroll · ${employees.length} records`} action={<Badge tone="teal">{ngn(tot)} gross</Badge>}>
              <Table right={[2, 3, 4, 5, 6]} pageSize={10} head={['Employee', 'Department', 'Gross', 'PAYE', 'Pension', 'Net', 'Action']} rows={employees.map((e) => { const c = calc(e.salary); return [<span key="e" className="font-semibold">{e.name}<span className="block text-xs font-normal text-slate">{e.id} · {e.branch}</span></span>, e.dept, ngn(e.salary), ngn(c.paye), ngn(c.pen), <b key="n">{ngn(c.net)}</b>, <Btn key="v" s="sm" v="ghost" onClick={() => setSelectedEmployee(e.id)}>View</Btn>] })} />
            </Panel>
            <div className="space-y-6">
              <Panel title="Review checks" action={<Badge tone={status === 'rejected' ? 'red' : 'green'}>{status === 'rejected' ? 'Action required' : 'Checks passed'}</Badge>}>
                <div className="space-y-3 text-sm">
                  {[['Employee records', `${employees.length} included`, true], ['Duplicate accounts', 'No duplicates found', true], ['Negative net pay', 'No exceptions found', true], ['Bank details', own ? 'No exceptions found' : '2 records need confirmation', own], ['Month variance', own ? 'No prior month to compare' : '+2.4% within threshold', true]].map(([label, detail, passed]) => <div key={label as string} className="flex items-start gap-3"><span className={`mt-0.5 ${passed ? 'text-ok' : 'text-warn'}`}>{passed ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}</span><span className="flex-1"><b className="block">{label}</b><span className="text-xs text-slate">{detail}</span></span></div>)}
                </div>
              </Panel>
              <Panel title="Latest review activity" action={<Btn s="sm" v="ghost" onClick={() => setTab('Review history')}>View history</Btn>}><Timeline items={reviewNotes.slice(0, 4)} /></Panel>
            </div>
          </div>
        </>)}
        {tab === 'Insights' && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <Panel title="Cost composition"><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate">Net employee pay</span><b>{ngn(netTotal)}</b></div><div className="flex justify-between"><span className="text-slate">PAYE</span><b>{ngn(payeTotal)}</b></div><div className="flex justify-between"><span className="text-slate">Pension · employer + employee</span><b>{ngn(pensionTotal)}</b></div><div className="flex justify-between"><span className="text-slate">NHF</span><b>{ngn(nhfTotal)}</b></div></div></Panel>
              <Panel title="Workforce insight"><Stat label="Highest department spend" value={departments[0]?.dept ?? '—'} sub={departments[0] ? `${ngn(departments[0].gross)} · ${departments[0].share}% of payroll` : ''} /><div className="mt-5"><Stat label="Employees above average" value={String(employees.filter((employee) => employee.salary > tot / employees.length).length)} sub={`Average ${ngn(Math.round(tot / Math.max(1, employees.length)))}`} /></div></Panel>
              <Panel title="Variance analysis"><Stat label="Increase vs September" value={ngn(variance)} delta={own ? undefined : "2.4%"} /><p className="mt-4 text-sm text-slate">{own ? "Variance analysis starts once you have more than one payroll run." : "Driven by onboarding, annual adjustments and one new management position. Variance remains below the 5% review threshold."}</p></Panel>
            </div>
            <Panel title="Payroll by department" pad={false}><Table right={[1, 2, 3]} head={['Department', 'Employees', 'Gross payroll', 'Share']} rows={departments.map((item) => [item.dept, item.people, ngn(item.gross), `${item.share}%`])} /></Panel>
            <Panel title="Exceptions requiring attention" pad={false}><Table head={['Employee', 'Exception', 'Impact', 'Owner', 'Status']} rows={own ? [] : [[employees[1]?.name ?? 'Employee', 'Bank detail confirmation', 'Disbursement hold', 'Human Capital', <Badge key="a" tone="amber">Open</Badge>], [employees[employees.length - 1]?.name ?? 'Employee', 'New joiner proration', ngn(Math.round((employees[employees.length - 1]?.salary ?? 0) * 0.4)), 'Payroll team', <Badge key="b" tone="blue">Reviewed</Badge>], [employees[3]?.name ?? 'Employee', 'Allowance variance above 10%', ngn(85000), 'Finance', <Badge key="c" tone="green">Resolved</Badge>]]} /></Panel>
          </div>
        )}
        {tab === 'Review history' && (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Panel title="Review and approval trail"><Timeline items={reviewNotes} /></Panel>
            <Panel title="Governance">
              <div className="flex items-start gap-3 rounded-lg bg-softmint p-3"><ShieldCheck size={20} className="text-teal" /><p className="text-sm text-slate">The preparer, reviewer, approver and Finance disburser are recorded separately. Rejections and instructions require written reasons.</p></div>
              <dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><dt className="text-slate">Prepared by</dt><dd className="font-semibold">Payroll team</dd></div><div className="flex justify-between"><dt className="text-slate">Current owner</dt><dd className="font-semibold">{status === 'approved' ? 'CFO / Finance' : status === 'disbursed' ? 'Complete' : 'Reviewer'}</dd></div><div className="flex justify-between"><dt className="text-slate">Run reference</dt><dd className="font-mono font-semibold">PAY-2026-10</dd></div></dl>
            </Panel>
          </div>
        )}
        {tab === 'Salary-on-demand' && (
          <Panel pad={false} title="Requests this month"><Table right={[1, 2]} head={['Employee', 'Requested', 'Charge', 'Deduction', 'Status']} rows={(own ? [] : employees.slice(3, 6)).map((employee, index) => [employee.name, ngn([150000, 200000, 80000][index]), ngn([3750, 5000, 2000][index]), 'October payroll', <Badge key={employee.id}>{index ? 'Paid' : 'Pending'}</Badge>])} /></Panel>
        )}
        {tab === 'Statutory' && (
          <Panel title="Statutory remittances"><Table head={['Item', 'Authority', 'Due', 'Amount']} right={[3]} rows={[['PAYE', 'State IRS', '10 Nov', ngn(payeTotal)], ['Pension', 'PFAs', '7 Nov', ngn(pensionTotal)], ['NHF', 'FMBN', '30 Nov', ngn(nhfTotal)], ['NSITF', 'NSITF', '16 Nov', ngn(Math.round(tot * 0.01))]]} /></Panel>
        )}
      </div>
      <Overlay open={!!reviewAction} onClose={() => setReviewAction(null)} title={reviewAction === 'reject' ? 'Reject payroll' : reviewAction === 'instruction' ? 'Give instruction before approval' : 'Add review comment'} alert={reviewAction === 'reject'}>
        <form onSubmit={submitReviewAction} className="space-y-4">
          <p className="text-sm text-slate">{reviewAction === 'reject' ? 'A clear reason is required. The payroll team must resolve it before resubmitting.' : reviewAction === 'instruction' ? 'Record what must be checked or changed before final approval.' : 'Add context or an observation to the permanent review trail.'}</p>
          <Field label={reviewAction === 'reject' ? 'Rejection reason' : reviewAction === 'instruction' ? 'Instruction' : 'Comment'}><textarea name="review-note" required rows={5} className={`${inputCls} h-auto py-2`} placeholder={reviewAction === 'reject' ? 'Explain why this payroll cannot proceed…' : 'Write a clear review note…'} /></Field>
          <div className="flex justify-end gap-2"><Btn type="button" v="secondary" onClick={() => setReviewAction(null)}>Cancel</Btn><Btn type="submit" v={reviewAction === 'reject' ? 'dark' : 'primary'}>{reviewAction === 'reject' ? 'Reject and return' : 'Save to review'}</Btn></div>
        </form>
      </Overlay>
      <Overlay open={!!confirmAction} onClose={() => setConfirmAction(null)} title={confirmAction === 'disburse' ? 'Confirm payroll disbursement' : 'Approve October payroll'} alert>
        <p className="text-sm text-slate">{confirmAction === 'disburse' ? `Finance will release ${ngn(netTotal)} to ${employees.length} employees. This action completes the payroll run.` : `This approves ${ngn(tot)} gross and ${ngn(netTotal)} net. The payroll will move immediately to CFO / Finance for disbursement.`}</p>
        <div className="mt-4 rounded-lg bg-cloud p-3 text-sm"><div className="flex justify-between"><span className="text-slate">Run</span><b>PAY-2026-10</b></div><div className="mt-2 flex justify-between"><span className="text-slate">Acting as</span><b>{r.title}</b></div></div>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setConfirmAction(null)}>Cancel</Btn><Btn onClick={confirmAction === 'disburse' ? disburse : approve}>{confirmAction === 'disburse' ? 'Release payments' : 'Approve and send to Finance'}</Btn></div>
      </Overlay>
      <Overlay open={!!selected} onClose={() => setSelectedEmployee('')} title={selected ? `${selected.name} · Payroll detail` : 'Payroll detail'} side wide>
        {selected && (() => { const detail = calc(selected.salary); return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-3"><Panel><Stat label="Gross pay" value={ngn(selected.salary)} sub={selected.dept} /></Panel><Panel><Stat label="Deductions" value={ngn(selected.salary - detail.net)} sub="PAYE, pension, NHF" /></Panel><Panel><Stat label="Net pay" value={ngn(detail.net)} sub="October 2026" /></Panel></div><Panel title="Employee payroll calculation"><dl className="space-y-3 text-sm"><div className="flex justify-between"><dt className="text-slate">Basic, housing and transport</dt><dd className="font-semibold">{ngn(selected.salary)}</dd></div><div className="flex justify-between"><dt className="text-slate">PAYE</dt><dd className="font-semibold text-err">−{ngn(detail.paye)}</dd></div><div className="flex justify-between"><dt className="text-slate">Employee pension</dt><dd className="font-semibold text-err">−{ngn(detail.pen)}</dd></div><div className="flex justify-between"><dt className="text-slate">NHF</dt><dd className="font-semibold text-err">−{ngn(detail.nhf)}</dd></div><div className="flex justify-between border-t border-line pt-3 text-base"><dt className="font-semibold">Net pay</dt><dd className="font-semibold">{ngn(detail.net)}</dd></div></dl></Panel><div className="flex justify-end"><Btn onClick={() => setSelectedEmployee('')}>Close payroll detail</Btn></div></div> })()}
      </Overlay>
    </div>
  )
}

const TB: [string, string, number, number][] = [
  ['1010', 'Cash and bank', 128400000, 0], ['1200', 'Accounts receivable', 31700000, 0], ['1500', 'Fixed assets', 64300000, 0],
  ['2010', 'Accounts payable', 0, 22800000], ['2100', 'PAYE and pension payable', 0, 5526000], ['3000', 'Share capital', 0, 50000000],
  ['4000', 'Service revenue', 0, 296000000], ['5000', 'Operating expenses', 149926000, 0],
]

const FINANCIAL_TREND = [
  { month: 'May', revenue: 41.2, expense: 33.1, cash: 8.1 },
  { month: 'Jun', revenue: 44.8, expense: 34.6, cash: 10.2 },
  { month: 'Jul', revenue: 43.1, expense: 36.2, cash: 6.9 },
  { month: 'Aug', revenue: 49.6, expense: 37.4, cash: 12.2 },
  { month: 'Sep', revenue: 52.3, expense: 39.8, cash: 12.5 },
  { month: 'Oct', revenue: 56.9, expense: 41.2, cash: 15.7 },
]

const JOURNALS = [
  { id: 'JE-1042', description: 'October payroll accrual', source: 'Payroll', maker: 'Payroll team', checker: 'CFO', debit: 'Payroll expense', credit: 'Payroll payable', amount: 18420000, status: 'Pending Approval', date: '8 Oct' },
  { id: 'JE-1041', description: 'Settlement processing fees', source: 'Admin Department', maker: 'Rita Nnamani', checker: 'Chinedu Eze', debit: 'Processing fees', credit: 'Cash and bank', amount: 1185000, status: 'Posted', date: '8 Oct' },
  { id: 'JE-1038', description: 'September period close', source: 'Month-end close', maker: 'Yetunde Salami', checker: 'Chinedu Eze', debit: 'Revenue clearing', credit: 'Service revenue', amount: 52100000, status: 'Locked', date: '30 Sep' },
  { id: 'JE-1036', description: 'Duplicate vendor invoice reversal', source: 'Accounts payable', maker: 'Paul Akinola', checker: 'Yetunde Salami', debit: 'Accounts payable', credit: 'Operating expenses', amount: 95000, status: 'Reversed', date: '28 Sep' },
]

export function Accounting() {
  const tenant = useTenant()
  const [tab, setTab] = useState('Overview')
  const [period, setPeriod] = useState('October 2026')
  const [selectedJournal, setSelectedJournal] = useState('')
  const dr = TB.reduce((a, x) => a + x[2], 0), cr = TB.reduce((a, x) => a + x[3], 0)
  const paymentCompany = tenant?.slug === 'etranzact'
  const costCentres = paymentCompany ? [
    { code: 'CC-310', name: 'Admin Department', owner: 'Ibrahim Musa', budget: 18500000, actual: 17200000, payroll: 6900000, trend: 4.2 },
    { code: 'CC-210', name: 'Technology & Product', owner: 'Kunle Ogunleye', budget: 16000000, actual: 16850000, payroll: 5250000, trend: 8.7 },
    { code: 'CC-410', name: 'Enterprise Sales', owner: 'Tobi Adeyemi', budget: 12500000, actual: 11200000, payroll: 3600000, trend: -2.1 },
    { code: 'CC-510', name: 'Risk & Compliance', owner: 'Adaeze Nwankwo', budget: 9000000, actual: 7350000, payroll: 3680000, trend: 1.8 },
    { code: 'CC-110', name: 'Human Capital', owner: 'Kemi Balogun', budget: 6500000, actual: 5920000, payroll: 3250000, trend: 3.1 },
    { code: 'CC-100', name: 'Finance & Treasury', owner: 'Chinedu Eze', budget: 8200000, actual: 7760000, payroll: 4640000, trend: 0.9 },
  ] : [
    { code: 'CC-320', name: 'Field Operations', owner: 'Emmanuel Ojo', budget: 14500000, actual: 15250000, payroll: 4200000, trend: 7.4 },
    { code: 'CC-330', name: 'Fleet', owner: 'Ibrahim Danjuma', budget: 12000000, actual: 10800000, payroll: 2150000, trend: -1.5 },
    { code: 'CC-310', name: 'Procurement', owner: 'Kabiru Abdullahi', budget: 9000000, actual: 8350000, payroll: 1800000, trend: 2.2 },
    { code: 'CC-210', name: 'Technology', owner: 'Kunle Ogunleye', budget: 10500000, actual: 9800000, payroll: 4600000, trend: 4.1 },
    { code: 'CC-100', name: 'Finance', owner: 'Chinedu Eze', budget: 7000000, actual: 6450000, payroll: 3300000, trend: 1.2 },
  ]
  const totalBudget = costCentres.reduce((sum, centre) => sum + centre.budget, 0)
  const totalActual = costCentres.reduce((sum, centre) => sum + centre.actual, 0)
  const budgetRemaining = totalBudget - totalActual
  const selectedEntry = JOURNALS.find((entry) => entry.id === selectedJournal)
  const grossMargin = 67.7
  const operatingMargin = 27.6
  if (isOwnDataset(tenant?.slug)) return (
    <div className="space-y-6">
      <PageHeader eyebrow="Finance control" title="Accounting and financial insights" desc={`${tenant?.profile.name ?? 'Company'} · NGN reporting currency`} actions={<QuickAction label="Create journal entry" title="Create journal entry" v="primary" s="md" done="Journal saved as draft and sent to the checker queue" fields={[{label:'Description',required:true},{label:'Debit account',type:'select',options:['Payroll expense','Processing fees','Operating expenses','Fixed assets']},{label:'Credit account',type:'select',options:['Cash and bank','Accounts payable','Payroll payable','Service revenue']},{label:'Amount (₦)',type:'number',required:true},{label:'Supporting reference',required:true}]} />} />
      <Panel title="Ledger"><EmptyState title="No ledger activity yet" body="Cash, receivables, payables and reports appear once you post journals, raise invoices or approve payroll and expenses. Opening balances and a bank feed can be added at any time." action={<QuickAction label="Create your first journal entry" title="Create journal entry" v="primary" s="md" done="Journal saved as draft and sent to the checker queue" fields={[{label:'Description',required:true},{label:'Debit account',type:'select',options:['Payroll expense','Processing fees','Operating expenses','Fixed assets']},{label:'Credit account',type:'select',options:['Cash and bank','Accounts payable','Payroll payable','Service revenue']},{label:'Amount (₦)',type:'number',required:true},{label:'Supporting reference',required:true}]} />} /></Panel>
      <Panel title="Cost centres"><EmptyState title="No cost centres yet" body="Cost centres let you budget and track spend by team, branch or project." action={<Btn to="/admin/business/organization">Add your first cost centre</Btn>} /></Panel>
    </div>
  )
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Finance control" title="Accounting and financial insights" desc={`${tenant?.profile.name ?? 'Company'} · FY 2026 · NGN reporting currency`} actions={<><ExportButton name="accounting-october-2026" head={['Account','Debit','Credit']} rows={TB.map((row) => [row[1], String(row[2]), String(row[3])])} /><QuickAction label="Create journal entry" title="Create journal entry" v="primary" s="md" done="Journal saved as draft and sent to the checker queue" fields={[{label:'Description',required:true},{label:'Debit account',type:'select',options:['Payroll expense','Processing fees','Operating expenses','Fixed assets']},{label:'Credit account',type:'select',options:['Cash and bank','Accounts payable','Payroll payable','Service revenue']},{label:'Amount (₦)',type:'number',required:true},{label:'Supporting reference',required:true}]} /></>} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
        <div className="flex items-center gap-3"><span className="rounded-lg bg-softmint p-2 text-teal"><Landmark size={19} /></span><div><div className="text-sm font-semibold">Financial reporting period</div><div className="text-xs text-slate">Books are open · 8 of 12 close checks completed</div></div></div>
        <select aria-label="Accounting period" value={period} onChange={(event) => setPeriod(event.target.value)} className={inputCls + ' w-auto min-w-44'}><option>October 2026</option><option>September 2026</option><option>Q3 2026</option><option>Year to date 2026</option></select>
      </div>

      <section aria-label="Financial summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Panel className="cursor-pointer transition-colors hover:border-teal active:bg-cloud sm:col-span-2" onClick={() => { setTab('Cash flow'); document.getElementById('acct-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
          <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wide text-slate">Net operating cash flow</div><div className="num mt-2 font-display text-4xl font-semibold">{ngn(15700000)}</div><div className="mt-2 flex items-center gap-2 text-xs"><Badge tone="green">Healthy</Badge><span className="text-slate">+25.6% vs September</span></div></div><CircleDollarSign size={28} className="text-teal" /></div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4"><div><div className="text-xs text-slate">Revenue</div><div className="num mt-1 text-lg font-semibold">{ngn(56900000)}</div></div><div><div className="text-xs text-slate">Operating expenses</div><div className="num mt-1 text-lg font-semibold">{ngn(41200000)}</div></div></div>
        </Panel>
        <Panel className="cursor-pointer transition-colors hover:border-teal active:bg-cloud" onClick={() => { setTab('Cash flow'); document.getElementById('acct-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><Stat label="Cash and bank" value={ngn(128400000)} delta="₦6.2M" sub="This month" /><div className="mt-4 flex items-center gap-1 text-xs text-ok"><ArrowUpRight size={14} />Strong liquidity</div></Panel>
        <Panel className="cursor-pointer transition-colors hover:border-teal active:bg-cloud" onClick={() => { setTab('Receivables'); document.getElementById('acct-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><Stat label="Receivables" value={ngn(31700000)} sub="₦4.1M overdue" /><div className="mt-4 flex items-center gap-1 text-xs text-warn"><TriangleAlert size={14} />13% requires attention</div></Panel>
        <Panel className="cursor-pointer transition-colors hover:border-teal active:bg-cloud" onClick={() => { setTab('Payables'); document.getElementById('acct-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><Stat label="Payables" value={ngn(22800000)} sub="₦7.8M due in 7 days" /><div className="mt-4 flex items-center gap-1 text-xs text-slate"><ArrowDownRight size={14} />Covered 5.6× by cash</div></Panel>
      </section>

      <div id="acct-tabs" className="scroll-mt-20" /><Tabs tabs={['Overview', 'Profit & Loss', 'Cash flow', 'Balance sheet', 'Trial balance', 'Journal', 'Payables', 'Receivables', 'Cost centres']} value={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'Overview' && (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
              <Panel title="Revenue, expenses and operating cash · ₦M">
                <div className="h-64"><ResponsiveContainer><AreaChart data={FINANCIAL_TREND} margin={{ left: -12, right: 8, top: 8 }}><defs><linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-teal)" stopOpacity=".28" /><stop offset="1" stopColor="var(--color-teal)" stopOpacity="0" /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--color-line)" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip formatter={(value) => `₦${value}M`} /><Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--color-teal)" fill="url(#revenue-fill)" strokeWidth={2.5} /><Area type="monotone" dataKey="expense" name="Expenses" stroke="var(--color-slate)" fill="none" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
              </Panel>
              <Panel title="Key financial ratios">
                <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                  {[
                    ['Gross margin', `${grossMargin}%`, '+2.1 pts'],
                    ['Operating margin', `${operatingMargin}%`, '+1.7 pts'],
                    ['Working capital', '₦37.3M', 'Positive'],
                    ['Cash runway', '7.4 mo', 'Healthy'],
                  ].map(([label, value, note]) => <div key={label} className="border-b border-line/70 pb-3 last:border-0"><div className="text-xs text-slate">{label}</div><div className="num mt-1 font-display text-xl font-semibold">{value}</div><div className="mt-1 text-[11px] font-semibold text-ok">{note}</div></div>)}
                </div>
                <div className="mt-4 rounded-lg bg-softmint px-3 py-2.5 text-xs text-slate"><b className="text-ink">Margins remain above target.</b> Liquidity covers current obligations without additional funding.</div>
              </Panel>
            </div>
            <Panel title="Where this data comes from" action={<Badge tone="amber">Sample figures</Badge>}>
              <p className="text-sm text-slate">The figures on this page are sample data. In a live company each line is posted automatically from the module that creates it, so the books are never retyped.</p>
              <div className="mt-4 divide-y divide-line/70 text-sm">
                {[
                  ['Payroll cost', 'Approved payroll runs', 'Live in BizFlow'],
                  ['Expenses and purchases', 'Approved requests and POs, tagged to a cost centre', 'Live in BizFlow'],
                  ['Vendor payables', 'Vendor invoices matched to POs', 'Live in BizFlow'],
                  ['Manual journals', 'Maker-checker journal register', 'Live in BizFlow'],
                  ['Cash and bank', 'Bank statement upload or bank feed', 'Needs setup'],
                  ['Revenue and receivables', 'Customer invoices from CRM or an import', 'Needs setup'],
                  ['Opening balances and chart of accounts', 'One-time import from the previous ledger', 'Needs setup'],
                  ['Budgets', 'Annual budget per cost centre', 'Needs setup'],
                ].map(([a, b, c]) => <div key={a} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"><div className="min-w-0"><b>{a}</b><div className="text-xs text-slate">{b}</div></div><Badge tone={c === 'Needs setup' ? 'amber' : 'green'}>{c}</Badge></div>)}
              </div>
              <p className="mt-3 rounded-lg bg-softmint px-3 py-2.5 text-xs text-slate"><b className="text-ink">For better data:</b> import opening balances, connect a bank feed, issue invoices from BizFlow, set cost-centre budgets, and close each month so figures are locked and comparable.</p>
            </Panel>
            <div className="grid gap-6 lg:grid-cols-3">
              <Panel title="What changed this month"><div className="space-y-4 text-sm"><div className="flex gap-3"><ArrowUpRight size={17} className="mt-0.5 text-ok" /><div><b>Revenue increased 8.8%</b><p className="text-xs text-slate">{paymentCompany ? 'Merchant settlement and enterprise channel growth.' : 'Higher delivery volume and new contracts.'}</p></div></div><div className="flex gap-3"><ArrowUpRight size={17} className="mt-0.5 text-warn" /><div><b>Technology spend above plan</b><p className="text-xs text-slate">Licence renewal moved this cost centre to 105% utilization.</p></div></div><div className="flex gap-3"><ArrowDownRight size={17} className="mt-0.5 text-ok" /><div><b>Receivable days improved</b><p className="text-xs text-slate">Average collection reduced from 38 to 34 days.</p></div></div></div></Panel>
              <Panel title="Close readiness"><div className="flex items-end justify-between"><Stat label="October close" value="67%" sub="8 of 12 checks complete" /><Badge tone="amber">In progress</Badge></div><div className="mt-5 space-y-2 text-sm"><div className="flex justify-between"><span>Bank reconciliation</span><Badge tone="green">Complete</Badge></div><div className="flex justify-between"><span>Payroll accrual</span><Badge tone="amber">Pending</Badge></div><div className="flex justify-between"><span>Receivable ageing</span><Badge tone="green">Complete</Badge></div><div className="flex justify-between"><span>Management review</span><Badge tone="gray">Not started</Badge></div></div></Panel>
              <Panel title="Attention needed"><div className="space-y-3">{[['3 unreconciled items', '₦1.24M combined value', 'red'], ['2 invoices overdue', 'Oldest is 18 days past due', 'amber'], ['1 journal awaiting approval', 'October payroll accrual', 'blue']].map(([title, detail, tone]) => <div key={title} className="rounded-lg border border-line p-3"><div className="flex justify-between gap-2 text-sm font-semibold"><span>{title}</span><Badge tone={tone}>{tone === 'red' ? 'High' : 'Review'}</Badge></div><div className="mt-1 text-xs text-slate">{detail}</div></div>)}</div></Panel>
            </div>
          </div>
        )}
        {tab === 'Profit & Loss' && (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]"><Panel pad={false} title={`Profit and loss · ${period}`}><Table right={[1, 2, 3]} head={['Line', 'October', 'September', 'Variance']} rows={[['Service revenue', ngn(56900000), ngn(52300000), <span key="1" className="text-ok">+8.8%</span>], ['Direct costs', ngn(-18400000), ngn(-17600000), <span key="2" className="text-err">+4.5%</span>], [<b key="g">Gross profit</b>, <b key="g2">{ngn(38500000)}</b>, ngn(34700000), <b key="g3" className="text-ok">+11.0%</b>], ['Payroll', ngn(-18420000), ngn(-17980000), <span key="3" className="text-err">+2.4%</span>], ['Technology and operations', ngn(-4380000), ngn(-4250000), <span key="4" className="text-err">+3.1%</span>], [<b key="n">Operating profit</b>, <b key="n2">{ngn(15700000)}</b>, ngn(12470000), <b key="n3" className="text-ok">+25.9%</b>]]} /></Panel><Panel title="P&L analysis"><div className="space-y-5"><Stat label="Revenue growth" value="8.8%" delta="4.6M" sub="Month on month" /><Stat label="Gross margin" value="67.7%" delta="1.3 pts" /><Stat label="Operating margin" value="27.6%" delta="3.8 pts" /><p className="rounded-lg bg-softmint p-3 text-sm text-slate">Profit grew faster than revenue because direct costs increased at a slower rate. Technology renewals remain the main cost pressure.</p></div></Panel></div>
        )}
        {tab === 'Cash flow' && (
          <div className="space-y-6"><div className="grid gap-6 lg:grid-cols-3"><Panel><Stat label="Operating activities" value={ngn(15700000)} delta="25.6%" /></Panel><Panel><Stat label="Investing activities" value={ngn(-4800000)} sub="Equipment and software" /></Panel><Panel><Stat label="Financing activities" value={ngn(-2100000)} sub="Lease and debt payments" /></Panel></div><Panel title="Cash generation trend · ₦M"><div className="h-64"><ResponsiveContainer><BarChart data={FINANCIAL_TREND}><CartesianGrid vertical={false} stroke="var(--color-line)" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip formatter={(value) => `₦${value}M`} /><Bar dataKey="cash" name="Operating cash" fill="var(--color-teal)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel><Panel pad={false} title="Cash movement"><Table right={[1]} head={['Movement', 'Amount']} rows={[['Opening cash balance', ngn(119600000)], ['Cash received from customers', ngn(52700000)], ['Supplier and operating payments', ngn(-21800000)], ['Payroll and statutory payments', ngn(-18400000)], ['Capital expenditure', ngn(-3700000)], ['Closing cash balance', <b key="c">{ngn(128400000)}</b>]]} /></Panel></div>
        )}
        {tab === 'Balance sheet' && (
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]"><Panel pad={false} title={`Balance sheet · ${period}`}><Table right={[1]} head={['Account group', 'Balance']} rows={[['Cash and bank', ngn(128400000)], ['Accounts receivable', ngn(31700000)], ['Fixed assets', ngn(64300000)], [<b key="a">Total assets</b>, <b key="aa">{ngn(224400000)}</b>], ['Accounts payable', ngn(22800000)], ['Tax and payroll liabilities', ngn(5526000)], ['Long-term obligations', ngn(46100000)], [<b key="l">Total liabilities</b>, <b key="ll">{ngn(74426000)}</b>], [<b key="e">Equity</b>, <b key="ee">{ngn(149974000)}</b>]]} /></Panel><Panel title="Position analysis"><div className="space-y-5"><Stat label="Current ratio" value="5.8×" sub="Strong short-term coverage" /><Stat label="Debt to equity" value="0.31×" sub="Conservative leverage" /><Stat label="Asset utilization" value="25.4%" sub="Monthly revenue / assets" /><div className="rounded-lg bg-softmint p-3 text-sm text-slate">Liquidity is strong. Receivables remain the largest controllable working-capital opportunity.</div></div></Panel></div>
        )}
        {tab === 'Trial balance' && (
          <div className="space-y-6"><div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-white p-4"><span className="rounded-lg bg-softmint p-2 text-teal"><CheckCircle2 size={19} /></span><div className="min-w-0 flex-1"><div className="text-sm font-semibold">Ledger is balanced</div><p className="text-xs text-slate">Total debits equal total credits for {period}. This confirms arithmetic balance, while account review confirms classification and accuracy.</p></div><Badge tone="green">Debit = Credit</Badge></div><Panel pad={false} title={`Trial balance · ${period}`}><Table right={[2, 3]} head={['Code', 'Account', 'Debit', 'Credit']} rows={[...TB.map((row) => [row[0], row[1], row[2] ? ngn(row[2]) : '—', row[3] ? ngn(row[3]) : '—']), [<b key="t">Total</b>, '', <b key="d">{ngn(dr)}</b>, <b key="c">{ngn(cr)}</b>]]} /></Panel></div>
        )}
        {tab === 'Journal' && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
              <Panel title="What is a journal entry?"><div className="flex gap-4"><span className="rounded-lg bg-softmint p-2.5 text-teal"><BookOpenCheck size={22} /></span><div><p className="text-sm text-slate">A journal is the accounting record that explains how a business event changes the ledger. Every entry has at least one <b className="text-ink">debit</b> and one <b className="text-ink">credit</b>, and the totals must always balance.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-line p-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate">Debit</div><div className="mt-1 text-sm font-semibold">Payroll expense increases</div><div className="mt-1 text-xs text-slate">Records the cost to the business.</div></div><div className="rounded-lg border border-line p-3"><div className="text-xs font-semibold uppercase tracking-wide text-slate">Credit</div><div className="mt-1 text-sm font-semibold">Payroll payable increases</div><div className="mt-1 text-xs text-slate">Records what the business owes employees.</div></div></div></div></div></Panel>
              <Panel title="Journal controls"><div className="space-y-3 text-sm"><div className="flex items-center justify-between"><span>Debit equals credit</span><Badge tone="green">Required</Badge></div><div className="flex items-center justify-between"><span>Maker and checker separated</span><Badge tone="green">Enforced</Badge></div><div className="flex items-center justify-between"><span>Supporting reference</span><Badge tone="green">Required</Badge></div><div className="flex items-center justify-between"><span>Posted period changes</span><Badge tone="amber">Approval needed</Badge></div></div><p className="mt-4 text-xs text-slate">Draft entries do not affect reports. Posted entries update the ledger. Locked entries belong to a closed period and cannot be edited.</p></Panel>
            </div>
            <Panel pad={false} title="Journal register"><Table right={[4]} head={['Entry', 'Date', 'Description', 'Maker → Checker', 'Amount', 'State', 'Action']} rows={JOURNALS.map((entry) => [<span key="i" className="font-mono font-semibold text-teal">{entry.id}</span>, entry.date, <span key="d" className="font-semibold">{entry.description}<span className="block text-xs font-normal text-slate">{entry.source}</span></span>, `${entry.maker} → ${entry.checker}`, ngn(entry.amount), <Badge key="s">{entry.status}</Badge>, <Btn key="v" s="sm" v="ghost" onClick={() => setSelectedJournal(entry.id)}>View</Btn>])} /></Panel>
          </div>
        )}
        {tab === 'Payables' && <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3"><Panel><Stat label="Total outstanding" value={ngn(22800000)} sub="14 supplier bills" /></Panel><Panel><Stat label="Due in 7 days" value={ngn(7800000)} sub="5 scheduled payments" /></Panel><Panel><Stat label="Overdue" value={ngn(1180000)} delta="1 invoice" up={false} /></Panel></div><Panel pad={false} title="Supplier obligations"><Table right={[2]} head={['Vendor', 'Bill', 'Amount', 'Due', 'State']} rows={[['Computer Warehouse Ltd', 'INV-8821', ngn(2640000), '20 Oct', <Badge key="a">Pending Approval</Badge>], ['Sahara Fuel Depot', 'INV-0412', ngn(1180000), '12 Oct', <Badge key="b" tone="red">Overdue</Badge>], ['Cloud Systems Nigeria', 'INV-2204', ngn(4850000), '28 Oct', <Badge key="c" tone="blue">Scheduled</Badge>]]} /></Panel></div>}
        {tab === 'Receivables' && <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-3"><Panel><Stat label="Total receivables" value={ngn(31700000)} sub="18 customer invoices" /></Panel><Panel><Stat label="Overdue" value={ngn(4100000)} delta="13% of total" up={false} /></Panel><Panel><Stat label="Average collection" value="34 days" delta="4 days faster" /></Panel></div><Panel pad={false} title="Customer receivables"><Table right={[2]} head={['Customer', 'Invoice', 'Amount', 'Due', 'Status']} rows={[['Ikoyi Gardens Facilities', 'INV-2026-0187', ngn(7400000), '15 Oct', <Badge key="a">Pending</Badge>], ['Nile Distribution Distribution', 'INV-2026-0174', ngn(4100000), '28 Sep', <Badge key="b">Overdue</Badge>], ['Zenith Cold Chain', 'INV-2026-0194', ngn(6200000), '30 Oct', <Badge key="c" tone="blue">Not due</Badge>]]} /></Panel><CrmReceivables slug={tenant?.slug ?? 'etranzact'} today={new Date().toISOString().slice(0, 10)} /></div>}
        {tab === 'Cost centres' && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Panel><Stat label="Total budget" value={ngn(totalBudget)} sub={`${costCentres.length} active cost centres`} /></Panel><Panel><Stat label="Actual spend" value={ngn(totalActual)} sub={`${Math.round((totalActual / totalBudget) * 100)}% utilized`} /></Panel><Panel><Stat label="Budget remaining" value={ngn(budgetRemaining)} sub="Available through month-end" /></Panel><Panel><Stat label="Over budget" value={String(costCentres.filter((centre) => centre.actual > centre.budget).length)} sub="Cost centres requiring review" /></Panel></div>
            <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <Panel title="Budget versus actual · ₦M"><div className="h-72"><ResponsiveContainer><BarChart data={costCentres.map((centre) => ({ name: centre.name.split(' ')[0], budget: +(centre.budget / 1000000).toFixed(1), actual: +(centre.actual / 1000000).toFixed(1) }))}><CartesianGrid vertical={false} stroke="var(--color-line)" /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip formatter={(value) => `₦${value}M`} /><Bar dataKey="budget" name="Budget" fill="var(--color-line)" radius={[4, 4, 0, 0]} /><Bar dataKey="actual" name="Actual" fill="var(--color-teal)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
              <Panel title="Management insights"><div className="space-y-4">{costCentres.filter((centre) => centre.actual > centre.budget).map((centre) => <div key={centre.code} className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="flex justify-between text-sm font-semibold"><span>{centre.name}</span><Badge tone="amber">Over budget</Badge></div><p className="mt-1 text-xs text-slate">{ngn(centre.actual - centre.budget)} above plan · Owner: {centre.owner}</p></div>)}<div className="rounded-lg border border-line p-3"><div className="text-sm font-semibold">Best budget control</div><p className="mt-1 text-xs text-slate">{[...costCentres].sort((a, b) => (a.actual / a.budget) - (b.actual / b.budget))[0].name} has the lowest utilization at {Math.round(([...costCentres].sort((a, b) => (a.actual / a.budget) - (b.actual / b.budget))[0].actual / [...costCentres].sort((a, b) => (a.actual / a.budget) - (b.actual / b.budget))[0].budget) * 100)}%.</p></div><div className="rounded-lg bg-softmint p-3 text-sm text-slate">At the current run rate, total company spend is forecast to finish {budgetRemaining >= 0 ? ngn(budgetRemaining) + ' below' : ngn(-budgetRemaining) + ' above'} the monthly budget.</div></div></Panel>
            </div>
            <Panel pad={false} title="Cost-centre performance"><Table right={[3, 4, 5, 6]} head={['Cost centre', 'Owner', 'Budget', 'Actual', 'Variance', 'Utilization', 'Trend', 'Status']} rows={costCentres.map((centre) => { const variance = centre.budget - centre.actual; const utilization = Math.round((centre.actual / centre.budget) * 100); return [<span key="c" className="font-semibold">{centre.name}<span className="block font-mono text-xs font-normal text-slate">{centre.code}</span></span>, centre.owner, ngn(centre.budget), ngn(centre.actual), <span key="v" className={variance < 0 ? 'text-err' : 'text-ok'}>{variance < 0 ? '−' : '+'}{ngn(Math.abs(variance))}</span>, `${utilization}%`, <span key="t" className={centre.trend > 5 ? 'text-err' : centre.trend < 0 ? 'text-ok' : 'text-slate'}>{centre.trend > 0 ? '+' : ''}{centre.trend}%</span>, <Badge key="s" tone={utilization > 100 ? 'red' : utilization > 90 ? 'amber' : 'green'}>{utilization > 100 ? 'Over budget' : utilization > 90 ? 'Watch' : 'On track'}</Badge>] })} /></Panel>
            <Panel title="How cost centres help decisions"><div className="grid gap-5 text-sm md:grid-cols-3"><div><div className="font-semibold">Accountability</div><p className="mt-1 text-slate">Each centre has an owner responsible for budget, actual spend and explaining material variances.</p></div><div><div className="font-semibold">Allocation</div><p className="mt-1 text-slate">Shared expenses can be split by headcount, usage, transaction volume or an agreed percentage.</p></div><div><div className="font-semibold">Action thresholds</div><p className="mt-1 text-slate">90% utilization triggers a watch status. Spending above budget requires Finance review and an owner instruction.</p></div></div></Panel>
          </div>
        )}
      </div>
      <Overlay open={!!selectedEntry} onClose={() => setSelectedJournal('')} title={selectedEntry ? `${selectedEntry.id} · Journal detail` : 'Journal detail'} side wide>
        {selectedEntry && <div className="space-y-6"><div className="rounded-lg bg-softmint p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-wide text-slate">{selectedEntry.source}</div><div className="mt-1 text-lg font-semibold">{selectedEntry.description}</div></div><Badge>{selectedEntry.status}</Badge></div></div><div className="grid gap-4 sm:grid-cols-2"><Panel><div className="text-xs text-slate">Debit</div><div className="mt-1 font-semibold">{selectedEntry.debit}</div><div className="num mt-2 text-lg font-semibold">{ngn(selectedEntry.amount)}</div><p className="mt-2 text-xs text-slate">The account receiving value or expense.</p></Panel><Panel><div className="text-xs text-slate">Credit</div><div className="mt-1 font-semibold">{selectedEntry.credit}</div><div className="num mt-2 text-lg font-semibold">{ngn(selectedEntry.amount)}</div><p className="mt-2 text-xs text-slate">The funding, liability or revenue account.</p></Panel></div><Panel title="Control trail"><div className="space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate">Maker</span><b>{selectedEntry.maker}</b></div><div className="flex justify-between"><span className="text-slate">Checker</span><b>{selectedEntry.checker}</b></div><div className="flex justify-between"><span className="text-slate">Entry date</span><b>{selectedEntry.date}</b></div><div className="flex justify-between"><span className="text-slate">Balance check</span><Badge tone="green">Debit = Credit</Badge></div></div></Panel><div className="flex justify-end"><Btn onClick={() => setSelectedJournal('')}>Close journal</Btn></div></div>}
      </Overlay>
    </div>
  )
}
