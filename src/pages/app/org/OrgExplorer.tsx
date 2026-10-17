import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Building2, CalendarOff, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Crown, Home, List, Lock, MapPin, Minus, Network, Plus, Search, Share2, Timer, UserRound, UsersRound, X } from 'lucide-react'
import type { Employee } from '../../../data/demo'
import { Avatar, Badge, Overlay } from '../../../components/ui'
import { ancestorsOf, avgSpan, buildTree, flatten, metricsFor, ngn, vacanciesFor } from './model'
import type { Br, Dept, Group, Kind, Metrics, ONode } from './model'

/* ---------- motion helpers ---------- */
const KEYFRAMES = `
@keyframes org-rise{from{opacity:0;transform:translateY(16px) scale(.95)}to{opacity:1;transform:none}}
@keyframes org-x{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes org-y{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes org-pop{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
@keyframes org-ring{0%,100%{box-shadow:0 0 0 0 rgba(53,208,186,.6)}50%{box-shadow:0 0 0 8px rgba(53,208,186,0)}}
@keyframes org-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.org-rise{animation:org-rise .6s cubic-bezier(.2,.8,.2,1) both}
.org-x{animation:org-x .5s cubic-bezier(.4,0,.2,1) both}
.org-y{animation:org-y .4s cubic-bezier(.4,0,.2,1) both}
.org-pop{animation:org-pop .18s ease-out both}
.org-ring{animation:org-ring 1.6s ease-in-out infinite}
.org-bar{transform-origin:left;animation:org-bar .8s cubic-bezier(.2,.8,.2,1) both}
@media (prefers-reduced-motion:reduce){.org-rise,.org-x,.org-y,.org-pop,.org-ring,.org-bar{animation:none!important}}
`
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function CountUp({ to, decimals = 0, suffix = '' }: { to: number; decimals?: number; suffix?: string }) {
  const [v, setV] = useState(reduced() ? to : 0)
  useEffect(() => {
    if (reduced()) { setV(to); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1100)
      setV(to * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{v.toFixed(decimals)}{suffix}</>
}

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const h = () => setM(mq.matches)
    h()
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [q])
  return m
}

/* ---------- visual tokens ---------- */
const KIND: Record<Kind, { icon: ReactNode; chip: string; label: string }> = {
  company: { icon: <Building2 size={16} />, chip: 'bg-mint/20 text-mint', label: 'Company' },
  branch: { icon: <MapPin size={16} />, chip: 'bg-[#E3EEF9] text-info', label: 'Branch' },
  dept: { icon: <UsersRound size={16} />, chip: 'bg-softmint text-teal', label: 'Department' },
  team: { icon: <Share2 size={16} />, chip: 'bg-[#E8E4F3] text-[#5b4b9a]', label: 'Team' },
  person: { icon: <UserRound size={16} />, chip: 'bg-cloud text-slate', label: 'Person' },
}
const MODE_COLOR: Record<string, string> = { 'On-site': '#087E8B', Hybrid: '#35D0BA', Remote: '#2878D8', Field: '#F59E0B' }
const STATUS_COLOR: Record<string, string> = { Active: '#087E8B', 'On leave': '#F59E0B', Onboarding: '#2878D8', Remote: '#35D0BA' }

/* ---------- context ---------- */
type Ctx = {
  total: number
  canPay: boolean
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
  select: (id: string) => void
  selected: string | null
  path: Set<string>
  matches: Set<string>
  related: Set<string>
  query: string
  showHover: (n: ONode, el: HTMLElement) => void
  hideHover: () => void
  metrics: (n: ONode) => Metrics
}
const OrgCtx = createContext<Ctx>(null as unknown as Ctx)

/* ---------- hover card (portal, never clipped, keyboard accessible) ---------- */
function HoverCard({ node, el, ctx }: { node: ONode; el: HTMLElement; ctx: Ctx }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const m = ctx.metrics(node)
  useLayoutEffect(() => {
    const r = el.getBoundingClientRect()
    const c = ref.current
    if (!c) return
    const w = c.offsetWidth, h = c.offsetHeight, vw = window.innerWidth, vh = window.innerHeight
    let left = r.left + r.width / 2 - w / 2
    left = Math.max(8, Math.min(left, vw - w - 8))
    let top = r.bottom + 10
    if (top + h > vh - 8) top = r.top - h - 10
    if (top < 8) top = Math.max(8, Math.min(vh - h - 8, r.top + r.height / 2 - h / 2))
    // if the card would sit over the anchor (tiny viewports), move beside it
    if (top < r.bottom && top + h > r.top) left = r.right + 10 + w < vw ? r.right + 10 : Math.max(8, r.left - w - 10)
    setPos({ left, top })
  }, [el, node.id])
  const k = KIND[node.kind]
  const maxBranch = Math.max(1, ...m.branchDist.map((b) => b.count))
  return createPortal(
    <div ref={ref} role="tooltip" id="org-hover" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }} className="org-pop pointer-events-none fixed z-[70] w-[300px] rounded-xl border border-line bg-white p-4 text-ink shadow-[0_18px_50px_-12px_rgba(11,37,48,.35)]">
      <div className="flex items-start gap-3">
        {node.person ? <Avatar name={node.person.name} size={36} /> : <span className={`flex size-9 items-center justify-center rounded-lg ${node.kind === 'company' ? 'bg-midnight text-mint' : k.chip}`}>{k.icon}</span>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{node.label}</div>
          <div className="truncate text-xs text-slate">{node.sub}</div>
        </div>
        <span className="rounded bg-cloud px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate">{k.label}</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[
          [node.kind === 'person' && node.directs === 0 ? 'Team' : 'Headcount', String(m.headcount)],
          ['Open roles', String(m.vacancies)],
          [node.kind === 'person' ? 'Reports' : 'Span', String(m.span)],
          ['Of company', `${m.pct.toFixed(m.pct < 10 ? 1 : 0)}%`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg bg-cloud px-1 py-2"><div className="num text-base font-semibold">{v}</div><div className="text-[10px] text-slate">{l}</div></div>
        ))}
      </div>
      <div className="mt-3 space-y-1.5 text-xs">
        <Row icon={<CalendarOff size={12} />} l="Today"><b>{m.present}</b> in · <b className={m.onLeave ? 'text-warn' : ''}>{m.onLeave}</b> on leave</Row>
        <Row icon={<Home size={12} />} l="Remote / hybrid"><b>{m.remotePct.toFixed(0)}%</b></Row>
        <Row icon={<Timer size={12} />} l="Avg tenure"><b>{m.avgTenure.toFixed(1)} yrs</b></Row>
        <Row icon={<Crown size={12} />} l={node.kind === 'person' ? 'Reports to' : 'Lead'}><b className="truncate">{node.kind === 'person' ? node.manager : node.head?.name ?? node.manager}</b></Row>
        <Row icon={<Building2 size={12} />} l="Cost centre"><b className="truncate">{m.costCentres[0]?.replace(/^CC-/, 'CC-') ?? '—'}{m.costCentres.length > 1 ? ` +${m.costCentres.length - 1}` : ''}</b></Row>
        <Row icon={ctx.canPay ? <span className="text-[10px] font-bold">₦</span> : <Lock size={12} />} l="Salary band">
          {ctx.canPay ? <b>{m.headcount ? `${ngn(m.minSal)} – ${ngn(m.maxSal)}` : '—'}</b> : <span className="text-slate">Restricted</span>}
        </Row>
      </div>
      {m.branchDist.length > 0 && node.kind !== 'person' && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate">Branch distribution</div>
          <div className="space-y-1">
            {m.branchDist.slice(0, 4).map((b) => (
              <div key={b.name} className="flex items-center gap-2 text-[11px]"><span className="w-28 truncate text-slate">{b.name}</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-cloud"><span className="org-bar block h-full rounded-full bg-teal" style={{ width: `${(b.count / maxBranch) * 100}%` }} /></span><b className="num w-5 text-right">{b.count}</b></div>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
const Row = ({ icon, l, children }: { icon: ReactNode; l: string; children: ReactNode }) => (
  <div className="flex items-center gap-2"><span className="flex size-4 items-center justify-center text-teal">{icon}</span><span className="w-24 shrink-0 text-slate">{l}</span><span className="min-w-0 flex-1 truncate text-right">{children}</span></div>
)

/* ---------- tree chart ---------- */
function Spark({ m, dark }: { m: Metrics; dark?: boolean }) {
  const top = m.branchDist.slice(0, 5)
  const mx = Math.max(1, ...top.map((b) => b.count))
  return (
    <span className="flex h-5 items-end gap-0.5" aria-hidden>
      {top.map((b, i) => <span key={b.name} className={`w-1.5 rounded-sm ${dark ? 'bg-mint' : 'bg-teal'}`} style={{ height: `${Math.max(18, (b.count / mx) * 100)}%`, opacity: 1 - i * 0.14 }} />)}
    </span>
  )
}

function NodeCard({ node, depth, delay }: { node: ONode; depth: number; delay: number }) {
  const ctx = useContext(OrgCtx)
  const m = ctx.metrics(node)
  const open = ctx.isOpen(node.id)
  const hasKids = node.children.length > 0
  const sel = ctx.selected === node.id
  const inPath = ctx.path.has(node.id)
  const isMatch = ctx.matches.has(node.id)
  const dim = ctx.query && !ctx.related.has(node.id)
  const isCo = node.kind === 'company'
  const person = node.kind === 'person'
  const k = KIND[node.kind]
  return (
    <div className="org-rise relative" style={{ animationDelay: `${delay}ms` }} data-org-id={node.id}>
      <button
        type="button"
        aria-describedby="org-hover"
        aria-label={`${node.label}, ${node.sub}. ${m.headcount} people. Open details`}
        onClick={() => ctx.select(node.id)}
        onMouseEnter={(e) => ctx.showHover(node, e.currentTarget)}
        onMouseLeave={ctx.hideHover}
        onFocus={(e) => ctx.showHover(node, e.currentTarget)}
        onBlur={ctx.hideHover}
        className={`group block text-left outline-none transition-all duration-300 hover:-translate-y-1 focus-visible:-translate-y-1 focus-visible:ring-2 focus-visible:ring-teal ${person ? 'w-[176px] rounded-xl p-2.5' : 'w-[204px] rounded-2xl p-3'} border ${
          isCo ? 'border-midnight-2 bg-gradient-to-br from-midnight to-midnight-2 text-white shadow-[0_10px_30px_-10px_rgba(11,37,48,.7)] hover:shadow-[0_16px_40px_-10px_rgba(53,208,186,.45)]'
            : `bg-white text-ink shadow-sm hover:shadow-[0_14px_32px_-12px_rgba(8,126,139,.5)] ${inPath || sel ? 'border-teal' : 'border-line hover:border-teal/60'}`
        } ${sel ? 'ring-2 ring-teal ring-offset-2' : ''} ${isMatch ? 'org-ring ring-2 ring-mint' : ''} ${dim ? 'opacity-35' : ''}`}
      >
        <div className="flex items-center gap-2.5">
          {node.person ? <Avatar name={node.person.name} size={person ? 32 : 36} /> : <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${isCo ? k.chip : k.chip}`}>{k.icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight">{node.label}</span>
            <span className={`block truncate text-[11px] leading-snug ${isCo ? 'text-white/65' : 'text-slate'}`}>{node.sub}</span>
          </span>
        </div>
        {!person ? (
          <div className="mt-2.5 flex items-end justify-between gap-2">
            <div>
              <div className="num text-lg font-semibold leading-none">{m.headcount}</div>
              <div className={`text-[10px] ${isCo ? 'text-white/60' : 'text-slate'}`}>people · {m.pct.toFixed(m.pct < 10 ? 1 : 0)}%</div>
            </div>
            <Spark m={m} dark={isCo} />
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate">
            <span className="rounded bg-cloud px-1.5 py-0.5">{node.person?.mode}</span>
            {node.person?.status === 'On leave' ? <span className="font-semibold text-warn">On leave</span> : hasKids ? <span>{m.headcount - 1} below</span> : <span>{node.person?.branch.replace(/ (Office|HQ)$/, '')}</span>}
          </div>
        )}
        {!person && (
          <div className={`mt-2 h-1 overflow-hidden rounded-full ${isCo ? 'bg-white/15' : 'bg-cloud'}`}><div className={`org-bar h-full rounded-full ${isCo ? 'bg-mint' : 'bg-teal'}`} style={{ width: `${Math.max(3, m.pct)}%`, animationDelay: `${delay + 250}ms` }} /></div>
        )}
      </button>
      {hasKids && (
        <button
          type="button"
          onClick={() => ctx.toggle(node.id)}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${node.label}, ${node.children.length} ${node.children.length === 1 ? 'unit' : 'units'}`}
          className={`absolute -bottom-3 left-1/2 z-10 flex h-6 -translate-x-1/2 items-center gap-0.5 rounded-full border bg-white px-1.5 text-[10px] font-semibold text-teal shadow transition-all duration-300 hover:scale-110 hover:border-teal hover:bg-teal hover:text-white focus-visible:ring-2 focus-visible:ring-teal ${open ? 'border-teal/50' : 'border-line'}`}
        >
          <ChevronDown size={12} className={`transition-transform duration-300 ${open ? '' : '-rotate-90'}`} />
          {node.children.length}
        </button>
      )}
      {/* depth reserved for future styling */}
      <span className="hidden" data-depth={depth} />
    </div>
  )
}

function TreeBranch({ node, depth, delay }: { node: ONode; depth: number; delay: number }) {
  const ctx = useContext(OrgCtx)
  const open = ctx.isOpen(node.id)
  const mounted = useRef(false)
  if (open) mounted.current = true
  const kidsInPath = node.children.some((c) => ctx.path.has(c.id))
  return (
    <div className="flex flex-col items-center">
      <NodeCard node={node} depth={depth} delay={delay} />
      {node.children.length > 0 && (
        <div className={`grid w-full transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(.4,0,.2,1)] ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} inert={!open}>
          <div className="min-h-0 overflow-hidden">
            {mounted.current && (
              <div className="flex flex-col items-center pb-3">
                <div className={`org-y mx-auto h-7 w-[2px] origin-top transition-colors duration-300 ${kidsInPath ? 'bg-teal' : 'bg-line'}`} style={{ animationDelay: `${delay + 200}ms` }} />
                <div className="flex justify-center">
                  {node.children.map((c, i, a) => {
                    const hot = ctx.path.has(c.id)
                    const first = i === 0, last = i === a.length - 1
                    return (
                      <div key={c.id} className="relative flex flex-col items-center px-2 pt-6">
                        {a.length > 1 && (
                          <span
                            className={`org-x absolute top-0 h-[2px] transition-colors duration-300 ${hot ? 'z-[1] bg-teal' : 'bg-line'} ${first ? 'left-1/2 right-0 origin-left' : last ? 'left-0 right-1/2 origin-right' : 'left-0 right-0 origin-center'}`}
                            style={{ animationDelay: `${delay + 350}ms` }}
                          />
                        )}
                        <span className={`org-y absolute left-1/2 top-0 -ml-px h-6 w-[2px] origin-top transition-colors duration-300 ${hot ? 'z-[1] bg-teal' : 'bg-line'}`} style={{ animationDelay: `${delay + 450}ms` }} />
                        <TreeBranch node={c} depth={depth + 1} delay={delay + 500 + Math.min(i, 8) * 55} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- indented list ---------- */
function ListRow({ node, depth }: { node: ONode; depth: number }) {
  const ctx = useContext(OrgCtx)
  const m = ctx.metrics(node)
  const open = ctx.isOpen(node.id)
  const mounted = useRef(false)
  if (open) mounted.current = true
  const hasKids = node.children.length > 0
  const k = KIND[node.kind]
  const sel = ctx.selected === node.id
  const dim = ctx.query && !ctx.related.has(node.id)
  return (
    <div>
      <div className={`org-rise group flex items-center gap-2 rounded-lg border-l-2 py-1.5 pr-2 transition-all duration-200 hover:bg-softmint/60 ${sel || ctx.path.has(node.id) ? 'border-teal bg-softmint/50' : 'border-transparent'} ${ctx.matches.has(node.id) ? 'bg-mint/20' : ''} ${dim ? 'opacity-40' : ''}`} style={{ paddingLeft: 6 + depth * 18, animationDelay: `${Math.min(depth, 6) * 60}ms` }} data-org-id={node.id}>
        <button type="button" disabled={!hasKids} onClick={() => ctx.toggle(node.id)} aria-expanded={hasKids ? open : undefined} aria-label={hasKids ? `${open ? 'Collapse' : 'Expand'} ${node.label}` : undefined} className="flex size-6 shrink-0 items-center justify-center rounded text-slate transition hover:bg-white hover:text-teal disabled:opacity-0">
          <ChevronRight size={15} className={`transition-transform duration-300 ${open ? 'rotate-90' : ''}`} />
        </button>
        <button type="button" onClick={() => ctx.select(node.id)} aria-describedby="org-hover" onMouseEnter={(e) => ctx.showHover(node, e.currentTarget)} onMouseLeave={ctx.hideHover} onFocus={(e) => ctx.showHover(node, e.currentTarget)} onBlur={ctx.hideHover} className="flex min-w-0 flex-1 items-center gap-2.5 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-teal">
          {node.person ? <Avatar name={node.person.name} size={28} /> : <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${k.chip}`}>{k.icon}</span>}
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{node.label}</span><span className="block truncate text-xs text-slate">{node.sub}</span></span>
        </button>
        {node.kind !== 'person' || hasKids ? (
          <>
            <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-cloud sm:block"><span className="org-bar block h-full rounded-full bg-teal" style={{ width: `${Math.max(3, m.pct)}%` }} /></span>
            <span className="num w-14 text-right text-xs text-slate"><b className="text-ink">{m.headcount}</b> ppl</span>
          </>
        ) : <Badge tone={node.person?.status === 'On leave' ? 'amber' : 'gray'}>{node.person?.mode}</Badge>}
      </div>
      {hasKids && (
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} inert={!open}>
          <div className="min-h-0 overflow-hidden">
            {mounted.current && <div className="">{node.children.map((c) => <ListRow key={c.id} node={c} depth={depth + 1} />)}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- detail panel ---------- */
function Detail({ node, ctx, onPick }: { node: ONode; ctx: Ctx; onPick: (id: string) => void }) {
  const m = ctx.metrics(node)
  const k = KIND[node.kind]
  const tiles: [string, string][] = [['Headcount', String(m.headcount)], ['Open roles', String(m.vacancies)], ['Span of control', String(m.span)], ['Of company', `${m.pct.toFixed(1)}%`], ['In today', `${m.present}/${m.headcount}`], ['Avg tenure', `${m.avgTenure.toFixed(1)} yrs`]]
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {node.person ? <Avatar name={node.person.name} size={44} /> : <span className={`flex size-11 items-center justify-center rounded-xl ${k.chip.replace('text-mint', 'text-teal')}`}>{k.icon}</span>}
        <div className="min-w-0"><div className="font-display text-lg font-semibold leading-tight">{node.label}</div><div className="text-sm text-slate">{node.sub}</div></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(([l, v]) => <div key={l} className="org-rise rounded-lg border border-line bg-cloud p-2.5"><div className="num text-lg font-semibold">{v}</div><div className="text-[11px] text-slate">{l}</div></div>)}
      </div>
      <div className="rounded-lg border border-line p-3 text-sm">
        <div className="flex justify-between"><span className="text-slate">{node.kind === 'person' ? 'Reports to' : 'Lead'}</span><b>{node.kind === 'person' ? node.manager : node.head?.name ?? node.manager}</b></div>
        <div className="mt-1.5 flex justify-between"><span className="text-slate">Cost centres</span><b className="text-right">{m.costCentres.slice(0, 3).join(', ') || '—'}{m.costCentres.length > 3 ? ` +${m.costCentres.length - 3}` : ''}</b></div>
        <div className="mt-1.5 flex justify-between"><span className="text-slate">Monthly payroll / band</span>{ctx.canPay ? <b>{ngn(m.payroll)} · {m.headcount ? `${ngn(m.minSal)}–${ngn(m.maxSal)}` : '—'}</b> : <span className="flex items-center gap-1 text-slate"><Lock size={12} /> Restricted</span>}</div>
      </div>
      {m.headcount > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate">People by branch</div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.branchDist.slice(0, 5)} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={86} tick={{ fontSize: 10, fill: '#60777d' }} axisLine={false} tickLine={false} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
                  <Tooltip cursor={{ fill: '#F7F9F8' }} contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#d8e2e3' }} />
                  <Bar dataKey="count" name="People" fill="#087E8B" radius={[0, 4, 4, 0]} animationDuration={900} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate">Work mode</div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={m.modeMix} dataKey="count" nameKey="name" innerRadius={34} outerRadius={58} paddingAngle={2} animationDuration={900}>{m.modeMix.map((d) => <Cell key={d.name} fill={MODE_COLOR[d.name] ?? '#60777d'} />)}</Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#d8e2e3' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-slate">{m.modeMix.map((d) => <span key={d.name} className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: MODE_COLOR[d.name] }} />{d.name} {d.count}</span>)}</div>
          </div>
        </div>
      )}
      {node.children.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate">{node.kind === 'person' ? 'Direct reports' : 'Sub-units'} ({node.children.length})</div>
          <div className="space-y-1.5">{node.children.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c.id)} className="flex w-full items-center gap-2.5 rounded-lg border border-line p-2 text-left transition hover:border-teal hover:bg-softmint/50">
              {c.person ? <Avatar name={c.person.name} size={28} /> : <span className={`flex size-7 items-center justify-center rounded-lg ${KIND[c.kind].chip}`}>{KIND[c.kind].icon}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{c.label}</span><span className="block truncate text-xs text-slate">{c.sub}</span></span>
              <span className="num text-xs text-slate">{c.members.length}</span><ChevronRight size={14} className="text-slate" />
            </button>
          ))}</div>
        </div>
      )}
      {node.members.length > 0 && node.kind !== 'person' && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate">Members ({node.members.length})</div>
          <div className="divide-y divide-line rounded-lg border border-line">{node.members.slice(0, 40).map((e) => (
            <div key={e.id} className="flex items-center gap-2.5 px-3 py-2"><Avatar name={e.name} size={28} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{e.name}</span><span className="block truncate text-xs text-slate">{e.role} · {e.branch}</span></span><Badge>{e.status}</Badge></div>
          ))}</div>
        </div>
      )}
    </div>
  )
}

/* ---------- main explorer ---------- */
const GROUPS: Group[] = ['Reporting line', 'By department', 'By branch']

export default function OrgExplorer({ employees, departments, branches, company, canPay }: { employees: Employee[]; departments: Dept[]; branches: Br[]; company: string; canPay: boolean }) {
  const mobile = useMedia('(max-width: 767px)')
  const [group, setGroup] = useState<Group>('By department')
  const [mode, setMode] = useState<'tree' | 'list'>('tree')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['root']))
  const [selected, setSelected] = useState<string | null>(null)
  const [panel, setPanel] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [hover, setHover] = useState<{ node: ONode; el: HTMLElement } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const timers = useRef<{ show?: number; hide?: number }>({})
  const view = mobile ? 'list' : mode

  const sig = `${group}|${employees.length}|${departments.length}|${branches.length}|${company}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tree = useMemo(() => buildTree(group, employees, departments, branches, company), [sig])
  const flat = useMemo(() => flatten(tree), [tree])
  const total = employees.length
  const metricCache = useRef(new Map<string, Metrics>())
  useMemo(() => { metricCache.current = new Map() }, [tree])
  const metrics = useCallback((n: ONode) => {
    let v = metricCache.current.get(n.id)
    if (!v) { v = metricsFor(n, total); metricCache.current.set(n.id, v) }
    return v
  }, [total])

  useEffect(() => {
    setExpanded(new Set(group === 'Reporting line' ? ['root', ...tree.children.map((c) => c.id)] : ['root']))
    setSelected(null)
  }, [tree, group])

  const q = query.trim().toLowerCase()
  const { matches, related, forced } = useMemo(() => {
    const matches = new Set<string>(), related = new Set<string>(), forced = new Set<string>()
    if (!q) return { matches, related, forced }
    flat.forEach(({ node }, id) => {
      const hay = node.kind === 'person' ? `${node.label} ${node.sub} ${node.person?.dept} ${node.person?.branch}` : `${node.label} ${node.head?.name ?? ''}`
      if (hay.toLowerCase().includes(q)) {
        matches.add(id); related.add(id)
        ancestorsOf(flat, id).forEach((a) => { related.add(a); forced.add(a) })
      }
    })
    return { matches, related, forced }
  }, [q, flat])

  const path = useMemo(() => (selected ? new Set([selected, ...ancestorsOf(flat, selected)]) : new Set<string>()), [selected, flat])
  const isOpen = useCallback((id: string) => expanded.has(id) || forced.has(id), [expanded, forced])
  const toggle = useCallback((id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }), [])

  const hideHover = useCallback(() => {
    window.clearTimeout(timers.current.show)
    timers.current.hide = window.setTimeout(() => setHover(null), 60)
  }, [])
  const showHover = useCallback((node: ONode, el: HTMLElement) => {
    window.clearTimeout(timers.current.hide)
    window.clearTimeout(timers.current.show)
    timers.current.show = window.setTimeout(() => setHover({ node, el }), 90)
  }, [])
  useEffect(() => {
    const off = () => setHover(null)
    window.addEventListener('scroll', off, true)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setHover(null)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('scroll', off, true); window.removeEventListener('keydown', esc) }
  }, [])

  const select = useCallback((id: string) => {
    setSelected(id)
    setPanel(true)
    setHover(null)
    setExpanded((s) => { const n = new Set(s); ancestorsOf(flat, id).forEach((a) => n.add(a)); return n })
  }, [flat])

  const expandAll = () => setExpanded(new Set([...flat.values()].filter((f) => f.node.children.length).map((f) => f.node.id)))
  const collapseAll = () => setExpanded(new Set(['root']))

  // jump to first search match
  useEffect(() => {
    if (!q || !matches.size) return
    const id = [...matches][0]
    const t = window.setTimeout(() => document.querySelector(`[data-org-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced() ? 'auto' : 'smooth' }), 650)
    return () => window.clearTimeout(t)
  }, [q, matches])

  // drag to pan with a mouse
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null)
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || (e.target as HTMLElement).closest('button')) return
    const s = scroller.current!
    drag.current = { x: e.clientX, y: e.clientY, l: s.scrollLeft, t: s.scrollTop }
    s.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    scroller.current!.scrollLeft = d.l - (e.clientX - d.x)
    scroller.current!.scrollTop = d.t - (e.clientY - d.y)
  }

  const ctx: Ctx = { total, canPay, isOpen, toggle, select, selected, path, matches, related, query: q, showHover, hideHover, metrics }
  const co = metrics(tree)
  const depts = new Set(employees.map((e) => e.dept)).size
  const depCount = Math.max(depts, departments.length)
  const branchCount = Math.max(new Set(employees.map((e) => e.branch)).size, branches.length)
  const span = useMemo(() => avgSpan(employees), [employees])
  const kpis = [
    { l: 'Total headcount', v: total, d: 0, s: `${co.present} in today`, icon: <UsersRound size={18} /> },
    { l: 'Departments', v: depCount, d: 0, s: 'Across the company', icon: <Network size={18} /> },
    { l: 'Branches', v: branchCount, d: 0, s: 'Locations', icon: <MapPin size={18} /> },
    { l: 'Avg span of control', v: span, d: 1, s: 'Direct reports per manager', icon: <Share2 size={18} /> },
    { l: 'Open roles', v: vacanciesFor(tree, total), d: 0, s: 'Approved vacancies', icon: <UserRound size={18} /> },
    { l: 'Remote / hybrid', v: co.remotePct, d: 0, s: `${co.remote} people`, suffix: '%', icon: <Home size={18} /> },
  ]
  const selNode = selected ? flat.get(selected)?.node : undefined

  return (
    <div className="space-y-4">
      <style>{KEYFRAMES}</style>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k, i) => (
          <div key={k.l} className="org-rise group rounded-xl border border-line bg-white p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-teal/50 hover:shadow-[0_12px_28px_-14px_rgba(8,126,139,.5)]" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex items-center justify-between text-slate"><span className="text-xs">{k.l}</span><span className="flex size-7 items-center justify-center rounded-lg bg-softmint text-teal transition-transform duration-300 group-hover:scale-110">{k.icon}</span></div>
            <div className="num mt-1.5 font-display text-2xl font-semibold text-ink"><CountUp to={k.v} decimals={k.d} suffix={k.suffix} /></div>
            <div className="truncate text-[11px] text-slate">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person, role or department" aria-label="Search the organisation" className="h-9 w-full rounded-md border border-line bg-white pl-9 pr-8 text-sm placeholder:text-slate/70 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate hover:text-ink"><X size={14} /></button>}
          </label>
          {q && <span className="text-xs text-slate" aria-live="polite">{matches.size} {matches.size === 1 ? 'match' : 'matches'}</span>}
          <div role="group" aria-label="Group chart by" className="flex rounded-lg bg-cloud p-0.5">
            {GROUPS.map((g) => <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all ${group === g ? 'bg-white text-teal shadow-sm' : 'text-slate hover:text-ink'}`}>{g}</button>)}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div role="group" aria-label="View" className="hidden rounded-lg bg-cloud p-0.5 md:flex">
              {([['tree', 'Tree chart', <Network key="t" size={14} />], ['list', 'Indented list', <List key="l" size={14} />]] as const).map(([v, l, ic]) => (
                <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all ${mode === v ? 'bg-white text-teal shadow-sm' : 'text-slate hover:text-ink'}`}>{ic}{l}</button>
              ))}
            </div>
            <button type="button" onClick={expandAll} className="flex h-9 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-semibold text-ink transition hover:border-teal hover:text-teal"><ChevronsUpDown size={14} />Expand all</button>
            <button type="button" onClick={collapseAll} className="flex h-9 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-semibold text-ink transition hover:border-teal hover:text-teal"><ChevronsDownUp size={14} />Collapse all</button>
            {view === 'tree' && (
              <div className="flex items-center rounded-md border border-line" role="group" aria-label="Zoom">
                <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} className="flex size-9 items-center justify-center text-slate hover:text-teal"><Minus size={14} /></button>
                <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom" className="num w-11 text-xs font-semibold">{Math.round(zoom * 100)}%</button>
                <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))} className="flex size-9 items-center justify-center text-slate hover:text-teal"><Plus size={14} /></button>
              </div>
            )}
          </div>
        </div>

        <div
          ref={scroller}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => { drag.current = null }}
          onPointerCancel={() => { drag.current = null }}
          className={`relative max-h-[72vh] min-h-[420px] overflow-auto rounded-b-2xl ${view === 'tree' ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={view === 'tree' ? { backgroundImage: 'radial-gradient(circle, #d8e2e3 1px, transparent 1px)', backgroundSize: '22px 22px', backgroundColor: '#F7F9F8' } : undefined}
          tabIndex={0}
          aria-label={view === 'tree' ? 'Organisation chart, scrollable' : 'Organisation list'}
        >
          <OrgCtx.Provider value={ctx}>
            {view === 'tree' ? (
              <div className="flex w-max min-w-full justify-center p-8 pb-12" style={{ zoom }}>
                <TreeBranch key={group} node={tree} depth={0} delay={0} />
              </div>
            ) : (
              <div className="p-3 sm:p-4"><ListRow key={group} node={tree} depth={0} /></div>
            )}
          </OrgCtx.Provider>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[11px] text-slate">
          {(['company', 'branch', 'dept', 'team', 'person'] as Kind[]).map((k) => <span key={k} className="flex items-center gap-1.5"><span className={`flex size-5 items-center justify-center rounded ${KIND[k].chip.replace('text-mint', 'text-teal').replace('bg-mint/20', 'bg-midnight')}`}>{KIND[k].icon}</span>{KIND[k].label}</span>)}
          <span className="ml-auto hidden md:inline">Drag to pan · hover or focus a node for insights · click to open details</span>
          {selected && <button type="button" onClick={() => setSelected(null)} className="font-semibold text-teal hover:underline">Clear highlight</button>}
        </div>
      </div>

      {hover && <HoverCard key={hover.node.id} node={hover.node} el={hover.el} ctx={ctx} />}

      <Overlay open={panel && !!selNode} onClose={() => setPanel(false)} title={selNode ? KIND[selNode.kind].label : 'Details'} side wide>
        {selNode && <Detail node={selNode} ctx={ctx} onPick={select} />}
      </Overlay>
    </div>
  )
}
