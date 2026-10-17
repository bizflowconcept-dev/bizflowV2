/* Invoice ledger: base invoices are derived from the portfolio (real subscriptions only) and the billing store's payment records and
 * every admin action is replayed on top from the overlay store, so balances, statuses and MRR always agree. */
import { useMemo } from 'react'
import { TODAY, addPayment, daysUntil, fmtDate, quote, setBilling, subActions } from '../data/billing'
import type { BillingState } from '../data/billing'
import { logAudit } from '../data/billing'
import { postNotification } from '../notifications/store'
import { recordAudit } from '../tenant/store'
import { hash, recurring, unit, upcomingInvoice } from './insights'
import { ledgerStore, useLedger } from './ledgerStore'
import type { CreditNote, InvoiceOverlay, LedgerState, Method, PayRec, RefundRec } from './ledgerStore'
import { MONTH_LABELS, monthStarts, usePortfolioTenants, ymd } from './portfolio'
import type { PortfolioTenant } from './portfolio'

export const VAT_RATE = 0.075
/** Credit notes at or above this gross amount need a second admin to approve. */
export const CREDIT_APPROVAL_THRESHOLD = 250000
export const INVOICE_STATUSES = ['Draft', 'Issued', 'Paid', 'Overdue', 'Void', 'Credited', 'Refunded'] as const
export type InvStatus = (typeof INVOICE_STATUSES)[number]
export const STATUS_TONE: Record<InvStatus, string> = { Draft: 'gray', Issued: 'blue', Paid: 'green', Overdue: 'red', Void: 'gray', Credited: 'amber', Refunded: 'amber' }

export type InvLine = { label: string; detail?: string; amount: number }
export type Invoice = {
  id: string; number: string; tenant: PortfolioTenant; period: string; issueDate: string; dueDate: string; lines: InvLine[]
  subtotal: number; vat: number; total: number; payments: PayRec[]; credits: CreditNote[]; refunds: RefundRec[]
  paid: number; credited: number; refunded: number; netDue: number; balance: number; overpaid: number; status: InvStatus; daysOverdue: number
  overlay: InvoiceOverlay; method: Method; recurring: boolean; lastPaidAt?: string; paidLate: boolean
}

const r0 = (n: number) => Math.round(n)
const addD = (d: string, n: number) => ymd(new Date(new Date(d + 'T12:00:00').getTime() + n * 864e5))
const todayStr = () => ymd(TODAY)

/* ---------- base invoices ---------- */
type Base = Omit<Invoice, 'paid' | 'credited' | 'refunded' | 'netDue' | 'balance' | 'overpaid' | 'status' | 'daysOverdue' | 'overlay' | 'credits' | 'refunds' | 'payments' | 'lastPaidAt' | 'paidLate'> & { basePayments: PayRec[] }

/* Invoices come from the actual payment records in the billing store (successful = paid invoice, failed = unpaid invoice)
 * plus the next renewal for live subscriptions. Payments the ledger itself wrote are excluded so nothing is counted twice. */
function baseInvoices(s: BillingState, tenants: PortfolioTenant[], ownRefs: Set<string>): Base[] {
  const out: Base[] = []; const today = todayStr()
  tenants.forEach((t) => {
    const sub = t.sub
    const pays = s.payments.filter((p) => p.subId === sub.id && !ownRefs.has(p.ref) && p.status !== 'refunded')
    const okPays = pays.filter((p) => p.status === 'successful')
    const lastOk = okPays.reduce((m, p) => (p.at > m ? p.at : m), '')
    const kind = (p: { ref: string }) => (t.method === 'Card' ? 'CARD' : t.method === 'Bank transfer' ? 'NIP' : 'DD') + '-' + p.ref
    pays.forEach((p) => {
      if (p.status === 'failed' && lastOk > p.at) return
      const id = `${sub.id}~${p.id}`; const issue = p.at.slice(0, 10)
      const subtotal = r0(p.amount / (1 + VAT_RATE)); const vat = p.amount - subtotal
      const base = mk(t, [], subtotal, issue, issue.slice(0, 7), s, id, p.description)
      base.vat = vat; base.total = p.amount
      if (p.status === 'successful') base.basePayments.push({ id: `bp-${id}`, invoiceId: id, at: p.at.slice(0, 10), amount: p.amount, method: t.method, ref: kind(p), by: 'System' })
      out.push(base)
    })
    const live = ['active', 'past_due', 'payment_failed', 'grace'].includes(sub.status)
    const renew = sub.renewsAt.slice(0, 10)
    if (live && renew <= addD(today, 30) && !pays.some((p) => p.at.slice(0, 10) >= addD(renew, -3))) {
      const id = `${sub.id}~renewal-${renew}`
      const up = upcomingInvoice(s, sub)
      if (up) {
        /* Same figures as the subscription's upcoming invoice, so complimentary lines and kept-after-grant modules agree everywhere. */
        const lines: InvLine[] = up.lines.map((l) => ({ label: l.label, detail: l.detail, amount: r0(l.amount) }))
        if (up.discount > 0) lines.push({ label: 'Complimentary and discounts', detail: lines.some((l) => l.detail?.startsWith('Complimentary')) ? '100% on complimentary lines' : undefined, amount: -r0(up.discount) })
        const b = mk(t, [], r0(up.subtotal - up.discount), renew, renew.slice(0, 7), s, id, '')
        out.push({ ...b, lines, vat: r0(up.tax), total: r0(up.total) })
      } else out.push(mk(t, [], r0(sub.net), renew, renew.slice(0, 7), s, id, `${sub.planId[0].toUpperCase()}${sub.planId.slice(1)} renewal`))
    }
  })
  return out
}

function mk(t: PortfolioTenant, _lines: unknown[], subtotal: number, issue: string, period: string, _s: BillingState, id: string, label: string): Base {
  const vat = r0(subtotal * VAT_RATE)
  const yy = issue.slice(2, 4), mm = issue.slice(5, 7)
  return {
    id, number: `INV-${yy}${mm}-${String(1000 + (hash(id) % 8000)).padStart(4, '0')}`, tenant: t, period: `${period}${t.sub.cycle === 'annual' ? ' (annual)' : ''}`, issueDate: issue, dueDate: addD(issue, 14),
    lines: [{ label, detail: t.sub.cycle === 'annual' ? 'Annual' : 'Monthly', amount: subtotal }], subtotal, vat, total: subtotal + vat, method: t.method, recurring: true, basePayments: [],
  }
}

/* ---------- derivation ---------- */
export function deriveInvoices(s: BillingState, tenants: PortfolioTenant[], l: LedgerState): Invoice[] {
  const today = todayStr()
  return baseInvoices(s, tenants, new Set(l.payments.map((p) => p.ref))).map((b) => {
    const overlay = l.overlay[b.id] ?? { reminders: [] }
    const issueDate = overlay.issuedAt ?? b.issueDate
    const payments = [...b.basePayments, ...l.payments.filter((p) => p.invoiceId === b.id)].sort((a, c) => a.at.localeCompare(c.at))
    const credits = l.credits.filter((c) => c.invoiceId === b.id)
    const refunds = l.refunds.filter((r) => r.invoiceId === b.id)
    const paid = payments.reduce((n, p) => n + p.amount, 0)
    const refunded = refunds.reduce((n, r) => n + r.amount, 0)
    const credited = credits.filter((c) => c.status === 'Approved').reduce((n, c) => n + c.amount, 0)
    const netDue = Math.max(0, b.total - credited)
    const held = paid - refunded
    const balance = overlay.voided ? 0 : Math.max(0, netDue - held)
    const overpaid = Math.max(0, held - netDue)
    const dueDate = addD(issueDate, 14)
    let status: InvStatus
    if (overlay.voided) status = 'Void'
    else if (issueDate > today) status = 'Draft'
    else if (refunded > 0 && held <= 0) status = 'Refunded'
    else if (credited >= b.total) status = 'Credited'
    else if (balance <= 0) status = 'Paid'
    else status = dueDate < today ? 'Overdue' : 'Issued'
    const last = payments[payments.length - 1]
    return {
      ...b, issueDate, dueDate, payments, credits, refunds, paid, credited, refunded, netDue, balance: status === 'Refunded' ? 0 : balance, overpaid, status, overlay,
      daysOverdue: status === 'Overdue' ? Math.max(0, -daysUntil(dueDate + 'T09:00:00')) : 0, lastPaidAt: last?.at, paidLate: !!last && balance <= 0 && last.at > dueDate,
    }
  }).sort((a, c) => c.issueDate.localeCompare(a.issueDate) || a.tenant.name.localeCompare(c.tenant.name))
}

export function useInvoices() {
  const { s, tenants } = usePortfolioTenants(); const l = useLedger()
  return useMemo(() => ({ s, tenants, ledger: l, invoices: deriveInvoices(s, tenants, l) }), [s, tenants, l])
}

export function ledgerStats(inv: Invoice[]) {
  const today = todayStr(); const month = today.slice(0, 7)
  const open = inv.filter((i) => i.status === 'Issued' || i.status === 'Overdue')
  const overdue = inv.filter((i) => i.status === 'Overdue')
  const collected = inv.flatMap((i) => i.payments).filter((p) => p.at.startsWith(month)).reduce((n, p) => n + p.amount, 0)
  const refundedMtd = inv.flatMap((i) => i.refunds).filter((r) => r.at.startsWith(month)).reduce((n, r) => n + r.amount, 0)
  const creditsMtd = inv.flatMap((i) => i.credits).filter((c) => c.status === 'Approved' && (c.decidedAt ?? c.requestedAt).startsWith(month)).reduce((n, c) => n + c.amount, 0)
  const recovered = inv.filter((i) => i.paidLate)
  const recoveredAmt = recovered.reduce((n, i) => n + i.total, 0)
  const overdueAmt = overdue.reduce((n, i) => n + i.balance, 0)
  return {
    outstanding: open.reduce((n, i) => n + i.balance, 0), outstandingCount: open.length, overdueAmt, overdueCount: overdue.length, collected, refundedMtd, creditsMtd,
    billed: inv.filter((i) => i.status !== 'Draft' && i.status !== 'Void' && i.issueDate.startsWith(month)).reduce((n, i) => n + i.total, 0),
    recoveredAmt, recoveredCount: recovered.length, recoveryRate: recoveredAmt + overdueAmt ? recoveredAmt / (recoveredAmt + overdueAmt) : 1,
    pendingCredits: inv.flatMap((i) => i.credits).filter((c) => c.status === 'Pending approval').length,
  }
}

/* ---------- actions ---------- */
const stamp = () => todayStr()
const nextSeq = () => { const n = ledgerStore.get().seq; ledgerStore.set((l) => ({ ...l, seq: l.seq + 1 })); return n }
const slugOf = (t: PortfolioTenant) => t.slug
const auditBoth = (actor: string, t: PortfolioTenant, action: string, prev: string, next: string) => {
  logAudit(actor, t.name, action, prev, next)
  if (t.real) recordAudit(slugOf(t), action, prev, next, { category: 'Finance', actor, ref: t.id })
}
const patchOverlay = (id: string, fn: (o: InvoiceOverlay) => InvoiceOverlay) => ledgerStore.set((l) => ({ ...l, overlay: { ...l.overlay, [id]: fn(l.overlay[id] ?? { reminders: [] }) } }))
export const fmtN = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')

export function issueDraft(inv: Invoice, actor: string) {
  if (inv.status !== 'Draft') return 'Only drafts can be issued.'
  patchOverlay(inv.id, (o) => ({ ...o, issuedAt: stamp(), issuedBy: actor }))
  auditBoth(actor, inv.tenant, `Invoice ${inv.number} issued early`, 'Draft', 'Issued')
  return ''
}

export function recordPayment(all: Invoice[], inv: Invoice, amount: number, method: Method, ref: string, note: string, actor: string) {
  if (!['Issued', 'Overdue'].includes(inv.status)) return 'Payments can only be recorded on issued or overdue invoices.'
  if (!(amount > 0)) return 'Enter an amount above zero.'
  if (amount > inv.balance + 0.5) return `The amount is more than the balance of ${fmtN(inv.balance)}.`
  const rec: PayRec = { id: `pay-${nextSeq()}`, invoiceId: inv.id, at: stamp(), amount: r0(amount), method, ref: ref.trim() || `MAN-${hash(inv.id + amount) % 900000 + 100000}`, by: actor, note: note.trim() || undefined }
  ledgerStore.set((l) => ({ ...l, payments: [...l.payments, rec] }))
  if (inv.tenant.real) addPayment({ subId: inv.tenant.id, at: stamp(), amount: rec.amount, currency: 'NGN', status: 'successful', ref: rec.ref, description: `${inv.number} payment (${method})` })
  const cleared = r0(amount) >= inv.balance - 0.5
  auditBoth(actor, inv.tenant, `Payment of ${fmtN(rec.amount)} recorded on ${inv.number} (${method})`, `Balance ${fmtN(inv.balance)}`, `Balance ${fmtN(Math.max(0, inv.balance - rec.amount))}`)
  /* Clearing the last overdue invoice brings a troubled real subscription back to Active. */
  if (cleared && inv.tenant.real && ['past_due', 'payment_failed', 'grace'].includes(inv.tenant.sub.status) && !all.some((i) => i.tenant.id === inv.tenant.id && i.id !== inv.id && i.status === 'Overdue')) {
    subActions.setStatus(inv.tenant.id, 'active', actor)
  }
  return ''
}

export function sendInvoiceReminder(inv: Invoice, actor: string) {
  if (!['Issued', 'Overdue'].includes(inv.status)) return 'Reminders are only sent for issued or overdue invoices.'
  const n = inv.overlay.reminders.length + 1
  patchOverlay(inv.id, (o) => ({ ...o, reminders: [...o.reminders, { at: stamp(), by: actor, n }] }))
  if (inv.tenant.real) postNotification(inv.tenant.slug, { id: `inv-rem:${inv.id}:${n}`, type: 'Payments', title: `Invoice ${inv.number} ${inv.status === 'Overdue' ? 'is overdue' : 'is due soon'}`, body: `${fmtN(inv.balance)} is outstanding, due ${fmtDate(inv.dueDate)}. Pay from Settings, Billing.`, to: '/admin/business/settings?tab=billing', urgent: inv.status === 'Overdue' })
  auditBoth(actor, inv.tenant, `Payment reminder ${n} sent for ${inv.number}`, inv.status, inv.status)
  return ''
}

function stopBilling(t: PortfolioTenant, why: string, actor: string) {
  if (t.real) { subActions.cancel(t.id, actor) } else { ledgerStore.set((l) => ({ ...l, ended: { ...l.ended, [t.id]: { at: stamp(), by: actor, reason: why } } })); logAudit(actor, t.name, 'Subscription cancelled with ledger action', 'Active', 'Cancelled') }
}

export function voidInvoice(inv: Invoice, reason: string, cancelSub: boolean, actor: string) {
  if (!reason.trim()) return 'A reason is required to void an invoice.'
  if (inv.status === 'Void') return 'Already void.'
  if (inv.paid - inv.refunded > 0) return 'This invoice has money held against it. Refund it before voiding.'
  patchOverlay(inv.id, (o) => ({ ...o, voided: { at: stamp(), by: actor, reason: reason.trim() } }))
  auditBoth(actor, inv.tenant, `Invoice ${inv.number} voided: ${reason.trim()}`, inv.status, 'Void')
  if (cancelSub) stopBilling(inv.tenant, `Voided ${inv.number}`, actor)
  return ''
}

export const creditHeadroom = (inv: Invoice) => Math.max(0, inv.total - inv.credits.filter((c) => c.status !== 'Rejected').reduce((n, c) => n + c.amount, 0))

function applyCredit(inv: Invoice, cn: CreditNote, actor: string) {
  if (cn.recurring) {
    /* A recurring credit is a permanent price reduction: it lowers the subscription net and therefore MRR. */
    const gross = cn.amount; const net = r0(gross / (1 + VAT_RATE))
    const cut = Math.min(net, inv.tenant.sub.net)
    const monthly = inv.tenant.sub.cycle === 'annual' ? cut / 12 : cut
    ledgerStore.set((l) => ({ ...l, mrrAdj: [...l.mrrAdj, { id: cn.id, subId: inv.tenant.id, amount: r0(monthly), ref: cn.id, at: stamp() }] }))
    if (inv.tenant.real) setBilling((st) => ({ ...st, subs: st.subs.map((x) => (x.id === inv.tenant.id ? { ...x, net: Math.max(0, x.net - cut) } : x)) }))
    auditBoth(actor, inv.tenant, `Recurring credit ${cn.id} reduced MRR by ${fmtN(monthly)}`, `MRR ${fmtN(recurring(inv.tenant.sub))}`, `MRR ${fmtN(Math.max(0, recurring(inv.tenant.sub) - monthly))}`)
  }
  auditBoth(actor, inv.tenant, `Credit note ${cn.id} approved for ${inv.number}: ${fmtN(cn.amount)}`, `Total ${fmtN(inv.total)}`, `Net ${fmtN(Math.max(0, inv.total - inv.credited - cn.amount))}`)
}

export function requestCreditNote(inv: Invoice, amount: number, reason: string, recurringCredit: boolean, actor: string) {
  if (['Draft', 'Void'].includes(inv.status)) return 'Credit notes need an issued invoice.'
  if (!reason.trim()) return 'A reason is required.'
  if (!(amount > 0)) return 'Enter an amount above zero.'
  if (amount > creditHeadroom(inv) + 0.5) return `The most you can credit is ${fmtN(creditHeadroom(inv))}.`
  const needs = amount >= CREDIT_APPROVAL_THRESHOLD
  const cn: CreditNote = { id: `CN-${String(nextSeq()).padStart(4, '0')}`, invoiceId: inv.id, amount: r0(amount), reason: reason.trim(), recurring: recurringCredit, requestedBy: actor, requestedAt: stamp(), status: needs ? 'Pending approval' : 'Approved', decidedBy: needs ? undefined : 'Auto-approved under threshold', decidedAt: needs ? undefined : stamp() }
  ledgerStore.set((l) => ({ ...l, credits: [...l.credits, cn] }))
  if (needs) auditBoth(actor, inv.tenant, `Credit note ${cn.id} requested for ${inv.number}: ${fmtN(cn.amount)}, awaiting second approver`, inv.status, 'Pending approval')
  else applyCredit(inv, cn, actor)
  return ''
}

export function decideCreditNote(inv: Invoice, cn: CreditNote, approve: boolean, note: string, actor: string) {
  if (cn.status !== 'Pending approval') return 'Already decided.'
  if (cn.requestedBy.split(' (')[0] === actor.split(' (')[0]) return 'A different admin must decide this credit note.'
  const done: CreditNote = { ...cn, status: approve ? 'Approved' : 'Rejected', decidedBy: actor, decidedAt: stamp(), note: note.trim() || undefined }
  ledgerStore.set((l) => ({ ...l, credits: l.credits.map((c) => (c.id === cn.id ? done : c)) }))
  if (approve) applyCredit(inv, done, actor)
  else auditBoth(actor, inv.tenant, `Credit note ${cn.id} rejected${note.trim() ? `: ${note.trim()}` : ''}`, 'Pending approval', 'Rejected')
  return ''
}

export const refundable = (inv: Invoice) => (inv.status === 'Void' || inv.status === 'Draft' ? 0 : Math.max(0, inv.paid - inv.refunded))
export const originalMethod = (inv: Invoice): Method => inv.payments[inv.payments.length - 1]?.method ?? inv.method

export function refundInvoice(inv: Invoice, amount: number, reason: string, cancelSub: boolean, actor: string) {
  if (!reason.trim()) return 'A reason is required for a refund.'
  if (!(amount > 0)) return 'Enter an amount above zero.'
  if (amount > refundable(inv) + 0.5) return `The most you can refund is ${fmtN(refundable(inv))}.`
  const method = originalMethod(inv)
  const rec: RefundRec = { id: `RF-${String(nextSeq()).padStart(4, '0')}`, invoiceId: inv.id, amount: r0(amount), method, reason: reason.trim(), by: actor, at: stamp(), ref: `RFD-${hash(inv.id + amount) % 900000 + 100000}` }
  ledgerStore.set((l) => ({ ...l, refunds: [...l.refunds, rec] }))
  if (inv.tenant.real) addPayment({ subId: inv.tenant.id, at: stamp(), amount: rec.amount, currency: 'NGN', status: 'refunded', ref: rec.ref, description: `${inv.number} refund to ${method}` })
  auditBoth(actor, inv.tenant, `Refund ${rec.id} of ${fmtN(rec.amount)} to original ${method.toLowerCase()} for ${inv.number}: ${reason.trim()}`, `Held ${fmtN(inv.paid - inv.refunded)}`, `Held ${fmtN(inv.paid - inv.refunded - rec.amount)}`)
  if (cancelSub) stopBilling(inv.tenant, `Refunded ${inv.number}`, actor)
  return ''
}
