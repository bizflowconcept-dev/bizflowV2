import { useSyncExternalStore } from 'react'

/** Small persisted external store (localStorage + useSyncExternalStore), same pattern as the CRM and tenant stores. */
export function createStore<T>(key: string, seed: () => T) {
  const load = (): T => { try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw) as T } catch { /* fall through */ } return seed() }
  let value = load()
  const subs = new Set<() => void>()
  const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
  return {
    get: () => value,
    set: (next: T | ((prev: T) => T)) => {
      value = typeof next === 'function' ? (next as (p: T) => T)(value) : next
      try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full or unavailable */ }
      subs.forEach((f) => f())
    },
    use: () => useSyncExternalStore(subscribe, () => value),
  }
}

export const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
export const dayAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString()
export const fmtAt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/* Uploaded files: keep a blob URL for this session and, for files up to 2 MB, a data URL so the upload survives a reload. */
const dataUrls = new Map<string, string>()
export const PERSIST_FILE_LIMIT = 2e6
export function fileUrl(f: File, onReady?: () => void): string {
  const url = URL.createObjectURL(f)
  if (f.size <= PERSIST_FILE_LIMIT) {
    const r = new FileReader()
    r.onload = () => { dataUrls.set(url, String(r.result)); onReady?.() }
    r.readAsDataURL(f)
  }
  return url
}
/** JSON for storage: blob URLs become their data URL (or empty when the file was too large to keep). */
export const jsonWithFiles = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'string' && x.startsWith('blob:') ? dataUrls.get(x) ?? '' : x))
