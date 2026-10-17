import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Check, Circle } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Line, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Btn, EmptyState, ExportButton, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, useToast } from '../../components/ui'
import { CHART } from '../../components/charts'
import { useAudit } from '../../tenant/store'
import { fmtAt } from '../../platform/persist'
import { healthOf } from '../../platform/health'
import { CS_OWNERS, STAGES, STAGE_RULES, STAGE_TONE, TTFV_TARGET_DAYS, assignOwner, cohorts, nudgeBlockedFor, sendNudge, useOnboarding } from '../../platform/onboarding'
import type { OnbRow, Stage } from '../../platform/onboarding'
import { useAdmin } from './AdminLayout'

const Progress = ({ pct, tone }: { pct: number; tone?: string }) => (
  <div className="flex items-center gap-2">
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% complete`}>
      <div className={`h-full rounded-full ${tone === 'red' ? 'bg-err' : tone === 'green' ? 'bg-ok' : 'bg-teal'}`} style={{ width: `${pct}%` }} />
    </div>
    <span className="num text-xs font-semibold text-ink">{pct}%</span>
  </div>
)
const RANK: Record<Stage, number> = { Stalled: 0, 'Not started': 1, 'In progress': 2, Complete: 3 }
const STAGE_COLOR: Record<Stage, string> = { 'Not started': '#9AAEB3', 'In progress': CHART.blue, Stalled: CHART.red, Complete: CHART.green }

export default function Onboarding() {
  const { rows, state } = useOnboarding()
  const audit = useAudit()
  const { can, actor } = useAdmin()
  const by = actor.split(' (')[0]
  const toast = useToast()
  const [tab, setTab] = useState('Tracker')
  const [stage, setStage] = useState('All')
  const [owner, setOwner] = useState('All')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const manage = can('support')

  const shown = useMemo(() => rows
    .filter((r) => (stage === 'All' || r.stage === stage) && (owner === 'All' || r.owner === owner) && (!q || (r.t.profile.name + r.t.slug).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => RANK[a.stage] - RANK[b.stage] || a.pct - b.pct), [rows, stage, owner, q])
  const count = (s: Stage) => rows.filter((r) => r.stage === s).length
  const avgPct = rows.length ? Math.round(rows.reduce((n, r) => n + r.pct, 0) / rows.length) : 0
  const measured = rows.filter((r) => r.ttfvDays !== null)
  const avgTtfv = measured.length ? Math.round(measured.reduce((n, r) => n + (r.ttfvDays ?? 0), 0) / measured.length) : null
  const nudges30 = state.nudges.filter((n) => Date.now() - new Date(n.at).getTime() < 30 * 864e5).length
  const sel = rows.find((r) => r.t.slug === open)
  const co = cohorts(rows)

  /* Insight: which checklist item blocks the most companies. */
  const blockers = useMemo(() => {
    const map = new Map<string, { label: string; n: number }>()
    rows.filter((r) => r.stage !== 'Complete').forEach((r) => r.items.filter((i) => !i.done).forEach((i) => { const c = map.get(i.key) ?? { label: i.label, n: 0 }; c.n += 1; map.set(i.key, c) }))
    return [...map.values()].sort((a, b) => b.n - a.n).slice(0, 4)
  }, [rows])

  return (
    <div>
      <PageHeader eyebrow="Customer success" title="Onboarding" desc="A setup checklist for every company, derived from what it has really configured. The same twelve items drive the Setup completeness points in the tenant health score." actions={<ExportButton name="onboarding" head={['Company', 'Stage', 'Completion', 'Owner', 'Next step']} rows={shown.map((r) => [r.t.profile.name, r.stage, `${r.pct}%`, r.owner, r.nextStep?.label ?? 'None'])} />} />
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
        {[
          ['Companies tracked', String(rows.length), `${count('Complete')} complete`],
          ['Average completion', `${avgPct}%`, 'across all companies'],
          ['Stalled', String(count('Stalled')), count('Stalled') ? 'need a nudge' : 'none right now'],
          ['Time to first value', avgTtfv === null ? 'n/a' : `${avgTtfv}d`, `target ${TTFV_TARGET_DAYS} days`],
          ['Nudges, 30 days', String(nudges30), 'sent by customer success'],
        ].map(([l, v, s]) => <div key={l} className="bg-white p-4"><Stat label={l} value={v} sub={s} /></div>)}
      </div>

      <Tabs tabs={['Tracker', 'Cohorts']} value={tab} onChange={setTab} />

      {tab === 'Tracker' && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap gap-2">
              <input className={`${inputCls} sm:max-w-64`} placeholder="Search companies" aria-label="Search companies" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className={`${inputCls} sm:w-44`} aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)}><option>All</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
              <select className={`${inputCls} sm:w-48`} aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}><option>All</option>{CS_OWNERS.map((o) => <option key={o}>{o}</option>)}</select>
            </div>
            <Panel pad={false}>
              {shown.length === 0 ? <EmptyState title="No companies match" body="Change the stage, owner or search to see more companies." /> : (
                <Table label="Onboarding tracker" head={['Company', 'Stage', 'Completion', 'Next step', 'Owner', 'Last activity', '']} pageSize={10}
                  rows={shown.map((r) => [
                    <button key="c" onClick={() => setOpen(r.t.slug)} className="cursor-pointer text-left font-semibold text-teal hover:underline">{r.t.profile.name}</button>,
                    <Badge key="s" tone={STAGE_TONE[r.stage]}>{r.stage}</Badge>,
                    <Progress key="p" pct={r.pct} tone={r.stage === 'Stalled' ? 'red' : r.stage === 'Complete' ? 'green' : undefined} />,
                    <span key="n" className="text-sm text-slate">{r.nextStep?.label ?? 'All done'}</span>,
                    r.owner + (r.ownerSet ? '' : ' (auto)'),
                    r.lastActivityDays === null ? 'Never' : r.lastActivityDays === 0 ? 'Today' : `${r.lastActivityDays}d ago`,
                    <Btn key="a" s="sm" v="secondary" onClick={() => setOpen(r.t.slug)}>{r.stage === 'Complete' ? 'View' : 'Review'}</Btn>,
                  ])} />
              )}
            </Panel>
          </div>
          <div className="space-y-4">
            <Panel title="Stage mix">
              <div className="flex h-3 overflow-hidden rounded-full bg-ink/10" role="img" aria-label={`Stage mix: ${STAGES.map((s) => `${count(s)} ${s}`).join(', ')}`}>
                {STAGES.map((s) => count(s) > 0 && <div key={s} style={{ width: `${(count(s) / Math.max(1, rows.length)) * 100}%`, background: STAGE_COLOR[s] }} />)}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {STAGES.map((s) => <li key={s} className="flex items-center justify-between gap-2" title={STAGE_RULES[s]}><span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: STAGE_COLOR[s] }} />{s}</span><span className="num font-semibold">{count(s)}</span></li>)}
              </ul>
            </Panel>
            <Panel title="What blocks companies most">
              {blockers.length === 0 ? <p className="text-sm text-slate">Every tracked company has finished setup.</p> : (
                <ul className="space-y-2.5">{blockers.map((b) => (
                  <li key={b.label}><div className="flex justify-between gap-2 text-sm"><span>{b.label}</span><span className="num font-semibold">{b.n}</span></div><Progress pct={Math.round((b.n / Math.max(1, rows.length)) * 100)} /></li>
                ))}</ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'Cohorts' && (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Panel title="Time to first value by signup month" action={<span className="text-xs text-slate">Days from signup to first real work. Target {TTFV_TARGET_DAYS}.</span>}>
            <div style={{ height: 260 }} role="img" aria-label="Average days to first value by signup cohort">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={co} margin={{ left: 0, right: 12, top: 8 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} width={32} />
                  <Tooltip formatter={(v) => [`${v} days`, 'Average']} contentStyle={{ borderRadius: 8, border: '1px solid #D8E2E3', fontSize: 12 }} />
                  <ReferenceLine y={TTFV_TARGET_DAYS} stroke={CHART.amber} strokeDasharray="5 4" label={{ value: 'Target', fontSize: 11, fill: CHART.amber, position: 'insideTopRight' }} />
                  <Bar dataKey="avgDays" radius={[4, 4, 0, 0]} isAnimationActive={false}>{co.map((c, i) => <Cell key={i} fill={c.source === 'Measured' ? CHART.teal : '#9CC9CF'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-slate">Light bars are platform benchmarks from before per-company tracking. The dark bar is measured from the audit log of live companies.</p>
          </Panel>
          <Panel title="Checklist completion at day 30">
            <div style={{ height: 260 }} role="img" aria-label="Average checklist completion by cohort">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={co} margin={{ left: 0, right: 12, top: 8 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} width={36} domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(v) => [`${v}%`, 'Complete']} contentStyle={{ borderRadius: 8, border: '1px solid #D8E2E3', fontSize: 12 }} />
                  <Line type="monotone" dataKey="completePct" stroke={CHART.teal} strokeWidth={2.25} dot={{ r: 3 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <div className="xl:col-span-2">
            <Panel title="Cohort table" pad={false}>
              <Table label="Cohorts" head={['Signup month', 'Signups', 'Live companies here', 'Avg days to first value', 'Checklist complete', 'Source']} pageSize={12}
                rows={[...co].reverse().map((c) => [c.m, String(c.signups), String(c.live), c.avgDays === null ? 'n/a' : `${c.avgDays}d`, `${c.completePct}%`, <Badge key="s" tone={c.source === 'Measured' ? 'teal' : 'gray'}>{c.source}</Badge>])} />
            </Panel>
          </div>
        </div>
      )}

      <Overlay open={!!sel} onClose={() => setOpen(null)} title={sel ? `Onboarding: ${sel.t.profile.name}` : 'Onboarding'} side wide>
        {sel && <Detail row={sel} audit={audit} manage={manage} by={by} onDone={(m) => toast(m)} />}
      </Overlay>
    </div>
  )
}

function Detail({ row, audit, manage, by, onDone }: { row: OnbRow; audit: ReturnType<typeof useAudit>; manage: boolean; by: string; onDone: (m: string) => void }) {
  const open = row.items.filter((i) => !i.done)
  const [picked, setPicked] = useState<string[]>(() => open.slice(0, 3).map((i) => i.key))
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const { state } = useOnboarding()
  const health = healthOf(row.t, audit)
  const blocked = nudgeBlockedFor(row.t.slug)
  const history = state.nudges.filter((n) => n.slug === row.t.slug)
  const groups = ['Company', 'People', 'Operations', 'Security'] as const
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2"><Badge tone={STAGE_TONE[row.stage]}>{row.stage}</Badge><span className="text-sm text-slate">{row.done} of {row.items.length} done, signed up {row.ageDays} days ago</span></div>
      <Progress pct={row.pct} tone={row.stage === 'Stalled' ? 'red' : row.stage === 'Complete' ? 'green' : undefined} />
      <p className="text-xs text-slate">{STAGE_RULES[row.stage]} Health score {health.score} ({health.label}); setup contributes {health.factors.find((f) => f.key === 'setup')?.pts} of 20 points.</p>
      <Field label="Customer-success owner" hint={row.ownerSet ? undefined : 'Auto-assigned. Choose someone to make it explicit.'}>
        <select className={inputCls} value={row.owner} disabled={!manage} onChange={(e) => { assignOwner(row.t.slug, e.target.value, by); onDone(`Owner set to ${e.target.value}`) }}>{CS_OWNERS.map((o) => <option key={o}>{o}</option>)}</select>
      </Field>
      {groups.map((g) => (
        <section key={g}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate">{g}</h3>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {row.items.filter((i) => i.group === g).map((i) => (
              <li key={i.key} className="flex items-start gap-3 p-3">
                <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${i.done ? 'bg-teal text-white' : 'border border-line text-slate'}`}>{i.done ? <Check size={12} strokeWidth={3} /> : <Circle size={8} />}</span>
                <div className="min-w-0 text-sm"><div className={`font-semibold ${i.done ? 'text-slate' : 'text-ink'}`}>{i.label}</div><div className="text-xs text-slate">{i.evidence}{!i.done && <> · {i.fix}</>}</div></div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {open.length > 0 && manage && (
        <section className="rounded-lg border border-line bg-cloud p-4">
          <h3 className="font-semibold">Send a nudge</h3>
          <p className="mt-0.5 text-xs text-slate">Creates a notification in the company inbox, a customer-success log entry and an audit entry.</p>
          <fieldset className="mt-3 space-y-1.5"><legend className="sr-only">Steps to nudge</legend>
            {open.map((i) => <label key={i.key} className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-teal" checked={picked.includes(i.key)} onChange={(e) => setPicked(e.target.checked ? [...picked, i.key] : picked.filter((k) => k !== i.key))} />{i.label}</label>)}
          </fieldset>
          <div className="mt-3"><Field label="Message (optional)"><textarea rows={2} className={`${inputCls} h-auto py-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Happy to help on a 15 minute call this week." /></Field></div>
          {err && <p role="alert" className="mt-2 text-sm text-err">{err}</p>}
          {blocked && !err && <p className="mt-2 text-xs text-slate">Last nudge {fmtAt(blocked.at)} by {blocked.by}.</p>}
          <div className="mt-3"><Btn onClick={() => { const r = sendNudge(row.t.slug, picked, note.trim(), by, row.items); if (r.ok) { setErr(''); setNote(''); onDone('Nudge sent to the company inbox') } else setErr(r.error ?? 'Could not send') }}>Send nudge</Btn></div>
        </section>
      )}
      {history.length > 0 && (
        <section><h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate">Nudge history</h3>
          <ul className="space-y-1.5 text-sm">{history.slice(0, 5).map((n) => <li key={n.id} className="rounded-md border border-line px-3 py-2"><span className="font-semibold">{fmtAt(n.at)}</span> by {n.by}<div className="text-xs text-slate">{n.items.length} step{n.items.length === 1 ? '' : 's'}{n.note ? ` · ${n.note}` : ''}</div></li>)}</ul>
        </section>
      )}
      <Link to={`/admin/businesses/${row.t.slug}`} className="inline-block text-sm font-semibold text-teal hover:underline">Open business record</Link>
    </div>
  )
}
