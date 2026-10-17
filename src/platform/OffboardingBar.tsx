import { useEffect } from 'react'
import { Link } from 'react-router'
import { Lock } from 'lucide-react'
import { daysLeft, isReadOnly, OPEN_STATES, useActiveOffboarding } from './offboarding'
import { RO_REASON, WRITE_VERB as MUTATING, setReadOnly } from './readOnly'
import type { Tenant } from '../tenant/store'

/** Read-only banner for a workspace that is being closed. Also blocks form submits and obvious write buttons outside [data-ro-allow] areas (UI-layer guard; the server would enforce this in production). */
export function useReadOnlyGuard(on: boolean) {
  useEffect(() => {
    if (!on) return
    const inAllowed = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('[data-ro-allow],[data-menu],nav,[role="dialog"][data-ro-allow]')
    const note = () => { const el = document.getElementById('bf-ro-note'); el?.classList.add('ring-2', 'ring-amber-600'); setTimeout(() => el?.classList.remove('ring-2', 'ring-amber-600'), 900) }
    const onSubmit = (e: Event) => { if (!inAllowed(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); note() } }
    const onClick = (e: MouseEvent) => {
      const b = (e.target as HTMLElement | null)?.closest?.('button,[role="button"]') as HTMLElement | null
      if (!b || inAllowed(b) || b.getAttribute('type') === 'button' && !MUTATING.test(b.textContent || '')) return
      if (MUTATING.test(b.textContent || '') || b.getAttribute('type') === 'submit') { e.preventDefault(); e.stopImmediatePropagation(); note() }
    }
    /* Safety net for plain <button>s that do not use the shared Btn: mark write actions as disabled with an explanation. */
    const decorate = () => document.querySelectorAll<HTMLElement>('button:not([data-ro-marked]),[role="button"]:not([data-ro-marked])').forEach((b) => {
      if (inAllowed(b) || !(MUTATING.test(b.textContent || '') || b.getAttribute('type') === 'submit')) return
      b.setAttribute('data-ro-marked', '1'); b.setAttribute('aria-disabled', 'true'); if (!b.title) b.title = RO_REASON; b.classList.add('opacity-60', 'cursor-not-allowed')
    })
    decorate()
    const mo = new MutationObserver(decorate)
    mo.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('submit', onSubmit, true)
    document.addEventListener('click', onClick, true)
    return () => { mo.disconnect(); document.removeEventListener('submit', onSubmit, true); document.removeEventListener('click', onClick, true) }
  }, [on])
}

export function OffboardingBar({ tenant, canManage }: { tenant: Tenant; canManage: boolean }) {
  const o = useActiveOffboarding(tenant.slug)
  const ro = isReadOnly(o)
  useReadOnlyGuard(ro)
  useEffect(() => { setReadOnly(ro); return () => setReadOnly(false) }, [ro])
  if (!o || o.state === 'Deleted') return null
  if (OPEN_STATES.includes(o.state)) return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-950">
      <b>Cancellation requested</b><span>Your workspace stays fully open while BizFlow reviews the request.</span>
      {canManage && <Link to="/admin/business/offboarding" className="ml-auto font-semibold underline">Review request</Link>}
    </div>
  )
  const d = daysLeft(o.state === 'Deletion scheduled' ? o.deletionDue : o.graceEnds)
  return (
    <div id="bf-ro-note" role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-[13px] font-semibold text-black transition-shadow">
      <Lock size={14} aria-hidden />
      <span>{o.state === 'Deletion scheduled' ? 'Workspace closing' : 'Read-only: workspace is being closed'}</span>
      <span className="font-normal">{o.state === 'Deletion scheduled' ? `Data is deleted in ${Math.max(0, d)} day(s).` : `${Math.max(0, d)} day(s) left in the grace period.`} You can view records and download your data. Changes are turned off.</span>
      {canManage ? <Link to="/admin/business/offboarding" className="ml-auto rounded bg-black px-3 py-1 text-white">Export data or reinstate</Link> : <span className="ml-auto font-normal">Ask your administrator to export or reinstate.</span>}
    </div>
  )
}
