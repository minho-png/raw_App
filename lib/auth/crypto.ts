import crypto from 'crypto'

const ITERATIONS = 64000
const KEY_LENGTH  = 64
const DIGEST      = 'sha512'

/**
 * 패스워드 해싱 (scryptSync 기반)
 */
export function hashPassword(password: string, salt: string): string {
  return crypto
    .scryptSync(password, salt, KEY_LENGTH, { N: ITERATIONS })
    .toString('hex')
}

export function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function verifyPassword(
  password: string,
  salt: string,
  hash: string,
): boolean {
  const derived = hashPassword(password, salt)
  // timing-safe compare
  if (derived.length !== hash.length) return false
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'))
}
