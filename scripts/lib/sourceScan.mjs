/* Static source scanner shared by the Vite docs plugin (virtual:bizflow-source-index) and scripts/docs-check.mjs.
   It reads the real source tree so the platform documentation never relies on a hand-kept route or storage list. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const file = join(dir, name)
  return statSync(file).isDirectory() ? walk(file) : [file]
})

/** Skip a string/template literal or comment starting at i; returns the index after it, or -1 when i is not at one. */
function skipLiteral(s, i) {
  const c = s[i]
  if (c === '/' && s[i + 1] === '/') { const e = s.indexOf('\n', i); return e < 0 ? s.length : e }
  if (c === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); return e < 0 ? s.length : e + 2 }
  if (c === "'" || c === '"' || c === '`') {
    let j = i + 1
    while (j < s.length && s[j] !== c) { if (s[j] === '\\') j++; j++ }
    return j + 1
  }
  return -1
}

/** Split a source fragment on top-level commas (ignoring nested brackets, strings and comments). */
function splitTop(s) {
  const out = []; let depth = 0; let last = 0
  for (let i = 0; i < s.length;) {
    const skip = skipLiteral(s, i)
    if (skip > 0) { i = skip; continue }
    const c = s[i]
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (c === ',' && depth === 0) { out.push(s.slice(last, i)); last = i + 1 }
    i++
  }
  out.push(s.slice(last))
  return out.map((x) => x.trim()).filter(Boolean)
}

/** Index of the bracket matching the opener at `start`. */
function matching(s, start) {
  let depth = 0
  for (let i = start; i < s.length;) {
    const skip = skipLiteral(s, i)
    if (skip > 0) { i = skip; continue }
    const c = s[i]
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) { depth--; if (depth === 0) return i }
    i++
  }
  return -1
}

/** Parse the router definition in src/routes.tsx into a flat list of route records. */
export function scanRoutes(root = process.cwd()) {
  const file = join(root, 'src/routes.tsx')
  if (!existsSync(file)) return []
  const src = readFileSync(file, 'utf8')

  /* Lazy page helpers: const X = L(() => import('./p'), 'Name') and const C = (name) => L(() => import('./p'), name) */
  const consts = {}
  for (const m of src.matchAll(/const (\w+) = L\(\(\) => import\('([^']+)'\)(?:, '(\w+)')?\)/g)) consts[m[1]] = { file: m[2], name: m[3] ?? 'default' }
  const helpers = {}
  for (const m of src.matchAll(/const (\w+) = \(name[^)]*\) => L\(\(\) => (?:\(f === [^)]*\) \? )?import\('([^']+)'\)/g)) helpers[m[1]] = m[2]
  helpers.A = './pages/admin/Plans'
  const toPath = (rel) => {
    const base = 'src/' + rel.replace(/^\.\//, '')
    return ['.tsx', '.ts', '/index.tsx'].map((e) => base + e).find((p) => existsSync(join(root, p))) ?? base
  }

  const start = src.indexOf('createBrowserRouter([')
  if (start < 0) return []
  const open = src.indexOf('[', start)
  const close = matching(src, open)
  const routes = []

  const readObject = (text, parentPath, ctx) => {
    const props = {}
    for (const part of splitTop(text.slice(1, -1))) {
      const m = part.match(/^(\w+)\s*:\s*([\s\S]*)$/)
      if (m) props[m[1]] = m[2].trim()
    }
    const seg = props.path ? props.path.replace(/^['"`]|['"`]$/g, '') : ''
    const full = seg === '*' || seg.endsWith('/*') ? parentPath : seg ? (parentPath + '/' + seg).replace(/\/+/g, '/') : parentPath
    const isLayout = !props.path && !props.index && !!props.children
    const expr = props.Component ?? props.element ?? ''
    const guard = expr.match(/^guard\(([\s\S]*),\s*'(\w+)'\)$/)
    const inner = guard ? guard[1].trim() : expr
    let pageFile, pageExport
    const call = inner.match(/^(\w+)\('(\w+)'(?:,\s*'\w+')?\)$/)
    const lazy = inner.match(/^L\(\(\) => import\('([^']+)'\)(?:,\s*'(\w+)')?\)$/)
    if (call && helpers[call[1]]) { pageFile = toPath(helpers[call[1]]); pageExport = call[2] }
    else if (lazy) { pageFile = toPath(lazy[1]); pageExport = lazy[2] ?? 'default' }
    else if (consts[inner]) { pageFile = toPath(consts[inner].file); pageExport = consts[inner].name }
    const redirect = props.element?.match(/<Navigate to="([^"]+)"/)?.[1] ?? props.loader?.match(/redirect\(\s*['"`]([^'"`]+)['"`]/)?.[1]
    const authority = /BusinessWorkspace/.test(expr) ? 'company-session' : /AdminLayout/.test(expr) ? 'admin-session' : undefined
    if (props.path && !isLayout) {
      const area = full.startsWith('/admin/business/') && full !== '/admin/business/login' ? 'company'
        : full === '/admin/login' || full === '/admin/business' || full === '/admin/business/login' ? 'auth'
        : full.startsWith('/admin') ? 'platform' : full.startsWith('/w/') ? 'workspace-entry' : 'public'
      const needsGuard = area === 'platform' && !redirect
      routes.push({ path: full === '' ? '/' : full, area: ctx.area ?? area, perm: guard ? guard[2] : undefined, guarded: !!guard, needsGuard, redirect: redirect ?? undefined, pageFile, pageExport, index: false })
    } else if (props.index) {
      routes.push({ path: parentPath || '/', area: parentPath === '/admin/business' ? 'auth' : parentPath === '/admin' ? 'platform' : parentPath === '/' ? 'public' : 'public', perm: guard ? guard[2] : undefined, guarded: !!guard, needsGuard: parentPath === '/admin' && !guard && !redirect, redirect: redirect ?? undefined, pageFile, pageExport, index: true })
    }
    void authority
    if (props.children) for (const child of splitTop(props.children.slice(1, -1))) if (child.startsWith('{')) readObject(child, full, ctx)
  }
  for (const item of splitTop(src.slice(open + 1, close))) if (item.startsWith('{')) readObject(item, '', {})
  return routes.map((r) => ({ ...r, path: r.path.replace(/\/$/, '') || '/' }))
}

const KEY_RE = /^(bf|bizflow|biz)[-.:*\w]*$/i

/** Every browser storage key referenced in the source, with the files that touch it. */
export function scanStorage(root = process.cwd()) {
  const found = new Map()
  const add = (key, file, kind) => {
    const norm = key.replace(/\$\{[^}]*\}/g, '*')
    if (!KEY_RE.test(norm)) return
    const rel = relative(root, file)
    const row = found.get(norm) ?? { key: norm, files: [], kind }
    if (!row.files.includes(rel)) row.files.push(rel)
    found.set(norm, row)
  }
  for (const file of walk(join(root, 'src')).filter((f) => /\.tsx?$/.test(f))) {
    const s = readFileSync(file, 'utf8')
    for (const m of s.matchAll(/(local|session)Storage\.(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`]+)['"`]/g)) add(m[2], file, m[1] === 'local' ? 'localStorage' : 'sessionStorage')
    for (const m of s.matchAll(/createStore(?:<[^(]*>)?\(\s*['"`]([^'"`]+)['"`]/g)) add(m[1], file, 'localStorage')
    for (const m of s.matchAll(/\b(?:const|let)\s+(?:\w*(?:KEY|Key)\w*|DIGEST)\s*(?::[^=]+)?=\s*(?:\([^)]*\)\s*=>\s*)?['"`]([^'"`]+)['"`]/g)) add(m[1], file, 'localStorage')
  }
  return [...found.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** Full index: routes, storage keys and a content hash that changes whenever any source file changes. */
export function scanSource(root = process.cwd()) {
  const abs = resolve(root)
  const files = walk(join(abs, 'src')).filter((f) => /\.(tsx?|css)$/.test(f)).sort()
  const hash = createHash('sha1')
  let lines = 0
  const fileList = []
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    hash.update(relative(abs, f)).update(text)
    lines += text.split('\n').length
    fileList.push(relative(abs, f))
  }
  return {
    generatedAt: new Date().toISOString(),
    sourceHash: hash.digest('hex').slice(0, 10),
    files: fileList,
    fileCount: fileList.length,
    lineCount: lines,
    routes: scanRoutes(abs),
    storage: scanStorage(abs),
  }
}
