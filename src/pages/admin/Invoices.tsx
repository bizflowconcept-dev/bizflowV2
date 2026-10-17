import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { Printer } from 'lucide-react'
import { Badge, Btn, EmptyState, ExportButton, Field, Overlay, PageHeader, Panel, Table, Tabs, inputCls, useToast } from '../../components/ui'
import { useAdmin } from './AdminLayout'
import { CREDIT_APPROVAL_THRESHOLD, INVOICE_STATUSES, STATUS_TONE, VAT_RATE, creditHeadroom, decideCreditNote, fmtN, issueDraft, ledgerStats, originalMethod, recordPayment, refundInvoice, refundable, requestCreditNote, sendInvoiceReminder, useInvoices, voidInvoice } from '../../billing/ledger'
import type { InvStatus, Invoice } from '../../billing/ledger'
import { METHODS } from '../../billing/ledgerStore'
import type { Method } from '../../billing/ledgerStore'
import { fmtDate } from '../../data/billing'

type Mode = '' | 'pay' | 'credit' | 'refund' | 'void'
const num = (v: string) => Number(v.replace(/[^\d.]/g, '')) || 0

function PrintView({ inv }: { inv: Invoice }) {
  const sub = inv.tenant.sub
  return (
    <div className="pdf-root" style={{ color: '#0B2530', fontFamily: 'inherit', padding: '8mm 4mm' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0B2530', paddingBottom: 12 }}>
        <div><div style={{ fontSize: 22, fontWeight: 700 }}>BizFlow</div><div style={{ fontSize: 11 }}>BizFlow Technologies Ltd, Lagos, Nigeria</div></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontSize: 20, fontWeight: 700 }}>{inv.status === 'Void' ? 'VOID INVOICE' : 'TAX INVOICE'}</div><div style={{ fontSize: 12 }}>{inv.number}</div></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '16px 0', fontSize: 12 }}>
        <div><b>Billed to</b><br />{inv.tenant.name}<br />{sub.country}<br />{sub.employees} employees</div>
        <div style={{ textAlign: 'right' }}>Issue date: {fmtDate(inv.issueDate)}<br />Due date: {fmtDate(inv.dueDate)}<br />Period: {inv.period}<br />Status: {inv.status}</div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ background: '#EEF3F4' }}><th style={{ textAlign: 'left', padding: 6 }}>Description</th><th style={{ textAlign: 'right', padding: 6 }}>Amount</th></tr></thead>
        <tbody>{inv.lines.map((l, i) => <tr key={i} className="pdf-avoid" style={{ borderBottom: '1px solid #D8E2E3' }}><td style={{ padding: 6 }}>{l.label}{l.detail ? <span style={{ color: '#5B6B73' }}> ({l.detail})</span> : null}</td><td style={{ padding: 6, textAlign: 'right' }}>{fmtN(l.amount)}</td></tr>)}</tbody>
      </table>
      <div className="pdf-avoid" style={{ marginLeft: 'auto', width: 260, marginTop: 12, fontSize: 12 }}>
        {[['Subtotal', fmtN(inv.subtotal)], [`VAT (${(VAT_RATE * 100).toFixed(1)}%)`, fmtN(inv.vat)], ['Total', fmtN(inv.total)], ...(inv.credited ? [['Credit notes', '-' + fmtN(inv.credited)]] : []), ['Paid', '-' + fmtN(inv.paid)], ...(inv.refunded ? [['Refunded', fmtN(inv.refunded)]] : []), ['Balance due', fmtN(inv.balance)]].map(([k, v], i, a) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: i === a.length - 1 || k === 'Total' ? 700 : 400, borderTop: k === 'Total' ? '1px solid #0B2530' : undefined }}><span>{k}</span><span>{v}</span></div>)}
      </div>
      {inv.payments.length > 0 && <div className="pdf-avoid" style={{ marginTop: 18, fontSize: 11 }}><b>Payments received</b>{inv.payments.map((p) => <div key={p.id}>{fmtDate(p.at)} - {p.method} - {p.ref} - {fmtN(p.amount)}</div>)}</div>}
      {inv.credits.filter((c) => c.status === 'Approved').length > 0 && <div className="pdf-avoid" style={{ marginTop: 10, fontSize: 11 }}><b>Credit notes</b>{inv.credits.filter((c) => c.status === 'Approved').map((c) => <div key={c.id}>{c.id} - {fmtN(c.amount)} - {c.reason}</div>)}</div>}
      <p style={{ marginTop: 28, fontSize: 10, color: '#5B6B73' }}>Amounts are in Nigerian naira. Pay by card, bank transfer or direct debit; quote {inv.number} as the reference.</p>
    </div>
  )
}

export default function Invoices() {
  const { can, actor } = useAdmin()
  const toast = useToast()
  const { invoices } = useInvoices()
  const stats = useMemo(() => ledgerStats(invoices), [invoices])
  const [tab, setTab] = useState('Invoices')
  const [q, setQ] = useState(''); const [status, setStatus] = useState<'All' | InvStatus>('All'); const [method, setMethod] = useState<'All' | Method>('All'); const [period, setPeriod] = useState('All')
  const [openId, setOpenId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('')
  const [amt, setAmt] = useState(''); const [pm, setPm] = useState<Method>('Bank transfer'); const [ref, setRef] = useState(''); const [text, setText] = useState(''); const [flag, setFlag] = useState(false); const [err, setErr] = useState('')
  const [printing, setPrinting] = useState(false)
  const [decision, setDecision] = useState<{ inv: Invoice; id: string; approve: boolean } | null>(null); const [dnote, setDnote] = useState(''); const [derr, setDerr] = useState('')
  const act = can('payments')
  const inv = invoices.find((i) => i.id === openId) ?? null
  const periods = useMemo(() => ['All', ...Array.from(new Set(invoices.map((i) => i.period)))], [invoices])
  const rows = invoices.filter((i) => (status === 'All' || i.status === status) && (method === 'All' || i.method === method) && (period === 'All' || i.period === period) && (!q.trim() || (i.number + i.tenant.name).toLowerCase().includes(q.trim().toLowerCase())))
  const pending = invoices.flatMap((i) => i.credits.filter((c) => c.status === 'Pending approval').map((c) => ({ inv: i, c })))
  const allCredits = invoices.flatMap((i) => i.credits.map((c) => ({ inv: i, c })))

  useEffect(() => {
    if (!printing) return
    document.body.classList.add('printing-docs')
    const done = () => { document.body.classList.remove('printing-docs'); setPrinting(false) }
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 250)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('printing-docs') }
  }, [printing])

  const close = () => { setOpenId(null); setMode(''); setErr('') }
  const start = (m: Mode) => {
    if (!inv) return
    setErr(''); setText(''); setRef(''); setFlag(false); setMode(m)
    if (m === 'pay') { setAmt(String(inv.balance)); setPm(inv.method) }
    if (m === 'credit') setAmt(String(Math.min(creditHeadroom(inv), inv.balance || creditHeadroom(inv))))
    if (m === 'refund') { setAmt(String(refundable(inv))); setPm(originalMethod(inv)) }
  }
  const run = (e: string, ok: string) => { if (e) { setErr(e); return false } setErr(''); setMode(''); toast(ok); return true }
  const submit = () => {
    if (!inv) return
    const a = num(amt)
    if (mode === 'pay') run(recordPayment(invoices, inv, a, pm, ref.trim() || `MAN-${Date.now().toString().slice(-6)}`, text, actor), 'Payment recorded')
    if (mode === 'credit') run(requestCreditNote(inv, a, text, flag, actor), a >= CREDIT_APPROVAL_THRESHOLD ? 'Credit note sent for second approval' : 'Credit note requested')
    if (mode === 'refund') run(refundInvoice(inv, a, text, flag, actor), 'Refund recorded')
    if (mode === 'void') run(voidInvoice(inv, text, flag, actor), 'Invoice voided')
  }
  const decide = () => {
    if (!decision) return
    const e = decideCreditNote(decision.inv, decision.inv.credits.find((c) => c.id === decision.id)!, decision.approve, dnote, actor)
    if (e) { setDerr(e); return }
    toast(decision.approve ? 'Credit note approved' : 'Credit note rejected'); setDecision(null); setDnote(''); setDerr('')
  }
  const invRow = (i: Invoice) => [<button key="n" className="font-semibold text-teal hover:underline" onClick={() => setOpenId(i.id)}>{i.number}</button>, i.tenant.name, i.period, fmtDate(i.dueDate), fmtN(i.total), fmtN(i.balance), <Badge key="s" tone={STATUS_TONE[i.status]}>{i.status}</Badge>, i.method]

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Finance" title="Invoices and credit notes" desc="Every invoice, payment, credit note and refund. Balances update everywhere the moment you record something." actions={<>
        <Btn v="secondary" to="/admin/billing/recovery">Payment recovery</Btn>
        <ExportButton name="invoices" head={['Invoice', 'Tenant', 'Period', 'Due', 'Total', 'Balance', 'Status', 'Method']} rows={rows.map((i) => [i.number, i.tenant.name, i.period, i.dueDate, String(i.total), String(i.balance), i.status, i.method])} />
      </>} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['Outstanding', fmtN(stats.outstanding), `${stats.outstandingCount} open invoices`], ['Overdue', fmtN(stats.overdueAmt), `${stats.overdueCount} invoices`], ['Collected this month', fmtN(stats.collected), `Refunded ${fmtN(stats.refundedMtd)}, credited ${fmtN(stats.creditsMtd)}`], ['Recovered after overdue', pctS(stats.recoveryRate), `${stats.recoveredCount} invoices, ${fmtN(stats.recoveredAmt)}`]].map(([l, v, h]) => (
          <div key={l} className="rounded-xl border border-line bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate">{l}</div><div className="num mt-1 text-2xl font-bold">{v}</div><div className="mt-0.5 text-xs text-slate">{h}</div></div>
        ))}
      </div>

      <Tabs tabs={['Invoices', `Credit notes${stats.pendingCredits ? ` (${stats.pendingCredits} pending)` : ''}`]} value={tab.startsWith('Credit') ? `Credit notes${stats.pendingCredits ? ` (${stats.pendingCredits} pending)` : ''}` : 'Invoices'} onChange={(t) => setTab(t.startsWith('Credit') ? 'Credit notes' : 'Invoices')} />

      {tab === 'Invoices' ? (
        <Panel pad={false}>
          <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
            <div className="min-w-[200px] flex-1"><Field label="Search"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice number or tenant" /></Field></div>
            <Field label="Status"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as 'All' | InvStatus)}><option>All</option>{INVOICE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Method"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as 'All' | Method)}><option>All</option>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Period"><select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>{periods.map((p) => <option key={p}>{p}</option>)}</select></Field>
          </div>
          {rows.length === 0 ? <EmptyState title="No invoices match" body="Clear a filter or search for a different tenant." /> : <Table label="Invoices" head={['Invoice', 'Tenant', 'Period', 'Due', 'Total', 'Balance', 'Status', 'Method']} right={[4, 5]} pageSize={12} rows={rows.map(invRow)} />}
        </Panel>
      ) : (
        <div className="space-y-5">
          <Panel title="Waiting for a second admin" pad={false}>
            {pending.length === 0 ? <EmptyState title="Nothing waiting" body={`Credit notes of ${fmtN(CREDIT_APPROVAL_THRESHOLD)} or more need a different admin to approve them.`} /> : (
              <Table label="Pending credit notes" head={['Credit note', 'Invoice', 'Tenant', 'Amount', 'Requested by', 'Reason', 'Decision']} right={[3]} rows={pending.map(({ inv: i, c }) => [c.id, i.number, i.tenant.name, fmtN(c.amount), c.requestedBy, c.reason, act ? <span key="d" className="flex gap-2"><Btn s="sm" onClick={() => { setDecision({ inv: i, id: c.id, approve: true }); setDnote(''); setDerr('') }}>Approve</Btn><Btn s="sm" v="secondary" onClick={() => { setDecision({ inv: i, id: c.id, approve: false }); setDnote(''); setDerr('') }}>Reject</Btn></span> : 'View only'])} />
            )}
          </Panel>
          <Panel title="All credit notes" pad={false}>
            {allCredits.length === 0 ? <EmptyState title="No credit notes yet" body="Open an invoice and choose Credit note to raise one." /> : (
              <Table label="Credit notes" head={['Credit note', 'Invoice', 'Tenant', 'Amount', 'Status', 'Recurring', 'Decided by']} right={[3]} rows={allCredits.map(({ inv: i, c }) => [c.id, i.number, i.tenant.name, fmtN(c.amount), <Badge key="s" tone={c.status === 'Approved' ? 'green' : c.status === 'Rejected' ? 'red' : 'amber'}>{c.status}</Badge>, c.recurring ? 'Yes, lowers MRR' : 'One-off', c.decidedBy ?? '-'])} />
            )}
          </Panel>
        </div>
      )}

      <Overlay open={!!inv} onClose={close} title={inv ? inv.number : 'Invoice'} side wide>
        {inv && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[inv.status]}>{inv.status}</Badge><span className="text-sm text-slate">{inv.tenant.name}</span>{inv.status === 'Overdue' && <Badge tone="red">{inv.daysOverdue} days overdue</Badge>}</div>
            <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate">Issued</dt><dd>{fmtDate(inv.issueDate)}</dd></div><div><dt className="text-xs text-slate">Due</dt><dd>{fmtDate(inv.dueDate)}</dd></div><div><dt className="text-xs text-slate">Period</dt><dd>{inv.period}</dd></div><div><dt className="text-xs text-slate">Method</dt><dd>{inv.method}</dd></div></dl>
            <div className="rounded-lg border border-line text-sm">
              {inv.lines.map((l, i) => <div key={i} className="flex justify-between gap-3 border-b border-line px-3 py-2"><span>{l.label}{l.detail && <span className="text-slate"> ({l.detail})</span>}</span><span className="num">{fmtN(l.amount)}</span></div>)}
              {[['Subtotal', inv.subtotal], [`VAT ${(VAT_RATE * 100).toFixed(1)}%`, inv.vat], ['Total', inv.total], ['Paid', -inv.paid], ['Credit notes', -inv.credited], ['Refunded', inv.refunded], ['Balance', inv.balance]].filter(([k, v]) => v !== 0 || k === 'Balance').map(([k, v]) => <div key={k as string} className={`flex justify-between px-3 py-1.5 ${k === 'Balance' || k === 'Total' ? 'font-semibold' : 'text-slate'}`}><span>{k}</span><span className="num">{(v as number) < 0 ? '-' : ''}{fmtN(Math.abs(v as number))}</span></div>)}
            </div>
            {inv.overpaid > 0 && <p className="text-sm text-[#b07100]">Overpaid by {fmtN(inv.overpaid)}. Refund the difference.</p>}
            <section><h3 className="text-sm font-semibold">History</h3>
              <ul className="mt-2 space-y-1.5 text-[13px] text-slate">
                {inv.payments.map((p) => <li key={p.id}>{fmtDate(p.at)}: payment {fmtN(p.amount)} by {p.method}, ref {p.ref}{p.by ? `, ${p.by}` : ''}</li>)}
                {inv.credits.map((c) => <li key={c.id}>{c.id}: credit {fmtN(c.amount)}, {c.status.toLowerCase()}{c.decidedBy ? ` by ${c.decidedBy}` : ''}</li>)}
                {inv.refunds.map((r) => <li key={r.id}>{fmtDate(r.at)}: refund {fmtN(r.amount)} to {r.method}, {r.reason}</li>)}
                {inv.overlay.reminders.map((r) => <li key={r.n}>{fmtDate(r.at)}: reminder {r.n} sent by {r.by}</li>)}
                {inv.overlay.voided && <li>{fmtDate(inv.overlay.voided.at)}: voided by {inv.overlay.voided.by}, {inv.overlay.voided.reason}</li>}
                {!inv.payments.length && !inv.credits.length && !inv.refunds.length && !inv.overlay.reminders.length && !inv.overlay.voided && <li>No activity yet.</li>}
              </ul>
            </section>
            <div className="flex flex-wrap gap-2">
              <Btn v="secondary" s="sm" onClick={() => setPrinting(true)}><Printer size={14} aria-hidden /> Print A4</Btn>
              {inv.tenant.real && <Btn v="ghost" s="sm" to="/admin/billing/subscriptions">Subscription</Btn>}
              {act && inv.status === 'Draft' && <Btn s="sm" onClick={() => run(issueDraft(inv, actor), 'Invoice issued')}>Issue invoice</Btn>}
              {act && ['Issued', 'Overdue'].includes(inv.status) && <><Btn s="sm" onClick={() => start('pay')}>Record payment</Btn><Btn s="sm" v="secondary" onClick={() => run(sendInvoiceReminder(inv, actor), 'Reminder sent')}>Send reminder</Btn></>}
              {act && !['Draft', 'Void'].includes(inv.status) && <Btn s="sm" v="secondary" onClick={() => start('credit')}>Credit note</Btn>}
              {act && refundable(inv) > 0 && <Btn s="sm" v="secondary" onClick={() => start('refund')}>Refund</Btn>}
              {act && inv.status !== 'Void' && <Btn s="sm" v="ghost" onClick={() => start('void')}>Void</Btn>}
            </div>
            {!act && <p className="text-xs text-slate">Your role can view invoices but not change them.</p>}
            {err && !mode && <p role="alert" className="text-sm text-err">{err}</p>}
            {mode && (
              <div className="space-y-3 rounded-lg border border-line bg-softmint/30 p-4">
                <h3 className="text-sm font-semibold">{{ pay: 'Record a payment', credit: 'Raise a credit note', refund: 'Refund', void: 'Void this invoice' }[mode]}</h3>
                {mode !== 'void' && <Field label="Amount (NGN)" hint={mode === 'pay' ? `Balance ${fmtN(inv.balance)}` : mode === 'credit' ? `Up to ${fmtN(creditHeadroom(inv))}. ${CREDIT_APPROVAL_THRESHOLD <= num(amt) ? 'Needs a second admin.' : ''}` : `Up to ${fmtN(refundable(inv))}, back to ${originalMethod(inv)}`}><input inputMode="numeric" className={inputCls} value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>}
                {mode === 'pay' && <><Field label="Method"><select className={inputCls} value={pm} onChange={(e) => setPm(e.target.value as Method)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field><Field label="Reference"><input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank or processor reference" /></Field></>}
                <Field label={mode === 'pay' ? 'Note (optional)' : 'Reason (required)'}><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} /></Field>
                {mode === 'credit' && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={flag} onChange={(e) => setFlag(e.target.checked)} /><span>Recurring credit: lower the subscription price going forward</span></label>}
                {(mode === 'refund' || mode === 'void') && inv.tenant.real && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={flag} onChange={(e) => setFlag(e.target.checked)} /><span>Also cancel the subscription</span></label>}
                {err && <p role="alert" className="text-sm text-err">{err}</p>}
                <div className="flex gap-2"><Btn s="sm" onClick={submit}>Confirm</Btn><Btn s="sm" v="ghost" onClick={() => { setMode(''); setErr('') }}>Cancel</Btn></div>
              </div>
            )}
          </div>
        )}
      </Overlay>

      <Overlay open={!!decision} onClose={() => setDecision(null)} title={decision?.approve ? 'Approve credit note' : 'Reject credit note'}>
        {decision && <div className="space-y-3"><p className="text-sm text-slate">{decision.id} on {decision.inv.number}, {decision.inv.tenant.name}. You must be a different admin from the requester.</p><Field label="Note"><input className={inputCls} value={dnote} onChange={(e) => setDnote(e.target.value)} /></Field>{derr && <p role="alert" className="text-sm text-err">{derr}</p>}<div className="flex gap-2"><Btn onClick={decide}>{decision.approve ? 'Approve' : 'Reject'}</Btn><Btn v="ghost" onClick={() => setDecision(null)}>Cancel</Btn></div></div>}
      </Overlay>

      {printing && inv && createPortal(<PrintView inv={inv} />, document.body)}
      <p className="text-xs text-slate">Need to recover an overdue balance automatically? Set the schedule in <Link to="/admin/billing/recovery" className="font-semibold text-teal">Payment recovery</Link>.</p>
    </div>
  )
}

const pctS = (n: number) => `${Math.round(n * 100)}%`
