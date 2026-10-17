import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Check, CheckCircle2, Clock, CreditCard, Eye, EyeOff, Landmark, Loader2, Lock, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Badge, Btn, Field, Logo, Stepper, Tabs, inputCls } from '../../components/ui'
import { emailInUse, slugTaken, slugify, tenantBySignup } from '../../tenant/store'
import { INDUSTRIES, SIZES, STATES } from '../app/CompanySettings'
import { GROUPS, LIMIT_DEFS, MODULES, addonFits, addonPrice, couponCheck, expandModules, fmtLimit, fitsEmployees, isCustom, modelOf, money, publicPlans, rateAmount, recommendPlan, planById, depsOf, useBilling } from '../../data/billing'
import type { Plan } from '../../data/billing'
import { addonCovered, addonNeeds, newVirtualAccount, planModules, priceOrder, provisionWorkspace } from '../../data/signup'
import type { Cycle, VirtualAccount } from '../../data/signup'
import { hashPassword, passwordStrength } from '../../security/credentials'
import type { TenantAdmin } from '../../tenant/store'
import { attributeSignup, lookupPartnerCode, normCode } from '../../data/partners'
import Summary from './Summary'
import Transfer from './Transfer'
import QuoteRequest from './QuoteRequest'

const STEPS = ['Company', 'Plan', 'Modules', 'Payment', 'Account']
const PROVISION = ['Creating your company workspace', 'Setting up your secure database', 'Configuring modules for your plan', 'Creating the administrator account', 'Applying Nigerian payroll defaults (PAYE, pension, NHF)', 'Preparing your dashboard']
const KEY = 'bf-signup-v1'

type Form = { name: string; contact: string; email: string; phone: string; industry: string; employees: number; state: string; cac: string }
type Saved = {
  step: number; f: Form; ws: string; wsEdited: boolean; planId: string; selected: string[]; addons: string[]; annual: boolean; coupon: string
  signupId: string; ref: string; pay: 'card' | 'transfer'; paid: number; paidMethod: 'card' | 'transfer'; va: VirtualAccount | null
}
const uid = () => Math.random().toString(36).slice(2, 8).toUpperCase()
const fresh = (): Saved => ({ step: 0, f: { name: '', contact: '', email: '', phone: '', industry: '', employees: 0, state: '', cac: '' }, ws: '', wsEdited: false, planId: '', selected: [], addons: [], annual: true, coupon: '', signupId: `su-${uid()}${uid()}`, ref: `BF-${uid()}`, pay: 'card', paid: 0, paidMethod: 'card', va: null })
const load = (): Saved => {
  try { const s = { ...fresh(), ...JSON.parse(sessionStorage.getItem(KEY) || '{}') } as Saved; if (s.step >= 4 && !s.paid) s.step = 3; if (s.paid) s.step = 4; return s } catch { return fresh() }
}
type Phase = 'wizard' | 'otp' | 'verify' | 'failed' | 'pending' | 'paid' | 'prov' | 'provfail'
type Outcome = 'success' | 'declined' | 'pending' | 'otp' | 'provfail'

export default function GetStarted() {
  const nav = useNavigate()
  const billing = useBilling()
  const [init] = useState(load)
  const [step, setStep] = useState(init.step)
  const [f, setF] = useState(init.f)
  const [ws, setWs] = useState(init.ws)
  const [wsEdited, setWsEdited] = useState(init.wsEdited)
  const [planId, setPlanId] = useState(init.planId)
  const [selected, setSelected] = useState(init.selected)
  const [addons, setAddons] = useState(init.addons)
  const [annual, setAnnual] = useState(init.annual)
  const [coupon, setCoupon] = useState(init.coupon)
  const [signupId] = useState(init.signupId)
  const [ref] = useState(init.ref)
  const [partnerCode, setPartnerCode] = useState(() => { try { const q = new URLSearchParams(window.location.search); return normCode(q.get('ref') || q.get('partner') || sessionStorage.getItem('bf-partner-code') || '') } catch { return '' } })
  useEffect(() => { try { sessionStorage.setItem('bf-partner-code', partnerCode) } catch { /* private mode */ } }, [partnerCode])
  const partnerFound = partnerCode ? lookupPartnerCode(partnerCode) : null
  const [pay, setPay] = useState(init.pay)
  const [paid, setPaid] = useState(init.paid)
  const [paidMethod, setPaidMethod] = useState(init.paidMethod)
  const [va, setVa] = useState(init.va)
  const [phase, setPhase] = useState<Phase>('wizard')
  const [outcome, setOutcome] = useState<Outcome>('success')
  const [couponInput, setCouponInput] = useState('')
  const [couponMsg, setCouponMsg] = useState('')
  const [quoteFor, setQuoteFor] = useState<{ plan: string; reason?: string } | null>(null)
  const [card, setCard] = useState({ number: '5399 8300 0000 1234', exp: '08 / 28', cvv: '123', name: '' })
  const [otp, setOtp] = useState('')
  const [otpErr, setOtpErr] = useState('')
  const [paying, setPaying] = useState(false)
  const [tick, setTick] = useState(0)
  const [acct, setAcct] = useState<{ name?: string; email?: string; phone?: string; pw: string; pw2: string; terms: boolean }>({ pw: '', pw2: '', terms: false })
  const [showPw, setShowPw] = useState(false)
  const [acctErr, setAcctErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [admin, setAdmin] = useState<TenantAdmin | null>(null)
  const [done, setDone] = useState(0)
  const [broke, setBroke] = useState(true)
  const [provErr, setProvErr] = useState('')
  const slugRef = useRef('')
  const top = useRef<HTMLDivElement>(null)

  // Persist wizard progress (never the password).
  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify({ step, f, ws, wsEdited, planId, selected, addons, annual, coupon, signupId, ref, pay, paid, paidMethod, va } satisfies Saved)) } catch { /* private mode */ }
  }, [step, f, ws, wsEdited, planId, selected, addons, annual, coupon, signupId, ref, pay, paid, paidMethod, va])
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }) }, [step, phase])
  // A reload after provisioning goes straight to sign-in.
  useEffect(() => { const t = tenantBySignup(signupId); if (t && t.admin) { sessionStorage.removeItem(KEY); nav(`/w/${t.slug}/login?email=${encodeURIComponent(t.admin.email)}&welcome=1`, { replace: true }) } }, [signupId, nav])

  const wantSlug = wsEdited ? ws : (f.name.trim() ? slugify(f.name) : '')
  const clean = wantSlug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)
  const taken = !clean || slugTaken(clean)
  const base = f.name.trim() ? slugify(f.name) : ''
  const alts = [base + 'limited', base + 'ng', base + 'group'].filter((a) => a && !slugTaken(a))
  const emp = Math.max(1, f.employees)
  const cycle: Cycle = annual ? 'annual' : 'monthly'
  const emailTaken = /\S+@\S+\.\S+/.test(f.email) && emailInUse(f.email)
  const okCompany = !!(f.name.trim() && !taken && /\S+@\S+\.\S+/.test(f.email) && !emailTaken && f.phone.trim() && f.contact.trim() && f.employees >= 1 && f.industry && f.state)
  const plan = planById(billing, planId)
  const plans = publicPlans(billing)
  const rec = f.employees >= 1 ? recommendPlan(billing, f.employees, 'NGN') : null
  const order = useMemo(() => priceOrder(billing, { planId, modules: selected, addons, employees: emp, cycle, coupon }), [billing, planId, selected, addons, emp, cycle, coupon])
  const m = (n: number) => money(n, 'NGN', { s: billing })
  const orderOk = !!plan && order.mq.ok && !order.mq.custom && order.modules.length > 0
  const size = SIZES.find((x) => emp <= parseInt(x.replace('+', '').split('–').pop()!)) ?? '500+'
  const amountDue = paid || order.total

  // A coupon that stops applying (plan or cycle changed) is removed with an explanation.
  useEffect(() => { if (coupon && planId && !paid && !order.coupon.ok) { setCoupon(''); setCouponMsg(order.coupon.message || 'That coupon no longer applies to this order.') } }, [coupon, planId, paid, order.coupon.ok, order.coupon.message])

  const applyCoupon = () => {
    const r = couponCheck(billing, couponInput, { planId, currency: 'NGN', cycle, isNew: true, companyId: 'c-new' })
    if (r.ok) { setCoupon(couponInput.trim().toUpperCase()); setCouponInput(''); setCouponMsg('') } else setCouponMsg(r.message || 'That code is not valid.')
  }

  const choosePlan = (p: Plan) => {
    if (isCustom(p)) { setQuoteFor({ plan: p.id }); return }
    if (p.id !== planId) { setPlanId(p.id); setSelected(expandModules(billing, planModules(billing, p.id)).selected); setAddons([]) }
  }
  const setMods = (ids: string[]) => setSelected(expandModules(billing, ids).selected)

  // Payment
  useEffect(() => {
    if (step === 3 && pay === 'transfer' && !paid && phase === 'wizard' && orderOk && (!va || va.amount !== order.total)) setVa(newVirtualAccount(order.total))
  }, [step, pay, paid, phase, orderOk, va, order.total])
  useEffect(() => {
    if (phase === 'verify') { const t = setTimeout(() => { if (outcome === 'declined') setPhase('failed'); else if (outcome === 'pending') setPhase('pending'); else markPaid('card') }, 1600); return () => clearTimeout(t) }
    if (phase === 'paid') { const t = setTimeout(() => { setStep(4); setPhase('wizard') }, 1600); return () => clearTimeout(t) }
  }, [phase, outcome]) // eslint-disable-line react-hooks/exhaustive-deps
  const markPaid = (method: 'card' | 'transfer') => { setPaid(order.total); setPaidMethod(method); setVa(null); setPhase('paid') }
  const cardOk = card.number.replace(/\D/g, '').length >= 13 && /^\d{2}\s?\/\s?\d{2}$/.test(card.exp.trim()) && /^\d{3,4}$/.test(card.cvv.trim())
  const payCard = () => {
    if (!cardOk || paying) return
    setPaying(true)
    setTimeout(() => { setPaying(false); setOtp(''); setOtpErr(''); setPhase(outcome === 'otp' ? 'otp' : 'verify') }, 900)
  }

  // Provisioning
  const attempt = () => {
    if (slugRef.current || !admin) return true
    if (outcome === 'provfail' && broke) { setProvErr('Our provisioning service did not respond.'); setPhase('provfail'); return false }
    try {
      slugRef.current = provisionWorkspace({ signupId, ref, slug: clean, company: { name: f.name.trim(), contact: f.contact, email: f.email, phone: f.phone, industry: f.industry, state: f.state, cac: f.cac, employees: emp, size }, admin, planId, modules: selected, addons, cycle, coupon, method: paidMethod, paid: paid || order.total })
      if (partnerFound && slugRef.current) attributeSignup(partnerCode, slugRef.current, order.monthly)
      return true
    } catch (e) { setProvErr(e instanceof Error ? e.message : 'Provisioning failed.'); setPhase('provfail'); return false }
  }
  useEffect(() => {
    if (phase !== 'prov') return
    if (done === 3 && !attempt()) return
    if (done >= PROVISION.length) {
      const t = setTimeout(() => { sessionStorage.removeItem(KEY); nav(`/w/${slugRef.current}/login?email=${encodeURIComponent(admin?.email ?? f.email)}&welcome=1`, { replace: true }) }, 900)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setDone((d) => d + 1), 700)
    return () => clearTimeout(t)
  }, [phase, done]) // eslint-disable-line react-hooks/exhaustive-deps

  const aEmail = acct.email ?? f.email
  const aName = acct.name ?? f.contact
  const aPhone = acct.phone ?? f.phone
  const strength = passwordStrength(acct.pw)
  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setAcctErr('')
    if (!aName.trim()) return setAcctErr('Enter your full name.')
    if (!/\S+@\S+\.\S+/.test(aEmail)) return setAcctErr('Enter a valid work email.')
    if (emailInUse(aEmail)) return setAcctErr('An account with this email already exists. Use a different email or sign in.')
    if (!strength.valid) return setAcctErr('Choose a stronger password: at least 8 characters with a mix of cases, numbers or symbols.')
    if (acct.pw !== acct.pw2) return setAcctErr('The two passwords do not match.')
    if (!acct.terms) return setAcctErr('Accept the terms to continue.')
    setBusy(true)
    try {
      const credential = await hashPassword(acct.pw)
      setAdmin({ name: aName.trim(), email: aEmail.trim().toLowerCase(), phone: aPhone, credential, createdAt: new Date().toISOString() })
      setAcct((a) => ({ ...a, pw: '', pw2: '' }))
      setDone(0); setBroke(true); setPhase('prov')
    } catch (err) { setAcctErr(err instanceof Error ? err.message : 'Could not secure your password.') } finally { setBusy(false) }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-cloud">
      <header className="border-b border-line bg-white"><div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4"><Link to="/"><Logo /></Link><span className="text-sm text-slate">Already have a workspace? <Link to="/sign-in" className="font-semibold text-teal">Sign in</Link></span></div></header>
      <main ref={top} className="mx-auto max-w-5xl px-4 py-8 md:py-12">{children}</main>
    </div>
  )
  const card$ = (children: React.ReactNode) => <div className="mx-auto max-w-lg rounded-lg border border-line bg-white p-8 text-center">{children}</div>

  if (phase === 'otp') return shell(card$(
    <form onSubmit={(e) => { e.preventDefault(); if (otp === '123456') { setPhase('verify'); setOutcome('success') } else setOtpErr('That code is not correct. Demo code is 123456.') }}>
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-softmint text-teal"><Lock size={26} /></span>
      <h1 className="mt-4 text-2xl font-semibold">Verify with your bank</h1>
      <p className="mt-2 text-slate">Enter the 6-digit code your bank sent to authorise {m(order.total)}. Demo code: 123456.</p>
      <input aria-label="One-time code" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className={`${inputCls} mx-auto mt-5 max-w-[200px] text-center font-mono text-lg tracking-[0.4em]`} autoFocus />
      {otpErr && <p role="alert" className="mt-2 text-sm text-err">{otpErr}</p>}
      <div className="mt-5 flex justify-center gap-2"><Btn type="submit" disabled={otp.length !== 6}>Confirm payment</Btn><Btn type="button" v="secondary" onClick={() => { setOutcome('success'); setPhase('wizard') }}>Cancel</Btn></div>
    </form>,
  ))
  if (phase === 'verify') return shell(card$(<><Loader2 size={32} className="mx-auto animate-spin text-teal" /><h1 className="mt-4 text-2xl font-semibold">Verifying your payment</h1><p className="mt-2 text-slate" role="status">Confirming {m(order.total)} with your bank. Please do not close this page.</p></>))
  if (phase === 'failed') return shell(card$(<>
    <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-red-50 text-err"><X size={28} /></span>
    <h1 className="mt-5 text-2xl font-semibold">Payment unsuccessful</h1>
    <p className="mt-2 text-slate">Your card was declined and you have not been charged. No workspace has been created. Your selections are saved, so you can try again.</p>
    <div className="mt-6 flex flex-wrap justify-center gap-2"><Btn onClick={() => { setOutcome('success'); setPhase('wizard') }}>Try again</Btn><Btn v="secondary" onClick={() => { setPay('transfer'); setOutcome('success'); setPhase('wizard') }}>Pay by bank transfer</Btn></div>
  </>))
  if (phase === 'pending') return shell(card$(<>
    <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-50 text-warn"><Clock size={28} /></span>
    <h1 className="mt-5 text-2xl font-semibold">Payment pending</h1>
    <p className="mt-2 text-slate">Your bank has not confirmed {m(order.total)} yet. We will continue as soon as it is confirmed. This usually takes a few minutes.</p>
    <p className="mt-3 font-mono text-sm">Reference {ref}</p>
    <div className="mt-6 flex flex-wrap justify-center gap-2"><Btn onClick={() => setPhase('verify')}>Check status</Btn><Btn v="secondary" onClick={() => { setOutcome('success'); setPhase('wizard') }}>Change payment method</Btn></div>
    <button className="mt-4 cursor-pointer text-xs text-slate underline" onClick={() => { setOutcome('success'); setPhase('verify') }}>Demo only: simulate payment confirmed</button>
  </>))
  if (phase === 'paid') return shell(card$(<>
    <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-ok/10 text-ok"><Check size={28} /></span>
    <h1 className="mt-5 text-2xl font-semibold">Payment successful</h1>
    <p className="mt-2 text-slate">Next, create your administrator account.</p>
    <dl className="mt-6 divide-y divide-line rounded-md border border-line text-left text-sm">
      <div className="flex justify-between px-4 py-2.5"><dt className="text-slate">Amount paid</dt><dd className="num font-semibold">{m(paid)}</dd></div>
      <div className="flex justify-between px-4 py-2.5"><dt className="text-slate">Method</dt><dd>{paidMethod === 'card' ? 'Card' : 'Bank transfer'}</dd></div>
      <div className="flex justify-between px-4 py-2.5"><dt className="text-slate">Reference</dt><dd className="font-mono">{ref}</dd></div>
    </dl>
  </>))
  if (phase === 'provfail') return shell(card$(<>
    <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-softmint text-teal"><Loader2 size={28} className="animate-spin" /></span>
    <h1 className="mt-5 text-2xl font-semibold">We're setting up your workspace</h1>
    <p className="mt-2 text-slate">Your payment of {m(paid)} was received and your subscription is safe. Setup is taking longer than usual. You do not need to pay again, and retrying will not create a second workspace.</p>
    {provErr && <p role="alert" className="mt-2 text-sm text-err">{provErr}</p>}
    <dl className="mt-5 divide-y divide-line rounded-md border border-line text-left text-sm">
      <div className="flex justify-between px-4 py-2.5"><dt className="text-slate">Payment</dt><dd className="font-semibold text-ok">Received · {ref}</dd></div>
      <div className="flex justify-between px-4 py-2.5"><dt className="text-slate">Workspace</dt><dd className="font-semibold text-warn">Setup delayed</dd></div>
    </dl>
    <div className="mt-6 flex flex-wrap justify-center gap-2"><Btn onClick={() => { setBroke(false); setProvErr(''); setDone(0); setPhase('prov') }}>Retry setup</Btn><Btn v="secondary" to="/contact">Contact BizFlow Support</Btn></div>
  </>))
  if (phase === 'prov') return shell(
    <div className="mx-auto max-w-lg rounded-lg border border-line bg-white p-8">
      <h1 className="text-2xl font-semibold">Setting up your BizFlow workspace...</h1>
      <p className="mt-1 text-sm text-slate">This takes a few seconds. Please keep this page open.</p>
      <ul className="mt-6 space-y-3" aria-live="polite">
        {PROVISION.map((p, i) => (
          <li key={p} className={`flex items-center gap-3 text-sm ${i > done ? 'text-slate/60' : ''}`}>
            {i < done ? <span className="flex size-6 items-center justify-center rounded-full bg-ok text-white"><Check size={14} /></span> : i === done ? <Loader2 size={24} className="animate-spin text-teal" /> : <span className="size-6 rounded-full border border-line" />}
            {p}
          </li>
        ))}
      </ul>
      {done >= PROVISION.length && <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-ok"><ShieldCheck size={16} />Ready. Taking you to sign in...</p>}
    </div>,
  )

  /* ---------- wizard ---------- */
  const group = (ids: string[]) => ids
  const modSelect = (ids: string[]) => setMods([...selected, ...ids])
  const modClear = (ids: string[]) => setMods(selected.filter((id) => !ids.includes(id)))
  const planMods = new Set(plan ? planModules(billing, plan.id) : [])
  const goBack = (to: number) => <button type="button" onClick={() => setStep(to)} className="mt-6 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate hover:text-ink"><ArrowLeft size={15} />Back</button>
  const status = paid ? <Badge tone="green">Paid · {ref}</Badge> : <Badge tone="amber">Awaiting payment</Badge>

  const primary = (() => {
    if (quoteFor) return null
    if (step === 0) return <Btn s="lg" className="w-full" type="submit" form="company-form" disabled={!okCompany}>Continue to plan</Btn>
    if (step === 1) return <Btn s="lg" className="w-full" onClick={() => setStep(2)} disabled={!plan || isCustom(plan) || !fitsEmployees(plan, emp)}>Continue to modules</Btn>
    if (step === 2) return <Btn s="lg" className="w-full" onClick={() => setStep(3)} disabled={!orderOk}>Continue to payment</Btn>
    if (step === 3) return pay === 'card' ? <Btn s="lg" className="w-full" onClick={payCard} disabled={paying || !cardOk || !orderOk}>{paying ? 'Processing payment...' : `Pay ${m(order.total)}`}</Btn> : <Btn s="lg" className="w-full" onClick={() => setTick((n) => n + 1)} disabled={!va}>I've made the transfer</Btn>
    return <Btn s="lg" className="w-full" type="submit" form="admin-form" disabled={busy}>{busy ? 'Securing your account...' : 'Create account and launch'}</Btn>
  })()

  return shell(
    <>
      <div className="mb-8 grid gap-4 md:grid-cols-[1fr_auto] md:items-end"><div className="max-w-2xl"><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-softmint px-3 py-1 text-xs font-semibold text-teal"><Sparkles size={13} />Built around your operations</div><h1 className="text-3xl font-semibold md:text-4xl">Shape your BizFlow workspace</h1><p className="mt-2 text-slate">Tell us about your company, pick a plan and the modules you need, pay securely, then create your administrator account.</p></div><div className="hidden rounded-lg border border-line bg-white px-4 py-3 text-sm md:block"><div className="font-semibold">Secure Nigerian business setup</div><div className="mt-1 text-xs text-slate">NDPR-aware · VAT calculated · Data isolated</div></div></div>
      <div className="mb-8 overflow-x-auto pb-1"><Stepper steps={STEPS} at={step} /></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0 rounded-lg border border-line bg-white p-5 md:p-7">
          {quoteFor && (
            <QuoteRequest seed={{ company: f.name, contact: f.contact, email: f.email, phone: f.phone, employees: f.employees, industry: f.industry, state: f.state }} planId={quoteFor.plan} planName={planById(billing, quoteFor.plan)?.name ?? 'Enterprise'} modules={order.modules} reason={quoteFor.reason} onBack={() => setQuoteFor(null)} />
          )}
          {!quoteFor && step === 0 && (
            <form id="company-form" onSubmit={(e) => { e.preventDefault(); if (okCompany) setStep(1) }} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><div className="text-xs font-semibold uppercase tracking-wider text-teal">Step 1 · Company details</div><h2 className="mt-1 text-xl font-semibold">Let's set up your workspace</h2><p className="mt-1 text-sm text-slate">These details help us recommend the right plan and configure Nigerian defaults.</p></div>
              <div className="sm:col-span-2"><Field label="Company name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} autoComplete="organization" /></Field></div>
              <div className="sm:col-span-2">
                <Field label="Referral code (optional)" hint="Enter the code your accountant or BizFlow partner gave you"><input value={partnerCode} onChange={(e) => setPartnerCode(normCode(e.target.value))} className={inputCls} autoComplete="off" /></Field>
                {partnerCode && <p role="status" className={`mt-1.5 text-[13px] ${partnerFound ? 'text-ok' : 'text-err'}`}>{partnerFound ? `Referred by ${partnerFound.name}` : 'This code is not recognised. You can continue without it.'}</p>}
              </div>
              <div className="sm:col-span-2">
                <Field label="Workspace address" hint="This becomes your company's permanent BizFlow address">
                  <div className="flex items-center overflow-hidden rounded-md border border-line focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20"><span className="pl-3 text-sm text-slate">https://</span><input aria-label="Workspace name" value={wsEdited ? ws : clean} onChange={(e) => { setWs(e.target.value); setWsEdited(true) }} className="h-10 min-w-0 flex-1 bg-transparent px-1 font-mono text-sm outline-none" /><span className="pr-3 text-sm text-slate">.bizflow.com</span></div>
                </Field>
                {clean && <p role="status" className={`mt-1.5 text-[13px] ${taken ? 'text-err' : 'text-ok'}`}>{taken ? `${clean}.bizflow.com is not available.` : `${clean}.bizflow.com is available`}</p>}
                {taken && alts.length > 0 && <div className="mt-1.5 flex flex-wrap gap-2">{alts.map((a) => <button type="button" key={a} onClick={() => { setWs(a); setWsEdited(true) }} className="cursor-pointer rounded-full border border-line px-3 py-1 font-mono text-xs hover:border-teal">{a}.bizflow.com</button>)}</div>}
              </div>
              <Field label="Contact person"><input required value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} className={inputCls} autoComplete="name" /></Field>
              <div>
                <Field label="Work email"><input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} autoComplete="email" aria-invalid={emailTaken} /></Field>
                {emailTaken && <p role="alert" className="mt-1.5 text-[13px] text-err">An account with this email already exists. <Link to="/sign-in" className="font-semibold underline">Sign in</Link> or use another email.</p>}
              </div>
              <Field label="Phone number"><input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inputCls} autoComplete="tel" /></Field>
              <Field label="Number of employees"><input required type="number" min={1} value={f.employees || ''} onChange={(e) => setF({ ...f, employees: Math.max(0, Number(e.target.value) || 0) })} className={inputCls} /></Field>
              <Field label="Business type"><select required value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} className={inputCls}><option value="" disabled>Select business type</option>{INDUSTRIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="State"><select required value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} className={inputCls}><option value="" disabled>Select state</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <div className="sm:col-span-2"><Field label="CAC registration number (optional)"><input value={f.cac} onChange={(e) => setF({ ...f, cac: e.target.value })} className={inputCls} /></Field></div>
            </form>
          )}

          {!quoteFor && step === 1 && (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-wider text-teal">Step 2 · Choose a plan</div><h2 className="mt-1 text-xl font-semibold">Pick the plan that fits {f.name || 'your company'}</h2><p className="mt-1 text-sm text-slate">Each plan comes with a ready set of modules. You can fine-tune them next.</p></div><CycleToggle annual={annual} setAnnual={setAnnual} /></div>
              <div className="mt-5 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Plans">
                {plans.map((p) => {
                  const custom = isCustom(p)
                  const fits = custom || fitsEmployees(p, emp)
                  const o = custom ? null : priceOrder(billing, { planId: p.id, modules: planModules(billing, p.id), addons: [], employees: emp, cycle, coupon: '' })
                  const on = planId === p.id
                  return (
                    <div key={p.id} role="radio" aria-checked={on} aria-disabled={!fits} tabIndex={fits ? 0 : -1} onClick={() => fits && choosePlan(p)} onKeyDown={(e) => { if (fits && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choosePlan(p) } }} className={`relative flex flex-col rounded-lg border p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal/40 ${!fits ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${on ? 'border-teal bg-softmint/40 ring-1 ring-teal' : 'border-line hover:border-teal/50'}`}>
                      <div className="flex flex-wrap items-center gap-2"><b className="font-display text-lg">{p.name}</b>{rec?.id === p.id && <Badge tone="teal">Recommended for {f.employees} staff</Badge>}{on && <Badge tone="green">Selected</Badge>}</div>
                      <p className="mt-1 text-xs text-slate">{p.tagline}</p>
                      <div className="mt-3">{custom ? <span className="font-display text-xl font-semibold">Talk to sales</span> : <><span className="num font-display text-2xl font-semibold">{o ? m(o.monthly) : '—'}</span><span className="text-xs text-slate"> / month{annual ? ', billed annually' : ''}</span><div className="text-[11px] text-slate">for {emp} employee{emp > 1 ? 's' : ''}, before VAT</div></>}</div>
                      <ul className="mt-3 space-y-1 text-xs text-slate">
                        <li className="flex items-center gap-1.5"><Check size={13} className="text-teal" /><b className="text-ink">{custom ? 'Custom' : planModules(billing, p.id).length}</b> modules included</li>
                        {LIMIT_DEFS.slice(0, 4).map((l) => <li key={l.key} className="flex items-center gap-1.5"><Check size={13} className="text-teal" />{l.label}: {fmtLimit(l.key, p.limits[l.key])}</li>)}
                        {p.highlights.slice(0, 2).map((h) => <li key={h} className="flex items-center gap-1.5"><Check size={13} className="text-teal" />{h}</li>)}
                      </ul>
                      {!fits && <p className="mt-2 text-xs font-semibold text-err">Supports up to {fmtLimit('employees', p.limits.employees)} employees</p>}
                      {custom && <Btn v="secondary" className="mt-3 self-start" onClick={(e) => { e.stopPropagation(); choosePlan(p) }}>Request a quote</Btn>}
                    </div>
                  )
                })}
              </div>
              {goBack(0)}
            </div>
          )}

          {!quoteFor && step === 2 && plan && (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-wider text-teal">Step 3 · Modules</div><h2 className="mt-1 text-xl font-semibold">Choose the modules you need</h2><p className="mt-1 text-sm text-slate">{plan.name} modules are pre-selected. Foundation modules are always included; dependencies are added automatically.</p></div><CycleToggle annual={annual} setAnnual={setAnnual} /></div>
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-cloud px-3 py-2 text-sm"><b>{order.modules.length}</b> selected
                <span className="mx-1 text-line">|</span>
                <button type="button" className="cursor-pointer font-semibold text-teal" onClick={() => setMods(billing.modulePrices.filter((r) => r.active).map((r) => r.moduleId))}>Select all</button>
                <button type="button" className="cursor-pointer font-semibold text-slate hover:text-ink" onClick={() => setMods([])}>Clear all</button>
                <button type="button" className="ml-auto cursor-pointer font-semibold text-slate hover:text-ink" onClick={() => setMods(planModules(billing, plan.id))}>Reset to {plan.name}</button></div>
              <div className="mt-5 space-y-5">
                {GROUPS.map((g) => {
                  const rates = billing.modulePrices.filter((rate) => rate.active && MODULES.find((mod) => mod.id === rate.moduleId)?.group === g.id)
                  if (!rates.length) return null
                  const ids = group(rates.map((r) => r.moduleId))
                  const count = rates.filter((r) => order.modules.includes(r.moduleId)).length
                  return (
                    <section key={g.id} aria-label={g.name}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-sm font-semibold uppercase tracking-wide">{g.name} <span className="ml-1 text-xs font-normal normal-case text-slate">{count} of {rates.length} selected</span></h3><span className="flex gap-3 text-xs font-semibold"><button type="button" disabled={count === rates.length} className="cursor-pointer text-teal disabled:cursor-default disabled:opacity-40" onClick={() => modSelect(ids)} aria-label={`Select all ${g.name}`}>Select all</button><button type="button" className="cursor-pointer text-slate hover:text-ink" onClick={() => modClear(ids)} aria-label={`Clear ${g.name}`}>Clear</button></span></div>
                      <div className="grid gap-2 md:grid-cols-2">{rates.map((rate) => {
                        const mod = MODULES.find((item) => item.id === rate.moduleId)!
                        const tier = rate.bands.find((item) => emp >= item.minEmployees && (item.maxEmployees === null || emp <= item.maxEmployees))
                        const checked = order.modules.includes(rate.moduleId)
                        const charge = rateAmount(billing, rate, emp, 'NGN', cycle)
                        const model = modelOf(rate)
                        const needs = depsOf(billing, rate.moduleId).filter((d) => billing.modulePrices.some((r) => r.active && r.moduleId === d)).map((d) => MODULES.find((item) => item.id === d)?.name ?? d)
                        const neededBy = order.modules.filter((id) => id !== rate.moduleId && depsOf(billing, id).includes(rate.moduleId))
                        const locked = rate.required || neededBy.length > 0
                        return (
                          <label key={rate.moduleId} className={`relative flex gap-3 rounded-lg border p-4 transition-colors ${locked ? 'cursor-default' : 'cursor-pointer'} ${checked ? 'border-teal bg-softmint/40' : 'border-line bg-white hover:border-teal/50'}`}>
                            <input type="checkbox" className="mt-1 size-4 accent-teal" checked={checked} disabled={locked} onChange={(e) => (e.target.checked ? setMods([...selected, rate.moduleId]) : setSelected(selected.filter((id) => id !== rate.moduleId)))} />
                            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><b>{mod.name}</b>{rate.required && <Badge tone="teal">Foundation</Badge>}{!rate.required && planMods.has(rate.moduleId) && <Badge tone="green">In {plan.name}</Badge>}{!planMods.has(rate.moduleId) && !rate.required && checked && <Badge tone="blue">Extra</Badge>}{!!rate.trialDays && <Badge tone="blue">{rate.trialDays}-day trial</Badge>}</span>
                              <span className="mt-1 block text-xs leading-relaxed text-slate">{rate.summary}</span>
                              {needs.length > 0 && <span className="mt-1 block text-[11px] text-slate">Needs {needs.join(', ')}{neededBy.length ? ` · required by ${neededBy.map((id) => MODULES.find((x) => x.id === id)?.name).join(', ')}` : ''}</span>}
                              {needs.length === 0 && neededBy.length > 0 && <span className="mt-1 block text-[11px] text-slate">Required by {neededBy.map((id) => MODULES.find((x) => x.id === id)?.name).join(', ')}</span>}
                              <span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-medium text-slate">{model === 'per_employee' ? 'Per employee' : model === 'usage' ? `Usage${rate.unitLabel ? ` · per ${rate.unitLabel}` : ''}` : tier?.label ?? 'Custom capacity'}</span><span className="num font-semibold text-ink">{charge === 'custom' ? 'Custom quote' : charge !== null ? `${money(annual ? charge / 12 : charge, 'NGN', { trim: true, s: billing })} / mo` : 'Contact sales'}</span></span>
                              {!!rate.setupFee?.NGN && <span className="mt-1 block text-[11px] text-slate">One-time setup {money(rate.setupFee.NGN, 'NGN', { trim: true, s: billing })}</span>}</span>
                          </label>
                        )
                      })}</div>
                    </section>
                  )
                })}
              </div>
              {billing.bundles.filter((b) => b.active && b.discountPct > 0).length > 0 && <div className="mt-5"><h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide">Bundles</h3><div className="grid gap-2 sm:grid-cols-3">{billing.bundles.filter((b) => b.active && b.discountPct > 0).map((b) => { const on = b.moduleIds.every((id) => order.modules.includes(id)); return <button type="button" key={b.id} onClick={() => (on ? modClear(b.moduleIds) : modSelect(b.moduleIds))} aria-pressed={on} className={`cursor-pointer rounded-lg border p-3 text-left text-sm ${on ? 'border-teal bg-softmint/50 ring-1 ring-teal' : 'border-line bg-white hover:border-teal/50'}`}><span className="flex items-center justify-between gap-2"><b>{b.name}</b><Badge tone="green">Save {b.discountPct}%</Badge></span><span className="mt-1 block text-xs text-slate">{b.moduleIds.length} modules · {on ? 'Included in your order' : 'Add the whole pack'}</span></button> })}</div></div>}
              {(() => {
                const list = billing.addons.filter((a) => addonFits(a, plan.id, billing))
                if (!list.length) return null
                return (
                  <div className="mt-6"><h3 className="font-display text-sm font-semibold uppercase tracking-wide">Add-ons for {plan.name}</h3><p className="mt-0.5 text-xs text-slate">Optional extras that raise limits or unlock features.</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">{list.map((a) => {
                      const covered = addonCovered(a, order.modules)
                      const missing = addonNeeds(billing, a, order.modules)
                      const price = addonPrice(a, 'NGN', cycle)
                      const on = addons.includes(a.id) && !covered && !missing.length
                      const dis = covered || missing.length > 0 || price === null
                      return (
                        <label key={a.id} className={`flex gap-3 rounded-lg border p-4 ${dis ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${on ? 'border-teal bg-softmint/40' : 'border-line hover:border-teal/50'}`}>
                          <input type="checkbox" className="mt-1 size-4 accent-teal" checked={on || covered} disabled={dis} onChange={(e) => setAddons(e.target.checked ? [...addons, a.id] : addons.filter((x) => x !== a.id))} />
                          <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><b>{a.name}</b><Badge tone="blue">{a.category}</Badge></span><span className="mt-1 block text-xs text-slate">{a.description}</span>
                            {covered && <span className="mt-1 block text-[11px] font-semibold text-ok">Already included in your selected modules</span>}
                            {missing.length > 0 && <span className="mt-1 block text-[11px] text-warn">Requires {missing.map((id) => MODULES.find((x) => x.id === id)?.name ?? id).join(', ')}. Add it above to enable this.</span>}
                            {price !== null && !covered && <span className="num mt-2 block text-xs font-semibold">{money(annual ? price / 12 : price, 'NGN', { trim: true, s: billing })} / mo{a.freq === 'annual' ? ' · billed yearly' : ''}</span>}</span>
                        </label>
                      )
                    })}</div></div>
                )
              })()}
              <div className="mt-5 rounded-lg border border-line bg-cloud p-4 text-sm"><div className="flex gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-teal" /><div><b>Starter minimum protects your connected core.</b><p className="mt-1 text-slate">Your monthly subscription cannot fall below {money(billing.starterMinimum.NGN?.monthly ?? 0, 'NGN', { trim: true, s: billing })}. This includes platform security, permissions, support, upgrades and the foundation modules.</p></div></div></div>
              {order.mq.custom && <div role="status" className="mt-4 rounded-lg border border-warn/40 bg-amber-50 p-4 text-sm text-amber-900"><b>Custom capacity review required.</b><p className="mt-1">{order.mq.reason} Our team will tailor infrastructure, support and rollout to your structure.</p><Btn v="secondary" s="sm" className="mt-3" onClick={() => setQuoteFor({ plan: plans.find(isCustom)?.id ?? plan.id, reason: order.mq.reason })}>Talk to sales</Btn></div>}
              {goBack(1)}
            </div>
          )}

          {!quoteFor && step === 3 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-teal">Step 4 · Payment</div><h2 className="mt-1 text-xl font-semibold">Pay {m(order.total)}</h2><p className="mt-1 text-sm text-slate">{plan?.name} plan · {order.modules.length} modules{order.addons.length ? ` · ${order.addons.length} add-on${order.addons.length > 1 ? 's' : ''}` : ''} · {annual ? 'billed annually' : 'billed monthly'}.</p>
              <div className="mt-4"><Tabs tabs={['Card', 'Bank transfer']} value={pay === 'card' ? 'Card' : 'Bank transfer'} onChange={(t) => setPay(t === 'Card' ? 'card' : 'transfer')} /></div>
              {pay === 'card' ? (
                <form onSubmit={(e) => { e.preventDefault(); payCard() }} className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Field label="Card number"><div className="relative"><CreditCard size={16} className="pointer-events-none absolute left-3 top-3 text-slate" /><input inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) })} className={`${inputCls} pl-9`} /></div></Field></div>
                  <div className="sm:col-span-2"><Field label="Name on card"><input autoComplete="cc-name" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} className={inputCls} placeholder={admin?.name || f.contact || 'Name on card'} /></Field></div>
                  <Field label="Expiry (MM / YY)"><input autoComplete="cc-exp" value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value.slice(0, 7) })} className={inputCls} /></Field>
                  <Field label="CVV"><input autoComplete="cc-csc" inputMode="numeric" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} className={inputCls} /></Field>
                  <button type="submit" className="sr-only">Pay</button>
                </form>
              ) : va ? (
                <Transfer va={va} money={m(va.amount)} outcome={outcome} verifyTick={tick} onNew={() => setVa(newVirtualAccount(order.total))} onConfirmed={() => markPaid('transfer')} />
              ) : <p className="mt-5 text-sm text-slate">Generating your account number...</p>}
              <p className="mt-4 flex items-center gap-1.5 text-xs text-slate"><ShieldCheck size={14} />Demo checkout. No real charge is made.</p>
              <label className="mt-3 block rounded-md border border-dashed border-line px-3 py-2 text-xs text-slate">Demo: simulate outcome
                <select value={outcome} onChange={(e) => { setOutcome(e.target.value as Outcome); setBroke(true) }} className="ml-2 rounded border border-line bg-white px-1 py-0.5 text-ink"><option value="success">Payment succeeds</option><option value="declined">Card declined</option><option value="otp">Card needs bank verification (OTP)</option><option value="pending">Payment pending / transfer not received</option><option value="provfail">Paid, setup delayed</option></select></label>
              {goBack(2)}
            </div>
          )}

          {!quoteFor && step === 4 && (
            <form id="admin-form" onSubmit={submitAccount} className="grid gap-4 sm:grid-cols-2" noValidate>
              <div className="sm:col-span-2"><div className="text-xs font-semibold uppercase tracking-wider text-teal">Step 5 · Administrator account</div><h2 className="mt-1 text-xl font-semibold">Create your administrator account</h2><p className="mt-1 text-sm text-slate">Payment received ({ref}). This account manages {f.name}'s workspace and is how you will sign in. Your password is stored only as a salted hash.</p></div>
              <Field label="Full name"><input required value={aName} onChange={(e) => setAcct({ ...acct, name: e.target.value })} className={inputCls} autoComplete="name" /></Field>
              <Field label="Work email" hint="You will sign in with this email"><input required type="email" value={aEmail} onChange={(e) => setAcct({ ...acct, email: e.target.value })} className={inputCls} autoComplete="email" /></Field>
              <div className="sm:col-span-2"><Field label="Phone number"><input value={aPhone} onChange={(e) => setAcct({ ...acct, phone: e.target.value })} className={inputCls} autoComplete="tel" /></Field></div>
              <div>
                <Field label="Password"><div className="relative"><input required type={showPw ? 'text' : 'password'} value={acct.pw} onChange={(e) => setAcct({ ...acct, pw: e.target.value })} className={`${inputCls} pr-10`} autoComplete="new-password" placeholder="Create a password" aria-describedby="pw-meter" /><button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw(!showPw)} className="absolute right-2 top-2.5 cursor-pointer text-slate">{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></Field>
                <div id="pw-meter" className="mt-2" aria-live="polite">
                  <div className="flex gap-1" aria-hidden="true">{[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= strength.score ? (strength.score <= 1 ? 'bg-err' : strength.score === 2 ? 'bg-warn' : 'bg-ok') : 'bg-line'}`} />)}</div>
                  <div className="mt-1 text-xs text-slate">{acct.pw ? <>Strength: <b className="text-ink">{strength.label}</b></> : 'At least 8 characters'}</div>
                  <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">{strength.checks.map((c) => <li key={c.label} className={c.ok ? 'text-ok' : 'text-slate'}>{c.ok ? '✓' : '○'} {c.label}</li>)}</ul>
                </div>
              </div>
              <div><Field label="Confirm password"><input required type={showPw ? 'text' : 'password'} value={acct.pw2} onChange={(e) => setAcct({ ...acct, pw2: e.target.value })} className={inputCls} autoComplete="new-password" aria-invalid={!!acct.pw2 && acct.pw !== acct.pw2} /></Field>{acct.pw2 && <p className={`mt-1.5 text-xs ${acct.pw === acct.pw2 ? 'text-ok' : 'text-err'}`}>{acct.pw === acct.pw2 ? 'Passwords match' : 'Passwords do not match'}</p>}</div>
              <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={acct.terms} onChange={(e) => setAcct({ ...acct, terms: e.target.checked })} className="mt-0.5 size-4 accent-teal" /><span>I agree to the <Link to="/contact" className="font-semibold text-teal">Terms of Service</Link> and the data processing terms (NDPR).</span></label>
              {acctErr && <p role="alert" className="rounded-md border border-err/30 bg-red-50 px-3 py-2 text-sm text-err sm:col-span-2">{acctErr}</p>}
              <p className="text-xs text-slate sm:col-span-2">Payment is complete, so your selections are locked. Use the button in the order summary to finish.</p>
            </form>
          )}
        </section>
        <Summary billing={billing} order={order} company={f.name} planName={plan?.name ?? ''} employees={f.employees} annual={annual} showLines={step >= 1 && !!plan} status={status}
          coupon={{ input: couponInput, applied: coupon && order.coupon.ok ? coupon : '', message: couponMsg, ok: false, editable: step >= 1 && step <= 3 && !paid && !!planId && !quoteFor, onInput: (v) => { setCouponInput(v); setCouponMsg('') }, onApply: applyCoupon, onRemove: () => { setCoupon(''); setCouponMsg('') } }}>
          {primary}
        </Summary>
      </div>
    </>,
  )
}

function CycleToggle({ annual, setAnnual }: { annual: boolean; setAnnual: (a: boolean) => void }) {
  return (
    <div role="group" aria-label="Billing cycle" className="inline-flex rounded-md border border-line p-0.5 text-sm font-semibold">
      {[false, true].map((a) => <button type="button" key={String(a)} onClick={() => setAnnual(a)} aria-pressed={annual === a} className={`cursor-pointer rounded px-3 py-1.5 ${annual === a ? 'bg-teal text-white' : 'text-slate'}`}>{a ? 'Annual · 2 months free' : 'Monthly'}</button>)}
    </div>
  )
}
