import { useState } from 'react'
import { Link2, ShieldCheck, MapPin, Eye, Users, Sprout, Target, Telescope, Quote } from 'lucide-react'
import { Btn, Flow, Field, inputCls } from '../../components/ui'

function Hero({ eyebrow, title, desc }: { eyebrow: string; title: string; desc: string }) {
  return (
    <div className="on-dark bf-deep grid-fine text-white">
      <div className="mx-auto max-w-[1240px] px-6 py-20 lg:py-28">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-mint">{eyebrow}</div>
        <h1 className="mt-3 max-w-4xl text-5xl font-semibold leading-[1.05] sm:text-6xl">{title}</h1>
        <p className="mt-6 max-w-2xl text-lg text-white/70">{desc}</p>
      </div>
    </div>
  )
}

const PILLARS = [
  { id: 'people', k: 'People', t: 'Hire, onboard and manage from one record.', flow: ['Invite link', 'Self-onboarding', 'HR review', 'Activated', 'Payroll', 'My BizFlow'], items: ['HR, organisation, positions and job levels', 'Secure employee self-onboarding links', 'Leave, attendance and hybrid schedules', 'Recruitment Lite and offboarding'] },
  { id: 'money', k: 'Money', t: 'Payroll and accounting that agree with each other.', flow: ['Payroll run', 'Approval', 'Lock', 'Disburse', 'Ledger', 'Cost centre'], items: ['PAYE, pension, NHF and NSITF', 'Salary advance and salary-on-demand', 'Chart of accounts, GL, AP and AR', 'P&L, balance sheet, cash flow, budgets'] },
  { id: 'operations', k: 'Operations', t: 'Move work forward without chasing people.', flow: ['Request', 'Approve', 'Purchase order', 'Receipt', 'Asset', 'Maintenance'], items: ['Universal requests and approval inbox', 'Procurement Lite and vendors', 'Assets with full lifecycle history', 'Fleet built on top of assets'] },
  { id: 'customers', k: 'Customers', t: 'A lighter CRM that connects to the invoice.', flow: ['Lead', 'Opportunity', 'Customer', 'Invoice', 'Payment'], items: ['Leads, pipeline and follow-ups', 'Customer profile and activity history', 'Invoices and receivables from the ledger', 'Documents attached to the customer'] },
  { id: 'control', k: 'Control', t: 'Approvals, documents and audit, everywhere.', flow: ['Create', 'Review', 'Approve', 'Sign', 'Store', 'Audit'], items: ['BizFlow Sign with role-based recipients', 'Permissions by role, permission and scope', 'Immutable audit trail', 'Business Health and reports'] },
]

export function Product() {
  return (
    <main>
      <Hero eyebrow="Product" title="Five pillars. One shared business core." desc="Modules sit on a common foundation of identity, permissions, workflow, documents and audit, so nothing is entered twice." />
      {PILLARS.map((p, i) => (
        <section id={p.id} key={p.id} className={`scroll-mt-20 py-20 ${i % 2 ? 'bg-white border-y border-line' : ''}`}>
          <div className="mx-auto grid max-w-[1240px] gap-10 px-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <div className="num font-mono text-sm text-teal">0{i + 1}</div>
              <h2 className="mt-2 text-4xl font-semibold">{p.k}</h2>
              <p className="mt-3 max-w-sm text-lg text-slate">{p.t}</p>
            </div>
            <div>
              <Flow steps={p.flow} />
              <ul className="mt-8 grid gap-x-8 sm:grid-cols-2">
                {p.items.map((x) => <li key={x} className="border-t border-line py-3.5 text-[15px] font-medium">{x}</li>)}
              </ul>
            </div>
          </div>
        </section>
      ))}
      <div className="py-20 text-center"><Btn s="lg" to="/admin/business">Explore BizFlow</Btn></div>
    </main>
  )
}

const SEC = [
  ['Tenant isolation', 'Every query is validated server-side against the tenant. Company A cannot reach Company B.'],
  ['Authentication', 'Strong password hashing, secure sessions, rate limiting and MFA for administrators.'],
  ['Authorization', 'Role, permission and scope, with object-level checks on every record.'],
  ['Encryption', 'TLS in transit, encryption at rest, and field-level encryption for highly sensitive data.'],
  ['Audit logging', 'Append-only history of who did what, when, and at which workflow stage.'],
  ['Secure files', 'Private storage with short-lived signed URLs and secure upload handling.'],
  ['Backups', 'Encrypted backups with point-in-time recovery.'],
  ['API security', 'Input validation, CSRF and XSS protection, CSP and HSTS.'],
  ['Payment security', 'Verified webhooks, replay protection and idempotent transactions.'],
  ['Financial controls', 'Audit reviews every request before the MD, and each company can add Compliance, HR or Legal by request type and amount. The MD gives the final approval, then Finance disburses by tier: the Finance Officer up to ₦500,000, the CFO above. Companies can adopt or set their own range. Nobody approves again after the MD.'],
  ['Monitoring', 'WAF, DDoS and bot protection, dependency scanning and vulnerability management.'],
  ['Privacy', 'Designed with NDPA principles: purpose limits, access control and data minimisation.'],
]
export function Security() {
  return (
    <main>
      <Hero eyebrow="Security" title="Designed so one company's problem never becomes another's." desc="Security shapes the architecture and the interface. We describe what the platform is designed to do and make no certification claims we have not earned." />
      <div className="mx-auto max-w-[1240px] px-6 py-16">
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {SEC.map(([a, b], i) => (
            <div key={a} className="bg-white p-7"><div className="num font-mono text-xs text-teal">{String(i + 1).padStart(2, '0')}</div><h3 className="mt-2 text-lg font-semibold">{a}</h3><p className="mt-2 text-sm text-slate">{b}</p></div>
          ))}
        </div>
        <div className="on-dark mt-12 rounded-lg bg-midnight p-8 text-white lg:p-12">
          <h2 className="text-3xl font-semibold">Support access is just-in-time.</h2>
          <div className="mt-6"><Flow dark steps={['Reason required', 'Time-limited grant', 'Customer notified', 'Session recorded', 'Access expires']} /></div>
        </div>
      </div>
    </main>
  )
}

const VALUES = [
  { icon: Link2, t: 'One version of the truth', d: 'Information is entered once and trusted everywhere. We would rather connect two modules properly than ship a third that stands alone.' },
  { icon: ShieldCheck, t: 'Control without friction', d: 'Approvals, permissions and audit trails should protect a company without slowing the people doing the work.' },
  { icon: MapPin, t: 'Built for Nigeria first', d: 'Naira, PAYE and pension, branches across states, and teams split between office, home and the field are the default, not an add-on.' },
  { icon: Eye, t: 'Plain and honest', d: 'Clear pricing, clear language and no certification claims we have not earned. If a feature is not ready, we say so.' },
  { icon: Users, t: 'People before process', d: 'Software exists to give managers and staff their time back. Every screen is judged by whether it makes someone’s day easier.' },
  { icon: Sprout, t: 'Grow with the customer', d: 'Start with the modules you need today and add more as the business grows, without migrating or starting over.' },
]

const PRINCIPLES = [
  ['Enter once', 'An employee becomes payroll, attendance and assets. A vendor becomes a payable. A document becomes an audit trail.'],
  ['Approve once', 'Requests follow the company’s own chain, and nobody approves again after the final sign-off.'],
  ['Explain everything', 'Every figure traces back to the record, the person and the moment it came from.'],
]

export function About() {
  return (
    <main>
      <Hero eyebrow="About BizFlow" title="Growing businesses deserve one version of the truth." desc="BizFlow exists because the tools a company outgrows into are rarely connected to each other. We are building the connected operating platform Nigerian businesses can run on." />

      <section className="mx-auto grid max-w-[1240px] gap-12 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-teal">Our story</div>
          <h2 className="mt-3 text-4xl font-semibold leading-tight">Six tools, one company, and a lot of retyping.</h2>
        </div>
        <div className="space-y-6 text-lg leading-relaxed text-ink/85">
          <p>A business of forty people often runs on six tools. HR lives in one, payroll in another, the ledger in a spreadsheet, approvals in a chat group and contracts in a shared folder.</p>
          <p className="font-display text-2xl font-medium leading-snug text-teal">Every handoff between them is a place where information is retyped, delayed or lost.</p>
          <p>BizFlow starts from the opposite premise. Enter information once and let the platform use it wherever it is needed. We are building Nigeria-first, so the result is simple to understand and serious enough to run a company on.</p>
        </div>
      </section>

      <section className="on-dark bf-deep grid-fine text-white">
        <div className="mx-auto grid max-w-[1240px] gap-px px-6 py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-mint"><Target size={15} /> Mission</div>
            <p className="mt-5 text-3xl font-semibold leading-snug sm:text-4xl">To give every growing Nigerian business the connected systems of a much larger company.</p>
            <p className="mt-5 max-w-lg text-white/70">People, money, operations, customers and control on one shared core, priced and designed so a business of forty can start today and a business of four thousand never has to leave.</p>
          </div>
          <div className="mt-12 border-t border-white/15 pt-12 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-16 lg:pt-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-mint"><Telescope size={15} /> Vision</div>
            <p className="mt-5 text-3xl font-semibold leading-snug sm:text-4xl">A country where running a business well is limited by ambition, not by paperwork.</p>
            <p className="mt-5 max-w-lg text-white/70">We see a day when payroll closes itself, approvals never wait on a forwarded message, and every owner can see the true state of the company in a single view.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-6 py-20">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-teal">Core values</div>
          <h2 className="mt-3 text-4xl font-semibold leading-tight">What we hold ourselves to.</h2>
          <p className="mt-3 text-lg text-slate">Six commitments that shape the product, the way we price it and the way we treat the businesses that trust us.</p>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {VALUES.map((v, i) => (
            <div key={v.t} className="group bg-white p-8 transition-colors hover:bg-cloud">
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-teal/10 text-teal transition-colors group-hover:bg-teal group-hover:text-white"><v.icon size={20} /></span>
                <span className="num font-mono text-xs text-slate">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-6 text-xl font-semibold">{v.t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate">{v.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-16 md:grid-cols-3">
          {PRINCIPLES.map(([a, b]) => (
            <div key={a} className="border-t-2 border-teal pt-5"><h3 className="text-2xl font-semibold">{a}</h3><p className="mt-2 text-slate">{b}</p></div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-[0.45fr_1fr] lg:gap-20">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-teal">Founders’ message</div>
            <h2 className="mt-3 text-4xl font-semibold leading-tight">A note from the people building BizFlow.</h2>
            <div className="mt-8 flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-midnight font-display text-xl font-semibold text-mint">BF</span>
              <div><div className="font-semibold">The BizFlow founding team</div><div className="text-sm text-slate">Lagos, Nigeria</div></div>
            </div>
          </div>
          <figure className="relative rounded-lg border border-line bg-white p-8 sm:p-12">
            <Quote size={36} className="text-mint" aria-hidden />
            <blockquote className="mt-4 space-y-5 text-lg leading-relaxed text-ink/85">
              <p>We have all sat in the meeting where nobody could say how many people the company employed, because HR, payroll and finance each had a different number. It is not a people problem. It is a tools problem.</p>
              <p>Nigerian businesses run on ambition and resourcefulness, and they deserve software that matches it: software that understands the naira, the statutory deductions, the branch in Kano and the driver on the road to Port Harcourt.</p>
              <p>So we set out to build one platform rather than six. One that is honest about what it can do, careful with your data, and generous enough in its pricing that a small team can begin today. We will keep listening to you and keep building.</p>
              <p className="font-display text-2xl font-medium text-teal">Thank you for trusting us with the way your company runs.</p>
            </blockquote>
            <figcaption className="mt-8 border-t border-line pt-5 text-sm font-semibold">The BizFlow founding team</figcaption>
          </figure>
        </div>
      </section>

      <section className="on-dark bg-midnight text-white">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-6 px-6 py-16 md:flex-row md:items-center">
          <h2 className="max-w-xl text-3xl font-semibold leading-snug">See what one connected platform feels like for your business.</h2>
          <div className="flex gap-3"><Btn s="lg" to="/get-started">Get started</Btn><Btn s="lg" v="secondary" to="/contact">Talk to us</Btn></div>
        </div>
      </section>
    </main>
  )
}

const FAQS = [
  ['What is BizFlow?', 'A connected business platform covering people, money, operations, customers and control on one shared core.'],
  ['Who is it for?', 'Growing SMEs and mid-sized businesses, including multi-branch and field-based teams.'],
  ['How does onboarding work?', 'Create a workspace, choose a plan, and follow a guided setup. Skip any step and return later.'],
  ['Is my data isolated from other companies?', 'Yes. Tenant isolation is enforced server-side on every request.'],
  ['Does payroll handle Nigerian statutory deductions?', 'Payroll is designed for PAYE, pension, NHF and NSITF.'],
  ['How do employees join?', 'HR generates a secure unique link. The employee completes their own details and HR approves.'],
  ['How does hybrid work affect attendance?', 'Schedules specify expected location per day, so remote days are never counted as absent.'],
  ['What is BizFlow Sign?', 'Native signing and approval of documents, with recipients resolved by role and a full audit trail.'],
  ['Can I cancel?', 'Yes. Cancel at the end of any billing period and export your data.'],
]
export function Contact() {
  const [sent, setSent] = useState(false)
  return (
    <main className="mx-auto max-w-[1240px] px-6 py-20">
      <div className="grid gap-14 lg:grid-cols-2">
        <div>
          <h1 className="text-5xl font-semibold leading-tight">Talk to the BizFlow team.</h1>
          <p className="mt-4 text-lg text-slate">Tell us about your business and we will reply within one working day.</p>
          {sent ? (
            <div className="mt-8 rounded-lg border border-ok/30 bg-green-50 p-6" role="status"><b>Message sent</b><p className="mt-1 text-sm text-slate">Thanks. A member of our team will be in touch shortly.</p></div>
          ) : (
            <form className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); setSent(true) }}>
              <Field label="I'm contacting about"><select className={inputCls}><option>Sales</option><option>Product questions</option><option>Support</option><option>Partnership</option></select></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name"><input required className={inputCls} /></Field>
                <Field label="Work email"><input required type="email" className={inputCls} /></Field>
              </div>
              <Field label="How can we help?"><textarea required rows={4} className={`${inputCls} h-auto py-2`} /></Field>
              <Btn type="submit">Send message</Btn>
            </form>
          )}
        </div>
        <div id="faq" className="scroll-mt-24">
          <h2 className="text-3xl font-semibold">Frequently asked</h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {FAQS.map(([q, a]) => (
              <details key={q} className="py-4"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-2 text-sm text-slate">{a}</p></details>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
