import { useState, type ComponentType, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Btn, Flow } from '../../components/ui'
import {
  ApprovalsShot, AssetShot, BranchShot, FleetShot, MatchShot, PayrollShot, PipelineShot,
  RentRollShot, RevenueShot, ScheduleShot, SiteCostShot, VendorShot,
} from '../../components/site/ProductShots'

const photo = (id: string, w: number, h: number) => `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&auto=format`

const Eyebrow = ({ children, dark }: { children: ReactNode; dark?: boolean }) => (
  <div className={`text-xs font-semibold uppercase tracking-[0.12em] ${dark ? 'text-mint' : 'text-teal'}`}>{children}</div>
)

function Cta({ title, sub }: { title: string; sub: string }) {
  return (
    <section className="on-dark bf-deep grid-fine text-white">
      <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-8 px-6 py-16 lg:flex-row lg:items-center">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold sm:text-4xl">{title}</h2>
          <p className="mt-3 text-white/70">{sub}</p>
        </div>
        <div className="flex flex-wrap gap-3"><Btn v="mint" s="lg" to="/get-started">Start free</Btn><Btn v="secondary" s="lg" to="/contact">Talk to us</Btn></div>
      </div>
    </section>
  )
}

/* ------------------------------ SOLUTIONS ------------------------------ */

type Seg = { k: string; t: string; d: string; pts: string[]; Shot: ComponentType }
const SEGMENTS: Seg[] = [
  { k: 'Growing SMEs', t: 'Out of the spreadsheet, without hiring an IT team.', d: 'Most 10 to 60 person businesses run on a payroll sheet, a WhatsApp group for approvals and an accountant who gets receipts at month end. BizFlow replaces all three with one record.', pts: ['Staff onboard themselves from a secure link', 'Expense and leave requests route to the right approver', 'Payroll posts to the ledger without re-typing'], Shot: PayrollShot },
  { k: 'Multi-branch', t: 'Every branch visible, every approver local.', d: 'Branch managers review local requests, Audit checks them, the MD gives the final approval and Finance disburses, with one consolidated picture instead of four reports in four formats.', pts: ['Branch-aware dashboards and approvers', 'Cost centres follow people and assets', 'Compare branches on the same basis'], Shot: BranchShot },
  { k: 'Service businesses', t: 'From first conversation to cash.', d: 'A lead becomes a customer, the customer becomes an invoice, and the expenses incurred for that client sit next to it. No separate CRM to reconcile.', pts: ['Pipeline with owners and follow-ups', 'Won deals create invoices from the ledger', 'Receivables aged per customer'], Shot: PipelineShot },
  { k: 'Trading & distribution', t: 'Pay for what arrived, at the price you agreed.', d: 'Purchase orders, goods received and supplier invoices are matched before money moves, and overdue payables show up before a supplier calls.', pts: ['Three-way match on every purchase', 'Vendor payables with named owners', 'Overdue reasons and promised dates on record'], Shot: MatchShot },
  { k: 'Field operations', t: 'Vehicles, crews and sites that stay compliant.', d: 'Documents expire, drivers move between sites and fuel is bought on the road. BizFlow keeps the paper trail and warns the right person early.', pts: ['Document expiry reminders at 30, 14, 7, 3 and 1 days', 'Field attendance that works on a phone', 'Equipment and vehicles tied to cost centres'], Shot: FleetShot },
]

function SprawlGraphic() {
  const before: [string, string][] = [['Payroll', 'Excel, emailed to finance'], ['Approvals', 'WhatsApp and verbal'], ['Receipts', 'Paper, in a drawer'], ['Customers', "Sales team's phones"], ['Assets', 'A sheet nobody updates'], ['Accounts', 'Separate software, retyped monthly']]
  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-[1fr_auto_1fr]">
      <div className="rounded-lg border border-line bg-white p-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate">A typical Monday</div>
        <ul className="mt-4 divide-y divide-line">
          {before.map(([a, b]) => <li key={a} className="flex items-baseline justify-between gap-4 py-2.5 text-[14px]"><span className="font-semibold">{a}</span><span className="text-right text-slate line-through decoration-err/50">{b}</span></li>)}
        </ul>
        <p className="mt-4 text-[13px] text-slate">Six tools, six versions of the truth, and someone retyping between them.</p>
      </div>
      <svg viewBox="0 0 60 200" className="mx-auto hidden h-full w-14 lg:block" aria-hidden>
        <path d="M6 100h40" stroke="#35D0BA" strokeWidth="2" /><path d="M40 92l10 8-10 8" fill="none" stroke="#35D0BA" strokeWidth="2" />
      </svg>
      <div className="on-dark bf-deep relative overflow-hidden rounded-lg p-6 text-white">
        <div className="text-xs font-semibold uppercase tracking-wide text-mint">With BizFlow</div>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {before.map(([a]) => <div key={a} className="rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-[13px] font-semibold">{a}</div>)}
        </div>
        <div className="mt-3 rounded-md bg-mint px-3 py-2.5 text-center text-[13px] font-semibold text-midnight">One shared record, one approval trail, one audit log</div>
        <p className="mt-4 text-[13px] text-white/70">Enter it once. Payroll, approvals and the ledger all read the same entry.</p>
      </div>
    </div>
  )
}

function SolutionsTab() {
  const [i, setI] = useState(0)
  const s = SEGMENTS[i]
  const steps: [string, string][] = [
    ['Request', 'David files a ₦184,500 diesel and transport expense from the Warri road site.'],
    ['Manager reviews', 'His line manager sees it in the inbox with the receipt attached and passes it up.'],
    ['Audit checks it', 'Audit is in every request. It reviews before the MD, and companies can add Compliance or Legal where their rules need them.'],
    ['MD gives final approval', 'Tunde approves once. Nobody below him approves again, and nobody can skip him.'],
    ['Finance disburses', 'Under ₦500,000 the Finance Officer releases it; above, only the CFO does. The entry lands in the Port Harcourt cost centre.'],
    ['Auditable', 'Who approved what, and when, is on record and cannot be edited.'],
  ]
  return (
    <>
      <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Eyebrow>The problem we solve</Eyebrow>
          <h2 className="mt-3 text-4xl font-semibold leading-tight">Your business already has a system. It is just spread across six places.</h2>
          <p className="mt-5 max-w-lg text-lg text-slate">Growth does not break a business because of sales. It breaks at the point where nobody can answer a simple question, such as what did we spend on the Abuja site this quarter, without a day of chasing.</p>
          <p className="mt-4 max-w-lg text-slate">BizFlow gives people, money, operations and customers a common core, so the answer is one click away and the person who approved it is named.</p>
        </div>
        <RevenueShot />
      </section>

      <section className="border-y border-line bg-cloud py-20">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="mb-10 max-w-2xl"><Eyebrow>Before and after</Eyebrow><h2 className="mt-3 text-4xl font-semibold">Same business. One record.</h2></div>
          <SprawlGraphic />
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-6 py-20">
        <div className="max-w-2xl"><Eyebrow>Built for how you operate</Eyebrow><h2 className="mt-3 text-4xl font-semibold">Pick the shape of your business.</h2></div>
        <div className="mt-8 flex flex-wrap gap-2" role="tablist">
          {SEGMENTS.map((x, n) => <button key={x.k} role="tab" aria-selected={n === i} onClick={() => setI(n)} className={`cursor-pointer rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${n === i ? 'border-midnight bg-midnight text-white' : 'border-line bg-white text-slate hover:text-ink'}`}>{x.k}</button>)}
        </div>
        <div className="mt-10 grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]" role="tabpanel" key={s.k}>
          <div>
            <h3 className="text-3xl font-semibold leading-tight">{s.t}</h3>
            <p className="mt-4 text-lg text-slate">{s.d}</p>
            <ul className="mt-6">{s.pts.map((p) => <li key={p} className="flex gap-3 border-t border-line py-3.5 text-[15px] font-medium"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal" />{p}</li>)}</ul>
          </div>
          <s.Shot />
        </div>
      </section>

      <section className="on-dark bf-deep grid-fine text-white">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Eyebrow dark>Follow one naira</Eyebrow>
            <h2 className="mt-3 text-4xl font-semibold leading-tight">From a site expense to the ledger, with a name at every step.</h2>
            <ol className="mt-8">
              {steps.map(([a, b], n) => (
                <li key={a} className="grid grid-cols-[2.5rem_1fr] gap-3 border-t border-white/12 py-4">
                  <span className="num font-mono text-sm text-mint">0{n + 1}</span>
                  <div><div className="font-display text-lg font-semibold">{a}</div><p className="mt-1 text-[15px] text-white/70">{b}</p></div>
                </li>
              ))}
            </ol>
          </div>
          <ApprovalsShot />
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-6 py-20">
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[['5', 'pillars on one core', 'People, money, operations, customers and control.'], ['4', 'payroll stages', 'Prepared, audited, approved by the MD and disbursed by Finance, each with an owner.'], ['6', 'reminder points', 'On every fleet document, from 30 days out to the day of expiry.'], ['1', 'audit trail', 'Append-only, covering every module rather than a few.']].map(([n, a, b]) => (
            <div key={a} className="bg-white p-7"><div className="num font-display text-5xl font-semibold text-teal">{n}</div><div className="mt-2 font-semibold">{a}</div><p className="mt-1 text-[14px] text-slate">{b}</p></div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-white py-20">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="max-w-2xl"><Eyebrow>Credibility by design</Eyebrow><h2 className="mt-3 text-4xl font-semibold">Controls your auditors, lenders and staff can all see.</h2><p className="mt-4 text-lg text-slate">Compliance is not a report you assemble at year end. Expiring vehicle papers and overdue supplier payments surface to a named person, need an acknowledgement, and are logged in the open.</p></div>
          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <div><FleetShot /><h3 className="mt-5 text-xl font-semibold">Fleet paperwork never lapses quietly</h3><p className="mt-1.5 text-[15px] text-slate">Insurance, road worthiness, vehicle licence and driver licence reminders go to the admin officer. Renewals are entered by one person and verified by another.</p></div>
            <div><VendorShot /><h3 className="mt-5 text-xl font-semibold">Overdue payables carry a reason and a date</h3><p className="mt-1.5 text-[15px] text-slate">Late supplier payments need a recorded explanation and a promised date. Past 30 days they escalate. Suppliers get a straight answer.</p></div>
          </div>
        </div>
      </section>
    </>
  )
}

/* ------------------------------ INDUSTRIES ------------------------------ */

type Ind = {
  id: string; name: string; img: string; alt: string; line: string
  today: string[]; with: string[]; flow: string[]; figs: [string, string][]
  week: [string, string][]; Shot: ComponentType; Shot2?: ComponentType
}
const INDUSTRIES: Ind[] = [
  { id: 'construction', name: 'Construction', img: '1740825961434-e9287638592b', alt: 'Construction site with steel frame under a clear sky', line: 'Know what each site costs while the job is still running, not after handover.',
    today: ['Crew pay, hired equipment and materials land in one lump', 'Site managers phone in cash requests', 'Profit per project is found out at the end'],
    with: ['Payroll, assets and purchases charge to the site cost centre', 'Site requests route to an approver with the budget visible', 'Budget against spend updates as bills are approved'],
    flow: ['Employee', 'Site', 'Asset', 'Procurement', 'Expense', 'Approval', 'Accounting'],
    figs: [['3', 'live site cost centres in the demo workspace'], ['1', 'site flagged over budget before the invoice run'], ['0', 'manual journals to move payroll into a site']],
    week: [['Mon', 'Crew roster fixed for Ikoyi Block B; attendance recorded from site.'], ['Wed', 'Cement delivery received; short roofing delivery held from payment.'], ['Fri', 'MD reviews cost centres. Ikoyi access road is 5% over; extra hire needs sign-off.']],
    Shot: SiteCostShot, Shot2: MatchShot },
  { id: 'trading', name: 'Trading & distribution', img: '1664382953403-fc1ac77073a0', alt: 'Warehouse aisle with stacked goods on shelving', line: 'Stop paying for goods that never arrived, and stop being surprised by what you owe.',
    today: ['Supplier invoices paid on a phone call', 'Short deliveries found weeks later', 'Nobody knows the true payables number'],
    with: ['Payment released only on matched purchase, receipt and invoice', 'Short deliveries flagged at receiving', 'Overdue payables listed by supplier and age'],
    flow: ['Purchase order', 'Goods received', 'Supplier invoice', 'Match', 'Approval', 'Payment'],
    figs: [['3-way', 'match before any supplier payment'], ['30 days', 'overdue triggers escalation to the owner'], ['1', 'payables view for finance and the MD']],
    week: [['Mon', 'PO raised for 5,000 L of diesel; MD gives the final approval.'], ['Tue', 'Delivery received at 4,900 L; the shortfall is recorded.'], ['Thu', 'Invoice arrives at the full price; the match fails and finance queries it.']],
    Shot: MatchShot, Shot2: VendorShot },
  { id: 'real-estate', name: 'Real estate', img: '1543414347-1c348021f279', alt: 'Modern residential apartment building facade', line: 'Rent, maintenance and tenants on one page, with arrears visible before they age.',
    today: ['Rent tracked in a sheet per property', 'Repairs reported over chat and forgotten', 'Occupancy known only from memory'],
    with: ['Rent roll by unit with paid, due and late status', 'Maintenance tasks tied to the asset and cost', 'Prospects tracked through to a signed tenancy'],
    flow: ['Prospect', 'Tenant', 'Invoice', 'Payment', 'Maintenance', 'Cost centre'],
    figs: [['94%', 'occupancy in the demo rent roll'], ['12 days', 'oldest arrears surfaced automatically'], ['1', 'cost centre per property']],
    week: [['Mon', 'Rent invoices issued for Ikoyi Court and Maitama Terrace.'], ['Wed', 'Generator maintenance logged against the property it serves.'], ['Fri', 'Arrears chased; a late tenant gets a dated promise on record.']],
    Shot: RentRollShot, Shot2: AssetShot },
  { id: 'professional-services', name: 'Professional services', img: '1573164574511-73c773193279', alt: 'Consultants working together at a meeting table', line: 'Know which engagements actually make money, expenses included.',
    today: ['Client work tracked in one place, invoices in another', 'Out-of-pocket expenses reach the client late or never', 'Pipeline lives in someone’s head'],
    with: ['Lead to invoice in one chain', 'Expenses attributed to the client and engagement', 'Receivables aged by customer'],
    flow: ['Lead', 'Customer', 'Opportunity', 'Task', 'Expense', 'Invoice', 'Payment'],
    figs: [['₦' + '44.0M', 'open pipeline in the demo workspace'], ['1', 'won deal converts straight into an invoice'], ['2', 'owners with their own follow-up lists']],
    week: [['Mon', 'Proposal sent to Nile Distribution; follow-up task set for Thursday.'], ['Wed', 'Travel expense approved and tagged to the client.'], ['Fri', 'Ikoyi Gardens Facilities won; invoice created from the deal.']],
    Shot: PipelineShot, Shot2: ApprovalsShot },
  { id: 'multi-branch', name: 'Multi-branch', img: '1441986300917-64674bd600d8', alt: 'Retail street with shopfronts', line: 'Give each branch its own view while the company sees one consolidated picture.',
    today: ['Each branch reports in its own format', 'Head office approves everything or nothing', 'Comparing branches means a week of cleanup'],
    with: ['Branch approvers handle local requests', 'Consolidated revenue and cost by branch', 'Staff schedules that know who is where'],
    flow: ['Company', 'Branch', 'Employees', 'Expenses', 'Assets', 'Cost centres', 'Reports'],
    figs: [['4', 'branches in the demo company'], ['₦56.9M', 'consolidated October revenue'], ['1', 'chart of accounts across all branches']],
    week: [['Mon', 'Ibadan branch expense claims queue for the local approver.'], ['Wed', 'Hybrid schedule published; remote days are not counted absent.'], ['Fri', 'MD compares branches on the same basis, with no spreadsheet merging.']],
    Shot: BranchShot, Shot2: ScheduleShot },
  { id: 'logistics', name: 'Logistics & field', img: '1775865937358-c7d2972e78ec', alt: 'Delivery trucks parked in a depot', line: 'Keep the fleet legal, the drivers accountable and the fuel receipts honest.',
    today: ['Insurance lapses are found at a roadside check', 'Driver licences tracked by memory', 'Fuel and repairs reimbursed without context'],
    with: ['Expiry reminders to the admin officer, with escalation', 'Renewals verified by someone other than the person who entered them', 'Vehicle costs tied to the asset record'],
    flow: ['Vehicle', 'Driver', 'Document', 'Reminder', 'Renewal', 'Verified', 'Audit'],
    figs: [['6', 'reminder points per document'], ['2', 'people needed to close a renewal'], ['3 days', 'unacknowledged critical items escalate']],
    week: [['Mon', 'Admin officer acknowledges a road worthiness expiry and names the renewal date.'], ['Wed', 'Renewal certificate uploaded and a second officer verifies it.'], ['Fri', 'Fleet status reviewed by the MD, with every action logged.']],
    Shot: FleetShot, Shot2: AssetShot },
]

function IndustrySection({ x, n }: { x: Ind; n: number }) {
  const flip = n % 2 === 1
  return (
    <section id={x.id} className={`scroll-mt-20 border-t border-line py-20 ${flip ? 'bg-white' : ''}`}>
      <div className="mx-auto max-w-[1240px] px-6">
        <div className={`grid items-end gap-10 lg:grid-cols-2 ${flip ? 'lg:[&>*:first-child]:order-2' : ''}`}>
          <div className="relative overflow-hidden rounded-lg bg-midnight">
            <img src={photo(x.img, 1000, 640)} alt={x.alt} loading="lazy" className="aspect-[25/16] w-full object-cover opacity-90" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-midnight/85 to-transparent p-5 pt-16"><span className="num font-mono text-xs text-mint">0{n + 1} / 06</span></div>
          </div>
          <div>
            <Eyebrow>{x.name}</Eyebrow>
            <h2 className="mt-3 text-4xl font-semibold leading-tight">{x.line}</h2>
            <div className="mt-6"><Flow steps={x.flow} /></div>
          </div>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-2">
          <div className="bg-cloud p-7"><div className="text-xs font-semibold uppercase tracking-wide text-slate">Today</div><ul className="mt-3 space-y-2.5">{x.today.map((t) => <li key={t} className="flex gap-3 text-[15px] text-slate"><span className="mt-2 h-px w-3 shrink-0 bg-slate" />{t}</li>)}</ul></div>
          <div className="bg-white p-7"><div className="text-xs font-semibold uppercase tracking-wide text-teal">With BizFlow</div><ul className="mt-3 space-y-2.5">{x.with.map((t) => <li key={t} className="flex gap-3 text-[15px] font-medium"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal" />{t}</li>)}</ul></div>
        </div>

        <div className="mt-12 grid items-start gap-8 lg:grid-cols-2">
          <x.Shot />
          {x.Shot2 ? <x.Shot2 /> : null}
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate">A week in the workspace</div>
            <ol className="mt-3">{x.week.map(([d, t]) => <li key={d} className="grid grid-cols-[3rem_1fr] gap-3 border-t border-line py-3.5"><span className="num font-mono text-sm text-teal">{d}</span><span className="text-[15px]">{t}</span></li>)}</ol>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate">From the demo workspace</div>
            <dl className="mt-3">{x.figs.map(([a, b]) => <div key={b} className="flex items-baseline gap-4 border-t border-line py-3"><dt className="num w-24 shrink-0 font-display text-2xl font-semibold text-teal">{a}</dt><dd className="text-[14px] text-slate">{b}</dd></div>)}</dl>
          </div>
        </div>
      </div>
    </section>
  )
}

function IndustriesTab() {
  return (
    <>
      <nav aria-label="Industries" className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] gap-1 overflow-x-auto px-6 py-2.5">
          {INDUSTRIES.map((x) => <a key={x.id} href={`#${x.id}`} className="shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold text-slate hover:bg-cloud hover:text-ink">{x.name}</a>)}
        </div>
      </nav>
      {INDUSTRIES.map((x, n) => <IndustrySection key={x.id} x={x} n={n} />)}
    </>
  )
}

/* ------------------------------ PAGE ------------------------------ */

export function Solutions() {
  const [sp, setSp] = useSearchParams()
  const t = sp.get('t') === 'industries' ? 'industries' : 'solutions'
  const ind = t === 'industries'
  return (
    <main>
      <div className="on-dark bf-deep grid-fine text-white">
        <div className="mx-auto max-w-[1240px] px-6 pt-20 pb-12 lg:pt-28">
          <Eyebrow dark>{ind ? 'Industries' : 'Solutions'}</Eyebrow>
          <h1 className="mt-3 max-w-4xl text-5xl font-semibold leading-[1.05] sm:text-6xl">{ind ? 'See your operation in the workspace.' : 'Built for businesses that are outgrowing their tools.'}</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">{ind ? 'Six kinds of Nigerian business, walked through end to end. Every screen below is from the BizFlow demo workspace.' : 'People, money, operations and customers on one record, with approvals and audit built in from the start.'}</p>
          <div className="mt-8 flex gap-2" role="tablist">
            {(['solutions', 'industries'] as const).map((x) => (
              <button key={x} role="tab" aria-selected={t === x} onClick={() => setSp(x === 'industries' ? { t: x } : {})} className={`cursor-pointer rounded-md px-4 py-2 text-sm font-semibold capitalize transition-colors ${t === x ? 'bg-mint text-midnight' : 'border border-white/20 text-white/80 hover:bg-white/10'}`}>{x}</button>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-[13px] text-white/55">Scenarios are illustrative, based on how BizFlow modules connect. Figures come from a demo company, not from customers.</p>
        </div>
      </div>
      {ind ? <IndustriesTab /> : <SolutionsTab />}
      <Cta title={ind ? 'Try it with your own branches, people and suppliers.' : 'Set up your company in an afternoon.'} sub="Start free, invite your team, and see your own numbers in the same screens you just saw." />
    </main>
  )
}
