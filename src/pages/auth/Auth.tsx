import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import type { ReactNode } from 'react'
import { Btn, Field, inputCls, Logo, Stepper } from '../../components/ui'
import { activeCurrencies, addonFits, addonPrice, couponCheck, currencyOf, defaultCurrency, fmtDate, isCustom, iso, loadSelection, money, publicPlans, quote, saveSelection, subActions, TODAY, useBilling } from '../../data/billing'

function Shell({ children, title, sub, wide }: { children: ReactNode; title: string; sub?: string; wide?: boolean }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-14">
        <Link to="/"><Logo /></Link>
        <div className={`my-auto w-full py-12 ${wide ? 'max-w-xl' : 'max-w-md'}`}>
          <h1 className="text-4xl font-semibold">{title}</h1>
          {sub && <p className="mt-2 text-slate">{sub}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <div className="on-dark bf-deep grid-fine hidden flex-col justify-end p-14 text-white lg:flex">
        <p className="max-w-md font-display text-4xl font-medium leading-tight">Your business.<br /><span className="text-mint">One connected flow.</span></p>
        <p className="mt-4 max-w-sm text-sm text-white/55">People. Money. Work. Assets. Customers. Operations.</p>
      </div>
    </div>
  )
}

export function SignIn() {
  const nav = useNavigate()
  const [mfa, setMfa] = useState(false)
  if (mfa)
    return (
      <Shell title="Verify it's you" sub="Enter the 6-digit code from your authenticator app.">
        <form onSubmit={(e) => { e.preventDefault(); nav('/admin/business') }} className="space-y-4">
          <Field label="Verification code"><input inputMode="numeric" maxLength={6} defaultValue="428193" className={`${inputCls} num text-center font-mono text-lg tracking-[0.5em]`} /></Field>
          <Btn type="submit" className="w-full">Verify and sign in</Btn>
        </form>
      </Shell>
    )
  return (
    <Shell title="Sign in to BizFlow" sub="Welcome back.">
      <form onSubmit={(e) => { e.preventDefault(); setMfa(true) }} className="space-y-4">
        <Field label="Work email"><input type="email" defaultValue="tunde@etranzact.com" className={inputCls} /></Field>
        <Field label="Password"><input type="password" defaultValue="password123" className={inputCls} /></Field>
        <div className="flex justify-end text-sm"><Link to="/forgot-password" className="font-semibold text-teal">Forgot password?</Link></div>
        <Btn type="submit" className="w-full">Sign in</Btn>
      </form>
      <p className="mt-6 text-sm text-slate">New to BizFlow? <Link to="/get-started" className="font-semibold text-teal">Get started</Link> · <Link to="/admin/business" className="font-semibold text-teal">Explore the demo</Link></p>
    </Shell>
  )
}

export function Forgot({ reset = false }: { reset?: boolean }) {
  const [done, setDone] = useState(false)
  const nav = useNavigate()
  if (reset)
    return (
      <Shell title="Set a new password" sub="Use at least 12 characters.">
        <form onSubmit={(e) => { e.preventDefault(); nav('/sign-in') }} className="space-y-4">
          <Field label="New password"><input type="password" className={inputCls} /></Field>
          <Field label="Confirm password"><input type="password" className={inputCls} /></Field>
          <Btn type="submit" className="w-full">Update password</Btn>
        </form>
      </Shell>
    )
  return (
    <Shell title="Reset your password" sub="We will email you a secure link.">
      {done ? (
        <div role="status" className="rounded-lg bg-softmint p-5 text-sm"><b>Check your inbox.</b> If an account exists, a reset link is on its way. <Link to="/reset-password" className="font-semibold text-teal">Open demo link</Link></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); setDone(true) }} className="space-y-4">
          <Field label="Work email"><input type="email" required className={inputCls} /></Field>
          <Btn type="submit" className="w-full">Send reset link</Btn>
        </form>
      )}
    </Shell>
  )
}

export function Invite() {
  const nav = useNavigate()
  return (
    <Shell title="Join eTranzact International Plc" sub="Kemi Balogun invited you to join as Accountant, Abuja Branch.">
      <form onSubmit={(e) => { e.preventDefault(); nav('/admin/business/my') }} className="space-y-4">
        <Field label="Email"><input disabled defaultValue="zainab.lawal@etranzact.com" className={`${inputCls} bg-cloud`} /></Field>
        <Field label="Create password"><input type="password" className={inputCls} /></Field>
        <Btn type="submit" className="w-full">Accept invitation</Btn>
      </form>
    </Shell>
  )
}

type Gw = 'form' | 'processing' | 'failed' | 'success'

export function Register() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const bs = useBilling()
  const plans = publicPlans(bs)
  const saved = useMemo(loadSelection, [])
  const pick = <T,>(k: string, f: T) => (params.get(k) as unknown as T) ?? f
  const [path, setPath] = useState<'' | 'biz'>(params.get('plan') || saved ? 'biz' : '')
  const [step, setStep] = useState(0)
  const [planId, setPlanId] = useState(() => { const w = params.get('plan') ?? saved?.planId; return plans.some((p) => p.id === w) ? (w as string) : (plans.find((p) => p.recommended) ?? plans[0])?.id })
  const [cycle, setCycle] = useState<'monthly' | 'annual'>(() => (pick('cycle', saved?.cycle ?? 'annual') === 'monthly' ? 'monthly' : 'annual'))
  const [cur, setCur] = useState(() => { const c = params.get('cur') ?? saved?.currency; return c && currencyOf(bs, c)?.enabled ? c : defaultCurrency(bs) })
  const [emp, setEmp] = useState(() => Math.max(1, Number(params.get('emp') ?? saved?.employees ?? 25) || 25))
  const [addonIds, setAddonIds] = useState<string[]>(() => (params.get('addons')?.split(',').filter(Boolean) ?? saved?.addons ?? []))
  const [couponIn, setCouponIn] = useState(params.get('coupon') ?? saved?.coupon ?? '')
  const [coupon, setCoupon] = useState<string | undefined>(undefined)
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; m: string } | null>(null)
  const [company, setCompany] = useState('eTranzact International Plc')
  const [useTrial, setUseTrial] = useState(true)
  const [card, setCard] = useState('5399 8300 0000 4242')
  const [exp, setExp] = useState('09 / 29')
  const [gw, setGw] = useState<Gw>('form')
  const [result, setResult] = useState<{ ref: string; amount: number; sub: ReturnType<typeof subActions.subscribe> } | null>(null)
  const plan = plans.find((p) => p.id === planId) ?? plans[0]
  const trialAvail = !!plan && plan.trialDays > 0
  const trial = trialAvail && useTrial
  const fitAddons = bs.addons.filter((a) => plan && addonFits(a, plan.id, bs) && addonPrice(a, cur, cycle) !== null)
  const activeAddons = addonIds.filter((id) => fitAddons.some((a) => a.id === id))
  const q = plan ? quote(bs, { planId: plan.id, cycle, currency: cur, employees: emp, addonIds: activeAddons, coupon, isNew: true }) : null
  const steps = ['Account', 'Company', 'Plan & add-ons', 'Payment']
  const custom = !plan || isCustom(plan) || !q?.ok
  const dueNow = q ? (trial ? 0 : q.total) : 0
  const m = (n: number) => money(n, cur, { trim: false, s: bs })

  const choose = (id: string) => { setPlanId(id); saveSelection({ planId: id, cycle, currency: cur, employees: emp, addons: activeAddons, coupon }) }
  const applyCoupon = () => {
    if (!couponIn.trim() || !plan) { setCoupon(undefined); setCouponMsg(null); return }
    const r = couponCheck(bs, couponIn, { planId: plan.id, currency: cur, cycle, isNew: true })
    setCoupon(r.ok ? couponIn.trim().toUpperCase() : undefined); setCouponMsg({ ok: r.ok, m: r.message })
  }
  const pay = () => {
    if (!plan || !q) return
    setGw('processing')
    window.setTimeout(() => {
      const digits = card.replace(/\D/g, '')
      if (!trial && (digits.endsWith('0002') || digits.length < 12)) { setGw('failed'); return }
      const ref = 'BF-' + Math.random().toString(36).slice(2, 10).toUpperCase()
      const sub = subActions.subscribe({ company, planId: plan.id, cycle, currency: cur, employees: emp, addonIds: activeAddons, coupon, trial, card: { brand: digits.startsWith('4') ? 'Visa' : 'Mastercard', last4: digits.slice(-4), exp }, paid: dueNow, ref })
      setResult({ ref, amount: dueNow, sub }); setGw('success')
    }, 1200)
  }

  if (!path)
    return (
      <Shell title="Get started with BizFlow" sub="Choose how you are joining.">
        <div className="space-y-3">
          <button onClick={() => setPath('biz')} className="w-full cursor-pointer rounded-lg border border-line bg-white p-5 text-left transition-colors hover:border-teal">
            <div className="font-display text-xl font-semibold">I'm a business</div>
            <div className="mt-1 text-sm text-slate">Create a BizFlow workspace for your company.</div>
          </button>
          <button onClick={() => nav('/invite')} className="w-full cursor-pointer rounded-lg border border-line bg-white p-5 text-left transition-colors hover:border-teal">
            <div className="font-display text-xl font-semibold">I've been invited</div>
            <div className="mt-1 text-sm text-slate">Join a company that already uses BizFlow.</div>
          </button>
        </div>
        <p className="mt-6 text-sm text-slate">Already have an account? <Link to="/sign-in" className="font-semibold text-teal">Sign in</Link></p>
      </Shell>
    )

  if (gw === 'success' && result && plan)
    return (
      <Shell title={trial ? 'Your trial has started.' : 'Payment successful.'} sub="Your BizFlow subscription is active.">
        <dl role="status" className="divide-y divide-line rounded-lg border border-line bg-white text-sm">
          {([
            ['Plan', plan.name],
            ['Amount paid', m(result.amount)],
            ['Billing period', trial ? `${plan.trialDays}-day free trial, then ${cycle}` : `${fmtDate(iso(TODAY))} – ${fmtDate(result.sub.renewsAt)}`],
            ['Transaction reference', result.ref],
            ['Status', trial ? 'Trial' : 'Active'],
            [trial ? 'First charge' : 'Next billing date', fmtDate(result.sub.renewsAt)],
          ] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-4 py-3"><dt className="text-slate">{k}</dt><dd className="num text-right font-semibold">{v}</dd></div>)}
        </dl>
        <Btn className="mt-6 w-full" onClick={() => nav('/welcome')}>Continue to company setup</Btn>
        <p className="mt-3 text-xs text-slate">A receipt has been sent to your email.</p>
      </Shell>
    )

  if (gw === 'failed')
    return (
      <Shell title="We couldn't complete your payment." sub="Your card was not charged and your subscription has not been activated.">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">The card ending {card.replace(/\D/g, '').slice(-4)} was declined. Try again, or use a different payment method.</div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Btn className="flex-1" onClick={pay}>Try Again</Btn>
          <Btn v="secondary" className="flex-1" onClick={() => { setCard(''); setGw('form'); setStep(3) }}>Change Payment Method</Btn>
        </div>
      </Shell>
    )

  return (
    <Shell wide title={['Create your account', 'Tell us about your company', 'Choose your plan and add-ons', 'Payment'][step]}>
      <div className="mb-8 overflow-x-auto"><Stepper steps={steps} at={step} /></div>
      <form onSubmit={(e) => { e.preventDefault(); if (step === 3) pay(); else setStep(step + 1) }} className="space-y-4">
        {step === 0 && (<>
          <Field label="Full name"><input required className={inputCls} defaultValue="Oladapo Adebayo" /></Field>
          <Field label="Work email"><input required type="email" className={inputCls} defaultValue="tunde@etranzact.com" /></Field>
          <Field label="Password" hint="At least 12 characters"><input required type="password" className={inputCls} /></Field>
        </>)}
        {step === 1 && (<>
          <Field label="Company name"><input required className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employees"><input type="number" min={1} className={`${inputCls} num`} value={emp} onChange={(e) => setEmp(Math.max(1, Number(e.target.value) || 1))} /></Field>
            <Field label="Head office state"><select className={inputCls}><option>Lagos</option><option>Abuja (FCT)</option><option>Rivers</option><option>Oyo</option></select></Field>
          </div>
          <Field label="Phone"><input className={inputCls} defaultValue="0803 412 7790" /></Field>
        </>)}
        {step === 2 && (<>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="Billing cycle">{(['monthly', 'annual'] as const).map((c) => <button type="button" key={c} aria-pressed={cycle === c} onClick={() => setCycle(c)} className={`cursor-pointer rounded px-3 py-1 font-semibold capitalize ${cycle === c ? 'bg-midnight text-white' : 'text-slate'}`}>{c}</button>)}</div>
            <select aria-label="Currency" value={cur} onChange={(e) => setCur(e.target.value)} className="h-9 cursor-pointer rounded-md border border-line px-2 font-semibold">{activeCurrencies(bs).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
          </div>
          <div className="space-y-2" role="radiogroup" aria-label="Plan">
            {plans.map((p) => {
              const pr = p.prices[cur]; const c = isCustom(p) || !pr
              return (
                <label key={p.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${plan?.id === p.id ? 'border-teal bg-softmint/50' : 'border-line bg-white'}`}>
                  <input type="radio" name="plan" checked={plan?.id === p.id} onChange={() => choose(p.id)} className="mt-1 accent-teal" />
                  <span className="flex-1"><b>{p.name}</b>{p.recommended && <span className="ml-2 rounded bg-teal px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Recommended</span>}<span className="mt-0.5 block text-sm text-slate">{p.tagline}</span></span>
                  <span className="num whitespace-nowrap text-sm font-semibold">{c ? 'Custom' : <>{m(cycle === 'annual' ? pr.annual / 12 : pr.monthly)}<span className="font-normal text-slate"> / mo</span></>}</span>
                </label>
              )
            })}
          </div>
          {plan && !custom && fitAddons.length > 0 && (
            <fieldset className="pt-2">
              <legend className="mb-2 text-sm font-semibold">Add-ons <span className="font-normal text-slate">(optional, can be changed later)</span></legend>
              <div className="space-y-2">
                {fitAddons.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-white p-3 text-sm">
                    <input type="checkbox" className="mt-1 accent-teal" checked={activeAddons.includes(a.id)} onChange={(e) => setAddonIds(e.target.checked ? [...activeAddons, a.id] : activeAddons.filter((x) => x !== a.id))} />
                    <span className="flex-1"><b>{a.name}</b><span className="block text-xs text-slate">{a.description}</span></span>
                    <span className="num whitespace-nowrap">{m(addonPrice(a, cur, cycle) ?? 0)}<span className="text-slate"> / {cycle === 'annual' ? 'yr' : 'mo'}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {plan && custom && <div className="rounded-lg bg-softmint p-4 text-sm">{isCustom(plan) ? `${plan.name} is priced to your organization.` : `${plan.name} is not priced in ${cur}.`} <Link to="/contact" className="font-semibold text-teal">Talk to Sales →</Link></div>}
        </>)}
        {step === 3 && q && plan && (<>
          <div className="rounded-lg border border-line bg-white p-4 text-sm" aria-label="Order summary">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate">Order summary</div>
            <div className="space-y-1.5">
              <div className="flex justify-between"><span>{plan.name} · {cycle}</span><span className="text-slate">{emp} employees</span></div>
              {q.lines.map((l) => <div key={l.label} className="flex justify-between"><span>{l.label}{l.detail && <span className="text-slate"> · {l.detail}</span>}</span><span className="num">{m(l.amount)}</span></div>)}
              <div className="flex justify-between border-t border-line pt-1.5"><span>Subtotal</span><span className="num">{m(q.subtotal)}</span></div>
              {q.discounts.map((d) => <div key={d.label} className="flex justify-between text-teal"><span>{d.label}</span><span className="num">−{m(d.amount)}</span></div>)}
              {q.taxRate > 0 && <div className="flex justify-between text-slate"><span>{q.taxLabel}{q.inclusive ? ' (included)' : ''}</span><span className="num">{m(q.tax)}</span></div>}
              <div className="flex justify-between border-t border-line pt-1.5 font-display text-lg font-semibold"><span>Total{trial ? ' after trial' : ''}</span><span className="num">{m(q.total)}</span></div>
              {trial && <div className="flex justify-between font-semibold"><span>Due today</span><span className="num">{m(0)}</span></div>}
            </div>
          </div>
          <div className="flex gap-2">
            <input aria-label="Coupon code" placeholder="Coupon code" value={couponIn} onChange={(e) => setCouponIn(e.target.value)} className={`${inputCls} uppercase`} />
            <Btn type="button" v="secondary" onClick={applyCoupon}>Apply</Btn>
          </div>
          {couponMsg && <p role="status" className={`text-xs ${couponMsg.ok ? 'text-teal' : 'text-err'}`}>{couponMsg.m}</p>}
          {trialAvail && (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Start option">
              {[[true, `Start ${plan.trialDays}-day free trial`, 'No charge today. Cancel before it ends at no cost.'], [false, 'Pay now', 'Start your paid subscription immediately.']].map(([v, t, d]) => (
                <label key={String(v)} className={`cursor-pointer rounded-lg border p-3 text-sm ${useTrial === v ? 'border-teal bg-softmint/50' : 'border-line'}`}>
                  <input type="radio" name="start" className="mr-2 accent-teal" checked={useTrial === v} onChange={() => setUseTrial(v as boolean)} /><b>{t as string}</b><span className="mt-1 block text-xs text-slate">{d as string}</span>
                </label>
              ))}
            </div>
          )}
          <Field label="Card number"><input required className={`${inputCls} num font-mono`} inputMode="numeric" value={card} onChange={(e) => setCard(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Expiry"><input required className={`${inputCls} num font-mono`} value={exp} onChange={(e) => setExp(e.target.value)} /></Field>
            <Field label="CVV"><input required className={`${inputCls} num font-mono`} defaultValue="123" /></Field>
          </div>
          <ul className="space-y-1 text-xs text-slate">
            <li>🔒 Secure payment. Processed by a PCI-compliant gateway; BizFlow never stores your card.</li>
            <li>{trial ? `Your subscription renews at ${m(q.total)} per ${cycle === 'annual' ? 'year' : 'month'} after the trial unless you cancel.` : `Renews at ${m(q.total)} per ${cycle === 'annual' ? 'year' : 'month'}.`} Cancel any time from Billing; you keep access until the period ends.</li>
            <li>Demo: a card ending 0002 is declined.</li>
          </ul>
        </>)}
        <div className="flex gap-2 pt-2">
          {step > 0 && <Btn type="button" v="secondary" onClick={() => setStep(step - 1)}>Back</Btn>}
          <Btn type="submit" disabled={gw === 'processing' || (step >= 2 && custom)} className="flex-1">{gw === 'processing' ? 'Processing…' : step === 3 ? (trial ? 'Start Free Trial' : 'Pay & Start BizFlow') : step === 2 ? 'Continue to payment' : 'Continue'}</Btn>
        </div>
      </form>
    </Shell>
  )
}

const SETUP = [
  ['Company', 'Legal name, RC number, logo', true],
  ['Branches', 'Lagos HQ, Abuja, Port Harcourt, Ibadan', true],
  ['Departments', '6 departments created', true],
  ['Roles', 'Assign roles and scopes', true],
  ['Approval rules', 'Amount-based levels', true],
  ['Payroll', 'Pay schedule and statutory setup', false],
  ['Accounting', 'Chart of accounts and opening balances', false],
  ['Employees', 'Import or invite via secure link', false],
  ['Documents', 'Choose templates and folders', false],
] as const

export function Welcome() {
  const [done, setDone] = useState<Record<string, boolean>>(Object.fromEntries(SETUP.map(([n, , d]) => [n, d])))
  const count = Object.values(done).filter(Boolean).length
  const pct = Math.round((count / SETUP.length) * 100)
  return (
    <div className="on-dark bf-deep grid-fine min-h-screen px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <Logo dark tagline size={48} />
        <h1 className="mt-14 text-5xl font-semibold leading-tight">Welcome to BizFlow.<br /><span className="text-mint">Let's set up your business.</span></h1>
        <div className="mt-10 rounded-lg border border-white/10 bg-white/5 p-6">
          <div className="flex items-end justify-between">
            <div className="font-display text-xl font-semibold">BizFlow Setup</div>
            <div className="num font-display text-3xl font-semibold text-mint">{pct}% complete</div>
          </div>
          <div className="mt-3 h-1.5 rounded bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded bg-mint transition-all duration-700" style={{ width: pct + '%' }} /></div>
          <div className="mt-6 divide-y divide-white/10">
            {SETUP.map(([n, d]) => (
              <div key={n} className="flex items-center gap-4 py-3.5">
                <span className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${done[n] ? 'bg-mint text-midnight' : 'border border-white/30'}`}>{done[n] ? '✓' : ''}</span>
                <div className="flex-1"><div className="font-semibold">{n}</div><div className="text-sm text-white/55">{d}</div></div>
                {!done[n] && (<>
                  <button onClick={() => setDone({ ...done, [n]: true })} className="cursor-pointer rounded bg-mint px-3 py-1.5 text-sm font-semibold text-midnight">Set up now</button>
                  <button className="hidden cursor-pointer px-2 text-sm text-white/60 hover:text-white sm:block">Do this later</button>
                </>)}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 flex gap-3"><Btn v="mint" s="lg" to="/admin/business">Go to Business Health</Btn></div>
      </div>
    </div>
  )
}

export function ResetPassword() {
  return <Forgot reset />
}
