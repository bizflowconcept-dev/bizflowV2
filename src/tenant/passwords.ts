import { useSyncExternalStore } from 'react'
import { recordAudit } from './store'

export type ResetReq = { id: string; slug: string; email: string; name: string; at: string; status: 'Requested' | 'Reset' | 'Declined'; by?: string; handledAt?: string; note?: string }
type Override = { password: string; temp: boolean }
type State = { reqs: ResetReq[]; overrides: Record<string, Override> }

const KEY = 'bizflow.passwords.v1'
const load = (): State => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v?.reqs) return v } catch { /* ignore */ } return { reqs: [], overrides: {} } }
let state = load()
const subs = new Set<() => void>()
const commit = (n: State) => { state = n; try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* ignore */ } subs.forEach((f) => f()) }
const k = (slug: string, email: string) => `${slug}|${email.toLowerCase()}`
export const useResets = (slug?: string) => { const s = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state); return slug ? s.reqs.filter((r) => r.slug === slug) : s.reqs }

export const passwordFor = (slug: string, email: string, fallback: string) => state.overrides[k(slug, email)]?.password ?? fallback
export const mustChange = (slug: string, email: string) => !!state.overrides[k(slug, email)]?.temp

export function requestReset(slug: string, email: string, name: string) {
  if (state.reqs.some((r) => r.slug === slug && r.email.toLowerCase() === email.toLowerCase() && r.status === 'Requested')) return
  const r: ResetReq = { id: `PWR-${100 + state.reqs.length + 1}`, slug, email, name, at: new Date().toISOString(), status: 'Requested' }
  commit({ ...state, reqs: [r, ...state.reqs] })
  recordAudit(slug, 'Password reset requested', undefined, email)
}

const WORDS = ['Amber', 'Cedar', 'Delta', 'Harbor', 'Indigo', 'Maple', 'River', 'Sable']
export function resetPassword(slug: string, email: string, name: string, by: string): string {
  const temp = `${WORDS[Math.floor(Math.random() * WORDS.length)]}-${Math.random().toString(36).slice(2, 8)}-${Math.floor(1000 + Math.random() * 9000)}`
  const open = state.reqs.find((r) => r.slug === slug && r.email.toLowerCase() === email.toLowerCase() && r.status === 'Requested')
  const done: ResetReq = { id: open?.id ?? `PWR-${100 + state.reqs.length + 1}`, slug, email, name, at: open?.at ?? new Date().toISOString(), status: 'Reset', by, handledAt: new Date().toISOString() }
  commit({ reqs: [done, ...state.reqs.filter((r) => r !== open)], overrides: { ...state.overrides, [k(slug, email)]: { password: temp, temp: true } } })
  recordAudit(slug, 'Password reset by BizFlow admin', email, 'Temporary password issued')
  return temp
}
export function declineReset(id: string, by: string, note: string) {
  commit({ ...state, reqs: state.reqs.map((r) => (r.id === id ? { ...r, status: 'Declined', by, note, handledAt: new Date().toISOString() } : r)) })
}
export function setOwnPassword(slug: string, email: string, password: string) {
  commit({ ...state, overrides: { ...state.overrides, [k(slug, email)]: { password, temp: false } } })
  recordAudit(slug, 'Password changed by user', email)
}

export type Issued = { name: string; email: string; temp: string } | null
let issued: Issued = null
const isubs = new Set<() => void>()
export const useIssued = () => useSyncExternalStore((f) => { isubs.add(f); return () => { isubs.delete(f) } }, () => issued)
export const setIssued = (v: Issued) => { issued = v; isubs.forEach((f) => f()) }
