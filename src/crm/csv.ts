import { DEFAULT_PROB, INDUSTRIES, SOURCES, STAGES } from './store'
import type { LeadInput, Stage } from './store'

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = [] }
    else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim() !== ''))
}

export const IMPORT_FIELDS = [
  { key: 'company', label: 'Company', required: true, aliases: ['company', 'company name', 'organisation', 'organization', 'account', 'business'] },
  { key: 'contact', label: 'Contact person', required: true, aliases: ['contact', 'contact person', 'name', 'full name', 'contact name'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'email address'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'telephone', 'mobile', 'phone number', 'tel'] },
  { key: 'industry', label: 'Industry', aliases: ['industry', 'sector'] },
  { key: 'source', label: 'Lead source', aliases: ['source', 'lead source', 'channel'] },
  { key: 'stage', label: 'Stage', aliases: ['stage', 'status'] },
  { key: 'value', label: 'Deal value (₦)', aliases: ['value', 'deal value', 'amount', 'deal size'] },
  { key: 'owner', label: 'Owner', aliases: ['owner', 'sales owner', 'assigned to', 'rep'] },
  { key: 'expectedClose', label: 'Expected close', aliases: ['expected close', 'close date', 'expected close date'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'note', 'comments'] },
] as const
export type ImportKey = (typeof IMPORT_FIELDS)[number]['key']
export type Mapping = Record<ImportKey, number>

export function autoMap(header: string[]): Mapping {
  const norm = header.map((h) => h.trim().toLowerCase())
  const m = {} as Mapping
  IMPORT_FIELDS.forEach((f) => { m[f.key] = norm.findIndex((h) => (f.aliases as readonly string[]).includes(h)) })
  return m
}

export type ParsedRow = { line: number; lead: LeadInput; errors: string[]; duplicate: 'existing' | 'file' | null }

const pick = <T extends string>(raw: string, list: readonly T[], fallback: T): { v: T; ok: boolean } => {
  const hit = list.find((x) => x.toLowerCase() === raw.trim().toLowerCase())
  return hit ? { v: hit, ok: true } : { v: fallback, ok: !raw.trim() }
}
const asIso = (raw: string): string | null => {
  const t = raw.trim(); if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t))) return t
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) { const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (!Number.isNaN(Date.parse(iso))) return iso }
  return null
}

export function buildRows(data: string[][], map: Mapping, existing: string[], defaults: { owner: string; close: string }): ParsedRow[] {
  const seen = new Set<string>()
  const taken = new Set(existing.map((x) => x.trim().toLowerCase()))
  return data.map((cells, i) => {
    const g = (k: ImportKey) => (map[k] >= 0 ? (cells[map[k]] ?? '').trim() : '')
    const errors: string[] = []
    const company = g('company'), contact = g('contact'), email = g('email')
    if (!company) errors.push('Company is missing')
    if (!contact) errors.push('Contact person is missing')
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push('Email is not valid')
    const rawVal = g('value').replace(/[₦,\s]|NGN/gi, '')
    const value = rawVal === '' ? 0 : Number(rawVal)
    if (Number.isNaN(value) || value < 0) errors.push('Deal value must be a number')
    const stage = pick(g('stage'), STAGES, 'Lead')
    if (!stage.ok) errors.push(`Unknown stage "${g('stage')}"`)
    const industry = pick(g('industry'), INDUSTRIES, 'Other'), source = pick(g('source'), SOURCES, 'Referral')
    const close = asIso(g('expectedClose'))
    if (g('expectedClose') && !close) errors.push('Expected close must be a date (yyyy-mm-dd or dd/mm/yyyy)')
    const key = company.toLowerCase()
    const duplicate: ParsedRow['duplicate'] = !key ? null : taken.has(key) ? 'existing' : seen.has(key) ? 'file' : null
    if (key) seen.add(key)
    const st: Stage = stage.v
    return {
      line: i + 2, errors, duplicate,
      lead: { company, contact, email, phone: g('phone'), industry: industry.v, source: source.v, stage: st, value: Number.isNaN(value) ? 0 : value, probability: DEFAULT_PROB[st], expectedClose: close ?? defaults.close, owner: g('owner') || defaults.owner, notes: g('notes'), nextAction: '', nextDue: '' },
    }
  })
}

export const SAMPLE_CSV = 'Company,Contact,Email,Phone,Industry,Source,Stage,Value,Owner\nExample Merchant Ltd,Ada Nwosu,ada@example-merchant.ng,+234 803 555 0100,Retail,Referral,Lead,2500000,\nSample Payments Co,Eno Bassey,eno@sample-payments.ng,,Logistics,Event,Qualified,6200000,'
