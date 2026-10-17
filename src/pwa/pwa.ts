import { useEffect, useSyncExternalStore } from 'react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type Snap = { canInstall: boolean; installed: boolean; update: boolean; online: boolean; ios: boolean; sheet: boolean }

const nav = typeof navigator !== 'undefined' ? navigator : undefined
const ua = nav?.userAgent ?? ''
const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && (nav?.maxTouchPoints ?? 0) > 1)
const standalone = () => typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || (nav as unknown as { standalone?: boolean })?.standalone === true)

let deferred: InstallEvent | null = null
let waiting: ServiceWorker | null = null
let snap: Snap = { canInstall: false, installed: standalone(), update: false, online: nav?.onLine ?? true, ios, sheet: false }
const subs = new Set<() => void>()
const set = (p: Partial<Snap>) => { snap = { ...snap, ...p }; subs.forEach((f) => f()) }

export function startPwa() {
  if (typeof window === 'undefined') return
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; set({ canInstall: true }) })
  addEventListener('appinstalled', () => { deferred = null; set({ canInstall: false, installed: true }) })
  addEventListener('online', () => set({ online: true }))
  addEventListener('offline', () => set({ online: false }))
  matchMedia('(display-mode: standalone)').addEventListener('change', () => set({ installed: standalone() }))
  if (!('serviceWorker' in navigator)) return
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const watch = (w: ServiceWorker | null) => {
        if (!w) return
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { waiting = w; set({ update: true }) } })
      }
      if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; set({ update: true }) }
      reg.addEventListener('updatefound', () => watch(reg.installing))
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    }).catch(() => {})
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded || !waiting) return; reloaded = true; location.reload() })
  })
}

export const openInstall = () => set({ sheet: true })

export const usePwa = () => {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => snap, () => snap)
  return {
    ...s,
    install: async () => {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      set({ canInstall: false })
      return outcome === 'accepted'
    },
    closeSheet: () => set({ sheet: false }),
    applyUpdate: () => waiting?.postMessage('SKIP_WAITING'),
  }
}

/* ---------- per-company manifest and icons ---------- */

type Brandable = { slug: string; profile: { name: string }; brand: { primary: string; secondary: string; sidebarColor?: string | null; logo: string | null; favicon: string | null } }

const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'B'

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src })

async function renderIcon(t: Brandable, size: number, maskable: boolean): Promise<string> {
  const c = document.createElement('canvas'); c.width = c.height = size
  const g = c.getContext('2d')!
  const bg = t.brand.sidebarColor || t.brand.secondary || '#0B2530'
  const r = maskable ? 0 : size * 0.22
  g.fillStyle = bg
  g.beginPath(); g.roundRect(0, 0, size, size, r); g.fill()
  const inner = size * (maskable ? 0.5 : 0.58)
  const o = (size - inner) / 2
  let drawn = false
  const src = t.brand.logo || t.brand.favicon
  if (src) {
    try {
      const img = await loadImg(src)
      const pad = inner * 0.12
      g.fillStyle = 'rgba(255,255,255,.96)'
      g.beginPath(); g.roundRect(o - pad, o - pad, inner + pad * 2, inner + pad * 2, inner * 0.2); g.fill()
      const k = Math.min(inner / img.width, inner / img.height)
      g.drawImage(img, size / 2 - (img.width * k) / 2, size / 2 - (img.height * k) / 2, img.width * k, img.height * k)
      drawn = true
    } catch { /* fall back to initials */ }
  }
  if (!drawn) {
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.font = `700 ${size * 0.36}px "Bricolage Grotesque", Inter, system-ui, sans-serif`
    g.fillText(initialsOf(t.profile.name), size / 2, size / 2 + size * 0.02)
    g.fillStyle = t.brand.primary; g.fillRect(size * 0.32, size * 0.72, size * 0.36, size * 0.035)
  }
  const blob = await new Promise<Blob | null>((res) => { try { c.toBlob(res, 'image/png') } catch { res(null) } })
  return blob ? URL.createObjectURL(blob) : ''
}

export function useCompanyPwa(t: Brandable | undefined) {
  const slug = t?.slug
  const name = t?.profile.name
  const key = t ? [t.brand.primary, t.brand.secondary, t.brand.sidebarColor, t.brand.logo, t.brand.favicon].join('|') : ''
  useEffect(() => {
    if (!t || !slug || !name) return
    let dead = false
    const urls: string[] = []
    const link = document.querySelector<HTMLLinkElement>("link[rel='manifest']")
    const apple = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']")
    const meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']")
    const title = document.querySelector<HTMLMetaElement>("meta[name='apple-mobile-web-app-title']")
    const app = document.querySelector<HTMLMetaElement>("meta[name='application-name']")
    const prev = { link: link?.href, apple: apple?.href, meta: meta?.content, title: title?.content, app: app?.content }
    const theme = t.brand.sidebarColor || t.brand.secondary || '#0B2530'
    if (meta) meta.content = theme
    if (title) title.content = name
    if (app) app.content = name
    ;(async () => {
      const [i192, i512, m192, m512, a180] = await Promise.all([renderIcon(t, 192, false), renderIcon(t, 512, false), renderIcon(t, 192, true), renderIcon(t, 512, true), renderIcon(t, 180, true)])
      urls.push(i192, i512, m192, m512, a180)
      if (dead || !link) return
      const o = location.origin
      const short = name.length > 12 ? name.split(/\s+/)[0] : name
      const start = `${o}/w/${slug}/workspace?source=pwa`
      const manifest = {
        id: `${o}/w/${slug}`, name: `${name} · BizFlow`, short_name: short, description: `${name} workspace on BizFlow: approvals, people, payroll, finance and attendance.`,
        start_url: start, scope: `${o}/`, display: 'standalone', display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        background_color: theme, theme_color: theme, categories: ['business', 'productivity'],
        icons: [
          { src: i192, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: m192, sizes: '192x192', type: 'image/png', purpose: 'maskable' }, { src: m512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [['Clock in', 'attendance'], ['Approvals', 'approvals'], ['My tasks', 'tasks']].map(([n, p]) => ({ name: n, url: `${o}/admin/business/${p}?source=shortcut` })),
      }
      const mu = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }))
      urls.push(mu)
      link.href = mu
      if (apple && a180) apple.href = a180
    })()
    return () => {
      dead = true
      if (link && prev.link) link.href = prev.link
      if (apple && prev.apple) apple.href = prev.apple
      if (meta && prev.meta) meta.content = prev.meta
      if (title && prev.title) title.content = prev.title
      if (app && prev.app) app.content = prev.app
      setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 1000)
    }
  }, [slug, name, key]) // eslint-disable-line
}
