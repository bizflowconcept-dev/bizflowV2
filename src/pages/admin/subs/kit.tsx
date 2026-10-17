import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { HEALTH_META } from '../../../billing/insights'
import type { HealthBand } from '../../../billing/insights'

export const useReducedMotion = () => {
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)'); if (!mq) return
    const on = () => setR(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on)
  }, [])
  return r
}

/** True one frame after mount, so width/dash transitions animate from empty. */
export const useMounted = () => {
  const [m, setM] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(id) }, [])
  return m
}

export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString('en-US'), ms = 900 }: { value: number; format?: (n: number) => string; ms?: number }) {
  const reduced = useReducedMotion(); const [n, setN] = useState(reduced ? value : 0); const from = useRef(0)
  useEffect(() => {
    if (reduced) { setN(value); from.current = value; return }
    const start = performance.now(); const a = from.current; let id = 0
    const tick = (t: number) => { const p = Math.min(1, (t - start) / ms); const e = 1 - Math.pow(1 - p, 3); setN(a + (value - a) * e); from.current = a + (value - a) * e; if (p < 1) id = requestAnimationFrame(tick) }
    id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id)
  }, [value, ms, reduced])
  return <span className="num">{format(n)}</span>
}

export function Bar({ pct, tone = 'teal', h = 'h-1.5', label, delay = 0 }: { pct: number; tone?: 'teal' | 'warn' | 'err' | 'ok' | 'info'; h?: string; label: string; delay?: number }) {
  const on = useMounted(); const c = { teal: 'bg-teal', warn: 'bg-warn', err: 'bg-err', ok: 'bg-ok', info: 'bg-info' }[tone]; const v = Math.max(0, Math.min(100, pct))
  return (
    <div className={`${h} w-full overflow-hidden rounded-full bg-ink/10`} role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${c} transition-[width] duration-700 ease-out`} style={{ width: on ? `${v}%` : '0%', transitionDelay: `${delay}ms` }} />
    </div>
  )
}
export const toneFor = (pct: number | null): 'teal' | 'warn' | 'err' => (pct !== null && pct >= 90 ? 'err' : pct !== null && pct >= 75 ? 'warn' : 'teal')

export function Ring({ score, band, size = 76, stroke = 7 }: { score: number; band: HealthBand; size?: number; stroke?: number }) {
  const on = useMounted(); const r = (size - stroke) / 2; const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Health score ${score} out of 100, ${HEALTH_META[band].label}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={HEALTH_META[band].bar} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={on ? c * (1 - score / 100) : c} style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none"><span className="font-display text-xl font-semibold"><CountUp value={score} /></span><span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider opacity-60">health</span></div>
    </div>
  )
}

export function HealthPill({ score, band }: { score: number; band: HealthBand }) {
  const m = HEALTH_META[band]
  return <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2 py-0.5 text-xs font-semibold ${m.text}`}><span className="size-2 rounded-full" style={{ background: m.bar }} /><span className="num">{score}</span><span className="hidden font-medium text-slate xl:inline">{m.label}</span></span>
}

export function Chip({ tone = 'gray', children }: { tone?: 'gray' | 'red' | 'amber' | 'green' | 'blue' | 'teal'; children: ReactNode }) {
  const c = { gray: 'bg-ink/5 text-slate', red: 'bg-red-50 text-red-800', amber: 'bg-amber-50 text-[#8a5a00]', green: 'bg-green-50 text-green-800', blue: 'bg-blue-50 text-blue-800', teal: 'bg-softmint text-teal-600' }[tone]
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>
}

export function RenewChip({ days, status }: { days: number; status: string }) {
  if (status === 'suspended') return <Chip tone="red">Suspended</Chip>
  if (status === 'expired') return <Chip>Expired</Chip>
  const word = status === 'trial' ? 'Trial ends' : status === 'cancelled' ? 'Access ends' : 'Renews'
  if (days < 0) return <Chip tone="red">{word} {Math.abs(days)}d ago</Chip>
  const tone = status === 'cancelled' ? 'amber' : days <= 14 ? 'red' : days <= 30 ? 'amber' : days <= 90 ? 'blue' : 'gray'
  return <Chip tone={tone}>{days === 0 ? `${word} today` : `${word} in ${days}d`}</Chip>
}

export function Spark({ values, color = '#087e8b', w = 96, h = 28 }: { values: number[]; color?: string; w?: number; h?: number }) {
  const max = Math.max(...values, 1); const min = Math.min(...values, 0); const rng = max - min || 1
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - 2 - ((v - min) / rng) * (h - 4)}`).join(' ')
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
}

/** Wrapper that replays a gentle fade/slide whenever `k` changes (tab transitions). */
export function Fade({ k, children, className = '' }: { k: string; children: ReactNode; className?: string }) {
  return <div key={k} className={`sub-fade ${className}`}>{children}</div>
}
