import { useSyncExternalStore } from 'react'
import { recordAudit, DEPARTMENT_MODULES } from '../tenant/store'
import type { BusinessRoleKey } from '../tenant/store'
import { COMPANY_ROLES } from '../security/access'
import type { CompanyPermission } from '../security/access'
import { REQUEST_TYPES } from '../approvals/flow'
import type { FlowRule, Step } from '../approvals/flow'
import { DOC_TYPES, defaultTemplate } from '../documents/templates'
import type { Block, DocType } from '../documents/templates'
import { createStore, uid } from './persist'

/* ---------- Incidents & release notes ---------- */
export type Severity = 'Minor' | 'Major'
export type IStatus = 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved'
export type Incident = { id: string; title: string; service: string; severity: Severity; status: IStatus; startedAt: string; resolvedAt?: string; updates: { at: string; by: string; text: string }[] }
export type Release = { id: string; version: string; date: string; title: string; kind: 'Feature' | 'Improvement' | 'Fix'; items: string[] }
export const SERVICE_LIST = [
  { name: 'Web application', uptime: 99.98, err: 0.04, ms: 212 },
  { name: 'API', uptime: 99.97, err: 0.09, ms: 148 },
  { name: 'Payments gateway', uptime: 99.91, err: 0.31, ms: 640 },
  { name: 'Email and SMS delivery', uptime: 99.95, err: 0.12, ms: 1100 },
  { name: 'File storage and Sign', uptime: 100, err: 0.01, ms: 96 },
  { name: 'Background jobs', uptime: 99.93, err: 0.18, ms: 0 },
]
export const QUEUE: Record<string, number> = { 'Web application': 0, API: 0, 'Payments gateway': 14, 'Email and SMS delivery': 38, 'File storage and Sign': 3, 'Background jobs': 126 }
const ago = (h: number) => new Date(Date.now() - h * 36e5).toISOString()
const incSeed = (): Incident[] => [
  { id: 'INC-31', title: 'Payment confirmations delayed', service: 'Payments gateway', severity: 'Minor', status: 'Monitoring', startedAt: ago(5), updates: [{ at: ago(1), by: 'Seun Adeyemi', text: 'Gateway latency is falling. Monitoring.' }, { at: ago(4.5), by: 'Folake Bankole', text: 'Settlement callbacks are timing out. Provider contacted.' }] },
  { id: 'INC-30', title: 'Payslip PDF generation failing for large departments', service: 'Background jobs', severity: 'Major', status: 'Resolved', startedAt: ago(70), resolvedAt: ago(66), updates: [{ at: ago(66), by: 'Folake Bankole', text: 'Fix deployed and failed jobs replayed.' }] },
]
const relSeed = (): Release[] => [
  { id: 'R-12', version: '2026.10', date: '2026-10-06', title: 'Customer CRM and lead earnings', kind: 'Feature', items: ['Pipeline board with stage history', 'Recurring earning plans on won leads', 'CRM activity now appears in the audit trail'] },
  { id: 'R-11', version: '2026.09.2', date: '2026-09-22', title: 'Approval flow improvements', kind: 'Improvement', items: ['Per-request-type flow rules', 'Compliance and Legal optional steps'] },
  { id: 'R-10', version: '2026.09.1', date: '2026-09-09', title: 'Payroll export fixes', kind: 'Fix', items: ['PAYE schedule now respects mid-month promotions', 'Pension export header corrected'] },
]
const inc = createStore<Incident[]>('bizflow.incidents.v1', incSeed)
const rel = createStore<Release[]>('bizflow.releases.v1', relSeed)
export const useIncidents = inc.use
export const useReleases = rel.use
export function createIncident(i: Pick<Incident, 'title' | 'service' | 'severity'>, by: string) {
  const n: Incident = { ...i, id: `INC-${Math.max(0, ...inc.get().map((x) => Number(x.id.slice(4)) || 0)) + 1}`, status: 'Investigating', startedAt: new Date().toISOString(), updates: [{ at: new Date().toISOString(), by, text: 'Incident opened. We are investigating.' }] }
  inc.set((l) => [n, ...l]); recordAudit('platform', `Incident opened: ${n.id}`, undefined, `${n.service}: ${n.title}`, { category: 'Settings' })
}
export function updateIncident(id: string, status: IStatus, text: string, by: string) {
  const cur = inc.get().find((x) => x.id === id); if (!cur) return
  inc.set((l) => l.map((x) => (x.id === id ? { ...x, status, resolvedAt: status === 'Resolved' ? new Date().toISOString() : undefined, updates: [{ at: new Date().toISOString(), by, text: text || `Status changed to ${status}` }, ...x.updates] } : x)))
  recordAudit('platform', `Incident ${status === 'Resolved' ? 'resolved' : 'updated'}: ${id}`, cur.status, status, { category: 'Settings' })
}
export function publishRelease(r: Omit<Release, 'id'>) {
  rel.set((l) => [{ ...r, id: uid('R') }, ...l]); recordAudit('platform', `Release notes published: ${r.version}`, undefined, r.title, { category: 'Settings' })
}

/* ---------- Template marketplace ---------- */
export type TplKind = 'Approval flow' | 'Sign template' | 'Role set' | 'Department preset' | 'Document template'
export const TPL_KINDS: TplKind[] = ['Approval flow', 'Sign template', 'Role set', 'Department preset', 'Document template']
export type TplStatus = 'Draft' | 'Published' | 'Unpublished' | 'Retired'
export const TPL_INDUSTRIES = ['All industries', 'Financial services', 'Logistics', 'Retail', 'Professional services', 'Healthcare', 'Manufacturing']
export const TPL_FILE_MAX = 1.5e6

export type TplFile = { name: string; url: string; kind: 'pdf' | 'image' | 'other' }
export type SignerDef = { role: string; name: string; order: number }
export type RoleDef = { name: string; permissions: CompanyPermission[] }
export type DeptDef = { name: string; roleKey: BusinessRoleKey; modules: string[] }
export type TplPayload =
  | { kind: 'Approval flow'; rules: FlowRule[] }
  | { kind: 'Sign template'; body: string; signers: SignerDef[]; upload?: TplFile }
  | { kind: 'Role set'; roles: RoleDef[] }
  | { kind: 'Department preset'; departments: DeptDef[] }
  | { kind: 'Document template'; docType: DocType; blocks: Block[]; letterhead: boolean; upload?: TplFile }
export type TplSnapshot = { name: string; desc: string; tags: string[]; industry: string; payload: TplPayload }
export type TplVersion = { version: string; at: string; by: string; note: string; snapshot: TplSnapshot }
export type Template = TplSnapshot & {
  id: string; kind: TplKind; version: string; status: TplStatus; published: boolean; installs: number; updated: string; author: string
  history: TplVersion[]; installedBy: { slug: string; version: string; at: string }[]
}

/** Every company permission id that appears in a built-in company role. */
export const COMPANY_PERMS: CompanyPermission[] = [...new Set(Object.values(COMPANY_ROLES).flatMap((r) => r.can))].sort()
const MODULE_IDS = DEPARTMENT_MODULES.map((m) => m.id as string)
const ROLE_KEYS = Object.keys(COMPANY_ROLES) as BusinessRoleKey[]
const OPTIONAL = ['Compliance', 'HR', 'Legal']
const today = () => new Date().toISOString().slice(0, 10)
const sid = () => Math.random().toString(36).slice(2, 8)

/* ----- semver ----- */
export const bumpVersion = (v: string, level: 'patch' | 'minor' | 'major') => {
  const [a = 1, b = 0, c = 0] = v.split('.').map((n) => Number(n) || 0)
  return level === 'major' ? `${a + 1}.0.0` : level === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`
}

/* ----- starter / seed payloads ----- */
export const starterPayload = (kind: TplKind): TplPayload => {
  switch (kind) {
    case 'Approval flow': return { kind, rules: [{ id: `r${sid()}`, type: 'Purchase', minAmount: 1000000, steps: ['Compliance'], placement: 'after-audit' }] }
    case 'Sign template': return { kind, body: 'AGREEMENT\n\nThis agreement is made on {{start_date}} between {{company.name}} and {{employee.name}}.\n\nWrite the terms here.', signers: [{ role: 'Employee', name: '{{employee.name}}', order: 1 }, { role: 'Managing Director', name: '', order: 2 }] }
    case 'Role set': return { kind, roles: [{ name: 'Standard employee', permissions: [] }] }
    case 'Department preset': return { kind, departments: [{ name: 'Operations', roleKey: 'operations', modules: ['approvals', 'tasks', 'documents'] }] }
    default: { const d = defaultTemplate('letter'); return { kind, docType: 'letter', blocks: d.blocks, letterhead: true } }
  }
}
const SIGN_NDA = 'MUTUAL NON-DISCLOSURE AGREEMENT\n\nThis agreement is made on {{start_date}} between {{company.name}} (RC {{company.rc}}) and the counterparty named below.\n\n1. Each party may disclose confidential information to the other for the purpose of evaluating a business relationship.\n2. The receiving party shall protect that information with the same care it uses for its own, and shall not disclose it to third parties.\n3. These obligations survive for three (3) years after the date above.\n4. This agreement is governed by the laws of the Federal Republic of Nigeria.'
const SIGN_OFFER = 'OFFER OF EMPLOYMENT\n\nDear {{employee.name}},\n\nWe are pleased to offer you the position of {{employee.job_title}} in the {{employee.department}} department, starting {{start_date}}, on a gross monthly salary of {{employee.salary}}.\n\nThe first {{probation}} is a probationary period. Please sign below to accept.'
const SIGN_MSA = 'MASTER SERVICES AGREEMENT\n\nThis agreement is made on {{start_date}} between {{company.name}} ("the Client") and {{vendor.name}} ("the Vendor").\n\n1. The Vendor shall deliver the services described in each signed statement of work.\n2. Service levels are set out in Schedule A (SLA).\n3. Invoices are payable within 30 days of a valid tax invoice.\n4. Either party may terminate on 30 days written notice.'
const roleDef = (key: BusinessRoleKey): RoleDef => ({ name: COMPANY_ROLES[key].title, permissions: [...COMPANY_ROLES[key].can] })
const dept = (name: string, roleKey: BusinessRoleKey, modules: string[]): DeptDef => ({ name, roleKey, modules })
const rule = (type: string, minAmount: number, steps: Step[], placement: FlowRule['placement'] = 'after-audit'): FlowRule => ({ id: `r${sid()}`, type, minAmount, steps, placement })

const mk = (id: string, kind: TplKind, name: string, desc: string, payload: TplPayload, o: { installs: number; published?: boolean; tags?: string[]; industry?: string; version?: string }): Template => {
  const version = o.version ?? '1.0.0', snapshot: TplSnapshot = { name, desc, tags: o.tags ?? [], industry: o.industry ?? 'All industries', payload }
  const status: TplStatus = o.published === false ? 'Unpublished' : 'Published'
  return { ...snapshot, id, kind, version, status, published: status === 'Published', installs: o.installs, updated: '2026-09-18', author: 'BizFlow Product', installedBy: [], history: [{ version, at: '2026-09-18', by: 'BizFlow Product', note: 'Initial release', snapshot }] }
}
const tplSeed = (): Template[] => [
  mk('TP-1', 'Approval flow', 'Purchase approval, three-level', 'Manager, Audit and MD, with Compliance from ₦1M and Legal added from ₦5M.', { kind: 'Approval flow', rules: [rule('Purchase', 1000000, ['Compliance']), rule('Purchase', 5000000, ['Compliance', 'Legal'])] }, { installs: 41, tags: ['purchase', 'procurement'] }),
  mk('TP-2', 'Approval flow', 'Salary advance with HR review', 'HR reviews every salary advance before Audit.', { kind: 'Approval flow', rules: [rule('Salary Advance', 0, ['HR'], 'before-audit')] }, { installs: 27, tags: ['payroll', 'hr'] }),
  mk('TP-3', 'Approval flow', 'Vehicle request with Compliance', 'Compliance review on vehicle requests from ₦500,000.', { kind: 'Approval flow', rules: [rule('Vehicle', 500000, ['Compliance'])] }, { installs: 12, published: false, tags: ['fleet'], industry: 'Logistics' }),
  mk('TP-4', 'Sign template', 'Employment offer letter', 'Standard offer letter with salary, start date and probation clauses.', { kind: 'Sign template', body: SIGN_OFFER, signers: [{ role: 'Employee', name: '{{employee.name}}', order: 1 }, { role: 'HR Manager', name: '', order: 2 }] }, { installs: 58, tags: ['hr', 'offer'] }),
  mk('TP-5', 'Sign template', 'Mutual NDA', 'Two-party non-disclosure agreement, Nigerian law.', { kind: 'Sign template', body: SIGN_NDA, signers: [{ role: 'Counterparty', name: '', order: 1 }, { role: 'Managing Director', name: '', order: 2 }] }, { installs: 36, tags: ['legal', 'nda'] }),
  mk('TP-6', 'Sign template', 'Vendor service agreement', 'Master services agreement with SLA schedule.', { kind: 'Sign template', body: SIGN_MSA, signers: [{ role: 'Vendor', name: '{{vendor.name}}', order: 1 }, { role: 'Finance Manager', name: '', order: 2 }, { role: 'Managing Director', name: '', order: 3 }] }, { installs: 19, tags: ['legal', 'vendor'] }),
  mk('TP-7', 'Role set', 'Standard SME roles', 'Administrator, MD, HR, Finance, Operations and Employee with default permissions.', { kind: 'Role set', roles: (['admin', 'md', 'hr', 'finance', 'operations', 'employee'] as BusinessRoleKey[]).map(roleDef) }, { installs: 63, tags: ['access'] }),
  mk('TP-8', 'Role set', 'Regulated business roles', 'Adds Auditor and Compliance with read-only finance access.', { kind: 'Role set', roles: (['admin', 'md', 'hr', 'finance', 'auditor', 'compliance', 'employee'] as BusinessRoleKey[]).map(roleDef) }, { installs: 22, tags: ['access', 'compliance'], industry: 'Financial services' }),
  mk('TP-9', 'Department preset', 'Logistics departments', 'Operations, Fleet, Warehouse, Finance and HR with matching modules.', { kind: 'Department preset', departments: [dept('Operations', 'operations', ['approvals', 'tasks', 'procurement', 'documents', 'sign']), dept('Fleet', 'operations', ['fleet', 'assets', 'tasks', 'documents']), dept('Warehouse', 'operations', ['assets', 'procurement', 'tasks']), dept('Finance', 'finance', ['payroll', 'accounting', 'approvals', 'reports']), dept('HR', 'hr', ['people', 'payroll', 'travel', 'documents', 'sign'])] }, { installs: 17, tags: ['departments'], industry: 'Logistics' }),
  mk('TP-10', 'Department preset', 'Professional services', 'Delivery, Sales, Finance and People with CRM and Tasks on.', { kind: 'Department preset', departments: [dept('Delivery', 'manager', ['tasks', 'documents', 'sign']), dept('Sales', 'sales', ['crm', 'tasks', 'sign']), dept('Finance', 'finance', ['accounting', 'payroll', 'reports']), dept('People', 'hr', ['people', 'travel', 'documents'])] }, { installs: 9, published: false, tags: ['departments'], industry: 'Professional services' }),
  mk('TP-11', 'Document template', 'Offer letter (Nigerian SME)', 'Offer of employment with terms table, compensation and acceptance block.', { kind: 'Document template', docType: 'offer', blocks: defaultTemplate('offer').blocks, letterhead: true }, { installs: 0, tags: ['hr', 'letter'] }),
  mk('TP-12', 'Document template', 'Itemised invoice with VAT', 'Invoice with items table, 7.5% VAT and payment details.', { kind: 'Document template', docType: 'invoice', blocks: defaultTemplate('invoice').blocks, letterhead: true }, { installs: 0, tags: ['finance', 'invoice'] }),
]

/* ----- validation (also used for imports) ----- */
export const TEMPLATE_FORMAT = 'bizflow.template'
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d)
const BLOCK_TYPES = ['heading', 'rich', 'table', 'items', 'signature', 'divider', 'pagebreak']
function cleanBlock(b: unknown, errs: string[], i: number): Block | null {
  if (!b || typeof b !== 'object') { errs.push(`Block ${i + 1} is not an object.`); return null }
  const x = b as Record<string, unknown>, id = `b${sid()}${i}`, t = str(x.type)
  if (!BLOCK_TYPES.includes(t)) { errs.push(`Block ${i + 1} has unknown type "${t}".`); return null }
  switch (t) {
    case 'heading': return { id, type: 'heading', text: str(x.text), size: x.size === 'title' ? 'title' : 'section' }
    case 'rich': return { id, type: 'rich', html: str(x.html) }
    case 'table': {
      if (!Array.isArray(x.cols) || !Array.isArray(x.rows)) { errs.push(`Table block ${i + 1} needs cols and rows.`); return null }
      return { id, type: 'table', cols: x.cols.map((c) => str(c)), rows: x.rows.map((r) => (Array.isArray(r) ? r.map((c) => str(c)) : [])), header: x.header !== false, labelCol: !!x.labelCol }
    }
    case 'items': {
      if (!Array.isArray(x.rows)) { errs.push(`Items block ${i + 1} needs rows.`); return null }
      return { id, type: 'items', vat: x.vat !== false, rows: x.rows.map((r) => { const o = (r ?? {}) as Record<string, unknown>; return { desc: str(o.desc), qty: Number(o.qty) || 0, price: Number(o.price) || 0 } }) }
    }
    case 'signature': {
      if (!Array.isArray(x.signers)) { errs.push(`Signature block ${i + 1} needs signers.`); return null }
      return { id, type: 'signature', dateLine: x.dateLine !== false, signers: x.signers.map((s) => { const o = (s ?? {}) as Record<string, unknown>; return { label: str(o.label), name: str(o.name) } }) }
    }
    case 'pagebreak': return { id, type: 'pagebreak' }
    default: return { id, type: 'divider' }
  }
}
const cleanFile = (f: unknown): TplFile | undefined => {
  if (!f || typeof f !== 'object') return undefined
  const o = f as Record<string, unknown>
  return /^data:(application\/pdf|application\/(msword|vnd\.[\w.+-]+)|image\/(png|jpeg|webp|gif))[;,]/.test(str(o.url)) ? { name: str(o.name, 'file'), url: str(o.url), kind: o.kind === 'pdf' || o.kind === 'image' ? o.kind : 'other' } : undefined
}
/** Validates and normalises an untrusted payload. Returns errors instead of throwing. */
export function validatePayload(kind: TplKind, raw: unknown): { payload?: TplPayload; errors: string[] } {
  const errs: string[] = [], p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const arr = (k: string) => (Array.isArray(p[k]) ? (p[k] as unknown[]) : (errs.push(`"${k}" must be a list.`), []))
  let out: TplPayload | undefined
  if (kind === 'Approval flow') {
    const rules = arr('rules').flatMap((r, i): FlowRule[] => {
      const o = (r ?? {}) as Record<string, unknown>, steps = Array.isArray(o.steps) ? o.steps.map(String) : []
      if (!REQUEST_TYPES.includes(str(o.type))) { errs.push(`Rule ${i + 1}: unknown request type "${str(o.type)}".`); return [] }
      if (!(Number(o.minAmount) >= 0)) { errs.push(`Rule ${i + 1}: minimum amount must be zero or more.`); return [] }
      if (!steps.length || steps.some((s) => !OPTIONAL.includes(s))) { errs.push(`Rule ${i + 1}: steps must be one or more of ${OPTIONAL.join(', ')}.`); return [] }
      return [{ id: `r${sid()}`, type: str(o.type), minAmount: Number(o.minAmount), steps: [...new Set(steps)] as Step[], placement: o.placement === 'before-audit' ? 'before-audit' : 'after-audit' }]
    })
    out = { kind, rules }
  } else if (kind === 'Sign template') {
    const upload = cleanFile(p.upload), body = str(p.body)
    if (!upload && !body.trim()) errs.push('A Sign template needs body text or an uploaded file.')
    const signers = arr('signers').map((s, i) => { const o = (s ?? {}) as Record<string, unknown>; return { role: str(o.role).trim(), name: str(o.name), order: Number(o.order) || i + 1 } })
    if (!signers.length) errs.push('Add at least one signer.')
    if (signers.some((s) => !s.role)) errs.push('Every signer needs a role.')
    out = { kind, body, signers, upload }
  } else if (kind === 'Role set') {
    const roles = arr('roles').map((r, i) => {
      const o = (r ?? {}) as Record<string, unknown>, perms = Array.isArray(o.permissions) ? o.permissions.map(String) : []
      const bad = perms.filter((x) => !COMPANY_PERMS.includes(x as CompanyPermission))
      if (bad.length) errs.push(`Role ${i + 1}: unknown permission ids ${bad.join(', ')}.`)
      if (!str(o.name).trim()) errs.push(`Role ${i + 1} needs a name.`)
      return { name: str(o.name).trim(), permissions: [...new Set(perms)].filter((x) => COMPANY_PERMS.includes(x as CompanyPermission)) as CompanyPermission[] }
    })
    if (!roles.length) errs.push('Add at least one role.')
    out = { kind, roles }
  } else if (kind === 'Department preset') {
    const departments = arr('departments').map((d, i) => {
      const o = (d ?? {}) as Record<string, unknown>, mods = Array.isArray(o.modules) ? o.modules.map(String) : []
      if (!str(o.name).trim()) errs.push(`Department ${i + 1} needs a name.`)
      if (!ROLE_KEYS.includes(o.roleKey as BusinessRoleKey)) errs.push(`Department ${i + 1}: unknown role "${str(o.roleKey)}".`)
      const bad = mods.filter((m) => !MODULE_IDS.includes(m))
      if (bad.length) errs.push(`Department ${i + 1}: unknown modules ${bad.join(', ')}.`)
      return { name: str(o.name).trim(), roleKey: (ROLE_KEYS.includes(o.roleKey as BusinessRoleKey) ? o.roleKey : 'employee') as BusinessRoleKey, modules: [...new Set(mods)].filter((m) => MODULE_IDS.includes(m)) }
    })
    if (!departments.length) errs.push('Add at least one department.')
    out = { kind, departments }
  } else {
    const upload = cleanFile(p.upload), docType = str(p.docType)
    if (!DOC_TYPES.some((d) => d.v === docType)) errs.push(`Unknown document type "${docType}".`)
    const blocks = upload ? [] : arr('blocks').map((b, i) => cleanBlock(b, errs, i)).filter((b): b is Block => !!b)
    if (!upload && !blocks.length) errs.push('A document template needs at least one block or an uploaded file.')
    out = { kind, docType: (DOC_TYPES.some((d) => d.v === docType) ? docType : 'letter') as DocType, blocks, letterhead: !upload && p.letterhead !== false, upload }
  }
  return errs.length ? { errors: errs } : { payload: out, errors: [] }
}

/** Parses an exported template JSON string into an unsaved draft. */
export function parseTemplateJson(text: string): { draft?: TplSnapshot & { kind: TplKind }; errors: string[] } {
  let j: unknown
  try { j = JSON.parse(text) } catch { return { errors: ['This file is not valid JSON.'] } }
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>
  if (o.format !== TEMPLATE_FORMAT) return { errors: [`Not a BizFlow template export (expected format "${TEMPLATE_FORMAT}").`] }
  if (!TPL_KINDS.includes(o.kind as TplKind)) return { errors: [`Unknown template type "${str(o.kind)}".`] }
  const kind = o.kind as TplKind, name = str(o.name).trim()
  const r = validatePayload(kind, o.payload)
  const errors = [...(name ? [] : ['The template has no name.']), ...r.errors]
  if (errors.length || !r.payload) return { errors }
  const tags = Array.isArray(o.tags) ? o.tags.map((t) => str(t).trim().toLowerCase()).filter(Boolean).slice(0, 8) : []
  return { draft: { kind, name: name.slice(0, 120), desc: str(o.desc).slice(0, 400), tags, industry: TPL_INDUSTRIES.includes(str(o.industry)) ? str(o.industry) : 'All industries', payload: r.payload }, errors: [] }
}
export const exportTemplateJson = (t: Template) => JSON.stringify({ format: TEMPLATE_FORMAT, schema: 1, kind: t.kind, name: t.name, desc: t.desc, version: t.version, tags: t.tags, industry: t.industry, exportedAt: new Date().toISOString(), payload: t.payload }, null, 2)

/* ----- store: versioned storage with safe migration from v1 ----- */
const KEY = 'bizflow.templates.v2', KEY_V1 = 'bizflow.templates.v1', SCHEMA = 2
function normalise(raw: unknown): Template | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>, kind = o.kind as TplKind
  if (!TPL_KINDS.includes(kind) || typeof o.id !== 'string' || typeof o.name !== 'string') return null
  const seeded = tplSeed().find((s) => s.id === o.id)
  const payload = validatePayload(kind, o.payload).payload ?? seeded?.payload ?? starterPayload(kind)
  const status: TplStatus = (['Draft', 'Published', 'Unpublished', 'Retired'] as string[]).includes(str(o.status)) ? (o.status as TplStatus) : o.published ? 'Published' : 'Unpublished'
  const version = /^\d+\.\d+\.\d+$/.test(str(o.version)) ? str(o.version) : /^\d+\.\d+$/.test(str(o.version)) ? `${o.version}.0` : '1.0.0'
  const snap: TplSnapshot = { name: o.name, desc: str(o.desc), tags: Array.isArray(o.tags) ? o.tags.map(String) : [], industry: str(o.industry, 'All industries'), payload }
  const history = Array.isArray(o.history) && o.history.length ? (o.history as TplVersion[]).filter((h) => h && typeof h.version === 'string' && h.snapshot && validatePayload(kind, h.snapshot.payload).payload).map((h) => ({ ...h, snapshot: { ...h.snapshot, payload: validatePayload(kind, h.snapshot.payload).payload! } })) : []
  return {
    ...snap, id: o.id, kind, version, status, published: status === 'Published', installs: Number(o.installs) || 0, updated: str(o.updated, today()), author: str(o.author, 'BizFlow Product'),
    installedBy: Array.isArray(o.installedBy) ? (o.installedBy as Template['installedBy']).filter((i) => i && typeof i.slug === 'string') : [],
    history: history.length ? history : [{ version, at: str(o.updated, today()), by: str(o.author, 'BizFlow Product'), note: 'Initial release', snapshot: snap }],
  }
}
function loadTemplates(): Template[] {
  try {
    const cur = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (cur && cur.schema === SCHEMA && Array.isArray(cur.items)) { const l = (cur.items as unknown[]).map(normalise).filter((x): x is Template => !!x); if (l.length) return l }
    const old = JSON.parse(localStorage.getItem(KEY_V1) || 'null')
    if (Array.isArray(old)) {
      const l = old.map(normalise).filter((x): x is Template => !!x)
      const have = new Set(l.map((x) => x.id)); // new seeds (e.g. Document templates) are added once
      return [...l, ...tplSeed().filter((s) => !have.has(s.id) && s.kind === 'Document template')]
    }
  } catch { /* corrupt: reseed */ }
  return tplSeed()
}
let value = loadTemplates()
const subs = new Set<() => void>()
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
const persist = (next: Template[]) => {
  value = next
  try { localStorage.setItem(KEY, JSON.stringify({ schema: SCHEMA, items: next })) } catch { /* storage full: keep in memory */ }
  subs.forEach((f) => f())
}
export const useTemplates = () => useSyncExternalStore(subscribe, () => value)
const find = (id: string) => value.find((x) => x.id === id)
const aud = (action: string, t: Template, from: string | undefined, to: string | undefined, by: string) => recordAudit('platform', action, from, to, { category: 'Settings', ref: t.id, actor: by })
const statusOf = (s: TplStatus) => ({ status: s, published: s === 'Published', updated: today() })

export function setTemplateStatus(id: string, status: TplStatus, by: string) {
  const cur = find(id); if (!cur || cur.status === status) return
  persist(value.map((x) => (x.id === id ? { ...x, ...statusOf(status) } : x)))
  aud(`Template ${status === 'Published' ? 'published' : status === 'Retired' ? 'retired' : 'unpublished'}: ${cur.name}`, cur, cur.status, status, by)
}
export const setTemplatePublished = (id: string, published: boolean, by: string) => setTemplateStatus(id, published ? 'Published' : 'Unpublished', by)

export function addTemplate(x: { kind: TplKind; name: string; desc: string; tags?: string[]; industry?: string; payload?: TplPayload; note?: string }, by: string): string {
  const id = `TP-${Math.max(0, ...value.map((y) => Number(y.id.slice(3)) || 0)) + 1}`
  const snap: TplSnapshot = { name: x.name, desc: x.desc, tags: x.tags ?? [], industry: x.industry ?? 'All industries', payload: x.payload ?? starterPayload(x.kind) }
  const n: Template = { ...snap, id, kind: x.kind, version: '1.0.0', ...statusOf('Draft'), installs: 0, author: by, installedBy: [], history: [{ version: '1.0.0', at: today(), by, note: x.note || 'Initial draft', snapshot: snap }] }
  persist([n, ...value]); aud(`Template drafted: ${n.name}`, n, undefined, n.kind, by)
  return id
}

/** Saves edits as a new semver version. A changelog note is required. */
export function saveTemplateVersion(id: string, snap: TplSnapshot, level: 'patch' | 'minor' | 'major', note: string, by: string): string | null {
  const cur = find(id); if (!cur || !note.trim()) return null
  const version = bumpVersion(cur.version, level)
  persist(value.map((x) => (x.id === id ? { ...x, ...snap, version, updated: today(), history: [{ version, at: today(), by, note: note.trim(), snapshot: snap }, ...x.history] } : x)))
  aud(`Template edited: ${snap.name}`, cur, `v${cur.version}`, `v${version}: ${note.trim()}`, by)
  return version
}
/** Reverting restores an earlier snapshot as a NEW version, so history is never rewritten. */
export function revertTemplate(id: string, version: string, by: string): string | null {
  const cur = find(id), old = cur?.history.find((h) => h.version === version)
  if (!cur || !old) return null
  return saveTemplateVersion(id, old.snapshot, 'patch', `Reverted to v${version}`, by)
}
export function deleteTemplateDraft(id: string, by: string) {
  const cur = find(id); if (!cur || cur.status !== 'Draft' || cur.installs > 0) return
  persist(value.filter((x) => x.id !== id)); aud(`Template draft deleted: ${cur.name}`, cur, cur.status, undefined, by)
}
export function recordUpload(name: string, kind: TplKind, by: string, id: string) {
  recordAudit('platform', `Template imported from file: ${name}`, undefined, kind, { category: 'Settings', ref: id, actor: by })
}
/** Called from a company workspace when it installs a published template. */
export function recordInstall(id: string, slug: string, by: string) {
  const cur = find(id); if (!cur || cur.status !== 'Published') return
  persist(value.map((x) => (x.id === id ? { ...x, installs: x.installs + 1, installedBy: [{ slug, version: x.version, at: today() }, ...x.installedBy.filter((i) => i.slug !== slug)] } : x)))
  recordAudit(slug, `Marketplace template installed: ${cur.name}`, undefined, `v${cur.version}`, { category: 'Settings', ref: id, actor: by })
}
