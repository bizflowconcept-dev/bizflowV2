import { FX_REFERENCE, TODAY, daysUntil, iso, planById } from '../../../data/billing'
import type { BillingState, Promo, Subscription } from '../../../data/billing'
import type { Redemption } from '../../../data/promoLedger'

/** Convert any amount to naira at the platform reference FX rate so mixed-currency totals are comparable. */
export const ngn = (amount: number, cur: string) => (cur === 'NGN' ? amount : amount * (FX_REFERENCE[cur] ?? 1))
export const compactNgn = (n: number) => {
  const a = Math.abs(n); const sign = n < 0 ? '-' : ''
  if (a >= 1e9) return `${sign}₦${(a / 1e9).toFixed(2).replace(/\.?0+$/, '')}bn`
  if (a >= 1e6) return `${sign}₦${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}m`
  if (a >= 1e3) return `${sign}₦${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.?0+$/, '')}k`
  return `${sign}₦${Math.round(a)}`
}

export type PromoState = 'Live' | 'Scheduled' | 'Expired' | 'Draft' | 'Exhausted'
export const STATUS_TABS = ['All', 'Live', 'Scheduled', 'Expired', 'Draft'] as const
export const promoState = (p: Promo): PromoState => {
  const t = iso(TODAY)
  if (!p.active) return 'Draft'
  if (t > p.end) return 'Expired'
  if (t < p.start) return 'Scheduled'
  if (p.limit && p.redeemed >= p.limit) return 'Exhausted'
  return 'Live'
}
/** Exhausted promos are grouped under the Expired tab. */
export const tabOf = (st: PromoState) => (st === 'Exhausted' ? 'Expired' : st)
export const STATE_TONE: Record<PromoState, string> = { Live: 'green', Scheduled: 'blue', Expired: 'gray', Draft: 'amber', Exhausted: 'red' }

export const applied = (s: BillingState) => (s.redemptions ?? []).filter((r) => r.status === 'applied')
export const redemptionsOf = (s: BillingState, promoId: string) => (s.redemptions ?? []).filter((r) => r.promoId === promoId)

/** Typical list price used to model exposure: Growth annual in naira. */
const TYPICAL_LIST = 950000
export const unitDiscountNgn = (p: Promo) => (p.type === 'percent' ? (TYPICAL_LIST * p.value) / 100 : p.value)

export type Counted = { key: string; label: string; count: number; discount: number; revenue: number }
const tally = (rows: Redemption[], keyOf: (r: Redemption) => [string, string]): Counted[] => {
  const m = new Map<string, Counted>()
  for (const r of rows) {
    const [key, label] = keyOf(r); const c = m.get(key) ?? { key, label, count: 0, discount: 0, revenue: 0 }
    c.count++; c.discount += ngn(r.discount, r.currency); c.revenue += ngn(r.net, r.currency); m.set(key, c)
  }
  return [...m.values()].sort((a, b) => b.discount - a.discount)
}

export type Stats = {
  count: number; discount: number; revenue: number; avg: number; trialStarted: number; converted: number
  byPlan: Counted[]; byChannel: Counted[]; byCycle: Counted[]; companies: number
}
const isPaying = (sub?: Subscription) => !!sub && ['active', 'past_due', 'payment_failed', 'grace'].includes(sub.status)
export function statsOf(s: BillingState, rows: Redemption[]): Stats {
  const live = rows.filter((r) => r.status === 'applied')
  const discount = live.reduce((a, r) => a + ngn(r.discount, r.currency), 0)
  const revenue = live.reduce((a, r) => a + ngn(r.net, r.currency), 0)
  const trial = live.filter((r) => r.trial)
  return {
    count: live.length, discount, revenue, avg: live.length ? discount / live.length : 0,
    trialStarted: trial.length, converted: trial.filter((r) => isPaying(s.subs.find((x) => x.id === r.subId))).length,
    byPlan: tally(live, (r) => [r.planId, planById(s, r.planId)?.name ?? r.planId]), byChannel: tally(live, (r) => [r.channel, r.channel]),
    byCycle: tally(live, (r) => [r.cycle, r.cycle === 'annual' ? 'Annual' : 'Monthly']), companies: new Set(live.map((r) => r.subId)).size,
  }
}

/* ---------- Time series: real ledger + deterministic modelled demand ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export type SeriesPoint = { m: string; ym: string; actual: number; discount: number; modelled: number; future: boolean }
const ymOf = (d: string) => d.slice(0, 7)
const monthRange = (from: string, to: string) => {
  const out: string[] = []; let [y, m] = from.split('-').map(Number); const [ey, em] = to.split('-').map(Number)
  while ((y < ey || (y === ey && m <= em)) && out.length < 12) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++ } }
  return out
}
/** Modelled demand: each promo's planned volume (40% of its cap, or 60 if uncapped) spread over its window on a smooth bell curve. Illustrative only. */
const modelFor = (promos: Promo[], months: string[]) => {
  const out = Object.fromEntries(months.map((m) => [m, 0])) as Record<string, number>
  for (const p of promos) {
    const win = monthRange(ymOf(p.start), ymOf(p.end)); if (!win.length) continue
    const volume = (p.limit ?? 150) * 0.4
    const w = win.map((_, i) => Math.sin((Math.PI * (i + 0.5)) / win.length)); const tot = w.reduce((a, b) => a + b, 0)
    win.forEach((m, i) => { if (m in out) out[m] += (volume * w[i]) / tot })
  }
  return out
}
export function seriesFor(promos: Promo[], rows: Redemption[], range?: { from: string; to: string }): SeriesPoint[] {
  const from = range?.from ?? '2026-01'; const to = range?.to ?? '2026-12'
  const months = monthRange(from, to); const model = modelFor(promos.filter((p) => p.active), months); const now = ymOf(iso(TODAY))
  return months.map((ym) => {
    const inM = rows.filter((r) => r.status === 'applied' && ymOf(r.at) === ym)
    return { m: MONTHS[Number(ym.slice(5)) - 1], ym, actual: inM.length, discount: Math.round(inM.reduce((a, r) => a + ngn(r.discount, r.currency), 0)), modelled: Math.round(model[ym] * 10) / 10, future: ym > now }
  })
}
export const promoRange = (p: Promo, rows: Redemption[]) => {
  const first = [p.start, ...rows.map((r) => r.at)].sort()[0]; return { from: ymOf(first), to: ymOf(p.end > first ? p.end : first) }
}

/* ---------- Company rows (CRM / KYC view) ---------- */
export type Lifecycle = 'Active' | 'Trial' | 'At risk' | 'Churned' | 'Unknown'
export const lifecycleOf = (sub?: Subscription): Lifecycle => {
  if (!sub) return 'Unknown'
  if (sub.status === 'active') return 'Active'
  if (sub.status === 'trial') return 'Trial'
  if (['past_due', 'payment_failed', 'grace'].includes(sub.status)) return 'At risk'
  return 'Churned'
}
export type CompanyRow = Redemption & { sub?: Subscription; lifecycle: Lifecycle; ltv: number; ltvCur: string; kycDone: number }
export function companyRows(s: BillingState, rows: Redemption[]): CompanyRow[] {
  return rows.map((r) => {
    const sub = s.subs.find((x) => x.id === r.subId)
    const ltv = s.payments.filter((p) => p.subId === r.subId && p.status === 'successful').reduce((a, p) => a + p.amount, 0) - s.payments.filter((p) => p.subId === r.subId && p.status === 'refunded').reduce((a, p) => a + p.amount, 0)
    const k = r.profile.kyc
    return { ...r, sub, lifecycle: lifecycleOf(sub), ltv, ltvCur: sub?.currency ?? r.currency, kycDone: (['cac', 'tin', 'director', 'address'] as const).filter((x) => k[x].state === 'verified').length }
  }).sort((a, b) => b.at.localeCompare(a.at))
}

/* ---------- Overview ---------- */
export function overview(s: BillingState) {
  const all = applied(s); const st = statsOf(s, all)
  const live = s.promos.filter((p) => promoState(p) === 'Live')
  const limited = s.promos.filter((p) => p.limit)
  const used = limited.reduce((a, p) => a + Math.min(p.redeemed, p.limit!), 0); const cap = limited.reduce((a, p) => a + p.limit!, 0)
  const expiring = live.filter((p) => daysUntil(p.end) <= 30)
  const per = s.promos.map((p) => ({ p, st: statsOf(s, redemptionsOf(s, p.id)) }))
  return { st, live, used, cap, expiring, per, series: seriesFor(s.promos, all) }
}
