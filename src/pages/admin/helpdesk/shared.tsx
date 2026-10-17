import { useEffect, useState } from 'react'
import { Badge } from '../../../components/ui'
import type { Sla, SlaPart, TPriority, TStatus } from '../../../platform/helpdesk'
import { ADMIN_ROLES } from '../AdminLayout'

export const STAFF = Object.values(ADMIN_ROLES).map((r) => r.user)
export const P_TONE: Record<TPriority, string> = { Urgent: 'red', High: 'amber', Normal: 'blue', Low: 'gray' }
export const S_TONE: Record<TStatus, string> = { New: 'blue', Open: 'teal', 'Waiting on customer': 'amber', Resolved: 'green' }
export const textareaCls = 'h-auto py-2'

/** Re-renders every 30 seconds so SLA timers stay live. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i) }, [ms])
  return now
}

const tone = (p: SlaPart) => (p.breached ? 'red' : p.paused ? 'blue' : p.warn ? 'amber' : p.met ? 'green' : 'gray')
export function SlaBadges({ sla, live }: { sla: Sla; live: boolean }) {
  const parts: [string, SlaPart][] = [['First response', sla.first], ['Resolution', sla.resolve]]
  return (
    <div className="flex flex-wrap gap-1.5">
      {parts.filter(([, p]) => live || p.done).map(([n, p]) => (
        <span key={n} title={`${n} target ${p.targetH}h`}><Badge tone={tone(p)}>{n === 'First response' ? 'FR' : 'Res'}: {p.label.replace(/^(First response|Resolution) /, '')}</Badge></span>
      ))}
    </div>
  )
}
export function SlaText({ sla, live }: { sla: Sla; live: boolean }) {
  const cls = !live ? 'text-slate' : sla.state === 'breached' ? 'text-err' : sla.state === 'at-risk' ? 'text-warn' : 'text-slate'
  return <span className={`text-xs font-semibold ${cls}`}>{live && sla.state === 'at-risk' ? 'At risk: ' : ''}{sla.label}</span>
}
