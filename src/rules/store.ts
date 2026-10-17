import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { isOwnDataset } from '../data/demo'

/* ================================================================
   Company employee rules: optional grade structure, salary matrix
   (company default + department overrides), probation, allowances.
   Versioned: every publish is a new version with an effective date.
   ================================================================ */

export type Split = { basic: number; housing: number; transport: number }
export type Grade = {
  id: string; code: string; title: string; band: string
  /** Number of steps. 0 means the grade has no steps (one salary). */
  steps: number
  probation: number; leave: number; noticeDays: number
  /** Optional allowance split for this grade; falls back to the company split. */
  split?: Split
  benefits: string[]
}
export type RuleDefaults = { probation: number; leave: number; noticeDays: number; split: Split }
export type ProbationRules = {
  extensionMax: number; reminderDays: number; probationNoticeDays: number
  requireManagerAppraisal: boolean; requireHrSignoff: boolean; requireMdApprovalFrom: string; autoConfirm: boolean
}
export const DEFAULT_KEY = 'default'
/** matrix[department or 'default'][cellKey] = gross monthly naira. cellKey is `gradeId` or `gradeId:step`. */
export type Matrix = Record<string, Record<string, number>>
export type RuleSet = { structureOn: boolean; grades: Grade[]; matrix: Matrix; defaults: RuleDefaults; probationRules: ProbationRules }
export type RuleVersion = { version: number; effectiveFrom: string; publishedAt: string; by: string; note: string; changes: string[]; set: RuleSet }
export type Rules = { versions: RuleVersion[] }

export const cellKey = (gradeId: string, step: number) => (step > 0 ? `${gradeId}:${step}` : gradeId)
export const gradeLabel = (g: Pick<Grade, 'code' | 'title'>) => (g.title ? `${g.code} · ${g.title}` : g.code)
export const stepLabel = (step: number) => (step > 0 ? `Step ${step}` : '')
export const cellsOf = (g: Grade): { key: string; step: number }[] =>
  g.steps > 0 ? Array.from({ length: g.steps }, (_, i) => ({ key: cellKey(g.id, i + 1), step: i + 1 })) : [{ key: g.id, step: 0 }]

export const naira0 = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')
export const todayISO = () => new Date().toISOString().slice(0, 10)
const MONTH_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six']
export const noticeText = (days: number): string => {
  if (days > 0 && days % 30 === 0 && days <= 180) {
    const m = days / 30, w = MONTH_WORDS[m]
    return m === 1 ? "One (1) month written notice, or one month's salary in lieu" : `${w[0].toUpperCase()}${w.slice(1)} (${m}) months' written notice, or ${w} months' salary in lieu`
  }
  return `${days} days' written notice, or salary in lieu for the unexpired period`
}

/* ---------- Seed (eTranzact) ---------- */
const G = (id: string, code: string, title: string, band: string, steps: number, probation: number, leave: number, noticeDays: number, benefits: string[]): Grade => ({ id, code, title, band, steps, probation, leave, noticeDays, benefits })
const BASE_BEN = ['HMO (individual)', 'Group life assurance', 'Pension (employer 10%)']
const SEED_GRADES: Grade[] = [
  G('g1', 'Grade 1', 'Graduate Trainee', 'Entry', 3, 6, 15, 30, BASE_BEN),
  G('g2', 'Grade 2', 'Officer', 'Junior', 4, 6, 18, 30, BASE_BEN),
  G('g3', 'Grade 3', 'Senior Officer', 'Junior', 5, 6, 20, 30, [...BASE_BEN, 'Staff loan']),
  G('g4', 'Grade 4', 'Assistant Manager', 'Middle management', 5, 6, 21, 60, [...BASE_BEN, 'HMO (family)', 'Staff loan']),
  G('g5', 'Grade 5', 'Manager', 'Middle management', 5, 6, 22, 60, [...BASE_BEN, 'HMO (family)', 'Staff loan', 'Car loan']),
  G('g6', 'Grade 6', 'Senior Manager', 'Senior management', 4, 3, 25, 90, [...BASE_BEN, 'HMO (family)', 'Car loan', 'Annual health check']),
  G('g7', 'Grade 7', 'Head / Director', 'Senior management', 3, 3, 28, 90, [...BASE_BEN, 'HMO (family)', 'Company vehicle', 'Annual health check', 'Club membership']),
  G('g8', 'Grade 8', 'Executive', 'Executive', 0, 3, 30, 90, [...BASE_BEN, 'HMO (family)', 'Company vehicle', 'Annual health check', 'Club membership', 'Executive medical']),
]
const SEED_DEFAULT: Record<string, number> = {}
const put = (id: string, ...v: number[]) => v.forEach((n, i) => { SEED_DEFAULT[`${id}:${i + 1}`] = n })
put('g1', 280000, 300000, 320000); put('g2', 380000, 420000, 460000, 500000); put('g3', 560000, 620000, 680000, 740000, 800000)
put('g4', 850000, 930000, 1010000, 1090000, 1170000); put('g5', 1250000, 1350000, 1450000, 1550000, 1650000)
put('g6', 1800000, 1950000, 2100000, 2250000); put('g7', 2400000, 2700000, 3000000); SEED_DEFAULT.g8 = 4000000

const SEED_DEPT_FACTORS: [string, number, string[]?][] = [
  ['Technology', 1.15], ['Finance', 1.06], ['Risk & Compliance', 1.08], ['Legal & Company Secretariat', 1.1, ['g3', 'g4', 'g5', 'g6', 'g7']],
  ['Internal Audit', 1.05], ['Admin Department', 0.93, ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']], ['Customer Service', 0.9, ['g1', 'g2', 'g3', 'g4', 'g5']],
]
export function seedSet(): RuleSet {
  const matrix: Matrix = { [DEFAULT_KEY]: { ...SEED_DEFAULT } }
  SEED_DEPT_FACTORS.forEach(([dept, f, only]) => {
    matrix[dept] = {}
    Object.entries(SEED_DEFAULT).forEach(([k, v]) => { if (!only || only.includes(k.split(':')[0])) matrix[dept][k] = Math.round((v * f) / 5000) * 5000 })
  })
  return {
    structureOn: true, grades: SEED_GRADES.map((g) => ({ ...g, benefits: [...g.benefits] })), matrix,
    defaults: { probation: 6, leave: 20, noticeDays: 30, split: { basic: 50, housing: 25, transport: 25 } },
    probationRules: { extensionMax: 3, reminderDays: 30, probationNoticeDays: 7, requireManagerAppraisal: true, requireHrSignoff: true, requireMdApprovalFrom: 'g6', autoConfirm: false },
  }
}
/* Self-serve companies start with no grades or salary tables; they build their own. */
const blankRules = (): Rules => ({ versions: [{ version: 1, effectiveFrom: todayISO(), publishedAt: new Date().toISOString(), by: 'System', note: 'Blank structure', changes: ['Initial structure created'], set: {
  structureOn: false, grades: [], matrix: { [DEFAULT_KEY]: {} }, defaults: { probation: 6, leave: 20, noticeDays: 30, split: { basic: 50, housing: 25, transport: 25 } },
  probationRules: { extensionMax: 3, reminderDays: 30, probationNoticeDays: 7, requireManagerAppraisal: true, requireHrSignoff: true, requireMdApprovalFrom: '', autoConfirm: false },
} }] })
const seedRules = (by = 'System'): Rules => ({ versions: [{ version: 1, effectiveFrom: '2026-01-01', publishedAt: '2026-01-02T09:00:00.000Z', by, note: 'Initial grade structure and salary matrix', changes: ['Initial structure created'], set: seedSet() }] })

/* ---------- Persistence + migration ---------- */
const KEY = (slug: string) => `bf-employee-rules-v1:${slug}`
const LEGACY_DOCS = (slug: string) => `bf-doc-templates-v2:${slug}`
type LegacyTerms = { grades: { id: string; name: string; bandMin: number; bandMax: number; probation: number; leave: number }[]; probation: number; notice: string; leave: number; split: Split }
const LEGACY_SEED_NAMES = 'Grade 1 · Graduate Trainee|Grade 3 · Officer|Grade 4 · Senior Officer|Grade 5 · Assistant Manager|Grade 6 · Manager|Grade 7 · Senior Manager|Grade 8 · Director / Executive'

/** Brings the older "Employment terms" tab data into the rules structure. Untouched legacy defaults are replaced by the richer seed. */
function migrate(slug: string): Rules | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_DOCS(slug)) || 'null') as { terms?: LegacyTerms } | null
    const t = raw?.terms
    if (!t || !Array.isArray(t.grades)) return null
    if (t.grades.map((g) => g.name).join('|') === LEGACY_SEED_NAMES && t.probation === 6 && t.leave === 20) return null
    const set = seedSet()
    const days = /two|2/i.test(t.notice) ? 60 : /three|3/i.test(t.notice) ? 90 : 30
    set.defaults = { probation: t.probation, leave: t.leave, noticeDays: days, split: t.split }
    set.grades = t.grades.map((g, i) => { const [code, ...rest] = g.name.split('·').map((s) => s.trim()); return { id: g.id, code: code || `Grade ${i + 1}`, title: rest.join(' · '), band: '', steps: 0, probation: g.probation, leave: g.leave, noticeDays: days, benefits: [] } })
    set.matrix = { [DEFAULT_KEY]: Object.fromEntries(t.grades.map((g) => [g.id, Math.round((g.bandMin + (g.bandMax || g.bandMin)) / 2 / 5000) * 5000])) }
    return { versions: [{ version: 1, effectiveFrom: todayISO(), publishedAt: new Date().toISOString(), by: 'Migration', note: 'Migrated from Employment terms (Document Templates)', changes: [`${set.grades.length} grades migrated; salary set to the midpoint of each old band`], set }] }
  } catch { return null }
}

const cache = new Map<string, Rules>()
const subs = new Set<() => void>()
function load(slug: string): Rules {
  const hit = cache.get(slug)
  if (hit) return hit
  let r: Rules | null = null
  try { const raw = JSON.parse(localStorage.getItem(KEY(slug)) || 'null') as Rules | null; if (raw && Array.isArray(raw.versions) && raw.versions.length) r = raw } catch { /* corrupt, reseed */ }
  r = r ?? migrate(slug) ?? (isOwnDataset(slug) ? blankRules() : seedRules())
  cache.set(slug, r)
  return r
}
function commit(slug: string, r: Rules) {
  cache.set(slug, r)
  try { localStorage.setItem(KEY(slug), JSON.stringify(r)) } catch { /* storage full */ }
  subs.forEach((s) => s())
}
export const getRules = (slug = 'etranzact') => load(slug)
export const useRules = (slug = 'etranzact'): Rules => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => load(slug))

/** The version in force today: newest whose effective date has arrived (else the oldest). */
export function activeVersion(r: Rules, on = todayISO()): RuleVersion {
  const live = r.versions.filter((v) => v.effectiveFrom <= on)
  return live.length ? live.reduce((a, b) => (b.version > a.version ? b : a)) : r.versions[0]
}
export const latestVersion = (r: Rules) => r.versions.reduce((a, b) => (b.version > a.version ? b : a))
export const activeSet = (slug = 'etranzact') => activeVersion(load(slug)).set
export const versionStatus = (r: Rules, v: RuleVersion): 'Active' | 'Scheduled' | 'Superseded' => v.version === activeVersion(r).version ? 'Active' : v.effectiveFrom > todayISO() ? 'Scheduled' : 'Superseded'

/* ---------- Lookup ---------- */
export const gradeById = (s: RuleSet, id: string) => s.grades.find((g) => g.id === id)
/** Effective gross for a cell in a department: department override, else company default. */
export function cellValue(s: RuleSet, dept: string, key: string): { value: number | undefined; source: 'department' | 'default' | 'none' } {
  const o = dept !== DEFAULT_KEY ? s.matrix[dept]?.[key] : undefined
  if (o !== undefined) return { value: o, source: 'department' }
  const d = s.matrix[DEFAULT_KEY]?.[key]
  return d !== undefined ? { value: d, source: 'default' } : { value: undefined, source: 'none' }
}
export type Resolved = {
  gross: number | undefined; source: 'department' | 'default' | 'none'; grade: Grade; step: number
  probation: number; leave: number; noticeDays: number; notice: string; split: Split; benefits: string[]; label: string
}
/** Everything a rule dictates for a department + grade (+ step). Returns undefined if the structure is off or the selection is incomplete. */
export function resolve(s: RuleSet, dept: string, gradeId: string, step: number): Resolved | undefined {
  if (!s.structureOn) return undefined
  const grade = gradeById(s, gradeId)
  if (!grade) return undefined
  if (grade.steps > 0 && !(step >= 1 && step <= grade.steps)) return undefined
  const st = grade.steps > 0 ? step : 0
  const c = cellValue(s, dept, cellKey(grade.id, st))
  return {
    gross: c.value, source: c.source, grade, step: st, probation: grade.probation, leave: grade.leave, noticeDays: grade.noticeDays, notice: noticeText(grade.noticeDays),
    split: grade.split ?? s.defaults.split, benefits: grade.benefits, label: `${gradeLabel(grade)}${st ? ` · ${stepLabel(st)}` : ''}`,
  }
}
/** Nearest grade/step for a salary within a department (used to show grade for existing employees). */
export function nearestCell(s: RuleSet, dept: string, salary: number): { grade: Grade; step: number; value: number; diff: number } | undefined {
  if (!s.structureOn) return undefined
  let best: { grade: Grade; step: number; value: number; diff: number } | undefined
  for (const g of s.grades) for (const c of cellsOf(g)) {
    const v = cellValue(s, dept, c.key).value
    if (v === undefined) continue
    const diff = salary - v
    if (!best || Math.abs(diff) < Math.abs(best.diff)) best = { grade: g, step: c.step, value: v, diff }
  }
  return best
}
export const gradeOfSalary = (dept: string, salary: number, slug = 'etranzact') => {
  const s = activeSet(slug), n = nearestCell(s, dept, salary)
  return n ? { ...n, label: `${n.grade.code}${n.step ? ` · Step ${n.step}` : ''}`, full: `${gradeLabel(n.grade)}${n.step ? ` · Step ${n.step}` : ''}`, set: s } : undefined
}

/* ---------- Validation ---------- */
export function validate(s: RuleSet): { errors: string[]; cellErrors: Record<string, string> } {
  const errors: string[] = [], cellErrors: Record<string, string> = {}
  const codes = new Set<string>()
  s.grades.forEach((g) => {
    if (!g.code.trim()) errors.push('Every grade needs a name or code.')
    if (codes.has(g.code.trim().toLowerCase())) errors.push(`Duplicate grade name "${g.code}".`)
    codes.add(g.code.trim().toLowerCase())
    if (g.split && g.split.basic + g.split.housing + g.split.transport !== 100) errors.push(`${g.code}: allowance split must add up to 100%.`)
  })
  const sp = s.defaults.split
  if (sp.basic + sp.housing + sp.transport !== 100) errors.push('The default allowance split must add up to 100%.')
  Object.entries(s.matrix).forEach(([dept, cells]) => {
    Object.entries(cells).forEach(([k, v]) => { if (!(v >= 0) || !Number.isFinite(v)) cellErrors[`${dept}|${k}`] = 'Cannot be negative' })
    s.grades.forEach((g) => {
      let prev: number | undefined
      cellsOf(g).forEach((c) => {
        const v = cellValue(s, dept, c.key).value
        if (v !== undefined && prev !== undefined && v < prev && !cellErrors[`${dept}|${c.key}`]) cellErrors[`${dept}|${c.key}`] = `Below the previous step (${naira0(prev)})`
        if (v !== undefined) prev = v
      })
    })
  })
  const def = s.matrix[DEFAULT_KEY] ?? {}
  if (s.structureOn) s.grades.forEach((g) => cellsOf(g).forEach((c) => { if (def[c.key] === undefined) cellErrors[`${DEFAULT_KEY}|${c.key}`] = 'Company default salary is required' }))
  const n = Object.keys(cellErrors).length
  if (n) errors.push(`${n} salary cell${n === 1 ? '' : 's'} need attention (steps must ascend, no negative or missing amounts).`)
  return { errors, cellErrors }
}

/* ---------- Diff (for history) ---------- */
export function diffSets(a: RuleSet, b: RuleSet): string[] {
  const out: string[] = []
  if (a.structureOn !== b.structureOn) out.push(`Grade structure turned ${b.structureOn ? 'on' : 'off'}`)
  const name = (s: RuleSet, id: string) => { const g = gradeById(s, id); return g ? g.code : id }
  b.grades.filter((g) => !gradeById(a, g.id)).forEach((g) => out.push(`Added ${gradeLabel(g)}`))
  a.grades.filter((g) => !gradeById(b, g.id)).forEach((g) => out.push(`Removed ${gradeLabel(g)}`))
  b.grades.forEach((g) => {
    const o = gradeById(a, g.id); if (!o) return
    if (o.probation !== g.probation) out.push(`${g.code} probation ${o.probation} to ${g.probation} months`)
    if (o.leave !== g.leave) out.push(`${g.code} leave ${o.leave} to ${g.leave} days`)
    if (o.noticeDays !== g.noticeDays) out.push(`${g.code} notice ${o.noticeDays} to ${g.noticeDays} days`)
    if (o.steps !== g.steps) out.push(`${g.code} steps ${o.steps} to ${g.steps}`)
    if (JSON.stringify(o.split) !== JSON.stringify(g.split)) out.push(`${g.code} allowance split changed`)
    if (o.benefits.join('|') !== g.benefits.join('|')) out.push(`${g.code} benefits changed`)
    if (o.code !== g.code || o.title !== g.title) out.push(`${o.code} renamed to ${gradeLabel(g)}`)
  })
  const depts = new Set([...Object.keys(a.matrix), ...Object.keys(b.matrix)])
  depts.forEach((d) => {
    const keys = new Set([...Object.keys(a.matrix[d] ?? {}), ...Object.keys(b.matrix[d] ?? {})])
    let n = 0, first = ''
    keys.forEach((k) => {
      const x = a.matrix[d]?.[k], y = b.matrix[d]?.[k]
      if (x !== y) { n++; if (!first) { const [gid, st] = k.split(':'); first = `${name(b, gid)}${st ? ` Step ${st}` : ''} ${x === undefined ? 'set to' : `${naira0(x)} to`} ${y === undefined ? 'inherited' : naira0(y)}` } }
    })
    if (n) out.push(`${d === DEFAULT_KEY ? 'Company default' : d}: ${n} salary cell${n === 1 ? '' : 's'} changed (e.g. ${first})`)
  })
  const dd = ['probation', 'leave', 'noticeDays'] as const
  dd.forEach((k) => { if (a.defaults[k] !== b.defaults[k]) out.push(`Company default ${k === 'noticeDays' ? 'notice' : k} ${a.defaults[k]} to ${b.defaults[k]}`) })
  if (JSON.stringify(a.defaults.split) !== JSON.stringify(b.defaults.split)) out.push(`Default allowance split ${a.defaults.split.basic}/${a.defaults.split.housing}/${a.defaults.split.transport} to ${b.defaults.split.basic}/${b.defaults.split.housing}/${b.defaults.split.transport}`)
  if (JSON.stringify(a.probationRules) !== JSON.stringify(b.probationRules)) out.push('Probation and confirmation rules changed')
  return out
}

export function publish(slug: string, set: RuleSet, effectiveFrom: string, note: string, by: string): RuleVersion {
  const r = load(slug), prev = latestVersion(r)
  const changes = diffSets(prev.set, set)
  const v: RuleVersion = { version: prev.version + 1, effectiveFrom, publishedAt: new Date().toISOString(), by, note, changes: changes.length ? changes : ['No change'], set: JSON.parse(JSON.stringify(set)) }
  commit(slug, { versions: [...r.versions, v] })
  recordAudit(slug, `Employee rules published (v${v.version})`, `v${prev.version}`, `v${v.version} effective ${effectiveFrom}`, { category: 'People', ref: `Employee rules v${v.version}` })
  changes.slice(0, 12).forEach((c) => recordAudit(slug, 'Employee rule changed', undefined, c, { category: 'People', ref: `Employee rules v${v.version}` }))
  return v
}

/** Records a manual override of rule-derived values while preparing a document. */
export function auditOverride(slug: string, subject: string, detail: string, reason: string, ref: string) {
  recordAudit(slug, 'Employee rule manually overridden', detail, `Reason: ${reason}`, { category: 'People', ref: `${ref} · ${subject}` })
}

/* ---------- CSV ---------- */
const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
export function matrixCsv(s: RuleSet, depts: string[]): string {
  const rows = [['Department', 'Grade', 'Step', 'Gross monthly (NGN)'].map(q).join(',')]
  for (const d of [DEFAULT_KEY, ...depts]) {
    for (const g of s.grades) for (const c of cellsOf(g)) {
      const own = s.matrix[d]?.[c.key]
      if (d !== DEFAULT_KEY && own === undefined) continue
      if (own !== undefined) rows.push([d === DEFAULT_KEY ? 'Company default' : d, g.code, c.step || '', own].map(q).join(','))
    }
  }
  return rows.join('\n')
}
function parseCsvLine(line: string): string[] {
  const out: string[] = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') inQ = false; else cur += ch }
    else if (ch === '"') inQ = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur); return out.map((x) => x.trim())
}
/** Applies a CSV (Department,Grade,Step,Gross) onto a copy of the matrix. Reports problems per row. */
export function importMatrixCsv(s: RuleSet, text: string): { matrix: Matrix; applied: number; errors: string[] } {
  const matrix: Matrix = JSON.parse(JSON.stringify(s.matrix)), errors: string[] = []
  let applied = 0
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  lines.forEach((line, i) => {
    const [dep, grade, step, amt] = parseCsvLine(line)
    if (i === 0 && /department/i.test(dep ?? '')) return
    const g = s.grades.find((x) => x.code.toLowerCase() === (grade ?? '').toLowerCase() || x.id === grade)
    const n = Number((amt ?? '').replace(/[,₦\s]/g, ''))
    const st = step ? Number(step) : 0
    if (!g) return void errors.push(`Row ${i + 1}: unknown grade "${grade}"`)
    if (!Number.isFinite(n) || n < 0 || amt === '' || amt === undefined) return void errors.push(`Row ${i + 1}: invalid amount "${amt ?? ''}"`)
    if (g.steps > 0 ? !(st >= 1 && st <= g.steps) : st !== 0) return void errors.push(`Row ${i + 1}: ${g.code} ${g.steps ? `has steps 1 to ${g.steps}` : 'has no steps'}`)
    const key = /^(company default|default)$/i.test(dep ?? '') ? DEFAULT_KEY : dep
    if (!key) return void errors.push(`Row ${i + 1}: missing department`)
    ;(matrix[key] ??= {})[cellKey(g.id, st)] = Math.round(n); applied++
  })
  return { matrix, applied, errors }
}
