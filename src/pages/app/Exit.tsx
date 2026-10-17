import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { useRole } from '../../components/app/AppLayout'
import { Avatar, Badge, Breadcrumb, Btn, EmptyState, Field, Fold, inputCls, Overlay, Panel, PageHeader, Stat, Stepper, Table, Tabs, Timeline, useToast } from '../../components/ui'
import { employeesForTenant } from '../../data/demo'
import { useTenant } from '../../tenant/store'
import { useTasks, updateTask } from '../../tasks/store'
import type { Task } from '../../tasks/store'
import { useLeads, updateLead } from '../../crm/store'
import type { Lead } from '../../crm/store'
import ExitForm from '../../exit/ExitForm'
import {
  ASSET_STATES, EXIT_STATUSES, EXIT_TYPES, RATINGS, REASONS, REHIRE, TODAY, ackHandover, acceptExit, addRecovery, approveSettlement, assignItem, blockers, cancelExit, completeExit, daysBetween,
  fmtDateX, historyFor, ngnx, recordMove, removeRecovery, saveInterview, setAsset, setHandoverNotes, setRecovery, setStatus, setSuccessor, settle, shortfallDays, servedDays, signOff, stepsDone,
  tenureBucket, tenureYears, toggleAccess, updateDetails, updateSettlement, useExits,
} from '../../exit/store'
import type { ExitCase, Interview } from '../../exit/store'

const STEPS = ['Details', 'Handover', 'Assets & recovery', 'Clearance', 'Final pay', 'Exit interview', 'Close']
const TONE: Record<string, string> = { Initiated: 'amber', 'In clearance': 'blue', 'Final pay review': 'teal', Completed: 'green', Cancelled: 'gray', Cleared: 'green', Blocked: 'red', Pending: 'amber' }
const textarea = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-slate/70 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 disabled:bg-cloud'
const ACTIVE = ['Initiated', 'In clearance', 'Final pay review']
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function Bar({ value, max, color = 'bg-teal' }: { value: number; max: number; color?: string }) {
  return <div className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]"><div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} /></div>
}
/** Number input that commits on blur so typing is not interrupted. */
function Num({ value, onCommit, label, min = 0, className = '' }: { value: number; onCommit: (n: number) => void; label: string; min?: number; className?: string }) {
  const [v, setV] = useState<string | null>(null)
  return <input aria-label={label} type="number" min={min} className={`${inputCls} ${className}`} value={v ?? String(value)} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== null) { const n = Math.max(min, Number(v) || 0); if (n !== value) onCommit(n); setV(null) } }} />
}
function Txt({ value, onCommit, label, rows = 0, placeholder }: { value: string; onCommit: (s: string) => void; label: string; rows?: number; placeholder?: string }) {
  const [v, setV] = useState<string | null>(null)
  const done = () => { if (v !== null) { if (v !== value) onCommit(v); setV(null) } }
  return rows
    ? <textarea aria-label={label} rows={rows} className={textarea} value={v ?? value} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={done} />
    : <input aria-label={label} className={inputCls} value={v ?? value} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={done} />
}
const Row = ({ k, v, strong = false, tone = '' }: { k: ReactNode; v: ReactNode; strong?: boolean; tone?: string }) => (
  <div className={`flex items-baseline justify-between gap-4 py-2 text-sm ${strong ? 'border-t border-line font-semibold' : ''}`}><span className="text-slate">{k}</span><span className={`num text-right ${tone}`}>{v}</span></div>
)

/* ---------- printable documents ---------- */
function openPrint(html: string, name: string) {
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300); return }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = `${name}.html`; a.click()
}
const STYLE = '<style>body{font:14px/1.6 Inter,Arial,sans-serif;max-width:760px;margin:40px auto;color:#102A30;padding:0 20px}h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;margin-top:24px}table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #D9E2E4;padding:7px 10px;text-align:left}td.n,th.n{text-align:right}.tot td{font-weight:700;background:#F2F7F7}.muted{color:#60777D;font-size:12px}@media print{button{display:none}}</style>'
function statementHtml(c: ExitCase, company: string) {
  const s = settle(c)
  const line = (k: string, v: number, neg = false) => `<tr><td>${esc(k)}</td><td class="n">${neg ? '-' : ''}${esc(ngnx(v))}</td></tr>`
  return `<!doctype html><meta charset="utf-8"><title>Final settlement ${esc(c.id)}</title>${STYLE}
<button onclick="print()" style="float:right;padding:8px 14px">Print</button>
<h1>Final settlement statement</h1><p class="muted">${esc(company)} · ${esc(c.id)} · prepared ${esc(fmtDateX(TODAY))}</p>
<table><tr><th>Employee</th><td>${esc(c.name)} (${esc(c.employeeId)})</td><th>Role</th><td>${esc(c.role)}</td></tr><tr><th>Department</th><td>${esc(c.dept)}</td><th>Exit type</th><td>${esc(c.type)}</td></tr><tr><th>Notice given</th><td>${esc(fmtDateX(c.noticeGiven))}</td><th>Last working day</th><td>${esc(fmtDateX(c.lastWorkingDay))}</td></tr><tr><th>Monthly salary</th><td>${esc(ngnx(c.salary))}</td><th>Notice</th><td>${c.noticeWaived ? 'Shortfall waived' : `${servedDays(c)} of ${c.noticePeriodDays} days served`}</td></tr></table>
<h2>Earnings</h2><table>${line(`Salary for ${s.days} day${s.days === 1 ? '' : 's'} to last working day`, s.prorated)}${line(`Unpaid leave payout (${c.settlement.leaveDays} days)`, s.leavePay)}${s.lieu ? line('Pay in lieu of notice', s.lieu) : ''}${c.settlement.gratuity ? line('Gratuity', c.settlement.gratuity) : ''}${c.settlement.otherPay ? line('Other payments', c.settlement.otherPay) : ''}<tr class="tot"><td>Gross payable</td><td class="n">${esc(ngnx(s.gross))}</td></tr></table>
<h2>Deductions</h2><table>${s.noticeDeduct ? line(`Notice shortfall (${s.short} days)`, s.noticeDeduct, true) : ''}${c.assets.filter((a) => a.recovery > 0 && (a.state === 'Damaged' || a.state === 'Missing')).map((a) => line(`${a.name} (${a.state.toLowerCase()})`, a.recovery, true)).join('')}${c.recoveries.filter((r) => r.recover > 0).map((r) => line(r.label, r.recover, true)).join('')}${c.settlement.tax ? line('PAYE and pension deductions', c.settlement.tax, true) : ''}${c.settlement.otherDeduct ? line('Other deductions', c.settlement.otherDeduct, true) : ''}<tr class="tot"><td>Total deductions</td><td class="n">-${esc(ngnx(s.deductions))}</td></tr></table>
<h2>${s.net >= 0 ? 'Net payable' : 'Amount owed by the employee'}</h2><table><tr class="tot"><td>${s.net >= 0 ? 'Net payable to employee' : 'Balance to be repaid'}</td><td class="n">${esc(ngnx(Math.abs(s.net)))}</td></tr></table>
${c.settlement.note ? `<p><b>Note:</b> ${esc(c.settlement.note)}</p>` : ''}
<p class="muted">PAYE is computed by payroll on taxable pay and employee and employer pension contributions are remitted to the employee's PFA in line with the Pension Reform Act.</p>
<p>${c.settlement.approval ? `Approved for payment by ${esc(c.settlement.approval.by)} on ${esc(fmtDateX(c.settlement.approval.at))}.` : 'Draft. Not yet approved by Finance.'}</p>
<table style="margin-top:40px"><tr><td style="height:60px">Employee signature</td><td>Finance approval</td><td>HR</td></tr></table>`
}
function downloadLetter(c: ExitCase, company: string) {
  const body = `${company}\n${fmtDateX(TODAY)}\n\nTO WHOM IT MAY CONCERN\n\nCLEARANCE AND EXPERIENCE LETTER: ${c.name.toUpperCase()}\n\nThis is to confirm that ${c.name} (${c.employeeId}) served ${company} as ${c.role} in the ${c.dept} department until ${fmtDateX(c.lastWorkingDay)}.\n\nHaving completed handover, returned company property and been cleared by every department, ${c.name.split(' ')[0]} has no outstanding obligation to the company other than those recorded in the final settlement.\n\nDuring this period ${c.name.split(' ')[0]} was ${c.type === 'Termination' ? 'employed under the terms of the employment contract' : 'a valued member of the team'}. We wish ${c.name.split(' ')[0]} well in future endeavours.\n\nYours faithfully,\n\nHuman Resources\n${company}\nReference: ${c.id}\n`
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' })); a.download = `${c.id} clearance and experience letter.txt`; a.click()
}

/* ---------- page ---------- */
export default function Exit() {
  const { r, can } = useRole()
  const tenant = useTenant()
  const slug = tenant?.slug ?? 'etranzact'
  const canManage = can('people.manage') || can('people.create')
  const cases = useExits(slug)
  const tasks = useTasks()
  const leads = useLeads(slug)
  const employees = employeesForTenant(slug)
  const [sp, setSp] = useSearchParams()
  const [tab, setTab] = useState('Cases')
  const [q, setQ] = useState('')
  const [status, setStatus_] = useState('All')
  const [adding, setAdding] = useState(false)
  const openId = sp.get('case')
  const open = openId ? cases.find((c) => c.id === openId) : undefined

  const work = (name: string) => ({
    tasks: tasks.filter((t) => t.tenant === slug && t.scope === 'Business' && t.status !== 'Done' && t.assignees.includes(name)),
    leads: leads.filter((l) => l.owner === name && l.stage !== 'Lost'),
  })
  const progress = (c: ExitCase) => { const w = work(c.name); return stepsDone(c, w.tasks.length, w.leads.length).filter(Boolean).length }

  if (!canManage && !cases.some((c) => c.manager === r.user)) {
    return <div><PageHeader eyebrow="People" title="Staff exit" /><Panel><EmptyState title="HR access only" body="Staff exit cases are managed by HR and company administrators." /></Panel></div>
  }
  if (open) {
    return <CaseView c={open} onBack={() => { sp.delete('case'); setSp(sp) }} work={work(open.name)} company={tenant?.profile.name ?? 'BizFlow'} employees={employees} slug={slug} />
  }

  const active = cases.filter((c) => ACTIVE.includes(c.status))
  const done = cases.filter((c) => c.status === 'Completed' && c.completedAt)
  const avgClear = done.length ? Math.round(done.reduce((a, c) => a + daysBetween(c.created, c.completedAt!.slice(0, 10)), 0) / done.length) : 0
  const owing = active.filter((c) => !c.settlement.paidOn)
  const owed = owing.reduce((a, c) => a + Math.max(0, settle(c).net), 0)
  const year = TODAY.slice(0, 4)
  const exitsYtd = historyFor(slug).filter((h) => h.month.startsWith(year)).length + cases.filter((c) => c.status !== 'Cancelled' && c.created.startsWith(year)).length
  const headcount = employees.length + done.length
  const shown = cases.filter((c) => (status === 'All' || c.status === status) && (!q || `${c.name} ${c.dept} ${c.id} ${c.type}`.toLowerCase().includes(q.toLowerCase())))
  const open_ = (id: string) => { sp.set('case', id); setSp(sp) }

  return (
    <div>
      <PageHeader eyebrow="People" title="Staff exit" desc="Resignations, terminations and retirements from notice to final pay: handover, recovery, clearance and settlement in one place." actions={canManage ? <Btn onClick={() => setAdding(true)}>Initiate exit</Btn> : undefined} />
      <section aria-label="Exit summary" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Panel><Stat label="Active exits" value={String(active.length)} sub={`${cases.filter((c) => c.status === 'Initiated' && !c.accepted).length} awaiting acceptance`} /></Panel>
        <Panel><Stat label="Avg days to clear" value={done.length ? `${avgClear}` : '-'} sub={done.length ? `${done.length} completed exit${done.length === 1 ? '' : 's'}` : 'No completed exits'} /></Panel>
        <Panel><Stat label="Pending final pay" value={ngnx(owed)} sub={`${owing.length} settlement${owing.length === 1 ? '' : 's'} unpaid`} /></Panel>
        <Panel><Stat label="Attrition this year" value={`${pct(exitsYtd, headcount)}%`} sub={`${exitsYtd} of ${headcount} staff`} /></Panel>
      </section>
      <Tabs tabs={['Cases', 'Insights']} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'Cases' && (
          <Panel pad={false}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:p-4">
              <input aria-label="Search exits" className={`${inputCls} sm:max-w-xs`} placeholder="Search name, department or ID" value={q} onChange={(e) => setQ(e.target.value)} />
              <select aria-label="Filter by status" className={`${inputCls} sm:max-w-[11rem]`} value={status} onChange={(e) => setStatus_(e.target.value)}>{['All', ...EXIT_STATUSES].map((s) => <option key={s}>{s}</option>)}</select>
            </div>
            {shown.length === 0 ? <EmptyState title="No exits found" body="Initiate an exit or change the filters." action={canManage ? <Btn s="sm" onClick={() => setAdding(true)}>Initiate exit</Btn> : undefined} /> : (
              <Table label="Exit cases" head={['Employee', 'Type', 'Status', 'Last working day', 'Progress', 'Case']} pageSize={8} rows={shown.map((c) => [
                <button key="n" onClick={() => open_(c.id)} className="flex cursor-pointer items-center gap-2 text-left font-semibold text-ink hover:text-teal"><Avatar name={c.name} size={26} /><span>{c.name}<span className="block text-xs font-normal text-slate">{c.dept}</span></span></button>,
                c.type,
                <Badge key="s" tone={TONE[c.status]}>{!c.accepted && c.status === 'Initiated' ? 'Awaiting acceptance' : c.status}</Badge>,
                fmtDateX(c.lastWorkingDay),
                <span key="p" className="flex min-w-[7rem] items-center gap-2"><span className="w-20"><Bar value={progress(c)} max={7} /></span><span className="text-xs text-slate">{progress(c)}/7</span></span>,
                <button key="o" onClick={() => open_(c.id)} className="cursor-pointer font-semibold text-teal">{c.id}</button>,
              ])} />
            )}
          </Panel>
        )}
        {tab === 'Insights' && <Insights slug={slug} cases={cases} />}
      </div>
      <ExitForm open={adding} onClose={() => setAdding(false)} slug={slug} employees={employees} by={r.user} onDone={(c) => open_(c.id)} />
    </div>
  )
}

/* ---------- insights ---------- */
function Insights({ slug, cases }: { slug: string; cases: ExitCase[] }) {
  const rows = useMemo(() => [
    ...historyFor(slug).map((h) => ({ dept: h.dept, reason: h.reason, tenure: h.tenure, regretted: h.regretted })),
    ...cases.filter((c) => c.status !== 'Cancelled').map((c) => ({ dept: c.dept, reason: c.reasonCat, tenure: tenureYears({ id: c.employeeId }), regretted: c.regretted })),
  ], [slug, cases])
  const group = (f: (x: (typeof rows)[number]) => string) => Object.entries(rows.reduce<Record<string, number>>((m, x) => { m[f(x)] = (m[f(x)] ?? 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1])
  const regret = rows.filter((x) => x.regretted).length
  const avgTen = rows.length ? (rows.reduce((a, x) => a + x.tenure, 0) / rows.length).toFixed(1) : '0'
  const Block = ({ title, data, color }: { title: string; data: [string, number][]; color?: string }) => (
    <Panel title={title}>
      <ul className="space-y-3">{data.map(([k, n]) => <li key={k}><div className="mb-1 flex justify-between text-sm"><span>{k}</span><span className="num font-semibold">{n} <span className="font-normal text-slate">({pct(n, rows.length)}%)</span></span></div><Bar value={n} max={data[0]?.[1] ?? 1} color={color} /></li>)}</ul>
    </Panel>
  )
  const buckets = ['< 1 yr', '1-2 yrs', '3-5 yrs', '6+ yrs'].map((b) => [b, rows.filter((x) => tenureBucket(x.tenure) === b).length] as [string, number])
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Panel><Stat label="Exits on record" value={String(rows.length)} sub="This year, incl. open cases" /></Panel>
        <Panel><Stat label="Regretted exits" value={`${pct(regret, rows.length)}%`} sub={`${regret} of ${rows.length}`} /></Panel>
        <Panel><Stat label="Average tenure" value={`${avgTen} yrs`} sub="At exit" /></Panel>
        <Panel><Stat label="Top reason" value={group((x) => x.reason)[0]?.[0] ?? '-'} sub="Most cited" /></Panel>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Block title="Attrition by department" data={group((x) => x.dept)} />
        <Block title="Attrition by reason" data={group((x) => x.reason)} color="bg-info" />
        <Block title="Attrition by tenure" data={buckets} color="bg-warn" />
        <Panel title="Regretted versus not regretted">
          <div className="flex h-4 overflow-hidden rounded-full bg-ink/[0.06]"><div className="bg-err" style={{ width: `${pct(regret, rows.length)}%` }} /><div className="bg-teal" style={{ width: `${100 - pct(regret, rows.length)}%` }} /></div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm"><span><span className="mr-1.5 inline-block size-2.5 rounded-full bg-err" />Regretted <b className="num">{regret}</b></span><span><span className="mr-1.5 inline-block size-2.5 rounded-full bg-teal" />Not regretted <b className="num">{rows.length - regret}</b></span></div>
          <p className="mt-3 text-xs text-slate">HR marks an exit as regretted on the case details. Regretted exits among high performers are worth a retention review.</p>
        </Panel>
      </div>
    </div>
  )
}

/* ---------- case detail ---------- */
type Ctx = { c: ExitCase; by: string; canManage: boolean; canFinance: boolean; locked: boolean; employees: ReturnType<typeof employeesForTenant>; tasks: Task[]; leads: Lead[]; slug: string; company: string; go: (n: number) => void; steps: boolean[] }

function CaseView({ c, onBack, work, company, employees, slug }: { c: ExitCase; onBack: () => void; work: { tasks: Task[]; leads: Lead[] }; company: string; employees: ReturnType<typeof employeesForTenant>; slug: string }) {
  const { r, can } = useRole()
  const toast = useToast()
  const canManage = can('people.manage') || can('people.create')
  const canFinance = can('payroll.approve')
  const [step, setStep] = useState(0)
  const [cancelling, setCancelling] = useState(false)
  const [why, setWhy] = useState('')
  const locked = c.status === 'Completed' || c.status === 'Cancelled'
  const steps = stepsDone(c, work.tasks.length, work.leads.length)
  const firstOpen = steps.findIndex((x) => !x)
  const canAccept = canManage || r.user === c.manager
  const ctx: Ctx = { c, by: r.user, canManage, canFinance, locked, employees, tasks: work.tasks, leads: work.leads, slug, company, go: setStep, steps }
  const gate = !c.accepted && !locked

  return (
    <div>
      <Breadcrumb items={[['Staff exit', '/admin/business/exit'], [c.name]]} />
      <PageHeader eyebrow={`${c.id} · ${c.type}`} title={c.name} desc={`${c.role} · ${c.dept} · last working day ${fmtDateX(c.lastWorkingDay)}`}
        actions={<><Btn v="secondary" onClick={onBack}>All exits</Btn>{!locked && canManage && <Btn v="ghost" className="!text-err" onClick={() => setCancelling(true)}>Cancel exit</Btn>}</>} />
      <div className="mb-4 flex flex-wrap items-center gap-2"><Badge tone={TONE[c.status]}>{c.status}</Badge>{c.selfSubmitted && <Badge tone="blue">Submitted by employee</Badge>}<Badge tone={c.rehire === 'Eligible' ? 'green' : c.rehire === 'Review' ? 'amber' : 'red'}>Rehire: {c.rehire}</Badge>{c.status === 'Cancelled' && c.cancelReason && <span className="text-sm text-slate">Reason: {c.cancelReason}</span>}</div>
      {gate && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-sm text-amber-900"><b>Resignation awaiting acceptance.</b> {c.name} submitted this on {fmtDateX(c.created)}. Clearance opens once HR or the line manager accepts it.</div>
          {canAccept ? <div className="flex gap-2"><Btn s="sm" onClick={() => { acceptExit(c.id, r.user); toast('Resignation accepted. Clearance is open.') }}>Accept resignation</Btn><Btn s="sm" v="secondary" onClick={() => setCancelling(true)}>Decline</Btn></div> : <Badge tone="amber">Waiting for HR</Badge>}
        </div>
      )}
      <div className="mb-3 overflow-x-auto pb-1"><Stepper steps={STEPS} at={locked ? STEPS.length : firstOpen < 0 ? STEPS.length - 1 : firstOpen} /></div>
      <Tabs tabs={STEPS.map((s, i) => `${s}${steps[i] ? ' ✓' : ''}`)} value={`${STEPS[step]}${steps[step] ? ' ✓' : ''}`} onChange={(t) => setStep(Math.max(0, STEPS.findIndex((s) => t.startsWith(s))))} />
      <div className="mt-5 space-y-5">
        <fieldset disabled={locked || (gate && step > 0)} className="min-w-0 space-y-5 disabled:opacity-90">
          {step === 0 && <DetailsStep {...ctx} />}
          {step === 1 && <HandoverStep {...ctx} />}
          {step === 2 && <AssetsStep {...ctx} />}
          {step === 3 && <ClearanceStep {...ctx} />}
          {step === 4 && <PayStep {...ctx} />}
          {step === 5 && <InterviewStep {...ctx} />}
        </fieldset>
        {step === 6 && <CloseStep {...ctx} work={work} />}
        {gate && step > 0 && <p className="text-sm text-slate">Accept the resignation to start working on this step.</p>}
        <div className="flex justify-between gap-2 border-t border-line pt-4">
          <Btn v="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Btn>
          <Btn disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)}>Continue to {STEPS[Math.min(step + 1, STEPS.length - 1)].toLowerCase()}</Btn>
        </div>
      </div>
      <Overlay open={cancelling} onClose={() => setCancelling(false)} title={c.accepted ? 'Cancel this exit' : 'Decline this resignation'} alert>
        <p className="text-sm text-slate">{c.accepted ? 'The case is closed and no settlement is paid. The employee stays on the active list.' : 'The request is closed and the employee is told it was not accepted.'}</p>
        <div className="mt-3"><Field label="Reason"><textarea className={textarea} rows={3} value={why} onChange={(e) => setWhy(e.target.value)} /></Field></div>
        <div className="mt-5 flex justify-end gap-2"><Btn v="secondary" onClick={() => setCancelling(false)}>Keep case</Btn><Btn onClick={() => { cancelExit(c.id, r.user, why.trim()); setCancelling(false); toast('Exit cancelled') }}>{c.accepted ? 'Cancel exit' : 'Decline'}</Btn></div>
      </Overlay>
    </div>
  )
}

function DetailsStep({ c, by, employees }: Ctx) {
  const up = (patch: Parameters<typeof updateDetails>[1], text: string) => updateDetails(c.id, patch, by, text)
  const served = servedDays(c), short = shortfallDays(c)
  const emp = employees.find((e) => e.id === c.employeeId)
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Exit details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Exit type"><select className={inputCls} value={c.type} onChange={(e) => up({ type: e.target.value as ExitCase['type'] }, `Changed the exit type to ${e.target.value}`)}>{EXIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Reason category"><select className={inputCls} value={c.reasonCat} onChange={(e) => up({ reasonCat: e.target.value }, `Changed the reason category to ${e.target.value}`)}>{REASONS.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field label="Details"><Txt label="Reason details" rows={3} value={c.reason} onCommit={(v) => up({ reason: v }, 'Updated the reason details')} /></Field></div>
            <Field label="Notice date"><input type="date" className={inputCls} value={c.noticeGiven} onChange={(e) => e.target.value && up({ noticeGiven: e.target.value }, `Changed the notice date to ${fmtDateX(e.target.value)}`)} /></Field>
            <Field label="Notice period (days)"><Num label="Notice period in days" value={c.noticePeriodDays} onCommit={(n) => up({ noticePeriodDays: n }, `Changed the notice period to ${n} days`)} /></Field>
            <Field label="Last working day"><input type="date" className={inputCls} value={c.lastWorkingDay} onChange={(e) => e.target.value && up({ lastWorkingDay: e.target.value }, `Changed the last working day to ${fmtDateX(e.target.value)}`)} /></Field>
            <Field label="Rehire eligibility"><select className={inputCls} value={c.rehire} onChange={(e) => up({ rehire: e.target.value }, `Set rehire eligibility to ${e.target.value}`)}>{REHIRE.map((t) => <option key={t}>{t}</option>)}</select></Field>
          </div>
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-teal" checked={c.noticeWaived} onChange={(e) => up({ noticeWaived: e.target.checked }, e.target.checked ? 'Waived the notice shortfall' : 'Removed the notice waiver')} />Waive the notice shortfall</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-teal" checked={c.regretted} onChange={(e) => up({ regretted: e.target.checked }, e.target.checked ? 'Marked as a regretted exit' : 'Marked as not regretted')} />Regretted exit (we would have wanted to keep them)</label>
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel title="Notice">
            <Row k="Notice period" v={`${c.noticePeriodDays} days`} />
            <Row k="Served by last day" v={`${served} days`} />
            <Row k="Shortfall" v={c.noticeWaived ? 'Waived' : short ? `${short} days` : 'None'} tone={short && !c.noticeWaived ? 'text-err font-semibold' : ''} />
            <p className="mt-1 text-xs text-slate">{c.type === 'Resignation' ? 'A shortfall is deducted from final pay.' : c.type === 'Redundancy' ? 'A shortfall is paid as pay in lieu of notice.' : 'No notice adjustment applies to this exit type.'}</p>
          </Panel>
          <Panel title="Employee">
            <div className="mb-3 flex items-center gap-3"><Avatar name={c.name} size={36} /><div><div className="font-semibold">{c.name}</div><div className="text-xs text-slate">{c.employeeId}</div></div></div>
            <Row k="Role" v={c.role} /><Row k="Department" v={c.dept} /><Row k="Line manager" v={c.manager} /><Row k="Monthly salary" v={ngnx(c.salary)} /><Row k="Status" v={emp?.status ?? (c.status === 'Completed' ? 'Exited' : 'Active')} />
          </Panel>
        </div>
      </div>
      <Fold title="Activity log" hint={`${c.activity.length} entries`} defaultOpen><Panel title="Activity"><Timeline items={c.activity.map((a) => ({ t: new Date(a.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }), a: a.by, x: a.text }))} /></Panel></Fold>
    </>
  )
}

function Reassign({ colleagues, def, onGo, label }: { colleagues: string[]; def: string; onGo: (to: string) => void; label: string }) {
  const [to, setTo] = useState('')
  const v = to || def
  return (
    <span className="flex items-center gap-2"><select aria-label={`Successor for ${label}`} className={`${inputCls} !h-8 min-w-[9rem] !text-[13px]`} value={v} onChange={(e) => setTo(e.target.value)}><option value="">Choose…</option>{colleagues.map((n) => <option key={n}>{n}</option>)}</select><Btn s="sm" disabled={!v} onClick={() => onGo(v)}>Reassign</Btn></span>
  )
}

function HandoverStep({ c, by, employees, tasks, leads }: Ctx) {
  const toast = useToast()
  const h = c.handover
  const colleagues = employees.filter((e) => e.name !== c.name).map((e) => e.name).sort()
  const moveTask = (t: Task, to: string) => {
    updateTask(t.id, { assignees: Array.from(new Set(t.assignees.map((a) => (a === c.name ? to : a)))) }, by)
    recordMove(c.id, { kind: 'Task', ref: t.id, label: t.title, to, by })
  }
  const moveLead = (l: Lead, to: string) => { updateLead(l.id, { owner: to }, by); recordMove(c.id, { kind: 'Lead', ref: l.id, label: l.company, to, by }) }
  const pendingItems = h.items.filter((i) => !i.to).length
  const ready = !!h.successor && !tasks.length && !leads.length && !pendingItems
  const ackBy = by === h.successor ? by : `${h.successor} (recorded by ${by})`
  return (
    <>
      <Panel title="Successor and notes">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
          <Field label="Main successor" hint="Used as the default for every reassignment below."><select className={inputCls} value={h.successor} onChange={(e) => setSuccessor(c.id, e.target.value, by)}><option value="">Choose a colleague…</option>{colleagues.map((n) => <option key={n}>{n}</option>)}</select></Field>
          <Field label="Handover notes"><Txt label="Handover notes" rows={4} value={h.notes} placeholder="Where things are, who to call, what is due in the next 30 days." onCommit={(v) => setHandoverNotes(c.id, v, by)} /></Field>
        </div>
      </Panel>
      <Panel title={`Open tasks (${tasks.length})`} action={tasks.length > 0 && h.successor ? <Btn s="sm" onClick={() => { tasks.forEach((t) => moveTask(t, h.successor)); toast(`${tasks.length} tasks reassigned to ${h.successor}`) }}>Reassign all to {h.successor.split(' ')[0]}</Btn> : undefined}>
        {tasks.length === 0 ? <p className="text-sm text-slate">No open tasks are assigned to {c.name}.</p> : (
          <ul className="divide-y divide-line">{tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><div className="text-sm font-semibold">{t.title}</div><div className="text-xs text-slate">{t.id} · {t.status} · due {fmtDateX(t.due)} · {t.priority}</div></div><Reassign colleagues={colleagues} def={h.successor} label={t.id} onGo={(to) => { moveTask(t, to); toast(`${t.id} reassigned to ${to}`) }} /></li>
          ))}</ul>
        )}
      </Panel>
      <Panel title={`Customer leads and accounts (${leads.length})`} action={leads.length > 0 && h.successor ? <Btn s="sm" onClick={() => { leads.forEach((l) => moveLead(l, h.successor)); toast(`${leads.length} leads reassigned to ${h.successor}`) }}>Reassign all to {h.successor.split(' ')[0]}</Btn> : undefined}>
        {leads.length === 0 ? <p className="text-sm text-slate">{c.name} owns no open leads or live accounts.</p> : (
          <ul className="divide-y divide-line">{leads.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><div className="text-sm font-semibold">{l.company}</div><div className="text-xs text-slate">{l.id} · {l.stage} · {ngnx(l.value)}{l.nextAction ? ` · next: ${l.nextAction}` : ''}</div></div><Reassign colleagues={colleagues} def={h.successor} label={l.id} onGo={(to) => { moveLead(l, to); toast(`${l.company} now owned by ${to}`) }} /></li>
          ))}</ul>
        )}
      </Panel>
      <Panel title={`Documents, knowledge and approvals (${pendingItems} unassigned)`}>
        <ul className="divide-y divide-line">{h.items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><Badge tone="gray">{i.kind}</Badge><span className="ml-2 text-sm">{i.label}</span></div>
            <select aria-label={`Hand over: ${i.label}`} className={`${inputCls} !h-8 min-w-[9rem] max-w-full !text-[13px]`} value={i.to} onChange={(e) => assignItem(c.id, i.id, e.target.value, by)}><option value="">Unassigned</option>{colleagues.map((n) => <option key={n}>{n}</option>)}</select></li>
        ))}</ul>
        {h.successor && pendingItems > 0 && <div className="mt-3"><Btn s="sm" v="secondary" onClick={() => h.items.filter((i) => !i.to).forEach((i) => assignItem(c.id, i.id, h.successor, by))}>Hand all to {h.successor.split(' ')[0]}</Btn></div>}
      </Panel>
      <Panel title="Successor acknowledgement" action={h.ack ? <Badge tone="green">Acknowledged</Badge> : <Badge tone="amber">Waiting</Badge>}>
        {h.ack ? <p className="text-sm">{h.ack.by} acknowledged the handover on {fmtDateX(h.ack.at)}.</p> : (
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm text-slate">{ready ? `${h.successor} confirms they have received the notes, tasks, accounts and files.` : 'Choose a successor and reassign every task, lead and item first. Changing the handover resets the acknowledgement.'}</p><Btn s="sm" disabled={!ready} onClick={() => { ackHandover(c.id, ackBy); toast('Handover acknowledged') }}>Acknowledge handover</Btn></div>
        )}
      </Panel>
      {h.moves.length > 0 && <Fold title="Reassignment history" hint={`${h.moves.length} changes`}><Panel title="Reassignment history"><ul className="divide-y divide-line text-sm">{h.moves.map((m, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-2"><span><Badge tone="gray">{m.kind}</Badge> <span className="ml-1">{m.label}</span> to <b>{m.to}</b></span><span className="text-xs text-slate">{fmtDateX(m.at)} · {m.by}</span></li>)}</ul></Panel></Fold>}
    </>
  )
}

function AssetsStep({ c, by }: Ctx) {
  const toast = useToast()
  const [nl, setNl] = useState(''); const [na, setNa] = useState(0); const [nk, setNk] = useState<'Loan' | 'Advance' | 'Expense' | 'Other'>('Loan')
  const out = c.assets.filter((a) => a.state === 'Assigned').length
  return (
    <>
      <Panel title={`Company assets (${out} not yet returned)`} action={out > 0 ? <Btn s="sm" v="secondary" onClick={() => { c.assets.filter((a) => a.state === 'Assigned').forEach((a) => setAsset(c.id, a.id, { state: 'Returned' }, by)); toast('All assets marked as returned') }}>Mark all returned</Btn> : undefined}>
        <ul className="divide-y divide-line">{c.assets.map((a) => (
          <li key={a.id} className="grid items-center gap-2 py-3 sm:grid-cols-[1fr_9rem_10rem]">
            <div className="min-w-0"><div className="text-sm font-semibold">{a.name}</div><div className="text-xs text-slate">{a.kind} · {a.ref} · book value {ngnx(a.value)}</div></div>
            <select aria-label={`State of ${a.name}`} className={`${inputCls} !h-9`} value={a.state} onChange={(e) => setAsset(c.id, a.id, { state: e.target.value as typeof a.state }, by)}>{ASSET_STATES.map((s) => <option key={s}>{s}</option>)}</select>
            {a.state === 'Damaged' || a.state === 'Missing' ? <label className="flex items-center gap-2 text-xs text-slate">Recover<Num label={`Recovery for ${a.name}`} value={a.recovery} onCommit={(n) => setAsset(c.id, a.id, { recovery: n }, by)} className="!h-9" /></label> : <span className="text-xs text-slate">{a.state === 'Returned' ? 'Returned in good order' : 'With the leaver'}</span>}
          </li>
        ))}</ul>
      </Panel>
      <Panel title="Loans, advances and expenses to recover">
        {c.recoveries.length === 0 && <p className="mb-3 text-sm text-slate">Nothing outstanding on record.</p>}
        <ul className="divide-y divide-line">{c.recoveries.map((x) => (
          <li key={x.id} className="grid items-center gap-2 py-3 sm:grid-cols-[1fr_8rem_9rem_auto]">
            <div className="min-w-0"><div className="text-sm font-semibold">{x.label}</div><div className="text-xs text-slate">{x.kind}</div></div>
            <div className="num text-sm text-slate">Owed {ngnx(x.amount)}</div>
            <label className="flex items-center gap-2 text-xs text-slate">Recover<Num label={`Amount to recover for ${x.label}`} value={x.recover} onCommit={(n) => setRecovery(c.id, x.id, { recover: n }, by)} className="!h-9" /></label>
            <Btn s="sm" v="ghost" onClick={() => removeRecovery(c.id, x.id, by)}>Remove</Btn>
          </li>
        ))}</ul>
        <div className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-[1fr_8rem_9rem_auto]">
          <input aria-label="Recovery description" className={inputCls} placeholder="Description" value={nl} onChange={(e) => setNl(e.target.value)} />
          <select aria-label="Recovery type" className={inputCls} value={nk} onChange={(e) => setNk(e.target.value as typeof nk)}>{['Loan', 'Advance', 'Expense', 'Other'].map((k) => <option key={k}>{k}</option>)}</select>
          <input aria-label="Amount" type="number" min={0} className={inputCls} value={na || ''} placeholder="Amount" onChange={(e) => setNa(Number(e.target.value) || 0)} />
          <Btn disabled={!nl.trim() || !na} onClick={() => { addRecovery(c.id, { label: nl.trim(), kind: nk, amount: na, recover: na }, by); setNl(''); setNa(0) }}>Add</Btn>
        </div>
      </Panel>
      <Panel><Row k="Asset recoveries (damaged or missing)" v={ngnx(settle(c).assets)} /><Row k="Loans, advances and expenses" v={ngnx(settle(c).loans)} /><Row k="Total deducted from final pay" v={ngnx(settle(c).assets + settle(c).loans)} strong /></Panel>
    </>
  )
}

function ClearanceStep({ c, by, canManage }: Ctx) {
  const { can } = useRole()
  const toast = useToast()
  const mayAct = (dept: string, approver: string) => canManage || by === approver || (dept === 'Finance' && can('payroll.approve')) || (dept === 'Operations & assets' && can('assets.create'))
  const itApprover = c.clearance.find((s) => s.dept === 'IT & access')?.approver ?? ''
  return (
    <>
      <Panel title="Department sign-offs" action={<Badge tone={c.clearance.every((s) => s.status === 'Cleared') ? 'green' : 'amber'}>{c.clearance.filter((s) => s.status === 'Cleared').length} of {c.clearance.length} cleared</Badge>}>
        <ul className="divide-y divide-line">{c.clearance.map((s) => {
          const ok = mayAct(s.dept, s.approver)
          return (
            <li key={s.dept} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-semibold">{s.dept}</div><div className="text-xs text-slate">Approver: {s.approver}{s.date ? ` · ${fmtDateX(s.date)}` : ''}</div></div><Badge tone={TONE[s.status]}>{s.status}</Badge></div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <Txt label={`Comment for ${s.dept}`} value={s.comment} placeholder="Comment (optional)" onCommit={(v) => signOff(c.id, s.dept, s.status, v, by)} />
                <div className="flex gap-2">
                  <Btn s="sm" disabled={!ok || s.status === 'Cleared'} onClick={() => { signOff(c.id, s.dept, 'Cleared', s.comment, by); toast(`${s.dept} cleared`) }}>Clear</Btn>
                  <Btn s="sm" v="secondary" disabled={!ok || s.status === 'Blocked'} onClick={() => signOff(c.id, s.dept, 'Blocked', s.comment || 'Outstanding items', by)}>Block</Btn>
                  <Btn s="sm" v="ghost" disabled={!ok || s.status === 'Pending'} onClick={() => signOff(c.id, s.dept, 'Pending', '', by)}>Reset</Btn>
                </div>
              </div>
              {!ok && <p className="mt-1 text-xs text-slate">Only {s.approver} or HR can sign this off.</p>}
            </li>
          )
        })}</ul>
      </Panel>
      <Panel title="Access revocation" action={<Badge tone={c.access.every((a) => a.done) ? 'green' : 'amber'}>{c.access.filter((a) => a.done).length} of {c.access.length} revoked</Badge>}>
        <p className="mb-3 text-sm text-slate">Revoke every item on or before {fmtDateX(c.lastWorkingDay)}. IT owner: {itApprover}.</p>
        <ul className="grid gap-2 sm:grid-cols-2">{c.access.map((a) => (
          <li key={a.id}><label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${a.done ? 'border-teal bg-softmint/60' : 'border-line bg-white'}`}><input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={a.done} disabled={!(canManage || by === itApprover)} onChange={(e) => toggleAccess(c.id, a.id, e.target.checked, by)} /><span>{a.label}{a.done && a.by && <span className="block text-xs text-slate">Revoked by {a.by}{a.date ? ` · ${fmtDateX(a.date)}` : ''}</span>}</span></label></li>
        ))}</ul>
      </Panel>
    </>
  )
}

function PayStep({ c, by, canFinance, canManage, steps, company }: Ctx) {
  const toast = useToast()
  const s = settle(c), st = c.settlement
  const up = (patch: Partial<typeof st>, text?: string) => updateSettlement(c.id, patch, by, text)
  const approved = st.approval?.status === 'Approved'
  const ready = steps[1] && steps[2] && steps[3]
  const field = (label: string, key: 'leaveDays' | 'gratuity' | 'otherPay' | 'tax' | 'otherDeduct', hint?: string) => (
    <Field label={label} hint={hint}><Num label={label} value={st[key]} onCommit={(n) => up({ [key]: n }, `Set ${label.toLowerCase()} to ${n.toLocaleString('en-NG')}`)} /></Field>
  )
  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-5">
        <Panel title="Inputs">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Salary days payable" hint={`Days worked in the final month, of ${new Date(Date.UTC(Number(c.lastWorkingDay.slice(0, 4)), Number(c.lastWorkingDay.slice(5, 7)), 0)).getUTCDate()}. Default is the last working day.`}><Num label="Salary days payable" value={s.days} onCommit={(n) => up({ payableDays: n }, `Set salary days payable to ${n}`)} /></Field>
            {field('Unpaid leave days', 'leaveDays', 'Paid at one twenty-second of monthly salary.')}
            {field('Gratuity', 'gratuity')}
            {field('Other payments', 'otherPay', 'Bonus, commission or reimbursements.')}
            {field('PAYE and pension deductions', 'tax', 'Enter the figure from the payroll run.')}
            {field('Other deductions', 'otherDeduct')}
          </div>
          <div className="mt-4"><Field label="Settlement note"><Txt label="Settlement note" value={st.note} placeholder="Shown on the statement" onCommit={(v) => up({ note: v }, 'Updated the settlement note')} /></Field></div>
        </Panel>
        <Panel title="Pension and tax"><p className="text-sm text-slate">PAYE is calculated by payroll on taxable pay up to the last working day. Employee and employer pension contributions for the final month are remitted to {c.name.split(' ')[0]}'s PFA, and accrued rights stay with the retirement savings account.</p></Panel>
      </div>
      <div className="space-y-5">
        <Panel title="Final settlement" action={<Badge tone={approved ? 'green' : 'amber'}>{approved ? 'Approved' : 'Draft'}</Badge>}>
          <Row k={`Salary, ${s.days} days (${ngnx(c.salary)} a month)`} v={ngnx(s.prorated)} />
          <Row k={`Leave payout, ${st.leaveDays} days`} v={ngnx(s.leavePay)} />
          {s.lieu > 0 && <Row k={`Pay in lieu of notice, ${s.short} days`} v={ngnx(s.lieu)} />}
          {st.gratuity > 0 && <Row k="Gratuity" v={ngnx(st.gratuity)} />}
          {st.otherPay > 0 && <Row k="Other payments" v={ngnx(st.otherPay)} />}
          <Row k="Gross payable" v={ngnx(s.gross)} strong />
          {s.noticeDeduct > 0 && <Row k={`Notice shortfall, ${s.short} days`} v={`-${ngnx(s.noticeDeduct)}`} tone="text-err" />}
          {s.assets > 0 && <Row k="Asset recoveries" v={`-${ngnx(s.assets)}`} tone="text-err" />}
          {s.loans > 0 && <Row k="Loans, advances and expenses" v={`-${ngnx(s.loans)}`} tone="text-err" />}
          {st.tax > 0 && <Row k="PAYE and pension" v={`-${ngnx(st.tax)}`} tone="text-err" />}
          {st.otherDeduct > 0 && <Row k="Other deductions" v={`-${ngnx(st.otherDeduct)}`} tone="text-err" />}
          <Row k="Total deductions" v={`-${ngnx(s.deductions)}`} strong />
          <Row k={s.net >= 0 ? 'Net payable' : 'Owed by the employee'} v={ngnx(Math.abs(s.net))} strong tone={s.net >= 0 ? 'text-teal-600 text-lg' : 'text-err text-lg'} />
        </Panel>
        <Panel title="Approval and documents">
          {approved ? <p className="mb-3 text-sm">Approved for payment by <b>{st.approval!.by}</b> on {fmtDateX(st.approval!.at)}.{st.paidOn && ` Paid ${fmtDateX(st.paidOn)}.`}</p> : (
            <p className="mb-3 text-sm text-slate">{c.status === 'Final pay review' ? (canFinance ? 'Check the figures, then approve for payment.' : 'Waiting for Finance to approve. Editing the figures after approval resets it.') : 'Handover, assets and clearance must be complete before final pay review opens.'}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {c.status === 'In clearance' && canManage && <Btn disabled={!ready} onClick={() => { setStatus(c.id, 'Final pay review', by); toast('Moved to final pay review') }}>Open final pay review</Btn>}
            {c.status === 'Final pay review' && !approved && <Btn disabled={!canFinance} title={canFinance ? '' : 'Finance permission required'} onClick={() => { approveSettlement(c.id, by); toast('Settlement approved for payment') }}>Approve for payment</Btn>}
            <Btn v="secondary" onClick={() => openPrint(statementHtml(c, company), `${c.id} settlement`)}>Print statement</Btn>
            <Btn v="secondary" disabled={!steps[3]} onClick={() => downloadLetter(c, company)}>Clearance letter</Btn>
          </div>
          {!canFinance && c.status === 'Final pay review' && !approved && <p className="mt-2 text-xs text-slate">Switch to a Finance role to approve. HR cannot approve its own settlements.</p>}
        </Panel>
      </div>
    </div>
  )
}

function InterviewStep({ c, by, canManage }: Ctx) {
  const toast = useToast()
  const [d, setD] = useState<Interview>({ ...c.interview, interviewer: c.interview.interviewer || by, date: c.interview.date || TODAY, primary: c.interview.primary || c.reasonCat })
  if (!canManage) return <Panel><EmptyState title="HR only" body="Exit interview responses are confidential and visible to HR." /></Panel>
  const save = (declined = false) => { saveInterview(c.id, { ...d, done: !declined, declined }, by); toast(declined ? 'Recorded as declined' : 'Exit interview saved') }
  return (
    <Panel title="Exit interview" action={<Badge tone="gray">Confidential: HR only</Badge>}>
      {c.interview.declined && <p className="mb-4 rounded-lg bg-cloud px-3 py-2 text-sm text-slate">The leaver declined the exit interview. You can still record one below.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date"><input type="date" className={inputCls} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
        <Field label="Interviewer"><input className={inputCls} value={d.interviewer} onChange={(e) => setD({ ...d, interviewer: e.target.value })} /></Field>
      </div>
      <div className="mt-5"><div className="mb-2 text-[13px] font-semibold">Rate each area (1 poor, 5 excellent)</div>
        <ul className="space-y-2">{RATINGS.map((k) => (
          <li key={k} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{k}</span><span role="radiogroup" aria-label={k} className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={d.ratings[k] === n} onClick={() => setD({ ...d, ratings: { ...d.ratings, [k]: n } })} className={`size-9 cursor-pointer rounded-md border text-sm font-semibold ${d.ratings[k] === n ? 'border-teal bg-teal text-white' : 'border-line bg-white text-ink hover:border-teal'}`}>{n}</button>)}</span></li>
        ))}</ul>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Main reason for leaving"><select className={inputCls} value={d.primary} onChange={(e) => setD({ ...d, primary: e.target.value })}>{REASONS.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Would recommend us as an employer?"><div className="flex gap-2">{[['Yes', true], ['No', false]].map(([l, v]) => <button key={String(l)} type="button" aria-pressed={d.recommend === v} onClick={() => setD({ ...d, recommend: v as boolean })} className={`h-10 flex-1 cursor-pointer rounded-md border text-sm font-semibold ${d.recommend === v ? 'border-teal bg-teal text-white' : 'border-line bg-white'}`}>{String(l)}</button>)}</div></Field>
      </div>
      <div className="mt-4"><Field label="Comments"><textarea className={textarea} rows={4} value={d.comments} onChange={(e) => setD({ ...d, comments: e.target.value })} placeholder="What should we keep doing, and what should we change?" /></Field></div>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Btn v="secondary" onClick={() => save(true)}>Leaver declined</Btn><Btn onClick={() => save()} disabled={!Object.keys(d.ratings).length || d.recommend === null}>Save interview</Btn></div>
    </Panel>
  )
}

function CloseStep({ c, by, steps, canManage, work, company }: Ctx & { work: { tasks: Task[]; leads: Lead[] } }) {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const issues = blockers(c, work.tasks.length, work.leads.length)
  const checks: [string, boolean][] = [['Exit accepted', steps[0]], ['Handover acknowledged', steps[1]], ['Assets returned or recovered', steps[2]], ['Departments cleared and access revoked', steps[3]], ['Settlement approved by Finance', steps[4]], ['Exit interview recorded', steps[5]]]
  return (
    <>
      <Panel title="Ready to close?" action={c.status === 'Completed' ? <Badge tone="green">Completed</Badge> : <Badge tone={issues.length ? 'amber' : 'green'}>{issues.length ? `${issues.length} blocking` : 'Ready'}</Badge>}>
        <ul className="grid gap-2 sm:grid-cols-2">{checks.map(([k, ok]) => <li key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${ok ? 'border-teal bg-softmint/60' : 'border-line'}`}><span className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${ok ? 'bg-teal text-white' : 'bg-ink/10 text-slate'}`}>{ok ? '✓' : '·'}</span>{k}</li>)}</ul>
        {issues.length > 0 && c.status !== 'Completed' && <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-err">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        {c.status === 'Completed' ? (
          <div className="mt-4 rounded-lg bg-softmint px-4 py-3 text-sm"><b>{c.name}</b> exited on {fmtDateX(c.lastWorkingDay)}. The case closed on {fmtDateX(c.completedAt ?? '')}. They are removed from active employee lists and demo sign-in access is revoked.</div>
        ) : (
          <div className="mt-5 flex flex-wrap justify-end gap-2"><Btn disabled={!canManage || issues.length > 0} onClick={() => setConfirm(true)}>Complete exit</Btn></div>
        )}
      </Panel>
      <Panel title="Documents"><div className="flex flex-wrap gap-2"><Btn v="secondary" onClick={() => openPrint(statementHtml(c, company), `${c.id} settlement`)}>Print settlement statement</Btn><Btn v="secondary" disabled={!steps[3]} onClick={() => downloadLetter(c, company)}>Download clearance and experience letter</Btn></div></Panel>
      <Overlay open={confirm} onClose={() => setConfirm(false)} title="Complete this exit" alert>
        <p className="text-sm text-slate">{c.name} is marked as exited, removed from active employee lists and system access is closed. This cannot be undone from here.</p>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setConfirm(false)}>Not yet</Btn><Btn onClick={() => { completeExit(c.id, by); setConfirm(false); toast(`${c.name} has exited`) }}>Complete exit</Btn></div>
      </Overlay>
    </>
  )
}

