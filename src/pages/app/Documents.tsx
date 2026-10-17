import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, PageHeader, Table, Timeline, useToast } from '../../components/ui'
import { useRole } from '../../components/app/AppLayout'
import { recordAudit, useTenant } from '../../tenant/store'
import { employeesForTenant } from '../../data/demo'
import GenerateDialog from '../../documents/GenerateDialog'
import { A4Page, printPage, ScaledPage } from '../../documents/TemplatePage'
import { useTemplateConfig } from '../../documents/templates'
import { fileUrl } from '../../platform/persist'
import { accessOf, addDoc, persistDocs, canUploadAnywhere, CATEGORIES, logDoc, patchDoc, removeDoc, seesCompanyWide, useDocs, VISIBILITIES } from '../../documents/store'
import type { Category, Doc, Visibility } from '../../documents/store'

const daysTo = (iso?: string) => (iso ? Math.ceil((new Date(iso + 'T23:59:59').getTime() - Date.now()) / 86400000) : null)
const fmtDay = (iso?: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const statusOf = (d: Doc) => { const n = daysTo(d.expires); return n != null && n < 0 ? 'Expired' : n != null && n <= 30 ? 'Expiring' : d.status }
const TONE: Record<string, string> = { Expired: 'red', Expiring: 'amber', 'In signing': 'blue', Signed: 'green', Active: 'green', Draft: 'gray' }
const VIS_HELP: Record<Visibility, string> = { 'Only me': 'Only the owner', HR: 'HR and the person it belongs to', Finance: 'Finance and the person it belongs to', Operations: 'Operations, procurement and asset officers', Sales: 'Sales and business development', Company: 'Every employee' }

function save(d: Doc) {
  if (d.generated) { printPage(d.generated.template, d.generated.identity, d.generated.data); return }
  const a = document.createElement('a')
  if (d.file?.url) { a.href = d.file.url; a.download = d.file.name } else {
    const html = `<!doctype html><meta charset="utf-8"><title>${esc(d.name)}</title><body style="font:15px/1.6 Inter,Arial,sans-serif;max-width:680px;margin:40px auto;padding:0 20px;color:#102A30"><h1>${esc(d.name)}</h1><p>${esc(d.belongsTo)} · ${esc(d.version)} · updated ${esc(d.updated)}</p><p>${esc(d.summary)}</p><hr><small>${esc(d.id)} · downloaded from BizFlow Documents</small></body>`
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = `${d.name}.html`
  }
  a.click()
}

function Viewer({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  const { r, role, can } = useRole()
  const tenant = useTenant()
  const toast = useToast()
  const [confirmDel, setConfirmDel] = useState(false)
  if (!doc) return null
  const v = { user: r.user, role, perms: r.can }
  const a = accessOf(doc, v)
  const download = () => {
    save(doc); logDoc(doc.id, r.user, 'downloaded this document')
    if (tenant) recordAudit(tenant.slug, 'Document downloaded', undefined, undefined, { category: 'Documents', ref: `${doc.id} ${doc.name}` })
    toast('Download started')
  }
  return (
    <Overlay open onClose={() => { setConfirmDel(false); onClose() }} title={doc.name} side wide>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate">
        <Badge tone={TONE[statusOf(doc)]}>{statusOf(doc)}</Badge>{doc.generated && (doc.generated.inherited ? <Badge tone="teal">Inherited from company standard</Badge> : <Badge tone="amber">Template variant</Badge>)}<span className="num">{doc.id}</span><span>{doc.category} · {doc.belongsTo}</span><span>{doc.version} · {doc.size}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {a.download ? <Btn s="sm" onClick={download}>{doc.generated ? 'Print / save as PDF' : 'Download'}</Btn> : <span className="inline-flex min-h-8 items-center rounded-md bg-cloud px-3 text-[13px] text-slate">View only. Your role cannot download this.</span>}
        {doc.file?.url && a.view && <a href={doc.file.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold hover:bg-cloud">Open in new tab</a>}
        {doc.status === 'In signing' && <Btn s="sm" v="secondary" to="/admin/business/sign">Track signatures</Btn>}
        {can('sign.create') && doc.status !== 'In signing' && doc.category !== 'Company' && <Btn s="sm" v="secondary" to="/admin/business/sign">Request signature</Btn>}
        {a.manage && <Btn s="sm" v="ghost" className="!text-err hover:!bg-err/10" onClick={() => setConfirmDel(true)}>Delete</Btn>}
      </div>
      {confirmDel && (
        <div role="alertdialog" aria-label="Confirm delete" className="mt-4 rounded-md border border-err/30 bg-err/5 p-3 text-sm">
          <p><b>Delete {doc.name}?</b> It is removed for everyone with access. The deletion is recorded in the audit log.</p>
          <div className="mt-3 flex gap-2"><Btn s="sm" v="secondary" onClick={() => setConfirmDel(false)}>Cancel</Btn><Btn s="sm" className="!bg-err hover:!bg-red-700" onClick={() => { removeDoc(doc.id); if (tenant) recordAudit(tenant.slug, 'Document deleted', doc.name, undefined, { category: 'Documents', ref: doc.id }); toast('Document deleted'); onClose() }}>Delete document</Btn></div>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-md border border-line bg-white">
        {doc.generated ? <div className="bg-slate/10 p-2"><ScaledPage><A4Page template={doc.generated.template} identity={doc.generated.identity} data={doc.generated.data} /></ScaledPage></div>
          : doc.file && !doc.file.url ? <div className="grid h-40 place-items-center p-6 text-center text-sm text-slate">This file was too large to keep in the browser after a reload. Upload it again to preview it.</div>
          : doc.file?.kind === 'pdf' ? <iframe src={`${doc.file.url}#toolbar=0&view=FitH`} title={doc.name} className="h-[420px] w-full" />
          : doc.file?.kind === 'image' ? <img src={doc.file.url} alt={doc.name} className="max-h-[420px] w-full bg-cloud object-contain" />
          : (
            <div className="aspect-[1/1.2] max-h-[460px] overflow-auto p-8 text-[13px] leading-relaxed">
              <h3 className="font-display text-lg font-semibold">{doc.name}</h3>
              <div className="mt-1 text-xs text-slate">{doc.belongsTo} · {doc.version}</div>
              <p className="mt-5">{doc.summary || 'No preview text for this file.'}</p>
              {doc.file && <p className="mt-4 text-xs text-slate">A live preview is not available for this file type. {a.download ? 'Download it to open it.' : ''}</p>}
            </div>
          )}
      </div>

      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-slate">Owner</dt><dd className="font-semibold">{doc.owner}</dd></div>
        <div><dt className="text-xs text-slate">Last updated</dt><dd className="font-semibold">{doc.updated}</dd></div>
        <div><dt className="text-xs text-slate">Expires</dt><dd className="font-semibold">{fmtDay(doc.expires)}</dd></div>
        <div><dt className="text-xs text-slate">Why you can see this</dt><dd className="font-semibold">{a.why}</dd></div>
      </dl>
      <div className="mt-4">
        <Field label="Who can see this document" hint={VIS_HELP[doc.visibility]}>
          {a.manage ? (
            <select value={doc.visibility} className={inputCls} onChange={(e) => { const to = e.target.value as Visibility; patchDoc(doc.id, { visibility: to }, { t: 'Just now', a: r.user, x: `changed visibility from ${doc.visibility} to ${to}` }); if (tenant) recordAudit(tenant.slug, 'Document sharing changed', doc.visibility, to, { category: 'Documents', ref: `${doc.id} ${doc.name}` }); toast(`Now visible to: ${to}`) }}>{VISIBILITIES.map((x) => <option key={x}>{x}</option>)}</select>
          ) : <div className="rounded-md bg-cloud px-3 py-2 text-sm font-semibold">{doc.visibility}</div>}
        </Field>
      </div>
      {a.manage && doc.log.length > 0 && <div className="mt-6"><div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate">Access history</div><Timeline items={doc.log.slice(0, 8)} /></div>}
    </Overlay>
  )
}

function UploadDialog({ open, onClose, limited, user }: { open: boolean; onClose: () => void; limited: boolean; user: string }) {
  const tenant = useTenant()
  const toast = useToast()
  const names = useMemo(() => employeesForTenant(tenant?.slug).map((e) => e.name), [tenant?.slug])
  const ref = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [cat, setCat] = useState<Category>('Employees')
  const [to, setTo] = useState('')
  const [vis, setVis] = useState<Visibility>(limited ? 'HR' : 'Company')
  const [exp, setExp] = useState('')
  const [err, setErr] = useState('')
  const category: Category = limited ? 'Employees' : cat
  const belongs = limited ? user : to
  const submit = () => {
    if (!file) return setErr('Choose a file to upload.')
    if (file.size > 10e6) return setErr('That file is over 10 MB.')
    if (!name.trim()) return setErr('Give the document a name.')
    if (!belongs.trim()) return setErr('Say which record it belongs to.')
    const kind = file.type === 'application/pdf' ? 'pdf' : file.type.startsWith('image/') ? 'image' : 'other'
    addDoc({ name: name.trim(), category, belongsTo: belongs.trim(), subject: category === 'Employees' ? belongs.trim() : undefined, version: 'v1', expires: exp || undefined, status: 'Active', visibility: vis, owner: user, updated: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), size: file.size > 1e6 ? `${(file.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1e3))} KB`, summary: '', file: { url: fileUrl(file, persistDocs), kind, name: file.name } })
    if (tenant) recordAudit(tenant.slug, 'Document uploaded', undefined, category, { category: 'Documents', ref: name.trim() })
    toast(`"${name.trim()}" filed. Visible to: ${vis}`)
    setFile(null); setName(''); setTo(''); setExp(''); setErr(''); onClose()
  }
  return (
    <Overlay open={open} onClose={onClose} title={limited ? 'Add a document to my record' : 'Upload document'}>
      <div className="space-y-4">
        {err && <p role="alert" className="rounded-md bg-err/10 p-2.5 text-sm text-err">{err}</p>}
        <div>
          <input ref={ref} type="file" hidden accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !name) setName(f.name.replace(/\.[^.]+$/, '')); e.target.value = '' }} />
          <button type="button" onClick={() => ref.current?.click()} className="w-full cursor-pointer rounded-lg border-2 border-dashed border-line bg-cloud p-5 text-center text-sm hover:border-teal">{file ? <><b>{file.name}</b><span className="mt-1 block text-xs text-slate">Click to choose a different file</span></> : <><b>Choose a file</b><span className="mt-1 block text-xs text-slate">PDF, image, Word or Excel, up to 10 MB</span></>}</button>
        </div>
        <Field label="Document name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
        {!limited && (
          <>
            <Field label="Belongs to"><select value={cat} onChange={(e) => { setCat(e.target.value as Category); setTo('') }} className={inputCls}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label={cat === 'Employees' ? 'Employee' : 'Record name'}>
              {cat === 'Employees' ? <select value={to} onChange={(e) => setTo(e.target.value)} className={inputCls}><option value="">Select employee</option>{names.map((n) => <option key={n}>{n}</option>)}</select> : <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={cat === 'Vendors' ? 'Vendor name' : cat === 'Assets' ? 'Asset tag or plate' : cat === 'Customers' ? 'Customer name' : 'e.g. All staff'} className={inputCls} />}
            </Field>
          </>
        )}
        <Field label="Who can see it" hint={VIS_HELP[vis]}>
          <select value={vis} onChange={(e) => setVis(e.target.value as Visibility)} className={inputCls}>{(limited ? (['Only me', 'HR'] as Visibility[]) : VISIBILITIES).map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
        <Field label="Expires (optional)"><input type="date" value={exp} onChange={(e) => setExp(e.target.value)} className={inputCls} /></Field>
        <div className="flex justify-end gap-2 pt-2"><Btn v="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={submit}>Upload</Btn></div>
      </div>
    </Overlay>
  )
}

function TemplateLauncher({ open, onClose, tenant, user, canVary }: { open: boolean; onClose: () => void; tenant: NonNullable<ReturnType<typeof useTenant>>; user: string; canVary: boolean }) {
  const cfg = useTemplateConfig(tenant)
  return <GenerateDialog open={open} onClose={onClose} tenant={tenant} cfg={cfg} user={user} canVary={canVary || cfg.allowOverride} />
}

export default function Documents() {
  const docs = useDocs()
  const { r, role, can } = useRole()
  const [cat, setCat] = useState<'All' | Category>('All')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [up, setUp] = useState(false)
  const [tpl, setTpl] = useState(false)
  const tenant = useTenant()
  const v = { user: r.user, role, perms: r.can }
  const wide = seesCompanyWide(v) || role === 'auditor' || role === 'compliance'
  const mine = docs.filter((d) => accessOf(d, v).view)
  const counts = (c: 'All' | Category) => mine.filter((d) => c === 'All' || d.category === c).length
  const cats = (['All', ...CATEGORIES] as const).filter((c) => c === 'All' || counts(c) > 0)
  const shown = mine.filter((d) => (cat === 'All' || d.category === cat) && `${d.name} ${d.belongsTo} ${d.id}`.toLowerCase().includes(q.toLowerCase()))
  const soon = wide ? mine.filter((d) => { const n = daysTo(d.expires); return n != null && n <= 30 }) : []
  const opened = docs.find((d) => d.id === open) ?? null
  const desc = wide ? 'Every record filed by the company, with who can see it and what has been accessed.' : can('sign.create') || r.can.length ? 'Documents you own or have been given access to, plus company policies.' : 'Your contracts, payslips and letters, plus the company policies you are expected to follow.'
  return (
    <div>
      <PageHeader eyebrow="Control" title={wide ? 'Documents' : 'My documents'} desc={desc} actions={<>
        {tenant && (can('documents.upload') || can('sign.create')) && <Btn v="secondary" onClick={() => setTpl(true)}>New from template</Btn>}
        {can('documents.templates.manage') && <Btn v="ghost" to="/admin/business/settings/document-templates">Manage templates</Btn>}
        <Btn v={can('sign.create') ? 'secondary' : 'primary'} onClick={() => setUp(true)}>{canUploadAnywhere(v) ? 'Upload' : 'Add to my record'}</Btn>
        {can('sign.create') && <Btn to="/admin/business/sign">Request signature</Btn>}
      </>} />

      {soon.length > 0 && (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-warn/40 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>{soon.length} document{soon.length > 1 ? 's' : ''} expire within 30 days or have expired</b>
          <span className="flex flex-wrap gap-x-3">{soon.slice(0, 3).map((d) => <button key={d.id} onClick={() => setOpen(d.id)} className="cursor-pointer underline decoration-amber-900/40 underline-offset-2">{d.name} · {d.belongsTo}</button>)}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {cats.map((c) => <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${cat === c ? 'border-midnight bg-midnight text-white' : 'border-line bg-white text-slate hover:text-ink'}`}>{c === 'Employees' && !wide ? 'My records' : c} <span className={`num ml-1 ${cat === c ? 'text-white/70' : 'text-slate/70'}`}>{counts(c)}</span></button>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" placeholder="Search documents" className={`${inputCls} ml-auto w-full sm:w-52`} />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
        {shown.length === 0 ? <EmptyState title={mine.length ? 'No documents here' : 'No documents yet'} body={mine.length ? 'Try another folder or clear the search.' : wide ? 'Upload contracts, policies and records to keep them in one place, with control over who can see each one.' : 'Documents shared with you will appear here.'} action={!mine.length && (wide || canUploadAnywhere(v)) ? <Btn onClick={() => setUp(true)}>Upload your first document</Btn> : undefined} /> : (
          <Table label="Documents" pageSize={10} head={['Document', 'Who can see it', 'Expires', 'Status', '']} rows={shown.map((d) => {
            const a = accessOf(d, v)
            return [
              <button key="n" onClick={() => setOpen(d.id)} className="cursor-pointer text-left font-semibold hover:text-teal">{d.name}<span className="block text-xs font-normal text-slate">{d.belongsTo} · {d.version} · {d.size}</span></button>,
              <span key="v" className="text-[13px]">{d.visibility === 'Only me' ? (d.owner === r.user ? 'Only you' : `Only ${d.owner.split(' ')[0]}`) : d.visibility}</span>,
              fmtDay(d.expires),
              <Badge key="s" tone={TONE[statusOf(d)]}>{statusOf(d)}</Badge>,
              <span key="a" className="flex items-center gap-1.5 whitespace-nowrap"><Btn s="sm" v="secondary" onClick={() => setOpen(d.id)}>View</Btn>{a.download ? <Btn s="sm" v="ghost" aria-label={`Download ${d.name}`} onClick={() => { save(d); logDoc(d.id, r.user, 'downloaded this document') }}>Download</Btn> : <span className="px-2 text-xs text-slate" title="Your role can view this document but not download it">View only</span>}</span>,
            ]
          })} />
        )}
      </div>
      {!wide && <p className="mt-3 text-xs text-slate">You see documents you own, ones filed against your record, and ones shared with your department or the whole company. Ask HR if something is missing.</p>}
      <Viewer key={opened?.id ?? 'none'} doc={opened} onClose={() => setOpen(null)} />
      {tenant && <TemplateLauncher open={tpl} onClose={() => setTpl(false)} tenant={tenant} user={r.user} canVary={can('documents.templates.manage')} />}
      <UploadDialog open={up} onClose={() => setUp(false)} limited={!canUploadAnywhere(v)} user={r.user} />
    </div>
  )
}
