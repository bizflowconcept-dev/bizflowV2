import { useSyncExternalStore } from 'react'
import { activeSlug, useTenant } from '../tenant/store'
import { isOwnDataset } from '../data/demo'
import { jsonWithFiles } from '../platform/persist'
import type { DocTemplate, ResolvedIdentity } from './templates'

export type Category = 'Employees' | 'Customers' | 'Vendors' | 'Assets' | 'Company'
export type Visibility = 'Only me' | 'HR' | 'Finance' | 'Operations' | 'Sales' | 'Company'
export const CATEGORIES: Category[] = ['Employees', 'Customers', 'Vendors', 'Assets', 'Company']
export const VISIBILITIES: Visibility[] = ['Only me', 'HR', 'Finance', 'Operations', 'Sales', 'Company']

export type DocLog = { t: string; a: string; x: string }
export type Doc = {
  id: string; name: string; category: Category; belongsTo: string; subject?: string
  version: string; expires?: string; status: 'Active' | 'Signed' | 'In signing' | 'Draft'
  visibility: Visibility; owner: string; updated: string; size: string
  summary: string; file?: { url: string; kind: 'pdf' | 'image' | 'other'; name: string }
  generated?: { template: DocTemplate; identity: ResolvedIdentity; data: Record<string, string>; inherited: boolean; recipient?: 'candidate' | 'employee' }
  log: DocLog[]
}

const D = (id: string, name: string, category: Category, belongsTo: string, owner: string, visibility: Visibility, o: Partial<Doc> = {}): Doc => ({
  id, name, category, belongsTo, owner, visibility, version: 'v1', status: 'Active', updated: '2 Oct 2026', size: '182 KB', summary: '', log: [], ...o,
})

const seedDocs = (): Doc[] => [
  D('DOC-101', 'Employment Agreement', 'Employees', 'Amaka Obi', 'Kemi Balogun', 'HR', { subject: 'Amaka Obi', version: 'v2', status: 'In signing', summary: 'Contract of employment between eTranzact International Plc and Amaka Obi, Senior Software Engineer, gross monthly salary of ₦850,000. Three of four signatures collected; waiting on the Managing Director.' }),
  D('DOC-102', 'Offer Letter', 'Employees', 'Amaka Obi', 'Kemi Balogun', 'HR', { subject: 'Amaka Obi', status: 'Signed', updated: '14 Sep 2026', summary: 'Offer of employment accepted by Amaka Obi on 14 September 2026.' }),
  D('DOC-103', 'Payslip · September 2026', 'Employees', 'Amaka Obi', 'Chinedu Eze', 'Finance', { subject: 'Amaka Obi', updated: '28 Sep 2026', size: '64 KB', summary: 'September 2026 payslip: gross ₦850,000 with PAYE, pension and NHF deductions.' }),
  D('DOC-104', 'NIN and bank verification', 'Employees', 'Amaka Obi', 'Kemi Balogun', 'HR', { subject: 'Amaka Obi', expires: '2027-03-01', size: '1.2 MB', summary: 'Identity and bank account verification on file for payroll.' }),
  D('DOC-105', 'Employment Agreement', 'Employees', 'Kunle Ogunleye', 'Kemi Balogun', 'HR', { subject: 'Kunle Ogunleye', version: 'v3', status: 'Signed', updated: '3 Jan 2026', summary: 'Contract of employment for Kunle Ogunleye, Head of Technology.' }),
  D('DOC-106', 'Salary review letter', 'Employees', 'Chinedu Eze', 'Kemi Balogun', 'HR', { subject: 'Chinedu Eze', status: 'Signed', updated: '1 Aug 2026', summary: 'Annual salary review outcome for Chinedu Eze.' }),
  D('DOC-107', 'Salary Advance Agreement', 'Employees', 'Fatima Sule', 'Kemi Balogun', 'HR', { subject: 'Fatima Sule', status: 'In signing', updated: '9 Oct 2026', summary: 'Advance against future salary for Fatima Sule, recovered through payroll. Awaiting signatures.' }),
  D('DOC-201', 'Staff Handbook 2026', 'Company', 'All staff', 'Kemi Balogun', 'Company', { version: 'v4', updated: '2 Jan 2026', size: '2.4 MB', summary: 'Working hours, leave, conduct, expenses, travel and disciplinary procedures that apply to every employee.' }),
  D('DOC-202', 'Code of Conduct', 'Company', 'All staff', 'Kemi Balogun', 'Company', { version: 'v2', updated: '2 Jan 2026', size: '420 KB', summary: 'Standards of behaviour, conflicts of interest and reporting concerns.' }),
  D('DOC-203', 'Leave and Attendance Policy', 'Company', 'All staff', 'Kemi Balogun', 'Company', { version: 'v3', updated: '15 Mar 2026', size: '310 KB', summary: 'Leave entitlements, approval rules, lateness and remote working.' }),
  D('DOC-204', 'CAC certificate of incorporation', 'Company', 'eTranzact International Plc', 'Oladapo Adebayo', 'Company', { size: '860 KB', summary: 'Certificate of incorporation issued by the Corporate Affairs Commission.' }),
  D('DOC-205', 'Tax clearance certificate 2026', 'Company', 'eTranzact International Plc', 'Chinedu Eze', 'Finance', { expires: '2026-12-31', size: '540 KB', summary: 'Federal tax clearance certificate for the 2026 filing year.' }),
  D('DOC-206', 'Audited accounts FY2025', 'Company', 'eTranzact International Plc', 'Chinedu Eze', 'Finance', { version: 'v2', status: 'Signed', updated: '30 Jun 2026', size: '3.1 MB', summary: 'Signed audited financial statements for the year ended 31 December 2025.' }),
  D('DOC-207', 'Board resolution · Q3 dividend', 'Company', 'Board', 'Oladapo Adebayo', 'Only me', { status: 'Draft', updated: '8 Oct 2026', size: '96 KB', summary: 'Draft resolution on the Q3 dividend. Visible to the owner only until it is shared.' }),
  D('DOC-301', 'Vendor agreement', 'Vendors', 'Computer Warehouse Ltd', 'Chinedu Eze', 'Finance', { version: 'v3', expires: '2026-12-31', size: '740 KB', summary: 'Supply agreement with Computer Warehouse Ltd: pricing, delivery terms and payment within 30 days.' }),
  D('DOC-302', 'Vendor tax and CAC pack', 'Vendors', 'Computer Warehouse Ltd', 'Kabiru Abdullahi', 'Operations', { expires: '2026-10-19', size: '2.0 MB', summary: 'Compliance documents collected at vendor onboarding.' }),
  D('DOC-401', 'Insurance certificate', 'Assets', 'ABJ-904-GW', 'Emmanuel Ojo', 'Operations', { expires: '2026-10-19', size: '230 KB', summary: 'Comprehensive vehicle insurance for ABJ-904-GW. Renewal is due this month.' }),
  D('DOC-402', 'Asset handover', 'Assets', 'AST-00418', 'Kabiru Abdullahi', 'Operations', { subject: 'Amaka Obi', status: 'Signed', updated: '29 Sep 2026', summary: 'Laptop AST-00418 handed to Amaka Obi and acknowledged.' }),
  D('DOC-501', 'Service contract', 'Customers', 'Nile Distribution', 'Chisom Okeke', 'Sales', { version: 'v2', expires: '2027-06-30', size: '690 KB', summary: 'Annual logistics services contract with Nile Distribution Distribution.' }),
]
/* Per-workspace stores: self-serve tenants start empty and keep their own list; other tenants share the demo seed. */
const stores = new Map<string, Doc[]>()
const keyOf = () => { const s = activeSlug(); return isOwnDataset(s) ? s : 'demo' }
/* Self-serve workspaces persist per tenant (generated documents and upload metadata); the shared demo store is saved under the 'demo' key so edits survive a reload. */
const KEY = 'bf-docs-v2:'
const loadOwn = (k: string): Doc[] => { try { const raw = localStorage.getItem(KEY + k); if (raw) { const v = JSON.parse(raw); if (Array.isArray(v)) return v as Doc[] } } catch { /* corrupt or unavailable */ } return [] }
const save = (k: string) => { try { localStorage.setItem(KEY + k, jsonWithFiles(stores.get(k) ?? [])) } catch { /* storage full or unavailable */ } }
const loadSaved = (k: string): Doc[] | null => { try { const v = JSON.parse(localStorage.getItem(KEY + k) || 'null'); if (Array.isArray(v)) return v as Doc[] } catch { /* corrupt or unavailable */ } return null }
/** Re-save the active workspace once an uploaded file has been encoded. */
export const persistDocs = () => save(keyOf())
const cur = (): Doc[] => { const k = keyOf(); let v = stores.get(k); if (!v) { v = k === 'demo' ? loadSaved(k) ?? seedDocs() : loadOwn(k); stores.set(k, v) } return v }
const put = (fn: (d: Doc[]) => Doc[]) => { const k = keyOf(); stores.set(k, fn(cur())); save(k); emit() }
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
export const useDocs = () => { useTenant(); return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, cur) }

const stamp = () => new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '')
export const addDoc = (d: Omit<Doc, 'id' | 'log'>) => put((docs) => [{ ...d, id: `DOC-${Math.floor(600 + Math.random() * 399)}`, log: [{ t: stamp(), a: d.owner, x: d.generated ? `${d.generated.recipient === 'candidate' ? 'created a candidate (not yet an employee) document from' : 'created this from'} the ${d.generated.inherited ? 'company standard' : 'variant'} template (v${d.generated.template.version})` : 'uploaded this document' }] }, ...docs])
export const removeDoc = (id: string) => put((docs) => docs.filter((d) => d.id !== id))
export const patchDoc = (id: string, patch: Partial<Doc>, log?: DocLog) => put((docs) => docs.map((d) => d.id === id ? { ...d, ...patch, log: log ? [log, ...d.log] : d.log } : d))
export const logDoc = (id: string, a: string, x: string) => patchDoc(id, {}, { t: stamp(), a, x })

/* ---------- Who can do what ---------- */
export type Viewer = { user: string; role: string; perms: string[] }
const has = (v: Viewer, p: string) => v.perms.includes('*') || v.perms.includes(p)
export const canUploadAnywhere = (v: Viewer) => has(v, 'documents.upload')
export const seesCompanyWide = (v: Viewer) => v.perms.includes('*') || v.perms.includes('people.manage') || v.perms.includes('documents.upload')

export function accessOf(d: Doc, v: Viewer) {
  const admin = v.perms.includes('*')
  const reviewer = v.role === 'auditor' || v.role === 'compliance'
  const owner = d.owner === v.user
  const subject = d.subject === v.user
  const dept =
    d.visibility === 'Company' ||
    (d.visibility === 'HR' && (has(v, 'people.manage') || has(v, 'people.create') || has(v, 'documents.upload'))) ||
    (d.visibility === 'Finance' && (has(v, 'payroll.view') || has(v, 'accounting.post') || has(v, 'billing.manage'))) ||
    (d.visibility === 'Operations' && (has(v, 'assets.create') || has(v, 'procurement.create'))) ||
    (d.visibility === 'Sales' && has(v, 'crm.create'))
  const view = admin || owner || subject || dept || (reviewer && d.visibility !== 'Only me')
  const download = view && (admin || owner || subject || d.visibility === 'Company' || (dept && !reviewer))
  const manage = admin || owner || (dept && has(v, 'documents.upload'))
  const why = !view ? '' : admin ? 'Company administrator' : owner ? 'You uploaded this' : subject ? 'This is your record' : d.visibility === 'Company' ? 'Shared with everyone' : reviewer ? 'Read-only review access' : `Shared with ${d.visibility}`
  return { view, download, manage, why }
}
