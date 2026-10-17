import { useMemo, useState } from "react"
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, useToast } from "../../components/ui"
import { useRole } from "../../components/app/AppLayout"
import { employeesForTenant, ngn, ngnM } from "../../data/demo"
import { CURRENT_VENDOR_QUARTER, vendorEvaluationQuarter, vendorScore, vendorsForTenant } from "../../data/vendors"
import type { Vendor } from "../../data/vendors"
import { useTenant } from "../../tenant/store"
import { VendorPayments } from "../../compliance/ui"
import { invoicesFor, useCompliance } from "../../compliance/store"

const scoreTone = (score: number) => score >= 85 ? "green" : score >= 70 ? "amber" : "red"

export default function Vendors() {
  const tenant = useTenant()
  const { role, r } = useRole()
  const toast = useToast()
  const seed = useMemo(() => vendorsForTenant(tenant?.slug), [tenant?.slug])
  const [vendors, setVendors] = useState(seed)
  const [tab, setTab] = useState("Vendor register")
  const [department, setDepartment] = useState("All departments")
  const [review, setReview] = useState<Vendor | null>(null)
  const [report, setReport] = useState<Vendor | null>(null)
  const comp = useCompliance()
  const overdueBy = new Map<string, number>()
  invoicesFor(comp, tenant?.slug, vendors).filter((i) => i.state === "overdue").forEach((i) => overdueBy.set(i.vendor.id, (overdueBy.get(i.vendor.id) ?? 0) + i.amount))
  const [queried, setQueried] = useState<string[]>([])
  const [addOpen, setAddOpen] = useState(false)
  if (!tenant) return null

  const employee = employeesForTenant(tenant.slug).find((person) => person.id === r.id || person.name === r.user)
  const canSeeAll = role === "admin" || role === "md" || role === "hr"
  const ownDepartment = employee?.dept
  const accessible = canSeeAll ? vendors : vendors.filter((vendor) => vendor.department === ownDepartment)
  const departments = [...new Set(accessible.map((vendor) => vendor.department))].sort()
  const visible = department === "All departments" ? accessible : accessible.filter((vendor) => vendor.department === department)
  const paid = visible.reduce((sum, vendor) => sum + vendor.paid, 0)
  const owing = visible.reduce((sum, vendor) => sum + vendor.owing, 0)
  const contracted = visible.reduce((sum, vendor) => sum + vendor.contracted, 0)
  const average = visible.length ? Math.round(visible.reduce((sum, vendor) => sum + vendorScore(vendor), 0) / visible.length) : 0
  const departmentAnalysis = departments.map((name) => {
    const list = accessible.filter((vendor) => vendor.department === name)
    const score = Math.round(list.reduce((sum, vendor) => sum + vendorScore(vendor), 0) / list.length)
    const reported = list.filter((vendor) => vendorEvaluationQuarter(vendor) === CURRENT_VENDOR_QUARTER).length
    const completion = Math.round((reported / list.length) * 100)
    const penalty = Math.round((100 - completion) * 0.15)
    return { name, vendors: list.length, score, reported, completion, penalty, kpi: Math.max(0, score - penalty), owing: list.reduce((sum, vendor) => sum + vendor.owing, 0) }
  }).sort((a, b) => a.kpi - b.kpi)

  const addVendor = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const vendor: Vendor = { id: `VND-${String(vendors.length + 1).padStart(3, "0")}`, name: String(data.get("name")), category: String(data.get("category")), department: ownDepartment ?? "Administration", contact: String(data.get("contact")), status: "Active", contracted: 0, paid: 0, owing: 0, onTime: 80, quality: 80, compliance: 80, service: 80, lastReview: "Not reviewed" }
    setVendors([...vendors, vendor]); setAddOpen(false); toast(`${vendor.name} added to your vendor register.`)
  }

  const saveReview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!review) return
    const data = new FormData(event.currentTarget)
    const updated: Vendor = {
      ...review,
      onTime: Number(data.get("onTime")),
      quality: Number(data.get("quality")),
      compliance: Number(data.get("compliance")),
      service: Number(data.get("service")),
      lastReview: "Today",
      reviewQuarter: CURRENT_VENDOR_QUARTER,
      reviewNote: String(data.get("note")),
      reviewer: r.user,
    }
    const score = vendorScore(updated)
    updated.status = score < 65 ? "Suspended" : score < 80 ? "Watchlist" : "Active"
    setVendors(vendors.map((vendor) => vendor.id === updated.id ? updated : vendor))
    setReview(null)
    toast(`${updated.name} ${CURRENT_VENDOR_QUARTER} evaluation report saved.`)
  }

  const queryDepartment = (name: string) => {
    setQueried([...new Set([...queried, name])])
    toast(`${name} has been queried for its outstanding ${CURRENT_VENDOR_QUARTER} vendor evaluation report.`)
  }

  if (vendors.length === 0) return (
    <div>
      <PageHeader eyebrow="Operations · Vendor Management" title="Vendors" desc="Department-owned vendor registers, financial obligations and consistent performance evaluation." />
      <div className="rounded-lg border border-line bg-white"><EmptyState title="No vendors yet" body="Add the suppliers and service providers you work with to track payments, obligations and performance." action={<Btn onClick={() => setAddOpen(true)}>Add your first vendor</Btn>} /></div>
      <Overlay open={addOpen} onClose={() => setAddOpen(false)} title="Add vendor">
        <form onSubmit={addVendor} className="space-y-4"><Field label="Vendor name"><input required name="name" className={inputCls} /></Field><Field label="Category"><input required name="category" placeholder="e.g. IT services" className={inputCls} /></Field><Field label="Contact"><input required name="contact" className={inputCls} /></Field><div className="flex justify-end gap-2"><Btn type="button" v="secondary" onClick={() => setAddOpen(false)}>Cancel</Btn><Btn type="submit">Save vendor</Btn></div></form>
      </Overlay>
    </div>
  )
  return (
    <div>
      <PageHeader eyebrow="Operations · Vendor Management" title="Vendors" desc="Department-owned vendor registers, financial obligations and consistent performance evaluation." />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Tabs tabs={["Vendor register", "Payments & overdues", "Financial analysis", "Performance evaluation"]} value={tab} onChange={setTab} />
        {canSeeAll && <Field label="Department"><select value={department} onChange={(event) => setDepartment(event.target.value)} className={`${inputCls} min-w-52`}><option>All departments</option>{departments.map((name) => <option key={name}>{name}</option>)}</select></Field>}
      </div>

      {tab !== "Payments & overdues" && <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel><Stat label="Active vendors" value={String(visible.filter((vendor) => vendor.status === "Active").length)} sub={`${visible.length} total in scope`} /></Panel>
        <Panel><Stat label="Contracted value" value={ngnM(contracted)} sub="approved vendor commitments" /></Panel>
        <Panel><Stat label="Paid to date" value={ngnM(paid)} sub={`${contracted ? Math.round((paid / contracted) * 100) : 0}% of contracted value`} /></Panel>
        <Panel><Stat label="Outstanding" value={ngnM(owing)} sub={`${average}% average performance`} /></Panel>
      </div>}

      {tab === "Payments & overdues" && <VendorPayments vendors={visible} />}

      {tab === "Vendor register" && <Panel pad={false}>
        <Table label="Department vendor register" pageSize={12} right={[4, 5, 6]} head={["Vendor", "Department", "Category", "Status", "Paid", "Owing", "Overdue", "Performance", ""]} rows={visible.map((vendor) => [
          <span key="name"><b>{vendor.name}</b><span className="block text-xs text-slate">{vendor.id} · {vendor.contact}</span></span>,
          vendor.department,
          vendor.category,
          <Badge key="status" tone={vendor.status === "Active" ? "green" : vendor.status === "Watchlist" ? "amber" : "red"}>{vendor.status}</Badge>,
          ngn(vendor.paid),
          ngn(vendor.owing),
          overdueBy.get(vendor.id) ? <span key="od" className="font-semibold text-err">{ngn(overdueBy.get(vendor.id)!)}</span> : <span key="od" className="text-slate">None</span>,
          <Badge key="score" tone={scoreTone(vendorScore(vendor))}>{vendorScore(vendor)}%</Badge>,
          <Btn key="review" s="sm" v="ghost" onClick={() => setReview(vendor)}>Evaluate</Btn>,
        ])} />
      </Panel>}

      {tab === "Financial analysis" && <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Vendor financial position" pad={false}><Table label="Vendor financial analysis" right={[2, 3, 4]} head={["Vendor", "Department", "Contracted", "Paid", "Company owes", "Settlement"]} rows={visible.map((vendor) => [vendor.name, vendor.department, ngn(vendor.contracted), ngn(vendor.paid), ngn(vendor.owing), `${Math.round((vendor.paid / vendor.contracted) * 100)}% paid`])} /></Panel>
        <Panel title="Department obligations"><div className="space-y-4">{departmentAnalysis.map((item) => <div key={item.name}><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{item.name}</span><span className="num">{ngn(item.owing)}</span></div><div className="mt-1 h-1.5 rounded bg-ink/10"><div className="h-full rounded bg-teal" style={{ width: `${owing ? Math.max(4, (item.owing / owing) * 100) : 0}%` }} /></div></div>)}</div></Panel>
      </div>}

      {tab === "Performance evaluation" && <div className="space-y-5">
        <div className="rounded-lg border border-info/30 bg-blue-50 p-4 text-sm text-blue-900"><b>Quarterly reporting · {CURRENT_VENDOR_QUARTER}</b><p className="mt-1">Every department must evaluate each active vendor once per quarter. Missing reports reduce the department’s vendor-management KPI until submitted.</p></div>
        {canSeeAll && <Panel title="Department performance oversight"><p className="mb-4 text-sm text-slate">HR can review quarterly report compliance, see the resulting departmental KPI, and query departments with missing reports.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{departmentAnalysis.map((item) => <div key={item.name} className="rounded-lg border border-line p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{item.name}</div><div className="text-xs text-slate">{item.reported} of {item.vendors} reports submitted</div></div><Badge tone={scoreTone(item.kpi)}>{item.kpi}% KPI</Badge></div><dl className="mt-3 space-y-1 text-xs"><div className="flex justify-between"><dt className="text-slate">Vendor score</dt><dd>{item.score}%</dd></div><div className="flex justify-between"><dt className="text-slate">Report compliance</dt><dd>{item.completion}%</dd></div><div className="flex justify-between text-err"><dt>Missing-report penalty</dt><dd>−{item.penalty} pts</dd></div></dl>{item.completion < 100 && <div className="mt-3">{queried.includes(item.name) ? <Badge tone="blue">Department queried</Badge> : role === "hr" || role === "admin" ? <Btn s="sm" v="secondary" onClick={() => queryDepartment(item.name)}>Query department</Btn> : <Badge tone="amber">Report outstanding</Badge>}</div>}</div>)}</div></Panel>}
        <Panel pad={false} title={`Quarterly vendor evaluation reports · ${CURRENT_VENDOR_QUARTER}`}><Table label="Quarterly vendor performance reports" head={["Vendor", "Department", "Overall", "Quarter", "Report status", "Last review", ""]} rows={visible.map((vendor) => {
          const current = vendorEvaluationQuarter(vendor) === CURRENT_VENDOR_QUARTER
          return [vendor.name, vendor.department, <Badge key="overall" tone={scoreTone(vendorScore(vendor))}>{vendorScore(vendor)}%</Badge>, vendorEvaluationQuarter(vendor), <Badge key="report" tone={current ? "green" : "amber"}>{current ? "Available" : "Outstanding"}</Badge>, vendor.lastReview, current ? <Btn key="view" s="sm" v="ghost" onClick={() => setReport(vendor)}>View report</Btn> : <Btn key="evaluate" s="sm" v="secondary" onClick={() => setReview(vendor)}>Evaluate now</Btn>]
        })} /></Panel>
      </div>}

      <Overlay open={!!review} onClose={() => setReview(null)} title={`Evaluate ${review?.name ?? "vendor"}`}>
        {review && <form onSubmit={saveReview} className="space-y-4">
          <p className="text-sm text-slate">Complete the {CURRENT_VENDOR_QUARTER} report using the four measures required across every department. Scores below 80% are placed on the watchlist.</p>
          <div className="grid gap-3 sm:grid-cols-2">{([["onTime", "On-time delivery"], ["quality", "Quality"], ["compliance", "Compliance"], ["service", "Service & responsiveness"]] as const).map(([key, label]) => <Field key={key} label={`${label} (%)`}><input required name={key} type="number" min="0" max="100" defaultValue={review[key]} className={inputCls} /></Field>)}</div>
          <Field label="Evaluation note"><textarea name="note" rows={3} placeholder="Evidence, incidents, strengths or corrective action." className={`${inputCls} h-auto py-2`} /></Field>
          <div className="flex justify-end gap-2"><Btn type="button" v="secondary" onClick={() => setReview(null)}>Cancel</Btn><Btn type="submit">Save evaluation</Btn></div>
        </form>}
      </Overlay>
      <Overlay open={!!report} onClose={() => setReport(null)} title={`${report?.name ?? "Vendor"} · ${CURRENT_VENDOR_QUARTER} report`}>
        {report && <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-cloud p-4"><div><div className="text-xs text-slate">Responsible department</div><div className="font-semibold">{report.department}</div></div><Badge tone={scoreTone(vendorScore(report))}>{vendorScore(report)}% overall</Badge></div>
          <dl className="grid grid-cols-2 gap-3 text-sm">{[["On-time delivery", report.onTime], ["Quality", report.quality], ["Compliance", report.compliance], ["Service", report.service]].map(([label, value]) => <div key={label} className="rounded-lg border border-line p-3"><dt className="text-xs text-slate">{label}</dt><dd className="num mt-1 text-lg font-semibold">{value}%</dd></div>)}</dl>
          <div><div className="text-xs font-semibold uppercase tracking-wider text-slate">Evaluation note</div><p className="mt-2 rounded-lg border border-line p-3 text-sm">{report.reviewNote || "Performance scores reviewed and supporting evidence retained by the responsible department."}</p></div>
          <p className="text-xs text-slate">Submitted by {report.reviewer || report.department} · {report.lastReview}</p>
          <div className="flex justify-end"><Btn onClick={() => setReport(null)}>Close report</Btn></div>
        </div>}
      </Overlay>
    </div>
  )
}
