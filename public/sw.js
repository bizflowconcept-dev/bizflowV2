/* BizFlow service worker: app-shell precache, offline fallback, safe runtime caching. */
const VERSION = 'bf-v1'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`
const PAGES = `${VERSION}-pages`
const PRECACHE = ['/', '/offline.html', '/manifest.webmanifest', '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/maskable-512.png', '/favicon.ico', '/brand/bizflow-logo.png', '/brand/bizflow-logo-dark.png', '/brand/bizflow-mark.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))))
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
    await self.clients.claim()
  })())
})

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting()
})

const trim = async (name, max) => {
  const c = await caches.open(name)
  const ks = await c.keys()
  if (ks.length > max) await Promise.all(ks.slice(0, ks.length - max).map((k) => c.delete(k)))
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules') || url.pathname.startsWith('/src/') || url.pathname.includes('hot-update') || url.pathname.startsWith('/.figma')) return

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const pre = await e.preloadResponse
        const res = pre || await fetch(req)
        const copy = res.clone()
        e.waitUntil(caches.open(PAGES).then((c) => c.put('/', copy)).then(() => trim(PAGES, 5)))
        return res
      } catch {
        return (await caches.match('/')) || (await caches.match('/offline.html')) || Response.error()
      }
    })())
    return
  }

  const hashed = url.pathname.startsWith('/assets/')
  const media = /\.(png|jpe?g|svg|webp|avif|ico|woff2?)$/i.test(url.pathname)
  if (hashed || media) {
    e.respondWith((async () => {
      const hit = await caches.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(ASSETS).then((c) => c.put(req, copy)).then(() => trim(ASSETS, 120))) }
      return res
    })())
    return
  }

  e.respondWith((async () => {
    try {
      const res = await fetch(req)
      if (res.ok && res.type === 'basic') { const copy = res.clone(); e.waitUntil(caches.open(ASSETS).then((c) => c.put(req, copy)).then(() => trim(ASSETS, 120))) }
      return res
    } catch {
      return (await caches.match(req)) || Response.error()
    }
  })())
})

self.addEventListener('push', (e) => {
  const d = (() => { try { return e.data.json() } catch { return { title: 'BizFlow', body: e.data ? e.data.text() : 'You have a new update.' } } })()
  e.waitUntil(self.registration.showNotification(d.title || 'BizFlow', { body: d.body, icon: '/pwa/icon-192.png', badge: '/pwa/icon-192.png', data: { url: d.url || '/admin/business/approvals' } }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = e.notification.data?.url || '/'
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) { if ('focus' in c) { await c.focus(); if ('navigate' in c) c.navigate(target); return } }
    await self.clients.openWindow(target)
  })())
})
