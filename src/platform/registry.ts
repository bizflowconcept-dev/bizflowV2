/* Platform registry. Everything here is DERIVED at runtime from the code that actually runs the product:
   the billing catalog, tenant module catalog, role and permission tables, navigation, the scanned route table and storage keys,
   approval and document vocabularies, and the health model. Nothing in this file is a hand-kept list of modules, plans or routes.
   Prose lives separately in docsContent.ts and is cross-checked against this registry by integrity.ts and scripts/docs-check.mjs. */
import { ALL_FEATURES, GROUPS, MODULES, MODULE_DEPS, LIMIT_DEFS, ROUTE_MODULE, STATUS_META, addonPrice, depsOf, fmtLimit, getBilling, modelOf, moduleKeys, planCost, publicPlans } from '../data/billing'
import type { Addon, Availability, BillingModel, BillingState, GroupId, LimitKey, Plan } from '../data/billing'
import { AUDIT_CATEGORIES, DEPARTMENT_MODULES, MODULE_LIST, TENANT_MODULE_DEPS, TIERS } from '../tenant/store'
import type { BusinessRoleKey } from '../tenant/store'
import { COMPANY_PERMISSIONS, COMPANY_ROLES } from '../security/access'
import type { AuthAudience } from '../security/access'
import { ADMIN_NAV, ADMIN_ROLES, DEPARTMENTS, PERMS } from '../pages/admin/roles'
import type { Perm } from '../pages/admin/roles'
import { NAV_DATA, NAV_TENANT_MODULE } from '../components/app/navData'
import { CHANNELS, NTYPES } from '../notifications/types'
import { AREAS, COMPANY_CONTROLLED_AREAS, PLATFORM_AREAS, TEMPLATES as APPROVAL_TEMPLATES } from './changes'
import { OPTIONAL_STEPS, REQUEST_TYPES, STEP_ROLES } from '../approvals/flow'
import { DEFAULT_LIMIT, DESK_LABEL } from '../finance/policy'
import { DOC_TYPES, MERGE_GROUPS } from '../documents/templates'
import { DEPT_TEMPLATES } from '../tasks/departments'
import { HEALTH_BANDS, HEALTH_MODEL } from './health'
import { getSchedule as dunningSchedule } from './dunning'
import type { ScannedRoute, ScannedStorage, SourceIndex } from '../../scripts/lib/sourceScan.mjs'

export type { Availability, BillingModel, ScannedRoute, ScannedStorage, SourceIndex }

/* ---------- Vocabulary bridges (the only hand-kept mappings; each is validated by integrity.ts) ---------- */
/** Tenant module catalog id -> billing module id (the two catalogs grew separately). */
export const TENANT_TO_BILLING: Record<string, string> = { hr: 'people' }
/** Sidebar page key -> billing module id. */
export const NAV_TO_BILLING: Record<string, string> = { organization: 'orgchart', 'audit-trail': 'audit' }
/** Top-level source folder -> the module that owns the data stored from it. */
const DIR_MODULE: Record<string, string> = { crm: 'crm', leave: 'leave', exit: 'exit', attendance: 'attendance', rules: 'rules', performance: 'performance', documents: 'documents', tasks: 'tasks', approvals: 'approvals', finance: 'accounting', compliance: 'audit', security: 'security', billing: 'security' }
/** Company permission prefix -> module. Anything else is reported as platform-wide. */
const PERM_PREFIX_MODULE: Record<string, string> = { people: 'people', attendance: 'attendance', leave: 'leave', organization: 'orgchart', payroll: 'payroll', accounting: 'accounting', approvals: 'approvals', finance: 'approvals', payments: 'payroll', procurement: 'procurement', assets: 'assets', fleet: 'fleet', crm: 'crm', documents: 'documents', sign: 'sign', reports: 'reports', employee: 'rules' }

export const PLAN_ORDER = ['starter', 'growth', 'business', 'enterprise']
export const AUDIENCES: AuthAudience[] = ['bizflow-platform', 'bizflow-company', 'bizflow-support-diagnostics']

/* ---------- Types ---------- */
export type PlanCell = { state: 'included' | 'addon' | 'none'; partial: boolean }
export type RegAddon = { id: string; name: string; category: string; active: boolean; grants: string[]; modules: string[]; limitBoosts: Partial<Record<LimitKey, number | null>>; plans: string[]; monthlyNGN?: number; annualNGN?: number }
export type RegModule = {
  id: string; name: string; group: GroupId; groupName: string
  features: { key: string; name: string }[]
  importance?: string; summary?: string; priced: boolean; billingModel?: BillingModel; fromNGN?: number
  requires: string[]; requiredBy: string[]
  plans: Record<string, PlanCell>; minPlan?: string
  addons: RegAddon[]; bundles: string[]
  permissions: string[]
  nav: { label: string; to: string; group: string; key: string }[]
  routes: ScannedRoute[]
  storage: ScannedStorage[]
  tenantModule?: { id: string; name: string; tier: string }
  departmentModule?: { id: string; name: string; features: string[] }
  rolesWithAccess: { role: BusinessRoleKey; title: string }[]
}
export type RegPlan = { id: string; name: string; order: number; custom: boolean; status: string; trialDays: number; includedEmployees: number; prices: Record<string, { monthly: number; annual: number }>; limits: Record<LimitKey, number | null>; moduleCount: number; featureCount: number; highlights: string[] }
export type RegCompanyPerm = { key: string; module: string; roles: { role: BusinessRoleKey; title: string }[]; departmentFeatures: string[] }
export type RegAdminPerm = { key: Perm; label: string; roles: string[]; nav: { label: string; to: string }[]; routes: string[] }
export type RegCompanyRole = { key: BusinessRoleKey; title: string; scope: string; permissions: string[]; modules: string[] }
export type RegAdminRole = { key: string; title: string; department: string; scope: string; permissions: Perm[]; mfa: string }
export type RegItem = { kind: string; id: string; label: string; fp: string }

export type Registry = {
  generatedAt: string; sourceHash: string; fileCount: number; lineCount: number
  modules: RegModule[]; groups: { id: GroupId; name: string }[]
  plans: RegPlan[]; addons: RegAddon[]
  bundles: { id: string; name: string; description: string; moduleIds: string[]; discountPct: number; active: boolean }[]
  limits: { key: LimitKey; label: string; unit: string; period?: string }[]
  currencies: string[]
  companyPerms: RegCompanyPerm[]; adminPerms: RegAdminPerm[]
  companyRoles: RegCompanyRole[]; adminRoles: RegAdminRole[]
  adminNav: { group: string; label: string; to: string; perm: Perm }[]
  companyNav: { group: string; label: string; to: string; key: string; module?: string }[]
  routes: ScannedRoute[]; storage: ScannedStorage[]
  tenantCatalog: { id: string; name: string; tier: string; billingId: string }[]
  tiers: string[]
  tenantDeps: Record<string, string[]>
  departmentModules: { id: string; name: string; features: { id: string; name: string; permission?: string }[] }[]
  notificationTypes: string[]; channels: string[]
  approval: { steps: string[]; optionalSteps: { id: string; label: string; desc: string }[]; requestTypes: string[]; stepRoles: Record<string, string[]>; templates: { id: string; name: string; desc: string; rules: number }[]; financeDefaultLimit: number; desks: string[]; changeAreas: string[]; platformAreas: string[]; companyControlled: string[] }
  documents: { types: { v: string; n: string; group: string }[]; mergeGroups: { group: string; fields: { key: string; label: string }[] }[] }
  taskDepartments: { name: string; templates: number }[]; platformDepartments: string[]
  health: { model: { key: string; name: string; max: number; rule: string }[]; bands: { label: string; min: number }[] }
  dunning: { step: string; day: number; note: string }[]
  statuses: { id: string; label: string }[]
  auditCategories: string[]
  audiences: AuthAudience[]
  items: RegItem[]
  stats: { modules: number; features: number; plans: number; addons: number; bundles: number; companyPerms: number; adminPerms: number; routes: number; storageKeys: number }
}

/* ---------- Helpers ---------- */
export const hash = (input: string) => { let h = 5381; for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : x))
const fp = (v: unknown) => hash(stable(v))
const moduleIds = new Set(MODULES.map((m) => m.id))
const navModule = (key: string) => { const id = NAV_TO_BILLING[key] ?? key; return moduleIds.has(id) ? id : undefined }
const permModule = (perm: string) => PERM_PREFIX_MODULE[perm.split('.')[0]] ?? 'platform'
const roleTitle = (k: BusinessRoleKey) => COMPANY_ROLES[k].title

/** Route path -> billing module, using the first segment after /admin/business. */
const SETTINGS_SUB_MODULE: Record<string, string> = { 'employee-rules': 'rules', branding: 'branding', 'document-templates': 'documents', approvals: 'approvals', finance: 'approvals', activity: 'audit' }
export function routeModule(path: string): string | undefined {
  if (/^\/w\/:slug\/onboarding/.test(path)) return 'onboarding'
  const sub = path.match(/^\/admin\/business\/settings\/([^/]+)/)
  if (sub) return SETTINGS_SUB_MODULE[sub[1]]
  const m = path.match(/^\/admin\/business\/([^/]+)/)
  if (!m) return undefined
  const seg = m[1]
  return navModule(seg) ?? (ROUTE_MODULE[seg] && moduleIds.has(ROUTE_MODULE[seg]) ? ROUTE_MODULE[seg] : undefined)
}

function regAddon(a: Addon): RegAddon {
  const n = a.prices.NGN
  return { id: a.id, name: a.name, category: a.category, active: a.active, grants: a.grants, modules: [...new Set(a.grants.map((g) => g.split('.')[0]))], limitBoosts: a.limitBoosts, plans: a.plans, monthlyNGN: n?.monthly, annualNGN: n?.annual }
}

/** Build the registry. `source` is the scanned route/storage index (virtual module in the browser, scanSource in Node). */
export function buildRegistry(source: SourceIndex, billing: BillingState = getBilling()): Registry {
  const plans = [...billing.plans].sort((a, b) => a.order - b.order)
  const addons = billing.addons.map(regAddon)

  /* Navigation */
  const companyNav = NAV_DATA.flatMap((g) => g.items.map((i) => ({ group: g.g, label: i.n, to: i.to, key: i.m, module: navModule(i.m) })))
  const adminNav = ADMIN_NAV.flatMap((g) => g.items.map(([label, to, perm]) => ({ group: g.g, label, to, perm })))

  /* Permissions */
  const companyPerms: RegCompanyPerm[] = COMPANY_PERMISSIONS.map((key) => ({
    key,
    module: permModule(key),
    roles: (Object.keys(COMPANY_ROLES) as BusinessRoleKey[]).filter((r) => (COMPANY_ROLES[r].can as readonly string[]).includes(key)).map((r) => ({ role: r, title: roleTitle(r) })),
    departmentFeatures: DEPARTMENT_MODULES.flatMap((d) => d.features.filter((f) => 'permission' in f && f.permission === key).map((f) => f.id)),
  }))
  const adminRoles: RegAdminRole[] = Object.entries(ADMIN_ROLES).map(([key, r]) => ({ key, title: r.title, department: r.department, scope: r.scope, permissions: [...r.can], mfa: r.mfa }))
  const platformRoutes = source.routes.filter((r) => r.area === 'platform')
  const adminPerms: RegAdminPerm[] = (Object.keys(PERMS) as Perm[]).map((key) => ({
    key,
    label: PERMS[key],
    roles: adminRoles.filter((r) => r.permissions.includes(key)).map((r) => r.key),
    nav: adminNav.filter((n) => n.perm === key).map((n) => ({ label: n.label, to: n.to })),
    routes: platformRoutes.filter((r) => r.perm === key).map((r) => r.path),
  }))
  const companyRoles: RegCompanyRole[] = (Object.keys(COMPANY_ROLES) as BusinessRoleKey[]).map((key) => ({ key, title: COMPANY_ROLES[key].title, scope: COMPANY_ROLES[key].scope, permissions: [...COMPANY_ROLES[key].can], modules: [...COMPANY_ROLES[key].modules] }))

  /* Modules */
  const requiredBy: Record<string, string[]> = {}
  for (const m of MODULES) for (const d of depsOf(billing, m.id)) (requiredBy[d] ??= []).push(m.id)
  const coreEnabledPlans = plans
  const modules: RegModule[] = MODULES.map((m) => {
    const rate = billing.modulePrices.find((r) => r.moduleId === m.id)
    const band = rate?.bands.find((b) => !b.custom) ?? rate?.bands[0]
    const cells: Record<string, PlanCell> = {}
    for (const p of coreEnabledPlans) {
      const keys = moduleKeys(m.id)
      const n = keys.filter((k) => p.features.includes(k)).length
      if (n > 0) cells[p.id] = { state: 'included', partial: n < keys.length }
      else if (billing.addons.some((a) => a.active && a.plans.includes(p.id) && a.grants.some((g) => keys.includes(g)))) cells[p.id] = { state: 'addon', partial: false }
      else cells[p.id] = { state: 'none', partial: false }
    }
    const nav = companyNav.filter((n) => n.module === m.id).map((n) => ({ label: n.label, to: n.to, group: n.group, key: n.key }))
    const routes = source.routes.filter((r) => (r.area === 'company' || r.area === 'workspace-entry') && routeModule(r.path) === m.id)
    const dir = (f: string) => f.split('/')[1]
    const storage = source.storage.filter((s) => s.files.some((f) => DIR_MODULE[dir(f)] === m.id) || s.files.some((f) => new RegExp(`^src/(pages/app|pages/tenant)/${m.id}\\b`, 'i').test(f)))
    const tm = MODULE_LIST.find((t) => (TENANT_TO_BILLING[t.id] ?? t.id) === m.id)
    const dm = DEPARTMENT_MODULES.find((d) => d.id === m.id)
    const keysSet = new Set(nav.map((n) => n.key))
    const rolesWithAccess = (Object.keys(COMPANY_ROLES) as BusinessRoleKey[]).filter((r) => COMPANY_ROLES[r].modules.some((x) => keysSet.has(x))).map((r) => ({ role: r, title: roleTitle(r) }))
    return {
      id: m.id, name: m.name, group: m.group, groupName: GROUPS.find((g) => g.id === m.group)?.name ?? m.group,
      features: m.features, importance: rate?.importance, summary: rate?.summary, priced: !!rate, billingModel: rate ? modelOf(rate) : undefined,
      fromNGN: band?.prices.NGN?.monthly,
      requires: depsOf(billing, m.id), requiredBy: requiredBy[m.id] ?? [],
      plans: cells,
      minPlan: publicPlans(billing).find((p) => cells[p.id]?.state === 'included')?.id,
      addons: addons.filter((a) => a.modules.includes(m.id)),
      bundles: billing.bundles.filter((b) => b.moduleIds.includes(m.id)).map((b) => b.id),
      permissions: companyPerms.filter((p) => p.module === m.id).map((p) => p.key),
      nav, routes, storage,
      tenantModule: tm ? { id: tm.id, name: tm.name, tier: tm.tier } : undefined,
      departmentModule: dm ? { id: dm.id, name: dm.name, features: dm.features.map((f) => f.id) } : undefined,
      rolesWithAccess,
    }
  })

  /* Plans */
  const regPlans: RegPlan[] = plans.map((p: Plan) => ({
    id: p.id, name: p.name, order: p.order, custom: p.model === 'custom', status: p.status, trialDays: p.trialDays, includedEmployees: p.includedEmployees,
    prices: Object.fromEntries(Object.entries(p.prices).map(([c, v]) => [c, { monthly: v.monthly, annual: v.annual }])),
    limits: p.limits, moduleCount: modules.filter((m) => m.plans[p.id]?.state === 'included').length, featureCount: p.features.length, highlights: p.highlights,
  }))

  const registry: Registry = {
    generatedAt: source.generatedAt, sourceHash: source.sourceHash, fileCount: source.fileCount, lineCount: source.lineCount,
    modules, groups: GROUPS, plans: regPlans, addons,
    bundles: billing.bundles.map((b) => ({ id: b.id, name: b.name, description: b.description, moduleIds: b.moduleIds, discountPct: b.discountPct, active: b.active })),
    limits: LIMIT_DEFS, currencies: billing.currencies.filter((c) => c.enabled).map((c) => c.code),
    companyPerms, adminPerms, companyRoles, adminRoles, adminNav, companyNav,
    routes: source.routes, storage: source.storage,
    tenantCatalog: MODULE_LIST.map((t) => ({ id: t.id, name: t.name, tier: t.tier, billingId: TENANT_TO_BILLING[t.id] ?? t.id })),
    tiers: [...TIERS], tenantDeps: TENANT_MODULE_DEPS,
    departmentModules: DEPARTMENT_MODULES.map((d) => ({ id: d.id, name: d.name, features: d.features.map((f) => ({ id: f.id, name: f.name, permission: 'permission' in f ? f.permission : undefined })) })),
    notificationTypes: [...NTYPES], channels: CHANNELS.map((c) => c[1]),
    approval: {
      steps: ['Manager', 'Audit', 'MD', ...OPTIONAL_STEPS.map((s) => s.id)], optionalSteps: OPTIONAL_STEPS.map((s) => ({ id: s.id, label: s.label, desc: s.desc })), requestTypes: REQUEST_TYPES, stepRoles: STEP_ROLES,
      templates: APPROVAL_TEMPLATES.map((t) => ({ id: t.id, name: t.name, desc: t.desc, rules: t.rules.length })), financeDefaultLimit: DEFAULT_LIMIT, desks: Object.values(DESK_LABEL),
      changeAreas: [...AREAS], platformAreas: [...PLATFORM_AREAS], companyControlled: [...COMPANY_CONTROLLED_AREAS],
    },
    documents: { types: DOC_TYPES, mergeGroups: MERGE_GROUPS.map((g) => ({ group: g.group, fields: g.fields.map((f) => ({ key: f.key, label: f.label })) })) },
    taskDepartments: Object.entries(DEPT_TEMPLATES).map(([name, t]) => ({ name, templates: t.length })), platformDepartments: [...DEPARTMENTS],
    health: { model: HEALTH_MODEL.map((h) => ({ key: h.key, name: h.name, max: h.max, rule: h.rule })), bands: HEALTH_BANDS.map((b) => ({ label: b.label, min: b.min })) },
    dunning: dunningSchedule(), statuses: Object.entries(STATUS_META).map(([id, v]) => ({ id, label: v.label })),
    auditCategories: [...AUDIT_CATEGORIES], audiences: AUDIENCES,
    items: [],
    stats: { modules: MODULES.length, features: ALL_FEATURES.length, plans: plans.length, addons: addons.length, bundles: billing.bundles.length, companyPerms: companyPerms.length, adminPerms: adminPerms.length, routes: source.routes.length, storageKeys: source.storage.length },
  }

  /* Fingerprints drive the changelog's "new since you last looked" diff. */
  const items: RegItem[] = []
  const add = (kind: string, id: string, label: string, value: unknown) => items.push({ kind, id, label, fp: fp(value) })
  for (const m of modules) add('module', m.id, m.name, { n: m.name, f: m.features, r: m.requires, p: m.plans, a: m.addons.map((a) => a.id), c: m.permissions, nav: m.nav.map((n) => n.to), rt: m.routes.map((r) => r.path), price: m.fromNGN })
  for (const p of regPlans) add('plan', p.id, p.name, p)
  for (const a of addons) add('addon', a.id, a.name, a)
  for (const b of registry.bundles) add('bundle', b.id, b.name, b)
  for (const p of companyPerms) add('permission', p.key, p.key, p.roles.map((r) => r.role))
  for (const p of adminPerms) add('admin-permission', p.key, p.label, { r: p.roles, n: p.nav })
  for (const r of source.routes) add('route', `${r.area}:${r.path}${r.index ? '#index' : ''}`, r.path, { g: r.perm, p: r.pageFile, rd: r.redirect })
  for (const s of source.storage) add('storage', s.key, s.key, s.kind)
  for (const t of registry.approval.templates) add('approval-template', t.id, t.name, t)
  for (const t of registry.documents.types) add('doc-type', t.v, t.n, t)
  for (const n of NTYPES) add('notification', n, n, n)
  registry.items = items
  return registry
}

export const moduleName = (r: Registry, id: string) => r.modules.find((m) => m.id === id)?.name ?? id
export const planName = (r: Registry, id: string) => r.plans.find((p) => p.id === id)?.name ?? id
export const fmtNaira = (n?: number) => (n === undefined ? 'n/a' : '₦' + Math.round(n).toLocaleString('en-NG'))
export { fmtLimit, MODULE_DEPS, addonPrice, planCost }

/* ---------- Dependency graph ---------- */
export type GraphEdge = { from: string; to: string; kind: 'requires' | 'optional'; missing: boolean; inCycle: boolean }
export type Graph = { nodes: { id: string; name: string; group: GroupId; layer: number; inCycle: boolean; missingDeps: string[] }[]; edges: GraphEdge[]; cycles: string[][]; missing: { from: string; to: string }[] }

/** Dependency graph with cycle and missing-target detection. `optional` is merged in from prose by the caller. */
export function buildGraph(r: Registry, optional: Record<string, string[]> = {}): Graph {
  const known = new Set(r.modules.map((m) => m.id))
  const reqs: Record<string, string[]> = Object.fromEntries(r.modules.map((m) => [m.id, m.requires]))
  const cycles: string[][] = []
  const state: Record<string, 0 | 1 | 2> = {}
  const stack: string[] = []
  const visit = (id: string) => {
    state[id] = 1; stack.push(id)
    for (const d of reqs[id] ?? []) {
      if (!known.has(d)) continue
      if (state[d] === 1) cycles.push([...stack.slice(stack.indexOf(d)), d])
      else if (!state[d]) visit(d)
    }
    stack.pop(); state[id] = 2
  }
  for (const id of known) if (!state[id]) visit(id)
  const cycleNodes = new Set(cycles.flat())
  const cycleEdge = (a: string, b: string) => cycles.some((c) => c.some((x, i) => x === a && c[i + 1] === b))
  const layers: Record<string, number> = {}
  const layerOf = (id: string, seen = new Set<string>()): number => {
    if (layers[id] !== undefined) return layers[id]
    if (seen.has(id)) return 0
    seen.add(id)
    const ds = (reqs[id] ?? []).filter((d) => known.has(d))
    return (layers[id] = ds.length ? 1 + Math.max(...ds.map((d) => layerOf(d, seen))) : 0)
  }
  const edges: GraphEdge[] = []
  const missing: { from: string; to: string }[] = []
  for (const m of r.modules) {
    for (const d of m.requires) { const miss = !known.has(d); if (miss) missing.push({ from: m.id, to: d }); edges.push({ from: m.id, to: d, kind: 'requires', missing: miss, inCycle: cycleEdge(m.id, d) }) }
    for (const d of optional[m.id] ?? []) { const miss = !known.has(d); if (miss) missing.push({ from: m.id, to: d }); edges.push({ from: m.id, to: d, kind: 'optional', missing: miss, inCycle: false }) }
  }
  return {
    nodes: r.modules.map((m) => ({ id: m.id, name: m.name, group: m.group, layer: layerOf(m.id), inCycle: cycleNodes.has(m.id), missingDeps: m.requires.filter((d) => !known.has(d)) })),
    edges, cycles, missing,
  }
}
