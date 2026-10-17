import { useSyncExternalStore } from 'react'
import { getActor } from '../tenant/store'

export type VersionArea = 'Approval flow' | 'Finance tiers'
export type Version = { id: string; slug: string; area: VersionArea; at: string; by: string; summary: string; snapshot: unknown }

const KEY = 'bizflow.configVersions.v1'
const load = (): Version[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
let list = load()
const subs = new Set<() => void>()
export function pushVersion(slug: string, area: VersionArea, summary: string, snapshot: unknown) {
  const v: Version = { id: Math.random().toString(36).slice(2, 9), slug, area, at: new Date().toISOString(), by: getActor().name, summary, snapshot }
  list = [v, ...list].slice(0, 100)
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
  subs.forEach((f) => f())
}
export function useVersions(slug?: string) {
  const all = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => list)
  return slug ? all.filter((v) => v.slug === slug) : all
}
