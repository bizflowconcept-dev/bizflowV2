import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Ban, CalendarClock, CalendarPlus, Copy, Gift, Plus, Repeat, Settings2, ShieldCheck, TrendingDown, Users } from 'lucide-react'
import { Badge, Btn, ExportButton, Field, inputCls, Overlay, PageHeader, Panel, Stepper, Table, Tabs, Timeline, useToast } from '../../components/ui'
import { CHART } from '../../components/charts'
import { GROUPS, MODULES, fmtDate, planById, useBilling } from '../../data/billing'
import type { BillingState } from '../../data/billing'
import {
  CONVERSIONS, CONVERSION_LABEL, OUTCOME_LABEL, answerConversion, approveGrant, createGrant, decideExtension, describeAudience, describeScope, extendGrant, forecastOf, forgoneSeries, kpis, monthlyValue,
  ngn, outcomeSeries, periodDays, previewGrant, rejectGrant, remaining, resolveAudience, revokeGrant, setThreshold, shift, submitDraft, syncGrants, todayIso, toInput, useGrants, validateInput,
} from '../../data/grants'
import type { Audience, Conversion, Grant, GrantInput, GrantStatus } from '../../data/grants'
import { HEALTH_META } from '../../billing/insights'
import type { HealthBand } from '../../billing/insights'
import { useTickets } from '../../platform/helpdesk'
import { Kpi, chartTip } from './promos/ui'
import { useAdmin } from './AdminLayout'

const TABS = ['Active', 'Scheduled', 'Ended', 'All']
const STATUS_TONE: Record<GrantStatus, string> = { Draft: 'gray', Scheduled: 'blue', Active: 'green', Ended: 'teal', Revoked: 'red' }
const pad = (n: number) => String(n).padStart(2, '0')
void pad

const blank = (): GrantInput => ({
  name: '', reason: '', scope: { modules: [], addons: [], planId: undefined }, audience: { kind: 'selected', subIds: [] },
  startsAt: todayIso(), endsAt: shift(todayIso(), 30), durationDays: undefined, conversion: 'revert', notify: 'tenant',
})
const endOf = (g: Grant) => g.endsAt ?? shift(g.startsAt, g.durationDays ?? 30)
const periodText = (g: Grant) => g.endsAt ? `${fmtDate(g.startsAt)} to ${fmtDate(g.endsAt)}` : `${fmtDate(g.startsAt)} + ${g.durationDays ?? 30} days`

function Check({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return <label className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-teal" checked={on} onChange={(e) => onChange(e.target.checked)} /><span>{children}</span></label>
}
function Radio({ on, onChange, title, hint }: { on: boolean; onChange: () => void; title: string; hint?: string }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${on ? 'border-teal bg-softmint/50' : 'border-line bg-white'}`}>
      <input type="radio" className="mt-0.5 size-4 accent-teal" checked={on} onChange={onChange} />
      <span><b className="block font-semibold text-ink">{title}</b>{hint && <span className="text-slate">{hint}</span>}</span>
    </label>
  )
}
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

/* ---------------- Create wizard ---------------- */
function Wizard({ open, onClose, initial, b, threshold, actor }: { open: boolean; onClose: () => void; initial: GrantInput; b: BillingState; threshold: number; actor: string }) {
  const toast = useToast(); const tickets = useTickets()
  const [step, setStep] = useState(0); const [f, setF] = useState<GrantInput>(initial); const [mode, setMode] = useState<'fixed' | 'days'>(initial.endsAt ? 'fixed' : 'days')
  const [q, setQ] = useState(''); const [ack, setAck] = useState(false); const [error, setError] = useState('')
  const set = (p: Partial<GrantInput>) => { setF((x) => ({ ...x, ...p })); setError('') }
  const input: GrantInput = mode === 'fixed' ? { ...f, durationDays: undefined, endsAt: f.endsAt } : { ...f, endsAt: undefined, durationDays: f.durationDays ?? 14 }
  const pv = useMemo(() => previewGrant(b, input, threshold, tickets), [b, input, threshold, tickets]) // eslint-disable-line react-hooks/exhaustive-deps
  const stepError = (i: number): string | null => {
    if (i === 0) { if (!f.name.trim()) return 'Give the grant a name.'; if (f.reason.trim().length < 10) return 'A reason is required (at least 10 characters).'; if (!f.scope.planId && !f.scope.modules.length && !f.scope.addons.length) return 'Choose a module, an add-on or a whole plan.' }
    if (i === 1) { const a = f.audience; if (a.kind === 'selected' && !a.subIds.length) return 'Choose at least one tenant.'; if (a.kind === 'plan' && !a.planIds.length) return 'Choose at least one plan.'; if (a.kind === 'health' && !a.bands.length) return 'Choose at least one health band.'; if (!pv.count) return 'No eligible tenant matches this audience.' }
    if (i === 2) { if (f.startsAt < todayIso()) return 'The start date cannot be in the past.'; if (mode === 'fixed' && (!f.endsAt || f.endsAt <= f.startsAt)) return 'The end date must be after the start date.'; if (mode === 'days' && (!input.durationDays || input.durationDays < 1 || input.durationDays > 366)) return 'Enter 1 to 366 days.' }
    if (i === 3 && f.notify === 'internal' && !ack) return 'Confirm that you understand the tenant will not be told in advance.'
    return null
  }
  const next = () => { const e = stepError(step); if (e) { setError(e); return } setError(''); setStep(step + 1) }
  const submit = (draft: boolean) => {
    for (let i = 0; i < 4; i++) { const e = stepError(i); if (e && !(draft && i === 3)) { setStep(i); setError(e); return } }
    const bad = validateInput(input); if (bad) { setError(bad); return }
    const r = createGrant(input, actor, { draft, tickets })
    if (!r.ok) { setError(r.error); return }
    toast(draft ? 'Draft saved' : pv.needsApproval ? 'Submitted: waiting for a second approver' : 'Grant scheduled'); onClose()
  }
  const days = periodDays(input); const mrrAll = pv.mrr
  const subsShown = b.subs.filter((s) => `${s.company} ${s.id}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <Overlay open={open} onClose={onClose} title="New free period or grant" side wide>
      <div className="space-y-5">
        <Stepper steps={['Scope', 'Audience', 'Period', 'Conversion and notice', 'Review']} at={step} />
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Grant name"><input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="For example: Year-end goodwill, Advanced Reporting" /></Field>
            <Field label="Reason (required, kept in the audit trail)"><textarea className={`${inputCls} h-20 py-2`} value={f.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Why is BizFlow giving this away?" /></Field>
            <Field label="Whole plan (optional)" hint="Gives the plan's features and limits, and waives the subscription fee for the period.">
              <select className={inputCls} value={f.scope.planId ?? ''} onChange={(e) => set({ scope: { ...f.scope, planId: e.target.value || undefined } })}>
                <option value="">No whole-plan grant</option>
                {b.plans.filter((p) => p.status === 'active').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div>
              <div className="mb-1.5 text-[13px] font-semibold">Modules</div>
              <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-line p-3">
                {GROUPS.map((g) => (
                  <div key={g.id}><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate">{g.name}</div>
                    <div className="grid gap-1.5 sm:grid-cols-2">{MODULES.filter((m) => m.group === g.id).map((m) => <Check key={m.id} on={f.scope.modules.includes(m.id)} onChange={() => set({ scope: { ...f.scope, modules: toggle(f.scope.modules, m.id) } })}>{m.name}</Check>)}</div></div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-semibold">Add-ons</div>
              <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border border-line p-3 sm:grid-cols-2">
                {b.addons.filter((a) => a.active).map((a) => <Check key={a.id} on={f.scope.addons.includes(a.id)} onChange={() => set({ scope: { ...f.scope, addons: toggle(f.scope.addons, a.id) } })}>{a.name}</Check>)}
              </div>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Radio on={f.audience.kind === 'all'} onChange={() => set({ audience: { kind: 'all' } })} title="All tenants" hint="Every tenant with a live or trial subscription." />
              <Radio on={f.audience.kind === 'selected'} onChange={() => set({ audience: { kind: 'selected', subIds: f.audience.kind === 'selected' ? f.audience.subIds : [] } })} title="Selected tenants" hint="Pick tenants one by one." />
              <Radio on={f.audience.kind === 'plan'} onChange={() => set({ audience: { kind: 'plan', planIds: [] } })} title="By plan" hint="Every tenant on the chosen plans." />
              <Radio on={f.audience.kind === 'health'} onChange={() => set({ audience: { kind: 'health', bands: [] } })} title="By health band" hint="Tenants whose health score is in the chosen bands." />
            </div>
            {f.audience.kind === 'selected' && (
              <div>
                <input className={inputCls} aria-label="Search tenants" placeholder="Search tenants" value={q} onChange={(e) => setQ(e.target.value)} />
                <div className="mt-2 max-h-52 space-y-1.5 overflow-y-auto rounded-lg border border-line p-3">
                  {subsShown.length === 0 && <div className="text-sm text-slate">No tenant matches.</div>}
                  {subsShown.map((s) => { const a = f.audience as Extract<Audience, { kind: 'selected' }>; return <Check key={s.id} on={a.subIds.includes(s.id)} onChange={() => set({ audience: { kind: 'selected', subIds: toggle(a.subIds, s.id) } })}>{s.company} <span className="text-slate">· {planById(b, s.planId)?.name} · {s.status.replace('_', ' ')}</span></Check> })}
                </div>
              </div>
            )}
            {f.audience.kind === 'plan' && (
              <div className="grid gap-1.5 rounded-lg border border-line p-3 sm:grid-cols-2">
                {b.plans.filter((p) => p.status === 'active').map((p) => { const a = f.audience as Extract<Audience, { kind: 'plan' }>; return <Check key={p.id} on={a.planIds.includes(p.id)} onChange={() => set({ audience: { kind: 'plan', planIds: toggle(a.planIds, p.id) } })}>{p.name}</Check> })}
              </div>
            )}
            {f.audience.kind === 'health' && (
              <div className="grid gap-1.5 rounded-lg border border-line p-3 sm:grid-cols-3">
                {(['healthy', 'watch', 'risk'] as HealthBand[]).map((h) => { const a = f.audience as Extract<Audience, { kind: 'health' }>; return <Check key={h} on={a.bands.includes(h)} onChange={() => set({ audience: { kind: 'health', bands: toggle(a.bands, h) } })}>{HEALTH_META[h].label}</Check> })}
              </div>
            )}
            <div className="rounded-xl border border-line bg-softmint/40 p-4" role="status" aria-live="polite">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate">Live preview</div>
              <div className="mt-1 grid grid-cols-3 gap-3">
                <div><div className="num text-2xl font-semibold">{pv.count}</div><div className="text-xs text-slate">tenant{pv.count === 1 ? '' : 's'}</div></div>
                <div><div className="num text-2xl font-semibold">{ngn(mrrAll)}</div><div className="text-xs text-slate">forgone MRR</div></div>
                <div><div className="num text-2xl font-semibold">{ngn(pv.forecast)}</div><div className="text-xs text-slate">over {days} day{days === 1 ? '' : 's'}</div></div>
              </div>
              {pv.rows.length > 0 && <ul className="mt-3 space-y-1 text-sm">{pv.rows.slice(0, 6).map((r) => <li key={r.sub.id} className="flex justify-between gap-3"><span className="truncate">{r.sub.company}</span><span className="num text-slate">{ngn(r.mrr)} / month</span></li>)}{pv.rows.length > 6 && <li className="text-xs text-slate">and {pv.rows.length - 6} more</li>}</ul>}
              {pv.count > 0 && mrrAll === 0 && <p className="mt-2 text-xs text-slate">These tenants already have everything in scope, so no revenue is forgone. They would still see it labelled as complimentary.</p>}
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <Field label="Starts on" hint="A future date schedules the grant. Today activates it as soon as it is approved."><input type="date" min={todayIso()} className={inputCls} value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value, endsAt: mode === 'fixed' && f.endsAt && f.endsAt <= e.target.value ? shift(e.target.value, 30) : f.endsAt })} /></Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Radio on={mode === 'fixed'} onChange={() => { setMode('fixed'); set({ endsAt: f.endsAt ?? shift(f.startsAt, 30) }) }} title="Fixed period" hint="Ends on a set date." />
              <Radio on={mode === 'days'} onChange={() => { setMode('days'); set({ durationDays: f.durationDays ?? 14 }) }} title="N days from activation" hint="The end date is fixed the moment the grant activates." />
            </div>
            {mode === 'fixed'
              ? <Field label="Complimentary until (access ends on this date)"><input type="date" min={shift(f.startsAt, 1)} className={inputCls} value={f.endsAt ?? ''} onChange={(e) => set({ endsAt: e.target.value })} /></Field>
              : <Field label="Number of days"><input type="number" min={1} max={366} className={inputCls} value={f.durationDays ?? ''} onChange={(e) => set({ durationDays: Number(e.target.value) })} /></Field>}
            <p className="text-sm text-slate">Runs for <b className="text-ink">{days} day{days === 1 ? '' : 's'}</b>, ending on <b className="text-ink">{fmtDate(mode === 'fixed' ? f.endsAt ?? f.startsAt : shift(f.startsAt, input.durationDays ?? 14))}</b>.</p>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <div><div className="mb-1.5 text-[13px] font-semibold">What happens at the end</div>
              <div className="space-y-2">{CONVERSIONS.map((c) => <Radio key={c.id} on={f.conversion === c.id} onChange={() => set({ conversion: c.id })} title={c.name} hint={c.hint} />)}</div></div>
            <div><div className="mb-1.5 text-[13px] font-semibold">Tell the tenant</div>
              <div className="space-y-2">
                <Radio on={f.notify === 'tenant'} onChange={() => set({ notify: 'tenant' })} title="Notify the tenant (recommended)" hint="In-app banner when 7 days remain, plus an inbox notification at the start and before the end date, showing the end date." />
                <Radio on={f.notify === 'internal'} onChange={() => set({ notify: 'internal' })} title="Internal only" hint="No start or ending notices and no banner." />
              </div>
              {f.notify === 'internal' && (
                <div className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm" role="alert">
                  <div className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle size={16} /> The tenant will not be told in advance</div>
                  <p className="mt-1 text-amber-900">Features will still switch on and off. The tenant is always notified when access is removed, when billing starts, or when the grant is revoked early, so they are never surprised by a charge.</p>
                  <div className="mt-2"><Check on={ack} onChange={setAck}>I understand and accept this.</Check></div>
                </div>
              )}
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <dl className="divide-y divide-line rounded-lg border border-line text-sm">
              {([['Name', f.name], ['Reason', f.reason], ['Scope', describeScope(f.scope, b)], ['Audience', `${describeAudience(f.audience, b)} (${pv.count} eligible)`], ['Period', `${fmtDate(f.startsAt)} for ${days} days, ending ${fmtDate(mode === 'fixed' ? f.endsAt ?? f.startsAt : shift(f.startsAt, input.durationDays ?? 14))}`], ['At the end', CONVERSION_LABEL[f.conversion]], ['Tenant notice', f.notify === 'tenant' ? 'Banner and inbox notification' : 'Internal only (end of access and billing are always notified)'], ['Estimated forgone revenue', `${ngn(pv.forecast)} (${ngn(pv.mrr)} per month)`]] as [string, string][]).map(([k, v]) => <div key={k} className="grid gap-1 p-3 sm:grid-cols-[170px_1fr]"><dt className="font-medium text-slate">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>)}
            </dl>
            <div className={`flex gap-3 rounded-lg border p-3 text-sm ${pv.needsApproval ? 'border-warn/40 bg-warn/10 text-amber-900' : 'border-line bg-softmint/40'}`}>
              <ShieldCheck size={18} className="mt-0.5 shrink-0" />
              <p>{pv.needsApproval ? <>Estimated forgone revenue of <b>{ngn(pv.forecast)}</b> is above the <b>{ngn(threshold)}</b> threshold. A second admin (not you) must approve before this is scheduled.</> : <>Below the {ngn(threshold)} approval threshold, so it is scheduled immediately. Everything is written to the audit trail.</>}</p>
            </div>
          </div>
        )}
        {error && <p role="alert" className="rounded-md bg-err/10 px-3 py-2 text-sm font-medium text-err">{error}</p>}
        <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
          <Btn v="secondary" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>{step === 0 ? 'Cancel' : 'Back'}</Btn>
          <div className="flex flex-wrap gap-2">
            {step === 4 && <Btn v="secondary" onClick={() => submit(true)}>Save draft</Btn>}
            {step < 4 ? <Btn onClick={next}>Continue</Btn> : <Btn onClick={() => submit(false)}>{pv.needsApproval ? 'Submit for approval' : 'Schedule grant'}</Btn>}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

/* ---------------- Detail drawer ---------------- */
function Detail({ g, onClose, b, canManage, canApprove, actor, threshold, onDuplicate }: { g: Grant; onClose: () => void; b: BillingState; canManage: boolean; canApprove: boolean; actor: string; threshold: number; onDuplicate: (g: Grant) => void }) {
  const toast = useToast(); const tickets = useTickets()
  const [mode, setMode] = useState<'' | 'revoke' | 'extend' | 'reject'>(''); const [why, setWhy] = useState(''); const [to, setTo] = useState(shift(endOf(g), 14)); const [error, setError] = useState('')
  const done = (r: { ok: boolean; error?: string }, msg: string) => { if (r.ok) { toast(msg); setMode(''); setWhy(''); setError('') } else setError(r.error ?? 'Something went wrong') }
  const subs = g.targets.length ? b.subs.filter((s) => g.targets.includes(s.id)) : resolveAudience(b, g.audience, tickets)
  const open = g.status === 'Draft' || g.status === 'Scheduled' || g.status === 'Active'
  const cur = endOf(g); const extraIfExtended = forecastOf(g.mrr, Math.max(0, Math.round((Date.parse(to) - Date.parse(cur)) / 864e5)))
  return (
    <Overlay open onClose={onClose} title={`${g.id} · ${g.name}`} side wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[g.status]}>{g.status}</Badge>
          {g.approval === 'pending' && <Badge tone="amber">Awaiting second approver</Badge>}
          {g.approval === 'rejected' && <Badge tone="red">Rejected</Badge>}
          {g.status === 'Active' && <Badge tone={remaining(g) <= 7 ? 'amber' : 'teal'}>{remaining(g)} day{remaining(g) === 1 ? '' : 's'} left</Badge>}
          <span className="text-sm text-slate">{periodText(g)}</span>
        </div>
        <p className="text-sm text-slate">{g.reason}</p>
        <dl className="grid gap-3 rounded-lg border border-line p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate">Scope</dt><dd>{describeScope(g.scope, b)}</dd></div>
          <div><dt className="text-xs text-slate">Audience</dt><dd>{describeAudience(g.audience, b)}</dd></div>
          <div><dt className="text-xs text-slate">At the end</dt><dd>{CONVERSION_LABEL[g.conversion]}</dd></div>
          <div><dt className="text-xs text-slate">Tenant notice</dt><dd>{g.notify === 'tenant' ? 'Banner and inbox' : 'Internal only'}</dd></div>
          <div><dt className="text-xs text-slate">Forgone revenue</dt><dd className="num">{ngn(g.forecast)} <span className="text-slate">({ngn(g.mrr)} / month)</span></dd></div>
          <div><dt className="text-xs text-slate">Created by / approved by</dt><dd>{g.createdBy} / {g.approvedBy ?? (g.approval === 'not_required' ? `not required (under ${ngn(threshold)})` : 'pending')}</dd></div>
        </dl>

        {g.approval === 'pending' && (
          <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm text-amber-900">
            <b>Second approval needed.</b> Estimated forgone revenue of {ngn(g.forecast)} is above the {ngn(threshold)} threshold.
            {canApprove ? (g.createdBy.toLowerCase() === actor.toLowerCase()
              ? <p className="mt-1">You created this grant, so a different admin must approve it.</p>
              : <div className="mt-3 flex flex-wrap gap-2"><Btn s="sm" onClick={() => done(approveGrant(g.id, actor), 'Approved and scheduled')}>Approve</Btn><Btn s="sm" v="secondary" onClick={() => { setMode('reject'); setError('') }}>Reject</Btn></div>)
              : <p className="mt-1">You do not have permission to approve grants.</p>}
          </div>
        )}
        {g.pendingExtension && (
          <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm text-amber-900">
            <b>Extension waiting for a second approver:</b> to {fmtDate(g.pendingExtension.to)} (+{ngn(g.pendingExtension.extra)}), requested by {g.pendingExtension.by}. {g.pendingExtension.reason}
            {canApprove && <div className="mt-3 flex gap-2"><Btn s="sm" onClick={() => done(decideExtension(g.id, true, actor), 'Extension approved')}>Approve extension</Btn><Btn s="sm" v="secondary" onClick={() => done(decideExtension(g.id, false, actor), 'Extension declined')}>Decline</Btn></div>}
          </div>
        )}
        {g.revoked && <div className="rounded-lg border border-err/30 bg-err/5 p-4 text-sm text-err"><b>{g.approval === 'rejected' ? 'Rejected' : 'Revoked'} by {g.revoked.by}:</b> {g.revoked.reason}</div>}

        {canManage && (
          <div className="flex flex-wrap gap-2">
            {g.status === 'Draft' && g.approval === 'none' && <Btn s="sm" onClick={() => done(submitDraft(g.id, actor), 'Draft submitted')}>Submit draft</Btn>}
            {(g.status === 'Active' || g.status === 'Scheduled') && <Btn s="sm" v="secondary" onClick={() => { setMode('extend'); setError('') }}><CalendarPlus size={14} /> Extend</Btn>}
            {open && <Btn s="sm" v="secondary" onClick={() => { setMode('revoke'); setError('') }}><Ban size={14} /> Revoke</Btn>}
            <Btn s="sm" v="secondary" onClick={() => onDuplicate(g)}><Copy size={14} /> Duplicate</Btn>
          </div>
        )}
        {mode && (
          <div className="space-y-3 rounded-lg border border-line bg-softmint/30 p-4">
            {mode === 'extend' && <Field label="New end date" hint={`Adds about ${ngn(extraIfExtended)} of forgone revenue${extraIfExtended > threshold ? ', which needs a second approver' : ''}.`}><input type="date" min={shift(cur, 1)} className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></Field>}
            <Field label={mode === 'extend' ? 'Reason for extending (required)' : mode === 'revoke' ? 'Reason for revoking (required)' : 'Reason for rejecting (required)'}><textarea className={`${inputCls} h-20 py-2`} value={why} onChange={(e) => { setWhy(e.target.value); setError('') }} /></Field>
            {mode === 'revoke' && g.status === 'Active' && <p className="text-sm text-amber-900">Access is removed immediately and the tenant is notified.</p>}
            {error && <p role="alert" className="text-sm font-medium text-err">{error}</p>}
            <div className="flex gap-2">
              <Btn s="sm" v="primary" onClick={() => done(mode === 'extend' ? extendGrant(g.id, to, why, actor) : mode === 'revoke' ? revokeGrant(g.id, why, actor) : rejectGrant(g.id, why, actor), mode === 'extend' ? 'Extension recorded' : mode === 'revoke' ? 'Grant revoked' : 'Grant rejected')}>{mode === 'extend' ? 'Extend' : mode === 'revoke' ? 'Revoke grant' : 'Reject grant'}</Btn>
              <Btn s="sm" v="secondary" onClick={() => { setMode(''); setError('') }}>Cancel</Btn>
            </div>
          </div>
        )}
        {!mode && error && <p role="alert" className="text-sm font-medium text-err">{error}</p>}

        <Panel title={g.targets.length ? 'Affected tenants' : 'Tenants this would reach'}>
          <Table label="Affected tenants" pageSize={6} head={['Tenant', 'Plan', 'Monthly value', 'Outcome']} right={[2]}
            rows={subs.map((s) => { const o = g.outcomes.find((x) => x.subId === s.id); return [
              <Link key="c" className="font-semibold text-teal hover:underline" to={`/admin/billing/subscriptions/${s.id}`}>{s.company}</Link>, planById(b, s.planId)?.name ?? s.planId, ngn(monthlyValue(b, s, g.scope)),
              o ? <Badge key="o" tone={o.result === 'converted' ? 'green' : o.result === 'awaiting' ? 'amber' : o.result === 'revoked' ? 'red' : 'gray'}>{OUTCOME_LABEL[o.result]}</Badge> : g.status === 'Active' ? 'In effect' : g.status === 'Scheduled' ? 'Starts ' + fmtDate(g.startsAt) : '—'] })} />
          {subs.length === 0 && <p className="mt-2 text-sm text-slate">No eligible tenant matches this audience.</p>}
        </Panel>
        <Panel title="Timeline"><Timeline items={[...g.log].reverse().map((l) => ({ t: new Date(l.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), a: l.by, x: l.text }))} /></Panel>
      </div>
    </Overlay>
  )
}

/* ---------------- Page ---------------- */
export default function Grants() {
  const b = useBilling(); const st = useGrants(); const { can, actor } = useAdmin(); const toast = useToast()
  const [tab, setTab] = useState('Active'); const [wizard, setWizard] = useState<GrantInput | null>(null); const [openId, setOpenId] = useState<string | null>(null); const [policy, setPolicy] = useState(false)
  const [th, setTh] = useState(String(st.config.approvalThresholdNgn))
  useEffect(() => { syncGrants() }, [])
  const canManage = can('discounts'); const canApprove = can('approve')
  const threshold = st.config.approvalThresholdNgn
  const k = useMemo(() => kpis(st), [st])
  const series = useMemo(() => forgoneSeries(st), [st])
  const outcomes = useMemo(() => outcomeSeries(st), [st])
  const shown = st.grants.filter((g) => tab === 'All' || (tab === 'Active' ? g.status === 'Active' : tab === 'Scheduled' ? g.status === 'Scheduled' || g.status === 'Draft' : g.status === 'Ended' || g.status === 'Revoked'))
  const open = st.grants.find((g) => g.id === openId)
  const counts = { Active: st.grants.filter((g) => g.status === 'Active').length, Scheduled: st.grants.filter((g) => g.status === 'Scheduled' || g.status === 'Draft').length, Ended: st.grants.filter((g) => g.status === 'Ended' || g.status === 'Revoked').length, All: st.grants.length }
  const pending = st.grants.filter((g) => g.approval === 'pending').length
  const OUT_COLORS = [CHART.green, CHART.blue, CHART.amber, CHART.axis, CHART.red]
  const rows = shown.map((g) => [
    <button key="n" type="button" className="text-left font-semibold text-teal hover:underline" onClick={() => setOpenId(g.id)}>{g.name}<span className="block text-xs font-normal text-slate">{g.id} · {g.createdBy}</span></button>,
    <span key="s" className="block max-w-[220px] truncate text-sm" title={describeScope(g.scope, b)}>{describeScope(g.scope, b)}</span>,
    describeAudience(g.audience, b), periodText(g),
    <span key="st" className="flex flex-wrap gap-1"><Badge tone={STATUS_TONE[g.status]}>{g.status}</Badge>{g.approval === 'pending' && <Badge tone="amber">Needs approval</Badge>}</span>,
    String(g.targets.length || '—'), ngn(g.forecast), CONVERSION_LABEL[g.conversion],
  ])
  return (
    <div>
      <PageHeader eyebrow="Billing" title="Free periods & grants" desc="Give tenants modules, add-ons or a whole plan at no charge for a set period. Grants apply before coupons, never push a price below zero, and big ones need a second approver."
        actions={<>
          {canApprove && <Btn v="secondary" onClick={() => { setTh(String(threshold)); setPolicy(true) }}><Settings2 size={16} /> Approval threshold</Btn>}
          <ExportButton name="complimentary-grants" head={['ID', 'Name', 'Status', 'Approval', 'Scope', 'Audience', 'Starts', 'Ends', 'Tenants', 'Monthly forgone (NGN)', 'Estimated forgone (NGN)', 'At the end', 'Tenant notice', 'Created by', 'Approved by', 'Reason']}
            rows={st.grants.map((g) => [g.id, g.name, g.status, g.approval, describeScope(g.scope, b), describeAudience(g.audience, b), g.startsAt, endOf(g), String(g.targets.length), String(Math.round(g.mrr)), String(g.forecast), CONVERSION_LABEL[g.conversion], g.notify, g.createdBy, g.approvedBy ?? '', g.reason])} />
          {canManage && <Btn onClick={() => setWizard(blank())}><Plus size={16} /> New grant</Btn>}
        </>} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi i={0} label="Active grants" value={String(k.active)} sub={`${counts.Scheduled} scheduled or draft`} icon={<Gift size={15} />} />
        <Kpi i={1} label="Tenants benefiting" value={String(k.tenants)} sub="Right now" icon={<Users size={15} />} tone="blue" />
        <Kpi i={2} label="MRR forgone" value={ngn(k.mrr)} sub="From active grants" icon={<TrendingDown size={15} />} tone="amber" />
        <Kpi i={3} label="Ending within 7 days" value={String(k.exp7)} sub="Tenants get a banner" icon={<CalendarClock size={15} />} tone={k.exp7 ? 'amber' : 'teal'} />
        <Kpi i={4} label="Ending within 30 days" value={String(k.exp30)} sub="Plan the follow-up" icon={<CalendarClock size={15} />} tone="blue" />
        <Kpi i={5} label="Conversion of ended grants" value={k.conversion === null ? 'No data' : `${Math.round(k.conversion * 100)}%`} sub={`${k.converted} of ${k.ended} outcomes paid afterwards`} icon={<Repeat size={15} />} tone="green" />
      </div>
      {pending > 0 && <div className="mb-5 flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-amber-900" role="status"><ShieldCheck size={16} /> {pending} grant{pending === 1 ? ' is' : 's are'} waiting for a second approver.</div>}

      <div className="mb-6 grid gap-4 lg:grid-cols-5">
        <Panel title="Forgone revenue over time" className="lg:col-span-3">
          <div style={{ height: 250 }} role="img" aria-label="Forgone revenue per month, actual and projected">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} tickFormatter={(v) => (Number(v) >= 1e6 ? `${(Number(v) / 1e6).toFixed(1)}M` : Number(v) >= 1e3 ? `${Math.round(Number(v) / 1e3)}k` : String(v))} width={56} />
                <Tooltip formatter={(v, n) => [ngn(Number(v)), n]} {...chartTip} />
                <Legend iconType="square" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="forgone" name="Forgone" stackId="a" fill={CHART.teal} radius={[0, 0, 0, 0]} />
                <Bar dataKey="projected" name="Projected" stackId="a" fill={CHART.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Grants by outcome" className="lg:col-span-2">
          <div style={{ height: 250 }} role="img" aria-label="Number of tenant outcomes by result">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outcomes} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.axis }} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={110} tick={{ fontSize: 12, fill: CHART.axis }} />
                <Tooltip formatter={(v) => [String(v), 'Tenant outcomes']} {...chartTip} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>{outcomes.map((_, i) => <Cell key={i} fill={OUT_COLORS[i % OUT_COLORS.length]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Tabs tabs={TABS.map((t) => `${t} (${counts[t as keyof typeof counts]})`)} value={`${tab} (${counts[tab as keyof typeof counts]})`} onChange={(t) => setTab(t.split(' (')[0])} />
      <div className="mt-4">
        {rows.length === 0
          ? <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center"><Gift className="mx-auto text-slate" size={28} /><p className="mt-3 font-semibold">No {tab === 'All' ? '' : tab.toLowerCase() + ' '}grants</p><p className="mt-1 text-sm text-slate">{canManage ? 'Create a free period to give a tenant complimentary access.' : 'Nothing to show here yet.'}</p>{canManage && <div className="mt-4"><Btn onClick={() => setWizard(blank())}><Plus size={16} /> New grant</Btn></div>}</div>
          : <Table label="Free periods and grants" pageSize={8} head={['Grant', 'Scope', 'Audience', 'Period', 'Status', 'Tenants', 'Est. forgone', 'At the end']} right={[5, 6]} rows={rows} />}
      </div>

      {wizard && <Wizard key={JSON.stringify(wizard)} open onClose={() => setWizard(null)} initial={wizard} b={b} threshold={threshold} actor={actor} />}
      {open && <Detail key={open.id} g={open} b={b} onClose={() => setOpenId(null)} canManage={canManage} canApprove={canApprove} actor={actor} threshold={threshold}
        onDuplicate={(g) => { const i = toInput(g); setOpenId(null); setWizard({ ...i, name: `${g.name} (copy)`, startsAt: todayIso(), endsAt: i.endsAt ? shift(todayIso(), periodDays(i)) : undefined }) }} />}
      <Overlay open={policy} onClose={() => setPolicy(false)} title="Approval threshold">
        <div className="space-y-4">
          <p className="text-sm text-slate">A grant (or an extension) whose estimated forgone revenue is above this amount needs a second admin to approve it.</p>
          <Field label="Threshold (NGN)"><input type="number" min={0} className={`${inputCls} num`} value={th} onChange={(e) => setTh(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Btn v="secondary" onClick={() => setPolicy(false)}>Cancel</Btn><Btn onClick={() => { const n = Number(th); if (!Number.isFinite(n) || n < 0) return; setThreshold(n, actor); setPolicy(false); toast('Approval threshold updated') }}>Save</Btn></div>
        </div>
      </Overlay>
    </div>
  )
}
