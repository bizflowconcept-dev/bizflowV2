import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { currentDirectory, emptyAudience, resolveAudience } from './audience'
import type { Audience } from './audience'

export type Kind = 'Info' | 'Maintenance' | 'Incident'
export type CampaignStatus = 'Draft' | 'Scheduled' | 'Sent' | 'Cancelled'
/** One company's journey with a sent announcement. deliveredAt is set on first display, readAt on close/open, clickedAt on CTA click. */
export type Delivery = { slug: string; sentAt: string; deliveredAt?: string; readAt?: string; clickedAt?: string }
export type Campaign = {
  audience: Audience; status: CampaignStatus; sendAt?: string; sentAt?: string; createdAt: string
  deliveries: Delivery[]; resends: number; ctaLabel?: string; ctaUrl?: string
}
/** Legacy announcements have plans/slugs and a start/end window. Targeted campaigns add `campaign`. */
export type Announcement = { id: string; title: string; body: string; kind: Kind; plans: string[]; slugs: string[]; start: string; end: string; active: boolean; by: string; campaign?: Campaign }

const KEY = 'bizflow.announcements.v1'
const iso = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 16)
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString()

const seed = (): Announcement[] => [
  { id: 'AN-3', title: 'Scheduled maintenance', body: 'Payroll and reports will be read-only for 20 minutes on Saturday from 02:00 WAT.', kind: 'Maintenance', plans: [], slugs: [], start: iso(-1), end: iso(3), active: true, by: 'Folake Bankole' },
  { id: 'AN-2', title: 'Attendance exports are faster', body: 'Monthly attendance exports now finish in seconds.', kind: 'Info', plans: ['Professional', 'Enterprise'], slugs: [], start: iso(-8), end: iso(-1), active: false, by: 'Dayo Martins' },
]
/** Old saved records load unchanged: legacy `slug` becomes `slugs`, and missing campaign pieces are filled in. */
function migrate(raw: unknown[]): Announcement[] {
  const out = raw.map((a) => {
    const x = a as Announcement & { slug?: string }
    const c = x.campaign
    return { ...x, plans: x.plans ?? [], slugs: x.slugs ?? (x.slug ? [x.slug] : []), ...(c ? { campaign: { ...c, audience: { ...emptyAudience(), ...c.audience }, deliveries: c.deliveries ?? [], resends: c.resends ?? 0, createdAt: c.createdAt ?? x.start } } : {}) } as Announcement
  })
  return out.filter((a) => !/^AC-[123]$/.test(a.id))
}
const load = (): Announcement[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return Array.isArray(v) ? migrate(v) : seed() } catch { return seed() } }
let list = load()
const subs = new Set<() => void>()
const commit = (n: Announcement[]) => { list = n; try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* ignore */ } subs.forEach((f) => f()) }
export const useAnnouncements = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => list)
const nextId = (p: string) => { let n = list.length + 2; while (list.some((a) => a.id === `${p}-${n}`)) n++; return `${p}-${n}` }

/* ---------- legacy window announcements ---------- */
export function saveAnnouncement(a: Omit<Announcement, 'id'>) {
  commit([{ ...a, id: nextId('AN') }, ...list])
  recordAudit(a.slugs.length === 1 ? a.slugs[0] : 'platform', `Announcement published: ${a.kind}`, undefined, a.title)
}
export function toggleAnnouncement(id: string) { commit(list.map((a) => (a.id === id ? { ...a, active: !a.active } : a))) }
export const stateOf = (a: Announcement): string => (a.campaign ? a.campaign.status : !a.active ? 'Off' : Date.now() < new Date(a.start).getTime() ? 'Scheduled' : Date.now() > new Date(a.end).getTime() ? 'Ended' : 'Live')
/** Live window announcements only. Targeted campaigns are delivered per company instead (see campaignsFor). */
export const isLive = (a: Announcement) => !a.campaign && a.active && Date.now() >= new Date(a.start).getTime() && Date.now() <= new Date(a.end).getTime()
export const appliesTo = (a: Announcement, t: { slug: string; plan: string }) => !a.campaign && (a.slugs.length === 0 || a.slugs.includes(t.slug)) && (a.plans.length === 0 || a.plans.includes(t.plan))

/* ---------- targeted campaigns ---------- */
export const mergeCompany = (s: string, company: string) => s.replace(/\{\{\s*company\s*\}\}/gi, company)
export const isCampaign = (a: Announcement): a is Announcement & { campaign: Campaign } => !!a.campaign
const patchC = (id: string, f: (c: Campaign, a: Announcement) => Campaign) => commit(list.map((a) => (a.id === id && a.campaign ? { ...a, campaign: f(a.campaign, a) } : a)))

export type CampaignInput = { id?: string; title: string; body: string; kind: Kind; audience: Audience; sendAt?: string; ctaLabel?: string; ctaUrl?: string; by: string }
/** Save as Draft, or Scheduled when sendAt is set. Returns the id. */
export function saveCampaign(i: CampaignInput): string {
  const existing = i.id ? list.find((a) => a.id === i.id) : undefined
  const id = existing?.id ?? nextId('AC')
  const status: CampaignStatus = i.sendAt ? 'Scheduled' : 'Draft'
  const c: Campaign = { deliveries: [], resends: 0, createdAt: new Date().toISOString(), ...existing?.campaign, audience: i.audience, status, sendAt: i.sendAt, ctaLabel: i.ctaLabel || undefined, ctaUrl: i.ctaUrl || undefined }
  const rec: Announcement = { id, title: i.title, body: i.body, kind: i.kind, plans: [], slugs: [], start: i.sendAt ?? c.createdAt, end: i.sendAt ?? c.createdAt, active: false, by: i.by, campaign: c }
  commit(existing ? list.map((a) => (a.id === id ? rec : a)) : [rec, ...list])
  if (status === 'Scheduled') recordAudit('platform', `Announcement scheduled: ${i.title}`, undefined, i.sendAt, { category: 'Support' })
  return id
}
export function deleteDraft(id: string) { const a = list.find((x) => x.id === id); if (a?.campaign?.status === 'Draft') commit(list.filter((x) => x.id !== id)) }

/** Resolve recipients now and deliver. Returns how many companies were reached (0 = nothing sent). */
export function sendCampaign(id: string, by: string, auto = false): number {
  const a = list.find((x) => x.id === id); const c = a?.campaign
  if (!a || !c || (c.status !== 'Draft' && c.status !== 'Scheduled')) return 0
  const to = resolveAudience(c.audience, currentDirectory()); if (!to.length) return 0
  const now = new Date().toISOString()
  patchC(id, (c) => ({ ...c, status: 'Sent', sentAt: now, deliveries: to.map((t) => ({ slug: t.slug, sentAt: now })) }))
  recordAudit('platform', `Announcement ${auto ? 'sent on schedule' : 'sent'}: ${a.title}`, undefined, `${to.length} compan${to.length === 1 ? 'y' : 'ies'}`, { category: 'Support', actor: auto ? `${by} (scheduled)` : by })
  return to.length
}
export function cancelCampaign(id: string, by: string) {
  const a = list.find((x) => x.id === id)
  if (!a?.campaign || !['Draft', 'Scheduled'].includes(a.campaign.status)) return
  patchC(id, (c) => ({ ...c, status: 'Cancelled' }))
  recordAudit('platform', `Announcement cancelled: ${a.title}`, a.campaign.status, 'Cancelled', { category: 'Support', actor: by })
}
/** Resend to companies that have not read it, or to everyone it was sent to. Returns the count. */
export function resendCampaign(id: string, scope: 'unread' | 'all', by: string): number {
  const a = list.find((x) => x.id === id); const c = a?.campaign
  if (!a || !c || c.status !== 'Sent') return 0
  const now = new Date().toISOString(); let n = 0
  patchC(id, (c) => ({ ...c, resends: c.resends + 1, deliveries: c.deliveries.map((d) => { if (scope === 'unread' && d.readAt) return d; n++; return { slug: d.slug, sentAt: now } }) }))
  if (n) recordAudit('platform', `Announcement resent (${scope === 'unread' ? 'non-readers' : 'everyone'}): ${a.title}`, undefined, `${n} compan${n === 1 ? 'y' : 'ies'}`, { category: 'Support', actor: by })
  return n
}
/** Send every scheduled campaign whose time has come. Recipients are resolved now, not when scheduled. */
export function processDue() {
  const now = Date.now()
  list.filter((a) => a.campaign?.status === 'Scheduled' && a.campaign.sendAt && new Date(a.campaign.sendAt).getTime() <= now).forEach((a) => {
    if (sendCampaign(a.id, a.by, true) === 0) patchC(a.id, (c) => ({ ...c, status: 'Cancelled' }))
  })
}
if (typeof window !== 'undefined') { setTimeout(processDue, 0); ;(setInterval(processDue, 15000) as unknown as { unref?: () => void }).unref?.() }

/* ---------- company side tracking ---------- */
const patchD = (id: string, slug: string, f: (d: Delivery) => Delivery) => commit(list.map((a) => (a.id === id && a.campaign ? { ...a, campaign: { ...a.campaign, deliveries: a.campaign.deliveries.map((d) => (d.slug === slug ? f(d) : d)) } } : a)))
const delivery = (id: string, slug: string) => list.find((a) => a.id === id)?.campaign?.deliveries.find((d) => d.slug === slug)
export function recordDelivered(id: string, slug: string) { const d = delivery(id, slug); if (d && !d.deliveredAt) patchD(id, slug, (x) => ({ ...x, deliveredAt: new Date().toISOString() })) }
export function markAnnouncementRead(id: string, slug: string) { const d = delivery(id, slug); if (d && !d.readAt) patchD(id, slug, (x) => ({ ...x, deliveredAt: x.deliveredAt ?? new Date().toISOString(), readAt: new Date().toISOString() })) }
export function recordClick(id: string, slug: string) { const d = delivery(id, slug); if (d && !d.clickedAt) patchD(id, slug, (x) => { const n = new Date().toISOString(); return { ...x, deliveredAt: x.deliveredAt ?? n, readAt: x.readAt ?? n, clickedAt: n } }) }
/** Sent campaigns that reached this company. */
export const campaignsFor = (all: Announcement[], slug: string) => all.filter((a) => a.campaign?.status === 'Sent' && a.campaign.deliveries.some((d) => d.slug === slug))

export type Stats = { sent: number; delivered: number; read: number; clicked: number; deliveredPct: number; readPct: number; clickPct: number }
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
export function statsOf(c: Campaign): Stats {
  const sent = c.deliveries.length, delivered = c.deliveries.filter((d) => d.deliveredAt).length, read = c.deliveries.filter((d) => d.readAt).length, clicked = c.deliveries.filter((d) => d.clickedAt).length
  return { sent, delivered, read, clicked, deliveredPct: pct(delivered, sent), readPct: pct(read, sent), clickPct: pct(clicked, read) }
}
