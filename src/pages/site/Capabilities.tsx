import { useEffect, useState, type ComponentType } from "react"
import { Link } from "react-router"
import { Btn } from "../../components/ui"
import { CAPABILITIES } from "../../data/capabilities"
import { ApprovalsShot, OnboardingShot, PayrollShot, PipelineShot, RevenueShot, SignShot } from "../../components/site/ProductShots"

const EXTRAS: Record<string, { promise: string; practice: string; works: string; Shot: ComponentType }> = {
  people: {
    promise: "From offer letter to first payslip without re-keying a field.",
    practice: "Zainab accepts an offer on Thursday. By Monday her details, signed contract, laptop and payroll entry are ready, and nobody asked her for the same form twice.",
    works: "Payroll, Assets, BizFlow Sign",
    Shot: OnboardingShot,
  },
  money: {
    promise: "Payroll, expenses and the ledger agree because they are one record.",
    practice: "Finance reviews October payroll, sees a 2.1% variance on September and queries two payslips. The MD gives the final approval, then Finance disburses and costs reach each cost centre on their own.",
    works: "Cost centres, Approvals, Reports",
    Shot: PayrollShot,
  },
  operations: {
    promise: "Work moves forward without anyone chasing it.",
    practice: "A diesel expense passes the line manager and Audit (plus Compliance where the company requires it), then gets the MD's final approval before Finance pays it out. A vehicle insurance renewal is acknowledged by the admin officer, entered by one person and verified by another.",
    works: "Accounting, Vendors, Audit",
    Shot: ApprovalsShot,
  },
  customers: {
    promise: "A lighter CRM that connects straight to the invoice.",
    practice: "Kelechi closes Ikoyi Gardens Facilities. The invoice is raised from the deal, and receivables show it ageing from day one.",
    works: "Invoices, Receivables, Tasks",
    Shot: PipelineShot,
  },
  "workflow-documents": {
    promise: "Documents that build themselves from records you already hold.",
    practice: "HR generates an employment agreement from the template, sends it for signature, and can later show who viewed and signed it, and when.",
    works: "People, Approvals, Audit trail",
    Shot: SignShot,
  },
  "insights-control": {
    promise: "See the whole company, and who is accountable for each part.",
    practice: "The MD compares four branches on one basis, then opens the audit log to see exactly who approved a disputed purchase.",
    works: "Branches, Cost centres, Permissions",
    Shot: RevenueShot,
  },
}

const FLOWS = [
  { eyebrow: "Employee lifecycle", steps: ["Employee joins", "HR", "Payroll", "Asset assignment", "Document", "BizFlow Sign", "Accounting", "Reporting"] },
  { eyebrow: "Customer to cash", steps: ["Customer", "CRM", "Opportunity", "Sale", "Invoice", "Receivables", "Business Health"] },
  { eyebrow: "Request to control", steps: ["Purchase request", "Approval", "Procurement", "Asset", "Accounting", "Cost centre"] },
]

function useActive(ids: string[]) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-30% 0px -60% 0px" },
    )
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [ids])
  return active
}

const IDS = CAPABILITIES.map((c) => c.id)

export default function Capabilities() {
  const active = useActive(IDS)
  return (
    <main>
      <section className="on-dark bf-deep grid-fine text-white">
        <div className="mx-auto max-w-[1240px] px-6 py-20 lg:py-28">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-mint">Capabilities</div>
          <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-[1.03] sm:text-6xl lg:text-7xl">Everything your business needs to operate.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">People, money, operations, customers and workflows on one record. Below, each area with the screen you would work in.</p>
        </div>
      </section>

      <nav aria-label="Capabilities" className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] gap-1 overflow-x-auto px-6 py-2.5">
          {CAPABILITIES.map((c) => (
            <a key={c.id} href={`#${c.id}`} aria-current={active === c.id ? "true" : undefined} className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${active === c.id ? "bg-midnight text-white" : "text-slate hover:bg-cloud hover:text-ink"}`}>
              {c.name}
            </a>
          ))}
        </div>
      </nav>

      <section className="bg-white py-20 lg:py-24">
        <div className="mx-auto max-w-[1240px] px-6">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <h2 className="text-4xl font-semibold leading-tight sm:text-5xl">One business.<br />One connected flow.</h2>
            <p className="max-w-2xl text-lg leading-relaxed text-slate">A person, customer, request or asset keeps its context as it moves through the business, so every team works from the same record. Three paths that cross the boundaries between modules:</p>
          </div>
          <div className="mt-12 grid divide-y divide-line border-y border-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {FLOWS.map((f) => (
              <div key={f.eyebrow} className="py-7 lg:px-7 lg:first:pl-0 lg:last:pr-0">
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-teal">{f.eyebrow}</div>
                <p className="mt-4 text-[15px] leading-8 text-ink">
                  {f.steps.map((st, i) => (<span key={st}>{st}{i < f.steps.length - 1 && <span className="mx-2 text-mint" aria-hidden>→</span>}</span>))}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {CAPABILITIES.map((c) => {
        const x = EXTRAS[c.id]
        return (
          <section id={c.id} key={c.id} className="scroll-mt-16 border-t border-line bg-white py-20 lg:py-28">
            <div className="mx-auto max-w-[1240px] px-6">
              <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
                <div className="lg:sticky lg:top-28 lg:self-start">
                  <div className="num font-mono text-sm text-teal">{c.number}</div>
                  <h2 className="mt-3 text-4xl font-semibold sm:text-5xl">{c.name}</h2>
                  <p className="mt-4 text-lg leading-relaxed text-slate">{c.description}</p>
                  <p className="mt-8 border-l-2 border-mint pl-4 text-[15px] leading-relaxed text-ink">{x.practice}</p>
                  <p className="mt-5 text-sm text-slate">Works with <span className="font-medium text-ink">{x.works}</span></p>
                </div>
                <div>
                  <p className="max-w-xl font-display text-2xl font-semibold leading-snug">{x.promise}</p>
                  <div className="mt-8"><x.Shot /></div>
                  <ul className="mt-10 grid gap-x-10 sm:grid-cols-2">
                    {c.modules.map((m) => (
                      <li key={m.name} className="border-t border-line py-4">
                        <h3 className="text-[15px] font-semibold">{m.name}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-slate">{m.description}</p>
                      </li>
                    ))}
                  </ul>
                  <Link to="/pricing#compare" className="mt-4 inline-flex text-sm font-semibold text-teal hover:underline">Compare plans for {c.name}</Link>
                </div>
              </div>
            </div>
          </section>
        )
      })}

      <section className="on-dark bg-midnight py-24 text-white">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-8 px-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-semibold leading-tight sm:text-5xl">Your teams move together because their work is connected.</h2>
            <p className="mt-4 text-white/65">Identity, company structure, permissions, workflow, documents and audit sit under every capability.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Btn v="mint" s="lg" to="/get-started">Get started</Btn>
            <Btn v="secondary" s="lg" to="/pricing" className="border-white/25 bg-transparent text-white hover:bg-white/10">See plans</Btn>
            <Btn v="secondary" s="lg" to="/contact" className="border-white/25 bg-transparent text-white hover:bg-white/10">Talk to sales</Btn>
          </div>
        </div>
      </section>
    </main>
  )
}
