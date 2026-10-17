import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { Btn, Field, inputCls } from '../../components/ui'
import { businessSession, demoAccountsFor, host, useApplyBrand, useTenants } from '../../tenant/store'
import { requestReset, setOwnPassword, useResets } from '../../tenant/passwords'
import { PoweredBy, TenantMark } from '../../tenant/ui'

function Frame({ slug, title, sub, children }: { slug: string; title: string; sub: string; children: ReactNode }) {
  const t = useTenants()[slug]
  useApplyBrand(t)
  if (!t) return <Navigate to="/admin/business/login" replace />
  return (
    <div className="grid min-h-screen place-items-center bg-cloud px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3"><TenantMark t={t} size={44} /><div className="min-w-0"><div className="truncate font-display text-lg font-semibold">{t.profile.name}</div><code className="font-mono text-xs text-slate">{host(t.slug)}</code></div></div>
        <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
          <div className="mb-4 grid size-10 place-items-center rounded-lg bg-softmint text-teal"><KeyRound size={18} /></div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1.5 text-sm text-slate">{sub}</p>
          <div className="mt-5">{children}</div>
        </div>
        <div className="mt-6 flex justify-center"><PoweredBy /></div>
      </div>
    </div>
  )
}

export function CompanyForgot() {
  const { slug = '' } = useParams()
  const t = useTenants()[slug]
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const mine = useResets(slug)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const a = t && demoAccountsFor(t).find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
    if (a) requestReset(slug, a.email, a.name)
    setSent(true)
  }
  const status = mine.find((r) => r.email.toLowerCase() === email.trim().toLowerCase())?.status
  return (
    <Frame slug={slug} title="Forgot your password?" sub="Passwords for company workspaces are reset by the BizFlow support team, so no email link is sent.">
      {sent ? (
        <div role="status" className="space-y-3 rounded-lg bg-softmint p-4 text-sm">
          <p><b>Request received.</b> If this email belongs to a user in {t?.profile.name}, BizFlow support has been asked to reset it.</p>
          <p>You will get a temporary password from your company administrator or BizFlow support. You will set a new one when you sign in.</p>
          {status === 'Reset' && <p className="font-semibold text-teal">Your password has already been reset. Ask your administrator for the temporary password.</p>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Work email"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" /></Field>
          <Btn type="submit" className="w-full">Ask BizFlow to reset it</Btn>
        </form>
      )}
      <Link to={`/w/${slug}/login`} className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-teal"><ArrowLeft size={15} />Back to sign in</Link>
    </Frame>
  )
}

export function NewPassword() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const s = businessSession()
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState('')
  if (!s || s.slug !== slug) return <Navigate to={`/w/${slug}/login`} replace />
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (a.length < 12) { setErr('Use at least 12 characters.'); return }
    if (a !== b) { setErr('The two passwords do not match.'); return }
    setOwnPassword(slug, s.email, a)
    nav('/admin/business/dashboard')
  }
  return (
    <Frame slug={slug} title="Choose a new password" sub="Your password was reset by BizFlow support. Set your own before you continue.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" hint="At least 12 characters."><input type="password" value={a} onChange={(e) => { setA(e.target.value); setErr('') }} className={inputCls} autoComplete="new-password" /></Field>
        <Field label="Confirm password"><input type="password" value={b} onChange={(e) => { setB(e.target.value); setErr('') }} className={inputCls} autoComplete="new-password" /></Field>
        {err && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-err">{err}</p>}
        <Btn type="submit" className="w-full">Save and continue</Btn>
      </form>
    </Frame>
  )
}
