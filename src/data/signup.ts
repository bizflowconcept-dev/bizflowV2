/* Public signup: order pricing, workspace provisioning and sales quote requests.
   Pure pricing lives in priceOrder(); provisionWorkspace() performs the (idempotent) writes to the tenant and billing stores. */
import { TODAY, addDays, addPayment, addonFits, addonPrice, couponCheck, currencyOf, depsOf, getBilling, iso, logAudit, modulesIn, moduleById, nid, planById, quoteModules, round, setBilling } from './billing'
import type { Addon, BillingState, ModuleQuote, Promo, Subscription } from './billing'
import { blankProfile, reconcile as reconcileLedger } from './promoLedger'
import type { Redemption } from './promoLedger'
import { useSyncExternalStore } from 'react'
import { createTenant, recordAudit, tenantBySignup, withModuleDeps } from '../tenant/store'
import type { TenantAdmin } from '../tenant/store'

/** Billing module id -> company (tenant) module id. */
export const TENANT_MODULE: Record<string, string> = { people: 'hr', payroll: 'payroll', leave: 'leave', attendance: 'attendance', expenses: 'expenses', approvals: 'expenses', travel: 'travel', sign: 'sign', fleet: 'fleet', crm: 'crm', vendors: 'vendors', exit: 'exit', orgchart: 'orgchart', rules: 'rules', branding: 'branding', security: 'security' }

export type Cycle = 'monthly' | 'annual'
export const CURRENCY = 'NGN'

/** Billing modules a plan includes (plus their dependencies). */
export const planModules = (s: BillingState, planId: string) => {
  const plan = planById(s, planId)
  return plan ? quoteModules(s, { moduleIds: modulesIn(plan.features), employees: 1, currency: CURRENCY, cycle: 'monthly' }).selected : []
}

/** An add-on whose every granted module is already in the order adds nothing, so it is shown as included instead of being charged twice. */
export const addonCovered = (a: Addon, selected: string[]) => a.grants.length > 0 && modulesIn(a.grants).every((m) => selected.includes(m))
/** Modules an add-on needs that the order does not contain. */
export const addonNeeds = (s: BillingState, a: Addon, selected: string[]) => {
  const own = modulesIn(a.grants)
  return [...new Set(own.flatMap((m) => depsOf(s, m)).filter((d) => !own.includes(d) && !selected.includes(d)))]
}

export type Order = {
  mq: ModuleQuote; modules: string[]; addons: { id: string; name: string; amount: number }[]; addonSubtotal: number
  coupon: { code: string; ok: boolean; message: string }
  discounts: { label: string; amount: number; promoId?: string }[]; discount: number
  subtotal: number; setup: number; net: number; vatRate: number; vat: number; total: number
  savings: { annual: number; bundles: number; modules: number; coupon: number; total: number }
  monthly: number; perEmployee: number; months: number
}

const promoAmount = (p: Promo, base: number) => (p.type === 'percent' ? (base * p.value) / 100 : Math.min(p.value, base))

export function priceOrder(s: BillingState, i: { planId: string; modules: string[]; addons: string[]; employees: number; cycle: Cycle; coupon: string }): Order {
  const mq = quoteModules(s, { moduleIds: i.modules, employees: Math.max(1, i.employees), currency: CURRENCY, cycle: i.cycle })
  const modules = mq.selected
  const rows = i.addons.flatMap((id) => {
    const a = s.addons.find((x) => x.id === id)
    if (!a || !addonFits(a, i.planId, s) || addonCovered(a, modules) || addonNeeds(s, a, modules).length) return []
    const amount = addonPrice(a, CURRENCY, i.cycle)
    return amount === null ? [] : [{ id, name: a.name, amount: round(amount, CURRENCY, s) }]
  })
  const addonSubtotal = round(rows.reduce((t, r) => t + r.amount, 0), CURRENCY, s)
  const planBase = mq.subtotal
  const subtotal = round(planBase + addonSubtotal, CURRENCY, s)
  const t = iso(TODAY)
  const code = i.coupon.trim().toUpperCase()
  const applicable: Promo[] = s.promos.filter((p) => p.kind === 'automatic' && p.active && t >= p.start && t <= p.end && (!p.plans.length || p.plans.includes(i.planId)) && (!p.currencies.length || p.currencies.includes(CURRENCY)) && (!p.cycles.length || p.cycles.includes(i.cycle)))
  const cc = code ? couponCheck(s, code, { planId: i.planId, currency: CURRENCY, cycle: i.cycle, isNew: true, companyId: 'c-new' }) : { ok: false, message: '' }
  if (cc.ok && cc.promo) applicable.push(cc.promo)
  let discounts = applicable.map((p) => ({ promo: p, label: p.code ? `Code ${p.code}` : p.name, promoId: p.id, amount: round(promoAmount(p, p.appliesTo === 'plan' ? planBase : p.appliesTo === 'addon' ? addonSubtotal : subtotal), CURRENCY, s) })).filter((d) => d.amount > 0)
  if (discounts.some((d) => d.promo.stacking === 'exclusive') && discounts.length > 1) discounts = [[...discounts].sort((a, b) => b.amount - a.amount)[0]]
  const discount = Math.min(subtotal, round(discounts.reduce((a, d) => a + d.amount, 0), CURRENCY, s))
  const net = subtotal - discount
  const cur = currencyOf(s, CURRENCY)
  const vatRate = cur?.tax.applies ? cur.tax.rate : 0
  const setup = mq.setup
  const vat = round(((net + setup) * vatRate) / 100, CURRENCY, s)
  const total = round(net + setup + vat, CURRENCY, s)
  const months = i.cycle === 'annual' ? 12 : 1
  let annual = 0
  if (i.cycle === 'annual' && mq.ok) {
    const m = quoteModules(s, { moduleIds: i.modules, employees: Math.max(1, i.employees), currency: CURRENCY, cycle: 'monthly' })
    const addonMonthly = rows.reduce((t2, r) => { const a = s.addons.find((x) => x.id === r.id)!; return t2 + (addonPrice(a, CURRENCY, 'monthly') ?? 0) }, 0)
    annual = Math.max(0, round((m.subtotal + addonMonthly) * 12 - subtotal, CURRENCY, s))
  }
  const moduleDiscount = round(mq.lines.reduce((t2, l) => t2 + l.discount, 0), CURRENCY, s)
  const savings = { annual, bundles: mq.bundleDiscount, modules: moduleDiscount, coupon: discount, total: annual + mq.bundleDiscount + moduleDiscount + discount }
  return { mq, modules, addons: rows, addonSubtotal, coupon: { code, ok: !!cc.ok, message: cc.message }, discounts: discounts.map(({ label, amount, promoId }) => ({ label, amount, promoId })), discount, subtotal, setup, net, vatRate, vat, total, savings, monthly: net / months, perEmployee: net / months / Math.max(1, i.employees), months }
}

/* ---------- provisioning ---------- */
export type ProvisionInput = {
  signupId: string; ref: string; slug: string
  company: { name: string; contact: string; email: string; phone: string; industry: string; state: string; cac: string; employees: number; size: string }
  admin: TenantAdmin
  planId: string; modules: string[]; addons: string[]; cycle: Cycle; coupon: string
  method: 'card' | 'transfer'; paid: number
}

/** Company modules a purchase unlocks (dependencies cascade through TENANT_MODULE_DEPS). */
export function tenantModulesFor(s: BillingState, modules: string[], addonIds: string[]) {
  const addonModules = addonIds.flatMap((id) => modulesIn(s.addons.find((a) => a.id === id)?.grants ?? []))
  return withModuleDeps([...new Set([...modules, ...addonModules].map((m) => TENANT_MODULE[m]).filter(Boolean))])
}

const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }

/** Creates the workspace and its first subscription. Safe to call again after a partial failure: nothing is created twice. */
export function provisionWorkspace(i: ProvisionInput): string {
  const s = getBilling()
  const plan = planById(s, i.planId)
  if (!plan) throw new Error('The selected plan is no longer available.')
  const order = priceOrder(s, { planId: i.planId, modules: i.modules, addons: i.addons, employees: i.company.employees, cycle: i.cycle, coupon: i.coupon })
  if (!order.mq.ok) throw new Error(order.mq.reason ?? 'Your selection could not be priced.')
  const addons = order.addons.map((a) => a.id)
  const slug = tenantBySignup(i.signupId)?.slug ?? createTenant({
    slug: i.slug, name: i.company.name, email: i.company.email, phone: i.company.phone, state: i.company.state, size: i.company.size, industry: i.company.industry, cac: i.company.cac,
    plan: plan.name, employees: i.company.employees, modules: tenantModulesFor(s, order.modules, addons), admin: i.admin,
    signup: { id: i.signupId, ref: i.ref, cycle: i.cycle, addons, paid: i.paid, coupon: order.discounts.length && i.coupon ? i.coupon.toUpperCase() : undefined, method: i.method },
  })
  const subId = `c-${slug}`
  if (getBilling().subs.some((x) => x.id === subId)) return slug

  const planKeys = plan.features.filter((k) => order.modules.includes(k.split('.')[0]))
  const extraKeys = order.modules.filter((m) => !modulesIn(plan.features).includes(m)).flatMap((m) => moduleById(m)?.features.map((f) => f.key) ?? [])
  const features = [...new Set([...planKeys, ...extraKeys])]
  const renews = i.cycle === 'annual' ? addMonths(TODAY, 12) : addMonths(TODAY, 1)
  const sub: Subscription = {
    id: subId, company: i.company.name, country: 'NG', planId: plan.id, cycle: i.cycle, currency: CURRENCY, employees: i.company.employees, status: 'active', startedAt: iso(TODAY), renewsAt: iso(renews),
    net: order.subtotal, addons, overrides: [], coupon: order.discounts.some((d) => d.promoId && i.coupon) ? i.coupon.toUpperCase() : undefined, credit: 0,
    usage: { employees: i.company.employees, branches: 1, storageGb: 0, documents: 0, signatures: 0, leads: 0 }, card: i.method === 'card' ? { brand: 'Mastercard', last4: '1234', exp: '08/28' } : null,
    customFeatures: features, selfServe: true,
  }
  const profile = blankProfile()
  const redemptions: Redemption[] = order.discounts.flatMap((d) => {
    const p = s.promos.find((x) => x.id === d.promoId); if (!p) return []
    return [{
      id: nid('rd'), promoId: p.id, promoName: p.name, code: p.code, subId, company: i.company.name, at: iso(TODAY), planId: plan.id, cycle: i.cycle, currency: CURRENCY, employees: i.company.employees,
      list: order.subtotal, discount: d.amount, net: Math.max(0, order.subtotal - order.discount), trial: false, channel: p.channel ?? 'Website checkout', source: 'Public signup wizard', status: 'applied' as const,
      profile: { ...profile, contact: { name: i.admin.name, role: 'Company Administrator', email: i.admin.email, phone: i.admin.phone || i.company.phone }, industry: i.company.industry, size: i.company.size, state: i.company.state, referrer: 'Direct',
        consent: { marketing: false, basis: 'Not recorded', recordedAt: '' }, kyc: { ...profile.kyc, cac: i.company.cac ? { state: 'pending' as const, ref: i.company.cac } : profile.kyc.cac } },
    }]
  })
  setBilling((st) => reconcileLedger({ ...st, subs: [...st.subs.filter((x) => x.id !== subId), sub], redemptions: [...redemptions, ...(st.redemptions ?? [])] }))
  addPayment({ subId, at: iso(TODAY), amount: i.paid, currency: CURRENCY, status: 'successful', ref: i.ref, description: `${plan.name} · ${i.cycle} · ${i.method === 'card' ? 'Card' : 'Bank transfer'}` })
  logAudit(`${i.company.name} (customer)`, i.company.name, `Subscribed to ${plan.name} (${i.cycle}) via public signup`, 'No subscription', `${plan.name} · Active · ${order.modules.length} modules${addons.length ? ` · ${addons.length} add-ons` : ''}`)
  if (redemptions.length) logAudit(`${i.company.name} (customer)`, i.company.name, `Redeemed ${redemptions.map((r) => r.code ?? r.promoName).join(', ')}`, '—', `Discount applied`)
  recordAudit(slug, `Subscription activated: ${plan.name} (${i.cycle})`, undefined, `${order.modules.length} modules · ${i.ref}`, { scope: 'Platform', actor: 'BizFlow system', role: 'System', category: 'Finance', ref: i.ref })
  return slug
}

/* ---------- sales quote requests (Enterprise / custom capacity) ---------- */
export type QuoteStatus = 'New' | 'Contacted' | 'Proposal sent' | 'Won' | 'Lost'
export const QUOTE_STATUSES: QuoteStatus[] = ['New', 'Contacted', 'Proposal sent', 'Won', 'Lost']
export type QuoteRequest = {
  id: string; at: string; company: string; contact: string; email: string; phone: string; employees: number; industry: string; state: string
  planId: string; modules: string[]; branches: string; timeline: string; requirements: string; reason: string
  status: QuoteStatus; owner: string; notes: { at: string; by: string; text: string }[]; history: { at: string; by: string; status: QuoteStatus }[]; tenantSlug?: string; lostReason?: string
}
const QKEY = 'bf-quote-requests-v1'
const loadQuotes = (): QuoteRequest[] => {
  try { return (JSON.parse(localStorage.getItem(QKEY) || '[]') as QuoteRequest[]).map((q) => Object.assign({ owner: '', notes: [], history: [] }, q) as QuoteRequest) } catch { return [] }
}
let quotes = loadQuotes()
const qsubs = new Set<() => void>()
const qset = (next: QuoteRequest[]) => { quotes = next; try { localStorage.setItem(QKEY, JSON.stringify(next.slice(0, 500))) } catch { /* storage full */ } qsubs.forEach((f) => f()) }
export const quoteRequests = () => quotes
export const useQuoteRequests = () => useSyncExternalStore((cb) => { qsubs.add(cb); return () => { qsubs.delete(cb) } }, () => quotes)
export function submitQuoteRequest(q: Omit<QuoteRequest, 'id' | 'at' | 'status' | 'owner' | 'notes' | 'history'>): QuoteRequest {
  const at = new Date().toISOString()
  const rec: QuoteRequest = { ...q, id: `QR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, at, status: 'New', owner: '', notes: [], history: [{ at, by: q.contact, status: 'New' }] }
  qset([rec, ...quotes])
  logAudit(`${q.contact} (prospect)`, q.company, `Sales quote requested (${planById(getBilling(), q.planId)?.name ?? q.planId})`, '—', `${rec.id} · ${q.employees} employees · ${q.email}`)
  return rec
}
const patchQuote = (id: string, fn: (q: QuoteRequest) => QuoteRequest) => qset(quotes.map((q) => (q.id === id ? fn(q) : q)))
export const quoteActions = {
  setStatus(id: string, status: QuoteStatus, actor: string, lostReason?: string) {
    const q = quotes.find((x) => x.id === id); if (!q || q.status === status) return
    patchQuote(id, (x) => ({ ...x, status, lostReason: status === 'Lost' ? lostReason : undefined, history: [...x.history, { at: new Date().toISOString(), by: actor, status }] }))
    logAudit(actor, q.company, `Quote ${id} moved to ${status}`, q.status, status + (lostReason ? ` (${lostReason})` : ''))
  },
  assign(id: string, owner: string, actor: string) {
    const q = quotes.find((x) => x.id === id); if (!q || q.owner === owner) return
    patchQuote(id, (x) => ({ ...x, owner }))
    logAudit(actor, q.company, `Quote ${id} owner changed`, q.owner || 'Unassigned', owner || 'Unassigned')
  },
  addNote(id: string, text: string, actor: string) {
    const q = quotes.find((x) => x.id === id); if (!q || !text.trim()) return
    patchQuote(id, (x) => ({ ...x, notes: [{ at: new Date().toISOString(), by: actor, text: text.trim() }, ...x.notes] }))
    logAudit(actor, q.company, `Note added to quote ${id}`, '—', text.trim().slice(0, 80))
  },
  /** Creates the (unpaid, sales-assisted) workspace for a quote. Idempotent: a second call returns the existing slug. */
  convert(id: string, actor: string): string | null {
    const q = quotes.find((x) => x.id === id); if (!q) return null
    if (q.tenantSlug) return q.tenantSlug
    const s = getBilling()
    const mods = q.modules.length ? q.modules : planModules(s, q.planId)
    const size = ['1–10', '11–50', '51–200', '201–500'][[10, 50, 200, 500].findIndex((n) => q.employees <= n)] ?? '500+'
    const slug = createTenant({
      name: q.company, email: q.email, phone: q.phone, state: q.state, size, industry: q.industry, cac: '', plan: planById(s, q.planId)?.name ?? 'Enterprise', employees: q.employees,
      modules: tenantModulesFor(s, mods, []), signup: { id: `quote-${q.id}`, ref: q.id, cycle: 'annual', addons: [], paid: 0, method: 'sales' },
    })
    patchQuote(id, (x) => ({ ...x, tenantSlug: slug, status: 'Won', history: x.status === 'Won' ? x.history : [...x.history, { at: new Date().toISOString(), by: actor, status: 'Won' }] }))
    logAudit(actor, q.company, `Quote ${id} converted to workspace ${slug}`, q.status, 'Won · workspace created')
    recordAudit(slug, 'Workspace created from sales quote', undefined, q.id, { scope: 'Platform', actor, role: 'Platform admin', category: 'Finance', ref: q.id })
    return slug
  },
}

/* ---------- bank transfer ---------- */
export type VirtualAccount = { number: string; bank: string; name: string; reference: string; amount: number; expiresAt: number }
export const TRANSFER_WINDOW_MS = 10 * 60 * 1000
export function newVirtualAccount(amount: number): VirtualAccount {
  const digits = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b % 10).join('')
  return { number: `98${digits.slice(0, 8)}`, bank: 'Providus Bank', name: 'BizFlow Technologies Ltd', reference: `BFT-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-3).toUpperCase()}`, amount, expiresAt: Date.now() + TRANSFER_WINDOW_MS }
}
export { addDays }
