import { healthOf } from './health'
import type { AuditEntry, Tenant } from '../tenant/store'

/** Targeting criteria for an announcement. An empty list means "any". Different criteria combine with AND. */
export type Audience = { plans: string[]; modules: string[]; health: string[]; states: string[]; industries: string[]; sizes: string[]; slugs: string[] }
export const emptyAudience = (): Audience => ({ plans: [], modules: [], health: [], states: [], industries: [], sizes: [], slugs: [] })
export const HEALTH_LABELS = ['Healthy', 'Watch', 'At risk']
export const SIZE_BANDS = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+']
export const isEmptyAudience = (a: Audience) => Object.values(a).every((v) => v.length === 0)

export type Directory = { tenants: Tenant[]; audit: AuditEntry[] }

/** Does the tenant match every non-empty criterion? */
export function matchesAudience(t: Tenant, a: Audience, audit: AuditEntry[], band?: string): boolean {
  const has = (list: string[], v: string) => list.length === 0 || list.includes(v)
  if (!has(a.plans, t.plan) || !has(a.states, t.profile.state) || !has(a.industries, t.profile.industry) || !has(a.sizes, t.profile.size) || !has(a.slugs, t.slug)) return false
  if (a.modules.length && !a.modules.every((m) => t.modules.includes(m))) return false
  if (a.health.length) { const b = band ?? healthOf(t, audit).label; if (!a.health.includes(b)) return false }
  return true
}
export function resolveAudience(a: Audience, dir: Directory): Tenant[] {
  return dir.tenants.filter((t) => matchesAudience(t, a, dir.audit))
}

/** Plain-language summary of the criteria, e.g. "Enterprise plan, Lagos, 2 companies". */
export function describeAudience(a: Audience, nameOf: (slug: string) => string = (s) => s): string {
  const parts: string[] = []
  if (a.plans.length) parts.push(`${a.plans.join('/')} plan`)
  if (a.modules.length) parts.push(`with ${a.modules.length} module${a.modules.length === 1 ? '' : 's'}`)
  if (a.health.length) parts.push(a.health.join('/'))
  if (a.states.length) parts.push(a.states.join('/'))
  if (a.industries.length) parts.push(a.industries.length === 1 ? a.industries[0] : `${a.industries.length} industries`)
  if (a.sizes.length) parts.push(`${a.sizes.join('/')} staff`)
  if (a.slugs.length) parts.push(a.slugs.length <= 2 ? a.slugs.map(nameOf).join(', ') : `${a.slugs.length} named companies`)
  return parts.length ? parts.join(' · ') : 'All companies'
}

/** Directory snapshot for non-React callers (scheduled sends). Pages register the live data; otherwise read the persisted tenant store. */
let registered: Directory | null = null
export const registerDirectory = (d: Directory) => { registered = d }
export function currentDirectory(): Directory {
  if (registered) return registered
  try {
    const s = JSON.parse(localStorage.getItem('bf-tenants-v5') || 'null')
    if (s?.tenants) return { tenants: Object.values(s.tenants) as Tenant[], audit: (s.audit ?? []) as AuditEntry[] }
  } catch { /* fall through */ }
  return { tenants: [], audit: [] }
}
