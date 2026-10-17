import { useMemo, useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'

/* Income postings made into Accounting by other modules (CRM collections today). Tenant-scoped, persisted locally. */
export type Income = {
  id: string; tenant: string; date: string; customer: string; description: string; amount: number
  account: string; source: 'CRM' | 'Manual'; ref: string; by: string; postedAt: string
}

const KEY = 'bf-ledger-income-v1'
let entries: Income[] = (() => { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s) as Income[] } catch { /* fall through */ } return [] })()
const subs = new Set<() => void>()
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(entries)) } catch { /* storage full */ } subs.forEach((f) => f()) }

export const INCOME_ACCOUNT = 'Service revenue'

export function postIncome(slug: string, x: { date: string; customer: string; description: string; amount: number; ref: string; by: string; source?: Income['source']; account?: string }): Income {
  const year = x.date.slice(0, 4)
  const seq = entries.filter((e) => e.tenant === slug && e.id.includes(`-${year}-`)).length + 1
  const entry: Income = { id: `INC-${year}-${String(seq).padStart(4, '0')}`, tenant: slug, date: x.date, customer: x.customer, description: x.description, amount: x.amount, account: x.account ?? INCOME_ACCOUNT, source: x.source ?? 'CRM', ref: x.ref, by: x.by, postedAt: new Date().toISOString() }
  entries = [entry, ...entries]; emit()
  recordAudit(slug, 'Income posted to Accounting', x.customer, `₦${x.amount.toLocaleString('en-NG')} · ${entry.id}`, { category: 'Finance', ref: entry.id })
  return entry
}

export function useIncome(slug: string) {
  const all = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => entries)
  return useMemo(() => all.filter((e) => e.tenant === slug), [all, slug])
}
export const incomeById = (id: string) => entries.find((e) => e.id === id)
