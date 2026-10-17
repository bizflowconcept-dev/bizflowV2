import { useSyncExternalStore } from 'react'
import { recordAudit } from '../tenant/store'
import { branchesForTenant, employeesForTenant, isOwnDataset } from '../data/demo'

export type Site = { id: string; name: string; lat: number; lng: number }
export type Rules = { start: string; grace: number; radius: number }
export type Stamp = { t: string; site: string; inside: boolean; lat: number; lng: number; accuracy: number; distance: number | null; source: 'GPS' | 'Simulated' }
export type Device = { id: string; label: string; known: boolean }
export type Review = { status: 'Pending' | 'Verified' | 'Rejected'; by?: string; at?: string; note?: string }
export type Rec = {
  id: string; empId: string; name: string; dept: string; date: string
  in: Stamp & { selfie?: string; selfieSource: 'Camera' | 'Simulated' | 'None'; device: Device; reason?: string }
  out?: Stamp
  status: 'On time' | 'Late'; minutesLate: number; flags: string[]; review?: Review
}
type State = { rules: Record<string, Rules>; records: Record<string, Rec[]>; devices: Record<string, string[]>; sites: Record<string, Site[]> }

const KEY = 'bizflow.attendance.v1'
export const DEFAULT_RULES: Rules = { start: '08:30', grace: 15, radius: 150 }
const COORDS: [RegExp, number, number][] = [[/abuja/i, 9.0579, 7.4951], [/port|ph\b/i, 4.8156, 7.0498], [/ibadan/i, 7.3775, 3.947], [/ikeja/i, 6.6018, 3.3515], [/lagos|victoria/i, 6.4281, 3.4219]]
export const sitesFor = (slug: string): Site[] => isOwnDataset(slug) ? (state.sites[slug] ?? []) : branchesForTenant(slug).filter((b) => b !== 'Company').map((name) => {
  const c = COORDS.find(([re]) => re.test(name)) ?? COORDS[COORDS.length - 1]
  return { id: name, name, lat: c[1], lng: c[2] }
})

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hm = (d: Date) => d.getHours() * 60 + d.getMinutes()
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })
export const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
export const nearest = (sites: Site[], p: { lat: number; lng: number }) => sites.map((s) => ({ s, d: haversine(s, p) })).sort((x, y) => x.d - y.d)[0]

export function deviceInfo(): { id: string; label: string } {
  let id = localStorage.getItem('bizflow.deviceId')
  if (!id) { id = `DV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; localStorage.setItem('bizflow.deviceId', id) }
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS'
  return { id, label: `${browser} on ${os} · ${screen.width}×${screen.height}` }
}

const seed = (slug: string): Rec[] => {
  if (isOwnDataset(slug)) return [] // self-serve companies start with no sample check-ins
  const date = todayKey()
  const sites = sitesFor(slug)
  const emps = employeesForTenant(slug).filter((e) => e.status === 'Active').slice(0, 9)
  const phones = ['Chrome on Android · 412×915', 'Safari on iOS · 390×844', 'Chrome on Windows · 1920×1080']
  return emps.flatMap((e, i): Rec[] => {
    if (e.mode === 'Remote' || i === 6) return []
    const site = sites.find((s) => e.branch.includes(s.name.split(' ')[0])) ?? sites[0]
    const min = 7 * 60 + 52 + ((i * 11) % 40) + (i === 3 ? 20 : 0)
    const t = new Date(); t.setHours(Math.floor(min / 60), min % 60, 0, 0)
    const late = Math.max(0, min - (8 * 60 + 30 + 15))
    const off = i === 4
    const flags = [...(off ? ['Outside geofence'] : []), ...(i === 5 ? ['New device'] : [])]
    return [{
      id: `ATT-S${i}`, empId: e.id, name: e.name, dept: e.dept, date,
      in: { t: t.toISOString(), site: off ? 'Off-site · Ikeja' : site.name, inside: !off, lat: site.lat, lng: site.lng, accuracy: 12 + i * 3, distance: off ? 4200 : 20 + i * 9, source: 'GPS', selfieSource: 'None', device: { id: `DV-S${i}`, label: phones[i % 3], known: i !== 5 }, reason: off ? 'Client site visit, meeting at the Ikeja depot.' : undefined },
      status: late ? 'Late' : 'On time', minutesLate: late, flags, review: flags.length ? { status: 'Pending' } : undefined,
    }]
  })
}

const load = (): State => { try { return { rules: {}, records: {}, devices: {}, sites: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { rules: {}, records: {}, devices: {}, sites: {} } } }
let state = load()
const subs = new Set<() => void>()
const commit = (n: State) => { state = n; try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* quota */ } subs.forEach((f) => f()) }
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

const recordsOf = (slug: string): Rec[] => {
  const all = state.records[slug]
  if (all && all.some((r) => r.date === todayKey())) return all
  if (all) return [...seed(slug), ...all.filter((r) => r.date !== todayKey())]
  return seed(slug)
}
export function useAttendance(slug: string) {
  useSyncExternalStore(sub, () => state)
  return { records: recordsOf(slug), rules: state.rules[slug] ?? DEFAULT_RULES, sites: sitesFor(slug) }
}

export function addSite(slug: string, site: { name: string; lat: number; lng: number }) {
  const s: Site = { id: `${site.name}-${Date.now().toString(36)}`, ...site }
  commit({ ...state, sites: { ...state.sites, [slug]: [...(state.sites[slug] ?? []), s] } })
  recordAudit(slug, 'Attendance site added', undefined, site.name, { category: 'Attendance', ref: 'Attendance sites' })
}
export function removeSite(slug: string, id: string) {
  const cur = (state.sites[slug] ?? []).find((x) => x.id === id)
  commit({ ...state, sites: { ...state.sites, [slug]: (state.sites[slug] ?? []).filter((x) => x.id !== id) } })
  if (cur) recordAudit(slug, 'Attendance site removed', cur.name, undefined, { category: 'Attendance', ref: 'Attendance sites' })
}

export function saveRules(slug: string, rules: Rules) {
  const prev = state.rules[slug] ?? DEFAULT_RULES
  commit({ ...state, rules: { ...state.rules, [slug]: rules } })
  recordAudit(slug, 'Attendance rules updated', `${prev.start} +${prev.grace}m, ${prev.radius}m`, `${rules.start} +${rules.grace}m, ${rules.radius}m`, { category: 'Attendance', ref: 'Attendance rules' })
}

export type ClockIn = { empId: string; name: string; dept: string; stamp: Stamp; selfie?: string; selfieSource: 'Camera' | 'Simulated' | 'None'; reason?: string }
export function clockIn(slug: string, c: ClockIn): Rec {
  const rules = state.rules[slug] ?? DEFAULT_RULES
  const d = deviceInfo()
  const known = state.devices[c.empId] ?? []
  const isKnown = known.length === 0 || known.includes(d.id)
  const [h, m] = rules.start.split(':').map(Number)
  const minutesLate = Math.max(0, hm(new Date(c.stamp.t)) - (h * 60 + m + rules.grace))
  const flags = [...(c.stamp.inside ? [] : ['Outside geofence']), ...(isKnown ? [] : ['New device']), ...(c.stamp.source === 'Simulated' || c.selfieSource === 'Simulated' ? ['Simulated capture'] : [])]
  const rec: Rec = {
    id: `ATT-${Date.now().toString(36).toUpperCase()}`, empId: c.empId, name: c.name, dept: c.dept, date: todayKey(),
    in: { ...c.stamp, selfie: c.selfie, selfieSource: c.selfieSource, device: { id: d.id, label: d.label, known: isKnown }, reason: c.reason },
    status: minutesLate ? 'Late' : 'On time', minutesLate, flags, review: flags.length ? { status: 'Pending' } : undefined,
  }
  commit({ ...state, records: { ...state.records, [slug]: [rec, ...recordsOf(slug)] }, devices: { ...state.devices, [c.empId]: known.length ? known : [d.id] } })
  recordAudit(slug, `Attendance: ${c.name} clocked in at ${c.stamp.site}`, undefined, flags.length ? flags.join(', ') : 'Verified automatically', { category: 'Attendance', ref: rec.id, actor: c.name, department: c.dept, actorId: c.empId })
  return rec
}
export function clockOut(slug: string, id: string, stamp: Stamp) {
  const rec = recordsOf(slug).find((r) => r.id === id)
  commit({ ...state, records: { ...state.records, [slug]: recordsOf(slug).map((r) => r.id === id ? { ...r, out: stamp } : r) } })
  if (rec) recordAudit(slug, `Attendance: ${rec.name} clocked out at ${stamp.site}`, undefined, stamp.inside ? 'Inside geofence' : 'Outside geofence', { category: 'Attendance', ref: id, actor: rec.name, department: rec.dept, actorId: rec.empId })
}
export function reviewRecord(slug: string, id: string, status: 'Verified' | 'Rejected', by: string, note: string) {
  const rec = recordsOf(slug).find((r) => r.id === id)
  commit({ ...state, records: { ...state.records, [slug]: recordsOf(slug).map((r) => r.id === id ? { ...r, review: { status, by, at: new Date().toISOString(), note } } : r) } })
  if (rec) recordAudit(slug, `Attendance ${status.toLowerCase()}: ${rec.name}, ${rec.date}`, rec.flags.join(', '), note || undefined, { category: 'Attendance', ref: id, result: status === 'Rejected' ? 'Failed' : 'Success' })
}
