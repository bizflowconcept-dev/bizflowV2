import { useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { Badge, Overlay } from '../../components/ui'
import { HEALTH_BANDS, HEALTH_MODEL, HEALTH_THRESHOLDS, healthOf } from '../../platform/health'
import type { Health } from '../../platform/health'
import { RISK_RULES, RISK_SIGNALS } from '../../platform/success'
import type { AuditEntry, Tenant } from '../../tenant/store'

const TONE_CLS = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-err' } as const
const STROKE = { green: '#16a34a', amber: '#d97706', red: '#dc3e42' } as const
const FACTOR_COLORS = ['#087e8b', '#35d0ba', '#2878d8', '#f59e0b', '#60777d']

/* Half-circle gauge with the band thresholds marked. */
export function ScoreGauge({ health, size = 168 }: { health: Health; size?: number }) {
  const r = 70, c = Math.PI * r
  const at = (n: number) => { const a = Math.PI * (1 - n / 100); return [80 + r * Math.cos(a), 84 - r * Math.sin(a)] }
  return (
    <div className="relative mx-auto" style={{ width: size }} role="img" aria-label={`Health score ${health.score} out of 100, ${health.label}. Watch starts at ${HEALTH_THRESHOLDS.watch}, Healthy at ${HEALTH_THRESHOLDS.healthy}.`}>
      <svg viewBox="0 0 160 96" className="w-full" aria-hidden>
        <path d="M10 84 A70 70 0 0 1 150 84" fill="none" stroke="currentColor" className="text-ink/10" strokeWidth="12" strokeLinecap="round" />
        <path d="M10 84 A70 70 0 0 1 150 84" fill="none" stroke={STROKE[health.tone]} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(health.score / 100) * c} ${c}`} className="transition-[stroke-dasharray] duration-700 motion-reduce:transition-none" />
        {[HEALTH_THRESHOLDS.watch, HEALTH_THRESHOLDS.healthy].map((n) => { const [x, y] = at(n); return <circle key={n} cx={x} cy={y} r="2.5" fill="white" stroke="#102a30" strokeWidth="1" /> })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="num font-display text-3xl font-semibold leading-none">{health.score}</div>
        <div className={`text-xs font-semibold ${TONE_CLS[health.tone]}`}>{health.label}</div>
      </div>
    </div>
  )
}

export function FactorBars({ health }: { health: Health }) {
  return (
    <ul className="space-y-3">
      {health.factors.map((f) => {
        const pct = Math.round((f.pts / f.max) * 100)
        return (
          <li key={f.key} className="text-[13px]">
            <div className="mb-1 flex justify-between gap-2"><span className="font-medium">{f.name}</span><span className="num font-semibold">{f.pts}/{f.max}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10" role="meter" aria-label={f.name} aria-valuenow={f.pts} aria-valuemin={0} aria-valuemax={f.max}>
              <div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${pct >= 70 ? 'bg-teal' : pct >= 40 ? 'bg-warn' : 'bg-err'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1 text-xs text-slate">{f.note}</div>
          </li>
        )
      })}
    </ul>
  )
}

export function HealthExplainerButton({ tenant, audit, label = 'How is this calculated?' }: { tenant?: Tenant; audit?: AuditEntry[]; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded text-xs font-semibold text-teal hover:underline focus-visible:outline-2 focus-visible:outline-teal"><CircleHelp size={14} aria-hidden />{label}</button>
      <Overlay open={open} onClose={() => setOpen(false)} title="How health is calculated" side wide>
        <HealthExplainer tenant={tenant} audit={audit ?? []} />
      </Overlay>
    </>
  )
}

export function HealthExplainer({ tenant, audit }: { tenant?: Tenant; audit: AuditEntry[] }) {
  const h = tenant ? healthOf(tenant, audit) : null
  return (
    <div className="space-y-6 text-sm">
      <p className="text-slate">Every company gets one health score from 0 to 100. It is the sum of five factors. The same score appears on the Overview, the business page and the Tenant health page. Churn risk is worked out from this score plus a few hard warning signs, so there is no second score to reconcile.</p>

      {tenant && h && (
        <section aria-label="Live breakdown">
          <h3 className="mb-3 font-semibold">Live breakdown for {tenant.profile.name}</h3>
          <div className="grid gap-5 sm:grid-cols-[180px_1fr] sm:items-center">
            <ScoreGauge health={h} />
            <FactorBars health={h} />
          </div>
          <div className="mt-4 overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-cloud text-slate"><tr><th className="p-2 font-semibold">Factor</th><th className="p-2 font-semibold">Points</th><th className="p-2 font-semibold">Data source</th><th className="p-2 font-semibold">Why</th></tr></thead>
              <tbody>{h.factors.map((f) => <tr key={f.key} className="border-t border-line align-top"><td className="p-2 font-medium">{f.name}</td><td className="num p-2">{f.pts}/{f.max}</td><td className="p-2 text-slate">{f.source}</td><td className="p-2">{f.why}</td></tr>)}</tbody>
            </table>
          </div>
          {h.factors.some((f) => f.pts < f.max) && (
            <div className="mt-4">
              <h4 className="mb-1 font-semibold">How to improve this score</h4>
              <ul className="list-disc space-y-1 pl-5">{[...h.factors].filter((f) => f.pts < f.max).sort((a, b) => (b.max - b.pts) - (a.max - a.pts)).map((f) => <li key={f.key}><b>{f.name}</b> (up to {f.max - f.pts} more points). {f.improve}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      <section aria-label="Factors and weights">
        <h3 className="mb-2 font-semibold">Factors and weights</h3>
        <div className="mb-3 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`Weights: ${HEALTH_MODEL.map((m) => `${m.name} ${m.max}`).join(', ')}`}>
          {HEALTH_MODEL.map((m, i) => <div key={m.key} title={`${m.name}: ${m.max} points`} style={{ width: `${m.max}%`, background: FACTOR_COLORS[i] }} className="border-r border-white last:border-0" />)}
        </div>
        <ul className="space-y-2">
          {HEALTH_MODEL.map((m, i) => (
            <li key={m.key} className="rounded-md border border-line p-3">
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-sm" style={{ background: FACTOR_COLORS[i] }} aria-hidden />{m.name}</span><span className="num text-xs font-semibold">{m.max} points</span></div>
              <p className="mt-1 text-xs"><span className="text-slate">Scoring: </span>{m.rule}</p>
              <p className="text-xs"><span className="text-slate">Data: </span>{m.source}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Thresholds">
        <h3 className="mb-2 font-semibold">Thresholds</h3>
        <ul className="space-y-2">
          {HEALTH_BANDS.map((b, i) => (
            <li key={b.label} className="flex flex-wrap items-center gap-2"><Badge tone={b.tone}>{b.label}</Badge><span className="num text-xs font-semibold">{i === 0 ? `${b.min} to 100` : i === 1 ? `${b.min} to ${HEALTH_BANDS[0].min - 1}` : `0 to ${HEALTH_BANDS[1].min - 1}`}</span><span className="text-xs text-slate">{b.meaning}</span></li>
          ))}
        </ul>
      </section>

      <section aria-label="Churn risk rules">
        <h3 className="mb-2 font-semibold">Churn risk rules</h3>
        <ul className="space-y-2">{RISK_RULES.map((r) => <li key={r.level} className="flex flex-wrap items-start gap-2"><Badge tone={r.level === 'High' ? 'red' : r.level === 'Medium' ? 'amber' : 'green'}>{r.level}</Badge><span className="min-w-0 flex-1 text-xs">{r.rule}</span></li>)}</ul>
        <p className="mb-1 mt-3 text-xs font-semibold">Warning signals counted</p>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate">{RISK_SIGNALS.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>

      <p className="rounded-md bg-cloud p-3 text-xs text-slate">Scores are recalculated live from workspace status, plan, seats, the business audit log and setup data. They are a guide for conversations, not a verdict.</p>
    </div>
  )
}
