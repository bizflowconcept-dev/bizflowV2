import { useEffect, useMemo, useState } from 'react'
import { Lock, LockOpen, Printer, ShieldAlert } from 'lucide-react'
import { Badge, Btn, Field, inputCls, Overlay, useToast } from '../components/ui'
import { recordAudit, useDepartments } from '../tenant/store'
import { useRole } from '../components/app/AppLayout'
import { activeVersion, auditOverride, cellsOf, gradeLabel, naira0, stepLabel, useRules } from '../rules/store'
import type { Tenant } from '../tenant/store'
import { employeesForTenant } from '../data/demo'
import { emailDomainFor, profileData } from '../data/people'
import { addDoc } from './store'
import type { Category, Visibility } from './store'
import { A4Page, printPage, ScaledPage, UploadedPreview } from './TemplatePage'
import { applyRules, blankEmpForm, buildEmploymentData, companyData, EMP_FIELDS, formFromEmployee, groupOf, isCompanyKey, keysUsed, labelOfKey, naira, resolveIdentity, ruleFor, sampleData, splitSalary, standardFor, typeName } from './templates'
import type { EmpForm } from './templates'
import type { DocTemplate, TemplateConfig } from './templates'
import { isOwnDataset } from '../data/demo'

type Props = {
  open: boolean; onClose: () => void; tenant: Tenant; cfg: TemplateConfig; user: string
  /** Template to start from; defaults to the first company standard. */
  templateId?: string
  /** True if the signed-in user may pick non-standard variants. */
  canVary: boolean
}

type Source = 'manual' | 'employee'
const num0 = (v: string) => parseFloat(v) || 0
const PERSON_KEYS = new Set(EMP_FIELDS.flatMap((f) => f.mergeKeys))
const defaultSource = (t: DocTemplate, used: string[]): Source =>
  t.type === 'offer' || t.type === 'employment' || used.includes('offer_deadline') ? 'manual' : 'employee'

export default function GenerateDialog({ open, onClose, tenant, cfg, user, templateId, canVary }: Props) {
  const toast = useToast()
  const employees = useMemo(() => employeesForTenant(tenant.slug), [tenant.slug])
  const standards = cfg.templates.filter((t) => t.isStandard)
  const choices = canVary ? cfg.templates : standards
  const { can } = useRole()
  const canOverride = can('employee.rules.override')
  const rules = useRules(tenant.slug)
  const set0 = activeVersion(rules).set
  const orgDepts = useDepartments(tenant.slug)
  const deptNames = useMemo(() => [...new Set([...employees.map((e) => e.dept), ...orgDepts.map((d) => d.name)])].sort(), [employees, orgDepts])
  const [id, setId] = useState(templateId ?? standards[0]?.id ?? '')
  const [source, setSource] = useState<Source>('manual')
  const [emp, setEmp] = useState('')
  const [f, setF] = useState<EmpForm>(() => blankEmpForm(set0))
  const [over, setOver] = useState<Record<string, string>>({})
  const [tried, setTried] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [reason, setReason] = useState('')
  const [record, setRecord] = useState<{ salary: number; key: string } | null>(null)
  const tplOf = (tid: string) => cfg.templates.find((t) => t.id === tid)
  const reset = (tid: string) => {
    const t = tplOf(tid)
    setSource(t ? defaultSource(t, keysUsed(t)) : 'manual'); setEmp(''); setF(blankEmpForm(set0)); setOver({}); setTried(false); setUnlocked(false); setReason(''); setRecord(null)
  }
  useEffect(() => { if (open) { const tid = templateId ?? standards[0]?.id ?? ''; setId(tid); reset(tid) } }, [open, templateId]) // eslint-disable-line react-hooks/exhaustive-deps

  const tpl: DocTemplate | undefined = tplOf(id)
  const identity = resolveIdentity(cfg.identity, tenant)
  const used = useMemo(() => (tpl ? keysUsed(tpl) : []), [tpl])
  const hasPerson = used.some((k) => PERSON_KEYS.has(k) || k.startsWith('employee.'))
  const shown = EMP_FIELDS.filter((d) => d.mergeKeys.some((k) => used.includes(k)) && (set0.structureOn || (d.key !== 'grade' && d.key !== 'step')))
  const showBreakdown = used.some((k) => ['employee.basic', 'employee.housing', 'employee.transport'].includes(k))
  const showSalary = shown.some((d) => d.key === 'gross')
  const [empExtra, setEmpExtra] = useState<Record<string, string>>({})
  const base = useMemo(() => {
    const d: Record<string, string> = { ...sampleData(cfg.identity, isOwnDataset(tenant.slug)), ...companyData(cfg.identity) }
    PERSON_KEYS.forEach((k) => { delete d[k] })
    delete d['employee.id']
    return d
  }, [cfg.identity, tenant.slug])
  if (!open || !tpl) return open ? <Overlay open onClose={onClose} title="New from template"><p className="text-sm text-slate">No templates are available yet. Ask a company administrator to set up document templates.</p></Overlay> : null

  const data: Record<string, string> = { ...base, ...(source === 'employee' ? empExtra : {}), ...buildEmploymentData(f, set0), ...over }
  const isUpload = !!tpl.upload?.url
  const others = used.filter((k) => !isCompanyKey(k) && k !== 'today' && !PERSON_KEYS.has(k) && !(source === 'manual' && k === 'employee.id') && !(source === 'employee' && k === 'employee.id'))
  const inherited = standardFor(cfg, tpl.type)?.id === tpl.id
  const group = groupOf(tpl.type)
  const grade = set0.grades.find((g) => g.id === f.grade)
  const gross = parseFloat(f.gross) || 0
  const sp = splitSalary(f, set0)
  const sumOff = showBreakdown && gross > 0 && Math.abs(sp.basic + sp.housing + sp.transport - gross) > 1

  /* Company rules: what the rules dictate for this department + grade + step, and whether the values have been manually overridden. */
  const rule = ruleFor(set0, f)
  const recordKey = `${f.department}|${f.grade}|${f.step}`
  const fromRecord = !!record && record.key === recordKey
  const baseGross = fromRecord ? record!.salary : rule?.gross
  const locked = !!rule && !unlocked
  const deptRate = rule ? (rule.source === 'department' ? `${f.department} department rate` : f.department ? `Company default rate (no ${f.department} override)` : 'Company default rate') : ''
  const overrides: string[] = []
  if (rule && unlocked) {
    if (baseGross !== undefined && Math.round(gross) !== Math.round(baseGross)) overrides.push(`Manual override: ${naira0(gross)} vs rule ${naira0(baseGross)}`)
    else if (baseGross === undefined && gross > 0) overrides.push(`Manual salary ${naira0(gross)} (no rule amount set)`)
    if (num0(f.probation_months) !== rule.probation) overrides.push(`Probation ${f.probation_months || 0} vs rule ${rule.probation} months`)
    if (num0(f.leave) !== rule.leave) overrides.push(`Leave ${f.leave || 0} vs rule ${rule.leave} days`)
    if (f.notice !== rule.notice) overrides.push(`Notice period edited`)
    if (sp.edited) overrides.push('Allowance breakdown edited')
  }
  const needReason = overrides.length > 0
  const reasonErr = tried && needReason && reason.trim().length < 5 ? 'Give a short reason (at least 5 characters)' : undefined
  const LOCKED_KEYS = new Set<keyof EmpForm>(['gross', 'probation_months', 'leave', 'notice'])
  const isLocked = (k: keyof EmpForm) => locked && LOCKED_KEYS.has(k) && !(k === 'gross' && baseGross === undefined)
  const lockedTag = (k: keyof EmpForm) => isLocked(k)
    ? <p className="mt-1 inline-flex items-center gap-1 rounded bg-teal/10 px-1.5 py-0.5 text-[11px] font-semibold text-teal"><Lock size={11} />{k === 'gross' && fromRecord ? 'From employee record' : 'From rules'}</p>
    : rule && unlocked && LOCKED_KEYS.has(k) ? <p className="mt-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700"><LockOpen size={11} />Unlocked for override</p> : null
  const set = (k: keyof EmpForm, v: string) => setF((p) => {
    let n: EmpForm = { ...p, [k]: v }
    if (k === 'department' || k === 'grade' || k === 'step') {
      if (k === 'grade') { const g = set0.grades.find((x) => x.id === v); n.step = g && g.steps > 0 ? '1' : '' }
      n = applyRules(set0, n)
    }
    return n
  })
  const setRuleKey = (k: keyof EmpForm, v: string) => { set(k, v); setUnlocked(false); setReason(''); if (record && k !== 'step') setRecord(null) }
  const pickEmployee = (name: string) => {
    setEmp(name); setUnlocked(false); setReason('')
    const e = employees.find((x) => x.name === name)
    if (!e) { setF(blankEmpForm(set0)); setEmpExtra({}); setRecord(null); return }
    const pr = profileData(e, employees, emailDomainFor(tenant), undefined, tenant.slug)
    const nf = formFromEmployee(e, set0, { address: pr.address, email: pr.email, location: pr.location, start: pr.joinedISO })
    setF(nf); setRecord({ salary: e.salary, key: `${nf.department}|${nf.grade}|${nf.step}` })
    setEmpExtra({ 'employee.id': e.id })
  }
  const switchSource = (s: Source) => { setSource(s); setEmp(''); setF(blankEmpForm(set0)); setEmpExtra({}); setTried(false); setUnlocked(false); setReason(''); setRecord(null) }
  const toggleLock = () => {
    if (unlocked) { setF((p) => applyRules(set0, p)); if (fromRecord && record) setF((p) => ({ ...p, gross: String(record.salary) })); setUnlocked(false); setReason('') } else setUnlocked(true)
  }

  const errors: Partial<Record<keyof EmpForm, string>> = {}
  if (hasPerson && !isUpload) {
    shown.forEach((d) => { if (d.required && !String(f[d.key]).trim()) errors[d.key] = 'Required' })
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) errors.email = 'Enter a valid email'
    if (f.gross && !(gross > 0)) errors.gross = 'Enter an amount above zero'
    if (f.start && f.deadline && f.deadline > f.start) errors.deadline = 'Deadline is after the start date'
    if (source === 'employee' && !emp) errors.name = 'Choose an employee or switch to manual entry'
  }
  const hasErr = Object.keys(errors).length > 0 || sumOff || !!reasonErr || (needReason && reason.trim().length < 5)
  const err = (k: keyof EmpForm) => (tried ? errors[k] : undefined)

  const create = () => {
    setTried(true)
    if (hasErr) { toast('Fix the highlighted fields first'); return }
    if (needReason && !canOverride) { toast('Only HR, the Company Administrator or the MD can override company rules'); return }
    const candidate = hasPerson && source === 'manual' && group === 'HR letters'
    const subject = data['employee.name'] && group === 'HR letters' ? data['employee.name'] : tpl.type === 'po' ? data['vendor.name'] : data['customer.name']
    const category: Category = group === 'HR letters' ? 'Employees' : tpl.type === 'po' ? 'Vendors' : tpl.type === 'letter' ? 'Company' : 'Customers'
    const visibility: Visibility = group === 'HR letters' ? 'HR' : group === 'Finance' ? 'Finance' : 'Company'
    addDoc({
      name: `${tpl.name}${subject ? ` · ${subject}` : ''}`, category,
      belongsTo: category === 'Company' ? tenant.profile.name : candidate ? `${subject} (candidate)` : subject || tenant.profile.name,
      subject: category === 'Employees' && !candidate ? subject : undefined, version: 'v1', status: 'Draft', visibility, owner: user,
      updated: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), size: isUpload ? 'File' : 'A4',
      summary: `${candidate ? `Candidate (not yet an employee) · ${f.job_title}${rule ? `, ${rule.label}` : grade ? `, ${gradeLabel(grade)}` : ''}. Convert to an employee record on acceptance. ` : ''}${needReason ? `Rules manually overridden (${overrides.join('; ')}). Reason: ${reason.trim()}. ` : rule ? `Pay terms from company rules (${rule.label}, ${deptRate}). ` : ''}Created from the ${inherited ? 'company standard' : 'variant'} ${typeName(tpl.type).toLowerCase()} template (v${tpl.version}).`,
      file: isUpload ? tpl.upload : undefined,
      generated: isUpload ? undefined : { template: tpl, identity, data, inherited, recipient: hasPerson ? (candidate ? 'candidate' : 'employee') : undefined },
    })
    recordAudit(tenant.slug, candidate ? 'Candidate document created from template' : 'Document created from template', inherited ? 'Company standard' : 'Variant', `${tpl.name} v${tpl.version}`, { category: 'Documents', ref: subject ?? tpl.name })
    if (needReason && rule) auditOverride(tenant.slug, subject ?? '', `${rule.label} · ${f.department}: ${overrides.join('; ')}`, reason.trim(), tpl.name)
    toast(`${tpl.name} created in Documents`)
    onClose()
  }

  const input = (d: (typeof EMP_FIELDS)[number]) => {
    const e = err(d.key), cls = `${inputCls} ${e ? 'border-red-500' : ''}`, v = f[d.key]
    const common = { 'aria-invalid': !!e, 'aria-required': !!d.required }
    if (d.key === 'department') return (
      <select value={v} onChange={(x) => setRuleKey('department', x.target.value)} className={cls} {...common}>
        <option value="">Select department</option>{[...new Set([...deptNames, ...(v ? [v] : [])])].map((n) => <option key={n}>{n}</option>)}
      </select>
    )
    if (d.key === 'grade') return (
      <select value={v} onChange={(x) => setRuleKey('grade', x.target.value)} className={cls} {...common}>
        <option value="">Select grade level</option>{set0.grades.map((g) => <option key={g.id} value={g.id}>{gradeLabel(g)}</option>)}
      </select>
    )
    if (d.key === 'step') return (
      <select value={v} onChange={(x) => setRuleKey('step', x.target.value)} className={cls} disabled={!grade || grade.steps === 0} {...common}>
        {!grade || grade.steps === 0 ? <option value="">{grade ? 'No steps for this grade' : 'Select a grade first'}</option> : cellsOf(grade).map((c) => <option key={c.step} value={c.step}>{stepLabel(c.step)}</option>)}
      </select>
    )
    if (d.kind === 'select') return <select value={v} onChange={(x) => set(d.key, x.target.value)} className={cls} {...common}>{d.options!.map((o) => <option key={o}>{o}</option>)}</select>
    if (d.kind === 'textarea') return <textarea rows={2} value={v} onChange={(x) => set(d.key, x.target.value)} className={cls} {...common} />
    const type = d.kind === 'money' || d.kind === 'number' ? 'number' : d.kind
    return <input type={type} min={type === 'number' ? 0 : undefined} step={d.kind === 'money' ? '1000' : undefined} value={v} onChange={(x) => set(d.key, x.target.value)} className={`${cls} ${isLocked(d.key) ? 'bg-cloud text-slate' : ''}`} readOnly={isLocked(d.key)} {...common} />
  }

  return (
    <Overlay open onClose={onClose} title="New document from template" side wide>
      <div className="space-y-4">
        <Field label="Template" hint={canVary ? 'You can choose a variant because company policy allows it.' : 'Only the company standard template is available to your role.'}>
          <select value={id} onChange={(e) => { setId(e.target.value); reset(e.target.value) }} className={inputCls}>
            {choices.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isStandard ? ' (company standard)' : ''}</option>)}
          </select>
        </Field>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate">
          {inherited ? <Badge tone="teal">Inherited from company standard</Badge> : <Badge tone="amber">Template variant (override)</Badge>}
          <span>Version {tpl.version} · {tpl.upload ? 'uploaded file' : 'A4, letterhead and content from company identity'}</span>
        </div>

        {!isUpload && hasPerson && (
          <fieldset className="space-y-3 rounded-lg border border-line p-3">
            <legend className="px-1 text-xs font-semibold text-slate">Recipient</legend>
            <div role="radiogroup" aria-label="Recipient source" className="grid gap-2 sm:grid-cols-2">
              {([['manual', 'Enter details manually (candidate)', 'For people who are not yet employees, such as offer recipients.'], ['employee', 'Existing employee', 'Prefill from the people record. Everything stays editable.']] as const).map(([v, t, d]) => (
                <label key={v} className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm ${source === v ? 'border-teal bg-teal/5' : 'border-line'}`}>
                  <input type="radio" name="recipient-source" checked={source === v} onChange={() => switchSource(v)} className="mt-1" />
                  <span><span className="block font-medium">{t}</span><span className="block text-xs text-slate">{d}</span></span>
                </label>
              ))}
            </div>
            {source === 'manual' && group === 'HR letters' && <p className="text-xs text-slate">This document will be recorded as a <b>candidate</b> document with status Draft. It is not linked to an employee record until the offer is accepted.</p>}
            {source === 'employee' && (
              <Field label="Employee" hint={err('name') ?? 'Fills name, job title, department, salary and manager. Add what is missing below.'}>
                <select value={emp} onChange={(e) => pickEmployee(e.target.value)} className={`${inputCls} ${err('name') ? 'border-red-500' : ''}`}>
                  <option value="">Select an employee</option>{employees.map((e) => <option key={e.id}>{e.name}</option>)}
                </select>
              </Field>
            )}
            {(source === 'manual' || emp) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {shown.filter((d) => !(source === 'employee' && d.key === 'name')).map((d) => (
                  <div key={d.key} className={d.kind === 'textarea' ? 'sm:col-span-2' : ''}>
                    <Field label={`${d.label}${d.required ? ' *' : ''}`} hint={err(d.key) ?? (d.key === 'start' && f.start && f.probation_months ? undefined : undefined)}>{input(d)}</Field>
                    {lockedTag(d.key)}
                    {d.key === 'probation_months' && data.probation_end_date && <p className="mt-1 text-xs text-slate">Probation ends {data.probation_end_date}</p>}
                  </div>
                ))}
              </div>
            )}
            {(source === 'manual' || emp) && set0.structureOn && !rule && !!f.department && !f.grade && shown.some((d) => d.key === 'grade') && <p className="rounded-lg bg-slate/5 p-3 text-xs text-slate">Choose a grade{grade && grade.steps > 0 ? ' and step' : ''} to fill the salary, probation, leave and notice period from your company rules.</p>}
            {(source === 'manual' || emp) && rule && (
              <div className={`rounded-lg border p-3 text-sm ${unlocked ? 'border-amber-300 bg-amber-50' : 'border-teal/30 bg-teal/5'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 font-semibold">{unlocked ? <ShieldAlert size={15} className="text-amber-700" /> : <Lock size={14} className="text-teal" />}{unlocked ? 'Manual override in progress' : 'Pay terms come from company rules'}</p>
                    <p className="mt-0.5 text-xs text-slate">{rule.label}{f.department ? ` · ${f.department}` : ''} · {deptRate}{fromRecord ? ' · salary shown is the current employee record' : ''}</p>
                    {rule.benefits.length > 0 && <p className="mt-1 text-xs text-slate">Benefits: {rule.benefits.join(', ')}</p>}
                  </div>
                  {canOverride
                    ? <Btn s="sm" v="secondary" onClick={toggleLock}>{unlocked ? <><Lock size={13} />Re-lock and restore rule values</> : <><LockOpen size={13} />Unlock to override</>}</Btn>
                    : <span className="text-xs text-slate">Locked. Only HR, the Company Administrator or the MD can override.</span>}
                </div>
                {unlocked && (
                  <div className="mt-3 space-y-2">
                    {overrides.length > 0 && <ul className="space-y-0.5 text-xs font-semibold text-amber-800">{overrides.map((o) => <li key={o}>{o}</li>)}</ul>}
                    <Field label="Reason for override *" hint={reasonErr ?? 'Recorded in the audit trail with your name. Required before the document can be created.'}>
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Counter-offer to retain a competing candidate" className={`${inputCls} ${reasonErr ? 'border-red-500' : ''}`} aria-invalid={!!reasonErr} />
                    </Field>
                  </div>
                )}
              </div>
            )}
            {showSalary && showBreakdown && gross > 0 && (
              <div className="rounded-lg bg-slate/5 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate">
                  <span>Monthly breakdown ({(rule?.split ?? set0.defaults.split).basic}% basic, {(rule?.split ?? set0.defaults.split).housing}% housing, {(rule?.split ?? set0.defaults.split).transport}% transport)</span>
                  {sp.edited && (!rule || unlocked) && <button type="button" className="text-teal underline" onClick={() => setF((p) => ({ ...p, basic: '', housing: '', transport: '' }))}>Reset to default split</button>}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {([['basic', 'Basic'], ['housing', 'Housing'], ['transport', 'Transport']] as const).map(([k, l]) => (
                    <Field key={k} label={`${l} (₦)`}><input type="number" min={0} value={f[k] || String(sp[k])} readOnly={locked} onChange={(e) => set(k, e.target.value)} className={`${inputCls} ${locked ? 'bg-cloud text-slate' : ''}`} /></Field>
                  ))}
                </div>
                <p className={`mt-2 text-xs ${sumOff ? 'font-medium text-red-600' : 'text-slate'}`}>
                  {sumOff ? `Components total ${naira(sp.basic + sp.housing + sp.transport)} but gross is ${naira(gross)}.` : `Annual gross ${naira(gross * 12)}`}
                </p>
              </div>
            )}
          </fieldset>
        )}

        {!isUpload && others.length > 0 && (
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-xs font-semibold text-slate">Fill in the details</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {others.map((k) => <Field key={k} label={labelOfKey(k)}><input value={data[k] ?? ''} onChange={(e) => setOver({ ...over, [k]: e.target.value })} className={inputCls} /></Field>)}
            </div>
          </fieldset>
        )}

        <div className="overflow-hidden rounded-lg border border-line bg-slate/10 p-2" aria-label="Document preview">
          {isUpload ? <div className="bg-white"><UploadedPreview file={tpl.upload!} /></div> : <ScaledPage><A4Page template={tpl} identity={identity} data={data} /></ScaledPage>}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Btn v="secondary" onClick={onClose}>Cancel</Btn>
          {!isUpload && <Btn v="secondary" onClick={() => printPage(tpl, identity, data)}><Printer size={15} />Print / PDF</Btn>}
          <Btn onClick={create}>Create document</Btn>
        </div>
      </div>
    </Overlay>
  )
}
