import { useState } from 'react'
import { Link } from 'react-router'
import { Btn, Flow } from '../../components/ui'
import HeroFlow from '../../components/site/HeroFlow'
import { defaultCurrency, isCustom, money, publicPlans, useBilling } from '../../data/billing'
import { Area, AreaChart, ResponsiveContainer, XAxis, Tooltip } from 'recharts'
import { REVENUE } from '../../data/demo'

const STORIES = [
  {
    k: 'Employee', h: 'One employee. Many connected workflows.',
    p: 'Add Chinedu once. He appears in payroll with the right PAYE and pension, in attendance with his hybrid schedule, in tasks, assets and documents.',
    flow: ['Employee', 'HR', 'Payroll', 'Tasks', 'Assets', 'Documents', 'Requests'],
    rows: [['HR', 'Senior Software Engineer · Abuja Branch'], ['Payroll', '₦850,000 gross · PAYE and pension computed'], ['Attendance', 'Mon, Wed, Fri office · Tue, Thu remote'], ['Assets', 'Dell Latitude 5440 · AST-00418']],
  },
  {
    k: 'Request', h: 'One request. One approval flow.',
    p: 'BizFlow sets the standard: the Manager reviews, Audit checks every request, the MD gives the final approval and Finance disburses. Your company adds Compliance, HR or Legal wherever its rules need them. Nobody approves after the MD.',
    flow: ['Request', 'Manager', 'Audit', 'MD approval', 'Finance disburses by tier', 'Audit trail'],
    rows: [['Leave and non-cash requests', 'Manager → Audit'], ['Any request involving money', 'Manager → Audit → MD (final)'], ['Company-added steps', 'Compliance, HR or Legal by type and amount'], ['After MD approval', 'Finance Officer to ₦500k, CFO above'], ['Audit', 'Every decision timestamped']],
  },
  {
    k: 'Asset', h: 'One asset. Complete lifecycle.',
    p: 'From the first purchase request to disposal, the asset keeps its cost centre, custodian and history. Handover is signed in BizFlow Sign.',
    flow: ['Request', 'Procurement', 'Acquisition', 'Assignment', 'Maintenance', 'Return'],
    rows: [['Purchased', '4 Oct · ₦1,250,000'], ['Assigned', '10 Oct · Amaka Obi'], ['Cost centre', 'CC-210 Platform'], ['Warranty', 'Until 14 Mar 2027']],
  },
  {
    k: 'Document', h: 'One document. From creation to signature.',
    p: 'Generate an employment contract from live employee data, route it by role, and store the signed copy against the employee with a full audit trail.',
    flow: ['Create', 'Review', 'Approve', 'Sign', 'Store', 'Audit'],
    rows: [['Template', 'Employment Contract'], ['Signing order', 'Employee → Manager → HR → MD'], ['Variables', '{{employee.name}} · {{salary}}'], ['Stored', 'Employee file · immutable audit']],
  },
]

export default function Home() {
  const [s, setS] = useState(0)
  const st = STORIES[s]
  const billing = useBilling()
  const plans = publicPlans(billing)
  const cur = defaultCurrency(billing)
  return (
    <main>
      <section className="on-dark bf-deep grid-fine relative overflow-hidden text-white">
        <div className="mx-auto grid max-w-[1240px] items-center gap-10 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div className="reveal">
            <div className="mb-6 inline-flex items-center gap-2 rounded border border-white/15 px-3 py-1 text-xs font-semibold tracking-wider text-mint">
              <span className="size-1.5 rounded-full bg-mint" /> NIGERIA-FIRST BUSINESS PLATFORM
            </div>
            <h1 className="text-[44px] font-semibold leading-[1.02] sm:text-[64px] lg:text-[76px]">
              Your business.<br /><span className="text-mint">One connected flow.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              BizFlow brings people, money, work, assets, customers and operations into one connected business platform.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Btn v="mint" s="lg" to="/get-started">Get Started</Btn>
              <Btn v="secondary" s="lg" to="/admin/business" className="border-white/25! bg-transparent! text-white! hover:bg-white/10!">Explore BizFlow</Btn>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-white/50">
              {['People', 'Money', 'Work', 'Assets', 'Customers', 'Operations'].map((x) => <span key={x}>{x}.</span>)}
            </div>
          </div>
          <HeroFlow />
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-teal">Everything connected</div>
            <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Enter it once.<br />BizFlow uses it everywhere.</h2>
            <p className="mt-5 max-w-md text-lg text-slate">Most growing businesses run on a payroll tool, a spreadsheet ledger, a chat thread for approvals and a folder of PDFs. Each holds a different version of the truth.</p>
          </div>
          <div className="divide-y divide-line border-y border-line">
            {[
              ['Employee', 'HR · Payroll · Attendance · Leave · Tasks · Assets · Documents'],
              ['Vendor', 'Procurement · Payables · Expenses · Documents · Reporting'],
              ['Customer', 'Opportunities · Follow-ups · Invoices · Receivables · Documents'],
              ['Asset', 'Procurement · Accounting · Custodian · Maintenance · Cost centre'],
            ].map(([a, b]) => (
              <div key={a} className="grid grid-cols-[110px_1fr] items-baseline gap-4 py-5">
                <div className="font-display text-xl font-semibold">{a}</div>
                <div className="text-[15px] text-slate">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-white py-24">
        <div className="mx-auto max-w-[1240px] px-6">
          <div role="tablist" className="mb-10 flex flex-wrap gap-2">
            {STORIES.map((x, i) => (
              <button key={x.k} role="tab" aria-selected={i === s} onClick={() => setS(i)} className={`cursor-pointer rounded-md px-4 py-2 text-sm font-semibold transition-colors ${i === s ? 'bg-midnight text-white' : 'bg-cloud text-slate hover:text-ink'}`}>{x.k}</button>
            ))}
          </div>
          <div key={s} className="reveal grid gap-12 lg:grid-cols-[1fr_1fr]">
            <div>
              <h2 className="text-4xl font-semibold leading-tight sm:text-5xl">{st.h}</h2>
              <p className="mt-5 max-w-lg text-lg text-slate">{st.p}</p>
              <div className="mt-8"><Flow steps={st.flow} /></div>
            </div>
            <div className="rounded-lg bg-midnight p-6 text-white on-dark">
              <div className="mb-4 flex items-center gap-2 text-xs text-white/50"><span className="size-2 rounded-full bg-mint" /> LIVE RECORD · DEMO DATA</div>
              {st.rows.map(([a, b]) => (
                <div key={a} className="flex justify-between gap-4 border-t border-white/10 py-3.5 text-sm">
                  <span className="text-white/50">{a}</span><span className="num text-right font-medium">{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="on-dark bg-midnight py-24 text-white">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-mint">Know your business</div>
            <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Business Health, in seconds.</h2>
            <p className="mt-5 max-w-md text-lg text-white/65">What is happening, what needs attention, where the problem is, and what to do next. Drill from company to branch to department to cost centre.</p>
            <div className="mt-8"><Btn v="mint" to="/admin/business">Explore Business Health</Btn></div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs text-white/50">Revenue vs expenses · ₦M · Demo company</div>
                <div className="num mt-1 font-display text-5xl font-semibold">₦56.9M</div>
                <div className="num mt-1 text-sm text-mint">▲ 8.8% vs September</div>
              </div>
              <div className="rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-amber-200">3 approvals waiting over 48 hours</div>
            </div>
            <div className="mt-4 h-44">
              <ResponsiveContainer>
                <AreaChart data={REVENUE}>
                  <defs>
                    <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#35D0BA" stopOpacity=".45" /><stop offset="1" stopColor="#35D0BA" stopOpacity="0" /></linearGradient>
                  </defs>
                  <XAxis dataKey="m" tick={{ fill: '#94a9ae', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#0B2530', border: '1px solid #123340', color: '#fff', borderRadius: 6 }} />
                  <Area dataKey="exp" stroke="#94a9ae" strokeWidth={1.5} fill="none" />
                  <Area dataKey="rev" stroke="#35D0BA" strokeWidth={2.5} fill="url(#hg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-6 py-24">
        <h2 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">Built for the way growing businesses operate.</h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Branches are first-class', 'Every record knows its branch, department and cost centre. Switch scope in one click.'],
            ['Hybrid work, understood', 'Attendance knows who is scheduled remote. Remote is never marked absent.'],
            ['Nigerian payroll', 'PAYE, pension, NHF and NSITF, plus salary-on-demand tied to the payroll run.'],
            ['Sign without leaving', 'BizFlow Sign routes contracts, handovers and agreements by role.'],
          ].map(([a, b]) => (
            <div key={a} className="bg-cloud p-7">
              <h3 className="text-xl font-semibold leading-snug">{a}</h3>
              <p className="mt-3 text-[15px] text-slate">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-softmint/50 py-24">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-teal">Security and trust</div>
            <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">A compromise of Company A must never expose Company B.</h2>
            <div className="mt-8"><Btn v="dark" to="/security">Read how we protect your data</Btn></div>
          </div>
          <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {['Strict tenant isolation', 'Role, permission and scope access', 'MFA for administrators', 'MD final-approval financial controls', 'Immutable audit history', 'Private document storage', 'Encrypted backups', 'NDPA-conscious privacy controls'].map((x) => (
              <li key={x} className="flex gap-3 border-b border-teal/20 pb-4 text-[15px] font-medium"><span className="text-teal">✓</span>{x}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-4xl font-semibold sm:text-5xl">Pricing</h2>
          <Link to="/pricing" className="text-sm font-semibold text-teal">Compare all plans →</Link>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => {
            const pr = p.prices[cur]
            return (
              <div key={p.id} className={`rounded-lg border p-7 ${p.recommended ? 'border-midnight bg-midnight text-white on-dark' : 'border-line bg-white'}`}>
                <div className="text-sm font-semibold text-mint">{p.name}</div>
                <div className="num mt-3 font-display text-4xl font-semibold">{isCustom(p) || !pr ? 'Custom' : money(pr.monthly, cur, { trim: true, s: billing })}{!isCustom(p) && pr && <span className="text-sm font-normal opacity-60"> / month</span>}</div>
                <p className={`mt-3 text-sm ${p.recommended ? 'text-white/65' : 'text-slate'}`}>{p.tagline}</p>
              </div>
            )
          })}
        </div>
        </section>

      <section className="on-dark bf-deep grid-fine py-28 text-center text-white">
        <h2 className="mx-auto max-w-3xl px-6 text-5xl font-semibold leading-tight sm:text-6xl">Run your business from one connected platform.</h2>
        <div className="mt-10 flex justify-center gap-3">
          <Btn v="mint" s="lg" to="/get-started">Get Started</Btn>
          <Btn s="lg" to="/contact" className="border border-white/25 bg-transparent text-white hover:bg-white/10">Talk to sales</Btn>
        </div>
      </section>
    </main>
  )
}
