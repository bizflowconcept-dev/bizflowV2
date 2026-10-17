import { useMemo, useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { postIncome } from '../finance/ledger'

export const STAGES = ['Lead', 'Qualified', 'Proposal', 'Won', 'Lost'] as const
export type Stage = (typeof STAGES)[number]
export const OPEN_STAGES: Stage[] = ['Lead', 'Qualified', 'Proposal']
export const SOURCES = ['Referral', 'Inbound enquiry', 'Outbound call', 'Event', 'Partner', 'Website', 'Existing customer'] as const
export const INDUSTRIES = ['Logistics', 'Agriculture', 'Education', 'Healthcare', 'Real estate', 'Retail', 'Manufacturing', 'Financial services', 'Technology', 'Public sector', 'Other'] as const
export const DEFAULT_PROB: Record<Stage, number> = { Lead: 15, Qualified: 40, Proposal: 65, Won: 100, Lost: 0 }
export const ACT_KINDS = ['Note', 'Call', 'Meeting', 'Email'] as const

export type Act = { id: string; at: string; by: string; kind: 'Note' | 'Call' | 'Meeting' | 'Email' | 'Stage' | 'Edit' | 'Document' | 'Earning'; text: string }
export type LinkedDoc = { requestId: string; title: string; at: string; by: string }
export type Payment = { due: string; amount: number; receivedOn: string; by: string; note?: string; ledgerId?: string }
export type Cadence = 'Weekly' | 'Monthly'
export type EarningPlan = { cadence: Cadence; amount: number; start: string; periods: number | null; note: string; payments: Payment[] }
export type Lead = {
  id: string; tenant: string; company: string; contact: string; email: string; phone: string; industry: string; source: string
  stage: Stage; value: number; probability: number; expectedClose: string; owner: string; notes: string
  nextAction: string; nextDue: string; created: string; updated: string; lostReason?: string
  activity: Act[]; docs: LinkedDoc[]; earning?: EarningPlan
}
export type LeadInput = Omit<Lead, 'id' | 'tenant' | 'activity' | 'docs' | 'created' | 'updated' | 'earning' | 'lostReason'>

/* ---------- date helpers (UTC, ISO yyyy-mm-dd) ---------- */
const parse = (iso: string) => new Date(iso + 'T00:00:00Z')
export const addDays = (iso: string, n: number) => new Date(parse(iso).getTime() + n * 86400000).toISOString().slice(0, 10)
export const addMonths = (iso: string, n: number) => {
  const d = parse(iso); const day = d.getUTCDate()
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(day, last))
  return t.toISOString().slice(0, 10)
}
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)
export const fmtDate = (iso: string) => parse(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/* ---------- earning schedule ---------- */
export type Instalment = { due: string; expected: number; paid: number; receivedOn?: string; posted: boolean; status: 'Received' | 'Part paid' | 'Overdue' | 'Due' | 'Upcoming' }
export function scheduleOf(plan: EarningPlan, today: string): Instalment[] {
  const out: Instalment[] = []
  const step = (i: number) => (plan.cadence === 'Weekly' ? addDays(plan.start, i * 7) : addMonths(plan.start, i))
  const max = plan.periods ?? 400
  for (let i = 0; i < max; i++) {
    const due = step(i)
    if (due > today && out.some((x) => x.due > today)) break
    const pays = plan.payments.filter((p) => p.due === due)
    const paid = pays.reduce((a, p) => a + p.amount, 0)
    const status: Instalment['status'] = paid >= plan.amount ? 'Received' : due > today ? 'Upcoming' : due === today ? (paid ? 'Part paid' : 'Due') : paid ? 'Part paid' : 'Overdue'
    out.push({ due, expected: plan.amount, paid, receivedOn: pays[pays.length - 1]?.receivedOn, posted: pays.length > 0 && pays.every((x) => !!x.ledgerId), status })
  }
  return out
}
export const earnedSummary = (plan: EarningPlan, today: string) => {
  const rows = scheduleOf(plan, today).filter((x) => x.due <= today)
  const expected = rows.reduce((a, x) => a + x.expected, 0)
  const received = rows.reduce((a, x) => a + Math.min(x.paid, x.expected), 0)
  const overdue = rows.filter((x) => x.status === 'Overdue' || (x.status === 'Part paid' && x.due < today))
  return { expected, received, outstanding: expected - received, rate: expected ? Math.round((received / expected) * 100) : 100, overdue, rows }
}
export const monthlyEquivalent = (plan: EarningPlan) => (plan.cadence === 'Weekly' ? Math.round((plan.amount * 52) / 12) : plan.amount)

/* ---------- seed ---------- */
const at = (iso: string, h = 10) => `${iso}T${String(h).padStart(2, '0')}:00:00.000Z`
const A = (id: string, iso: string, by: string, kind: Act['kind'], text: string): Act => ({ id, at: at(iso), by, kind, text })
function seedLead(tenant: string, n: number, x: Partial<Lead> & Pick<Lead, 'company' | 'contact' | 'stage' | 'value' | 'owner'>): Lead {
  const created = x.created ?? '2026-09-02'
  return {
    id: `LD-${100 + n}`, tenant, email: '', phone: '', industry: 'Other', source: 'Referral', probability: DEFAULT_PROB[x.stage], expectedClose: '2026-11-15', notes: '', nextAction: '', nextDue: '',
    created, updated: created, activity: [A(`a${n}`, created, x.owner, 'Note', 'Added to the pipeline')], docs: [], ...x,
  }
}
function seed(): Lead[] {
  const out: Lead[] = []
  const e = (n: number, x: Parameters<typeof seedLead>[2]) => seedLead('etranzact', n, x)
  out.push(
    e(21, { company: 'Lagos State Revenue Service', contact: 'Mr Bode Adewale', industry: 'Public sector', source: 'Inbound enquiry', stage: 'Proposal', value: 48000000, probability: 70, owner: 'Tobi Adeyemi', expectedClose: '2026-11-30', created: '2026-08-12', nextAction: 'Present integration plan to procurement', nextDue: '2026-10-14' }),
    e(22, { company: 'Kwara Microfinance Bank', contact: 'Hajia Rukayat Bello', industry: 'Financial services', source: 'Referral', stage: 'Qualified', value: 18500000, owner: 'Morenike Adebayo', expectedClose: '2026-12-05', created: '2026-09-09', nextAction: 'Technical review call', nextDue: '2026-10-12' }),
    e(23, { company: 'Rivers Retail Group', contact: 'Ngozi Amadi', industry: 'Retail', source: 'Event', stage: 'Lead', value: 9200000, owner: 'Chisom Okeke', expectedClose: '2027-01-15', created: '2026-10-04', nextAction: 'Discovery call', nextDue: '2026-10-13' }),
    e(24, { company: 'Abuja Power Distribution', contact: 'Engr. Sadiq Lawal', industry: 'Public sector', source: 'Partner', stage: 'Won', value: 36000000, owner: 'Tobi Adeyemi', expectedClose: '2026-07-31', created: '2026-05-18', updated: '2026-07-31', notes: 'Collections gateway fee, billed monthly on volume.', activity: [A('a24a', '2026-05-18', 'Tobi Adeyemi', 'Note', 'Added to the pipeline'), A('a24b', '2026-07-31', 'Tobi Adeyemi', 'Stage', 'Moved from Proposal to Won')],
      earning: { cadence: 'Monthly', amount: 3000000, start: '2026-08-05', periods: 12, note: 'Gateway fee on monthly volume.', payments: [{ due: '2026-08-05', amount: 3000000, receivedOn: '2026-08-07', by: 'Chinedu Eze' }, { due: '2026-09-05', amount: 3000000, receivedOn: '2026-09-08', by: 'Chinedu Eze' }, { due: '2026-10-05', amount: 2400000, receivedOn: '2026-10-09', by: 'Chinedu Eze', note: 'Volume dip' }] } }),
  )
  return out
}

/* ---------- store ---------- */
const KEY = 'bf-crm-v2'
let leads: Lead[] = (() => { try { const s = localStorage.getItem(KEY); if (s) { const all = JSON.parse(s) as Lead[]; return all.some((l) => l.tenant === 'etranzact') ? all : [...all, ...seed()] }  } catch { /* fall through */ } return seed() })()
const subs = new Set<() => void>()
const emit = () => { try { localStorage.setItem(KEY, JSON.stringify(leads)) } catch { /* storage full */ } subs.forEach((f) => f()) }
const nowIso = () => new Date().toISOString()
let counter = 0
const uid = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`
const nextId = () => `LD-${Math.max(100, ...leads.map((l) => Number(l.id.slice(3)) || 0)) + 1}`

export function useLeads(slug: string) {
  const all = useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => leads)
  return useMemo(() => all.filter((l) => l.tenant === slug), [all, slug])
}
export const leadById = (id: string) => leads.find((l) => l.id === id)

const patchLead = (id: string, fn: (l: Lead) => Lead) => { leads = leads.map((l) => (l.id === id ? { ...fn(l), updated: nowIso().slice(0, 10) } : l)); emit() }
const withAct = (l: Lead, by: string, kind: Act['kind'], text: string): Lead => ({ ...l, activity: [{ id: uid('act'), at: nowIso(), by, kind, text }, ...l.activity] })

export function createLead(slug: string, input: LeadInput, by: string) {
  const day = nowIso().slice(0, 10)
  const lead: Lead = { ...input, id: nextId(), tenant: slug, created: day, updated: day, docs: [], activity: [{ id: uid('act'), at: nowIso(), by, kind: 'Note', text: 'Added to the pipeline' }] }
  leads = [lead, ...leads]; emit()
  recordAudit(slug, 'Lead created', undefined, lead.company, { category: 'Customers', ref: lead.id })
  return lead
}

const LABELS: Partial<Record<keyof Lead, string>> = { company: 'company', contact: 'contact', email: 'email', phone: 'phone', industry: 'industry', source: 'source', value: 'deal value', probability: 'win probability', expectedClose: 'expected close', owner: 'owner', notes: 'notes', nextAction: 'next action', nextDue: 'next action date' }
export function updateLead(id: string, patch: Partial<Lead>, by: string) {
  const cur = leadById(id); if (!cur) return
  const changed = (Object.keys(patch) as (keyof Lead)[]).filter((k) => LABELS[k] && JSON.stringify(patch[k]) !== JSON.stringify(cur[k]))
  patchLead(id, (l) => {
    let n = { ...l, ...patch }
    if (changed.length) n = withAct(n, by, 'Edit', `Updated ${changed.map((k) => LABELS[k]).join(', ')}`)
    return n
  })
  if (changed.length) recordAudit(cur.tenant, 'Lead updated', undefined, `${cur.company}: ${changed.map((k) => LABELS[k]).join(', ')}`, { category: 'Customers', ref: id })
}
export function moveStage(id: string, stage: Stage, by: string, lostReason?: string) {
  const cur = leadById(id); if (!cur || cur.stage === stage) return
  patchLead(id, (l) => withAct({ ...l, stage, probability: DEFAULT_PROB[stage], lostReason: stage === 'Lost' ? lostReason : undefined, expectedClose: stage === 'Won' ? nowIso().slice(0, 10) : l.expectedClose }, by, 'Stage', `Moved from ${cur.stage} to ${stage}${stage === 'Lost' && lostReason ? `: ${lostReason}` : ''}`))
  recordAudit(cur.tenant, 'Lead stage changed', cur.stage, stage, { category: 'Customers', ref: `${id} ${cur.company}` })
}
export function addActivity(id: string, kind: Act['kind'], text: string, by: string) {
  const cur = leadById(id)
  patchLead(id, (l) => withAct(l, by, kind, text))
  if (cur) recordAudit(cur.tenant, `Lead ${kind.toLowerCase()} logged`, undefined, text.slice(0, 80), { category: 'Customers', ref: `${id} ${cur.company}` })
}
export function setEarningPlan(id: string, plan: EarningPlan | undefined, by: string) {
  const cur = leadById(id); if (!cur) return
  patchLead(id, (l) => withAct({ ...l, earning: plan }, by, 'Earning', plan ? `${cur.earning ? 'Updated' : 'Set up'} the ${plan.cadence.toLowerCase()} earning: ₦${plan.amount.toLocaleString('en-NG')} from ${fmtDate(plan.start)}` : 'Removed the earning plan'))
  recordAudit(cur.tenant, plan ? 'Lead earning plan saved' : 'Lead earning plan removed', cur.earning ? `₦${cur.earning.amount.toLocaleString('en-NG')} ${cur.earning.cadence}` : undefined, plan ? `₦${plan.amount.toLocaleString('en-NG')} ${plan.cadence}` : undefined, { category: 'Finance', ref: `${id} ${cur.company}` })
}
export function recordPayment(id: string, p: Payment) {
  const cur = leadById(id); if (!cur?.earning) return
  const entry = postIncome(cur.tenant, { date: p.receivedOn, customer: cur.company, description: `${cur.earning.cadence} earning, instalment due ${fmtDate(p.due)}`, amount: p.amount, ref: `${id} · ${p.due}`, by: p.by })
  const pay: Payment = { ...p, ledgerId: entry.id }
  patchLead(id, (l) => withAct({ ...l, earning: { ...l.earning!, payments: [...l.earning!.payments, pay] } }, p.by, 'Earning', `Recorded ₦${p.amount.toLocaleString('en-NG')} received for the ${fmtDate(p.due)} instalment and posted it to Accounting (${entry.id})`))
  recordAudit(cur.tenant, 'Lead payment recorded', fmtDate(p.due), `₦${p.amount.toLocaleString('en-NG')}`, { category: 'Finance', ref: `${id} ${cur.company}` })
}
/** Post any received payments for an instalment that predate the Accounting link. */
export function postInstalment(id: string, due: string, by: string) {
  const cur = leadById(id); if (!cur?.earning) return
  const ids = new Map<number, string>()
  cur.earning.payments.forEach((p, i) => {
    if (p.due !== due || p.ledgerId) return
    ids.set(i, postIncome(cur.tenant, { date: p.receivedOn, customer: cur.company, description: `${cur.earning!.cadence} earning, instalment due ${fmtDate(p.due)}`, amount: p.amount, ref: `${id} · ${p.due}`, by }).id)
  })
  if (!ids.size) return
  patchLead(id, (l) => withAct({ ...l, earning: { ...l.earning!, payments: l.earning!.payments.map((p, i) => (ids.has(i) ? { ...p, ledgerId: ids.get(i) } : p)) } }, by, 'Earning', `Posted the ${fmtDate(due)} instalment to Accounting`))
}
export function linkDocument(id: string, doc: LinkedDoc) {
  const cur = leadById(id); if (!cur || cur.docs.some((d) => d.requestId === doc.requestId)) return
  patchLead(id, (l) => withAct({ ...l, docs: [doc, ...l.docs] }, doc.by, 'Document', `Sent "${doc.title}" for signature`))
}

/* ---------- analytics ---------- */
export const weighted = (l: Lead) => Math.round((l.value * l.probability) / 100)
export function pipelineStats(list: Lead[]) {
  const open = list.filter((l) => OPEN_STAGES.includes(l.stage))
  const won = list.filter((l) => l.stage === 'Won'), lost = list.filter((l) => l.stage === 'Lost')
  const sum = (xs: Lead[]) => xs.reduce((a, l) => a + l.value, 0)
  const closed = won.length + lost.length
  return { open, won, lost, openValue: sum(open), weightedValue: open.reduce((a, l) => a + weighted(l), 0), wonValue: sum(won), winRate: closed ? Math.round((won.length / closed) * 100) : 0, avgDeal: won.length ? Math.round(sum(won) / won.length) : 0 }
}

/* ---------- receivables ageing (feeds the finance team's view) ---------- */
export type Receivable = { lead: Lead; due: string; outstanding: number; daysLate: number; bucket: '1-7 days' | '8-30 days' | '31+ days' }
export function receivablesOf(list: Lead[], today: string): Receivable[] {
  const out: Receivable[] = []
  list.filter((l) => l.stage === 'Won' && l.earning).forEach((l) => {
    scheduleOf(l.earning!, today).filter((x) => x.due < today && x.paid < x.expected).forEach((x) => {
      const daysLate = daysBetween(x.due, today)
      out.push({ lead: l, due: x.due, outstanding: x.expected - x.paid, daysLate, bucket: daysLate <= 7 ? '1-7 days' : daysLate <= 30 ? '8-30 days' : '31+ days' })
    })
  })
  return out.sort((a, b) => b.daysLate - a.daysLate)
}

/* ---------- sales targets (monthly quota per owner, per tenant) ---------- */
const TKEY = 'bf-crm-targets-v2'
type Targets = Record<string, Record<string, number>>
let targets: Targets = (() => { try { const s = localStorage.getItem(TKEY); if (s) return JSON.parse(s) as Targets } catch { /* fall through */ } return { etranzact: { 'Tobi Adeyemi': 40000000, 'Morenike Adebayo': 15000000, 'Chisom Okeke': 10000000 } } })()
const tsubs = new Set<() => void>()
export function useTargets(slug: string): Record<string, number> {
  const all = useSyncExternalStore((cb) => { tsubs.add(cb); return () => { tsubs.delete(cb) } }, () => targets)
  return useMemo(() => all[slug] ?? {}, [all, slug])
}
export function setTarget(slug: string, owner: string, amount: number, by: string) {
  const before = targets[slug]?.[owner]
  const next = { ...(targets[slug] ?? {}) }
  if (amount > 0) next[owner] = amount; else delete next[owner]
  targets = { ...targets, [slug]: next }
  try { localStorage.setItem(TKEY, JSON.stringify(targets)) } catch { /* storage full */ }
  tsubs.forEach((f) => f())
  recordAudit(slug, 'Sales target set', before ? `₦${before.toLocaleString('en-NG')}/month` : 'None', amount > 0 ? `${owner}: ₦${amount.toLocaleString('en-NG')}/month` : `${owner}: removed`, { category: 'Customers', ref: `target ${owner}` })
  void by
}
/** Value of deals won in the month containing `today`, per owner. */
export const wonThisMonth = (list: Lead[], owner: string, today: string) => list.filter((l) => l.stage === 'Won' && l.owner === owner && l.expectedClose.slice(0, 7) === today.slice(0, 7)).reduce((a, l) => a + l.value, 0)

/* ---------- bulk import ---------- */
export function importLeads(slug: string, rows: LeadInput[], by: string) {
  if (!rows.length) return []
  const day = nowIso().slice(0, 10)
  let n = Math.max(100, ...leads.map((l) => Number(l.id.slice(3)) || 0))
  const made = rows.map((input): Lead => ({ ...input, id: `LD-${++n}`, tenant: slug, created: day, updated: day, docs: [], activity: [{ id: uid('act'), at: nowIso(), by, kind: 'Note', text: 'Imported from CSV' }] }))
  leads = [...made, ...leads]; emit()
  recordAudit(slug, 'Leads imported from CSV', undefined, `${made.length} lead${made.length === 1 ? '' : 's'}`, { category: 'Customers', ref: made.map((l) => l.id).slice(0, 3).join(', ') })
  return made
}
