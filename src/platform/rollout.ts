import { recordAudit } from '../tenant/store'
import { createStore, uid } from './persist'

export type FlagStatus = 'Off' | 'Beta' | 'GA'
export type RolloutMode = 'percent' | 'tenants'
export type Change = { id: string; at: string; by: string; text: string }
export type Rollout = {
  key: string; name: string; desc: string; owner: string
  status: FlagStatus; mode: RolloutMode; percent: number; tenants: string[]
  plans: string[]                       // empty = every plan
  overrides: Record<string, 'on' | 'off'> // per-tenant forced state
  overrideMeta?: Record<string, { reason: string; by: string; at: string }> // why/who/when for each override (older saves have none)
  killed: boolean; history: Change[]
}
const h = (daysAgo: number, by: string, text: string): Change => ({ id: uid('CH'), at: new Date(Date.now() - daysAgo * 864e5).toISOString(), by, text })
const base = { mode: 'percent' as RolloutMode, tenants: [] as string[], plans: [] as string[], overrides: {} as Rollout['overrides'], killed: false }
const seed = (): Rollout[] => [
  { ...base, key: 'ai-insights', name: 'AI insights on dashboards', desc: 'Plain-language summaries on the CEO and finance dashboards.', owner: 'Product', status: 'Beta', percent: 50, plans: ['Professional', 'Enterprise'], history: [h(9, 'Folake Bankole', 'Moved to Beta at 50% for Professional and Enterprise')] },
  { ...base, key: 'bulk-payroll', name: 'Bulk payroll upload', desc: 'CSV upload for monthly payroll runs.', owner: 'Payroll', status: 'GA', percent: 100, history: [h(30, 'Folake Bankole', 'Promoted to GA')] },
  { ...base, key: 'geo-attendance', name: 'Geofenced attendance', desc: 'Clock-in only inside approved locations.', owner: 'Attendance', status: 'Off', percent: 0, history: [] },
  { ...base, key: 'vendor-portal', name: 'Vendor self-service portal', desc: 'Vendors upload compliance documents themselves.', owner: 'Procurement', status: 'Beta', mode: 'tenants', tenants: ['etranzact'], percent: 0, plans: ['Enterprise'], history: [h(4, 'Dayo Martins', 'Limited beta for eTranzact')] },
  { ...base, key: 'sign-bulk-send', name: 'Bulk send for Sign', desc: 'Send one document to many signers in a single batch.', owner: 'Documents', status: 'Beta', percent: 25, history: [h(2, 'Folake Bankole', 'Started 25% rollout')] },
  { ...base, key: 'crm-forecast', name: 'CRM revenue forecast', desc: 'Weighted pipeline forecast by month on the CRM page.', owner: 'Customers', status: 'Off', percent: 0, history: [] },
]
const store = createStore<Rollout[]>('bizflow.rollout.v1', seed)
export const useRollouts = store.use

/** Stable 0..99 bucket so a tenant stays in or out of a percentage rollout. */
const bucket = (s: string) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 9973; return x % 100 }
export function flagState(f: Rollout, t: { slug: string; plan: string }): { on: boolean; why: string } {
  if (f.killed) return { on: false, why: 'Kill switch engaged' }
  const o = f.overrides[t.slug]
  if (o) return { on: o === 'on', why: `Forced ${o} for this tenant` }
  if (f.status === 'Off') return { on: false, why: 'Flag is off' }
  if (f.plans.length && !f.plans.includes(t.plan)) return { on: false, why: `Not on ${t.plan} plan` }
  if (f.status === 'GA') return { on: true, why: 'Generally available' }
  if (f.mode === 'tenants') return f.tenants.includes(t.slug) ? { on: true, why: 'In beta tenant list' } : { on: false, why: 'Not in beta tenant list' }
  return bucket(t.slug + f.key) < f.percent ? { on: true, why: `Inside ${f.percent}% rollout` } : { on: false, why: `Outside ${f.percent}% rollout` }
}
/** For company-side code: is this feature on for the tenant? */
export const isFeatureOn = (key: string, t: { slug: string; plan: string }) => { const f = store.get().find((x) => x.key === key); return !!f && flagState(f, t).on }

function apply(key: string, patch: Partial<Rollout>, by: string, text: string, tenant = 'platform', from?: string, to?: string, actor?: string) {
  store.set((l) => l.map((f) => (f.key === key ? { ...f, ...patch, history: [{ id: uid('CH'), at: new Date().toISOString(), by, text }, ...f.history].slice(0, 50) } : f)))
  recordAudit(tenant, `Feature flag ${key}: ${text}`, from, to, { category: 'Settings', ...(actor ? { actor } : {}) })
}
const cur = (key: string) => store.get().find((f) => f.key === key)!
export const describe = (f: Rollout) => `${f.status}${f.status === 'Beta' ? (f.mode === 'percent' ? ` ${f.percent}%` : ` ${f.tenants.length} tenant(s)`) : ''}${f.plans.length ? ` · ${f.plans.join('/')}` : ''}`

export function setStatus(key: string, status: FlagStatus, by: string) { const f = cur(key); apply(key, { status }, by, `status changed to ${status}`, 'platform', describe(f), describe({ ...f, status })) }
export function setRolloutMode(key: string, mode: RolloutMode, by: string) { const f = cur(key); apply(key, { mode }, by, `rollout switched to ${mode === 'percent' ? 'percentage' : 'tenant list'}`, 'platform', describe(f), describe({ ...f, mode })) }
export function setPercent(key: string, percent: number, by: string) { const f = cur(key); apply(key, { percent }, by, `rollout set to ${percent}%`, 'platform', `${f.percent}%`, `${percent}%`) }
export function setTenantList(key: string, tenants: string[], by: string) { const f = cur(key); apply(key, { tenants }, by, `beta tenants set to ${tenants.join(', ') || 'none'}`, 'platform', f.tenants.join(', ') || 'none', tenants.join(', ') || 'none') }
export function setPlans(key: string, plans: string[], by: string) { const f = cur(key); apply(key, { plans }, by, `plans set to ${plans.join(', ') || 'all plans'}`, 'platform', f.plans.join(', ') || 'all plans', plans.join(', ') || 'all plans') }
export function setOverride(key: string, slug: string, v: 'on' | 'off' | null, by: string, reason?: string) {
  const f = cur(key); const o = { ...f.overrides }; const meta = { ...(f.overrideMeta ?? {}) }; const was = o[slug] ?? 'default'
  if (v) { o[slug] = v; meta[slug] = { reason: reason?.trim() || 'No reason given', by, at: new Date().toISOString() } } else { delete o[slug]; delete meta[slug] }
  apply(key, { overrides: o, overrideMeta: meta }, by, `${slug} ${v ? `forced ${v}` : 'override cleared'}${reason?.trim() ? ` (${reason.trim()})` : ''}`, slug, was, v ?? 'default')
}
export function setKill(key: string, killed: boolean, by: string, reason = '') {
  const metric = currentErrorRate(key), rule = ruleOf(key)
  apply(key, { killed }, by, killed ? 'KILL SWITCH engaged, off for every tenant' : `kill switch released${reason ? ` (${reason})` : ''}`, 'platform', killed ? 'Live' : 'Killed', killed ? 'Killed' : 'Live')
  logKill({ flag: key, action: killed ? 'Engaged' : 'Released', by, auto: false, metric, threshold: rule.enabled ? rule.maxErrorRatePct : null, windowMinutes: rule.enabled ? rule.windowMinutes : null, reason: reason || (killed ? 'Manual kill' : 'Released') })
  if (!killed) guard.set((g) => ({ ...g, spikes: { ...g.spikes, [key]: [] } })) // incident resolved, so the simulated spike ends
}
export function killAll(by: string) {
  const live = store.get().filter((f) => !f.killed && f.status !== 'Off')
  live.forEach((f) => setKill(f.key, true, by))
  return live.length
}

/* ---------- Guardrails: scheduled steps, automatic rollback rules, simulated error-rate metric ---------- */
export type Rule = { enabled: boolean; maxErrorRatePct: number; windowMinutes: number }
export type StepAction = 'percent' | 'ga' | 'off' | 'kill'
export type Step = { id: string; flag: string; action: StepAction; percent?: number; at: string; owner: string; note: string; status: 'Scheduled' | 'Applied' | 'Cancelled'; doneAt?: string }
export type KillEvent = { id: string; flag: string; at: string; action: 'Engaged' | 'Released'; by: string; auto: boolean; metric: number; threshold: number | null; windowMinutes: number | null; reason: string }
type Guard = { rules: Record<string, Rule>; spikes: Record<string, number[]>; steps: Step[]; kills: KillEvent[] }
export const DEFAULT_RULE: Rule = { enabled: false, maxErrorRatePct: 5, windowMinutes: 5 }
const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString()
const guard = createStore<Guard>('bizflow.rollout.guard.v1', () => ({
  rules: { 'ai-insights': { enabled: true, maxErrorRatePct: 3, windowMinutes: 5 }, 'sign-bulk-send': { enabled: true, maxErrorRatePct: 4, windowMinutes: 10 } },
  spikes: {},
  steps: [
    { id: 'ST-SEED1', flag: 'sign-bulk-send', action: 'percent', percent: 50, at: inDays(2), owner: 'Documents', note: 'Widen after a clean week at 25%', status: 'Scheduled' },
    { id: 'ST-SEED2', flag: 'ai-insights', action: 'ga', at: inDays(9), owner: 'Product', note: 'GA once the error rate stays under 3%', status: 'Scheduled' },
  ],
  kills: [],
}))
export const useGuard = guard.use
export const ruleOf = (key: string): Rule => guard.get().rules[key] ?? DEFAULT_RULE
export function setRule(key: string, rule: Rule, by: string) {
  const was = ruleOf(key)
  guard.set((g) => ({ ...g, rules: { ...g.rules, [key]: rule } }))
  const d = (r: Rule) => (r.enabled ? `on, over ${r.maxErrorRatePct}% in ${r.windowMinutes} min` : 'off')
  apply(key, {}, by, `rollback rule ${d(rule)}`, 'platform', d(was), d(rule))
  evaluateGuards()
}

/** Deterministic pseudo-random 0..1 for a flag and minute (FNV-1a plus a mixing step). */
const noise = (key: string, minute: number) => {
  let h = 2166136261
  for (const c of `${key}:${minute}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15
  return (h >>> 0) / 4294967296
}
const SPIKE_LEN = 30
const minuteOf = (ms: number) => Math.floor(ms / 6e4)
const killedFrom = (key: string): number | null => {
  const last = guard.get().kills.find((k) => k.flag === key) // newest first
  return last && last.action === 'Engaged' ? minuteOf(new Date(last.at).getTime()) : null
}
/** Simulated error rate (%) for a flag at a given minute: a quiet baseline plus any injected incident. Drops to baseline once the kill switch engages. */
export function errorRateAt(key: string, minute: number, spikes = guard.get().spikes[key] ?? [], killMin = killedFrom(key)): number {
  const base = 0.3 + (noise(key, 0) * 0.5) + noise(key, minute) * 0.7
  const hit = spikes.some((s) => minute >= s && minute < s + SPIKE_LEN) && !(killMin !== null && minute > killMin)
  return Math.round((hit ? base + 6 + noise(key, minute + 1) * 4 : base) * 100) / 100
}
export function errorSeries(key: string, points = 60, nowMs = Date.now()) {
  const m = minuteOf(nowMs), spikes = guard.get().spikes[key] ?? [], k = killedFrom(key)
  return Array.from({ length: points }, (_, i) => { const minute = m - (points - 1 - i); return { minute, label: new Date(minute * 6e4).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), rate: errorRateAt(key, minute, spikes, k) } })
}
export const averageRate = (key: string, windowMinutes: number) => { const s = errorSeries(key, Math.max(1, windowMinutes)); return Math.round((s.reduce((a, p) => a + p.rate, 0) / s.length) * 100) / 100 }
export const currentErrorRate = (key: string) => errorRateAt(key, minuteOf(Date.now()))
/** Simulate an incident: errors jump for the next 20 minutes (and the last 10 minutes are back-filled so the window breaches at once). */
export function injectSpike(key: string, by: string) {
  guard.set((g) => ({ ...g, spikes: { ...g.spikes, [key]: [...(g.spikes[key] ?? []), minuteOf(Date.now()) - 10] } }))
  recordAudit('platform', `Feature flag ${key}: incident spike injected (simulation)`, undefined, undefined, { category: 'Settings', actor: by })
  evaluateGuards()
}
export const clearSpikes = (key: string) => guard.set((g) => ({ ...g, spikes: { ...g.spikes, [key]: [] } }))
function logKill(e: Omit<KillEvent, 'id' | 'at'>) { guard.set((g) => ({ ...g, kills: [{ id: uid('KS'), at: new Date().toISOString(), ...e }, ...g.kills].slice(0, 200) })) }

/** Engage the kill switch for any live flag whose average error rate over the rule window is above its threshold. */
export function evaluateGuards() {
  store.get().forEach((f) => {
    const r = ruleOf(f.key)
    if (!r.enabled || f.killed || f.status === 'Off') return
    const avg = averageRate(f.key, r.windowMinutes)
    if (avg <= r.maxErrorRatePct) return
    const why = `AUTO ROLLBACK: error rate ${avg}% over ${r.windowMinutes} min is above the ${r.maxErrorRatePct}% limit`
    apply(f.key, { killed: true }, 'Auto-rollback', why, 'platform', 'Live', 'Killed', 'Auto-rollback')
    logKill({ flag: f.key, action: 'Engaged', by: 'Auto-rollback', auto: true, metric: avg, threshold: r.maxErrorRatePct, windowMinutes: r.windowMinutes, reason: `Error rate ${avg}% over ${r.windowMinutes} min exceeded ${r.maxErrorRatePct}%` })
  })
}

/* Release calendar: steps apply on their date (checked every 15 s and when the page opens). */
export const useKillLog = () => guard.use().kills
export function scheduleStep(s: Omit<Step, 'id' | 'status'>, by: string) {
  const step: Step = { ...s, id: uid('ST'), status: 'Scheduled' }
  guard.set((g) => ({ ...g, steps: [...g.steps, step] }))
  recordAudit('platform', `Feature flag ${s.flag}: release step scheduled (${stepText(step)})`, undefined, s.at, { category: 'Settings', actor: by })
  processSteps()
  return step.id
}
export function cancelStep(id: string, by: string) {
  const st = guard.get().steps.find((x) => x.id === id); if (!st || st.status !== 'Scheduled') return
  guard.set((g) => ({ ...g, steps: g.steps.map((x) => (x.id === id ? { ...x, status: 'Cancelled' } : x)) }))
  recordAudit('platform', `Feature flag ${st.flag}: release step cancelled (${stepText(st)})`, undefined, undefined, { category: 'Settings', actor: by })
}
export const stepText = (s: Pick<Step, 'action' | 'percent'>) => (s.action === 'percent' ? `set to ${s.percent}%` : s.action === 'ga' ? 'promote to GA' : s.action === 'off' ? 'turn off' : 'kill switch')
export function processSteps() {
  const now = Date.now()
  guard.get().steps.filter((s) => s.status === 'Scheduled' && new Date(s.at).getTime() <= now).forEach((s) => {
    const by = `${s.owner} (scheduled)`
    if (!store.get().some((f) => f.key === s.flag)) { guard.set((g) => ({ ...g, steps: g.steps.map((x) => (x.id === s.id ? { ...x, status: 'Cancelled' } : x)) })); return }
    if (s.action === 'percent') { if (cur(s.flag).status !== 'Beta') setStatus(s.flag, 'Beta', by); if (cur(s.flag).mode !== 'percent') setRolloutMode(s.flag, 'percent', by); setPercent(s.flag, s.percent ?? 0, by) }
    else if (s.action === 'ga') setStatus(s.flag, 'GA', by)
    else if (s.action === 'off') setStatus(s.flag, 'Off', by)
    else setKill(s.flag, true, by, 'Scheduled kill')
    guard.set((g) => ({ ...g, steps: g.steps.map((x) => (x.id === s.id ? { ...x, status: 'Applied', doneAt: new Date().toISOString() } : x)) }))
    recordAudit('platform', `Feature flag ${s.flag}: scheduled step applied (${stepText(s)})`, undefined, undefined, { category: 'Settings', actor: by })
  })
}
if (typeof window !== 'undefined') { setTimeout(() => { processSteps(); evaluateGuards() }, 0); (setInterval(() => { processSteps(); evaluateGuards() }, 15000) as unknown as { unref?: () => void }).unref?.() }
