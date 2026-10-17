import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Check, ChevronDown, Minus, Plus } from 'lucide-react'
import { Btn } from '../../components/ui'
import {
  GROUPS, LIMIT_DEFS, activeCurrencies, addonPrice, currencyOf, defaultCurrency, fmtLimit, isCustom, loadSelection, money, planCost, publicPlans, recommendPlan, saveSelection, selectionQuery, tierLabel, useBilling, fitsEmployees,
} from '../../data/billing'
import { ALL_FEATURES, MODULES as CATALOG } from '../../data/billing'
import type { Addon, BillingState, GroupId, Plan } from '../../data/billing'

const COMPARE: Record<GroupId, [string, string][]> = {
  people: [['HR & People', 'people.core'], ['Recruitment', 'recruitment.core'], ['Employee Onboarding', 'onboarding.core'], ['8-step onboarding wizard', 'onboarding.wizard'], ['Organisation chart', 'orgchart.core'], ['Org chart hierarchy insights', 'orgchart.insights'], ['Grade structure', 'rules.grades'], ['Salary matrix', 'rules.matrix'], ['Department rule overrides', 'rules.overrides'], ['Exit management', 'exit.core'], ['Clearance & final settlement', 'exit.clearance'], ['Attendance & Time', 'attendance.core'], ['Hybrid & Remote Work', 'hybrid.core'], ['Leave Management', 'leave.core'], ['Performance', 'performance.core'], ['Advanced Performance', 'performance.advanced'], ['Employee Self-Service', 'ess.core']],
  money: [['Payroll', 'payroll.core'], ['PAYE', 'payroll.paye'], ['Pension', 'payroll.pension'], ['NHF', 'payroll.nhf'], ['NSITF', 'payroll.nsitf'], ['Salary Advance', 'payroll.advance'], ['Salary-on-Demand', 'payroll.sod'], ['Accounting', 'accounting.core'], ['Expenses', 'expenses.core'], ['Accounts Payable', 'payables.core'], ['Accounts Receivable', 'receivables.core'], ['Budgeting', 'budgeting.core'], ['Employee Wallet', 'wallet.core']],
  operations: [['Requests', 'requests.core'], ['Approvals', 'approvals.core'], ['Advanced approvals', 'approvals.advanced'], ['Travel', 'travel.requests'], ['Procurement', 'procurement.core'], ['Advanced procurement', 'procurement.advanced'], ['Assets', 'assets.register'], ['Advanced asset management', 'assets.maintenance'], ['Fleet', 'fleet.core'], ['Vendor management', 'vendors.register'], ['Vendor financial analysis', 'vendors.financials'], ['Vendor performance evaluation', 'vendors.performance'], ['Tasks', 'tasks.core']],
  customers: [['Leads', 'crm.leads'], ['Customers', 'crm.customers'], ['Opportunities', 'crm.opportunities'], ['Sales pipeline', 'crm.pipeline'], ['Advanced CRM', 'crm.advanced']],
  workflow: [['Documents', 'documents.core'], ['Document templates', 'documents.templates'], ['Letterhead documents', 'documents.letterhead'], ['BizFlow Sign', 'sign.sign'], ['Smart Documents', 'sign.smart'], ['Business workflows', 'workflows.core'], ['Advanced workflows', 'workflows.advanced'], ['Email activity notifications', 'messaging.core'], ['Audit trail', 'audit.core']],
  insights: [['Business Health', 'health.core'], ['Reports', 'reports.basic'], ['Advanced reporting', 'reports.advanced'], ['Analytics', 'reports.analytics'], ['Branch management', 'branches.core'], ['Cost centres', 'costcentres.core'], ['Advanced cost centres', 'costcentres.advanced'], ['Brand colours', 'branding.core'], ['Sidebar colours', 'branding.sidebar'], ['White-label branding', 'branding.whitelabel'], ['Support consent', 'security.consent'], ['Security governance', 'security.core'], ['Break-glass access', 'security.breakglass'], ['Permissions', 'permissions.core'], ['Advanced permissions', 'permissions.advanced'], ['Enhanced audit', 'audit.enhanced'], ['API access', 'integrations.api']],
}

const FAQ: [string, string][] = [
  ['Can I change plans later?', 'Yes. Upgrades take effect as soon as payment is confirmed. Downgrades take effect at your next renewal so payroll runs, approvals and signing already in progress are never interrupted.'],
  ['Is there a free trial?', 'Plans with a trial show a Start Free Trial button. Your trial length is shown at checkout, and your trial status stays visible inside BizFlow with an Upgrade Now button.'],
  ['Can I add modules later?', 'Yes. Optional capabilities can be added from Settings → Billing & Subscription at any time and are active immediately.'],
  ['What happens if my employee count increases?', 'Each plan includes an employee allowance. Above it, additional employees are billed at the rate shown on the plan card, up to the plan limit. You are notified before you reach a limit.'],
  ['Can I cancel?', 'Yes. You keep access until the end of the period you have paid for. You can reactivate at any time.'],
  ['What happens to my data after cancellation?', 'Your data is retained according to our retention policy and is not deleted when a plan or module changes. If you reactivate, it becomes available again.'],
  ['Can I switch from monthly to annual?', 'Yes. Change your billing cycle from Billing & Subscription. Annual billing is priced lower than twelve monthly payments.'],
  ['Can I add Fleet later?', 'Yes. Fleet is included in Business and is available as an add-on to Growth.'],
  ['Can I add Travel later?', 'Yes. Travel is included in Business and Enterprise, and can be added to Starter and Growth as a paid module from Billing & Subscription.'],
  ['Is Vendor Management included?', 'Vendor Management is included in Business and Enterprise. Starter and Growth can activate it as an optional capability inside BizFlow.'],
  ['Can I use BizFlow across multiple branches?', 'Yes. Each plan includes a branch allowance. Business adds multi-branch management and branch-scoped reporting; Enterprise supports multi-company structures.'],
  ['What currencies are supported?', 'Pricing is configured per currency and shown in the selector above. Availability varies by plan and region; tax is added at checkout where it applies.'],
  ['Is implementation support available?', 'Business customers can request guided onboarding. Enterprise includes implementation assistance and a dedicated support contact.'],
  ['Can Enterprise plans be customized?', 'Yes. Enterprise covers custom deployment, security, integrations, approval architecture, SLAs and contracts, priced to your structure.'],
]

const STEPS = [
  ['Choose your plan', 'Start with the capabilities your business needs today.'],
  ['Add what you need', 'Add optional capabilities as your business grows.'],
  ['Connect your business', 'Set up your company, branches, employees and workflows.'],
  ['Scale with BizFlow', 'Upgrade plans or add capabilities without replacing your platform.'],
]

function cellFor(s: BillingState, p: Plan, feature: string): 'in' | 'addon' | 'out' {
  if (p.features.includes(feature)) return 'in'
  return s.addons.some((a) => a.active && a.plans.includes(p.id) && a.grants.includes(feature)) ? 'addon' : 'out'
}

export default function Pricing() {
  const s = useBilling()
  const saved = useMemo(loadSelection, [])
  const [cur, setCur] = useState(() => (saved && currencyOf(s, saved.currency)?.enabled ? saved.currency : defaultCurrency(s)))
  const [annual, setAnnual] = useState(saved ? saved.cycle === 'annual' : true)
  const [emp, setEmp] = useState(saved?.employees ?? 25)
  const [open, setOpen] = useState<Record<string, boolean>>({ people: true })
  const cycle = annual ? 'annual' : 'monthly'
  const plans = publicPlans(s)
  const rec = recommendPlan(s, emp, cur)
  const sel = (p: Plan) => ({ planId: p.id, cycle: cycle as 'monthly' | 'annual', currency: cur, employees: Math.max(emp, 1), addons: [] as string[] })
  const addons = s.addons.filter((a) => a.active && addonPrice(a, cur, cycle) !== null)
  const cols = `minmax(170px,1.5fr) repeat(${plans.length}, minmax(112px,1fr))`

  return (
    <main>
      <section className="on-dark bf-deep grid-fine pb-28 pt-20 text-white">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="reveal max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">Pricing</div>
            <h1 className="mt-3 text-5xl font-semibold leading-[1.05] sm:text-6xl">One platform. Built around your business.</h1>
            <p className="mt-5 max-w-2xl text-lg text-white/70">Start with what you need today and expand as your business grows. People, money, operations, customers and documents share one connected core.</p>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <div className="inline-flex rounded-md border border-white/15 bg-white/5 p-1 text-sm font-semibold" role="group" aria-label="Billing frequency">
              {([['Monthly', false], ['Annual', true]] as const).map(([l, v]) => (
                <button key={l} aria-pressed={annual === v} onClick={() => setAnnual(v)} className={`cursor-pointer rounded px-5 py-1.5 transition-colors ${annual === v ? 'bg-mint text-midnight' : 'text-white/70 hover:text-white'}`}>{l}</button>
              ))}
            </div>
            <span className="text-sm text-mint">Save with annual billing</span>
            <label className="ml-auto flex items-center gap-2 text-sm text-white/70">Currency
              <select value={cur} onChange={(e) => setCur(e.target.value)} className="h-9 cursor-pointer rounded-md border border-white/15 bg-midnight-2 px-2 font-semibold text-white">
                {activeCurrencies(s).map((c) => <option key={c.code} value={c.code}>{c.code} {c.symbol}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-16 max-w-[1240px] px-6" aria-label="Plans">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => {
            const custom = isCustom(p); const pr = p.prices[cur]; const hot = p.recommended
            const trial = p.trialDays > 0
            return (
              <article key={p.id} className={`relative flex flex-col rounded-lg border bg-white p-6 ${hot ? 'border-teal shadow-[0_10px_30px_-18px_rgba(8,126,139,0.6)]' : 'border-line'}`}>
                {hot && <span className="absolute -top-2.5 left-6 rounded bg-teal px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">Recommended</span>}
                <h2 className="font-display text-2xl font-semibold">{p.name}</h2>
                <p className="mt-1 min-h-[40px] text-sm text-slate">{p.tagline}</p>
                <div className="mt-5 min-h-[92px]">
                  {custom ? (
                    <><div className="font-display text-4xl font-semibold">Custom</div><div className="mt-1 text-xs text-slate">Priced to your structure, contract and SLA.</div></>
                  ) : pr ? (
                    <>
                      <div className="num font-display text-4xl font-semibold">{money(annual ? pr.annual / 12 : pr.monthly, cur, { trim: true, s })}<span className="text-sm font-normal text-slate"> / month</span></div>
                      <div className="mt-1 text-xs text-slate">{annual ? <>Billed {money(pr.annual, cur, { trim: true, s })} yearly · saves {money(pr.monthly * 12 - pr.annual, cur, { trim: true, s })}</> : <>Billed monthly · {money(pr.annual, cur, { trim: true, s })} if paid yearly</>}</div>
                    </>
                  ) : (
                    <><div className="font-display text-2xl font-semibold">Not priced in {cur}</div><div className="mt-1 text-xs text-slate">Choose another currency or talk to sales.</div></>
                  )}
                </div>
                <div className="mt-4 border-t border-line pt-4 text-sm">
                  <div className="font-semibold">{custom ? 'Unlimited employees' : `Includes ${p.includedEmployees} employees`}</div>
                  <div className="text-xs text-slate">{custom ? 'Scoped to your organization' : <>Up to {fmtLimit('employees', p.limits.employees)}{pr?.extraMonthly ? ` · +${money(annual ? pr.extraAnnual ?? 0 : pr.extraMonthly, cur, { trim: true, s })} per extra employee / ${annual ? 'year' : 'month'}` : ''}</>}</div>
                </div>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {p.highlights.slice(0, 5).map((h) => <li key={h} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-teal" aria-hidden />{h}</li>)}
                </ul>
                <div className="mt-6">
                  {custom || !pr ? <Btn v="secondary" className="w-full" to="/contact">Talk to Sales</Btn>
                    : <Btn v={hot ? 'primary' : 'secondary'} className="w-full" to={`/get-started${selectionQuery(sel(p))}`} onClick={() => saveSelection(sel(p))}>{trial ? 'Start Free Trial' : 'Get Started'}</Btn>}
                  {!custom && pr && trial && <div className="mt-2 text-center text-xs text-slate">{p.trialDays}-day free trial</div>}
                </div>
              </article>
            )
          })}
        </div>
        <p className="mt-4 text-xs text-slate">Prices exclude tax unless shown otherwise at checkout. <Link to="/capabilities" className="font-semibold text-teal">Explore every capability →</Link></p>
      </section>

      <section className="mx-auto mt-20 max-w-[1240px] px-6" aria-labelledby="calc">
        <div className="grid gap-8 rounded-lg border border-line bg-white p-6 lg:grid-cols-[360px_1fr] lg:p-8">
          <div>
            <h2 id="calc" className="text-2xl font-semibold">How many employees do you have?</h2>
            <p className="mt-1 text-sm text-slate">Optional. See an estimate for your team size.</p>
            <div className="mt-5 flex items-center gap-2">
              <button aria-label="Decrease employees" onClick={() => setEmp(Math.max(1, emp - 5))} className="flex size-10 cursor-pointer items-center justify-center rounded-md border border-line hover:bg-cloud"><Minus size={16} /></button>
              <input aria-label="Number of employees" type="number" min={1} max={5000} value={emp} onChange={(e) => setEmp(Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} className="num h-10 w-24 rounded-md border border-line text-center font-display text-xl font-semibold focus:border-teal focus:outline-none" />
              <button aria-label="Increase employees" onClick={() => setEmp(Math.min(5000, emp + 5))} className="flex size-10 cursor-pointer items-center justify-center rounded-md border border-line hover:bg-cloud"><Plus size={16} /></button>
              <span className="ml-2 text-sm text-slate">{tierLabel(emp)} employees</span>
            </div>
            <div className="mt-6 rounded-lg bg-softmint/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate">Recommended plan</div>
              <div className="font-display text-2xl font-semibold">{rec?.name ?? '—'}</div>
              {rec && !isCustom(rec) && (() => {
                const m = planCost(rec, cur, 'monthly', emp); const a = planCost(rec, cur, 'annual', emp)
                return m && a ? <dl className="mt-2 space-y-1 text-sm"><div className="flex justify-between"><dt className="text-slate">Estimated monthly cost</dt><dd className="num font-semibold">{money(m.base + m.extra, cur, { trim: true, s })}</dd></div><div className="flex justify-between"><dt className="text-slate">Estimated annual cost</dt><dd className="num font-semibold">{money(a.base + a.extra, cur, { trim: true, s })}</dd></div></dl> : <p className="mt-1 text-sm text-slate">Not priced in {cur}.</p>
              })()}
              {rec && isCustom(rec) && <p className="mt-1 text-sm text-slate">Your size is beyond our standard plans. Enterprise is priced to your structure.</p>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-sm">
              <caption className="sr-only">Estimated cost by plan for {emp} employees</caption>
              <thead><tr className="text-xs uppercase tracking-wider text-slate"><th className="pb-2 pl-2 font-semibold">Plan</th><th className="pb-2 font-semibold">Per month</th><th className="pb-2 font-semibold">Per year</th><th className="pb-2 font-semibold">Fit</th></tr></thead>
              <tbody>
                {plans.map((p) => {
                  const m = planCost(p, cur, 'monthly', emp); const a = planCost(p, cur, 'annual', emp); const fits = isCustom(p) || fitsEmployees(p, emp)
                  return (
                    <tr key={p.id} className={`border-t border-line ${rec?.id === p.id ? 'bg-softmint/40' : ''}`}>
                      <td className="py-3 pl-2 font-semibold">{p.name}</td>
                      <td className="num py-3">{isCustom(p) ? 'Custom' : m && fits ? money(m.base + m.extra, cur, { trim: true, s }) : '—'}</td>
                      <td className="num py-3">{isCustom(p) ? 'Custom' : a && fits ? money(a.base + a.extra, cur, { trim: true, s }) : '—'}</td>
                      <td className="py-3 text-slate">{fits ? 'Fits your team' : `Up to ${fmtLimit('employees', p.limits.employees)} employees`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="compare" className="mx-auto mt-24 max-w-[1240px] scroll-mt-20 px-6" aria-labelledby="cmp">
        <h2 id="cmp" className="text-4xl font-semibold">Compare capabilities</h2>
        <p className="mt-2 max-w-2xl text-slate">Every plan shares the BizFlow core. Open a category to see what each plan includes and what can be added.</p>
        <div className="mt-8 divide-y divide-line rounded-lg border border-line bg-white">
          {[...GROUPS.map((g) => ({ id: g.id as string, name: g.name })), { id: 'limits', name: 'Usage & limits' }].map((g) => (
            <div key={g.id}>
              <button aria-expanded={!!open[g.id]} onClick={() => setOpen({ ...open, [g.id]: !open[g.id] })} className="flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left hover:bg-cloud">
                <span className="font-display text-lg font-semibold uppercase tracking-wide">{g.name}</span>
                <ChevronDown size={18} className={`text-slate transition-transform ${open[g.id] ? 'rotate-180' : ''}`} />
              </button>
              {open[g.id] && (
                <div className="overflow-x-auto border-t border-line">
                  <div className="min-w-[640px]" role="table" aria-label={`${g.name} comparison`}>
                    <div role="row" className="grid border-b border-line bg-cloud text-xs font-semibold uppercase tracking-wider text-slate" style={{ gridTemplateColumns: cols }}>
                      <div role="columnheader" className="sticky left-0 bg-cloud px-5 py-2.5">{g.id === 'limits' ? 'Limit' : 'Capability'}</div>
                      {plans.map((p) => <div role="columnheader" key={p.id} className={`px-3 py-2.5 ${p.recommended ? 'text-teal' : ''}`}>{p.name}</div>)}
                    </div>
                    {g.id === 'limits'
                      ? LIMIT_DEFS.map((d) => (
                        <div role="row" key={d.key} className="grid border-b border-line/70 text-sm last:border-0" style={{ gridTemplateColumns: cols }}>
                          <div role="rowheader" className="sticky left-0 bg-white px-5 py-3 font-medium">{d.label}{d.period ? <span className="text-slate"> {d.period}</span> : ''}</div>
                          {plans.map((p) => <div role="cell" key={p.id} className={`num px-3 py-3 ${p.recommended ? 'bg-teal/[0.04]' : ''}`}>{fmtLimit(d.key, p.limits[d.key])}</div>)}
                        </div>
                      ))
                      : COMPARE[g.id as GroupId].map(([label, key]) => (
                        <div role="row" key={key} className="grid border-b border-line/70 text-sm last:border-0" style={{ gridTemplateColumns: cols }}>
                          <div role="rowheader" className="sticky left-0 bg-white px-5 py-3 font-medium">{label}</div>
                          {plans.map((p) => {
                            const c = cellFor(s, p, key)
                            return (
                              <div role="cell" key={p.id} className={`flex items-center gap-1.5 px-3 py-3 ${p.recommended ? 'bg-teal/[0.04]' : ''}`}>
                                {c === 'in' && <><Check size={15} className="text-teal" aria-hidden /><span className="font-medium">Included</span></>}
                                {c === 'addon' && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-[#8a5a00]">Available as Add-on</span>}
                                {c === 'out' && <span className="text-slate"><span aria-hidden>—</span> Not included</span>}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                  </div>
                  {g.id !== 'limits' && <div className="border-t border-line px-5 py-3 text-xs"><Link to={`/capabilities#${g.id === 'workflow' ? 'workflow-documents' : g.id === 'insights' ? 'insights-control' : g.id}`} className="font-semibold text-teal">See {g.name} capabilities →</Link></div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-[1240px] px-6" aria-labelledby="addons">
        <h2 id="addons" className="text-4xl font-semibold">Add what you need</h2>
        <p className="mt-2 max-w-xl text-slate">Every module can be extended with optional capabilities and capacity from your private BizFlow billing settings.</p>
        <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {addons.map((a) => {
            return (
              <div key={a.id} className="bg-white p-5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-teal">{a.category}</div>
                <div className="mt-1 flex items-baseline justify-between gap-3"><h3 className="font-sans text-[16px] font-semibold tracking-normal">{a.name}</h3><span className="whitespace-nowrap text-xs font-semibold text-teal">Available in BizFlow</span></div>
                <p className="mt-1 text-sm text-slate">{a.description}</p>
                <p className="mt-2 text-xs text-slate">For {a.plans.map((id) => s.plans.find((p) => p.id === id)?.name).filter(Boolean).join(', ')}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-[1240px] px-6" aria-labelledby="how">
        <h2 id="how" className="text-4xl font-semibold">How BizFlow pricing works</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="border-t-2 border-midnight pt-4"><span className="num font-mono text-xs text-teal">0{i + 1}</span><h3 className="mt-1 font-sans text-[17px] font-semibold tracking-normal">{t}</h3><p className="mt-1 text-sm text-slate">{d}</p></li>
          ))}
        </ol>
      </section>

      <section id="faq" className="mx-auto mt-24 grid max-w-[1240px] scroll-mt-20 gap-10 px-6 lg:grid-cols-[1fr_1.6fr]">
        <div><h2 className="text-4xl font-semibold">Questions, answered.</h2><p className="mt-3 text-slate">Payments are processed by a PCI-compliant gateway. BizFlow never stores card numbers.</p></div>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between font-semibold">{q}<ChevronDown size={16} className="text-slate transition-transform group-open:rotate-180" /></summary><p className="mt-2 text-sm text-slate">{a}</p></details>
          ))}
        </div>
      </section>

      <section className="on-dark bf-deep grid-fine mt-24 py-24 text-white">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-8 px-6">
          <div className="max-w-2xl"><h2 className="text-4xl font-semibold leading-tight sm:text-5xl">Complex organization? Let's shape BizFlow around it.</h2><p className="mt-3 text-white/65">Custom deployment, advanced security, multi-company structures, API access, dedicated support and custom SLAs.</p></div>
          <Btn v="mint" s="lg" to="/contact">Talk to Sales</Btn>
        </div>
      </section>
    </main>
  )
}

function Comparison({ plans, addons }: { plans: Plan[]; addons: Addon[] }) {
  const [closed, setClosed] = useState<string[]>([])
  const cell = (p: Plan, key: string) => {
    if (p.features.includes(key)) return <span className="inline-flex items-center gap-1 font-semibold text-teal"><Check size={16} aria-hidden /><span className="sr-only">Included</span></span>
    const ad = addons.find((a) => a.grants.includes(key) && a.plans.includes(p.id))
    if (ad) return <span className="rounded-sm bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Available as Add-on</span>
    return <span className="text-slate/50"><span aria-hidden>—</span><span className="sr-only">Not included</span></span>
  }
  return (
    <section id="compare" className="mx-auto max-w-[1240px] scroll-mt-24 px-6 py-14">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-3xl font-semibold">Compare capabilities</h2>
        <div className="flex gap-4 text-xs text-slate"><span className="flex items-center gap-1"><Check size={14} className="text-teal" />Included</span><span>— Not included</span><span>Available as Add-on</span></div>
      </div>
      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-white" tabIndex={0} aria-label="Capability comparison, scrolls horizontally on small screens">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <caption className="sr-only">Capabilities included in each BizFlow plan</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 w-[34%] bg-white p-4 text-xs font-semibold uppercase tracking-wider text-slate">Capability</th>
              {plans.map((p) => <th scope="col" key={p.id} className={`p-4 font-display text-base ${p.recommended ? 'bg-softmint/50' : ''}`}>{p.name}</th>)}
            </tr>
          </thead>
          {GROUPS.map((g) => {
            const mods = CATALOG.filter((m) => m.group === g.id)
            const shut = closed.includes(g.id)
            return (
              <tbody key={g.id}>
                <tr><th scope="colgroup" colSpan={plans.length + 1} className="border-y border-line bg-cloud p-0 text-left">
                  <button aria-expanded={!shut} onClick={() => setClosed(shut ? closed.filter((x) => x !== g.id) : [...closed, g.id])} className="sticky left-0 flex w-full max-w-[100vw] cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em]"><ChevronDown size={14} className={`transition-transform ${shut ? '-rotate-90' : ''}`} />{g.name}</button>
                </th></tr>
                {!shut && mods.map((m) => {
                  const single = m.features.length === 1
                  return (
                    <ModRows key={m.id} name={m.name} single={single} rows={m.features.map((f) => ({ key: f.key, name: single ? m.name : f.name }))} plans={plans} cell={cell} />
                  )
                })}
              </tbody>
            )
          })}
        </table>
      </div>
      <p className="mt-3 text-xs text-slate">{ALL_FEATURES.length} individually controlled features. What each plan includes is set by BizFlow and may change over time.</p>
    </section>
  )
}

function ModRows({ name, single, rows, plans, cell }: { name: string; single: boolean; rows: { key: string; name: string }[]; plans: Plan[]; cell: (p: Plan, k: string) => React.ReactNode }) {
  return (<>
    {!single && <tr><th scope="row" colSpan={plans.length + 1} className="sticky left-0 bg-white px-4 pb-1 pt-3 text-left text-[13px] font-semibold">{name}</th></tr>}
    {rows.map((r) => (
      <tr key={r.key} className="border-b border-line/60 last:border-0">
        <th scope="row" className={`sticky left-0 z-10 bg-white py-2.5 pr-3 text-left font-normal ${single ? 'pl-4 font-medium' : 'pl-8 text-slate'}`}>{r.name}</th>
        {plans.map((p) => <td key={p.id} className={`px-4 py-2.5 ${p.recommended ? 'bg-softmint/30' : ''}`}>{cell(p, r.key)}</td>)}
      </tr>
    ))}
  </>)
}

function Faq({ trial, currencies, rec }: { trial: number; currencies: string; rec: string }) {
  const items: [string, string][] = [
    ['Can I change plans later?', 'Yes. Upgrades apply immediately with a prorated charge. Downgrades take effect at your next renewal so in-flight payroll, approvals and signatures finish safely.'],
    ['Is there a free trial?', trial ? `Yes. Eligible plans include up to ${trial} days free, with no card needed to start.` : 'Trials are not currently offered. You can start on any plan and cancel before renewal.'],
    ['Can I add modules later?', 'Yes. Optional capabilities can be added from Billing & Subscription at any time, and take effect straight away.'],
    ['What happens if my employee count increases?', 'Each plan includes a number of employees. Beyond that, extra employees are billed at the plan’s per-employee rate, and you are notified before you reach a plan limit.'],
    ['Can I cancel?', 'Yes, at any time from Billing & Subscription. You keep access until the end of the paid period.'],
    ['What happens to my data after cancellation?', 'Your data is retained according to our retention policy and becomes available again if you reactivate. Nothing is deleted because a plan changed.'],
    ['Can I switch from monthly to annual?', 'Yes. Change billing cycle at any time; annual billing is discounted compared with twelve monthly payments.'],
    ['Can I add Fleet later?', 'Yes. Fleet is included in Business and available as an add-on for Starter and Growth.'],
    ['Can I use BizFlow across multiple branches?', 'Yes. Branch limits depend on your plan, and Business adds multi-branch management and advanced cost centres.'],
    ['What currencies are supported?', `Currently ${currencies}. Availability can vary by plan and region.`],
    ['Is implementation support available?', 'Yes. Business customers get guided setup, and Enterprise includes implementation assistance and dedicated support.'],
    ['Can Enterprise plans be customized?', 'Yes. Deployment, security, approvals, integrations, SLAs and contracts are configured with our sales team.'],
  ]
  return (
    <section id="faq" className="mx-auto grid max-w-[1240px] scroll-mt-24 gap-10 px-6 py-14 lg:grid-cols-[1fr_1.6fr]">
      <div><h2 className="text-3xl font-semibold">Questions, answered.</h2><p className="mt-3 text-slate">Most teams begin on {rec}. Payments are processed by a PCI-compliant gateway; BizFlow never stores card numbers.</p></div>
      <div className="divide-y divide-line border-y border-line">
        {items.map(([q, a]) => (
          <details key={q} className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between font-semibold">{q}<ChevronDown size={16} className="text-slate transition-transform group-open:rotate-180" aria-hidden /></summary><p className="mt-2 text-sm text-slate">{a}</p></details>
        ))}
      </div>
    </section>
  )
}
