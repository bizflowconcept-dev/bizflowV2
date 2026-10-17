import { useState } from 'react'
import { Badge, Btn, Field, Overlay, inputCls, useToast } from '../components/ui'
import { getActor } from '../tenant/store'
import { TEMPLATES, submitChange, useChanges } from './changes'
import type { Area } from './changes'

const TONE: Record<string, string> = { Requested: 'amber', Recommended: 'blue', Applied: 'green', Rejected: 'red' }
const COPY: Partial<Record<Area, string>> = {
  'Data export': 'The platform team prepares a full export of your company data and sends a secure download link to the administrator.',
  'Data deletion': 'Your workspace is closed and its data is removed after a 30-day retention window. This cannot be undone once the window ends. A second BizFlow admin must approve it.',
}

export default function RequestChange({ slug, area, label, className = '' }: { slug: string; area: Area; label?: string; className?: string }) {
  const toast = useToast()
  const mine = useChanges(slug).filter((c) => c.area === area)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [tpl, setTpl] = useState('')
  const submit = () => {
    if (!text.trim() && !tpl) { toast('Tell us what you would like changed.'); return }
    const t = TEMPLATES.find((x) => x.id === tpl)
    const id = submitChange({ slug, area, summary: text.trim() || `Apply the ${t?.name} template`, payload: area === 'Approval flow' && t ? { rules: t.rules } : undefined, by: getActor().name, origin: 'Company' })
    toast(`Request ${id} sent to BizFlow`); setOpen(false); setText(''); setTpl('')
  }
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <Btn v="secondary" onClick={() => setOpen(true)}>{label ?? `Request a change`}</Btn>
        {mine[0] && <span className="flex items-center gap-2 text-[13px] text-slate">Latest request <Badge tone={TONE[mine[0].status]}>{mine[0].status}</Badge></span>}
      </div>
      {mine.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white text-[13px]">
          {mine.slice(0, 3).map((c) => <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5"><span className="font-mono text-xs font-semibold text-teal">{c.id}</span><span className="min-w-0 flex-1 truncate">{c.summary}</span><Badge tone={TONE[c.status]}>{c.status}</Badge></li>)}
        </ul>
      )}
      <Overlay open={open} onClose={() => setOpen(false)} title={label ?? `Request a change: ${area}`}>
        <div className="space-y-4">
          <p className="text-sm text-slate">{COPY[area] ?? 'Company settings are changed by the BizFlow platform team. Describe what you need and two BizFlow admins will review it.'}</p>
          {area === 'Approval flow' && <Field label="Start from a template" hint={TEMPLATES.find((t) => t.id === tpl)?.desc}><select className={inputCls} value={tpl} onChange={(e) => setTpl(e.target.value)}><option value="">Describe it myself</option>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
          <Field label={area === 'Data deletion' ? 'Reason for closing the workspace' : 'What should change?'}><textarea className={`${inputCls} h-24 py-2`} value={text} onChange={(e) => setText(e.target.value)} placeholder={area === 'Finance tiers' ? 'For example: raise the Finance Officer ceiling to ₦1,000,000' : ''} /></Field>
          <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={submit}>Send request</Btn></div>
        </div>
      </Overlay>
    </div>
  )
}
