import crypto from 'crypto'

const COST_FACTOR = 16384   // N: 2^14 (scrypt 표준값, 반드시 2의 거듭제곱)
const KEY_LENGTH  = 64

/**
 * 패스워드 해싱 (scryptSync 기반)
 */
export function hashPassword(password: string, salt: string): string {
  return crypto
    .scryptSync(password, salt, KEY_LENGTH, { N: COST_FACTOR })
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
  // timing-safe compare (길이 불일치 시 false)
  try {
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'))
  } catch {
    return false
  }
}
