/* Revenue portfolio: the real subscriptions in the billing store (eTranzact plus any self-serve workspace created at runtime).
 * No invented companies. The store keeps no history, so earlier months of each real subscription are MODELLED from its current price and start date. */
import { useMemo } from 'react'
import { MODULES, TODAY, addonPrice, planById, useBilling } from '../data/billing'
import type { BillingState, Subscription } from '../data/billing'
import { PAYING, hash, mrrHistory, recurring } from './insights'
import { liveGrantsFor, monthlyValue, useGrants } from '../data/grants'
import { useLedger } from './ledgerStore'
import type { MrrAdjust, Method } from './ledgerStore'

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const MONTHS = 12
export const monthStarts = () => Array.from({ length: MONTHS }, (_, k) => new Date(TODAY.getFullYear(), TODAY.getMonth() - (MONTHS - 1 - k), 1))
export const monthLabel = (d: Date) => `${d.toLocaleDateString('en-GB', { month: 'short' })} ${String(d.getFullYear()).slice(2)}`
export const MONTH_LABELS = () => monthStarts().map(monthLabel)

export type PortfolioTenant = { id: string; slug: string; name: string; sub: Subscription; real: boolean; method: Method; series: number[]; waived?: number }

const slugify = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Monthly value of live complimentary grants for a subscription: `plan` is the part that waives the contract fee (not counted in MRR), `total` includes free modules and add-ons. */
export function complimentary(s: BillingState, sub: Subscription) {
  let plan = 0, total = 0
  const lines = liveGrantsFor(sub.id).map((g) => { const v = monthlyValue(s, sub, g.scope); total += v; if (g.scope.planId) plan += v; return { grant: g, value: v } })
  return { plan: Math.min(plan, recurring(sub)), total, lines }
}

export function buildTenants(s: BillingState, adj: MrrAdjust[], ended: Record<string, unknown> = {}): PortfolioTenant[] {
  const adjFor = (id: string) => adj.filter((a) => a.subId === id).reduce((n, a) => n + a.amount, 0)
  const real: PortfolioTenant[] = s.subs.map((sub) => {
    const cut = adjFor(sub.id)
    const waived = Math.round(complimentary(s, sub).plan)
    const series = mrrHistory(sub, MONTHS).map((p, k) => (k < MONTHS - 1 && p.mrr > 0 ? p.mrr + cut : k === MONTHS - 1 ? Math.max(0, p.mrr - waived) : p.mrr))
    return { id: sub.id, slug: sub.id.replace(/^c-/, ''), name: sub.company, sub, real: true, method: (sub.card ? 'Card' : 'Bank transfer') as Method, series, waived }
  })
  return real
}

export function usePortfolioTenants() {
  const s = useBilling(); const l = useLedger(); const g = useGrants()
  return useMemo(() => ({ s, tenants: buildTenants(s, l.mrrAdj, l.ended) }), [s, l.mrrAdj, l.ended, g])
}

/* ---------- movements ---------- */
export type Movement = { idx: number; label: string; opening: number; closing: number; newMrr: number; expansion: number; reactivation: number; contraction: number; complimentary: number; churn: number; logosNew: number; logosChurned: number }
export function movements(tenants: PortfolioTenant[]): Movement[] {
  const labels = MONTH_LABELS()
  return Array.from({ length: MONTHS - 1 }, (_, j) => {
    const k = j + 1
    const m: Movement = { idx: k, label: labels[k], opening: 0, closing: 0, newMrr: 0, expansion: 0, reactivation: 0, contraction: 0, complimentary: 0, churn: 0, logosNew: 0, logosChurned: 0 }
    tenants.forEach((t) => {
      let prev = t.series[k - 1]; const cur = t.series[k]
      m.opening += prev; m.closing += cur
      /* A complimentary grant waives the fee but the customer stays: book the drop as its own category, never as churn or contraction. */
      if (k === MONTHS - 1 && t.waived && cur < prev) { const c = Math.min(t.waived, prev - cur); m.complimentary -= c; prev -= c; if (prev === cur) return }
      if (prev === 0 && cur > 0) { if (t.series.slice(0, k).some((v) => v > 0)) m.reactivation += cur; else m.newMrr += cur; m.logosNew++ }
      else if (prev > 0 && cur === 0) { m.churn -= prev; m.logosChurned++ }
      else if (cur > prev) m.expansion += cur - prev
      else if (cur < prev) m.contraction += cur - prev
    })
    return m
  })
}

/* ---------- headline metrics ---------- */
export type Metrics = {
  mrr: number; arr: number; payingAccounts: number; arpa: number; nrr: number; grr: number; logoChurnMonthly: number; revenueChurnMonthly: number
  ltv: number; cacDefault: number; margin: number; atRiskMrr: number; atRiskCount: number; prevMrr: number; momPct: number
}
export const GROSS_MARGIN = 0.8
export function metrics(tenants: PortfolioTenant[], mv: Movement[]): Metrics {
  const last = MONTHS - 1
  const mrr = tenants.reduce((n, t) => n + t.series[last], 0)
  const prevMrr = tenants.reduce((n, t) => n + t.series[last - 1], 0)
  const paying = tenants.filter((t) => t.series[last] > 0)
  const arpa = paying.length ? mrr / paying.length : 0
  const cohort = tenants.filter((t) => t.series[last - 6] > 0)
  const then = cohort.reduce((n, t) => n + t.series[last - 6], 0)
  const nrr = then ? (cohort.reduce((n, t) => n + t.series[last], 0) / then) * 100 : 100
  const grr = then ? (cohort.reduce((n, t) => n + Math.min(t.series[last], t.series[last - 6]), 0) / then) * 100 : 100
  const w = mv.slice(-6)
  const logoChurnMonthly = w.reduce((n, m) => n + (m.opening ? m.logosChurned / Math.max(1, tenants.filter((t) => t.series[m.idx - 1] > 0).length) : 0), 0) / Math.max(1, w.length)
  const revenueChurnMonthly = w.reduce((n, m) => n + (m.opening ? -(m.churn + m.contraction) / m.opening : 0), 0) / Math.max(1, w.length)
  const ltv = (arpa * GROSS_MARGIN) / Math.max(0.005, logoChurnMonthly)
  const newOnes = w.reduce((n, m) => n + m.newMrr, 0); const newLogos = w.reduce((n, m) => n + m.logosNew, 0)
  const trouble = tenants.filter((t) => ['past_due', 'payment_failed', 'grace'].includes(t.sub.status))
  return {
    mrr, arr: mrr * 12, payingAccounts: paying.length, arpa, nrr, grr, logoChurnMonthly, revenueChurnMonthly, ltv, margin: GROSS_MARGIN,
    cacDefault: Math.round(((newLogos ? newOnes / newLogos : arpa) * 3) / 1000) * 1000, atRiskMrr: trouble.reduce((n, t) => n + t.series[last], 0), atRiskCount: trouble.length, prevMrr, momPct: prevMrr ? ((mrr - prevMrr) / prevMrr) * 100 : 0,
  }
}

/* ---------- breakdowns ---------- */
export type Slice = { name: string; value: number; share: number }
const slices = (m: Record<string, number>, total: number): Slice[] => Object.entries(m).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value: Math.round(value), share: total ? value / total : 0 })).sort((a, b) => b.value - a.value)
const WEIGHT: Record<string, number> = { Foundation: 4, Essential: 3, Recommended: 2, Specialist: 1 }
export function breakdowns(s: BillingState, tenants: PortfolioTenant[]) {
  const byPlan: Record<string, number> = {}, byAddon: Record<string, number> = {}, byModule: Record<string, number> = {}
  let total = 0
  tenants.forEach((t) => {
    const cur = t.series[MONTHS - 1]; if (cur <= 0) return
    total += cur
    const plan = planById(s, t.sub.planId)
    let addonTotal = 0
    t.sub.addons.forEach((id) => {
      const a = s.addons.find((x) => x.id === id); if (!a) return
      const p = addonPrice(a, t.sub.currency, t.sub.cycle); if (p === null) return
      const monthly = (t.sub.cycle === 'annual' ? p / 12 : p) * (cur / Math.max(1, recurring(t.sub)))
      addonTotal += monthly; byAddon[a.name] = (byAddon[a.name] ?? 0) + monthly
      const mods = [...new Set(a.grants.map((g) => g.split('.')[0]))]
      if (mods.length) mods.forEach((m) => { const nm = MODULES.find((x) => x.id === m)?.name ?? m; byModule[nm] = (byModule[nm] ?? 0) + monthly / mods.length })
      else byModule['Capacity (limit boosts)'] = (byModule['Capacity (limit boosts)'] ?? 0) + monthly
    })
    addonTotal = Math.min(addonTotal, cur)
    const planPart = cur - addonTotal
    byPlan[plan?.name ?? t.sub.planId] = (byPlan[plan?.name ?? t.sub.planId] ?? 0) + planPart
    if (plan) {
      const mods = MODULES.filter((m) => m.features.some((f) => plan.features.includes(f.key)))
      const w = mods.map((m) => WEIGHT[s.modulePrices.find((r) => r.moduleId === m.id)?.importance ?? 'Recommended'] ?? 2)
      const sum = w.reduce((a, b) => a + b, 0) || 1
      mods.forEach((m, i) => { byModule[m.name] = (byModule[m.name] ?? 0) + (planPart * w[i]) / sum })
    }
  })
  return { total, byPlan: slices(byPlan, total), byAddon: slices(byAddon, total), byModule: slices(byModule, total) }
}

export function concentration(tenants: PortfolioTenant[]) {
  const last = MONTHS - 1; const total = tenants.reduce((n, t) => n + t.series[last], 0)
  const top = tenants.filter((t) => t.series[last] > 0).sort((a, b) => b.series[last] - a.series[last]).slice(0, 10)
  let cum = 0
  return { total, rows: top.map((t, i) => { cum += t.series[last]; return { rank: i + 1, tenant: t, mrr: t.series[last], share: total ? t.series[last] / total : 0, cumulative: total ? cum / total : 0 } }), top10Share: total ? cum / total : 0 }
}

/* ---------- forecast: trailing three-month average of each movement, applied forward ---------- */
export type ForecastRow = { label: string; low: number; base: number; high: number; net: number }
export function forecast(mv: Movement[], current: number) {
  const w = mv.slice(-3); const avg = (f: (m: Movement) => number) => w.reduce((n, m) => n + f(m), 0) / Math.max(1, w.length)
  const drivers = { newMrr: avg((m) => m.newMrr), expansion: avg((m) => m.expansion), reactivation: avg((m) => m.reactivation), contraction: avg((m) => m.contraction), churn: avg((m) => m.churn) }
  const gain = drivers.newMrr + drivers.expansion + drivers.reactivation, loss = drivers.contraction + drivers.churn
  const rows: ForecastRow[] = []
  let b = current, lo = current, hi = current
  for (let i = 1; i <= 3; i++) {
    b += gain + loss; lo += gain * 0.6 + loss * 1.4; hi += gain * 1.25 + loss * 0.6
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + i, 1)
    rows.push({ label: monthLabel(d), low: Math.round(lo), base: Math.round(b), high: Math.round(hi), net: Math.round(gain + loss) })
  }
  return { drivers, rows, netPerMonth: gain + loss }
}

/* ---------- plain-language "what changed this month" ---------- */
export type Insight = { tone: 'good' | 'warn' | 'bad' | 'info'; title: string; detail: string }
export function insights(tenants: PortfolioTenant[], mv: Movement[], mt: Metrics, fmt: (n: number) => string, overdue: { amount: number; count: number }): Insight[] {
  const out: Insight[] = []; const last = MONTHS - 1; const cur = mv[mv.length - 1]; const prior = mv.slice(-4, -1)
  const avgOf = (f: (m: Movement) => number) => prior.reduce((n, m) => n + f(m), 0) / Math.max(1, prior.length)
  const delta = cur.closing - cur.opening
  out.push({ tone: delta >= 0 ? 'good' : 'bad', title: `MRR ${delta >= 0 ? 'grew' : 'fell'} ${Math.abs(mt.momPct).toFixed(1)}% to ${fmt(mt.mrr)}`, detail: `Net movement was ${delta >= 0 ? '+' : '-'}${fmt(Math.abs(delta))}: ${fmt(cur.newMrr)} new, ${fmt(cur.expansion)} expansion, ${fmt(cur.reactivation)} reactivation, ${fmt(-cur.contraction)} contraction, ${fmt(-cur.complimentary)} complimentary (waived, not lost) and ${fmt(-cur.churn)} churn.` })
  const exp = tenants.length < 2 ? undefined : tenants.map((t) => ({ t, d: t.series[last] - t.series[last - 1] })).filter((x) => x.t.series[last - 1] > 0 && x.d > 0).sort((a, b) => b.d - a.d)[0]
  if (exp) out.push({ tone: 'good', title: `${exp.t.name} expanded by ${fmt(exp.d)}`, detail: `They moved from ${fmt(exp.t.series[last - 1])} to ${fmt(exp.t.series[last])} a month, the largest upgrade this month.` })
  const lost = tenants.filter((t) => t.series[last] === 0 && t.series[last - 1] > 0 && !t.waived)
  if (lost.length) out.push({ tone: 'bad', title: `${lost.length} account${lost.length === 1 ? '' : 's'} churned, taking ${fmt(lost.reduce((n, t) => n + t.series[last - 1], 0))} of MRR`, detail: `${lost.map((t) => t.name).slice(0, 3).join(', ')}${lost.length > 3 ? ' and others' : ''}. The six-month average is ${(mt.logoChurnMonthly * 100).toFixed(1)}% of accounts a month.` })
  else out.push({ tone: 'good', title: 'No account churned this month', detail: `Typical monthly logo churn over the last six months is ${(mt.logoChurnMonthly * 100).toFixed(1)}%.` })
  const newAvg = avgOf((m) => m.newMrr)
  if (cur.newMrr < newAvg * 0.7 && newAvg > 0) out.push({ tone: 'warn', title: 'New business is below its recent pace', detail: `${fmt(cur.newMrr)} of new MRR against a three-month average of ${fmt(newAvg)}.` })
  else if (cur.newMrr > newAvg * 1.3 && cur.newMrr > 0) out.push({ tone: 'good', title: 'New business is ahead of its recent pace', detail: `${fmt(cur.newMrr)} of new MRR against a three-month average of ${fmt(newAvg)}.` })
  if (mt.atRiskCount) out.push({ tone: 'warn', title: `${fmt(mt.atRiskMrr)} of MRR sits with ${mt.atRiskCount} account${mt.atRiskCount === 1 ? '' : 's'} in payment trouble`, detail: 'They are past due, failed or in grace. Recovering them protects revenue that is still counted today. See Payment recovery.' })
  if (overdue.count) out.push({ tone: 'warn', title: `${overdue.count} invoice${overdue.count === 1 ? ' is' : 's are'} overdue for ${fmt(overdue.amount)}`, detail: 'Open the invoice ledger and filter by Overdue to send reminders or record payments.' })
  const c = concentration(tenants)
  if (c.rows.length > 1 && c.rows[0].share > 0.25) out.push({ tone: 'warn', title: `${c.rows[0].tenant.name} is ${(c.rows[0].share * 100).toFixed(0)}% of MRR`, detail: `The top ten accounts make up ${(c.top10Share * 100).toFixed(0)}%. Losing the largest account would cut MRR by ${fmt(c.rows[0].mrr)}.` })
  if (mt.payingAccounts < 3) { out.push({ tone: 'info', title: 'Insights appear as more companies subscribe', detail: `Retention, concentration and churn trends need at least three paying companies. ${mt.payingAccounts === 1 ? 'Today the portfolio is a single paying company, so the figures describe that account alone.' : 'Today the figures cover a very small portfolio.'}` }); return out }
  out.push({ tone: mt.nrr >= 100 ? 'good' : 'warn', title: `Net revenue retention is ${mt.nrr.toFixed(0)}% over six months`, detail: `Gross retention is ${mt.grr.toFixed(0)}%. ${mt.nrr >= 100 ? 'Expansion is outrunning churn and contraction.' : 'Churn and contraction are outrunning expansion.'}` })
  return out
}

export const isPaying = (t: PortfolioTenant) => PAYING.includes(t.sub.status)
export { hash }

/** Compact naira for charts and tiles: ₦1.2M, ₦480K. */
export const compactN = (n: number) => { const a = Math.abs(n); const v = a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}K` : String(Math.round(a)); return `${n < 0 ? '-' : ''}₦${v}` }
