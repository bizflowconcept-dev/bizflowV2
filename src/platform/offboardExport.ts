import type { Employee } from '../data/demo'
import type { Doc } from '../documents/store'
import type { ExitCase } from '../exit/store'
import type { AuditEntry } from '../tenant/store'
import { auditCsv } from '../security/auditChain'
import { sha256 } from '../security/auditChain'
import type { ExportFile, Offboarding } from './offboarding'

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`
const csv = (head: string[], rows: unknown[][]) => [head.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\n') + '\n'

export type ExportCtx = { employees: Employee[]; docs: Doc[]; exits: ExitCase[]; audit: AuditEntry[] ; real?: boolean }
export type Built = { files: { name: string; text: string; type: string }[]; meta: ExportFile[]; digest: string }

/** Exports the company's records. */
export async function buildPackage(o: Offboarding, c: ExportCtx): Promise<Built> {
  const emp = c.employees
  const gross = emp.reduce((s, e) => s + e.salary, 0)
  const docs = c.docs.map((d) => [d.id, d.name, d.category, d.belongsTo, d.version, d.status, d.visibility, d.owner, d.updated, d.expires ?? ''])
  const exits = c.exits.map((e) => [e.id, e.name, e.dept, e.type, e.status, e.lastWorkingDay, e.reasonCat])
  const audit = c.audit
  const raw = [
    { name: 'employees.csv', text: csv(['id', 'name', 'role', 'department', 'branch', 'status', 'monthly_gross_ngn'], emp.map((e) => [e.id, e.name, e.role, e.dept, e.branch, e.status, e.salary])) },
    { name: 'payroll-summary.csv', text: csv(['department', 'headcount', 'monthly_gross_ngn'], [...new Set(emp.map((e) => e.dept))].map((d) => [d, emp.filter((e) => e.dept === d).length, emp.filter((e) => e.dept === d).reduce((s, e) => s + e.salary, 0)]).concat([['TOTAL', emp.length, gross]])) },
    { name: 'documents.csv', text: csv(['id', 'name', 'category', 'belongs_to', 'version', 'status', 'visibility', 'owner', 'updated', 'expires'], docs) },
    { name: 'exit-cases.csv', text: csv(['id', 'employee', 'department', 'type', 'status', 'last_working_day', 'reason'], exits) },
    { name: 'audit-trail.csv', text: auditCsv(audit) },
  ]
  const meta: ExportFile[] = []
  for (const f of raw) meta.push({ name: f.name, rows: Math.max(0, f.text.split('\n').filter(Boolean).length - 1), bytes: new TextEncoder().encode(f.text).length, sha256: await sha256(f.text) })
  const manifest = JSON.stringify({ format: 'bizflow-offboarding-export/1', request: o.id, company: o.company, generatedAt: new Date().toISOString(), files: meta }, null, 2)
  const digest = await sha256(manifest)
  return { files: [...raw.map((f) => ({ ...f, type: 'text/csv' })), { name: 'manifest.json', text: manifest, type: 'application/json' }], meta, digest }
}

export function downloadFile(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a')
  const url = URL.createObjectURL(new Blob([text], { type }))
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const downloadAll = (b: Built, prefix: string) => b.files.forEach((f, i) => setTimeout(() => downloadFile(`${prefix}-${f.name}`, f.text, f.type), i * 250))
