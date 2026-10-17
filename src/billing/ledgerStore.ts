/* Overlay store for the invoice ledger. Base invoices are derived (see ledger.ts); everything an admin does to them
 * (payments, credit notes, refunds, voids, reminders) is recorded here and replayed on top, so balances stay consistent. */
import { createStore } from '../platform/persist'

export type Method = 'Card' | 'Bank transfer' | 'Direct debit'
export const METHODS: Method[] = ['Card', 'Bank transfer', 'Direct debit']

export type PayRec = { id: string; invoiceId: string; at: string; amount: number; method: Method; ref: string; by: string; note?: string }
export type CreditNote = {
  id: string; invoiceId: string; amount: number; reason: string; recurring: boolean; requestedBy: string; requestedAt: string
  status: 'Pending approval' | 'Approved' | 'Rejected'; decidedBy?: string; decidedAt?: string; note?: string
}
export type RefundRec = { id: string; invoiceId: string; amount: number; method: Method; reason: string; by: string; at: string; ref: string }
export type InvoiceOverlay = { issuedAt?: string; issuedBy?: string; voided?: { at: string; by: string; reason: string }; reminders: { at: string; by: string; n: number }[] }
/** A recurring reduction (credit note flagged "recurring") that lowers MRR from the month it was approved. */
export type MrrAdjust = { id: string; subId: string; amount: number; ref: string; at: string }

export type LedgerState = { payments: PayRec[]; credits: CreditNote[]; refunds: RefundRec[]; overlay: Record<string, InvoiceOverlay>; mrrAdj: MrrAdjust[]; ended: Record<string, { at: string; by: string; reason: string }>; seq: number }

export const ledgerStore = createStore<LedgerState>('bizflow.ledger.v1', () => ({ payments: [], credits: [], refunds: [], overlay: {}, mrrAdj: [], ended: {}, seq: 1 }))
export const useLedger = ledgerStore.use
