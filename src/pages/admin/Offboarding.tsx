import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, Download, Lock, RotateCcw, Scale, ShieldCheck } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, PageHeader, Panel, Table, Tabs, Timeline, useToast } from '../../components/ui'
import { CHART } from '../../components/charts'
import { employeesForTenant } from '../../data/demo'
import { useDocs } from '../../documents/store'
import { useExits } from '../../exit/store'
import { useAudit, useTenants } from '../../tenant/store'
import { DEMO_SLUG, advanceDays, approveOffboarding, attest, daysLeft, executeDeletion, FOUR_EYES, makeOffer, offStats, OFFERS, OPEN_STATES, reinstate, REASONS, recordExport, requestOffboarding, respondOffer, saveSettings, scheduleDeletion, setGraceDays, setHold, stageIndex, STAGES, useOffboarding, useOffSettings, waiveExport, waiveRetention, withdraw } from '../../platform/offboarding'
import type { Offboarding as Off, Reason } from '../../platform/offboarding'
import { buildPackage, downloadAll } from '../../platform/offboardExport'
import { fmtAt } from '../../platform/persist'
import { useAdmin } from './AdminLayout'

const TONE: Record<string, string> = { Requested: 'amber', Retention: 'amber', Grace: 'red', 'Export ready': 'blue', 'Deletion scheduled': 'red', Deleted: 'gray', Saved: 'green', Reinstated: 'green', Withdrawn: 'gray' }
const money = (n: number) => `₦${n.toLocaleString('en-NG')}`
const TABS = ['Needs action', 'In grace', 'Deletion queue', 'Closed', 'All']
const inTab = (o: Off, t: string) => t === 'All' || (t === 'Needs action' && OPEN_STATES.includes(o.state)) || (t === 'In grace' && ['Grace', 'Export ready'].includes(o.state)) || (t === 'Deletion queue' && o.state === 'Deletion scheduled') || (t === 'Closed' && ['Deleted', 'Saved', 'Reinstated', 'Withdrawn'].includes(o.state))

type Check = { key: string; label: string; ok: boolean; detail: string; attest?: 'invoices' | 'payroll' | 'exits' }
export function checklist(o: Off): Check[] {
  const a = o.attest
  return [
    { key: 'invoices', attest: 'invoices', label: 'Outstanding invoices', ok: o.snapshot.invoices === 0 || !!a.invoices, detail: o.snapshot.invoices === 0 ? 'None outstanding' : a.invoices ? `Resolved: ${a.invoices.note}` : `${o.snapshot.invoices} unpaid invoice(s)` },
    { key: 'payroll', attest: 'payroll', label: 'Active payroll', ok: !o.snapshot.payroll || !!a.payroll, detail: !o.snapshot.payroll ? 'No payroll run in progress' : a.payroll ? `Archived: ${a.payroll.note}` : 'A payroll cycle is configured: confirm the final run is archived' },
    { key: 'exits', attest: 'exits', label: 'Open exit cases', ok: o.snapshot.openExits === 0 || !!a.exits, detail: o.snapshot.openExits === 0 ? 'None open' : a.exits ? `Resolved: ${a.exits.note}` : `${o.snapshot.openExits} exit case(s) still open` },
    { key: 'export', label: 'Data export', ok: !!o.export || !!o.exportWaived, detail: o.export ? `Generated ${fmtAt(o.export.at)} by ${o.export.by}` : o.exportWaived ? `Waived: ${o.exportWaived.reason}` : 'Not generated yet' },
    { key: 'hold', label: 'Legal hold', ok: !o.hold, detail: o.hold ? `ON: ${o.hold.reason}` : 'No hold: deletion is not blocked' },
  ]
}

export default function Offboarding() {
  const { can, actor } = useAdmin()
  const toast = useToast()
  const all = useOffboarding()
  const settings = useOffSettings()
  const tenants = useTenants()
  const [tab, setTab] = useState('Needs action')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [start, setStart] = useState(false)
  const [cfg, setCfg] = useState(false)
  const stats = useMemo(() => offStats(all), [all])
  const rows = all.filter((o) => inTab(o, tab) && (o.company + o.id + o.reason).toLowerCase().includes(q.toLowerCase()))
  const manage = can('offboard')
  const demo = tenants[DEMO_SLUG]
  const demoBusy = all.some((x) => x.slug === DEMO_SLUG && !['Saved', 'Reinstated', 'Withdrawn', 'Deleted'].includes(x.state))
  const testRun = () => {
    if (!demo) return
    const r = requestOffboarding({ test: true, slug: demo.slug, company: demo.profile.name, plan: demo.plan, employees: demo.employees, origin: 'Platform', by: actor, role: 'Platform administrator', reason: 'Other', detail: 'Test cancellation to try the flow. Fully reversible with Reinstate; the company is never deleted.', nps: null, wantsExport: true, snapshot: { invoices: 0, payroll: true, openExits: 0, lastInvoiceRef: 'INV-TEST', cac: demo.profile.cac || 'Not provided', joined: demo.created.slice(0, 10) } })
    if (typeof r === 'string') toast(r); else { toast('Test cancellation started. Reinstate it any time.'); setSel(r.id) }
  }
  const o = all.find((x) => x.id === sel)
  const chart = stats.reasons.map((r) => ({ reason: r.reason.length > 22 ? r.reason.slice(0, 21) + '…' : r.reason, Saved: r.saved, Lost: r.lost, Open: r.open }))

  return (
    <div>
      <PageHeader eyebrow="Businesses" title="Offboarding" desc="Controlled cancellations: save attempt, second-admin approval, read-only grace, data export, then deletion with a legal tombstone."
        actions={manage && <div className="flex gap-2"><Btn v="secondary" onClick={() => setCfg(true)}>Defaults</Btn>{demo && !demoBusy && <Btn v="secondary" onClick={testRun}>Start a test cancellation</Btn>}<Btn onClick={() => setStart(true)}>Start offboarding</Btn></div>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Open requests', String(stats.open), `${money(stats.mrrAtRisk)} MRR at risk`],
          ['In grace (read-only)', String(stats.inGrace), 'Workspaces locked now'],
          ['Deletions due in 7 days', String(stats.dueSoon), stats.dueSoon ? 'Check holds and exports' : 'Nothing imminent'],
          ['Save rate', stats.saveRate === null ? 'No data' : `${stats.saveRate}%`, `${stats.saved} saved · ${stats.lost} lost`],
          ['MRR saved vs lost', money(stats.mrrSaved), `${money(stats.mrrLost)} lost`],
        ].map(([l, v, s]) => <Panel key={l}><div className="text-xs font-medium text-slate">{l}</div><div className="num mt-1 font-display text-[24px] font-semibold leading-none text-ink">{v}</div><div className="mt-1.5 text-xs text-slate">{s}</div></Panel>)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Why customers leave" action={<span className="text-xs text-slate">All requests, by outcome</span>}>
          {chart.length === 0 ? <EmptyState title="No requests yet" body="Churn reasons appear here once a company asks to cancel." /> : (
            <div className="h-[260px]" role="img" aria-label={`Churn reasons: ${stats.reasons.map((r) => `${r.reason} ${r.total}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid stroke={CHART.grid} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: CHART.axis, fontSize: 12 }} />
                  <YAxis type="category" dataKey="reason" width={150} tick={{ fill: CHART.axis, fontSize: 12 }} />
                  <Tooltip /><Legend />
                  <Bar dataKey="Lost" stackId="a" fill={CHART.red} /><Bar dataKey="Open" stackId="a" fill={CHART.amber} /><Bar dataKey="Saved" stackId="a" fill={CHART.green} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="What wins customers back">
          {stats.offers.length === 0 ? <p className="text-sm text-slate">No answered retention offers yet.</p> : (
            <ul className="space-y-3 text-sm">{stats.offers.map((x) => { const t = x.saved + x.declined; return (
              <li key={x.offer}><div className="flex justify-between gap-2"><span>{x.offer}</span><b className="num">{Math.round((x.saved / t) * 100)}%</b></div>
                <div className="mt-1 h-1.5 rounded bg-ink/10" aria-hidden><div className="h-1.5 rounded bg-ok" style={{ width: `${(x.saved / t) * 100}%` }} /></div>
                <div className="mt-0.5 text-xs text-slate">{x.saved} accepted of {t} answered</div></li>) })}</ul>
          )}
          <p className="mt-4 text-xs text-slate">Reasons also feed Business health: companies with an open cancellation score as critical on the Businesses page.</p>
        </Panel>
      </div>

      <Panel className="mt-4" title="Queue" pad={false} action={<input aria-label="Search requests" className={`${inputCls} w-44`} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />}>
        <div className="px-4 pt-3"><Tabs tabs={TABS} value={tab} onChange={setTab} /></div>
        {rows.length === 0 ? <div className="p-4"><EmptyState title="Nothing here" body={all.length === 0 ? 'No company has asked to cancel. Use Start a test cancellation to try the flow on the demo company; Reinstate undoes it.' : tab === 'Needs action' ? 'No cancellations are waiting on BizFlow.' : 'No requests match this view.'} /></div> : (
          <Table label="Offboarding queue" head={['Company', 'Reason', 'State', 'Requested', 'Next date', 'Owner']} pageSize={8}
            rows={rows.map((x) => [
              <button key="c" className="cursor-pointer text-left font-semibold text-teal-600 hover:underline" onClick={() => setSel(x.id)}>{x.company}<span className="block text-xs font-normal text-slate">{x.id} · {x.plan} · {x.employees} staff</span></button>,
              x.reason, <span key="s" className="inline-flex flex-wrap gap-1"><Badge tone={TONE[x.state]}>{x.state}</Badge>{x.hold && <Badge tone="red">Hold</Badge>}</span>, fmtAt(x.requestedAt),
              x.state === 'Deletion scheduled' ? `Delete in ${daysLeft(x.deletionDue)}d` : ['Grace', 'Export ready'].includes(x.state) ? `Grace ends in ${daysLeft(x.graceEnds)}d` : x.closedAt ? fmtAt(x.closedAt) : 'Awaiting review',
              x.origin === 'Platform' ? 'BizFlow' : 'Customer',
            ])} />
        )}
      </Panel>

      {o && <Drawer key={o.id} o={o} onClose={() => setSel(null)} manage={manage} actor={actor} />}
      <StartDialog open={start} onClose={() => setStart(false)} actor={actor} existing={all} onDone={(id) => { setStart(false); setSel(id) }} tenants={tenants} />
      <Overlay open={cfg} onClose={() => setCfg(false)} title="Offboarding defaults">
        <Defaults actor={actor} done={() => { setCfg(false); toast('Defaults saved and audited.') }} initial={settings} />
      </Overlay>
    </div>
  )
}

function Defaults({ actor, done, initial }: { actor: string; done: () => void; initial: { graceDays: number; coolingDays: number } }) {
  const [g, setG] = useState(String(initial.graceDays)), [c, setC] = useState(String(initial.coolingDays)), [err, setErr] = useState('')
  return (
    <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); const r = saveSettings(actor, { graceDays: Number(g), coolingDays: Number(c) }); if (r) setErr(r); else done() }}>
      <Field label="Read-only grace period (days)" hint="7 to 90. Applies to new approvals."><input className={inputCls} inputMode="numeric" value={g} onChange={(e) => setG(e.target.value)} /></Field>
      <Field label="Cooling-off after deletion is scheduled (days)" hint="3 to 30. The company can still reinstate."><input className={inputCls} inputMode="numeric" value={c} onChange={(e) => setC(e.target.value)} /></Field>
      {err && <p role="alert" className="text-err">{err}</p>}
      <Btn type="submit">Save defaults</Btn>
    </form>
  )
}

function StartDialog({ open, onClose, actor, existing, onDone, tenants }: { open: boolean; onClose: () => void; actor: string; existing: Off[]; onDone: (id: string) => void; tenants: ReturnType<typeof useTenants> }) {
  const free = Object.values(tenants).filter((t) => !existing.some((e) => e.slug === t.slug && !['Saved', 'Reinstated', 'Withdrawn'].includes(e.state)))
  const [slug, setSlug] = useState(''), [reason, setReason] = useState<Reason>('Non-payment or contract end'), [detail, setDetail] = useState(''), [err, setErr] = useState('')
  const toast = useToast()
  const exits = useExits(slug || free[0]?.slug || '')
  const t = free.find((x) => x.slug === (slug || free[0]?.slug))
  return (
    <Overlay open={open} onClose={onClose} title="Start offboarding">
      {!t ? <EmptyState title="No eligible companies" body="Every active company already has an offboarding request." /> : (
        <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault()
          const r = requestOffboarding({ slug: t.slug, company: t.profile.name, plan: t.plan, employees: t.employees || employeesForTenant(t.slug).length, origin: 'Platform', by: actor, role: 'Platform administrator', reason, detail: detail || 'Initiated by BizFlow', nps: null, wantsExport: true,
            snapshot: { invoices: 0, payroll: true, openExits: exits.filter((x) => !['Completed', 'Cancelled'].includes(x.status)).length, lastInvoiceRef: 'INV-2026-0001', cac: t.profile.cac || 'Not provided', joined: t.created.slice(0, 10) } })
          if (typeof r === 'string') setErr(r); else { toast('Offboarding started and audited.'); onDone(r.id) } }}>
          <Field label="Company"><select className={inputCls} value={t.slug} onChange={(e) => setSlug(e.target.value)}>{free.map((x) => <option key={x.slug} value={x.slug}>{x.profile.name}</option>)}</select></Field>
          <Field label="Reason"><select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as Reason)}>{REASONS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Detail"><textarea className={`${inputCls} h-20 py-2`} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
          {err && <p role="alert" className="text-err">{err}</p>}
          <p className="text-xs text-slate">Nothing changes for the company until a different administrator approves.</p>
          <Btn type="submit">Create request</Btn>
        </form>
      )}
    </Overlay>
  )
}

function Drawer({ o, onClose, manage, actor }: { o: Off; onClose: () => void; manage: boolean; actor: string }) {
  const toast = useToast()
  const tenants = useTenants()
  const real = !!tenants[o.slug]
  const exits = useExits(o.slug)
  const docs = useDocs()
  const audit = useAudit(o.slug)
  const [offer, setOffer] = useState<string>(OFFERS[0]), [terms, setTerms] = useState(''), [note, setNote] = useState(''), [err, setErr] = useState(''), [holdReason, setHoldReason] = useState(''), [att, setAtt] = useState<string | null>(null), [attNote, setAttNote] = useState(''), [grace, setGrace] = useState(String(o.graceDays)), [busy, setBusy] = useState(false)
  const run = (r: string | null, ok: string) => { if (r) { setErr(r); toast(r) } else { setErr(''); toast(ok) } }
  const checks = checklist(o)
  const live = !['Deleted', 'Saved', 'Reinstated', 'Withdrawn'].includes(o.state)
  const pending = o.retention?.outcome === 'Pending'
  const answered = o.retention && ['Declined', 'Waived'].includes(o.retention.outcome)
  const mine = [o.requestedBy, o.retention?.offeredBy, o.retention?.decidedBy].includes(actor)
  const unmet = checks.filter((c) => !c.ok && c.key !== 'hold').map((c) => c.label)
  const genExport = async (download: boolean) => {
    setBusy(true)
    try {
      const pkg = await buildPackage(o, { employees: employeesForTenant(o.slug), docs, exits, audit, real })
      const e = recordExport(o.id, actor, 'Platform administrator', 'Platform', pkg.meta, pkg.digest)
      if (e) { run(e, ''); return }
      if (download) downloadAll(pkg, `${o.slug}-export`)
      toast(`Export generated: ${pkg.files.length} files, digest ${pkg.digest.slice(0, 10)}…`)
    } finally { setBusy(false) }
  }
  return (
    <Overlay open onClose={onClose} title={`${o.company} · ${o.id}`} side wide>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[o.state]}>{o.state}</Badge>{o.test && <Badge tone="blue">Test</Badge>}{o.hold && <Badge tone="red">Legal hold</Badge>}<span className="text-slate">{o.plan} · {o.employees} staff · {money(o.mrr)}/mo</span></div>
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">{STAGES.map((s, i) => <li key={s} className={i < stageIndex(o) ? 'text-teal-600' : i === stageIndex(o) ? 'font-semibold text-ink' : 'text-slate'}>{i < stageIndex(o) ? '✓ ' : ''}{s}</li>)}</ol>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-ink/5 p-3">
          <div><dt className="text-xs text-slate">Requested by</dt><dd>{o.requestedBy} <span className="text-slate">({o.origin})</span></dd></div>
          <div><dt className="text-xs text-slate">Reason</dt><dd>{o.reason}{o.competitor ? ` → ${o.competitor}` : ''}</dd></div>
          <div><dt className="text-xs text-slate">Recommend score</dt><dd>{o.nps ?? 'Not given'}</dd></div>
          <div><dt className="text-xs text-slate">Wants data export</dt><dd>{o.wantsExport ? 'Yes' : 'No'}</dd></div>
          {o.detail && <div className="col-span-2"><dt className="text-xs text-slate">Detail</dt><dd>{o.detail}</dd></div>}
          {o.keptUs && <div className="col-span-2"><dt className="text-xs text-slate">What would have kept them</dt><dd>{o.keptUs}</dd></div>}
          {o.approvedBy && <div><dt className="text-xs text-slate">Approved by</dt><dd>{o.approvedBy}</dd></div>}
          {o.graceEnds && <div><dt className="text-xs text-slate">Grace ends</dt><dd>{fmtAt(o.graceEnds)} ({daysLeft(o.graceEnds)}d)</dd></div>}
        </dl>

        {o.state === 'Deleted' && o.tombstone && (
          <Panel title="Tombstone (kept for billing and legal)">
            <dl className="grid grid-cols-2 gap-2"><div><dt className="text-xs text-slate">Legal name</dt><dd>{o.tombstone.legalName}</dd></div><div><dt className="text-xs text-slate">CAC</dt><dd>{o.tombstone.cac}</dd></div><div><dt className="text-xs text-slate">Last invoice</dt><dd>{o.tombstone.lastInvoiceRef}</dd></div><div><dt className="text-xs text-slate">Deletion ref</dt><dd className="num">{o.tombstone.deletionRef}</dd></div><div><dt className="text-xs text-slate">Invoices kept until</dt><dd>{new Date(o.tombstone.invoicesRetainUntil).toLocaleDateString('en-GB')}</dd></div><div><dt className="text-xs text-slate">Audit kept until</dt><dd>{new Date(o.tombstone.auditRetainUntil).toLocaleDateString('en-GB')}</dd></div></dl>
            <div className="mt-3 text-xs text-slate">Purged: {o.tombstone.purged.join('; ')}.</div>
          </Panel>
        )}

        {live && <Panel title="Checklist before deletion">
          <ul className="space-y-3">{checks.map((c) => (
            <li key={c.key} className="flex gap-2.5">{c.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-ok" aria-label="Done" /> : <Circle size={17} className="mt-0.5 shrink-0 text-warn" aria-label="Open" />}
              <div className="min-w-0 flex-1"><div className="font-medium">{c.label}</div><div className={c.key === 'hold' && !c.ok ? 'text-err' : 'text-slate'}>{c.detail}</div>
                {manage && c.attest && !c.ok && (att === c.attest ? <div className="mt-2 flex gap-2"><input aria-label="How it was resolved" className={inputCls} placeholder="How was this resolved?" value={attNote} onChange={(e) => setAttNote(e.target.value)} /><Btn s="sm" onClick={() => { const r = attest(o.id, c.attest!, actor, attNote); run(r, 'Confirmed and audited.'); if (!r) { setAtt(null); setAttNote('') } }}>Confirm</Btn></div> : <Btn s="sm" v="secondary" className="mt-2" onClick={() => setAtt(c.attest!)}>Mark resolved</Btn>)}
              </div></li>))}</ul>
        </Panel>}

        {manage && live && <Panel title="Legal hold" action={<Scale size={15} className="text-slate" />}>
          {o.hold ? <><p className="text-slate">Placed by {o.hold.by} on {fmtAt(o.hold.at)}. Deletion cannot be scheduled or run while on.</p><Btn s="sm" v="secondary" className="mt-3" onClick={() => run(setHold(o.id, actor, false, ''), 'Legal hold released.')}>Release hold</Btn></>
            : <div className="flex gap-2"><input aria-label="Hold reason" className={inputCls} placeholder="Case or notice reference" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} /><Btn s="sm" v="secondary" onClick={() => run(setHold(o.id, actor, true, holdReason), 'Legal hold placed: deletion is blocked.')}>Place hold</Btn></div>}
        </Panel>}

        {manage && live && (
          <Panel title="Next action">
            {OPEN_STATES.includes(o.state) && <div className="space-y-3">
              {o.retention && <div className="rounded-md border border-line p-3"><div className="font-semibold">Offer: {o.retention.offer}</div><div className="text-slate">{o.retention.terms || 'No terms recorded'} · {o.retention.outcome}{o.retention.note ? ` (${o.retention.note})` : ''}</div></div>}
              {(!o.retention || o.retention.outcome === 'Waived') && !pending && <>
                <Field label="Retention offer"><select className={inputCls} value={offer} onChange={(e) => setOffer(e.target.value)}>{OFFERS.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Terms shown to the customer"><input className={inputCls} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
                <div className="flex flex-wrap gap-2"><Btn onClick={() => run(makeOffer(o.id, actor, offer, terms), 'Offer sent to the customer.')}>Send offer</Btn>
                  {!o.retention && <><input aria-label="Reason to skip the save attempt" className={`${inputCls} flex-1`} placeholder="Or skip with a reason (for example, company closing)" value={note} onChange={(e) => setNote(e.target.value)} /><Btn v="secondary" onClick={() => run(waiveRetention(o.id, actor, note), 'Save attempt skipped and audited.')}>Skip</Btn></>}</div></>}
              {pending && <div className="flex flex-wrap items-center gap-2"><span className="text-slate">Waiting for the customer.</span><input aria-label="Phone note" className={`${inputCls} flex-1`} placeholder="Note (for example, spoke to the MD)" value={note} onChange={(e) => setNote(e.target.value)} /><Btn s="sm" onClick={() => run(respondOffer(o.id, actor, 'Platform administrator', true, note, true), 'Recorded as accepted. Request closed.')}>Customer accepted</Btn><Btn s="sm" v="secondary" onClick={() => run(respondOffer(o.id, actor, 'Platform administrator', false, note, true), 'Recorded as declined.')}>Customer declined</Btn></div>}
              {answered && <div>
                {mine && <p className="mb-2 flex items-start gap-2 text-amber-800"><ShieldCheck size={15} className="mt-0.5 shrink-0" />{FOUR_EYES} You are signed in as {actor}.</p>}
                <div className="flex flex-wrap items-center gap-2"><Btn onClick={() => run(approveOffboarding(o.id, actor), 'Approved. The workspace is now read-only.')}><Lock size={15} />Approve and start grace</Btn><Btn v="secondary" onClick={() => run(withdraw(o.id, actor, 'Platform administrator', 'Platform'), 'Request withdrawn.')}>Withdraw</Btn></div></div>}
            </div>}
            {['Grace', 'Export ready', 'Deletion scheduled'].includes(o.state) && <div className="space-y-4">
              {o.state !== 'Deletion scheduled' && <div className="flex flex-wrap items-end gap-2"><Field label="Grace period (days)"><input className={`${inputCls} w-24`} inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} /></Field><Btn s="sm" v="secondary" onClick={() => run(setGraceDays(o.id, actor, Number(grace)), 'Grace period updated.')}>Update</Btn></div>}
              <div className="flex flex-wrap gap-2">
                <Btn v="secondary" disabled={busy} onClick={() => genExport(true)}><Download size={15} />{o.export ? 'Regenerate and download export' : 'Generate and download export'}</Btn>
                {!o.export && !o.exportWaived && <><input aria-label="Reason to waive the export" className={`${inputCls} flex-1`} placeholder="Customer declined export (who and why)" value={note} onChange={(e) => setNote(e.target.value)} /><Btn s="sm" v="secondary" onClick={() => run(waiveExport(o.id, actor, note), 'Export waived and audited.')}>Waive</Btn></>}
              </div>
              {o.state !== 'Deletion scheduled' && <Btn onClick={() => run(scheduleDeletion(o.id, actor, unmet.map((u) => `${u} not resolved`)), 'Deletion scheduled.')}>Schedule deletion</Btn>}
              {o.state === 'Deletion scheduled' && <div>
                <p className="text-slate">Scheduled by {o.scheduledBy}. A different administrator must run the deletion after {o.deletionDue ? fmtAt(o.deletionDue) : ''}.</p>
                <div className="mt-2 flex flex-wrap gap-2"><ConfirmDelete onConfirm={() => run(executeDeletion(o.id, actor, { cac: real ? tenants[o.slug].profile.cac : '', joined: real ? tenants[o.slug].created.slice(0, 10) : '' }), 'Workspace deleted and anonymised.')} real={real} /></div></div>}
              <div className="flex flex-wrap gap-2 border-t border-line pt-3"><Btn v="secondary" onClick={() => run(reinstate(o.id, actor, 'Platform administrator', 'Platform'), 'Workspace reinstated.')}><RotateCcw size={15} />Reinstate workspace</Btn>
                <Btn s="sm" v="ghost" onClick={() => { advanceDays(o.id, actor, 30); toast('Demo clock moved forward 30 days.') }} title="Demo only: moves grace and deletion dates earlier">Demo: skip 30 days</Btn></div>
            </div>}
            {err && <p role="alert" className="mt-3 flex gap-2 text-err"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{err}</p>}
          </Panel>
        )}
        {!manage && live && <p className="rounded-md bg-ink/5 p-3 text-slate">Your role can view offboarding but not change it.</p>}

        <Panel title="Timeline"><Timeline items={o.timeline.map((x) => ({ t: fmtAt(x.at), a: x.by, x: x.text }))} /></Panel>
      </div>
    </Overlay>
  )
}

function ConfirmDelete({ onConfirm, real }: { onConfirm: () => void; real: boolean }) {
  const [open, setOpen] = useState(false)
  return (<>
    <Btn v="dark" onClick={() => setOpen(true)}>Delete and anonymise</Btn>
    <Overlay open={open} onClose={() => setOpen(false)} title="Delete this workspace?" alert>
      <div className="space-y-4 text-sm"><p>Personal and business data is erased. Only the tombstone (legal name, CAC, plan, invoice references) remains. This cannot be undone.</p>
        {real && <p className="rounded-md bg-red-50 p-3 text-red-800">This is the live demo company. Its profile is blanked and its status becomes Expired. Use Settings, Reset demo to restore it.</p>}
        <div className="flex gap-2"><Btn v="dark" onClick={() => { setOpen(false); onConfirm() }}>Delete permanently</Btn><Btn v="secondary" onClick={() => setOpen(false)}>Cancel</Btn></div></div>
    </Overlay></>)
}
