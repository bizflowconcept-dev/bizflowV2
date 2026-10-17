import { createContext, useContext, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

/**
 * Single source of truth for the offboarding grace-period read-only mode.
 * OffboardingBar switches it on for the workspace it governs; shared UI (Btn, the DOM guard) reads it here.
 * Areas that must stay usable (data export, reinstate) are wrapped in <RoAllow>.
 */
let on = false
const subs = new Set<() => void>()
export const setReadOnly = (v: boolean) => { if (v !== on) { on = v; subs.forEach((f) => f()) } }
export const isReadOnlyNow = () => on
export const useReadOnly = (): boolean => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => on)

export const RO_REASON = 'Read-only: this workspace is being closed. Changes are turned off until it is reinstated.'
/** Labels that start with a write verb are treated as mutating actions. */
export const WRITE_VERB = /^\s*(save|create|add|post|approve|submit|delete|remove|send|issue|run|process|hire|assign|apply|confirm|invite|upload|generate|publish|record|reject|decline|pay|new|edit|update|log|book|start|schedule|import|sync|reset|revoke|terminate|release|transfer|sign|mark|rate|reply|resolve|close|reopen|archive|restore|rename|move|cancel|grant|retry|void|withdraw|request|set|enable|disable|link|unlink)\b/i

export const RoAllowCtx = createContext(false)
/** Wrap an area (data export, reinstatement) whose actions stay available in read-only mode. */
export function RoAllow({ children, className }: { children: ReactNode; className?: string }) {
  return <RoAllowCtx.Provider value={true}><div data-ro-allow className={className}>{children}</div></RoAllowCtx.Provider>
}
export const useRoAllowed = () => useContext(RoAllowCtx)

export const roText = (n: ReactNode): string => {
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(roText).join('')
  return ''
}
