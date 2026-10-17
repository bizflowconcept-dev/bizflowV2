import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { campaignsFor, markAnnouncementRead, mergeCompany, recordDelivered, useAnnouncements } from '../platform/announcements'
import { canRate, useTickets } from '../platform/helpdesk'
import { useTenants } from '../tenant/store'
import { useStatutoryReminders } from '../platform/statutory'
import { approvalsForTenant } from '../data/demo'
import { STEP_ROLES } from '../approvals/flow'
import type { Step } from '../approvals/flow'
import { OPEN_STAGES, fmtDate, receivablesOf, useLeads } from '../crm/store'
import { useSignaturesAwaiting } from '../pages/app/SignModule'
import { TODAY as TASK_TODAY, canDecideExtension, isOverdue, isSelfTask, pendingExtension, useTasks } from '../tasks/store'

import { CHANNELS, NTYPES } from './types'
import type { Channel, NType } from './types'
export { CHANNELS, NTYPES }
export type { Channel, NType }
export type Prefs = Record<NType, Record<Channel, boolean>>
export type Item = { id: string; type: NType; title: string; body: string; to: string; when: string; urgent: boolean; rank: number; /** Announcement call to action; clicks from the inbox are tracked like the pop-up. */ cta?: { label: string; url: string } }
type Posted = Item & { tenant: string; user?: string }
type State = { read: Record<string, string[]>; prefs: Record<string, Prefs>; posted: Posted[] }

const KEY = 'bf-inbox-v1'
let state: State = (() => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) return { read: s.read ?? {}, prefs: s.prefs ?? {}, posted: s.posted ?? [] } } catch { /* fall through */ } return { read: {}, prefs: {}, posted: [] } })()
const subs = new Set<() => void>()
const put = (s: State) => { state = s; try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage full */ } subs.forEach((f) => f()) }
const useState_ = () => useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => state)

export const userKey = (slug: string, user: string) => `${slug}:${user}`
export const defaultPrefs = (): Prefs => Object.fromEntries(NTYPES.map((t) => [t, { app: true, email: t === 'Approvals' || t === 'Payments', whatsapp: t === 'Approvals' }])) as Prefs

export function markRead(slug: string, user: string, ids: string[]) {
  const k = userKey(slug, user); put({ ...state, read: { ...state.read, [k]: [...new Set([...(state.read[k] ?? []), ...ids])] } })
  ids.filter((i) => i.startsWith('ann:')).forEach((i) => markAnnouncementRead(i.slice(4), slug))
}
export function markUnread(slug: string, user: string, id: string) {
  const k = userKey(slug, user); put({ ...state, read: { ...state.read, [k]: (state.read[k] ?? []).filter((x) => x !== id) } })
}
export function setPref(slug: string, user: string, type: NType, ch: Channel, on: boolean) {
  const k = userKey(slug, user); const cur = state.prefs[k] ?? defaultPrefs()
  put({ ...state, prefs: { ...state.prefs, [k]: { ...cur, [type]: { ...cur[type], [ch]: on } } } })
}
/** Lets other modules (leave, exit, ...) raise an inbox item. Omit `user` to notify everyone with access to the link. */
export function postNotification(slug: string, n: { id: string; type: NType; title: string; body: string; to: string; urgent?: boolean; user?: string }) {
  if (state.posted.some((p) => p.tenant === slug && p.id === n.id)) return
  put({ ...state, posted: [{ ...n, tenant: slug, urgent: !!n.urgent, when: 'Just now', rank: Date.now() }, ...state.posted] })
}

export type InboxCtx = { user: string; role: string; modules: string[]; isAdmin: boolean }
const naira = (n: number) => '₦' + n.toLocaleString('en-NG')
const STEPS: Step[] = ['Manager', 'Audit', 'Compliance', 'MD']
const TODAY = new Date().toISOString().slice(0, 10)

export function useInbox(slug: string, ctx: InboxCtx) {
  const st = useState_()
  const anns = useAnnouncements(), tenantMap = useTenants()
  const companyName = tenantMap[slug]?.profile.name ?? slug
  const annSent = useMemo(() => campaignsFor(anns, slug), [anns, slug])
  useEffect(() => { annSent.forEach((a) => recordDelivered(a.id, slug)) }, [annSent, slug])
  const tix = useTickets()
  const tasks = useTasks(), leads = useLeads(slug), sigs = useSignaturesAwaiting(ctx.user)
  const statutory = useStatutoryReminders(tenantMap[slug])
  const k = userKey(slug, ctx.user)
  const prefs = st.prefs[k] ?? defaultPrefs()
  const readSet = useMemo(() => new Set(st.read[k] ?? []), [st.read, k])
  const has = (m: string) => ctx.isAdmin || ctx.modules.includes('*') || ctx.modules.includes(m)
  const all = useMemo(() => {
    const out: Item[] = []
    const seeAll = ctx.isAdmin || ['md', 'admin', 'bdmanager'].includes(ctx.role)
    if (has('approvals')) approvalsForTenant(slug).filter((a) => a.stage === 'Pending' && a.who !== ctx.user).forEach((a, i) => {
      const next = STEPS.find((s) => !a.done.includes(s)) ?? 'MD'
      if (!STEP_ROLES[next].includes(ctx.role)) return
      out.push({ id: `appr:${a.id}`, type: 'Approvals', title: `${a.type} request ${a.id} awaits your ${next} approval`, body: `${a.who}${a.amount ? ` · ${naira(a.amount)}` : ''} · ${a.note}`, to: '/admin/business/approvals', when: a.date, urgent: a.pri === 'High', rank: 900 - i })
    })
    const mine = tasks.filter((t) => t.tenant === slug && t.scope === 'Business')
    mine.forEach((t, i) => {
      const ext = pendingExtension(t)
      if (ext && canDecideExtension(t, ctx.user, ctx.isAdmin)) out.push({ id: `ext:${t.id}:${ext.id}`, type: 'Tasks', title: `${ext.by} asked to extend ${t.id}`, body: `"${t.title}" from ${fmtDate(ext.fromDue)} to ${fmtDate(ext.toDue)}. ${ext.reason}`, to: '/admin/business/tasks', when: 'Pending decision', urgent: false, rank: 800 - i })
      if (t.assignees.includes(ctx.user) && t.status !== 'Done') {
        if (isOverdue(t)) out.push({ id: `task-od:${t.id}:${t.due}`, type: 'Tasks', title: `Task ${t.id} is overdue`, body: `"${t.title}" was due ${fmtDate(t.due)}`, to: '/admin/business/tasks', when: `Due ${fmtDate(t.due)}`, urgent: true, rank: 750 - i })
        else if (t.creator !== ctx.user && !isSelfTask(t) && t.due >= TASK_TODAY) out.push({ id: `task:${t.id}`, type: 'Tasks', title: `${t.creator} assigned you "${t.title}"`, body: `${t.priority} priority · due ${fmtDate(t.due)}`, to: '/admin/business/tasks', when: `Due ${fmtDate(t.due)}`, urgent: false, rank: 400 - i })
      }
    })
    if (has('sign')) sigs.forEach((q, i) => out.push({ id: `sig:${q.id}`, type: 'Signatures', title: `Signature requested: ${q.doc}`, body: `Sent by ${q.sentBy} on ${q.sentAt} · ${q.signed} of ${q.total} signed`, to: `/admin/business/sign?request=${q.id}`, when: q.sentAt, urgent: false, rank: 700 - i }))
    if (has('crm')) leads.filter((l) => OPEN_STAGES.includes(l.stage) && l.nextAction && l.nextDue && l.nextDue < TODAY && (seeAll || l.owner === ctx.user)).forEach((l, i) => out.push({ id: `fu:${l.id}:${l.nextDue}`, type: 'Follow-ups', title: `Overdue follow-up: ${l.nextAction}`, body: `${l.company} · ${l.owner} · was due ${fmtDate(l.nextDue)}`, to: `/admin/business/crm?lead=${l.id}`, when: `Due ${fmtDate(l.nextDue)}`, urgent: true, rank: 600 - i }))
    const money = ctx.isAdmin || ['md', 'admin', 'finance'].includes(ctx.role)
    receivablesOf(leads, TODAY).filter((r) => money || (has('crm') && r.lead.owner === ctx.user)).forEach((r, i) => out.push({ id: `pay:${r.lead.id}:${r.due}`, type: 'Payments', title: `${r.lead.company} instalment is ${r.daysLate} day${r.daysLate === 1 ? '' : 's'} overdue`, body: `${naira(r.outstanding)} outstanding on the ${fmtDate(r.due)} instalment`, to: money && !has('crm') ? '/admin/business/accounting' : `/admin/business/crm?lead=${r.lead.id}`, when: `Due ${fmtDate(r.due)}`, urgent: r.daysLate > 7, rank: 500 - i }))
    annSent.forEach((a, i) => out.push({ id: `ann:${a.id}`, type: 'System', title: mergeCompany(a.title, companyName), body: `${mergeCompany(a.body, companyName)}${a.campaign?.ctaLabel ? ` (${a.campaign.ctaLabel})` : ''}`, to: a.campaign?.ctaUrl?.startsWith('/') ? a.campaign.ctaUrl : '/admin/business/inbox', when: a.campaign?.sentAt ? new Date(a.campaign.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Recently', urgent: a.kind === 'Incident', cta: a.campaign?.ctaLabel && a.campaign.ctaUrl ? { label: a.campaign.ctaLabel, url: a.campaign.ctaUrl } : undefined, rank: 300 - i }))
    tix.filter((t) => t.slug === slug && canRate(t) && (ctx.isAdmin || t.requester === ctx.user)).forEach((t, i) => out.push({ id: `csat:${t.id}`, type: 'System', title: `Rate our support on ${t.id}`, body: `"${t.subject}" was resolved. Tell us how we did.`, to: '/admin/business/inbox?tab=Support', when: 'Resolved', urgent: false, rank: 250 - i }))
    if (money) statutory.forEach((r) => out.push(r))
    st.posted.filter((p) => p.tenant === slug && (!p.user || p.user === ctx.user)).forEach((p) => out.push(p))
    return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.rank - a.rank)
  }, [slug, ctx.user, ctx.role, ctx.isAdmin, ctx.modules, tasks, leads, sigs, st.posted, annSent, companyName, statutory, tix]) // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => all.filter((i) => prefs[i.type]?.app !== false).map((i) => ({ ...i, read: readSet.has(i.id) })), [all, prefs, readSet])
  return { items, unread: items.filter((i) => !i.read).length, urgentUnread: items.filter((i) => !i.read && i.urgent).length, prefs, hidden: all.length - items.length }
}
