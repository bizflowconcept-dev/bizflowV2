import { useState } from 'react'
import { Lock, Send, Star } from 'lucide-react'
import { Avatar, Badge, Btn, Field, inputCls, Overlay, Panel, useToast } from '../../../components/ui'
import { requestSupport, useTenants } from '../../../tenant/store'
import { fmtAt } from '../../../platform/persist'
import { PRIORITIES, STATUSES, addMessage, assignTicket, deEscalateTicket, escalateTicket, csatState, resolveTicket, setTicketPriority, setTicketStatus, slaOf } from '../../../platform/helpdesk'
import type { TPriority, TStatus, Ticket } from '../../../platform/helpdesk'
import type { MergeCtx } from '../../../platform/helpdeskConfig'
import { DEPARTMENTS, staffInDept } from '../roles'
import { CannedPicker, MergeHint } from './Canned'
import TenantPanel from './TenantPanel'
import { P_TONE, S_TONE, STAFF, SlaBadges } from './shared'

type Props = { t: Ticket; all: Ticket[]; company: string; by: string; manage: boolean; canOpenCompany: boolean; now: number; onOpen: (id: string) => void }

export default function Detail({ t, all, company, by, manage, canOpenCompany, now, onOpen }: Props) {
  const toast = useToast()
  const plan = useTenants()[t.slug]?.plan ?? t.plan ?? 'Professional'
  const sla = slaOf(t, now, plan)
  const live = t.status !== 'Resolved'
  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [text, setText] = useState('')
  const [ask, setAsk] = useState(false)
  const [esc, setEsc] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [mins, setMins] = useState('60')
  const [reason, setReason] = useState(`Ticket ${t.id}: ${t.subject}`)
  const ctx: MergeCtx = { customer_name: t.requester, company, ticket_id: t.id, agent: by, plan }
  const isNote = mode === 'note'
  const onStatus = (v: string) => { if (v === 'Resolved') setResolving(true); else { setTicketStatus(t.id, v as TStatus, by); toast(`Moved to ${v}`) } }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={P_TONE[t.priority]}>{t.priority}</Badge><Badge tone={S_TONE[t.status]}>{t.status}</Badge>
        {t.escalatedTo && <Badge tone="red">Escalated to {t.escalatedTo}</Badge>}
        <span className="ml-auto"><SlaBadges sla={sla} live={live} /></span>
      </div>
      {live && sla.paused && <p className="text-xs text-slate" role="status">Resolution clock is paused while we wait on the customer. First response is unaffected.</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Request">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><div className="text-xs text-slate">Company</div><div className="font-semibold">{company}</div></div>
              <div><div className="text-xs text-slate">Requester</div><div className="flex items-center gap-2 font-semibold"><Avatar name={t.requester} size={22} />{t.requester}</div></div>
              <div><div className="text-xs text-slate">Category</div>{t.category}</div>
              <div><div className="text-xs text-slate">Opened</div>{fmtAt(t.createdAt)}</div>
            </div>
            <p className="mt-3 text-sm">{t.body}</p>
          </Panel>
          <Panel title="Handling">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Assignee"><select className={inputCls} disabled={!manage} value={t.assignee} onChange={(e) => { assignTicket(t.id, e.target.value, by); toast(e.target.value ? `Assigned to ${e.target.value}` : 'Unassigned') }}><option value="">Unassigned</option>{STAFF.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Status"><select className={inputCls} disabled={!manage} value={t.status} onChange={(e) => onStatus(e.target.value)}>{STATUSES.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Priority" hint={`First reply ${sla.first.targetH}h, resolve ${sla.resolve.targetH}h (${plan})`}><select className={inputCls} disabled={!manage} value={t.priority} onChange={(e) => { setTicketPriority(t.id, e.target.value as TPriority, by); toast(`Priority ${e.target.value}`) }}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
            </div>
            {manage && live && <div className="mt-3 flex flex-wrap gap-2"><Btn s="sm" onClick={() => setResolving(true)}>Resolve ticket</Btn><Btn s="sm" v="secondary" onClick={() => setEsc(true)}>{t.escalatedTo ? 'Change escalation' : 'Escalate to department'}</Btn></div>}
          </Panel>

          {t.escalation && (
            <Panel title="Escalation" action={manage ? <Btn s="sm" v="secondary" onClick={() => { deEscalateTicket(t.id, by); toast('Ticket de-escalated') }}>De-escalate</Btn> : undefined}>
              <p className="text-sm"><b>{t.escalation.dept}</b> since {fmtAt(t.escalation.at)}, escalated by {t.escalation.by} from {t.escalation.from}.</p>
              <p className="mt-1 text-sm text-slate">Reason: {t.escalation.reason}</p>
            </Panel>
          )}

          {(t.csat || t.status === 'Resolved') && (
            <Panel title="Customer satisfaction">
              {!t.csat ? <p className="text-sm text-slate">{csatState(t) === 'lapsed' ? 'No rating was received within the 7-day window, so this counts as no response.' : 'Waiting for the company to rate this support from its inbox.'}</p> : t.csat.score === null ? <p className="text-sm text-slate">The customer gave no CSAT response.</p> : (
                <div className="text-sm"><div className="flex items-center gap-1" role="img" aria-label={`${t.csat.score} out of 5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={18} className={n <= t.csat!.score! ? 'fill-warn text-warn' : 'text-line'} />)}<b className="num ml-2">{t.csat.score} / 5</b></div>
                  {t.csat.comment && <p className="mt-2">"{t.csat.comment}"</p>}<p className="mt-1 text-xs text-slate">Recorded {fmtAt(t.csat.at)} by {t.csat.by}</p></div>
              )}
            </Panel>
          )}

          <Panel title="Support diagnostics" action={manage ? <Btn s="sm" v="secondary" onClick={() => setAsk(true)}>Request diagnostics</Btn> : undefined}>
            {t.session ? <p className="text-sm">Diagnostic access recorded {fmtAt(t.session.at)} by {t.session.by}: {t.session.reason}.</p> : <p className="text-sm text-slate">No diagnostic session yet. The company administrator must approve one. It is read-only, expires automatically and cannot open operational modules.</p>}
          </Panel>

          <Panel title="Conversation">
            <ol className="space-y-3">{t.messages.length === 0 && <li className="text-sm text-slate">No messages yet.</li>}{t.messages.map((m) => (
              <li key={m.id} className={`rounded-md p-3 text-sm ${m.kind === 'note' ? 'border border-dashed border-amber-400 bg-amber-50' : m.kind === 'system' ? 'bg-cloud text-slate' : 'border border-teal/30 bg-white'}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate"><b className="text-ink">{m.by}</b>
                  {m.kind === 'note' && <span className="inline-flex items-center gap-1 font-semibold text-amber-800"><Lock size={12} aria-hidden="true" />Internal note, staff only</span>}
                  {m.kind === 'reply' && <span className="inline-flex items-center gap-1 text-teal"><Send size={12} aria-hidden="true" />Sent to customer</span>}
                  <span className="ml-auto">{fmtAt(m.at)}</span></div>{m.text}
              </li>))}</ol>
          </Panel>

          {manage && (
            <Panel title="Respond" className={isNote ? 'border-amber-400 bg-amber-50/40' : ''}>
              <div role="radiogroup" aria-label="Message type" className="mb-3 inline-flex rounded-md border border-line bg-white p-0.5">
                {([['reply', 'Public reply'], ['note', 'Internal note']] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`h-8 cursor-pointer rounded px-3 text-sm font-semibold ${mode === k ? (k === 'note' ? 'bg-amber-400 text-ink' : 'bg-teal text-white') : 'text-slate hover:text-ink'}`}>{l}</button>)}
              </div>
              <p className={`mb-3 text-xs ${isNote ? 'font-semibold text-amber-800' : 'text-slate'}`}>{isNote ? 'Only platform staff can see this note. It does not stop the first-response clock or change the status.' : `The company will see this reply. ${t.respondedAt ? 'First response already recorded.' : 'Sending stops the first-response clock.'}`}</p>
              {!isNote && <div className="mb-3"><CannedPicker ctx={ctx} onInsert={(x) => setText((p) => (p.trim() ? `${p.trimEnd()}\n\n${x}` : x))} /><div className="mt-2"><MergeHint /></div></div>}
              <textarea aria-label={isNote ? 'Internal note' : 'Reply to company'} rows={isNote ? 3 : 5} className={`${inputCls} h-auto py-2 ${isNote ? 'border-amber-400 bg-amber-50' : ''}`} value={text} onChange={(e) => setText(e.target.value)} />
              <Btn className="mt-3" v={isNote ? 'secondary' : 'primary'} disabled={!text.trim()} onClick={() => { addMessage(t.id, mode, text.trim(), by); setText(''); toast(isNote ? 'Internal note added' : 'Reply sent') }}>{isNote ? 'Add internal note' : 'Send reply'}</Btn>
            </Panel>
          )}
        </div>
        <aside aria-label="Company context" className="min-w-0"><TenantPanel t={t} all={all} onOpen={onOpen} canOpenCompany={canOpenCompany} /></aside>
      </div>

      <Overlay open={ask} onClose={() => setAsk(false)} title={`Support access: ${company}`}>
        <p className="text-sm text-slate">The company administrator is asked to authorise time-limited access to workspace metadata, authentication diagnostics, integration health and redacted error logs. Payroll, accounting, approvals, documents and employee records remain inaccessible.</p>
        <div className="mt-3 space-y-3">
          <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Duration"><select className={inputCls} value={mins} onChange={(e) => setMins(e.target.value)}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option></select></Field>
        </div>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setAsk(false)}>Cancel</Btn><Btn disabled={!reason.trim()} onClick={() => { requestSupport(t.slug, by, reason.trim(), t.id, Number(mins)); setAsk(false); toast('Authorisation request sent to the company administrator') }}>Send request</Btn></div>
      </Overlay>
      <Overlay open={esc} onClose={() => setEsc(false)} title={`Escalate ${t.id}`}><EscalateForm t={t} by={by} onDone={() => { setEsc(false); toast('Ticket escalated') }} /></Overlay>
      <Overlay open={resolving} onClose={() => setResolving(false)} title={`Resolve ${t.id}`}><ResolveForm t={t} by={by} onDone={() => { setResolving(false); toast(`${t.id} resolved`) }} /></Overlay>
    </div>
  )
}

function EscalateForm({ t, by, onDone }: { t: Ticket; by: string; onDone: () => void }) {
  const depts = DEPARTMENTS.filter((d) => d !== 'Customer Support')
  const [dept, setDept] = useState<string>(t.escalatedTo ?? depts[0])
  const [reason, setReason] = useState('')
  const [who, setWho] = useState('')
  const people = staffInDept(dept)
  return (
    <div className="space-y-3">
      <Field label="Department"><select className={inputCls} value={dept} onChange={(e) => { setDept(e.target.value); setWho('') }}>{depts.map((d) => <option key={d}>{d}</option>)}</select></Field>
      <Field label="Reason for escalation" hint="Required. Shown to the receiving department and recorded in the audit log."><textarea rows={3} className={`${inputCls} h-auto py-2`} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <Field label="Hand to (optional)"><select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}><option value="">Keep current assignee</option>{people.map((p) => <option key={p}>{p}</option>)}</select></Field>
      <div className="flex justify-end"><Btn disabled={!reason.trim()} onClick={() => { escalateTicket(t.id, dept, reason.trim(), by, who || undefined); onDone() }}>Escalate</Btn></div>
    </div>
  )
}

function ResolveForm({ t, by, onDone }: { t: Ticket; by: string; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">Resolving closes the clock and asks {t.requester}'s company to rate this support. The rating is captured by the customer from their own inbox, not by you.</p>
      <div className="flex justify-end"><Btn onClick={() => { resolveTicket(t.id, by); onDone() }}>Resolve ticket</Btn></div>
    </div>
  )
}
