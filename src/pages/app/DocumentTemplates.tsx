import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Check, Copy, FilePlus2, FileText, ImageUp, Plus, Printer, RefreshCcw, Star, Trash2, Upload } from 'lucide-react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, PageHeader, Tabs, useToast } from '../../components/ui'
import { useRole } from '../../components/app/AppLayout'
import { useTenant } from '../../tenant/store'
import type { Tenant } from '../../tenant/store'
import { Section, SettingsNav } from '../../tenant/ui'
import BlocksEditor, { Dropzone } from '../../documents/TemplateEditor'
import MarketplaceInstall from '../../documents/MarketplaceInstall'
import GenerateDialog from '../../documents/GenerateDialog'
import { A4Page, printPage, ScaledPage, UploadedPreview } from '../../documents/TemplatePage'
import {
  DOC_TYPES, GROUPS, LETTERHEAD_STYLES, createTemplate, defaultTemplate, deleteTemplate, duplicateTemplate, groupOf, resetTemplate, resolveIdentity,
  saveIdentity, saveTemplate, naira, sampleData, seedIdentity, setAllowOverride, setStandard, typeName, useTemplateConfig,
} from '../../documents/templates'
import type { DocTemplate, DocType, Identity, LetterheadStyle } from '../../documents/templates'
import { isOwnDataset } from '../../data/demo'

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const hexOk = (v: string) => /^#[0-9a-f]{6}$/i.test(v)

/* ---------- Letterhead style picker ---------- */
function StylePicker({ value, onChange, label, allowInherit }: { value: LetterheadStyle | ''; onChange: (v: LetterheadStyle | '') => void; label: string; allowInherit?: boolean }) {
  const opts: { v: LetterheadStyle | ''; n: string; d: string }[] = [...(allowInherit ? [{ v: '' as const, n: 'Company default', d: 'Use the style chosen under Company identity.' }] : []), ...LETTERHEAD_STYLES]
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${allowInherit ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
      {opts.map((o) => (
        <button key={o.v || 'inherit'} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={`cursor-pointer rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-teal ${value === o.v ? 'border-teal bg-softmint ring-1 ring-teal/30' : 'border-line bg-white hover:border-slate'}`}>
          <span className="block text-[13px] font-semibold">{o.n}</span><span className="mt-0.5 block text-xs text-slate">{o.d}</span>
        </button>
      ))}
    </div>
  )
}

/* ---------- Company identity ---------- */
function IdentityTab({ tenant, user }: { tenant: Tenant; user: string }) {
  const cfg = useTemplateConfig(tenant)
  const toast = useToast()
  const [draft, setDraft] = useState<Identity>(cfg.identity)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(cfg.identity)
  const up = (p: Partial<Identity>) => setDraft({ ...draft, ...p })
  const letter = useMemo(() => defaultTemplate('letter'), [])
  const pick = (f?: File) => {
    if (!f) return
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) return setErr('Use a PNG, SVG, JPG or WebP image.')
    if (f.size > 1024 * 1024) return setErr('The logo is over 1 MB.')
    setErr('')
    const rd = new FileReader()
    rd.onload = () => up({ logo: String(rd.result) })
    rd.readAsDataURL(f)
  }
  const resolved = resolveIdentity(draft, tenant)
  const save = () => {
    if (!draft.name.trim()) return setErr('Company name is required.')
    if (!hexOk(draft.color)) return setErr('Brand colour must be a hex value such as #D71920.')
    setErr(''); saveIdentity(tenant, draft, user); toast('Company identity saved. All templates now use it.')
  }
  const text = (k: keyof Identity, label: string, ph = '') => <Field label={label}><input value={String(draft[k] ?? '')} onChange={(e) => up({ [k]: e.target.value })} placeholder={ph} className={inputCls} /></Field>
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-5">
        <Section title="Company details" desc="Entered once and inherited by every document template, including letterhead and merge fields such as {{company.name}}."
          action={<Btn s="sm" v="secondary" onClick={() => { setDraft(seedIdentity(tenant)); setErr('') }}><RefreshCcw size={14} />Fill from company profile</Btn>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{text('name', 'Company name')}</div>
            <div className="sm:col-span-2"><Field label="Registered address"><textarea rows={2} value={draft.address} onChange={(e) => up({ address: e.target.value })} className={`${inputCls} h-auto py-2`} /></Field></div>
            {text('email', 'Email')}{text('phone', 'Phone')}{text('website', 'Website', 'yourcompany.com')}{text('rc', 'RC number', '1234567')}
          </div>
        </Section>
        <Section title="Logo and colour" desc="The logo falls back to your workspace brand logo, then to an initials mark.">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-20 w-36 place-items-center overflow-hidden rounded-md border border-line bg-white">
              {resolved.logo ? <img src={resolved.logo} alt="Letterhead logo preview" className="max-h-full max-w-full object-contain p-2" /> : <ImageUp size={20} className="text-slate/60" aria-hidden />}
            </div>
            <div>
              <div className="flex flex-wrap gap-1.5">
                <Btn s="sm" v="secondary" onClick={() => file.current?.click()}><ImageUp size={14} />{draft.logo ? 'Replace logo' : 'Upload logo'}</Btn>
                {draft.logo && <Btn s="sm" v="ghost" onClick={() => up({ logo: null })}><Trash2 size={14} />Use workspace logo</Btn>}
              </div>
              <p className="mt-1.5 text-xs text-slate">{draft.logo ? 'Custom letterhead logo.' : 'Using your workspace brand logo.'} PNG, SVG, JPG or WebP, up to 1 MB.</p>
              <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp" aria-label="Upload letterhead logo" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          </div>
          <div className="mt-4 flex items-end gap-3">
            <label className="relative block size-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line" style={{ background: hexOk(draft.color) ? draft.color : '#ccc' }}>
              <span className="sr-only">Brand colour picker</span>
              <input type="color" value={hexOk(draft.color) ? draft.color : '#087e8b'} onChange={(e) => up({ color: e.target.value.toUpperCase() })} className="absolute inset-0 size-full cursor-pointer opacity-0" />
            </label>
            <div className="w-40"><Field label="Brand colour"><input value={draft.color} maxLength={7} spellCheck={false} onChange={(e) => up({ color: e.target.value.toUpperCase() })} className={`${inputCls} font-mono uppercase`} /></Field></div>
          </div>
        </Section>
        <Section title="Letterhead style and footer" desc="Templates with the letterhead switched on use this style unless they choose their own.">
          <StylePicker label="Letterhead style" value={draft.style} onChange={(v) => v && up({ style: v })} />
          <div className="mt-4"><Field label="Footer text" hint="Printed at the bottom of every letterhead page."><textarea rows={2} value={draft.footer} onChange={(e) => up({ footer: e.target.value })} className={`${inputCls} h-auto py-2`} /></Field></div>
        </Section>
        {err && <p role="alert" className="rounded-md bg-err/10 p-2.5 text-sm text-err">{err}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
          <Btn v="secondary" disabled={!dirty} onClick={() => { setDraft(cfg.identity); setErr('') }}>Cancel</Btn>
          <Btn disabled={!dirty} onClick={save}>Save identity</Btn>
        </div>
      </div>
      <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start" aria-label="Letterhead preview">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-[17px] font-semibold">Live letterhead preview</h2>{dirty ? <Badge tone="amber">Unsaved</Badge> : <Badge tone="green">Saved</Badge>}</div>
        <div className="overflow-hidden rounded-lg border border-line bg-slate/10 p-2"><ScaledPage><A4Page template={letter} identity={resolved} data={sampleData(draft, isOwnDataset(tenant.slug))} /></ScaledPage></div>
      </aside>
    </div>
  )
}

/* ---------- Template editor ---------- */
function EditorView({ tenant, user, id, onBack }: { tenant: Tenant; user: string; id: string; onBack: () => void }) {
  const cfg = useTemplateConfig(tenant)
  const toast = useToast()
  const saved = cfg.templates.find((t) => t.id === id)
  const [draft, setDraft] = useState<DocTemplate | null>(saved ?? null)
  const [sample, setSample] = useState(true)
  const [gen, setGen] = useState(false)
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null)
  const [err, setErr] = useState('')
  if (!saved || !draft) return <EmptyState title="Template not found" body="It may have been deleted." action={<Btn onClick={onBack}>Back to templates</Btn>} />
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const identity = resolveIdentity(cfg.identity, tenant)
  const data = sample ? sampleData(cfg.identity, isOwnDataset(tenant.slug)) : null
  const patch = (p: Partial<DocTemplate>) => setDraft({ ...draft, ...p })
  const save = () => { const n = saveTemplate(tenant, draft, user); setDraft(n); toast(`${n.name} saved as version ${n.version}`) }
  const readFile = (f?: File) => {
    if (!f) return
    if (f.size > 1.5e6) return setErr('Files over 1.5 MB cannot be stored as a template. Compress it first.')
    const rd = new FileReader()
    rd.onload = () => { setErr(''); patch({ upload: { name: f.name, url: String(rd.result), kind: f.type === 'application/pdf' ? 'pdf' : f.type.startsWith('image/') ? 'image' : 'other' } }) }
    rd.readAsDataURL(f)
  }
  const mode = draft.upload ? 'file' : 'blocks'
  return (
    <div className="pb-6">
      <button type="button" onClick={onBack} className="mb-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-teal hover:underline"><ArrowLeft size={15} />All templates</button>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-semibold">{draft.name}</h2><Badge tone="gray">v{saved.version}</Badge>{saved.isStandard && <Badge tone="teal">Company standard</Badge>}{dirty && <Badge tone="amber">Unsaved changes</Badge>}</div>
          <p className="mt-1 text-xs text-slate">{typeName(draft.type)} · last edited by {saved.editedBy} on {when(saved.editedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!draft.upload && <Btn v="secondary" onClick={() => printPage(draft, identity, data)}><Printer size={15} />Print / PDF</Btn>}
          <Btn v="secondary" disabled={dirty} title={dirty ? 'Save your changes first' : undefined} onClick={() => setGen(true)}><FilePlus2 size={15} />Use this template</Btn>
          <Btn disabled={!dirty} onClick={save}>Save changes</Btn>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="min-w-0 space-y-5">
          <Section title="Template settings">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Template name"><input value={draft.name} onChange={(e) => patch({ name: e.target.value })} className={inputCls} /></Field>
                <Field label="Description"><input value={draft.description} onChange={(e) => patch({ description: e.target.value })} className={inputCls} /></Field>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={draft.letterhead} disabled={mode === 'file'} onChange={(e) => patch({ letterhead: e.target.checked })} className="size-4 accent-teal" />Use company letterhead</label>
                {draft.letterhead && mode === 'blocks' && <label className="flex items-center gap-2 text-sm">Style
                  <select value={draft.style ?? ''} onChange={(e) => patch({ style: (e.target.value || undefined) as LetterheadStyle | undefined })} className={`${inputCls} !h-9 !w-48`}><option value="">Company default</option>{LETTERHEAD_STYLES.map((s) => <option key={s.v} value={s.v}>{s.n}</option>)}</select></label>}
              </div>
              <div role="radiogroup" aria-label="Template content" className="inline-flex gap-1 rounded-lg border border-line bg-cloud p-1">
                {([['blocks', 'Build with blocks', FileText], ['file', 'Upload your own file', Upload]] as const).map(([v, n, Icon]) => (
                  <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => v === 'blocks' ? patch({ upload: undefined }) : patch({ upload: draft.upload ?? { name: '', url: '', kind: 'other' } })}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold ${mode === v ? 'bg-white text-teal shadow-sm ring-1 ring-teal/30' : 'text-slate hover:text-ink'}`}><Icon size={14} />{n}</button>
                ))}
              </div>
            </div>
          </Section>

          {mode === 'blocks' ? (
            <Section title="Content" desc="Build the document from blocks. Merge fields are highlighted in the preview and replaced when a document is created."><BlocksEditor template={draft} onChange={setDraft} /></Section>
          ) : (
            <Section title="Your own file" desc="Staff who create a document from this template receive the uploaded file as-is. Merge fields and letterhead do not apply.">
              {draft.upload?.url ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3"><FileText size={20} className="text-teal" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{draft.upload.name}</div><div className="text-xs text-slate">Stored with the template · {draft.upload.kind.toUpperCase()}</div></div><Btn s="sm" v="ghost" onClick={() => patch({ upload: { name: '', url: '', kind: 'other' } })}><Trash2 size={14} />Remove</Btn></div>
              ) : <Dropzone label="Upload a PDF, Word file or image as the template" hint="PDF, PNG, JPG or Word. Max 1.5 MB." accept=".pdf,image/*,.doc,.docx" onFile={(fs) => readFile(fs[0])} />}
              {err && <p role="alert" className="mt-2 text-xs font-medium text-err">{err}</p>}
            </Section>
          )}

          <Section title="Manage this template">
            <div className="flex flex-wrap gap-2">
              {!saved.isStandard && <Btn v="secondary" disabled={dirty} title={dirty ? 'Save your changes first' : undefined} onClick={() => { setStandard(tenant, id, user); toast(`${saved.name} is now the company standard ${typeName(saved.type).toLowerCase()}`) }}><Star size={15} />Make company standard</Btn>}
              <Btn v="secondary" onClick={() => { const c = duplicateTemplate(tenant, id, user); if (c) { toast('Template duplicated'); onBack() } }}><Copy size={15} />Duplicate</Btn>
              {saved.builtin && <Btn v="secondary" onClick={() => setConfirm('reset')}><RefreshCcw size={15} />Reset to default</Btn>}
              {!saved.builtin && !saved.isStandard && <Btn v="ghost" className="!text-err hover:!bg-err/10" onClick={() => setConfirm('delete')}><Trash2 size={15} />Delete</Btn>}
            </div>
          </Section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start" aria-label="Document preview">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-[17px] font-semibold">Live preview · A4</h2>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium"><input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} className="size-4 accent-teal" />Preview with sample data</label>
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-slate/10 p-2">
            {draft.upload ? <div className="bg-white">{draft.upload.url ? <UploadedPreview file={draft.upload} /> : <p className="p-8 text-center text-sm text-slate">Upload a file to preview it here.</p>}</div>
              : <ScaledPage><A4Page template={draft} identity={identity} data={data} /></ScaledPage>}
          </div>
          {!draft.upload && <p className="mt-2 text-xs text-slate">{sample ? 'Showing sample values.' : 'Merge fields are highlighted in yellow.'} Print opens the browser dialog; choose Save as PDF.</p>}
        </aside>
      </div>

      <GenerateDialog open={gen} onClose={() => setGen(false)} tenant={tenant} cfg={cfg} user={user} templateId={id} canVary />
      <Overlay open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'reset' ? 'Reset to default?' : 'Delete template?'} alert>
        <p className="text-sm text-slate">{confirm === 'reset' ? `The content of "${saved.name}" returns to the BizFlow default for ${typeName(saved.type).toLowerCase()}. Your edits are replaced and the version number increases.` : `"${saved.name}" is removed for everyone. Documents already created from it are not affected.`}</p>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setConfirm(null)}>Cancel</Btn>
          <Btn className="bg-err! hover:bg-red-700!" onClick={() => {
            if (confirm === 'reset') { const n = resetTemplate(tenant, id, user); if (n) setDraft(n); toast('Template reset to default'); setConfirm(null) } else { deleteTemplate(tenant, id, user); toast('Template deleted'); onBack() }
          }}>{confirm === 'reset' ? 'Reset template' : 'Delete'}</Btn></div>
      </Overlay>
    </div>
  )
}

/* ---------- Templates list ---------- */
function TemplatesTab({ tenant, user, open }: { tenant: Tenant; user: string; open: (id: string) => void }) {
  const cfg = useTemplateConfig(tenant)
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [type, setType] = useState<DocType>('letter')
  const [name, setName] = useState('')
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-line bg-white p-4">
        <div className="max-w-xl">
          <h2 className="text-sm font-semibold">Company standard templates</h2>
          <p className="mt-0.5 text-[13px] text-slate">One template per document type is the company standard. Every new document inherits its content and your company identity. Other templates are variants.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium"><input type="checkbox" checked={cfg.allowOverride} onChange={(e) => { setAllowOverride(tenant, e.target.checked, user); toast(e.target.checked ? 'Staff can now choose template variants' : 'Staff are limited to the company standard') }} className="size-4 accent-teal" />Let staff choose variants</label>
          <MarketplaceInstall tenant={tenant} user={user} />
          <Btn onClick={() => { setName(''); setAdding(true) }}><FilePlus2 size={15} />New template</Btn>
        </div>
      </div>
      {GROUPS.map((g) => {
        const items = cfg.templates.filter((t) => groupOf(t.type) === g)
        if (!items.length) return null
        return (
          <section key={g} aria-label={g}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">{g}</h3>
            <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {items.map((t) => (
                <li key={t.id} className="flex flex-col rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-2"><button type="button" onClick={() => open(t.id)} className="min-w-0 cursor-pointer text-left text-[15px] font-semibold hover:text-teal">{t.name}</button><div className="flex shrink-0 gap-1">{t.isStandard && <Badge tone="teal">Standard</Badge>}{t.upload?.url && <Badge tone="blue">File</Badge>}</div></div>
                  <p className="mt-1 flex-1 text-[13px] text-slate">{t.description}</p>
                  <p className="mt-3 text-xs text-slate">v{t.version} · {t.editedBy} · {when(t.editedAt)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Btn s="sm" onClick={() => open(t.id)}>Edit</Btn>
                    <Btn s="sm" v="secondary" onClick={() => { duplicateTemplate(tenant, t.id, user); toast('Template duplicated') }}><Copy size={14} />Duplicate</Btn>
                    {!t.isStandard && <Btn s="sm" v="ghost" onClick={() => { setStandard(tenant, t.id, user); toast(`${t.name} is now the company standard`) }}><Star size={14} />Make standard</Btn>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <Overlay open={adding} onClose={() => setAdding(false)} title="New template">
        <div className="space-y-4">
          <Field label="Document type"><select value={type} onChange={(e) => setType(e.target.value as DocType)} className={inputCls}>{DOC_TYPES.map((d) => <option key={d.v} value={d.v}>{d.n}</option>)}</select></Field>
          <Field label="Template name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${typeName(type)} (variant)`} className={inputCls} /></Field>
          <p className="text-xs text-slate">Starts from the BizFlow default for this type. It is a variant until you make it the company standard.</p>
          <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setAdding(false)}>Cancel</Btn><Btn onClick={() => { const t = createTemplate(tenant, type, name.trim() || `${typeName(type)} (variant)`, user); setAdding(false); open(t.id) }}><Check size={15} />Create and edit</Btn></div>
        </div>
      </Overlay>
    </div>
  )
}

/* ---------- Page ---------- */
export default function DocumentTemplates() {
  const tenant = useTenant()
  const { r, can } = useRole()
  const [tab, setTab] = useState('Templates')
  const [editing, setEditing] = useState<string | null>(null)
  if (!tenant) return null
  if (!can('documents.templates.manage')) return (
    <div><PageHeader eyebrow="Settings · Company" title="Document Templates" /><SettingsNav />
      <div className="rounded-lg border border-line bg-white"><EmptyState title="Templates are managed by your company administrators" body={`Your role (${r.title}) can create documents from the company standard templates in Documents, but not change them.`} /></div></div>
  )
  return (
    <div>
      <PageHeader eyebrow="Settings · Company" title="Document Templates" desc={`Set ${tenant.profile.name}'s standard letters, invoices and orders once. Every document your team creates inherits the same identity, letterhead and wording.`} />
      <SettingsNav />
      {editing ? <EditorView key={editing} tenant={tenant} user={r.user} id={editing} onBack={() => setEditing(null)} /> : (
        <>
          <p className="mb-4 rounded-lg border border-line bg-white px-4 py-3 text-[13px] text-slate">Grades, salaries, probation and leave used by offer and employment letters are now managed in <Link to="/admin/business/settings/employee-rules" className="font-semibold text-teal underline">Employee Rules</Link>.</p>
          <Tabs tabs={['Templates', 'Company identity']} value={tab} onChange={setTab} />
          <div className="mt-5">{tab === 'Templates' ? <TemplatesTab tenant={tenant} user={r.user} open={setEditing} />  : <IdentityTab tenant={tenant} user={r.user} />}</div>
        </>
      )}
    </div>
  )
}
