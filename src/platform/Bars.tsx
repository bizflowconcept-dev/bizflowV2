import { useEffect, useState } from 'react'
import { Btn, Overlay } from '../components/ui'
import { approveSupport, declineSupport, endSupport } from '../tenant/store'
import type { Support, Tenant } from '../tenant/store'
import { appliesTo, campaignsFor, isLive, markAnnouncementRead, mergeCompany, processDue, recordClick, recordDelivered, useAnnouncements } from './announcements'

export function SupportBanner({ support, companyAdmin }: { support: NonNullable<Support>; companyAdmin?: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i) }, [])
  const left = support.expires ? Math.max(0, Math.round((new Date(support.expires).getTime() - now) / 1000)) : 0
  useEffect(() => { if (support.status === 'Active' && support.expires && left === 0) endSupport(true) }, [left, support.status, support.expires])
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0')
  if (support.status === 'Requested') return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-950">
      <b>BizFlow Support requests diagnostic access</b>
      <span>{support.ticket} · {support.reason} · metadata and technical logs only</span>
      {companyAdmin && <span className="ml-auto flex gap-2"><Btn s="sm" v="secondary" onClick={() => declineSupport(support.slug, companyAdmin)}>Decline</Btn><Btn s="sm" onClick={() => approveSupport(support.slug, companyAdmin)}>Approve {support.minutes} min</Btn></span>}
    </div>
  )
  return (
    <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-[13px] font-semibold text-black">
      <span>BizFlow diagnostic session active</span>
      <span className="font-normal">{support.by} · {support.ticket} · read-only metadata, health and error logs</span>
      <span className="num rounded bg-black/15 px-2 py-0.5" aria-label={`Session ends in ${mm} minutes ${ss} seconds`}>Ends in {mm}:{ss}</span>
      {companyAdmin && <button onClick={() => endSupport()} className="ml-auto min-h-[36px] cursor-pointer rounded bg-black px-3 py-1 text-white">Revoke access</button>}
    </div>
  )
}

const seenKey = (slug: string) => `bf-ann-seen:${slug}`
const readSeen = (slug: string): string[] => {
  try { return [...JSON.parse(localStorage.getItem(seenKey(slug)) || '[]'), ...JSON.parse(sessionStorage.getItem(seenKey(slug)) || '[]')] } catch { return [] }
}

/** Platform announcements reach each company as a pop-up they close to continue. Incidents return every session; others once per device. */
export function AnnouncementBar({ tenant }: { tenant: Tenant }) {
  const all = useAnnouncements()
  // Targeted campaigns come first (per-company delivery, pop-up again after a resend); legacy window announcements follow.
  const camp = campaignsFor(all, tenant.slug).filter((a) => !a.campaign!.deliveries.find((d) => d.slug === tenant.slug)?.readAt).map((a) => ({ a, key: `${a.id}#${a.campaign!.resends}` }))
  const list = [...camp, ...all.filter((a) => isLive(a) && appliesTo(a, tenant)).map((a) => ({ a, key: a.id }))]
  const [seen, setSeen] = useState<string[]>(() => readSeen(tenant.slug))
  useEffect(() => { processDue() }, [])
  const nextItem = list.find((x) => !seen.includes(x.key))
  const next = nextItem?.a, camp1 = next?.campaign
  useEffect(() => { if (next && camp1) recordDelivered(next.id, tenant.slug) }, [next, camp1, tenant.slug])
  if (!next || !nextItem) return null
  const close = () => {
    const store = next.kind === 'Incident' && !camp1 ? sessionStorage : localStorage
    try { store.setItem(seenKey(tenant.slug), JSON.stringify([...JSON.parse(store.getItem(seenKey(tenant.slug)) || '[]'), nextItem.key])) } catch { /* storage unavailable */ }
    if (camp1) markAnnouncementRead(next.id, tenant.slug)
    setSeen((x) => [...x, nextItem.key])
  }
  const tone = next.kind === 'Incident' ? 'bg-red-50 text-red-700' : next.kind === 'Maintenance' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
  const remaining = list.filter((x) => !seen.includes(x.key)).length - 1
  const name = tenant.profile.name
  const go = () => {
    recordClick(next.id, tenant.slug); close()
    const u = camp1?.ctaUrl ?? ''
    if (/^https?:\/\//i.test(u)) window.open(u, '_blank', 'noopener')
    else if (u.startsWith('/')) window.location.assign(u)
  }
  return (
    <Overlay open onClose={close} title={mergeCompany(next.title, name)} alert={next.kind === 'Incident'}>
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{next.kind === 'Info' ? 'Notice' : next.kind}</span>
      <p className="mt-3 text-sm leading-6 text-ink">{mergeCompany(next.body, name)}</p>
      <p className="mt-3 text-xs text-slate">From BizFlow{remaining > 0 ? ` · ${remaining} more after this` : ''}</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {camp1?.ctaLabel && camp1.ctaUrl && <Btn v="secondary" onClick={go}>{camp1.ctaLabel}</Btn>}
        <Btn onClick={close}>{remaining > 0 ? 'Got it, next' : 'Got it, continue'}</Btn>
      </div>
    </Overlay>
  )
}
