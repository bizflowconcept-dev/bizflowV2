import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Bold, Heading2, Italic, List, ListOrdered, Minus, Plus, Table2, Trash2, Type, Underline, PenLine, Receipt, Braces, FileText } from 'lucide-react'
import { Btn, inputCls, useToast } from '../components/ui'
import { MERGE_GROUPS, newBlock, sanitize } from './templates'
import type { Block, BlockType, DocTemplate } from './templates'
import { PAGE_CSS, itemTotals } from './TemplatePage'

const cell = 'h-9 w-full min-w-[84px] rounded border border-line bg-white px-2 text-[13px] text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20'
const iconBtn = 'grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-slate hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-teal disabled:cursor-default disabled:opacity-30'
const noFocusLoss = (e: React.MouseEvent) => e.preventDefault()

/* ---------- Dropzone (same pattern as BizFlow Sign) ---------- */
export function Dropzone({ onFile, accept, label, hint }: { onFile: (f: File[]) => void; accept?: string; label: string; hint: string }) {
  const [over, setOver] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFile([...e.dataTransfer.files]) }}
      className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${over ? 'border-teal bg-softmint' : 'border-line bg-cloud'}`}>
      <input ref={ref} type="file" hidden accept={accept} aria-label={label} onChange={(e) => { onFile([...(e.target.files ?? [])]); e.target.value = '' }} />
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-slate">{hint}</p>
      <Btn s="sm" v="secondary" className="mt-3" onClick={() => ref.current?.click()}>Choose file</Btn>
    </div>
  )
}

/* ---------- Rich text ---------- */
function RichEditor({ value, onChange, label }: { value: string; onChange: (html: string) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = ref.current; if (el && sanitize(el.innerHTML) !== value) el.innerHTML = value }, [value])
  const exec = (cmd: string, arg?: string) => {
    const el = ref.current
    if (!el) return
    el.focus()
    document.execCommand(cmd, false, arg)
    onChange(sanitize(el.innerHTML))
  }
  const tools: [string, ReactNode, string, string?][] = [
    ['Bold', <Bold size={15} key="b" />, 'bold'], ['Italic', <Italic size={15} key="i" />, 'italic'], ['Underline', <Underline size={15} key="u" />, 'underline'],
    ['Heading', <Heading2 size={15} key="h" />, 'formatBlock', 'h3'], ['Paragraph', <Type size={15} key="p" />, 'formatBlock', 'p'],
    ['Bulleted list', <List size={15} key="l" />, 'insertUnorderedList'], ['Numbered list', <ListOrdered size={15} key="o" />, 'insertOrderedList'],
  ]
  return (
    <div className="rounded-md border border-line focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20">
      <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap gap-0.5 border-b border-line bg-cloud px-1.5 py-1">
        {tools.map(([n, icon, cmd, arg]) => <button key={n} type="button" title={n} aria-label={n} onMouseDown={noFocusLoss} onClick={() => exec(cmd, arg)} className={iconBtn}>{icon}</button>)}
      </div>
      <style>{PAGE_CSS}</style>
      <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline aria-label={label} spellCheck
        onInput={(e) => onChange(sanitize(e.currentTarget.innerHTML))}
        onPaste={(e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')) }}
        className="dp-rich min-h-24 max-h-96 overflow-y-auto bg-white px-3 py-2.5 text-[13.5px] leading-relaxed outline-none" />
    </div>
  )
}

/* ---------- Block editors ---------- */
const NumCell = ({ v, onChange, label }: { v: number; onChange: (n: number) => void; label: string }) => <input type="number" min={0} step="any" aria-label={label} value={Number.isFinite(v) ? v : 0} onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))} className={`${cell} text-right`} />

function TableEditor({ b, set }: { b: Extract<Block, { type: 'table' }>; set: (b: Block) => void }) {
  const setCell = (r: number, c: number, v: string) => set({ ...b, rows: b.rows.map((row, ri) => (ri === r ? row.map((x, ci) => (ci === c ? v : x)) : row)) })
  const addCol = () => set({ ...b, cols: [...b.cols, `Column ${b.cols.length + 1}`], rows: b.rows.map((r) => [...r, '']) })
  const delCol = (c: number) => b.cols.length > 1 && set({ ...b, cols: b.cols.filter((_, i) => i !== c), rows: b.rows.map((r) => r.filter((_, i) => i !== c)) })
  const addRow = () => set({ ...b, rows: [...b.rows, b.cols.map(() => '')] })
  const delRow = (r: number) => set({ ...b, rows: b.rows.filter((_, i) => i !== r) })
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <label className="flex items-center gap-2"><input type="checkbox" checked={b.header} onChange={(e) => set({ ...b, header: e.target.checked })} className="size-4 accent-teal" />Header row</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={b.labelCol} onChange={(e) => set({ ...b, labelCol: e.target.checked })} className="size-4 accent-teal" />Bold label column</label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1">
          {b.header && (
            <thead><tr>
              {b.cols.map((c, ci) => (
                <th key={ci} className="font-normal"><div className="flex items-center gap-0.5">
                  <input aria-label={`Column ${ci + 1} heading`} value={c} onChange={(e) => set({ ...b, cols: b.cols.map((x, i) => (i === ci ? e.target.value : x)) })} className={`${cell} font-semibold`} />
                  <button type="button" aria-label={`Remove column ${ci + 1}`} disabled={b.cols.length < 2} onClick={() => delCol(ci)} className={iconBtn}><Minus size={14} /></button>
                </div></th>
              ))}
              <th className="w-9" />
            </tr></thead>
          )}
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => <td key={ci}><input aria-label={`Row ${ri + 1}, column ${ci + 1}`} value={c} onChange={(e) => setCell(ri, ci, e.target.value)} className={cell} /></td>)}
                <td><button type="button" aria-label={`Remove row ${ri + 1}`} onClick={() => delRow(ri)} className={iconBtn}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex gap-2"><Btn s="sm" v="secondary" onClick={addRow}><Plus size={14} />Add row</Btn><Btn s="sm" v="secondary" onClick={addCol}><Plus size={14} />Add column</Btn>{!b.header && <span className="self-center text-xs text-slate">Turn on the header row to rename or remove columns.</span>}</div>
    </div>
  )
}

function ItemsEditor({ b, set }: { b: Extract<Block, { type: 'items' }>; set: (b: Block) => void }) {
  const patch = (i: number, p: Partial<(typeof b.rows)[number]>) => set({ ...b, rows: b.rows.map((r, ri) => (ri === i ? { ...r, ...p } : r)) })
  const t = itemTotals(b.rows, b.vat)
  const fmt = (n: number) => n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1 text-[12px] text-slate">
          <thead><tr><th className="text-left font-semibold">Description</th><th className="w-20 text-right font-semibold">Qty</th><th className="w-32 text-right font-semibold">Unit price (₦)</th><th className="w-32 text-right font-semibold">Amount (₦)</th><th className="w-9" /></tr></thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                <td><input aria-label={`Item ${i + 1} description`} value={r.desc} onChange={(e) => patch(i, { desc: e.target.value })} className={cell} /></td>
                <td><NumCell label={`Item ${i + 1} quantity`} v={r.qty} onChange={(qty) => patch(i, { qty })} /></td>
                <td><NumCell label={`Item ${i + 1} unit price`} v={r.price} onChange={(price) => patch(i, { price })} /></td>
                <td className="num px-2 text-right text-[13px] font-semibold text-ink">{fmt(r.qty * r.price)}</td>
                <td><button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => set({ ...b, rows: b.rows.filter((_, ri) => ri !== i) })} className={iconBtn}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <Btn s="sm" v="secondary" onClick={() => set({ ...b, rows: [...b.rows, { desc: '', qty: 1, price: 0 }] })}><Plus size={14} />Add line</Btn>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={b.vat} onChange={(e) => set({ ...b, vat: e.target.checked })} className="size-4 accent-teal" />Add VAT at 7.5%</label>
        <span className="num ml-auto text-[13px] text-slate">Subtotal ₦{fmt(t.sub)}{b.vat && ` · VAT ₦${fmt(t.tax)}`} · <b className="text-ink">Total ₦{fmt(t.total)}</b></span>
      </div>
    </div>
  )
}

function SignatureEditor({ b, set }: { b: Extract<Block, { type: 'signature' }>; set: (b: Block) => void }) {
  const patch = (i: number, p: Partial<(typeof b.signers)[number]>) => set({ ...b, signers: b.signers.map((s, si) => (si === i ? { ...s, ...p } : s)) })
  return (
    <div className="space-y-2">
      {b.signers.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input aria-label={`Signature ${i + 1} label`} value={s.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder="Label, e.g. For the Company" className={cell} />
          <input aria-label={`Signature ${i + 1} name`} value={s.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Name / title" className={cell} />
          <button type="button" aria-label={`Remove signature ${i + 1}`} disabled={b.signers.length < 2} onClick={() => set({ ...b, signers: b.signers.filter((_, si) => si !== i) })} className={iconBtn}><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-4">
        <Btn s="sm" v="secondary" disabled={b.signers.length >= 3} onClick={() => set({ ...b, signers: [...b.signers, { label: 'Signatory', name: '' }] })}><Plus size={14} />Add signatory</Btn>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={b.dateLine} onChange={(e) => set({ ...b, dateLine: e.target.checked })} className="size-4 accent-teal" />Date line</label>
      </div>
    </div>
  )
}

const BLOCK_LABEL: Record<BlockType, string> = { heading: 'Heading', rich: 'Text', table: 'Table', items: 'Line items & totals', signature: 'Signature block', divider: 'Divider', pagebreak: 'Page break' }

function BlockCard({ b, i, n, set, move, del }: { b: Block; i: number; n: number; set: (b: Block) => void; move: (d: number) => void; del: () => void }) {
  return (
    <li className="rounded-lg border border-line bg-white" data-block={b.id}>
      <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
        <span className="mr-auto text-xs font-semibold uppercase tracking-wider text-slate">{i + 1}. {BLOCK_LABEL[b.type]}</span>
        <button type="button" className={iconBtn} aria-label={`Move block ${i + 1} up`} disabled={i === 0} onClick={() => move(-1)}><ArrowUp size={15} /></button>
        <button type="button" className={iconBtn} aria-label={`Move block ${i + 1} down`} disabled={i === n - 1} onClick={() => move(1)}><ArrowDown size={15} /></button>
        <button type="button" className={`${iconBtn} hover:!text-err`} aria-label={`Delete block ${i + 1}`} onClick={del}><Trash2 size={15} /></button>
      </div>
      <div className="p-3">
        {b.type === 'heading' && (
          <div className="flex flex-wrap gap-2">
            <input aria-label="Heading text" value={b.text} onChange={(e) => set({ ...b, text: e.target.value })} className={`${inputCls} min-w-0 flex-1`} />
            <select aria-label="Heading size" value={b.size} onChange={(e) => set({ ...b, size: e.target.value as 'title' | 'section' })} className={`${inputCls} !w-36`}><option value="title">Title</option><option value="section">Section</option></select>
          </div>
        )}
        {b.type === 'rich' && <RichEditor label={`Text block ${i + 1}`} value={b.html} onChange={(html) => set({ ...b, html })} />}
        {b.type === 'table' && <TableEditor b={b} set={set} />}
        {b.type === 'items' && <ItemsEditor b={b} set={set} />}
        {b.type === 'signature' && <SignatureEditor b={b} set={set} />}
        {b.type === 'pagebreak' && <p className="text-[13px] text-slate">Everything after this block starts on a new A4 page. Pages also break automatically when content runs past the bottom margin.</p>}
        {b.type === 'divider' && <p className="text-[13px] text-slate">A thin horizontal rule.</p>}
      </div>
    </li>
  )
}

const ADD: [BlockType, string, ReactNode][] = [['heading', 'Heading', <Heading2 size={14} key="h" />], ['rich', 'Text', <Type size={14} key="t" />], ['table', 'Table', <Table2 size={14} key="b" />], ['items', 'Line items', <Receipt size={14} key="i" />], ['signature', 'Signature', <PenLine size={14} key="s" />], ['divider', 'Divider', <Minus size={14} key="d" />], ['pagebreak', 'Page break', <FileText size={14} key="p" />]]

/** Block-based editor with merge-field inserter. */
export default function BlocksEditor({ template, onChange }: { template: DocTemplate; onChange: (t: DocTemplate) => void }) {
  const toast = useToast()
  const last = useRef<HTMLElement | null>(null)
  const setBlocks = (blocks: Block[]) => onChange({ ...template, blocks })
  const move = (i: number, d: number) => { const a = [...template.blocks]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setBlocks(a) }

  const insert = (key: string) => {
    const el = last.current, text = `{{${key}}}`
    if (!el || !document.contains(el)) return toast('Click into a text field first, then pick a merge field')
    el.focus()
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, el.value.slice(0, s) + text + el.value.slice(e))
      el.setSelectionRange(s + text.length, s + text.length)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    } else document.execCommand('insertText', false, text)
  }

  return (
    <div onFocusCapture={(e) => { const t = e.target as HTMLElement; if (t.matches('input[type="text"],input:not([type]),textarea,[contenteditable="true"]')) last.current = t }}>
      <details className="mb-4 rounded-lg border border-line bg-cloud" open>
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-semibold"><Braces size={16} className="text-teal" />Insert merge field</summary>
        <div className="space-y-2.5 border-t border-line px-3 py-3">
          <p className="text-xs text-slate">Place the cursor in any text, table cell or signature field, then choose a field. Fields are filled in when a document is created.</p>
          {MERGE_GROUPS.map((g) => (
            <div key={g.group} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-xs font-semibold text-slate">{g.group}</span>
              {g.fields.map((f) => <button key={f.key} type="button" onMouseDown={noFocusLoss} onClick={() => insert(f.key)} title={`{{${f.key}}}`} className="cursor-pointer rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium hover:border-teal hover:text-teal focus-visible:outline-2 focus-visible:outline-teal">{f.label}</button>)}
            </div>
          ))}
        </div>
      </details>
      <ol className="space-y-3">
        {template.blocks.map((b, i) => (
          <BlockCard key={b.id} b={b} i={i} n={template.blocks.length} set={(nb) => setBlocks(template.blocks.map((x) => (x.id === b.id ? nb : x)))} move={(d) => move(i, d)} del={() => setBlocks(template.blocks.filter((x) => x.id !== b.id))} />
        ))}
      </ol>
      {template.blocks.length === 0 && <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-slate">This template is empty. Add a block below.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Add a block">
        <span className="mr-1 text-xs font-semibold text-slate">Add block</span>
        {ADD.map(([t, n, icon]) => <Btn key={t} s="sm" v="secondary" onClick={() => setBlocks([...template.blocks, newBlock(t)])}>{icon}{n}</Btn>)}
      </div>
    </div>
  )
}
