import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, Download, History, Layers, Lock, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { Badge, Btn, EmptyState, Field, Fold, inputCls, PageHeader, Tabs, useToast } from '../../components/ui'
import { useRole } from '../../components/app/AppLayout'
import { useAudit, useDepartments, useTenant } from '../../tenant/store'
import { SettingsNav, Section } from '../../tenant/ui'
import { employeesForTenant } from '../../data/demo'
import {
  DEFAULT_KEY, activeVersion, cellKey, cellValue, cellsOf, diffSets, gradeLabel, importMatrixCsv, latestVersion, matrixCsv, naira0, noticeText, publish, stepLabel,
  todayISO, useRules, validate, versionStatus,
} from '../../rules/store'
import type { Grade, RuleSet, Split } from '../../rules/store'

const TABS = ['Grade structure', 'Salary matrix', 'Probation & confirmation', 'Allowances', 'History']
const small = 'h-9 w-full rounded-md border border-line bg-white px-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 disabled:bg-cloud disabled:text-slate'
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const round5k = (n: number) => Math.round(n / 5000) * 5000
const num = (v: string, max = 1e9) => Math.min(max, Math.max(0, Number(v) || 0))
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** Drops salary cells that no longer belong to any grade or step, and tidies text. */
function normalise(s: RuleSet): RuleSet {
  const valid = new Set(s.grades.flatMap((g) => cellsOf(g).map((c) => c.key)))
  const matrix: RuleSet['matrix'] = {}
  Object.entries(s.matrix).forEach(([d, cells]) => {
    const kept = Object.fromEntries(Object.entries(cells).filter(([k]) => valid.has(k)))
    if (d === DEFAULT_KEY || Object.keys(kept).length) matrix[d] = kept
  })
  return { ...s, matrix, grades: s.grades.map((g) => ({ ...g, code: g.code.trim(), title: g.title.trim(), benefits: g.benefits.map((b) => b.trim()).filter(Boolean) })) }
}

/** Changes a grade's step count, carrying salary cells across so no amounts are lost. */
function withSteps(s: RuleSet, gradeId: string, n: number): RuleSet {
  const g = s.grades.find((x) => x.id === gradeId)!
  const old = g.steps
  if (old === n) return s
  const matrix = clone(s.matrix)
  Object.values(matrix).forEach((cells) => {
    if (old === 0 && n > 0 && cells[gradeId] !== undefined) { cells[`${gradeId}:1`] = cells[gradeId]; delete cells[gradeId] }
    if (old > 0 && n === 0 && cells[`${gradeId}:1`] !== undefined) { cells[gradeId] = cells[`${gradeId}:1`]; delete cells[`${gradeId}:1`] }
  })
  const def = matrix[DEFAULT_KEY] ?? (matrix[DEFAULT_KEY] = {})
  for (let i = Math.max(old, 1) + 1; i <= n; i++) { const prev = def[cellKey(gradeId, i - 1)]; if (prev !== undefined) def[cellKey(gradeId, i)] = round5k(prev * 1.05) }
  return { ...s, matrix, grades: s.grades.map((x) => (x.id === gradeId ? { ...x, steps: n } : x)) }
}

type PanelProps = { draft: RuleSet; setDraft: (s: RuleSet) => void; canEdit: boolean }

/* ---------- Grade structure ---------- */
function BenefitsInput({ value, onCommit, label }: { value: string[]; onCommit: (v: string[]) => void; label: string }) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => setText(value.join(', ')), [value])
  return <input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => onCommit(text.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="HMO, Staff loan" className={small} />
}

function GradesTab({ draft, setDraft, canEdit }: PanelProps) {
  const setG = (id: string, p: Partial<Grade>) => setDraft({ ...draft, grades: draft.grades.map((g) => (g.id === id ? { ...g, ...p } : g)) })
  const move = (i: number, d: number) => { const g = [...draft.grades], j = i + d; if (j < 0 || j >= g.length) return; [g[i], g[j]] = [g[j], g[i]]; setDraft({ ...draft, grades: g }) }
  const add = () => {
    const last = draft.grades[draft.grades.length - 1]
    const id = `g${Date.now().toString(36)}`
    const top = last ? Math.max(...cellsOf(last).map((c) => draft.matrix[DEFAULT_KEY]?.[c.key] ?? 0)) : 300000
    const g: Grade = { id, code: `Grade ${draft.grades.length + 1}`, title: '', band: '', steps: 0, probation: draft.defaults.probation, leave: draft.defaults.leave, noticeDays: draft.defaults.noticeDays, benefits: [] }
    setDraft({ ...draft, grades: [...draft.grades, g], matrix: { ...draft.matrix, [DEFAULT_KEY]: { ...draft.matrix[DEFAULT_KEY], [id]: round5k(top * 1.1) } } })
  }
  const toggle = (on: boolean) => setDraft({ ...draft, structureOn: on })
  return (
    <div className="space-y-5">
      <Section title="Use a grade structure" desc="When on, offer and employment letters pick department, grade and step, and salary, probation, leave and notice come from your rules. When off, salary is entered freely each time.">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" role="switch" checked={draft.structureOn} disabled={!canEdit} onChange={(e) => toggle(e.target.checked)} className="mt-1 size-4 accent-teal" />
          <span><span className="block text-sm font-semibold">{draft.structureOn ? 'Grade structure is on' : 'Grade structure is off'}</span>
            <span className="block text-xs text-slate">{draft.structureOn ? 'Pay is set by grade and step. Ordinary users cannot change values that come from the rules.' : 'Your grades and matrix are kept, but not applied. Company defaults for probation, leave and notice still pre-fill letters.'}</span></span>
        </label>
      </Section>
      <Section title="Grade levels" desc="Each grade can have steps (for example Grade 7, Step 1 to 5) or none. Probation, leave and notice set here pre-fill letters for that grade."
        action={canEdit && <Btn s="sm" v="secondary" onClick={add}><Plus size={14} />Add grade</Btn>}>
        <div className={`overflow-x-auto ${draft.structureOn ? '' : 'opacity-60'}`}>
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="text-left text-xs text-slate">
              {['Grade', 'Title', 'Band', 'Steps', 'Probation (mo)', 'Leave (days)', 'Notice (days)', 'Benefits'].map((h) => <th key={h} className="pb-2 pr-2 font-semibold">{h}</th>)}<th className="pb-2"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {draft.grades.map((g, i) => (
                <tr key={g.id} className="align-top">
                  <td className="w-28 pr-2 pb-2"><input aria-label="Grade name" disabled={!canEdit} value={g.code} onChange={(e) => setG(g.id, { code: e.target.value })} className={small} /></td>
                  <td className="w-44 pr-2 pb-2"><input aria-label={`${g.code} title`} disabled={!canEdit} value={g.title} onChange={(e) => setG(g.id, { title: e.target.value })} className={small} /></td>
                  <td className="w-36 pr-2 pb-2"><input aria-label={`${g.code} band`} disabled={!canEdit} value={g.band} onChange={(e) => setG(g.id, { band: e.target.value })} placeholder="Middle management" className={small} /></td>
                  <td className="w-20 pr-2 pb-2"><input aria-label={`${g.code} steps`} type="number" min={0} max={12} disabled={!canEdit} value={g.steps} onChange={(e) => setDraft(withSteps(draft, g.id, Math.round(num(e.target.value, 12))))} className={small} /></td>
                  <td className="w-24 pr-2 pb-2"><input aria-label={`${g.code} probation months`} type="number" min={0} max={12} disabled={!canEdit} value={g.probation} onChange={(e) => setG(g.id, { probation: num(e.target.value, 12) })} className={small} /></td>
                  <td className="w-24 pr-2 pb-2"><input aria-label={`${g.code} leave days`} type="number" min={0} max={60} disabled={!canEdit} value={g.leave} onChange={(e) => setG(g.id, { leave: num(e.target.value, 60) })} className={small} /></td>
                  <td className="w-24 pr-2 pb-2"><input aria-label={`${g.code} notice days`} type="number" min={0} max={180} disabled={!canEdit} value={g.noticeDays} onChange={(e) => setG(g.id, { noticeDays: num(e.target.value, 180) })} className={small} /></td>
                  <td className="min-w-[220px] pr-2 pb-2"><BenefitsInput label={`${g.code} benefits`} value={g.benefits} onCommit={(b) => setG(g.id, { benefits: b })} /></td>
                  <td className="whitespace-nowrap pb-2">
                    {canEdit && <>
                      <button type="button" aria-label={`Move ${g.code} up`} disabled={i === 0} onClick={() => move(i, -1)} className="cursor-pointer rounded p-1.5 text-slate hover:bg-cloud disabled:opacity-30"><ArrowUp size={14} /></button>
                      <button type="button" aria-label={`Move ${g.code} down`} disabled={i === draft.grades.length - 1} onClick={() => move(i, 1)} className="cursor-pointer rounded p-1.5 text-slate hover:bg-cloud disabled:opacity-30"><ArrowDown size={14} /></button>
                      <button type="button" aria-label={`Remove ${g.code}`} onClick={() => setDraft({ ...draft, grades: draft.grades.filter((x) => x.id !== g.id) })} className="cursor-pointer rounded p-1.5 text-slate hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {draft.grades.length === 0 && <p className="py-3 text-sm text-slate">No grades yet. Add one so letters can pick it.</p>}
        </div>
        <p className="mt-3 text-xs text-slate">Tip: set Steps to 0 for a grade with a single salary, such as an executive grade. Salaries for each step are set in the Salary matrix tab.</p>
      </Section>
    </div>
  )
}

/* ---------- Salary matrix ---------- */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
}

function MatrixTab({ draft, setDraft, canEdit, depts }: PanelProps & { depts: string[] }) {
  const toast = useToast()
  const [mode, setMode] = useState<'edit' | 'compare'>('edit')
  const [dept, setDept] = useState(DEFAULT_KEY)
  const [bulk, setBulk] = useState<{ kind: 'percent' | 'amount'; value: string; scope: string; round: boolean }>({ kind: 'percent', value: '5', scope: 'all', round: true })
  const [copyFrom, setCopyFrom] = useState(DEFAULT_KEY)
  const [importErr, setImportErr] = useState<string[]>([])
  const file = useRef<HTMLInputElement>(null)
  const { cellErrors } = useMemo(() => validate(draft), [draft])
  const isDef = dept === DEFAULT_KEY
  const own = draft.matrix[dept] ?? {}
  const overrideCount = (d: string) => Object.keys(draft.matrix[d] ?? {}).length
  const label = (d: string) => (d === DEFAULT_KEY ? 'Company default' : d)

  const setCell = (key: string, raw: string) => {
    const m = clone(draft.matrix); const cells = (m[dept] ??= {})
    if (raw === '') { if (isDef) delete cells[key]; else delete cells[key] } else cells[key] = Math.round(Number(raw))
    setDraft({ ...draft, matrix: m })
  }
  const applyBulk = () => {
    const v = Number(bulk.value)
    if (!Number.isFinite(v) || v === 0) return toast('Enter an adjustment other than zero')
    const m = clone(draft.matrix); const cells = (m[dept] ??= {})
    let n = 0
    draft.grades.filter((g) => bulk.scope === 'all' || g.id === bulk.scope).forEach((g) => cellsOf(g).forEach((c) => {
      const cur = cellValue(draft, dept, c.key).value
      if (cur === undefined) return
      let next = bulk.kind === 'percent' ? cur * (1 + v / 100) : cur + v
      next = Math.max(0, bulk.round ? round5k(next) : Math.round(next)); cells[c.key] = next; n++
    }))
    setDraft({ ...draft, matrix: m }); toast(`${n} cells adjusted for ${label(dept)}`)
  }
  const copy = () => {
    if (copyFrom === dept) return toast('Choose a different source')
    const m = clone(draft.matrix); const target = (m[dept] = {} as Record<string, number>)
    draft.grades.forEach((g) => cellsOf(g).forEach((c) => { const v = cellValue(draft, copyFrom, c.key).value; if (v !== undefined && (isDef || v !== cellValue(draft, DEFAULT_KEY, c.key).value)) target[c.key] = v }))
    setDraft({ ...draft, matrix: m }); toast(`Copied from ${label(copyFrom)} to ${label(dept)}`)
  }
  const resetDept = () => { const m = clone(draft.matrix); delete m[dept]; setDraft({ ...draft, matrix: m }); toast(`${dept} now follows the company default`) }
  const onFile = async (f?: File) => {
    if (!f) return
    const res = importMatrixCsv(draft, await f.text())
    setImportErr(res.errors)
    if (res.applied) { setDraft({ ...draft, matrix: res.matrix }); toast(`${res.applied} salary cells imported${res.errors.length ? `, ${res.errors.length} rows skipped` : ''}`) }
    else toast('Nothing imported')
    if (file.current) file.current.value = ''
  }

  if (!draft.structureOn) return <div className="rounded-lg border border-line bg-white"><EmptyState title="The grade structure is switched off" body="Salary is entered freely when preparing letters. Switch the structure on in the Grade structure tab to use a salary matrix." /></div>
  if (!draft.grades.length) return <div className="rounded-lg border border-line bg-white"><EmptyState title="Add grades first" body="The salary matrix has one row for every grade and step." /></div>

  return (
    <div className="space-y-5">
      <Section title="Salary matrix" desc="Gross monthly salary for every grade and step. Departments inherit the company default unless you give them their own amount."
        action={<div className="flex flex-wrap gap-2">
          <Btn s="sm" v="secondary" onClick={() => { download('salary-matrix.csv', matrixCsv(normalise(draft), depts.concat(Object.keys(draft.matrix).filter((d) => d !== DEFAULT_KEY && !depts.includes(d))))); toast('Matrix exported as CSV') }}><Download size={14} />Export CSV</Btn>
          {canEdit && <><Btn s="sm" v="secondary" onClick={() => file.current?.click()}><Upload size={14} />Import CSV</Btn><input ref={file} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Import salary matrix CSV" onChange={(e) => onFile(e.target.files?.[0])} /></>}
        </div>}>
        <div className="flex flex-wrap items-end gap-3">
          <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-md border border-line text-sm font-semibold">
            {([['edit', 'Edit a department'], ['compare', 'Compare all']] as const).map(([v, n]) => <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)} className={`cursor-pointer px-3 py-2 ${mode === v ? 'bg-teal text-white' : 'bg-white text-slate hover:text-ink'}`}>{n}</button>)}
          </div>
          {mode === 'edit' && (
            <div className="min-w-[240px]"><Field label="Department">
              <select value={dept} onChange={(e) => setDept(e.target.value)} className={inputCls}>
                <option value={DEFAULT_KEY}>Company default</option>
                {depts.map((d) => <option key={d} value={d}>{d}{overrideCount(d) ? ` (${overrideCount(d)} overrides)` : ''}</option>)}
              </select>
            </Field></div>
          )}
        </div>
        {importErr.length > 0 && (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <div className="mb-1 flex items-center justify-between font-semibold">Import notes ({importErr.length})<button type="button" aria-label="Dismiss" onClick={() => setImportErr([])} className="cursor-pointer"><X size={13} /></button></div>
            <ul className="max-h-24 list-disc overflow-y-auto pl-4">{importErr.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
      </Section>

      {mode === 'edit' ? (
        <>
          {canEdit && (
            <Fold title="Bulk tools" hint={`Applied to ${label(dept)}`}>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-[13px] font-semibold">Adjust amounts</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Type"><select value={bulk.kind} onChange={(e) => setBulk({ ...bulk, kind: e.target.value as 'percent' | 'amount' })} className={inputCls}><option value="percent">Increase by %</option><option value="amount">Increase by ₦ amount</option></select></Field>
                    <Field label={bulk.kind === 'percent' ? 'Percent (use minus to reduce)' : 'Amount in ₦ (use minus to reduce)'}><input type="number" value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} className={inputCls} /></Field>
                    <Field label="Applies to"><select value={bulk.scope} onChange={(e) => setBulk({ ...bulk, scope: e.target.value })} className={inputCls}><option value="all">All grades</option>{draft.grades.map((g) => <option key={g.id} value={g.id}>{g.code}</option>)}</select></Field>
                    <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" checked={bulk.round} onChange={(e) => setBulk({ ...bulk, round: e.target.checked })} className="accent-teal" />Round to nearest ₦5,000</label>
                  </div>
                  <Btn s="sm" onClick={applyBulk}>Apply to {label(dept)}</Btn>
                  {!isDef && <p className="text-xs text-slate">Inherited cells become overrides for {dept} once adjusted.</p>}
                </div>
                <div className="space-y-3">
                  <p className="text-[13px] font-semibold">Copy and reset</p>
                  <Field label={`Copy values into ${label(dept)} from`}>
                    <div className="flex gap-2"><select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={inputCls}><option value={DEFAULT_KEY}>Company default</option>{depts.filter((d) => d !== dept).map((d) => <option key={d}>{d}</option>)}</select><Btn s="sm" v="secondary" onClick={copy}>Copy</Btn></div>
                  </Field>
                  {!isDef && <Btn s="sm" v="ghost" onClick={resetDept} disabled={!overrideCount(dept)}><RotateCcw size={14} />Remove all {dept} overrides</Btn>}
                </div>
              </div>
            </Fold>
          )}
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-line bg-cloud text-left text-xs text-slate">
                <th className="px-4 py-2.5 font-semibold">Grade and step</th>
                {!isDef && <th className="px-3 py-2.5 font-semibold">Company default</th>}
                <th className="px-3 py-2.5 font-semibold">{isDef ? 'Gross monthly (₦)' : `${dept} (₦ per month)`}</th>
                <th className="px-3 py-2.5 font-semibold">Annual gross</th>
                <th className="px-3 py-2.5 font-semibold">{isDef ? 'Step increase' : 'Versus default'}</th>
              </tr></thead>
              <tbody>
                {draft.grades.map((g) => {
                  let prev: number | undefined
                  return (
                    <GradeRows key={g.id} g={g}>
                      {cellsOf(g).map((c) => {
                        const eff = cellValue(draft, dept, c.key), def = draft.matrix[DEFAULT_KEY]?.[c.key]
                        const err = cellErrors[`${dept}|${c.key}`], overridden = !isDef && own[c.key] !== undefined
                        const p = prev; prev = eff.value
                        const delta = isDef ? (p && eff.value ? (eff.value / p - 1) * 100 : undefined) : eff.value !== undefined && def ? (eff.value / def - 1) * 100 : undefined
                        return (
                          <tr key={c.key} className="border-b border-line/60 last:border-0">
                            <td className="px-4 py-1.5 pl-8 text-slate">{c.step ? stepLabel(c.step) : 'Single salary'}</td>
                            {!isDef && <td className="px-3 py-1.5 text-slate">{def !== undefined ? naira0(def) : '-'}</td>}
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <input type="number" min={0} step={5000} aria-label={`${gradeLabel(g)} ${c.step ? stepLabel(c.step) : ''} ${label(dept)}`} disabled={!canEdit} value={isDef ? (own[c.key] ?? '') : (own[c.key] ?? '')} placeholder={isDef ? '' : def !== undefined ? String(def) : ''}
                                  onChange={(e) => setCell(c.key, e.target.value)} aria-invalid={!!err} className={`${small} max-w-[170px] ${err ? 'border-red-500' : ''} ${overridden ? 'border-teal bg-softmint font-semibold' : ''}`} />
                                {overridden && <Badge tone="teal">Override</Badge>}
                                {overridden && canEdit && <button type="button" aria-label="Revert to company default" title="Revert to company default" onClick={() => setCell(c.key, '')} className="cursor-pointer rounded p-1 text-slate hover:bg-cloud"><RotateCcw size={13} /></button>}
                              </div>
                              {err && <p role="alert" className="mt-0.5 text-[11px] font-medium text-red-600">{err}</p>}
                            </td>
                            <td className="px-3 py-1.5 text-slate">{eff.value !== undefined ? naira0(eff.value * 12) : '-'}</td>
                            <td className="px-3 py-1.5 text-xs text-slate">{delta === undefined ? '-' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}{!isDef && !overridden && eff.value !== undefined ? ' (inherited)' : ''}</td>
                          </tr>
                        )
                      })}
                    </GradeRows>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead><tr className="border-b border-line bg-cloud text-left text-xs text-slate">
              <th className="sticky left-0 z-10 bg-cloud px-4 py-2.5 font-semibold">Grade and step</th>
              <th className="px-3 py-2.5 font-semibold">Company default</th>
              {depts.map((d) => <th key={d} className="whitespace-nowrap px-3 py-2.5 font-semibold"><button type="button" onClick={() => { setDept(d); setMode('edit') }} className="cursor-pointer underline-offset-2 hover:text-teal hover:underline">{d}</button></th>)}
            </tr></thead>
            <tbody>
              {draft.grades.flatMap((g) => cellsOf(g).map((c) => (
                <tr key={c.key} className="border-b border-line/60 last:border-0">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-1.5 font-medium">{g.code}{c.step ? ` · ${stepLabel(c.step)}` : ''}</td>
                  <td className="px-3 py-1.5">{draft.matrix[DEFAULT_KEY]?.[c.key] !== undefined ? naira0(draft.matrix[DEFAULT_KEY][c.key]) : '-'}</td>
                  {depts.map((d) => {
                    const o = draft.matrix[d]?.[c.key], def = draft.matrix[DEFAULT_KEY]?.[c.key]
                    return <td key={d} className={`whitespace-nowrap px-3 py-1.5 ${o !== undefined ? 'bg-softmint font-semibold text-teal' : 'text-slate'}`}>{o !== undefined ? <>{naira0(o)}{def ? <span className="ml-1 text-[11px] font-medium">{o >= def ? '+' : ''}{((o / def - 1) * 100).toFixed(0)}%</span> : null}</> : naira0(def ?? 0)}</td>
                  })}
                </tr>
              )))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-2.5 text-xs text-slate">Highlighted cells are department overrides. Plain cells follow the company default. Select a department name to edit it.</p>
        </div>
      )}
    </div>
  )
}

function GradeRows({ g, children }: { g: Grade; children: ReactNode }) {
  return (
    <>
      <tr className="border-b border-line bg-cloud/60"><th colSpan={5} scope="colgroup" className="px-4 py-2 text-left text-[13px] font-semibold">{gradeLabel(g)}{g.band ? <span className="ml-2 font-normal text-slate">{g.band}</span> : null}<span className="ml-2 font-normal text-slate">{g.steps > 0 ? `${g.steps} steps` : 'no steps'}</span></th></tr>
      {children}
    </>
  )
}

/* ---------- Probation and confirmation ---------- */
function ProbationTab({ draft, setDraft, canEdit }: PanelProps) {
  const d = draft.defaults, p = draft.probationRules
  const setP = (x: Partial<typeof p>) => setDraft({ ...draft, probationRules: { ...p, ...x } })
  const setD = (x: Partial<typeof d>) => setDraft({ ...draft, defaults: { ...d, ...x } })
  return (
    <fieldset disabled={!canEdit} className="space-y-5">
      <Section title="Company defaults" desc="Used when a grade does not apply, or when the grade structure is off.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Probation (months)"><input type="number" min={0} max={12} value={d.probation} onChange={(e) => setD({ probation: num(e.target.value, 12) })} className={inputCls} /></Field>
          <Field label="Annual leave (days)"><input type="number" min={0} max={60} value={d.leave} onChange={(e) => setD({ leave: num(e.target.value, 60) })} className={inputCls} /></Field>
          <Field label="Notice period (days)" hint={noticeText(d.noticeDays)}><input type="number" min={0} max={180} value={d.noticeDays} onChange={(e) => setD({ noticeDays: num(e.target.value, 180) })} className={inputCls} /></Field>
        </div>
      </Section>
      <Section title="Confirmation rules" desc="How probation is reviewed and when an employee is confirmed.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Maximum extension (months)" hint="Longest probation can be extended once."><input type="number" min={0} max={6} value={p.extensionMax} onChange={(e) => setP({ extensionMax: num(e.target.value, 6) })} className={inputCls} /></Field>
          <Field label="Review reminder (days before end)"><input type="number" min={0} max={90} value={p.reminderDays} onChange={(e) => setP({ reminderDays: num(e.target.value, 90) })} className={inputCls} /></Field>
          <Field label="Notice during probation (days)"><input type="number" min={0} max={60} value={p.probationNoticeDays} onChange={(e) => setP({ probationNoticeDays: num(e.target.value, 60) })} className={inputCls} /></Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([['requireManagerAppraisal', 'Line manager appraisal is required'], ['requireHrSignoff', 'HR sign-off is required'], ['autoConfirm', 'Confirm automatically if no decision is made by the end date']] as const).map(([k, l]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={p[k]} onChange={(e) => setP({ [k]: e.target.checked })} className="accent-teal" />{l}</label>
          ))}
          <Field label="MD approval is required from grade"><select value={p.requireMdApprovalFrom} onChange={(e) => setP({ requireMdApprovalFrom: e.target.value })} className={inputCls}><option value="">Never</option>{draft.grades.map((g) => <option key={g.id} value={g.id}>{g.code} and above</option>)}</select></Field>
        </div>
      </Section>
      <Section title="Probation, leave and notice by grade" desc="Set per grade in the Grade structure tab. Shown here for review.">
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-left text-xs text-slate"><th className="pb-2 font-semibold">Grade</th><th className="pb-2 font-semibold">Probation</th><th className="pb-2 font-semibold">Annual leave</th><th className="pb-2 font-semibold">Notice period</th></tr></thead>
          <tbody>{draft.grades.map((g) => <tr key={g.id} className="border-t border-line/60"><td className="py-2 font-medium">{gradeLabel(g)}</td><td>{g.probation} month{g.probation === 1 ? '' : 's'}</td><td>{g.leave} days</td><td>{g.noticeDays} days</td></tr>)}</tbody>
        </table></div>
      </Section>
    </fieldset>
  )
}

/* ---------- Allowances ---------- */
function SplitInputs({ split, onChange, disabled }: { split: Split; onChange: (s: Split) => void; disabled?: boolean }) {
  return <>{(['basic', 'housing', 'transport'] as const).map((k) => <input key={k} aria-label={`${k} percent`} type="number" min={0} max={100} disabled={disabled} value={split[k]} onChange={(e) => onChange({ ...split, [k]: num(e.target.value, 100) })} className={`${small} w-20`} />)}</>
}
function AllowancesTab({ draft, setDraft, canEdit }: PanelProps) {
  const [sample, setSample] = useState('1000000')
  const sp = draft.defaults.split, tot = sp.basic + sp.housing + sp.transport, g = Number(sample) || 0
  const setG = (id: string, split?: Split) => setDraft({ ...draft, grades: draft.grades.map((x) => (x.id === id ? { ...x, split } : x)) })
  return (
    <fieldset disabled={!canEdit} className="space-y-5">
      <Section title="Default salary breakdown" desc="How gross monthly salary splits into basic, housing and transport. Letters show these amounts.">
        <div className="grid gap-4 sm:grid-cols-4">
          {(['basic', 'housing', 'transport'] as const).map((k) => <Field key={k} label={`${k[0].toUpperCase()}${k.slice(1)} (%)`}><input type="number" min={0} max={100} value={sp[k]} onChange={(e) => setDraft({ ...draft, defaults: { ...draft.defaults, split: { ...sp, [k]: num(e.target.value, 100) } } })} className={inputCls} /></Field>)}
          <Field label="Preview gross (₦ / month)"><input type="number" min={0} value={sample} onChange={(e) => setSample(e.target.value)} className={inputCls} /></Field>
        </div>
        <p className={`mt-2 text-xs ${tot === 100 ? 'text-slate' : 'font-medium text-red-600'}`}>Total {tot}%{tot === 100 ? '' : '. Must equal 100%.'} {tot === 100 && g > 0 ? `On ${naira0(g)}: basic ${naira0(g * sp.basic / 100)}, housing ${naira0(g * sp.housing / 100)}, transport ${naira0(g * sp.transport / 100)}.` : ''}</p>
      </Section>
      <Section title="Grade-specific breakdown" desc="Leave a grade on the company split, or give it its own. Benefits are edited in the Grade structure tab.">
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-xs text-slate"><th className="pb-2 font-semibold">Grade</th><th className="pb-2 font-semibold">Split</th><th className="pb-2 font-semibold">Basic / housing / transport (%)</th><th className="pb-2 font-semibold">Benefits</th></tr></thead>
          <tbody>{draft.grades.map((gr) => (
            <tr key={gr.id} className="border-t border-line/60 align-top">
              <td className="py-2 pr-3 font-medium">{gradeLabel(gr)}</td>
              <td className="py-2 pr-3"><label className="flex cursor-pointer items-center gap-1.5 text-xs"><input type="checkbox" checked={!!gr.split} onChange={(e) => setG(gr.id, e.target.checked ? { ...sp } : undefined)} className="accent-teal" />Own split</label></td>
              <td className="py-2 pr-3"><div className="flex gap-1.5"><SplitInputs split={gr.split ?? sp} disabled={!gr.split || !canEdit} onChange={(s) => setG(gr.id, s)} /></div></td>
              <td className="py-2 text-xs text-slate">{gr.benefits.length ? <span className="flex flex-wrap gap-1">{gr.benefits.map((b) => <span key={b} className="rounded bg-cloud px-1.5 py-0.5">{b}</span>)}</span> : 'None'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Section>
    </fieldset>
  )
}

/* ---------- History ---------- */
function HistoryTab({ slug, canEdit, load }: { slug: string; canEdit: boolean; load: (v: number) => void }) {
  const rules = useRules(slug)
  const audit = useAudit(slug).filter((a) => /^Employee rule/.test(a.action)).slice(0, 25)
  const vs = [...rules.versions].sort((a, b) => b.version - a.version)
  const tone = { Active: 'green', Scheduled: 'blue', Superseded: 'gray' } as const
  return (
    <div className="space-y-5">
      <Section title="Version history" desc="Every published change is a new version with an effective date. The newest version whose date has arrived is the one in force.">
        <ol className="space-y-3">
          {vs.map((v) => {
            const st = versionStatus(rules, v)
            return (
              <li key={v.version} className="rounded-lg border border-line p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-display text-[15px] font-semibold">Version {v.version}</span><Badge tone={tone[st]}>{st}</Badge><span className="text-xs text-slate">Effective {day(v.effectiveFrom)}</span></div>
                  {canEdit && <Btn s="sm" v="ghost" onClick={() => load(v.version)}><RotateCcw size={13} />Load into editor</Btn>}
                </div>
                <p className="mt-1 text-xs text-slate">Published {when(v.publishedAt)} by {v.by}{v.note ? ` · ${v.note}` : ''}</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px]">{v.changes.slice(0, 5).map((c) => <li key={c}>{c}</li>)}</ul>
                {v.changes.length > 5 && <Fold title={`${v.changes.length - 5} more changes`}><ul className="list-disc space-y-0.5 pl-5 text-[13px]">{v.changes.slice(5).map((c) => <li key={c}>{c}</li>)}</ul></Fold>}
              </li>
            )
          })}
        </ol>
      </Section>
      <Section title="Audit entries" desc="Rule changes and manual overrides made while preparing documents.">
        {audit.length === 0 ? <p className="text-sm text-slate">Nothing recorded yet.</p> : (
          <ul className="divide-y divide-line">
            {audit.map((a) => (
              <li key={a.id} className="py-2.5 text-[13px]">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{a.action}</span>{/override/i.test(a.action) && <Badge tone="amber">Override</Badge>}<span className="text-xs text-slate">{when(a.at)} · {a.actor}</span></div>
                {(a.from || a.to) && <p className="text-slate">{[a.ref, a.from, a.to].filter(Boolean).join(' · ')}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

/* ---------- Page ---------- */
export default function EmployeeRules() {
  const tenant = useTenant()
  const { r, can } = useRole()
  const toast = useToast()
  const slug = tenant?.slug ?? 'etranzact'
  const rules = useRules(slug)
  const employees = useMemo(() => employeesForTenant(slug), [slug])
  const orgDepts = useDepartments(slug)
  const latest = latestVersion(rules), active = activeVersion(rules)
  const [tab, setTab] = useState(TABS[0])
  const [draft, setDraftState] = useState<RuleSet>(() => clone(latest.set))
  const [baseV, setBaseV] = useState(latest.version)
  const [eff, setEff] = useState(todayISO())
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const canEdit = can('employee.rules.manage')
  useEffect(() => { if (latest.version !== baseV) { setDraftState(clone(latest.set)); setBaseV(latest.version) } }, [latest.version, latest.set, baseV])
  const depts = useMemo(() => [...new Set([...employees.map((e) => e.dept), ...orgDepts.map((d) => d.name), ...Object.keys(draft.matrix).filter((d) => d !== DEFAULT_KEY)])].sort(), [employees, orgDepts, draft.matrix])
  const clean = useMemo(() => normalise(draft), [draft])
  const dirty = JSON.stringify(clean) !== JSON.stringify(normalise(latest.set))
  const { errors } = useMemo(() => validate(clean), [clean])
  const changes = useMemo(() => (dirty ? diffSets(latest.set, clean) : []), [dirty, latest.set, clean])

  if (!tenant) return null
  if (!can('employee.rules.view')) return (
    <div><PageHeader eyebrow="Settings · Company" title="Employee Rules" /><SettingsNav />
      <div className="rounded-lg border border-line bg-white"><EmptyState title="Employee rules are restricted" body={`Your role (${r.title}) does not have access to the company grade structure and salary matrix.`} /></div></div>
  )

  const setDraft = (s: RuleSet) => setDraftState(s)
  const discard = () => { setDraftState(clone(latest.set)); setTried(false); setNote('') }
  const doPublish = () => {
    setTried(true)
    if (errors.length) return toast('Fix the validation issues first')
    if (note.trim().length < 3) return toast('Add a short note describing the change')
    if (!eff || (eff < todayISO())) return toast('Effective date cannot be in the past')
    const v = publish(slug, clean, eff, note.trim(), r.user)
    setTried(false); setNote(''); setEff(todayISO()); setBaseV(v.version); setDraftState(clone(v.set))
    toast(eff > todayISO() ? `Version ${v.version} scheduled for ${day(eff)}` : `Version ${v.version} published`)
  }
  const load = (n: number) => {
    const v = rules.versions.find((x) => x.version === n); if (!v) return
    setDraftState(clone(v.set)); setTab(TABS[0]); toast(`Version ${n} loaded into the editor. Publish to make it current.`)
  }
  const stepsTotal = draft.grades.reduce((n, g) => n + Math.max(1, g.steps), 0)
  const overrideDepts = Object.keys(draft.matrix).filter((d) => d !== DEFAULT_KEY && Object.keys(draft.matrix[d]).length).length
  const panel: PanelProps = { draft, setDraft, canEdit }

  return (
    <div className={dirty && canEdit ? 'pb-72 sm:pb-56' : ''}>
      <PageHeader eyebrow="Settings · Company" title="Employee Rules" desc={`${tenant.profile.name}'s grade structure, salary matrix, probation and allowance rules. Offer and employment letters fill pay terms from here.`} />
      <SettingsNav />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: 'In force', v: `Version ${active.version}`, s: `Effective ${day(active.effectiveFrom)}${latest.version !== active.version ? ` · v${latest.version} scheduled` : ''}` },
          { l: 'Grade structure', v: draft.structureOn ? 'On' : 'Off', s: `${draft.grades.length} grades · ${stepsTotal} pay points` },
          { l: 'Departments with own rates', v: String(overrideDepts), s: `of ${depts.length} departments` },
          { l: 'Who can edit', v: 'HR, Admin, MD', s: canEdit ? 'You can edit these rules' : 'You have view-only access' },
        ].map((k) => <div key={k.l} className="rounded-lg border border-line bg-white px-4 py-3"><p className="text-xs text-slate">{k.l}</p><p className="mt-0.5 font-display text-[17px] font-semibold">{k.v}</p><p className="text-xs text-slate">{k.s}</p></div>)}
      </div>
      {!canEdit && <p className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 text-[13px] text-slate"><Lock size={14} />View only. HR, the Company Administrator and the MD can change these rules.</p>}
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'Grade structure' && <GradesTab {...panel} />}
        {tab === 'Salary matrix' && <MatrixTab {...panel} depts={depts} />}
        {tab === 'Probation & confirmation' && <ProbationTab {...panel} />}
        {tab === 'Allowances' && <AllowancesTab {...panel} />}
        {tab === 'History' && <HistoryTab slug={slug} canEdit={canEdit} load={load} />}
      </div>

      {dirty && canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white shadow-[0_-4px_16px_rgba(0,0,0,.08)]" role="region" aria-label="Publish changes">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:pl-72">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Layers size={16} className="text-teal" /><b>Unpublished changes</b><span className="text-slate">{changes.length} change{changes.length === 1 ? '' : 's'} since version {latest.version}</span>
              {changes[0] && <span className="hidden truncate text-xs text-slate md:inline md:max-w-md">· {changes[0]}</span>}
            </div>
            {tried && errors.length > 0 && <ul role="alert" className="list-disc pl-5 text-xs font-medium text-red-600">{errors.slice(0, 4).map((e) => <li key={e}>{e}</li>)}</ul>}
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-44"><Field label="Effective from"><input type="date" min={todayISO()} value={eff} onChange={(e) => setEff(e.target.value)} className={inputCls} /></Field></div>
              <div className="min-w-[220px] flex-1"><Field label="What changed and why *"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2027 salary review, Technology +8%" className={`${inputCls} ${tried && note.trim().length < 3 ? 'border-red-500' : ''}`} /></Field></div>
              <Btn v="secondary" onClick={discard}>Discard</Btn>
              <Btn onClick={doPublish}><Check size={15} />Publish version {latest.version + 1}</Btn>
            </div>
            {eff > todayISO() && <p className="text-xs text-slate"><History size={12} className="mr-1 inline" />Scheduled: version {active.version} stays in force until {day(eff)}.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
