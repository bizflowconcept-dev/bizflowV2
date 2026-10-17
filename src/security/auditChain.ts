import { auditHash, recordAudit } from '../tenant/store'
import type { AuditEntry } from '../tenant/store'

/* ---------- Chain verification ----------
   Every audit entry written since the chain was introduced carries `prevHash` (the hash of the entry before it) and `hash`
   (a checksum over prevHash plus the entry's own fields). Older demo entries carry neither and are reported as "unchained". */

export type ChainBreak = { kind: 'mismatch' | 'link'; id: string; seq?: number; at: string; position: number; expected: string; actual: string; message: string }
export type ChainReport = {
  ok: boolean; checked: number; unchained: number; total: number; head: string; oldest?: string; newest?: string
  firstBreak?: ChainBreak; restarts: number; verifiedAt: string
}

/** Chained entries in write order (oldest first). Order comes from the write sequence, falling back to the stored order. */
const chained = (entries: AuditEntry[]) =>
  entries.map((e, i) => ({ e, i })).filter(({ e }) => !!e.hash)
    .sort((a, b) => (a.e.seq ?? 0) - (b.e.seq ?? 0) || b.i - a.i).map(({ e }) => e)

export function verifyChain(entries: AuditEntry[]): ChainReport {
  const list = chained(entries)
  const report: ChainReport = { ok: true, checked: 0, unchained: entries.length - list.length, total: entries.length, head: list.length ? list[list.length - 1].hash! : 'GENESIS', oldest: list[0]?.at, newest: list[list.length - 1]?.at, restarts: 0, verifiedAt: new Date().toISOString() }
  let previous: AuditEntry | undefined
  for (let position = 0; position < list.length; position++) {
    const e = list[position]
    report.checked++
    const recomputed = auditHash(e.prevHash ?? 'GENESIS', e)
    if (recomputed !== e.hash) {
      report.ok = false
      report.firstBreak = { kind: 'mismatch', id: e.id, seq: e.seq, at: e.at, position, expected: recomputed, actual: e.hash!, message: `Entry ${e.id} was altered after it was written: its fields no longer produce the recorded hash.` }
      return report
    }
    if (previous && e.prevHash !== previous.hash) {
      if (e.prevHash === 'GENESIS') report.restarts++ /* an older write path restarted the chain; tolerated, but counted */
      else {
        report.ok = false
        report.firstBreak = { kind: 'link', id: e.id, seq: e.seq, at: e.at, position, expected: previous.hash!, actual: e.prevHash ?? '', message: `Entry ${e.id} does not follow ${previous.id}: an entry between them was removed, inserted or reordered.` }
        return report
      }
    }
    previous = e
  }
  return report
}

/** Self-test: copies the log, alters one entry and removes another, and proves the verifier reports each. Never touches stored data. */
export function chainSelfTest(entries: AuditEntry[]): { tamper: ChainReport; removal: ChainReport } | null {
  const list = chained(entries)
  if (list.length < 3) return null
  const mid = list[Math.floor(list.length / 2)]
  const tamper = verifyChain(entries.map((e) => (e.id === mid.id ? { ...e, action: `${e.action} (edited)` } : e)))
  const removal = verifyChain(entries.filter((e) => e.id !== mid.id))
  return { tamper, removal }
}

/* ---------- Signed report ---------- */
const enc = new TextEncoder()
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
export const sha256 = async (data: string | Uint8Array) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : (data as Uint8Array<ArrayBuffer>)))
const KEY_STORE = 'bf-audit-signing-key-v1'
/** Demo signing key: 32 random bytes kept in this browser. A production deployment would sign with a KMS-held key. */
function signingKeyHex() {
  let key = ''
  try { key = localStorage.getItem(KEY_STORE) || '' } catch { /* storage unavailable */ }
  if (!/^[0-9a-f]{64}$/.test(key)) {
    key = hex(crypto.getRandomValues(new Uint8Array(32)).buffer)
    try { localStorage.setItem(KEY_STORE, key) } catch { /* use for this session only */ }
  }
  return key
}
const hmacKey = async (keyHex: string, usage: 'sign' | 'verify') => crypto.subtle.importKey('raw', new Uint8Array(keyHex.match(/../g)!.map((b) => parseInt(b, 16))), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
export const hmacSha256 = async (message: string, keyHex = signingKeyHex()) => hex(await crypto.subtle.sign('HMAC', await hmacKey(keyHex, 'sign'), enc.encode(message)))
export const keyId = async () => (await sha256(signingKeyHex())).slice(0, 12)

const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`
export const AUDIT_CSV_HEAD = ['seq', 'id', 'at', 'scope', 'tenant', 'actor', 'role', 'department', 'category', 'action', 'from', 'to', 'ref', 'result', 'device', 'prev_hash', 'hash']
export const auditCsv = (rows: AuditEntry[]) => [AUDIT_CSV_HEAD.map(q).join(','), ...rows.map((r) => [r.seq, r.id, r.at, r.scope, r.tenant, r.actor, r.role, r.department, r.category, r.action, r.from, r.to, r.ref, r.result, r.device, r.prevHash, r.hash].map(q).join(','))].join('\n') + '\n'

export type ReportManifest = {
  format: 'bizflow-audit-report/1'; reportId: string; generatedAt: string; generatedBy: string; generatedByRole: string
  range: { from: string | null; to: string | null }; filters: Record<string, string>; rowCount: number
  chain: { head: string; verified: boolean; checked: number; unchained: number; firstBreak: string | null }
  file: { name: string; bytes: number; sha256: string }
  digest: { algorithm: 'HMAC-SHA-256'; keyId: string; value: string; signs: string }
}
const canonical = (m: Omit<ReportManifest, 'digest'>) => JSON.stringify(m)

export async function buildSignedReport(rows: AuditEntry[], all: AuditEntry[], meta: { by: string; role: string; filters: Record<string, string> }) {
  const sorted = [...rows].sort((a, b) => a.at.localeCompare(b.at))
  const csv = auditCsv(sorted)
  const bytes = enc.encode(csv)
  const chain = verifyChain(all)
  const reportId = `AUD-${Date.now().toString(36).toUpperCase()}`
  const body: Omit<ReportManifest, 'digest'> = {
    format: 'bizflow-audit-report/1', reportId, generatedAt: new Date().toISOString(), generatedBy: meta.by, generatedByRole: meta.role,
    range: { from: sorted[0]?.at ?? null, to: sorted[sorted.length - 1]?.at ?? null }, filters: meta.filters, rowCount: sorted.length,
    chain: { head: chain.head, verified: chain.ok, checked: chain.checked, unchained: chain.unchained, firstBreak: chain.firstBreak?.id ?? null },
    file: { name: `bizflow-audit-${reportId}.csv`, bytes: bytes.length, sha256: await sha256(bytes) },
  }
  const signs = canonical(body)
  const manifest: ReportManifest = { ...body, digest: { algorithm: 'HMAC-SHA-256', keyId: await keyId(), value: await hmacSha256(signs), signs: 'canonical JSON of every other manifest field' } }
  recordAudit('platform', 'Signed audit report exported', reportId, `${sorted.length} rows · chain ${chain.ok ? 'verified' : 'BROKEN'} · head ${chain.head}`, { scope: 'Platform', category: 'Security', ref: reportId })
  return { csv, csvName: body.file.name, manifest, manifestName: `bizflow-audit-${reportId}.manifest.json`, manifestJson: JSON.stringify(manifest, null, 2) }
}

export type VerifyOutcome = { ok: boolean; checks: { label: string; ok: boolean; detail: string }[] }
/** Re-check an exported CSV against its manifest: file digest, row count and HMAC signature (only possible with the signing key held in this browser). */
export async function verifyReportFiles(csvText: string, manifestText: string): Promise<VerifyOutcome> {
  const checks: VerifyOutcome['checks'] = []
  let m: ReportManifest
  try { m = JSON.parse(manifestText) } catch { return { ok: false, checks: [{ label: 'Manifest is valid JSON', ok: false, detail: 'The manifest could not be parsed.' }] } }
  const fileHash = await sha256(csvText)
  checks.push({ label: 'CSV SHA-256 matches the manifest', ok: fileHash === m.file?.sha256, detail: fileHash === m.file?.sha256 ? fileHash.slice(0, 16) + '…' : `file is ${fileHash.slice(0, 16)}…, manifest says ${String(m.file?.sha256).slice(0, 16)}…` })
  const rowCount = Math.max(0, csvText.split('\n').filter(Boolean).length - 1)
  checks.push({ label: 'Row count matches', ok: rowCount === m.rowCount, detail: `${rowCount} rows in file, ${m.rowCount} in manifest` })
  const { digest, ...rest } = m
  const expected = await hmacSha256(canonical(rest))
  const keyMatches = digest?.keyId === (await keyId())
  checks.push({ label: 'HMAC signature is valid', ok: keyMatches && expected === digest?.value, detail: keyMatches ? (expected === digest?.value ? `Signed with key ${digest.keyId}` : 'The manifest was altered after signing.') : `Signed with key ${digest?.keyId}, which is not held in this browser, so the signature cannot be checked here.` })
  return { ok: checks.every((c) => c.ok), checks }
}
