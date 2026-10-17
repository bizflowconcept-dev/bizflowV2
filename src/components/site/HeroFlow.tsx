import { useState } from 'react'

const NODES = [
  { k: 'People', d: 'One employee record powers HR, attendance, leave and tasks.', a: -90 },
  { k: 'Payroll', d: 'PAYE, pension, NHF and NSITF computed from the same record.', a: -38 },
  { k: 'Finance', d: 'Every cost lands in the ledger, tagged to a cost centre.', a: 14 },
  { k: 'Customers', d: 'Leads become customers, invoices and receivables.', a: 64 },
  { k: 'Approvals', d: 'Configurable levels by amount, branch and request type.', a: 116 },
  { k: 'Assets', d: 'Request, buy, assign, maintain and return, with history.', a: 168 },
  { k: 'Operations', d: 'Procurement, fleet and vendors on the same core.', a: 218 },
]

export default function HeroFlow() {
  const [on, setOn] = useState<string>('Payroll')
  const R = 190
  const cx = 280
  const cy = 260
  const pts = NODES.map((n) => ({ ...n, x: cx + R * Math.cos((n.a * Math.PI) / 180), y: cy + R * Math.sin((n.a * Math.PI) / 180) }))
  const cur = pts.find((p) => p.k === on)!
  return (
    <div className="relative">
      <svg viewBox="0 0 560 520" className="w-full" role="img" aria-label="BizFlow connects people, payroll, finance, customers, approvals, assets and operations">
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#35D0BA" stopOpacity="0.5" />
            <stop offset="1" stopColor="#35D0BA" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeDasharray="2 6" />
        <circle cx={cx} cy={cy} r={R * 0.55} fill="none" stroke="rgba(255,255,255,.06)" />
        <circle cx={cx} cy={cy} r="120" fill="url(#core)" />
        {pts.map((p) => (
          <line key={p.k} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={on === p.k ? '#35D0BA' : 'rgba(255,255,255,.18)'} strokeWidth={on === p.k ? 2 : 1} className="flow-line" />
        ))}
        <circle cx={cx} cy={cy} r="54" fill="#0B2530" stroke="#35D0BA" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r="54" fill="none" stroke="#35D0BA" style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'pulse-ring 3s ease-out infinite' }} />
        <image href="/brand/bizflow-mark.png" x={cx - 20} y={cy - 32} width="40" height="40" />
        <text x={cx} y={cy + 24} textAnchor="middle" fill="#35D0BA" fontSize="8" letterSpacing="1.2">BUSINESS CORE</text>
        {pts.map((p) => {
          const a = on === p.k
          return (
            <g key={p.k} tabIndex={0} role="button" aria-label={p.k} className="cursor-pointer outline-none" onMouseEnter={() => setOn(p.k)} onFocus={() => setOn(p.k)} onClick={() => setOn(p.k)}>
              <rect x={p.x - 50} y={p.y - 17} width="100" height="34" rx="8" fill={a ? '#35D0BA' : '#123340'} stroke={a ? '#35D0BA' : 'rgba(255,255,255,.18)'} style={{ transition: 'fill .25s' }} />
              <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="13" fontWeight="600" fill={a ? '#0B2530' : '#fff'}>{p.k}</text>
            </g>
          )
        })}
      </svg>
      <div className="mx-auto -mt-2 max-w-sm rounded-lg border border-white/10 bg-white/5 p-4 text-center backdrop-blur" aria-live="polite">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-mint">{cur.k}</div>
        <p className="mt-1 text-sm text-white/75">{cur.d}</p>
      </div>
    </div>
  )
}
