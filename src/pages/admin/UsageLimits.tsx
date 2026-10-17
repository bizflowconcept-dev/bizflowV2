import { useMemo, useState } from 'react'
import { Badge, Btn, EmptyState, ExportButton, Field, Overlay, PageHeader, Panel, Table, inputCls, useToast } from '../../components/ui'
import { useAdmin } from './AdminLayout'
import { LIMIT_DEFS, fmtDate } from '../../data/billing'
import type { LimitKey } from '../../data/billing'
import { MAX_GRANT_DAYS, grantOverage, isActiveGrant, meterCells, revokeGrant, runAutoNudge, sendNudge, setMeterSettings, upliftFor, useMetering } from '../../billing/metering'
import type { MeterCell } from '../../billing/metering'
import { usePortfolioTenants } from '../../billing/portfolio'
import type { PortfolioTenant } from '../../billing/portfolio'
import { fmtN } from '../../billing/ledger'

const TONE = { ok: 'green', warn: 'amber', full: 'red', unlimited: 'gray' } as const
const fmtCell = (c: MeterCell) => `${c.used.toLocaleString()} / ${c.limit === null ? 'Unlimited' : c.limit.toLocaleString()}${c.unit && c.limit !== null ? ' ' + c.unit : ''}`

export default function UsageLimits() {
  const { can, actor } = useAdmin()
  const toast = useToast()
  const { s, tenants } = usePortfolioTenants()
  const m = useMetering()
  const act = can('subscriptions')
  const [key, setKey] = useState<'all' | LimitKey>('all')
  const [onlyHot, setOnlyHot] = useState(true)
  const [grantFor, setGrantFor] = useState<{ t: PortfolioTenant; key: LimitKey } | null>(null)
  const [extra, setExtra] = useState('') ; const [days, setDays] = useState('14'); const [reason, setReason] = useState(''); const [err, setErr] = useState('')

  const data = useMemo(() => tenants.filter((t) => ['active', 'past_due', 'grace', 'payment_failed', 'trial'].includes(t.sub.status)).map((t) => {
    const cells = meterCells(s, t.sub, m.grants)
    const hot = cells.filter((c) => c.state === 'warn' || c.state === 'full')
    return { t, cells, hot, worst: Math.max(0, ...cells.map((c) => (c.pct === null ? 0 : c.pct))), uplift: upliftFor(s, t, cells) }
  }).sort((a, b) => b.worst - a.worst), [s, tenants, m.grants])

  const visible = data.filter((d) => (key === 'all' ? true : d.cells.find((c) => c.key === key)) && (!onlyHot || (key === 'all' ? d.hot.length > 0 : d.hot.some((c) => c.key === key))))
  const candidates = data.filter((d) => d.hot.length > 0 && d.uplift.kind !== 'none')
  const potential = candidates.reduce((n, d) => n + d.uplift.monthly, 0)
  const full = data.filter((d) => d.cells.some((c) => c.state === 'full')).length
  const activeGrants = m.grants.filter(isActiveGrant)

  const nudgeAll = (d: (typeof data)[number]) => {
    let sent = 0
    d.hot.forEach((c) => { if (!sendNudge(d.t, c, actor)) sent++ })
    toast(sent ? `Nudge sent to ${d.t.name}` : 'Nothing to send')
  }
  const submitGrant = () => {
    if (!grantFor) return
    const e = grantOverage(grantFor.t, grantFor.key, Number(extra.replace(/\D/g, '')), Number(days), reason, actor)
    if (e) { setErr(e); return }
    toast('Temporary overage granted'); setGrantFor(null); setExtra(''); setReason(''); setErr('')
  }
  const auto = () => { const n = runAutoNudge(s, tenants, actor); toast(m.settings.auto ? `${n} nudge${n === 1 ? '' : 's'} sent` : 'Switch auto-nudge on first', m.settings.auto ? 'ok' : 'err') }

  return (
    <div className="space-y-5 p-4 sm:p-6 lg:p-8">
      <PageHeader eyebrow="Finance" title="Usage and limits" desc="Who is close to a plan limit, what the cheapest way to make room is, and a time-boxed overage when a customer needs breathing space." actions={<ExportButton name="usage-limits" head={['Tenant', 'Plan', 'Limit', 'Used', 'Limit value', 'Percent', 'State']} rows={data.flatMap((d) => d.cells.map((c) => [d.t.name, d.t.sub.planId, c.label, String(c.used), c.limit === null ? 'Unlimited' : String(c.limit), c.pct === null ? '' : String(Math.round(c.pct)), c.state]))} />} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[['At 80% or more', String(data.filter((d) => d.hot.length).length), 'accounts'], ['At a limit (100%)', String(full), 'accounts blocked from adding more'], ['Upgrade candidates', String(candidates.length), `${fmtN(potential)} extra a month if all upgrade`], ['Active overage grants', String(activeGrants.length), `Maximum ${MAX_GRANT_DAYS} days each`]].map(([l, v, h]) => (
          <div key={l} className="rounded-xl border border-line bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate">{l}</div><div className="num mt-1 text-2xl font-bold">{v}</div><div className="mt-0.5 text-xs text-slate">{h}</div></div>
        ))}
      </div>

      <Panel title="Usage against limits" pad={false}>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <Field label="Limit"><select className={inputCls} value={key} onChange={(e) => setKey(e.target.value as 'all' | LimitKey)}><option value="all">All limits</option>{LIMIT_DEFS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select></Field>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={onlyHot} onChange={(e) => setOnlyHot(e.target.checked)} /> Only accounts at 80% or more</label>
        </div>
        {visible.length === 0 ? <EmptyState title="No accounts to show" body="Nobody is at 80% of this limit. Untick the filter to see every account." /> : (
          <Table label="Usage by account" pageSize={10} right={[]} head={['Account', 'Plan', ...(key === 'all' ? ['Closest limit'] : ['Usage']), 'Used', 'State', 'Cheapest fix', 'Actions']}
            rows={visible.map((d) => {
              const c = key === 'all' ? ([...d.cells].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))[0]) : d.cells.find((x) => x.key === key)!
              return [<span key="n" className="font-semibold">{d.t.name}</span>, d.t.sub.planId, c.label, <span key="u" className="num">{fmtCell(c)}{c.extra > 0 && <span className="text-xs text-slate"> (+{c.extra} granted)</span>}</span>, <Badge key="b" tone={TONE[c.state]}>{c.pct === null ? 'Unlimited' : `${Math.round(c.pct)}%`}</Badge>, d.uplift.kind === 'none' ? <span key="f" className="text-slate">{d.hot.length ? d.uplift.note : '-'}</span> : <span key="f">{d.uplift.name} <span className="text-xs text-slate">+{fmtN(d.uplift.monthly)}/mo</span></span>,
                act && d.hot.length ? <span key="a" className="flex flex-wrap gap-2"><Btn s="sm" v="secondary" onClick={() => nudgeAll(d)}>Nudge</Btn><Btn s="sm" v="ghost" onClick={() => { setGrantFor({ t: d.t, key: (d.hot[0] ?? c).key }); setErr('') }}>Grant overage</Btn></span> : <span key="a" className="text-slate">-</span>]
            })} />
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Upgrade candidates" pad={false}>
          {candidates.length === 0 ? <EmptyState title="No candidates" body="Nobody is close enough to a limit to need a bigger plan." /> : (
            <Table label="Upgrade candidates" head={['Account', 'Suggestion', 'Extra per month', 'Why']} right={[2]} pageSize={6} rows={candidates.map((d) => [d.t.name, d.uplift.kind === 'addon' ? `Add-on: ${d.uplift.name}` : `Plan: ${d.uplift.name}`, fmtN(d.uplift.monthly), d.uplift.note])} />
          )}
        </Panel>
        <Panel title="Auto-nudge">
          <fieldset disabled={!act} className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={m.settings.auto} onChange={(e) => setMeterSettings({ auto: e.target.checked }, actor)} /> Send upgrade nudges automatically</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.settings.at80} onChange={(e) => setMeterSettings({ at80: e.target.checked }, actor)} /> At 80% of a limit</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.settings.at100} onChange={(e) => setMeterSettings({ at100: e.target.checked }, actor)} /> At 100% of a limit</label>
            <Field label="Do not repeat within (days)"><input type="number" min={1} max={60} className={inputCls} value={m.settings.cooldownDays} onChange={(e) => setMeterSettings({ cooldownDays: Math.max(1, Math.min(60, Number(e.target.value) || 1)) }, actor)} /></Field>
            <Btn s="sm" v="secondary" onClick={auto}>Run auto-nudge now</Btn>
            <p className="text-xs text-slate">Companies get an inbox notification linking to their billing page.</p>
          </fieldset>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Temporary overage grants" pad={false}>
          {m.grants.length === 0 ? <EmptyState title="No grants" body="Use Grant overage on a row above to give a customer extra room for up to 30 days." /> : (
            <Table label="Overage grants" head={['Account', 'Limit', 'Extra', 'Until', 'State', 'Reason', '']} right={[2]} pageSize={6}
              rows={m.grants.map((g) => [g.tenantName, LIMIT_DEFS.find((d) => d.key === g.key)?.label ?? g.key, `+${g.extra.toLocaleString()}`, fmtDate(g.expiresAt), <Badge key="s" tone={g.revoked ? 'gray' : isActiveGrant(g) ? 'green' : 'gray'}>{g.revoked ? 'Revoked' : isActiveGrant(g) ? 'Active' : 'Expired'}</Badge>, g.reason, act && isActiveGrant(g) ? <Btn key="r" s="sm" v="ghost" onClick={() => { revokeGrant(g, actor); toast('Grant revoked') }}>Revoke</Btn> : ''])} />
          )}
        </Panel>
        <Panel title="Nudges sent" pad={false}>
          {m.nudges.length === 0 ? <EmptyState title="No nudges yet" body="Nudges you or the auto-nudge send are logged here." /> : (
            <Table label="Nudges" head={['When', 'Account', 'Limit', 'Level', 'By', 'Delivered']} pageSize={6} rows={m.nudges.map((n) => [fmtDate(n.at), n.tenantName, LIMIT_DEFS.find((d) => d.key === n.key)?.label ?? n.key, `${n.level}%`, n.by, n.delivered])} />
          )}
        </Panel>
      </div>

      <Overlay open={!!grantFor} onClose={() => setGrantFor(null)} title="Grant temporary overage">
        {grantFor && (
          <div className="space-y-3">
            <p className="text-sm text-slate">{grantFor.t.name}. The extra room is added to the plan limit and disappears on its own at the end date.</p>
            <Field label="Limit"><select className={inputCls} value={grantFor.key} onChange={(e) => setGrantFor({ ...grantFor, key: e.target.value as LimitKey })}>{LIMIT_DEFS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select></Field>
            <Field label="Extra units"><input inputMode="numeric" className={inputCls} value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
            <Field label={`Days (1 to ${MAX_GRANT_DAYS})`}><input type="number" min={1} max={MAX_GRANT_DAYS} className={inputCls} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
            <Field label="Reason (required)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            {err && <p role="alert" className="text-sm text-err">{err}</p>}
            <div className="flex gap-2"><Btn onClick={submitGrant}>Grant</Btn><Btn v="ghost" onClick={() => setGrantFor(null)}>Cancel</Btn></div>
          </div>
        )}
      </Overlay>
    </div>
  )
}
