import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, Building2, Check, CheckCircle2, ShieldCheck } from 'lucide-react'
import { Avatar, Badge, Btn, Field, inputCls, Logo } from '../../components/ui'
import { createInvite, demoAccountsFor, host, onboardingForAccount, setActive, setBusinessSession, recordLogin, useApplyBrand, useTenants } from '../../tenant/store'
import type { DemoAccount, Tenant } from '../../tenant/store'
import { LoginSlides, loginSlidesOf, PoweredBy, TenantMark } from '../../tenant/ui'
import { mustChange, passwordFor } from '../../tenant/passwords'
import { StateScreen } from '../../tenant/states'
import { issueAuthContext } from '../../security/access'
import { verifyPassword } from '../../security/credentials'

function CompanySelector({ companies, onSelect }: { companies: Tenant[]; onSelect: (slug: string) => void }) {
  return (
    <div className="min-h-screen bg-cloud">
      <header className="border-b border-line bg-white px-5 py-4 sm:px-8"><Logo /></header>
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="teal">Business workspace demo</Badge>
          <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Choose a company workspace</h1>
          <p className="mt-3 text-sm leading-6 text-slate">Select a company to see its branded sign-in experience and the demo accounts available for that business.</p>
        </div>
        <div className="mt-9 grid grid-cols-1 gap-3 md:grid-cols-2">
          {companies.map((company) => (
            <Btn key={company.slug} type="button" v="secondary" onClick={() => onSelect(company.slug)} className="h-auto justify-start whitespace-normal rounded-xl p-4 text-left">
              <TenantMark t={company} size={44} />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-base font-semibold">{company.profile.name}</span>
                <span className="mt-0.5 block break-words text-xs font-normal text-slate">{company.profile.industry} · {company.plan}</span>
                <span className="mt-2 block break-all font-mono text-xs font-normal text-slate">{host(company.slug)}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-teal">{demoAccountsFor(company).length} accounts</span>
            </Btn>
          ))}
        </div>
        <div className="mt-8 flex justify-center"><PoweredBy /></div>
      </main>
    </div>
  )
}

function TenantSignIn({ tenant, canChangeCompany }: { tenant: Tenant; canChangeCompany: boolean }) {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const selfServe = !!tenant.admin
  const welcome = selfServe && params.get('welcome') === '1'
  const prefill = selfServe ? params.get('email') ?? '' : ''
  const [email, setEmail] = useState(prefill)
  const [password, setPassword] = useState(selfServe ? '' : 'demo-password')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const accounts = demoAccountsFor(tenant)
  const selected = accounts.find((account) => account.email === email)
  const slides = loginSlidesOf(tenant.brand)

  useEffect(() => {
    setEmail(prefill)
    setPassword(selfServe ? '' : 'demo-password')
    setError('')
  }, [tenant.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (account: DemoAccount) => {
    setEmail(account.email)
    setPassword(account.password)
    setError('')
  }
  const signIn = async () => {
    const typed = email.trim().toLowerCase()
    const admin = tenant.admin
    // Self-serve administrator: verify the salted PBKDF2 hash. No plaintext is stored or compared.
    const hashedAccount = admin ? accounts.find((item) => item.hashed && item.email.toLowerCase() === typed) : undefined
    if (admin && hashedAccount) {
      setBusy(true)
      const ok = await verifyPassword(password, admin.credential).catch(() => false)
      setBusy(false)
      if (!ok) {
        recordLogin(tenant.slug, { name: hashedAccount.name, role: hashedAccount.title }, false, 'Wrong password')
        setError('Email or password is incorrect.')
        return
      }
      localStorage.setItem('bf-role', hashedAccount.roleKey)
      setBusinessSession(tenant.slug, hashedAccount.email)
      issueAuthContext({ audience: 'bizflow-company', subject: hashedAccount.email, tenant: tenant.slug })
      recordLogin(tenant.slug, { name: hashedAccount.name, role: hashedAccount.title, id: hashedAccount.id }, true)
      setActive(tenant.slug)
      nav('/admin/business/dashboard')
      return
    }
    if (selfServe) {
      recordLogin(tenant.slug, { name: email.trim() || 'Unknown user', role: 'Unknown' }, false, 'Unknown email')
      setError('Email or password is incorrect.')
      return
    }
    const account = accounts.find((item) => item.email.toLowerCase() === email.trim().toLowerCase() && passwordFor(tenant.slug, item.email, item.password) === password)
    if (!account) {
      const guess = accounts.find((item) => item.email.toLowerCase() === email.trim().toLowerCase())
      recordLogin(tenant.slug, { name: guess?.name ?? (email.trim() || 'Unknown user'), role: guess?.title ?? 'Unknown' }, false, guess ? 'Wrong password' : 'Unknown email')
      setError('Email or password does not match a demo account for this business.')
      return
    }
    localStorage.setItem('bf-role', account.roleKey)
    setBusinessSession(tenant.slug, account.email)
    issueAuthContext({ audience: 'bizflow-company', subject: account.email, tenant: tenant.slug })
    recordLogin(tenant.slug, { name: account.name, role: account.title, id: account.id }, true)
    setActive(tenant.slug)
    if (mustChange(tenant.slug, account.email)) { nav(`/w/${tenant.slug}/new-password`); return }
    if (account.onboarding) {
      const pending = onboardingForAccount(tenant.slug, account.email)
      if (pending) {
        nav(`/w/${tenant.slug}/onboarding-status`)
        return
      }
      const code = createInvite(tenant.slug)
      nav(`/w/${tenant.slug}/onboarding/${code}`)
      return
    }
    nav(account.roleKey === 'employee' ? '/admin/business/my' : '/admin/business/dashboard')
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {slides.length > 0 ? (
        <LoginSlides slides={slides} seconds={tenant.brand.loginSlideSeconds} className="hidden lg:block" />
      ) : (
        <div className="on-dark relative hidden flex-col justify-between overflow-hidden bg-midnight-2 p-12 text-white lg:flex">
          <div className="absolute -right-24 top-1/3 size-80 rounded-full border border-white/10" />
          <div className="absolute -right-10 top-1/3 size-52 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3"><TenantMark t={tenant} size={48} tone="nav" /><span className="font-display text-xl font-semibold">{tenant.profile.name}</span></div>
          <div className="relative max-w-lg">
            <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-white/10 text-mint"><Building2 size={22} /></div>
            <p className="font-display text-4xl font-semibold leading-tight">One connected workspace,<br /><span className="text-mint">built around your business.</span></p>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/65">{tenant.profile.description || `Sign in to manage people, finance and operations across ${tenant.profile.name}.`}</p>
            <div className="mt-7 flex items-center gap-2 text-xs text-white/55"><ShieldCheck size={15} className="text-mint" />Secure, role-based access · Nigeria-first operations</div>
          </div>
          <code className="relative font-mono text-sm text-white/50">{host(tenant.slug)}</code>
        </div>
      )}
      <div className="flex min-w-0 flex-col overflow-y-auto px-4 py-8 sm:px-10 lg:px-12">
        <div className="mx-auto w-full min-w-0 max-w-2xl">
          <div className="mb-8 flex items-center justify-between">
            <div className={`flex items-center gap-3 ${slides.length ? '' : 'lg:hidden'}`}><TenantMark t={tenant} size={46} />{slides.length > 0 && <span className="font-display text-lg font-semibold">{tenant.profile.name}</span>}</div>
            {canChangeCompany && <Btn v="ghost" s="sm" to="/admin/business/login" className="ml-auto"><ArrowLeft size={15} />Change company</Btn>}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); signIn() }} className="mx-auto w-full max-w-md">
            <Badge tone="teal">{tenant.plan} workspace</Badge>
            <h1 className="mt-3 break-words text-2xl font-semibold sm:text-3xl">Welcome to {tenant.profile.name}</h1>
            {welcome && <div role="status" className="mt-4 flex items-start gap-2 rounded-md border border-ok/30 bg-ok/10 px-3 py-2.5 text-sm font-medium text-ok"><CheckCircle2 size={18} className="mt-0.5 shrink-0" />Your workspace is ready, sign in with the account you just created.</div>}
            {tenant.signup && !tenant.admin && <div role="status" className="mt-4 rounded-md border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm font-medium text-ink">Administrator invitation pending. BizFlow is finishing setup for this workspace and will email the company administrator a sign-in invitation.</div>}
            <p className="mt-2 text-sm text-slate">{selfServe ? 'Sign in with your administrator account.' : 'Choose one of this company’s demo accounts, then sign in.'}</p>
            <div className="mt-7 space-y-4">
              <Field label="Work email"><input type="email" required value={email} onChange={(event) => { setEmail(event.target.value); setError('') }} placeholder={`you@${tenant.profile.website.replace(/^https?:\/\//, '') || 'company.com'}`} className={inputCls} autoComplete="username" /></Field>
              <Field label="Password"><input type="password" required value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} className={inputCls} autoComplete="current-password" /></Field>
            </div>
            {error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-err">{error}</p>}
            <div className="mt-3 text-right text-sm"><Link to={`/w/${tenant.slug}/forgot-password`} className="font-semibold text-teal">Forgot password?</Link></div>
            <Btn type="submit" s="lg" className="mt-5 w-full" disabled={busy}>{busy ? 'Signing in...' : selected && !selfServe ? `Continue as ${selected.name}` : 'Sign in'}</Btn>
          </form>
          {!selfServe && <>
          <div className="my-7 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate"><span className="h-px flex-1 bg-line" />{accounts.length} demo accounts<span className="h-px flex-1 bg-line" /></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {accounts.map((account) => (
              <Btn key={account.email} type="button" v="secondary" onClick={() => choose(account)} className={`h-auto justify-start whitespace-normal rounded-xl p-3 text-left ${email === account.email ? 'border-teal bg-softmint/60' : ''}`}>
                <Avatar name={account.name} size={34} />
                <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold leading-snug">{account.title}</span><span className="block break-words text-xs font-normal text-slate">{account.name}</span><span className="block break-all font-mono text-[10px] font-normal text-slate">{account.email}</span></span>
                {email === account.email ? <Check size={16} className="shrink-0 text-teal" /> : <Badge tone={account.onboarding ? 'blue' : account.scope === 'Own' ? 'gray' : 'teal'}>{account.onboarding ? 'New staff' : account.scope}</Badge>}
              </Btn>
            ))}
          </div></>}
          <div className="mt-7 flex flex-col items-center gap-1"><PoweredBy /><span className="break-all text-center text-[11px] text-slate">{host(tenant.slug)}{selfServe ? '' : ' · Demo password: demo-password (unless reset)'}</span></div>
        </div>
      </div>
    </div>
  )
}

function LoginFlow({ companySelector = false }: { companySelector?: boolean }) {
  const { slug = '' } = useParams()
  const tenants = useTenants()
  const [search, setSearch] = useSearchParams()
  const selectedSlug = slug || search.get('company') || ''
  const tenant = tenants[selectedSlug]
  useApplyBrand(tenant)

  if (!selectedSlug && companySelector) {
    const companies = Object.values(tenants).sort((a, b) => {
      const priority = ['etranzact']
      const ai = priority.indexOf(a.slug), bi = priority.indexOf(b.slug)
      return (ai < 0 ? priority.length : ai) - (bi < 0 ? priority.length : bi) || a.profile.name.localeCompare(b.profile.name)
    })
    return <CompanySelector companies={companies} onSelect={(company) => setSearch({ company })} />
  }
  if (!tenant) return <StateScreen icon="link" title={`No workspace at ${selectedSlug}.bizflow.com`} body="Check the address, or choose another demo company." actions={<Btn to={companySelector ? '/admin/business/login' : '/'}>{companySelector ? 'Choose a company' : 'Go to BizFlow'}</Btn>} />
  if (tenant.status === 'Suspended' || tenant.status === 'Expired') return <StateScreen tenant={tenant} icon={tenant.status === 'Expired' ? 'clock' : 'ban'} title={tenant.status === 'Expired' ? 'Subscription expired' : 'Workspace Suspended'} body="Access is paused. Your data is safe. Your company administrator can restore access." actions={<><Btn to="/contact">Contact BizFlow Support</Btn>{companySelector && <Btn v="secondary" to="/admin/business/login">Choose another company</Btn>}</>} />
  return <TenantSignIn tenant={tenant} canChangeCompany={companySelector} />
}

export function BusinessLogin() {
  return <LoginFlow companySelector />
}

export default function TenantLogin() {
  return <LoginFlow />
}
