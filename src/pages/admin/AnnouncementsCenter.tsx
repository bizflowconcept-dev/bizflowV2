import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Btn, EmptyState, ExportButton, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, useToast } from '../../components/ui'
import { MODULE_LIST, TIERS, useAudit, useTenants } from '../../tenant/store'
import type { Tenant } from '../../tenant/store'
import { cancelCampaign, deleteDraft, mergeCompany, processDue, resendCampaign, saveCampaign, sendCampaign, statsOf, useAnnouncements } from '../../platform/announcements'
import type { Announcement, Campaign, Kind } from '../../platform/announcements'
import { HEALTH_LABELS, SIZE_BANDS, describeAudience, emptyAudience, isEmptyAudience, matchesAudience, registerDirectory } from '../../platform/audience'
import type { Audience } from '../../platform/audience'
import { fmtAt } from '../../platform/persist'
import { healthOf } from '../../platform/health'
import { useAdmin } from './AdminLayout'

type Camp = Announcement & { campaign: Campaign }
const STATUS_TONE: Record<string, string> = { Draft: 'gray', Scheduled: 'blue', Sent: 'green', Cancelled: 'red' }
const KIND_TONE = (k: Kind) => (k === 'Incident' ? 'bg-red-50 text-red-700' : k === 'Maintenance' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700')
const toLocalInput = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) }
const inFuture = (mins: number) => toLocalInput(new Date(Date.now() + mins * 6e4).toISOString())
const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
const CHART_COLORS = { read: '#087e8b', delivered: '#60777d', clicked: '#f59e0b' }

type Form = { id?: string; title: string; body: string; kind: Kind; audience: Audience; when: 'now' | 'schedule'; sendAt: string; ctaLabel: string; ctaUrl: string }
const blank = (): Form => ({ title: '', body: '', kind: 'Info', audience: emptyAudience(), when: 'now', sendAt: inFuture(60), ctaLabel: '', ctaUrl: '' })

function Chips({ label, options, value, onChange }: { label: string; options: { v: string; l: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-semibold">{label}{value.length > 0 && <span className="ml-2 font-normal text-slate">{value.length} selected</span>}</legend>
      {options.length === 0 ? <p className="text-xs text-slate">No options yet.</p> : (
        <div className="flex flex-wrap gap-1.5">{options.map((o) => (
          <button type="button" key={o.v} aria-pressed={value.includes(o.v)} onClick={() => onChange(toggle(value, o.v))} className={`min-h-8 cursor-pointer rounded-full border px-3 text-[13px] ${value.includes(o.v) ? 'border-teal bg-softmint font-semibold text-teal' : 'border-line bg-white text-ink hover:border-teal/50'}`}>{o.l}</button>
        ))}</div>
      )}
    </fieldset>
  )
}

/** Exactly how the pop-up and the inbox item look for one company. */
function PreviewCard({ title, body, kind, company, ctaLabel }: { title: string; body: string; kind: Kind; company: string; ctaLabel?: string }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 text-xs font-semibold text-slate">Pop-up</div>
        <div className="rounded-xl border border-line bg-white p-4 shadow-sm">
          <div className="font-display text-base font-semibold">{mergeCompany(title, company) || 'Your title'}</div>
          <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${KIND_TONE(kind)}`}>{kind === 'Info' ? 'Notice' : kind}</span>
          <p className="mt-2 text-sm leading-6">{mergeCompany(body, company) || 'Your message appears here.'}</p>
          <p className="mt-2 text-xs text-slate">From BizFlow</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">{ctaLabel && <span className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold">{ctaLabel}</span>}<span className="rounded-md bg-teal px-3 py-1.5 text-sm font-semibold text-white">Got it, continue</span></div>
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold text-slate">Inbox item</div>
        <div className="flex items-start gap-3 rounded-xl border border-line bg-white p-3">
          <span className="mt-2 size-2 shrink-0 rounded-full bg-teal" />
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{mergeCompany(title, company) || 'Your title'}</div><p className="text-[13px] text-slate">{mergeCompany(body, company) || 'Your message appears here.'}{ctaLabel ? ` (${ctaLabel})` : ''}</p><div className="mt-1"><Badge>System</Badge></div></div>
        </div>
      </div>
    </div>
  )
}

function DeliveryTable({ c, name }: { c: Campaign; name: (s: string) => string }) {
  const t = (iso?: string) => (iso ? fmtAt(iso) : '-')
  return c.deliveries.length ? (
    <Table label="Deliveries by company" pageSize={6} head={['Company', 'Delivered', 'Read', 'Clicked']} rows={c.deliveries.map((d) => [name(d.slug), t(d.deliveredAt), d.readAt ? t(d.readAt) : <Badge key="u" tone="amber">Unread</Badge>, c.ctaLabel ? t(d.clickedAt) : 'No link'])} />
  ) : <p className="text-sm text-slate">Nothing has been delivered yet.</p>
}

export default function AnnouncementsCenter() {
  const { can, actor } = useAdmin()
  const by = actor.split(' (')[0]
  const toast = useToast()
  const tenantMap = useTenants()
  const audit = useAudit()
  const all = useAnnouncements()
  const [tab, setTab] = useState('Compose')
  const [f, setF] = useState<Form>(blank)
  const [previewSlug, setPreviewSlug] = useState('')
  const [detail, setDetail] = useState<string | null>(null)
  const [drill, setDrill] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'send' | null>(null)
  const [q, setQ] = useState('')
  const [, setTick] = useState(0)
  const edit = can('support')

  const tenants = useMemo(() => Object.values(tenantMap), [tenantMap])
  useEffect(() => { registerDirectory({ tenants, audit }) }, [tenants, audit])
  // Scheduled campaigns send when due. Recipients are resolved at that moment.
  useEffect(() => { processDue(); const i = setInterval(() => { processDue(); setTick((n) => n + 1) }, 10000); return () => clearInterval(i) }, [])

  const nameOf = (slug: string) => tenantMap[slug]?.profile.name ?? slug
  const camps = all.filter((a): a is Camp => !!a.campaign)
  const bands = useMemo(() => Object.fromEntries(tenants.map((t) => [t.slug, healthOf(t, audit).label])), [tenants, audit])
  const matches = useMemo(() => tenants.filter((t) => matchesAudience(t, f.audience, audit, bands[t.slug])), [tenants, f.audience, audit, bands])
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()
  const states = uniq([...tenants.map((t) => t.profile.state), 'Lagos', 'Abuja (FCT)', 'Rivers', 'Kano', 'Oyo'])
  const industries = uniq([...tenants.map((t) => t.profile.industry), 'Retail', 'Healthcare', 'Education', 'Logistics'])
  const sizes = uniq([...SIZE_BANDS, ...tenants.map((t) => t.profile.size)])
  const setAud = (patch: Partial<Audience>) => setF((x) => ({ ...x, audience: { ...x.audience, ...patch } }))
  const [find, setFind] = useState('')
  const found = tenants.filter((t) => `${t.profile.name} ${t.slug}`.toLowerCase().includes(find.toLowerCase())).slice(0, 8)

  const pTenant: Tenant | undefined = tenantMap[previewSlug] ?? matches[0] ?? tenants[0]
  const company = pTenant?.profile.name ?? 'Your company'

  const validate = (needRecipients: boolean) => {
    if (!f.title.trim() || !f.body.trim()) { toast('Add a title and a message.'); return false }
    if (f.ctaLabel.trim() && !/^(https?:\/\/|\/)/.test(f.ctaUrl.trim())) { toast('The link must start with / or https://'); return false }
    if (needRecipients && matches.length === 0) { toast('No company matches this audience.'); return false }
    if (f.when === 'schedule' && (!f.sendAt || new Date(f.sendAt).getTime() <= Date.now())) { toast('Pick a send time in the future.'); return false }
    return true
  }
  const input = (sendAt?: string) => ({ id: f.id, title: f.title.trim(), body: f.body.trim(), kind: f.kind, audience: f.audience, sendAt, ctaLabel: f.ctaLabel.trim(), ctaUrl: f.ctaUrl.trim(), by })
  const draft = () => { if (!f.title.trim()) { toast('Add a title first.'); return } saveCampaign(input()); toast('Draft saved'); setF(blank()); setTab('Campaigns') }
  const schedule = () => { if (!validate(false)) return; saveCampaign(input(new Date(f.sendAt).toISOString())); toast(`Scheduled for ${fmtAt(new Date(f.sendAt).toISOString())}. Recipients are chosen when it sends.`); setF(blank()); setTab('Campaigns') }
  const sendNow = () => {
    const id = saveCampaign(input()); const n = sendCampaign(id, by)
    setConfirm(null)
    if (!n) { toast('Nothing was sent: no company matches.'); return }
    toast(`Sent to ${n} compan${n === 1 ? 'y' : 'ies'}`); setF(blank()); setTab('Campaigns')
  }
  const load = (a: Camp) => { setF({ id: a.id, title: a.title, body: a.body, kind: a.kind, audience: a.campaign.audience, when: a.campaign.sendAt ? 'schedule' : 'now', sendAt: toLocalInput(a.campaign.sendAt) || inFuture(60), ctaLabel: a.campaign.ctaLabel ?? '', ctaUrl: a.campaign.ctaUrl ?? '' }); setDetail(null); setTab('Compose') }

  const sent = camps.filter((a) => a.campaign.status === 'Sent')
  const rows = camps.filter((a) => `${a.title} ${a.by} ${a.campaign.status}`.toLowerCase().includes(q.toLowerCase()))
  const sel = camps.find((a) => a.id === detail)
  const drillC = camps.find((a) => a.id === drill)
  const totals = sent.reduce((m, a) => { const s = statsOf(a.campaign); return { sent: m.sent + s.sent, read: m.read + s.read, clicked: m.clicked + s.clicked, delivered: m.delivered + s.delivered } }, { sent: 0, read: 0, clicked: 0, delivered: 0 })
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
  const byAnn = sent.map((a) => { const s = statsOf(a.campaign); return { name: a.title.length > 22 ? `${a.title.slice(0, 21)}…` : a.title, Delivered: s.deliveredPct, Read: s.readPct, Clicked: pct(s.clicked, s.sent) } }).reverse()
  const byDay = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5); return { key: d.toISOString().slice(0, 10), day: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), Reads: 0, Clicks: 0 } })
    sent.forEach((a) => a.campaign.deliveries.forEach((d) => { const r = days.find((x) => x.key === d.readAt?.slice(0, 10)); if (r) r.Reads++; const c = days.find((x) => x.key === d.clickedAt?.slice(0, 10)); if (c) c.Clicks++ }))
    return days
  }, [sent])

  const resend = (a: Camp, scope: 'unread' | 'all') => { const n = resendCampaign(a.id, scope, by); toast(n ? `Resent to ${n} compan${n === 1 ? 'y' : 'ies'}` : 'Everyone has already read it.') }
  const when = (c: Campaign) => c.status === 'Sent' ? `Sent ${fmtAt(c.sentAt!)}` : c.sendAt ? `Due ${fmtAt(c.sendAt)}` : `Created ${fmtAt(c.createdAt)}`

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Support" title="Announcements" desc="Send targeted messages to the companies that need them, schedule them, and see who read them. Legacy plan banners with start and end times still show in company workspaces." actions={tab !== 'Compose' && edit ? <Btn onClick={() => { setF(blank()); setTab('Compose') }}>New announcement</Btn> : undefined} />
      <Tabs tabs={['Compose', 'Campaigns', 'Analytics']} value={tab} onChange={setTab} />

      {tab === 'Compose' && (
        <div className="grid gap-5 xl:grid-cols-5">
          <div className="space-y-5 xl:col-span-3">
            {f.id && <div className="flex items-center justify-between rounded-md bg-softmint px-3 py-2 text-sm"><span>Editing {f.id}</span><button className="cursor-pointer font-semibold text-teal" onClick={() => setF(blank())}>Start over</button></div>}
            <Panel title="Message">
              <div className="space-y-3">
                <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. New payroll tax tables for {{company}}" /></Field>
                <Field label="Message" hint="Use {{company}} to insert each company's name."><textarea rows={4} className={`${inputCls} h-auto py-2`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Type"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Kind })}><option>Info</option><option>Maintenance</option><option>Incident</option></select></Field>
                  <Field label="Button label (optional)"><input className={inputCls} value={f.ctaLabel} onChange={(e) => setF({ ...f, ctaLabel: e.target.value })} placeholder="Review settings" /></Field>
                  <Field label="Button link"><input className={inputCls} value={f.ctaUrl} onChange={(e) => setF({ ...f, ctaUrl: e.target.value })} placeholder="/admin/business/payroll" disabled={!f.ctaLabel.trim()} /></Field>
                </div>
              </div>
            </Panel>
            <Panel title="Audience" action={!isEmptyAudience(f.audience) && <button className="cursor-pointer text-[13px] font-semibold text-teal" onClick={() => setAud(emptyAudience())}>Clear filters</button>}>
              <div className="space-y-4">
                <p className="text-xs text-slate">Leave a group empty to include everyone. Groups combine, so a company must match all of them.</p>
                <Chips label="Plan" options={TIERS.map((p) => ({ v: p, l: p }))} value={f.audience.plans} onChange={(plans) => setAud({ plans })} />
                <Chips label="Owns module (all selected)" options={MODULE_LIST.map((m) => ({ v: m.id, l: m.name }))} value={f.audience.modules} onChange={(modules) => setAud({ modules })} />
                <Chips label="Health band" options={HEALTH_LABELS.map((h) => ({ v: h, l: h }))} value={f.audience.health} onChange={(health) => setAud({ health })} />
                <Chips label="State" options={states.map((v) => ({ v, l: v }))} value={f.audience.states} onChange={(s) => setAud({ states: s })} />
                <Chips label="Industry" options={industries.map((v) => ({ v, l: v }))} value={f.audience.industries} onChange={(s) => setAud({ industries: s })} />
                <Chips label="Company size" options={sizes.map((v) => ({ v, l: v }))} value={f.audience.sizes} onChange={(s) => setAud({ sizes: s })} />
                <div>
                  <div className="mb-1.5 text-[13px] font-semibold">Specific companies{f.audience.slugs.length > 0 && <span className="ml-2 font-normal text-slate">{f.audience.slugs.length} selected</span>}</div>
                  <input aria-label="Find a company" className={inputCls} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search companies" />
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{found.map((t) => <li key={t.slug}><label className="flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-sm"><input type="checkbox" className="accent-teal" checked={f.audience.slugs.includes(t.slug)} onChange={() => setAud({ slugs: toggle(f.audience.slugs, t.slug) })} />{t.profile.name}</label></li>)}</ul>
                  {f.audience.slugs.filter((s) => !tenantMap[s]).length > 0 && <p className="mt-1 text-xs text-slate">Includes companies that no longer exist; they will not match.</p>}
                </div>
              </div>
            </Panel>
            <Panel title="Delivery">
              <div className="flex flex-wrap gap-3">
                {([['now', 'Send now'], ['schedule', 'Schedule']] as const).map(([v, l]) => <label key={v} className="flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-sm"><input type="radio" name="when" className="accent-teal" checked={f.when === v} onChange={() => setF({ ...f, when: v })} />{l}</label>)}
              </div>
              {f.when === 'schedule' && <div className="mt-3 max-w-xs"><Field label="Send at" hint="Recipients are chosen at send time, so companies that join the audience before then are included."><input type="datetime-local" className={inputCls} value={f.sendAt} onChange={(e) => setF({ ...f, sendAt: e.target.value })} /></Field></div>}
              {!edit && <p className="mt-3 text-xs text-slate">Only roles with Support access can save or send announcements.</p>}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Btn v="secondary" disabled={!edit} onClick={draft}>Save draft</Btn>
                {f.when === 'schedule' ? <Btn disabled={!edit} onClick={schedule}>Schedule send</Btn> : <Btn disabled={!edit} onClick={() => { if (validate(true)) setConfirm('send') }}>Send to {matches.length} compan{matches.length === 1 ? 'y' : 'ies'}</Btn>}
              </div>
            </Panel>
          </div>
          <div className="space-y-5 xl:col-span-2">
            <div className="space-y-5 xl:sticky xl:top-4">
              <Panel title={`${matches.length} of ${tenants.length} companies match`}>
                {matches.length === 0 ? <p className="text-sm text-slate">No company matches these filters. Widen the audience.</p> : (
                  <ul className="max-h-56 divide-y divide-line overflow-y-auto text-sm">{matches.map((t) => <li key={t.slug} className="flex items-center justify-between gap-2 py-1.5"><span className="min-w-0 truncate">{t.profile.name}</span><span className="shrink-0 text-xs text-slate">{t.plan} · {bands[t.slug]}</span></li>)}</ul>
                )}
                <p className="mt-2 text-xs text-slate">{describeAudience(f.audience, nameOf)}</p>
              </Panel>
              <Panel title="Preview as company">
                {tenants.length > 0 && <div className="mb-3"><Field label="Company"><select className={inputCls} value={pTenant?.slug ?? ''} onChange={(e) => setPreviewSlug(e.target.value)}>{tenants.map((t) => <option key={t.slug} value={t.slug}>{t.profile.name}</option>)}</select></Field></div>}
                <PreviewCard title={f.title} body={f.body} kind={f.kind} company={company} ctaLabel={f.ctaLabel.trim()} />
              </Panel>
            </div>
          </div>
        </div>
      )}

      {tab === 'Campaigns' && (
        <div className="space-y-3">
          <input aria-label="Search campaigns" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, author or status" className={`${inputCls} sm:max-w-xs`} />
          {rows.length === 0 ? <Panel><EmptyState title="No announcements yet" body="Compose one to reach the companies that need it." action={<Btn onClick={() => setTab('Compose')}>Compose</Btn>} /></Panel> : (
            <Table label="Campaigns" head={['Announcement', 'Audience', 'Status', 'When', 'Read']} rows={rows.map((a) => {
              const s = statsOf(a.campaign)
              return [
                <button key="t" onClick={() => setDetail(a.id)} className="cursor-pointer text-left"><div className="font-semibold hover:text-teal">{a.title}</div><div className="font-mono text-[11px] text-slate">{a.id} · {a.by}</div></button>,
                describeAudience(a.campaign.audience, nameOf),
                <Badge key="s" tone={STATUS_TONE[a.campaign.status]}>{a.campaign.status}</Badge>,
                when(a.campaign),
                a.campaign.status === 'Sent' ? `${s.read} of ${s.sent} (${s.readPct}%)` : '-',
              ]
            })} />
          )}
        </div>
      )}

      {tab === 'Analytics' && (sent.length === 0 ? <Panel><EmptyState title="Nothing sent yet" body="Delivery and read tracking appears here once an announcement is sent." /></Panel> : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Panel><Stat label="Announcements sent" value={String(sent.length)} /></Panel>
            <Panel><Stat label="Deliveries" value={String(totals.sent)} sub={`${pct(totals.delivered, totals.sent)}% displayed`} /></Panel>
            <Panel><Stat label="Read rate" value={`${pct(totals.read, totals.sent)}%`} sub={`${totals.read} read`} /></Panel>
            <Panel><Stat label="Click rate" value={`${pct(totals.clicked, totals.sent)}%`} sub={`${totals.clicked} clicks`} /></Panel>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Rates by announcement (% of companies)">
              <div className="h-64" role="img" aria-label="Delivered, read and clicked rate for each announcement">
                <ResponsiveContainer><BarChart data={byAnn}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} /><YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} width={40} /><Tooltip /><Legend />
                  <Bar dataKey="Delivered" fill={CHART_COLORS.delivered} radius={[3, 3, 0, 0]} /><Bar dataKey="Read" fill={CHART_COLORS.read} radius={[3, 3, 0, 0]} /><Bar dataKey="Clicked" fill={CHART_COLORS.clicked} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Reads and clicks per day (last 14 days)">
              <div className="h-64" role="img" aria-label="Reads and clicks per day">
                <ResponsiveContainer><LineChart data={byDay}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 11 }} interval={1} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} /><Tooltip /><Legend />
                  <Line type="monotone" dataKey="Reads" stroke={CHART_COLORS.read} strokeWidth={2} dot={false} /><Line type="monotone" dataKey="Clicks" stroke={CHART_COLORS.clicked} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
              </div>
            </Panel>
          </div>
          <Panel title="By announcement" pad={false} action={<ExportButton name="announcement-analytics" head={['ID', 'Title', 'Sent', 'Delivered', 'Read', 'Clicked']} rows={sent.map((a) => { const s = statsOf(a.campaign); return [a.id, a.title, String(s.sent), String(s.delivered), String(s.read), String(s.clicked)] })} />}>
            <Table label="Announcement analytics" head={['Announcement', 'Sent', 'Delivered', 'Read', 'Clicked', 'Drill down']} rows={sent.map((a) => { const s = statsOf(a.campaign); return [
              <span key="t" className="font-semibold">{a.title}</span>, String(s.sent), `${s.delivered} (${s.deliveredPct}%)`, `${s.read} (${s.readPct}%)`, a.campaign.ctaLabel ? `${s.clicked} (${pct(s.clicked, s.sent)}%)` : 'No link',
              <Btn key="d" s="sm" v={drill === a.id ? 'primary' : 'secondary'} onClick={() => setDrill(drill === a.id ? null : a.id)}>{drill === a.id ? 'Hide' : 'Companies'}</Btn>] })} />
          </Panel>
          {drillC && <Panel title={`Companies: ${drillC.title}`}><DeliveryTable c={drillC.campaign} name={nameOf} /></Panel>}
        </div>
      ))}

      <Overlay open={confirm === 'send'} onClose={() => setConfirm(null)} title="Send this announcement now?">
        <p className="text-sm text-slate">It reaches {matches.length} compan{matches.length === 1 ? 'y' : 'ies'} straight away as a pop-up and an inbox item. This is recorded in the audit trail.</p>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setConfirm(null)}>Back</Btn><Btn onClick={sendNow}>Send now</Btn></div>
      </Overlay>

      <Overlay open={!!sel} onClose={() => setDetail(null)} title={sel?.title ?? ''} side wide>
        {sel && (() => {
          const c = sel.campaign, s = statsOf(c), open = c.status === 'Draft' || c.status === 'Scheduled'
          return (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2"><Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge><Badge>{sel.kind}</Badge>{c.resends > 0 && <Badge tone="blue">Resent {c.resends}x</Badge>}</div>
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-cloud p-3 text-[13px]">
                <div><dt className="text-xs text-slate">Author</dt><dd className="font-semibold">{sel.by}</dd></div>
                <div><dt className="text-xs text-slate">{c.status === 'Sent' ? 'Sent' : c.sendAt ? 'Scheduled for' : 'Created'}</dt><dd className="font-semibold">{fmtAt(c.sentAt ?? c.sendAt ?? c.createdAt)}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-slate">Audience</dt><dd className="font-semibold">{describeAudience(c.audience, nameOf)}</dd></div>
                {c.ctaLabel && <div className="col-span-2"><dt className="text-xs text-slate">Button</dt><dd className="font-semibold">{c.ctaLabel} <span className="font-mono text-xs font-normal">{c.ctaUrl}</span></dd></div>}
              </dl>
              {c.status === 'Sent' && <div className="grid grid-cols-3 gap-3"><Stat label="Delivered" value={`${s.deliveredPct}%`} sub={`${s.delivered} of ${s.sent}`} /><Stat label="Read" value={`${s.readPct}%`} sub={`${s.read} of ${s.sent}`} /><Stat label="Clicked" value={c.ctaLabel ? `${pct(s.clicked, s.sent)}%` : '-'} sub={c.ctaLabel ? `${s.clicked}` : 'No link'} /></div>}
              <PreviewCard title={sel.title} body={sel.body} kind={sel.kind} company={(tenants[0]?.profile.name) ?? 'Your company'} ctaLabel={c.ctaLabel} />
              {c.status === 'Sent' && <div><div className="mb-1.5 text-xs font-semibold text-slate">By company</div><DeliveryTable c={c} name={nameOf} /></div>}
              {edit && <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                {open && <Btn v="secondary" onClick={() => load(sel)}>Edit</Btn>}
                {c.status === 'Draft' && <Btn v="secondary" onClick={() => { deleteDraft(sel.id); setDetail(null); toast('Draft deleted') }}>Delete draft</Btn>}
                {open && <Btn v="secondary" onClick={() => { cancelCampaign(sel.id, by); toast('Announcement cancelled') }}>Cancel</Btn>}
                {c.status === 'Scheduled' && <Btn onClick={() => { const n = sendCampaign(sel.id, by); toast(n ? `Sent to ${n} companies` : 'No company matches, nothing sent') }}>Send now</Btn>}
                {c.status === 'Draft' && <Btn onClick={() => { const n = sendCampaign(sel.id, by); toast(n ? `Sent to ${n} companies` : 'No company matches, nothing sent') }}>Send now</Btn>}
                {c.status === 'Sent' && <><Btn v="secondary" onClick={() => resend(sel, 'all')}>Resend to all</Btn><Btn onClick={() => resend(sel, 'unread')}>Resend to non-readers</Btn></>}
              </div>}
            </div>
          )
        })()}
      </Overlay>
    </div>
  )
}
