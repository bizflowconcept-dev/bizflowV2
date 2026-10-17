import { useMemo, useState } from 'react'
import { Download, ExternalLink, Mail, Phone, Trophy } from 'lucide-react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, PageHeader, Panel, Table, Timeline, useToast } from '../../components/ui'
import { MODULES, planById, useBilling } from '../../data/billing'
import { QUOTE_STATUSES, quoteActions, useQuoteRequests } from '../../data/signup'
import type { QuoteRequest, QuoteStatus } from '../../data/signup'
import { fmtAt } from '../../platform/persist'
import { ADMIN_ROLES } from './roles'
import { useAdmin } from './AdminLayout'

const TONE: Record<QuoteStatus, string> = { New: 'blue', Contacted: 'amber', 'Proposal sent': 'teal', Won: 'green', Lost: 'gray' }
const OWNERS = Object.values(ADMIN_ROLES).map((r) => r.user)
const modName = (id: string) => MODULES.find((m) => m.id === id)?.name ?? id
const OPEN: QuoteStatus[] = ['New', 'Contacted', 'Proposal sent']

export default function QuoteRequests() {
  const { can, actor } = useAdmin()
  const toast = useToast()
  const billing = useBilling()
  const all = useQuoteRequests()
  const [stage, setStage] = useState<'All' | QuoteStatus>('All')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [lost, setLost] = useState('')
  const manage = can('subscriptions')
  const counts = useMemo(() => Object.fromEntries(QUOTE_STATUSES.map((s) => [s, all.filter((x) => x.status === s).length])) as Record<QuoteStatus, number>, [all])
  const decided = counts.Won + counts.Lost
  const rows = all.filter((x) => (stage === 'All' || x.status === stage) && `${x.company} ${x.contact} ${x.email} ${x.id}`.toLowerCase().includes(q.toLowerCase()))
  const cur = all.find((x) => x.id === sel)
  const pipelineStaff = all.filter((x) => OPEN.includes(x.status)).reduce((a, x) => a + x.employees, 0)

  const exportCsv = () => {
    const head = ['ID', 'Received', 'Company', 'Contact', 'Email', 'Phone', 'Employees', 'Industry', 'State', 'Plan', 'Modules', 'Branches', 'Timeline', 'Status', 'Owner', 'Workspace', 'Requirements']
    const body = rows.map((x) => [x.id, x.at, x.company, x.contact, x.email, x.phone, String(x.employees), x.industry, x.state, planById(billing, x.planId)?.name ?? x.planId, x.modules.map(modName).join('; '), x.branches, x.timeline, x.status, x.owner, x.tenantSlug ?? '', x.requirements])
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'bizflow-quote-requests.csv'
    a.click()
    toast(`${rows.length} quote request${rows.length === 1 ? '' : 's'} exported as CSV`)
  }
  const move = (x: QuoteRequest, s: QuoteStatus) => {
    if (s === 'Lost' && !lost.trim()) { toast('Add a reason before marking a request as lost'); return }
    quoteActions.setStatus(x.id, s, actor, s === 'Lost' ? lost.trim() : undefined)
    setLost('')
    toast(`${x.company} moved to ${s}`)
  }

  return (
    <div>
      <PageHeader eyebrow="Subscriptions" title="Quote requests" desc="Enterprise and custom-capacity requests from the public signup. Work each one from first contact to a signed workspace."
        actions={<Btn v="secondary" onClick={exportCsv} disabled={!rows.length}><Download size={15} />Export CSV</Btn>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Open requests', String(OPEN.reduce((a, s) => a + counts[s], 0)), `${counts.New} not yet contacted`],
          ['Employees in pipeline', pipelineStaff.toLocaleString('en-NG'), 'Across open requests'],
          ['Proposals out', String(counts['Proposal sent']), 'Waiting on the customer'],
          ['Win rate', decided ? `${Math.round((counts.Won / decided) * 100)}%` : 'No data', `${counts.Won} won · ${counts.Lost} lost`],
        ].map(([l, v, s]) => <Panel key={l}><div className="text-xs font-medium text-slate">{l}</div><div className="num mt-1 font-display text-[24px] font-semibold leading-none text-ink">{v}</div><div className="mt-1.5 text-xs text-slate">{s}</div></Panel>)}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Pipeline stage">
        {(['All', ...QUOTE_STATUSES] as const).map((s) => (
          <button key={s} type="button" aria-pressed={stage === s} onClick={() => setStage(s)} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold ${stage === s ? 'border-teal bg-softmint text-teal' : 'border-line bg-white text-slate hover:border-teal/50'}`}>
            {s} <span className="num ml-1 text-xs">{s === 'All' ? all.length : counts[s]}</span>
          </button>
        ))}
        <input aria-label="Search quote requests" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, contact or ID" className={`${inputCls} ml-auto max-w-xs`} />
      </div>

      <div className="mt-4">
        {all.length === 0 ? (
          <Panel><EmptyState title="No quote requests yet" body="When a prospect chooses Enterprise or needs custom capacity on the public signup, their request appears here." /></Panel>
        ) : (
          <Panel pad={false}>
            <Table label="Quote requests" pageSize={10} head={['Request', 'Company', 'Employees', 'Plan', 'Owner', 'Received', 'Status']}
              rows={rows.map((x) => [
                <button key="i" type="button" onClick={() => setSel(x.id)} className="cursor-pointer font-mono text-[13px] font-semibold text-teal underline-offset-2 hover:underline">{x.id}</button>,
                <span key="c"><b>{x.company}</b><span className="block text-xs text-slate">{x.contact}</span></span>,
                <span key="e" className="num">{x.employees.toLocaleString('en-NG')}</span>,
                planById(billing, x.planId)?.name ?? x.planId,
                x.owner || <span key="o" className="text-slate">Unassigned</span>,
                fmtAt(x.at),
                <Badge key="s" tone={TONE[x.status]}>{x.status}</Badge>,
              ])} />
            {rows.length === 0 && <div className="p-6 text-center text-sm text-slate">No requests match this filter.</div>}
          </Panel>
        )}
      </div>

      <Overlay open={!!cur} onClose={() => setSel(null)} title={cur ? `${cur.company} · ${cur.id}` : ''} side wide>
        {cur && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[cur.status]}>{cur.status}</Badge><span className="text-slate">Received {fmtAt(cur.at)}</span>{cur.tenantSlug && <Badge tone="green">Workspace {cur.tenantSlug}</Badge>}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-line p-4">
              {([['Contact', cur.contact], ['Employees', cur.employees.toLocaleString('en-NG')], ['Industry', cur.industry || '—'], ['State', cur.state || '—'], ['Branches', cur.branches || '—'], ['Timeline', cur.timeline], ['Plan', planById(billing, cur.planId)?.name ?? cur.planId], ['Reason', cur.reason]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-slate">{k}</dt><dd className="font-medium">{v}</dd></div>)}
              <div className="col-span-2 flex flex-wrap gap-3"><a href={`mailto:${cur.email}`} className="inline-flex items-center gap-1.5 font-semibold text-teal"><Mail size={14} />{cur.email}</a><a href={`tel:${cur.phone}`} className="inline-flex items-center gap-1.5 font-semibold text-teal"><Phone size={14} />{cur.phone}</a></div>
            </dl>
            <div><h3 className="mb-1.5 font-semibold">Requested modules ({cur.modules.length})</h3>{cur.modules.length ? <div className="flex flex-wrap gap-1.5">{cur.modules.map((m) => <Badge key={m} tone="gray">{modName(m)}</Badge>)}</div> : <p className="text-slate">None selected. The standard plan modules apply.</p>}</div>
            {cur.requirements && <div><h3 className="mb-1.5 font-semibold">Requirements</h3><p className="whitespace-pre-wrap rounded-lg bg-cloud p-3 text-slate">{cur.requirements}</p></div>}

            {manage ? (
              <>
                <Field label="Owner"><select value={cur.owner} onChange={(e) => { quoteActions.assign(cur.id, e.target.value, actor); toast(e.target.value ? `Assigned to ${e.target.value}` : 'Owner cleared') }} className={inputCls}><option value="">Unassigned</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></Field>
                <div>
                  <h3 className="mb-1.5 font-semibold">Move to stage</h3>
                  <div className="flex flex-wrap gap-2">{QUOTE_STATUSES.filter((s) => s !== 'Won' && s !== cur.status).map((s) => <Btn key={s} v="secondary" s="sm" onClick={() => move(cur, s)}>{s}</Btn>)}</div>
                  <input aria-label="Reason if lost" value={lost} onChange={(e) => setLost(e.target.value)} placeholder="Reason (required when marking Lost)" className={`${inputCls} mt-2`} />
                  {cur.status === 'Lost' && cur.lostReason && <p className="mt-1 text-xs text-slate">Lost reason: {cur.lostReason}</p>}
                </div>
                <div className="rounded-lg border border-teal/30 bg-softmint/40 p-4">
                  <h3 className="flex items-center gap-1.5 font-semibold"><Trophy size={15} className="text-teal" />Convert to workspace</h3>
                  {cur.tenantSlug
                    ? <p className="mt-1 text-slate">Workspace <b>{cur.tenantSlug}.bizflow.com</b> was created from this request. Complete setup and billing in Businesses.</p>
                    : <><p className="mt-1 text-slate">Creates the company workspace with the requested modules and marks this request Won. Invoicing and the administrator invitation follow from the businesses screen.</p>
                      <Btn className="mt-3" onClick={() => { const slug = quoteActions.convert(cur.id, actor); if (slug) toast(`Workspace ${slug} created`) }}>Convert to workspace</Btn></>}
                  {cur.tenantSlug && <Btn v="secondary" s="sm" className="mt-3" to={`/admin/businesses/${cur.tenantSlug}`}><ExternalLink size={14} />Open business</Btn>}
                </div>
              </>
            ) : <p className="rounded-lg bg-cloud p-3 text-slate">You can view this request. Managing quotes needs the Manage Subscriptions permission.</p>}

            <div>
              <h3 className="mb-1.5 font-semibold">Notes</h3>
              {manage && <form onSubmit={(e) => { e.preventDefault(); quoteActions.addNote(cur.id, note, actor); setNote(''); toast('Note added') }} className="flex gap-2"><input aria-label="Add a note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Call summary, pricing discussed, next step" className={inputCls} /><Btn type="submit" v="secondary" disabled={!note.trim()}>Add</Btn></form>}
              {cur.notes.length === 0 ? <p className="mt-2 text-slate">No notes yet.</p> : <ul className="mt-2 space-y-2">{cur.notes.map((n, i) => <li key={i} className="rounded-lg border border-line p-3"><div className="text-xs text-slate">{n.by} · {fmtAt(n.at)}</div><p className="mt-0.5">{n.text}</p></li>)}</ul>}
            </div>
            <div><h3 className="mb-1.5 font-semibold">Stage history</h3><Timeline items={[...cur.history].reverse().map((h) => ({ t: fmtAt(h.at), a: h.status, x: h.by }))} /></div>
          </div>
        )}
      </Overlay>
    </div>
  )
}
