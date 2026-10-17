import { useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Logo, Btn } from '../ui'
import { useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { CapabilitiesMenu, MobileCapabilities, MobileSolutions, SolutionsMenu } from './MegaNav'
import { ADMIN_ROLES, isAdminRole } from '../../pages/admin/roles'

type DesktopMenu = 'capabilities' | 'solutions' | null

export default function SiteLayout() {
  const [open, setOpen] = useState(false)
  const [mobileSection, setMobileSection] = useState<'capabilities' | 'solutions' | null>(null)
  const [desktopMenu, setDesktopMenu] = useState<DesktopMenu>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  const loc = useLocation()
  const adminSession = localStorage.getItem('bf-admin-session')
  const admin = isAdminRole(adminSession) ? ADMIN_ROLES[adminSession] : null
  useEffect(() => {
    setOpen(false)
    setMobileSection(null)
    setDesktopMenu(null)
    if (!loc.hash) window.scrollTo(0, 0)
    else setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 60)
  }, [loc.pathname, loc.hash])
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setDesktopMenu(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDesktopMenu(null)
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  const dark = loc.pathname === '/'
  const showMenu = (menu: DesktopMenu) => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setDesktopMenu(menu)
  }
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setDesktopMenu(null), 180)
  }
  const closeAll = () => {
    setDesktopMenu(null)
    setOpen(false)
  }
  return (
    <div className="min-h-screen bg-cloud">
      <header ref={headerRef} className={`site-bar sticky top-0 z-40 border-b backdrop-blur ${dark && !desktopMenu ? 'on-dark border-white/10 bg-midnight/95' : 'border-line bg-cloud/95'}`}>
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-6">
          <Link to="/" aria-label="BizFlow home"><Logo dark={dark && !desktopMenu} /></Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            <NavLink to="/product" className={({ isActive }) => `rounded px-3 py-2 text-[14px] font-medium transition-colors ${dark && !desktopMenu ? 'text-white/70 hover:bg-white/10 hover:text-white' : isActive ? 'text-teal' : 'text-slate hover:bg-ink/5 hover:text-ink'}`}>Product</NavLink>
            {(['capabilities', 'solutions'] as const).map((menu) => (
              <button
                key={menu}
                aria-haspopup="true"
                aria-expanded={desktopMenu === menu}
                onClick={() => showMenu(desktopMenu === menu ? null : menu)}
                onMouseEnter={() => showMenu(menu)}
                onMouseLeave={scheduleClose}
                onFocus={() => showMenu(menu)}
                className={`flex cursor-pointer items-center gap-1 rounded px-3 py-2 text-[14px] font-medium capitalize transition-colors ${
                  dark && !desktopMenu
                    ? 'text-white/70 hover:bg-white/10 hover:text-white'
                    : desktopMenu === menu || loc.pathname === `/${menu}`
                      ? 'bg-softmint text-teal'
                      : 'text-slate hover:bg-ink/5 hover:text-ink'
                }`}
              >
                {menu}<ChevronDown size={14} className={`transition-transform duration-150 ${desktopMenu === menu ? 'rotate-180' : ''}`} />
              </button>
            ))}
            <NavLink to="/contact#faq" className={`rounded px-3 py-2 text-[14px] font-medium transition-colors ${dark && !desktopMenu ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-slate hover:bg-ink/5 hover:text-ink'}`}>Resources</NavLink>
            <NavLink to="/pricing" className={({ isActive }) => `rounded px-3 py-2 text-[14px] font-medium transition-colors ${dark && !desktopMenu ? 'text-white/70 hover:bg-white/10 hover:text-white' : isActive ? 'text-teal' : 'text-slate hover:bg-ink/5 hover:text-ink'}`}>Pricing</NavLink>
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {admin ? (
              <>
                <span className={`mr-1 text-sm ${dark && !desktopMenu ? 'text-white/70' : 'text-slate'}`}>Welcome, <b className={dark && !desktopMenu ? 'text-white' : 'text-ink'}>{admin.user.split(' ')[0]}</b></span>
                <Btn v={dark && !desktopMenu ? 'mint' : 'primary'} to="/admin">Back to admin dashboard</Btn>
              </>
            ) : (
              <>
                <Btn v="ghost" to="/sign-in" className={dark && !desktopMenu ? 'text-white hover:bg-white/10' : ''}>Sign In</Btn>
                <Btn v={dark && !desktopMenu ? 'mint' : 'primary'} to="/get-started">Get Started</Btn>
              </>
            )}
          </div>
          <button className={`flex size-11 cursor-pointer items-center justify-center lg:hidden ${dark && !open ? 'text-white' : 'text-ink'}`} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X size={23} /> : <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h16M4 16h16" /></svg>}
          </button>
        </div>
        {desktopMenu && (
          <div
            className="absolute inset-x-0 top-16 hidden border-b border-line bg-white shadow-[0_18px_40px_rgba(11,37,48,0.10)] lg:block"
            onMouseEnter={() => showMenu(desktopMenu)}
            onMouseLeave={scheduleClose}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) scheduleClose()
            }}
          >
            {desktopMenu === 'capabilities' ? <CapabilitiesMenu onNavigate={closeAll} /> : <SolutionsMenu onNavigate={closeAll} />}
          </div>
        )}
        {open && (
          <div className="max-h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-y-auto border-t border-line bg-white px-6 pb-8 lg:hidden">
            {mobileSection === 'capabilities' ? (
              <div className="py-5"><MobileCapabilities onNavigate={closeAll} /></div>
            ) : (
              <>
                <Link to="/product" className="flex min-h-14 items-center border-b border-line font-semibold text-ink">Product</Link>
                <button onClick={() => setMobileSection('capabilities')} className="flex min-h-14 w-full cursor-pointer items-center justify-between border-b border-line text-left font-semibold text-ink">
                  Capabilities <ChevronDown size={17} />
                </button>
                <button onClick={() => setMobileSection(mobileSection === 'solutions' ? null : 'solutions')} className="flex min-h-14 w-full cursor-pointer items-center justify-between border-b border-line text-left font-semibold text-ink">
                  Solutions <ChevronDown size={17} className={`transition-transform ${mobileSection === 'solutions' ? 'rotate-180' : ''}`} />
                </button>
                {mobileSection === 'solutions' && <MobileSolutions onNavigate={closeAll} />}
                <Link to="/contact#faq" className="flex min-h-14 items-center border-b border-line font-semibold text-ink">Resources</Link>
                <Link to="/pricing" className="flex min-h-14 items-center border-b border-line font-semibold text-ink">Pricing</Link>
                {admin ? (
                  <div className="mt-6 rounded-lg bg-softmint p-4">
                    <div className="text-sm text-slate">Welcome back</div>
                    <div className="mb-3 font-semibold text-ink">{admin.user} · {admin.title}</div>
                    <Btn className="w-full" to="/admin">Back to admin dashboard</Btn>
                  </div>
                ) : (
                  <div className="mt-6 grid grid-cols-2 gap-2">
                    <Btn v="secondary" to="/sign-in">Sign In</Btn>
                    <Btn to="/get-started">Get Started</Btn>
                  </div>
                )}
              </>
            )}
            {mobileSection === 'capabilities' && (
              <button onClick={() => setMobileSection(null)} className="mt-5 min-h-11 w-full cursor-pointer border-t border-line pt-5 text-left text-sm font-semibold text-slate">
                Back to main menu
              </button>
            )}
            <div className="sr-only" aria-live="polite">
              {mobileSection ? `${mobileSection} menu open` : 'Main menu open'}
            </div>
          </div>
        )}
      </header>
      <Outlet />
      <Footer />
    </div>
  )
}

function Footer() {
  const cols: [string, [string, string][]][] = [
    ['Capabilities', [['People', '/capabilities#people'], ['Money', '/capabilities#money'], ['Operations', '/capabilities#operations'], ['Customers', '/capabilities#customers'], ['Workflow & Documents', '/capabilities#workflow-documents'], ['Insights & Control', '/capabilities#insights-control']]],
    ['Solutions', [['Growing SMEs', '/solutions'], ['Multi-branch', '/solutions'], ['Field operations', '/solutions'], ['Professional services', '/solutions']]],
    ['Industries', [['Construction', '/solutions?t=industries'], ['Trading', '/solutions?t=industries'], ['Real estate', '/solutions?t=industries']]],
    ['Resources', [['FAQ', '/contact#faq'], ['Explore BizFlow', '/admin/business'], ['Contact', '/contact']]],
    ['Company', [['About', '/about'], ['Pricing', '/pricing'], ['Security', '/security'], ['Sign In', '/sign-in'], ['Get Started', '/get-started']]],
  ]
  return (
    <footer className="on-dark bg-midnight text-white">
      <div className="mx-auto max-w-[1240px] px-6 pb-10 pt-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_3fr]">
          <div>
            <Logo dark size={26} />
            <p className="mt-4 max-w-xs font-display text-2xl leading-snug text-white/90">Your business. One connected flow.</p>
            <p className="mt-3 max-w-xs text-sm text-white/50">The simple, connected operating platform for growing businesses.</p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-5">
            {cols.map(([h, l]) => (
              <div key={h}>
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-mint">{h}</div>
                <ul className="space-y-2">
                  {l.map(([n, to]) => (
                    <li key={n}><Link to={to} className="text-sm text-white/65 hover:text-white">{n}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-white/45">
          <span>© 2026 BizFlow Technologies. Built in Nigeria for growing businesses.</span>
          <span className="flex gap-5"><Link to="/contact">Contact</Link><Link to="/security">Privacy</Link><Link to="/security">Terms</Link><Link to="/security">Security</Link></span>
        </div>
      </div>
    </footer>
  )
}
