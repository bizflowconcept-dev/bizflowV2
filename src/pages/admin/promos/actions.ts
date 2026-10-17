import { TODAY, fmtDate, iso, logAudit, nid, setBilling } from '../../../data/billing'
import type { BillingState, Promo } from '../../../data/billing'
import { reconcile } from '../../../data/promoLedger'
import type { PromoCrm } from '../../../data/promoLedger'
import { createTask } from '../../../tasks/store'
import type { Priority } from '../../../tasks/store'

const crmOf = (s: BillingState): PromoCrm => s.promoCrm ?? { lists: [], tags: {} }

export function addToList(actor: string, target: { listId?: string; name?: string; purpose?: string }, subIds: string[], companyLabel: string) {
  let label = ''
  setBilling((s) => {
    const crm = crmOf(s)
    if (target.listId) {
      const l = crm.lists.find((x) => x.id === target.listId); label = l?.name ?? ''
      return { ...s, promoCrm: { ...crm, lists: crm.lists.map((x) => (x.id === target.listId ? { ...x, subIds: [...new Set([...x.subIds, ...subIds])] } : x)) } }
    }
    label = target.name!.trim()
    return { ...s, promoCrm: { ...crm, lists: [...crm.lists, { id: nid('lst'), name: label, purpose: target.purpose ?? 'Marketing', subIds: [...new Set(subIds)], createdAt: iso(TODAY), by: actor }] } }
  })
  logAudit(actor, 'Platform', `Added ${companyLabel} to marketing list "${label}"`, '—', `${subIds.length} compan${subIds.length === 1 ? 'y' : 'ies'}`)
  return label
}

export function tagCompanies(actor: string, subIds: string[], tags: string[], companyLabel: string) {
  setBilling((s) => {
    const crm = crmOf(s); const next = { ...crm.tags }
    for (const id of subIds) next[id] = [...new Set([...(next[id] ?? []), ...tags])]
    return { ...s, promoCrm: { ...crm, tags: next } }
  })
  logAudit(actor, 'Platform', `Tagged ${companyLabel}: ${tags.join(', ')}`, '—', 'CRM tags updated')
}

export function removeTag(actor: string, subId: string, tag: string) {
  setBilling((s) => { const crm = crmOf(s); return { ...s, promoCrm: { ...crm, tags: { ...crm.tags, [subId]: (crm.tags[subId] ?? []).filter((t) => t !== tag) } } } })
  logAudit(actor, 'Platform', `Removed CRM tag "${tag}"`, tag, '—')
}

export function followUpTask(actor: string, p: { title: string; desc: string; priority: Priority; due: string; related: string }) {
  const me = actor.split(' (')[0]
  return createTask({ title: p.title, desc: p.desc, priority: p.priority, assignees: [me], due: p.due, related: p.related, scope: 'Platform', tenant: 'platform', creator: me })
}

export function reverseRedemption(actor: string, id: string, reason: string) {
  let what = ''
  setBilling((s) => {
    const r = s.redemptions.find((x) => x.id === id); if (r) what = `${r.code ?? r.promoName} for ${r.company}`
    return reconcile({ ...s, redemptions: s.redemptions.map((x) => (x.id === id ? { ...x, status: 'reversed' as const, reversedAt: iso(TODAY), reversedBy: actor, reason } : x)) })
  })
  logAudit(actor, 'Platform', `Reversed redemption of ${what}`, 'Applied', `Reversed${reason ? `: ${reason}` : ''}`)
}

export function logExport(actor: string, count: number, purpose: string, columns: string) {
  logAudit(actor, 'Platform', `Exported ${count} promotion customer record${count === 1 ? '' : 's'} (CSV)`, '—', `Purpose: ${purpose} · Columns: ${columns}`)
}

export function savePromo(actor: string, edit: Promo, state: string): Promo {
  const isNew = !edit.id; const p: Promo = { ...edit, id: edit.id || nid('promo'), code: edit.kind === 'coupon' ? edit.code?.trim().toUpperCase() : undefined, name: edit.name.trim() }
  setBilling((s) => reconcile({ ...s, promos: isNew ? [...s.promos, p] : s.promos.map((x) => (x.id === p.id ? { ...p, redeemed: x.redeemed } : x)) }))
  logAudit(actor, 'Platform', `${isNew ? 'Created' : 'Updated'} ${p.kind} ${p.code ?? p.name}`, '—', `${p.value}${p.type === 'percent' ? '%' : ' off'} · ${state} · ${fmtDate(p.start)} to ${fmtDate(p.end)}`)
  return p
}

export function setPromoActive(actor: string, p: Promo, active: boolean) {
  setBilling((s) => ({ ...s, promos: s.promos.map((x) => (x.id === p.id ? { ...x, active } : x)) }))
  logAudit(actor, 'Platform', `${active ? 'Published' : 'Moved to draft'} ${p.kind} ${p.code ?? p.name}`, active ? 'Draft' : 'Active', active ? 'Active' : 'Draft')
}
