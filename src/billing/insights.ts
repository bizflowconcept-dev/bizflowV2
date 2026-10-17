/* Subscription insights: pure derivations over the billing store (no side effects).
 * Anything that is modelled rather than read from the store (module activity telemetry, MRR history before the
 * store began tracking it, usage growth rates) is deterministic per subscription and flagged `modelled`. */
import {
  EMPLOYEE_TIERS, LIMIT_DEFS, MODULES, TODAY, addDays, addonFor, addonPrice, currencyOf, daysUntil, defaultCurrency, effectiveLimits, entitlements, fitsEmployees, fmtDate, iso, isCustom,
  minPlanFor, money, moduleById, moduleState, planById, planDiff, publicPlans, quote, quoteModules,
} from '../data/billing'
import { complimentaryLabel, convertedModulesFor, liveGrantsFor } from '../data/grants'
import type { BillingState, LimitKey, Plan, Subscription, SubStatus } from '../data/billing'
import type { Ticket } from '../platform/helpdesk'

/* ---------- helpers ---------- */
export const hash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
export const unit = (str: string) => (hash(str) % 10000) / 10000
export const slugOf = (sub: Subscription) => sub.id.replace(/^c-/, '')
const addMonthsTo = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }

export const PAYING: SubStatus[] = ['active', 'past_due', 'payment_failed', 'grace']
export const TROUBLED: SubStatus[] = ['past_due', 'payment_failed', 'grace']
export const ENDED: SubStatus[] = ['cancelled', 'expired']
export const recurring = (sub: Subscription) => (sub.cycle === 'annual' ? sub.net / 12 : sub.net)
/** Monthly recurring revenue counted today (trial, suspended and ended subscriptions contribute nothing). */
export const mrrOf = (sub: Subscription) => (PAYING.includes(sub.status) ? recurring(sub) : 0)
export const openTickets = (tickets: Ticket[], sub: Subscription) => tickets.filter((t) => t.slug === slugOf(sub) && t.status !== 'Resolved')

/* ---------- usage & forecast ---------- */
const GROWTH: Record<LimitKey, number> = { employees: 0.012, branches: 0.004, storageGb: 0.035, documents: 0.028, signatures: 0.045, leads: 0.03 }
export type UsageRow = { key: LimitKey; label: string; unitLabel: string; period?: string; used: number; limit: number | null; pct: number | null; growth: number; daysToLimit: number | null; status: 'ok' | 'warn' | 'hot' | 'over' | 'unlimited' }
export function usageRows(s: BillingState, sub: Subscription): UsageRow[] {
  const lim = effectiveLimits(s, sub, { grants: false })
  return LIMIT_DEFS.map((d) => {
    const used = d.key === 'employees' ? sub.employees : sub.usage[d.key]; const limit = lim[d.key]
    const growth = GROWTH[d.key] * (0.8 + unit(sub.id + d.key) * 0.5)
    const pct = limit ? (used / limit) * 100 : null
    let days: number | null = null
    if (limit && used > 0 && used < limit && growth > 0) { const d2 = (30 * Math.log(limit / used)) / Math.log(1 + growth); days = d2 > 730 ? null : Math.round(d2) }
    const status = limit === null ? 'unlimited' : used > limit ? 'over' : pct! >= 90 ? 'hot' : pct! >= 75 ? 'warn' : 'ok'
    return { key: d.key, label: d.label, unitLabel: d.unit, period: d.period, used, limit, pct, growth, daysToLimit: days, status }
  })
}

/* ---------- module adoption (modelled) ---------- */
const REAL_SIGNAL: Record<string, LimitKey> = { documents: 'documents', sign: 'signatures', crm: 'leads', branches: 'branches', people: 'employees' }
export type Adoption = { moduleId: string; name: string; kind: 'plan' | 'addon' | 'override'; source: string; lastActiveDays: number; active: boolean; level: number; real: boolean; foundation: boolean }
export function moduleAdoption(s: BillingState, sub: Subscription): Adoption[] {
  const ent = entitlements(s, sub, { grants: false })
  const out: Adoption[] = []
  for (const m of MODULES) {
    const st = moduleState(ent, m.id)
    if (!st.enabled || st.kind === 'none') continue
    const rate = s.modulePrices.find((r) => r.moduleId === m.id)
    const foundation = !!rate?.required || rate?.importance === 'Foundation'
    const sig = REAL_SIGNAL[m.id]; const u = unit(`${sub.id}:${m.id}`)
    let lastActiveDays: number; let level: number; let real = false
    if (sig && sub.usage[sig] > 0) { real = true; lastActiveDays = Math.floor(u * 3); level = Math.round(55 + u * 40) }
    else if (foundation) { lastActiveDays = Math.floor(u * 4); level = Math.round(60 + u * 35) }
    else if (u < 0.14) { lastActiveDays = 34 + Math.floor(u * 250); level = Math.round(u * 60) }
    else if (u < 0.3) { lastActiveDays = 9 + Math.floor(u * 50); level = Math.round(20 + u * 80) }
    else { lastActiveDays = Math.floor(u * 8); level = Math.round(40 + u * 55) }
    out.push({ moduleId: m.id, name: m.name, kind: st.kind as Adoption['kind'], source: st.source, lastActiveDays, active: lastActiveDays <= 30, level, real, foundation })
  }
  return out
}

/* ---------- health ---------- */
export type HealthBand = 'healthy' | 'watch' | 'risk'
export type Health = { score: number; band: HealthBand; label: string; factors: { label: string; score: number; max: number; note: string }[] }
export const HEALTH_META: Record<HealthBand, { label: string; text: string; bar: string; tone: string }> = {
  healthy: { label: 'Healthy', text: 'text-ok', bar: '#16a34a', tone: 'green' },
  watch: { label: 'Needs a look', text: 'text-[#9a6200]', bar: '#f59e0b', tone: 'amber' },
  risk: { label: 'At risk', text: 'text-err', bar: '#dc3e42', tone: 'red' },
}
export function healthOf(s: BillingState, sub: Subscription, tickets: Ticket[]): Health {
  const factors: Health['factors'] = []
  const pay: Record<SubStatus, number> = { active: 30, trial: 22, grace: 14, past_due: 10, payment_failed: 5, suspended: 0, cancelled: 0, expired: 0 }
  factors.push({ label: 'Payment standing', score: pay[sub.status], max: 30, note: sub.status === 'active' ? 'Paid up' : sub.status === 'trial' ? 'On trial' : sub.status.replace('_', ' ') })
  const emp = usageRows(s, sub)[0]
  const seatScore = emp.pct === null ? 20 : emp.pct > 100 ? 6 : emp.pct >= 95 ? 12 : emp.pct < 20 ? 8 : 20
  factors.push({ label: 'Seat utilisation', score: seatScore, max: 20, note: emp.pct === null ? 'Unlimited seats' : `${Math.round(emp.pct)}% of seats used` })
  const ad = moduleAdoption(s, sub); const activeShare = ad.length ? ad.filter((a) => a.active).length / ad.length : 1
  factors.push({ label: 'Module adoption', score: Math.round(activeShare * 30), max: 30, note: `${ad.filter((a) => a.active).length} of ${ad.length} modules active` })
  const open = openTickets(tickets, sub); const urgent = open.filter((t) => t.priority === 'Urgent' || t.priority === 'High').length
  factors.push({ label: 'Support load', score: Math.max(0, 10 - urgent * 3 - Math.max(0, open.length - urgent)), max: 10, note: open.length ? `${open.length} open, ${urgent} high priority` : 'No open tickets' })
  const d = daysUntil(sub.renewsAt)
  factors.push({ label: 'Renewal outlook', score: sub.status === 'cancelled' || sub.pendingChange ? 3 : d > 60 ? 10 : d > 30 ? 8 : 6, max: 10, note: sub.status === 'cancelled' ? 'Cancelled' : `Renews in ${d} days` })
  const score = Math.max(0, Math.min(100, factors.reduce((a, f) => a + f.score, 0)))
  const band: HealthBand = ['suspended', 'cancelled', 'expired', 'payment_failed'].includes(sub.status) || score < 60 ? 'risk' : score < 80 ? 'watch' : 'healthy'
  return { score, band, label: HEALTH_META[band].label, factors }
}

/* ---------- MRR history (modelled before the store tracked it) ---------- */
export type MrrPoint = { key: string; label: string; mrr: number; newMrr: number; expansion: number; contraction: number; churn: number }
const monthLabel = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' })
export function mrrHistory(sub: Subscription, months = 12): MrrPoint[] {
  const basis = recurring(sub); const started = new Date(sub.startedAt)
  const thisMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1)
  const starts = Array.from({ length: months }, (_, i) => addMonthsTo(thisMonth, i - (months - 1)))
  const found = starts.findIndex((m) => addMonthsTo(m, 1) > started)
  const firstIdx = found < 0 ? months - 1 : found
  const span = Math.max(1, months - 1 - firstIdx)
  const pts: MrrPoint[] = []; let prev = 0
  starts.forEach((m, i) => {
    let mrr = 0
    if (sub.status !== 'trial' && i >= firstIdx) {
      const ramp = 1 - 0.24 * Math.pow(1 - (i - firstIdx) / span, 1.6)
      mrr = Math.round((basis * ramp) / 1000) * 1000
      if (i === months - 1) mrr = Math.round(mrrOf(sub))
      else if (i === months - 2) mrr = Math.round(basis)
    }
    const d = mrr - prev
    pts.push({ key: iso(m), label: monthLabel(m), mrr, newMrr: prev === 0 && mrr > 0 ? mrr : 0, expansion: prev > 0 && d > 0 ? d : 0, contraction: prev > 0 && mrr > 0 && d < 0 ? d : 0, churn: prev > 0 && mrr === 0 ? -prev : 0 })
    prev = mrr
  })
  return pts
}

/* ---------- portfolio ---------- */
export type RowInsight = { sub: Subscription; plan?: Plan; mrr: number; health: Health; seatPct: number | null; storagePct: number | null; signPct: number | null; days: number; open: number }
const pctOf = (r: UsageRow) => (r.pct === null ? null : Math.round(r.pct))
export function rowInsights(s: BillingState, tickets: Ticket[]): RowInsight[] {
  return s.subs.map((sub) => {
    const u = usageRows(s, sub)
    return { sub, plan: planById(s, sub.planId), mrr: mrrOf(sub), health: healthOf(s, sub, tickets), seatPct: pctOf(u.find((x) => x.key === 'employees')!), storagePct: pctOf(u.find((x) => x.key === 'storageGb')!), signPct: pctOf(u.find((x) => x.key === 'signatures')!), days: sub.status === 'cancelled' && sub.endsAt ? daysUntil(sub.endsAt) : daysUntil(sub.status === 'trial' && sub.trialEndsAt ? sub.trialEndsAt : sub.renewsAt), open: openTickets(tickets, sub).length }
  })
}
export type Portfolio = {
  currency: string; mrr: number; arr: number; counts: Record<string, number>; nrr: number | null; arpa: number | null; trialsConverting: number; renewals30: number; renewals30Value: number
  atRisk: number; atRiskValue: number; history: MrrPoint[]; planMix: { id: string; name: string; count: number; mrr: number }[]; otherCurrency: number; mrrDelta: number | null
}
export function portfolio(s: BillingState, rows: RowInsight[]): Portfolio {
  const currency = defaultCurrency(s)
  const inCur = rows.filter((r) => r.sub.currency === currency)
  const counts: Record<string, number> = { all: rows.length, active: 0, trial: 0, past_due: 0, suspended: 0, ended: 0 }
  for (const r of rows) { const st = r.sub.status; if (st === 'active') counts.active++; else if (st === 'trial') counts.trial++; else if (TROUBLED.includes(st)) counts.past_due++; else if (st === 'suspended') counts.suspended++; else counts.ended++ }
  const mrr = inCur.reduce((a, r) => a + r.mrr, 0)
  const hist = inCur.map((r) => mrrHistory(r.sub))
  const history: MrrPoint[] = Array.from({ length: 12 }, (_, i) => hist.reduce<MrrPoint>((acc, h) => ({ ...acc, mrr: acc.mrr + h[i].mrr, newMrr: acc.newMrr + h[i].newMrr, expansion: acc.expansion + h[i].expansion, contraction: acc.contraction + h[i].contraction, churn: acc.churn + h[i].churn }), { key: hist[0]?.[i].key ?? String(i), label: hist[0]?.[i].label ?? '', mrr: 0, newMrr: 0, expansion: 0, contraction: 0, churn: 0 }))
  const cohortThen = hist.reduce((a, h) => a + (h[5]?.mrr ?? 0), 0); const cohortNow = inCur.reduce((a, r, i) => a + ((hist[i][5]?.mrr ?? 0) > 0 ? r.mrr : 0), 0)
  const paying = inCur.filter((r) => r.mrr > 0)
  const month = TODAY.getMonth()
  const conv = rows.filter((r) => r.sub.status === 'trial' && r.sub.trialEndsAt && new Date(r.sub.trialEndsAt).getMonth() === month && new Date(r.sub.trialEndsAt) >= TODAY)
  const ren = rows.filter((r) => r.sub.status === 'active' && r.days >= 0 && r.days <= 30)
  const risk = rows.filter((r) => r.health.band === 'risk' || TROUBLED.includes(r.sub.status))
  const mix = new Map<string, { id: string; name: string; count: number; mrr: number }>()
  for (const r of rows) { if (ENDED.includes(r.sub.status)) continue; const id = r.sub.customFeatures ? 'custom' : r.sub.planId; const cur = mix.get(id) ?? { id, name: r.sub.customFeatures ? 'Custom contract' : r.plan?.name ?? id, count: 0, mrr: 0 }; cur.count++; if (r.sub.currency === currency) cur.mrr += r.mrr; mix.set(id, cur) }
  const prevMrr = history[10]?.mrr
  return {
    currency, mrr, arr: mrr * 12, counts, nrr: cohortThen > 0 ? (cohortNow / cohortThen) * 100 : null, arpa: paying.length ? mrr / paying.length : null,
    trialsConverting: conv.length, renewals30: ren.length, renewals30Value: ren.reduce((a, r) => a + (r.sub.currency === currency ? r.sub.net : 0), 0), atRisk: risk.length, atRiskValue: risk.reduce((a, r) => a + (r.sub.currency === currency ? r.sub.cycle === 'annual' ? r.sub.net / 12 : r.sub.net : 0), 0),
    history, planMix: [...mix.values()].sort((a, b) => b.mrr - a.mrr), otherCurrency: rows.length - inCur.length, mrrDelta: prevMrr ? ((mrr - prevMrr) / prevMrr) * 100 : null,
  }
}

/* ---------- upcoming invoice & dunning ---------- */
export type Invoice = { date: string; lines: { label: string; detail?: string; amount: number }[]; subtotal: number; discount: number; tax: number; taxLabel: string; taxRate: number; total: number; credit: number; due: number; currency: string; source: 'quote' | 'contract'; drift: number }
export function upcomingInvoice(s: BillingState, sub: Subscription): Invoice | null {
  if (sub.status === 'cancelled' || sub.status === 'expired' || sub.status === 'suspended') return null
  const cur = currencyOf(s, sub.currency); const date = sub.status === 'trial' && sub.trialEndsAt ? sub.trialEndsAt : sub.renewsAt
  const plan = planById(s, sub.planId)
  const q = !sub.customFeatures && plan && !isCustom(plan) ? quote(s, { planId: sub.planId, cycle: sub.cycle, currency: sub.currency, employees: sub.employees, addonIds: sub.addons, coupon: sub.coupon, isNew: false, subId: sub.id, on: date }) : null
  let lines: Invoice['lines']; let subtotal: number; let discount = 0; let tax: number; let total: number; let taxLabel: string; let taxRate: number; const source: Invoice['source'] = q?.ok ? 'quote' : 'contract'
  if (q?.ok) { lines = q.lines.map((l) => ({ label: l.label, detail: l.complimentary ?? l.detail, amount: l.amount })); subtotal = q.subtotal; discount = q.discount; tax = q.tax; total = q.total; taxLabel = q.taxLabel; taxRate = q.taxRate }
  else {
    subtotal = sub.net; lines = [{ label: sub.customFeatures ? 'Custom contract' : `${plan?.name ?? 'Subscription'} contract`, detail: `${sub.employees.toLocaleString()} employees · ${sub.cycle}`, amount: sub.net }]
    taxRate = cur?.tax.applies ? cur.tax.rate : 0; taxLabel = cur?.tax.applies ? cur.tax.label : ''
    const incl = !!cur?.tax.applies && cur.tax.inclusive
    tax = incl ? sub.net - sub.net / (1 + taxRate / 100) : (sub.net * taxRate) / 100; total = incl ? sub.net : sub.net + tax
    /* A complimentary whole-plan grant that is live on the invoice date waives the contract fee (nothing goes below zero). */
    const free = liveGrantsFor(sub.id, date).find((g) => g.scope.planId)
    if (free) { lines = [{ ...lines[0], detail: complimentaryLabel(free) }]; discount = subtotal; tax = 0; total = 0 }
  }
  /* Modules kept after a complimentary period ended are billed at the normal price. */
  const kept = convertedModulesFor(sub.id)
  if (kept.length) {
    const mq = quoteModules(s, { moduleIds: kept, employees: sub.employees, currency: sub.currency, cycle: sub.cycle })
    const extra = mq.ok ? mq.lines.filter((l) => kept.includes(l.moduleId)).reduce((a, l) => a + l.amount, 0) : 0
    if (extra > 0) {
      mq.lines.filter((l) => kept.includes(l.moduleId)).forEach((l) => lines.push({ label: l.label, detail: 'Kept after a complimentary period', amount: l.amount }))
      const incl = !!cur?.tax.applies && cur.tax.inclusive
      subtotal += extra; total += incl ? extra : extra * (1 + taxRate / 100); tax += incl ? extra - extra / (1 + taxRate / 100) : (extra * taxRate) / 100
    }
  }
  const credit = Math.min(sub.credit, total)
  return { date, lines, subtotal, discount, tax, taxLabel, taxRate, total, credit, due: total - credit, currency: sub.currency, source, drift: q?.ok ? Math.round(sub.net - q.subtotal) : 0 }
}
export type DunningStep = { label: string; at: string; state: 'done' | 'current' | 'pending' }
export function dunning(s: BillingState, sub: Subscription): { active: boolean; steps: DunningStep[]; failed: number; note: string } {
  const fails = s.payments.filter((p) => p.subId === sub.id && p.status === 'failed').sort((a, b) => b.at.localeCompare(a.at))
  const troubled = TROUBLED.includes(sub.status) || sub.status === 'suspended'
  if (!troubled) return { active: false, steps: [], failed: fails.length, note: fails.length ? `${fails.length} earlier failed attempt${fails.length > 1 ? 's' : ''}, since recovered.` : 'No failed payments. Dunning is not running.' }
  const t0 = fails[0] ? new Date(fails[0].at) : TODAY
  const plan: [string, number][] = [['First retry', 1], ['Second retry and reminder email', 3], ['Final retry', 6], ['Grace period ends', 10], ['Access suspended', 14]]
  let current = plan.findIndex(([, d]) => addDays(t0, d) > TODAY); if (current < 0) current = plan.length
  if (sub.status === 'suspended') current = plan.length
  const steps = plan.map(([label, d], i) => ({ label, at: iso(addDays(t0, d)), state: (i < current ? 'done' : i === current ? 'current' : 'pending') as DunningStep['state'] }))
  return { active: true, steps, failed: fails.length, note: sub.status === 'suspended' ? 'Dunning exhausted. Access is suspended until payment or reactivation.' : `${fails.length || 1} failed attempt${fails.length > 1 ? 's' : ''}. Automatic retries continue on the schedule below.` }
}

/* ---------- lifecycle timeline ---------- */
export type TimelineEvent = { at: string; title: string; detail?: string; kind: 'start' | 'payment' | 'fail' | 'audit' | 'future' | 'status'; future?: boolean }
export function lifecycle(s: BillingState, sub: Subscription, includeAudit: boolean): TimelineEvent[] {
  const ev: TimelineEvent[] = [{ at: sub.startedAt, title: sub.trialEndsAt && sub.status === 'trial' ? 'Trial started' : 'Subscription started', detail: `${planById(s, sub.planId)?.name ?? sub.planId} · ${sub.cycle} · ${sub.currency}`, kind: 'start' }]
  for (const p of s.payments.filter((x) => x.subId === sub.id)) ev.push({ at: p.at, title: p.status === 'successful' ? 'Payment received' : p.status === 'failed' ? 'Payment failed' : 'Payment refunded', detail: `${money(p.amount, p.currency, { trim: true, s })} · ${p.description}`, kind: p.status === 'failed' ? 'fail' : 'payment' })
  if (includeAudit) for (const a of s.audit.filter((x) => x.company === sub.company)) ev.push({ at: a.at.slice(0, 10), title: a.action, detail: a.prev !== a.next ? `${a.prev} → ${a.next}` : undefined, kind: 'audit' })
  if (sub.pendingChange) ev.push({ at: sub.pendingChange.effectiveAt, title: `Scheduled move to ${planById(s, sub.pendingChange.planId)?.name}`, kind: 'future', future: true })
  if (sub.status === 'trial' && sub.trialEndsAt) ev.push({ at: sub.trialEndsAt, title: 'Trial ends, first invoice', kind: 'future', future: true })
  else if (sub.status === 'cancelled' && sub.endsAt) ev.push({ at: sub.endsAt, title: 'Access ends', kind: 'future', future: true })
  else if (PAYING.includes(sub.status)) ev.push({ at: sub.renewsAt, title: 'Next renewal', detail: `${sub.cycle} renewal`, kind: 'future', future: true })
  return ev.sort((a, b) => b.at.localeCompare(a.at))
}

/* ---------- what-if ---------- */
export type PlanWhatIf = { plan: Plan; current: boolean; fits: boolean; custom: boolean; monthly: number | null; delta: number | null; gained: string[]; lost: string[]; direction: 'up' | 'down' | 'same' }
export function planWhatIf(s: BillingState, sub: Subscription): PlanWhatIf[] {
  const cur = planById(s, sub.planId); const base = recurring(sub)
  return s.plans.filter((p) => p.status === 'active' && (p.visible || p.id === sub.planId)).sort((a, b) => a.order - b.order).map((plan) => {
    const custom = isCustom(plan); const current = plan.id === sub.planId && !sub.customFeatures
    const q = custom ? null : quote(s, { planId: plan.id, cycle: sub.cycle, currency: sub.currency, employees: sub.employees, addonIds: sub.addons, isNew: false })
    const monthly = custom ? (current ? base : null) : q?.ok ? q.perMonthEquivalent : null
    const diff = cur ? planDiff(cur, plan) : { gained: [], lost: [] }
    return { plan, current, fits: fitsEmployees(plan, sub.employees), custom, monthly, delta: monthly === null ? null : monthly - base, gained: diff.gained.map((m) => m.name), lost: diff.lost.map((m) => m.name), direction: !cur || plan.order === cur.order ? 'same' : plan.order > cur.order ? 'up' : 'down' }
  })
}
export const bandPrice = (rate: BillingState['modulePrices'][number], employees: number, currency: string, cycle: 'monthly' | 'annual'): number | null => {
  const band = rate.bands.find((b) => employees >= b.minEmployees && (b.maxEmployees === null || employees <= b.maxEmployees))
  return band && !band.custom ? band.prices[currency]?.[cycle] ?? null : null
}
export type ModuleWhatIf = { moduleId: string; name: string; importance: string; route: string; monthly: number | null; planId?: string }
export function moduleWhatIf(s: BillingState, sub: Subscription): ModuleWhatIf[] {
  const ent = entitlements(s, sub, { grants: false }); const out: ModuleWhatIf[] = []
  for (const rate of s.modulePrices) {
    if (!rate.active || moduleState(ent, rate.moduleId).enabled) continue
    const mod = moduleById(rate.moduleId); if (!mod) continue
    const addon = addonFor(s, rate.moduleId, sub.planId); const addonCost = addon ? addonPrice(addon, sub.currency, sub.cycle) : null
    const minPlan = minPlanFor(s, rate.moduleId)
    const listPrice = bandPrice(rate, sub.employees, sub.currency, sub.cycle)
    const toMonthly = (v: number) => (sub.cycle === 'annual' ? v / 12 : v)
    if (addon && addonCost !== null) out.push({ moduleId: rate.moduleId, name: mod.name, importance: rate.importance, route: `Add-on: ${addon.name}`, monthly: toMonthly(addonCost) })
    else out.push({ moduleId: rate.moduleId, name: mod.name, importance: rate.importance, route: minPlan ? `Included from ${minPlan.name}` : 'Admin override only', monthly: listPrice === null ? null : toMonthly(listPrice), planId: minPlan?.id })
  }
  return out
}

/* ---------- recommendations ---------- */
export type Rec = { id: string; severity: 'critical' | 'warn' | 'info' | 'good'; title: string; detail: string; uplift?: string; action?: { label: string; kind: 'plan' | 'tab' | 'credit'; arg?: string } }
const SEV: Record<Rec['severity'], number> = { critical: 0, warn: 1, info: 2, good: 3 }
export function recommendations(s: BillingState, sub: Subscription, tickets: Ticket[]): Rec[] {
  const recs: Rec[] = []; const plan = planById(s, sub.planId); const rows = usageRows(s, sub); const ad = moduleAdoption(s, sub); const fm = (n: number) => money(Math.round(n), sub.currency, { trim: true, s })
  const d = daysUntil(sub.renewsAt); const base = recurring(sub)
  if (TROUBLED.includes(sub.status)) recs.push({ id: 'pay', severity: 'critical', title: 'Payment needs recovery', detail: `Status is ${sub.status.replace('_', ' ')}. ${fm(base)}/mo of recurring revenue is exposed. Contact the billing owner before access is suspended.`, action: { label: 'Open billing', kind: 'tab', arg: 'Billing' } })
  if (sub.status === 'suspended') recs.push({ id: 'susp', severity: 'critical', title: 'Workspace is suspended', detail: 'Users cannot sign in. Reactivate once payment is confirmed, or record why access should stay closed.' })
  const seat = rows.find((r) => r.key === 'employees')!
  if (seat.pct !== null && seat.pct >= 85) {
    const next = publicPlans(s).filter((p) => !isCustom(p) && plan && p.order > plan.order && (p.limits.employees === null || p.limits.employees > sub.employees)).map((p) => ({ p, q: quote(s, { planId: p.id, cycle: sub.cycle, currency: sub.currency, employees: sub.employees, addonIds: sub.addons, isNew: false }) })).find((x) => x.q.ok)
    recs.push({ id: 'seats', severity: seat.pct >= 95 ? 'critical' : 'warn', title: `${Math.round(seat.pct)}% of employee seats used`, detail: next ? `Recommend the ${next.p.name} plan (up to ${next.p.limits.employees?.toLocaleString() ?? 'unlimited'} employees).` : 'Consider a custom Enterprise agreement for more headroom.', uplift: next ? `${next.q.perMonthEquivalent - base >= 0 ? '+' : '-'}${fm(Math.abs(next.q.perMonthEquivalent - base))}/mo` : undefined, action: next ? { label: `Move to ${next.p.name}`, kind: 'plan', arg: next.p.id } : undefined })
  }
  for (const r of rows) {
    if (r.key === 'employees' || r.limit === null || r.pct === null || r.pct < 80) continue
    const boost = s.addons.find((a) => a.active && a.plans.includes(sub.planId) && (a.limitBoosts[r.key] ?? 0) > 0); const price = boost ? addonPrice(boost, sub.currency, sub.cycle) : null
    recs.push({ id: `lim-${r.key}`, severity: r.pct >= 95 ? 'critical' : 'warn', title: `${r.label} at ${Math.round(r.pct)}% of limit`, detail: `${r.daysToLimit !== null ? `Projected to run out in about ${r.daysToLimit} days at the current pace. ` : ''}${boost ? `The ${boost.name} add-on raises the cap.` : 'Upgrade the plan or enable an override.'}`, uplift: price !== null ? `+${fm(sub.cycle === 'annual' ? price / 12 : price)}/mo` : undefined, action: { label: 'Review limits', kind: 'tab', arg: 'Usage & limits' } })
  }
  const idle = ad.filter((a) => !a.active && !a.foundation).sort((a, b) => b.lastActiveDays - a.lastActiveDays)
  idle.slice(0, 2).forEach((a) => recs.push({ id: `idle-${a.moduleId}`, severity: 'warn', title: `No ${a.name} usage in ${Math.min(a.lastActiveDays, 90)}${a.lastActiveDays > 90 ? '+' : ''} days`, detail: `${a.name} is ${a.kind === 'plan' ? 'part of the plan' : a.kind === 'addon' ? 'a paid add-on' : 'enabled by override'} but unused. Low adoption is an early churn signal; schedule an enablement session.`, action: { label: 'See adoption', kind: 'tab', arg: 'Usage & limits' } }))
  if (idle.length > 2) recs.push({ id: 'idle-more', severity: 'info', title: `${idle.length - 2} more modules are idle`, detail: idle.slice(2).map((a) => a.name).join(', ') + '.' })
  if (sub.status === 'trial' && sub.trialEndsAt) recs.push({ id: 'trial', severity: daysUntil(sub.trialEndsAt) <= 7 ? 'warn' : 'info', title: `Trial ends in ${daysUntil(sub.trialEndsAt)} days`, detail: 'Nudge the admin to choose a plan, or extend the trial if activation is in progress.', action: { label: 'Review plans', kind: 'tab', arg: 'Modules & add-ons' } })
  else if (PAYING.includes(sub.status)) {
    if (d >= 0 && d <= 30) recs.push({ id: 'renew', severity: 'warn', title: `${sub.cycle === 'annual' ? 'Annual' : 'Monthly'} renewal in ${d} days`, detail: `${fm(sub.net)} renews on ${fmtDate(sub.renewsAt)}. Confirm the payment method and send the renewal reminder.`, action: { label: 'Open billing', kind: 'tab', arg: 'Billing' } })
    else if (d > 30 && d <= 90) recs.push({ id: 'renew', severity: 'info', title: `Renewal in ${d} days`, detail: `Plan a business review before ${fmtDate(sub.renewsAt)} to protect ${fm(sub.net)}.` })
  }
  const open = openTickets(tickets, sub); const hot = open.filter((t) => t.priority === 'Urgent' || t.priority === 'High')
  if (hot.length) recs.push({ id: 'tickets', severity: 'warn', title: `${hot.length} high-priority ticket${hot.length > 1 ? 's' : ''} open`, detail: hot.map((t) => `${t.id} ${t.subject}`).join('; ') + '.', action: { label: 'See support', kind: 'tab', arg: 'Support' } })
  const tier = EMPLOYEE_TIERS.find((t) => t >= sub.employees)
  if (tier && tier - sub.employees <= Math.max(5, tier * 0.05) && sub.employees < tier) recs.push({ id: 'tier', severity: 'info', title: `${tier - sub.employees} employees from the ${tier}-employee tier boundary`, detail: 'Headcount growth will move this company into the next pricing band. Raise it before the next renewal quote.' })
  if (sub.credit > 0) recs.push({ id: 'credit', severity: 'info', title: `${fm(sub.credit)} credit on account`, detail: 'It will be applied to the next invoice automatically.' })
  if (sub.pendingChange) recs.push({ id: 'pending', severity: 'info', title: `Plan change to ${planById(s, sub.pendingChange.planId)?.name} is scheduled`, detail: `Takes effect ${fmtDate(sub.pendingChange.effectiveAt)}.` })
  if (sub.card) { const [mm, yy] = sub.card.exp.split('/').map(Number); const exp = new Date(2000 + yy, mm, 0); const left = Math.ceil((exp.getTime() - TODAY.getTime()) / 86400000); if (left < 90) recs.push({ id: 'card', severity: left < 0 ? 'critical' : 'warn', title: left < 0 ? 'Card on file has expired' : `Card expires in ${left} days`, detail: `${sub.card.brand} ending ${sub.card.last4}. Ask the billing contact to update it.` }) }
  else if (PAYING.includes(sub.status) || sub.status === 'trial') recs.push({ id: 'nocard', severity: 'warn', title: 'No payment method on file', detail: 'Renewal cannot be collected automatically.' })
  const missing = moduleWhatIf(s, sub).filter((m) => m.monthly !== null && m.importance !== 'Specialist').sort((a, b) => (a.importance === 'Recommended' ? 0 : 1) - (b.importance === 'Recommended' ? 0 : 1))[0]
  if (missing && PAYING.includes(sub.status)) recs.push({ id: 'upsell', severity: 'info', title: `Opportunity: ${missing.name}`, detail: `${missing.route}. Customers on ${plan?.name ?? 'this plan'} with a similar profile often add it.`, uplift: `+${fm(missing.monthly!)}/mo`, action: { label: 'See options', kind: 'tab', arg: 'Modules & add-ons' } })
  if (!recs.some((r) => r.severity === 'critical' || r.severity === 'warn')) recs.push({ id: 'good', severity: 'good', title: 'Account is in good standing', detail: `Payments are current, ${ad.filter((a) => a.active).length} of ${ad.length} modules are active and limits have headroom.` })
  return recs.sort((a, b) => SEV[a.severity] - SEV[b.severity])
}
