import { useSyncExternalStore } from 'react'
import {
  FX_REFERENCE, TODAY, addonFits, addonPrice, depsOf, entitlements, fmtDate, getBilling, iso, moduleById, moduleKeys, planById, quoteModules, subActions,
} from './billing'
import type { BillingState, Subscription } from './billing'
import { healthOf } from '../billing/insights'
import type { HealthBand } from '../billing/insights'
import type { Ticket } from '../platform/helpdesk'
import { postNotification } from '../notifications/store'
import { recordAudit } from '../tenant/store'

/* =====================================================================
   Complimentary access / free periods
   A grant gives tenants modules, add-ons and/or a whole plan for a period without charge.
   - Entitlement overlay: billing.ts consults liveGrantsFor() so a tenant with a live grant really gets the features
     and loses them the moment the grant ends or is revoked.
   - Pricing: granted lines are 100% discounted and labelled "Complimentary until <date>" BEFORE coupons apply,
     so a coupon only ever touches the remaining paid lines and nothing goes below zero.
   - Expiry is a pure function of (store, billing, date): settle() runs on load, never on a timer. It moves grants
     Scheduled -> Active -> Ended and records the configured conversion; syncGrants() then performs the side effects
     (billing changes, tenant notices, audit entries) exactly once, using persisted flags.
   - Grants never change a subscription's health inputs: insights.ts reads entitlements with { grants: false }.
   ===================================================================== */

export type GrantStatus = 'Draft' | 'Scheduled' | 'Active' | 'Ended' | 'Revoked'
export type Conversion = 'auto_bill' | 'revert' | 'tenant_action'
export type NotifyMode = 'tenant' | 'internal'
export type Approval = 'none' | 'not_required' | 'pending' | 'approved' | 'rejected'
export type Scope = { modules: string[]; addons: string[]; planId?: string }
export type Audience =
  | { kind: 'all' }
  | { kind: 'selected'; subIds: string[] }
  | { kind: 'plan'; planIds: string[] }
  | { kind: 'health'; bands: HealthBand[] }
export type OutcomeResult = 'converted' | 'reverted' | 'awaiting' | 'lapsed' | 'revoked'
export type Outcome = { subId: string; result: OutcomeResult; at: string; note: string; previousPlanId: string; convertedModules?: string[]; applied: boolean }
export type GrantLog = { at: string; by: string; text: string; tenants?: boolean }
export type Grant = {
  id: string; name: string; reason: string; scope: Scope; audience: Audience
  startsAt: string; endsAt?: string; durationDays?: number
  conversion: Conversion; notify: NotifyMode
  status: GrantStatus; approval: Approval
  createdBy: string; createdAt: string; approvedBy?: string; approvedAt?: string
  /** Estimated revenue forgone over the whole period (NGN) and per month (NGN), for the targeted tenants. */
  forecast: number; mrr: number
  targets: string[]; outcomes: Outcome[]
  log: GrantLog[]; audited: number
  sent: { start?: boolean; ending?: boolean; end?: boolean; revoke?: boolean }
  revoked?: { by: string; at: string; reason: string }
  pendingExtension?: { to: string; reason: string; by: string; at: string; extra: number }
}
export type GrantsState = { version: 1; config: { approvalThresholdNgn: number }; grants: Grant[] }
export type GrantInput = {
  name: string; reason: string; scope: Scope; audience: Audience; startsAt: string; endsAt?: string; durationDays?: number
  conversion: Conversion; notify: NotifyMode
}

export const CONVERSIONS: { id: Conversion; name: string; hint: string }[] = [
  { id: 'auto_bill', name: 'Bill automatically at the normal price', hint: 'The tenant keeps everything the grant covered and is billed the list price from the end date.' },
  { id: 'revert', name: 'Revert to the previous plan', hint: 'Access ends on the end date and the tenant stays on the plan it had before.' },
  { id: 'tenant_action', name: 'Needs the tenant to choose', hint: 'Access ends on the end date. The tenant is asked to keep it (billed at the normal price) or let it lapse.' },
]
export const CONVERSION_LABEL: Record<Conversion, string> = { auto_bill: 'Auto-bill at normal price', revert: 'Revert to previous plan', tenant_action: 'Tenant chooses' }
export const OUTCOME_LABEL: Record<OutcomeResult, string> = { converted: 'Converted to paid', reverted: 'Reverted', awaiting: 'Awaiting tenant', lapsed: 'Lapsed', revoked: 'Revoked' }
export const DEFAULT_THRESHOLD = 500000

/* ---------- dates (ISO yyyy-mm-dd, pure) ---------- */
export const todayIso = () => iso(TODAY)
export const shift = (d: string, n: number) => new Date(Date.parse(d.slice(0, 10)) + n * 864e5).toISOString().slice(0, 10)
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 864e5)
const stamp = (d = todayIso()) => `${d}T${new Date().toISOString().slice(11, 16)}`

/* ---------- money (NGN is the reporting currency) ---------- */
export const toNgn = (n: number, cur: string) => n * (FX_REFERENCE[cur] ?? 1)
const monthly = (n: number, sub: Subscription) => (sub.cycle === 'annual' ? n / 12 : n)
export const ngn = (n: number) => `₦${Math.round(n).toLocaleString('en-US')}`

/** Monthly value (NGN) of the items a scope covers for one subscription, at list price. */
export function monthlyValue(b: BillingState, sub: Subscription, scope: Scope): number {
  let total = 0
  const planFeatures = scope.planId ? planById(b, scope.planId)?.features ?? [] : []
  if (scope.planId) total += toNgn(monthly(sub.net, sub), sub.currency)
  for (const id of scope.addons) {
    const a = b.addons.find((x) => x.id === id); if (!a) continue
    const p = addonPrice(a, sub.currency, sub.cycle); if (p !== null) total += toNgn(monthly(p, sub), sub.currency)
  }
  const base = entitlements(b, sub, { grants: false })
  const ids = scope.modules.filter((m) => moduleKeys(m).some((k) => !base[k]?.enabled) && !moduleKeys(m).every((k) => planFeatures.includes(k)))
  if (ids.length) {
    const q = quoteModules(b, { moduleIds: ids, employees: sub.employees, currency: sub.currency, cycle: sub.cycle })
    if (q.ok) total += toNgn(monthly(q.lines.filter((l) => ids.includes(l.moduleId)).reduce((a, l) => a + l.amount, 0), sub), sub.currency)
  }
  return total
}
export function periodDays(i: { startsAt: string; endsAt?: string; durationDays?: number }) {
  return Math.max(1, i.endsAt ? dayDiff(i.startsAt, i.endsAt) : i.durationDays ?? 30)
}
export const forecastOf = (mrr: number, days: number) => Math.round((mrr * days) / 30.4375)

/* ---------- audience ---------- */
const ELIGIBLE = ['trial', 'active', 'past_due', 'payment_failed', 'grace']
export function resolveAudience(b: BillingState, a: Audience, tickets: Ticket[] = []): Subscription[] {
  const pool = b.subs.filter((s) => ELIGIBLE.includes(s.status))
  if (a.kind === 'all') return pool
  if (a.kind === 'selected') return pool.filter((s) => a.subIds.includes(s.id))
  if (a.kind === 'plan') return pool.filter((s) => a.planIds.includes(s.planId))
  return pool.filter((s) => a.bands.includes(healthOf(b, s, tickets).band))
}
export const describeAudience = (a: Audience, b?: BillingState) =>
  a.kind === 'all' ? 'All tenants'
    : a.kind === 'selected' ? `${a.subIds.length} selected tenant${a.subIds.length === 1 ? '' : 's'}`
      : a.kind === 'plan' ? `Plan: ${a.planIds.map((id) => (b ? planById(b, id)?.name : undefined) ?? id).join(', ') || 'none'}`
        : `Health: ${a.bands.map((x) => (x === 'risk' ? 'At risk' : x === 'watch' ? 'Needs a look' : 'Healthy')).join(', ') || 'none'}`
export const describeScope = (s: Scope, b?: BillingState) => {
  const parts: string[] = []
  if (s.planId) parts.push(`${(b ? planById(b, s.planId)?.name : undefined) ?? s.planId} plan (whole)`)
  if (s.modules.length) parts.push(`${s.modules.length} module${s.modules.length === 1 ? '' : 's'}: ${s.modules.map((m) => moduleById(m)?.name ?? m).join(', ')}`)
  if (s.addons.length) parts.push(`${s.addons.length} add-on${s.addons.length === 1 ? '' : 's'}: ${s.addons.map((a) => b?.addons.find((x) => x.id === a)?.name ?? a).join(', ')}`)
  return parts.join(' · ') || 'Nothing selected'
}

export type Preview = { subs: Subscription[]; count: number; mrr: number; forecast: number; days: number; rows: { sub: Subscription; mrr: number }[]; needsApproval: boolean }
export function previewGrant(b: BillingState, i: GrantInput, threshold: number, tickets: Ticket[] = []): Preview {
  const subs = resolveAudience(b, i.audience, tickets)
  const rows = subs.map((sub) => ({ sub, mrr: monthlyValue(b, sub, i.scope) }))
  const mrr = rows.reduce((a, r) => a + r.mrr, 0); const days = periodDays(i); const forecast = forecastOf(mrr, days)
  return { subs, count: subs.length, mrr, forecast, days, rows, needsApproval: forecast > threshold }
}

/* ---------- seed ---------- */
const slugOfId = (id: string) => id.replace(/^c-/, '')
const ADAEZE = 'Adaeze Nwankwo (Billing Manager)'
const seed = (): GrantsState => {
  const b = getBilling(); const t = todayIso(); const d = (n: number) => shift(t, n)
  const sub = b.subs.find((s) => s.id === 'c-etranzact')
  const val = (scope: Scope) => (sub ? monthlyValue(b, sub, scope) : 0)
  const mk = (g: Partial<Grant> & Pick<Grant, 'id' | 'name' | 'reason' | 'scope' | 'startsAt' | 'conversion' | 'status'>): Grant => {
    const mrr = val(g.scope); const days = periodDays(g)
    return { audience: { kind: 'selected', subIds: ['c-etranzact'] }, notify: 'tenant', approval: 'not_required', createdBy: ADAEZE, createdAt: stamp(shift(g.startsAt, -5)), forecast: forecastOf(mrr, days), mrr,
      targets: [], outcomes: [], log: [{ at: stamp(shift(g.startsAt, -5)), by: ADAEZE, text: 'Grant created' }], audited: 1, sent: {}, ...g }
  }
  const ended = (id: string, name: string, reason: string, scope: Scope, from: number, to: number, conversion: Conversion, result: OutcomeResult, extra: Partial<Outcome> = {}) => mk({
    id, name, reason, scope, startsAt: d(from), endsAt: d(to), conversion, status: 'Ended', targets: ['c-etranzact'], approvedBy: 'Folake Bankole', sent: { start: true, ending: true, end: true },
    outcomes: [{ subId: 'c-etranzact', result, at: d(to), note: OUTCOME_LABEL[result], previousPlanId: 'enterprise', applied: true, ...extra }],
    log: [{ at: stamp(d(from - 5)), by: ADAEZE, text: 'Grant created' }, { at: stamp(d(from)), by: 'System', text: 'Activated' }, { at: stamp(d(to)), by: 'System', text: `Ended: ${OUTCOME_LABEL[result]}`, tenants: true }],
  })
  return {
    version: 1, config: { approvalThresholdNgn: DEFAULT_THRESHOLD },
    grants: [
      mk({ id: 'GR-1006', name: 'Renewal goodwill: 30 days of the Enterprise fee', reason: 'Service credit after the September payroll export incident (TK-1042 and two repeat escalations).', scope: { modules: [], addons: [], planId: 'enterprise' },
        startsAt: d(10), durationDays: 30, conversion: 'revert', status: 'Draft', approval: 'pending', createdAt: stamp(d(-1)) }),
      mk({ id: 'GR-1005', name: 'Year-end goodwill: Advanced Reporting', reason: 'Pre-agreed with the account manager for the year-end close.', scope: { modules: [], addons: ['reporting-advanced'] },
        startsAt: d(30), endsAt: d(51), conversion: 'auto_bill', status: 'Scheduled', approvedBy: 'Folake Bankole' }),
      mk({ id: 'GR-1004', name: 'Capacity boost: storage and signatures', reason: 'Document migration for the new Lagos branch needs extra storage and signature volume for a few weeks.', scope: { modules: [], addons: ['storage', 'signatures'] },
        startsAt: d(-24), endsAt: d(6), conversion: 'revert', status: 'Active', targets: ['c-etranzact'], approvedBy: 'Folake Bankole', sent: { start: true },
        log: [{ at: stamp(d(-29)), by: ADAEZE, text: 'Grant created' }, { at: stamp(d(-24)), by: 'System', text: 'Activated for 1 tenant', tenants: true }] }),
      ended('GR-1003', 'Wallet trial', 'Evaluate the Employee Wallet before the pay-day pilot.', { modules: [], addons: ['wallet'] }, -70, -40, 'tenant_action', 'lapsed', { note: 'Tenant chose not to keep it' }),
      ended('GR-1002', 'Travel and Vendors pilot', 'Procurement team asked to pilot both modules together.', { modules: ['travel', 'vendors'], addons: [] }, -120, -90, 'auto_bill', 'converted', { note: 'Billed at the normal price', convertedModules: ['travel', 'vendors'] }),
      ended('GR-1001', 'Onboarding goodwill: Fleet', 'Late implementation milestone, agreed with the sponsor.', { modules: [], addons: ['fleet'] }, -200, -170, 'revert', 'reverted'),
    ],
  }
}

/* ---------- pure settlement: Scheduled -> Active -> Ended ---------- */
export function settle(st: GrantsState, b: BillingState, on: string, tickets: Ticket[] = []): GrantsState {
  let changed = false
  const grants = st.grants.map((g0) => {
    let g = g0
    if (g.status === 'Scheduled' && g.startsAt <= on) {
      const targets = resolveAudience(b, g.audience, tickets).map((s) => s.id)
      const endsAt = g.endsAt ?? shift(g.startsAt, g.durationDays ?? 30)
      g = { ...g, status: 'Active', targets, endsAt, log: [...g.log, { at: stamp(on), by: 'System', text: `Activated for ${targets.length} tenant${targets.length === 1 ? '' : 's'}, ends ${fmtDate(endsAt)}`, tenants: true }] }
    }
    if (g.status === 'Active' && g.endsAt && on >= g.endsAt) {
      const outcomes: Outcome[] = g.targets.map((id) => {
        const sub = b.subs.find((s) => s.id === id)
        const base = { subId: id, at: g.endsAt!, previousPlanId: sub?.planId ?? '' }
        if (!sub || ['cancelled', 'expired', 'suspended'].includes(sub.status)) return { ...base, result: 'reverted' as const, note: 'Subscription not active at the end date', applied: true }
        if (g.conversion === 'auto_bill') {
          const ent = entitlements(b, sub, { grants: false })
          const mods = g.scope.modules.filter((m) => moduleKeys(m).some((k) => !ent[k]?.enabled))
          return { ...base, result: 'converted' as const, note: 'Billed at the normal price from the end date', convertedModules: mods, applied: false }
        }
        if (g.conversion === 'tenant_action') return { ...base, result: 'awaiting' as const, note: 'Waiting for the tenant to keep or release it', applied: true }
        return { ...base, result: 'reverted' as const, note: `Back on ${planById(b, sub.planId)?.name ?? 'previous plan'}`, applied: true }
      })
      const sum = (r: OutcomeResult) => outcomes.filter((o) => o.result === r).length
      g = { ...g, status: 'Ended', outcomes, log: [...g.log, { at: stamp(on), by: 'System', text: `Ended: ${sum('converted')} converted, ${sum('reverted')} reverted, ${sum('awaiting')} awaiting the tenant`, tenants: true }] }
    }
    if (g !== g0) changed = true
    return g
  })
  return changed ? { ...st, grants } : st
}

/* ---------- store ---------- */
const KEY = 'bf-grants-v1'
let state: GrantsState | undefined
const listeners = new Set<() => void>()
const load = (): GrantsState => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (v?.version === 1 && Array.isArray(v.grants)) return settle(v, getBilling(), todayIso())
  } catch { /* fall through to the seed */ }
  return settle(seed(), getBilling(), todayIso())
}
export const getGrants = (): GrantsState => (state ??= load())
const commit = (next: GrantsState) => { state = next; try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage unavailable */ } listeners.forEach((f) => f()) }
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
export const useGrants = () => useSyncExternalStore(subscribe, getGrants)
const patch = (id: string, fn: (g: Grant) => Grant) => commit({ ...getGrants(), grants: getGrants().grants.map((g) => (g.id === id ? fn(g) : g)) })
const logTo = (g: Grant, by: string, text: string, tenants = false): Grant => ({ ...g, log: [...g.log, { at: stamp(), by, text, tenants }] })

/* ---------- reads used by billing, the tenant app and the admin ---------- */
export const remaining = (g: Grant, on = todayIso()) => (g.endsAt ? dayDiff(on, g.endsAt) : 0)
export const isLive = (g: Grant, subId: string, on = todayIso()) => g.status === 'Active' && g.targets.includes(subId) && g.startsAt <= on && !!g.endsAt && on < g.endsAt
export const liveGrantsFor = (subId: string, on = todayIso()): Grant[] => getGrants().grants.filter((g) => isLive(g, subId, on))
export const grantsForSub = (st: GrantsState, subId: string) => st.grants.filter((g) => g.targets.includes(subId) || (g.audience.kind === 'selected' && g.audience.subIds.includes(subId)))
export const awaitingFor = (st: GrantsState, subId: string) => st.grants.flatMap((g) => g.outcomes.filter((o) => o.subId === subId && o.result === 'awaiting').map((o) => ({ g, o })))
/** Modules a tenant keeps because a finished grant converted to paid. */
export const convertedModulesFor = (subId: string) => getGrants().grants.flatMap((g) => g.outcomes.filter((o) => o.subId === subId && o.result === 'converted').flatMap((o) => o.convertedModules ?? []))
export const complimentaryLabel = (g: Grant) => `Complimentary until ${fmtDate(g.endsAt ?? g.startsAt)}`
/** Feature keys a live grant gives (plan features, module features with their dependencies, add-on features). */
export function grantFeatures(b: BillingState, g: Grant): string[] {
  const mods = g.scope.modules.flatMap((m) => [m, ...depsOf(b, m)])
  return [...(g.scope.planId ? planById(b, g.scope.planId)?.features ?? [] : []), ...mods.flatMap(moduleKeys), ...g.scope.addons.flatMap((id) => b.addons.find((a) => a.id === id)?.grants ?? [])]
}
export const grantCoversModule = (b: BillingState, g: Grant, moduleId: string) => [...g.scope.modules, ...g.scope.modules.flatMap((m) => depsOf(b, m))].includes(moduleId)
export const liveGrants = (on = todayIso()) => getGrants().grants.filter((g) => g.status === 'Active' && g.startsAt <= on && !!g.endsAt && on < g.endsAt)

/* ---------- KPIs and chart series ---------- */
export function kpis(st: GrantsState, on = todayIso()) {
  const act = st.grants.filter((g) => g.status === 'Active')
  const tenants = new Set(act.flatMap((g) => g.targets))
  const left = (n: number) => act.filter((g) => remaining(g, on) <= n).length
  const outs = st.grants.filter((g) => g.status === 'Ended').flatMap((g) => g.outcomes)
  const decided = outs.filter((o) => o.result !== 'awaiting')
  const converted = outs.filter((o) => o.result === 'converted').length
  return { active: act.length, tenants: tenants.size, mrr: act.reduce((a, g) => a + g.mrr, 0), exp7: left(7), exp30: left(30), conversion: decided.length ? converted / decided.length : null, ended: outs.length, converted }
}
export function forgoneSeries(st: GrantsState, back = 5, ahead = 2, on = todayIso()) {
  const y0 = Number(on.slice(0, 4)); const m0 = Number(on.slice(5, 7)) - 1
  const rows: { m: string; forgone: number; projected: number }[] = []
  for (let k = -back; k <= ahead; k++) {
    const start = new Date(Date.UTC(y0, m0 + k, 1)); const end = new Date(Date.UTC(y0, m0 + k + 1, 1))
    const s = start.toISOString().slice(0, 10); const e = end.toISOString().slice(0, 10); const dim = dayDiff(s, e)
    let actual = 0; let projected = 0
    for (const g of st.grants) {
      if (g.status === 'Draft' || (g.status === 'Revoked' && !g.targets.length)) continue
      const from = g.startsAt; const to = g.endsAt ?? shift(g.startsAt, g.durationDays ?? 30)
      const lo = from > s ? from : s; const hi = (g.revoked ? g.revoked.at.slice(0, 10) < to ? g.revoked.at.slice(0, 10) : to : to) < e ? (g.revoked ? g.revoked.at.slice(0, 10) < to ? g.revoked.at.slice(0, 10) : to : to) : e
      const days = Math.max(0, dayDiff(lo, hi)); if (!days) continue
      const part = (g.mrr * days) / dim
      if (g.status === 'Scheduled' || lo >= on) projected += part
      else if (hi > on) { const past = Math.max(0, dayDiff(lo, on)); actual += (g.mrr * past) / dim; projected += (g.mrr * (days - past)) / dim } else actual += part
    }
    rows.push({ m: start.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), forgone: Math.round(actual), projected: Math.round(projected) })
  }
  return rows
}
export function outcomeSeries(st: GrantsState) {
  const all = st.grants.flatMap((g) => g.outcomes)
  return (['converted', 'reverted', 'awaiting', 'lapsed', 'revoked'] as OutcomeResult[]).map((r) => ({ name: OUTCOME_LABEL[r], value: all.filter((o) => o.result === r).length }))
}

/* ---------- side effects (idempotent, driven by persisted flags) ---------- */
const BILLING_PATH = '/admin/business/settings?tab=billing'
function conversionEffect(g: Grant, o: Outcome) {
  const b = getBilling(); let sub = b.subs.find((s) => s.id === o.subId); if (!sub) return
  const actor = 'System (complimentary period ended)'
  if (g.scope.planId && g.scope.planId !== sub.planId && planById(b, g.scope.planId)) { subActions.changePlan(sub.id, g.scope.planId, actor, `converted from ${g.name}`); sub = getBilling().subs.find((s) => s.id === o.subId)! }
  const add = g.scope.addons.filter((id) => { const a = getBilling().addons.find((x) => x.id === id); return !!a && addonFits(a, sub!.planId, getBilling()) && !sub!.addons.includes(id) })
  if (add.length) subActions.setAddons(sub.id, [...sub.addons, ...add], actor)
}
function notify(g: Grant, subId: string, kind: 'start' | 'ending' | 'end' | 'revoke', o?: Outcome) {
  const slug = slugOfId(subId); const until = g.endsAt ? fmtDate(g.endsAt) : ''
  const base = { type: 'Payments' as const, to: BILLING_PATH }
  if (kind === 'start') postNotification(slug, { ...base, id: `grant-start-${g.id}`, title: `Complimentary access: ${g.name}`, body: `BizFlow has given you ${describeScope(g.scope, getBilling())} at no charge until ${until}.` })
  else if (kind === 'ending') postNotification(slug, { ...base, id: `grant-ending-${g.id}`, urgent: true, title: 'Your complimentary access ends soon', body: `${g.name} ends on ${until}. ${g.conversion === 'auto_bill' ? 'From that date you will be billed at the normal price.' : g.conversion === 'tenant_action' ? 'Open Billing to choose whether to keep it.' : 'You will return to your previous plan.'}` })
  else if (kind === 'revoke') postNotification(slug, { ...base, id: `grant-revoke-${g.id}`, urgent: true, title: 'Complimentary access withdrawn', body: `${g.name} has been withdrawn early by BizFlow. ${g.revoked?.reason ?? ''}`.trim() })
  else postNotification(slug, { ...base, id: `grant-end-${g.id}`, urgent: o?.result === 'converted' || o?.result === 'awaiting', title: o?.result === 'converted' ? 'Complimentary period ended: billing has started' : o?.result === 'awaiting' ? 'Complimentary period ended: action needed' : 'Complimentary period ended',
    body: o?.result === 'converted' ? `${g.name} ended on ${until}. You are now billed at the normal price.` : o?.result === 'awaiting' ? `${g.name} ended on ${until}. Open Billing to keep it at the normal price or let it lapse.` : `${g.name} ended on ${until}. Your workspace is back on its previous plan.` })
}
/** Settle the store for today and perform each pending side effect once. Safe to call repeatedly. */
export function syncGrants() {
  const on = todayIso()
  let st = settle(getGrants(), getBilling(), on)
  const grants = st.grants.map((g0) => {
    let g = g0
    for (const o of g.outcomes) if (o.result === 'converted' && !o.applied) { conversionEffect(g, o); g = { ...g, outcomes: g.outcomes.map((x) => (x === o ? { ...x, applied: true } : x)) } }
    const sent = { ...g.sent }
    if (g.status === 'Active' && g.notify === 'tenant' && !sent.start) { g.targets.forEach((id) => notify(g, id, 'start')); sent.start = true }
    if (g.status === 'Active' && g.notify === 'tenant' && !sent.ending && remaining(g, on) <= 7) { g.targets.forEach((id) => notify(g, id, 'ending')); sent.ending = true }
    if (g.status === 'Ended' && !sent.end) { g.outcomes.forEach((o) => notify(g, o.subId, 'end', o)); sent.end = true }
    if (g.status === 'Revoked' && g.outcomes.length && !sent.revoke) { g.targets.forEach((id) => notify(g, id, 'revoke')); sent.revoke = true }
    if (sent.start !== g.sent.start || sent.ending !== g.sent.ending || sent.end !== g.sent.end || sent.revoke !== g.sent.revoke) g = { ...g, sent }
    if (g.audited < g.log.length) {
      for (const e of g.log.slice(g.audited)) {
        const meta = { scope: 'Platform' as const, category: 'Finance' as const, ref: g.id, actor: e.by }
        recordAudit('platform', `Complimentary grant ${g.id}: ${e.text}`, g.name, g.status, meta)
        if (e.tenants) g.targets.forEach((id) => recordAudit(slugOfId(id), `Complimentary access ${g.id}: ${e.text}`, g.name, g.status, meta))
      }
      g = { ...g, audited: g.log.length }
    }
    return g
  })
  if (grants.some((g, i) => g !== st.grants[i]) || st !== getGrants()) { st = { ...st, grants }; commit(st) }
}
// Evaluate on load (no timers): once the module graph has finished loading.
if (typeof window !== 'undefined') queueMicrotask(() => { try { syncGrants() } catch { /* the pure overlay still applies */ } })

/* ---------- actions ---------- */
export type Result = { ok: true; id?: string } | { ok: false; error: string }
const err = (error: string): Result => ({ ok: false, error })
const nextId = () => `GR-${1001 + getGrants().grants.length}`
export const setThreshold = (n: number, actor: string) => {
  const prev = getGrants().config.approvalThresholdNgn
  commit({ ...getGrants(), config: { approvalThresholdNgn: Math.max(0, Math.round(n)) } })
  recordAudit('platform', 'Grant approval threshold changed', ngn(prev), ngn(n), { scope: 'Platform', ref: 'grant-policy', actor })
}
export function validateInput(i: GrantInput): string | null {
  if (!i.name.trim()) return 'Give the grant a name.'
  if (i.reason.trim().length < 10) return 'A reason is required (at least 10 characters).'
  if (!i.scope.planId && !i.scope.modules.length && !i.scope.addons.length) return 'Choose at least one module, add-on or a whole plan.'
  if (i.audience.kind === 'selected' && !i.audience.subIds.length) return 'Choose at least one tenant.'
  if (i.audience.kind === 'plan' && !i.audience.planIds.length) return 'Choose at least one plan.'
  if (i.audience.kind === 'health' && !i.audience.bands.length) return 'Choose at least one health band.'
  if (!i.startsAt) return 'Choose a start date.'
  if (i.endsAt) { if (i.endsAt <= i.startsAt) return 'The end date must be after the start date.' } else if (!i.durationDays || i.durationDays < 1 || i.durationDays > 366) return 'Enter a duration between 1 and 366 days.'
  return null
}
export function createGrant(i: GrantInput, actor: string, opts: { draft?: boolean; tickets?: Ticket[] } = {}): Result {
  const bad = validateInput(i); if (bad) return err(bad)
  const b = getBilling(); const pv = previewGrant(b, i, getGrants().config.approvalThresholdNgn, opts.tickets)
  const id = nextId(); const pending = pv.needsApproval
  const g: Grant = {
    id, name: i.name.trim(), reason: i.reason.trim(), scope: i.scope, audience: i.audience, startsAt: i.startsAt, endsAt: i.endsAt, durationDays: i.endsAt ? undefined : i.durationDays,
    conversion: i.conversion, notify: i.notify, status: opts.draft ? 'Draft' : pending ? 'Draft' : 'Scheduled', approval: opts.draft ? 'none' : pending ? 'pending' : 'not_required',
    createdBy: actor, createdAt: stamp(), forecast: pv.forecast, mrr: pv.mrr, targets: [], outcomes: [], audited: 0, sent: {},
    log: [{ at: stamp(), by: actor, text: opts.draft ? 'Draft saved' : pending ? `Submitted: estimated forgone revenue ${ngn(pv.forecast)} is above the ${ngn(getGrants().config.approvalThresholdNgn)} threshold, waiting for a second approver` : `Submitted and scheduled (estimated forgone revenue ${ngn(pv.forecast)})` }],
  }
  commit({ ...getGrants(), grants: [g, ...getGrants().grants] }); syncGrants()
  return { ok: true, id }
}
export function submitDraft(id: string, actor: string): Result {
  const g = getGrants().grants.find((x) => x.id === id); if (!g || g.status !== 'Draft' || g.approval !== 'none') return err('Only a saved draft can be submitted.')
  const pv = previewGrant(getBilling(), g as unknown as GrantInput, getGrants().config.approvalThresholdNgn)
  const pending = pv.needsApproval
  patch(id, (x) => logTo({ ...x, forecast: pv.forecast, mrr: pv.mrr, createdBy: x.createdBy, approval: pending ? 'pending' : 'not_required', status: pending ? 'Draft' : 'Scheduled' }, actor, pending ? `Submitted for second approval (${ngn(pv.forecast)} estimated)` : `Submitted and scheduled (${ngn(pv.forecast)} estimated)`))
  syncGrants(); return { ok: true, id }
}
export function approveGrant(id: string, actor: string): Result {
  const g = getGrants().grants.find((x) => x.id === id); if (!g || g.approval !== 'pending') return err('This grant is not waiting for approval.')
  if (g.createdBy.trim().toLowerCase() === actor.trim().toLowerCase()) return err('A different admin must approve. The person who created the grant cannot also approve it.')
  patch(id, (x) => logTo({ ...x, approval: 'approved', approvedBy: actor, approvedAt: stamp(), status: 'Scheduled' }, actor, 'Approved as second approver and scheduled'))
  syncGrants(); return { ok: true, id }
}
export function rejectGrant(id: string, reason: string, actor: string): Result {
  const g = getGrants().grants.find((x) => x.id === id); if (!g || g.approval !== 'pending') return err('This grant is not waiting for approval.')
  if (reason.trim().length < 5) return err('Give a reason for rejecting.')
  patch(id, (x) => logTo({ ...x, approval: 'rejected', status: 'Revoked', revoked: { by: actor, at: stamp(), reason: reason.trim() } }, actor, `Rejected: ${reason.trim()}`))
  syncGrants(); return { ok: true, id }
}
export function revokeGrant(id: string, reason: string, actor: string): Result {
  const g = getGrants().grants.find((x) => x.id === id); if (!g || !['Draft', 'Scheduled', 'Active'].includes(g.status)) return err('Only a draft, scheduled or active grant can be revoked.')
  if (reason.trim().length < 5) return err('Give a reason for revoking.')
  const on = todayIso(); const live = g.status === 'Active'
  patch(id, (x) => logTo({
    ...x, status: 'Revoked', revoked: { by: actor, at: stamp(), reason: reason.trim() }, pendingExtension: undefined,
    outcomes: live ? x.targets.map((subId) => ({ subId, result: 'revoked' as const, at: on, note: reason.trim(), previousPlanId: getBilling().subs.find((s) => s.id === subId)?.planId ?? '', applied: true })) : x.outcomes,
  }, actor, `Revoked${live ? ' (access removed immediately)' : ''}: ${reason.trim()}`, live))
  syncGrants(); return { ok: true, id }
}
export function extendGrant(id: string, to: string, reason: string, actor: string): Result {
  const g = getGrants().grants.find((x) => x.id === id); if (!g || !['Scheduled', 'Active'].includes(g.status)) return err('Only a scheduled or active grant can be extended.')
  const cur = g.endsAt ?? shift(g.startsAt, g.durationDays ?? 30)
  if (to <= cur) return err(`Choose a date after the current end date (${fmtDate(cur)}).`)
  if (reason.trim().length < 5) return err('A reason is required to extend a grant.')
  const extra = forecastOf(g.mrr, dayDiff(cur, to)); const th = getGrants().config.approvalThresholdNgn
  if (extra > th) {
    patch(id, (x) => logTo({ ...x, pendingExtension: { to, reason: reason.trim(), by: actor, at: stamp(), extra } }, actor, `Requested extension to ${fmtDate(to)} (${ngn(extra)} more forgone, above the threshold): ${reason.trim()}`))
    syncGrants(); return { ok: true, id }
  }
  patch(id, (x) => logTo({ ...x, endsAt: to, durationDays: undefined, forecast: x.forecast + extra, sent: { ...x.sent, ending: false } }, actor, `Extended from ${fmtDate(cur)} to ${fmtDate(to)}: ${reason.trim()}`, true))
  syncGrants(); return { ok: true, id }
}
export function decideExtension(id: string, approve: boolean, actor: string): Result {
  const g = getGrants().grants.find((x) => x.id === id); const p = g?.pendingExtension; if (!g || !p) return err('No extension is waiting for approval.')
  if (approve && p.by.trim().toLowerCase() === actor.trim().toLowerCase()) return err('A different admin must approve the extension.')
  if (!approve) patch(id, (x) => logTo({ ...x, pendingExtension: undefined }, actor, `Extension to ${fmtDate(p.to)} declined`))
  else patch(id, (x) => logTo({ ...x, endsAt: p.to, durationDays: undefined, forecast: x.forecast + p.extra, pendingExtension: undefined, sent: { ...x.sent, ending: false } }, actor, `Extension to ${fmtDate(p.to)} approved (requested by ${p.by})`, true))
  syncGrants(); return { ok: true, id }
}
export const toInput = (g: Grant): GrantInput => ({ name: g.name, reason: g.reason, scope: g.scope, audience: g.audience, startsAt: g.startsAt, endsAt: g.endsAt, durationDays: g.durationDays, conversion: g.conversion, notify: g.notify })
/** The tenant answers a "needs tenant action" outcome. Keeping it bills the normal price; releasing it lets it lapse. */
export function answerConversion(grantId: string, subId: string, keep: boolean, actor: string): Result {
  const g = getGrants().grants.find((x) => x.id === grantId); const o = g?.outcomes.find((x) => x.subId === subId && x.result === 'awaiting'); if (!g || !o) return err('Nothing is waiting for an answer.')
  const b = getBilling(); const sub = b.subs.find((s) => s.id === subId)
  const ent = sub ? entitlements(b, sub, { grants: false }) : {}
  const mods = g.scope.modules.filter((m) => moduleKeys(m).some((k) => !ent[k]?.enabled))
  patch(grantId, (x) => logTo({ ...x, outcomes: x.outcomes.map((y) => (y === o ? keep ? { ...y, result: 'converted', note: 'Kept by the tenant, billed at the normal price', convertedModules: mods, applied: false } : { ...y, result: 'lapsed', note: 'Released by the tenant' } : y)) }, actor, `${sub?.company ?? subId} ${keep ? 'chose to keep it at the normal price' : 'let it lapse'}`, true))
  syncGrants(); return { ok: true, id: grantId }
}
