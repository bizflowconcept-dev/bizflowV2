import {
  FX_REFERENCE, GROUPS, MODULES, TODAY, applyAvailability, availabilityOf, depsOf, getBilling, iso, logAudit, moduleById, modelOf, money, moduleMoney, nid, setBilling,
} from './billing'
import type { Availability, BillingState, Bundle, ModuleBand, ModulePrice, PriceHistoryEntry, PricingDraft, PricingSnapshot } from './billing'

/* =====================================================================
   Module pricing workspace logic: draft -> diff -> publish (now or scheduled),
   bulk edit, duplication and CSV import/export. All edits happen on a draft;
   the live catalog (and therefore onboarding and quotes) only changes on publish.
   ===================================================================== */

export const CURRENCY_CODES = ['NGN', 'USD', 'GBP', 'EUR']
const clone = <T,>(x: T): T => structuredClone(x)
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const niceRound = (v: number) => (v >= 1000 ? Math.round(v / 50) * 50 : Math.round(v))

/* ---------- Derived currencies ---------- */
const fx = (code: string, ngn: number) => (code === 'NGN' ? ngn : Math.round((ngn / (FX_REFERENCE[code] ?? 1)) * 100) / 100)
/** Recompute every non-overridden currency from the NGN band prices. */
export function rederive(rate: ModulePrice): ModulePrice {
  const manual = new Set(rate.overrides ?? [])
  const setupFee = rate.setupFee ? { ...rate.setupFee } : undefined
  const minCharge = rate.minCharge ? { ...rate.minCharge } : undefined
  for (const code of CURRENCY_CODES) {
    if (code === 'NGN' || manual.has(code)) continue
    if (setupFee && setupFee.NGN !== undefined) setupFee[code] = fx(code, setupFee.NGN)
    if (minCharge && minCharge.NGN) minCharge[code] = { monthly: fx(code, minCharge.NGN.monthly), annual: fx(code, minCharge.NGN.annual) }
  }
  return {
    ...rate, setupFee, minCharge,
    bands: rate.bands.map((b) => {
      const ngn = b.prices.NGN ?? { monthly: 0, annual: 0 }; const cost = b.costs.NGN ?? { monthly: 0, annual: 0 }
      const prices = { ...b.prices }; const costs = { ...b.costs }
      for (const code of CURRENCY_CODES) {
        if (code === 'NGN' || manual.has(code)) continue
        prices[code] = { monthly: fx(code, ngn.monthly), annual: fx(code, ngn.annual) }
        costs[code] = { monthly: fx(code, cost.monthly), annual: fx(code, cost.annual) }
      }
      return { ...b, prices, costs }
    }),
  }
}
export const newBand = (rate: ModulePrice): ModuleBand => {
  const last = [...rate.bands].reverse().find((b) => !b.custom) ?? rate.bands[0]
  const min = (last?.maxEmployees ?? last?.minEmployees ?? 0) + 1
  return { id: nid('band'), label: `${min}+ staff`, minEmployees: min, maxEmployees: null, prices: clone(last?.prices ?? moduleMoney(0)), costs: clone(last?.costs ?? moduleMoney(0)), custom: false }
}
export const blankRate = (moduleId: string): ModulePrice => ({ moduleId, active: false, required: false, importance: 'Recommended', summary: moduleById(moduleId)?.name ?? moduleId, bands: [{ id: 'standard', label: 'Standard', minEmployees: 1, maxEmployees: null, prices: moduleMoney(0), costs: moduleMoney(0) }] })

/* ---------- Draft lifecycle ---------- */
const freshDraft = (s: BillingState, by: string): PricingDraft => ({ rates: clone(s.modulePrices), bundles: clone(s.bundles), starterMinimum: clone(s.starterMinimum), createdAt: iso(TODAY), by, note: '' })
export function editDraft(by: string, fn: (d: PricingDraft) => PricingDraft) {
  setBilling((s) => ({ ...s, draft: fn(clone(s.draft ?? freshDraft(s, by))) }))
}
export const discardDraft = () => setBilling((s) => ({ ...s, draft: null }))
export const editRate = (by: string, moduleId: string, fn: (r: ModulePrice) => ModulePrice) =>
  editDraft(by, (d) => {
    const exists = d.rates.some((r) => r.moduleId === moduleId)
    const rates = exists ? d.rates : [...d.rates, blankRate(moduleId)]
    return { ...d, rates: rates.map((r) => (r.moduleId === moduleId ? rederive(fn(r)) : r)) }
  })

/** Copy bands, billing model, discounts and fees from one module onto another. */
export function duplicateRate(by: string, targetId: string, sourceId: string) {
  editDraft(by, (d) => {
    const src = d.rates.find((r) => r.moduleId === sourceId); if (!src) return d
    return { ...d, rates: d.rates.map((r) => (r.moduleId === targetId ? { ...r, bands: clone(src.bands).map((b) => ({ ...b, id: b.id })), model: src.model, unitLabel: src.unitLabel, setupFee: clone(src.setupFee), minCharge: clone(src.minCharge), discountMonthly: src.discountMonthly, discountAnnual: src.discountAnnual, trialDays: src.trialDays, overrides: clone(src.overrides) } : r)) }
  })
}

export type BulkOp = { mode: 'pct' | 'set' | 'add'; value: number; period: 'monthly' | 'annual' | 'both'; band: 'all' | number }
/** Adjust the NGN price of many modules at once; other currencies are re-derived unless overridden. */
export function bulkEdit(by: string, ids: string[], op: BulkOp) {
  const apply = (v: number, period: 'monthly' | 'annual') => {
    if (op.mode === 'pct') return niceRound(v * (1 + op.value / 100))
    if (op.mode === 'add') return Math.max(0, niceRound(v + op.value))
    return Math.max(0, period === 'annual' && op.period === 'both' ? op.value * 10 : op.value)
  }
  editDraft(by, (d) => ({ ...d, rates: d.rates.map((r) => !ids.includes(r.moduleId) ? r : rederive({ ...r, bands: r.bands.map((b, i) => {
    if (b.custom || (op.band !== 'all' && op.band !== i)) return b
    const cur = b.prices.NGN ?? { monthly: 0, annual: 0 }
    return { ...b, prices: { ...b.prices, NGN: { monthly: op.period !== 'annual' ? apply(cur.monthly, 'monthly') : cur.monthly, annual: op.period !== 'monthly' ? apply(cur.annual, 'annual') : cur.annual } } }
  }) })) }))
}

/* ---------- Validation ---------- */
export type Issue = { level: 'error' | 'warn'; moduleId?: string; text: string }
export function validateSnapshot(d: PricingSnapshot, s: BillingState): Issue[] {
  const out: Issue[] = []; const nm = (id: string) => moduleById(id)?.name ?? id
  const active = new Set(d.rates.filter((r) => r.active).map((r) => r.moduleId))
  for (const r of d.rates) {
    const name = nm(r.moduleId)
    const bands = r.bands.filter((b) => !b.custom).sort((a, b) => a.minEmployees - b.minEmployees)
    if (r.active && !bands.length && !r.bands.length) out.push({ level: 'error', moduleId: r.moduleId, text: `${name} has no pricing bands.` })
    for (const b of r.bands) {
      if (b.maxEmployees !== null && b.maxEmployees < b.minEmployees) out.push({ level: 'error', moduleId: r.moduleId, text: `${name} · ${b.label}: maximum staff is below the minimum.` })
      if (!b.custom && r.active) {
        for (const code of CURRENCY_CODES) {
          const p = b.prices[code]; if (!p) { out.push({ level: 'error', moduleId: r.moduleId, text: `${name} · ${b.label}: no ${code} price.` }); continue }
          if (p.monthly < 0 || p.annual < 0) out.push({ level: 'error', moduleId: r.moduleId, text: `${name} · ${b.label}: ${code} price is negative.` })
          if (p.annual > p.monthly * 12 + 0.01) out.push({ level: 'warn', moduleId: r.moduleId, text: `${name} · ${b.label}: ${code} annual exceeds twelve monthly payments.` })
          const c = b.costs[code]; if (c && p.monthly > 0 && c.monthly > p.monthly) out.push({ level: 'warn', moduleId: r.moduleId, text: `${name} · ${b.label}: ${code} price is below estimated delivery cost.` })
        }
      }
    }
    for (let i = 1; i < bands.length; i++) if (bands[i].minEmployees <= (bands[i - 1].maxEmployees ?? Infinity)) out.push({ level: 'error', moduleId: r.moduleId, text: `${name}: bands "${bands[i - 1].label}" and "${bands[i].label}" overlap.` })
    if ((r.discountMonthly ?? 0) < 0 || (r.discountMonthly ?? 0) > 100 || (r.discountAnnual ?? 0) < 0 || (r.discountAnnual ?? 0) > 100) out.push({ level: 'error', moduleId: r.moduleId, text: `${name}: discounts must be between 0% and 100%.` })
    if (r.active) for (const dep of r.requires ?? depsOf(s, r.moduleId)) if (!active.has(dep)) out.push({ level: 'error', moduleId: r.moduleId, text: `${name} requires ${nm(dep)}, which is not offered.` })
    if (r.required && !r.active) out.push({ level: 'error', moduleId: r.moduleId, text: `${name} is a required foundation module but is switched off.` })
  }
  // dependency cycles
  const dep = (id: string) => d.rates.find((r) => r.moduleId === id)?.requires ?? depsOf(s, id)
  for (const r of d.rates) { const seen = new Set<string>(); const walk = (id: string): boolean => { if (seen.has(id)) return id === r.moduleId; seen.add(id); return dep(id).some(walk) }; if (dep(r.moduleId).some(walk)) out.push({ level: 'error', moduleId: r.moduleId, text: `${nm(r.moduleId)} has a circular dependency.` }) }
  for (const b of d.bundles) {
    if (b.moduleIds.length < 2) out.push({ level: 'error', text: `Bundle "${b.name || 'Untitled'}" needs at least two modules.` })
    if (!b.name.trim()) out.push({ level: 'error', text: 'A bundle has no name.' })
    if (b.discountPct < 0 || b.discountPct > 60) out.push({ level: 'error', text: `Bundle "${b.name}" discount must be between 0% and 60%.` })
    if (b.active) for (const id of b.moduleIds) if (!active.has(id)) out.push({ level: 'warn', text: `Bundle "${b.name}" contains ${nm(id)}, which is not offered.` })
  }
  return out
}

/* ---------- Diff & MRR estimate ---------- */
export type Change = { moduleId: string; kind: PriceHistoryEntry['kind']; label: string; from: string; to: string; mrr: number }
const BASE_ACCOUNTS = 120
const BAND_SHARE = [0.5, 0.3, 0.15, 0.05]
const ADOPTION: Record<ModulePrice['importance'], number> = { Foundation: 1, Essential: 0.8, Recommended: 0.5, Specialist: 0.25 }
export const MRR_ASSUMPTION = `Estimate assumes ${BASE_ACCOUNTS} paying accounts, spread 50/30/15/5% across capacity bands, with adoption by module priority (Foundation 100%, Essential 80%, Recommended 50%, Specialist 25%). Only NGN list-price changes are counted.`
const fmtP = (n: number | undefined, code: string) => (n === undefined ? '—' : money(n, code, { trim: true }))

export function diffPricing(s: BillingState, d: PricingSnapshot): { changes: Change[]; prices: number; modules: string[]; mrr: number } {
  const changes: Change[] = []
  const push = (c: Omit<Change, 'mrr'> & { mrr?: number }) => changes.push({ mrr: 0, ...c })
  for (const r of d.rates) {
    const live = s.modulePrices.find((x) => x.moduleId === r.moduleId); const name = moduleById(r.moduleId)?.name ?? r.moduleId
    if (!live) { push({ moduleId: r.moduleId, kind: 'setting', label: `${name} added to the price list`, from: '—', to: r.active ? 'Active' : 'Inactive' }); continue }
    const share = (i: number) => (live.bands.length === 1 ? 1 : BAND_SHARE[Math.min(i, BAND_SHARE.length - 1)])
    r.bands.forEach((b, i) => {
      const lb = live.bands.find((x) => x.id === b.id)
      if (!lb) { push({ moduleId: r.moduleId, kind: 'setting', label: `${name} · band "${b.label}" added`, from: '—', to: `${b.minEmployees}–${b.maxEmployees ?? '∞'} staff` }); return }
      if (lb.label !== b.label || lb.minEmployees !== b.minEmployees || lb.maxEmployees !== b.maxEmployees || !!lb.custom !== !!b.custom) push({ moduleId: r.moduleId, kind: 'setting', label: `${name} · band "${lb.label}" range`, from: `${lb.minEmployees}–${lb.maxEmployees ?? '∞'}${lb.custom ? ' custom' : ''}`, to: `${b.minEmployees}–${b.maxEmployees ?? '∞'}${b.custom ? ' custom' : ''}` })
      for (const code of CURRENCY_CODES) for (const k of ['monthly', 'annual'] as const) {
        const a = lb.prices[code]?.[k]; const z = b.prices[code]?.[k]
        if (a !== z) push({ moduleId: r.moduleId, kind: 'price', label: `${name} · ${b.label} · ${code} ${k}`, from: fmtP(a, code), to: fmtP(z, code), mrr: code === 'NGN' && k === 'monthly' && !b.custom ? ((z ?? 0) - (a ?? 0)) * BASE_ACCOUNTS * share(i) * ADOPTION[r.importance] : 0 })
      }
    })
    live.bands.filter((lb) => !r.bands.some((b) => b.id === lb.id)).forEach((lb) => push({ moduleId: r.moduleId, kind: 'setting', label: `${name} · band "${lb.label}" removed`, from: `${lb.minEmployees}–${lb.maxEmployees ?? '∞'} staff`, to: '—' }))
    const field = (label: string, a: unknown, z: unknown, f: (v: unknown) => string = (v) => String(v ?? '—')) => { if (!same(a, z)) push({ moduleId: r.moduleId, kind: 'setting', label: `${name} · ${label}`, from: f(a), to: f(z) }) }
    field('billing model', modelOf(live), modelOf(r))
    field('unit label', live.unitLabel, r.unitLabel)
    field('monthly discount', live.discountMonthly ?? 0, r.discountMonthly ?? 0, (v) => `${v}%`)
    field('annual discount', live.discountAnnual ?? 0, r.discountAnnual ?? 0, (v) => `${v}%`)
    field('trial days', live.trialDays ?? 0, r.trialDays ?? 0)
    field('setup fee', live.setupFee ?? {}, r.setupFee ?? {}, (v) => Object.entries(v as Record<string, number>).filter(([, n]) => n).map(([c, n]) => fmtP(n, c)).join(' · ') || 'None')
    field('minimum charge', live.minCharge ?? {}, r.minCharge ?? {}, (v) => Object.entries(v as Record<string, { monthly: number }>).filter(([, n]) => n.monthly).map(([c, n]) => fmtP(n.monthly, c)).join(' · ') || 'None')
    field('requires', live.requires ?? depsOf(s, r.moduleId), r.requires ?? depsOf(s, r.moduleId), (v) => (v as string[]).map((id) => moduleById(id)?.name ?? id).join(', ') || 'None')
    field('offered in onboarding', live.active, r.active, (v) => (v ? 'Yes' : 'No'))
    field('required foundation', live.required, r.required, (v) => (v ? 'Yes' : 'No'))
    field('priority', live.importance, r.importance)
    field('currency overrides', live.overrides ?? [], r.overrides ?? [], (v) => (v as string[]).join(', ') || 'None')
    for (const [planId, to] of Object.entries(r.availability ?? {})) {
      const from = availabilityOf(s, r.moduleId, planId).state
      if (from !== to) push({ moduleId: r.moduleId, kind: 'availability', label: `${name} on ${s.plans.find((p) => p.id === planId)?.name ?? planId}`, from, to })
    }
  }
  for (const code of CURRENCY_CODES) for (const k of ['monthly', 'annual'] as const) {
    const a = s.starterMinimum[code]?.[k]; const z = d.starterMinimum[code]?.[k]
    if (a !== z) push({ moduleId: '_minimum', kind: 'minimum', label: `Starter minimum · ${code} ${k}`, from: fmtP(a, code), to: fmtP(z, code), mrr: code === 'NGN' && k === 'monthly' ? ((z ?? 0) - (a ?? 0)) * BASE_ACCOUNTS * 0.2 : 0 })
  }
  for (const b of d.bundles) {
    const lb = s.bundles.find((x) => x.id === b.id)
    if (!lb) { push({ moduleId: '_bundle', kind: 'bundle', label: `Bundle "${b.name}" created`, from: '—', to: `${b.discountPct}% · ${b.moduleIds.length} modules` }); continue }
    if (!same(lb, b)) push({ moduleId: '_bundle', kind: 'bundle', label: `Bundle "${b.name}"`, from: `${lb.discountPct}% · ${lb.moduleIds.length} modules${lb.active ? '' : ' · off'}`, to: `${b.discountPct}% · ${b.moduleIds.length} modules${b.active ? '' : ' · off'}` })
  }
  for (const lb of s.bundles) if (!d.bundles.some((b) => b.id === lb.id)) push({ moduleId: '_bundle', kind: 'bundle', label: `Bundle "${lb.name}" removed`, from: `${lb.discountPct}%`, to: '—' })
  const prices = changes.filter((c) => c.kind === 'price' || c.kind === 'minimum').length
  return { changes, prices, modules: [...new Set(changes.map((c) => c.moduleId).filter((m) => !m.startsWith('_')))], mrr: Math.round(changes.reduce((sum, c) => sum + c.mrr, 0)) }
}
export const draftChangeCount = (s: BillingState) => (s.draft ? diffPricing(s, s.draft).changes.length : 0)

/* ---------- Publish ---------- */
export function publishDraft(actor: string, opts: { effectiveFrom: string; note: string }): { ok: boolean; message: string } {
  const s = getBilling(); const d = s.draft; if (!d) return { ok: false, message: 'There is no draft to publish.' }
  const issues = validateSnapshot(d, s).filter((i) => i.level === 'error')
  if (issues.length) return { ok: false, message: `${issues.length} validation error${issues.length > 1 ? 's' : ''} must be fixed first.` }
  const diff = diffPricing(s, d); if (!diff.changes.length) return { ok: false, message: 'The draft has no changes.' }
  const when = opts.effectiveFrom || iso(TODAY); const scheduled = when > iso(TODAY); const release = s.pricingRelease + 1
  const at = iso(TODAY) + 'T' + String(9 + (s.priceHistory.length % 9)).padStart(2, '0') + ':00'
  const history: PriceHistoryEntry[] = diff.changes.slice(0, 300).map((c) => ({ id: nid('ph'), at, by: actor, moduleId: c.moduleId, kind: c.kind, label: c.label, from: c.from, to: c.to, effectiveFrom: c.kind === 'availability' ? iso(TODAY) : when, release, note: opts.note }))
  const strip = (r: ModulePrice): ModulePrice => { const { availability, ...rest } = r; void availability; return rest }
  const changedRates = d.rates.filter((r) => { const live = s.modulePrices.find((x) => x.moduleId === r.moduleId); return !live || !same(strip(r), live) })
  // Availability is structural, so it always applies immediately; price and rule changes follow the effective date.
  let next: BillingState = s
  for (const r of d.rates) for (const [planId, to] of Object.entries(r.availability ?? {})) if (availabilityOf(next, r.moduleId, planId).state !== to) next = applyAvailability(next, r.moduleId, planId, to as Availability)
  const snapshot: PricingSnapshot = { rates: changedRates.map(strip), bundles: d.bundles, starterMinimum: d.starterMinimum }
  if (scheduled) {
    next = { ...next, scheduled: [...next.scheduled, { ...snapshot, id: nid('sch'), effectiveFrom: when, createdAt: iso(TODAY), by: actor, note: opts.note, summary: `${diff.prices} price${diff.prices === 1 ? '' : 's'} changed · ${diff.changes.length} change${diff.changes.length === 1 ? '' : 's'}`, status: 'scheduled' }] }
  } else {
    next = { ...next, modulePrices: next.modulePrices.map((r) => changedRates.find((x) => x.moduleId === r.moduleId) ? strip(changedRates.find((x) => x.moduleId === r.moduleId)!) : r).concat(changedRates.filter((x) => !next.modulePrices.some((r) => r.moduleId === x.moduleId)).map(strip)), bundles: d.bundles, starterMinimum: d.starterMinimum }
  }
  setBilling(() => ({ ...next, draft: null, pricingRelease: release, priceHistory: [...history, ...next.priceHistory].slice(0, 600) }))
  logAudit(actor, 'Platform', `Published module pricing release ${release}${scheduled ? ` (effective ${when})` : ''}`, `Release ${release - 1}`, `${diff.prices} prices changed · ${diff.changes.length} changes${opts.note ? ` · ${opts.note}` : ''}`)
  return { ok: true, message: scheduled ? `Release ${release} scheduled for ${when}.` : `Release ${release} is live. Onboarding and quotes now use the new prices.` }
}
export function cancelScheduled(actor: string, id: string) {
  const c = getBilling().scheduled.find((x) => x.id === id); if (!c) return
  setBilling((s) => ({ ...s, scheduled: s.scheduled.map((x) => (x.id === id ? { ...x, status: 'cancelled' as const } : x)) }))
  logAudit(actor, 'Platform', `Cancelled scheduled price change (${c.effectiveFrom})`, c.summary, 'Cancelled')
}

/* ---------- CSV ---------- */
const esc = (v: string | number | boolean | null | undefined) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
export const CSV_HEAD = ['module_id', 'module_name', 'band_id', 'band_label', 'min_employees', 'max_employees', 'custom', 'currency', 'monthly', 'annual', 'cost_monthly', 'cost_annual']
export function exportCsv(rates: ModulePrice[]) {
  const rows = [CSV_HEAD.join(',')]
  for (const r of rates) for (const b of r.bands) for (const code of CURRENCY_CODES) rows.push([r.moduleId, moduleById(r.moduleId)?.name, b.id, b.label, b.minEmployees, b.maxEmployees ?? '', !!b.custom, code, b.prices[code]?.monthly ?? 0, b.prices[code]?.annual ?? 0, b.costs[code]?.monthly ?? 0, b.costs[code]?.annual ?? 0].map(esc).join(','))
  return rows.join('\n')
}
const parseCsv = (text: string) => {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false; else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim())) rows.push(row); row = [] }
    else cell += c
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row)
  return rows
}
/** Import band prices from CSV into the draft. Returns what changed and what was rejected. */
export function importCsv(by: string, text: string): { updated: number; created: number; errors: string[] } {
  const rows = parseCsv(text.trim()); const errors: string[] = []; let updated = 0; let created = 0
  if (rows.length < 2) return { updated, created, errors: ['The file has no data rows.'] }
  const head = rows[0].map((h) => h.trim().toLowerCase()); const col = (n: string) => head.indexOf(n)
  const missing = ['module_id', 'band_id', 'currency', 'monthly', 'annual'].filter((n) => col(n) < 0)
  if (missing.length) return { updated, created, errors: [`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`] }
  const num = (v: string | undefined) => { const n = Number((v ?? '').replace(/[,\s]/g, '')); return Number.isFinite(n) && (v ?? '').trim() !== '' ? n : NaN }
  const valid = new Set(MODULES.map((m) => m.id)); const touched = new Set<string>()
  editDraft(by, (d) => {
    const rates = clone(d.rates)
    rows.slice(1).forEach((r, i) => {
      const line = i + 2; const get = (n: string) => (col(n) < 0 ? '' : (r[col(n)] ?? '').trim())
      const mid = get('module_id'); const code = get('currency').toUpperCase()
      if (!valid.has(mid)) { errors.push(`Line ${line}: unknown module "${mid}".`); return }
      if (!CURRENCY_CODES.includes(code)) { errors.push(`Line ${line}: unsupported currency "${code}".`); return }
      const monthly = num(get('monthly')); const annual = num(get('annual'))
      if (Number.isNaN(monthly) || Number.isNaN(annual) || monthly < 0 || annual < 0) { errors.push(`Line ${line}: monthly and annual must be non-negative numbers.`); return }
      let rate = rates.find((x) => x.moduleId === mid); if (!rate) { rate = blankRate(mid); rates.push(rate) }
      let band = rate.bands.find((b) => b.id === get('band_id'))
      if (!band) {
        band = { id: get('band_id') || nid('band'), label: get('band_label') || 'Imported band', minEmployees: num(get('min_employees')) || 1, maxEmployees: get('max_employees') === '' ? null : num(get('max_employees')), prices: moduleMoney(0), costs: moduleMoney(0), custom: get('custom').toLowerCase() === 'true' }
        rate.bands.push(band); created++
      } else if (col('custom') >= 0) {
        band.custom = get('custom').toLowerCase() === 'true'
        if (col('min_employees') >= 0 && !Number.isNaN(num(get('min_employees')))) band.minEmployees = num(get('min_employees'))
        if (col('max_employees') >= 0) band.maxEmployees = get('max_employees') === '' ? null : num(get('max_employees'))
        if (col('band_label') >= 0 && get('band_label')) band.label = get('band_label')
      }
      band.prices[code] = { monthly, annual }
      if (col('cost_monthly') >= 0 && !Number.isNaN(num(get('cost_monthly')))) band.costs[code] = { monthly: num(get('cost_monthly')), annual: Number.isNaN(num(get('cost_annual'))) ? 0 : num(get('cost_annual')) }
      if (code !== 'NGN' && !(rate.overrides ?? []).includes(code)) {
        const auto = fx(code, band.prices.NGN?.monthly ?? 0)
        if (Math.abs(auto - monthly) > 0.01) rate.overrides = [...(rate.overrides ?? []), code]
      }
      touched.add(`${mid}:${band.id}:${code}`); updated++
    })
    return { ...d, rates: rates.map((r) => (touched.size && [...touched].some((t) => t.startsWith(r.moduleId + ':')) ? rederive(r) : r)) }
  })
  return { updated, created, errors }
}

export const groupName = (id: string) => GROUPS.find((g) => g.id === id)?.name ?? id
export type { Bundle }
