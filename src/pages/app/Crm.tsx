import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useRole } from '../../components/app/AppLayout'
import { Avatar, Badge, Btn, EmptyState, Field, inputCls, Overlay, Panel, PageHeader, Stat, Table, Tabs, useToast } from '../../components/ui'
import { CHART, TrendChart } from '../../components/charts'
import { employeesForTenant, ngn, ngnM } from '../../data/demo'
import { useTenant } from '../../tenant/store'
import {
  ACT_KINDS, INDUSTRIES, OPEN_STAGES, SOURCES, STAGES, DEFAULT_PROB, addActivity, addDays, addMonths, createLead, daysBetween, earnedSummary, fmtDate, leadById, monthlyEquivalent, moveStage,
  pipelineStats, recordPayment, scheduleOf, setEarningPlan, updateLead, useLeads, weighted,
} from '../../crm/store'
import { AttainmentBar, Customer360, ImportDialog, TargetsDialog, useAttainment } from '../../crm/Extras'
import { postInstalment } from '../../crm/store'
import type { Cadence, EarningPlan, Lead, LeadInput, Stage } from '../../crm/store'

const TODAY = new Date().toISOString().slice(0, 10)
const STAGE_TONE: Record<Stage, string> = { Lead: 'gray', Qualified: 'amber', Proposal: 'teal', Won: 'green', Lost: 'red' }
const TABS = ['Pipeline', 'Leads', 'Earnings', 'Insights']
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const textarea = 'w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-slate/70 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20'
const isLive = (l: Lead) => l.stage === 'Won'
const nextState = (l: Lead) => (!l.nextAction ? null : l.nextDue && l.nextDue < TODAY ? 'overdue' : l.nextDue === TODAY ? 'today' : 'planned')
const dueLabel = (iso: string) => (!iso ? '' : iso === TODAY ? 'Today' : iso === addDays(TODAY, 1) ? 'Tomorrow' : fmtDate(iso))

function Bar({ value, max, color = 'bg-teal' }: { value: number; max: number; color?: string }) {
  return <div className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]"><div className={`h-full rounded-full ${color}`} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} /></div>
}

export default function CRM() {
  const { r, can, role } = useRole()
  const tenant = useTenant()
  const toast = useToast()
  const slug = tenant?.slug ?? 'etranzact'
  const leads = useLeads(slug)
  const canEdit = can('crm.create')
  const [sp, setSp] = useSearchParams()
  const [tab, setTab] = useState('Pipeline')
  const [q, setQ] = useState('')
  const [owner, setOwner] = useState('All owners')
  const [openId, setOpenId] = useState<string | null>(sp.get('lead'))
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [targeting, setTargeting] = useState(false)
  const canTarget = can('company.users.manage') || ['md', 'bdmanager'].includes(role)
  const [lostFor, setLostFor] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const people = useMemo(() => Array.from(new Set([...employeesForTenant(slug).map((e) => e.name), ...leads.map((l) => l.owner)])).sort(), [slug, leads])
  const owners = useMemo(() => ['All owners', ...Array.from(new Set(leads.map((l) => l.owner))).sort()], [leads])
  const shown = useMemo(() => leads.filter((l) => (owner === 'All owners' || l.owner === owner) && (!q || `${l.company} ${l.contact} ${l.industry}`.toLowerCase().includes(q.toLowerCase()))), [leads, q, owner])
  const stats = pipelineStats(shown)
  const open = openId ? leadById(openId) : undefined
  const closeDrawer = () => { setOpenId(null); if (sp.get('lead')) { sp.delete('lead'); setSp(sp, { replace: true }) } }

  const move = (id: string, stage: Stage) => {
    if (!canEdit) return
    const l = leadById(id); if (!l || l.stage === stage) return
    if (stage === 'Lost') { setLostFor(id); return }
    moveStage(id, stage, r.user)
    toast(`${l.company} moved to ${stage}`)
  }

  const dueSoon = shown.filter((l) => OPEN_STAGES.includes(l.stage) && l.nextAction && l.nextDue && l.nextDue <= addDays(TODAY, 3)).sort((a, b) => a.nextDue.localeCompare(b.nextDue))

  return (
    <div>
      <PageHeader eyebrow="Customers" title="Sales pipeline" desc="Track every lead from first contact to a live, paying customer, with the follow-ups and earnings that come with it."
        actions={<div className="flex flex-wrap gap-2">{canTarget && <Btn v="secondary" onClick={() => setTargeting(true)}>Sales targets</Btn>}{canEdit && <Btn v="secondary" onClick={() => setImporting(true)}>Import CSV</Btn>}{canEdit && <Btn onClick={() => setAdding(true)}>Add lead</Btn>}</div>} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} slug={slug} existing={leads.map((l) => l.company)} people={people} by={r.user} today={TODAY} />
      <TargetsDialog open={targeting} onClose={() => setTargeting(false)} slug={slug} people={people} by={r.user} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open pipeline" value={ngnM(stats.openValue)} sub={`${stats.open.length} active leads`} />
        <Stat label="Weighted forecast" value={ngnM(stats.weightedValue)} sub="By win probability" />
        <Stat label="Win rate" value={`${stats.winRate}%`} sub={`${stats.won.length} won, ${stats.lost.length} lost`} />
        <Stat label="Live customers" value={String(stats.won.length)} sub={`${ngnM(stats.wonValue)} won value`} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56"><input aria-label="Search leads" className={inputCls} placeholder="Search company, contact or industry" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select aria-label="Filter by owner" className={`${inputCls} !w-auto min-w-40`} value={owner} onChange={(e) => setOwner(e.target.value)}>{owners.map((o) => <option key={o}>{o}</option>)}</select>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div className="mt-5">
        {tab === 'Pipeline' && (
          <>
            {leads.length === 0 && <Panel className="mb-5"><EmptyState title="No leads yet" body="Add your first lead or import a CSV to start tracking your sales pipeline." action={canEdit ? <><Btn onClick={() => setAdding(true)}>Add your first lead</Btn><Btn v="secondary" onClick={() => setImporting(true)}>Import CSV</Btn></> : undefined} /></Panel>}
            {dueSoon.length > 0 && (
              <Panel title="Follow-ups due" className="mb-5" pad={false}>
                <ul className="divide-y divide-line">
                  {dueSoon.map((l) => (
                    <li key={l.id}>
                      <button onClick={() => setOpenId(l.id)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-ink/[0.03]">
                        <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{l.nextAction}</div><div className="truncate text-xs text-slate">{l.company} · {l.owner}</div></div>
                        <Badge tone={nextState(l) === 'overdue' ? 'red' : nextState(l) === 'today' ? 'amber' : 'gray'}>{nextState(l) === 'overdue' ? `Overdue ${dueLabel(l.nextDue)}` : dueLabel(l.nextDue)}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:mx-0 sm:px-0">
              <div className="grid min-w-[1060px] grid-cols-5 gap-3">
                {STAGES.map((s) => {
                  const col = shown.filter((l) => l.stage === s)
                  return (
                    <section key={s} aria-label={`${s} stage`} onDragOver={(e) => canEdit && e.preventDefault()} onDrop={() => { if (dragId) move(dragId, s); setDragId(null) }}>
                      <div className="mb-2 flex items-baseline justify-between text-sm font-semibold"><span>{s} <span className="font-normal text-slate">{col.length}</span></span><span className="num text-xs font-normal text-slate">{ngnM(col.reduce((a, l) => a + l.value, 0))}</span></div>
                      <div className={`min-h-40 space-y-2 rounded-lg p-2 transition-colors ${dragId ? 'bg-teal/[0.06] ring-1 ring-dashed ring-teal/30' : 'bg-ink/[0.04]'}`}>
                        {col.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate">{canEdit ? 'Drop a lead here' : 'No leads'}</p>}
                        {col.map((l) => {
                          const ns = nextState(l)
                          const earn = l.earning ? earnedSummary(l.earning, TODAY) : null
                          return (
                            <div key={l.id} draggable={canEdit} onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)} className="rounded-md border border-line bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
                              <button onClick={() => setOpenId(l.id)} className="block w-full cursor-pointer text-left">
                                <div className="text-sm font-semibold leading-snug">{l.company}</div>
                                <div className="text-xs text-slate">{l.contact}</div>
                                <div className="num mt-2 text-sm">{ngn(l.value)}</div>
                                {OPEN_STAGES.includes(l.stage) && <div className="mt-2 flex items-center gap-2"><Bar value={l.probability} max={100} /><span className="num text-[11px] text-slate">{l.probability}%</span></div>}
                                {earn && l.earning && <div className="mt-2 text-xs text-slate">{l.earning.cadence} {ngn(l.earning.amount)} · <span className={earn.overdue.length ? 'font-semibold text-red-700' : ''}>{earn.rate}% collected</span></div>}
                                {l.stage === 'Won' && !l.earning && <div className="mt-2 text-xs font-semibold text-teal">Set up earnings</div>}
                                {ns && OPEN_STAGES.includes(l.stage) && <div className={`mt-2 truncate text-xs ${ns === 'overdue' ? 'font-semibold text-red-700' : 'text-slate'}`}>{l.nextAction} · {dueLabel(l.nextDue)}</div>}
                              </button>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate"><Avatar name={l.owner} size={20} /><span className="truncate">{l.owner}</span></span>
                                {canEdit && <select aria-label={`Move ${l.company}`} value={l.stage} onChange={(e) => move(l.id, e.target.value as Stage)} className="h-7 rounded border border-line bg-white px-1 text-xs">{STAGES.map((x) => <option key={x}>{x}</option>)}</select>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {tab === 'Leads' && (
          shown.length === 0 ? <EmptyState title="No leads match" body="Adjust the search or owner filter." /> : (
            <Panel pad={false}>
              <Table label="Leads" head={['Company', 'Stage', 'Value', 'Win %', 'Owner', 'Next action', 'Expected close']} right={[2, 3]} pageSize={10}
                rows={[...shown].sort((a, b) => b.updated.localeCompare(a.updated)).map((l) => [
                  <button key="c" onClick={() => setOpenId(l.id)} className="cursor-pointer text-left font-semibold text-teal hover:underline">{l.company}<span className="block text-xs font-normal text-slate">{l.contact}</span></button>,
                  <Badge key="s" tone={STAGE_TONE[l.stage]}>{l.stage}</Badge>,
                  <span key="v" className="num">{ngn(l.value)}</span>,
                  <span key="p" className="num">{l.probability}%</span>,
                  l.owner,
                  l.nextAction ? <span key="n" className={nextState(l) === 'overdue' ? 'text-red-700' : ''}>{l.nextAction} · {dueLabel(l.nextDue)}</span> : <span key="n" className="text-slate">None set</span>,
                  fmtDate(l.expectedClose),
                ])} />
            </Panel>
          )
        )}

        {tab === 'Earnings' && <EarningsOverview leads={shown} onOpen={setOpenId} />}
        {tab === 'Insights' && <Insights leads={shown} slug={slug} onOpen={setOpenId} />}
      </div>

      <Overlay open={!!open} onClose={closeDrawer} title={open?.company ?? 'Lead'} side wide>
        {open && <LeadDrawer key={open.id} lead={open} people={people} canEdit={canEdit} by={r.user} onMove={move} />}
      </Overlay>

      <Overlay open={adding} onClose={() => setAdding(false)} title="Add lead" side wide>
        <LeadForm people={people} defaultOwner={people.includes(r.user) ? r.user : people[0]} submit="Add lead" onCancel={() => setAdding(false)} onSave={(v) => { const l = createLead(slug, v, r.user); setAdding(false); toast(`${l.company} added to the pipeline`); setOpenId(l.id) }} />
      </Overlay>

      <LostDialog id={lostFor} onClose={() => setLostFor(null)} by={r.user} />
    </div>
  )
}

function LostDialog({ id, onClose, by }: { id: string | null; onClose: () => void; by: string }) {
  const toast = useToast()
  const [reason, setReason] = useState('Chose a competitor')
  const [other, setOther] = useState('')
  const lead = id ? leadById(id) : undefined
  return (
    <Overlay open={!!lead} onClose={onClose} title="Mark lead as lost">
      <div className="space-y-4">
        <p className="text-sm text-slate">Why did {lead?.company} not go ahead? This feeds the loss analysis under Insights.</p>
        <Field label="Reason"><select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>{['Chose a competitor', 'Chose a cheaper local provider', 'Budget not approved', 'No response', 'Timing not right', 'Requirements changed', 'Other'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        {reason === 'Other' && <Field label="Details"><input className={inputCls} value={other} onChange={(e) => setOther(e.target.value)} /></Field>}
        <div className="flex justify-end gap-2"><Btn v="secondary" onClick={onClose}>Cancel</Btn><Btn onClick={() => { if (id) { moveStage(id, 'Lost', by, reason === 'Other' ? other.trim() || 'Other' : reason); toast(`${lead?.company} marked as lost`) } onClose() }}>Mark as lost</Btn></div>
      </div>
    </Overlay>
  )
}

function LeadForm({ initial, people, defaultOwner, submit, onSave, onCancel, readOnly = false }: { initial?: Lead; people: string[]; defaultOwner?: string; submit: string; onSave: (v: LeadInput) => void; onCancel?: () => void; readOnly?: boolean }) {
  const [v, setV] = useState<LeadInput>(() => initial ? { company: initial.company, contact: initial.contact, email: initial.email, phone: initial.phone, industry: initial.industry, source: initial.source, stage: initial.stage, value: initial.value, probability: initial.probability, expectedClose: initial.expectedClose, owner: initial.owner, notes: initial.notes, nextAction: initial.nextAction, nextDue: initial.nextDue }
    : { company: '', contact: '', email: '', phone: '', industry: INDUSTRIES[0], source: SOURCES[0], stage: 'Lead', value: 0, probability: DEFAULT_PROB.Lead, expectedClose: addMonths(TODAY, 2), owner: defaultOwner ?? '', notes: '', nextAction: '', nextDue: '' })
  const set = <K extends keyof LeadInput>(k: K, x: LeadInput[K]) => setV((p) => ({ ...p, [k]: x }))
  const [err, setErr] = useState('')
  const ownerOpts = people.includes(v.owner) || !v.owner ? people : [v.owner, ...people]
  const save = () => {
    if (!v.company.trim() || !v.contact.trim()) { setErr('Company and contact person are required.'); return }
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) { setErr('Enter a valid email address.'); return }
    onSave({ ...v, company: v.company.trim(), contact: v.contact.trim() })
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="space-y-6">
      <fieldset disabled={readOnly} className="space-y-6">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate">Company</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company name"><input className={inputCls} value={v.company} onChange={(e) => set('company', e.target.value)} /></Field>
            <Field label="Industry"><select className={inputCls} value={v.industry} onChange={(e) => set('industry', e.target.value)}>{INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Contact person"><input className={inputCls} value={v.contact} onChange={(e) => set('contact', e.target.value)} /></Field>
            <Field label="Lead source"><select className={inputCls} value={v.source} onChange={(e) => set('source', e.target.value)}>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Email"><input type="email" className={inputCls} value={v.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="Phone"><input type="tel" className={inputCls} value={v.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate">Deal</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {initial && <Field label="Stage"><input className={inputCls} value={v.stage} disabled /></Field>}
            <Field label="Deal value (₦)"><input type="number" min={0} className={inputCls} value={v.value || ''} onChange={(e) => set('value', Math.max(0, Number(e.target.value)))} /></Field>
            {OPEN_STAGES.includes(v.stage) && <Field label={`Win probability (${v.probability}%)`}><input type="range" min={5} max={95} step={5} className="h-10 w-full accent-teal" value={v.probability} onChange={(e) => set('probability', Number(e.target.value))} /></Field>}
            <Field label="Expected close"><input type="date" className={inputCls} value={v.expectedClose} onChange={(e) => set('expectedClose', e.target.value)} /></Field>
            <Field label="Owner"><select className={inputCls} value={v.owner} onChange={(e) => set('owner', e.target.value)}>{ownerOpts.map((x) => <option key={x}>{x}</option>)}</select></Field>
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate">Next step</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
            <Field label="Next action"><input className={inputCls} placeholder="e.g. Send revised proposal" value={v.nextAction} onChange={(e) => set('nextAction', e.target.value)} /></Field>
            <Field label="Due date"><input type="date" className={inputCls} value={v.nextDue} onChange={(e) => set('nextDue', e.target.value)} /></Field>
          </div>
          <div className="mt-3"><Field label="Notes"><textarea rows={4} className={textarea} value={v.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Needs, decision makers, objections, anything the team should know" /></Field></div>
        </div>
      </fieldset>
      {err && <p role="alert" className="text-sm font-semibold text-red-700">{err}</p>}
      {readOnly ? <p className="text-xs text-slate">You have view-only access to the pipeline.</p> : (
        <div className="flex justify-end gap-2">{onCancel && <Btn type="button" v="secondary" onClick={onCancel}>Cancel</Btn>}<Btn type="submit">{submit}</Btn></div>
      )}
    </form>
  )
}

function LeadDrawer({ lead, people, canEdit, by, onMove }: { lead: Lead; people: string[]; canEdit: boolean; by: string; onMove: (id: string, s: Stage) => void }) {
  const toast = useToast()
  const tabs = ['Details', 'Activity', ...(isLive(lead) ? ['Earnings', 'Customer 360'] : []), 'Documents']
  const [t, setT] = useState('Details')
  const [kind, setKind] = useState<(typeof ACT_KINDS)[number]>('Note')
  const [text, setText] = useState('')
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={STAGE_TONE[lead.stage]}>{lead.stage}</Badge>
        <span className="num text-sm font-semibold">{ngn(lead.value)}</span>
        {OPEN_STAGES.includes(lead.stage) && <span className="text-xs text-slate">{lead.probability}% likely · {ngn(weighted(lead))} weighted</span>}
        {lead.stage === 'Lost' && lead.lostReason && <span className="text-xs text-slate">Lost: {lead.lostReason}</span>}
        {canEdit && (
          <select aria-label="Change stage" value={lead.stage} onChange={(e) => onMove(lead.id, e.target.value as Stage)} className="ml-auto h-8 rounded-md border border-line bg-white px-2 text-sm">{STAGES.map((x) => <option key={x}>{x}</option>)}</select>
        )}
      </div>
      {OPEN_STAGES.includes(lead.stage) && (
        <ol className="mb-5 grid grid-cols-3 gap-1.5" aria-label="Progress">
          {OPEN_STAGES.map((s, i) => <li key={s} className={`rounded px-2 py-1 text-center text-[11px] font-semibold ${i <= OPEN_STAGES.indexOf(lead.stage) ? 'bg-teal text-white' : 'bg-ink/[0.06] text-slate'}`}>{s}</li>)}
        </ol>
      )}
      <Tabs tabs={tabs} value={t} onChange={setT} />
      <div className="mt-5">
        {t === 'Details' && <LeadForm initial={lead} people={people} submit="Save changes" readOnly={!canEdit} onSave={(v) => { updateLead(lead.id, v, by); toast('Lead updated') }} />}
        {t === 'Activity' && (
          <div className="space-y-5">
            {canEdit && (
              <form onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; addActivity(lead.id, kind, text.trim(), by); setText(''); toast('Activity logged') }} className="space-y-2 rounded-lg border border-line bg-ink/[0.02] p-3">
                <div className="flex gap-2">{ACT_KINDS.map((k) => <button type="button" key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold ${kind === k ? 'border-teal bg-teal text-white' : 'border-line bg-white text-slate hover:text-ink'}`}>{k}</button>)}</div>
                <textarea aria-label="Activity details" rows={2} className={textarea} placeholder={`Log a ${kind.toLowerCase()}`} value={text} onChange={(e) => setText(e.target.value)} />
                <div className="flex justify-end"><Btn s="sm" type="submit" disabled={!text.trim()}>Log activity</Btn></div>
              </form>
            )}
            <ol className="relative space-y-4 border-l border-line pl-5">
              {lead.activity.map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-teal" />
                  <div className="text-sm"><span className="font-semibold">{a.kind}</span> <span className="text-slate">· {a.by} · {fmtDate(a.at.slice(0, 10))}</span></div>
                  <p className="text-sm">{a.text}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
        {t === 'Customer 360' && <Customer360 lead={lead} today={TODAY} />}
        {t === 'Earnings' && <EarningsEditor lead={lead} canEdit={canEdit} by={by} />}
        {t === 'Documents' && (
          <div className="space-y-4">
            {lead.docs.length === 0 ? <EmptyState title="No documents linked" body="Link this lead when you send a contract, proposal or NDA for signature, and it will appear here." /> : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {lead.docs.map((d) => (
                  <li key={d.requestId} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{d.title}</div><div className="text-xs text-slate">Sent by {d.by} · {fmtDate(d.at.slice(0, 10))}</div></div><Link to={`/admin/business/sign?request=${d.requestId}`} className="text-sm font-semibold text-teal hover:underline">Open</Link></li>
                ))}
              </ul>
            )}
            <Btn v="secondary" to={`/admin/business/sign?lead=${lead.id}`}>Send a document for signature</Btn>
          </div>
        )}
      </div>
    </div>
  )
}

function EarningsEditor({ lead, canEdit, by }: { lead: Lead; canEdit: boolean; by: string }) {
  const toast = useToast()
  const plan = lead.earning
  const [editing, setEditing] = useState(!plan)
  const [d, setD] = useState<{ cadence: Cadence; amount: number; start: string; periods: string; note: string }>({ cadence: plan?.cadence ?? 'Monthly', amount: plan?.amount ?? 0, start: plan?.start ?? TODAY, periods: plan?.periods ? String(plan.periods) : '', note: plan?.note ?? '' })
  const [pay, setPay] = useState<{ due: string; amount: number; note: string } | null>(null)
  const sum = plan ? earnedSummary(plan, TODAY) : null

  const save = () => {
    if (d.amount <= 0) { toast('Enter the amount expected each period'); return }
    const next: EarningPlan = { cadence: d.cadence, amount: d.amount, start: d.start, periods: d.periods ? Math.max(1, Number(d.periods)) : null, note: d.note.trim(), payments: plan?.payments ?? [] }
    setEarningPlan(lead.id, next, by); setEditing(false); toast('Earning plan saved')
  }

  if (!plan || editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); save() }} className="space-y-4">
        <p className="text-sm text-slate">{plan ? 'Adjust the recurring earning for this live customer.' : `${lead.company} is live. Set the amount they pay each week or month so collections can be tracked against it.`}</p>
        <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Billing cadence"><select className={inputCls} value={d.cadence} onChange={(e) => setD({ ...d, cadence: e.target.value as Cadence })}><option>Weekly</option><option>Monthly</option></select></Field>
          <Field label={`Amount per ${d.cadence === 'Weekly' ? 'week' : 'month'} (₦)`}><input type="number" min={0} className={inputCls} value={d.amount || ''} onChange={(e) => setD({ ...d, amount: Number(e.target.value) })} /></Field>
          <Field label="First payment due"><input type="date" className={inputCls} value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} /></Field>
          <Field label="Number of periods" hint="Leave empty for an ongoing arrangement"><input type="number" min={1} className={inputCls} value={d.periods} onChange={(e) => setD({ ...d, periods: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Note"><input className={inputCls} placeholder="e.g. Paid by transfer on the 1st" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></Field></div>
        </fieldset>
        {d.amount > 0 && <p className="rounded-md bg-softmint px-3 py-2 text-sm">That is about <b className="num">{ngn(d.cadence === 'Weekly' ? Math.round((d.amount * 52) / 12) : d.amount)}</b> a month{d.periods ? ` and ${ngn(d.amount * Number(d.periods))} over ${d.periods} ${d.cadence === 'Weekly' ? 'weeks' : 'months'}` : ''}.</p>}
        {canEdit ? <div className="flex justify-end gap-2">{plan && <Btn type="button" v="secondary" onClick={() => setEditing(false)}>Cancel</Btn>}<Btn type="submit">Save earning plan</Btn></div> : <p className="text-xs text-slate">You have view-only access.</p>}
      </form>
    )
  }

  const rows = scheduleOf(plan, TODAY)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {[['Expected to date', ngn(sum!.expected)], ['Received', ngn(sum!.received)], ['Outstanding', ngn(sum!.outstanding)]].map(([k, v]) => <div key={k} className="rounded-lg border border-line p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate">{k}</div><div className={`num mt-1 text-sm font-semibold sm:text-base ${k === 'Outstanding' && sum!.outstanding > 0 ? 'text-red-700' : ''}`}>{v}</div></div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{plan.cadence} · <b className="num">{ngn(plan.amount)}</b> from {fmtDate(plan.start)}{plan.periods ? ` for ${plan.periods} ${plan.cadence === 'Weekly' ? 'weeks' : 'months'}` : ', ongoing'} · {sum!.rate}% collected</span>
        {canEdit && <span className="flex gap-2"><Btn s="sm" v="secondary" onClick={() => setEditing(true)}>Edit plan</Btn><Btn s="sm" v="ghost" onClick={() => { setEarningPlan(lead.id, undefined, by); setEditing(true); toast('Earning plan removed') }}>Remove</Btn></span>}
      </div>
      {plan.note && <p className="text-sm text-slate">{plan.note}</p>}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {[...rows].reverse().map((x) => (
          <li key={x.due} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{fmtDate(x.due)}</div><div className="num text-xs text-slate">{x.paid ? `${ngn(x.paid)} of ${ngn(x.expected)}${x.receivedOn ? ` · received ${fmtDate(x.receivedOn)}` : ''}` : ngn(x.expected)}</div></div>
            {x.paid > 0 && (x.posted ? <Badge tone="green">Posted to Accounting</Badge> : canEdit ? <Btn s="sm" v="ghost" onClick={() => { postInstalment(lead.id, x.due, by); toast('Posted to Accounting') }}>Post</Btn> : <Badge tone="amber">Not posted</Badge>)}
            <Badge tone={x.status === 'Received' ? 'green' : x.status === 'Overdue' ? 'red' : x.status === 'Part paid' || x.status === 'Due' ? 'amber' : 'gray'}>{x.status}</Badge>
            {canEdit && x.status !== 'Received' && x.status !== 'Upcoming' && <Btn s="sm" v="secondary" onClick={() => setPay({ due: x.due, amount: x.expected - x.paid, note: '' })}>Record</Btn>}
          </li>
        ))}
      </ul>
      <Overlay open={!!pay} onClose={() => setPay(null)} title="Record payment received">
        {pay && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (pay.amount <= 0) return; recordPayment(lead.id, { due: pay.due, amount: pay.amount, receivedOn: TODAY, by, note: pay.note.trim() || undefined }); setPay(null); toast('Payment recorded') }}>
            <p className="text-sm text-slate">Instalment due {fmtDate(pay.due)} from {lead.company}.</p>
            <Field label="Amount received (₦)"><input type="number" min={1} className={inputCls} value={pay.amount || ''} onChange={(e) => setPay({ ...pay, amount: Number(e.target.value) })} /></Field>
            <Field label="Note (optional)"><input className={inputCls} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><Btn type="button" v="secondary" onClick={() => setPay(null)}>Cancel</Btn><Btn type="submit">Record payment</Btn></div>
          </form>
        )}
      </Overlay>
    </div>
  )
}

function EarningsOverview({ leads, onOpen }: { leads: Lead[]; onOpen: (id: string) => void }) {
  const live = leads.filter(isLive)
  const withPlan = live.filter((l) => l.earning)
  const totals = withPlan.reduce((a, l) => { const s = earnedSummary(l.earning!, TODAY); return { mrr: a.mrr + monthlyEquivalent(l.earning!), expected: a.expected + s.expected, received: a.received + s.received, overdue: a.overdue + s.overdue.reduce((x, o) => x + (o.expected - o.paid), 0) } }, { mrr: 0, expected: 0, received: 0, overdue: 0 })
  const noPlan = live.filter((l) => !l.earning)
  const months = Array.from({ length: 6 }, (_, i) => addMonths(TODAY.slice(0, 8) + '01', i - 2))
  const trend = months.map((m) => {
    const end = addMonths(m, 1)
    let received = 0, expected = 0
    withPlan.forEach((l) => {
      l.earning!.payments.filter((p) => p.receivedOn >= m && p.receivedOn < end).forEach((p) => { received += p.amount })
      const cap = m > TODAY ? addMonths(m, 1) : end
      const p = l.earning!
      for (let i = 0; i < (p.periods ?? 400); i++) { const due = p.cadence === 'Weekly' ? addDays(p.start, i * 7) : addMonths(p.start, i); if (due >= cap) break; if (due >= m) expected += p.amount }
    })
    return { m: new Date(m + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }), Expected: expected, Received: m > TODAY ? 0 : received }
  })
  if (live.length === 0) return <EmptyState title="No live customers yet" body="When a lead is marked as Won it becomes a live customer, and you can set up its weekly or monthly earnings here." />
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Monthly recurring" value={ngnM(totals.mrr)} sub={`${withPlan.length} earning plans`} />
        <Stat label="Collected to date" value={ngnM(totals.received)} sub={`${pct(totals.received, totals.expected)}% of ${ngnM(totals.expected)} due`} />
        <Stat label="Overdue" value={ngnM(totals.overdue)} sub={totals.overdue ? 'Needs follow-up' : 'All up to date'} />
        <Stat label="Annualised" value={ngnM(totals.mrr * 12)} sub="At current plans" />
      </div>
      <Panel title="Expected vs received, by month">
        <TrendChart label="Expected versus received earnings by month" data={trend} series={[{ key: 'Expected', label: 'Expected', dashed: true }, { key: 'Received', label: 'Received' }]} fmt={ngnM} height={240} />
      </Panel>
      {noPlan.length > 0 && (
        <Panel title="Live customers without an earning plan" pad={false}>
          <ul className="divide-y divide-line">{noPlan.map((l) => <li key={l.id}><button onClick={() => onOpen(l.id)} className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left hover:bg-ink/[0.03]"><span className="text-sm font-semibold">{l.company}</span><span className="text-sm font-semibold text-teal">Set up</span></button></li>)}</ul>
        </Panel>
      )}
      {withPlan.length > 0 && (
        <Panel title="Earning plans" pad={false}>
          <Table label="Earning plans" head={['Customer', 'Plan', 'Per month', 'Received', 'Outstanding', 'Collected']} right={[2, 3, 4]} pageSize={10}
            rows={withPlan.map((l) => { const s = earnedSummary(l.earning!, TODAY); return [
              <button key="c" onClick={() => onOpen(l.id)} className="cursor-pointer font-semibold text-teal hover:underline">{l.company}</button>,
              `${l.earning!.cadence} ${ngn(l.earning!.amount)}`, <span key="m" className="num">{ngn(monthlyEquivalent(l.earning!))}</span>, <span key="r" className="num">{ngn(s.received)}</span>,
              <span key="o" className={`num ${s.outstanding > 0 ? 'text-red-700' : ''}`}>{ngn(s.outstanding)}</span>, <Badge key="b" tone={s.rate >= 95 ? 'green' : s.rate >= 75 ? 'amber' : 'red'}>{s.rate}%</Badge>] })} />
        </Panel>
      )}
    </div>
  )
}

function Group({ title, rows }: { title: string; rows: { k: string; n: number; won: number; value: number }[] }) {
  const max = Math.max(1, ...rows.map((x) => x.value))
  return (
    <Panel title={title}>
      <ul className="space-y-3">
        {rows.map((x) => (
          <li key={x.k}><div className="mb-1 flex items-baseline justify-between gap-2 text-sm"><span className="truncate font-semibold">{x.k}</span><span className="num shrink-0 text-xs text-slate">{x.n} lead{x.n === 1 ? '' : 's'} · {x.won} won · {ngnM(x.value)}</span></div><Bar value={x.value} max={max} /></li>
        ))}
      </ul>
    </Panel>
  )
}

function Insights({ leads, slug, onOpen }: { leads: Lead[]; slug: string; onOpen: (id: string) => void }) {
  const att = useAttainment(slug, leads, TODAY)
  const st = pipelineStats(leads)
  if (leads.length === 0) return <EmptyState title="Nothing to analyse yet" body="Insights appear once there are leads in the pipeline." />
  const reached = (i: number) => leads.filter((l) => STAGES.indexOf(l.stage) >= i && l.stage !== 'Lost' || (l.stage === 'Lost' && i === 0) || (l.stage === 'Lost' && l.activity.some((a) => a.text.includes(STAGES[i])))).length
  const funnel = [0, 1, 2, 3].map((i) => ({ s: STAGES[i], n: i === 3 ? st.won.length : reached(i) }))
  const cycle = st.won.length ? Math.round(st.won.reduce((a, l) => a + daysBetween(l.created, l.updated), 0) / st.won.length) : 0
  const group = (key: (l: Lead) => string) => {
    const m = new Map<string, { k: string; n: number; won: number; value: number }>()
    leads.forEach((l) => { const k = key(l) || 'Unspecified'; const g = m.get(k) ?? { k, n: 0, won: 0, value: 0 }; g.n++; if (l.stage === 'Won') g.won++; g.value += l.value; m.set(k, g) })
    return [...m.values()].sort((a, b) => b.value - a.value)
  }
  const bySource = group((l) => l.source), byIndustry = group((l) => l.industry)
  const ownerRows = group((l) => l.owner).map((o) => { const mine = leads.filter((l) => l.owner === o.k); const closed = mine.filter((l) => l.stage === 'Won' || l.stage === 'Lost').length; return { ...o, open: mine.filter((l) => OPEN_STAGES.includes(l.stage)).length, rate: pct(o.won, closed), wonValue: mine.filter((l) => l.stage === 'Won').reduce((a, l) => a + l.value, 0) } })
  const forecast = Array.from({ length: 4 }, (_, i) => {
    const m = addMonths(TODAY.slice(0, 8) + '01', i), end = addMonths(m, 1)
    const inM = st.open.filter((l) => l.expectedClose >= (i === 0 ? '0000' : m) && l.expectedClose < end)
    return { label: new Date(m + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }), n: inM.length, total: inM.reduce((a, l) => a + l.value, 0), weighted: inM.reduce((a, l) => a + weighted(l), 0) }
  })
  const fMax = Math.max(1, ...forecast.map((f) => f.total))
  const stale = st.open.filter((l) => daysBetween(l.updated, TODAY) >= 14 || nextState(l) === 'overdue').sort((a, b) => a.updated.localeCompare(b.updated))
  const reasons = new Map<string, number>(); st.lost.forEach((l) => reasons.set(l.lostReason ?? 'Not recorded', (reasons.get(l.lostReason ?? 'Not recorded') ?? 0) + 1))
  const top = [...st.open].sort((a, b) => weighted(b) - weighted(a)).slice(0, 4)
  const largest = Math.max(1, ...funnel.map((f) => f.n))
  const read = [
    top[0] && `${top[0].company} is the largest weighted deal at ${ngn(weighted(top[0]))}.`,
    stale.length ? `${stale.length} open ${stale.length === 1 ? 'lead needs' : 'leads need'} attention: no activity for two weeks or an overdue next action.` : 'Every open lead has recent activity.',
    bySource[0] && `${bySource[0].k} brings in the most pipeline value (${ngnM(bySource[0].value)}).`,
    st.lost.length ? `Win rate is ${st.winRate}%${[...reasons.entries()].sort((a, b) => b[1] - a[1])[0] ? `; the most common loss reason is "${[...reasons.entries()].sort((a, b) => b[1] - a[1])[0][0]}"` : ''}.` : null,
  ].filter(Boolean) as string[]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Average deal size" value={st.avgDeal ? ngnM(st.avgDeal) : 'None yet'} sub="Won deals" />
        <Stat label="Average sales cycle" value={cycle ? `${cycle} days` : 'None yet'} sub="Created to won" />
        <Stat label="Stalled leads" value={String(stale.length)} sub="14+ days idle or overdue" />
        <Stat label="Lead to win" value={`${pct(st.won.length, leads.length)}%`} sub={`${st.won.length} of ${leads.length} leads`} />
      </div>
      <Panel title="What stands out">
        <ul className="space-y-2 text-sm">{read.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal" />{x}</li>)}</ul>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Conversion funnel">
          <ul className="space-y-3">
            {funnel.map((f, i) => (
              <li key={f.s}><div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{f.s === 'Won' ? 'Won' : `Reached ${f.s}`}</span><span className="num text-xs text-slate">{f.n}{i > 0 && funnel[i - 1].n ? ` · ${pct(f.n, funnel[i - 1].n)}% of previous` : ''}</span></div><Bar value={f.n} max={largest} color={i === 3 ? 'bg-ok' : 'bg-teal'} /></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Forecast by expected close">
          <ul className="space-y-3">
            {forecast.map((f) => (
              <li key={f.label}><div className="mb-1 flex justify-between gap-2 text-sm"><span className="font-semibold">{f.label}</span><span className="num text-xs text-slate">{f.n} deal{f.n === 1 ? '' : 's'} · {ngnM(f.total)} · {ngnM(f.weighted)} weighted</span></div><div className="relative"><Bar value={f.total} max={fMax} color="bg-teal/30" /><div className="absolute inset-y-0 left-0"><div className="h-2 rounded-full bg-teal" style={{ width: `${f.total ? (f.weighted / fMax) * 100 : 0}%`, minWidth: f.weighted ? 6 : 0 }} /></div></div></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate">Overdue close dates are counted in the current month.</p>
        </Panel>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Group title="By lead source" rows={bySource} />
        <Group title="By industry" rows={byIndustry} />
      </div>
      <Panel title="Sales target attainment, this month">
        <ul className="grid gap-4 sm:grid-cols-2">{ownerRows.map((o) => <li key={o.k}><div className="mb-1 text-sm font-semibold">{o.k}</div><AttainmentBar {...att(o.k)} /></li>)}</ul>
        <p className="mt-3 text-xs text-slate">Won deal value with an expected close in the current month, against the owner's quota.</p>
      </Panel>
      <Panel title="Team performance" pad={false}>
        <Table label="Team pipeline performance" head={['Owner', 'Open leads', 'Won value', 'Win rate', 'Monthly target']} right={[1, 2, 3]} rows={ownerRows.map((o) => [<span key="o" className="flex items-center gap-2"><Avatar name={o.k} size={22} />{o.k}</span>, o.open, <span key="w" className="num">{ngn(o.wonValue)}</span>, `${o.rate}%`, <AttainmentBar key="t" {...att(o.k)} />])} />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Needs attention" pad={false}>
          {stale.length === 0 ? <p className="p-4 text-sm text-slate">Nothing is stalled.</p> : (
            <ul className="divide-y divide-line">{stale.slice(0, 6).map((l) => <li key={l.id}><button onClick={() => onOpen(l.id)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-ink/[0.03]"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{l.company}</div><div className="truncate text-xs text-slate">{l.owner} · {l.stage} · last touched {daysBetween(l.updated, TODAY)} days ago</div></div><span className="num text-sm">{ngnM(l.value)}</span></button></li>)}</ul>
          )}
        </Panel>
        <Panel title="Why deals are lost">
          {reasons.size === 0 ? <p className="text-sm text-slate">No lost deals recorded.</p> : (
            <ul className="space-y-3">{[...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => <li key={k}><div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{k}</span><span className="num text-xs text-slate">{n}</span></div><Bar value={n} max={st.lost.length} color="bg-err" /></li>)}</ul>
          )}
        </Panel>
      </div>
      <p className="text-xs text-slate" style={{ color: CHART.axis }}>Figures are simulated demo data.</p>
    </div>
  )
}
