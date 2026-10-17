/* Usage metering: every tenant's usage against plan limits, 80% and 100% thresholds, upgrade candidates, nudges and time-boxed overage grants.
 * Real subscriptions read their usage from the store; the portfolio holds real subscriptions only (see portfolio.ts). */
import { LIMIT_DEFS, TODAY, addonFits, addonPrice, effectiveLimits, fmtDate, isCustom, logAudit, publicPlans, quote } from '../data/billing'
import type { BillingState, LimitKey, Subscription } from '../data/billing'
import { postNotification } from '../notifications/store'
import { createStore } from '../platform/persist'
import { recordAudit } from '../tenant/store'
import { recurring } from './insights'
import type { PortfolioTenant } from './portfolio'
import { ymd } from './portfolio'

export type Grant = { id: string; tenantId: string; tenantName: string; key: LimitKey; extra: number; reason: string; by: string; at: string; expiresAt: string; revoked?: boolean }
export type Nudge = { id: string; tenantId: string; tenantName: string; key: LimitKey; level: 80 | 100; at: string; by: string; auto: boolean; delivered: string }
export type MeterSettings = { auto: boolean; at80: boolean; at100: boolean; cooldownDays: number }
type MeterState = { grants: Grant[]; nudges: Nudge[]; settings: MeterSettings; seq: number }

const store = createStore<MeterState>('bizflow.metering.v1', () => ({ grants: [], nudges: [], settings: { auto: false, at80: true, at100: true, cooldownDays: 7 }, seq: 1 }))
export const useMetering = store.use
export const getMetering = store.get
const today = () => ymd(TODAY)
const seq = () => { const n = store.get().seq; store.set((s) => ({ ...s, seq: s.seq + 1 })); return n }

export const isActiveGrant = (g: Grant) => !g.revoked && g.expiresAt >= today()
export const grantsFor = (grants: Grant[], tenantId: string) => grants.filter((g) => g.tenantId === tenantId && isActiveGrant(g))
/** Effective limits for a subscription, including any active temporary overage grants. */
export function limitsWithGrants(s: BillingState, sub: Subscription, grants: Grant[]) {
  const base = effectiveLimits(s, sub)
  const out = { ...base }
  grantsFor(grants, sub.id).forEach((g) => { if (out[g.key] !== null) out[g.key] = (out[g.key] as number) + g.extra })
  return { base, limits: out }
}

export type MeterState_ = 'ok' | 'warn' | 'full' | 'unlimited'
export type MeterCell = { key: LimitKey; label: string; unit: string; period?: string; used: number; base: number | null; limit: number | null; extra: number; pct: number | null; state: MeterState_ }
export const usedOf = (sub: Subscription, k: LimitKey) => (k === 'employees' ? sub.employees : sub.usage[k])
export function meterCells(s: BillingState, sub: Subscription, grants: Grant[]): MeterCell[] {
  const { base, limits } = limitsWithGrants(s, sub, grants)
  return LIMIT_DEFS.map((d) => {
    const used = usedOf(sub, d.key); const l = limits[d.key]
    const pct = l === null ? null : l === 0 ? (used > 0 ? 999 : 0) : (used / l) * 100
    const state: MeterState_ = pct === null ? 'unlimited' : pct >= 100 ? 'full' : pct >= 80 ? 'warn' : 'ok'
    return { key: d.key, label: d.label, unit: d.unit, period: d.period, used, base: base[d.key], limit: l, extra: (l ?? 0) - (base[d.key] ?? 0), pct, state }
  })
}

export type Uplift = { kind: 'plan' | 'addon' | 'none'; name: string; planId?: string; addonId?: string; monthly: number; note: string }
/** Cheapest way to make room for the limits that are at or above 80%: an add-on if one boosts the limit, otherwise the next plan that fits. */
export function upliftFor(s: BillingState, t: PortfolioTenant, cells: MeterCell[]): Uplift {
  const hot = cells.filter((c) => c.state === 'warn' || c.state === 'full')
  if (!hot.length) return { kind: 'none', name: '', monthly: 0, note: 'Nothing close to a limit.' }
  const sub = t.sub; const current = recurring(sub)
  const need = (k: LimitKey) => Math.ceil((cells.find((c) => c.key === k)?.used ?? 0) * 1.25)
  const plans = publicPlans(s).filter((p) => !isCustom(p) && p.prices[sub.currency])
  const cur = plans.findIndex((p) => p.id === sub.planId)
  const fit = plans.slice(cur + 1).find((p) => hot.every((c) => p.limits[c.key] === null || (p.limits[c.key] as number) >= need(c.key)))
  const addonOnly = hot.length === 1 ? s.addons.find((a) => addonFits(a, sub.planId, s) && (a.limitBoosts[hot[0].key] ?? 0) > 0 && !sub.addons.includes(a.id)) : undefined
  if (addonOnly) {
    const p = addonPrice(addonOnly, sub.currency, sub.cycle)
    if (p !== null) return { kind: 'addon', name: addonOnly.name, addonId: addonOnly.id, monthly: Math.round(sub.cycle === 'annual' ? p / 12 : p), note: `${addonOnly.name} raises the ${hot[0].label.toLowerCase()} limit.` }
  }
  if (fit) {
    const q = quote(s, { planId: fit.id, cycle: sub.cycle, currency: sub.currency, employees: sub.employees, addonIds: sub.addons.filter((id) => { const a = s.addons.find((x) => x.id === id); return !!a && addonFits(a, fit.id, s) }) })
    if (q.ok) { const m = sub.cycle === 'annual' ? q.subtotal / 12 : q.subtotal; return { kind: 'plan', name: fit.name, planId: fit.id, monthly: Math.max(0, Math.round(m - current)), note: `${fit.name} covers ${hot.map((c) => c.label.toLowerCase()).join(', ')} with 25% headroom.` } }
  }
  return { kind: 'none', name: 'Custom contract', monthly: 0, note: sub.planId === 'enterprise' || !fit ? 'Already on the top public plan; discuss a custom limit.' : 'No public plan fits.' }
}

/* ---------- actions ---------- */
const slugOf = (t: PortfolioTenant) => t.slug

export function sendNudge(t: PortfolioTenant, cell: MeterCell, actor: string, auto = false): string {
  const level: 80 | 100 = cell.state === 'full' ? 100 : 80
  if (cell.state !== 'warn' && cell.state !== 'full') return `${cell.label} is below 80% for ${t.name}.`
  const n = seq()
  const body = level === 100
    ? `Your workspace has reached its ${cell.label.toLowerCase()} limit (${cell.used.toLocaleString()} of ${(cell.limit ?? 0).toLocaleString()}${cell.unit ? ' ' + cell.unit : ''}). Upgrade to keep working without interruption.`
    : `Your workspace has used ${Math.round(cell.pct ?? 0)}% of its ${cell.label.toLowerCase()} limit. Upgrade before you reach it.`
  let delivered = 'Logged only'
  { postNotification(slugOf(t), { id: `usage-nudge:${t.id}:${cell.key}:${level}:${n}`, type: 'System', title: level === 100 ? `${cell.label} limit reached` : `${cell.label} at ${Math.round(cell.pct ?? 0)}% of your limit`, body, to: '/admin/business/settings?tab=billing&change=1', urgent: level === 100 }); delivered = 'Tenant inbox' }
  const nudge: Nudge = { id: `NUD-${String(n).padStart(4, '0')}`, tenantId: t.id, tenantName: t.name, key: cell.key, level, at: today(), by: auto ? 'Auto-nudge' : actor, auto, delivered }
  store.set((s) => ({ ...s, nudges: [nudge, ...s.nudges].slice(0, 300) }))
  logAudit(nudge.by, t.name, `Upgrade nudge sent: ${cell.label} at ${level}%`, `${Math.round(cell.pct ?? 0)}% used`, delivered)
  if (t.real) recordAudit(slugOf(t), `Upgrade nudge received: ${cell.label} at ${level}%`, undefined, undefined, { category: 'Finance', actor: nudge.by, ref: t.id })
  return ''
}

export const MAX_GRANT_DAYS = 30
export function grantOverage(t: PortfolioTenant, key: LimitKey, extra: number, days: number, reason: string, actor: string): string {
  if (!(extra > 0)) return 'Enter how many extra units to grant.'
  if (!(days >= 1 && days <= MAX_GRANT_DAYS)) return `Time-box the grant between 1 and ${MAX_GRANT_DAYS} days.`
  if (!reason.trim()) return 'A reason is required.'
  const def = LIMIT_DEFS.find((d) => d.key === key)!
  const n = seq(); const expires = ymd(new Date(TODAY.getTime() + days * 864e5))
  const g: Grant = { id: `OVR-${String(n).padStart(4, '0')}`, tenantId: t.id, tenantName: t.name, key, extra: Math.round(extra), reason: reason.trim(), by: actor, at: today(), expiresAt: expires }
  store.set((s) => ({ ...s, grants: [g, ...s.grants] }))
  logAudit(actor, t.name, `Temporary overage granted: +${g.extra.toLocaleString()} ${def.label.toLowerCase()} until ${fmtDate(expires)}: ${g.reason}`, 'Plan limit', `Plan limit +${g.extra.toLocaleString()}`)
  if (t.real) {
    recordAudit(slugOf(t), `Temporary ${def.label.toLowerCase()} overage granted until ${fmtDate(expires)}`, undefined, `+${g.extra}`, { category: 'Finance', actor, ref: g.id })
    postNotification(slugOf(t), { id: `usage-grant:${g.id}`, type: 'System', title: `Temporary extra ${def.label.toLowerCase()} granted`, body: `BizFlow added ${g.extra.toLocaleString()} to your ${def.label.toLowerCase()} limit until ${fmtDate(expires)}.`, to: '/admin/business/settings?tab=billing' })
  }
  return ''
}

export function revokeGrant(g: Grant, actor: string) {
  store.set((s) => ({ ...s, grants: s.grants.map((x) => (x.id === g.id ? { ...x, revoked: true } : x)) }))
  logAudit(actor, g.tenantName, `Temporary overage ${g.id} revoked early`, `+${g.extra.toLocaleString()}`, 'Revoked')
}

export function setMeterSettings(patch: Partial<MeterSettings>, actor: string) {
  store.set((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  logAudit(actor, 'Platform', 'Auto-nudge settings changed', 'Usage metering', Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', '))
}

/** Sends a nudge for every limit that crossed a threshold and has not been nudged within the cooldown. Returns how many were sent. */
export function runAutoNudge(s: BillingState, tenants: PortfolioTenant[], actor: string): number {
  const st = store.get(); if (!st.settings.auto) return 0
  let sent = 0
  tenants.filter((t) => ['active', 'past_due', 'grace'].includes(t.sub.status)).forEach((t) => {
    meterCells(s, t.sub, st.grants).forEach((c) => {
      if (c.state === 'ok' || c.state === 'unlimited') return
      const level = c.state === 'full' ? 100 : 80
      if ((level === 80 && !st.settings.at80) || (level === 100 && !st.settings.at100)) return
      const recent = store.get().nudges.find((n) => n.tenantId === t.id && n.key === c.key && n.level >= level && n.at >= ymd(new Date(TODAY.getTime() - st.settings.cooldownDays * 864e5)))
      if (recent) return
      if (!sendNudge(t, c, actor, true)) sent++
    })
  })
  return sent
}
