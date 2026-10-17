import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Btn, EmptyState, Panel, Table, Field, inputCls, Overlay, useToast } from '../components/ui'
import { ngn } from '../data/demo'
import { useIncome } from '../finance/ledger'
import { useSignRequestsForLead } from '../pages/app/SignModule'
import { autoMap, buildRows, IMPORT_FIELDS, parseCsv, SAMPLE_CSV } from './csv'
import type { ImportKey, Mapping } from './csv'
import { earnedSummary, fmtDate, importLeads, receivablesOf, scheduleOf, setTarget, useLeads, useTargets, wonThisMonth } from './store'
import type { Lead } from './store'

const sel = 'h-8 w-full rounded-md border border-line bg-white px-2 text-sm'

export function AttainmentBar({ won, target }: { won: number; target: number }) {
  const p = target > 0 ? Math.round((won / target) * 100) : 0
  return (
    <div className="min-w-32" title={`${ngn(won)} of ${ngn(target)}`}>
      <div className="mb-1 flex justify-between text-xs"><span className="num">{target ? `${p}%` : 'No target'}</span><span className="num text-slate">{ngn(won)}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={Math.min(p, 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Target attainment"><div className={`h-full rounded-full ${p >= 100 ? 'bg-ok' : p >= 50 ? 'bg-teal' : 'bg-warn'}`} style={{ width: `${Math.min(p, 100)}%` }} /></div>
    </div>
  )
}

export function useAttainment(slug: string, leads: Lead[], today: string) {
  const targets = useTargets(slug)
  return (owner: string) => ({ target: targets[owner] ?? 0, won: wonThisMonth(leads, owner, today) })
}

export function TargetsDialog({ open, onClose, slug, people, by }: { open: boolean; onClose: () => void; slug: string; people: string[]; by: string }) {
  const targets = useTargets(slug); const toast = useToast()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const val = (p: string) => draft[p] ?? (targets[p] ? String(targets[p]) : '')
  return (
    <Overlay open={open} onClose={onClose} title="Monthly sales targets">
      <p className="mb-3 text-sm text-slate">Quota of won deal value per owner for each month. Attainment appears under Insights and Team performance.</p>
      <div className="max-h-[50vh] space-y-2 overflow-y-auto">
        {people.map((p) => <Field key={p} label={p}><input type="number" min={0} className={inputCls} placeholder="No target" value={val(p)} onChange={(e) => setDraft({ ...draft, [p]: e.target.value })} /></Field>)}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Btn v="secondary" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => { Object.entries(draft).forEach(([p, v]) => { const n = Math.max(0, Number(v) || 0); if (n !== (targets[p] ?? 0)) setTarget(slug, p, n, by) }); setDraft({}); toast('Sales targets saved'); onClose() }}>Save targets</Btn>
      </div>
    </Overlay>
  )
}

export function ImportDialog({ open, onClose, slug, existing, people, by, today }: { open: boolean; onClose: () => void; slug: string; existing: string[]; people: string[]; by: string; today: string }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [map, setMap] = useState<Mapping | null>(null)
  const [skipDup, setSkipDup] = useState(true)
  const table = useMemo(() => parseCsv(text), [text])
  const header = table[0] ?? [], data = table.slice(1)
  const m = map ?? autoMap(header)
  const rows = useMemo(() => buildRows(data, m, existing, { owner: by, close: today.slice(0, 8) + '28' }), [data, m, existing, by, today])
  const ok = rows.filter((r) => !r.errors.length && !(skipDup && r.duplicate))
  const missing = IMPORT_FIELDS.filter((f) => 'required' in f && f.required && m[f.key] < 0)
  const reset = () => { setText(''); setMap(null) }
  const onFile = (f?: File) => { if (f) f.text().then((t) => { setText(t); setMap(null) }) }
  return (
    <Overlay open={open} onClose={() => { reset(); onClose() }} title="Import leads from CSV" wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept=".csv,text/csv" aria-label="Upload CSV file" className="text-sm" onChange={(e) => onFile(e.target.files?.[0])} />
          <Btn s="sm" v="ghost" onClick={() => { setText(SAMPLE_CSV); setMap(null) }}>Use sample</Btn>
        </div>
        <Field label="Or paste CSV (first row is the header)"><textarea rows={4} className={`${inputCls} h-auto py-2 font-mono text-xs`} value={text} onChange={(e) => { setText(e.target.value); setMap(null) }} placeholder="Company,Contact,Email,..." /></Field>
        {header.length > 0 && (
          <>
            <div>
              <div className="mb-2 text-sm font-semibold">Map columns</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {IMPORT_FIELDS.map((f) => (
                  <label key={f.key} className="text-xs font-medium text-slate">{f.label}{'required' in f && f.required ? ' *' : ''}
                    <select className={sel} value={m[f.key]} onChange={(e) => setMap({ ...m, [f.key as ImportKey]: Number(e.target.value) })}><option value={-1}>Not mapped</option>{header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</select>
                  </label>
                ))}
              </div>
              {missing.length > 0 && <p className="mt-2 text-sm text-err">Map {missing.map((f) => f.label).join(' and ')} to continue. Unmapped owners default to you.</p>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead><tr className="bg-cloud text-left text-xs text-slate"><th className="px-3 py-2">Row</th><th className="px-3 py-2">Company</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Check</th></tr></thead>
                <tbody>
                  {rows.slice(0, 50).map((r) => (
                    <tr key={r.line} className="border-t border-line">
                      <td className="px-3 py-1.5 text-slate">{r.line}</td><td className="px-3 py-1.5">{r.lead.company || '-'}</td><td className="px-3 py-1.5">{r.lead.contact || '-'}</td><td className="px-3 py-1.5">{r.lead.stage}</td>
                      <td className="px-3 py-1.5">{r.lead.owner}{!people.includes(r.lead.owner) && <span className="text-xs text-slate"> (new)</span>}</td>
                      <td className="px-3 py-1.5">{r.errors.length ? <span className="text-err">{r.errors.join('; ')}</span> : r.duplicate ? <Badge tone="amber">{r.duplicate === 'existing' ? 'Already in CRM' : 'Repeated in file'}</Badge> : <Badge tone="green">Ready</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-teal" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />Skip duplicates (matched by company name)</label>
          </>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-slate">{header.length ? `${ok.length} of ${rows.length} rows will be imported; ${rows.filter((r) => r.errors.length).length} with errors.` : 'Paste or upload a CSV to preview.'}</span>
          <div className="flex gap-2"><Btn v="secondary" onClick={() => { reset(); onClose() }}>Cancel</Btn><Btn disabled={!ok.length || missing.length > 0} onClick={() => { const made = importLeads(slug, ok.map((r) => r.lead), by); toast(`${made.length} lead${made.length === 1 ? '' : 's'} imported`); reset(); onClose() }}>Import {ok.length || ''}</Btn></div>
        </div>
      </div>
    </Overlay>
  )
}

export function Customer360({ lead, today }: { lead: Lead; today: string }) {
  const docs = useSignRequestsForLead(lead.id)
  const income = useIncome(lead.tenant).filter((e) => e.ref.startsWith(`${lead.id} `))
  const plan = lead.earning, sum = plan ? earnedSummary(plan, today) : null
  const late = plan ? scheduleOf(plan, today).filter((x) => x.status === 'Overdue').length : 0
  const box = 'rounded-lg border border-line p-3'
  const h = 'mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate'
  return (
    <div className="space-y-4">
      <div className={box}>
        <div className={h}>Customer</div>
        <div className="text-sm font-semibold">{lead.company}</div>
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate">Contact</dt><dd>{lead.contact}</dd><dt className="text-slate">Email</dt><dd className="truncate">{lead.email || '-'}</dd><dt className="text-slate">Phone</dt><dd>{lead.phone || '-'}</dd>
          <dt className="text-slate">Industry</dt><dd>{lead.industry}</dd><dt className="text-slate">Owner</dt><dd>{lead.owner}</dd><dt className="text-slate">Deal value</dt><dd className="num">{ngn(lead.value)}</dd>
        </dl>
      </div>
      <div className={box}>
        <div className={h}>Earning plan</div>
        {plan && sum ? <div className="text-sm">{plan.cadence} {ngn(plan.amount)} · received <b className="num">{ngn(sum.received)}</b> · outstanding <b className={`num ${sum.outstanding > 0 ? 'text-err' : ''}`}>{ngn(sum.outstanding)}</b>{late > 0 && <> · <Badge tone="red">{late} overdue</Badge></>}</div> : <p className="text-sm text-slate">No earning plan yet.</p>}
      </div>
      <div className={box}>
        <div className={h}>Sign documents</div>
        {docs.length === 0 ? <p className="text-sm text-slate">No documents sent for signature.</p> : <ul className="divide-y divide-line">{docs.map((d) => <li key={d.id} className="flex items-center gap-2 py-1.5 text-sm"><span className="min-w-0 flex-1 truncate">{d.doc}</span><Badge>{d.status}</Badge><span className="text-xs text-slate">{d.signed}/{d.total}</span><Link to={`/admin/business/sign?request=${d.id}`} className="font-semibold text-teal">Open</Link></li>)}</ul>}
      </div>
      <div className={box}>
        <div className={h}>Invoices and income posted</div>
        {income.length === 0 ? <EmptyState title="Nothing posted yet" body="Payments recorded against the earning plan are posted to Accounting and listed here." /> : <ul className="divide-y divide-line">{income.map((e) => <li key={e.id} className="flex items-center gap-2 py-1.5 text-sm"><span className="num text-xs text-slate">{e.id}</span><span className="min-w-0 flex-1 truncate">{e.description}</span><span className="num font-semibold">{ngn(e.amount)}</span><span className="text-xs text-slate">{fmtDate(e.date)}</span></li>)}</ul>}
        <Link to="/admin/business/accounting" className="mt-2 inline-block text-sm font-semibold text-teal">Open Accounting</Link>
      </div>
    </div>
  )
}

/** Accounting view: overdue CRM earning instalments (ageing) and income already posted from CRM. */
export function CrmReceivables({ slug, today }: { slug: string; today: string }) {
  const leads = useLeads(slug); const income = useIncome(slug)
  const rec = receivablesOf(leads, today)
  const buckets = ['1-7 days', '8-30 days', '31+ days'] as const
  return (
    <div className="space-y-4">
      <Panel title="CRM receivables ageing" pad={false}>
        <div className="grid grid-cols-3 gap-3 p-4">
          {buckets.map((b) => { const xs = rec.filter((r) => r.bucket === b); return <div key={b} className="rounded-lg border border-line p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate">{b} late</div><div className="num mt-1 text-base font-semibold">{ngn(xs.reduce((a, r) => a + r.outstanding, 0))}</div><div className="text-xs text-slate">{xs.length} instalment{xs.length === 1 ? '' : 's'}</div></div> })}
        </div>
        {rec.length === 0 ? <p className="px-4 pb-4 text-sm text-slate">No overdue customer instalments.</p> : <Table right={[2]} head={['Customer', 'Instalment due', 'Outstanding', 'Ageing']} rows={rec.map((r) => [<Link key="c" to={`/admin/business/crm?lead=${r.lead.id}`} className="font-semibold text-teal">{r.lead.company}</Link>, fmtDate(r.due), <span key="o" className="num">{ngn(r.outstanding)}</span>, <Badge key="b" tone={r.bucket === '31+ days' ? 'red' : 'amber'}>{r.daysLate} days</Badge>])} />}
      </Panel>
      <Panel title="Income posted from CRM" pad={false}>
        {income.length === 0 ? <p className="p-4 text-sm text-slate">Nothing posted yet. Recording a customer payment in CRM posts it here.</p> : <Table right={[3]} head={['Entry', 'Customer', 'Account', 'Amount', 'Date']} rows={income.slice(0, 12).map((e) => [e.id, e.customer, e.account, <span key="a" className="num">{ngn(e.amount)}</span>, fmtDate(e.date)])} />}
      </Panel>
    </div>
  )
}
