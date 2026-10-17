import { Link } from 'react-router'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { RO_REASON, WRITE_VERB, roText, useReadOnly, useRoAllowed } from '../platform/readOnly'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'

const LOGO_RATIO = 1501 / 364

export function Logo({ dark = false, size = 22, tagline = false }: { dark?: boolean; size?: number; tagline?: boolean }) {
  return (
    <img
      src={`/brand/bizflow-logo${tagline ? '-tagline' : ''}${dark ? '-dark' : ''}.png`}
      alt="BizFlow"
      width={Math.round(size * LOGO_RATIO)}
      height={size}
      className="block"
    />
  )
}

export function LogoMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return <img src="/brand/bizflow-mark.png" alt="BizFlow" width={size} height={size} className={`block shrink-0 ${className}`} />
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  v?: 'primary' | 'secondary' | 'ghost' | 'mint' | 'dark'
  s?: 'sm' | 'md' | 'lg'
  to?: string
}
/** Write actions are disabled with an explanation while a workspace is in its offboarding grace period. */
function GuardedButton({ cls, p, children }: { cls: string; p: React.ButtonHTMLAttributes<HTMLButtonElement>; children: React.ReactNode }) {
  const ro = useReadOnly()
  const allowed = useRoAllowed()
  const blocked = ro && !allowed && !p.disabled && (p.type === 'submit' || WRITE_VERB.test(roText(children)))
  if (!blocked) return <button className={cls} {...p}>{children}</button>
  return <button className={`${cls} cursor-not-allowed opacity-50`} {...p} disabled aria-disabled="true" title={RO_REASON}>{children}</button>
}

export function Btn({ v = 'primary', s = 'md', to, className = '', children, ...p }: BtnProps) {
  const base = 'inline-flex max-w-full items-center justify-center gap-2 font-semibold rounded-md transition-colors whitespace-normal text-center sm:whitespace-nowrap cursor-pointer disabled:opacity-50'
  const size = { sm: 'min-h-8 px-3 py-1 text-[13px]', md: 'min-h-10 px-4 py-1.5 text-sm', lg: 'min-h-12 px-5 py-2 text-[15px] sm:px-6' }[s]
  const vv = {
    primary: 'bg-teal text-white hover:bg-teal-600',
    secondary: 'bg-white text-ink border border-line hover:bg-cloud',
    ghost: 'text-ink hover:bg-ink/5',
    mint: 'bg-mint text-midnight hover:bg-[#5be0cd]',
    dark: 'bg-midnight text-white hover:bg-midnight-2',
  }[v]
  const cls = `${base} ${size} ${vv} ${className}`
  if (to) return <Link to={to} className={cls} onClick={p.onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}>{children}</Link>
  return <GuardedButton cls={cls} p={p}>{children}</GuardedButton>
}

const TONES: Record<string, string> = {
  green: 'bg-green-50 text-green-700 before:bg-ok',
  amber: 'bg-amber-50 text-amber-800 before:bg-warn',
  red: 'bg-red-50 text-red-700 before:bg-err',
  blue: 'bg-blue-50 text-blue-700 before:bg-info',
  teal: 'bg-softmint text-teal-600 before:bg-teal',
  gray: 'bg-ink/5 text-slate before:bg-slate',
}
const STATUS_TONE: Record<string, string> = {
  Active: 'green', Approved: 'green', Signed: 'green', Completed: 'green', Assigned: 'teal', Posted: 'green', Paid: 'green', Won: 'green', Excellent: 'green', Good: 'green',
  Pending: 'amber', 'Pending Approval': 'amber', 'In Progress': 'blue', Maintenance: 'amber', 'Service due': 'amber', Fair: 'amber', High: 'red', Onboarding: 'blue',
  Rejected: 'red', Overdue: 'red', Declined: 'red', 'On leave': 'gray', Draft: 'gray', Locked: 'gray', 'In stock': 'gray', Normal: 'gray', Low: 'gray', Remote: 'blue', Viewed: 'blue', Sent: 'blue', Created: 'gray', Reversed: 'red',
}
export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const t = tone ?? STATUS_TONE[String(children)] ?? 'gray'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[12px] font-semibold before:size-1.5 before:rounded-full ${TONES[t]}`}>
      {children}
    </span>
  )
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const i = name.split(' ').map((x) => x[0]).slice(0, 2).join('')
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 4
  const bg = ['#DDF7F3', '#E3EEF9', '#F6EBD4', '#E8E4F3'][hue]
  return (
    <span style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }} className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-midnight">
      {i}
    </span>
  )
}

export function PageHeader({ eyebrow, title, desc, actions }: { eyebrow?: string; title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="hero-header mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-teal">{eyebrow}</div>}
        <h1 className="break-words text-2xl font-semibold leading-tight text-ink sm:text-[28px]">{title}</h1>
        {desc && <p className="mt-1 max-w-2xl text-sm text-slate">{desc}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </div>
  )
}

export function Panel({ title, action, children, className = '', pad = true, onClick }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean; onClick?: () => void }) {
  return (
    <section {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } } : {})} className={`glass-panel rounded-xl border border-line bg-white ${className}`}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="min-w-0 font-sans text-[14px] font-semibold tracking-normal text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={pad ? 'p-4 sm:p-5' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, delta, up = true, sub }: { label: string; value: string; delta?: string; up?: boolean; sub?: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate">{label}</div>
      <div className="num mt-1 font-display text-[26px] font-semibold leading-none text-ink">{value}</div>
      {(delta || sub) && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {delta && <span className={`num font-semibold ${up ? 'text-ok' : 'text-err'}`}>{up ? '▲' : '▼'} {delta}</span>}
          {sub && <span className="text-slate">{sub}</span>}
        </div>
      )}
    </div>
  )
}

const textOf = (n: ReactNode): string => {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(textOf).join(' ')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return textOf((n as any).props?.children)
}
const sortKey = (n: ReactNode) => {
  const t = textOf(n).trim()
  const num = parseFloat(t.replace(/[₦,\s%]/g, '').replace(/^\((.*)\)$/, '-$1'))
  return /^[-₦(]?[\d,.]+/.test(t) && !isNaN(num) ? num : t.toLowerCase()
}

const STATUS_HEAD = /^(status|stage|state|priority|risk|result)$/i

function TableCard({ r, head, right, selected, onSelect }: { r: ReactNode[]; head: string[]; right: number[]; selected: boolean; onSelect?: () => void }) {
  const [more, setMore] = useState(false)
  const last = r.length - 1
  const moneyIdx = right.includes(last) && r.length > 2 ? last : -1
  const statusIdx = head.findIndex((h, i) => i > 0 && i !== moneyIdx && STATUS_HEAD.test(h))
  const fields = r.map((c, j) => ({ c, j })).filter(({ j }) => j !== 0 && j !== moneyIdx && j !== statusIdx)
  const shown = more ? fields : fields.slice(0, 4)
  return (
    <li className={`rounded-xl border bg-white p-3.5 shadow-[0_1px_0_rgba(11,37,48,.03)] ${selected ? 'border-teal bg-softmint/40' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        {onSelect && <input type="checkbox" aria-label="Select row" checked={selected} onChange={onSelect} className="mt-0.5 size-5 shrink-0 rounded border-line accent-teal" />}
        <div className="min-w-0 flex-1 break-words text-[15px] font-semibold leading-snug text-ink">{r[0]}</div>
        {moneyIdx >= 0 && <div className="num max-w-[45%] shrink-0 break-words text-right text-[15px] font-semibold leading-snug text-ink">{r[moneyIdx]}</div>}
      </div>
      {statusIdx > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">{r[statusIdx]}</div>}
      {shown.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line/70 pt-3 text-[13px]">
          {shown.map(({ c, j }) => (
            <div key={j} className={`min-w-0 ${head[j] ? '' : 'col-span-2'}`}>
              {head[j] && <dt className="text-[11px] font-medium text-slate">{head[j]}</dt>}
              <dd className="num mt-0.5 min-w-0 break-words leading-snug text-ink">{c}</dd>
            </div>
          ))}
        </dl>
      )}
      {fields.length > 4 && <button onClick={() => setMore(!more)} aria-expanded={more} className="mt-3 flex min-h-9 w-full cursor-pointer items-center justify-center gap-1 rounded-md bg-cloud text-xs font-semibold text-teal">{more ? 'Show less' : `Show ${fields.length - 4} more`}<ChevronRight size={14} className={`transition-transform ${more ? '-rotate-90' : 'rotate-90'}`} /></button>}
    </li>
  )
}

export function Table({ head, rows, right = [], pageSize = 8, selectable = false, label = 'Data table', tips }: { head: string[]; rows: ReactNode[][]; right?: number[]; pageSize?: number; selectable?: boolean; label?: string; tips?: Record<string, string> }) {
  const [sort, setSort] = useState<{ c: number; d: 1 | -1 } | null>(null)
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const toast = useToast()
  const sorted = useMemo(() => {
    const idx = rows.map((r, i) => ({ r, i }))
    if (!sort) return idx
    return idx.sort((a, b) => {
      const x = sortKey(a.r[sort.c]), y = sortKey(b.r[sort.c])
      return (x < y ? -1 : x > y ? 1 : 0) * sort.d
    })
  }, [rows, sort])
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const cur = Math.min(page, pages - 1)
  const view = sorted.slice(cur * pageSize, cur * pageSize + pageSize)
  const allOn = view.length > 0 && view.every((v) => sel.has(v.i))
  const togglePage = () => {
    const next = new Set(sel)
    view.forEach(({ i }) => allOn ? next.delete(i) : next.add(i))
    setSel(next)
  }
  return (
    <div className="data-table bg-white/70">
      {selectable && sel.size > 0 && (
        <div className="flex items-center gap-3 border-b border-teal/20 bg-softmint/70 px-5 py-2.5 text-[13px]" role="status">
          <b>{sel.size} selected</b>
          <button className="cursor-pointer font-semibold text-teal" onClick={() => toast(`Exported ${sel.size} records`)}>Export</button>
          <button className="cursor-pointer text-slate" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <div className="sm:hidden">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-cloud/60 px-3 py-2 text-xs text-slate">
          <span className="num">{sorted.length} record{sorted.length === 1 ? '' : 's'}</span>
          <label className="flex items-center gap-1.5">Sort
            <select aria-label="Sort by" value={sort ? sort.c : ''} onChange={(e) => setSort(e.target.value === '' ? null : { c: Number(e.target.value), d: sort?.d ?? 1 })} className="min-h-9 max-w-[9rem] rounded-md border border-line bg-white px-2 text-xs text-ink">
              <option value="">Default</option>
              {head.map((h, i) => h && <option key={h} value={i}>{h}</option>)}
            </select>
            <button aria-label="Reverse sort" onClick={() => setSort(sort ? { ...sort, d: sort.d === 1 ? -1 : 1 } : null)} disabled={!sort} className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-line bg-white disabled:opacity-40">{sort?.d === -1 ? <ArrowDown size={14} /> : <ArrowUp size={14} />}</button>
          </label>
        </div>
        {view.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate">No records to display.</p>}
        <ul aria-label={label} className="space-y-2.5 bg-cloud/60 p-3">
          {view.map(({ r, i }) => (
            <TableCard key={i} r={r} head={head} right={right} selected={sel.has(i)} onSelect={selectable ? () => { const n = new Set(sel); n.has(i) ? n.delete(i) : n.add(i); setSel(n) } : undefined} />
          ))}
        </ul>
      </div>
      <div className="max-h-[70dvh] overflow-auto overscroll-contain max-sm:hidden">
        <table className="w-full min-w-max text-left text-[13.5px]" aria-label={label}>
          <thead className="sticky top-0 z-10 bg-cloud/95 backdrop-blur">
            <tr className="border-b border-line text-xs text-slate">
              {selectable && <th className="w-10 pl-5"><input type="checkbox" aria-label="Select all on page" checked={allOn} onChange={togglePage} className="size-4 rounded border-line accent-teal" /></th>}
              {head.map((h, i) => (
                <th key={h} scope="col" aria-sort={sort?.c === i ? (sort.d === 1 ? 'ascending' : 'descending') : 'none'} className={`px-3 py-3 font-semibold sm:px-5 ${right.includes(i) ? 'text-right' : ''}`}>
                  <button title={tips?.[h]} aria-label={tips?.[h] ? `${h}. ${tips[h]}` : undefined} className={`group inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap hover:text-ink ${right.includes(i) ? 'flex-row-reverse' : ''} ${tips?.[h] ? 'underline decoration-dotted decoration-slate/50 underline-offset-4' : ''}`} onClick={() => setSort(sort?.c === i ? (sort.d === 1 ? { c: i, d: -1 } : null) : { c: i, d: 1 })}>
                    {h}
                    {sort?.c === i
                      ? sort.d === 1 ? <ArrowUp size={13} className="text-teal" /> : <ArrowDown size={13} className="text-teal" />
                      : <ArrowUpDown size={13} className="opacity-0 transition-opacity group-hover:opacity-50 group-focus-visible:opacity-50" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr><td colSpan={head.length + (selectable ? 1 : 0)} className="px-5 py-12 text-center text-sm text-slate">No records to display.</td></tr>
            )}
            {view.map(({ r, i }) => (
              <tr key={i} className={`border-b border-line/60 last:border-0 hover:bg-softmint/25 ${sel.has(i) ? 'bg-softmint/50' : 'even:bg-cloud/35'}`}>
                {selectable && <td className="pl-5"><input type="checkbox" aria-label="Select row" checked={sel.has(i)} onChange={() => { const n = new Set(sel); n.has(i) ? n.delete(i) : n.add(i); setSel(n) }} className="size-4 rounded border-line accent-teal" /></td>}
                {r.map((c, j) => (
                  <td key={j} className={`num px-3 py-3 align-middle sm:px-5 sm:py-3.5 ${right.includes(j) ? 'text-right' : ''}`}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-cloud/50 px-3 py-3 text-[13px] text-slate sm:px-5">
          <span className="num">Showing {cur * pageSize + 1}–{Math.min(sorted.length, (cur + 1) * pageSize)} of {sorted.length}</span>
          <span className="flex items-center gap-2">
            <span className="num mr-1 hidden sm:inline">Page {cur + 1} of {pages}</span>
            <button aria-label="Previous page" disabled={cur === 0} onClick={() => setPage(cur - 1)} className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-line bg-white text-ink hover:border-teal disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button aria-label="Next page" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="flex size-8 cursor-pointer items-center justify-center rounded-md border border-line bg-white text-ink hover:border-teal disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={15} /></button>
          </span>
        </div>
      )}
    </div>
  )
}

export function Fold({ title, hint, defaultOpen = false, children }: { title: string; hint?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className={`flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 text-left sm:hidden ${open ? 'mb-3' : ''}`}>
        <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{title}</span>{hint && <span className="block truncate text-xs text-slate">{hint}</span>}</span>
        <ChevronRight size={18} className={`shrink-0 text-slate transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      <div className={open ? '' : 'max-sm:hidden'}>{children}</div>
    </section>
  )
}

export function Timeline({ items }: { items: { t: string; a: string; x: string }[] }) {
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {items.map((i, k) => (
        <li key={k} className="relative">
          <span className={`absolute -left-[26px] top-1.5 size-2.5 rounded-full border-2 border-white ${k === 0 ? 'bg-teal' : 'bg-line'}`} />
          <div className="text-sm text-ink"><b className="font-semibold">{i.a}</b> {i.x}</div>
          <div className="num text-xs text-slate">{i.t}</div>
        </li>
      ))}
    </ol>
  )
}

export function Stepper({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${i < at ? 'bg-teal text-white' : i === at ? 'bg-midnight text-white' : 'bg-ink/10 text-slate'}`}>{i < at ? '✓' : i + 1}</span>
          <span className={`text-[13px] font-medium ${i === at ? 'text-ink' : 'text-slate'}`}>{s}</span>
          {i < steps.length - 1 && <span className={`h-px w-6 ${i < at ? 'bg-teal' : 'bg-line'}`} />}
        </li>
      ))}
    </ol>
  )
}

export function Tabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (t: string) => void }) {
  return (
    <div role="tablist" className="flex gap-4 overflow-x-auto overscroll-x-contain border-b border-line sm:gap-6">
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={value === t} onClick={() => onChange(t)} className={`-mb-px cursor-pointer whitespace-nowrap border-b-2 pb-2.5 text-sm font-semibold transition-colors ${value === t ? 'border-teal text-ink' : 'border-transparent text-slate hover:text-ink'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate">{hint}</span>}
    </label>
  )
}
export const inputCls = 'h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-slate/70 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20'

export function Flow({ steps, dark = false }: { steps: string[]; dark?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-y-3">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <span className={`rounded-md border px-3 py-1.5 text-[13px] font-semibold ${dark ? 'border-white/15 bg-white/5 text-white' : 'border-line bg-white text-ink'}`}>{s}</span>
          {i < steps.length - 1 && (
            <svg width="28" height="10" className="mx-1"><line x1="0" y1="5" x2="24" y2="5" stroke="#35D0BA" strokeWidth="1.5" className="flow-line" /><path d="M22 1l5 4-5 4" fill="none" stroke="#35D0BA" strokeWidth="1.5" /></svg>
          )}
        </div>
      ))}
    </div>
  )
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext<(msg: string, tone?: 'ok' | 'err') => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; tone: string }[]>([])
  const push = (msg: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, msg, tone }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000)
  }
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="safe-toast pointer-events-none fixed inset-x-3 z-[80] flex flex-col items-center gap-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 lg:left-auto lg:right-6 lg:translate-x-0">
        {items.map((i) => (
          <div key={i.id} role="status" className="reveal pointer-events-auto flex max-w-full items-center gap-3 rounded-md bg-midnight px-4 py-3 text-sm text-white shadow-lg">
            <span className={`flex size-5 items-center justify-center rounded-full text-[11px] font-bold ${i.tone === 'ok' ? 'bg-ok' : 'bg-err'}`}>{i.tone === 'ok' ? '✓' : '!'}</span>{i.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- Overlay (Modal + Drawer) ---------- */
export function Overlay({ open, onClose, title, side = false, wide = false, children, alert = false }: { open: boolean; onClose: () => void; title: string; side?: boolean; wide?: boolean; children: ReactNode; alert?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')
    first?.focus()
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')]
        if (!f.length) return
        const a = f[0], z = f[f.length - 1]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    addEventListener('keydown', h)
    return () => { removeEventListener('keydown', h); prev?.focus() }
  }, [open])
  if (!open) return null
  return (
    <div className={`safe-overlay fixed inset-0 z-[70] flex bg-midnight/45 ${side ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-4'}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={title} className={`reveal max-h-full w-full overflow-y-auto overscroll-contain bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 ${side ? `h-full ${wide ? 'max-w-2xl' : 'max-w-md'}` : 'rounded-t-xl shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-xl'}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button data-close aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 grid size-10 cursor-pointer place-items-center rounded text-slate hover:bg-ink/5">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export type QField = { label: string; type?: 'text' | 'number' | 'date' | 'select' | 'textarea'; options?: string[]; value?: string; required?: boolean }
export function QuickAction({ label, title, fields, submit, done, v = 'primary', s = 'md' }: { label: string; title?: string; fields: QField[]; submit?: string; done: string; v?: BtnProps['v']; s?: BtnProps['s'] }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<Record<string, boolean>>({})
  const toast = useToast()
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const bad: Record<string, boolean> = {}
    fields.forEach((f) => { if (f.required !== false && !String(fd.get(f.label) ?? '').trim()) bad[f.label] = true })
    setErr(bad)
    if (Object.keys(bad).length) return
    setBusy(true)
    setTimeout(() => { setBusy(false); setOpen(false); toast(done) }, 700)
  }
  return (
    <>
      <Btn v={v} s={s} onClick={() => { setErr({}); setOpen(true) }}>{label}</Btn>
      <Overlay open={open} onClose={() => setOpen(false)} title={title ?? label} side>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {fields.map((f) => (
            <Field key={f.label} label={f.label + (f.required === false ? '' : ' *')}>
              {f.type === 'select' ? (
                <select name={f.label} defaultValue={f.value} className={inputCls}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>
              ) : f.type === 'textarea' ? (
                <textarea name={f.label} defaultValue={f.value} rows={3} className={`${inputCls} h-auto py-2`} />
              ) : (
                <input name={f.label} type={f.type ?? 'text'} defaultValue={f.value} aria-invalid={err[f.label]} className={`${inputCls} ${err[f.label] ? 'border-err' : ''}`} />
              )}
              {err[f.label] && <span role="alert" className="mt-1 block text-xs text-err">{f.label} is required.</span>}
            </Field>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Btn type="button" v="secondary" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn type="submit" disabled={busy}>{busy ? 'Saving…' : submit ?? label}</Btn>
          </div>
        </form>
      </Overlay>
    </>
  )
}

export function ExportButton({ name = 'export', head, rows }: { name?: string; head?: string[]; rows?: string[][] }) {
  const toast = useToast()
  return (
    <Btn v="secondary" onClick={() => {
      const csv = [head ?? ['Item', 'Value'], ...(rows ?? [['BizFlow demo export', name]])].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      a.download = `bizflow-${name}.csv`
      a.click()
      toast(`${name} exported as CSV`)
    }}>Export</Btn>
  )
}

export function ConfirmButton({ label, title, body, confirm, done, v = 'primary', s = 'md' }: { label: string; title: string; body: string; confirm: string; done: string; v?: BtnProps['v']; s?: BtnProps['s'] }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  return (
    <>
      <Btn v={v} s={s} onClick={() => setOpen(true)}>{label}</Btn>
      <Overlay open={open} onClose={() => setOpen(false)} title={title} alert>
        <p className="text-sm text-slate">{body}</p>
        <div className="mt-6 flex justify-end gap-2"><Btn v="secondary" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={() => { setOpen(false); toast(done) }}>{confirm}</Btn></div>
      </Overlay>
    </>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-softmint text-teal" aria-hidden>◌</div>
      <div className="font-display text-lg font-semibold">{title}</div>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate">{body}</p>
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Breadcrumb({ items }: { items: [string, string?][] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-xs text-slate">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map(([l, to], i) => (
          <li key={l} className="flex items-center gap-1.5">
            {to ? <Link to={to} className="hover:text-teal">{l}</Link> : <span aria-current="page" className="font-medium text-ink">{l}</span>}
            {i < items.length - 1 && <span aria-hidden>/</span>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="sk h-8 w-64 rounded" />
      <div className="sk h-4 w-96 max-w-full rounded" />
      <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="sk h-20 rounded-lg" />)}</div>
      <div className="sk h-72 rounded-lg" />
    </div>
  )
}
