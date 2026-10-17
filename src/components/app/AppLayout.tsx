import { OffboardingBar } from '../../platform/OffboardingBar'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { openInstall, usePwa } from '../../pwa/pwa'
import { disableAlerts, enableAlerts, sendDigest, useAlerts } from '../../pwa/alerts'
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigation } from 'react-router'
import { CalendarDays, Clock, Lock, LayoutDashboard, LayoutGrid, LogOut, ChevronsUpDown, Palette, UsersRound, Activity, Briefcase, Building2, Calculator, CircleHelp, FileText, FolderOpen, Gauge, Home, Landmark, ListChecks, PanelLeftClose, PanelLeftOpen, PenLine, Plane, Search, Settings, ShoppingCart, Store, Truck, UserRound, Users, Wallet, Bell, BarChart3, ShieldCheck, Package, CreditCard, Ellipsis, Fingerprint, TrendingUp, DoorOpen } from 'lucide-react'
import { Avatar, Badge, Btn, EmptyState, Logo, PageSkeleton } from '../ui'
import { complianceNotes, useCompliance } from '../../compliance/store'
import { branchesForTenant, employeesForTenant, assetsForTenant, vehiclesForTenant, isOwnDataset, approvalsForTenant } from '../../data/demo'
import { ROUTE_MODULE, STATUS_META, billingNotes, daysUntil, fmtDate, useEntitlements } from '../../data/billing'
import { UpgradeGate } from '../billing/shared'
import { CONVERSION_LABEL, awaitingFor, remaining, syncGrants, useGrants } from '../../data/grants'
import { useInbox, markRead } from '../../notifications/store'
import { MODULE_LIST, recordAudit, businessSession, clearBusinessSession, demoAccountsFor, useTenant, useTenants, useApplyBrand, host, setActor as setAuditActor, setBusinessSession, useSupport, useDepartmentAccess } from '../../tenant/store'
import { AnnouncementBar, SupportBanner } from '../../platform/Bars'
import { WorkspaceBlocked } from '../../tenant/states'
import { TenantMark, PoweredBy, ModuleLocked } from '../../tenant/ui'
import { COMPANY_ROLES } from '../../security/access'
import type { CompanyPermission } from '../../security/access'
import { NAV_DATA, NAV_TENANT_MODULE } from './navData'

/* ---------- Role + Permission + Scope ---------- */
export type RoleKey = keyof typeof COMPANY_ROLES
export const ROLES = COMPANY_ROLES
const RoleCtx = createContext<{ role: RoleKey; setRole: (r: RoleKey) => void; can: (p: string) => boolean; r: (typeof ROLES)[RoleKey] }>({ role: 'admin', setRole: () => {}, can: () => false, r: ROLES.admin })
export const useRole = () => useContext(RoleCtx)
const ScopeCtx = createContext<{ scope: string; setScope: (s: string) => void }>({ scope: 'Company', setScope: () => {} })
export const useScope = () => useContext(ScopeCtx)

type NavItem = { n: string; to: string; m: string; icon: ReactNode }
const I = (C: typeof Home) => <C size={16} strokeWidth={1.75} />
const NAV_ICONS: Record<string, typeof Home> = { 'inbox': Bell, 'dashboard': LayoutDashboard, 'modules': LayoutGrid, 'my': UserRound, 'performance': TrendingUp, 'people': Users, 'organization': Building2, 'leave': CalendarDays, 'exit': DoorOpen, 'payroll': Wallet, 'accounting': Calculator, 'approvals': ShieldCheck, 'tasks': ListChecks, 'travel': Plane, 'procurement': ShoppingCart, 'vendors': Store, 'assets': Package, 'fleet': Truck, 'crm': Briefcase, 'documents': FolderOpen, 'sign': PenLine, 'health': Gauge, 'reports': BarChart3, 'audit-trail': Fingerprint, 'settings': Settings, 'billing': CreditCard }
const NAV: { g: string; items: NavItem[] }[] = NAV_DATA.map((g) => ({ g: g.g, items: g.items.map((i) => ({ ...i, icon: I(NAV_ICONS[i.m]) })) }))
const TMOD = NAV_TENANT_MODULE
const moduleOf = (p: string) => p === '/admin/business/dashboard' ? 'dashboard' : p.split('/')[3]

const CREATE: [string, string, string][] = [
  ['Employee', '/admin/business/people', 'people.create'], ['Customer', '/admin/business/crm', 'crm.create'], ['Vendor', '/admin/business/vendors', 'procurement.create'], ['Expense', '/admin/business/accounting', '*'], ['Request', '/admin/business/approvals', ''], ['Task', '/admin/business/tasks', ''],
  ['Purchase Request', '/admin/business/procurement', 'procurement.create'], ['Travel Request', '/admin/business/travel', ''], ['Asset', '/admin/business/assets', 'assets.create'], ['Vehicle', '/admin/business/fleet', 'fleet.create'], ['Document', '/admin/business/documents', ''], ['Signature Request', '/admin/business/sign', 'sign.create'], ['Invoice', '/admin/business/accounting', 'accounting.post'],
]

const NOTES = [
  { t: 'Payroll approval required', d: '₦18,420,000 payroll for October 2026.', cta: 'Review Payroll', to: '/admin/business/payroll', pri: true, ago: '12m', m: 'payroll' },
]

type Menu = '' | 'ws' | 'scope' | 'create' | 'notes' | 'nav' | 'user' | 'help'

export default function AppLayout() {
  const [role, setRoleState] = useState<RoleKey>(() => { const k = localStorage.getItem('bf-role') as RoleKey; return k && ROLES[k] ? k : 'admin' })
  const [scope, setScope] = useState(() => { const k = localStorage.getItem('bf-role') as RoleKey; return k && ROLES[k]?.scope === 'Own' ? 'Own' : 'Company' })
  const [menu, setMenu] = useState<Menu>('')
  const [cmd, setCmd] = useState(false)
  const [userCollapsed, setCollapsed] = useState(() => localStorage.getItem('bf-collapsed') === '1')
  const tenant = useTenant()
  useApplyBrand(tenant)
  const pwa = usePwa()
  const compactNav = tenant?.brand.nav === 'compact'
  const collapsed = compactNav || userCollapsed
  const loc = useLocation()
  const navigation = useNavigation()
  const nav = useNavigate()
  const session = businessSession()
  const tenantAccounts = tenant ? demoAccountsFor(tenant) : []
  const signedInAccount = tenant && session?.slug === tenant.slug ? tenantAccounts.find((account) => account.email === session.email) : undefined
  const departmentAccess = useDepartmentAccess(tenant?.slug, signedInAccount?.email)
  const baseRole = ROLES[role]
  const accountRole = signedInAccount && signedInAccount.roleKey === role ? { ...baseRole, title: signedInAccount.title, user: signedInAccount.name, id: signedInAccount.id, scope: signedInAccount.scope } : baseRole
  const r = departmentAccess ? { ...accountRole, modules: departmentAccess.modules } : accountRole
  const E = useEntitlements()
  const canBilling = r.can.includes('company.subscription.manage')
  const support = useSupport()
  setAuditActor(r.user, r.title, 'Business', employeesForTenant(tenant?.slug).find((e) => e.name === r.user)?.dept ?? '', r.id)
  const can = (p: string) => !p || (departmentAccess ? departmentAccess.features.includes(p) && r.can.includes(p as CompanyPermission) : r.can.includes(p as CompanyPermission))
  const allowed = (m: string) => m === 'audit-trail' ? can('company.audit.view') : m === 'organization' || m === 'leave' || m === 'inbox' || (m === 'dashboard' && r.scope !== 'Own') || m === 'performance' || r.modules.includes(m)
  const setRole = (k: RoleKey) => {
    const account = tenantAccounts.find((item) => item.roleKey === k)
    if (tenant && account) setBusinessSession(tenant.slug, account.email)
    if (tenant && k !== role) { recordAudit(tenant.slug, 'Demo role switched', accountRole.title, account?.title ?? ROLES[k].title, { category: 'Security', ref: account?.email }) }
    setRoleState(k); localStorage.setItem('bf-role', k); setScope(ROLES[k].scope === 'Own' ? 'Own' : 'Company')
    if (!allowed(moduleOf(loc.pathname))) nav(k === 'employee' ? '/admin/business/my' : '/admin/business/dashboard')
  }

  useEffect(() => { setMenu('') }, [loc.pathname])
  useEffect(() => { if (loc.pathname.replace(/\/$/, '') === '/admin/business/dashboard' && E.sub && !E.blocked && !E.hasModule('health')) nav('/admin/business/my', { replace: true }) }, [loc.pathname, E.sub, E.blocked]) // eslint-disable-line
  useEffect(() => { localStorage.setItem('bf-collapsed', userCollapsed ? '1' : '0') }, [userCollapsed])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd((c) => !c) }
      if (e.key === 'Escape') { setCmd(false); setMenu('') }
    }
    const out = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-menu]')) setMenu('') }
    addEventListener('keydown', h); addEventListener('mousedown', out)
    return () => { removeEventListener('keydown', h); removeEventListener('mousedown', out) }
  }, [])
  const toggle = (m: Menu) => setMenu(menu === m ? '' : m)

  const groups = useMemo(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.m)) })).filter((g) => g.items.length), [role]) // eslint-disable-line
  const mod = moduleOf(loc.pathname)
  const modId = ROUTE_MODULE[mod]
  const hasFullModulePlan = !!tenant && (tenant.plan === 'Enterprise' || MODULE_LIST.every((module) => tenant.modules.includes(module.id)))
  const tLocked = (m: string) => !!tenant && !!TMOD[m] && !tenant.modules.includes(TMOD[m])
  const entitled = (m: string) => {
    const id = ROUTE_MODULE[m]
    return !id || !E.sub || hasFullModulePlan || E.hasModule(id)
  }
  const gated = !!modId && !entitled(mod) && !E.blocked
  const comp = useCompliance()
  const notes = [...(canBilling ? billingNotes(E.s, E.sub) : []), ...complianceNotes(comp, tenant?.slug).filter((n) => allowed(n.m)), ...(isOwnDataset(tenant?.slug) ? [] : NOTES).filter((n) => allowed(n.m))]
  const inbox = useInbox(tenant?.slug ?? '', { user: r.user, role, modules: r.modules, isAdmin: can('company.users.manage') })
  const urgent = notes.filter((n) => n.pri).length + inbox.urgentUnread
  const bellCount = notes.length + inbox.unread
  const alerts = useAlerts()
  useEffect(() => { const t = setTimeout(() => sendDigest(notes.filter((n) => n.pri).map((n) => ({ title: n.t, to: n.to })), r.user), 4000); return () => clearTimeout(t) }, [urgent, r.user]) // eslint-disable-line
  const homeTo = allowed('dashboard') ? (entitled('dashboard') ? '/admin/business/dashboard' : '/admin/business/my') : '/admin/business/my'
  const ownEmployeeProfile = role === 'employee' && loc.pathname.replace(/\/$/, '') === `/admin/business/people/${r.id}`
  const blocked = !allowed(mod) && mod !== 'settings' && !ownEmployeeProfile
  const blockedSettings = mod === 'settings' && !allowed('settings')
  const scopes = r.scope === 'Own' ? ['Own'] : branchesForTenant(tenant?.slug)

  const sidebar = (c: boolean, mobile = false) => (
    <nav aria-label="Application" className="flex-1 overflow-y-auto px-2.5 pb-4">
      {groups.map((g) => (
        <div key={g.g} className="mb-3">
          {!c && <div className={`px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40 ${mobile ? '' : 'max-lg:hidden'}`}>{g.g}</div>}
          <div className={`mx-3 mb-1 h-px bg-white/10 ${c ? '' : mobile ? 'hidden' : 'lg:hidden'}`} />
          {g.items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/admin/business/dashboard' || i.to === '/admin/business/modules'} title={c ? i.n : undefined} aria-label={i.n} onClick={() => mobile && setMenu('')} className={({ isActive }) => `relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors ${c ? 'justify-center px-0' : mobile ? '' : 'max-lg:justify-center max-lg:px-0'} ${isActive ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'}`}>
              {i.icon}{!c && <span className={mobile ? '' : 'max-lg:hidden'}>{i.n}</span>}{(!entitled(i.m) || tLocked(i.m)) && <Lock size={12} aria-label="Not included in your plan" className={c ? 'absolute right-2 top-1.5' : 'ml-auto text-white/40 max-lg:hidden'} />}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )

  if (tenant && (tenant.status === 'Suspended' || tenant.status === 'Expired')) return <WorkspaceBlocked tenant={tenant} canBilling={canBilling} />
  return (
    <RoleCtx.Provider value={{ role, setRole, can, r }}>
      <ScopeCtx.Provider value={{ scope, setScope }}>
        <div className="dashboard-shell min-h-screen bg-cloud lg:grid lg:transition-[grid-template-columns] lg:duration-200" style={{ gridTemplateColumns: undefined }}>
          <style>{`@media (min-width:768px){.bf-shell{display:grid;grid-template-columns:64px minmax(0,1fr)}}@media (min-width:1024px){.bf-shell{--sbw:${collapsed ? '64px' : '248px'};grid-template-columns:${collapsed ? '64px' : '248px'} minmax(0,1fr)}}`}</style>
          {support && tenant && support.slug === tenant.slug && <SupportBanner support={support} companyAdmin={role === 'admin' || role === 'md' ? r.user : undefined} />}
          {tenant && <OffboardingBar tenant={tenant} canManage={role === 'admin' || role === 'md'} />}
          {tenant && <AnnouncementBar tenant={tenant} />}
          {tenant && (tenant.status === 'Renewal Due' || tenant.status === 'Grace Period') && canBilling && (
            <div role="status" className="flex flex-wrap items-center gap-2 bg-amber-50 px-4 py-2 text-[13px] text-amber-900"><b>{tenant.status === 'Grace Period' ? 'Payment failed. Your workspace stays open for 7 more days.' : 'Your renewal is due.'}</b><Link to="/admin/business/billing" className="font-semibold underline">Pay now</Link></div>
          )}
          <div className="bf-shell min-h-screen">
            <aside className={`dashboard-nav on-dark sticky top-0 hidden h-screen flex-col bg-midnight md:flex ${tenant?.brand.sidebarBackground === 'solid' ? 'sidebar-solid' : ''}`} aria-label="Sidebar">
              <div aria-hidden className="safe-top" />
              <div className="relative px-2.5 pb-3 pt-3" data-menu>
                <button onClick={() => toggle('ws')} aria-haspopup="menu" aria-expanded={menu === 'ws'} aria-label={`Workspace menu, ${tenant?.profile.name}`} className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left text-white hover:bg-white/10 ${collapsed ? 'justify-center px-0' : 'max-lg:justify-center max-lg:px-0'}`}>
                  {tenant && <TenantMark t={tenant} size={34} tone="nav" />}
                  {!collapsed && tenant && <span className="min-w-0 flex-1 max-lg:hidden"><span className="block truncate text-[13.5px] font-semibold leading-tight">{tenant.profile.name}</span><span className="block truncate font-mono text-[11px] text-white/55">{host(tenant.slug)}</span></span>}
                  {!collapsed && <ChevronsUpDown size={14} className="text-white/50 max-lg:hidden" />}
                </button>
                {menu === 'ws' && tenant && <WorkspaceMenu tenant={tenant} canAdmin={canBilling} className="left-2.5 top-[62px]" />}
              </div>
              {sidebar(collapsed)}
              <div className="px-3 pb-1 text-[10.5px] text-white/35 max-lg:hidden">{!collapsed && 'Powered by BizFlow'}</div>
              {!compactNav && <button onClick={() => setCollapsed(!userCollapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={`m-2.5 mt-0 flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[13px] text-white/60 hover:bg-white/5 hover:text-white max-lg:hidden ${collapsed ? 'justify-center px-0' : ''}`}>
                {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} />Collapse</>}
              </button>}
            </aside>

            <div className="bf-content min-w-0">
              <header className="glass-bar sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-cloud/90 px-4 backdrop-blur lg:px-8">
                <button className="-ml-1 cursor-pointer p-1.5 md:hidden" aria-label="Open navigation" onClick={() => setMenu('nav')}><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h16M3 11h16M3 16h16" /></svg></button>
                {tenant && <span className="flex min-w-0 items-center gap-2 md:hidden"><TenantMark t={tenant} size={26} /><b className="hidden max-w-[34vw] truncate text-[13px] min-[480px]:block">{tenant.profile.name}</b></span>}
                <div className="relative max-sm:hidden" data-menu>
                  {r.scope === 'Own' ? (
                    <span className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-1.5 text-[13px]"><span className="text-slate">Scope</span><b>Own records</b></span>
                  ) : (
                    <button onClick={() => toggle('scope')} aria-haspopup="menu" aria-expanded={menu === 'scope'} className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 py-1.5 text-[13px] hover:border-teal">
                      <span className="hidden text-slate sm:inline">Viewing:</span><b>{scope}</b><span className="text-slate">▾</span>
                    </button>
                  )}
                  {menu === 'scope' && (
                    <div role="menu" className="absolute left-0 top-11 z-40 w-60 rounded-lg border border-line bg-white p-1.5 shadow-lg">
                      <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Active scope</div>
                      {scopes.map((b) => (
                        <button key={b} role="menuitemradio" aria-checked={scope === b} onClick={() => { setScope(b); setMenu('') }} className="flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-left text-sm hover:bg-cloud">
                          {b}{scope === b && <span className="text-teal">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setCmd(true)} className="mx-auto hidden h-9 w-full max-w-md cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 text-left text-sm text-slate hover:border-teal md:flex">
                  <Search size={15} />Search or run a command <kbd className="ml-auto rounded border border-line px-1.5 font-mono text-[11px]">⌘K</kbd>
                </button>
                <div className="ml-auto flex items-center gap-1 md:ml-0">
                  <button className="flex size-9 cursor-pointer items-center justify-center rounded-md hover:bg-ink/5 md:hidden" aria-label="Search" onClick={() => setCmd(true)}><Search size={18} /></button>
                  <div className="relative" data-menu>
                    <Btn s="sm" onClick={() => toggle('create')} aria-haspopup="menu" aria-expanded={menu === 'create'}>+ Create</Btn>
                    {menu === 'create' && (
                      <div role="menu" className="absolute right-0 top-10 z-40 grid w-64 grid-cols-2 gap-0.5 rounded-lg border border-line bg-white p-1.5 shadow-lg">
                        {CREATE.filter(([, to, p]) => allowed(moduleOf(to)) && can(p === '*' ? 'accounting.post' : p)).map(([n, to]) => <Link key={n} role="menuitem" to={to} className="rounded px-2.5 py-1.5 text-[13px] hover:bg-cloud">{n}</Link>)}
                      </div>
                    )}
                  </div>
                  <div className="relative" data-menu>
                    <button onClick={() => toggle('notes')} aria-label={`Notifications, ${urgent} urgent`} aria-expanded={menu === 'notes'} className="relative flex size-9 cursor-pointer items-center justify-center rounded-md hover:bg-ink/5"><Bell size={18} />{bellCount > 0 && <span className="absolute -right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-err px-1 text-[10px] font-semibold leading-none text-white">{bellCount > 99 ? '99+' : bellCount}</span>}</button>
                    {menu === 'notes' && (
                      <div className="absolute right-0 top-11 z-40 max-h-[70vh] w-[340px] max-w-[92vw] overflow-y-auto rounded-lg border border-line bg-white shadow-lg">
                        <div className="flex justify-between border-b border-line px-4 py-3 text-sm font-semibold">Notifications <span className="text-xs font-medium text-teal">{urgent} urgent</span></div>
                        {inbox.items.filter((i) => !i.read).slice(0, 5).map((i) => (
                          <div key={i.id} className="border-b border-line/60 px-4 py-3">
                            <div className="flex items-center gap-2 text-sm font-semibold">{i.urgent && <span className="size-1.5 shrink-0 rounded-full bg-err" />}<span className="min-w-0">{i.title}</span></div>
                            <p className="text-[13px] text-slate">{i.body}</p>
                            <Link to={i.to} onClick={() => { markRead(tenant?.slug ?? '', r.user, [i.id]); setMenu('') }} className="mt-1 inline-block text-[13px] font-semibold text-teal">Open</Link>
                          </div>
                        ))}
                        {notes.map((n) => (
                          <div key={n.t} className="border-b border-line/60 px-4 py-3 last:border-0">
                            <div className="flex items-center gap-2 text-sm font-semibold">{n.pri && <span className="size-1.5 rounded-full bg-err" />}{n.t}<span className="ml-auto text-xs font-normal text-slate">{n.ago}</span></div>
                            <p className="text-[13px] text-slate">{n.d}</p>
                            <Link to={n.to} className="mt-1 inline-block text-[13px] font-semibold text-teal">{n.cta}</Link>
                          </div>
                        ))}
                        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[13px] font-semibold text-teal">
                          <Link to="/admin/business/inbox" onClick={() => setMenu('')}>Open inbox ({inbox.unread} unread)</Link>
                          {inbox.unread > 0 && <button onClick={() => markRead(tenant?.slug ?? '', r.user, inbox.items.map((i) => i.id))} className="cursor-pointer">Mark all read</button>}
                        </div>
                        {alerts.supported && (
                          <div className="flex items-center justify-between gap-3 border-t border-line bg-cloud/60 px-4 py-3 text-[13px]">
                            <span className="min-w-0 text-slate">{alerts.state === 'blocked' ? 'Alerts are blocked in your browser settings.' : 'Daily alert for urgent items on this device'}</span>
                            {alerts.state !== 'blocked' && <button onClick={() => alerts.state === 'on' ? disableAlerts() : enableAlerts()} className="min-h-9 shrink-0 cursor-pointer rounded-md border border-line bg-white px-3 font-semibold text-teal">{alerts.state === 'on' ? 'Turn off' : 'Turn on'}</button>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative hidden sm:block" data-menu>
                    <button onClick={() => toggle('help')} aria-label="Help and support" aria-expanded={menu === 'help'} className="flex size-9 cursor-pointer items-center justify-center rounded-md hover:bg-ink/5"><CircleHelp size={18} /></button>
                    {menu === 'help' && (
                      <div role="menu" className="absolute right-0 top-11 z-40 w-56 rounded-lg border border-line bg-white p-1.5 text-sm shadow-lg">
                        <button role="menuitem" onClick={() => { setMenu(''); setCmd(true) }} className="flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-2 hover:bg-cloud">Command menu <kbd className="font-mono text-[11px] text-slate">⌘K</kbd></button>
                        {!pwa.installed && (pwa.canInstall || pwa.ios) && <button role="menuitem" onClick={() => { setMenu(''); openInstall() }} className="block w-full cursor-pointer rounded px-2.5 py-2 text-left hover:bg-cloud">Install app</button>}
                        <Link role="menuitem" to="/contact#faq" className="block rounded px-2.5 py-2 hover:bg-cloud">Help centre and FAQ</Link>
                        <Link role="menuitem" to="/contact" className="block rounded px-2.5 py-2 hover:bg-cloud">Contact support</Link>
                        <Link role="menuitem" to="/welcome" className="block rounded px-2.5 py-2 hover:bg-cloud">Review company setup</Link>
                      </div>
                    )}
                  </div>
                  <div className="relative" data-menu>
                    <button onClick={() => toggle('user')} aria-label="Account menu" aria-haspopup="menu" aria-expanded={menu === 'user'} className="ml-1 cursor-pointer rounded-full ring-offset-2 hover:ring-2 hover:ring-teal/40"><Avatar name={r.user} size={32} /></button>
                    {menu === 'user' && (
                      <div role="menu" className="absolute right-0 top-11 z-40 w-72 rounded-lg border border-line bg-white shadow-lg">
                        <div className="border-b border-line p-4"><div className="font-semibold">{r.user}</div><div className="text-xs text-slate">{r.title} · {r.id}</div>
                          <div className="mt-2 flex items-center gap-2 text-xs"><span className="text-slate">Access scope</span><Badge tone="teal">{r.scope === 'Own' ? 'Own' : 'Company'}</Badge></div></div>
                        <div className="p-2">
                          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate">Demo: view as company role</div>
                          {tenantAccounts.map((account) => (
                            <button key={account.email} role="menuitemradio" aria-checked={role === account.roleKey} onClick={() => { setRole(account.roleKey); setMenu('') }} className="flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-cloud">
                              <span>{account.title}<span className="block text-xs text-slate">{account.name} · {account.scope} scope</span></span>{role === account.roleKey && <span className="text-teal">✓</span>}
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-line p-2"><Link to={`/w/${tenant?.slug ?? 'etranzact'}/login`} onClick={clearBusinessSession} className="block rounded px-2 py-1.5 text-sm hover:bg-cloud">Sign out of {tenant?.profile.name}</Link></div>
                      </div>
                    )}
                  </div>
                </div>
              </header>
              <BillingBanner canBilling={canBilling} />
              <GrantBanner canBilling={canBilling} />
              <main id="main" className="mx-auto max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">
                {navigation.state === 'loading' ? <PageSkeleton /> : E.blocked && mod !== 'settings' ? (
                  <div className="rounded-lg border border-line bg-white"><EmptyState title={E.sub?.status === 'expired' ? 'Your subscription has expired' : E.sub?.status === 'suspended' ? 'This workspace is suspended' : 'No active subscription'} body={canBilling ? 'Your data is safe and retained. Reactivate your subscription from Billing to restore access.' : 'Your data is safe. Ask your BizFlow administrator to restore the subscription.'} action={canBilling ? <Btn to="/admin/business/settings?tab=billing">Open billing</Btn> : undefined} /></div>
                ) : gated ? <UpgradeGate moduleId={modId} canManage={canBilling} /> : tLocked(mod) ? <ModuleLocked id={TMOD[mod]} canManage={canBilling} /> : blocked || blockedSettings ? (
                  <div className="rounded-lg border border-line bg-white"><EmptyState title="You don't have access to this area" body={`Your role (${r.title}) has ${r.scope.toLowerCase()} scope and doesn't include this module. Ask an administrator if you need access.`} action={<Btn to={role === 'employee' ? '/admin/business/my' : '/admin/business/dashboard'}>Go to my workspace</Btn>} /></div>
                ) : <Outlet />}
              </main>
            </div>
          </div>

          {menu === 'nav' && (
            <div data-menu className="on-dark fixed inset-0 z-50 flex md:hidden">
              <div className={`dashboard-nav flex w-72 max-w-[85vw] flex-col bg-midnight pt-5 ${tenant?.brand.sidebarBackground === 'solid' ? 'sidebar-solid' : ''}`}><div aria-hidden className="safe-top" /><div className="flex items-center justify-between px-5 pb-4">{tenant ? <span className="flex items-center gap-2.5 text-white"><TenantMark t={tenant} size={30} tone="nav" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{tenant.profile.name}</span><span className="block truncate font-mono text-[11px] text-white/55">{host(tenant.slug)}</span></span></span> : <Logo dark />}<button className="cursor-pointer p-2 text-white" onClick={() => setMenu('')} aria-label="Close navigation">✕</button></div>{sidebar(false, true)}<div aria-hidden className="safe-bottom" /></div>
              <div className="flex-1 bg-black/50" onClick={() => setMenu('')} />
            </div>
          )}

          <MobileTabs role={role} allowed={allowed} locked={tLocked} onMore={() => setMenu('nav')} />
          {cmd && <Command onClose={() => setCmd(false)} allowed={allowed} />}
        </div>
      </ScopeCtx.Provider>
    </RoleCtx.Provider>
  )
}

type Tab = { n: string; to: string; Ic: typeof Home; m: string; primary?: boolean }
const TABS: Partial<Record<RoleKey, Tab[]>> & { default: Tab[] } = {
  default: [
    { n: 'Home', to: '/admin/business/dashboard', Ic: Home, m: 'dashboard' }, { n: 'Approvals', to: '/admin/business/approvals', Ic: ShieldCheck, m: 'approvals' },
    { n: 'Clock in', to: '/admin/business/performance?tab=Attendance', Ic: Fingerprint, m: 'performance', primary: true }, { n: 'Tasks', to: '/admin/business/tasks', Ic: ListChecks, m: 'tasks' },
  ],
  employee: [
    { n: 'Home', to: '/admin/business/my', Ic: Home, m: 'my' }, { n: 'Tasks', to: '/admin/business/tasks', Ic: ListChecks, m: 'tasks' },
    { n: 'Clock in', to: '/admin/business/performance?tab=Attendance', Ic: Fingerprint, m: 'performance', primary: true }, { n: 'Requests', to: '/admin/business/approvals', Ic: ShieldCheck, m: 'approvals' },
  ],
  md: [
    { n: 'Home', to: '/admin/business/dashboard', Ic: Home, m: 'dashboard' }, { n: 'Reports', to: '/admin/business/reports', Ic: BarChart3, m: 'reports' },
    { n: 'Approve', to: '/admin/business/approvals', Ic: ShieldCheck, m: 'approvals', primary: true }, { n: 'Tasks', to: '/admin/business/tasks', Ic: ListChecks, m: 'tasks' },
  ],
  finance: [
    { n: 'Home', to: '/admin/business/dashboard', Ic: Home, m: 'dashboard' }, { n: 'Accounting', to: '/admin/business/accounting', Ic: Calculator, m: 'accounting' },
    { n: 'Disburse', to: '/admin/business/approvals', Ic: Wallet, m: 'approvals', primary: true }, { n: 'Payroll', to: '/admin/business/payroll', Ic: CreditCard, m: 'payroll' },
  ],
  hr: [
    { n: 'Home', to: '/admin/business/dashboard', Ic: Home, m: 'dashboard' }, { n: 'People', to: '/admin/business/people', Ic: UsersRound, m: 'people' },
    { n: 'Attendance', to: '/admin/business/performance?tab=Attendance', Ic: Fingerprint, m: 'performance', primary: true }, { n: 'Approvals', to: '/admin/business/approvals', Ic: ShieldCheck, m: 'approvals' },
  ],
  admin: [
    { n: 'Home', to: '/admin/business/dashboard', Ic: Home, m: 'dashboard' }, { n: 'Vendors', to: '/admin/business/vendors', Ic: Store, m: 'vendors' },
    { n: 'Approvals', to: '/admin/business/approvals', Ic: ShieldCheck, m: 'approvals', primary: true }, { n: 'Fleet', to: '/admin/business/fleet', Ic: Truck, m: 'fleet' },
  ],
}
TABS.operations = TABS.admin

function MobileTabs({ role, allowed, locked, onMore }: { role: RoleKey; allowed: (m: string) => boolean; locked: (m: string) => boolean; onMore: () => void }) {
  const list = (TABS[role] ?? TABS.default).filter((t) => allowed(t.m) && !locked(t.m))
  const tabs = list.slice(0, 4)
  const prim = tabs.find((t) => t.primary)
  const rest = tabs.filter((t) => t !== prim)
  const seq: (Tab | 'more')[] = prim ? [rest[0], rest[1], prim, rest[2], 'more'].filter(Boolean) as (Tab | 'more')[] : [...tabs, 'more']
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur md:hidden">
      {seq.map((t) => t === 'more' ? (
        <button key="more" onClick={onMore} aria-label="More, open full menu" className="flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-slate"><Ellipsis size={20} />More</button>
      ) : t.primary ? (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `-mt-5 flex min-h-14 flex-1 flex-col items-center justify-end gap-0.5 pb-1.5 text-[11px] font-semibold ${isActive ? 'text-teal' : 'text-ink'}`}>
          <span className="flex size-12 items-center justify-center rounded-full bg-teal text-white shadow-lg ring-4 ring-white"><t.Ic size={22} /></span>{t.n}
        </NavLink>
      ) : (
        <NavLink key={t.to} to={t.to} end={t.to === '/admin/business/dashboard'} className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${isActive ? 'text-teal' : 'text-slate'}`}><t.Ic size={20} />{t.n}</NavLink>
      ))}
    </nav>
  )
}

function GrantBanner({ canBilling }: { canBilling: boolean }) {
  const { sub } = useEntitlements()
  const st = useGrants()
  useEffect(() => { syncGrants() }, [])
  if (!sub) return null
  const ending = st.grants.filter((g) => g.status === 'Active' && g.notify === 'tenant' && g.targets.includes(sub.id) && g.endsAt && remaining(g) >= 0 && remaining(g) <= 7)
  const waiting = awaitingFor(st, sub.id)
  if (!ending.length && !waiting.length) return null
  return (
    <>
      {ending.map((g) => {
        const d = remaining(g)
        return (
          <div key={g.id} role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-amber-50 px-4 py-2 text-[13px] font-medium text-amber-900 lg:px-8">
            <span>Complimentary access to {g.name} ends on {fmtDate(g.endsAt as string)} ({d <= 0 ? 'today' : `${d} day${d === 1 ? '' : 's'} left`}). Next: {CONVERSION_LABEL[g.conversion].toLowerCase()}.</span>
            {canBilling ? <Link to="/admin/business/settings?tab=billing" className="font-semibold text-teal underline-offset-2 hover:underline">Review billing</Link> : <span className="text-slate">Contact your administrator.</span>}
          </div>
        )
      })}
      {waiting.map(({ g }) => (
        <div key={`w-${g.id}`} role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-amber-50 px-4 py-2 text-[13px] font-medium text-amber-900 lg:px-8">
          <span>Complimentary access to {g.name} has ended. Choose whether to keep it on your plan.</span>
          {canBilling ? <Link to="/admin/business/settings?tab=billing" className="font-semibold text-teal underline-offset-2 hover:underline">Choose</Link> : <span className="text-slate">Contact your administrator.</span>}
        </div>
      ))}
    </>
  )
}

function BillingBanner({ canBilling }: { canBilling: boolean }) {
  const { sub, plan } = useEntitlements()
  if (!sub) return null
  const st = sub.status
  const tone = st === 'trial' ? 'bg-softmint text-midnight' : st === 'active' ? '' : st === 'cancelled' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-900'
  if (st === 'active' && !sub.pendingChange) return null
  let msg = ''
  let cta = 'Open billing'
  if (st === 'trial' && sub.trialEndsAt) { const d = Math.max(0, daysUntil(sub.trialEndsAt)); msg = `${plan?.name} Trial · ${d} day${d === 1 ? '' : 's'} remaining`; cta = 'Upgrade Now' }
  else if (st === 'past_due' || st === 'payment_failed') { msg = 'Your last payment failed. Update your payment method to avoid interruption.'; cta = 'Update payment' }
  else if (st === 'grace') { msg = `Grace period active until ${fmtDate(sub.renewsAt)}. Pay now to keep full access.`; cta = 'Pay now' }
  else if (st === 'cancelled') msg = `Subscription cancelled. Access continues until ${fmtDate(sub.endsAt ?? sub.renewsAt)}.`
  else if (st === 'suspended' || st === 'expired') msg = `Subscription ${STATUS_META[st].label.toLowerCase()}. Your data is retained.`
  else if (sub.pendingChange) { return null }
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-[13px] font-medium lg:px-8 ${tone}`}>
      <span>{msg}</span>
      {canBilling ? <Link to={st === 'trial' ? '/admin/business/settings?tab=billing&change=1' : '/admin/business/settings?tab=billing'} className="font-semibold text-teal underline-offset-2 hover:underline">{cta}</Link> : <span className="text-slate">Contact your administrator.</span>}
    </div>
  )
}

function Command({ onClose, allowed }: { onClose: () => void; allowed: (m: string) => boolean }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const nav = useNavigate()
  const tenant = useTenant()
  const employees = employeesForTenant(tenant?.slug)
  const approvals = approvalsForTenant(tenant?.slug)
  const items = useMemo(() => {
    const all: { g: string; n: string; s: string; to: string; m: string }[] = [
      ...['Create employee|/admin/business/people|people', 'Request signature|/admin/business/sign|sign', 'Create expense|/admin/business/accounting|accounting', 'Assign asset|/admin/business/assets|assets', 'View payroll|/admin/business/payroll|payroll', 'Open Business Health|/admin/business|health', 'Open My BizFlow|/admin/business/my|my'].map((x) => { const [n, to, m] = x.split('|'); return { g: 'Actions', n, s: '', to, m } }),
      ...employees.map((e) => ({ g: 'Employees', n: e.name, s: e.role, to: `/admin/business/people/${e.id}`, m: 'people' })),
      ...assetsForTenant(tenant?.slug).map((a) => ({ g: 'Assets', n: a.name, s: a.id, to: `/admin/business/assets/${a.id}`, m: 'assets' })),
      ...vehiclesForTenant(tenant?.slug).map((v) => ({ g: 'Vehicles', n: v.reg, s: v.model, to: '/admin/business/fleet', m: 'fleet' })),
      ...approvals.map((r) => ({ g: 'Requests', n: r.id, s: `${r.type} · ${r.who}`, to: '/admin/business/approvals', m: 'approvals' })),
      ...(isOwnDataset(tenant?.slug) ? [] : [
      { g: 'Documents', n: `Employment Agreement — ${employees.find((employee) => employee.status === 'Onboarding')?.name ?? employees[0]?.name}`, s: 'Signed', to: '/admin/business/sign/signing', m: 'sign' },
      { g: 'Customers', n: 'Nile Distribution Distribution', s: 'Proposal', to: '/admin/business/crm', m: 'crm' },
      { g: 'Vendors', n: 'Computer Warehouse Ltd', s: 'Active', to: '/admin/business/vendors', m: 'vendors' },
      { g: 'Transactions', n: 'JE-1042 October payroll accrual', s: '₦18,420,000', to: '/admin/business/accounting', m: 'accounting' },
      ]),
    ]
    const s = q.toLowerCase()
    return all.filter((x) => allowed(x.m) && (!s || (x.n + x.s + x.g).toLowerCase().includes(s))).slice(0, 10)
  }, [q, allowed, employees, approvals])
  const go = (to: string) => { onClose(); nav(to) }
  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center bg-midnight/50 px-2 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-4 sm:pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Command menu" className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-white shadow-2xl">
        <input autoFocus role="combobox" aria-expanded aria-controls="cmd-list" value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} placeholder="Search employees, assets, documents… or type a command"
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(i + 1, items.length - 1)) } if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(i - 1, 0)) } if (e.key === 'Enter' && items[i]) go(items[i].to) }}
          className="h-14 w-full border-b border-line px-5 text-[15px] outline-none" />
        <div id="cmd-list" role="listbox" className="max-h-[calc(100dvh-8rem-env(safe-area-inset-top))] overflow-y-auto p-2 sm:max-h-[50vh]">
          {items.length === 0 && <div className="p-6 text-center text-sm text-slate">No matches for “{q}”. Try an employee name, asset ID or action.</div>}
          {items.map((x, k) => (
            <button key={k} role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onClick={() => go(x.to)} className={`flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${k === i ? 'bg-softmint' : ''}`}>
              <span className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate">{x.g}</span>
              <span className="font-medium">{x.n}</span><span className="ml-auto truncate text-xs text-slate">{x.s}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-4 border-t border-line bg-cloud px-4 py-2 text-[11px] text-slate"><span>↑↓ navigate</span><span>↵ open</span><span>esc close</span></div>
      </div>
    </div>
  )
}

export { Activity, Landmark, FileText }


function WorkspaceMenu({ tenant, canAdmin, className }: { tenant: NonNullable<ReturnType<typeof useTenant>>; canAdmin: boolean; className: string }) {
  const companies = Object.values(useTenants()).filter((company) => company.status !== 'Suspended' && company.slug !== tenant.slug)
  const items: [string, string, ReactNode][] = [['Company Settings', '/admin/business/settings', <Settings size={15} key="s" />], ['Company Profile', '/admin/business/settings/profile', <Building2 size={15} key="a" />], ['Branding & Login', '/admin/business/settings/branding', <Palette size={15} key="b" />], ['Subscription & Billing', '/admin/business/billing', <CreditCard size={15} key="c" />], ['Staff & RBAC', '/admin/business/settings?tab=rbac', <UsersRound size={15} key="d" />], ['Security', '/admin/business/settings?tab=security', <ShieldCheck size={15} key="e" />]]
  return (
    <div role="menu" className={`absolute z-50 w-[272px] rounded-lg border border-line bg-white text-ink shadow-xl ${className}`}>
      <div className="flex items-center gap-3 border-b border-line p-4"><TenantMark t={tenant} size={40} /><div className="min-w-0"><div className="truncate text-sm font-semibold">{tenant.profile.name}</div><div className="truncate font-mono text-xs text-slate">{host(tenant.slug)}</div><div className="mt-1"><Badge tone="teal">{tenant.plan} plan</Badge></div></div></div>
      <div className="p-1.5">
        {items.map(([n, to, ic]) => (canAdmin || n === 'Company Profile') && <Link key={n} role="menuitem" to={to} className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm hover:bg-cloud"><span className="text-slate">{ic}</span>{n}</Link>)}
      </div>
      <div className="border-t border-line p-1.5">
        <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate">Switch company</div>
        <p className="px-2.5 pb-2 text-xs text-slate">Choose another workspace and sign in with that company's account.</p>
        <div className="max-h-40 overflow-y-auto">
          {companies.map((company) => <Link key={company.slug} role="menuitem" to={`/admin/business/login?company=${company.slug}`} className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm hover:bg-cloud"><TenantMark t={company} size={24} /><span className="min-w-0 flex-1 truncate">{company.profile.name}</span><span className="text-xs font-semibold text-teal">Sign in</span></Link>)}
        </div>
      </div>
      <div className="border-t border-line p-1.5"><Link role="menuitem" to={`/w/${tenant.slug}/login`} onClick={clearBusinessSession} className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm hover:bg-cloud"><LogOut size={15} className="text-slate" />Logout</Link></div>
      <div className="border-t border-line px-4 py-2"><PoweredBy /></div>
    </div>
  )
}
