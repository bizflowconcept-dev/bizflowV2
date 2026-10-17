import { chainFor } from '../../approvals/flow'
import type { ReactNode } from 'react'
import { APPROVALS, ASSETS, AUDIT, EMPLOYEES, LEADS, REVENUE, ngn, ngnM } from '../../data/demo'
import { dueText, fleetDocs, fmtDate, invoicesFor, useCompliance } from '../../compliance/store'

/* Product windows: rendered from the same demo data the live workspace uses. */

export function Window({ path, children, className = '' }: { path: string; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-white text-ink shadow-[0_24px_60px_-34px_rgba(11,37,48,.4)] ${className}`}>
      <div className="border-b border-line bg-cloud px-4 py-2">
        <span className="num truncate font-mono text-[11px] text-slate">app.bizflow.com{path}</span>
      </div>
      <div className="shot p-4 sm:p-5">{children}</div>
    </div>
  )
}

const Chip = ({ tone, children }: { tone: 'ok' | 'warn' | 'err' | 'gray' | 'teal'; children: ReactNode }) => (
  <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${{ ok: 'bg-green-50 text-green-700', warn: 'bg-amber-50 text-amber-800', err: 'bg-red-50 text-red-700', gray: 'bg-cloud text-slate', teal: 'bg-softmint text-teal' }[tone]}`}>{children}</span>
)
const Head = ({ title, right }: { title: string; right?: ReactNode }) => (
  <div className="mb-3 flex items-center justify-between gap-3"><h4 className="font-display text-[15px] font-semibold">{title}</h4>{right}</div>
)

export function PayrollShot() {
  const rows = EMPLOYEES.slice(0, 5)
  const gross = EMPLOYEES.reduce((a, e) => a + e.salary, 0)
  const steps = ['Prepared', 'Audit review', 'MD approval', 'Finance (tiered)']
  return (
    <Window path="/payroll/oct-2026">
      <Head title="October 2026 payroll run" right={<Chip tone="warn">Awaiting MD approval</Chip>} />
      <div className="grid grid-cols-3 gap-3 border-b border-line pb-4">
        {[['Gross pay', ngnM(gross)], ['PAYE + pension', ngnM(gross * 0.17)], ['Net to disburse', ngnM(gross * 0.83)]].map(([l, v]) => <div key={l}><div className="text-[11px] text-slate">{l}</div><div className="num font-display text-lg font-semibold sm:text-xl">{v}</div></div>)}
      </div>
      <div className="mt-3 flex items-center gap-1 text-[11px]" aria-label="Run stages">{steps.map((s, i) => <span key={s} className="flex items-center gap-1"><i className={`grid size-4 place-items-center rounded-full text-[9px] font-bold ${i < 2 ? 'bg-teal text-white' : i === 2 ? 'bg-warn text-white' : 'bg-line text-slate'}`}>{i < 2 ? '✓' : i + 1}</i><span className={i === 2 ? 'font-semibold' : 'text-slate'}>{s}</span>{i < 3 && <span className="mx-1 h-px w-3 bg-line" />}</span>)}</div>
      <table className="mt-4 w-full text-left text-[12px]">
        <thead><tr className="text-[11px] text-slate"><th className="pb-1.5 font-medium">Employee</th><th className="pb-1.5 font-medium">Cost centre</th><th className="pb-1.5 text-right font-medium">Gross</th></tr></thead>
        <tbody>{rows.map((e) => <tr key={e.id} className="border-t border-line/70"><td className="py-1.5 font-semibold">{e.name}<span className="block text-[10px] font-normal text-slate">{e.branch}</span></td><td className="text-slate">{e.cost}</td><td className="num text-right">{ngn(e.salary)}</td></tr>)}</tbody>
      </table>
      <div className="mt-3 rounded-md bg-cloud px-3 py-2 text-[11px] text-slate">Variance vs September: <b className="text-ink">+2.1%</b> · 2 payslips flagged for review</div>
    </Window>
  )
}

export function ApprovalsShot() {
  return (
    <Window path="/approvals">
      <Head title="Approval inbox" right={<Chip tone="teal">Audit before MD · MD final</Chip>} />
      <ul className="divide-y divide-line/70">
        {APPROVALS.slice(0, 4).map((a) => (
          <li key={a.id} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="truncate text-[13px] font-semibold">{a.type} · {a.who}</div><div className="truncate text-[11px] text-slate">{a.note}</div></div>
              <div className="num shrink-0 text-[13px] font-semibold">{a.amount ? ngn(a.amount) : '—'}</div>
            </div>
            <div className="mt-2 flex items-center gap-1.5">{chainFor(a, { rules: [] }).map((s, i, ch) => <span key={s} className="flex items-center gap-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${i < a.done.length ? 'bg-teal text-white' : i === a.done.length ? 'bg-amber-100 text-amber-800' : 'bg-cloud text-slate'}`}>{s}</span>{(i < ch.length - 1 || a.amount > 0) && <span className="h-px w-3 bg-line" />}</span>)}{a.amount > 0 ? <span className="rounded-full border border-dashed border-line px-2 py-0.5 text-[10px] font-semibold text-slate">{a.amount > 500000 ? 'CFO disburses' : 'Finance Officer disburses'}</span> : null}<span className="ml-auto font-mono text-[10px] text-slate">{a.id}</span></div>
          </li>
        ))}
      </ul>
    </Window>
  )
}

export function RevenueShot() {
  const max = 60, w = 300, h = 120
  const x = (i: number) => 14 + i * ((w - 28) / (REVENUE.length - 1))
  const y = (v: number) => h - 14 - (v / max) * (h - 28)
  const line = (k: 'rev' | 'exp') => REVENUE.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ')
  const last = REVENUE[REVENUE.length - 1]
  return (
    <Window path="/dashboard">
      <Head title="Business health" right={<Chip tone="ok">Oct on track</Chip>} />
      <div className="grid grid-cols-3 gap-3"><div><div className="text-[11px] text-slate">Revenue</div><div className="num font-display text-lg font-semibold">₦{last.rev}M</div></div><div><div className="text-[11px] text-slate">Expenses</div><div className="num font-display text-lg font-semibold">₦{last.exp}M</div></div><div><div className="text-[11px] text-slate">Margin</div><div className="num font-display text-lg font-semibold text-ok">{Math.round(((last.rev - last.exp) / last.rev) * 100)}%</div></div></div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full" role="img" aria-label="Revenue and expenses, May to October">
        {[0, 20, 40, 60].map((g) => <line key={g} x1="14" x2={w - 14} y1={y(g)} y2={y(g)} stroke="#e4ecec" />)}
        <path d={`${line('rev')} L${x(5)} ${y(0)} L${x(0)} ${y(0)} Z`} fill="#35D0BA" opacity=".14" />
        <path d={line('rev')} fill="none" stroke="#087E8B" strokeWidth="2.2" strokeLinejoin="round" />
        <path d={line('exp')} fill="none" stroke="#0B2530" strokeWidth="1.6" strokeDasharray="4 3" />
        {REVENUE.map((p, i) => <text key={p.m} x={x(i)} y={h - 2} textAnchor="middle" fontSize="8" fill="#60777d">{p.m}</text>)}
        <circle cx={x(5)} cy={y(last.rev)} r="3.5" fill="#087E8B" />
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-slate"><span className="flex items-center gap-1.5"><i className="h-0.5 w-4 bg-teal" />Revenue</span><span className="flex items-center gap-1.5"><i className="h-0.5 w-4 border-t border-dashed border-midnight" />Expenses</span></div>
    </Window>
  )
}

export function BranchShot() {
  const b = [['Lagos HQ', 21.4, 14, 'Full'], ['Abuja Branch', 14.2, 11, 'Full'], ['Port Harcourt', 11.8, 8, 'Full'], ['Ibadan', 9.5, 7, 'Review']] as const
  const max = 22
  return (
    <Window path="/organization/branches">
      <Head title="Branch performance · October" right={<Chip tone="gray">₦56.9M total</Chip>} />
      <ul className="space-y-3">
        {b.map(([n, v, hc, st]) => (
          <li key={n}>
            <div className="flex items-baseline justify-between text-[12px]"><span className="font-semibold">{n}<span className="ml-2 font-normal text-slate">{hc} staff</span></span><span className="num font-semibold">₦{v}M</span></div>
            <div className="mt-1 h-2 rounded-full bg-cloud"><div className="h-2 rounded-full bg-gradient-to-r from-teal to-mint" style={{ width: `${(v / max) * 100}%` }} /></div>
            {st === 'Review' && <div className="mt-1 text-[10px] text-amber-800">2 expense claims waiting on the branch approver</div>}
          </li>
        ))}
      </ul>
    </Window>
  )
}

export function PipelineShot() {
  const cols = Object.entries(LEADS)
  return (
    <Window path="/crm/pipeline">
      <Head title="Pipeline" right={<Chip tone="teal">{ngnM(Object.values(LEADS).flat().reduce((a, l) => a + l.v, 0))} open</Chip>} />
      <div className="grid grid-cols-4 gap-2">
        {cols.map(([stage, items]) => (
          <div key={stage} className="min-w-0 rounded-md bg-cloud p-1.5">
            <div className="mb-1.5 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-slate"><span>{stage}</span><span>{items.length}</span></div>
            {items.slice(0, 2).map((l) => <div key={l.n} className="mb-1.5 rounded border border-line bg-white p-1.5"><div className="truncate text-[11px] font-semibold">{l.n}</div><div className="num text-[10px] text-slate">{ngnM(l.v)} · {l.o.split(' ')[0]}</div></div>)}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-md border border-line px-3 py-2 text-[12px]"><span><b>Ikoyi Gardens Facilities</b> won</span><Chip tone="ok">Invoice INV-1043 created</Chip></div>
    </Window>
  )
}

export function FleetShot() {
  const s = useCompliance()
  const docs = fleetDocs(s).sort((a, b) => a.days - b.days).slice(0, 5)
  return (
    <Window path="/fleet">
      <Head title="Vehicle documents" right={<Chip tone="err">{fleetDocs(s).filter((d) => d.level === 'expired' || d.level === 'critical').length} need action</Chip>} />
      <ul className="divide-y divide-line/70">
        {docs.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0"><div className="truncate text-[12px] font-semibold">{d.type} · {d.reg}</div><div className="truncate text-[11px] text-slate">{d.ack ? `${d.ack.by} acknowledged` : 'Not yet acknowledged'} · {fmtDate(d.expiry)}</div></div>
            <Chip tone={d.level === 'valid' ? 'ok' : d.level === 'soon' ? 'warn' : 'err'}>{dueText(d.days)}</Chip>
          </li>
        ))}
      </ul>
      <div className="mt-2 rounded-md bg-cloud px-3 py-2 text-[11px] text-slate">Reminders go out at 30, 14, 7, 3 and 1 days. Unacknowledged items escalate to the owner.</div>
    </Window>
  )
}

export function VendorShot() {
  const s = useCompliance()
  const inv = invoicesFor(s).filter((i) => i.state === 'overdue').sort((a, b) => b.overdueDays - a.overdueDays).slice(0, 4)
  return (
    <Window path="/vendors/payments">
      <Head title="Overdue vendor payments" right={<Chip tone="err">{ngnM(invoicesFor(s).filter((i) => i.state === 'overdue').reduce((a, i) => a + i.amount, 0))} overdue</Chip>} />
      <ul className="divide-y divide-line/70">
        {inv.map((i) => (
          <li key={i.id} className="py-2">
            <div className="flex items-center justify-between gap-3"><span className="truncate text-[12px] font-semibold">{i.vendor.name}</span><span className="num text-[12px] font-semibold">{ngn(i.amount)}</span></div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate"><span className="truncate">{i.delays.length ? `Pay by ${fmtDate(i.delays[i.delays.length - 1].promised)}` : 'No explanation yet'}</span><Chip tone={i.needsReason ? 'err' : 'warn'}>{i.overdueDays}d overdue</Chip></div>
          </li>
        ))}
      </ul>
    </Window>
  )
}

export function AssetShot() {
  return (
    <Window path="/assets">
      <Head title="Asset register" right={<Chip tone="gray">{ASSETS.length} assets</Chip>} />
      <ul className="divide-y divide-line/70">
        {ASSETS.slice(0, 5).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0"><div className="truncate text-[12px] font-semibold">{a.name}</div><div className="truncate text-[11px] text-slate">{a.id} · {a.who}</div></div>
            <div className="text-right"><div className="num text-[12px]">{ngnM(a.cur)}</div><Chip tone={a.status === 'Maintenance' ? 'warn' : a.status === 'In stock' ? 'gray' : 'ok'}>{a.status}</Chip></div>
          </li>
        ))}
      </ul>
    </Window>
  )
}

export function SiteCostShot() {
  const sites: [string, string, number, number][] = [['Ikoyi Heights · Block B', 'CC-510', 184, 142], ['Ikoyi Phase 2 · Access road', 'CC-514', 96, 101], ['Abuja Plaza · Fit-out', 'CC-521', 62, 31]]
  return (
    <Window path="/accounting/cost-centres">
      <Head title="Site cost centres" right={<Chip tone="warn">1 over budget</Chip>} />
      <ul className="space-y-3.5">
        {sites.map(([n, c, bud, sp]) => (
          <li key={c}>
            <div className="flex items-baseline justify-between text-[12px]"><span className="font-semibold">{n}<span className="ml-2 font-mono text-[10px] font-normal text-slate">{c}</span></span><span className="num">₦{sp}M <span className="text-slate">of ₦{bud}M</span></span></div>
            <div className="relative mt-1 h-2 rounded-full bg-cloud"><div className={`h-2 rounded-full ${sp > bud ? 'bg-err' : 'bg-teal'}`} style={{ width: `${Math.min(100, (sp / bud) * 100)}%` }} /></div>
            <div className="mt-1 text-[10px] text-slate">Crew payroll, equipment hire and materials charged automatically</div>
          </li>
        ))}
      </ul>
    </Window>
  )
}

export function MatchShot() {
  const rows: [string, string, string, string, 'ok' | 'warn' | 'err'][] = [['PO-0412 · Cement, 600 bags', 'Received 600', 'Invoice ₦4.62M', 'Matched', 'ok'], ['PO-0409 · Roofing sheets', 'Received 180 of 200', 'Invoice ₦6.10M', 'Short delivery', 'warn'], ['PO-0405 · Diesel, 5,000 L', 'Received 5,000', 'Invoice ₦6.45M', 'Price differs', 'err']]
  return (
    <Window path="/procurement/matching">
      <Head title="Three-way match" right={<Chip tone="gray">PO · receipt · invoice</Chip>} />
      <ul className="divide-y divide-line/70">
        {rows.map(([po, rec, inv, st, t]) => <li key={po} className="py-2.5"><div className="flex items-center justify-between gap-3"><span className="truncate text-[12px] font-semibold">{po}</span><Chip tone={t}>{st}</Chip></div><div className="mt-0.5 text-[11px] text-slate">{rec} · {inv}</div></li>)}
      </ul>
      <div className="mt-2 rounded-md bg-cloud px-3 py-2 text-[11px] text-slate">Payment is only released on matched or approved-exception lines.</div>
    </Window>
  )
}

export function RentRollShot() {
  const units: [string, string, string, 'ok' | 'warn' | 'err' | 'gray', string][] = [['Ikoyi Court · 4B', 'Adaeze Obi', '₦2.4M', 'ok', 'Paid 3 Oct'], ['Ikoyi Court · 7A', 'Femi Balogun', '₦2.4M', 'warn', 'Due 15 Oct'], ['Maitama Terrace · 2', 'Ibrahim Sani', '₦3.1M', 'err', '12 days late'], ['Maitama Terrace · 5', 'Vacant', '—', 'gray', 'Listed']]
  return (
    <Window path="/crm/properties">
      <Head title="Rent roll" right={<Chip tone="ok">94% occupied</Chip>} />
      <ul className="divide-y divide-line/70">
        {units.map(([u, t, r, tone, st]) => <li key={u} className="flex items-center justify-between gap-3 py-2"><div className="min-w-0"><div className="truncate text-[12px] font-semibold">{u}</div><div className="truncate text-[11px] text-slate">{t}</div></div><div className="text-right"><div className="num text-[12px]">{r}</div><Chip tone={tone}>{st}</Chip></div></li>)}
      </ul>
    </Window>
  )
}

export function ScheduleShot() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const people: [string, string[]][] = [['Amaka Obi', ['H', 'O', 'H', 'H', 'R']], ['Fatima Sule', ['R', 'R', 'R', 'R', 'R']], ['Emmanuel Ojo', ['F', 'F', 'F', 'F', 'O']], ['Kunle Ogunleye', ['O', 'O', 'O', 'H', 'O']]]
  const style: Record<string, string> = { O: 'bg-teal text-white', H: 'bg-softmint text-teal', R: 'bg-cloud text-slate ring-1 ring-line', F: 'bg-midnight text-mint' }
  const name: Record<string, string> = { O: 'Office', H: 'Home', R: 'Remote', F: 'Field' }
  return (
    <Window path="/people/schedules">
      <Head title="This week" right={<Chip tone="ok">No false absences</Chip>} />
      <div className="grid grid-cols-[110px_repeat(5,1fr)] gap-1 text-center text-[11px]">
        <span />{days.map((d) => <span key={d} className="font-semibold text-slate">{d}</span>)}
        {people.map(([n, w]) => [<span key={n} className="truncate text-left font-semibold">{n.split(' ')[0]}</span>, ...w.map((c, i) => <span key={n + i} className={`rounded py-1.5 text-[10px] font-semibold ${style[c]}`}>{name[c]}</span>)])}
      </div>
      <p className="mt-3 text-[11px] text-slate">Expected location is set per day, so a remote Wednesday is never marked absent.</p>
    </Window>
  )
}

export function SignShot() {
  return (
    <Window path="/sign/employment-agreement">
      <Head title="Employment Agreement · Amaka Obi" right={<Chip tone="ok">Fully signed</Chip>} />
      <div className="mb-3 rounded-md bg-cloud px-3 py-2 text-[11px] text-slate">Generated from the offer template using the employee record. No retyping.</div>
      <ol className="relative ml-1.5 border-l border-line pl-4">
        {AUDIT.slice().reverse().map((a) => (
          <li key={a.t + a.x} className="relative pb-3 last:pb-0">
            <i className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-teal ring-2 ring-white" />
            <div className="flex items-center justify-between gap-3"><span className="truncate text-[12px]"><b>{a.a}</b> {a.x}</span><span className="num font-mono text-[10px] text-slate">{a.t}</span></div>
            <Chip tone={a.s === 'Signed' ? 'ok' : a.s === 'Sent' ? 'teal' : 'gray'}>{a.s}</Chip>
          </li>
        ))}
      </ol>
    </Window>
  )
}

export function OnboardingShot() {
  const tasks: [string, boolean][] = [['Personal details and next of kin', true], ['Bank account and pension PIN', true], ['Signed offer letter', true], ['Laptop assigned (AST-00418)', false], ['Payroll activated', false]]
  const done = tasks.filter((t) => t[1]).length
  return (
    <Window path="/people/onboarding/zainab-lawal">
      <Head title="Maryam Bello · starts Mon 12 Oct" right={<Chip tone="warn">{done} of {tasks.length} done</Chip>} />
      <div className="mb-3 h-1.5 rounded-full bg-cloud"><div className="h-1.5 rounded-full bg-teal" style={{ width: `${(done / tasks.length) * 100}%` }} /></div>
      <ul className="divide-y divide-line/70">
        {tasks.map(([t, d]) => <li key={t} className="flex items-center gap-3 py-2 text-[12px]"><i className={`grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${d ? 'bg-teal text-white' : 'border border-line text-transparent'}`}>✓</i><span className={d ? 'text-slate line-through' : 'font-semibold'}>{t}</span></li>)}
      </ul>
    </Window>
  )
}
