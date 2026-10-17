import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Btn, ExportButton, Field, Overlay, PageHeader, Panel, Stat, Table, Tabs, inputCls, useToast } from '../../components/ui'
import { demoAccountsFor, useAudit, useTenants } from '../../tenant/store'
import { declineReset, resetPassword, setIssued, useIssued, useResets } from '../../tenant/passwords'
import { COMPANY_CONTROLLED_AREAS, PLATFORM_AREAS, approveChange, recommendChange, rejectChange, submitChange, useChanges } from '../../platform/changes'
import type { Area, ChangeReq } from '../../platform/changes'
import { useVersions } from '../../platform/versions'
import { appliesTo, saveAnnouncement, stateOf, toggleAnnouncement, useAnnouncements } from '../../platform/announcements'
import type { Kind } from '../../platform/announcements'
import { setFlag, useFlags } from '../../platform/flags'
import { useAdmin } from './AdminLayout'
import CohortRetention from './CohortRetention'
import { useSchedule } from '../../billing/retryRules'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const whenT = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const nameOf = (actor: string) => actor.split(' (')[0]
const STATUS_TONE: Record<string, string> = { Requested: 'amber', Recommended: 'blue', Applied: 'green', Rejected: 'red' }

export function ChangeRequests() {
  const { can, actor } = useAdmin()
  const me = nameOf(actor)
  const toast = useToast()
  const tenants = useTenants()
  const changes = useChanges()
  const versions = useVersions()
  const [tab, setTab] = useState('Queue')
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [note, setNote] = useState('')
  const [form, setForm] = useState({ slug: 'etranzact', area: 'Company profile' as Area, summary: '' })
  const sel = changes.find((c) => c.id === open)
  const name = (slug: string) => tenants[slug]?.profile.name ?? slug
  const openCount = changes.filter((c) => c.status === 'Requested' || c.status === 'Recommended').length

  const act = (fn: () => string | null | void, ok: string) => { const e = fn(); if (e) toast(e); else { toast(ok); setNote('') } }
  const create = () => {
    if (!form.summary.trim()) { toast('Add a short summary of the change.'); return }
    const id = submitChange({ slug: form.slug, area: form.area, summary: form.summary.trim(), by: me, origin: 'Platform' })
    toast(`${id} raised`); setCreating(false); setForm({ ...form, summary: '' })
  }
  const rows = changes.map((c: ChangeReq) => [
    <button key="i" onClick={() => setOpen(c.id)} className="cursor-pointer text-left font-mono text-[12.5px] font-semibold text-teal hover:underline">{c.id}</button>,
    name(c.slug), c.area, <span key="s" className="block max-w-[320px] truncate" title={c.summary}>{c.summary}</span>, c.by, whenT(c.at), <Badge key="b" tone={STATUS_TONE[c.status]}>{c.status}</Badge>,
  ])

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Configuration" title="Platform change requests" desc="Platform staff may manage workspace lifecycle and platform-delivered configuration only. Approval flows and finance tiers remain under company authority."
        actions={can('changes') ? <Btn onClick={() => setCreating(true)}>New change</Btn> : undefined} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Open requests', String(openCount), 'Queue'], ['Awaiting second approver', String(changes.filter((c) => c.status === 'Recommended').length), 'Queue'], ['Applied', String(changes.filter((c) => c.status === 'Applied').length), 'Queue'], ['Boundary records', String(versions.length), 'Boundary log']].map(([l, v, t]) => (
          <Panel key={l} onClick={() => setTab(t)} className="cursor-pointer transition-colors hover:border-teal/50"><Stat label={l} value={v} /></Panel>
        ))}
      </div>
      <Tabs tabs={['Queue', 'Boundary log']} value={tab} onChange={setTab} />
      {tab === 'Queue' && <Table label="Change requests" head={['Request', 'Company', 'Area', 'Summary', 'Raised by', 'Date', 'Status']} rows={rows} />}
      {tab === 'Boundary log' && <Panel title="Company-controlled configuration"><p className="text-sm text-slate">Historical approval-flow and finance-tier changes remain visible for audit, but platform staff cannot recommend, approve, apply or roll them back.</p><div className="mt-3 flex flex-wrap gap-2">{COMPANY_CONTROLLED_AREAS.map((area) => <Badge key={area} tone="gray">{area}</Badge>)}</div><p className="mt-4 text-xs text-slate">{versions.length} historical company-controlled version record(s) retained.</p></Panel>}

      <Overlay open={!!sel} onClose={() => setOpen(null)} title={sel ? `${sel.id} · ${sel.area}` : ''} side>
        {sel && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[sel.status]}>{sel.status}</Badge><Link to={`/admin/businesses/${sel.slug}`} className="text-sm font-semibold text-teal hover:underline">{name(sel.slug)}</Link></div>
            <p className="text-sm">{sel.summary}</p>
            {sel.payload?.rules && <div className="rounded-lg bg-cloud p-3 text-[13px]"><div className="mb-1 font-semibold">Approval rules after this change</div>{sel.payload.rules.length === 0 ? 'Standard flow only.' : sel.payload.rules.map((r) => <div key={r.id}>{r.type} {r.minAmount ? `≥ ₦${r.minAmount.toLocaleString()}` : ''}: {r.steps.join(' + ')}</div>)}</div>}
            {sel.payload?.finance && <div className="rounded-lg bg-cloud p-3 text-[13px]"><div className="mb-1 font-semibold">Finance tiers after this change</div>{sel.payload.finance.mode === 'default' ? 'BizFlow default' : `Finance Officer up to ₦${sel.payload.finance.officerLimit.toLocaleString()}, CFO above`}</div>}
            <ol className="space-y-2 border-l border-line pl-4">
              {sel.log.map((l, i) => <li key={i} className="text-[13px]"><div className="font-semibold">{l.by}</div><div className="text-slate">{l.text}</div><div className="font-mono text-[11px] text-slate">{whenT(l.at)}</div></li>)}
            </ol>
            {(sel.status === 'Requested' || sel.status === 'Recommended') && (
              <div className="space-y-3 border-t border-line pt-4">
                <Field label="Note"><textarea className={`${inputCls} h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this should or should not go ahead" /></Field>
                <div className="flex flex-wrap gap-2">
                  {sel.status === 'Requested' && can('changes') && !COMPANY_CONTROLLED_AREAS.includes(sel.area) && <Btn onClick={() => act(() => recommendChange(sel.id, me, note), 'Recommended. Waiting for a second admin.')}>Recommend</Btn>}
                  {sel.status === 'Recommended' && can('approve') && !COMPANY_CONTROLLED_AREAS.includes(sel.area) && <Btn onClick={() => act(() => approveChange(sel.id, me), 'Approved and applied')} disabled={sel.recommendedBy === me}>Approve and apply</Btn>}
                  {can('approve') && <Btn v="secondary" onClick={() => note.trim() ? act(() => rejectChange(sel.id, me, note.trim()), 'Rejected') : toast('Add a note to reject.')}>Reject</Btn>}
                </div>
                {sel.status === 'Recommended' && sel.recommendedBy === me && <p className="text-xs text-slate">You recommended this change, so a different admin must approve it.</p>}
                {sel.status === 'Requested' && !can('changes') && <p className="text-xs text-slate">Your role can view this request but not act on it.</p>}
              </div>
            )}
          </div>
        )}
      </Overlay>

      <Overlay open={creating} onClose={() => setCreating(false)} title="New change request" side>
        <div className="space-y-4">
          <Field label="Company"><select className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}>{Object.values(tenants).map((t) => <option key={t.slug} value={t.slug}>{t.profile.name}</option>)}</select></Field>
          <Field label="Area"><select className={inputCls} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value as Area })}>{PLATFORM_AREAS.map((a) => <option key={a}>{a}</option>)}</select></Field>
          <Field label="Summary"><textarea className={`${inputCls} h-24 py-2`} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="What should change, and who asked for it" /></Field>
          <Btn onClick={create}>Raise request</Btn>
        </div>
      </Overlay>
    </div>
  )
}

export function Announcements() {
  const { can, actor } = useAdmin()
  const toast = useToast()
  const tenants = useTenants()
  const list = useAnnouncements()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('Current')
  const [detail, setDetail] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const blank = { title: '', body: '', kind: 'Info' as Kind, plans: [] as string[], slugs: [] as string[], start: new Date().toISOString().slice(0, 16), end: new Date(Date.now() + 864e5).toISOString().slice(0, 16) }
  const [f, setF] = useState(blank)
  const all = Object.values(tenants)
  const reach = (a: { plans: string[]; slugs: string[] }) => all.filter((t) => appliesTo({ ...a, id: '', title: '', body: '', kind: 'Info', start: '', end: '', active: true, by: '' }, t))
  const audience = (a: { plans: string[]; slugs: string[] }) => a.slugs.length ? (a.slugs.length <= 2 ? a.slugs.map((s) => tenants[s]?.profile.name ?? s).join(', ') : `${a.slugs.length} companies`) : a.plans.length ? `${a.plans.join(', ')} plans` : 'All companies'
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const save = () => {
    if (!f.title.trim() || !f.body.trim()) { toast('Add a title and message.'); return }
    if (f.end <= f.start) { toast('The end time must be after the start.'); return }
    if (reach(f).length === 0) { toast('No company matches this audience.'); return }
    saveAnnouncement({ ...f, active: true, by: nameOf(actor) }); toast(`Announcement published to ${reach(f).length} companies`); setOpen(false); setF(blank)
  }
  const tone = (k: Kind) => (k === 'Incident' ? 'red' : k === 'Maintenance' ? 'amber' : 'blue')
  const sTone: Record<string, string> = { Live: 'green', Scheduled: 'blue', Ended: 'gray', Off: 'gray' }
  const current = list.filter((a) => ['Live', 'Scheduled'].includes(stateOf(a)))
  const history = list.filter((a) => `${a.title} ${a.body} ${a.by}`.toLowerCase().includes(q.toLowerCase()))
  const rows = (items: typeof list) => items.map((a) => [
    <button key="t" onClick={() => setDetail(a.id)} className="cursor-pointer text-left"><div className="font-semibold hover:text-teal">{a.title}</div><div className="max-w-md truncate text-xs text-slate">{a.body}</div></button>,
    <Badge key="k" tone={tone(a.kind)}>{a.kind}</Badge>, audience(a), `${whenT(a.start)} to ${whenT(a.end)}`, <Badge key="s" tone={sTone[stateOf(a)]}>{stateOf(a)}</Badge>,
  ])
  const sel = list.find((a) => a.id === detail)
  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Support" title="Announcements" desc="Banners shown at the top of company workspaces. Target by plan, by any set of companies, and set a start and end time." actions={can('support') ? <Btn onClick={() => setOpen(true)}>New announcement</Btn> : undefined} />
      <Tabs tabs={['Current', 'History']} value={tab} onChange={setTab} />
      {tab === 'Current' && (current.length ? <Table label="Current announcements" head={['Title', 'Type', 'Audience', 'Window', 'State']} rows={rows(current)} /> : <Panel><p className="text-sm text-slate">Nothing is live or scheduled. Past announcements are in History.</p></Panel>)}
      {tab === 'History' && (
        <div className="space-y-3">
          <input aria-label="Search announcements" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, message or author" className={`${inputCls} sm:max-w-xs`} />
          <Table label="Announcement history" head={['Title', 'Type', 'Audience', 'Window', 'State']} rows={rows(history)} />
        </div>
      )}
      <Overlay open={!!sel} onClose={() => setDetail(null)} title={sel?.title ?? ''} side>
        {sel && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2"><Badge tone={tone(sel.kind)}>{sel.kind}</Badge><Badge tone={sTone[stateOf(sel)]}>{stateOf(sel)}</Badge></div>
            <p>{sel.body}</p>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-cloud p-3 text-[13px]">
              <div><dt className="text-xs text-slate">Published by</dt><dd className="font-semibold">{sel.by}</dd></div>
              <div><dt className="text-xs text-slate">Reach</dt><dd className="font-semibold">{reach(sel).length} of {all.length} companies</dd></div>
              <div><dt className="text-xs text-slate">Starts</dt><dd>{whenT(sel.start)}</dd></div>
              <div><dt className="text-xs text-slate">Ends</dt><dd>{whenT(sel.end)}</dd></div>
            </dl>
            <div><div className="mb-1.5 text-xs font-semibold text-slate">Companies that see it</div><ul className="flex flex-wrap gap-1.5">{reach(sel).map((t) => <li key={t.slug} className="rounded bg-ink/5 px-2 py-1 text-xs">{t.profile.name}</li>)}</ul></div>
            {can('support') && <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Btn v="secondary" onClick={() => toggleAnnouncement(sel.id)}>{sel.active ? 'Turn off' : 'Turn on'}</Btn>
              <Btn v="secondary" onClick={() => { setF({ ...blank, title: sel.title, body: sel.body, kind: sel.kind, plans: sel.plans, slugs: sel.slugs }); setDetail(null); setOpen(true) }}>Reuse as new</Btn>
            </div>}
          </div>
        )}
      </Overlay>
      <Overlay open={open} onClose={() => setOpen(false)} title="New announcement" side>
        <div className="space-y-4">
          <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Message"><textarea className={`${inputCls} h-24 py-2`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <Field label="Type"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}><option>Info</option><option>Maintenance</option><option>Incident</option></select></Field>
          <Field label="Plans" hint="Leave all unticked for every plan.">
            <div className="flex flex-wrap gap-3 pt-1">{['Starter', 'Professional', 'Enterprise'].map((p) => <label key={p} className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={f.plans.includes(p)} onChange={() => setF({ ...f, plans: toggle(f.plans, p) })} />{p}</label>)}</div>
          </Field>
          <Field label="Companies" hint={f.slugs.length ? `${f.slugs.length} selected. Plans above are combined with this choice.` : 'Leave all unticked to include every company.'}>
            <div className="max-h-52 overflow-y-auto rounded-md border border-line">
              {all.map((t) => <label key={t.slug} className="flex min-h-[44px] items-center gap-2.5 border-b border-line/70 px-3 text-sm last:border-0"><input type="checkbox" checked={f.slugs.includes(t.slug)} onChange={() => setF({ ...f, slugs: toggle(f.slugs, t.slug) })} /><span className="min-w-0 flex-1 truncate">{t.profile.name}</span><span className="text-xs text-slate">{t.plan}</span></label>)}
            </div>
            <div className="mt-1.5 flex gap-3 text-xs font-semibold text-teal"><button type="button" className="cursor-pointer" onClick={() => setF({ ...f, slugs: all.map((t) => t.slug) })}>Select all</button><button type="button" className="cursor-pointer" onClick={() => setF({ ...f, slugs: [] })}>Clear</button></div>
          </Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Starts"><input type="datetime-local" className={inputCls} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field><Field label="Ends"><input type="datetime-local" className={inputCls} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field></div>
          <p className="rounded-md bg-softmint p-2.5 text-xs">Will reach <b>{reach(f).length}</b> of {all.length} companies.</p>
          <Btn onClick={save}>Publish</Btn>
        </div>
      </Overlay>
    </div>
  )
}

const SERVICES: [string, string, string, string][] = [
  ['Web application', '99.98%', 'Operational', '212 ms'], ['API', '99.97%', 'Operational', '148 ms'], ['Payments gateway', '99.91%', 'Degraded', '640 ms'],
  ['Email and SMS delivery', '99.95%', 'Operational', '1.1 s'], ['File storage', '100%', 'Operational', '96 ms'],
]
const ERRORS: [string, string, number, string, string][] = [
  ['Payments gateway timeout on settlement callback', 'Finance', 38, '12 min ago', 'Investigating'],
  ['Failed to render payslip PDF for large departments', 'Payroll', 14, '2 h ago', 'Fix in review'],
  ['Geolocation permission denied during clock-in', 'Attendance', 61, '25 min ago', 'Expected'],
  ['Session token refresh failed on Safari 16', 'Auth', 9, '1 d ago', 'Resolved'],
]
const JOBS: [string, string, string, string, string][] = [
  ['Nightly payroll accruals', '02:00', '4m 12s', '03:00 tomorrow', 'Completed'],
  ['Invoice and dunning run', '06:00', '1m 40s', '06:00 tomorrow', 'Completed'],
  ['Attendance rollup', '23:30', '7m 03s', '23:30 today', 'Completed'],
  ['Backup and snapshot', '01:00', '18m 22s', '01:00 tomorrow', 'Completed'],
  ['Compliance expiry reminders', '07:00', '2m 55s', '07:00 tomorrow', 'Failed'],
]
export function Reliability() {
  const { can } = useAdmin()
  const flags = useFlags()
  const toast = useToast()
  const [tab, setTab] = useState('Status')
  const strip = useMemo(() => Array.from({ length: 90 }, (_, i) => (i === 14 || i === 51 ? 'bg-warn' : i === 70 ? 'bg-err' : 'bg-ok')), [])
  const tone = (s: string) => (['Operational', 'Completed', 'Resolved', 'Expected'].includes(s) ? 'green' : ['Failed'].includes(s) ? 'red' : 'amber')
  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="System" title="Reliability" desc="Uptime, errors, background jobs and feature flags in one place." actions={<ExportButton name="reliability-report" head={['Service', 'Uptime 90d', 'Status']} rows={SERVICES.map((s) => [s[0], s[1], s[2]])} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Uptime, 90 days', '99.96%', 'Status'], ['Open errors', String(ERRORS.filter((e) => e[4] !== 'Resolved' && e[4] !== 'Expected').length), 'Errors'], ['Failed jobs, 24 h', String(JOBS.filter((j) => j[4] === 'Failed').length), 'Background jobs'], ['Flags enabled', `${flags.filter((f) => f.enabled).length} of ${flags.length}`, 'Feature flags']].map(([l, v, t]) => (
          <Panel key={l} onClick={() => setTab(t)} className="cursor-pointer transition-colors hover:border-teal/50"><Stat label={l} value={v} /></Panel>
        ))}
      </div>
      <Tabs tabs={['Status', 'Errors', 'Background jobs', 'Feature flags']} value={tab} onChange={setTab} />
      {tab === 'Status' && (
        <div className="space-y-4">
          <Panel title="Last 90 days"><div className="flex h-8 gap-px" role="img" aria-label="Daily uptime for the last 90 days. 2 degraded days and 1 outage."> {strip.map((c, i) => <span key={i} className={`flex-1 rounded-sm ${c}`} />)}</div><div className="mt-2 flex justify-between text-xs text-slate"><span>90 days ago</span><span>Today</span></div></Panel>
          <Table label="Services" head={['Service', 'Uptime, 90 days', 'Median response', 'Status']} rows={SERVICES.map((s) => [s[0], s[1], s[3], <Badge key="b" tone={tone(s[2])}>{s[2]}</Badge>])} />
        </div>
      )}
      {tab === 'Errors' && <Table label="Errors" head={['Error', 'Area', 'Events, 24 h', 'Last seen', 'State']} right={[2]} rows={ERRORS.map((e) => [e[0], e[1], String(e[2]), e[3], <Badge key="b" tone={tone(e[4])}>{e[4]}</Badge>])} />}
      {tab === 'Background jobs' && <Table label="Background jobs" head={['Job', 'Last run', 'Duration', 'Next run', 'Result']} rows={JOBS.map((j) => [j[0], j[1], j[2], j[3], <Badge key="b" tone={tone(j[4])}>{j[4]}</Badge>])} />}
      {tab === 'Feature flags' && (
        <div className="space-y-3">
          {flags.map((f) => (
            <Panel key={f.key}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1"><div className="font-semibold">{f.name}</div><div className="text-[13px] text-slate">{f.desc}</div><div className="mt-1 font-mono text-[11px] text-slate">{f.key} · owner: {f.owner}</div></div>
                <label className="flex min-h-[44px] items-center gap-2 text-sm"><span className="text-slate">Rollout</span>
                  <select disabled={!can('settings')} className={`${inputCls} !w-24`} value={f.rollout} onChange={(e) => { setFlag(f.key, { rollout: Number(e.target.value) }); toast(`${f.name}: ${e.target.value}% rollout`) }}>{[0, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}%</option>)}</select>
                </label>
                <button role="switch" aria-checked={f.enabled} aria-label={`${f.name} on or off`} disabled={!can('settings')} onClick={() => { setFlag(f.key, { enabled: !f.enabled }); toast(`${f.name} ${f.enabled ? 'turned off' : 'turned on'}`) }} className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${f.enabled ? 'bg-teal' : 'bg-ink/20'}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${f.enabled ? 'left-[22px]' : 'left-0.5'}`} /></button>
              </div>
            </Panel>
          ))}
          {!can('settings') && <p className="text-xs text-slate">Only the superadmin can change flags.</p>}
        </div>
      )}
    </div>
  )
}

type DunStep = { id: string; when: string; action: string; channel: string; on: boolean }
const DUN: DunStep[] = [
  { id: 'd1', when: '7 days before renewal', action: 'Send renewal reminder', channel: 'Email', on: true },
  { id: 'd2', when: 'Renewal day', action: 'Send invoice and payment link', channel: 'Email and in-app', on: true },
  { id: 'd3', when: '3 days overdue', action: 'Retry the saved card', channel: 'Automatic', on: true },
  { id: 'd4', when: '7 days overdue', action: 'Start grace period and show a banner', channel: 'In-app', on: true },
  { id: 'd5', when: '14 days overdue', action: 'Suspend the workspace', channel: 'Automatic', on: false },
]
const DISC = [
  { id: 'DSC-22', company: 'eTranzact International Plc', pct: 30, reason: 'Competitive renewal against a local vendor', by: 'Dayo Martins' },
]
export function Collections() {
  const { can, actor, role } = useAdmin()
  const me = nameOf(actor)
  const toast = useToast()
  const tenants = useTenants()
  const retrySchedule = useSchedule()
  const [tab, setTab] = useState('Dunning')
  const [steps, setSteps] = useState<DunStep[]>(() => { try { return JSON.parse(localStorage.getItem('bizflow.collections-steps.v1') || 'null') ?? DUN } catch { return DUN } })
  const [disc, setDisc] = useState<Record<string, string>>({})
  const planMix = useMemo(() => { const m: Record<string, number> = {}; Object.values(tenants).forEach((t) => { m[t.plan] = (m[t.plan] ?? 0) + 1 }); return Object.entries(m) }, [tenants])
  const saveSteps = (n: DunStep[]) => { setSteps(n); localStorage.setItem('bizflow.collections-steps.v1', JSON.stringify(n)); toast('Dunning schedule saved') }
  const decide = (d: (typeof DISC)[number], ok: boolean) => {
    if (d.by === me) { toast('You raised this request. A different admin must decide.'); return }
    if (ok && d.pct > 20 && role !== 'super') { toast('Discounts above 20% need the superadmin.'); return }
    setDisc({ ...disc, [d.id]: ok ? 'Approved' : 'Declined' }); toast(`${d.id} ${ok ? 'approved' : 'declined'}`)
  }
  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Finance" title="Collections and reports" desc="How overdue payments are chased, who approves discounts, and how revenue is holding up." />
      <Tabs tabs={['Dunning', 'Discount approvals', 'Reports']} value={tab} onChange={setTab} />
      {tab === 'Dunning' && (
        <div className="rounded-xl border border-line bg-softmint/40 p-4 text-sm" role="note"><b>Automatic retries.</b> The platform reminder timeline follows the retry rules: {retrySchedule.map((x) => `${x.step} on day ${x.day}`).join(', ')}. <Link to="/admin/billing/recovery" className="font-semibold text-teal">Edit payment recovery rules</Link></div>
      )}
      {tab === 'Dunning' && (
        <Panel title="Payment reminder schedule" action={<span className="text-xs text-slate">Applies to every company</span>}>
          <ul className="divide-y divide-line">
            {steps.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{s.action}</div><div className="text-xs text-slate">{s.when} · {s.channel}</div></div>
                <button role="switch" aria-checked={s.on} aria-label={`${s.action} on or off`} disabled={!can('payments')} onClick={() => saveSteps(steps.map((x) => (x.id === s.id ? { ...x, on: !x.on } : x)))} className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${s.on ? 'bg-teal' : 'bg-ink/20'}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${s.on ? 'left-[22px]' : 'left-0.5'}`} /></button>
              </li>
            ))}
          </ul>
          {!can('payments') && <p className="mt-3 text-xs text-slate">Only Finance and the superadmin can change this schedule.</p>}
        </Panel>
      )}
      {tab === 'Discount approvals' && (
        <div className="space-y-3">
          <p className="text-[13px] text-slate">The person who raised a discount cannot approve it. Discounts above 20% need the superadmin.</p>
          {DISC.map((d) => (
            <Panel key={d.id}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1"><div className="font-semibold">{d.company} · {d.pct}% off</div><div className="text-[13px] text-slate">{d.reason}. Raised by {d.by}.</div></div>
                {disc[d.id] ? <Badge tone={disc[d.id] === 'Approved' ? 'green' : 'red'}>{disc[d.id]}</Badge> : can('discounts') ? <div className="flex gap-2"><Btn s="sm" onClick={() => decide(d, true)}>Approve</Btn><Btn s="sm" v="secondary" onClick={() => decide(d, false)}>Decline</Btn></div> : <Badge>Pending</Badge>}
              </div>
            </Panel>
          ))}
        </div>
      )}
      {tab === 'Reports' && (
        <div className="space-y-4">
          <CohortRetention />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Plan mix">
              <ul className="space-y-3">{planMix.map(([p, n]) => <li key={p}><div className="mb-1 flex justify-between text-[13px]"><span>{p}</span><span className="num font-semibold">{n} companies</span></div><div className="h-2 rounded-full bg-ink/5"><div className="h-2 rounded-full bg-teal" style={{ width: `${(n / Object.keys(tenants).length) * 100}%` }} /></div></li>)}</ul>
            </Panel>
            <Panel title="Add-on attrition, last 90 days">
              <Table label="Add-on attrition" pageSize={5} head={['Add-on', 'Active', 'Cancelled', 'Rate']} right={[1, 2, 3]} rows={[['Attendance', '18', '1', '5%'], ['Fleet management', '9', '2', '18%'], ['Vendor compliance', '12', '1', '8%'], ['Extra storage', '6', '3', '33%']]} />
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}

export function AuditAnomalies() {
  const audit = useAudit()
  const flagged = useMemo(() => {
    const out: { who: string; why: string; n: number }[] = []
    const by: Record<string, number> = {}
    audit.forEach((a) => { if (a.scope === 'Platform' && Date.now() - new Date(a.at).getTime() < 864e5) by[a.actor] = (by[a.actor] ?? 0) + 1 })
    Object.entries(by).filter(([, n]) => n >= 8).forEach(([who, n]) => out.push({ who, n, why: `${n} platform actions in 24 hours` }))
    audit.filter((a) => /support session started/i.test(a.action)).slice(0, 2).forEach((a) => out.push({ who: a.actor, n: 1, why: `Opened a support session on ${a.tenant}` }))
    return out
  }, [audit])
  if (flagged.length === 0) return null
  return (
    <Panel title="Anomaly alerts" action={<Badge tone="amber">{flagged.length} to review</Badge>}>
      <ul className="divide-y divide-line">{flagged.map((f, i) => <li key={i} className="py-2.5 text-[13px]"><b>{f.who}</b> <span className="text-slate">{f.why}</span></li>)}</ul>
    </Panel>
  )
}

export function ResetButton({ slug, email, name, label = 'Reset password', v = 'secondary' }: { slug: string; email: string; name: string; label?: string; v?: 'primary' | 'secondary' }) {
  const { can, actor } = useAdmin()
  const [open, setOpen] = useState(false)
  if (!can('support')) return null
  return (
    <>
      <Btn s="sm" v={v} onClick={() => setOpen(true)} aria-label={`${label} for ${name}`}>{label}</Btn>
      <Overlay open={open} onClose={() => setOpen(false)} title={`Reset password: ${name}`}>
        <div className="space-y-4 text-sm">
          <p className="text-slate">This replaces the password for <b className="text-ink">{email}</b> with a one-time temporary password. The user must choose a new one at next sign-in. The reset is written to the audit log.</p>
          <p className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-900">Confirm the person's identity with the company administrator before you share the temporary password.</p>
          <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={() => { const temp = resetPassword(slug, email, name, nameOf(actor)); setOpen(false); setIssued({ name, email, temp }) }}>Reset password</Btn></div>
        </div>
      </Overlay>
    </>
  )
}

export function IssuedDialog() {
  const issued = useIssued()
  const toast = useToast()
  return (
    <Overlay open={!!issued} onClose={() => setIssued(null)} title={`Temporary password: ${issued?.name ?? ''}`}>
      <div className="space-y-4 text-sm">
        <p>Share this with <b>{issued?.email}</b> through the company administrator. It is shown once and must be changed at first sign-in.</p>
        <code className="block select-all break-all rounded-md bg-cloud p-3 font-mono text-base font-semibold">{issued?.temp}</code>
        <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => { navigator.clipboard?.writeText(issued?.temp ?? ''); toast('Copied') }}>Copy</Btn><Btn onClick={() => setIssued(null)}>Done</Btn></div>
      </div>
    </Overlay>
  )
}

export function PasswordResets() {
  const reqs = useResets()
  const tenants = useTenants()
  const { can, actor } = useAdmin()
  const toast = useToast()
  const [tab, setTab] = useState('Open')
  const [q, setQ] = useState('')
  const list = reqs.filter((r) => (tab === 'Open' ? r.status === 'Requested' : r.status !== 'Requested'))
  const people = useMemo(() => Object.values(tenants).flatMap((t) => demoAccountsFor(t).map((a) => ({ t, a }))).filter(({ t, a }) => q.length > 1 && `${a.name} ${a.email} ${t.profile.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6), [tenants, q])
  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Support" title="Password resets" desc="Company users who forgot their password ask here. Reset it, share the temporary password through the company administrator, and the user sets a new one at sign-in." />
      <Panel title="Reset for someone who has not asked">
        <input aria-label="Find a user" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or company" className={`${inputCls} sm:max-w-sm`} />
        {people.length > 0 && <ul className="mt-3 divide-y divide-line">{people.map(({ t, a }) => <li key={t.slug + a.email} className="flex flex-wrap items-center gap-3 py-2.5"><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{a.name}</div><div className="truncate text-xs text-slate">{a.email} · {t.profile.name}</div></div><ResetButton slug={t.slug} email={a.email} name={a.name} /></li>)}</ul>}
      </Panel>
      <Tabs tabs={['Open', 'Handled']} value={tab} onChange={setTab} />
      {list.length === 0 ? <Panel><p className="text-sm text-slate">{tab === 'Open' ? 'No one is waiting for a reset.' : 'No handled requests yet.'}</p></Panel> : (
        <Table label="Password reset requests" head={['Request', 'User', 'Company', 'Asked', 'Status', '']} rows={list.map((r) => [
          <span key="i" className="font-mono text-xs font-semibold text-teal">{r.id}</span>,
          <div key="u"><div className="font-semibold">{r.name}</div><div className="text-xs text-slate">{r.email}</div></div>,
          tenants[r.slug]?.profile.name ?? r.slug, whenT(r.at),
          <Badge key="s" tone={r.status === 'Reset' ? 'green' : r.status === 'Declined' ? 'red' : 'amber'}>{r.status === 'Reset' ? `Reset by ${r.by}` : r.status}</Badge>,
          r.status === 'Requested' && can('support') ? <div key="a" className="flex gap-2"><ResetButton slug={r.slug} email={r.email} name={r.name} v="primary" /><Btn s="sm" v="secondary" onClick={() => { declineReset(r.id, nameOf(actor), 'Could not verify the requester'); toast('Request declined') }}>Decline</Btn></div> : '',
        ])} />
      )}
    </div>
  )
}
