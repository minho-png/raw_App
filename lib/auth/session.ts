import crypto from 'crypto'
import type { SessionPayload } from '@/types/auth'

const COOKIE_NAME = 'ct_session'
const SESSION_TTL  = 60 * 60 * 24 * 7  // 7일 (초)

function getSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다.')
  return s
}

/**
 * SessionPayload → 서명된 쿠키 값 생성
 * 형식: base64(JSON) . HMAC-SHA256(base64(JSON))
 */
export function createSessionToken(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig  = crypto
    .createHmac('sha256', getSecret())
    .update(data)
    .digest('hex')
  return `${data}.${sig}`
}

/**
 * 쿠키 값 → SessionPayload | null
 * 서명 검증 실패 또는 만료 시 null 반환
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [data, sig] = token.split('.')
    if (!data || !sig) return null

    const expected = crypto
      .createHmac('sha256', getSecret())
      .update(data)
      .digest('hex')

    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
      return null
    }

    const payload: SessionPayload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8'),
    )

    // 만료 체크
    const age = Math.floor(Date.now() / 1000) - payload.issuedAt
    if (age > SESSION_TTL) return null

    return payload
  } catch {
    return null
  }
}

export { COOKIE_NAME }
