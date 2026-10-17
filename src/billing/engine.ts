/* Pure commercial logic: pricing, promotions, tax, entitlements, limits, subscription state. No UI, no storage. */
import { ALL_FEATURES, CATALOG, LIMITS, moduleByRoute, moduleOf } from './catalog'
import type { Addon, Config, Currency, LimitKey, Plan, Promo } from './catalog'

export type Cycle = 'monthly' | 'annual'
export type SubStatus = 'Trial' | 'Active' | 'Past Due' | 'Payment Failed' | 'Grace Period' | 'Cancelled' | 'Expired' | 'Suspended'
export const STATUSES: SubStatus[] = ['Trial', 'Active', 'Past Due', 'Payment Failed', 'Grace Period', 'Cancelled', 'Expired', 'Suspended']
export const STATUS_TONE_MAP: Record<SubStatus, string> = { Trial: 'blue', Active: 'green', 'Past Due': 'amber', 'Payment Failed': 'red', 'Grace Period': 'amber', Cancelled: 'gray', Expired: 'gray', Suspended: 'red' }

export type Payment = { ref: string; date: string; amount: number; currency: string; status: 'Successful' | 'Failed' | 'Refunded'; description: string; reason?: string }
export type Sub = {
  id: string; company: string; planId: string; status: SubStatus; cycle: Cycle; currency: string
  employees: number; addons: string[]; amount: number; startedAt: string; renewsAt: string; trialEndsAt?: string
  credit: number; overrides: Record<string, { enabled: boolean; reason: string }>
  pendingPlanId?: string; paymentMethod?: string; payments: Payment[]
  usage: Record<LimitKey, number>
}

/* ---------- Dates & money ---------- */
export const addDays = (iso: string | Date, d: number) => { const x = new Date(iso); x.setDate(x.getDate() + d); return x.toISOString() }
export const daysUntil = (iso?: string) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : 0)
export const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
export const addMonths = (iso: string, n: number) => { const x = new Date(iso); x.setMonth(x.getMonth() + n); return x.toISOString() }

export function money(n: number, cur: string, config?: { currencies: Currency[] }) {
  const c = config?.currencies.find((x) => x.code === cur) ?? DEFAULT_CUR[cur] ?? { symbol: cur + ' ', decimals: 2, locale: 'en-US' }
  return c.symbol + n.toLocaleString(c.locale, { minimumFractionDigits: n % 1 && c.decimals ? c.decimals : 0, maximumFractionDigits: c.decimals })
}
const DEFAULT_CUR: Record<string, { symbol: string; decimals: number; locale: string }> = { NGN: { symbol: '₦', decimals: 0, locale: 'en-NG' }, USD: { symbol: '$', decimals: 2, locale: 'en-US' }, GBP: { symbol: '£', decimals: 2, locale: 'en-GB' }, EUR: { symbol: '€', decimals: 2, locale: 'de-DE' } }

const round2 = (n: number) => Math.round(n * 100) / 100

/* ---------- Plans ---------- */
export const publicPlans = (c: Config) => c.plans.filter((p) => p.status === 'active' && p.visible).sort((a, b) => a.order - b.order)
export const enabledCurrencies = (c: Config) => c.currencies.filter((x) => x.enabled)
export const planAvailable = (p: Plan, cur: string, cycle: Cycle) => !p.custom && p.prices[cycle][cur] !== undefined

/** Base price at the included employee count, plus per-extra-employee rate. */
export function planPrice(p: Plan, cur: string, cycle: Cycle, employees: number) {
  if (!planAvailable(p, cur, cycle)) return null
  const base = p.prices[cycle][cur]!
  const unit = (cycle === 'monthly' ? p.prices.extraMonthly : p.prices.extraAnnual)[cur] ?? 0
  const extraCount = Math.max(0, employees - p.includedEmployees)
  return { base, unit, extraCount, extra: round2(unit * extraCount), total: round2(base + unit * extraCount) }
}

export function recommendPlan(c: Config, employees: number) {
  const plans = publicPlans(c)
  const fits = plans.filter((p) => p.limits.employees === null || p.limits.employees >= employees)
  return fits.find((p) => p.recommended) ?? fits[0] ?? plans[plans.length - 1]
}

/* ---------- Promotions ---------- */
export function promoCheck(p: Promo, ctx: { planId: string; cycle: Cycle; currency: string; isNew: boolean }, now = Date.now()): string | null {
  if (!p.active) return 'This offer is no longer active.'
  if (now < new Date(p.start).getTime()) return 'This offer has not started yet.'
  if (now > new Date(p.end + 'T23:59:59').getTime()) return 'This code has expired.'
  if (p.maxRedemptions !== null && p.redeemed >= p.maxRedemptions) return 'This code has reached its redemption limit.'
  if (p.plans.length && !p.plans.includes(ctx.planId)) return 'This code does not apply to the selected plan.'
  if (p.currencies.length && !p.currencies.includes(ctx.currency)) return `This code is not available in ${ctx.currency}.`
  if (p.period === 'annual_only' && ctx.cycle !== 'annual') return 'This offer applies to annual billing only.'
  if (p.eligibility === 'new' && !ctx.isNew) return 'This code is for new customers only.'
  return null
}

export type QuoteInput = { planId: string; cycle: Cycle; currency: string; employees: number; addonIds: string[]; code?: string; isNew?: boolean }
export type QuoteLine = { label: string; detail?: string; amount: number; kind: 'plan' | 'extra' | 'addon' }
export type Quote = {
  ok: boolean; error?: string; currency: string; lines: QuoteLine[]; subtotal: number
  discount: { label: string; amount: number; note?: string } | null; couponError?: string
  tax: { name: string; rate: number; inclusive: boolean; amount: number } | null; total: number; plan?: Plan
}

export function quote(c: Config, q: QuoteInput): Quote {
  const plan = c.plans.find((p) => p.id === q.planId)
  const fail = (error: string): Quote => ({ ok: false, error, currency: q.currency, lines: [], subtotal: 0, discount: null, tax: null, total: 0, plan })
  if (!plan) return fail('Plan not found.')
  const pp = planPrice(plan, q.currency, q.cycle, q.employees)
  if (!pp) return fail(plan.custom ? 'This plan is priced by our sales team.' : `${plan.name} is not available in ${q.currency} for ${q.cycle} billing.`)
  const per = q.cycle === 'monthly' ? 'month' : 'year'
  const lines: QuoteLine[] = [{ label: `${plan.name} plan`, detail: `Includes ${plan.includedEmployees} employees · billed ${q.cycle}`, amount: pp.base, kind: 'plan' }]
  if (pp.extraCount) lines.push({ label: `${pp.extraCount} additional employees`, detail: `${money(pp.unit, q.currency, c)} each per ${per}`, amount: pp.extra, kind: 'extra' })
  for (const id of q.addonIds) {
    const a = c.addons.find((x) => x.id === id)
    const price = a?.prices[q.cycle][q.currency]
    if (a && price !== undefined) lines.push({ label: a.name, detail: `Add-on · per ${per}`, amount: price, kind: 'addon' })
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0))

  const ctx = { planId: q.planId, cycle: q.cycle, currency: q.currency, isNew: q.isNew ?? true }
  const base = (p: Promo) => lines.filter((l) => (p.appliesTo === 'all' ? true : p.appliesTo === 'plan' ? l.kind !== 'addon' : l.kind === 'addon')).reduce((s, l) => s + l.amount, 0)
  const value = (p: Promo) => (p.kind === 'percent' ? round2((base(p) * p.percent) / 100) : Math.min(base(p), p.fixed[q.currency] ?? 0))
  let couponError: string | undefined
  let promo: Promo | undefined
  if (q.code?.trim()) {
    const found = c.promos.find((p) => p.code && p.code.toLowerCase() === q.code!.trim().toLowerCase())
    const err = !found ? 'We could not find that code.' : promoCheck(found, ctx)
    if (err) couponError = err
    else promo = found
  }
  if (!promo) promo = c.promos.filter((p) => !p.code && !promoCheck(p, ctx)).sort((a, b) => value(b) - value(a))[0]
  const dAmt = promo ? value(promo) : 0
  const discount = promo && dAmt > 0 ? { label: promo.name, amount: dAmt, note: promo.period === 'first' ? 'First billing period' : undefined } : null

  const net = round2(subtotal - dAmt)
  const rule = c.taxes.find((t) => t.currency === q.currency && t.enabled && t.rate > 0)
  let tax: Quote['tax'] = null
  let total = net
  if (rule) {
    if (rule.inclusive) tax = { ...rule, amount: round2(net - net / (1 + rule.rate / 100)) }
    else { tax = { ...rule, amount: round2((net * rule.rate) / 100) }; total = round2(net + tax.amount) }
  }
  return { ok: true, currency: q.currency, lines, subtotal, discount, couponError, tax, total, plan }
}

/* ---------- Entitlements ---------- */
export type Ent = { on: boolean; source: string; kind: 'override' | 'plan' | 'addon' | 'none' }
export type EntMap = Record<string, Ent>

export function entitlements(c: Config, sub: Sub): EntMap {
  const plan = c.plans.find((p) => p.id === sub.planId)
  const out: EntMap = {}
  for (const f of ALL_FEATURES) {
    const ov = sub.overrides[f.key]
    if (ov) { out[f.key] = { on: ov.enabled, source: `Admin override · ${ov.reason}`, kind: 'override' }; continue }
    if (plan?.features.includes(f.key)) { out[f.key] = { on: true, source: `${plan.name} plan`, kind: 'plan' }; continue }
    const ad = c.addons.find((a) => sub.addons.includes(a.id) && a.features.includes(f.key))
    out[f.key] = ad ? { on: true, source: `${ad.name} add-on`, kind: 'addon' } : { on: false, source: 'Not included', kind: 'none' }
  }
  return out
}

export function moduleState(ent: EntMap, moduleId: string): Ent & { enabledCount: number; total: number } {
  const keys = CATALOG.find((m) => m.id === moduleId)?.features.map((f) => f.key) ?? []
  const on = keys.filter((k) => ent[k]?.on)
  const pick = on.map((k) => ent[k]).sort((a, b) => ['override', 'plan', 'addon'].indexOf(a.kind) - ['override', 'plan', 'addon'].indexOf(b.kind))[0]
  return { ...(pick ?? { on: false, source: 'Not included', kind: 'none' as const }), enabledCount: on.length, total: keys.length }
}

export const routeEntitled = (ent: EntMap, route: string) => {
  const m = moduleByRoute(route)
  return !m || moduleState(ent, m.id).on
}

export function minPlanFor(c: Config, featureKeysOrModule: string) {
  const mid = featureKeysOrModule.includes('.') ? moduleOf(featureKeysOrModule)?.id : featureKeysOrModule
  const keys = CATALOG.find((m) => m.id === mid)?.features.map((f) => f.key) ?? []
  return c.plans.filter((p) => p.status === 'active').sort((a, b) => a.order - b.order).find((p) => keys.some((k) => p.features.includes(k)))
}

export function effectiveLimits(c: Config, sub: Sub): Record<LimitKey, number | null> {
  const plan = c.plans.find((p) => p.id === sub.planId)
  const out = { ...(plan?.limits ?? Object.fromEntries(LIMITS.map((l) => [l.key, 0]))) } as Record<LimitKey, number | null>
  for (const a of c.addons.filter((x) => sub.addons.includes(x.id)))
    for (const [k, v] of Object.entries(a.limitBoost) as [LimitKey, number][]) if (out[k] !== null) out[k] = (out[k] ?? 0) + v
  return out
}

/* ---------- Subscription state ---------- */
export function effectiveStatus(sub: Sub): SubStatus {
  if (sub.status === 'Trial' && daysUntil(sub.trialEndsAt) < 0) return 'Expired'
  if (sub.status === 'Cancelled' && daysUntil(sub.renewsAt) < 0) return 'Expired'
  return sub.status
}
/** full: everything entitled works. locked: only billing remains reachable. */
export const accessMode = (sub: Sub): 'full' | 'locked' => (['Expired', 'Suspended'].includes(effectiveStatus(sub)) ? 'locked' : 'full')

export type Notice = { id: string; title: string; body: string; tone: 'red' | 'amber' | 'blue'; cta: string; to: string }
export function notices(c: Config, sub: Sub): Notice[] {
  const out: Notice[] = []
  const st = effectiveStatus(sub)
  const plan = c.plans.find((p) => p.id === sub.planId)
  if (st === 'Trial') { const d = daysUntil(sub.trialEndsAt); if (d <= 7) out.push({ id: 'trial', title: `Your trial ends in ${d} day${d === 1 ? '' : 's'}`, body: 'Subscribe to keep your workspace and data active.', tone: 'amber', cta: 'Upgrade now', to: '/admin/business/billing?subscribe=1' }) }
  if (st === 'Payment Failed') out.push({ id: 'failed', title: 'Your last payment failed', body: 'Update your payment method to avoid interruption.', tone: 'red', cta: 'Fix payment', to: '/admin/business/billing' })
  if (st === 'Past Due') out.push({ id: 'due', title: 'Payment is past due', body: 'Pay the outstanding invoice to keep full access.', tone: 'red', cta: 'Pay now', to: '/admin/business/billing' })
  if (st === 'Grace Period') out.push({ id: 'grace', title: 'Your account is in a grace period', body: 'Access continues briefly while payment is resolved.', tone: 'amber', cta: 'Resolve payment', to: '/admin/business/billing' })
  if (st === 'Cancelled') out.push({ id: 'cancel', title: `Subscription ends ${fmtDate(sub.renewsAt)}`, body: 'Your data is retained. Reactivate any time.', tone: 'blue', cta: 'Reactivate', to: '/admin/business/billing' })
  if (st === 'Expired' || st === 'Suspended') out.push({ id: 'locked', title: st === 'Expired' ? 'Your subscription has expired' : 'Your workspace is suspended', body: 'Your data is retained. Reactivate to restore access.', tone: 'red', cta: 'Reactivate', to: '/admin/business/billing' })
  const lim = effectiveLimits(c, sub)
  for (const l of LIMITS) {
    const cap = lim[l.key]
    if (cap && sub.usage[l.key] / cap >= 0.8) out.push({ id: 'lim-' + l.key, title: `${l.name} ${Math.round((sub.usage[l.key] / cap) * 100)}% used`, body: `${sub.usage[l.key]} of ${cap} on ${plan?.name ?? 'your plan'}.`, tone: 'amber', cta: 'Upgrade plan', to: '/admin/business/billing?upgrade=1' })
  }
  return out
}

export const addonCompatible = (a: Addon, plan: Plan | undefined) => !!plan && (a.compatible.length === 0 || a.compatible.includes(plan.id)) && (a.features.length === 0 || a.features.some((f) => !plan.features.includes(f)))
