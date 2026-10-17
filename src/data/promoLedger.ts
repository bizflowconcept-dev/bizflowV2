/* Promotion redemption ledger: pure data + helpers (no store access, so billing.ts can import it safely).
   The platform's only demo company is eTranzact International Plc; do not add other customers here. */

export type KycState = 'verified' | 'pending' | 'missing' | 'failed'
export type KycItem = { state: KycState; ref?: string }
export type Kyc = { cac: KycItem; tin: KycItem; director: KycItem; address: KycItem }
export const KYC_KEYS: { key: keyof Kyc; label: string }[] = [
  { key: 'cac', label: 'CAC / RC number' }, { key: 'tin', label: 'Tax ID (TIN)' }, { key: 'director', label: 'Director / owner ID' }, { key: 'address', label: 'Business address' },
]
export type CompanyProfile = {
  contact: { name: string; role: string; email: string; phone: string }
  industry: string; size: string; state: string; referrer: string
  consent: { marketing: boolean; basis: string; recordedAt: string }
  kyc: Kyc
}
export type Redemption = {
  id: string; promoId: string; promoName: string; code?: string; subId: string; company: string; at: string
  planId: string; cycle: 'monthly' | 'annual'; currency: string; employees: number
  list: number; discount: number; net: number; trial: boolean; channel: string; source: string
  status: 'applied' | 'reversed'; reversedAt?: string; reversedBy?: string; reason?: string
  profile: CompanyProfile
}
export type PromoList = { id: string; name: string; purpose: string; subIds: string[]; createdAt: string; by: string }
export type PromoCrm = { lists: PromoList[]; tags: Record<string, string[]> }

export const CHANNELS = ['Website checkout', 'Email campaign', 'Partner / referral', 'Sales-assisted', 'In-app', 'Social', 'Event'] as const

const blankKyc = (): Kyc => ({ cac: { state: 'missing' }, tin: { state: 'missing' }, director: { state: 'missing' }, address: { state: 'missing' } })
export const blankProfile = (): CompanyProfile => ({
  contact: { name: '', role: '', email: '', phone: '' }, industry: '', size: '', state: '', referrer: 'Direct',
  consent: { marketing: false, basis: 'Not recorded', recordedAt: '' }, kyc: blankKyc(),
})
/** Mirrors the eTranzact workspace profile held in the tenant store. */
export const ETRANZACT_PROFILE = (): CompanyProfile => ({
  contact: { name: 'Morenike Adebayo', role: 'Company Administrator', email: 'admin.demo@etranzact.com', phone: '+234 1 270 1060' },
  industry: 'Financial Technology & Payments', size: '201–500', state: 'Lagos', referrer: 'Pricing page',
  consent: { marketing: true, basis: 'Opt-in at checkout', recordedAt: '2026-02-16' },
  kyc: { cac: { state: 'verified', ref: 'RC 657256' }, tin: { state: 'pending' }, director: { state: 'verified', ref: 'Oladapo Adebayo (MD)' }, address: { state: 'verified' } },
})
export const profileFor = (subId: string): CompanyProfile => (subId === 'c-etranzact' ? ETRANZACT_PROFILE() : blankProfile())
export const kycScore = (k: Kyc) => KYC_KEYS.filter((x) => k[x.key].state === 'verified').length
export const kycComplete = (k: Kyc) => kycScore(k) === KYC_KEYS.length

/** Seed: eTranzact redeemed WELCOME10 on its Enterprise annual subscription (list 20,555,556, 10% off, net 18,500,000). */
export const seedLedger = (startedAt: string): Redemption[] => [{
  id: 'rd-seed-1', promoId: 'pr1', promoName: 'Welcome offer', code: 'WELCOME10', subId: 'c-etranzact', company: 'eTranzact International Plc', at: startedAt,
  planId: 'enterprise', cycle: 'annual', currency: 'NGN', employees: 486, list: 20555556, discount: 2055556, net: 18500000, trial: false,
  channel: 'Website checkout', source: 'Pricing page → checkout', status: 'applied', profile: ETRANZACT_PROFILE(),
}]
export const seedCrm = (): PromoCrm => ({ lists: [], tags: {} })

/** Derive each promo's redeemed counter from the ledger so the numbers always agree. */
export function reconcile<S extends { promos: { id: string; redeemed: number }[]; redemptions?: Redemption[] }>(s: S): S {
  const n = new Map<string, number>()
  for (const r of s.redemptions ?? []) if (r.status === 'applied') n.set(r.promoId, (n.get(r.promoId) ?? 0) + 1)
  return { ...s, promos: s.promos.map((p) => ({ ...p, redeemed: n.get(p.id) ?? 0 })) }
}
