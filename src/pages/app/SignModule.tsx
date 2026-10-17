import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Avatar, Badge, Btn, EmptyState, Field, Flow, inputCls, Overlay, PageHeader, Panel, Table, Tabs, Timeline, useToast } from '../../components/ui'
import { useRole } from '../../components/app/AppLayout'
import { activeSlug, auditFor, recordAudit, useTenant } from '../../tenant/store'
import { employeesForTenant, isOwnDataset } from '../../data/demo'
import { fileUrl, jsonWithFiles } from '../../platform/persist'
import { OPEN_STAGES, linkDocument, useLeads } from '../../crm/store'

/* ---------- Types & store ---------- */
type Signer = { id: string; role: string; name: string; order: number }
type FieldType = 'Signature' | 'Initials' | 'Date Signed' | 'Full Name' | 'Job Title' | 'Checkbox' | 'Text'
type Placed = { id: string; type: FieldType; x: number; y: number; signer: string; w?: number; h?: number }
type Upload = { name: string; url: string; kind: 'pdf' | 'image' | 'other' }
type Template = { id: string; name: string; body: string; signers: Signer[]; fields: Placed[]; refs: string[]; upload?: Upload; updated: string }
type Captured = { kind: 'Draw' | 'Type' | 'Upload'; v: string; at: string }
type ReqSigner = Signer & { signed?: Captured }
type Note = { t: string; a: string; x: string }
type ReqStatus = 'Sent' | 'In progress' | 'Completed' | 'Voided'
type Request = {
  id: string; doc: string; action: string; status: ReqStatus; signers: ReqSigner[]; viewers: string[]
  fields: Placed[]; body: string; upload?: Upload; refs: string[]; ordered: boolean
  sentBy: string; sentAt: string; expiry: string; activity: Note[]
  voided?: { by: string; at: string; reason: string }
  lead?: { id: string; company: string }
}
const signedCount = (q: Request) => q.signers.filter((x) => x.signed).length
const nextSigners = (q: Request) => {
  const open = q.signers.filter((x) => !x.signed)
  if (!open.length || !q.ordered) return open
  const first = Math.min(...open.map((x) => x.order))
  return open.filter((x) => x.order === first)
}
const stamp = () => new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')

const uid = () => Math.random().toString(36).slice(2, 9)
const SIZE: Record<FieldType, [number, number]> = { Signature: [30, 7], Initials: [12, 6], 'Date Signed': [18, 3.6], 'Full Name': [26, 3.6], 'Job Title': [26, 3.6], Checkbox: [4, 2.8], Text: [26, 3.6] }
const dims = (f: Placed): [number, number] => [f.w ?? SIZE[f.type][0], f.h ?? SIZE[f.type][1]]
const MIN_W = 2.5, MIN_H = 1.8
const HANDLES: [string, string][] = [['nw', 'left-0 top-0 cursor-nwse-resize'], ['n', 'left-1/2 top-0 cursor-ns-resize'], ['ne', 'left-full top-0 cursor-nesw-resize'], ['e', 'left-full top-1/2 cursor-ew-resize'], ['se', 'left-full top-full cursor-nwse-resize'], ['s', 'left-1/2 top-full cursor-ns-resize'], ['sw', 'left-0 top-full cursor-nesw-resize'], ['w', 'left-0 top-1/2 cursor-ew-resize']]
const FIELD_TYPES = Object.keys(SIZE) as FieldType[]
const COLORS = ['#087E8B', '#2878D8', '#F59E0B', '#7C5CC4', '#DC3E42', '#16A34A']

const S = (role: string, name: string, order: number): Signer => ({ id: uid(), role, name, order })
const ownSlug = () => { const s = activeSlug(); return isOwnDataset(s) ? s : undefined }
const ownAdmin = (slug?: string) => employeesForTenant(slug)[0]?.name ?? ''
const defaultSigners = (): Signer[] => ownSlug() ? [S('Signer', ownAdmin(ownSlug()), 1)] : [S('Employee', 'Amaka Obi', 1), S("Employee's Manager", 'Kunle Ogunleye', 2), S('HR Manager', 'Kemi Balogun', 3), S('Managing Director', 'Oladapo Adebayo', 4)]
const withFields = (signers: Signer[]): Placed[] => !signers[0] ? [] : [
  { id: uid(), type: 'Signature', x: 8, y: 80, signer: signers[0].id }, { id: uid(), type: 'Date Signed', x: 42, y: 84, signer: signers[0].id },
  ...(signers[1] ? [{ id: uid(), type: 'Signature' as FieldType, x: 62, y: 80, signer: signers[1].id }] : []),
]
const seed = (name: string, body: string, signers: Signer[], refs: string[] = []): Template => ({ id: uid(), name, body, signers, fields: withFields(signers), refs, updated: '2 Oct 2026' })
const BODY_EMP = 'CONTRACT OF EMPLOYMENT\n\nThis agreement is made on {{start_date}} between {{company.name}}, Victoria Island HQ, and {{employee.name}} (Employee ID {{employee.id}}).\n\nThe Employee is engaged as {{employee.job_title}} in the Technology Department, reporting to {{manager}}, at a gross monthly salary of {{salary}}, subject to PAYE, pension and other statutory deductions.\n\nThe Employee works a hybrid schedule: office on Monday, Wednesday and Friday; remote on Tuesday and Thursday.'

const SCRIBBLE = (seed: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 70"><path d="M6 46 C22 ${6 + seed} 30 ${64 - seed} 44 30 S60 ${58 - seed} 78 26 S104 52 120 34 S150 ${12 + seed} 168 40 S196 30 214 22" fill="none" stroke="#102A30" stroke-width="2.4" stroke-linecap="round"/></svg>`)}`
const sigLayout = (signers: Signer[]): Placed[] => signers.flatMap((sg, i) => {
  const x = i % 2 ? 56 : 6, y = 56 + Math.floor(i / 2) * 18
  return [{ id: uid(), type: 'Signature' as FieldType, x, y, signer: sg.id }, { id: uid(), type: 'Date Signed' as FieldType, x, y: y + 8.5, signer: sg.id }]
})
const seedReq = (id: string, doc: string, tpl: Template, signed: number, sentBy: string, sentAt: string, expiry: string, viewers: string[], action = 'Sign', voided?: Request['voided']): Request => {
  const signers: ReqSigner[] = tpl.signers.map((sg, i) => ({ ...sg, id: uid(), signed: i < signed ? { kind: i === 1 ? 'Draw' : 'Type', v: i === 1 ? SCRIBBLE(8) : sg.name, at: `${sentAt} ${String(9 + i * 2).padStart(2, '0')}:${String(12 + i * 11).padStart(2, '0')}` } : undefined }))
  const done = signers.filter((x) => x.signed).length
  const activity: Note[] = [{ t: `${sentAt} 08:41`, a: sentBy, x: 'sent the request for signature' }, ...signers.filter((x) => x.signed).map((x) => ({ t: x.signed!.at, a: x.name, x: `signed as ${x.role}` }))]
  if (voided) activity.push({ t: voided.at, a: voided.by, x: 'voided the request' })
  return { id, doc, action, status: voided ? 'Voided' : done === signers.length ? 'Completed' : done ? 'In progress' : 'Sent', signers, viewers, fields: sigLayout(signers), body: tpl.body, refs: tpl.refs, ordered: true, sentBy, sentAt, expiry, activity: activity.reverse(), voided }
}

type SignState = { templates: Template[]; requests: Request[] }
const makeDemo = (): SignState => {
  const state: SignState = {
  templates: [
    seed('Employment Contract', BODY_EMP, defaultSigners(), ['Company handbook 2026.pdf']),
    seed('Offer Letter', 'OFFER OF EMPLOYMENT\n\nDear {{employee.name}},\n\n{{company.name}} is pleased to offer you the position of {{employee.job_title}} at a gross monthly salary of {{salary}}, starting {{start_date}}.\n\nPlease sign below to accept this offer.', [S('Candidate', 'Amaka Obi', 1), S('HR Manager', 'Kemi Balogun', 2)]),
    seed('NDA', 'NON-DISCLOSURE AGREEMENT\n\n{{employee.name}} agrees to keep all confidential information of {{company.name}} private during and after employment.', [S('Employee', 'Amaka Obi', 1), S('Managing Director', 'Oladapo Adebayo', 2)]),
    seed('Salary Advance Agreement', 'SALARY ADVANCE AGREEMENT\n\n{{employee.name}} requests an advance against future salary, to be recovered through payroll deductions as agreed with Finance.', [S('Employee', 'Fatima Sule', 1), S('Finance Manager', 'Chinedu Eze', 1), S('Managing Director', 'Oladapo Adebayo', 2)]),
    seed('Asset Handover', 'ASSET HANDOVER FORM\n\n{{employee.name}} acknowledges receipt of the company asset described below and agrees to return it on request.', [S('Custodian', 'Amaka Obi', 1), S('Asset Officer', 'Kabiru Abdullahi', 2)]),
    seed('Policy Acknowledgement', 'POLICY ACKNOWLEDGEMENT\n\nI, {{employee.name}}, confirm that I have read and understood the {{company.name}} staff policies.', [S('Employee', 'Amaka Obi', 1)]),
  ],
  requests: [],
}
state.requests = [
  seedReq('SR-1', 'Employment Agreement · Amaka Obi', state.templates[0], 3, 'Kemi Balogun', '6 Oct 2026', '2026-11-15', ['Chinedu Eze', 'Nneka Okafor']),
  seedReq('SR-2', 'Asset Handover · AST-00418', state.templates[4], 2, 'Kabiru Abdullahi', '29 Sep 2026', '2026-10-29', ['Emmanuel Ojo'], 'Acknowledge'),
  seedReq('SR-3', 'Salary Advance Agreement · Fatima Sule', state.templates[3], 0, 'Kemi Balogun', '9 Oct 2026', '2026-10-16', ['Kemi Balogun']),
  seedReq('SR-4', 'NDA · Chisom Okeke', { ...state.templates[2], signers: state.templates[2].signers.map((sg, i) => (i === 0 ? { ...sg, name: 'Chisom Okeke' } : sg)) }, 1, 'Kemi Balogun', '1 Oct 2026', '2026-10-31', [], 'Sign', { by: 'Kemi Balogun', at: '3 Oct 2026 14:20', reason: 'Wrong countersignatory. This NDA has to be countersigned by the Managing Director and had been routed to the Finance Manager. Reissued as a new request.' }),
]
  return state
}
const subs = new Set<() => void>()
/* Per-workspace stores: self-serve tenants get their own empty store; every other tenant shares the demo store. */
const stores = new Map<string, SignState>()
const storeKey = () => ownSlug() ?? 'demo'
/* Self-serve workspaces persist per tenant (templates, requests, captured signatures and upload data); the shared demo store is saved under the 'demo' key so edits survive a reload. */
const SIGN_KEY = 'bf-sign-v2:'
const loadOwn = (k: string): SignState => { try { const raw = localStorage.getItem(SIGN_KEY + k); if (raw) { const v = JSON.parse(raw) as SignState; if (Array.isArray(v.templates) && Array.isArray(v.requests)) return v } } catch { /* corrupt or unavailable */ } return { templates: [], requests: [] } }
const loadSaved = (k: string): SignState | null => { try { const v = JSON.parse(localStorage.getItem(SIGN_KEY + k) || 'null') as SignState | null; if (v && Array.isArray(v.templates) && Array.isArray(v.requests)) return v } catch { /* corrupt or unavailable */ } return null }
const saveOwn = (k: string) => { try { localStorage.setItem(SIGN_KEY + k, jsonWithFiles(stores.get(k))) } catch { /* storage full or unavailable */ } }
const persistSign = () => saveOwn(storeKey())
const cur = (): SignState => { const k = storeKey(); let v = stores.get(k); if (!v) { v = k === 'demo' ? loadSaved(k) ?? makeDemo() : loadOwn(k); stores.set(k, v) } return v }
const update = (fn: (s: SignState) => SignState) => { const k = storeKey(); stores.set(k, fn(cur())); saveOwn(k); subs.forEach((f) => f()) }
let curCompany = ''
const useStore = () => { curCompany = useTenant()?.profile.name ?? ''; return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, cur) }

const DEMO_VARS: Record<string, string> = { 'employee.name': 'Amaka Obi', 'employee.id': 'ETZ-0142', 'employee.job_title': 'Senior Software Engineer', salary: '₦850,000', start_date: '1 November 2026', 'company.name': 'eTranzact International Plc', manager: 'Kunle Ogunleye' }
const varsFor = (): Record<string, string> => { const o = ownSlug(); return o ? { 'company.name': curCompany } : DEMO_VARS }
const fill = (t: string) => { const V = varsFor(); return t.replace(/\{\{([\w.]+)\}\}/g, (m, k) => V[k] ?? m) }
const signerColor = (signers: Signer[], id: string) => COLORS[Math.max(0, signers.findIndex((s) => s.id === id)) % COLORS.length]

const readUpload = (f: File): Upload => ({ name: f.name, url: fileUrl(f, persistSign), kind: f.type === 'application/pdf' ? 'pdf' : f.type.startsWith('image/') ? 'image' : 'other' })

/* ---------- Dropzone ---------- */
function Dropzone({ onFile, accept, label, hint, multiple = false }: { onFile: (f: File[]) => void; accept?: string; label: string; hint: string; multiple?: boolean }) {
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFile([...e.dataTransfer.files]) }}
      className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${over ? 'border-teal bg-softmint' : 'border-line bg-cloud'}`}>
      <input ref={ref} type="file" hidden multiple={multiple} accept={accept} onChange={(e) => { onFile([...(e.target.files ?? [])]); e.target.value = '' }} />
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-slate">{hint}</p>
      <Btn s="sm" v="secondary" className="mt-3" onClick={() => ref.current?.click()}>Choose file</Btn>
    </div>
  )
}

/* ---------- Document canvas with placeable fields ---------- */
function DocCanvas({ body, upload, signers, fields, onChange, editable = true, reveal, watermark }: { body: string; upload?: Upload; signers: Signer[]; fields: Placed[]; onChange: (f: Placed[]) => void; editable?: boolean; reveal?: (f: Placed) => ReactNode | null; watermark?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<string | null>(null)
  const pos = (cx: number, cy: number, w: number, h: number) => {
    const r = box.current!.getBoundingClientRect()
    return { x: Math.min(100 - w, Math.max(0, ((cx - r.left) / r.width) * 100 - w / 2)), y: Math.min(100 - h, Math.max(0, ((cy - r.top) / r.height) * 100 - h / 2)) }
  }
  const drop = (e: React.DragEvent) => {
    e.preventDefault()
    const t = e.dataTransfer.getData('text/field') as FieldType
    if (!t || !SIZE[t]) return
    const sg = e.dataTransfer.getData('text/signer') || signers[0]?.id
    const [w, h] = SIZE[t]
    const f = { id: uid(), type: t, signer: sg, ...pos(e.clientX, e.clientY, w, h) }
    onChange([...fields, f]); setSel(f.id)
  }
  const startMove = (e: React.PointerEvent, f: Placed) => {
    if (!editable) return
    e.preventDefault(); setSel(f.id)
    const [w, h] = dims(f)
    const mv = (ev: PointerEvent) => { const p = pos(ev.clientX, ev.clientY, w, h); onChange(fields.map((x) => (x.id === f.id ? { ...x, ...p } : x))) }
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up) }
    addEventListener('pointermove', mv); addEventListener('pointerup', up)
  }
  const startResize = (e: React.PointerEvent, f: Placed, dir: string) => {
    e.preventDefault(); e.stopPropagation(); setSel(f.id)
    const r = box.current!.getBoundingClientRect()
    const [w0, h0] = dims(f)
    const L = f.x, T = f.y, R = f.x + w0, B = f.y + h0
    const mv = (ev: PointerEvent) => {
      const px = Math.min(100, Math.max(0, ((ev.clientX - r.left) / r.width) * 100))
      const py = Math.min(100, Math.max(0, ((ev.clientY - r.top) / r.height) * 100))
      let nl = L, nr = R, nt = T, nb = B
      if (dir.includes('w')) nl = Math.min(px, R - MIN_W)
      if (dir.includes('e')) nr = Math.max(px, L + MIN_W)
      if (dir.includes('n')) nt = Math.min(py, B - MIN_H)
      if (dir.includes('s')) nb = Math.max(py, T + MIN_H)
      onChange(fields.map((x) => (x.id === f.id ? { ...x, x: nl, y: nt, w: nr - nl, h: nb - nt } : x)))
    }
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up) }
    addEventListener('pointermove', mv); addEventListener('pointerup', up)
  }
  const key = (e: React.KeyboardEvent, f: Placed) => {
    if (e.key === 'Delete' || e.key === 'Backspace') { onChange(fields.filter((x) => x.id !== f.id)); return }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (!d) return
    e.preventDefault()
    const [w, h] = dims(f)
    if (e.shiftKey) onChange(fields.map((x) => (x.id === f.id ? { ...x, w: Math.min(100 - f.x, Math.max(MIN_W, w + d[0])), h: Math.min(100 - f.y, Math.max(MIN_H, h + d[1])) } : x)))
    else onChange(fields.map((x) => (x.id === f.id ? { ...x, x: Math.min(100 - w, Math.max(0, x.x + d[0])), y: Math.min(100 - h, Math.max(0, x.y + d[1])) } : x)))
  }
  return (
    <div ref={box} onDragOver={(e) => editable && e.preventDefault()} onDrop={drop} onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}
      className="relative mx-auto aspect-[1/1.3] w-full max-w-[640px] select-none overflow-hidden rounded-md border border-line bg-white shadow-sm" aria-label="Document page">
      {upload?.url && upload.kind === 'image' && <img src={upload.url} alt={upload.name} className="pointer-events-none absolute inset-0 size-full object-contain" />}
      {upload?.url && upload.kind === 'pdf' && <iframe src={`${upload.url}#toolbar=0&navpanes=0&view=FitH`} title={upload.name} className="pointer-events-none absolute inset-0 size-full" />}
      {upload?.kind === 'other' && <div className="absolute inset-0 p-10 text-sm text-slate"><b className="text-ink">{upload.name}</b><p className="mt-2">A live preview isn&apos;t available for this file type, but you can still place fields on the page. Convert to PDF for an exact preview.</p></div>}
      {!upload && <div className="pointer-events-none absolute inset-0 whitespace-pre-line p-[8%] text-[13px] leading-relaxed text-ink">{fill(body) || 'Start typing the template body…'}</div>}
      {watermark && <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="-rotate-[28deg] rounded-md border-4 border-err/40 px-6 py-2 font-display text-6xl font-bold uppercase tracking-widest text-err/30">{watermark}</span></div>}
      {fields.map((f) => {
        const [w, h] = dims(f); const c = signerColor(signers, f.signer); const s = signers.find((x) => x.id === f.signer)
        const shown = reveal ? reveal(f) : null
        return (
          <div key={f.id} role={editable ? 'button' : 'img'} tabIndex={editable ? 0 : -1} aria-label={`${f.type} for ${s?.role ?? 'signer'}${reveal ? (shown ? ', completed' : ', waiting') : ''}`} onPointerDown={(e) => startMove(e, f)} onKeyDown={(e) => editable && key(e, f)}
            style={shown ? { left: `${f.x}%`, top: `${f.y}%`, width: `${w}%`, height: `${h}%`, borderColor: c } : { left: `${f.x}%`, top: `${f.y}%`, width: `${w}%`, height: `${h}%`, borderColor: c, background: c + '22', color: c }}
            className={`absolute flex touch-none items-center justify-center text-[11px] font-bold ${shown ? 'border-b-2 text-ink' : `rounded border-2 ${reveal ? 'border-dashed' : ''}`} ${editable ? 'cursor-grab active:cursor-grabbing' : ''} ${sel === f.id ? 'ring-2 ring-offset-1' : ''}`}>
            {shown ?? <span className="truncate px-1">{f.type}</span>}
            {editable && sel === f.id && HANDLES.map(([d, cls]) => <span key={d} data-handle={d} onPointerDown={(e) => startResize(e, f, d)} className={`absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 bg-white ${cls}`} style={{ borderColor: c }} />)}
            {editable && sel === f.id && <button aria-label={`Remove ${f.type}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => onChange(fields.filter((x) => x.id !== f.id))} className="absolute -right-2 -top-2 flex size-5 cursor-pointer items-center justify-center rounded-full bg-err text-xs text-white">×</button>}
          </div>
        )
      })}
      {editable && fields.length === 0 && <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-slate">Drag a field from the panel onto the page</div>}
    </div>
  )
}

function FieldPalette({ signers, active, setActive, onAdd }: { signers: Signer[]; active: string; setActive: (s: string) => void; onAdd: (t: FieldType) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Assign next field to"><select value={active} onChange={(e) => setActive(e.target.value)} className={inputCls}>{signers.map((s) => <option key={s.id} value={s.id}>{s.role} · {s.name}</option>)}</select></Field>
      <div>
        <div className="mb-1.5 text-[13px] font-semibold">Fields</div>
        <div className="grid grid-cols-2 gap-2">
          {FIELD_TYPES.map((t) => (
            <button key={t} draggable onDragStart={(e) => { e.dataTransfer.setData('text/field', t); e.dataTransfer.setData('text/signer', active) }} onClick={() => onAdd(t)}
              style={{ borderColor: signerColor(signers, active) }} className="cursor-grab rounded-md border border-dashed bg-white px-2 py-2 text-left text-[13px] font-semibold hover:bg-softmint/60 active:cursor-grabbing">{t}</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate">Drag onto the page, or click to add. Drag placed fields to move them; drag the handles to resize to fit a field. Arrow keys nudge, Shift+arrows resize, Delete removes.</p>
      </div>
      <ul className="space-y-1 text-xs">{signers.map((s) => <li key={s.id} className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: signerColor(signers, s.id) }} />{s.role}</li>)}</ul>
    </div>
  )
}

/* ---------- Signer / signing-order editor ---------- */
function SignerEditor({ signers, onChange, canOrder, ordered, setOrdered }: { signers: Signer[]; onChange: (s: Signer[]) => void; canOrder: boolean; ordered: boolean; setOrdered?: (b: boolean) => void }) {
  const toast = useToast()
  const sorted = [...signers].sort((a, b) => a.order - b.order)
  const set = (id: string, p: Partial<Signer>) => onChange(signers.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const move = (id: string, d: number) => { const s = signers.find((x) => x.id === id)!; set(id, { order: Math.max(1, s.order + d) }) }
  const dup = new Set(sorted.filter((s, i) => sorted.some((o, j) => j !== i && o.order === s.order)).map((s) => s.order))
  return (
    <div className="space-y-3">
      {setOrdered && (
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" disabled={!canOrder} checked={ordered} onChange={(e) => setOrdered(e.target.checked)} className="accent-teal" /> Signing order: {ordered ? 'ON' : 'OFF (everyone signs at once)'}</label>
      )}
      {!canOrder && <p role="note" className="rounded-md bg-cloud p-3 text-xs text-slate">Only the Managing Director or an administrator can change signing order. You can still see who signs and when.</p>}
      {ordered && canOrder && <p className="text-xs text-slate">Signers with the same number sign at the same time. A role can appear more than once, each with its own step.</p>}
      <ul className="space-y-2">
        {sorted.map((s) => (
          <li key={s.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-line bg-white p-3 text-sm">
            {ordered ? (canOrder ? (
              <div className="flex items-center gap-1"><button aria-label={`Move ${s.role} earlier`} onClick={() => move(s.id, -1)} className="cursor-pointer rounded px-1.5 hover:bg-cloud">−</button>
                <span className="num flex size-7 items-center justify-center rounded-full bg-midnight text-xs font-bold text-white" title={dup.has(s.order) ? 'Signs with others at this step' : undefined}>{s.order}</span>
                <button aria-label={`Move ${s.role} later`} onClick={() => move(s.id, 1)} className="cursor-pointer rounded px-1.5 hover:bg-cloud">+</button></div>
            ) : <span className="num flex size-7 items-center justify-center rounded-full bg-midnight text-xs font-bold text-white">{s.order}</span>) : <span className="size-7" />}
            <div className="grid gap-2 sm:grid-cols-2">
              <input aria-label="Role" disabled={!canOrder} value={s.role} onChange={(e) => set(s.id, { role: e.target.value })} className={inputCls + ' h-9'} />
              <input aria-label="Signer name" value={s.name} onChange={(e) => set(s.id, { name: e.target.value })} className={inputCls + ' h-9'} />
            </div>
            <button aria-label={`Remove ${s.role}`} disabled={signers.length <= 1} onClick={() => onChange(signers.filter((x) => x.id !== s.id))} className="cursor-pointer rounded px-2 py-1 text-slate hover:text-err disabled:opacity-30">Remove</button>
          </li>
        ))}
      </ul>
      <Btn s="sm" v="secondary" onClick={() => { const last = Math.max(0, ...signers.map((x) => x.order)); onChange([...signers, S('Approver', ownSlug() ? '' : 'Oladapo Adebayo', ordered ? last + 1 : 1)]); toast('Signer added') }}>+ Add signer</Btn>
    </div>
  )
}

const VIEWER_OPTIONS = [
  ['Nneka Okafor', 'Company Administrator'],
  ['Chinedu Eze', 'Finance Manager'],
  ['Emmanuel Ojo', 'Operations Lead'],
  ['Kemi Balogun', 'HR Business Partner'],
  ['Kabiru Abdullahi', 'Procurement Officer'],
  ['Kunle Ogunleye', 'Head of Technology'],
] as const

function ViewerEditor({ viewers, signers, onChange }: { viewers: string[]; signers: Signer[]; onChange: (viewers: string[]) => void }) {
  const own = ownSlug()
  const options: readonly (readonly [string, string])[] = own ? employeesForTenant(own).map((e) => [e.name, e.role] as const) : VIEWER_OPTIONS
  const signerNames = new Set(signers.map((signer) => signer.name))
  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="text-sm font-semibold">View-only staff</div>
      <p className="mt-1 text-xs text-slate">Viewers can open the document, see signing progress and read activity. They never receive a signature field and cannot sign on behalf of anyone.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.length === 0 && <p className="text-xs text-slate sm:col-span-2">Add employees in People to share signing progress with them.</p>}
        {options.filter(([name]) => !signerNames.has(name)).map(([name, title]) => {
          const selected = viewers.includes(name)
          return <button key={name} type="button" aria-pressed={selected} onClick={() => onChange(selected ? viewers.filter((viewer) => viewer !== name) : [...viewers, name])} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left ${selected ? 'border-teal bg-softmint' : 'border-line hover:border-teal/50'}`}><Avatar name={name} size={28} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{name}</span><span className="block truncate text-xs text-slate">{title}</span></span><Badge tone={selected ? 'teal' : 'gray'}>{selected ? 'View only' : 'Add'}</Badge></button>
        })}
      </div>
    </div>
  )
}

/* ---------- Reference documents ---------- */
function Refs({ refs, onChange }: { refs: string[]; onChange: (r: string[]) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold">Reference documents <span className="font-normal text-slate">(optional)</span></div>
      <Dropzone multiple label="Drop supporting files here" hint="Policies, job descriptions, annexes. Signers can read them but not edit." onFile={(fs) => onChange([...refs, ...fs.map((f) => f.name)])} />
      {refs.length > 0 && <ul className="mt-2 space-y-1 text-sm">{refs.map((r, i) => <li key={r + i} className="flex items-center justify-between rounded border border-line bg-white px-3 py-1.5"><span className="truncate">{r}</span><button aria-label={`Remove ${r}`} onClick={() => onChange(refs.filter((_, j) => j !== i))} className="cursor-pointer text-xs text-slate hover:text-err">Remove</button></li>)}</ul>}
    </div>
  )
}

/* ---------- Template editor ---------- */
function TemplateEditor({ tpl, onClose }: { tpl: Template; onClose: () => void }) {
  const toast = useToast()
  const { r, can } = useRole()
  const [t, setT] = useState(tpl)
  const [active, setActive] = useState(tpl.signers[0]?.id ?? '')
  const [err, setErr] = useState('')
  const canOrder = can('company.users.manage')
  const save = () => {
    if (!t.name.trim()) { setErr('Give the template a name.'); return }
    if (!t.upload && !t.body.trim()) { setErr('Add template text or upload a document.'); return }
    update((s) => ({ ...s, templates: s.templates.some((x) => x.id === t.id) ? s.templates.map((x) => (x.id === t.id ? { ...t, updated: 'Just now' } : x)) : [{ ...t, updated: 'Just now' }, ...s.templates] }))
    toast(`Template "${t.name}" saved`); onClose()
  }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">{cur().templates.some((x) => x.id === t.id) ? 'Edit template' : 'New template'}</h2>
        <div className="flex gap-2"><Btn v="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Save template</Btn></div></div>
      {err && <p role="alert" className="mb-3 rounded-md bg-err/10 p-3 text-sm text-err">{err}</p>}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Field label="Template name"><input value={t.name} onChange={(e) => { setT({ ...t, name: e.target.value }); setErr('') }} className={inputCls} placeholder="e.g. Probation Confirmation Letter" /></Field>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold">Document</div>
            {t.upload ? (
              <div className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2 text-sm"><span className="truncate">{t.upload.name}</span><button onClick={() => setT({ ...t, upload: undefined })} className="cursor-pointer text-xs text-slate hover:text-err">Use typed text instead</button></div>
            ) : (
              <>
                <Field label="Template text" hint="Use {{employee.name}}, {{employee.job_title}}, {{salary}}, {{start_date}}, {{manager}}, {{company.name}}."><textarea rows={8} value={t.body} onChange={(e) => { setT({ ...t, body: e.target.value }); setErr('') }} className={inputCls + ' h-auto py-2 font-mono text-xs'} /></Field>
                <p className="my-2 text-center text-xs text-slate">or</p>
                <Dropzone label="Upload a PDF or image as the template" hint="PDF, PNG, JPG or Word. Max 10 MB." accept=".pdf,image/*,.doc,.docx" onFile={(fs) => { const f = fs[0]; if (!f) return; if (f.size > 10e6) { setErr('That file is over 10 MB.'); return } setT({ ...t, upload: readUpload(f) }); setErr('') }} />
              </>
            )}
          </div>
          <div><div className="mb-1.5 text-[13px] font-semibold">Signers and order</div>
            <SignerEditor signers={t.signers} canOrder={canOrder} ordered onChange={(s) => { setT({ ...t, signers: s, fields: t.fields.filter((f) => s.some((x) => x.id === f.signer)) }); if (!s.some((x) => x.id === active)) setActive(s[0]?.id ?? '') }} /></div>
          <Refs refs={t.refs} onChange={(refs) => setT({ ...t, refs })} />
        </div>
        <div className="grid gap-5 xl:grid-cols-[1fr_200px]">
          <div><DocCanvas body={t.body} upload={t.upload} signers={t.signers} fields={t.fields} onChange={(fields) => setT({ ...t, fields })} /></div>
          <FieldPalette signers={t.signers} active={active} setActive={setActive} onAdd={(ty) => setT({ ...t, fields: [...t.fields, { id: uid(), type: ty, signer: active, x: 10 + (t.fields.length % 5) * 4, y: 60 + (t.fields.length % 6) * 5 }] })} />
        </div>
      </div>
    </div>
  )
}

/* ---------- Create request wizard ---------- */
function CreateRequest({ initial, initialLead, onDone }: { initial?: string; initialLead?: string; onDone: () => void }) {
  const store = useStore()
  const { templates } = store
  const tenant = useTenant()
  const { r, can } = useRole()
  const toast = useToast()
  const canOrder = can('company.users.manage')
  const [step, setStep] = useState(0)
  const [source, setSource] = useState<'template' | 'upload'>(templates.length ? 'template' : 'upload')
  const [tplId, setTplId] = useState(initial ?? templates[0]?.id)
  const tpl: Template = templates.find((x) => x.id === tplId) ?? templates[0] ?? { id: 'none', name: '', body: '', signers: defaultSigners(), fields: [], refs: [], updated: '' }
  const [upload, setUpload] = useState<Upload | undefined>()
  const [refs, setRefs] = useState<string[]>([])
  const [signers, setSigners] = useState<Signer[]>(() => tpl.signers.map((s) => ({ ...s })))
  const [fields, setFields] = useState<Placed[]>(() => tpl.fields.map((f) => ({ ...f })))
  const own = ownSlug()
  const [viewers, setViewers] = useState<string[]>(own ? [] : ['Nneka Okafor'])
  const [ordered, setOrdered] = useState(true)
  const [active, setActive] = useState(signers[0]?.id ?? '')
  const [err, setErr] = useState('')
  const [expiry, setExpiry] = useState('2026-11-15')
  const leads = useLeads(tenant?.slug ?? 'etranzact')
  const [leadId, setLeadId] = useState(() => (initialLead && leads.some((l) => l.id === initialLead) ? initialLead : ''))
  const linked = leads.find((l) => l.id === leadId)
  const name = source === 'upload' ? upload?.name ?? '' : tpl.name

  const pickTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id)!
    setTplId(id); setSigners(t.signers.map((s) => ({ ...s }))); setFields(t.fields.map((f) => ({ ...f }))); setActive(t.signers[0]?.id ?? '')
  }
  const useUploadSource = () => { setSource('upload'); if (fields.length && !upload) setFields([]) }
  const next = () => {
    setErr('')
    if (step === 0 && source === 'upload' && !upload) { setErr('Upload a document to continue, or switch to a template.'); return }
    if (step === 1) {
      if (signers.some((s) => !s.name.trim() || !s.role.trim())) { setErr('Every signer needs a role and a name.'); return }
    }
    if (step === 2 && !fields.some((f) => f.type === 'Signature')) { setErr('Place at least one Signature field.'); return }
    if (step === 2) {
      const missing = signers.filter((s) => !fields.some((f) => f.signer === s.id))
      if (missing.length) { setErr(`${missing.map((m) => m.role).join(', ')} ${missing.length > 1 ? 'have' : 'has'} no fields. Place a field or remove the signer.`); return }
    }
    if (step < 3) { setStep(step + 1); return }
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const reqId = `SR-${store.requests.length + 1}`
    update((s) => ({ ...s, requests: [{ id: reqId, doc: `${name} · ${signers[0]?.name ?? ''}`, action: 'Sign', status: 'Sent', signers: signers.map((signer) => ({ ...signer })), viewers, fields: fields.map((f) => ({ ...f })), body: pageBody, upload: pageUpload, refs, ordered, sentBy: r.user, sentAt: today, expiry, lead: linked ? { id: linked.id, company: linked.company } : undefined, activity: [{ t: stamp(), a: r.user, x: linked ? `sent the request for signature, linked to lead ${linked.company}` : 'sent the request for signature' }] }, ...s.requests] }))
    if (linked) linkDocument(linked.id, { requestId: reqId, title: name, at: new Date().toISOString(), by: r.user })
    if (tenant) recordAudit(tenant.slug, 'Signature request sent', undefined, `${signers.length} signer(s)`, { category: 'Documents', ref: `${reqId} ${name}` })
    toast(`"${name}" sent to ${signers.length} signer${signers.length > 1 ? 's' : ''}${viewers.length ? ` with ${viewers.length} view-only observer${viewers.length > 1 ? 's' : ''}` : ''}`)
    onDone()
  }
  const steps = ['Document', 'Signers', 'Place fields', 'Review and send']
  const pageBody = source === 'template' ? tpl.body : ''
  const pageUpload = source === 'upload' ? upload : tpl.upload
  return (
    <Panel>
      <Flow steps={steps.map((s, i) => (i < step ? '✓ ' : '') + s)} />
      {err && <p role="alert" className="mt-4 rounded-md bg-err/10 p-3 text-sm text-err">{err}</p>}
      <div className="mt-6">
        {step === 0 && (
          <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
            <div className="space-y-4">
              <div role="tablist" className="inline-flex rounded-md bg-cloud p-1 text-sm font-semibold">
                {([['template', 'Generate from template'], ['upload', 'Upload document']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={source === k} onClick={() => (k === 'upload' ? useUploadSource() : setSource('template'))} className={`cursor-pointer rounded px-3 py-1.5 ${source === k ? 'bg-white shadow-sm' : 'text-slate'}`}>{l}</button>)}
              </div>
              {source === 'template' ? (
                <>
                  <Field label="Template"><select value={tplId} onChange={(e) => pickTemplate(e.target.value)} className={inputCls}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                  {own ? (templates.length === 0 && <p className="text-sm text-slate">You have no templates yet. Upload a document instead, or create a template in the Templates tab.</p>) : <div className="rounded-md bg-cloud p-4 text-sm">Employee: <b>Amaka Obi</b> · Position: Senior Software Engineer · Salary: <b className="num">₦850,000</b> · Start: 1 November 2026 · Manager: Kunle Ogunleye</div>}
                  <p className="text-xs text-slate">Details are filled from the employee record. {can('sign.create') && 'Manage or create templates in the Templates tab.'}</p>
                </>
              ) : upload ? (
                <div className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2 text-sm"><span className="truncate font-semibold">{upload.name}</span><button onClick={() => { setUpload(undefined); setFields([]) }} className="cursor-pointer text-xs text-slate hover:text-err">Replace</button></div>
              ) : (
                <Dropzone label="Drop your document here" hint="PDF or image previews exactly. Word files are accepted. Max 10 MB." accept=".pdf,image/*,.doc,.docx" onFile={(fs) => { const f = fs[0]; if (!f) return; if (f.size > 10e6) { setErr('That file is over 10 MB.'); return } setErr(''); setUpload(readUpload(f)); const ns = defaultSigners().slice(0, 2); setSigners(ns); setFields([]); setActive(ns[0]?.id ?? '') }} />
              )}
              <Refs refs={refs} onChange={setRefs} />
              <Field label="Link a business lead (optional)" hint="The document will appear on the lead in CRM.">
                <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={inputCls}>
                  <option value="">Not linked to a lead</option>
                  {leads.filter((l) => OPEN_STAGES.includes(l.stage) || l.stage === 'Won' || l.id === leadId).map((l) => <option key={l.id} value={l.id}>{l.company} · {l.stage}</option>)}
                </select>
              </Field>
            </div>
            <div><DocCanvas body={pageBody} upload={pageUpload} signers={signers} fields={source === 'template' ? fields : []} onChange={() => {}} editable={false} /></div>
          </div>
        )}
        {step === 1 && <div className="max-w-2xl"><SignerEditor signers={signers} onChange={(s) => { setSigners(s); setFields(fields.filter((f) => s.some((x) => x.id === f.signer))); setViewers(viewers.filter((viewer) => !s.some((signer) => signer.name === viewer))); if (!s.some((x) => x.id === active)) setActive(s[0]?.id ?? '') }} canOrder={canOrder} ordered={ordered} setOrdered={setOrdered} /><ViewerEditor viewers={viewers} signers={signers} onChange={setViewers} /></div>}
        {step === 2 && (
          <div className="grid gap-5 xl:grid-cols-[1fr_220px]">
            <DocCanvas body={pageBody} upload={pageUpload} signers={signers} fields={fields} onChange={setFields} />
            <FieldPalette signers={signers} active={active} setActive={setActive} onAdd={(ty) => setFields([...fields, { id: uid(), type: ty, signer: active, x: 10 + (fields.length % 5) * 4, y: 60 + (fields.length % 6) * 5 }])} />
          </div>
        )}
        {step === 3 && (
          <div className="grid max-w-3xl gap-6 text-sm">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs text-slate">Document</dt><dd className="font-semibold">{name}</dd></div>
              <div><dt className="text-xs text-slate">Fields placed</dt><dd className="font-semibold">{fields.length}</dd></div>
              <div><dt className="text-xs text-slate">Reference documents</dt><dd className="font-semibold">{refs.length || 'None'}</dd></div>
              <div><dt className="text-xs text-slate">Linked lead</dt><dd className="font-semibold">{linked ? `${linked.company} (${linked.stage})` : 'None'}</dd></div>
              <div><dt className="text-xs text-slate">View-only staff</dt><dd className="font-semibold">{viewers.length || 'None'}</dd></div>
              <div><Field label="Expires"><input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputCls} /></Field></div>
            </dl>
            <div><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">Signing {ordered ? 'order' : '(all at once)'}</div>
              <ol className="space-y-1.5">{[...signers].sort((a, b) => a.order - b.order).map((s) => <li key={s.id} className="flex items-center gap-3 rounded-md border border-line p-2.5">{ordered && <span className="num flex size-6 items-center justify-center rounded-full bg-midnight text-xs font-bold text-white">{s.order}</span>}<span className="size-2.5 rounded-sm" style={{ background: signerColor(signers, s.id) }} /><b>{s.name}</b><span className="text-slate">{s.role}</span><span className="ml-auto text-xs text-slate">{fields.filter((f) => f.signer === s.id).length} fields</span></li>)}</ol></div>
            {viewers.length > 0 && <div><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">View-only observers</div><div className="flex flex-wrap gap-2">{viewers.map((viewer) => <Badge key={viewer} tone="gray">{viewer} · View only</Badge>)}</div></div>}
            <p><b>Reminders:</b> 2 days and 4 days after sending, and 24 hours before expiry.</p>
          </div>
        )}
        <div className="mt-6 flex gap-2">{step > 0 && <Btn v="secondary" onClick={() => { setErr(''); setStep(step - 1) }}>Back</Btn>}<Btn onClick={next}>{['Next: signers', 'Next: place fields', 'Review and send', 'Send for signature'][step]}</Btn></div>
      </div>
    </Panel>
  )
}

/* ---------- Tracking: list, viewer, void ---------- */
const STATUS_TONE_REQ: Record<ReqStatus, string> = { Sent: 'blue', 'In progress': 'amber', Completed: 'green', Voided: 'red' }
const daysLeft = (iso: string) => Math.ceil((new Date(iso + 'T23:59:59').getTime() - Date.now()) / 86400000)
const fmtDay = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function downloadCopy(q: Request) {
  const mark = (sg: ReqSigner) => !sg.signed ? '<em>Not signed</em>' : sg.signed.kind === 'Type' ? `<span style="font:italic 22px Georgia,serif">${esc(sg.signed.v)}</span>` : `<img src="${sg.signed.v}" alt="" height="44">`
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(q.doc)}</title><style>body{font:14px/1.6 Inter,Arial,sans-serif;max-width:720px;margin:40px auto;color:#102A30;padding:0 20px}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin-top:12px}td,th{border:1px solid #D9E2E4;padding:8px 10px;text-align:left;vertical-align:middle}.void{border:2px solid #DC3E42;color:#DC3E42;padding:10px 14px;border-radius:6px;margin:16px 0}pre{white-space:pre-wrap;font:inherit}</style>
<h1>${esc(q.doc)}</h1><p>${esc(q.id)} · ${esc(q.status)} · sent by ${esc(q.sentBy)} on ${esc(q.sentAt)}</p>
${q.voided ? `<div class="void"><b>VOIDED</b> by ${esc(q.voided.by)} on ${esc(q.voided.at)}.<br>Reason: ${esc(q.voided.reason)}</div>` : ''}
<pre>${esc(fill(q.body) || (q.upload ? `Uploaded file: ${q.upload.name}` : ''))}</pre>
<h2 style="font-size:16px">Signatures</h2><table><tr><th>Signer</th><th>Role</th><th>Signature</th><th>Signed</th></tr>${[...q.signers].sort((a, b) => a.order - b.order).map((sg) => `<tr><td>${esc(sg.name)}</td><td>${esc(sg.role)}</td><td>${mark(sg)}</td><td>${sg.signed ? esc(sg.signed.at) : '—'}</td></tr>`).join('')}</table>
<h2 style="font-size:16px">Audit trail</h2><table>${q.activity.map((a) => `<tr><td>${esc(a.t)}</td><td>${esc(a.a)} ${esc(a.x)}</td></tr>`).join('')}</table></html>`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  a.download = `${q.id} ${q.doc.replace(/[^\w ·-]/g, '')}${q.status === 'Completed' ? ' (signed)' : q.status === 'Voided' ? ' (voided)' : ' (in progress)'}.html`
  a.click()
}

function SignatureMark({ cap, name, initials }: { cap: Captured; name: string; initials?: boolean }) {
  return cap.kind === 'Type'
    ? <span className="truncate px-1 text-[15px] italic" style={{ fontFamily: 'Georgia, serif' }}>{initials ? name.split(' ').map((x) => x[0]).join('') : cap.v}</span>
    : <img src={cap.v} alt={`Signature of ${name}`} className="max-h-full max-w-full object-contain" />
}

function VoidDialog({ q, onClose, onVoid }: { q: Request | null; onClose: () => void; onVoid: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const short = reason.trim().length < 10
  const QUICK = ['Sent to the wrong signer', 'Document needs changes', 'Terms have changed', 'Sent in error']
  return (
    <Overlay open={!!q} onClose={() => { setReason(''); setTouched(false); onClose() }} title="Void this request?" alert>
      {q && (
        <div>
          <p className="text-sm text-slate"><b className="text-ink">{q.doc}</b> will stop immediately. {q.signers.filter((x) => !x.signed).length > 0 && <>Waiting signers ({q.signers.filter((x) => !x.signed).map((x) => x.name).join(', ')}) will be told it was withdrawn and can no longer sign. </>}{signedCount(q) > 0 && 'Signatures already captured are kept for the record but have no effect.'} This cannot be undone. To continue, send a new request.</p>
          <div className="mt-4">
            <Field label="Reason for voiding" hint="Recorded in the audit trail and shown to everyone on this request.">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} rows={3} aria-invalid={touched && short} className={`${inputCls} h-auto py-2`} placeholder="Say why this request is being withdrawn" />
            </Field>
            <div className="mt-2 flex flex-wrap gap-1.5">{QUICK.map((x) => <button key={x} type="button" onClick={() => setReason(x)} className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-xs text-slate hover:border-teal hover:text-teal">{x}</button>)}</div>
            {touched && short && <p role="alert" className="mt-2 text-xs text-err">Give a reason of at least 10 characters.</p>}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Btn v="secondary" onClick={() => { setReason(''); setTouched(false); onClose() }}>Keep request</Btn>
            <Btn className="!bg-err hover:!bg-red-700" onClick={() => { if (short) { setTouched(true); return } onVoid(reason.trim()); setReason(''); setTouched(false) }}>Void request</Btn>
          </div>
        </div>
      )}
    </Overlay>
  )
}

function RequestViewer({ id, onClose, me, manage }: { id: string | null; onClose: () => void; me: string; manage: (q: Request) => boolean }) {
  const { requests } = useStore()
  const q = requests.find((x) => x.id === id) ?? null
  const [tab, setTab] = useState('Document')
  const [voiding, setVoiding] = useState(false)
  const tenant = useTenant()
  const toast = useToast()
  const close = () => { setTab('Document'); onClose() }
  const reveal = (f: Placed): ReactNode | null => {
    if (!q) return null
    const sg = q.signers.find((x) => x.id === f.signer)
    const cap = sg?.signed
    if (!sg || !cap) return null
    if (f.type === 'Signature' || f.type === 'Initials') return <SignatureMark cap={cap} name={sg.name} initials={f.type === 'Initials'} />
    if (f.type === 'Date Signed') return <span className="num px-1 text-[11px] font-semibold">{cap.at.split(' ').slice(0, 3).join(' ')}</span>
    if (f.type === 'Full Name') return <span className="truncate px-1 text-[12px] font-semibold">{sg.name}</span>
    if (f.type === 'Job Title') return <span className="truncate px-1 text-[12px] font-semibold">{sg.role}</span>
    if (f.type === 'Checkbox') return <span className="text-sm">✓</span>
    return <span className="px-1">—</span>
  }
  const remind = () => {
    if (!q) return
    const names = nextSigners(q).map((x) => x.name)
    update((s) => ({ ...s, requests: s.requests.map((x) => x.id === q.id ? { ...x, activity: [{ t: stamp(), a: me, x: `sent a reminder to ${names.join(', ')}` }, ...x.activity] } : x) }))
    auditFor('Signature reminder sent', { category: 'Documents', ref: q.id, to: names.join(', ') })
    toast(`Reminder sent to ${names.join(', ')}`)
  }
  const doVoid = (reason: string) => {
    if (!q) return
    const v = { by: me, at: stamp(), reason }
    update((s) => ({ ...s, requests: s.requests.map((x) => x.id === q.id ? { ...x, status: 'Voided' as const, voided: v, activity: [{ t: v.at, a: me, x: `voided the request. Reason: ${reason}` }, ...x.activity] } : x) }))
    if (tenant) recordAudit(tenant.slug, 'Signature request voided', q.status, `Voided: ${reason}`, { category: 'Documents', ref: q.id })
    setVoiding(false); setTab('Document')
    toast(`${q.id} voided. Signers have been notified.`)
  }
  const live = !!q && (q.status === 'Sent' || q.status === 'In progress')
  const mine = q && live && nextSigners(q).some((x) => x.name === me)
  const waiting = q ? nextSigners(q) : []
  const done = q ? signedCount(q) : 0
  return (
    <>
      <Overlay open={!!q && !voiding} onClose={close} title={q?.doc ?? ''} side wide>
        {q && (
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate">
              <Badge tone={STATUS_TONE_REQ[q.status]}>{q.status}</Badge>
              <span className="num">{q.id}</span><span>Sent by {q.sentBy} on {q.sentAt}</span>
              {q.lead && <Link to={`/admin/business/crm?lead=${q.lead.id}`} className="font-semibold text-teal hover:underline">Lead: {q.lead.company}</Link>}
              {live && <span className={daysLeft(q.expiry) <= 3 ? 'font-semibold text-err' : ''}>Expires {fmtDay(q.expiry)}</span>}
            </div>
            {q.voided && (
              <div role="alert" className="mt-4 rounded-md border border-err/30 bg-err/5 p-3 text-sm">
                <div className="font-semibold text-err">Voided by {q.voided.by} on {q.voided.at}</div>
                <p className="mt-1 text-ink"><span className="text-slate">Reason:</span> {q.voided.reason}</p>
              </div>
            )}
            {!q.voided && (
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-slate"><span>{q.status === 'Completed' ? 'All signatures collected' : waiting.length ? `Waiting on ${waiting.map((x) => x.name).join(', ')}` : ''}</span><b className="num text-ink">{done} of {q.signers.length} signed</b></div>
                <div className="h-2 overflow-hidden rounded-full bg-cloud" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={q.signers.length} aria-label="Signatures collected"><div className="h-full rounded-full bg-teal transition-all" style={{ width: `${(done / q.signers.length) * 100}%` }} /></div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {mine && <Btn s="sm" to="/admin/business/sign/signing">Sign now</Btn>}
              <Btn s="sm" v="secondary" onClick={() => { downloadCopy(q); toast('Copy downloaded') }}>{q.status === 'Completed' ? 'Download signed copy' : 'Download copy'}</Btn>
              {q.upload?.url && <a href={q.upload.url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold hover:bg-cloud">Open original file</a>}
              {live && manage(q) && <Btn s="sm" v="secondary" onClick={remind}>Send reminder</Btn>}
              {live && manage(q) && <Btn s="sm" v="ghost" className="!text-err hover:!bg-err/10" onClick={() => setVoiding(true)}>Void request</Btn>}
            </div>
            <div className="mt-5"><Tabs tabs={['Document', 'Signers', 'Activity']} value={tab} onChange={setTab} /></div>
            <div className="mt-4">
              {tab === 'Document' && (
                <div>
                  <DocCanvas body={q.body} upload={q.upload} signers={q.signers} fields={q.fields} onChange={() => {}} editable={false} reveal={reveal} watermark={q.status === 'Voided' ? 'Void' : undefined} />
                  <p className="mt-3 text-xs text-slate">{q.status === 'Completed' ? 'Every field is signed.' : 'Solid fields are signed. Dashed fields are still waiting for their signer.'}{q.refs.length > 0 && <> Reference documents: {q.refs.join(', ')}.</>}</p>
                </div>
              )}
              {tab === 'Signers' && (
                <div>
                  <ol className="space-y-2">{[...q.signers].sort((a, b) => a.order - b.order).map((sg) => {
                    const next = !sg.signed && live && waiting.some((x) => x.id === sg.id)
                    return (
                      <li key={sg.id} className="rounded-md border border-line p-3">
                        <div className="flex items-center gap-3">
                          {q.ordered && <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-midnight text-xs font-bold text-white">{sg.order}</span>}
                          <Avatar name={sg.name} size={28} />
                          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{sg.name}</div><div className="truncate text-xs text-slate">{sg.role}</div></div>
                          <Badge tone={sg.signed ? 'green' : q.voided ? 'gray' : next ? 'amber' : 'gray'}>{sg.signed ? 'Signed' : q.voided ? 'Cancelled' : next ? 'Needs to sign' : 'Not yet asked'}</Badge>
                        </div>
                        {sg.signed && <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2"><div className="flex h-10 items-center rounded bg-cloud px-3"><SignatureMark cap={sg.signed} name={sg.name} /></div><span className="num text-xs text-slate">{sg.signed.at} · {sg.signed.kind === 'Type' ? 'typed' : sg.signed.kind === 'Draw' ? 'drawn' : 'uploaded'}</span></div>}
                      </li>
                    )
                  })}</ol>
                  <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate">View-only staff</div>
                  <p className="mt-1 text-xs text-slate">Can follow progress and open the document, but cannot sign or change it.</p>
                  <div className="mt-2 flex flex-wrap gap-2">{q.viewers.length ? q.viewers.map((v) => <Badge key={v} tone="gray">{v}</Badge>) : <span className="text-xs text-slate">No observers assigned.</span>}</div>
                </div>
              )}
              {tab === 'Activity' && <Timeline items={q.activity} />}
            </div>
          </div>
        )}
      </Overlay>
      <VoidDialog q={voiding ? q : null} onClose={() => setVoiding(false)} onVoid={doVoid} />
    </>
  )
}

function Tracking({ onCreate }: { onCreate?: () => void }) {
  const { requests } = useStore()
  const { r, can } = useRole()
  const [filter, setFilter] = useState('All')
  const [q, setQ] = useState('')
  const [sp] = useSearchParams()
  const [open, setOpen] = useState<string | null>(sp.get('request'))
  const seesAll = can('sign.create') || can('people.manage')
  const mineOnly = requests.filter((x) => seesAll || x.signers.some((s) => s.name === r.user) || x.viewers.includes(r.user))
  const manage = (x: Request) => can('people.manage') || x.sentBy === r.user
  const needsMe = (x: Request) => (x.status === 'Sent' || x.status === 'In progress') && nextSigners(x).some((s) => s.name === r.user)
  const counts: Record<string, number> = { All: mineOnly.length, 'Needs my signature': mineOnly.filter(needsMe).length, 'In progress': mineOnly.filter((x) => x.status === 'Sent' || x.status === 'In progress').length, Completed: mineOnly.filter((x) => x.status === 'Completed').length, Voided: mineOnly.filter((x) => x.status === 'Voided').length }
  const chips = Object.keys(counts).filter((c) => c !== 'Needs my signature' || counts[c] > 0)
  const shown = mineOnly.filter((x) => (filter === 'All' || (filter === 'Needs my signature' ? needsMe(x) : filter === 'In progress' ? x.status === 'Sent' || x.status === 'In progress' : x.status === filter)) && `${x.doc} ${x.id} ${x.sentBy} ${x.signers.map((s) => s.name).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => <button key={c} onClick={() => setFilter(c)} aria-pressed={filter === c} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${filter === c ? 'border-midnight bg-midnight text-white' : 'border-line bg-white text-slate hover:text-ink'}`}>{c} <span className={`num ml-1 ${filter === c ? 'text-white/70' : 'text-slate/70'}`}>{counts[c]}</span></button>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search requests" placeholder="Search by document, signer or sender" className={`${inputCls} ml-auto w-full sm:w-72`} />
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
        <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,2fr)_minmax(0,1.1fr)_auto] gap-4 border-b border-line bg-cloud/60 px-5 py-2.5 text-xs font-semibold text-slate lg:grid"><span>Document</span><span>Signing progress</span><span>Expires</span><span className="w-[7.5rem]">Status</span></div>
        {shown.length === 0 && <EmptyState title={mineOnly.length ? 'No requests match' : 'Nothing to sign yet'} body={mineOnly.length ? 'Try another filter or clear the search.' : seesAll ? 'Create a signature request to get started.' : 'Documents sent to you for signature will appear here.'} action={!mineOnly.length && seesAll && onCreate ? <Btn onClick={onCreate}>Request your first signature</Btn> : undefined} />}
        <ul>
          {shown.map((x) => {
            const done = signedCount(x), wait = nextSigners(x), live = x.status === 'Sent' || x.status === 'In progress', left = daysLeft(x.expiry)
            return (
              <li key={x.id} className="border-b border-line/70 last:border-0 hover:bg-softmint/20">
                <button onClick={() => setOpen(x.id)} aria-label={`Open ${x.doc}`} className="grid w-full cursor-pointer gap-x-4 gap-y-3 px-4 py-4 text-left sm:px-5 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,2fr)_minmax(0,1.1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex items-start gap-2"><span className={`font-semibold ${x.status === 'Voided' ? 'text-slate line-through decoration-slate/50' : ''}`}>{x.doc}</span></div>
                    <div className="mt-0.5 text-xs text-slate"><span className="num">{x.id}</span> · {x.action} · sent by {x.sentBy}, {x.sentAt}{x.viewers.length > 0 && ` · ${x.viewers.length} view-only`}</div>
                    {needsMe(x) && <span className="mt-1.5 inline-block rounded bg-warn/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Your signature is needed</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-1">{x.signers.slice(0, 4).map((sg) => <span key={sg.id} title={`${sg.name}${sg.signed ? ' (signed)' : ''}`} className={`rounded-full ring-2 ${sg.signed ? 'ring-ok' : 'ring-white'} ${x.status === 'Voided' && !sg.signed ? 'opacity-40' : ''}`}><Avatar name={sg.name} size={24} /></span>)}{x.signers.length > 4 && <span className="num flex size-6 items-center justify-center rounded-full bg-cloud text-[10px] font-semibold ring-2 ring-white">+{x.signers.length - 4}</span>}</div>
                      <div className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-cloud"><div className={`h-full rounded-full ${x.status === 'Voided' ? 'bg-slate/40' : 'bg-teal'}`} style={{ width: `${(done / x.signers.length) * 100}%` }} /></div>
                      <span className="num text-xs font-semibold">{done}/{x.signers.length}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate">{x.status === 'Completed' ? 'Everyone has signed' : x.status === 'Voided' ? `Voided: ${x.voided?.reason}` : `Waiting on ${wait.map((s) => s.name).join(', ')}`}</div>
                  </div>
                  <div className="text-xs"><span className="text-slate lg:hidden">Expires </span>{live ? <span className={left <= 3 ? 'font-semibold text-err' : left <= 7 ? 'font-semibold text-amber-800' : ''}>{fmtDay(x.expiry)}<span className="block text-slate">{left < 0 ? 'expired' : left === 0 ? 'today' : `in ${left} day${left === 1 ? '' : 's'}`}</span></span> : <span className="text-slate">—</span>}</div>
                  <div className="flex items-center justify-between gap-3 lg:w-[7.5rem] lg:justify-start"><Badge tone={STATUS_TONE_REQ[x.status]}>{x.status}</Badge><span className="text-xs font-semibold text-teal lg:hidden">View</span></div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <RequestViewer id={open} onClose={() => setOpen(null)} me={r.user} manage={manage} />
    </div>
  )
}

/* ---------- Page ---------- */
export function Sign() {
  const { templates } = useStore()
  const { can } = useRole()
  const toast = useToast()
  const [tab, setTab] = useState(() => (new URLSearchParams(location.search).get('lead') && can('sign.create') ? 'Create' : 'Tracking'))
  const [editing, setEditing] = useState<Template | null>(null)
  const [viewing, setViewing] = useState<Template | null>(null)
  const [sp] = useSearchParams()
  const leadParam = sp.get('lead') ?? undefined
  const [start, setStart] = useState<string | undefined>()
  const creator = can('sign.create')
  const tabs = creator ? ['Tracking', 'Create', 'Templates'] : ['Tracking']
  const blank = (): Template => { const sg = ownSlug() ? defaultSigners() : [S('Employee', 'Amaka Obi', 1), S('Managing Director', 'Oladapo Adebayo', 2)]; return { id: uid(), name: '', body: '', signers: sg, fields: [], refs: [], updated: '' } }
  return (
    <div>
      <PageHeader eyebrow="Control" title="BizFlow Sign" desc="Sign, approve and acknowledge documents without leaving BizFlow." actions={creator ? <Btn onClick={() => { setStart(undefined); setTab('Create') }}>+ Create Signature Request</Btn> : undefined} />
      <Tabs tabs={tabs} value={tab} onChange={(t) => { setTab(t); setEditing(null) }} />
      <div className="mt-5">
        {tab === 'Tracking' && <Tracking onCreate={creator ? () => { setStart(undefined); setTab('Create') } : undefined} />}
        {tab === 'Create' && creator && <CreateRequest key={start ?? 'new'} initial={start} initialLead={leadParam} onDone={() => setTab('Tracking')} />}
        {tab === 'Templates' && creator && (editing ? <Panel><TemplateEditor tpl={editing} onClose={() => setEditing(null)} /></Panel> : (
          <>
            <div className="mb-4 flex items-center justify-between"><p className="text-sm text-slate">{templates.length} templates. Changes apply to new requests only; requests already sent are not affected.</p><Btn onClick={() => setEditing(blank())}>+ New template</Btn></div>
            {templates.length === 0 ? <div className="rounded-lg border border-line bg-white"><EmptyState title="No templates yet" body="Create a template to reuse a document, its signers and field positions." action={<Btn onClick={() => setEditing(blank())}>Create your first template</Btn>} /></div> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((t) => (
                  <div key={t.id} className="flex flex-col rounded-lg border border-line bg-white p-5">
                    <div className="font-semibold">{t.name}</div>
                    <div className="mt-1 text-xs text-slate">{t.signers.length} signers · {t.fields.length} fields{t.upload ? ' · uploaded file' : ''}{t.refs.length ? ` · ${t.refs.length} reference` : ''}</div>
                    <div className="text-xs text-slate">Updated {t.updated}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Btn s="sm" onClick={() => { setStart(t.id); setTab('Create') }}>Use</Btn>
                      <Btn s="sm" v="secondary" onClick={() => setViewing(t)}>View</Btn>
                      <Btn s="sm" v="secondary" onClick={() => setEditing({ ...t, signers: t.signers.map((s) => ({ ...s })), fields: t.fields.map((f) => ({ ...f })), refs: [...t.refs] })}>Edit</Btn>
                      <Btn s="sm" v="ghost" onClick={() => { update((s) => ({ ...s, templates: [{ ...t, id: uid(), name: t.name + ' (copy)', updated: 'Just now' }, ...s.templates] })); toast('Template duplicated') }}>Duplicate</Btn>
                      <Btn s="sm" v="ghost" onClick={() => { if (confirm(`Delete template "${t.name}"? Requests already sent are not affected.`)) { update((s) => ({ ...s, templates: s.templates.filter((x) => x.id !== t.id) })); toast('Template deleted') } }}>Delete</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ))}
      </div>
      <Overlay open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? ''} side>
        {viewing && (
          <div className="space-y-4">
            <DocCanvas body={viewing.body} upload={viewing.upload} signers={viewing.signers} fields={viewing.fields} onChange={() => {}} editable={false} />
            <div><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate">Signing order</div>
              <ol className="space-y-1 text-sm">{[...viewing.signers].sort((a, b) => a.order - b.order).map((s) => <li key={s.id}><b className="num">{s.order}.</b> {s.role} <span className="text-slate">· {s.name}</span></li>)}</ol></div>
            {viewing.refs.length > 0 && <div className="text-sm"><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate">Reference documents</div>{viewing.refs.join(', ')}</div>}
            <Btn onClick={() => { const t = viewing; setViewing(null); setEditing({ ...t }); }}>Edit template</Btn>
          </div>
        )}
      </Overlay>
    </div>
  )
}

/* ---------- Signing (signer experience) ---------- */
type SigMode = 'Draw' | 'Type' | 'Upload'
export function Signing() {
  const { r } = useRole()
  const [mode, setMode] = useState<SigMode>('Draw')
  const [ok, setOk] = useState(false)
  const [done, setDone] = useState(false)
  const [typed, setTyped] = useState('Amaka Obi')
  const [img, setImg] = useState<string | null>(null)
  const [upErr, setUpErr] = useState('')
  const [drawn, setDrawn] = useState(false)
  const [result, setResult] = useState<{ kind: SigMode; v: string } | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const toast = useToast()

  useEffect(() => {
    const c = cv.current; if (!c) return
    const x = c.getContext('2d')!; x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#102A30'
    let d = false
    const p = (e: PointerEvent): [number, number] => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height] }
    const dn = (e: PointerEvent) => { d = true; c.setPointerCapture(e.pointerId); x.beginPath(); const [a, b] = p(e); x.moveTo(a, b); x.lineTo(a + 0.01, b + 0.01); x.stroke(); setDrawn(true) }
    const mv = (e: PointerEvent) => { if (!d) return; const [a, b] = p(e); x.lineTo(a, b); x.stroke() }
    const up = () => { d = false }
    c.addEventListener('pointerdown', dn); c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up)
    return () => { c.removeEventListener('pointerdown', dn); c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up) }
  }, [mode])

  const clearPad = () => { const c = cv.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setDrawn(false) }
  const onUpload = (fs: File[]) => {
    const f = fs[0]; if (!f) return
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) { setUpErr('Use a PNG, JPG or WebP image of your signature.'); return }
    if (f.size > 2e6) { setUpErr('That image is over 2 MB. Use a smaller file.'); return }
    setUpErr('')
    const rd = new FileReader(); rd.onload = () => setImg(String(rd.result)); rd.readAsDataURL(f)
  }
  const ready = ok && (mode === 'Draw' ? drawn : mode === 'Type' ? !!typed.trim() : !!img)
  const sign = () => {
    const v = mode === 'Draw' ? cv.current!.toDataURL('image/png') : mode === 'Type' ? typed : img!
    /* Record the signature on the request that is waiting for this user, so the tracker, status and reload all reflect it. */
    const waiting = cur().requests.find((q) => (q.status === 'Sent' || q.status === 'In progress') && nextSigners(q).some((x) => x.name === r.user))
    if (waiting) {
      const me = nextSigners(waiting).find((x) => x.name === r.user)!
      const at = stamp()
      update((st) => ({ ...st, requests: st.requests.map((q) => {
        if (q.id !== waiting.id) return q
        const signers = q.signers.map((x) => x.id === me.id ? { ...x, signed: { kind: mode, v, at } } : x)
        const all = signers.every((x) => x.signed)
        return { ...q, signers, status: all ? 'Completed' as const : 'In progress' as const, activity: [{ t: at, a: r.user, x: `signed as ${me.role}` }, ...q.activity] }
      }) }))
    }
    setResult({ kind: mode, v }); setDone(true); auditFor('Document signed', { category: 'Documents', ref: 'Signing session', to: `${mode} signature` }); toast('Document signed')
  }
  const Sig = ({ big = false }: { big?: boolean }) => result && (result.kind === 'Type'
    ? <span className={`italic ${big ? 'text-3xl' : 'text-2xl'}`} style={{ fontFamily: 'Georgia, serif' }}>{result.v}</span>
    : <img src={result.v} alt="Your signature" className={big ? 'h-16 object-contain' : 'h-12 object-contain'} />)

  const paper = (
    <div className="rounded-lg border border-line bg-white p-8 text-[14px] leading-relaxed shadow-sm sm:p-12">
      <h2 className="font-display text-xl font-semibold">Contract of Employment</h2>
      <p className="mt-4">This agreement is made on <b>1 November 2026</b> between <b>eTranzact International Plc</b>, Victoria Island HQ, and <b>Amaka Obi</b> (Employee ID ETZ-0142).</p>
      <p className="mt-3">The Employee is engaged as <b>Senior Software Engineer</b> in the Technology Department, reporting to <b>Kunle Ogunleye</b>, at a gross monthly salary of <b className="num">₦850,000</b>, subject to PAYE, pension and other statutory deductions.</p>
      <p className="mt-3">The Employee works a hybrid schedule: office on Monday, Wednesday and Friday; remote on Tuesday and Thursday.</p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div><div className="flex h-16 items-end border-b border-ink/40 pb-1">{result && <Sig />}</div><div className="mt-1 text-xs text-slate">Employee signature · Amaka Obi</div></div>
        <div><div className="flex h-16 items-end border-b border-ink/40 pb-1 text-sm">{result && '8 Oct 2026'}</div><div className="mt-1 text-xs text-slate">Date signed</div></div>
      </div>
    </div>
  )

  if (ownSlug()) return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5"><Link to="/admin/business/sign" className="text-xs text-slate hover:text-teal">← Back to BizFlow Sign</Link><h1 className="mt-1 text-3xl font-semibold">Sign a document</h1></div>
      <div className="rounded-lg border border-line bg-white"><EmptyState title="Nothing waiting for your signature" body="Documents sent to you for signature will appear here." action={<Btn to="/admin/business/sign">Request your first signature</Btn>} /></div>
    </div>
  )
  if (done) return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 text-center"><div className="mx-auto flex size-14 items-center justify-center rounded-full bg-ok text-2xl text-white">✓</div><h1 className="mt-4 text-3xl font-semibold">Document signed</h1><p className="mt-2 text-slate">Your signature has been recorded. The next signer, Kunle Ogunleye, has been notified and a copy is stored on your employee file.</p></div>
      {paper}
      <div className="mt-6 text-center"><Btn to="/admin/business/sign">View audit trail</Btn></div>
    </div>
  )
  const tabBtn = (m: SigMode) => <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`cursor-pointer rounded px-3 py-1 text-sm font-semibold ${mode === m ? 'bg-midnight text-white' : 'bg-cloud text-slate'}`}>{m}</button>
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5"><Link to="/admin/business/sign" className="text-xs text-slate hover:text-teal">← Back to BizFlow Sign</Link><h1 className="mt-1 text-3xl font-semibold">Employment Agreement</h1><p className="text-slate">Amaka Obi · Senior Software Engineer</p></div>
      {paper}
      <div className="mt-6 rounded-lg border border-line bg-white p-6">
        <h2 className="font-sans text-sm font-semibold">Your Signature</h2>
        <div role="tablist" className="mt-3 flex gap-2">{(['Draw', 'Type', 'Upload'] as SigMode[]).map(tabBtn)}</div>
        <div className="mt-3">
          {mode === 'Draw' && <><canvas ref={cv} width={560} height={140} aria-label="Signature pad. Draw with mouse, finger or stylus." className="w-full touch-none rounded-md border border-dashed border-teal bg-cloud" /><div className="mt-2 flex items-center justify-between text-xs text-slate"><span>{drawn ? 'Looks good. Clear to start again.' : 'Sign inside the box.'}</span><button onClick={clearPad} className="cursor-pointer font-semibold text-teal">Clear</button></div></>}
          {mode === 'Type' && <><input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Typed signature" className="h-24 w-full rounded-md border border-dashed border-teal bg-cloud px-4 text-center text-4xl italic" style={{ fontFamily: 'Georgia, serif' }} /><p className="mt-2 text-xs text-slate">Your typed name will be used as your signature.</p></>}
          {mode === 'Upload' && (img ? (
            <div className="rounded-md border border-dashed border-teal bg-cloud p-4 text-center"><img src={img} alt="Uploaded signature preview" className="mx-auto max-h-28 object-contain" /><button onClick={() => setImg(null)} className="mt-2 cursor-pointer text-xs font-semibold text-teal">Remove and choose another</button></div>
          ) : <Dropzone accept="image/png,image/jpeg,image/webp" label="Drop a signature image here" hint="PNG, JPG or WebP, up to 2 MB. A photo of your signature on white paper works." onFile={onUpload} />)}
          {upErr && <p role="alert" className="mt-2 text-sm text-err">{upErr}</p>}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="accent-teal" />I have reviewed this document and agree to sign it electronically</label>
        <Btn className="mt-4" disabled={!ready} onClick={sign}>Sign Document</Btn>
      </div>
    </div>
  )
}

/* ---------- read-only feeds for CRM (Customer 360) and the notifications inbox ---------- */
export type SignSummary = { id: string; doc: string; status: ReqStatus; sentBy: string; sentAt: string; signed: number; total: number; leadId?: string }
const summarise = (q: Request): SignSummary => ({ id: q.id, doc: q.doc, status: q.status, sentBy: q.sentBy, sentAt: q.sentAt, signed: signedCount(q), total: q.signers.length, leadId: q.lead?.id })
export function useSignRequestsForLead(leadId: string): SignSummary[] {
  const { requests } = useStore()
  return requests.filter((q) => q.lead?.id === leadId).map(summarise)
}
export function useSignaturesAwaiting(name: string): SignSummary[] {
  const { requests } = useStore()
  return requests.filter((q) => (q.status === 'Sent' || q.status === 'In progress') && nextSigners(q).some((s) => s.name === name)).map(summarise)
}
