import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, Btn, EmptyState, Field, inputCls, Overlay, Panel, Stat, Table, useToast } from '../../components/ui'
import { useTenants } from '../../tenant/store'
import { averageRate, cancelStep, clearSpikes, errorSeries, evaluateGuards, flagState, injectSpike, processSteps, ruleOf, scheduleStep, setKill, setOverride, setRule, stepText, useGuard, useKillLog, useRollouts } from '../../platform/rollout'
import type { Step, StepAction } from '../../platform/rollout'
import { fmtAt } from '../../platform/persist'

type P = { by: string; edit: boolean }
const STEP_TONE: Record<Step['status'], string> = { Scheduled: 'blue', Applied: 'green', Cancelled: 'gray' }
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16)

/** Re-render every 15 s so schedules and the metric stay fresh. */
function useTick() { const [n, setN] = useState(0); useEffect(() => { processSteps(); evaluateGuards(); const i = setInterval(() => setN((x) => x + 1), 15000); return () => clearInterval(i) }, []); return n }

/* ---------- Per-tenant overrides ---------- */
export function OverridesTab({ by, edit }: P) {
  const flags = useRollouts(); const tenantMap = useTenants(); const toast = useToast()
  const tenants = Object.values(tenantMap)
  const [slug, setSlug] = useState(''); const [flag, setFlag] = useState(''); const [v, setV] = useState<'on' | 'off'>('on'); const [reason, setReason] = useState('')
  const rows = flags.flatMap((f) => Object.entries(f.overrides).map(([s, o]) => ({ f, slug: s, o, meta: f.overrideMeta?.[s] })))
  const slugSel = slug || tenants[0]?.slug || '', flagSel = flag || flags[0]?.key || ''
  const add = () => {
    if (!slugSel || !flagSel) return
    if (!reason.trim()) { toast('Give a reason so the audit trail explains the override.'); return }
    setOverride(flagSel, slugSel, v, by, reason); setReason(''); toast('Override added')
  }
  return (
    <div className="space-y-5">
      <Panel title="Add an override">
        {tenants.length === 0 ? <p className="text-sm text-slate">Create a business first.</p> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Company"><select className={inputCls} value={slugSel} onChange={(e) => setSlug(e.target.value)}>{tenants.map((t) => <option key={t.slug} value={t.slug}>{t.profile.name}</option>)}</select></Field>
            <Field label="Feature"><select className={inputCls} value={flagSel} onChange={(e) => setFlag(e.target.value)}>{flags.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}</select></Field>
            <Field label="Force"><select className={inputCls} value={v} onChange={(e) => setV(e.target.value as 'on' | 'off')}><option value="on">On</option><option value="off">Off</option></select></Field>
            <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Pilot customer" /></Field>
            <div className="flex items-end"><Btn disabled={!edit} onClick={add}>Add override</Btn></div>
          </div>
        )}
        {!edit && <p className="mt-2 text-xs text-slate">Only roles with Manage Platform Settings can change overrides.</p>}
      </Panel>
      {rows.length === 0 ? <Panel><EmptyState title="No overrides" body="Every company follows the flag rules. Add an override to force a feature on or off for one company." /></Panel> : (
        <Table label="Per-company overrides" head={['Company', 'Feature', 'Forced', 'Evaluated now', 'Reason', 'Set by', '']} rows={rows.map(({ f, slug: s, o, meta }) => {
          const t = tenantMap[s]; const ev = t ? flagState(f, t) : null
          const without = t ? flagState({ ...f, overrides: Object.fromEntries(Object.entries(f.overrides).filter(([k]) => k !== s)) as typeof f.overrides }, t) : null
          return [t?.profile.name ?? s, f.name, <Badge key="o" tone={o === 'on' ? 'green' : 'red'}>Force {o}</Badge>,
            ev ? <span key="e" className="flex flex-col"><Badge tone={ev.on ? 'green' : 'gray'}>{ev.on ? 'On' : 'Off'}</Badge><span className="text-[11px] text-slate">{ev.why}{without && without.on !== ev.on ? '' : ' (same as default)'}</span></span> : 'Company not found',
            meta?.reason ?? '-', meta ? `${meta.by}, ${fmtAt(meta.at)}` : '-',
            edit ? <Btn key="c" s="sm" v="secondary" onClick={() => { setOverride(f.key, s, null, by, 'Cleared from overrides list'); toast('Override cleared') }}>Clear</Btn> : '']
        })} />
      )}
    </div>
  )
}

/* ---------- Release calendar ---------- */
export function CalendarTab({ by, edit }: P) {
  const flags = useRollouts(); const { steps } = useGuard(); const toast = useToast(); useTick()
  const [view, setView] = useState<'List' | 'Month'>('List')
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [f, setF] = useState({ flag: '', action: 'percent' as StepAction, percent: '50', at: localInput(new Date(Date.now() + 864e5)), owner: by, note: '' })
  const flagSel = f.flag || flags[0]?.key || ''
  const add = () => {
    const pct = Number(f.percent)
    if (!flagSel) return
    if (!f.at || new Date(f.at).getTime() <= Date.now()) { toast('Pick a date and time in the future.'); return }
    if (f.action === 'percent' && (!Number.isFinite(pct) || pct < 0 || pct > 100)) { toast('Percentage must be between 0 and 100.'); return }
    if (!f.owner.trim()) { toast('Add an owner.'); return }
    scheduleStep({ flag: flagSel, action: f.action, percent: f.action === 'percent' ? Math.round(pct) : undefined, at: new Date(f.at).toISOString(), owner: f.owner.trim(), note: f.note.trim() }, by)
    setF({ ...f, note: '' }); toast('Step scheduled. It applies automatically when due.')
  }
  const sorted = useMemo(() => [...steps].sort((a, b) => (a.status === 'Scheduled' ? 0 : 1) - (b.status === 'Scheduled' ? 0 : 1) || (a.status === 'Scheduled' ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at))), [steps])
  const nameOf = (k: string) => flags.find((x) => x.key === k)?.name ?? k
  const first = month.getDay(), days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => i - first + 1)
  const dayKey = (d: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const onDay = (d: number) => steps.filter((s) => s.status !== 'Cancelled' && localInput(new Date(s.at)).slice(0, 10) === dayKey(d))
  const [dayOpen, setDayOpen] = useState<number | null>(null)
  return (
    <div className="space-y-5">
      <Panel title="Schedule a rollout step">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Feature"><select className={inputCls} value={flagSel} onChange={(e) => setF({ ...f, flag: e.target.value })}>{flags.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select></Field>
          <Field label="Action"><select className={inputCls} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value as StepAction })}><option value="percent">Set to a percentage</option><option value="ga">Promote to GA</option><option value="off">Turn off</option><option value="kill">Kill switch</option></select></Field>
          {f.action === 'percent' && <Field label="Percent"><input type="number" min={0} max={100} className={inputCls} value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></Field>}
          <Field label="Date and time"><input type="datetime-local" className={inputCls} value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></Field>
          <Field label="Owner"><input className={inputCls} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field>
          <Field label="Note"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" /></Field>
        </div>
        <div className="mt-3 flex justify-end"><Btn disabled={!edit} onClick={add}>Schedule step</Btn></div>
      </Panel>
      <div className="flex gap-2" role="group" aria-label="Calendar view">{(['List', 'Month'] as const).map((v) => <Btn key={v} s="sm" v={view === v ? 'primary' : 'secondary'} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'List' ? 'Agenda' : 'Month'}</Btn>)}</div>
      {view === 'List' && (sorted.length === 0 ? <Panel><EmptyState title="Nothing scheduled" body="Schedule a percentage change, a GA promotion or a kill for a future date." /></Panel> : (
        <Table label="Release calendar" head={['When', 'Feature', 'Step', 'Owner', 'Status', '']} rows={sorted.map((s) => [
          fmtAt(s.at), <span key="f" className="font-semibold">{nameOf(s.flag)}</span>, <span key="t">{stepText(s)}{s.note && <span className="block text-[11px] text-slate">{s.note}</span>}</span>, s.owner,
          <Badge key="s" tone={STEP_TONE[s.status]}>{s.status === 'Applied' && s.doneAt ? `Applied ${fmtAt(s.doneAt)}` : s.status}</Badge>,
          s.status === 'Scheduled' && edit ? <Btn key="c" s="sm" v="secondary" onClick={() => { cancelStep(s.id, by); toast('Step cancelled') }}>Cancel</Btn> : '',
        ])} />
      ))}
      {view === 'Month' && (
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <Btn s="sm" v="secondary" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></Btn>
            <div className="font-display font-semibold">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</div>
            <Btn s="sm" v="secondary" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></Btn>
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-line bg-line text-xs">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="bg-cloud px-1 py-1.5 text-center font-semibold text-slate">{d}</div>)}
            {cells.map((d, i) => {
              const items = d >= 1 && d <= days ? onDay(d) : []
              return (
                <div key={i} className={`min-h-16 bg-white p-1 sm:min-h-24 ${d < 1 || d > days ? 'opacity-40' : ''}`}>
                  {d >= 1 && d <= days && <button type="button" className="mb-1 cursor-pointer text-[11px] font-semibold text-slate" onClick={() => items.length && setDayOpen(d)}>{d}</button>}
                  <div className="hidden space-y-0.5 sm:block">{items.slice(0, 3).map((s) => <div key={s.id} title={`${nameOf(s.flag)}: ${stepText(s)}`} className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${s.status === 'Applied' ? 'bg-green-50 text-green-800' : 'bg-blue-50 text-blue-800'}`}>{s.flag}: {stepText(s)}</div>)}{items.length > 3 && <div className="text-[10px] text-slate">+{items.length - 3} more</div>}</div>
                  {items.length > 0 && <button type="button" aria-label={`${items.length} step(s) on day ${d}`} onClick={() => setDayOpen(d)} className="cursor-pointer rounded-full bg-teal px-1.5 text-[10px] font-semibold text-white sm:hidden">{items.length}</button>}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-slate">Blue steps are scheduled, green ones have been applied. Cancelled steps are hidden.</p>
        </Panel>
      )}
      <Overlay open={dayOpen !== null} onClose={() => setDayOpen(null)} title={dayOpen ? `${dayOpen} ${month.toLocaleDateString('en-GB', { month: 'long' })}` : ''}>
        <ul className="space-y-2 text-sm">{(dayOpen ? onDay(dayOpen) : []).map((s) => <li key={s.id} className="rounded-md border border-line p-2"><div className="font-semibold">{nameOf(s.flag)}</div><div>{stepText(s)} at {new Date(s.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div><div className="text-xs text-slate">{s.owner} · {s.status}</div></li>)}</ul>
      </Overlay>
    </div>
  )
}

/* ---------- Automatic rollback ---------- */
export function GuardrailsTab({ by, edit }: P) {
  const flags = useRollouts(); const { rules, spikes } = useGuard(); const kills = useKillLog(); const toast = useToast(); useTick()
  const [key, setKey] = useState('')
  const f = flags.find((x) => x.key === key) ?? flags[0]
  const rule = f ? (rules[f.key] ?? ruleOf(f.key)) : null
  const [draft, setDraft] = useState<{ enabled: boolean; max: string; win: string } | null>(null)
  const [releaseAsk, setReleaseAsk] = useState(false); const [why, setWhy] = useState('')
  useEffect(() => { setDraft(null) }, [f?.key])
  if (!f || !rule) return <Panel><EmptyState title="No flags" body="There are no feature flags to guard." /></Panel>
  const d = draft ?? { enabled: rule.enabled, max: String(rule.maxErrorRatePct), win: String(rule.windowMinutes) }
  const series = errorSeries(f.key, 60)
  const avg = averageRate(f.key, rule.windowMinutes)
  const breaching = rule.enabled && avg > rule.maxErrorRatePct
  const incident = (spikes[f.key] ?? []).length > 0
  const save = () => {
    const max = Number(d.max), win = Math.round(Number(d.win))
    if (!(max > 0 && max <= 100)) { toast('Threshold must be above 0 and at most 100%.'); return }
    if (!(win >= 1 && win <= 60)) { toast('Window must be 1 to 60 minutes.'); return }
    setRule(f.key, { enabled: d.enabled, maxErrorRatePct: max, windowMinutes: win }, by); setDraft(null); toast('Rollback rule saved')
  }
  return (
    <div className="space-y-5">
      <Field label="Feature"><select className={`${inputCls} sm:max-w-sm`} value={f.key} onChange={(e) => setKey(e.target.value)}>{flags.map((x) => <option key={x.key} value={x.key}>{x.name}{x.killed ? ' (killed)' : ''}</option>)}</select></Field>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel><Stat label={`Error rate, last ${rule.windowMinutes} min`} value={`${avg}%`} sub={rule.enabled ? `limit ${rule.maxErrorRatePct}%` : 'rule is off'} /></Panel>
        <Panel><Stat label="Rollback rule" value={rule.enabled ? 'Armed' : 'Off'} sub={rule.enabled ? `over ${rule.maxErrorRatePct}% in ${rule.windowMinutes} min` : 'will not auto-kill'} /></Panel>
        <Panel><Stat label="Kill switch" value={f.killed ? 'Engaged' : 'Released'} sub={f.status === 'Off' ? 'flag is off, rule is idle' : breaching ? 'breaching now' : 'within limit'} /></Panel>
        <Panel><Stat label="Simulation" value={incident ? 'Incident' : 'Quiet'} sub="simulated metric" /></Panel>
      </div>
      {f.killed && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-800">Kill switch engaged. This feature is off for every company.{edit && <Btn s="sm" onClick={() => setReleaseAsk(true)}>Release with reason</Btn>}</div>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Error rate, last 60 minutes (simulated)" className="lg:col-span-2">
          <div className="h-64" role="img" aria-label={`Error rate for ${f.name} over the last hour, threshold ${rule.maxErrorRatePct} percent`}>
            <ResponsiveContainer><LineChart data={series}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} interval={9} /><YAxis unit="%" tick={{ fontSize: 11 }} width={40} domain={[0, (m: number) => Math.max(Math.ceil(m + 1), Math.ceil(rule.maxErrorRatePct + 1))]} /><Tooltip formatter={(v) => [`${v}%`, 'Error rate']} />
              <Line type="monotone" dataKey="rate" stroke="#087e8b" strokeWidth={2} dot={false} isAnimationActive={false} />
              <ReferenceLine y={rule.maxErrorRatePct} stroke="#dc3e42" strokeDasharray="5 4" label={{ value: `limit ${rule.maxErrorRatePct}%`, position: 'insideTopRight', fontSize: 11, fill: '#dc3e42' }} /></LineChart></ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn s="sm" v="secondary" disabled={!edit || f.killed} onClick={() => { injectSpike(f.key, by); toast(rule.enabled && f.status !== 'Off' ? 'Incident injected. The rule should engage the kill switch.' : 'Incident injected. Arm the rule on a live flag to see an auto rollback.') }}>Inject incident spike</Btn>
            <Btn s="sm" v="secondary" disabled={!edit || !incident} onClick={() => { clearSpikes(f.key); toast('Simulated incident cleared') }}>Clear simulation</Btn>
          </div>
        </Panel>
        <Panel title="Automatic rollback rule">
          <div className="space-y-3">
            <label className="flex min-h-9 items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-teal" disabled={!edit} checked={d.enabled} onChange={(e) => setDraft({ ...d, enabled: e.target.checked })} />Kill automatically on breach</label>
            <Field label="Max error rate (%)"><input type="number" min={0.1} max={100} step={0.1} className={inputCls} disabled={!edit} value={d.max} onChange={(e) => setDraft({ ...d, max: e.target.value })} /></Field>
            <Field label="Window (minutes)" hint="The average over this window is compared with the limit."><input type="number" min={1} max={60} className={inputCls} disabled={!edit} value={d.win} onChange={(e) => setDraft({ ...d, win: e.target.value })} /></Field>
            <Btn disabled={!edit || !draft} onClick={save}>Save rule</Btn>
            <p className="text-xs text-slate">Rules only act on flags that are Beta or GA. Every automatic kill is added to the history below and to the audit trail.</p>
          </div>
        </Panel>
      </div>
      <Panel title="Kill-switch history" pad={false}>
        {kills.length === 0 ? <EmptyState title="No kill-switch events" body="Manual and automatic kills and releases are recorded here." /> : (
          <Table label="Kill-switch history" head={['When', 'Feature', 'Event', 'Who', 'Error rate', 'Limit', 'Reason']} rows={kills.map((k) => [
            fmtAt(k.at), flags.find((x) => x.key === k.flag)?.name ?? k.flag, <Badge key="e" tone={k.action === 'Engaged' ? 'red' : 'green'}>{k.action}</Badge>,
            k.auto ? <span key="w" className="font-semibold">Auto-rollback</span> : k.by, `${k.metric}%`, k.threshold === null ? 'No rule' : `${k.threshold}% / ${k.windowMinutes} min`, k.reason])} />
        )}
      </Panel>
      <Overlay open={releaseAsk} onClose={() => setReleaseAsk(false)} title={`Release the kill switch on ${f.name}?`}>
        <p className="mb-3 text-sm text-slate">The feature returns to its normal rollout rules. Any simulated incident is cleared.</p>
        <Field label="Reason"><input className={inputCls} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Fix deployed and verified" /></Field>
        <div className="mt-5 flex justify-end gap-2"><Btn v="secondary" onClick={() => setReleaseAsk(false)}>Cancel</Btn><Btn onClick={() => { if (!why.trim()) { toast('A reason is required.'); return } setKill(f.key, false, by, why.trim()); setReleaseAsk(false); setWhy(''); toast(`${f.name} released`) }}>Release</Btn></div>
      </Overlay>
    </div>
  )
}
