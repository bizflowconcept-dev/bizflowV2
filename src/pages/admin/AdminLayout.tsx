import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { Activity, BookOpen, Building2, CreditCard, GitPullRequest, Headphones, Landmark, LayoutDashboard, ListChecks, LogOut, Menu, Settings2, ShieldAlert, UsersRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Avatar, Btn, Logo } from '../../components/ui'
import { setActor } from '../../tenant/store'
import { IssuedDialog } from './Operations'
import { ADMIN_NAV, ADMIN_ROLES, PERMS, isAdminRole, resolveAdminAccount } from './roles'
import type { AdminRole, Perm } from './roles'
import { clearAuthContext, hasAudience } from '../../security/access'

export { ADMIN_ROLES, PERMS }
export type { AdminRole, Perm }
const Ctx = createContext<{ role: AdminRole; can: (p: Perm) => boolean; actor: string }>({ role: 'super', can: () => true, actor: 'Platform admin' })
export const useAdmin = () => useContext(Ctx)

export function Gate({ perm, children }: { perm: Perm; children: ReactNode }) {
  return useAdmin().can(perm) ? <>{children}</> : <Navigate to="/admin" replace />
}

const GROUPS = ADMIN_NAV

const GROUP_ICONS: Record<string, LucideIcon> = {
  Overview: LayoutDashboard,
  Work: ListChecks,
  Configuration: GitPullRequest,
  Businesses: Building2,
  Subscriptions: CreditCard,
  Finance: Landmark,
  Support: Headphones,
  Users: UsersRound,
  System: Activity,
  Documentation: BookOpen,
  Settings: Settings2,
}

function isCurrent(pathname: string, search: string, to: string) {
  const [path, q = ''] = to.split('?')
  const here = pathname.replace(/\/$/, '') || '/'
  return q ? here === path && decodeURIComponent(search.slice(1)) === q : path === '/admin/businesses' ? here === path && !search : path === '/admin' || path === '/admin/billing' ? here === path : here === path || here.startsWith(path + '/')
}

function NavItem({ n, to, icon: Icon, nested = false }: { n: string; to: string; icon?: LucideIcon; nested?: boolean }) {
  const loc = useLocation()
  const on = isCurrent(loc.pathname, loc.search, to)
  return (
    <Link to={to} aria-current={on ? 'page' : undefined} className={`group relative flex items-center gap-2.5 rounded-lg py-2 text-[13.5px] font-medium transition-colors ${nested ? 'pl-10 pr-3' : 'px-3'} ${on ? 'bg-white/10 text-white before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-mint' : 'text-white/65 hover:bg-white/5 hover:text-white'}`}>
      {Icon && <Icon size={16} className={on ? 'text-mint' : 'text-white/45 group-hover:text-white/75'} />}
      {nested && <span className={`absolute left-4 size-1 rounded-full ${on ? 'bg-mint' : 'bg-white/25'}`} />}
      <span className="truncate">{n}</span>
    </Link>
  )
}

export default function AdminLayout() {
  const nav = useNavigate()
  const loc = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [role] = useState<AdminRole | null>(() => {
    const session = localStorage.getItem('bf-admin-session')
    return isAdminRole(session) ? session : null
  })
  const [, setAccessVersion] = useState(0)
  useEffect(() => {
    const refresh = () => setAccessVersion((version) => version + 1)
    window.addEventListener('bf-platform-access', refresh)
    return () => window.removeEventListener('bf-platform-access', refresh)
  }, [])
  useEffect(() => setMenuOpen(false), [loc.pathname, loc.search])
  if (!role || !hasAudience('bizflow-platform')) return <Navigate to="/admin/login" replace />
  const r = resolveAdminAccount(role)
  if (!r.active) {
    localStorage.removeItem('bf-admin-session')
    localStorage.removeItem('bf-admin-role')
    clearAuthContext()
    return <Navigate to="/admin/login" replace />
  }
  const can = (p: Perm) => (r.can as Perm[]).includes(p)
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(([, , permission]) => can(permission)),
  })).filter((group) => group.items.length > 0)
  const overviewLabel: Record<AdminRole, string> = {
    super: 'Platform overview',
    billing: 'Billing dashboard',
    finance: 'Finance dashboard',
    support: 'Support dashboard',
    readonly: 'Read-only overview',
  }
  const visibleItems = groups.flatMap((group) => group.items)
  const currentItem = visibleItems.find(([, to]) => isCurrent(loc.pathname, loc.search, to))
  const currentGroup = groups.find((group) => group.items.some(([, to]) => isCurrent(loc.pathname, loc.search, to)))
  const pageLabel = currentItem?.[1] === '/admin' ? overviewLabel[role] : currentItem?.[0] ?? 'Platform console'
  setActor(r.user, r.title, 'Platform')
  const signOut = () => {
    localStorage.removeItem('bf-admin-session')
    localStorage.removeItem('bf-admin-role')
    nav('/admin/login')
  }
  return (
    <Ctx.Provider value={{ role, can, actor: `${r.user} (${r.title})` }}>
      <div className="dashboard-shell min-h-screen bg-cloud lg:grid lg:grid-cols-[auto_1fr]">
        {menuOpen && <div aria-hidden className="fixed inset-0 z-40 bg-midnight/55 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)} />}
        <aside className={`dashboard-nav on-dark fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-midnight text-white shadow-2xl transition-transform duration-200 max-w-[85vw] lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0 lg:shadow-none ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div aria-hidden className="safe-top" />
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div><Logo dark /><div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-mint">Platform Console</div></div>
            <Btn v="ghost" s="sm" className="size-9 px-0 text-white hover:bg-white/10 lg:hidden" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><X size={18} /></Btn>
          </div>
          <nav aria-label="Platform admin" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {groups.map((g) => (
              <div key={g.g} className="space-y-0.5">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{g.g}</div>
                {g.items.map(([n, to], index) => <NavItem key={to} n={to === '/admin' ? overviewLabel[role] : n} to={to} icon={index === 0 ? GROUP_ICONS[g.g] : undefined} nested={index > 0} />)}
              </div>
            ))}
          </nav>
          <div className="border-t border-white/10 p-3">
            <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
              <Avatar name={r.user} size={32} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{r.user}</div><div className="truncate text-xs text-white/50">{r.title}</div></div>
              <Btn v="ghost" s="sm" className="size-8 px-0 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Sign out" onClick={signOut}><LogOut size={15} /></Btn>
            </div>
          </div>
          <div aria-hidden className="safe-bottom" />
        </aside>
        <div className="min-w-0">
          <header className="glass-bar bar-lg sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white px-4 text-[13px] lg:px-8">
            <Btn v="ghost" s="sm" className="-ml-2 size-10 px-0 lg:hidden" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} /></Btn>
            <div className="min-w-0">
              <div className="truncate text-xs text-slate">{currentGroup?.g ?? 'Admin'} <span className="mx-1 text-line">/</span></div>
              <div className="truncate text-sm font-semibold text-ink">{pageLabel}</div>
            </div>
            <span className="ml-auto hidden rounded-full bg-softmint px-2.5 py-1 text-xs font-semibold text-teal-600 sm:inline-flex">Scope: {r.scope}</span>
            <div className="hidden items-center gap-2 border-l border-line pl-3 md:flex"><Avatar name={r.user} size={28} /><span className="font-semibold">{r.user}</span></div>
            <Btn s="sm" v="ghost" className="hidden lg:inline-flex" onClick={signOut}><LogOut size={14} />Sign out</Btn>
          </header>
          <div role="note" className="flex items-center gap-2 bg-midnight px-4 py-2 text-[13px] font-semibold text-white lg:px-8"><ShieldAlert size={15} className="shrink-0 text-mint" /><span className="truncate">Managing the BizFlow platform, not a company workspace. Platform access never grants company authority.</span></div>
          <main className="mx-auto max-w-[1400px] px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:px-8 lg:py-8"><Outlet /></main>
          <IssuedDialog />
        </div>
      </div>
    </Ctx.Provider>
  )
}
