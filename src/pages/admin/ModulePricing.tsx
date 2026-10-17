import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, ArrowRight, CalendarClock, Copy, Download, FileUp, Plus, Search, Trash2, Upload } from 'lucide-react'
import { Badge, Btn, Field, inputCls, Overlay, PageHeader, Panel, Stat, Tabs, useToast } from '../../components/ui'
import { liveGrants, grantCoversModule, useGrants } from '../../data/grants'
import { BILLING_MODELS, GROUPS, MODULES, TODAY, activeCurrencies, availabilityOf, defaultCurrency, depsOf, fmtDate, iso, modelOf, money, moduleById, nid, quoteModules, useBilling } from '../../data/billing'
import type { Availability, BillingModel, BillingState, Bundle, ModulePrice, PricingSnapshot } from '../../data/billing'
import {
  CURRENCY_CODES, MRR_ASSUMPTION, blankRate, bulkEdit, cancelScheduled, diffPricing, discardDraft, duplicateRate, editDraft, editRate, exportCsv, importCsv, newBand, publishDraft, validateSnapshot,
} from '../../data/modulePricing'
import type { BulkOp } from '../../data/modulePricing'
import { Gate, useAdmin } from './AdminLayout'

const TABS = ['Modules', 'Plan availability', 'Bundles', 'Simulator', 'Scheduled', 'History']
const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(v) || 0))
const signed = (n: number, code: string, s: BillingState) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n), code, { trim: true, s })}`

function Num({ value, onChange, label, disabled, step }: { value: number; onChange: (n: number) => void; label: string; disabled?: boolean; step?: number }) {
  return <input aria-label={label} type="number" min={0} step={step} disabled={disabled} className={`${inputCls} num`} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(num(e.target.value))} />
}
const Check = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) => (
  <label className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'}`}><input type="checkbox" disabled={disabled} className="size-4 accent-teal" checked={on} onChange={(e) => onChange(e.target.checked)} />{label}</label>
)

export default function ModulePricing() {
  const s = useBilling(); const { can, actor } = useAdmin(); const toast = useToast()
  const gst = useGrants()
  const compNow = gst.grants.filter((g) => g.status === 'Active' && liveGrants().some((x) => x.id === g.id))
  const compTenants = new Set(compNow.flatMap((g) => g.targets)).size
  const [tab, setTab] = useState('Modules')
  const canEdit = can('pricing'); const canAvail = can('plans') && canEdit; const canBundle = can('addons') && canEdit
  const snap: PricingSnapshot = s.draft ?? { rates: s.modulePrices, bundles: s.bundles, starterMinimum: s.starterMinimum }
  const diff = useMemo(() => (s.draft ? diffPricing(s, s.draft) : null), [s])
  const issues = useMemo(() => (s.draft ? validateSnapshot(s.draft, s) : validateSnapshot(snap, s)), [s]) // eslint-disable-line react-hooks/exhaustive-deps
  const errors = issues.filter((i) => i.level === 'error')
  const [editId, setEditId] = useState<string | null>(null)
  const [publish, setPublish] = useState(false); const [bulk, setBulk] = useState(false); const [csv, setCsv] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const cur = defaultCurrency(s)
  const scheduled = s.scheduled.filter((x) => x.status === 'scheduled')

  return (
    <Gate perm="view">
      {compNow.length > 0 && <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-softmint/50 px-4 py-2.5 text-sm"><Badge tone="teal">Complimentary</Badge><span>{compNow.length} active free period{compNow.length === 1 ? '' : 's'} cover {compNow.reduce((n, g) => n + g.scope.modules.filter((m) => grantCoversModule(s, g, m)).length, 0)} module grant{compNow.length === 1 ? '' : 's'} for {compTenants} tenant{compTenants === 1 ? '' : 's'}. Complimentary modules bill at zero for them; list prices here are unchanged.</span><Link to="/admin/billing/grants" className="font-semibold text-teal hover:underline">View grants</Link></div>}
      <PageHeader eyebrow="Billing & Pricing" title="Module pricing" desc="Set what each module costs, how it is billed and which plans get it. Changes are drafted here and only reach onboarding, quotes and checkout when you publish."
        actions={<>
          <Btn v="secondary" onClick={() => setCsv(true)}><Upload size={15} className="mr-1.5" />CSV</Btn>
          {canEdit && <Btn v="secondary" onClick={() => setBulk(true)}>Bulk edit{picked.length ? ` (${picked.length})` : ''}</Btn>}
        </>} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel><Stat label="Priced modules" value={String(snap.rates.filter((r) => r.active).length)} sub={`${snap.rates.length} on the price list`} /></Panel>
        <Panel><Stat label="Bundles" value={String(snap.bundles.filter((b) => b.active).length)} sub={`${snap.bundles.length} configured`} /></Panel>
        <Panel><Stat label="Scheduled changes" value={String(scheduled.length)} sub={scheduled[0] ? `Next on ${fmtDate(scheduled.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0].effectiveFrom)}` : 'None pending'} /></Panel>
        <Panel><Stat label="Pricing release" value={`#${s.pricingRelease}`} sub={`${s.priceHistory.length} history entries`} /></Panel>
      </div>

      {s.draft ? (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle size={18} className="shrink-0" />
          <div className="min-w-0 flex-1"><b>Unpublished draft.</b> {diff?.changes.length ?? 0} change{diff?.changes.length === 1 ? '' : 's'} across {diff?.modules.length ?? 0} module{diff?.modules.length === 1 ? '' : 's'}, {diff?.prices ?? 0} price{diff?.prices === 1 ? '' : 's'} changed
            {diff && diff.mrr !== 0 && <> · <b>{signed(diff.mrr, 'NGN', s)} MRR est.</b></>}. Customers still see the live prices.{errors.length > 0 && <> <b className="text-red-800">{errors.length} issue{errors.length > 1 ? 's' : ''} to fix before publishing.</b></>}</div>
          {canEdit && <><Btn v="secondary" s="sm" onClick={() => { discardDraft(); toast('Draft discarded.') }}>Discard</Btn><Btn s="sm" onClick={() => setPublish(true)}>Preview and publish</Btn></>}
        </div>
      ) : !canEdit && <p role="status" className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You can view module pricing but your role cannot change it.</p>}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === 'Modules' && <ModulesTab snap={snap} canEdit={canEdit} picked={picked} setPicked={setPicked} onEdit={setEditId} cur={cur} />}
        {tab === 'Plan availability' && <AvailabilityTab snap={snap} canEdit={canAvail} actor={actor} />}
        {tab === 'Bundles' && <BundlesTab snap={snap} canEdit={canBundle} actor={actor} />}
        {tab === 'Simulator' && <Simulator />}
        {tab === 'Scheduled' && <ScheduledTab canEdit={canEdit} actor={actor} />}
        {tab === 'History' && <HistoryTab />}
      </div>

      <RateEditor id={editId} onClose={() => setEditId(null)} snap={snap} canEdit={canEdit} actor={actor} />
      <PublishDialog open={publish} onClose={() => setPublish(false)} actor={actor} />
      <BulkDialog open={bulk} onClose={() => setBulk(false)} snap={snap} picked={picked} actor={actor} />
      <CsvDialog open={csv} onClose={() => setCsv(false)} snap={snap} canEdit={canEdit} actor={actor} />
    </Gate>
  )
}

/* ---------------- Modules table ---------------- */
function ModulesTab({ snap, canEdit, picked, setPicked, onEdit, cur }: { snap: PricingSnapshot; canEdit: boolean; picked: string[]; setPicked: (p: string[]) => void; onEdit: (id: string) => void; cur: string }) {
  const s = useBilling(); const { actor } = useAdmin()
  const [q, setQ] = useState(''); const [group, setGroup] = useState('all'); const [status, setStatus] = useState('all')
  const rows = MODULES.filter((m) => (group === 'all' || m.group === group) && m.name.toLowerCase().includes(q.toLowerCase())).map((m) => ({ m, r: snap.rates.find((x) => x.moduleId === m.id) })).filter(({ r }) => status === 'all' || (status === 'active' ? r?.active : !r?.active))
  const changed = new Set(s.draft ? diffPricing(s, s.draft).modules : [])
  const allPicked = rows.length > 0 && rows.every(({ m }) => picked.includes(m.id))
  const minimum = snap.starterMinimum
  return (
    <div className="space-y-5">
      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
          <div className="relative min-w-[200px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate" /><input aria-label="Search modules" placeholder="Search modules" className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select aria-label="Filter by area" className={`${inputCls} w-auto`} value={group} onChange={(e) => setGroup(e.target.value)}><option value="all">All areas</option>{GROUPS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <select aria-label="Filter by status" className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">Any status</option><option value="active">Offered</option><option value="inactive">Not offered</option></select>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm">
          <thead><tr className="border-b border-line bg-cloud text-left text-xs uppercase tracking-wider text-slate">
            <th className="w-10 px-3 py-2.5">{canEdit && <input type="checkbox" aria-label="Select all shown" className="size-4 accent-teal" checked={allPicked} onChange={(e) => setPicked(e.target.checked ? [...new Set([...picked, ...rows.map(({ m }) => m.id)])] : picked.filter((id) => !rows.some(({ m }) => m.id === id)))} />}</th>
            <th className="py-2.5">Module</th><th>Billing model</th><th className="text-right">From / mo ({cur})</th><th className="text-right">Setup</th><th className="text-right">Disc. mo / yr</th><th className="text-right">Trial</th><th>Requires</th><th>Status</th><th className="pr-3" />
          </tr></thead>
          <tbody>{rows.map(({ m, r }) => {
            const first = r?.bands.find((b) => !b.custom); const deps = r ? (r.requires ?? depsOf(s, m.id)) : []
            return (
              <tr key={m.id} className={`border-b border-line last:border-0 ${changed.has(m.id) ? 'bg-amber-50/60' : ''}`}>
                <td className="px-3 py-2.5">{canEdit && <input type="checkbox" aria-label={`Select ${m.name}`} className="size-4 accent-teal" checked={picked.includes(m.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.id] : picked.filter((x) => x !== m.id))} />}</td>
                <td className="py-2.5"><b>{m.name}</b>{r?.required && <span className="ml-2"><Badge tone="teal">Foundation</Badge></span>}{changed.has(m.id) && <span className="ml-2"><Badge tone="amber">Edited</Badge></span>}<div className="text-xs text-slate">{GROUPS.find((g) => g.id === m.group)?.name}</div></td>
                <td>{r ? BILLING_MODELS.find((b) => b.id === modelOf(r))?.name : '—'}</td>
                <td className="num text-right">{first?.prices[cur] ? money(first.prices[cur].monthly, cur, { trim: true, s }) : '—'}{r && r.bands.length > 2 && <div className="text-xs text-slate">{r.bands.length} bands</div>}</td>
                <td className="num text-right">{r?.setupFee?.[cur] ? money(r.setupFee[cur], cur, { trim: true, s }) : '—'}</td>
                <td className="num text-right">{r ? `${r.discountMonthly ?? 0}% / ${r.discountAnnual ?? 0}%` : '—'}</td>
                <td className="num text-right">{r?.trialDays ? `${r.trialDays} d` : '—'}</td>
                <td className="max-w-[160px] truncate text-xs text-slate" title={deps.map((d) => moduleById(d)?.name).join(', ')}>{deps.map((d) => moduleById(d)?.name).join(', ') || '—'}</td>
                <td>{r ? <Badge tone={r.active ? 'green' : 'gray'}>{r.active ? 'Offered' : 'Not offered'}</Badge> : <Badge tone="gray">Unpriced</Badge>}</td>
                <td className="pr-3 text-right"><button className="cursor-pointer text-sm font-semibold text-teal" onClick={() => { if (!r && canEdit) editRate(actor, m.id, (x) => x); onEdit(m.id) }}>{canEdit ? (r ? 'Edit' : 'Set up') : 'View'}</button></td>
              </tr>
            )
          })}{rows.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-slate">No modules match.</td></tr>}</tbody>
        </table></div>
      </Panel>
      <Panel title="Starter minimum charge">
        <p className="mb-4 text-sm text-slate">The lowest connected-platform charge. If selected modules total less, the difference is added to the quote.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CURRENCY_CODES.map((c) => <div key={c} className="grid grid-cols-[40px_1fr_1fr] items-end gap-2"><b className="pb-2 text-sm">{c}</b>
            {(['monthly', 'annual'] as const).map((k) => <Field key={k} label={k === 'monthly' ? 'Monthly' : 'Annual'}><Num label={`${c} minimum ${k}`} disabled={!canEdit} value={minimum[c]?.[k] ?? 0} onChange={(n) => editDraft(actor, (d) => ({ ...d, starterMinimum: { ...d.starterMinimum, [c]: { monthly: d.starterMinimum[c]?.monthly ?? 0, annual: d.starterMinimum[c]?.annual ?? 0, [k]: n } } }))} /></Field>)}</div>)}
        </div>
      </Panel>
    </div>
  )
}

/* ---------------- Rate editor ---------------- */
function RateEditor({ id, onClose, snap, canEdit, actor }: { id: string | null; onClose: () => void; snap: PricingSnapshot; canEdit: boolean; actor: string }) {
  const s = useBilling(); const toast = useToast()
  const rate = id ? snap.rates.find((r) => r.moduleId === id) : undefined
  const [src, setSrc] = useState('')
  const set = (fn: (r: ModulePrice) => ModulePrice) => id && editRate(actor, id, fn)
  const mod = id ? moduleById(id) : undefined
  const reqs = rate ? (rate.requires ?? depsOf(s, rate.moduleId)) : []
  const money4 = (rec: Record<string, number> | undefined, code: string) => rec?.[code] ?? 0
  return (
    <Overlay open={!!id} onClose={onClose} title={`Pricing: ${mod?.name ?? ''}`} side wide>
      {rate && mod && (
        <fieldset disabled={!canEdit} className="space-y-6">
          <section className="space-y-4">
            <h3 className="font-display text-base font-semibold">Commercials</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Billing model" hint={BILLING_MODELS.find((b) => b.id === modelOf(rate))?.hint}><select className={inputCls} value={modelOf(rate)} onChange={(e) => set((r) => ({ ...r, model: e.target.value as BillingModel }))}>{BILLING_MODELS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
              <Field label="Unit label" hint="Shown on quotes, for example employee or signature"><input className={inputCls} value={rate.unitLabel ?? ''} placeholder="employee" onChange={(e) => set((r) => ({ ...r, unitLabel: e.target.value }))} /></Field>
              <Field label="Commercial priority"><select className={inputCls} value={rate.importance} onChange={(e) => set((r) => ({ ...r, importance: e.target.value as ModulePrice['importance'] }))}>{['Foundation', 'Essential', 'Recommended', 'Specialist'].map((o) => <option key={o}>{o}</option>)}</select></Field>
              <Field label="Free trial (days)" hint="0 = no module trial"><Num label="Trial days" value={rate.trialDays ?? 0} onChange={(n) => set((r) => ({ ...r, trialDays: n }))} /></Field>
              <Field label="Monthly discount (%)"><Num label="Monthly discount" value={rate.discountMonthly ?? 0} onChange={(n) => set((r) => ({ ...r, discountMonthly: Math.min(100, n) }))} /></Field>
              <Field label="Annual discount (%)" hint="Applied on top of the annual price"><Num label="Annual discount" value={rate.discountAnnual ?? 0} onChange={(n) => set((r) => ({ ...r, discountAnnual: Math.min(100, n) }))} /></Field>
            </div>
            <div className="flex flex-wrap gap-5"><Check on={rate.active} onChange={(v) => set((r) => ({ ...r, active: v }))} label="Offered in onboarding" /><Check on={rate.required} onChange={(v) => set((r) => ({ ...r, required: v }))} label="Required foundation module" /></div>
            <Field label="Customer-facing description"><textarea rows={2} className={`${inputCls} h-auto py-2`} value={rate.summary} onChange={(e) => set((r) => ({ ...r, summary: e.target.value }))} /></Field>
          </section>

          <section>
            <h3 className="font-display text-base font-semibold">Fees and minimums</h3>
            <p className="mb-3 mt-1 text-xs text-slate">Enter NGN. Other currencies follow at the reference rate unless overridden below.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="One-time setup fee (NGN)"><Num label="Setup fee NGN" value={money4(rate.setupFee, 'NGN')} onChange={(n) => set((r) => ({ ...r, setupFee: { ...r.setupFee, NGN: n } }))} /></Field>
              <Field label="Minimum charge / mo (NGN)"><Num label="Minimum charge monthly NGN" value={rate.minCharge?.NGN?.monthly ?? 0} onChange={(n) => set((r) => ({ ...r, minCharge: { ...r.minCharge, NGN: { monthly: n, annual: r.minCharge?.NGN?.annual ?? 0 } } }))} /></Field>
              <Field label="Minimum charge / yr (NGN)"><Num label="Minimum charge annual NGN" value={rate.minCharge?.NGN?.annual ?? 0} onChange={(n) => set((r) => ({ ...r, minCharge: { ...r.minCharge, NGN: { monthly: r.minCharge?.NGN?.monthly ?? 0, annual: n } } }))} /></Field>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between"><h3 className="font-display text-base font-semibold">Price bands</h3>{canEdit && <Btn v="secondary" s="sm" onClick={() => set((r) => ({ ...r, bands: [...r.bands, newBand(r)] }))}><Plus size={14} className="mr-1" />Add band</Btn>}</div>
            <div className="mb-3 mt-2 flex flex-wrap gap-4 text-sm">
              <span className="text-slate">Override currency:</span>
              {CURRENCY_CODES.filter((c) => c !== 'NGN').map((c) => <Check key={c} label={c} on={(rate.overrides ?? []).includes(c)} onChange={(v) => set((r) => ({ ...r, overrides: v ? [...(r.overrides ?? []), c] : (r.overrides ?? []).filter((x) => x !== c) }))} />)}
            </div>
            <div className="space-y-3">{rate.bands.map((b, i) => {
              const upd = (fn: (x: typeof b) => typeof b) => set((r) => ({ ...r, bands: r.bands.map((x, j) => (j === i ? fn(x) : x)) }))
              return (
                <div key={b.id} className="rounded-lg border border-line p-4">
                  <div className="grid gap-3 sm:grid-cols-[1fr_100px_100px_auto] sm:items-end">
                    <Field label="Band label"><input className={inputCls} value={b.label} onChange={(e) => upd((x) => ({ ...x, label: e.target.value }))} /></Field>
                    <Field label="Min staff"><Num label="Minimum staff" value={b.minEmployees} onChange={(n) => upd((x) => ({ ...x, minEmployees: n }))} /></Field>
                    <Field label="Max staff"><input aria-label="Maximum staff" type="number" min={0} placeholder="None" className={`${inputCls} num`} value={b.maxEmployees ?? ''} onChange={(e) => upd((x) => ({ ...x, maxEmployees: e.target.value === '' ? null : num(e.target.value) }))} /></Field>
                    <div className="flex items-center gap-3 pb-2"><Check on={!!b.custom} onChange={(v) => upd((x) => ({ ...x, custom: v }))} label="Custom quote" />{rate.bands.length > 1 && canEdit && <button type="button" aria-label={`Remove band ${b.label}`} className="cursor-pointer text-slate hover:text-red-700" onClick={() => set((r) => ({ ...r, bands: r.bands.filter((_, j) => j !== i) }))}><Trash2 size={15} /></button>}</div>
                  </div>
                  {!b.custom && (
                    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] text-sm">
                      <thead><tr className="text-left text-xs uppercase tracking-wider text-slate"><th className="pb-1">Currency</th><th>Price / mo</th><th>Price / yr</th><th>Cost / mo</th><th>Cost / yr</th></tr></thead>
                      <tbody>{CURRENCY_CODES.map((c) => {
                        const derived = c !== 'NGN' && !(rate.overrides ?? []).includes(c)
                        const setP = (k: 'monthly' | 'annual', n: number) => upd((x) => ({ ...x, prices: { ...x.prices, [c]: { monthly: x.prices[c]?.monthly ?? 0, annual: x.prices[c]?.annual ?? 0, [k]: n } } }))
                        const setC = (k: 'monthly' | 'annual', n: number) => upd((x) => ({ ...x, costs: { ...x.costs, [c]: { monthly: x.costs[c]?.monthly ?? 0, annual: x.costs[c]?.annual ?? 0, [k]: n } } }))
                        return <tr key={c} className="border-t border-line"><th scope="row" className="py-1.5 pr-2 text-left">{c}{derived && <span className="ml-1 text-[10px] font-normal uppercase text-slate">auto</span>}</th>
                          {(['monthly', 'annual'] as const).map((k) => <td key={'p' + k} className="py-1 pr-2"><Num label={`${b.label} ${c} price ${k}`} step={c === 'NGN' ? 1 : 0.01} disabled={derived} value={b.prices[c]?.[k] ?? 0} onChange={(n) => setP(k, n)} /></td>)}
                          {(['monthly', 'annual'] as const).map((k) => <td key={'c' + k} className="py-1 pr-2"><Num label={`${b.label} ${c} cost ${k}`} step={c === 'NGN' ? 1 : 0.01} disabled={derived} value={b.costs[c]?.[k] ?? 0} onChange={(n) => setC(k, n)} /></td>)}</tr>
                      })}</tbody></table>
                      {(() => { const p = b.prices.NGN?.monthly ?? 0; const c = b.costs.NGN?.monthly ?? 0; return p > 0 ? <p className="mt-1 text-xs text-slate">NGN gross margin {Math.round(((p - c) / p) * 100)}%. Cost is internal and never shown to customers.</p> : null })()}
                    </div>
                  )}
                </div>
              )
            })}</div>
          </section>

          <section>
            <h3 className="font-display text-base font-semibold">Dependencies</h3>
            <p className="mb-2 mt-1 text-xs text-slate">Modules customers must also take. They are added automatically in onboarding and quotes.</p>
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">{MODULES.filter((m) => m.id !== rate.moduleId).map((m) => <Check key={m.id} label={m.name} on={reqs.includes(m.id)} onChange={(v) => set((r) => ({ ...r, requires: v ? [...reqs, m.id] : reqs.filter((x) => x !== m.id) }))} />)}</div>
          </section>

          {canEdit && (
            <section>
              <h3 className="font-display text-base font-semibold">Duplicate pricing from another module</h3>
              <div className="mt-2 flex gap-2"><select aria-label="Copy pricing from" className={inputCls} value={src} onChange={(e) => setSrc(e.target.value)}><option value="">Choose a module</option>{snap.rates.filter((r) => r.moduleId !== rate.moduleId).map((r) => <option key={r.moduleId} value={r.moduleId}>{moduleById(r.moduleId)?.name}</option>)}</select>
                <Btn v="secondary" disabled={!src} onClick={() => { duplicateRate(actor, rate.moduleId, src); toast(`Copied bands, fees and discounts from ${moduleById(src)?.name}.`); setSrc('') }}><Copy size={14} className="mr-1.5" />Copy</Btn></div>
            </section>
          )}
          <p className="text-xs text-slate">Edits save to the draft automatically. Nothing is live until you publish.</p>
        </fieldset>
      )}
      {id && !rate && <p className="text-sm text-slate">{mod?.name} has no price list entry yet.{canEdit && <> <button className="cursor-pointer font-semibold text-teal" onClick={() => editDraft(actor, (d) => ({ ...d, rates: [...d.rates, blankRate(id)] }))}>Create one</button></>}</p>}
    </Overlay>
  )
}

/* ---------------- Plan availability ---------------- */
function AvailabilityTab({ snap, canEdit, actor }: { snap: PricingSnapshot; canEdit: boolean; actor: string }) {
  const s = useBilling()
  const plans = [...s.plans].filter((p) => p.status !== 'archived').sort((a, b) => a.order - b.order)
  const [q, setQ] = useState('')
  const label: Record<Availability, string> = { included: 'Included free', addon: 'Sold as add-on', hidden: 'Hidden' }
  const tone: Record<Availability, string> = { included: 'green', addon: 'blue', hidden: 'gray' }
  return (
    <Panel pad={false}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
        <div className="relative min-w-[200px] flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate" /><input aria-label="Search modules" placeholder="Search modules" className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <p className="text-xs text-slate">Availability changes are applied to plans and add-ons when the draft is published. Enterprise always includes every module.</p>
      </div>
      <div className="max-h-[70vh] overflow-auto"><table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 z-10"><tr className="bg-cloud text-left text-xs uppercase tracking-wider text-slate"><th className="px-4 py-2.5">Module</th>{plans.map((p) => <th key={p.id} className="py-2.5">{p.name}</th>)}</tr></thead>
        <tbody>{GROUPS.map((g) => {
          const mods = MODULES.filter((m) => m.group === g.id && m.name.toLowerCase().includes(q.toLowerCase())); if (!mods.length) return null
          return [<tr key={g.id} className="bg-cloud/60"><th colSpan={plans.length + 1} className="px-4 py-1.5 text-left text-xs font-bold uppercase tracking-wider text-slate">{g.name}</th></tr>,
            ...mods.map((m) => {
              const rate = snap.rates.find((r) => r.moduleId === m.id)
              return <tr key={m.id} className="border-t border-line"><td className="px-4 py-2 font-medium">{m.name}</td>
                {plans.map((p) => {
                  const now = availabilityOf(s, m.id, p.id); const pending = rate?.availability?.[p.id]; const value = pending ?? now.state
                  if (p.id === 'enterprise') return <td key={p.id}><Badge tone="green">Included free</Badge></td>
                  return <td key={p.id} className="py-1.5 pr-3">
                    {canEdit && rate ? <select aria-label={`${m.name} on ${p.name}`} className={`${inputCls} h-9 ${pending && pending !== now.state ? 'border-amber-400 bg-amber-50' : ''}`} value={value} onChange={(e) => editRate(actor, m.id, (r) => ({ ...r, availability: { ...r.availability, [p.id]: e.target.value as Availability } }))}>{(['included', 'addon', 'hidden'] as Availability[]).map((a) => <option key={a} value={a}>{label[a]}</option>)}</select>
                      : <Badge tone={tone[value]}>{label[value]}</Badge>}
                    {now.partial && !pending && <span className="ml-1 text-[10px] text-slate" title="Only some features of this module are in the plan">partial</span>}
                  </td>
                })}</tr>
            })]
        })}</tbody></table></div>
    </Panel>
  )
}

/* ---------------- Bundles ---------------- */
function BundlesTab({ snap, canEdit, actor }: { snap: PricingSnapshot; canEdit: boolean; actor: string }) {
  const upd = (id: string, fn: (b: Bundle) => Bundle) => editDraft(actor, (d) => ({ ...d, bundles: d.bundles.map((b) => (b.id === id ? fn(b) : b)) }))
  const rateOf = (id: string) => snap.rates.find((r) => r.moduleId === id)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-slate">A bundle discounts the combined module charge when a customer selects every module in it. A module counts toward one bundle per quote; the richest discount wins.</p>
        {canEdit && <Btn s="sm" onClick={() => editDraft(actor, (d) => ({ ...d, bundles: [...d.bundles, { id: nid('bundle'), name: 'New bundle', description: '', moduleIds: [], discountPct: 10, active: false }] }))}><Plus size={14} className="mr-1" />New bundle</Btn>}</div>
      <div className="grid gap-4 lg:grid-cols-2">{snap.bundles.map((b) => (
        <Panel key={b.id} title={b.name || 'Untitled bundle'} action={<Badge tone={b.active ? 'green' : 'gray'}>{b.active ? 'Active' : 'Off'}</Badge>}>
          <fieldset disabled={!canEdit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_110px]"><Field label="Name"><input className={inputCls} value={b.name} onChange={(e) => upd(b.id, (x) => ({ ...x, name: e.target.value }))} /></Field><Field label="Discount %"><Num label={`${b.name} discount`} value={b.discountPct} onChange={(n) => upd(b.id, (x) => ({ ...x, discountPct: n }))} /></Field></div>
            <Field label="Description"><input className={inputCls} value={b.description} onChange={(e) => upd(b.id, (x) => ({ ...x, description: e.target.value }))} /></Field>
            <Field label="Valid from" hint="Leave blank to apply as soon as published"><input type="date" className={inputCls} value={b.validFrom ?? ''} onChange={(e) => upd(b.id, (x) => ({ ...x, validFrom: e.target.value || undefined }))} /></Field>
            <div><div className="mb-1 text-[13px] font-semibold">Modules ({b.moduleIds.length})</div>
              <div className="grid max-h-44 gap-1 overflow-y-auto rounded-md border border-line p-2 sm:grid-cols-2">{MODULES.filter((m) => rateOf(m.id)?.active || b.moduleIds.includes(m.id)).map((m) => <Check key={m.id} label={m.name} on={b.moduleIds.includes(m.id)} onChange={(v) => upd(b.id, (x) => ({ ...x, moduleIds: v ? [...x.moduleIds, m.id] : x.moduleIds.filter((i) => i !== m.id) }))} />)}</div></div>
            <div className="flex items-center justify-between"><Check on={b.active} onChange={(v) => upd(b.id, (x) => ({ ...x, active: v }))} label="Active" />
              {canEdit && <button type="button" className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-red-700" onClick={() => editDraft(actor, (d) => ({ ...d, bundles: d.bundles.filter((x) => x.id !== b.id) }))}><Trash2 size={14} />Remove</button>}</div>
          </fieldset>
        </Panel>
      ))}{snap.bundles.length === 0 && <p className="text-sm text-slate">No bundles yet.</p>}</div>
    </div>
  )
}

/* ---------------- Simulator ---------------- */
function Simulator() {
  const s = useBilling()
  const offered = s.modulePrices.filter((r) => r.active)
  const [ids, setIds] = useState<string[]>(['people', 'payroll', 'accounting'])
  const [employees, setEmployees] = useState(40); const [currency, setCurrency] = useState(defaultCurrency(s)); const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')
  const [asOf, setAsOf] = useState(''); const [usage, setUsage] = useState<Record<string, number>>({})
  const [source, setSource] = useState<'live' | 'draft'>(s.draft ? 'draft' : 'live')
  const base: BillingState = source === 'draft' && s.draft ? { ...s, modulePrices: s.draft.rates, bundles: s.draft.bundles, starterMinimum: s.draft.starterMinimum } : s
  const input = { moduleIds: ids, employees, currency, cycle, usage, asOf: asOf || undefined }
  const q = quoteModules(base, input); const live = s.draft ? quoteModules(s, input) : null
  const m = (n: number) => money(n, currency, { s })
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <Panel title="Scenario">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Employees"><input type="number" min={1} className={`${inputCls} num`} value={employees} onChange={(e) => setEmployees(Math.max(1, Number(e.target.value) || 1))} /></Field>
          <Field label="Currency"><select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>{activeCurrencies(s).map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
          <Field label="Billing"><select className={inputCls} value={cycle} onChange={(e) => setCycle(e.target.value as 'monthly' | 'annual')}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></Field>
          <Field label="Prices as of" hint="Applies scheduled changes"><input type="date" className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
        </div>
        {s.draft && <div className="mt-3 flex gap-4 text-sm"><span className="font-semibold">Pricing source</span>{(['live', 'draft'] as const).map((k) => <label key={k} className="flex cursor-pointer items-center gap-1.5"><input type="radio" name="src" className="accent-teal" checked={source === k} onChange={() => setSource(k)} />{k === 'live' ? 'Live prices' : 'Unpublished draft'}</label>)}</div>}
        <div className="mb-2 mt-5 flex items-center justify-between"><span className="text-[13px] font-semibold">Modules</span><span className="flex gap-3 text-xs font-semibold text-teal"><button className="cursor-pointer" onClick={() => setIds(offered.map((r) => r.moduleId))}>All</button><button className="cursor-pointer" onClick={() => setIds([])}>None</button></span></div>
        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">{offered.map((r) => <div key={r.moduleId} className="flex items-center gap-2"><div className="min-w-0 flex-1"><Check label={moduleById(r.moduleId)?.name} on={ids.includes(r.moduleId)} onChange={(v) => setIds(v ? [...ids, r.moduleId] : ids.filter((x) => x !== r.moduleId))} /></div>
          {modelOf(r) === 'usage' && ids.includes(r.moduleId) && <input aria-label={`${moduleById(r.moduleId)?.name} usage units`} type="number" min={0} className={`${inputCls} num h-8 w-20`} placeholder="units" value={usage[r.moduleId] ?? ''} onChange={(e) => setUsage({ ...usage, [r.moduleId]: Number(e.target.value) })} />}</div>)}</div>
      </Panel>
      <Panel title="Quote from the live engine" className="lg:sticky lg:top-6 lg:self-start">
        {!q.ok ? <p role="status" className="text-sm text-amber-900">{q.custom ? 'Sales-assisted: ' : ''}{q.reason ?? 'Select at least one module.'}</p> : (
          <div className="text-sm">
            <ul className="space-y-1.5">{q.lines.map((l) => <li key={l.moduleId} className="flex justify-between gap-3"><span>{l.label}<span className="block text-xs text-slate">{l.band}{l.note ? ` · ${l.note}` : ''}{q.autoAdded.includes(l.moduleId) ? ' · auto-added' : ''}</span></span><span className="num">{m(l.amount)}</span></li>)}</ul>
            <dl className="mt-3 space-y-1 border-t border-line pt-3">
              {q.bundles.map((b) => <div key={b.id} className="flex justify-between text-teal"><dt>{b.name}</dt><dd className="num">−{m(b.amount)}</dd></div>)}
              {q.minimumAdjustment > 0 && <div className="flex justify-between"><dt>Starter minimum top-up</dt><dd className="num">{m(q.minimumAdjustment)}</dd></div>}
              <div className="flex justify-between"><dt>Recurring subtotal</dt><dd className="num">{m(q.subtotal)}</dd></div>
              {q.setup > 0 && <div className="flex justify-between"><dt>One-time setup</dt><dd className="num">{m(q.setup)}</dd></div>}
              {q.tax > 0 && <div className="flex justify-between"><dt>Tax</dt><dd className="num">{m(q.tax)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total due</dt><dd className="num">{m(q.total)}</dd></div>
            </dl>
            {live && live.ok && source === 'draft' && <p className="mt-3 rounded bg-cloud p-2 text-xs">Live total {m(live.total)} · draft is <b>{q.total - live.total >= 0 ? '+' : '−'}{m(Math.abs(q.total - live.total))}</b></p>}
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ---------------- Scheduled & history ---------------- */
function ScheduledTab({ canEdit, actor }: { canEdit: boolean; actor: string }) {
  const s = useBilling(); const toast = useToast()
  const list = [...s.scheduled].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  if (!list.length) return <Panel><p className="flex items-center gap-2 text-sm text-slate"><CalendarClock size={16} />No scheduled price changes. Publish a draft with a future effective date to schedule one.</p></Panel>
  return (
    <div className="space-y-3">{list.map((c) => (
      <Panel key={c.id}><div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1"><div className="font-semibold">Effective {fmtDate(c.effectiveFrom)}</div><div className="text-sm text-slate">{c.summary} · {c.rates.length} module{c.rates.length === 1 ? '' : 's'} · by {c.by}{c.note ? ` · ${c.note}` : ''}</div>
          <div className="mt-1 flex flex-wrap gap-1">{c.rates.slice(0, 8).map((r) => <Badge key={r.moduleId} tone="gray">{moduleById(r.moduleId)?.name ?? r.moduleId}</Badge>)}</div></div>
        <Badge tone={c.status === 'scheduled' ? 'amber' : c.status === 'applied' ? 'green' : 'gray'}>{c.status}</Badge>
        {canEdit && c.status === 'scheduled' && <Btn v="secondary" s="sm" onClick={() => { cancelScheduled(actor, c.id); toast('Scheduled change cancelled.') }}>Cancel</Btn>}
      </div></Panel>
    ))}</div>
  )
}

function HistoryTab() {
  const s = useBilling(); const [mod, setMod] = useState('all'); const [kind, setKind] = useState('all')
  const rows = s.priceHistory.filter((h) => (mod === 'all' || h.moduleId === mod) && (kind === 'all' || h.kind === kind))
  return (
    <Panel pad={false}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
        <select aria-label="Filter by module" className={`${inputCls} w-auto`} value={mod} onChange={(e) => setMod(e.target.value)}><option value="all">All modules</option>{MODULES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <select aria-label="Filter by type" className={`${inputCls} w-auto`} value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All changes</option>{['price', 'setting', 'availability', 'bundle', 'minimum'].map((k) => <option key={k}>{k}</option>)}</select>
        <Link to="/admin/billing/audit" className="ml-auto text-sm font-semibold text-teal">Open billing audit log <ArrowRight size={13} className="inline" /></Link>
      </div>
      <div className="max-h-[65vh] overflow-auto"><table className="w-full min-w-[760px] text-sm">
        <thead className="sticky top-0 bg-cloud text-left text-xs uppercase tracking-wider text-slate"><tr><th className="px-4 py-2.5">Release</th><th>When</th><th>Change</th><th>From</th><th>To</th><th>Effective</th><th>By</th></tr></thead>
        <tbody>{rows.map((h) => <tr key={h.id} className="border-t border-line align-top"><td className="px-4 py-2 num">#{h.release}</td><td className="whitespace-nowrap">{fmtDate(h.at.slice(0, 10))}</td><td>{h.label}{h.note && <div className="text-xs text-slate">{h.note}</div>}</td><td className="num text-slate">{h.from}</td><td className="num font-medium">{h.to}</td><td className="whitespace-nowrap">{fmtDate(h.effectiveFrom)}</td><td>{h.by}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate">No price history yet. Published changes are recorded here.</td></tr>}</tbody></table></div>
    </Panel>
  )
}

/* ---------------- Publish ---------------- */
function PublishDialog({ open, onClose, actor }: { open: boolean; onClose: () => void; actor: string }) {
  const s = useBilling(); const toast = useToast()
  const [when, setWhen] = useState(iso(TODAY)); const [note, setNote] = useState(''); const [msg, setMsg] = useState('')
  const d = s.draft; const diff = d ? diffPricing(s, d) : null; const issues = d ? validateSnapshot(d, s) : []
  const errors = issues.filter((i) => i.level === 'error'); const scheduled = when > iso(TODAY)
  return (
    <Overlay open={open && !!d} onClose={onClose} title="Review and publish" side wide>
      {diff && d && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Panel><Stat label="Prices changed" value={String(diff.prices)} sub={`${diff.changes.length} changes in ${diff.modules.length} modules`} /></Panel>
            <Panel><Stat label="MRR impact (est.)" value={signed(diff.mrr, 'NGN', s)} sub="NGN, at assumed volumes" /></Panel>
            <Panel><Stat label="Release" value={`#${s.pricingRelease + 1}`} sub={scheduled ? `Scheduled ${fmtDate(when)}` : 'Live immediately'} /></Panel>
          </div>
          <p className="text-xs text-slate">{MRR_ASSUMPTION}</p>
          {issues.length > 0 && <div role="alert" className={`rounded-lg p-3 text-sm ${errors.length ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900'}`}><b>{errors.length ? 'Fix before publishing' : 'Warnings'}</b><ul className="mt-1 list-disc space-y-0.5 pl-5">{issues.slice(0, 12).map((i, k) => <li key={k}>{i.text}</li>)}{issues.length > 12 && <li>and {issues.length - 12} more</li>}</ul></div>}
          <div className="max-h-72 overflow-auto rounded-lg border border-line"><table className="w-full text-sm">
            <thead className="sticky top-0 bg-cloud text-left text-xs uppercase tracking-wider text-slate"><tr><th className="px-3 py-2">Change</th><th>From</th><th>To</th></tr></thead>
            <tbody>{diff.changes.slice(0, 200).map((c, i) => <tr key={i} className="border-t border-line"><td className="px-3 py-1.5">{c.label}</td><td className="num text-slate">{c.from}</td><td className="num font-medium">{c.to}</td></tr>)}</tbody></table></div>
          {diff.changes.length > 200 && <p className="text-xs text-slate">Showing the first 200 of {diff.changes.length} changes.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Effective from" hint={scheduled ? 'Price and rule changes apply on this date. Plan availability changes apply now.' : 'Today publishes immediately.'}><input type="date" min={iso(TODAY)} className={inputCls} value={when} onChange={(e) => setWhen(e.target.value || iso(TODAY))} /></Field>
            <Field label="Release note"><input className={inputCls} value={note} placeholder="Why is this changing?" onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          {msg && <p role="alert" className="text-sm text-red-800">{msg}</p>}
          <Btn className="w-full" disabled={errors.length > 0 || diff.changes.length === 0} onClick={() => { const r = publishDraft(actor, { effectiveFrom: when, note }); if (r.ok) { toast(r.message); setNote(''); onClose() } else setMsg(r.message) }}>{scheduled ? `Schedule for ${fmtDate(when)}` : 'Publish now'}</Btn>
        </div>
      )}
    </Overlay>
  )
}

/* ---------------- Bulk edit ---------------- */
function BulkDialog({ open, onClose, snap, picked, actor }: { open: boolean; onClose: () => void; snap: PricingSnapshot; picked: string[]; actor: string }) {
  const toast = useToast()
  const [scope, setScope] = useState<'picked' | 'all'>('picked'); const [group, setGroup] = useState('all')
  const [op, setOp] = useState<BulkOp>({ mode: 'pct', value: 5, period: 'both', band: 'all' })
  const ids = scope === 'picked' ? picked : snap.rates.filter((r) => group === 'all' || moduleById(r.moduleId)?.group === group).map((r) => r.moduleId)
  return (
    <Overlay open={open} onClose={onClose} title="Bulk edit prices" side>
      <div className="space-y-4">
        <Field label="Apply to"><select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value as 'picked' | 'all')}><option value="picked">Selected modules ({picked.length})</option><option value="all">All modules, optionally by area</option></select></Field>
        {scope === 'all' && <Field label="Area"><select className={inputCls} value={group} onChange={(e) => setGroup(e.target.value)}><option value="all">Every area</option>{GROUPS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Action"><select className={inputCls} value={op.mode} onChange={(e) => setOp({ ...op, mode: e.target.value as BulkOp['mode'] })}><option value="pct">Increase or decrease by %</option><option value="add">Add or subtract an amount</option><option value="set">Set to a value</option></select></Field>
          <Field label={op.mode === 'pct' ? 'Percent (negative lowers)' : op.mode === 'add' ? 'NGN amount (negative lowers)' : 'NGN value'}><input type="number" className={`${inputCls} num`} value={op.value} onChange={(e) => setOp({ ...op, value: Number(e.target.value) || 0 })} /></Field>
          <Field label="Price"><select className={inputCls} value={op.period} onChange={(e) => setOp({ ...op, period: e.target.value as BulkOp['period'] })}><option value="both">Monthly and annual</option><option value="monthly">Monthly only</option><option value="annual">Annual only</option></select></Field>
          <Field label="Band"><select className={inputCls} value={String(op.band)} onChange={(e) => setOp({ ...op, band: e.target.value === 'all' ? 'all' : Number(e.target.value) })}><option value="all">All bands</option><option value="0">First band only</option><option value="1">Second band only</option></select></Field>
        </div>
        {op.mode === 'set' && op.period === 'both' && <p className="text-xs text-slate">Annual is set to ten times the monthly value.</p>}
        <p className="text-xs text-slate">Custom-quote bands are skipped. USD, GBP and EUR follow the NGN price unless a currency is overridden for that module. Results go to the draft for review.</p>
        <Btn className="w-full" disabled={ids.length === 0} onClick={() => { bulkEdit(actor, ids, op); toast(`Draft updated for ${ids.length} module${ids.length === 1 ? '' : 's'}.`); onClose() }}>Apply to {ids.length} module{ids.length === 1 ? '' : 's'}</Btn>
      </div>
    </Overlay>
  )
}

/* ---------------- CSV ---------------- */
function CsvDialog({ open, onClose, snap, canEdit, actor }: { open: boolean; onClose: () => void; snap: PricingSnapshot; canEdit: boolean; actor: string }) {
  const toast = useToast(); const file = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(''); const [res, setRes] = useState<{ updated: number; created: number; errors: string[] } | null>(null)
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportCsv(snap.rates)], { type: 'text/csv' })); a.download = 'bizflow-module-pricing.csv'; a.click(); toast('Module pricing exported.') }
  return (
    <Overlay open={open} onClose={onClose} title="Import and export" side>
      <div className="space-y-5">
        <section><h3 className="font-semibold">Export</h3><p className="mb-2 mt-1 text-sm text-slate">One row per module, band and currency. {snap === undefined ? '' : 'Includes unpublished draft edits.'}</p><Btn v="secondary" onClick={download}><Download size={14} className="mr-1.5" />Download CSV</Btn></section>
        {canEdit && <section><h3 className="font-semibold">Import</h3><p className="mb-2 mt-1 text-sm text-slate">Rows are matched on module_id, band_id and currency. Imports go to the draft; nothing is live until you publish.</p>
          <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = '' }} />
          <Btn v="secondary" s="sm" onClick={() => file.current?.click()}><FileUp size={14} className="mr-1.5" />Choose file</Btn>
          <textarea aria-label="CSV contents" rows={8} className={`${inputCls} mt-3 h-auto py-2 font-mono text-xs`} placeholder={'module_id,band_id,currency,monthly,annual\npayroll,small,NGN,12000,120000'} value={text} onChange={(e) => setText(e.target.value)} />
          <Btn className="mt-3 w-full" disabled={!text.trim()} onClick={() => { const r = importCsv(actor, text); setRes(r); if (r.updated) toast(`${r.updated} price${r.updated === 1 ? '' : 's'} imported to the draft.`) }}>Import to draft</Btn>
          {res && <div role="status" className={`mt-3 rounded-lg p-3 text-sm ${res.errors.length ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-900'}`}><b>{res.updated} updated{res.created ? `, ${res.created} new band${res.created === 1 ? '' : 's'}` : ''}{res.errors.length ? `, ${res.errors.length} rejected` : ''}.</b>{res.errors.length > 0 && <ul className="mt-1 list-disc pl-5">{res.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}</ul>}</div>}
        </section>}
      </div>
    </Overlay>
  )
}
