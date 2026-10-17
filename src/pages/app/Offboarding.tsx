import { useState } from 'react'
import { AlertTriangle, Download, Lock, RotateCcw } from 'lucide-react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, PageHeader, Panel, Timeline, useToast } from '../../components/ui'
import { useRole } from '../../components/app/AppLayout'
import { employeesForTenant } from '../../data/demo'
import { useDocs } from '../../documents/store'
import { useExits } from '../../exit/store'
import { useAudit, useTenant } from '../../tenant/store'
import { daysLeft, REASONS, requestOffboarding, respondOffer, reinstate, recordExport, STAGES, stageIndex, useActiveOffboarding, withdraw } from '../../platform/offboarding'
import type { Reason } from '../../platform/offboarding'
import { buildPackage, downloadAll } from '../../platform/offboardExport'
import { fmtAt } from '../../platform/persist'
import { RoAllow } from '../../platform/readOnly'

const TONE: Record<string, string> = { Requested: 'amber', Retention: 'amber', Grace: 'red', 'Export ready': 'blue', 'Deletion scheduled': 'red', Deleted: 'gray', Saved: 'green', Reinstated: 'green', Withdrawn: 'gray' }

export default function Offboarding() {
  const t = useTenant()
  const { role, r } = useRole()
  const toast = useToast()
  const slug = t?.slug ?? ''
  const o = useActiveOffboarding(slug)
  const exits = useExits(slug)
  const docs = useDocs()
  const audit = useAudit(slug)
  const [reason, setReason] = useState<Reason>(REASONS[0])
  const [detail, setDetail] = useState('')
  const [nps, setNps] = useState<number | null>(null)
  const [competitor, setCompetitor] = useState('')
  const [keptUs, setKeptUs] = useState('')
  const [wantsExport, setWantsExport] = useState(true)
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!t) return <EmptyState title="No workspace selected" body="Sign in to a company workspace to manage its subscription." />
  const allowed = role === 'admin' || role === 'md'
  const who = r.user, title = r.title

  if (!allowed) return (
    <RoAllow>
      <PageHeader eyebrow="Settings" title="Close workspace" desc="Cancelling a subscription is reserved for your Company Administrator and CEO / MD." />
      <EmptyState title="You do not have access" body="Ask your Company Administrator or CEO / MD to manage cancellation. This protects the company from accidental closure." />
    </RoAllow>
  )

  const submit = () => {
    setErr('')
    if (typed.trim().toLowerCase() !== t.profile.name.trim().toLowerCase()) return setErr('Type the company name exactly to confirm.')
    const res = requestOffboarding({
      slug, company: t.profile.name, plan: t.plan, employees: t.employees || employeesForTenant(slug).length, origin: 'Company', by: who, role: title, reason, detail, nps, competitor, keptUs, wantsExport,
      snapshot: { invoices: 0, payroll: true, openExits: exits.filter((e) => !['Completed', 'Cancelled'].includes(e.status)).length, lastInvoiceRef: 'INV-2026-0001', cac: t.profile.cac || 'Not provided', joined: t.created.slice(0, 10) },
    })
    if (typeof res === 'string') return setErr(res)
    setOpen(false); setTyped(''); toast('Cancellation requested. BizFlow will contact you with options before anything changes.')
  }
  const download = async () => {
    if (!o) return
    setBusy(true)
    try {
      const pkg = await buildPackage(o, { employees: employeesForTenant(slug), docs, exits, audit, real: true })
      if (!o.export || o.export.expiresAt < new Date().toISOString()) { const e = recordExport(o.id, who, title, 'Business', pkg.meta, pkg.digest); if (e) { toast(e); return } }
      downloadAll(pkg, `${slug}-export`)
      toast(`Downloading ${pkg.files.length} files. Keep them safe: they contain personal data.`)
    } finally { setBusy(false) }
  }

  return (
    <RoAllow>
      <PageHeader eyebrow="Settings" title="Close workspace" desc="Cancel your BizFlow subscription in a controlled way: nothing is deleted without a second BizFlow approval, a read-only grace period and your data export." />
      {!o ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Panel title="What happens if you cancel">
            <ol className="space-y-3 text-sm">
              {[['1. Request', 'You tell us why. A BizFlow success manager may contact you with options.'], ['2. Review and approval', 'Two different BizFlow administrators review the request. Your workspace stays fully open meanwhile.'], ['3. Read-only grace period', 'For 30 days everyone can view records and you can download your data, but nothing can be changed.'], ['4. Data export', 'Employees, payroll summaries, documents list and audit trail as CSV files with a manifest.'], ['5. Deletion', 'After a cooling-off period your data is deleted and anonymised. Only billing and legal records are kept.']].map(([h, b]) => <li key={h}><b>{h}</b><div className="text-slate">{b}</div></li>)}
            </ol>
            <p className="mt-4 rounded-md bg-ink/5 p-3 text-xs text-slate">You can reinstate your workspace at any time before the deletion date. After deletion it cannot be recovered.</p>
          </Panel>
          <Panel title="Request cancellation">
            <p className="text-sm text-slate">Your plan: <b className="text-ink">{t.plan}</b> · {t.employees} employees.</p>
            <Btn v="dark" className="mt-4 w-full" onClick={() => { setErr(''); setOpen(true) }}>Cancel subscription and close workspace</Btn>
            <p className="mt-2 text-xs text-slate">Only the Company Administrator and CEO / MD can do this. The request is audited.</p>
          </Panel>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Panel title="Status" action={<Badge tone={TONE[o.state]}>{o.state}</Badge>}>
              <ol className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
                {STAGES.map((s, i) => <li key={s} className={i < stageIndex(o) ? 'text-teal-600' : i === stageIndex(o) ? 'font-semibold text-ink' : 'text-slate'}>{i < stageIndex(o) ? '✓ ' : ''}{s}</li>)}
              </ol>
              {o.state === 'Deleted' ? <p className="mt-4 text-sm">This workspace was deleted and anonymised on {fmtAt(o.deletedAt!)}. Deletion reference <b className="num">{o.tombstone?.deletionRef}</b>.</p>
                : o.state === 'Requested' || o.state === 'Retention' ? <p className="mt-4 text-sm text-slate">Your workspace is fully open. BizFlow must complete a review before any change.</p>
                : <p className="mt-4 flex items-start gap-2 text-sm"><Lock size={16} className="mt-0.5 shrink-0 text-amber-700" />{o.state === 'Deletion scheduled' ? <span>Deletion is scheduled in <b>{Math.max(0, daysLeft(o.deletionDue))} day(s)</b>{o.hold ? '. A legal hold is currently pausing it.' : '.'}</span> : <span>Read-only for <b>{Math.max(0, daysLeft(o.graceEnds))} more day(s)</b>. Records can be viewed and exported; changes are off.</span>}</p>}
            </Panel>
            {o.state === 'Retention' && o.retention?.outcome === 'Pending' && (
              <Panel title="An offer from BizFlow">
                <p className="text-sm"><b>{o.retention.offer}</b></p>{o.retention.terms && <p className="mt-1 text-sm text-slate">{o.retention.terms}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Btn onClick={() => { const e = respondOffer(o.id, who, title, true); toast(e ?? 'Offer accepted. Your workspace stays open and your request is closed.') }}>Accept offer and stay</Btn>
                  <Btn v="secondary" onClick={() => { const e = respondOffer(o.id, who, title, false); toast(e ?? 'Offer declined. BizFlow will continue with the cancellation.') }}>Decline offer</Btn>
                </div>
              </Panel>
            )}
            {['Grace', 'Export ready', 'Deletion scheduled'].includes(o.state) && (
              <Panel title="Download your data" action={o.export && <span className="text-xs text-slate">Last generated {fmtAt(o.export.at)}</span>}>
                <p className="text-sm text-slate">One download of five CSV files (employees, payroll summary, documents, exit cases, audit trail) plus a manifest with file checksums.</p>
                {o.export && <ul className="mt-3 divide-y divide-line rounded-md border border-line text-sm">{o.export.files.map((f) => <li key={f.name} className="flex justify-between gap-2 px-3 py-2"><span>{f.name}</span><span className="num text-slate">{f.rows} rows</span></li>)}</ul>}
                <Btn className="mt-4" onClick={download} disabled={busy}><Download size={15} />{busy ? 'Preparing…' : o.export ? 'Download again' : 'Generate and download'}</Btn>
              </Panel>
            )}
            {o.state !== 'Deleted' && (
              <Panel title="Change your mind?">
                {['Requested', 'Retention'].includes(o.state)
                  ? <><p className="text-sm text-slate">Withdraw the request and nothing changes.</p><Btn v="secondary" className="mt-3" onClick={() => { const e = withdraw(o.id, who, title, 'Business'); toast(e ?? 'Request withdrawn.') }}>Withdraw request</Btn></>
                  : <><p className="text-sm text-slate">Reinstating restores full access immediately. Available until the data is deleted.</p><Btn className="mt-3" onClick={() => { const e = reinstate(o.id, who, title, 'Business'); toast(e ?? 'Workspace reinstated. Welcome back.') }}><RotateCcw size={15} />Reinstate workspace</Btn></>}
              </Panel>
            )}
          </div>
          <Panel title="History"><Timeline items={o.timeline.map((x) => ({ t: fmtAt(x.at), a: x.by, x: x.text }))} /></Panel>
        </div>
      )}

      <Overlay open={open} onClose={() => setOpen(false)} title="Cancel subscription and close workspace" wide>
        <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span>Your workspace stays open until BizFlow approves. Nothing is deleted at this step.</span></div>
          <Field label="Main reason for leaving"><select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as Reason)}>{REASONS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          {reason === 'Switched to a competitor' && <Field label="Which product are you moving to? (optional)"><input className={inputCls} value={competitor} onChange={(e) => setCompetitor(e.target.value)} /></Field>}
          <Field label="Tell us more" hint={reason === 'Other' ? 'Required for Other.' : 'Optional'}><textarea className={`${inputCls} h-24 py-2`} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
          <Field label="What would have kept you? (optional)"><input className={inputCls} value={keptUs} onChange={(e) => setKeptUs(e.target.value)} /></Field>
          <Field label="How likely were you to recommend BizFlow? 0 = not at all, 10 = very likely">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Recommendation score">{Array.from({ length: 11 }, (_, i) => <button type="button" key={i} role="radio" aria-checked={nps === i} onClick={() => setNps(i)} className={`size-9 cursor-pointer rounded-md border text-sm font-semibold ${nps === i ? 'border-teal bg-teal text-white' : 'border-line bg-white text-ink hover:bg-ink/5'}`}>{i}</button>)}</div>
          </Field>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={wantsExport} onChange={(e) => setWantsExport(e.target.checked)} /><span>I want to download my data (employees, payroll summaries, documents list and audit trail) during the grace period.</span></label>
          <Field label={`Type "${t.profile.name}" to confirm`}><input className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
          {err && <p role="alert" className="text-err">{err}</p>}
          <div className="flex gap-2"><Btn type="submit" v="dark">Request cancellation</Btn><Btn type="button" v="secondary" onClick={() => setOpen(false)}>Keep my workspace</Btn></div>
        </form>
      </Overlay>
    </RoAllow>
  )
}
