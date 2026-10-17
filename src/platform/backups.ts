import { recordAudit } from '../tenant/store'
import { createStore, uid } from './persist'

/* ---------- Data residency and backups ---------- */
export const REGIONS = ['Lagos (NG-LOS-1)', 'Johannesburg (ZA-JNB-1)', 'Frankfurt (EU-FRA-1)'] as const
export const POLICIES = ['Standard: daily, kept 30 days', 'Enhanced: every 6 hours, kept 90 days', 'Regulated: hourly, kept 365 days'] as const
export const STALE_HOURS: Record<string, number> = { [POLICIES[0]]: 36, [POLICIES[1]]: 12, [POLICIES[2]]: 3 }
export type RestoreStatus = 'Requested' | 'Approved' | 'Rejected' | 'Running' | 'Completed'
export type Restore = { id: string; slug: string; requestedBy: string; requestedAt: string; pointInTime: string; scope: 'Full workspace' | 'Employees and payroll' | 'Documents only'; reason: string; status: RestoreStatus; decidedBy?: string; decidedAt?: string; note?: string; completedAt?: string; restoredBytes?: number }
export type BackupRec = { slug: string; name: string; region: (typeof REGIONS)[number]; policy: (typeof POLICIES)[number]; lastBackupAt: string; lastResult: 'Success' | 'Failed'; sizeMb: number; encrypted: boolean; crossRegionCopy: boolean; history: { at: string; result: 'Success' | 'Failed'; sizeMb: number }[] }
type Data = { recs: BackupRec[]; restores: Restore[] }

const hAgo = (h: number) => new Date(Date.now() - h * 36e5).toISOString()
const mkHist = (size: number, failAt = -1) => Array.from({ length: 7 }, (_, i) => ({ at: hAgo(24 * i + 2), result: (i === failAt ? 'Failed' : 'Success') as 'Success' | 'Failed', sizeMb: Math.round(size * (1 - i * 0.01)) }))
/** Default backup record for a real tenant that has no stored override yet. */
export const defaultRec = (t: { slug: string; name: string; employees: number }): BackupRec => {
  const size = Math.max(40, t.employees * 2)
  return { slug: t.slug, name: t.name, region: REGIONS[0], policy: POLICIES[1], lastBackupAt: hAgo(3), lastResult: 'Success', sizeMb: size, encrypted: true, crossRegionCopy: true, history: mkHist(size) }
}
/** Only overrides and restore requests are stored; the company list itself always comes from the tenant store. */
const seed = (): Data => ({ recs: [], restores: [] })
const store = createStore<Data>('bf-backups-v2', seed)
const cur = (): Data => { const d = store.get(); return d?.recs && d?.restores ? d : seed() }
export const useBackups = () => store.use()

export const hoursSince = (iso: string, now = Date.now()) => Math.floor((now - new Date(iso).getTime()) / 36e5)
export const isStale = (r: BackupRec, now = Date.now()) => r.lastResult === 'Failed' || hoursSince(r.lastBackupAt, now) > STALE_HOURS[r.policy]
export const quarterStart = (d = new Date()) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).toISOString()
export const backupStats = (d: { recs: BackupRec[]; restores: Restore[] }, now = Date.now()) => {
  const q = quarterStart(new Date(now))
  return {
    tenants: d.recs.length, stale: d.recs.filter((r) => isStale(r, now)).length, failed: d.recs.filter((r) => r.lastResult === 'Failed').length,
    restoresQ: d.restores.filter((r) => r.status === 'Completed' && (r.completedAt ?? '') >= q).length, pending: d.restores.filter((r) => r.status === 'Requested' || r.status === 'Approved' || r.status === 'Running').length,
    crossRegion: d.recs.filter((r) => r.crossRegionCopy).length, totalGb: Math.round(d.recs.reduce((s, r) => s + r.sizeMb, 0) / 100) / 10,
  }
}

const aud = (slug: string, action: string, actor: string, to?: string, from?: string) => recordAudit(slug, action, from, to, { scope: 'Platform', actor: actor.replace(/ \(.*\)$/, ''), role: /\((.*)\)$/.exec(actor)?.[1] ?? 'Platform administrator', category: 'Settings' })
const upd = (id: string, patch: Partial<Restore>) => store.set((d) => ({ ...cur(), ...d, restores: d.restores.map((r) => (r.id === id ? { ...r, ...patch } : r)) }))

type Base = BackupRec
const patch = (b: Base, fn: (r: BackupRec) => BackupRec) => store.set((d) => { const base = d.recs.find((x) => x.slug === b.slug) ?? b; const next = fn(base); return { ...cur(), ...d, recs: [...d.recs.filter((x) => x.slug !== b.slug), next] } })
export function runBackupNow(b: Base, actor: string) {
  const at = new Date().toISOString()
  patch(b, (x) => ({ ...x, lastBackupAt: at, lastResult: 'Success', history: [{ at, result: 'Success' as const, sizeMb: x.sizeMb }, ...x.history].slice(0, 7) }))
  aud(b.slug, 'Manual backup completed', actor, 'Success')
  return null
}
/** Demo control: records a failed overnight run so the stale-backup alert and recovery path can be tried. */
export function simulateFailedBackup(b: Base, actor: string) {
  const at = new Date(Date.now() - 50 * 36e5).toISOString()
  patch(b, (x) => ({ ...x, lastBackupAt: at, lastResult: 'Failed', history: [{ at, result: 'Failed' as const, sizeMb: x.sizeMb }, ...x.history].slice(0, 7) }))
  aud(b.slug, 'Backup run failed (simulated)', actor, 'Failed')
  return null
}
export function setPolicy(b: BackupRec, actor: string, policy: BackupRec['policy'], region: BackupRec['region']) {
  if (b.policy === policy && b.region === region) return 'Nothing changed.'
  patch(b, (x) => ({ ...x, policy, region, crossRegionCopy: policy !== POLICIES[0] }))
  aud(b.slug, 'Backup policy or residency changed', actor, `${policy} · ${region}`, `${b.policy} · ${b.region}`)
  return null
}
export function requestRestore(i: { slug: string; rec: BackupRec; actor: string; pointInTime: string; scope: Restore['scope']; reason: string }): string | null {
  const r = i.rec
  if (i.reason.trim().length < 10) return 'Explain why the restore is needed (at least a sentence).'
  const t = new Date(i.pointInTime).getTime()
  if (isNaN(t) || t > Date.now()) return 'Choose a point in time in the past.'
  const retentionDays = r.policy === POLICIES[0] ? 30 : r.policy === POLICIES[1] ? 90 : 365
  if (Date.now() - t > retentionDays * 864e5) return `That point is outside the ${retentionDays}-day retention for this policy.`
  if (cur().restores.some((x) => x.slug === i.slug && ['Requested', 'Approved', 'Running'].includes(x.status))) return 'This company already has an open restore request.'
  const id = uid('RST')
  store.set((d) => ({ ...cur(), ...d, restores: [{ id, slug: i.slug, requestedBy: i.actor, requestedAt: new Date().toISOString(), pointInTime: new Date(t).toISOString(), scope: i.scope, reason: i.reason.trim(), status: 'Requested' }, ...d.restores] }))
  aud(i.slug, 'Restore requested', i.actor, `${i.scope} · ${new Date(t).toLocaleString('en-GB')}`)
  return null
}
export function decideRestore(id: string, actor: string, approve: boolean, note = ''): string | null {
  const r = cur().restores.find((x) => x.id === id); if (!r || r.status !== 'Requested') return 'This request is no longer waiting for a decision.'
  if (r.requestedBy === actor) return 'A different platform administrator must decide on a restore. You requested this one.'
  if (!approve && note.trim().length < 5) return 'Give a reason for rejecting.'
  upd(id, { status: approve ? 'Approved' : 'Rejected', decidedBy: actor, decidedAt: new Date().toISOString(), note: note.trim() })
  aud(r.slug, approve ? 'Restore approved' : 'Restore rejected', actor, id, `Requested by ${r.requestedBy}`)
  return null
}
/** Starts the (simulated) restore job and completes it after a short delay. */
export function startRestore(id: string, actor: string): string | null {
  const r = cur().restores.find((x) => x.id === id); if (!r || r.status !== 'Approved') return 'Only an approved restore can be started.'
  const rec = cur().recs.find((x) => x.slug === r.slug) ?? { sizeMb: 100 }
  upd(id, { status: 'Running' })
  aud(r.slug, 'Restore started', actor, id)
  setTimeout(() => {
    const bytes = Math.round(rec.sizeMb * (r.scope === 'Full workspace' ? 1 : r.scope === 'Documents only' ? 0.35 : 0.2) * 1e6)
    upd(id, { status: 'Completed', completedAt: new Date().toISOString(), restoredBytes: bytes })
    aud(r.slug, 'Restore completed (simulated)', actor, `${id} · ${(bytes / 1e6).toFixed(0)} MB`)
  }, 2500)
  return null
}
