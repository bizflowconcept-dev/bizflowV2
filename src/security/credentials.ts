/* Password hashing for self-serve administrator accounts.
   PBKDF2 over SHA-256 with a per-account random salt (Web Crypto). Plaintext passwords are never stored or logged. */

export type PasswordRecord = { algo: 'PBKDF2-SHA256'; iterations: number; salt: string; hash: string }

const ITERATIONS = 120_000
const toHex = (bytes: ArrayBuffer | Uint8Array) => Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (hex: string) => new Uint8Array((hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)))

export const cryptoAvailable = () => typeof crypto !== 'undefined' && !!crypto.subtle && !!crypto.getRandomValues

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256))
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  if (!cryptoAvailable()) throw new Error('Secure password storage is not available in this browser. Open BizFlow over HTTPS and try again.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { algo: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toHex(salt), hash: await derive(password, salt, ITERATIONS) }
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  if (!cryptoAvailable() || record.algo !== 'PBKDF2-SHA256') return false
  const candidate = await derive(password, fromHex(record.salt), record.iterations)
  if (candidate.length !== record.hash.length) return false
  let diff = 0
  for (let i = 0; i < candidate.length; i++) diff |= candidate.charCodeAt(i) ^ record.hash.charCodeAt(i)
  return diff === 0
}

/** 0-4 strength score with a human label and what is missing. */
export function passwordStrength(password: string) {
  const checks = [
    { ok: password.length >= 10, label: '10+ characters' },
    { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), label: 'Upper and lower case' },
    { ok: /\d/.test(password), label: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(password), label: 'A symbol' },
  ]
  const score = password.length < 8 ? Math.min(1, checks.filter((c) => c.ok).length) : checks.filter((c) => c.ok).length
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
  return { score, label: password ? labels[score] : '', checks, valid: password.length >= 8 && score >= 2 }
}
