import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Bar, BarChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Btn, EmptyState, ExportButton, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, useToast } from '../../components/ui'
import { CHART } from '../../components/charts'
import { useAudit, useTenants } from '../../tenant/store'
import { healthOf } from '../../platform/health'
import { fmtAt } from '../../platform/persist'
import { PAYOUT_MINIMUM, approveEntries, monthlySeries, money, payable, runAccruals, runPayout, savePartner, setPartnerStatus, statsOf, usePartners } from '../../data/partners'
import type { CommissionTier, PartnerKind } from '../../data/partners'
import { useAdmin } from './AdminLayout'

const ETONE = { Accrued: 'amber', Approved: 'blue', Paid: 'green' } as const
const KINDS: PartnerKind[] = ['Accounting firm', 'Consultancy', 'Agent']
const blank = { id: undefined as string | undefined, name: '', kind: 'Accounting firm' as PartnerKind, contact: '', email: '', code: '', months: 12, bank: '', tiers: [{ minActive: 0, pct: 10 }, { minActive: 5, pct: 15 }] as CommissionTier[] }
const tick = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v))

function Charts({ data }: { data: ReturnType<typeof monthlySeries> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Commission by month">
        <div className="h-56" role="img" aria-label="Commission earned per month"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid stroke={CHART.grid} vertical={false} /><XAxis dataKey="m" tick={{ fill: CHART.axis, fontSize: 12 }} /><YAxis tick={{ fill: CHART.axis, fontSize: 12 }} tickFormatter={tick} width={40} /><Tooltip formatter={(v) => money(Number(v))} /><Bar dataKey="commission" name="Commission" fill={CHART.teal} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </Panel>
      <Panel title="Referred MRR and signups">
        <div className="h-56" role="img" aria-label="Referred recurring revenue and signups per month"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data}><CartesianGrid stroke={CHART.grid} vertical={false} /><XAxis dataKey="m" tick={{ fill: CHART.axis, fontSize: 12 }} /><YAxis yAxisId="l" tick={{ fill: CHART.axis, fontSize: 12 }} tickFormatter={tick} width={40} /><YAxis yAxisId="r" orientation="right" allowDecimals={false} tick={{ fill: CHART.axis, fontSize: 12 }} width={24} /><Tooltip formatter={(v, n) => (n === 'Signups' ? String(v) : money(Number(v)))} /><Bar yAxisId="l" dataKey="mrr" name="Referred MRR" fill={CHART.blue} radius={[4, 4, 0, 0]} /><Line yAxisId="r" dataKey="signups" name="Signups" stroke={CHART.amber} strokeWidth={2} dot /></ComposedChart></ResponsiveContainer></div>
      </Panel>
    </div>
  )
}

/** Health of a referred company: live score when it exists in this workspace, last synced snapshot otherwise. */
function useHealthFor() {
  const tenants = useTenants(); const audit = useAudit()
  return (slug: string, snap: number) => { const t = tenants[slug]; return t ? { score: healthOf(t, audit).score, live: true } : { score: snap, live: false } }
}
const hTone = (n: number) => (n >= 70 ? 'green' : n >= 45 ? 'amber' : 'red')

export default function Partners() {
  const { id } = useParams()
  return id ? <Detail id={id} /> : <List />
}

function List() {
  const st = usePartners()
  const { can, actor } = useAdmin()
  const by = actor.split(' (')[0]
  const toast = useToast()
  const manage = can('payments')
  const [form, setForm] = useState<typeof blank | null>(null)
  const [err, setErr] = useState('')
  const [payoutRes, setPayoutRes] = useState<string>('')
  const stats = st.partners.map((p) => statsOf(st, p.id))
  const totals = { active: stats.reduce((n, s) => n + s.active.length, 0), mrr: stats.reduce((n, s) => n + s.mrr, 0), accrued: stats.reduce((n, s) => n + s.accrued, 0), approved: stats.reduce((n, s) => n + s.approved, 0), paid: stats.reduce((n, s) => n + s.paid, 0) }
  const series = useMemo(() => monthlySeries(st), [st])
  const top = [...stats].sort((a, b) => b.mrr - a.mrr)[0]

  const save = () => { if (!form) return; const r = savePartner(form, by); if (!r.ok) return setErr(r.error ?? ''); toast(form.id ? 'Partner updated' : 'Partner created'); setForm(null) }
  const pay = () => {
    const r = runPayout(by)
    setPayoutRes(r.paid.length ? `Paid ${money(r.paid.reduce((n, p) => n + p.amount, 0))} to ${r.paid.length} partner${r.paid.length === 1 ? '' : 's'}.` : 'No partner has an approved balance of at least ' + money(PAYOUT_MINIMUM) + '.')
    toast(r.paid.length ? 'Payout run complete' : 'Nothing to pay', r.paid.length ? undefined : 'err')
  }

  return (
    <div>
      <PageHeader eyebrow="Finance" title="Partners" desc="Accounting firms and agents who refer companies. Each has a referral code, a tiered commission and a ledger that runs Accrued, Approved, Paid." actions={<>
        <ExportButton name="partners" head={['Partner', 'Code', 'Active companies', 'Referred MRR', 'Rate', 'Approved', 'Paid']} rows={stats.map((s) => [s.p!.name, s.p!.code, String(s.active.length), String(s.mrr), `${s.pct}%`, String(s.approved), String(s.paid)])} />
        {manage && <Btn v="secondary" onClick={() => { const n = runAccruals(by); toast(n ? `${n} commission entr${n === 1 ? 'y' : 'ies'} accrued` : 'Already accrued for this month') }}>Run accruals</Btn>}
        {manage && <Btn v="secondary" onClick={pay}>Run payout</Btn>}
        {manage && <Btn onClick={() => { setForm({ ...blank }); setErr('') }}>Add partner</Btn>}
      </>} />
      {payoutRes && <div role="status" className="mb-4 rounded-lg border border-line bg-white p-3 text-sm text-ink">{payoutRes}</div>}
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
        {[<Stat key="a" label="Partners" value={String(st.partners.length)} sub={`${st.partners.filter((p) => p.status === 'Active').length} active`} />, <Stat key="b" label="Referred companies" value={String(totals.active)} sub="Active today" />, <Stat key="c" label="Referred MRR" value={money(totals.mrr)} sub="Monthly recurring" />, <Stat key="d" label="Owed (accrued + approved)" value={money(totals.accrued + totals.approved)} sub={`${money(totals.approved)} approved`} up={false} />, <Stat key="e" label="Paid to date" value={money(totals.paid)} sub="All partners" />].map((s, i) => <div key={i} className="bg-white">{s}</div>)}
      </div>
      <Charts data={series} />
      {top && <p className="mt-3 text-sm text-slate">Insight: {top.p!.name} drives {totals.mrr ? Math.round((top.mrr / totals.mrr) * 100) : 0}% of referred MRR. Commission costs {totals.mrr ? Math.round(((totals.accrued + totals.approved + totals.paid) / Math.max(1, st.ledger.reduce((n, l) => n + l.base, 0))) * 100) : 0}% of the revenue it was earned on.</p>}
      <div className="mt-5">
        {st.partners.length ? <Table label="Partners" head={['Partner', 'Referral code', 'Active', 'Referred MRR', 'Rate', 'Balance owed', 'Status']} right={[2, 3, 5]} rows={st.partners.map((p) => { const s = statsOf(st, p.id); return [
          <Link key="n" to={`/admin/partners/${p.id}`} className="font-medium text-teal hover:underline">{p.name}<span className="block text-xs font-normal text-slate">{p.kind} · {p.contact}</span></Link>,
          <code key="c" className="rounded bg-ink/5 px-1.5 py-0.5 text-xs">{p.code}</code>, String(s.active.length), money(s.mrr), `${s.pct}% for ${p.months} mo`, money(s.accrued + s.approved), <Badge key="s" tone={p.status === 'Active' ? 'green' : 'gray'}>{p.status}</Badge>] })} /> : <EmptyState title="No partners yet" body="Add an accounting firm or agent to give them a referral code." action={manage ? <Btn onClick={() => setForm({ ...blank })}>Add partner</Btn> : undefined} />}
      </div>
      <Overlay open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit partner' : 'Add partner'} side>
        {form && <PartnerForm form={form} setForm={setForm} err={err} onSave={save} />}
      </Overlay>
    </div>
  )
}

function PartnerForm({ form, setForm, err, onSave }: { form: typeof blank; setForm: (f: typeof blank) => void; err: string; onSave: () => void }) {
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm({ ...form, [k]: v })
  return (
    <div className="space-y-3">
      <Field label="Partner name"><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type"><select className={inputCls} value={form.kind} onChange={(e) => set('kind', e.target.value as PartnerKind)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
        <Field label="Referral code"><input className={inputCls} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></Field>
      </div>
      <Field label="Contact person"><input className={inputCls} value={form.contact} onChange={(e) => set('contact', e.target.value)} /></Field>
      <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
      <Field label="Payout account"><input className={inputCls} value={form.bank} onChange={(e) => set('bank', e.target.value)} /></Field>
      <Field label="Commission duration (months)" hint="How long each referred company earns commission."><input type="number" min={1} max={36} className={inputCls} value={form.months} onChange={(e) => set('months', +e.target.value)} /></Field>
      <div>
        <div className="mb-1 text-sm font-medium text-ink">Tiers</div>
        <p className="mb-2 text-xs text-slate">The rate rises as the partner has more active referred companies.</p>
        {form.tiers.map((t, i) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <input aria-label="Active companies from" type="number" min={0} className={inputCls} value={t.minActive} onChange={(e) => set('tiers', form.tiers.map((x, j) => (j === i ? { ...x, minActive: +e.target.value } : x)))} />
            <span className="text-xs text-slate">+ active at</span>
            <input aria-label="Percent" type="number" min={1} max={40} className={inputCls} value={t.pct} onChange={(e) => set('tiers', form.tiers.map((x, j) => (j === i ? { ...x, pct: +e.target.value } : x)))} />
            <span className="text-xs text-slate">%</span>
            {form.tiers.length > 1 && <Btn v="ghost" s="sm" onClick={() => set('tiers', form.tiers.filter((_, j) => j !== i))} aria-label="Remove tier">Remove</Btn>}
          </div>
        ))}
        <Btn v="ghost" s="sm" onClick={() => set('tiers', [...form.tiers, { minActive: (form.tiers.at(-1)?.minActive ?? 0) + 5, pct: (form.tiers.at(-1)?.pct ?? 10) + 5 }])}>Add tier</Btn>
      </div>
      {err && <p role="alert" className="text-sm text-err">{err}</p>}
      <Btn onClick={onSave}>Save partner</Btn>
    </div>
  )
}

function Detail({ id }: { id: string }) {
  const st = usePartners()
  const healthFor = useHealthFor()
  const { can, actor } = useAdmin()
  const by = actor.split(' (')[0]
  const toast = useToast()
  const manage = can('payments')
  const [tab, setTab] = useState('Overview')
  const [sel, setSel] = useState<string[]>([])
  const [form, setForm] = useState<typeof blank | null>(null)
  const [err, setErr] = useState('')
  const s = statsOf(st, id)
  const p = s.p
  const series = useMemo(() => monthlySeries(st, id), [st, id])
  if (!p) return <EmptyState title="Partner not found" body="It may have been removed." action={<Btn to="/admin/partners">Back to partners</Btn>} />
  const accrued = s.ledger.filter((l) => l.status === 'Accrued')
  const owed = payable(st.ledger, id).reduce((n, l) => n + l.amount, 0)
  const payouts = st.payouts.filter((x) => x.partnerId === id)
  const nextTier = [...p.tiers].sort((a, b) => a.minActive - b.minActive).find((t) => t.minActive > s.active.length)
  const portal = tab === 'Partner portal'

  return (
    <div>
      <PageHeader eyebrow="Partners" title={p.name} desc={`${p.kind} · ${p.contact} · ${p.email} · partner since ${p.since}`} actions={<>
        <Badge tone={p.status === 'Active' ? 'green' : 'gray'}>{p.status}</Badge>
        {manage && <Btn v="secondary" onClick={() => { setForm({ id: p.id, name: p.name, kind: p.kind, contact: p.contact, email: p.email, code: p.code, months: p.months, bank: p.bank, tiers: p.tiers }); setErr('') }}>Edit</Btn>}
        {manage && <Btn v="secondary" onClick={() => { setPartnerStatus(p.id, p.status === 'Active' ? 'Paused' : 'Active', by); toast(p.status === 'Active' ? 'Partner paused. New signups with the code are not attributed.' : 'Partner reactivated') }}>{p.status === 'Active' ? 'Pause' : 'Reactivate'}</Btn>}
      </>} />
      <Tabs tabs={['Overview', 'Referred companies', 'Commission ledger', 'Partner portal']} value={tab} onChange={setTab} />
      {portal && <div role="note" className="mt-4 rounded-lg border border-teal/30 bg-teal/5 p-3 text-sm text-ink">Read-only view of what {p.contact} sees when signed in to the partner portal. Nothing here can be changed.</div>}
      <div className="mt-4 space-y-5">
        {(tab === 'Overview' || portal) && <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
            {[<Stat key="a" label="Active companies" value={String(s.active.length)} sub={`${s.attrs.length} referred in total`} />, <Stat key="b" label="Referred MRR" value={money(s.mrr)} />, <Stat key="c" label="Current rate" value={`${s.pct}%`} sub={nextTier ? `${nextTier.pct}% at ${nextTier.minActive} active` : 'Top tier'} />, <Stat key="d" label="Owed" value={money(s.accrued + s.approved)} sub={`${money(s.approved)} approved`} up={false} />, <Stat key="e" label="Paid to date" value={money(s.paid)} sub={`${s.churnRate}% churned`} />].map((x, i) => <div key={i} className="bg-white">{x}</div>)}
          </div>
          <Charts data={series} />
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Referral code"><div className="flex items-center gap-3"><code className="rounded bg-ink/5 px-2 py-1 text-lg font-semibold tracking-wider">{p.code}</code><span className="text-sm text-slate">Quoted at sign-up on Get started.</span></div></Panel>
            <Panel title="Commission plan"><ul className="space-y-1 text-sm">{p.tiers.map((t, i) => <li key={i} className="flex justify-between"><span className="text-slate">{t.minActive}+ active companies</span><span className="num font-semibold">{t.pct}%</span></li>)}</ul><p className="mt-2 text-xs text-slate">Earned for {p.months} months per referred company. Payout account {p.bank || 'not set'}.</p></Panel>
          </div>
        </>}
        {(tab === 'Referred companies' || portal) && (
          <Panel title={portal ? 'Managed companies' : 'Attribution'} pad={false}>
            {s.attrs.length ? <Table label="Referred companies" head={['Company', 'Plan', 'Monthly', 'Referred', 'Health', 'Status']} right={[2]} rows={s.attrs.map((a) => { const h = healthFor(a.slug, a.health); return [
              <div key="c"><div className="font-medium text-ink">{a.company}</div><div className="text-xs text-slate">{a.slug}</div></div>, a.plan || 'Not set', money(a.monthly), new Date(a.at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
              a.status === 'Churned' ? <span key="h" className="text-xs text-slate">Not tracked</span> : <span key="h" className="flex items-center gap-1.5"><Badge tone={hTone(h.score)}>{h.score}</Badge><span className="text-xs text-slate">{h.live ? 'Live' : 'Last synced'}</span></span>,
              <Badge key="s" tone={a.status === 'Active' ? 'green' : 'red'}>{a.status}</Badge>] })} /> : <EmptyState title="No referred companies" body="Companies that sign up with this code will appear here." />}
          </Panel>
        )}
        {(tab === 'Commission ledger' || portal) && <>
          {tab === 'Commission ledger' && manage && (
            <div className="flex flex-wrap items-center gap-2">
              <Btn s="sm" disabled={!sel.length} onClick={() => { const n = approveEntries(sel, by); setSel([]); toast(`${n} entr${n === 1 ? 'y' : 'ies'} approved`) }}>Approve selected ({sel.length})</Btn>
              <Btn v="secondary" s="sm" disabled={!accrued.length} onClick={() => setSel(accrued.map((a) => a.id))}>Select all accrued</Btn>
              <span className="text-xs text-slate">Approved balance {money(owed)}{owed < PAYOUT_MINIMUM && owed > 0 ? `, below the ${money(PAYOUT_MINIMUM)} payout minimum` : ''}. Pay from Partners, Run payout.</span>
            </div>
          )}
          <Panel title={portal ? 'Statements' : 'Ledger'} pad={false}>
            {s.ledger.length ? <Table label="Commission ledger" pageSize={10} head={tab === 'Commission ledger' && manage ? ['', 'Company', 'Period', 'Base', 'Rate', 'Commission', 'Status'] : ['Company', 'Period', 'Base', 'Rate', 'Commission', 'Status']} right={tab === 'Commission ledger' && manage ? [3, 5] : [2, 4]} rows={s.ledger.map((l) => {
              const cells = [l.company, l.period, money(l.base), `${l.pct}%`, money(l.amount), <Badge key="s" tone={ETONE[l.status]}>{l.status}</Badge>]
              return tab === 'Commission ledger' && manage ? [l.status === 'Accrued' ? <input key="x" type="checkbox" aria-label={`Select ${l.company} ${l.period}`} checked={sel.includes(l.id)} onChange={(e) => setSel(e.target.checked ? [...sel, l.id] : sel.filter((x) => x !== l.id))} /> : '', ...cells] : cells })} /> : <EmptyState title="No commission yet" body="Commission accrues monthly once a referred company is active." />}
          </Panel>
          {payouts.length > 0 && <Panel title="Payout history"><ul className="divide-y divide-line text-sm">{payouts.map((x) => <li key={x.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{fmtAt(x.at)} · {x.entries} entries · ref {x.reference}</span><span className="num font-semibold">{money(x.amount)}</span></li>)}</ul></Panel>}
        </>}
      </div>
      <Overlay open={!!form} onClose={() => setForm(null)} title="Edit partner" side>{form && <PartnerForm form={form} setForm={setForm} err={err} onSave={() => { const r = savePartner(form, by); if (!r.ok) return setErr(r.error ?? ''); toast('Partner updated'); setForm(null) }} />}</Overlay>
    </div>
  )
}
