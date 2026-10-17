import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Badge, Btn, Field, inputCls, Overlay, PageHeader, Panel, Stat, Table, Tabs, useToast } from '../../components/ui'
import { CapabilityTree } from '../../components/billing/shared'
import { LIMIT_DEFS, defaultCurrency, fmtDate, iso, logAudit, money, nid, setBilling, TODAY, useBilling } from '../../data/billing'
import type { Currency, LimitKey, Limits, Promo, Subscription } from '../../data/billing'
import { Gate, useAdmin } from './AdminLayout'
import { Toggle } from './Plans'

export function CurrencyTax() {
  const s = useBilling(); const { can, actor } = useAdmin(); const toast = useToast()
  const ro = !can('pricing')
  const [add, setAdd] = useState<Currency | null>(null)
  const upd = (code: string, patch: Partial<Currency>, what: string) => {
    setBilling((st) => ({ ...st, currencies: st.currencies.map((c) => (c.code === code ? { ...c, ...patch } : patch.isDefault ? { ...c, isDefault: false } : c)) }))
    logAudit(actor, 'Platform', `${code}: ${what}`, '—', 'Updated')
  }
  const tax = (c: Currency, p: Partial<Currency['tax']>, what: string) => upd(c.code, { tax: { ...c.tax, ...p } }, what)
  return (
    <Gate perm="view">
      <PageHeader eyebrow="Billing & Pricing" title="Currency and tax" desc="Currencies are configuration, not code. A plan is sold in a currency only when it has a price for it." actions={!ro && <Btn onClick={() => setAdd({ code: '', name: '', symbol: '', decimals: 2, enabled: false, isDefault: false, regions: [], tax: { applies: false, label: 'Tax', rate: 0, inclusive: false } })}>Add currency</Btn>} />
      <div className="space-y-4">
        {s.currencies.map((c) => {
          const missing = s.plans.filter((p) => p.status === 'active' && p.model !== 'custom' && !p.prices[c.code]).map((p) => p.name)
          return (
            <Panel key={c.code} title={`${c.name} · ${c.code} ${c.symbol}`} action={<Badge tone={c.enabled ? 'green' : 'gray'}>{c.enabled ? 'Enabled' : 'Disabled'}</Badge>}>
              <fieldset disabled={ro} className="grid gap-4 md:grid-cols-4">
                <Toggle on={c.enabled} disabled={c.isDefault} onChange={(v) => upd(c.code, { enabled: v }, v ? 'Enabled' : 'Disabled')} label="Available to customers" />
                <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="def" className="accent-teal" checked={c.isDefault} onChange={() => upd(c.code, { isDefault: true, enabled: true }, 'Set as default currency')} />Default currency</label>
                <Toggle on={c.tax.applies} onChange={(v) => tax(c, { applies: v }, v ? 'Tax enabled' : 'Tax disabled')} label="Charge tax" />
                <Toggle on={c.tax.inclusive} disabled={!c.tax.applies} onChange={(v) => tax(c, { inclusive: v }, v ? 'Prices include tax' : 'Prices exclude tax')} label="Prices include tax" />
                <Field label="Tax label"><input className={inputCls} value={c.tax.label} onChange={(e) => tax(c, { label: e.target.value }, 'Tax label changed')} /></Field>
                <Field label="Tax rate (%)"><input type="number" min={0} step={0.5} className={`${inputCls} num`} value={c.tax.rate} onChange={(e) => tax(c, { rate: Math.max(0, Number(e.target.value) || 0) }, `Tax rate set to ${e.target.value}%`)} /></Field>
                <Field label="Regions"><input className={inputCls} value={c.regions.join(', ')} onChange={(e) => upd(c.code, { regions: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }, 'Regions changed')} /></Field>
                <Field label="Decimals"><input type="number" min={0} max={3} className={`${inputCls} num`} value={c.decimals} onChange={(e) => upd(c.code, { decimals: Math.min(3, Math.max(0, Number(e.target.value) || 0)) }, 'Decimals changed')} /></Field>
              </fieldset>
              {c.enabled && missing.length > 0 && <p className="mt-3 text-xs text-amber-800">Not yet priced in {c.code}: {missing.join(', ')}. Those plans show "Not priced" to customers choosing {c.code}.</p>}
            </Panel>
          )
        })}
      </div>
      <Overlay open={!!add} onClose={() => setAdd(null)} title="Add currency" alert>
        {add && <div className="space-y-3">
          <Field label="ISO code"><input className={`${inputCls} uppercase`} maxLength={3} value={add.code} onChange={(e) => setAdd({ ...add, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Name"><input className={inputCls} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
          <Field label="Symbol"><input className={inputCls} value={add.symbol} onChange={(e) => setAdd({ ...add, symbol: e.target.value })} /></Field>
          <Btn className="w-full" onClick={() => { if (add.code.length !== 3 || !add.name || s.currencies.some((c) => c.code === add.code)) { toast('Enter a unique 3-letter code and a name.'); return } setBilling((st) => ({ ...st, currencies: [...st.currencies, add] })); logAudit(actor, 'Platform', `Added currency ${add.code}`, '—', 'Disabled until priced'); setAdd(null) }}>Add currency</Btn>
        </div>}
      </Overlay>
    </Gate>
  )
}

export { Promotions } from './promos/Promotions'

export { SubscriptionsList as Subscriptions } from './subs/List'
export { default as SubscriptionDetail } from './subs/Detail'

const customLimits = (): Limits => ({ employees: 100, branches: 5, storageGb: 50, documents: 1000, signatures: 250, leads: 1000 })

export function CustomSubscription() {
  const s = useBilling(); const { actor } = useAdmin(); const toast = useToast()
  const navigate = useNavigate()
  const [company, setCompany] = useState('')
  const [employees, setEmployees] = useState(50)
  const [currency, setCurrency] = useState(defaultCurrency(s))
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('annual')
  const [value, setValue] = useState(0)
  const [features, setFeatures] = useState<string[]>([])
  const [limits, setLimits] = useState<Limits>(customLimits)
  const [error, setError] = useState('')
  const setLimit = (key: LimitKey, raw: string) => setLimits({ ...limits, [key]: raw === '' ? null : Math.max(0, Number(raw) || 0) })
  const save = () => {
    if (!company.trim() || value <= 0 || features.length === 0) {
      setError('Add a company, contract value and at least one capability.')
      return
    }
    const enterprise = s.plans.find((p) => p.model === 'custom') ?? s.plans[s.plans.length - 1]
    const id = nid('custom-sub')
    const subscription: Subscription = {
      id, company: company.trim(), country: 'NG', planId: enterprise.id, cycle, currency, employees, status: 'active',
      startedAt: iso(TODAY), renewsAt: cycle === 'annual' ? '2027-10-08' : '2026-11-08', net: value, addons: [], overrides: [], credit: 0,
      usage: { employees, branches: 1, storageGb: 0, documents: 0, signatures: 0, leads: 0 }, card: null,
      customFeatures: features, customLimits: limits,
    }
    setBilling((state) => ({ ...state, subs: [subscription, ...state.subs] }))
    logAudit(actor, subscription.company, 'Created custom subscription', '—', `${features.length} capabilities · ${money(value, currency, { trim: true, s })}`)
    toast('Custom subscription created.')
    navigate(`/admin/billing/subscriptions/${id}`)
  }
  return (
    <Gate perm="subscriptions">
      <PageHeader eyebrow="Subscriptions" title="New custom subscription" desc="Build a bespoke contract by granting only the capabilities and capacity this company needs." actions={<Btn v="secondary" to="/admin/billing/subscriptions">Back</Btn>} />
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Panel title="Contract details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company"><input className={inputCls} value={company} onChange={(e) => { setCompany(e.target.value); setError('') }} /></Field>
              <Field label="Employees"><input type="number" min={1} className={inputCls} value={employees} onChange={(e) => setEmployees(Math.max(1, Number(e.target.value) || 1))} /></Field>
              <Field label="Currency"><select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>{s.currencies.filter((x) => x.enabled).map((x) => <option key={x.code}>{x.code}</option>)}</select></Field>
              <Field label="Billing cycle"><select className={inputCls} value={cycle} onChange={(e) => setCycle(e.target.value as typeof cycle)}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></Field>
              <Field label={`Contract value (${currency})`}><input type="number" min={1} className={`${inputCls} num`} value={value || ''} onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))} /></Field>
            </div>
          </Panel>
          <Panel title="Capabilities granted"><CapabilityTree features={features} onChange={setFeatures} /></Panel>
          <Panel title="Custom limits"><div className="grid gap-4 sm:grid-cols-3">{LIMIT_DEFS.map((item) => <Field key={item.key} label={item.label} hint="Blank = unlimited"><input type="number" min={0} className={`${inputCls} num`} value={limits[item.key] ?? ''} onChange={(e) => setLimit(item.key, e.target.value)} /></Field>)}</div></Panel>
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Panel title="Contract summary">
            <Stat label="Capabilities" value={String(features.length)} sub={`${new Set(features.map((feature) => feature.split('.')[0])).size} modules`} />
            <div className="my-4 border-t border-line" />
            <Stat label={`${cycle === 'annual' ? 'Annual' : 'Monthly'} value`} value={value ? money(value, currency, { trim: true, s }) : '—'} sub={`${employees} employees`} />
            <Btn className="mt-5 w-full" onClick={save}>Create custom subscription</Btn>
          </Panel>
        </aside>
      </div>
    </Gate>
  )
}

export function AuditLog() {
  const s = useBilling(); const [q, setQ] = useState('')
  const rows = s.audit.filter((a) => !q || `${a.actor} ${a.company} ${a.action}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <Gate perm="audit">
      <PageHeader eyebrow="Billing & Pricing" title="Billing audit" desc="Append-only record of every commercial change: who, which company, what, and the before and after." />
      <input aria-label="Filter audit log" placeholder="Filter by actor, company or action" value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} mb-4 max-w-sm`} />
      <Panel pad={false}><Table label="Billing audit" pageSize={12} head={['Timestamp', 'Actor', 'Company', 'Action', 'Previous', 'New']} rows={rows.map((a) => [<span key="t" className="num whitespace-nowrap">{a.at.replace('T', ' ')}</span>, a.actor, a.company, a.action, a.prev, a.next])} /></Panel>
    </Gate>
  )
}
