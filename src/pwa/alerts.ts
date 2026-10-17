import { useSyncExternalStore } from 'react'

const KEY = 'bf-alerts'
const DIGEST = 'bf-alerts-digest'
const subs = new Set<() => void>()
const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator
const read = () => (supported && Notification.permission === 'granted' && localStorage.getItem(KEY) !== 'off' ? 'on' : supported && Notification.permission === 'denied' ? 'blocked' : 'off') as 'on' | 'off' | 'blocked'
let snap = read()
const refresh = () => { snap = read(); subs.forEach((f) => f()) }

export const useAlerts = () => ({ supported, state: useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => snap, () => snap) })

export async function enableAlerts() {
  if (!supported) return false
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  localStorage.setItem(KEY, p === 'granted' ? 'on' : 'off')
  refresh()
  return p === 'granted'
}
export function disableAlerts() { localStorage.setItem(KEY, 'off'); refresh() }

export type Digest = { title: string; to: string }
export async function sendDigest(items: Digest[], who: string) {
  if (read() !== 'on' || items.length === 0) return
  const day = new Date().toDateString() + who
  if (localStorage.getItem(DIGEST) === day) return
  localStorage.setItem(DIGEST, day)
  const reg = await navigator.serviceWorker.getRegistration()
  await reg?.showNotification(`BizFlow: ${items.length} need${items.length === 1 ? 's' : ''} your attention`, {
    body: items.slice(0, 3).map((i) => i.title).join(' · '), icon: '/pwa/icon-192.png', badge: '/pwa/icon-192.png', tag: 'bf-digest', data: { url: items[0].to },
  })
}
