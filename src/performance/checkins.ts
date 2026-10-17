import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'

export type CheckIn = { id: string; slug: string; empId: string; name: string; by: string; at: string; kind: 'Recognition' | 'Coaching' | 'Improvement plan'; note: string }
const KEY = 'bizflow.perfCheckins.v1'
const load = (): CheckIn[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
let state = load()
const subs = new Set<() => void>()
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

export const useCheckIns = (slug: string, empId: string) => { useSyncExternalStore(sub, () => state); return state.filter((c) => c.slug === slug && c.empId === empId) }
export function addCheckIn(c: Omit<CheckIn, 'id' | 'at'>) {
  state = [{ ...c, id: `CHK-${Date.now().toString(36).toUpperCase()}`, at: new Date().toISOString() }, ...state]
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* quota */ }
  subs.forEach((f) => f())
  recordAudit(c.slug, `Performance ${c.kind.toLowerCase()} recorded for ${c.name}`, undefined, c.note.slice(0, 80))
}
