import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'

export type BreakGlass = {
  id: string; slug: string; incident: string; reason: string; requestedBy: string; requestedAt: string
  status: 'Requested' | 'Active' | 'Rejected' | 'Expired'; approvedBy?: string; approvedAt?: string; expires?: string
  scopes: ('Tenant metadata' | 'Authentication recovery' | 'Integration configuration' | 'Redacted error telemetry')[]
}

const KEY = 'bf-break-glass-v1'
const load = (): BreakGlass[] => { try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] } }
let state = load()
const listeners = new Set<() => void>()
const emit = () => { localStorage.setItem(KEY, JSON.stringify(state)); listeners.forEach((listener) => listener()) }
const expire = (items: BreakGlass[]) => items.map((item) => item.status === 'Active' && item.expires && Date.now() >= Date.parse(item.expires) ? { ...item, status: 'Expired' as const } : item)

export const useBreakGlass = (slug?: string) => {
  const all = useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => {
    const next = expire(state)
    if (next.some((item, index) => item !== state[index])) { state = next; queueMicrotask(emit) }
    return state
  })
  return slug ? all.filter((item) => item.slug === slug) : all
}

export function requestBreakGlass(slug: string, incident: string, reason: string, requestedBy: string) {
  const entry: BreakGlass = {
    id: `BRK-${Date.now().toString(36).toUpperCase()}`, slug, incident, reason, requestedBy, requestedAt: new Date().toISOString(), status: 'Requested',
    scopes: ['Tenant metadata', 'Authentication recovery', 'Integration configuration', 'Redacted error telemetry'],
  }
  state = [entry, ...state]
  recordAudit(slug, 'Emergency access requested', incident, reason, { scope: 'Platform', actor: requestedBy, role: 'Platform Super Admin', category: 'Security' })
  emit()
  return entry.id
}

export function decideBreakGlass(id: string, approved: boolean, by: string) {
  const entry = state.find((item) => item.id === id)
  if (!entry || entry.status !== 'Requested') return 'Request is no longer pending.'
  if (entry.requestedBy === by) return 'A different platform administrator must approve emergency access.'
  const now = new Date()
  state = state.map((item) => item.id === id ? {
    ...item, status: approved ? 'Active' : 'Rejected', approvedBy: by, approvedAt: now.toISOString(),
    expires: approved ? new Date(now.getTime() + 30 * 60000).toISOString() : undefined,
  } : item)
  recordAudit(entry.slug, approved ? 'Emergency diagnostics approved' : 'Emergency access rejected', entry.incident, approved ? '30 minutes · restricted scopes' : entry.reason, { scope: 'Platform', actor: by, role: 'Platform Super Admin', category: 'Security' })
  emit()
  return null
}

export function closeBreakGlass(id: string, by: string) {
  const entry = state.find((item) => item.id === id)
  if (!entry) return
  state = state.map((item) => item.id === id ? { ...item, status: 'Expired' } : item)
  recordAudit(entry.slug, 'Emergency diagnostics closed', entry.incident, undefined, { scope: 'Platform', actor: by, role: 'Platform Super Admin', category: 'Security' })
  emit()
}
