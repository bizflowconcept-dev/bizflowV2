import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, Panel, Stat, Table, Tabs, Timeline, useToast } from '../components/ui'
import { useRole } from '../components/app/AppLayout'
import { useTenant } from '../tenant/store'
import type { Vendor } from '../data/vendors'
import { ngn, isOwnDataset, vehiclesForTenant } from '../data/demo'
import {
  ADMIN_OFFICER as ADMIN_OFFICER_DEFAULT, ESCALATE_DAYS, ESCALATE_OVERDUE_DAYS, LEVEL_TONE, REMINDER_DAYS, acknowledgeDoc, daysFromToday, dueText, fleetDocs, fmtDate, fmtWhen,
  invoicesFor, logDelay, recordPayment, reminderSchedule, submitRenewal, useCompliance, verifyRenewal,
} from './store'
import type { FleetDoc, Invoice } from './store'

const Banner = ({ tone, children }: { tone: 'red' | 'amber' | 'blue'; children: ReactNode }) => (
  <div role="status" className={`mb-5 rounded-lg border p-4 text-sm ${tone === 'red' ? 'border-err/30 bg-red-50 text-red-900' : tone === 'amber' ? 'border-warn/40 bg-amber-50 text-amber-900' : 'border-info/30 bg-blue-50 text-blue-900'}`}>{children}</div>
)

function LogTable({ kind, subject }: { kind: 'fleet' | 'payment'; subject?: string }) {
  const s = useCompliance()
  const slug = useTenant()?.slug
  const own = isOwnDataset(slug)
  const rows = s.log.filter((l) => (own ? l.slug === slug : !l.slug || !isOwnDataset(l.slug)) && l.kind === kind && (!subject || l.subject.startsWith(subject)))
  if (!rows.length) return <p className="p-5 text-sm text-slate">No activity recorded yet.</p>
  return <Table label="Accountability log" pageSize={8} head={['When', 'Who', 'Item', 'What they did']} rows={rows.map((l) => [fmtWhen(l.at), <b key="b">{l.by}</b>, l.subject, l.text])} />
}

const Principles = ({ items }: { items: string[] }) => (
  <Panel title="How accountability works here">
    <ul className="space-y-2 text-sm text-slate">{items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal" />{i}</li>)}</ul>
  </Panel>
)

/* ================= FLEET ================= */
function DocPanel({ doc, onClose }: { doc: FleetDoc | null; onClose: () => void }) {
  const toast = useToast()
  const tenant = useTenant()
  const { role, r } = useRole()
  const [mode, setMode] = useState<'ack' | 'renew' | 'verify'>('ack')
  if (!doc) return null
  const ADMIN_OFFICER = isOwnDataset(tenant?.slug) ? tenant?.admin?.name ?? 'the Company Admin' : ADMIN_OFFICER_DEFAULT
  const ctx = { by: r.user, slug: tenant?.slug ?? 'etranzact' }
  const canAct = r.modules.includes('*') || r.modules.includes('fleet')
  const pending = doc.renewal?.status === 'pending'
  const checker = role === 'admin' || role === 'md'
  const schedule = reminderSchedule(doc)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (mode === 'ack') { acknowledgeDoc(doc.key, String(f.get('note')), ctx); toast('Acknowledged and recorded in the accountability log.') }
    else if (mode === 'renew') { submitRenewal(doc.key, { newExpiry: String(f.get('expiry')), ref: String(f.get('ref')), note: String(f.get('note')) }, ctx); toast('Renewal submitted. A second person must verify it.') }
    else {
      const approve = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-act') === 'approve'
      const err = verifyRenewal(doc.key, approve, String(f.get('note')), ctx)
      if (err) { toast(err, 'err'); return }
      toast(approve ? 'Renewal verified. Expiry date updated.' : 'Renewal rejected and returned.')
    }
    onClose()
  }
  const modes = [['ack', 'Acknowledge'], ['renew', 'Submit renewal'], ...(pending ? [['verify', 'Verify renewal']] : [])] as [typeof mode, string][]
  return (
    <Overlay open onClose={onClose} title={`${doc.type} · ${doc.reg}`} side>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-cloud p-4">
          <div><div className="text-xs text-slate">{doc.model} · {doc.branch}</div><div className="font-semibold">Expires {fmtDate(doc.expiry)}</div></div>
          <Badge tone={LEVEL_TONE[doc.level]}>{dueText(doc.days)}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-slate">Responsible</dt><dd className="font-semibold">{doc.owner}</dd></div>
          <div><dt className="text-xs text-slate">Driver</dt><dd className="font-semibold">{doc.driver}</dd></div>
          <div><dt className="text-xs text-slate">Acknowledged</dt><dd className="font-semibold">{doc.ack ? `${doc.ack.by}, ${fmtWhen(doc.ack.at)}` : 'Not yet'}</dd></div>
          <div><dt className="text-xs text-slate">Escalation</dt><dd className="font-semibold">{doc.escalated ? 'Escalated to Business Owner' : `At ${ESCALATE_DAYS} days if unacknowledged`}</dd></div>
        </dl>
        {doc.renewal && <div className="rounded-lg border border-line p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><b>Renewal {doc.renewal.status}</b><Badge tone={doc.renewal.status === 'verified' ? 'green' : doc.renewal.status === 'rejected' ? 'red' : 'amber'}>{doc.renewal.status === 'pending' ? 'Awaiting verification' : doc.renewal.status}</Badge></div>
          <p className="mt-1 text-slate">Submitted by {doc.renewal.by}, {fmtWhen(doc.renewal.at)}. Ref {doc.renewal.ref}; valid to {fmtDate(doc.renewal.newExpiry)}.{doc.renewal.checkedBy ? ` ${doc.renewal.status === 'verified' ? 'Verified' : 'Rejected'} by ${doc.renewal.checkedBy}${doc.renewal.checkNote ? `: ${doc.renewal.checkNote}` : ''}.` : ''}</p>
        </div>}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">Reminders to {ADMIN_OFFICER}{doc.owner !== ADMIN_OFFICER ? ` and ${doc.owner}` : ''}</div>
          <Timeline items={schedule.map((s) => ({ t: s.n === 0 ? 'Day of expiry' : `${s.n} day${s.n > 1 ? 's' : ''} before`, a: `${fmtDate(s.date)}${s.sent ? ' · sent' : ' · scheduled'}`, x: '' }))} />
        </div>
        {canAct ? (
          <form onSubmit={submit} className="space-y-3 border-t border-line pt-4">
            <div className="flex gap-1" role="tablist">{modes.map(([k, n]) => <button type="button" key={k} onClick={() => setMode(k)} aria-pressed={mode === k} className={`cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-semibold ${mode === k ? 'bg-teal text-white' : 'bg-cloud text-ink'}`}>{n}</button>)}</div>
            {mode === 'renew' && <div className="grid gap-3 sm:grid-cols-2"><Field label="New expiry date"><input required name="expiry" type="date" min="2026-10-09" className={inputCls} /></Field><Field label="Certificate / policy number"><input required name="ref" className={inputCls} /></Field></div>}
            {mode === 'verify' && !checker && <p className="text-sm text-slate">Only the Company Admin or Business Owner can verify renewals.</p>}
            <Field label={mode === 'ack' ? 'Action being taken' : mode === 'renew' ? 'Evidence note' : 'Verification note'}><textarea required={mode !== 'verify'} name="note" rows={2} className={`${inputCls} h-auto py-2`} placeholder={mode === 'ack' ? 'e.g. Quote requested, renewal booked for Friday.' : mode === 'renew' ? 'Where the scanned certificate is stored.' : 'What you checked.'} /></Field>
            {mode === 'verify'
              ? <div className="flex justify-end gap-2"><Btn type="submit" v="secondary" data-act="reject" disabled={!checker}>Reject</Btn><Btn type="submit" data-act="approve" disabled={!checker}>Verify and update expiry</Btn></div>
              : <div className="flex justify-end"><Btn type="submit">{mode === 'ack' ? 'Acknowledge' : 'Submit for verification'}</Btn></div>}
            <p className="text-xs text-slate">Every action is time-stamped with your name and shown in the accountability log. {mode !== 'ack' && 'The person who submits a renewal cannot verify it.'}</p>
          </form>
        ) : <p className="border-t border-line pt-4 text-sm text-slate">You can view this record. Fleet owners and admins act on it.</p>}
        <div><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">History</div><div className="overflow-hidden rounded-lg border border-line"><LogTable kind="fleet" subject={`${doc.reg} · ${doc.type}`} /></div></div>
      </div>
    </Overlay>
  )
}

export function FleetCompliance() {
  const s = useCompliance()
  const tenant = useTenant()
  const ADMIN_OFFICER = isOwnDataset(tenant?.slug) ? tenant?.admin?.name ?? 'the Company Admin' : ADMIN_OFFICER_DEFAULT
  const vehicleKm = Object.fromEntries(vehiclesForTenant(tenant?.slug).map((v) => [v.reg, v.km])) as Record<string, number>
  const [tab, setTab] = useState('Document tracker')
  const [open, setOpen] = useState<string | null>(null)
  const docs = fleetDocs(s, tenant?.slug).sort((a, b) => a.days - b.days)
  const expired = docs.filter((d) => d.level === 'expired')
  const critical = docs.filter((d) => d.level === 'critical')
  const soon = docs.filter((d) => d.level === 'soon')
  const waiting = docs.filter((d) => d.renewal?.status === 'pending')
  const rate = docs.length ? Math.round((docs.filter((d) => d.level === 'valid').length / docs.length) * 100) : 100
  const unack = docs.filter((d) => d.level !== 'valid' && !d.ack && d.renewal?.status !== 'pending')
  const vehicles = [...new Set(docs.map((d) => d.reg))]
  const doc = docs.find((d) => d.key === open) ?? null
  if (!docs.length) return <Panel><EmptyState title="No vehicles yet" body="Use Add vehicle at the top of this page to track insurance, roadworthiness and licence expiry dates, with reminders before anything lapses." /></Panel>
  return (
    <>
      {(expired.length > 0 || critical.length > 0) && <Banner tone="red"><b>{expired.length + critical.length} document{expired.length + critical.length > 1 ? 's' : ''} need action now.</b> {expired.length} expired, {critical.length} expiring within 7 days. {unack.length} still unacknowledged. Items unacknowledged at {ESCALATE_DAYS} days escalate automatically to the Business Owner.</Banner>}
      <div className="mb-6 grid gap-6 border-b border-line pb-6 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Vehicles" value={String(vehicles.length)} sub={`${docs.length} documents tracked`} />
        <Stat label="Expired" value={String(expired.length)} up={expired.length === 0} />
        <Stat label="Expiring in 30 days" value={String(critical.length + soon.length)} up={false} />
        <Stat label="Documents valid" value={`${rate}%`} up={rate >= 80} sub="compliance rate" />
        <Stat label="Awaiting verification" value={String(waiting.length)} sub="renewals" />
      </div>
      <div className="mb-5"><Tabs tabs={['Document tracker', 'Vehicles', 'Accountability log']} value={tab} onChange={setTab} /></div>

      {tab === 'Document tracker' && <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Panel pad={false}>
          <Table label="Vehicle document tracker" pageSize={10} head={['Document', 'Vehicle', 'Expires', 'Status', 'Accountability', '']} rows={docs.map((d) => [
            <b key="t">{d.type}</b>,
            <span key="v" className="font-semibold">{d.reg}<span className="block text-xs font-normal text-slate">{d.model}</span></span>,
            fmtDate(d.expiry),
            <Badge key="s" tone={LEVEL_TONE[d.level]}>{dueText(d.days)}</Badge>,
            d.renewal?.status === 'pending' ? <Badge key="a" tone="amber">Renewal awaiting verification</Badge>
              : d.level === 'valid' ? <span key="a" className="text-xs text-slate">{d.owner}</span>
              : d.ack ? <span key="a" className="text-xs"><b>{d.ack.by}</b> acknowledged<span className="block text-slate">{fmtWhen(d.ack.at)}</span></span>
              : <Badge key="a" tone={d.escalated ? 'red' : 'amber'}>{d.escalated ? 'Escalated to Owner' : 'Unacknowledged'}</Badge>,
            <Btn key="m" s="sm" v={d.level === 'valid' ? 'ghost' : 'secondary'} onClick={() => setOpen(d.key)}>{d.level === 'valid' ? 'View' : 'Manage'}</Btn>,
          ])} />
        </Panel>
        <Principles items={[
          `Reminders go to ${ADMIN_OFFICER} (Admin Officer) at ${REMINDER_DAYS.filter((n) => n > 0).join(', ')} days and on the day of expiry.`,
          'A named person owns every document. Driver licences are also owned by the driver.',
          `Warnings must be acknowledged with the action being taken. After ${ESCALATE_DAYS} days with no acknowledgement the Business Owner is alerted.`,
          'A renewal only updates the expiry date after a second person verifies it. Submitters cannot verify their own work.',
          'Every action is logged with who and when. Everyone with Fleet access can read the log.',
        ]} />
      </div>}

      {tab === 'Vehicles' && <Panel pad={false}><Table label="Vehicles" right={[3]} head={['Vehicle', 'Driver', 'Branch', 'Odometer', 'Insurance', 'Roadworthiness', 'Licences']} rows={vehicles.map((reg) => {
        const list = docs.filter((d) => d.reg === reg)
        const cell = (t: string) => { const d = list.find((x) => x.type === t)!; return <button key={t} onClick={() => setOpen(d.key)} className="cursor-pointer text-left"><Badge tone={LEVEL_TONE[d.level]}>{fmtDate(d.expiry)}</Badge></button> }
        const lic = list.filter((x) => x.type.includes('licence'))
        const worst = lic.sort((a, b) => a.days - b.days)[0]
        return [<span key="v" className="font-semibold">{reg}<span className="block text-xs font-normal text-slate">{list[0].model}</span></span>, list[0].driver, list[0].branch, (vehicleKm[reg] ?? 0).toLocaleString('en-NG') + ' km', cell('Insurance'), cell('Roadworthiness'), <button key="l" onClick={() => setOpen(worst.key)} className="cursor-pointer"><Badge tone={LEVEL_TONE[worst.level]}>{worst.level === 'valid' ? 'All valid' : `${worst.type}: ${dueText(worst.days)}`}</Badge></button>]
      })} /></Panel>}

      {tab === 'Accountability log' && <Panel title="Who did what, and when" pad={false}><LogTable kind="fleet" /></Panel>}
      <DocPanel key={open ?? 'none'} doc={doc} onClose={() => setOpen(null)} />
    </>
  )
}

/* ================= VENDOR PAYMENTS ================= */
function InvoicePanel({ inv, onClose }: { inv: Invoice | null; onClose: () => void }) {
  const toast = useToast()
  const tenant = useTenant()
  const { can, r } = useRole()
  const [mode, setMode] = useState<'delay' | 'pay'>('delay')
  if (!inv) return null
  const ctx = { by: r.user, slug: tenant?.slug ?? 'etranzact' }
  const canPay = can('accounting.post')
  const canNote = canPay || r.modules.includes('*') || r.modules.includes('vendors')
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (mode === 'pay') { recordPayment(inv, { ref: String(f.get('ref')), method: String(f.get('method')) }, ctx); toast(`Payment to ${inv.vendor.name} recorded.`) }
    else { logDelay(inv, { reason: String(f.get('reason')), promised: String(f.get('promised')) }, ctx); toast('Delay reason logged and visible to the department.') }
    onClose()
  }
  return (
    <Overlay open onClose={onClose} title={`${inv.id} · ${inv.vendor.name}`} side>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-cloud p-4">
          <div><div className="text-xs text-slate">{inv.vendor.department} · {inv.vendor.category}</div><div className="num text-lg font-semibold">{ngn(inv.amount)}</div></div>
          <Badge tone={inv.state === 'paid' ? 'green' : inv.state === 'overdue' ? 'red' : inv.state === 'due-soon' ? 'amber' : 'gray'}>{inv.state === 'paid' ? 'Paid' : inv.state === 'overdue' ? `${inv.overdueDays} days overdue` : `Due in ${inv.days} days`}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-slate">Invoice date</dt><dd className="font-semibold">{fmtDate(inv.issued)}</dd></div>
          <div><dt className="text-xs text-slate">Due date</dt><dd className="font-semibold">{fmtDate(inv.due)}</dd></div>
          <div><dt className="text-xs text-slate">Vendor contact</dt><dd className="truncate font-semibold">{inv.vendor.contact}</dd></div>
          <div><dt className="text-xs text-slate">Escalation</dt><dd className="font-semibold">{inv.escalated ? 'Escalated to Business Owner' : `At ${ESCALATE_OVERDUE_DAYS} days overdue`}</dd></div>
        </dl>
        {inv.payment && <div className="rounded-lg border border-ok/30 bg-green-50 p-3 text-sm text-green-900">Paid via {inv.payment.method}, ref <b>{inv.payment.ref}</b>. Recorded by {inv.payment.by}, {fmtWhen(inv.payment.at)}.</div>}
        {inv.delays.length > 0 && <div><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">Explanations on record</div><ul className="space-y-2">{inv.delays.map((d, i) => <li key={i} className="rounded-lg border border-line p-3 text-sm"><p>{d.reason}</p><p className="mt-1 text-xs text-slate">{d.by}, {fmtWhen(d.at)}. Committed to pay by <b>{fmtDate(d.promised)}</b>{daysFromToday(d.promised) < 0 && !inv.payment ? ' (missed)' : ''}.</p></li>)}</ul></div>}
        {inv.state !== 'paid' && (canNote ? (
          <form onSubmit={submit} className="space-y-3 border-t border-line pt-4">
            <div className="flex gap-1">{([['delay', 'Log reason / delay'], ...(canPay ? [['pay', 'Record payment']] : [])] as [typeof mode, string][]).map(([k, n]) => <button type="button" key={k} onClick={() => setMode(k)} aria-pressed={mode === k} className={`cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-semibold ${mode === k ? 'bg-teal text-white' : 'bg-cloud text-ink'}`}>{n}</button>)}</div>
            {mode === 'pay' ? <div className="grid gap-3 sm:grid-cols-2"><Field label="Payment method"><select name="method" className={inputCls}><option>Bank transfer</option><option>NIP</option><option>Cheque</option></select></Field><Field label="Bank / transaction reference"><input required name="ref" className={inputCls} /></Field></div>
              : <><Field label="Reason for delay"><textarea required name="reason" rows={3} className={`${inputCls} h-auto py-2`} placeholder="State plainly what is holding up payment." /></Field><Field label="Committed payment date"><input required name="promised" type="date" min="2026-10-09" className={inputCls} /></Field></>}
            <div className="flex justify-end"><Btn type="submit">{mode === 'pay' ? 'Record payment' : 'Log explanation'}</Btn></div>
            <p className="text-xs text-slate">Payments need a bank reference. Delays need a reason and a date you can be held to.</p>
          </form>
        ) : <p className="border-t border-line pt-4 text-sm text-slate">You can view this invoice.</p>)}
        <div><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">History</div><div className="overflow-hidden rounded-lg border border-line"><LogTable kind="payment" subject={inv.id} /></div></div>
      </div>
    </Overlay>
  )
}

export function VendorPayments({ vendors }: { vendors: Vendor[] }) {
  const s = useCompliance()
  const tenant = useTenant()
  const [open, setOpen] = useState<string | null>(null)
  const [filter, setFilter] = useState('Needs attention')
  const all = invoicesFor(s, tenant?.slug, vendors).sort((a, b) => a.days - b.days)
  const overdue = all.filter((i) => i.state === 'overdue')
  const soon = all.filter((i) => i.state === 'due-soon')
  const sum = (l: Invoice[]) => l.reduce((a, i) => a + i.amount, 0)
  const bands = [['1–7 days', overdue.filter((i) => i.overdueDays <= 7)], ['8–30 days', overdue.filter((i) => i.overdueDays > 7 && i.overdueDays <= 30)], ['Over 30 days', overdue.filter((i) => i.overdueDays > 30)]] as const
  const unexplained = overdue.filter((i) => i.needsReason)
  const shown = filter === 'All invoices' ? all : filter === 'Paid' ? all.filter((i) => i.state === 'paid') : all.filter((i) => i.state === 'overdue' || i.state === 'due-soon')
  const inv = all.find((i) => i.id === open) ?? null
  const onTime = all.filter((i) => i.state === 'paid' && i.payment && daysFromToday(i.due) >= 0).length
  return (
    <div className="space-y-5">
      {overdue.length > 0 && <Banner tone="red"><b>{overdue.length} overdue payment{overdue.length > 1 ? 's' : ''} totalling {ngn(sum(overdue))}.</b> {unexplained.length ? `${unexplained.length} ha${unexplained.length > 1 ? 've' : 's'} no explanation on record.` : 'Every overdue invoice has an explanation on record.'} Invoices over {ESCALATE_OVERDUE_DAYS} days overdue are escalated to the Business Owner.</Banner>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel><Stat label="Overdue" value={ngn(sum(overdue))} sub={`${overdue.length} invoices`} up={overdue.length === 0} /></Panel>
        <Panel><Stat label="Due in 7 days" value={ngn(sum(soon))} sub={`${soon.length} invoices`} /></Panel>
        <Panel><Stat label="Without explanation" value={String(unexplained.length)} sub="overdue, no reason logged" up={unexplained.length === 0} /></Panel>
        <Panel><Stat label="Paid on time" value={String(onTime)} sub="recorded this session" /></Panel>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">{bands.map(([n, l]) => <Panel key={n}><div className="text-xs font-medium text-slate">Overdue {n}</div><div className="num mt-1 text-lg font-semibold">{ngn(sum(l))}</div><div className="mt-1 text-xs text-slate">{l.length} invoice{l.length === 1 ? '' : 's'}</div></Panel>)}</div>
      <div className="flex flex-wrap gap-2">{['Needs attention', 'All invoices', 'Paid'].map((f) => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`cursor-pointer rounded-full border px-3 py-1 text-[13px] font-semibold ${filter === f ? 'border-teal bg-softmint text-teal' : 'border-line'}`}>{f}</button>)}</div>
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Panel pad={false}>
          <Table label="Vendor invoices" pageSize={10} right={[3]} head={['Invoice', 'Vendor', 'Department', 'Amount', 'Due', 'Status', 'Accountability', '']} rows={shown.map((i) => {
            const last = i.delays[i.delays.length - 1]
            return [
              <b key="i">{i.id}</b>, i.vendor.name, i.vendor.department, ngn(i.amount), fmtDate(i.due),
              <Badge key="s" tone={i.state === 'paid' ? 'green' : i.state === 'overdue' ? 'red' : i.state === 'due-soon' ? 'amber' : 'gray'}>{i.state === 'paid' ? 'Paid' : i.state === 'overdue' ? `${i.overdueDays}d overdue` : `Due in ${i.days}d`}</Badge>,
              i.state === 'paid' ? <span key="a" className="text-xs">Ref {i.payment!.ref}<span className="block text-slate">{i.payment!.by}</span></span>
                : i.needsReason ? <Badge key="a" tone="red">Explanation required</Badge>
                : last ? <span key="a" className="text-xs">Pay by <b>{fmtDate(last.promised)}</b><span className="block text-slate">{last.by}</span></span>
                : <span key="a" className="text-xs text-slate">On schedule</span>,
              <Btn key="m" s="sm" v={i.state === 'paid' ? 'ghost' : 'secondary'} onClick={() => setOpen(i.id)}>{i.state === 'paid' ? 'View' : 'Manage'}</Btn>,
            ]
          })} />
        </Panel>
        <Principles items={[
          'Every invoice shows its due date, who owes it and who is responsible. Nothing is hidden by department.',
          'Overdue invoices need a written reason and a committed payment date. A missed date is shown as missed.',
          'Payments can only be recorded with a bank reference, by Finance or an Admin.',
          `After ${ESCALATE_OVERDUE_DAYS} days overdue, the Business Owner is alerted. Vendors with unpaid invoices appear in the notification bell.`,
        ]} />
      </div>
      <Panel title="Payment activity log" pad={false}><LogTable kind="payment" /></Panel>
      <InvoicePanel key={open ?? 'none'} inv={inv} onClose={() => setOpen(null)} />
    </div>
  )
}
