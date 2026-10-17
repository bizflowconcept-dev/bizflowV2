import { Link } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { Btn, Logo } from '../components/ui'
import { resetDemo, setActive } from '../tenant/store'

const JOURNEY = [
  ['Get Started', '/get-started', 'Account, plan and payment. Workspace is provisioned and you land in it.'],
  ['Branding & Appearance', '/admin/business/settings/branding', 'Upload a logo, pick colours, switch theme, density and navigation. Watch the live preview.'],
  ['Dashboard, rebranded', '/admin/business', 'Header, sidebar, buttons and charts all follow the saved brand.'],
  ['Branded sign-in', '/w/etranzact/login', 'Welcome page with the company identity and Powered by BizFlow.'],
  ['Employee self-onboarding', '/w/etranzact/onboarding/k3x9fa', 'Invite link opened by a new hire, in the company brand. Submitting creates the employee and opens their dashboard.'],
  ['BizFlow admin: manage a business', '/admin/businesses', 'Select a company, change subscription state, start a logged support session, review the audit trail.'],
]
const ROUTES: [string, string, string, string?][] = [
  ['/admin', '/admin', 'Platform overview'],
  ['/admin/businesses', '/admin/businesses', 'All businesses'],
  ['/admin/business', '/admin/business', 'Business details (etranzact)'],
  ['/admin/business/settings', '/admin/business/settings', 'Company settings', 'etranzact'],
  ['/admin/business/settings/branding', '/admin/business/settings/branding', 'Branding', 'etranzact'],
  ['/admin/business/dashboard', '/admin/business/dashboard', 'Company dashboard', 'etranzact'],
  ['etranzact.bizflow.com', '/w/etranzact/login', 'Branded sign-in, default teal'],
  ['admin login', '/admin/login', 'Separate platform sign-in'],
  ['invalid tenant', '/w/nothere/login', 'Unknown workspace'],
  ['expired link', '/w/etranzact/onboarding/old001', 'Expired onboarding link'],
  ['revoked link', '/w/etranzact/onboarding/rev002', 'Revoked onboarding link'],
  ['session expired', '/session-expired', 'Signed out for inactivity'],
]

export default function Prototype() {
  return (
    <div className="min-h-screen bg-cloud">
      <header className="border-b border-line bg-white"><div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4"><Link to="/"><Logo /></Link><Btn s="sm" v="secondary" onClick={() => { localStorage.removeItem('bf-role'); localStorage.removeItem('bf-docs-v2:demo'); localStorage.removeItem('bf-sign-v2:demo'); resetDemo(); location.reload() }}>Reset demo data</Btn></div></header>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-semibold">BizFlow prototype guide</h1>
        <p className="mt-2 max-w-2xl text-slate">A clickable path from sign-up to a branded workspace, plus every demo route.</p>
        <h2 className="mt-10 text-lg font-semibold">Full journey</h2>
        <ol className="mt-3 divide-y divide-line rounded-lg border border-line bg-white">
          {JOURNEY.map(([n, to, d], i) => (
            <li key={to}><Link to={to} onClick={() => setActive('etranzact')} className="group flex items-center gap-4 px-5 py-4 hover:bg-softmint/40"><span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-softmint font-display font-semibold text-teal">{i + 1}</span><span className="min-w-0 flex-1"><span className="block font-semibold">{n}</span><span className="text-sm text-slate">{d}</span></span><ArrowUpRight size={16} className="text-slate group-hover:text-teal" /></Link></li>
          ))}
        </ol>
        <h2 className="mt-10 text-lg font-semibold">Demo routes</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {ROUTES.map(([n, to, d, slug]) => (
            <li key={n}><Link to={to} onClick={() => slug && setActive(slug)} className="block rounded-lg border border-line bg-white px-4 py-3 hover:border-teal"><code className="font-mono text-[13px] font-semibold text-teal">{n}</code><span className="block text-sm text-slate">{d}</span></Link></li>
          ))}
        </ul>
      </main>
    </div>
  )
}
