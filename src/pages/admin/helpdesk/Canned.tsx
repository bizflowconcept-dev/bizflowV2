import { useState } from 'react'
import { Btn, EmptyState, Field, inputCls, Overlay, Panel, useToast } from '../../../components/ui'
import { MERGE_FIELDS, deleteCanned, renderCanned, saveCanned, useCanned } from '../../../platform/helpdeskConfig'
import type { Canned, MergeCtx } from '../../../platform/helpdeskConfig'

const SAMPLE: MergeCtx = { customer_name: 'Chinedu Eze', company: 'eTranzact International Plc', ticket_id: 'TK-1042', agent: 'Dayo Martins', plan: 'Enterprise' }

export function MergeHint() {
  return <p className="text-xs text-slate">Merge fields: {MERGE_FIELDS.map((f) => <code key={f} className="mr-1 rounded bg-cloud px-1 py-0.5 font-mono">{`{{${f}}}`}</code>)}</p>
}

/** Canned reply picker for the composer: shows the merged text before inserting it. */
export function CannedPicker({ ctx, onInsert }: { ctx: MergeCtx; onInsert: (text: string) => void }) {
  const list = useCanned()
  const [id, setId] = useState('')
  const c = list.find((x) => x.id === id)
  const merged = c ? renderCanned(c.text, ctx) : ''
  return (
    <div className="space-y-2">
      <Field label="Canned reply" hint="Merge fields are filled in for this ticket."><select className={inputCls} value={id} onChange={(e) => setId(e.target.value)}><option value="">Choose a canned reply...</option>{list.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
      {c && (
        <div className="rounded-md border border-teal/30 bg-softmint/40 p-3 text-sm">
          <div className="mb-1 text-xs font-semibold text-teal">Preview with merge fields filled in</div>
          <p className="whitespace-pre-wrap">{merged}</p>
          <Btn className="mt-2" s="sm" onClick={() => { onInsert(merged); setId('') }}>Insert into reply</Btn>
        </div>
      )}
    </div>
  )
}

export default function CannedLibrary({ manage, by }: { manage: boolean; by: string }) {
  const list = useCanned()
  const toast = useToast()
  const [form, setForm] = useState<{ id?: string; label: string; text: string } | null>(null)
  const [del, setDel] = useState<Canned | null>(null)
  const ok = !!form && form.label.trim() && form.text.trim()
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <MergeHint />
        {manage && <Btn onClick={() => setForm({ label: '', text: '' })}>New canned reply</Btn>}
      </div>
      {list.length === 0 ? <Panel pad={false}><EmptyState title="No canned replies" body="Create a reply to reuse common answers with merge fields." action={manage ? <Btn onClick={() => setForm({ label: '', text: '' })}>New canned reply</Btn> : undefined} /></Panel> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((c) => (
            <li key={c.id}><Panel title={c.label} action={manage ? <span className="flex gap-1"><Btn s="sm" v="secondary" onClick={() => setForm({ id: c.id, label: c.label, text: c.text })}>Edit<span className="sr-only"> {c.label}</span></Btn><Btn s="sm" v="ghost" onClick={() => setDel(c)}>Delete<span className="sr-only"> {c.label}</span></Btn></span> : undefined}>
              <p className="text-sm text-slate">{c.text}</p>
              <p className="mt-2 border-t border-line/70 pt-2 text-xs text-slate"><b className="text-ink">Preview:</b> {renderCanned(c.text, SAMPLE)}</p>
            </Panel></li>
          ))}
        </ul>
      )}
      <Overlay open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit canned reply' : 'New canned reply'}>
        {form && (
          <div className="space-y-3">
            <Field label="Name"><input className={inputCls} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
            <Field label="Reply text"><textarea rows={6} className={`${inputCls} h-auto py-2`} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insert merge field">{MERGE_FIELDS.map((f) => <button key={f} type="button" onClick={() => setForm({ ...form, text: `${form.text}${form.text && !/\s$/.test(form.text) ? ' ' : ''}{{${f}}}` })} className="cursor-pointer rounded-full border border-line bg-white px-2.5 py-1 font-mono text-xs hover:border-teal">{`{{${f}}}`}</button>)}</div>
            <div className="rounded-md bg-cloud p-3 text-sm"><div className="mb-1 text-xs font-semibold text-slate">Preview with sample data</div>{renderCanned(form.text, SAMPLE) || <span className="text-slate">Nothing to preview yet.</span>}</div>
            <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setForm(null)}>Cancel</Btn><Btn disabled={!ok} onClick={() => { saveCanned(form, by); setForm(null); toast('Canned reply saved') }}>Save reply</Btn></div>
          </div>
        )}
      </Overlay>
      <Overlay open={!!del} onClose={() => setDel(null)} title="Delete canned reply" alert>
        <p className="text-sm text-slate">Delete <b className="text-ink">{del?.label}</b>? Replies already sent are not affected.</p>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setDel(null)}>Keep it</Btn><Btn onClick={() => { deleteCanned(del!.id, by); setDel(null); toast('Canned reply deleted') }}>Delete</Btn></div>
      </Overlay>
    </div>
  )
}
