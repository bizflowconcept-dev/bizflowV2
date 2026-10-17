import { useState } from 'react'
import { Badge, Btn, EmptyState, ExportButton, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, useToast } from '../../components/ui'
import { useSupport, useTenants } from '../../tenant/store'
import { CATEGORIES, PRIORITIES, STATUSES, createTicket, csatState, fmtHours, slaOf, useTickets } from '../../platform/helpdesk'
import type { TPriority, Ticket } from '../../platform/helpdesk'
import { policyFor, usePolicies } from '../../platform/helpdeskConfig'
import { useAdmin } from './AdminLayout'
import Analytics from './helpdesk/Analytics'
import CannedLibrary from './helpdesk/Canned'
import Detail from './helpdesk/Detail'
import SlaPolicies from './helpdesk/SlaPolicies'
import { P_TONE, S_TONE, STAFF, SlaBadges, SlaText, useNow } from './helpdesk/shared'

const TABS = ['Queue', 'Analytics', 'SLA policies', 'Canned replies']

export default function SupportConsole() {
  const tickets = useTickets()
  const tenants = useTenants()
  const session = useSupport()
  usePolicies()
  const { can, actor } = useAdmin()
  const by = actor.split(' (')[0]
  const toast = useToast()
  const now = useNow()
  const [tab, setTab] = useState('Queue')
  const [status, setStatus] = useState('Active')
  const [prio, setPrio] = useState('All')
  const [who, setWho] = useState('All')
  const [breachOnly, setBreachOnly] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const co = (slug: string) => tenants[slug]?.profile.name ?? slug
  const planOf = (t: Ticket) => tenants[t.slug]?.plan ?? t.plan
  const sla = (t: Ticket) => slaOf(t, now, planOf(t))
  const manage = can('support')
  const rank = (t: Ticket) => { const s = sla(t).state; return (s === 'breached' ? 0 : s === 'at-risk' ? 10 : 20) + PRIORITIES.indexOf(t.priority) }

  const rows = tickets
    .filter((t) => (status === 'All' ? true : status === 'Active' ? t.status !== 'Resolved' : t.status === status))
    .filter((t) => (prio === 'All' || t.priority === prio) && (who === 'All' || (who === 'Unassigned' ? !t.assignee : t.assignee === who)) && (!breachOnly || (sla(t).breached && t.status !== 'Resolved')))
    .sort((a, b) => (a.status === 'Resolved' ? 1 : 0) - (b.status === 'Resolved' ? 1 : 0) || rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt))
  const live = tickets.filter((t) => t.status !== 'Resolved')
  const risky = live.filter((t) => sla(t).state !== 'ok').sort((a, b) => Math.min(sla(a).first.done ? 9e12 : sla(a).first.leftMs, sla(a).resolve.leftMs) - Math.min(sla(b).first.done ? 9e12 : sla(b).first.leftMs, sla(b).resolve.leftMs))
  const breached = live.filter((t) => sla(t).state === 'breached').length
  const sel = tickets.find((t) => t.id === open)

  return (
    <div>
      <PageHeader eyebrow="Support" title="Support console" desc="Tickets from company workspaces with plan-based response and resolution targets, escalation, canned replies, internal notes and consent-based support sessions." actions={<>
        <ExportButton name="support-tickets" head={['Ticket', 'Company', 'Subject', 'Priority', 'Status', 'Assignee', 'Escalated to', 'SLA', 'CSAT']} rows={rows.map((t) => [t.id, co(t.slug), t.subject, t.priority, t.status, t.assignee || 'Unassigned', t.escalatedTo ?? '', sla(t).label, t.csat ? String(t.csat.score ?? 'No response') : csatState(t) === 'awaiting' ? 'Awaiting rating' : csatState(t) === 'lapsed' ? 'No response' : ''])} />
        <Btn v="secondary" to="/admin/announcements">Announcements</Btn>
        {manage && <Btn onClick={() => setCreating(true)}>Log ticket</Btn>}
      </>} />
      {session && <div role="status" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"><b>Support diagnostics {session.status.toLowerCase()}</b> for {co(session.slug)}: {session.reason}. Access is metadata-only and never creates company authority.</div>}
      <div className="mb-5"><Tabs tabs={TABS} value={tab} onChange={setTab} /></div>

      {tab === 'Analytics' && <Analytics tickets={tickets} now={now} co={co} />}
      {tab === 'SLA policies' && <SlaPolicies manage={manage} by={by} />}
      {tab === 'Canned replies' && <CannedLibrary manage={manage} by={by} />}
      {tab === 'Queue' && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Panel><Stat label="Open tickets" value={String(live.length)} sub={`${live.filter((t) => t.priority === 'Urgent' || t.priority === 'High').length} high priority`} /></Panel>
          <Panel><Stat label="Unassigned" value={String(live.filter((t) => !t.assignee).length)} /></Panel>
          <Panel><Stat label="SLA breached" value={String(breached)} sub="first response or resolution" up={false} /></Panel>
          <Panel><Stat label="At risk" value={String(live.filter((t) => sla(t).state === 'at-risk').length)} sub="over 75% of a window used" up={false} /></Panel>
        </div>
        <section aria-label="At risk queue" className="mt-5">
          <Panel title="At risk and breached" action={<span className="text-xs text-slate">Updates every 30 seconds</span>}>
            {risky.length === 0 ? <p className="text-sm text-slate">Nothing is at risk. Every open ticket is comfortably inside its first-response and resolution windows.</p> : (
              <ul className="grid gap-2 md:grid-cols-2">{risky.map((t) => (
                <li key={t.id}><button onClick={() => setOpen(t.id)} className={`w-full cursor-pointer rounded-md border p-3 text-left hover:border-teal ${sla(t).state === 'breached' ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                  <div className="flex items-center gap-2 text-sm"><span className="font-mono text-xs font-semibold text-teal">{t.id}</span><span className="min-w-0 flex-1 truncate font-semibold">{t.subject}</span><Badge tone={P_TONE[t.priority]}>{t.priority}</Badge></div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate"><span>{co(t.slug)}</span><span aria-hidden="true">·</span><span>{t.assignee || 'Unassigned'}</span></div>
                  <div className="mt-2"><SlaBadges sla={sla(t)} live /></div>
                </button></li>))}</ul>
            )}
          </Panel>
        </section>
        <div className="mb-3 mt-6 flex flex-wrap items-end gap-3">
          <div className="w-44"><Field label="Status"><select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>{['Active', 'All', ...STATUSES].map((s) => <option key={s}>{s}</option>)}</select></Field></div>
          <div className="w-36"><Field label="Priority"><select className={inputCls} value={prio} onChange={(e) => setPrio(e.target.value)}>{['All', ...PRIORITIES].map((s) => <option key={s}>{s}</option>)}</select></Field></div>
          <div className="w-44"><Field label="Assignee"><select className={inputCls} value={who} onChange={(e) => setWho(e.target.value)}>{['All', 'Unassigned', ...STAFF].map((s) => <option key={s}>{s}</option>)}</select></Field></div>
          <label className="flex min-h-10 items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-teal" checked={breachOnly} onChange={(e) => setBreachOnly(e.target.checked)} />SLA breached only</label>
        </div>
        {rows.length === 0 ? <Panel pad={false}><EmptyState title="No tickets match" body="Change the filters to see more of the queue." /></Panel> : (
          <Table label="Support tickets" head={['Ticket', 'Company', 'Subject', 'Priority', 'SLA', 'Assignee', 'Status']} rows={rows.map((t) => [
            <button key="i" onClick={() => setOpen(t.id)} className="cursor-pointer font-mono font-semibold text-teal">{t.id}</button>,
            co(t.slug),
            <span key="s"><button onClick={() => setOpen(t.id)} className="cursor-pointer text-left font-semibold hover:text-teal">{t.subject}</button>{t.escalatedTo && <span className="ml-2"><Badge tone="red">Escalated: {t.escalatedTo}</Badge></span>}</span>,
            <Badge key="p" tone={P_TONE[t.priority]}>{t.priority}</Badge>,
            <SlaText key="l" sla={sla(t)} live={t.status !== 'Resolved'} />,
            t.assignee || <span key="a" className="text-slate">Unassigned</span>,
            <Badge key="t" tone={S_TONE[t.status]}>{t.status}</Badge>,
          ])} />
        )}
      </>}

      <Overlay open={!!sel} onClose={() => setOpen(null)} title={sel ? `${sel.id} · ${sel.subject}` : 'Ticket'} side wide>
        {sel && <Detail t={sel} all={tickets} company={co(sel.slug)} by={by} manage={manage} canOpenCompany={can('businesses')} now={now} onOpen={setOpen} />}
      </Overlay>
      <Overlay open={creating} onClose={() => setCreating(false)} title="Log a ticket for a company">
        <NewTicket by={by} onDone={(id) => { setCreating(false); setOpen(id); setTab('Queue'); toast(`${id} created`) }} />
      </Overlay>
    </div>
  )
}

function NewTicket({ by, onDone }: { by: string; onDone: (id: string) => void }) {
  const tenants = Object.values(useTenants())
  const [f, setF] = useState({ slug: tenants[0]?.slug ?? '', requester: '', subject: '', body: '', category: CATEGORIES[0], priority: 'Normal' as TPriority })
  const plan = tenants.find((t) => t.slug === f.slug)?.plan
  const pol = policyFor(plan, f.priority)
  const ok = f.slug && f.requester.trim() && f.subject.trim()
  return (
    <div className="space-y-3">
      <Field label="Company"><select className={inputCls} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })}>{tenants.map((t) => <option key={t.slug} value={t.slug}>{t.profile.name}</option>)}</select></Field>
      <Field label="Requester"><input className={inputCls} value={f.requester} onChange={(e) => setF({ ...f, requester: e.target.value })} /></Field>
      <Field label="Subject"><input className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
      <Field label="Details"><textarea rows={3} className={`${inputCls} h-auto py-2`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Priority" hint={`${plan ?? 'Default'} plan: reply in ${fmtHours(pol.first)}, resolve in ${fmtHours(pol.resolve)}`}><select className={inputCls} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TPriority })}>{PRIORITIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <Btn disabled={!ok} onClick={() => onDone(createTicket({ ...f, plan }, by).id)}>Create ticket</Btn>
    </div>
  )
}
