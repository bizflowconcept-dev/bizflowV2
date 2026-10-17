import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'

export type Flag = { key: string; name: string; desc: string; enabled: boolean; rollout: number; owner: string }
const KEY = 'bizflow.flags.v1'
const seed = (): Flag[] => [
  { key: 'ai-insights', name: 'AI insights on dashboards', desc: 'Plain-language summaries on the CEO and finance dashboards.', enabled: true, rollout: 50, owner: 'Product' },
  { key: 'bulk-payroll', name: 'Bulk payroll upload', desc: 'CSV upload for monthly payroll runs.', enabled: true, rollout: 100, owner: 'Payroll' },
  { key: 'geo-attendance', name: 'Geofenced attendance', desc: 'Clock-in only inside approved locations.', enabled: false, rollout: 0, owner: 'Attendance' },
  { key: 'vendor-portal', name: 'Vendor self-service portal', desc: 'Vendors upload compliance documents themselves.', enabled: true, rollout: 25, owner: 'Procurement' },
]
const load = (): Flag[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return Array.isArray(v) ? v : seed() } catch { return seed() } }
let list = load()
const subs = new Set<() => void>()
export const useFlags = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => list)
export function setFlag(key: string, patch: Partial<Flag>) {
  list = list.map((f) => (f.key === key ? { ...f, ...patch } : f))
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
  subs.forEach((f) => f())
  recordAudit('platform', `Feature flag changed: ${key}`, undefined, JSON.stringify(patch))
}
