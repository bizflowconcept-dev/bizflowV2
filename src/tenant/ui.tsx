import { Link, NavLink } from 'react-router'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Tenant } from './store'
import { MODULE_LIST, host } from './store'
import { Btn, EmptyState } from '../components/ui'
import { useRole } from '../components/app/AppLayout'

const initials = (n: string) => n.replace(/&/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

export function TenantMark({ t, size = 32, tone = 'brand' }: { t: { brand: Tenant['brand']; profile: { name: string } }; size?: number; tone?: 'brand' | 'nav' }) {
  const ownLogo = tone === 'nav' ? t.brand.logoLight || t.brand.logo : t.brand.logo
  const src = ownLogo || t.brand.favicon
  if (src) {
    return <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md" style={{ width: size, height: size, background: tone === 'nav' && (!t.brand.logoLight || !ownLogo) ? 'rgba(255,255,255,.92)' : 'transparent' }}><img src={src} alt={`${t.profile.name} logo`} className="size-full object-contain p-0.5" /></span>
  }
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-md font-display font-bold" style={{ width: size, height: size, fontSize: size * 0.4, background: tone === 'nav' ? 'var(--brand-accent)' : 'var(--brand)', color: tone === 'nav' ? '#0B1A1F' : 'var(--brand-on)' }}>
      {initials(t.profile.name)}
    </span>
  )
}

export const PoweredBy = ({ className = '' }: { className?: string }) => (
  <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium text-slate ${className}`}>
    <img src="/brand/bizflow-mark.png" alt="" width={14} height={14} className="block" />
    Powered by BizFlow
  </span>
)

export const WorkspaceTag = ({ t }: { t: Pick<Tenant, 'slug'> }) => <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[12px] text-slate">{host(t.slug)}</code>

const SET_TABS: [string, string, string?][] = [['Company Settings', '/admin/business/settings'], ['Company Profile', '/admin/business/settings/profile'], ['Branding & Login', '/admin/business/settings/branding'], ['Document Templates', '/admin/business/settings/document-templates', 'documents.templates.manage'], ['Employee Rules', '/admin/business/settings/employee-rules', 'employee.rules.view'], ['Approval Flow', '/admin/business/settings/approvals'], ['Finance Tiers', '/admin/business/settings/finance'], ['Modules', '/admin/business/modules'], ['Activity', '/admin/business/settings/activity']]
export function SettingsNav() {
  const { can } = useRole()
  return (
    <nav aria-label="Settings" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1">
      {SET_TABS.filter(([, , perm]) => !perm || can(perm)).map(([n, to]) => (
        <NavLink key={to} to={to} end className={({ isActive }) => `whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'border-teal text-teal' : 'border-transparent text-slate hover:text-ink'}`}>{n}</NavLink>
      ))}
    </nav>
  )
}

export function ModuleLocked({ id, canManage }: { id: string; canManage: boolean }) {
  const m = MODULE_LIST.find((x) => x.id === id)
  return (
    <div className="rounded-lg border border-line bg-white">
      <EmptyState title={`${m?.name ?? 'This module'} is not part of your plan`} body={`${m?.desc ?? ''} Available on the ${m?.tier ?? 'higher'} plan and above. Upgrade to unlock it for your whole workspace.`} action={canManage ? <Btn to="/admin/business/modules">Upgrade to unlock</Btn> : <span className="text-sm text-slate">Ask your company administrator to upgrade.</span>} />
    </div>
  )
}

export const Lockmark = ({ label = 'Upgrade to unlock' }: { label?: string }) => <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate"><Lock size={12} />{label}</span>

export function Section({ title, desc, children, action }: { title: string; desc?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div><h2 className="font-display text-[17px] font-semibold">{title}</h2>{desc && <p className="mt-0.5 text-[13px] text-slate">{desc}</p>}</div>{action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}
export { Link }

export const loginSlidesOf = (b: Tenant['brand']): string[] => (b.loginSlides?.length ? b.loginSlides : b.loginBackground ? [b.loginBackground] : [])

/* Each image is shown whole (object-contain) on a blurred copy of itself, so any ratio fits with no crop, stretch or tint. */
export function LoginSlides({ slides, seconds = 6, className = '', compact = false }: { slides: string[]; seconds?: number; className?: string; compact?: boolean }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = slides.length
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  useEffect(() => { if (i >= n) setI(0) }, [n, i])
  useEffect(() => {
    if (n < 2 || paused || reduce) return
    const t = setInterval(() => setI((x) => (x + 1) % n), Math.max(3, seconds) * 1000)
    return () => clearInterval(t)
  }, [n, paused, seconds, reduce])
  if (!n) return null
  const go = (d: number) => setI((x) => (x + d + n) % n)
  return (
    <div role="region" aria-roledescription="carousel" aria-label="Company images" className={`group relative overflow-hidden bg-cloud ${className}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      {slides.map((src, k) => (
        <div key={k} aria-hidden={k !== i} className={`absolute inset-0 transition-opacity duration-700 ${k === i ? 'opacity-100' : 'opacity-0'}`}>
          <img src={src} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover blur-2xl" />
          <img src={src} alt={`Company image ${k + 1} of ${n}`} className="relative size-full object-contain" />
        </div>
      ))}
      {n > 1 && (
        <>
          {!compact && <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="absolute left-3 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/90 text-ink opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100"><ChevronLeft size={18} /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next image" className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-white/90 text-ink opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100"><ChevronRight size={18} /></button>
          </>}
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {slides.map((_, k) => <button key={k} type="button" onClick={() => setI(k)} aria-label={`Show image ${k + 1}`} aria-current={k === i} className={`h-1.5 cursor-pointer rounded-full bg-white shadow transition-all ${k === i ? 'w-6' : 'w-1.5 opacity-70'}`} />)}
          </div>
        </>
      )}
    </div>
  )
}
