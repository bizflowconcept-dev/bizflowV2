import { useMemo } from 'react'
import { createStore, uid } from '../platform/persist'
import { recordAudit } from '../tenant/store'

/* ---------- Reseller / partner accounts ----------
   A partner (accounting firm or agent) owns a referral code. A signup that quotes the code is attributed to the partner and earns
   commission for a fixed number of months. The percentage is tiered by how many referred companies are active at accrual time.
   Ledger life cycle: Accrued -> Approved (finance) -> Paid (payout run). Every step is audited. */
export type PartnerKind = 'Accounting firm' | 'Agent' | 'Consultancy'
export type CommissionTier = { minActive: number; pct: number }
export type Partner = {
  id: string; name: string; kind: PartnerKind; contact: string; email: string; code: string; since: string
  status: 'Active' | 'Paused'; tiers: CommissionTier[]; months: number; bank: string
}
export type Attribution = { id: string; partnerId: string; slug: string; company: string; plan: string; monthly: number; at: string; status: 'Active' | 'Churned'; health: number }
export type EntryStatus = 'Accrued' | 'Approved' | 'Paid'
export type LedgerEntry = { id: string; partnerId: string; attrId: string; slug: string; company: string; period: string; base: number; pct: number; amount: number; status: EntryStatus; at: string; approvedBy?: string; payoutId?: string }
export type Payout = { id: string; partnerId: string; at: string; by: string; amount: number; entries: number; reference: string }
type State = { partners: Partner[]; attrs: Attribution[]; ledger: LedgerEntry[]; payouts: Payout[] }

export const DEFAULT_TIERS: CommissionTier[] = [{ minActive: 0, pct: 10 }, { minActive: 5, pct: 15 }, { minActive: 10, pct: 20 }]
export const PAYOUT_MINIMUM = 5000
const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')
export const money = naira

export const tierPct = (tiers: CommissionTier[], active: number) => [...tiers].sort((a, b) => b.minActive - a.minActive).find((t) => active >= t.minActive)?.pct ?? 0
const periodOf = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
const monthsAgo = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d }
export const normCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '')

function seed(): State {
  return { partners: [], attrs: [], ledger: [], payouts: [] }
}
const store = createStore<State>('bizflow.partners.v1', seed)
export const usePartners = store.use

/* ---------- Public helpers for the signup flow ---------- */
export function lookupPartnerCode(code: string): Partner | null {
  const c = normCode(code)
  if (!c) return null
  return store.get().partners.find((p) => p.code === c && p.status === 'Active') ?? null
}
/** Call after a company has been created. `amount` is the monthly subscription value in naira. Idempotent per company. */
export function attributeSignup(code: string, tenantSlug: string, amount: number): { ok: boolean; partner?: Partner; error?: string } {
  const p = lookupPartnerCode(code)
  if (!p) return { ok: false, error: 'That referral code is not recognised or the partner is paused.' }
  const s = store.get()
  if (s.attrs.some((a) => a.slug === tenantSlug)) return { ok: false, error: 'This company already has a referring partner.' }
  const t = (() => { try { return (JSON.parse(localStorage.getItem('bf-tenants-v5') || 'null') as { tenants?: Record<string, { profile?: { name?: string }; plan?: string }> } | null)?.tenants?.[tenantSlug] } catch { return undefined } })()
  const company = t?.profile?.name ?? tenantSlug
  const attr: Attribution = { id: `AT-${tenantSlug.toUpperCase()}`, partnerId: p.id, slug: tenantSlug, company, plan: t?.plan ?? '', monthly: Math.max(0, Math.round(amount)), at: new Date().toISOString(), status: 'Active', health: 0 }
  store.set((st) => ({ ...st, attrs: [attr, ...st.attrs] }))
  accrueOne(attr)
  recordAudit(tenantSlug, 'Signup attributed to partner', undefined, `${p.name} (${p.code})`, { category: 'Finance', actor: 'System' })
  return { ok: true, partner: p }
}

/* ---------- Ledger ---------- */
function accrueOne(attr: Attribution, period = periodOf(new Date())): LedgerEntry | null {
  const s = store.get()
  const p = s.partners.find((x) => x.id === attr.partnerId)
  if (!p || attr.status !== 'Active' || p.status !== 'Active') return null
  if (s.ledger.some((l) => l.attrId === attr.id && l.period === period)) return null
  if (s.ledger.filter((l) => l.attrId === attr.id).length >= p.months) return null
  const active = s.attrs.filter((a) => a.partnerId === p.id && a.status === 'Active').length
  const pct = tierPct(p.tiers, active)
  const e: LedgerEntry = { id: uid('CM'), partnerId: p.id, attrId: attr.id, slug: attr.slug, company: attr.company, period, base: attr.monthly, pct, amount: Math.round(attr.monthly * pct / 100), status: 'Accrued', at: new Date().toISOString() }
  store.set((st) => ({ ...st, ledger: [e, ...st.ledger] }))
  return e
}
export function runAccruals(by: string): number {
  let n = 0
  store.get().attrs.forEach((a) => { if (accrueOne(a)) n += 1 })
  recordAudit('platform', 'Partner commission accrual run', undefined, `${n} entr${n === 1 ? 'y' : 'ies'} accrued for ${periodOf(new Date())}`, { category: 'Finance', actor: by })
  return n
}
export function approveEntries(ids: string[], by: string): number {
  const rows = store.get().ledger.filter((l) => ids.includes(l.id) && l.status === 'Accrued')
  if (!rows.length) return 0
  store.set((s) => ({ ...s, ledger: s.ledger.map((l) => (rows.some((r) => r.id === l.id) ? { ...l, status: 'Approved' as const, approvedBy: by } : l)) }))
  recordAudit('platform', 'Partner commission approved', undefined, `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}, ${naira(rows.reduce((n, r) => n + r.amount, 0))}`, { category: 'Finance', actor: by })
  return rows.length
}
export const payable = (ledger: LedgerEntry[], partnerId: string) => ledger.filter((l) => l.partnerId === partnerId && l.status === 'Approved')
/** Pays every approved entry of each partner whose approved balance reaches the minimum. Returns the payouts created and the partners skipped. */
export function runPayout(by: string): { paid: Payout[]; skipped: { name: string; amount: number }[] } {
  const s = store.get()
  const paid: Payout[] = []; const skipped: { name: string; amount: number }[] = []
  const at = new Date().toISOString()
  const marks = new Map<string, string>()
  s.partners.forEach((p) => {
    const rows = payable(s.ledger, p.id)
    if (!rows.length) return
    const amount = rows.reduce((n, r) => n + r.amount, 0)
    if (amount < PAYOUT_MINIMUM) { skipped.push({ name: p.name, amount }); return }
    const po: Payout = { id: uid('PO'), partnerId: p.id, at, by, amount, entries: rows.length, reference: `NIP${p.code}${Date.now().toString().slice(-6)}` }
    rows.forEach((r) => marks.set(r.id, po.id)); paid.push(po)
  })
  if (paid.length) {
    store.set((st) => ({ ...st, payouts: [...paid, ...st.payouts], ledger: st.ledger.map((l) => (marks.has(l.id) ? { ...l, status: 'Paid' as const, payoutId: marks.get(l.id) } : l)) }))
    recordAudit('platform', 'Partner payout run', undefined, `${paid.length} partner${paid.length === 1 ? '' : 's'}, ${naira(paid.reduce((n, p) => n + p.amount, 0))}`, { category: 'Finance', actor: by })
  }
  return { paid, skipped }
}

/* ---------- Partner admin ---------- */
export function savePartner(input: Omit<Partner, 'id' | 'since' | 'status'> & { id?: string }, by: string): { ok: boolean; error?: string; id?: string } {
  const code = normCode(input.code)
  if (input.name.trim().length < 3) return { ok: false, error: 'Enter the partner name.' }
  if (!/^[A-Z0-9]{3,12}$/.test(code)) return { ok: false, error: 'Referral code must be 3 to 12 letters or digits.' }
  if (!/^\S+@\S+\.\S+$/.test(input.email)) return { ok: false, error: 'Enter a valid email address.' }
  if (input.months < 1 || input.months > 36) return { ok: false, error: 'Commission duration must be between 1 and 36 months.' }
  const tiers = [...input.tiers].sort((a, b) => a.minActive - b.minActive)
  if (!tiers.length || tiers[0].minActive !== 0) return { ok: false, error: 'The first tier must start at 0 active companies.' }
  if (tiers.some((t, i) => t.pct <= 0 || t.pct > 40 || (i > 0 && (t.minActive === tiers[i - 1].minActive || t.pct < tiers[i - 1].pct)))) return { ok: false, error: 'Tiers need unique thresholds and a percentage between 1 and 40 that never drops as thresholds rise.' }
  const s = store.get()
  if (s.partners.some((p) => p.code === code && p.id !== input.id)) return { ok: false, error: 'That referral code is already taken.' }
  const id = input.id ?? `PT-${code}`
  const rec: Partner = { ...input, code, tiers, id, since: s.partners.find((p) => p.id === id)?.since ?? new Date().toISOString().slice(0, 10), status: s.partners.find((p) => p.id === id)?.status ?? 'Active' }
  store.set((st) => ({ ...st, partners: input.id ? st.partners.map((p) => (p.id === id ? rec : p)) : [rec, ...st.partners] }))
  recordAudit('platform', input.id ? 'Partner updated' : 'Partner created', undefined, `${rec.name} (${code})`, { category: 'Finance', actor: by })
  return { ok: true, id }
}
export function setPartnerStatus(id: string, status: 'Active' | 'Paused', by: string) {
  const p = store.get().partners.find((x) => x.id === id)
  if (!p) return
  store.set((s) => ({ ...s, partners: s.partners.map((x) => (x.id === id ? { ...x, status } : x)) }))
  recordAudit('platform', `Partner ${status === 'Paused' ? 'paused' : 'reactivated'}`, p.status, status, { category: 'Finance', actor: by })
}

/* ---------- Derived stats ---------- */
export function statsOf(st: State, partnerId: string) {
  const p = st.partners.find((x) => x.id === partnerId)
  const attrs = st.attrs.filter((a) => a.partnerId === partnerId)
  const ledger = st.ledger.filter((l) => l.partnerId === partnerId)
  const active = attrs.filter((a) => a.status === 'Active')
  const sum = (s: EntryStatus) => ledger.filter((l) => l.status === s).reduce((n, l) => n + l.amount, 0)
  return { p, attrs, active, ledger, mrr: active.reduce((n, a) => n + a.monthly, 0), accrued: sum('Accrued'), approved: sum('Approved'), paid: sum('Paid'), pct: p ? tierPct(p.tiers, active.length) : 0, churnRate: attrs.length ? Math.round(((attrs.length - active.length) / attrs.length) * 100) : 0 }
}
export const usePartnerStats = (id: string) => { const st = store.use(); return useMemo(() => statsOf(st, id), [st, id]) }
/** Commission by month for the last 6 months (all statuses), plus referred signups per month. */
export function monthlySeries(st: State, partnerId?: string) {
  return Array.from({ length: 6 }, (_, i) => {
    const d = monthsAgo(5 - i); const label = periodOf(d)
    const rows = st.ledger.filter((l) => l.period === label && (!partnerId || l.partnerId === partnerId))
    const signups = st.attrs.filter((a) => (!partnerId || a.partnerId === partnerId) && periodOf(new Date(a.at)) === label).length
    return { m: d.toLocaleDateString('en-GB', { month: 'short' }), commission: rows.reduce((n, l) => n + l.amount, 0), mrr: rows.reduce((n, l) => n + l.base, 0), signups }
  })
}
