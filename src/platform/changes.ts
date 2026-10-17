import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { saveFlowPolicy } from '../approvals/flow'
import type { FlowRule } from '../approvals/flow'
import { saveFinancePolicy } from '../finance/policy'
import type { FinancePolicy } from '../finance/policy'
import type { Version } from './versions'

export const AREAS = ['Approval flow', 'Finance tiers', 'Company profile', 'Branding', 'Modules and plan', 'Data export', 'Data deletion', 'Other'] as const
export const PLATFORM_AREAS: Area[] = ['Company profile', 'Branding', 'Modules and plan', 'Data export', 'Data deletion', 'Other']
export const COMPANY_CONTROLLED_AREAS: Area[] = ['Approval flow', 'Finance tiers']
export type Area = (typeof AREAS)[number]
export type Status = 'Requested' | 'Recommended' | 'Applied' | 'Rejected'
export type Payload = { rules?: FlowRule[]; finance?: FinancePolicy }
export type ChangeReq = {
  id: string; slug: string; area: Area; summary: string; payload?: Payload
  by: string; origin: 'Company' | 'Platform'; at: string; status: Status
  recommendedBy?: string; decidedBy?: string; decidedAt?: string; note?: string
  log: { at: string; by: string; text: string }[]
}

export const TEMPLATES: { id: string; name: string; desc: string; rules: FlowRule[] }[] = [
  { id: 'standard', name: 'BizFlow standard', desc: 'Manager, Audit, MD. No extra steps.', rules: [] },
  { id: 'finserv', name: 'Financial services', desc: 'Compliance on settlements and purchases from ₦2M; Compliance and Legal from ₦10M.', rules: [
    { id: 't1', type: 'Settlement', minAmount: 0, steps: ['Compliance'], placement: 'after-audit' },
    { id: 't2', type: 'Purchase', minAmount: 2000000, steps: ['Compliance'], placement: 'after-audit' },
    { id: 't3', type: 'Any', minAmount: 10000000, steps: ['Compliance', 'Legal'], placement: 'after-audit' } ] },
  { id: 'logistics', name: 'Logistics and transport', desc: 'Compliance on vehicle spend from ₦1M and purchases from ₦5M.', rules: [
    { id: 't1', type: 'Vehicle', minAmount: 1000000, steps: ['Compliance'], placement: 'after-audit' },
    { id: 't2', type: 'Purchase', minAmount: 5000000, steps: ['Compliance'], placement: 'after-audit' } ] },
  { id: 'retail', name: 'Retail and distribution', desc: 'Legal on any request from ₦8M; HR before Audit on salary advances.', rules: [
    { id: 't1', type: 'Any', minAmount: 8000000, steps: ['Legal'], placement: 'after-audit' },
    { id: 't2', type: 'Salary Advance', minAmount: 0, steps: ['HR'], placement: 'before-audit' } ] },
]

const KEY = 'bizflow.changeRequests.v1'
const now = () => new Date().toISOString()
const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString()
const seed = (): ChangeReq[] => [
  { id: 'CHG-1042', slug: 'etranzact', area: 'Approval flow', summary: 'Add Legal for any request from ₦25M', payload: { rules: TEMPLATES[1].rules }, by: 'Nneka Okafor', origin: 'Company', at: day(2), status: 'Requested', log: [{ at: day(2), by: 'Nneka Okafor', text: 'Requested by the company administrator' }] },
  { id: 'CHG-1039', slug: 'etranzact', area: 'Branding', summary: 'Update the primary colour and logo for the new brand guide', by: 'Nneka Okafor', origin: 'Company', at: day(4), status: 'Recommended', recommendedBy: 'Seun Adeyemi', log: [{ at: day(4), by: 'Nneka Okafor', text: 'Requested by the company administrator' }, { at: day(3), by: 'Seun Adeyemi', text: 'Recommended after checking the contrast ratios' }] },
  { id: 'CHG-1031', slug: 'etranzact', area: 'Finance tiers', summary: 'Raise the Finance Officer ceiling to ₦1,000,000', payload: { finance: { mode: 'custom', officerLimit: 1000000 } }, by: 'Chinedu Eze', origin: 'Company', at: day(9), status: 'Applied', recommendedBy: 'Dayo Martins', decidedBy: 'Folake Bankole', decidedAt: day(8), log: [{ at: day(9), by: 'Chinedu Eze', text: 'Requested' }, { at: day(8), by: 'Dayo Martins', text: 'Recommended' }, { at: day(8), by: 'Folake Bankole', text: 'Approved and applied' }] },
]
const load = (): ChangeReq[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return Array.isArray(v) ? v : seed() } catch { return seed() } }
let list = load()
const subs = new Set<() => void>()
const commit = (next: ChangeReq[]) => { list = next; try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ } subs.forEach((f) => f()) }
export function useChanges(slug?: string) {
  const all = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => list)
  return slug ? all.filter((c) => c.slug === slug) : all
}
export const openCount = () => list.filter((c) => c.status === 'Requested' || c.status === 'Recommended').length

const patch = (id: string, fn: (c: ChangeReq) => ChangeReq) => commit(list.map((c) => (c.id === id ? fn(c) : c)))

export function submitChange(input: { slug: string; area: Area; summary: string; payload?: Payload; by: string; origin: 'Company' | 'Platform' }) {
  if (input.origin === 'Platform' && COMPANY_CONTROLLED_AREAS.includes(input.area)) throw new Error(`${input.area} is controlled by authorised company roles and cannot be changed by the platform team.`)
  const id = `CHG-${1043 + list.length}`
  commit([{ ...input, id, at: now(), status: 'Requested', log: [{ at: now(), by: input.by, text: input.origin === 'Company' ? 'Requested by the company administrator' : 'Raised by the platform team' }] }, ...list])
  recordAudit(input.slug, `Change requested: ${input.area}`, undefined, input.summary)
  return id
}
export function recommendChange(id: string, by: string, note = '') {
  const c = list.find((x) => x.id === id); if (!c) return
  if (COMPANY_CONTROLLED_AREAS.includes(c.area)) return `${c.area} is company-controlled. Platform staff cannot recommend or execute it.`
  patch(id, (x) => ({ ...x, status: 'Recommended', recommendedBy: by, log: [...x.log, { at: now(), by, text: `Recommended${note ? `: ${note}` : ''}` }] }))
  recordAudit(c.slug, `Change recommended: ${c.area}`, c.id, 'Awaiting second approver')
}
export function rejectChange(id: string, by: string, note: string) {
  const c = list.find((x) => x.id === id); if (!c) return
  patch(id, (x) => ({ ...x, status: 'Rejected', decidedBy: by, decidedAt: now(), note, log: [...x.log, { at: now(), by, text: `Rejected: ${note}` }] }))
  recordAudit(c.slug, `Change rejected: ${c.area}`, c.id, note)
}
export function applyPayload(slug: string, area: Area, payload?: Payload) {
  if (area === 'Approval flow' && payload?.rules) saveFlowPolicy(slug, { rules: payload.rules })
  if (area === 'Finance tiers' && payload?.finance) saveFinancePolicy(slug, payload.finance)
}
export function approveChange(id: string, by: string): string | null {
  const c = list.find((x) => x.id === id); if (!c) return 'Request not found'
  if (c.status !== 'Recommended') return 'Recommend this change first.'
  if (COMPANY_CONTROLLED_AREAS.includes(c.area)) return `${c.area} is company-controlled. A Company Admin, CEO/MD, or authorised Finance role must change it inside the workspace.`
  if (c.recommendedBy === by) return 'A different admin must approve. The person who recommended it cannot also approve it.'
  applyPayload(c.slug, c.area, c.payload)
  patch(id, (x) => ({ ...x, status: 'Applied', decidedBy: by, decidedAt: now(), log: [...x.log, { at: now(), by, text: c.payload ? 'Approved and applied to the company workspace' : 'Approved. Carried out by the platform team' }] }))
  recordAudit(c.slug, `Change applied: ${c.area}`, c.id, c.summary)
  return null
}
export const payloadOf = (v: Version): Payload => (v.area === 'Approval flow' ? { rules: (v.snapshot as { rules: FlowRule[] }).rules } : { finance: v.snapshot as FinancePolicy })
