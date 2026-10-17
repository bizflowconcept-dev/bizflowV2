import { useMemo, useState } from 'react'
import { Badge, Btn, EmptyState, ExportButton, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, Timeline, useToast } from '../../components/ui'
import { TIERS, useTenants } from '../../tenant/store'
import { describe, flagState, killAll, setKill, setOverride, setPercent, setPlans, setRolloutMode, setStatus, setTenantList, useRollouts } from '../../platform/rollout'
import type { FlagStatus, Rollout } from '../../platform/rollout'
import { fmtAt } from '../../platform/persist'
import { useAdmin } from './AdminLayout'
import { CalendarTab, GuardrailsTab, OverridesTab } from './RolloutGuardrails'

const TONE: Record<FlagStatus, string> = { Off: 'gray', Beta: 'blue', GA: 'green' }

export default function FeatureRollout() {
  const flags = useRollouts()
  const tenants = useTenants()
  const { can, actor } = useAdmin()
  const by = actor.split(' (')[0]
  const toast = useToast()
  const [tab, setTab] = useState('Flags')
  const [open, setOpen] = useState<string | null>(null)
  const [killAsk, setKillAsk] = useState(false)
  const [rel, setRel] = useState<Rollout | null>(null)
  const [relWhy, setRelWhy] = useState('')
  const sel = flags.find((f) => f.key === open)
  const list = Object.values(tenants)
  const edit = can('settings')
  const history = useMemo(() => flags.flatMap((f) => f.history.map((c) => ({ ...c, flag: f.name }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40), [flags])

  return (
    <div>
      <PageHeader eyebrow="Configuration" title="Feature flags and rollout" desc="Control which companies see a feature, by plan, percentage or named tenants. Every change is recorded in the audit trail." actions={<>
        <ExportButton name="feature-flags" head={['Flag', 'Status', 'Rollout', 'Kill switch', 'Companies on']} rows={flags.map((f) => [f.key, f.status, describe(f), f.killed ? 'Engaged' : 'Released', String(list.filter((t) => flagState(f, t).on).length)])} />
        {edit && <Btn v="secondary" onClick={() => setKillAsk(true)}>Kill all live flags</Btn>}
      </>} />
      <Overlay open={killAsk} onClose={() => setKillAsk(false)} title="Engage the kill switch on every live flag?" alert>
        <p className="text-sm text-slate">Every Beta and GA feature turns off for all companies immediately. Each flag can be released again individually.</p>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setKillAsk(false)}>Cancel</Btn><Btn onClick={() => { const n = killAll(by); setKillAsk(false); toast(`Kill switch engaged on ${n} flag(s)`) }}>Engage kill switch</Btn></div>
      </Overlay>
      <Overlay open={!!rel} onClose={() => setRel(null)} title={`Release the kill switch on ${rel?.name ?? ''}?`}>
        <Field label="Reason"><input className={inputCls} value={relWhy} onChange={(e) => setRelWhy(e.target.value)} placeholder="e.g. Fix deployed and verified" /></Field>
        <div className="mt-5 flex justify-end gap-2"><Btn v="secondary" onClick={() => setRel(null)}>Cancel</Btn><Btn onClick={() => { if (!relWhy.trim()) { toast('A reason is required.'); return } setKill(rel!.key, false, by, relWhy.trim()); toast(`${rel!.name} released`); setRel(null) }}>Release</Btn></div>
      </Overlay>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel><Stat label="Flags" value={String(flags.length)} /></Panel>
        <Panel><Stat label="GA" value={String(flags.filter((f) => f.status === 'GA' && !f.killed).length)} /></Panel>
        <Panel><Stat label="In Beta" value={String(flags.filter((f) => f.status === 'Beta' && !f.killed).length)} /></Panel>
        <Panel><Stat label="Killed" value={String(flags.filter((f) => f.killed).length)} sub="forced off" /></Panel>
      </div>
      <div className="mt-6"><Tabs tabs={['Flags', 'Overrides', 'Tenant matrix', 'Release calendar', 'Auto rollback', 'Change history']} value={tab} onChange={setTab} /></div>
      <div className="mt-5">
        {tab === 'Flags' && <Table label="Feature flags" head={['Feature', 'Status', 'Rollout', 'Plans', 'Companies on', 'Kill switch']} rows={flags.map((f) => [
          <button key="n" onClick={() => setOpen(f.key)} className="cursor-pointer text-left"><span className="block font-semibold text-teal hover:underline">{f.name}</span><span className="font-mono text-[11px] text-slate">{f.key}</span></button>,
          <Badge key="s" tone={f.killed ? 'red' : TONE[f.status]}>{f.killed ? 'Killed' : f.status}</Badge>,
          f.status === 'GA' ? 'Everyone' : f.status === 'Off' ? '-' : f.mode === 'percent' ? `${f.percent}% of companies` : `${f.tenants.length} named`,
          f.plans.length ? f.plans.join(', ') : 'All',
          `${list.filter((t) => flagState(f, t).on).length} of ${list.length}`,
          edit ? <Btn key="k" s="sm" v={f.killed ? 'primary' : 'secondary'} onClick={() => { if (f.killed) { setRelWhy(''); setRel(f) } else { setKill(f.key, true, by); toast(`${f.name} killed`) } }}>{f.killed ? 'Release' : 'Kill'}</Btn> : <span key="k">{f.killed ? 'Engaged' : 'Released'}</span>,
        ])} />}
        {tab === 'Overrides' && <OverridesTab by={by} edit={edit} />}
        {tab === 'Release calendar' && <CalendarTab by={by} edit={edit} />}
        {tab === 'Auto rollback' && <GuardrailsTab by={by} edit={edit} />}
        {tab === 'Tenant matrix' && (list.length ? <Table label="Tenant matrix" head={['Company', 'Plan', ...flags.map((f) => f.name)]} rows={list.map((t) => [t.profile.name, t.plan, ...flags.map((f) => { const s = flagState(f, t); return <span key={f.key} title={s.why}><Badge tone={s.on ? 'green' : 'gray'}>{s.on ? 'On' : 'Off'}</Badge></span> })])} /> : <EmptyState title="No companies" body="Create a business first." />)}
        {tab === 'Change history' && <Panel>{history.length ? <Timeline items={history.map((c) => ({ t: fmtAt(c.at), a: c.by, x: `${c.flag}: ${c.text}` }))} /> : <p className="text-sm text-slate">No changes yet.</p>}</Panel>}
      </div>
      <Overlay open={!!sel} onClose={() => setOpen(null)} title={sel?.name ?? 'Feature'} side wide>
        {sel && <Detail f={sel} by={by} edit={edit} />}
      </Overlay>
    </div>
  )
}

function Detail({ f, by, edit }: { f: Rollout; by: string; edit: boolean }) {
  const toast = useToast()
  const tenants = Object.values(useTenants())
  const [pct, setPct] = useState(String(f.percent))
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  return (
    <div className="space-y-5">
      <p className="text-sm text-slate">{f.desc} <span className="font-mono text-xs">{f.key}</span> · owner {f.owner}</p>
      {f.killed && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-800">Kill switch engaged. This feature is off for every company until released.</div>}
      <Panel title="Status and reach">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status"><select className={inputCls} disabled={!edit} value={f.status} onChange={(e) => { setStatus(f.key, e.target.value as FlagStatus, by); toast(`${f.name} is now ${e.target.value}`) }}>{['Off', 'Beta', 'GA'].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Beta audience"><select className={inputCls} disabled={!edit || f.status !== 'Beta'} value={f.mode} onChange={(e) => setRolloutMode(f.key, e.target.value as Rollout['mode'], by)}><option value="percent">Percentage of companies</option><option value="tenants">Named companies</option></select></Field>
        </div>
        {f.status === 'Beta' && f.mode === 'percent' && (
          <div className="mt-4 flex items-end gap-2">
            <div className="w-32"><Field label="Rollout %"><input type="number" min={0} max={100} className={inputCls} disabled={!edit} value={pct} onChange={(e) => setPct(e.target.value)} /></Field></div>
            <Btn s="sm" disabled={!edit || Number(pct) === f.percent || Number(pct) < 0 || Number(pct) > 100} onClick={() => { setPercent(f.key, Math.round(Number(pct)), by); toast(`Rollout set to ${pct}%`) }}>Apply</Btn>
          </div>
        )}
        {f.status === 'Beta' && f.mode === 'tenants' && (
          <fieldset className="mt-4"><legend className="mb-1 text-[13px] font-semibold">Beta companies</legend>
            <div className="flex flex-wrap gap-2">{tenants.map((t) => <label key={t.slug} className="flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-sm"><input type="checkbox" className="accent-teal" disabled={!edit} checked={f.tenants.includes(t.slug)} onChange={() => setTenantList(f.key, toggle(f.tenants, t.slug), by)} />{t.profile.name}</label>)}</div>
          </fieldset>
        )}
        <fieldset className="mt-4"><legend className="mb-1 text-[13px] font-semibold">Available on plans</legend>
          <div className="flex flex-wrap gap-2">{TIERS.map((p) => <label key={p} className="flex min-h-9 items-center gap-2 rounded-md border border-line px-3 text-sm"><input type="checkbox" className="accent-teal" disabled={!edit} checked={f.plans.length === 0 || f.plans.includes(p)} onChange={() => { const cur = f.plans.length ? f.plans : [...TIERS]; const next = toggle(cur, p); setPlans(f.key, next.length === TIERS.length || next.length === 0 ? [] : next, by) }} />{p}</label>)}</div>
          <p className="mt-1 text-xs text-slate">Unticking a plan removes the feature for companies on it, whatever the rollout.</p>
        </fieldset>
      </Panel>
      <Panel title="Per-company overrides" pad={false}>
        <Table label="Overrides" pageSize={6} head={['Company', 'Plan', 'Result', 'Override']} rows={tenants.map((t) => { const s = flagState(f, t); return [t.profile.name, t.plan, <span key="r" className="flex flex-col"><Badge tone={s.on ? 'green' : 'gray'}>{s.on ? 'On' : 'Off'}</Badge><span className="text-[11px] text-slate">{s.why}</span></span>,
          <select key="o" aria-label={`Override for ${t.profile.name}`} className={`${inputCls} !h-8 !w-28`} disabled={!edit} value={f.overrides[t.slug] ?? ''} onChange={(e) => { setOverride(f.key, t.slug, (e.target.value || null) as 'on' | 'off' | null, by); toast(`Override updated for ${t.profile.name}`) }}><option value="">Default</option><option value="on">Force on</option><option value="off">Force off</option></select>] })} />
      </Panel>
      <Panel title="Change history">{f.history.length ? <Timeline items={f.history.slice(0, 15).map((c) => ({ t: fmtAt(c.at), a: c.by, x: c.text }))} /> : <p className="text-sm text-slate">No changes yet.</p>}</Panel>
      {!edit && <p className="text-xs text-slate">Only roles with Manage Platform Settings can change flags.</p>}
    </div>
  )
}
