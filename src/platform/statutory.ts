import { useMemo } from 'react'
import { recordAudit, useTenants } from '../tenant/store'
import type { Tenant } from '../tenant/store'
import { createStore } from './persist'

/* ---------- Nigerian statutory calendar ----------
   A rules table (editable by the platform compliance team) is expanded, per company, into dated obligations. A company only gets the
   obligations its modules and headcount make applicable. Filing is recorded by platform staff with an evidence note and is audited.
   Dates are simplified policy dates: they are the dates BizFlow reminds on, not legal advice. */
export type Freq = 'Monthly' | 'Annual'
export type StatRule = {
  id: string; name: string; authority: string; freq: Freq
  /** Monthly: day of the FOLLOWING month the remittance falls due ('eom' = last day). Annual: day of dueMonth. */
  day: number | 'eom'
  dueMonth?: number         // Annual only, 1-12
  yearOffset?: number       // Annual only: -1 means the return for the previous year, due this year
  modulesAny: string[]      // company needs at least one of these modules (empty = every company)
  minEmployees: number
  leadDays: number          // reminder lead time shown in the company inbox
  enabled: boolean
  penalty: string
  note: string
}
export const DEFAULT_RULES: StatRule[] = [
  { id: 'paye', name: 'PAYE remittance', authority: 'State Internal Revenue Service', freq: 'Monthly', day: 10, modulesAny: ['payroll'], minEmployees: 1, leadDays: 7, enabled: true, penalty: '10% of the tax plus interest', note: 'Pay-as-you-earn deducted in the month, remitted by the 10th of the next month.' },
  { id: 'pension', name: 'Pension contribution', authority: 'PenCom via the PFAs', freq: 'Monthly', day: 7, modulesAny: ['payroll'], minEmployees: 3, leadDays: 5, enabled: true, penalty: '2% of the unpaid amount per month', note: 'Within 7 working days of paying salaries, modelled as the 7th of the next month.' },
  { id: 'nhf', name: 'NHF contribution', authority: 'Federal Mortgage Bank of Nigeria', freq: 'Monthly', day: 'eom', modulesAny: ['payroll'], minEmployees: 1, leadDays: 7, enabled: true, penalty: 'Interest on arrears', note: '2.5% of basic salary, remitted by the end of the next month.' },
  { id: 'nsitf', name: 'NSITF contribution', authority: 'Nigeria Social Insurance Trust Fund', freq: 'Monthly', day: 16, modulesAny: ['payroll'], minEmployees: 1, leadDays: 7, enabled: true, penalty: '2% per month on arrears', note: '1% of monthly payroll, due by the 16th of the next month.' },
  { id: 'wht', name: 'Withholding tax (WHT)', authority: 'FIRS / State IRS', freq: 'Monthly', day: 21, modulesAny: ['vendors', 'expenses'], minEmployees: 1, leadDays: 7, enabled: true, penalty: '10% of the tax plus interest', note: 'Tax withheld from supplier payments, remitted by the 21st of the next month.' },
  { id: 'vat', name: 'VAT return', authority: 'Federal Inland Revenue Service', freq: 'Monthly', day: 21, modulesAny: ['crm', 'expenses'], minEmployees: 1, leadDays: 7, enabled: true, penalty: '₦50,000 first month then ₦25,000 per month', note: 'Output and input VAT return, filed by the 21st of the next month.' },
  { id: 'itf', name: 'ITF contribution', authority: 'Industrial Training Fund', freq: 'Annual', day: 30, dueMonth: 9, yearOffset: 0, modulesAny: ['payroll'], minEmployees: 5, leadDays: 30, enabled: true, penalty: '5% of the amount per month', note: '1% of annual payroll for employers with 5 or more staff.' },
  { id: 'paye-annual', name: 'PAYE annual returns (Form H1)', authority: 'State Internal Revenue Service', freq: 'Annual', day: 31, dueMonth: 1, yearOffset: -1, modulesAny: ['payroll'], minEmployees: 1, leadDays: 30, enabled: true, penalty: '₦500,000 for companies', note: 'Annual employee tax schedule for the previous year, due by 31 January.' },
  { id: 'cac', name: 'CAC annual returns', authority: 'Corporate Affairs Commission', freq: 'Annual', day: 31, dueMonth: 3, yearOffset: 0, modulesAny: [], minEmployees: 1, leadDays: 30, enabled: true, penalty: '₦5,000 per month late', note: 'Annual returns for the company, tracked as 31 March.' },
]

export type Filing = { key: string; at: string; by: string; evidence: string; reference: string; onTime: boolean }
type State = { rules: StatRule[]; filings: Record<string, Filing> }

const DAY = 864e5
const pad = (n: number) => String(n).padStart(2, '0')
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
export const todayIso = () => { const n = new Date(); return isoOf(n.getFullYear(), n.getMonth() + 1, n.getDate()) }
const dayNum = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY)
export const daysBetween = (fromIso: string, toIso: string) => dayNum(toIso) - dayNum(fromIso)
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
export const fmtDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export type Status = 'Filed' | 'Overdue' | 'Due soon' | 'Upcoming'
export type Obligation = {
  key: string; slug: string; company: string; rule: StatRule; period: string; due: string; days: number
  status: Status; filing?: Filing; lateBy: number
}

const seedFilings = (rules: StatRule[]): Record<string, Filing> => {
  /* eTranzact has been filing: everything due more than 12 days ago is filed on time, except the latest PAYE, which is the live overdue item. */
  const t = { slug: 'etranzact', created: '2025-02-18', modules: ['payroll', 'expenses', 'vendors', 'crm'], employees: 486, profile: { name: 'eTranzact International Plc' } } as unknown as Tenant
  const out: Record<string, Filing> = {}
  const list = expand(t, rules, {})
  const latestPaye = list.filter((o) => o.rule.id === 'paye' && o.days < 0).sort((a, b) => b.due.localeCompare(a.due))[0]
  list.forEach((o) => {
    if (o.days < -12 || (o.days < 0 && o.rule.id !== 'paye' && o.rule.id !== 'vat') || (o.days < 0 && o.rule.id === 'paye' && o !== latestPaye)) {
      const at = new Date(Date.parse(o.due + 'T10:00:00Z') - 2 * DAY).toISOString()
      out[o.key] = { key: o.key, at, by: 'Platform compliance', evidence: `${o.rule.authority} payment receipt uploaded to the finance folder`, reference: `${o.rule.id.toUpperCase()}-${o.period.replace(/\W+/g, '').slice(0, 8)}`, onTime: true }
    }
  })
  return out
}
const store = createStore<State>('bizflow.statutory.v1', () => ({ rules: DEFAULT_RULES, filings: seedFilings(DEFAULT_RULES) }))
export const useStatutory = store.use
const mergedRules = (s: State) => DEFAULT_RULES.map((d) => s.rules.find((r) => r.id === d.id) ?? d)

/** Does this rule apply to this company? */
export function applies(r: StatRule, t: Pick<Tenant, 'modules' | 'employees'>) { return r.enabled && t.employees >= r.minEmployees && (r.modulesAny.length === 0 || r.modulesAny.some((m) => t.modules.includes(m))) }

function dueFor(r: StatRule, y: number, m: number) { // m = period month (1-12) for monthly rules
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
  return isoOf(ny, nm, r.day === 'eom' ? lastDay(ny, nm) : Math.min(r.day, lastDay(ny, nm)))
}

/** Expands the rules into dated obligations for one company, from 3 months back to 3 months ahead. */
export function expand(t: Tenant, rules: StatRule[], filings: Record<string, Filing>, today = todayIso()): Obligation[] {
  const out: Obligation[] = []
  const [ty, tm] = today.split('-').map(Number)
  const created = (t.created ?? '2000-01-01').slice(0, 10)
  const push = (r: StatRule, period: string, due: string, periodEnd: string) => {
    if (periodEnd < created) return // the company did not exist for this period
    const key = `${t.slug}|${r.id}|${period}`
    const filing = filings[key]
    const days = daysBetween(today, due)
    const status: Status = filing ? 'Filed' : days < 0 ? 'Overdue' : days <= Math.max(7, r.leadDays) ? 'Due soon' : 'Upcoming'
    out.push({ key, slug: t.slug, company: t.profile.name, rule: r, period, due, days, status, filing, lateBy: filing ? Math.max(0, daysBetween(due, filing.at.slice(0, 10))) : days < 0 ? -days : 0 })
  }
  for (const r of rules.filter((x) => applies(x, t))) {
    if (r.freq === 'Monthly') {
      for (let off = -4; off <= 1; off++) {
        const idx = ty * 12 + (tm - 1) + off
        const y = Math.floor(idx / 12), m = (idx % 12) + 1
        const due = dueFor(r, y, m)
        const daysTo = daysBetween(today, due)
        if (daysTo < -100 || daysTo > 75) continue
        push(r, `${MONTHS[m - 1]} ${y}`, due, isoOf(y, m, lastDay(y, m)))
      }
    } else {
      for (let yr = ty - 1; yr <= ty + 1; yr++) {
        const due = isoOf(yr, r.dueMonth ?? 12, Math.min(r.day === 'eom' ? 31 : r.day, lastDay(yr, r.dueMonth ?? 12)))
        const daysTo = daysBetween(today, due)
        if (daysTo < -100 || daysTo > 120) continue
        const pYear = yr + (r.yearOffset ?? 0)
        push(r, String(pYear), due, isoOf(pYear, 12, 31))
      }
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due))
}

export function useObligations() {
  const tenants = useTenants()
  const s = store.use()
  const rules = useMemo(() => mergedRules(s), [s])
  const list = useMemo(() => Object.values(tenants).flatMap((t) => expand(t, rules, s.filings)), [tenants, rules, s.filings])
  return { list, rules, filings: s.filings }
}

/* ---------- KPIs ---------- */
export function kpis(list: Obligation[]) {
  const monthKey = todayIso().slice(0, 7)
  const dueThisMonth = list.filter((o) => o.due.startsWith(monthKey))
  const filedThisMonth = dueThisMonth.filter((o) => o.status === 'Filed').length
  const overdue = list.filter((o) => o.status === 'Overdue')
  const dueSoon = list.filter((o) => o.status === 'Due soon' && o.days <= 7)
  const closed = list.filter((o) => o.days < 0 || o.status === 'Filed').filter((o) => o.days >= -100)
  const onTimeCount = closed.filter((o) => o.status === 'Filed' && o.lateBy === 0).length
  const onTimeRate = closed.length ? Math.round((onTimeCount / closed.length) * 100) : 100
  return { dueThisMonth: dueThisMonth.length, filedThisMonth, overdue: overdue.length, dueSoon: dueSoon.length, onTimeRate, tenantsOverdue: new Set(overdue.map((o) => o.slug)).size }
}

/* ---------- Actions ---------- */
export function markFiled(o: Obligation, input: { evidence: string; reference: string; filedOn: string }, by: string): { ok: boolean; error?: string } {
  if (input.evidence.trim().length < 5) return { ok: false, error: 'Add an evidence note of at least 5 characters, for example the receipt number.' }
  if (input.filedOn > todayIso()) return { ok: false, error: 'The filing date cannot be in the future.' }
  const onTime = input.filedOn <= o.due
  const f: Filing = { key: o.key, at: new Date(input.filedOn + 'T12:00:00Z').toISOString(), by, evidence: input.evidence.trim(), reference: input.reference.trim(), onTime }
  store.set((s) => ({ ...s, filings: { ...s.filings, [o.key]: f } }))
  recordAudit(o.slug, `Statutory filing recorded: ${o.rule.name} (${o.period})`, 'Outstanding', onTime ? 'Filed on time' : `Filed ${daysBetween(o.due, input.filedOn)} days late`, { category: 'Finance', ref: input.reference.trim() || o.key, actor: by })
  return { ok: true }
}
export function reopenFiling(o: Obligation, reason: string, by: string): { ok: boolean; error?: string } {
  if (reason.trim().length < 5) return { ok: false, error: 'Give a reason for reopening.' }
  store.set((s) => { const filings = { ...s.filings }; delete filings[o.key]; return { ...s, filings } })
  recordAudit(o.slug, `Statutory filing reopened: ${o.rule.name} (${o.period})`, 'Filed', `Outstanding. ${reason.trim()}`, { category: 'Finance', ref: o.key, actor: by })
  return { ok: true }
}
export function saveRule(rule: StatRule, by: string) {
  const prev = mergedRules(store.get()).find((r) => r.id === rule.id)
  store.set((s) => ({ ...s, rules: [...mergedRules(s).filter((r) => r.id !== rule.id), rule] }))
  recordAudit('platform', `Statutory rule updated: ${rule.name}`, prev ? `${prev.enabled ? 'on' : 'off'}, day ${prev.day}, lead ${prev.leadDays}d` : undefined, `${rule.enabled ? 'on' : 'off'}, day ${rule.day}, lead ${rule.leadDays}d`, { category: 'Settings', actor: by })
}

/* ---------- Company-side reminders (consumed by the inbox) ---------- */
export type ReminderItem = { id: string; type: 'Payments'; title: string; body: string; to: string; when: string; urgent: boolean; rank: number }
export function reminderItems(t: Tenant | undefined, rules: StatRule[], filings: Record<string, Filing>): ReminderItem[] {
  if (!t) return []
  return expand(t, rules, filings)
    .filter((o) => o.status === 'Overdue' || (o.status === 'Due soon' && o.days <= o.rule.leadDays))
    .map((o, i) => ({
      id: `stat:${o.key}`, type: 'Payments' as const, urgent: o.status === 'Overdue', rank: 880 - i,
      title: o.status === 'Overdue' ? `${o.rule.name} for ${o.period} is ${-o.days} day${o.days === -1 ? '' : 's'} overdue` : `${o.rule.name} for ${o.period} is due ${o.days === 0 ? 'today' : `in ${o.days} day${o.days === 1 ? '' : 's'}`}`,
      body: `${o.rule.authority}, due ${fmtDay(o.due)}. Late penalty: ${o.rule.penalty}. Your BizFlow compliance team marks it filed once the receipt is on record.`,
      to: o.rule.modulesAny.includes('payroll') ? '/admin/business/payroll' : '/admin/business/accounting', when: `Due ${fmtDay(o.due)}`,
    }))
}
export const useStatutoryReminders = (t: Tenant | undefined) => {
  const s = store.use()
  return useMemo(() => reminderItems(t, mergedRules(s), s.filings), [t, s])
}
