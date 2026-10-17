import type { ReactNode } from 'react'
import { Badge } from '../../../components/ui'
import { fmtDate, money, planById } from '../../../data/billing'
import type { BillingState, Promo } from '../../../data/billing'
import type { KycState } from '../../../data/promoLedger'

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const valueLabel = (p: Promo, s: BillingState) => (p.type === 'percent' ? `${p.value}%` : money(p.value, 'NGN', { trim: true, s }))
export const appliesLabel = (p: Promo) => (p.appliesTo === 'all' ? 'Plans and add-ons' : p.appliesTo === 'plan' ? 'Plans only' : 'Add-ons only')

/** Plain-language eligibility, used on cards, the editor and the detail view. */
export function eligibilityLines(p: Promo, s: BillingState): string[] {
  const plans = p.plans.length ? p.plans.map((id) => planById(s, id)?.name ?? id).join(', ') : 'all plans'
  const out = [
    `${valueLabel(p, s)} off ${appliesLabel(p).toLowerCase()} on ${plans}`,
    p.currencies.length ? `Currencies: ${p.currencies.join(', ')}` : 'All enabled currencies',
    p.cycles.length ? `${p.cycles.join(' and ')} billing only` : 'Monthly and annual billing',
    p.eligibility === 'new' ? 'New customers only' : 'New and existing customers',
    p.firstPeriodOnly ? 'First billing period only' : 'Every billing period',
    p.stacking === 'exclusive' ? 'Cannot be combined with other discounts' : 'Can be combined with other discounts',
    p.perCompanyCap ? `Max ${p.perCompanyCap} use${p.perCompanyCap > 1 ? 's' : ''} per company` : 'No per-company cap',
    p.limit ? `First ${p.limit.toLocaleString()} redemptions` : 'No overall redemption cap',
    p.start && p.end ? `${fmtDate(p.start)} to ${fmtDate(p.end)}` : '',
  ]
  return out.filter(Boolean)
}

export function Kpi({ label, value, sub, icon, tone = 'teal', i = 0 }: { label: string; value: string; sub?: string; icon: ReactNode; tone?: 'teal' | 'blue' | 'amber' | 'red' | 'green'; i?: number }) {
  const bg = { teal: 'bg-softmint text-teal', blue: 'bg-info/10 text-info', amber: 'bg-warn/15 text-amber-800', red: 'bg-err/10 text-err', green: 'bg-ok/10 text-ok' }[tone]
  return (
    <div className="sub-fade min-w-0 rounded-xl border border-line bg-white p-3.5 sm:p-4" style={{ animationDelay: `${i * 40}ms` }}>
      <div className="flex items-center gap-2"><span className={`grid size-7 shrink-0 place-items-center rounded-md ${bg}`} aria-hidden>{icon}</span><span className="min-w-0 text-xs font-medium leading-tight text-slate">{label}</span></div>
      <div className="num mt-2.5 truncate font-display text-[22px] font-semibold leading-none text-ink sm:text-2xl" title={value}>{value}</div>
      {sub && <div className="mt-1.5 text-xs leading-snug text-slate">{sub}</div>}
    </div>
  )
}

export function Tag({ kind }: { kind: 'actual' | 'modelled' }) {
  return kind === 'actual'
    ? <span className="inline-flex items-center gap-1 rounded bg-softmint px-1.5 py-0.5 text-[11px] font-semibold text-teal">Ledger data</span>
    : <span className="inline-flex items-center gap-1 rounded bg-info/10 px-1.5 py-0.5 text-[11px] font-semibold text-info">Modelled</span>
}

const KYC_TONE: Record<KycState, string> = { verified: 'green', pending: 'amber', missing: 'gray', failed: 'red' }
const KYC_TEXT: Record<KycState, string> = { verified: 'Verified', pending: 'Pending', missing: 'Missing', failed: 'Failed' }
export const KycBadge = ({ state, label }: { state: KycState; label?: string }) => <Badge tone={KYC_TONE[state]}>{label ? `${label}: ` : ''}{KYC_TEXT[state]}</Badge>

/** Proportional bar rows: robust and legible when only one or two categories have data. */
export function MixBars({ rows, fmt, empty }: { rows: { key: string; label: string; value: number; note?: string }[]; fmt: (n: number) => string; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate">{empty}</p>
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]"><span className={`min-w-0 truncate font-medium ${r.value ? 'text-ink' : 'text-slate'}`}>{r.label}</span><span className="num shrink-0 text-xs text-slate">{r.value ? fmt(r.value) : 'None yet'}{r.note ? ` · ${r.note}` : ''}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/5" role="img" aria-label={`${r.label}: ${r.value ? fmt(r.value) : 'none'}`}><div className="h-full rounded-full bg-teal transition-[width] duration-500" style={{ width: `${r.value ? Math.max(4, (r.value / max) * 100) : 0}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

export function Meter({ value, max, tone = 'teal', label }: { value: number; max: number | null; tone?: 'teal' | 'amber' | 'red'; label: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  const c = { teal: 'bg-teal', amber: 'bg-warn', red: 'bg-err' }[max && pct >= 100 ? 'red' : max && pct >= 80 ? 'amber' : tone]
  return <div className="h-1.5 overflow-hidden rounded-full bg-ink/5" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max ?? 0} aria-valuenow={value}><div className={`h-full rounded-full ${c}`} style={{ width: `${max ? Math.max(value ? 3 : 0, pct) : 0}%` }} /></div>
}

export const chartTip = { contentStyle: { borderRadius: 8, border: '1px solid #D8E2E3', fontSize: 12, boxShadow: '0 4px 14px rgba(11,37,48,.08)' } as const }
