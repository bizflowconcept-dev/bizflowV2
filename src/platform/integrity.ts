/* Documentation integrity validators. They compare the live registry (what exists) with the hand-written prose in docsContent.ts
   (what is explained) and report gaps. Used by the Docs "Integrity" tab and by `pnpm docs:check`. Pure functions, no browser APIs. */
import { buildGraph } from './registry'
import type { Registry } from './registry'
import { ADDON_DOCS, ADMIN_PERMISSION_DOCS, COMPANY_PERMISSION_DOCS, FLOW_DOCS, GROUP_DOCS, MODULE_DOCS, PLAN_DOCS, STORAGE_DOCS } from './docsContent'

export type Severity = 'error' | 'warn' | 'info'
export type FindingFix = { label: string; /** In-app route, when the fix is made in the product. */ to?: string; /** Source file, when the fix is made in code. */ file?: string }
export type Finding = { id: string; severity: Severity; check: string; message: string; subject: string; fix: FindingFix }

const DOCS_FILE = 'src/platform/docsContent.ts'
const docsFix = (what: string): FindingFix => ({ label: what, file: DOCS_FILE })

export const CHECKS: { id: string; title: string }[] = [
  { id: 'module-undocumented', title: 'Every module is documented' },
  { id: 'prose-orphan', title: 'No prose for things that no longer exist' },
  { id: 'dep-unknown', title: 'Dependencies point to known modules' },
  { id: 'dep-cycle', title: 'No circular dependencies' },
  { id: 'module-no-screen', title: 'Every module has a screen' },
  { id: 'route-no-module', title: 'Company screens belong to a module' },
  { id: 'permission-undocumented', title: 'Every permission has prose' },
  { id: 'plan-enterprise', title: 'Enterprise carries every module' },
  { id: 'plan-undocumented', title: 'Every plan and add-on has prose' },
  { id: 'addon-unknown-feature', title: 'Add-ons grant known features' },
  { id: 'storage-undocumented', title: 'Storage keys are documented' },
]

export function runIntegrity(r: Registry): Finding[] {
  const out: Finding[] = []
  const add = (f: Omit<Finding, 'id'>) => out.push({ ...f, id: `${f.check}:${f.subject}` })
  const moduleIds = new Set(r.modules.map((m) => m.id))
  const featureKeys = new Set(r.modules.flatMap((m) => m.features.map((f) => f.key)))
  const routePaths = new Set(r.routes.map((x) => x.path))
  const storageKeys = new Set(r.storage.map((s) => s.key))

  /* Modules without prose, and prose with no module. */
  for (const m of r.modules) if (!MODULE_DOCS[m.id]) add({ severity: 'error', check: 'module-undocumented', subject: m.id, message: `Module "${m.name}" has no entry in MODULE_DOCS.`, fix: docsFix(`Add MODULE_DOCS.${m.id}`) })
  for (const id of Object.keys(MODULE_DOCS)) if (!moduleIds.has(id)) add({ severity: 'warn', check: 'prose-orphan', subject: `module:${id}`, message: `MODULE_DOCS has "${id}" but the catalog has no such module.`, fix: docsFix(`Remove or rename MODULE_DOCS.${id}`) })
  for (const g of r.groups) if (!GROUP_DOCS[g.id]) add({ severity: 'warn', check: 'module-undocumented', subject: `group:${g.id}`, message: `Module group "${g.name}" has no entry in GROUP_DOCS.`, fix: docsFix(`Add GROUP_DOCS.${g.id}`) })
  for (const id of Object.keys(GROUP_DOCS)) if (!r.groups.some((g) => g.id === id)) add({ severity: 'warn', check: 'prose-orphan', subject: `group:${id}`, message: `GROUP_DOCS has "${id}" but there is no such group.`, fix: docsFix(`Remove GROUP_DOCS.${id}`) })

  /* Orphaned prose elsewhere. */
  for (const id of Object.keys(PLAN_DOCS)) if (!r.plans.some((p) => p.id === id)) add({ severity: 'warn', check: 'prose-orphan', subject: `plan:${id}`, message: `PLAN_DOCS has "${id}" but there is no such plan.`, fix: docsFix(`Remove PLAN_DOCS.${id}`) })
  for (const id of Object.keys(ADDON_DOCS)) if (!r.addons.some((a) => a.id === id)) add({ severity: 'warn', check: 'prose-orphan', subject: `addon:${id}`, message: `ADDON_DOCS has "${id}" but there is no such add-on.`, fix: docsFix(`Remove ADDON_DOCS.${id}`) })
  for (const id of Object.keys(COMPANY_PERMISSION_DOCS)) if (!r.companyPerms.some((p) => p.key === id)) add({ severity: 'warn', check: 'prose-orphan', subject: `perm:${id}`, message: `COMPANY_PERMISSION_DOCS has "${id}" but it is not a company permission.`, fix: docsFix(`Remove COMPANY_PERMISSION_DOCS["${id}"]`) })
  for (const id of Object.keys(ADMIN_PERMISSION_DOCS)) if (!r.adminPerms.some((p) => p.key === id)) add({ severity: 'warn', check: 'prose-orphan', subject: `admin-perm:${id}`, message: `ADMIN_PERMISSION_DOCS has "${id}" but it is not a platform permission.`, fix: docsFix(`Remove ADMIN_PERMISSION_DOCS.${id}`) })
  for (const id of Object.keys(STORAGE_DOCS)) if (!/[*]/.test(id) && !storageKeys.has(id)) add({ severity: 'warn', check: 'prose-orphan', subject: `storage:${id}`, message: `STORAGE_DOCS describes "${id}" but no source file uses that key.`, fix: docsFix(`Remove STORAGE_DOCS["${id}"]`) })
  for (const f of FLOW_DOCS) {
    for (const m of f.modules) if (!moduleIds.has(m)) add({ severity: 'warn', check: 'prose-orphan', subject: `flow:${f.id}:module:${m}`, message: `Process "${f.title}" references unknown module "${m}".`, fix: docsFix(`Fix FLOW_DOCS.${f.id}.modules`) })
    for (const s of f.storage ?? []) if (!storageKeys.has(s)) add({ severity: 'warn', check: 'prose-orphan', subject: `flow:${f.id}:storage:${s}`, message: `Process "${f.title}" references unknown storage key "${s}".`, fix: docsFix(`Fix FLOW_DOCS.${f.id}.storage`) })
    for (const x of f.routes ?? []) if (x.startsWith('/') && !routePaths.has(x)) add({ severity: 'info', check: 'prose-orphan', subject: `flow:${f.id}:route:${x}`, message: `Process "${f.title}" lists route ${x}, which is not an exact route in the router (it may be a pattern or a redirect).`, fix: docsFix(`Check FLOW_DOCS.${f.id}.routes`) })
  }

  /* Dependencies. */
  const optional = Object.fromEntries(Object.entries(MODULE_DOCS).filter(([, d]) => d.optional).map(([k, d]) => [k, d.optional!]))
  const graph = buildGraph(r, optional)
  for (const x of graph.missing) add({ severity: 'error', check: 'dep-unknown', subject: `${x.from}->${x.to}`, message: `Module "${x.from}" depends on "${x.to}", which is not in the catalog.`, fix: { label: 'Fix dependencies in Module pricing', to: '/admin/billing/module-pricing' } })
  for (const c of graph.cycles) add({ severity: 'error', check: 'dep-cycle', subject: c.join('->'), message: `Circular dependency: ${c.join(' -> ')}.`, fix: { label: 'Break the cycle in Module pricing', to: '/admin/billing/module-pricing' } })

  /* Screens. */
  for (const m of r.modules) {
    if (m.routes.length || m.nav.length) continue
    const acknowledged = (MODULE_DOCS[m.id]?.limits ?? []).some((l) => /no (separate |dedicated )?(\w+ )?screen/i.test(l))
    add({ severity: acknowledged ? 'info' : 'warn', check: 'module-no-screen', subject: m.id, message: `Module "${m.name}" has no screen or sidebar entry${acknowledged ? ' (documented as a known limit)' : ''}.`, fix: acknowledged ? docsFix('Update the known limit once a screen exists') : { label: 'Add a route for the module', file: 'src/routes.tsx' } })
  }
  for (const rt of r.routes) {
    if (rt.area !== 'company' || rt.redirect || rt.index || !rt.pageFile) continue
    if (!/^\/admin\/business\/[^/]+/.test(rt.path)) continue
    if (!registryRouteModule(r, rt.path)) add({ severity: 'info', check: 'route-no-module', subject: rt.path, message: `Company screen ${rt.path} is not attributed to any module.`, fix: { label: 'Map the route in registry.ts (routeModule)', file: 'src/platform/registry.ts' } })
  }

  /* Permissions. */
  for (const p of r.companyPerms) if (!COMPANY_PERMISSION_DOCS[p.key]) add({ severity: 'error', check: 'permission-undocumented', subject: p.key, message: `Company permission "${p.key}" has no prose.`, fix: docsFix(`Add COMPANY_PERMISSION_DOCS["${p.key}"]`) })
  for (const p of r.adminPerms) if (!ADMIN_PERMISSION_DOCS[p.key]) add({ severity: 'error', check: 'permission-undocumented', subject: `admin:${p.key}`, message: `Platform permission "${p.key}" has no prose.`, fix: docsFix(`Add ADMIN_PERMISSION_DOCS.${p.key}`) })

  /* Plans and add-ons. */
  const enterprise = r.plans.find((p) => p.id === 'enterprise')
  if (enterprise) {
    for (const m of r.modules) if (m.plans.enterprise?.state !== 'included' || m.plans.enterprise?.partial) add({ severity: 'error', check: 'plan-enterprise', subject: m.id, message: `Enterprise ${m.plans.enterprise?.state === 'included' ? 'carries only part of' : 'is missing'} module "${m.name}".`, fix: { label: 'Open the Enterprise plan', to: '/admin/billing/plans/enterprise' } })
    for (const p of r.plans) if (p.id !== 'enterprise') for (const m of r.modules) if (m.plans[p.id]?.state === 'included' && m.plans.enterprise?.state !== 'included') add({ severity: 'error', check: 'plan-enterprise', subject: `${p.id}:${m.id}`, message: `${p.name} includes "${m.name}" but Enterprise does not.`, fix: { label: 'Open the Enterprise plan', to: '/admin/billing/plans/enterprise' } })
  } else add({ severity: 'warn', check: 'plan-enterprise', subject: 'missing', message: 'There is no Enterprise plan to compare against.', fix: { label: 'Open plans', to: '/admin/billing/plans' } })
  for (const p of r.plans) if (!PLAN_DOCS[p.id]) add({ severity: 'warn', check: 'plan-undocumented', subject: `plan:${p.id}`, message: `Plan "${p.name}" has no entry in PLAN_DOCS.`, fix: docsFix(`Add PLAN_DOCS.${p.id}`) })
  for (const a of r.addons) {
    if (!ADDON_DOCS[a.id]) add({ severity: 'warn', check: 'plan-undocumented', subject: `addon:${a.id}`, message: `Add-on "${a.name}" has no entry in ADDON_DOCS.`, fix: docsFix(`Add ADDON_DOCS["${a.id}"]`) })
    for (const g of a.grants) if (!featureKeys.has(g)) add({ severity: 'error', check: 'addon-unknown-feature', subject: `${a.id}:${g}`, message: `Add-on "${a.name}" grants unknown feature "${g}".`, fix: { label: 'Edit the add-on', to: '/admin/billing/addons' } })
  }

  /* Storage. */
  for (const s of r.storage) if (!STORAGE_DOCS[s.key]) add({ severity: 'info', check: 'storage-undocumented', subject: s.key, message: `${s.kind} key "${s.key}" is used by ${s.files[0] ?? 'the app'} but has no STORAGE_DOCS entry.`, fix: docsFix(`Add STORAGE_DOCS["${s.key}"]`) })

  const rank = { error: 0, warn: 1, info: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.check.localeCompare(b.check) || a.subject.localeCompare(b.subject))
}

/** True when a module claims this route (routes attributed through routeModule are recorded on each module). */
function registryRouteModule(r: Registry, path: string) {
  return r.modules.some((m) => m.routes.some((x) => x.path === path))
}

export const summarize = (findings: Finding[]) => ({
  error: findings.filter((f) => f.severity === 'error').length,
  warn: findings.filter((f) => f.severity === 'warn').length,
  info: findings.filter((f) => f.severity === 'info').length,
  pass: !findings.some((f) => f.severity === 'error'),
})

/* ---------- "What changed since your last visit" ---------- */
export const SEEN_KEY = 'bizflow.docsSeen.v1'
export type SeenSnapshot = { at: string; items: Record<string, string> }
export type ItemDiff = { kind: string; added: { id: string; label: string }[]; changed: { id: string; label: string }[]; removed: { id: string; label: string }[] }

const itemKey = (i: { kind: string; id: string }) => `${i.kind}\u0001${i.id}`

export function loadSeen(): SeenSnapshot | null {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); return v && typeof v.items === 'object' ? v : null } catch { return null }
}
export function saveSeen(r: Registry): SeenSnapshot {
  const snap: SeenSnapshot = { at: new Date().toISOString(), items: Object.fromEntries(r.items.map((i) => [`${itemKey(i)}\u0002${i.label}`, i.fp])) }
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(snap)) } catch { /* storage unavailable */ }
  return snap
}

/** Diff the current registry items against a stored snapshot, grouped by kind. With no snapshot nothing is reported (first visit). */
export function diffSeen(r: Registry, seen: SeenSnapshot | null): ItemDiff[] {
  if (!seen) return []
  const prev = new Map<string, { label: string; fp: string }>()
  for (const [k, fp] of Object.entries(seen.items)) { const [key, label] = k.split('\u0002'); prev.set(key, { label: label ?? key, fp }) }
  const byKind = new Map<string, ItemDiff>()
  const slot = (kind: string) => { let d = byKind.get(kind); if (!d) byKind.set(kind, (d = { kind, added: [], changed: [], removed: [] })); return d }
  const now = new Set<string>()
  for (const i of r.items) {
    const k = itemKey(i); now.add(k)
    const p = prev.get(k)
    if (!p) slot(i.kind).added.push({ id: i.id, label: i.label })
    else if (p.fp !== i.fp) slot(i.kind).changed.push({ id: i.id, label: i.label })
  }
  for (const [k, p] of prev) if (!now.has(k)) { const [kind, id] = k.split('\u0001'); slot(kind).removed.push({ id, label: p.label }) }
  return [...byKind.values()].sort((a, b) => a.kind.localeCompare(b.kind))
}
