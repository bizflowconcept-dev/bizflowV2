import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileCheck2, ShieldCheck } from 'lucide-react'
import { Badge, Btn, EmptyState, Field, inputCls, Panel, Table, useToast } from '../../components/ui'
import { AUDIT_CATEGORIES, useAudit } from '../../tenant/store'
import type { AuditEntry } from '../../tenant/store'
import { buildSignedReport, chainSelfTest, verifyChain, verifyReportFiles } from '../../security/auditChain'
import type { ChainReport, VerifyOutcome } from '../../security/auditChain'
import { downloadFile } from '../../platform/offboardExport'
import { fmtAt } from '../../platform/persist'
import { useAdmin } from './AdminLayout'

/** Platform-wide audit trail with filters, a chain verifier and a signed export. Embedded on the System page and routed at /admin/audit-trail. */
export default function AuditTrail({ embedded = false }: { embedded?: boolean }) {
  const { can, actor } = useAdmin()
  const toast = useToast()
  const all = useAudit()
  const [q, setQ] = useState(''), [scope, setScope] = useState('All'), [tenant, setTenant] = useState('All'), [cat, setCat] = useState('All'), [res, setRes] = useState('All'), [who, setWho] = useState('All')
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [focus, setFocus] = useState<string | null>(null)
  const [report, setReport] = useState<ChainReport | null>(null)
  const [self, setSelf] = useState<ReturnType<typeof chainSelfTest> | undefined>()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null)
  const csvRef = useRef<HTMLInputElement>(null), manRef = useRef<HTMLInputElement>(null)
  const canExport = can('auditexport')

  const tenants = useMemo(() => ['All', ...new Set(all.map((a) => a.tenant))].sort(), [all])
  const people = useMemo(() => ['All', ...new Set(all.map((a) => a.actor))].sort(), [all])
  const rows = useMemo(() => all.filter((a) => {
    if (focus) return a.id === focus
    if (scope !== 'All' && a.scope !== scope) return false
    if (tenant !== 'All' && a.tenant !== tenant) return false
    if (cat !== 'All' && (a.category ?? 'General') !== cat) return false
    if (res !== 'All' && (a.result ?? 'Success') !== res) return false
    if (who !== 'All' && a.actor !== who) return false
    if (from && a.at.slice(0, 10) < from) return false
    if (to && a.at.slice(0, 10) > to) return false
    return !q || `${a.action} ${a.actor} ${a.tenant} ${a.ref ?? ''} ${a.from ?? ''} ${a.to ?? ''} ${a.id}`.toLowerCase().includes(q.toLowerCase())
  }), [all, q, scope, tenant, cat, res, who, from, to, focus])
  const filters = { search: q, scope, tenant, category: cat, result: res, actor: who, from, to }
  const reset = () => { setQ(''); setScope('All'); setTenant('All'); setCat('All'); setRes('All'); setWho('All'); setFrom(''); setTo(''); setFocus(null) }

  const verify = () => { const r = verifyChain(all); setReport(r); setSelf(undefined); toast(r.ok ? `Chain intact: ${r.checked} entries verified.` : `Chain broken at ${r.firstBreak?.id}.`) }
  const exportSigned = async () => {
    if (!canExport) return toast('Your role cannot export audit reports.')
    if (!rows.length) return toast('No rows match the filters to export.')
    setBusy(true)
    try {
      const out = await buildSignedReport(rows as AuditEntry[], all, { by: actor, role: 'Platform administrator', filters })
      downloadFile(out.csvName, out.csv)
      setTimeout(() => downloadFile(out.manifestName, out.manifestJson, 'application/json'), 300)
      toast(`Exported ${rows.length} rows with a signed manifest. The export was audited.`)
    } finally { setBusy(false) }
  }
  const checkFiles = async () => {
    const c = csvRef.current?.files?.[0], m = manRef.current?.files?.[0]
    if (!c || !m) return toast('Choose both the CSV and its manifest.')
    setOutcome(await verifyReportFiles(await c.text(), await m.text()))
  }

  const head = (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Panel title="Chain integrity" action={<ShieldCheck size={16} className="text-slate" />}>
        <p className="text-sm text-slate">Each entry stores a hash of its own fields plus the hash of the entry before it. Verification recomputes every hash and every link from the stored data, so an edited, removed or reordered entry is found.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={verify}><ShieldCheck size={15} />Verify chain integrity</Btn>
          <Btn v="secondary" onClick={() => setSelf(chainSelfTest(all) ?? null)}>Run tamper self-test</Btn>
        </div>
        {report && (report.ok
          ? <div role="status" className="mt-3 flex gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0" /><div><b>Chain intact.</b> {report.checked} chained entries verified{report.unchained ? `, ${report.unchained} older entries have no hash` : ''}{report.restarts ? `, ${report.restarts} chain restart(s) tolerated` : ''}. Head <span className="num">{report.head}</span>. Checked {fmtAt(report.verifiedAt)}.</div></div>
          : <div role="alert" className="mt-3 flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><div><b>{report.firstBreak!.kind === 'mismatch' ? 'Entry altered.' : 'Link broken.'}</b> First failure at position {report.firstBreak!.position + 1} of {report.checked}: <span className="num">{report.firstBreak!.id}</span> ({fmtAt(report.firstBreak!.at)}). {report.firstBreak!.message} Expected <span className="num">{report.firstBreak!.expected}</span>, found <span className="num">{report.firstBreak!.actual || 'none'}</span>.<div><button className="mt-1 cursor-pointer font-semibold underline" onClick={() => setFocus(report.firstBreak!.id)}>Show this entry</button></div></div></div>)}
        {self === null && <p className="mt-3 text-sm text-slate">Not enough chained entries yet for a self-test (needs 3).</p>}
        {self && <ul className="mt-3 space-y-1 text-sm"><li>Edited entry (on a copy): {self.tamper.ok ? <b className="text-err">NOT detected</b> : <b className="text-ok">detected at {self.tamper.firstBreak?.id}</b>}</li><li>Removed entry (on a copy): {self.removal.ok ? <b className="text-err">NOT detected</b> : <b className="text-ok">detected at {self.removal.firstBreak?.id}</b>}</li><li className="text-xs text-slate">Stored data was not changed.</li></ul>}
      </Panel>
      <Panel title="Signed report">
        <p className="text-sm text-slate">Exports the {rows.length} filtered row(s) as CSV with a JSON manifest: chain head, range, who generated it, SHA-256 of the file and an HMAC-SHA-256 signature. The export itself is written to the audit trail.</p>
        <div className="mt-3"><Btn disabled={busy || !canExport} onClick={exportSigned}><Download size={15} />{busy ? 'Signing…' : 'Export signed report'}</Btn></div>
        {!canExport && <p className="mt-2 text-xs text-slate">Needs the Export audit reports permission, which your role does not have.</p>}
        <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium"><FileCheck2 size={14} className="mr-1 inline" />Check an exported report</summary>
          <div className="mt-3 space-y-2"><Field label="CSV file"><input ref={csvRef} type="file" accept=".csv" className="text-sm" /></Field><Field label="Manifest (.json)"><input ref={manRef} type="file" accept=".json" className="text-sm" /></Field><Btn s="sm" v="secondary" onClick={checkFiles}>Check files</Btn>
            {outcome && <ul role="status" className="space-y-1">{outcome.checks.map((c) => <li key={c.label} className="flex gap-2">{c.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-err" />}<span><b>{c.label}.</b> <span className="text-slate">{c.detail}</span></span></li>)}</ul>}</div>
        </details>
      </Panel>
    </div>
  )

  return (
    <div className={embedded ? 'mt-5' : ''}>
      {!embedded && <div className="mb-5"><div className="text-xs font-semibold uppercase tracking-wider text-teal-600">System</div><h1 className="mt-1 font-display text-[26px] font-semibold text-ink">Audit trail and integrity</h1><p className="mt-1 text-sm text-slate">Every platform and business action, tamper-evident and exportable.</p></div>}
      {head}
      <Panel className="mt-4" title={`Entries (${rows.length} of ${all.length})`} pad={false} action={(focus || q || scope !== 'All' || tenant !== 'All' || cat !== 'All' || res !== 'All' || who !== 'All' || from || to) ? <Btn s="sm" v="ghost" onClick={reset}>Clear filters</Btn> : undefined}>
        <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4">
          <input aria-label="Search audit trail" className={`${inputCls} col-span-2`} placeholder="Search action, actor, reference" value={q} onChange={(e) => { setQ(e.target.value); setFocus(null) }} />
          {([['Scope', scope, setScope, ['All', 'Platform', 'Business']], ['Company', tenant, setTenant, tenants], ['Category', cat, setCat, ['All', ...AUDIT_CATEGORIES]], ['Result', res, setRes, ['All', 'Success', 'Failed']], ['Actor', who, setWho, people]] as const).map(([l, v, set, opts]) => (
            <select key={l} aria-label={l} className={inputCls} value={v} onChange={(e) => { set(e.target.value); setFocus(null) }}>{opts.map((o) => <option key={o} value={o}>{o === 'All' ? `${l}: all` : o}</option>)}</select>))}
          <input aria-label="From date" type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input aria-label="To date" type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {rows.length === 0 ? <div className="p-4"><EmptyState title="No entries match" body="Widen the date range or clear a filter." action={<Btn s="sm" v="secondary" onClick={reset}>Clear filters</Btn>} /></div> : (
          <Table label="Audit entries" pageSize={10} head={['When', 'Scope', 'Company', 'Actor', 'Action', 'Result', 'Hash']}
            rows={rows.map((a) => [<span key="w" className="num whitespace-nowrap">{fmtAt(a.at)}</span>, <Badge key="s" tone={a.scope === 'Platform' ? 'blue' : 'teal'}>{a.scope}</Badge>, a.tenant,
              <span key="a">{a.actor}<span className="block text-xs text-slate">{a.role}</span></span>,
              <span key="x">{a.action}{(a.from || a.to) && <span className="block text-xs text-slate">{[a.from, a.to].filter(Boolean).join(' → ')}</span>}</span>,
              <Badge key="r" tone={a.result === 'Failed' ? 'red' : 'green'}>{a.result ?? 'Success'}</Badge>,
              <span key="h" className={`num text-xs ${report?.firstBreak?.id === a.id ? 'font-bold text-err' : 'text-slate'}`}>{a.hash ?? 'unchained'}</span>])} />
        )}
      </Panel>
    </div>
  )
}
