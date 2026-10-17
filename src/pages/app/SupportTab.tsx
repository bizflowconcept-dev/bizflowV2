import { useState } from 'react'
import { Star } from 'lucide-react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, Panel, useToast } from '../../components/ui'
import { canRate, csatState, rateTicket, useTickets } from '../../platform/helpdesk'
import type { Ticket } from '../../platform/helpdesk'
import { fmtAt } from '../../platform/persist'

const TONE: Record<string, string> = { New: 'blue', Open: 'blue', 'Waiting on customer': 'amber', Resolved: 'green' }

/** Tickets BizFlow support is handling for this company. The company, not the agent, rates resolved tickets. */
export function useRateable(slug: string, user: string, isAdmin: boolean) {
  const all = useTickets()
  return all.filter((t) => t.slug === slug && (isAdmin || t.requester === user))
}

export default function SupportTab({ slug, user, isAdmin }: { slug: string; user: string; isAdmin: boolean }) {
  const mine = useRateable(slug, user, isAdmin)
  const [openId, setOpenId] = useState('')
  const [rating, setRating] = useState<Ticket | null>(null)
  const toast = useToast()
  if (mine.length === 0) return <Panel title="Support"><EmptyState title="No support tickets" body="When BizFlow support is working on something for your company, the ticket and its replies appear here. You can rate the support once a ticket is resolved." /></Panel>
  const sorted = [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const waiting = sorted.filter(canRate).length
  return (
    <Panel title={`${sorted.length} ticket${sorted.length === 1 ? '' : 's'}${waiting ? ` · ${waiting} to rate` : ''}`}>
      <ul className="-my-2 divide-y divide-line">
        {sorted.map((t) => {
          const open = openId === t.id; const cs = csatState(t)
          const thread = t.messages.filter((m) => m.kind === 'reply')
          return (
            <li key={t.id} className="py-3">
              <div className="flex flex-wrap items-start gap-3">
                <button className="min-w-0 flex-1 cursor-pointer text-left" aria-expanded={open} onClick={() => setOpenId(open ? '' : t.id)}>
                  <div className="text-sm font-semibold">{t.subject}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate"><span className="font-mono">{t.id}</span><Badge tone={TONE[t.status]}>{t.status}</Badge><span>Logged {fmtAt(t.createdAt)}</span></div>
                </button>
                {canRate(t) && <Btn s="sm" onClick={() => setRating(t)}>Rate this support</Btn>}
                {cs === 'rated' && <span className="flex items-center gap-1 text-sm" role="img" aria-label={`Rated ${t.csat!.score} out of 5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} className={n <= t.csat!.score! ? 'fill-warn text-warn' : 'text-line'} />)}</span>}
                {cs === 'declined' && <Badge tone="gray">Not rated</Badge>}
              </div>
              {open && (
                <div className="mt-3 space-y-2 rounded-md bg-cloud p-3 text-sm">
                  <p className="text-slate">{t.body}</p>
                  {thread.length === 0 ? <p className="text-xs text-slate">No replies yet. Our team will respond within the service target for your plan.</p> : thread.map((m) => <div key={m.id} className="border-t border-line pt-2"><div className="text-xs text-slate">{m.by} · {fmtAt(m.at)}</div><p>{m.text}</p></div>)}
                  {t.csat?.comment && <p className="border-t border-line pt-2 text-xs text-slate">Your comment: "{t.csat.comment}"</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <Overlay open={!!rating} onClose={() => setRating(null)} title="Rate this support">
        {rating && <RateForm t={rating} by={user} onDone={(msg) => { setRating(null); toast(msg) }} />}
      </Overlay>
    </Panel>
  )
}

function RateForm({ t, by, onDone }: { t: Ticket; by: string; onDone: (msg: string) => void }) {
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [err, setErr] = useState('')
  const submit = (s: number | null) => { const e = rateTicket(t.id, s, comment, by); if (e) setErr(e); else onDone(s === null ? 'No problem, thanks for letting us know' : 'Thank you for rating our support') }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate">How well did BizFlow support handle <b className="text-ink">{t.subject}</b>?</p>
      <div role="radiogroup" aria-label="Support rating" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={score === n} aria-label={`${n} out of 5`} onClick={() => setScore(n)} className="cursor-pointer rounded p-1 focus-visible:outline-2 focus-visible:outline-teal"><Star size={28} className={n <= score ? 'fill-warn text-warn' : 'text-line'} /></button>)}
      </div>
      <Field label="Anything we should know? (optional)"><textarea rows={3} maxLength={500} className={`${inputCls} h-auto py-2`} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      {err && <p role="alert" className="text-sm text-err">{err}</p>}
      <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => submit(null)}>Skip</Btn><Btn disabled={score === 0} onClick={() => submit(score)}>Submit rating</Btn></div>
    </div>
  )
}
