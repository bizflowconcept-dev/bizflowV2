import { useState } from 'react'
import { Link } from 'react-router'
import { Check, Lock } from 'lucide-react'
import { Badge, Btn, EmptyState, Field, Overlay, PageHeader, inputCls, useToast } from '../../components/ui'
import { useRole } from '../../components/app/AppLayout'
import { MODULE_LIST, TIERS, host, saveProfile, setPlan, useAudit, useTenant } from '../../tenant/store'
import { DEFAULT_LIMIT, saveFinancePolicy, useFinancePolicy } from '../../finance/policy'
import { OPTIONAL_STEPS, REQUEST_TYPES, STEP_OWNER, chainFor, saveFlowPolicy, useFlowPolicy } from '../../approvals/flow'
import type { FlowRule, Step } from '../../approvals/flow'
import { AuditTable } from '../admin/Platform'
import type { Profile } from '../../tenant/store'
import { Section, SettingsNav, TenantMark, WorkspaceTag } from '../../tenant/ui'

export const STATES = ['Abuja (FCT)', 'Lagos', 'Rivers', 'Oyo', 'Ogun', 'Kaduna', 'Enugu', 'Delta', 'Anambra', 'Edo', 'Akwa Ibom', 'Other']
export const INDUSTRIES = ['Financial Services', 'Logistics & Transport', 'Retail & Distribution', 'Manufacturing', 'Healthcare', 'Education', 'Technology', 'Construction & Real Estate', 'Oil, Gas & Energy', 'Hospitality', 'Professional Services', 'Other']
export const SIZES = ['1–10', '11–50', '51–200', '201–500', '500+']

export function CompanyProfile() {
  const t = useTenant()
  const { r, can } = useRole()
  const toast = useToast()
  const [p, setP] = useState<Profile | null>(t?.profile ?? null)
  if (!t || !p) return null
  const canEdit = can('company.profile.manage')
  const set = (k: keyof Profile) => (e: { target: { value: string } }) => setP({ ...p, [k]: e.target.value })
  const dirty = JSON.stringify(p) !== JSON.stringify(t.profile)
  const dis = !canEdit
  return (
    <div>
      <PageHeader eyebrow="Settings · Company" title="Company Profile" desc="This information appears across your workspace, payslips, offer letters and employee onboarding." />
      <SettingsNav />
      <form onSubmit={(e) => { e.preventDefault(); saveProfile(t.slug, p); toast('Company profile saved') }} className="max-w-3xl space-y-5">
        <Section title="Identity" desc="Your company name and logo appear in the header, sign-in page and documents.">
          <div className="flex flex-wrap items-center gap-4">
            <TenantMark t={{ brand: t.brand, profile: p }} size={64} />
            <div className="min-w-0 flex-1"><div className="truncate font-display text-lg font-semibold">{p.name || 'Company name'}</div><div className="mt-1 flex flex-wrap items-center gap-2"><WorkspaceTag t={t} /><Badge tone="gray">Workspace address is fixed</Badge></div></div>
            <Btn v="secondary" to="/admin/business/settings/branding">Change logo</Btn>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Company name"><input disabled={dis} required value={p.name} onChange={set('name')} className={inputCls} /></Field>
            <Field label="CAC / registration number"><input disabled={dis} value={p.cac} onChange={set('cac')} placeholder="RC 1234567" className={inputCls} /></Field>
            <Field label="Industry"><select disabled={dis} value={p.industry} onChange={set('industry')} className={inputCls}>{INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Company size"><select disabled={dis} value={p.size} onChange={set('size')} className={inputCls}>{SIZES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field label="Company description"><textarea disabled={dis} rows={3} value={p.description} onChange={set('description')} className={`${inputCls} h-auto py-2`} /></Field></div>
          </div>
        </Section>
        <Section title="Contact & location">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company email"><input disabled={dis} type="email" value={p.email} onChange={set('email')} className={inputCls} /></Field>
            <Field label="Phone"><input disabled={dis} value={p.phone} onChange={set('phone')} className={inputCls} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><input disabled={dis} value={p.address} onChange={set('address')} className={inputCls} /></Field></div>
            <Field label="State"><select disabled={dis} value={p.state} onChange={set('state')} className={inputCls}>{STATES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Country"><select disabled={dis} value={p.country} onChange={set('country')} className={inputCls}>{['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'United Kingdom'].map((x) => <option key={x}>{x}</option>)}</select></Field>
            <div className="sm:col-span-2"><Field label="Website"><input disabled={dis} value={p.website} onChange={set('website')} placeholder="https://" className={inputCls} /></Field></div>
          </div>
        </Section>
        <div className="flex items-center justify-end gap-2">
          {!canEdit && <span className="mr-auto text-sm text-slate">Company settings are managed by your company administrators.</span>}
          <Btn type="button" v="secondary" disabled={!dirty} onClick={() => setP(t.profile)}>Cancel</Btn>
          <Btn type="submit" disabled={!dirty || dis}>Save profile</Btn>
        </div>
      </form>
    </div>
  )
}

export function Modules() {
  const t = useTenant()
  const { can } = useRole()
  const toast = useToast()
  const [up, setUp] = useState<string | null>(null)
  if (!t) return null
  const canManage = can('company.subscription.manage')
  const locked = MODULE_LIST.filter((m) => !t.modules.includes(m.id))
  const tierFor = up ? MODULE_LIST.find((m) => m.id === up)!.tier : ''
  return (
    <div>
      <PageHeader eyebrow="Settings · Company" title="Modules" desc={`Modules included in ${t.profile.name}'s ${t.plan} subscription. Company administrators decide which departments can use each active module.`} actions={<><Btn v="secondary" to="/admin/business/settings?tab=rbac">Assign to departments</Btn><Btn v="secondary" to="/admin/business/billing">Subscription & billing</Btn></>} />
      <SettingsNav />
      {!canManage ? <div className="rounded-lg border border-line bg-white"><EmptyState title="Only company administrators manage modules" body="Ask your administrator if you need access to another module." /></div> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MODULE_LIST.map((m) => {
              const on = t.modules.includes(m.id)
              return (
                <div key={m.id} className={`flex flex-col rounded-lg border p-5 ${on ? 'border-line bg-white' : 'border-dashed border-line bg-cloud'}`}>
                  <div className="flex items-start justify-between gap-2"><h3 className={`font-display text-[17px] font-semibold ${on ? '' : 'text-slate'}`}>{m.name}</h3>{on ? <Badge tone="green">Enabled</Badge> : <Badge tone="gray">Disabled</Badge>}</div>
                  <p className="mt-1.5 flex-1 text-sm text-slate">{on ? m.desc : `Part of the ${m.tier} plan and above.`}</p>
                  <div className="mt-4">{on ? <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal"><Check size={14} />Included in your plan</span> : <Btn s="sm" v="secondary" onClick={() => setUp(m.id)}><Lock size={13} />Upgrade to unlock</Btn>}</div>
                </div>
              )
            })}
          </div>
          {locked.length === 0 && <p className="mt-4 text-sm text-slate">All modules are active on your plan.</p>}
        </>
      )}
      <Overlay open={!!up} onClose={() => setUp(null)} title={`Upgrade to ${tierFor}`}>
        <p className="text-sm text-slate">Unlock {MODULE_LIST.find((m) => m.id === up)?.name} and every module on the {tierFor} plan. The change is pro-rated and takes effect immediately for {t.profile.name}.</p>
        <ul className="mt-3 space-y-1.5 text-sm">{MODULE_LIST.filter((m) => TIERS.indexOf(m.tier) <= TIERS.indexOf(tierFor) && !t.modules.includes(m.id)).map((m) => <li key={m.id} className="flex items-center gap-2"><Check size={14} className="text-ok" />{m.name}</li>)}</ul>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setUp(null)}>Cancel</Btn><Btn onClick={() => { setPlan(t.slug, tierFor); setUp(null); toast(`Upgraded to ${tierFor}. New modules are ready.`) }}>Confirm upgrade</Btn></div>
        <p className="mt-3 text-xs text-slate">Workspace: {host(t.slug)}</p>
      </Overlay>
    </div>
  )
}

export function Activity() {
  const t = useTenant()
  const { can } = useRole()
  const rows = useAudit(t?.slug)
  if (!t) return null
  return (
    <div>
      <PageHeader eyebrow="Settings · Company" title="Activity" desc={`Audit log for ${t.profile.name}. Actions by your team and by BizFlow staff are labelled separately, including any support access.`} />
      <SettingsNav />
      {can('company.audit.view') && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-softmint px-4 py-2.5 text-[13px]"><span>Need filters by date, time, employee and department, plus integrity checks?</span><Link to="/admin/business/audit-trail" className="font-semibold text-teal underline-offset-2 hover:underline">Open the full audit trail</Link></div>}
      {can('company.audit.view') ? <AuditTable rows={rows} /> : <div className="rounded-lg border border-line bg-white"><EmptyState title="Only authorised company roles can view the audit log" body="Ask your company administrator or CEO/MD if you need access." /></div>}
    </div>
  )
}

export function FinanceTiers() {
  const t = useTenant()
  const { can } = useRole()
  const toast = useToast()
  const policy = useFinancePolicy(t?.slug ?? '')
  const [mode, setMode] = useState<'default' | 'custom'>(policy.mode)
  const [limit, setLimit] = useState(String(policy.officerLimit))
  if (!t) return null
  const canEdit = can('finance.tiers.manage')
  const n = Math.round(Number(limit.replace(/,/g, '')))
  const valid = mode === 'default' || (Number.isFinite(n) && n > 0)
  const eff = mode === 'default' ? DEFAULT_LIMIT : n
  const dirty = mode !== policy.mode || (mode === 'custom' && n !== policy.officerLimit)
  const fmt = (v: number) => `₦${v.toLocaleString('en-NG')}`
  return (
    <div>
      <PageHeader eyebrow="Settings · Finance" title="Finance disbursement tiers" desc="An internal Finance routing rule. It decides which Finance desk releases a payment after the MD has given final approval." />
      <SettingsNav />
      <form onSubmit={(e) => { e.preventDefault(); if (!valid) return; saveFinancePolicy(t.slug, { mode, officerLimit: eff }); toast('Finance tiers saved') }} className="max-w-3xl space-y-5">
        <Section title="Range" desc="Adopt the BizFlow default or set your own ceiling for the Finance Officer.">
          <div className="grid gap-3 sm:grid-cols-2">
            {([['default', 'Adopt BizFlow default', 'Finance Officer up to ₦500,000. CFO above.'], ['custom', 'Set our own range', 'Choose the ceiling for single transactions the Finance Officer can release.']] as const).map(([k, h, d]) => (
              <label key={k} className={`cursor-pointer rounded-md border p-4 text-sm transition-colors ${mode === k ? 'border-teal bg-softmint' : 'border-line hover:border-slate'} ${canEdit ? '' : 'opacity-60'}`}>
                <input type="radio" name="mode" className="sr-only" checked={mode === k} disabled={!canEdit} onChange={() => setMode(k)} />
                <div className="font-semibold">{h}</div><div className="mt-1 text-xs text-slate">{d}</div>
              </label>
            ))}
          </div>
          {mode === 'custom' && (
            <div className="mt-4 max-w-xs"><Field label="Finance Officer ceiling (₦)" hint="Single transaction amount, inclusive."><input inputMode="numeric" value={limit} disabled={!canEdit} onChange={(e) => setLimit(e.target.value)} className={inputCls} /></Field>
              {!valid && <p role="alert" className="mt-1 text-xs text-err">Enter an amount greater than zero.</p>}</div>
          )}
        </Section>
        <Section title="How a payment is routed" desc="Applies to every single transaction, after final approval by the MD.">
          <div className="divide-y divide-line rounded-md border border-line text-sm">
            <div className="flex justify-between gap-3 p-3"><span><b>Finance Officer</b> <span className="text-slate">· dedicated officer</span></span><span className="num">₦0 – {valid ? fmt(eff) : '…'}</span></div>
            <div className="flex justify-between gap-3 p-3"><span><b>CFO</b> <span className="text-slate">· sole authority</span></span><span className="num">above {valid ? fmt(eff) : '…'}</span></div>
          </div>
          <p className="mt-3 text-xs text-slate">This is not another approval step. The MD stays the final approver, and the tier only decides which Finance desk disburses. Changes are recorded in the audit trail.</p>
        </Section>
        {canEdit ? <Btn type="submit" disabled={!dirty || !valid}>Save tiers</Btn> : <p className="text-sm text-slate">Finance tiers are set by your company administrators.</p>}
      </form>
    </div>
  )
}

const Chain = ({ steps, finance = true }: { steps: Step[]; finance?: boolean }) => (
  <ol className="flex flex-wrap items-center gap-y-2 text-[13px] font-semibold">
    {steps.map((st, i) => (
      <li key={st + i} className="flex items-center">
        <span className={`rounded-md border px-3 py-1.5 ${st === 'Audit' ? 'border-teal bg-softmint' : st === 'MD' ? 'border-midnight bg-midnight text-white' : 'border-line bg-white'}`}>{st === 'MD' ? 'MD · final' : st}</span>
        {(i < steps.length - 1 || finance) && <span aria-hidden className="mx-1 h-px w-4 bg-line" />}
      </li>
    ))}
    {finance && <li className="rounded-md border border-dashed border-slate px-3 py-1.5 text-slate">Finance disburses</li>}
  </ol>
)

export function ApprovalFlow() {
  const t = useTenant()
  const { can } = useRole()
  const toast = useToast()
  const saved = useFlowPolicy(t?.slug ?? '')
  const [rules, setRules] = useState<FlowRule[]>(saved.rules)
  const [tt, setTt] = useState('Purchase')
  const [amt, setAmt] = useState('3000000')
  if (!t) return null
  const canEdit = can('approvals.configure')
  const dirty = JSON.stringify(rules) !== JSON.stringify(saved.rules)
  const upd = (id: string, patch: Partial<FlowRule>) => setRules(rules.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const toggle = (x: FlowRule, st: Step) => upd(x.id, { steps: x.steps.includes(st) ? x.steps.filter((y) => y !== st) : [...x.steps, st] })
  const valid = rules.every((x) => x.steps.length > 0 && x.minAmount >= 0)
  const preview = chainFor({ type: tt, amount: Math.round(Number(amt.replace(/,/g, ''))) || 0 }, { rules })
  return (
    <div>
      <PageHeader eyebrow="Settings · Approvals" title="Approval flow" desc="BizFlow sets the standard. Add the departments your company needs, by request type and amount." />
      <SettingsNav />
      <div className="max-w-3xl space-y-5">
        <Section title="BizFlow standard" desc="Applies to every company and cannot be removed.">
          <Chain steps={['Manager', 'Audit', 'MD']} />
          <ul className="mt-4 space-y-1.5 text-xs text-slate">
            <li><b className="text-ink">Audit is part of every request.</b> It always reviews before the MD, so it cannot be switched off.</li>
            <li><b className="text-ink">The MD is always the final approver</b> on requests involving money. Nothing is approved after the MD.</li>
            <li><b className="text-ink">Finance only disburses.</b> It never approves, and the tier rule still picks the desk.</li>
          </ul>
        </Section>
        <Section title="Your additional steps" desc="Add Compliance, HR or Legal where your company needs them. They sit between Audit and the MD unless you place them before Audit.">
          {rules.length === 0 && <p className="mb-3 rounded-md bg-cloud p-3 text-sm text-slate">No extra steps yet. Every request follows the BizFlow standard.</p>}
          <div className="space-y-3">
            {rules.map((x, i) => (
              <fieldset key={x.id} disabled={!canEdit} className="rounded-md border border-line p-4">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate">Rule {i + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Request type"><select value={x.type} onChange={(e) => upd(x.id, { type: e.target.value })} className={inputCls}>{REQUEST_TYPES.map((o) => <option key={o}>{o}</option>)}</select></Field>
                  <Field label="From amount (₦)" hint="0 = any amount"><input inputMode="numeric" value={x.minAmount ? x.minAmount.toLocaleString('en-NG') : '0'} onChange={(e) => upd(x.id, { minAmount: Math.max(0, Math.round(Number(e.target.value.replace(/,/g, ''))) || 0) })} className={inputCls} /></Field>
                  <Field label="Placed"><select value={x.placement} onChange={(e) => upd(x.id, { placement: e.target.value as FlowRule['placement'] })} className={inputCls}><option value="after-audit">After Audit</option><option value="before-audit">Before Audit</option></select></Field>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {OPTIONAL_STEPS.map((o) => (
                    <label key={o.id} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${x.steps.includes(o.id) ? 'border-teal bg-softmint font-semibold' : 'border-line'}`} title={o.desc}>
                      <input type="checkbox" className="accent-teal" checked={x.steps.includes(o.id)} onChange={() => toggle(x, o.id)} />{o.label}
                    </label>
                  ))}
                  {canEdit && <button type="button" onClick={() => setRules(rules.filter((y) => y.id !== x.id))} className="ml-auto min-h-9 cursor-pointer text-sm font-semibold text-err">Remove</button>}
                </div>
                {x.steps.length === 0 && <p role="alert" className="mt-2 text-xs text-err">Pick at least one step.</p>}
              </fieldset>
            ))}
          </div>
          {canEdit && <Btn v="secondary" s="sm" className="mt-3" onClick={() => setRules([...rules, { id: `r${Date.now()}`, type: 'Any', minAmount: 0, steps: ['Compliance'], placement: 'after-audit' }])}>Add a step rule</Btn>}
        </Section>
        <Section title="Try it" desc="See the route a request would take under the rules above.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Request type"><select value={tt} onChange={(e) => setTt(e.target.value)} className={inputCls}>{REQUEST_TYPES.filter((o) => o !== 'Any').map((o) => <option key={o}>{o}</option>)}</select></Field>
            <Field label="Amount (₦)"><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} className={inputCls} /></Field>
          </div>
          <div className="mt-4"><Chain steps={preview} finance={preview.includes('MD')} /></div>
          <p className="mt-3 text-xs text-slate">{preview.map((st) => STEP_OWNER[st]).join(' → ')}{preview.includes('MD') ? ', then Finance disburses.' : '. No money is involved, so there is no MD or Finance step.'}</p>
        </Section>
        {canEdit
          ? <div className="flex flex-wrap gap-2"><Btn disabled={!dirty || !valid} onClick={() => { saveFlowPolicy(t.slug, { rules }); toast('Approval flow saved') }}>Save approval flow</Btn>{dirty && <Btn v="secondary" onClick={() => setRules(saved.rules)}>Discard changes</Btn>}</div>
          : <p className="text-sm text-slate">The approval flow is set by your company administrators.</p>}
      </div>
    </div>
  )
}
