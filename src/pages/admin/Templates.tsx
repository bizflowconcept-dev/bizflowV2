import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Building2, Download, FileText, GitBranch, LayoutGrid, List, PenLine, Plus, Search, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { Badge, Btn, EmptyState, ExportButton, Field, Flow, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, useToast } from '../../components/ui'
import { DEPARTMENT_MODULES } from '../../tenant/store'
import { COMPANY_ROLES } from '../../security/access'
import { REQUEST_TYPES } from '../../approvals/flow'
import type { FlowRule, Step } from '../../approvals/flow'
import BlocksEditor, { Dropzone } from '../../documents/TemplateEditor'
import { A4Page, ScaledPage, UploadedPreview } from '../../documents/TemplatePage'
import { DOC_TYPES, resolveIdentity, sampleData } from '../../documents/templates'
import type { DocTemplate } from '../../documents/templates'
import {
  COMPANY_PERMS, TPL_FILE_MAX, TPL_INDUSTRIES, TPL_KINDS, addTemplate, bumpVersion, deleteTemplateDraft, exportTemplateJson, parseTemplateJson, recordUpload,
  revertTemplate, saveTemplateVersion, setTemplateStatus, starterPayload, useTemplates, validatePayload,
} from '../../platform/sysops'
import type { DeptDef, RoleDef, SignerDef, Template, TplFile, TplKind, TplPayload, TplSnapshot, TplStatus } from '../../platform/sysops'
import { useAdmin } from './AdminLayout'

type Doc = Extract<TplPayload, { kind: 'Document template' }>
const KIND_ICON: Record<TplKind, ReactNode> = {
  'Approval flow': <GitBranch size={18} />, 'Sign template': <PenLine size={18} />, 'Role set': <ShieldCheck size={18} />, 'Department preset': <Building2 size={18} />, 'Document template': <FileText size={18} />,
}
const STATUS_TONE: Record<TplStatus, string> = { Published: 'green', Draft: 'gray', Unpublished: 'amber', Retired: 'red' }
const STATUSES: TplStatus[] = ['Draft', 'Published', 'Unpublished', 'Retired']
const naira = (n: number) => '₦' + n.toLocaleString('en-NG')
const when = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const MODULE_NAME = (id: string) => DEPARTMENT_MODULES.find((m) => m.id === id)?.name ?? id
const label = 'text-xs font-semibold uppercase tracking-wider text-slate'

const PREVIEW_ID = resolveIdentity({ name: 'Your Company Ltd', address: '1 Marina Road, Lagos', email: 'hello@yourcompany.com', phone: '+234 800 000 0000', website: 'yourcompany.com', rc: '000000', logo: null, color: '#087E8B', footer: 'Your Company Ltd · Lagos', style: 'classic' })
const asDoc = (p: Doc, name: string, description: string): DocTemplate => ({ id: 'marketplace-preview', type: p.docType, name, description, blocks: p.blocks, letterhead: p.letterhead, upload: p.upload, isStandard: false, builtin: false, version: 1, editedBy: 'BizFlow', editedAt: '2026-01-01T00:00:00.000Z' })

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url)
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template'

const FILE_MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
/** Same 1.5 MB limit as company document and Sign templates. SVG is refused because it can carry script. */
function readTplFile(f: File): Promise<{ file?: TplFile; error?: string }> {
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '', mime = FILE_MIME[ext]
  if (!mime) return Promise.resolve({ error: 'Use a PDF, Word (.doc, .docx), PNG, JPG or WebP file.' })
  if (f.size > TPL_FILE_MAX) return Promise.resolve({ error: 'Files over 1.5 MB cannot be stored as a template. Compress it first.' })
  return new Promise((res) => {
    const rd = new FileReader()
    rd.onerror = () => res({ error: 'The file could not be read.' })
    rd.onload = () => res({ file: { name: f.name, url: `data:${mime};base64,${String(rd.result).split(',')[1] ?? ''}`, kind: mime === 'application/pdf' ? 'pdf' : mime.startsWith('image/') ? 'image' : 'other' } })
    rd.readAsDataURL(f)
  })
}

/* ---------- Payload preview ---------- */
function flowSteps(r: FlowRule): string[] { return r.placement === 'before-audit' ? ['Manager', ...r.steps, 'Audit', 'MD'] : ['Manager', 'Audit', ...r.steps, 'MD'] }

function PayloadPreview({ t }: { t: Pick<Template, 'name' | 'desc' | 'payload'> }) {
  const p = t.payload
  if (p.kind === 'Approval flow') return (
    <div className="space-y-3">
      <p className="text-xs text-slate">Added on top of the standard Manager, Audit, MD chain. Rules match by request type and minimum amount.</p>
      {p.rules.length === 0 ? <p className="rounded-lg border border-dashed border-line p-4 text-sm text-slate">No extra rules: the standard chain applies.</p> : p.rules.map((r, i) => (
        <div key={r.id} className="rounded-lg border border-line bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]"><b>Rule {i + 1}</b><Badge tone="teal">{r.type}</Badge><span className="text-slate">{r.minAmount > 0 ? `from ${naira(r.minAmount)}` : 'any amount'}</span></div>
          <Flow steps={flowSteps(r)} />
        </div>
      ))}
    </div>
  )
  if (p.kind === 'Sign template') return (
    <div className="space-y-4">
      {p.upload ? <div className="overflow-hidden rounded-lg border border-line bg-white"><UploadedPreview file={p.upload} /></div> : (
        <div className="max-h-[420px] overflow-y-auto whitespace-pre-line rounded-lg border border-line bg-white p-5 text-[13px] leading-relaxed">{p.body}</div>
      )}
      <div><div className={label}>Signers, in signing order</div>
        <ol className="mt-2 space-y-1.5">{[...p.signers].sort((a, b) => a.order - b.order).map((s, i) => <li key={i} className="flex items-center gap-3 rounded-md border border-line bg-white px-3 py-2 text-[13px]"><span className="grid size-6 place-items-center rounded-full bg-softmint text-xs font-bold text-teal-600">{s.order}</span><b>{s.role}</b>{s.name && <span className="text-slate">{s.name}</span>}</li>)}</ol></div>
    </div>
  )
  if (p.kind === 'Role set') {
    const used = COMPANY_PERMS.filter((c) => p.roles.some((r) => r.permissions.includes(c)))
    return (
      <div>
        <p className="mb-2 text-xs text-slate">{p.roles.length} roles, {used.length} permissions in use. Roles with no permissions can only use their own workspace.</p>
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead><tr className="border-b border-line bg-cloud"><th className="sticky left-0 bg-cloud px-3 py-2 font-semibold">Permission</th>{p.roles.map((r, i) => <th key={i} className="px-2 py-2 text-center font-semibold">{r.name}</th>)}</tr></thead>
            <tbody>{used.map((c) => <tr key={c} className="border-b border-line/60 last:border-0"><td className="sticky left-0 bg-white px-3 py-1.5 font-mono">{c}</td>{p.roles.map((r, i) => <td key={i} className="px-2 py-1.5 text-center">{r.permissions.includes(c) ? <span className="font-bold text-teal" aria-label="Granted">✓</span> : <span className="text-slate/40" aria-label="Not granted">–</span>}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    )
  }
  if (p.kind === 'Department preset') return (
    <ul className="grid gap-3 sm:grid-cols-2">{p.departments.map((d, i) => (
      <li key={i} className="rounded-lg border border-line bg-white p-3"><div className="flex items-center justify-between gap-2"><b className="text-sm">{d.name}</b><Badge tone="teal">{COMPANY_ROLES[d.roleKey].title}</Badge></div>
        <div className="mt-2 flex flex-wrap gap-1">{d.modules.length ? d.modules.map((m) => <span key={m} className="rounded-full bg-cloud px-2 py-0.5 text-xs">{MODULE_NAME(m)}</span>) : <span className="text-xs text-slate">No extra modules</span>}</div></li>
    ))}</ul>
  )
  const d = asDoc(p, t.name, t.desc)
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-slate/10 p-2">
      {p.upload ? <div className="bg-white"><UploadedPreview file={p.upload} /></div> : <ScaledPage><A4Page template={d} identity={PREVIEW_ID} data={sampleData(PREVIEW_ID, true)} /></ScaledPage>}
    </div>
  )
}

/* ---------- Kind-specific editors ---------- */
const chk = 'size-4 accent-teal'
function Row({ children, onRemove, what }: { children: ReactNode; onRemove?: () => void; what: string }) {
  return <div className="flex items-start gap-2 rounded-lg border border-line bg-white p-3"><div className="min-w-0 flex-1">{children}</div>{onRemove && <button type="button" aria-label={`Remove ${what}`} onClick={onRemove} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-slate hover:bg-err/10 hover:text-err"><Trash2 size={15} /></button>}</div>
}
const move = <T,>(a: T[], i: number, v: T) => a.map((x, j) => (j === i ? v : x))

function FlowEditor({ p, onChange }: { p: Extract<TplPayload, { kind: 'Approval flow' }>; onChange: (p: TplPayload) => void }) {
  const set = (i: number, patch: Partial<FlowRule>) => onChange({ ...p, rules: move(p.rules, i, { ...p.rules[i], ...patch }) })
  return (
    <div className="space-y-3">
      {p.rules.map((r, i) => (
        <Row key={r.id} what={`rule ${i + 1}`} onRemove={() => onChange({ ...p, rules: p.rules.filter((_, j) => j !== i) })}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Request type"><select className={inputCls} value={r.type} onChange={(e) => set(i, { type: e.target.value })}>{REQUEST_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Minimum amount (₦)"><input type="number" min={0} className={inputCls} value={r.minAmount} onChange={(e) => set(i, { minAmount: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            <Field label="Extra steps go"><select className={inputCls} value={r.placement} onChange={(e) => set(i, { placement: e.target.value as FlowRule['placement'] })}><option value="after-audit">After Audit</option><option value="before-audit">Before Audit</option></select></Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4"><span className="text-xs font-semibold text-slate">Extra steps</span>
            {(['Compliance', 'HR', 'Legal'] as Step[]).map((s) => <label key={s} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className={chk} checked={r.steps.includes(s)} onChange={(e) => set(i, { steps: e.target.checked ? [...r.steps, s] : r.steps.filter((x) => x !== s) })} />{s}</label>)}</div>
          <div className="mt-3"><Flow steps={flowSteps(r)} /></div>
        </Row>
      ))}
      <Btn s="sm" v="secondary" onClick={() => onChange({ ...p, rules: [...p.rules, { id: `r${Math.random().toString(36).slice(2, 7)}`, type: 'Any', minAmount: 0, steps: ['Compliance'], placement: 'after-audit' }] })}><Plus size={14} />Add rule</Btn>
    </div>
  )
}

function FilePanel({ file, onFile, onRemove, hint }: { file?: TplFile; onFile: (f: TplFile) => void; onRemove?: () => void; hint: string }) {
  const [err, setErr] = useState('')
  return (
    <div>
      {file && <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-3"><FileText size={18} className="text-teal" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{file.name}</div><div className="text-xs text-slate">Stored with the template</div></div>{onRemove && <Btn s="sm" v="ghost" onClick={onRemove}>Remove file</Btn>}</div>}
      <Dropzone label={file ? 'Replace the file' : 'Attach a file'} hint={hint} accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp" onFile={async (fs) => { if (!fs[0]) return; const r = await readTplFile(fs[0]); setErr(r.error ?? ''); if (r.file) onFile(r.file) }} />
      {err && <p role="alert" className="mt-2 text-xs font-medium text-err">{err}</p>}
    </div>
  )
}

function SignEditor({ p, onChange }: { p: Extract<TplPayload, { kind: 'Sign template' }>; onChange: (p: TplPayload) => void }) {
  const set = (i: number, patch: Partial<SignerDef>) => onChange({ ...p, signers: move(p.signers, i, { ...p.signers[i], ...patch }) })
  return (
    <div className="space-y-5">
      {p.upload ? <FilePanel file={p.upload} hint="PDF, Word or image. Max 1.5 MB." onFile={(f) => onChange({ ...p, upload: f })} onRemove={p.body.trim() ? () => onChange({ ...p, upload: undefined }) : undefined} />
        : <Field label="Body text" hint="Merge fields such as {{employee.name}}, {{start_date}} and {{company.name}} are filled when a request is created."><textarea rows={12} className={`${inputCls} h-auto py-2 font-mono text-xs`} value={p.body} onChange={(e) => onChange({ ...p, body: e.target.value })} /></Field>}
      <div className="space-y-2"><div className={label}>Signers</div>
        {p.signers.map((s, i) => (
          <Row key={i} what={`signer ${i + 1}`} onRemove={p.signers.length > 1 ? () => onChange({ ...p, signers: p.signers.filter((_, j) => j !== i) }) : undefined}>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_5rem]">
              <Field label="Role"><input className={inputCls} value={s.role} onChange={(e) => set(i, { role: e.target.value })} /></Field>
              <Field label="Default name" hint="Optional"><input className={inputCls} value={s.name} onChange={(e) => set(i, { name: e.target.value })} /></Field>
              <Field label="Order"><input type="number" min={1} className={inputCls} value={s.order} onChange={(e) => set(i, { order: Math.max(1, Number(e.target.value) || 1) })} /></Field>
            </div>
          </Row>
        ))}
        <Btn s="sm" v="secondary" onClick={() => onChange({ ...p, signers: [...p.signers, { role: '', name: '', order: p.signers.length + 1 }] })}><Plus size={14} />Add signer</Btn></div>
      {!p.upload && <details><summary className="cursor-pointer text-sm font-semibold text-teal">Use an uploaded file instead of body text</summary><div className="mt-2"><FilePanel onFile={(f) => onChange({ ...p, upload: f })} hint="PDF, Word or image. Max 1.5 MB." /></div></details>}
    </div>
  )
}

const permGroups = [...new Set(COMPANY_PERMS.map((c) => c.split('.')[0]))].map((g) => ({ g, items: COMPANY_PERMS.filter((c) => c.startsWith(`${g}.`)) }))
function RoleEditor({ p, onChange }: { p: Extract<TplPayload, { kind: 'Role set' }>; onChange: (p: TplPayload) => void }) {
  const set = (i: number, patch: Partial<RoleDef>) => onChange({ ...p, roles: move(p.roles, i, { ...p.roles[i], ...patch }) })
  return (
    <div className="space-y-3">
      {p.roles.map((r, i) => (
        <Row key={i} what={`role ${r.name || i + 1}`} onRemove={p.roles.length > 1 ? () => onChange({ ...p, roles: p.roles.filter((_, j) => j !== i) }) : undefined}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role name"><input className={inputCls} value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></Field>
            <Field label="Copy permissions from"><select className={inputCls} value="" onChange={(e) => e.target.value && set(i, { permissions: [...COMPANY_ROLES[e.target.value as keyof typeof COMPANY_ROLES].can] })}><option value="">Choose a built-in role…</option>{Object.entries(COMPANY_ROLES).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}</select></Field>
          </div>
          <details className="mt-3" open={p.roles.length === 1}><summary className="cursor-pointer text-sm font-semibold text-teal">{r.permissions.length} of {COMPANY_PERMS.length} permissions</summary>
            <div className="mt-2 space-y-3">{permGroups.map(({ g, items }) => (
              <fieldset key={g}><legend className={label}>{g}</legend><div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">{items.map((c) => <label key={c} className="flex items-center gap-2 font-mono text-xs"><input type="checkbox" className={chk} checked={r.permissions.includes(c)} onChange={(e) => set(i, { permissions: e.target.checked ? [...r.permissions, c] : r.permissions.filter((x) => x !== c) })} />{c}</label>)}</div></fieldset>
            ))}</div></details>
        </Row>
      ))}
      <Btn s="sm" v="secondary" onClick={() => onChange({ ...p, roles: [...p.roles, { name: '', permissions: [] }] })}><Plus size={14} />Add role</Btn>
    </div>
  )
}

function DeptEditor({ p, onChange }: { p: Extract<TplPayload, { kind: 'Department preset' }>; onChange: (p: TplPayload) => void }) {
  const set = (i: number, patch: Partial<DeptDef>) => onChange({ ...p, departments: move(p.departments, i, { ...p.departments[i], ...patch }) })
  return (
    <div className="space-y-3">
      {p.departments.map((d, i) => (
        <Row key={i} what={`department ${d.name || i + 1}`} onRemove={p.departments.length > 1 ? () => onChange({ ...p, departments: p.departments.filter((_, j) => j !== i) }) : undefined}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Department name"><input className={inputCls} value={d.name} onChange={(e) => set(i, { name: e.target.value })} /></Field>
            <Field label="Access profile"><select className={inputCls} value={d.roleKey} onChange={(e) => set(i, { roleKey: e.target.value as DeptDef['roleKey'] })}>{Object.entries(COMPANY_ROLES).map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}</select></Field>
          </div>
          <div className="mt-3"><div className={label}>Modules</div><div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">{DEPARTMENT_MODULES.map((m) => <label key={m.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className={chk} checked={d.modules.includes(m.id)} onChange={(e) => set(i, { modules: e.target.checked ? [...d.modules, m.id] : d.modules.filter((x) => x !== m.id) })} />{m.name}</label>)}</div></div>
        </Row>
      ))}
      <Btn s="sm" v="secondary" onClick={() => onChange({ ...p, departments: [...p.departments, { name: '', roleKey: 'manager', modules: ['tasks'] }] })}><Plus size={14} />Add department</Btn>
    </div>
  )
}

function DocEditor({ p, name, desc, onChange }: { p: Doc; name: string; desc: string; onChange: (p: TplPayload) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Document type"><select className={inputCls} value={p.docType} onChange={(e) => onChange({ ...p, docType: e.target.value as Doc['docType'] })}>{DOC_TYPES.map((d) => <option key={d.v} value={d.v}>{d.n}</option>)}</select></Field>
        {!p.upload && <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium"><input type="checkbox" className={chk} checked={p.letterhead} onChange={(e) => onChange({ ...p, letterhead: e.target.checked })} />Use the company letterhead</label>}
      </div>
      {p.upload ? <FilePanel file={p.upload} hint="PDF, Word or image. Max 1.5 MB." onFile={(f) => onChange({ ...p, upload: f })} onRemove={() => onChange({ ...p, upload: undefined, blocks: p.blocks.length ? p.blocks : (starterPayload('Document template') as Doc).blocks })} />
        : <>
          <BlocksEditor template={asDoc(p, name, desc)} onChange={(t) => onChange({ ...p, blocks: t.blocks })} />
          <details><summary className="cursor-pointer text-sm font-semibold text-teal">Use an uploaded file instead of blocks</summary><div className="mt-2"><FilePanel onFile={(f) => onChange({ ...p, upload: f, letterhead: false })} hint="PDF, Word or image. Max 1.5 MB." /></div></details>
        </>}
    </div>
  )
}

function PayloadEditor({ name, desc, payload, onChange }: { name: string; desc: string; payload: TplPayload; onChange: (p: TplPayload) => void }) {
  switch (payload.kind) {
    case 'Approval flow': return <FlowEditor p={payload} onChange={onChange} />
    case 'Sign template': return <SignEditor p={payload} onChange={onChange} />
    case 'Role set': return <RoleEditor p={payload} onChange={onChange} />
    case 'Department preset': return <DeptEditor p={payload} onChange={onChange} />
    default: return <DocEditor p={payload} name={name} desc={desc} onChange={onChange} />
  }
}

const parseTags = (s: string) => [...new Set(s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 8)

/* ---------- Full-page editor ---------- */
function EditorView({ t, by, onBack }: { t: Template; by: string; onBack: () => void }) {
  const toast = useToast()
  const base: TplSnapshot = { name: t.name, desc: t.desc, tags: t.tags, industry: t.industry, payload: t.payload }
  const [d, setD] = useState<TplSnapshot>(base)
  const [tags, setTags] = useState(t.tags.join(', '))
  const [saving, setSaving] = useState(false)
  const [level, setLevel] = useState<'patch' | 'minor' | 'major'>('patch')
  const [note, setNote] = useState('')
  const next: TplSnapshot = { ...d, name: d.name.trim(), desc: d.desc.trim(), tags: parseTags(tags) }
  const dirty = JSON.stringify(next) !== JSON.stringify(base)
  const problems = useMemo(() => [...(next.name ? [] : ['Give the template a name.']), ...validatePayload(t.kind, d.payload).errors], [d.payload, next.name, t.kind])
  const fieldsOnly = JSON.stringify(next.payload) === JSON.stringify(base.payload)
  return (
    <div className="pb-6">
      <button type="button" onClick={onBack} className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-teal hover:underline"><ArrowLeft size={15} />All templates</button>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-semibold">{d.name || 'Untitled'}</h2><Badge tone="gray">v{t.version}</Badge><Badge tone="teal">{t.kind}</Badge>{dirty && <Badge tone="amber">Unsaved changes</Badge>}</div>
          <p className="mt-1 text-xs text-slate">Saving creates version {bumpVersion(t.version, level)}. Companies keep the version they installed.</p></div>
        <div className="flex gap-2"><Btn v="secondary" onClick={onBack}>{dirty ? 'Discard' : 'Close'}</Btn><Btn disabled={!dirty || problems.length > 0} onClick={() => { setLevel(fieldsOnly ? 'patch' : 'minor'); setSaving(true) }}>Save new version</Btn></div>
      </div>
      {problems.length > 0 && dirty && <ul role="alert" className="mb-4 list-disc rounded-lg border border-err/30 bg-red-50 py-2 pl-8 pr-3 text-xs font-medium text-err">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-5">
          <Panel title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><input className={inputCls} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
              <Field label="Industry"><select className={inputCls} value={d.industry} onChange={(e) => setD({ ...d, industry: e.target.value })}>{TPL_INDUSTRIES.map((i) => <option key={i}>{i}</option>)}</select></Field>
              <div className="sm:col-span-2"><Field label="Description"><textarea rows={2} className={`${inputCls} h-auto py-2`} value={d.desc} onChange={(e) => setD({ ...d, desc: e.target.value })} /></Field></div>
              <div className="sm:col-span-2"><Field label="Tags" hint="Comma separated, up to 8"><input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} /></Field></div>
            </div>
          </Panel>
          <Panel title="Content"><PayloadEditor name={d.name} desc={d.desc} payload={d.payload} onChange={(payload) => setD({ ...d, payload })} /></Panel>
        </div>
        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start" aria-label="Preview"><h2 className="mb-2 font-display text-[17px] font-semibold">Live preview</h2><PayloadPreview t={{ name: d.name, desc: d.desc, payload: d.payload }} /></aside>
      </div>
      <Overlay open={saving} onClose={() => setSaving(false)} title="Save new version">
        <div className="space-y-4">
          <Field label="Version bump"><select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            {(['patch', 'minor', 'major'] as const).map((l) => <option key={l} value={l}>{l === 'patch' ? 'Patch: wording or metadata fix' : l === 'minor' ? 'Minor: content added or changed' : 'Major: breaking change for companies'} (v{bumpVersion(t.version, l)})</option>)}</select></Field>
          <Field label="Changelog note" hint="Required. Shown in the version history."><textarea rows={3} className={`${inputCls} h-auto py-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why" /></Field>
          <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setSaving(false)}>Cancel</Btn>
            <Btn disabled={!note.trim()} onClick={() => { const v = saveTemplateVersion(t.id, next, level, note, by); if (v) { toast(`${next.name} saved as v${v}`); onBack() } }}>Save version</Btn></div>
        </div>
      </Overlay>
    </div>
  )
}

/* ---------- Detail drawer ---------- */
function Detail({ t, manage, by, onClose, onEdit }: { t: Template; manage: boolean; by: string; onClose: () => void; onEdit: () => void }) {
  const toast = useToast()
  const [tab, setTab] = useState('Preview')
  const [confirm, setConfirm] = useState<'retire' | 'delete' | null>(null)
  const simulated = Math.max(0, t.installs - t.installedBy.length)
  const meta: [string, ReactNode][] = [['Version', `v${t.version}`], ['Author', t.author], ['Industry', t.industry], ['Last updated', when(t.updated)], ['Installs', String(t.installs)], ['Tags', t.tags.length ? <span className="flex flex-wrap gap-1">{t.tags.map((g) => <span key={g} className="rounded-full bg-cloud px-2 py-0.5 text-xs">{g}</span>)}</span> : '-']]
  return (
    <>
      <div className="flex flex-wrap items-center gap-2"><Badge tone="teal">{t.kind}</Badge><Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge><Badge tone="gray">v{t.version}</Badge></div>
      <p className="mt-2 text-sm text-slate">{t.desc || 'No description.'}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {manage && <Btn s="sm" onClick={onEdit}>Edit</Btn>}
        {manage && (t.status === 'Published' ? <Btn s="sm" v="secondary" onClick={() => { setTemplateStatus(t.id, 'Unpublished', by); toast(`${t.name} unpublished`) }}>Unpublish</Btn>
          : t.status === 'Retired' ? <Btn s="sm" v="secondary" onClick={() => { setTemplateStatus(t.id, 'Unpublished', by); toast(`${t.name} restored`) }}>Restore</Btn>
          : <Btn s="sm" v="secondary" onClick={() => { setTemplateStatus(t.id, 'Published', by); toast(`${t.name} published`) }}>Publish</Btn>)}
        {manage && t.status !== 'Retired' && <Btn s="sm" v="ghost" onClick={() => setConfirm('retire')}>Retire</Btn>}
        {manage && t.status === 'Draft' && t.installs === 0 && <Btn s="sm" v="ghost" className="!text-err" onClick={() => setConfirm('delete')}>Delete draft</Btn>}
        <Btn s="sm" v="secondary" onClick={() => { download(`${slug(t.name)}-v${t.version}.bizflow-template.json`, exportTemplateJson(t)); toast('Template exported') }}><Download size={14} />Export JSON</Btn>
      </div>
      {!manage && <p className="mt-3 rounded-md bg-cloud px-3 py-2 text-xs text-slate">Your role can view templates but not change them.</p>}
      <div className="mt-5"><Tabs tabs={['Preview', 'Details', 'Versions', 'Installed by']} value={tab} onChange={setTab} /></div>
      <div className="mt-4">
        {tab === 'Preview' && <PayloadPreview t={t} />}
        {tab === 'Details' && <dl className="divide-y divide-line rounded-lg border border-line bg-white text-sm">{meta.map(([k, v]) => <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-3 py-2.5"><dt className="text-slate">{k}</dt><dd className="min-w-0 font-medium">{v}</dd></div>)}<div className="px-3 py-2.5"><dt className="text-slate">Latest changelog</dt><dd className="mt-1 font-medium">{t.history[0]?.note}</dd></div></dl>}
        {tab === 'Versions' && <ol className="space-y-2">{t.history.map((h, i) => (
          <li key={`${h.version}-${i}`} className="rounded-lg border border-line bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><b className="text-sm">v{h.version}</b>{i === 0 && <Badge tone="green">Current</Badge>}</div>
              {manage && i > 0 && <Btn s="sm" v="secondary" onClick={() => { const v = revertTemplate(t.id, h.version, by); if (v) toast(`Reverted to v${h.version} as v${v}`) }}>Revert to this</Btn>}</div>
            <p className="mt-1 text-[13px]">{h.note}</p><p className="mt-1 text-xs text-slate">{h.by} · {when(h.at)} · {h.snapshot.name}</p>
          </li>))}</ol>}
        {tab === 'Installed by' && (
          <div className="space-y-3">
            {t.installedBy.length === 0 ? <p className="rounded-lg border border-dashed border-line p-4 text-sm text-slate">No workspace has installed this template yet.</p>
              : <ul className="divide-y divide-line rounded-lg border border-line bg-white">{t.installedBy.map((i) => <li key={i.slug} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"><b>{i.slug === 'etranzact' ? 'eTranzact International Plc' : i.slug}</b><span className="text-xs text-slate">v{i.version} · {when(i.at)}</span></li>)}</ul>}
            <p className="text-xs text-slate">Only {t.installedBy.length ? 'recorded' : 'the eTranzact'} workspace installs are listed. {simulated > 0 && `The remaining ${simulated} of ${t.installs} installs are simulated adoption counts from the demo data.`}</p>
          </div>
        )}
      </div>
      <Overlay open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'retire' ? 'Retire this template?' : 'Delete this draft?'} alert>
        <p className="text-sm text-slate">{confirm === 'retire' ? `"${t.name}" disappears from the marketplace for companies. Existing installs keep working. You can restore it later.` : `"${t.name}" and its version history are removed.`}</p>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setConfirm(null)}>Cancel</Btn>
          <Btn className="bg-err! hover:bg-red-700!" onClick={() => { if (confirm === 'retire') { setTemplateStatus(t.id, 'Retired', by); toast(`${t.name} retired`) } else { deleteTemplateDraft(t.id, by); toast('Draft deleted'); onClose() } setConfirm(null) }}>{confirm === 'retire' ? 'Retire' : 'Delete'}</Btn></div>
      </Overlay>
    </>
  )
}

/* ---------- Upload / import ---------- */
function UploadDialog({ open, onClose, by, onDone }: { open: boolean; onClose: () => void; by: string; onDone: (id: string) => void }) {
  const toast = useToast()
  const [src, setSrc] = useState<{ file?: TplFile; json?: ReturnType<typeof parseTemplateJson>; name: string } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [fileKind, setFileKind] = useState<'Document template' | 'Sign template'>('Document template')
  const [docType, setDocType] = useState<Doc['docType']>('letter')
  const [meta, setMeta] = useState({ name: '', desc: '' })
  const reset = () => { setSrc(null); setErrors([]); setMeta({ name: '', desc: '' }) }
  const close = () => { reset(); onClose() }
  const draft = useMemo((): (TplSnapshot & { kind: TplKind }) | null => {
    if (!src) return null
    if (src.json?.draft) return { ...src.json.draft, name: meta.name, desc: meta.desc }
    if (!src.file) return null
    const payload: TplPayload = fileKind === 'Sign template' ? { kind: fileKind, body: '', upload: src.file, signers: [{ role: 'Employee', name: '', order: 1 }, { role: 'Managing Director', name: '', order: 2 }] } : { kind: fileKind, docType, blocks: [], letterhead: false, upload: src.file }
    return { kind: fileKind, name: meta.name, desc: meta.desc, tags: ['uploaded'], industry: 'All industries', payload }
  }, [src, fileKind, docType, meta])
  const onFile = async (fs: File[]) => {
    const f = fs[0]; if (!f) return
    reset()
    if (/\.json$/i.test(f.name) || f.type === 'application/json') {
      if (f.size > 4e6) return setErrors(['JSON files over 4 MB are not accepted.'])
      const r = parseTemplateJson(await f.text())
      if (!r.draft) return setErrors(r.errors)
      setSrc({ json: r, name: f.name }); setMeta({ name: r.draft.name, desc: r.draft.desc }); return
    }
    const r = await readTplFile(f)
    if (!r.file) return setErrors([r.error ?? 'Could not read that file.'])
    const base = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
    setSrc({ file: r.file, name: f.name }); setMeta({ name: base, desc: '' })
  }
  return (
    <Overlay open={open} onClose={close} title="Upload a template" side wide>
      <div className="space-y-4">
        <Dropzone label="Drop a template file here" hint="BizFlow template JSON, or a PDF, Word or image file (max 1.5 MB) to publish as a file-backed Document or Sign template." accept=".json,application/json,.pdf,.doc,.docx,image/png,image/jpeg,image/webp" onFile={onFile} />
        {errors.length > 0 && <ul role="alert" className="list-disc rounded-lg border border-err/30 bg-red-50 py-2 pl-8 pr-3 text-xs font-medium text-err">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        {src && draft && (
          <>
            <p className="text-sm text-slate">Read <b className="text-ink">{src.name}</b> as a <b className="text-ink">{draft.kind}</b>. Check the preview, then save it as a draft. It is not visible to companies until you publish it.</p>
            {!src.json && <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Use the file as"><select className={inputCls} value={fileKind} onChange={(e) => setFileKind(e.target.value as typeof fileKind)}><option>Document template</option><option>Sign template</option></select></Field>
              {fileKind === 'Document template' && <Field label="Document type"><select className={inputCls} value={docType} onChange={(e) => setDocType(e.target.value as Doc['docType'])}>{DOC_TYPES.map((d) => <option key={d.v} value={d.v}>{d.n}</option>)}</select></Field>}
            </div>}
            <Field label="Name"><input className={inputCls} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></Field>
            <Field label="Description"><textarea rows={2} className={`${inputCls} h-auto py-2`} value={meta.desc} onChange={(e) => setMeta({ ...meta, desc: e.target.value })} /></Field>
            <PayloadPreview t={draft} />
            <div className="flex justify-end gap-2"><Btn v="secondary" onClick={close}>Cancel</Btn>
              <Btn disabled={!meta.name.trim()} onClick={() => { const id = addTemplate({ ...draft, name: meta.name.trim(), desc: meta.desc.trim(), note: `Imported from ${src.name}` }, by); recordUpload(meta.name.trim(), draft.kind, by, id); toast('Imported as a draft. Publish it when ready.'); close(); onDone(id) }}>Save as draft</Btn></div>
          </>
        )}
      </div>
    </Overlay>
  )
}

/* ---------- Page ---------- */
export default function TemplateMarketplace() {
  const list = useTemplates()
  const { can, actor } = useAdmin()
  const by = actor.split(' (')[0]
  const toast = useToast()
  const manage = can('settings')
  const [view, setView] = useState<'gallery' | 'table'>('gallery')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('All')
  const [status, setStatus] = useState('All')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [nf, setNf] = useState<{ kind: TplKind; name: string; desc: string }>({ kind: 'Document template', name: '', desc: '' })
  const rows = list.filter((t) => (kind === 'All' || t.kind === kind) && (status === 'All' || t.status === status) && `${t.name} ${t.desc} ${t.tags.join(' ')} ${t.industry} ${t.author}`.toLowerCase().includes(q.trim().toLowerCase()))
  const live = list.filter((t) => t.status === 'Published')
  const installs = live.reduce((n, t) => n + t.installs, 0)
  const top = [...list].sort((a, b) => b.installs - a.installs)[0]
  const open = list.find((t) => t.id === openId)
  const editing = list.find((t) => t.id === editId)
  if (editing) return <EditorView key={editing.id} t={editing} by={by} onBack={() => setEditId(null)} />
  return (
    <div>
      <PageHeader eyebrow="Configuration" title="Template marketplace" desc="Approval flows, Sign templates, role sets, department presets and document templates that BizFlow publishes to companies."
        actions={<><ExportButton name="template-adoption" head={['Template', 'Type', 'Status', 'Version', 'Installs']} rows={list.map((t) => [t.name, t.kind, t.status, `v${t.version}`, String(t.installs)])} />{manage && <Btn v="secondary" onClick={() => setUploading(true)}><Upload size={15} />Upload</Btn>}{manage && <Btn onClick={() => setAdding(true)}><Plus size={15} />New template</Btn>}</>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel><Stat label="Published" value={`${live.length} of ${list.length}`} /></Panel>
        <Panel><Stat label="Drafts" value={String(list.filter((t) => t.status === 'Draft').length)} sub="not yet visible to companies" /></Panel>
        <Panel><Stat label="Total installs" value={String(installs)} sub="published templates" /></Panel>
        <Panel><Stat label="Most adopted" value={top?.name ?? '-'} sub={top ? `${top.installs} installs` : undefined} /></Panel>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate" aria-hidden /><input aria-label="Search templates" placeholder="Search name, tag or industry" className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select aria-label="Filter by type" className={`${inputCls} !w-auto`} value={kind} onChange={(e) => setKind(e.target.value)}><option value="All">All types</option>{TPL_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <select aria-label="Filter by status" className={`${inputCls} !w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="All">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <div role="group" aria-label="View" className="ml-auto inline-flex gap-1 rounded-lg border border-line bg-cloud p-1">
          {([['gallery', 'Gallery', LayoutGrid], ['table', 'Table', List]] as const).map(([v, n, Icon]) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold ${view === v ? 'bg-white text-teal shadow-sm' : 'text-slate hover:text-ink'}`}><Icon size={14} />{n}</button>)}
        </div>
      </div>
      <div className="mt-5">
        {rows.length === 0 ? <div className="rounded-lg border border-line bg-white"><EmptyState title="No templates match" body="Try a different search or clear the filters." action={<Btn s="sm" v="secondary" onClick={() => { setQ(''); setKind('All'); setStatus('All') }}>Clear filters</Btn>} /></div>
          : view === 'gallery' ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map((t) => (
              <li key={t.id}><button type="button" onClick={() => setOpenId(t.id)} className="flex h-full w-full cursor-pointer flex-col rounded-lg border border-line bg-white p-4 text-left transition-colors hover:border-teal focus-visible:outline-2 focus-visible:outline-teal">
                <div className="flex items-start justify-between gap-2"><span className="grid size-9 place-items-center rounded-md bg-softmint text-teal-600">{KIND_ICON[t.kind]}</span><Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge></div>
                <b className="mt-3 text-[15px]">{t.name}</b><span className="text-xs text-slate">{t.kind} · {t.industry}</span>
                <span className="mt-2 flex-1 text-[13px] text-slate">{t.desc}</span>
                {t.tags.length > 0 && <span className="mt-3 flex flex-wrap gap-1">{t.tags.slice(0, 4).map((g) => <span key={g} className="rounded-full bg-cloud px-2 py-0.5 text-xs">{g}</span>)}</span>}
                <span className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-slate"><span>v{t.version} · {t.author}</span><span className="num">{t.installs} installs</span></span>
              </button></li>))}</ul>
          ) : (
            <Table label="Templates" right={[5]} head={['Template', 'Type', 'Status', 'Version', 'Updated', 'Installs']} rows={rows.map((t) => [
              <button key="n" type="button" onClick={() => setOpenId(t.id)} className="cursor-pointer text-left"><b className="block hover:text-teal">{t.name}</b><span className="text-xs text-slate">{t.desc}</span></button>, t.kind,
              <Badge key="s" tone={STATUS_TONE[t.status]}>{t.status}</Badge>, `v${t.version}`, when(t.updated), <span key="i" className="num">{t.installs}</span>,
            ])} />
          )}
      </div>
      <p className="mt-3 text-xs text-slate">Install counts include simulated adoption from demo data. Only eTranzact exists as a real workspace; its installs are listed on each template.</p>

      <Overlay open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? 'Template'} side wide>
        {open && <Detail t={open} manage={manage} by={by} onClose={() => setOpenId(null)} onEdit={() => { setEditId(open.id); setOpenId(null) }} />}
      </Overlay>
      <UploadDialog open={uploading} onClose={() => setUploading(false)} by={by} onDone={(id) => setOpenId(id)} />
      <Overlay open={adding} onClose={() => setAdding(false)} title="New template draft">
        <div className="space-y-3">
          <Field label="Type"><select className={inputCls} value={nf.kind} onChange={(e) => setNf({ ...nf, kind: e.target.value as TplKind })}>{TPL_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Name"><input className={inputCls} value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></Field>
          <Field label="Description"><textarea rows={3} className={`${inputCls} h-auto py-2`} value={nf.desc} onChange={(e) => setNf({ ...nf, desc: e.target.value })} /></Field>
          <p className="text-xs text-slate">Starts from a sample you can edit. The draft stays hidden from companies until you publish it.</p>
          <Btn disabled={!nf.name.trim()} onClick={() => { const id = addTemplate({ ...nf, name: nf.name.trim(), desc: nf.desc.trim() }, by); setAdding(false); setNf({ kind: nf.kind, name: '', desc: '' }); toast('Draft saved. Edit its content, then publish.'); setEditId(id) }}>Create and edit</Btn>
        </div>
      </Overlay>
    </div>
  )
}
