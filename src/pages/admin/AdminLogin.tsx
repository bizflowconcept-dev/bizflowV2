import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { Btn, Field, Logo, inputCls } from '../../components/ui'
import { ADMIN_ROLES, resolveAdminAccount, type AdminRole } from './roles'
import { issueAuthContext } from '../../security/access'

export default function AdminLogin() {
  const nav = useNavigate()
  const [email, setEmail] = useState(ADMIN_ROLES.super.email)
  const [password, setPassword] = useState(ADMIN_ROLES.super.password)
  const [error, setError] = useState('')
  const accounts = Object.entries(ADMIN_ROLES) as [AdminRole, (typeof ADMIN_ROLES)[AdminRole]][]
  const useAccount = (role: AdminRole) => {
    setEmail(ADMIN_ROLES[role].email)
    setPassword(ADMIN_ROLES[role].password)
    setError('')
  }
  const signIn = () => {
    const match = accounts.find(([, account]) =>
      account.email.toLowerCase() === email.trim().toLowerCase() && account.password === password)
    if (!match) {
      setError('Email or password does not match a demo platform account.')
      return
    }
    if (!resolveAdminAccount(match[0]).active) {
      setError('This platform account has been suspended.')
      return
    }
    localStorage.removeItem('bf-business-session')
    localStorage.removeItem('bf-role')
    localStorage.setItem('bf-admin-session', match[0])
    localStorage.setItem('bf-admin-role', match[0])
    issueAuthContext({ audience: 'bizflow-platform', subject: match[1].email })
    nav('/admin')
  }
  return (
    <div className="on-dark min-h-screen bg-midnight px-4 py-10">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-xl bg-white text-ink shadow-2xl lg:grid-cols-[1fr_1.1fr]">
        <form onSubmit={(e) => { e.preventDefault(); signIn() }} className="p-7 sm:p-10">
          <Logo tagline size={48} />
          <div className="mt-8 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal"><ShieldAlert size={14} />BizFlow Platform Console</div>
          <h1 className="mt-2 text-3xl font-semibold">Platform sign in</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate">Use the account for the role you want to test. Each role opens its own dashboard and permitted functions.</p>
          <div className="mt-7 space-y-4">
            <Field label="Staff email"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
            <Field label="Password"><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} /></Field>
          </div>
          {error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-err">{error}</p>}
          <Btn type="submit" s="lg" className="mt-6 w-full">Sign in to console</Btn>
          <p className="mt-4 text-xs text-slate">Demo access only. Production authentication must be verified by the server.</p>
        </form>
        <section className="border-t border-line bg-cloud p-7 sm:p-10 lg:border-l lg:border-t-0">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-teal">Demo login details</div>
          <h2 className="mt-2 text-2xl font-semibold">Choose an admin role</h2>
          <div className="mt-6 grid gap-3">
            {accounts.map(([key, account]) => (
              <button key={key} type="button" onClick={() => useAccount(key)} className={`cursor-pointer rounded-lg border p-4 text-left transition-colors ${email === account.email ? 'border-teal bg-softmint/60' : 'border-line bg-white hover:border-teal/40'}`}>
                <span className="flex items-center justify-between gap-3">
                  <span className="font-display text-lg font-semibold">{account.title}</span>
                  <span className="rounded bg-cloud px-2 py-0.5 text-xs font-semibold text-slate">{account.scope}</span>
                </span>
                <span className="mt-2 block text-sm font-medium">{account.user}</span>
                <span className="mt-1 block font-mono text-xs text-slate">{account.email}</span>
                <span className="mt-0.5 block font-mono text-xs text-slate">Password: {account.password}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
