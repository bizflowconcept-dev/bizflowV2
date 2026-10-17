/* Loads TypeScript source modules in Node by running them through a throwaway Vite SSR server.
   Browser globals the stores touch at import time are shimmed with in-memory stand-ins. */
import { createServer } from 'vite'
import { resolve } from 'node:path'

const memoryStorage = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size } }
}

export function installBrowserShims() {
  const g = globalThis
  g.localStorage ??= memoryStorage()
  g.sessionStorage ??= memoryStorage()
  const target = new EventTarget()
  g.window ??= Object.assign(g, {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  })
  g.document ??= { documentElement: { style: {}, classList: { add() {}, remove() {}, toggle() {} } }, addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} } }
  g.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
  g.navigator ??= { userAgent: 'node', serviceWorker: undefined }
}

export async function loadModules(paths, root = process.cwd()) {
  installBrowserShims()
  const server = await createServer({ root: resolve(root), configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const out = []
    for (const p of paths) out.push(await server.ssrLoadModule(p))
    return out
  } finally {
    await server.close()
  }
}
