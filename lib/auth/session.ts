/**
 * lib/auth/session.ts
 *
 * Web Crypto API(SubtleCrypto) 기반 세션 토큰 생성/검증.
 * Node.js 18+ / Edge Runtime / 브라우저 모두에서 동작합니다.
 * (Node.js 'crypto' 모듈을 직접 import하지 않습니다)
 */

import type { SessionPayload } from '@/types/auth'

export const COOKIE_NAME = 'ct_session'
const SESSION_TTL = 60 * 60 * 24 * 7  // 7일 (초)

function getSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다.')
  return s
}

// ── Web Crypto 헬퍼 ──────────────────────────────────────────

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret)
  return globalThis.crypto.subtle.importKey(
    'raw', raw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuf(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return arr
}

// ── base64url 헬퍼 ───────────────────────────────────────────

function toBase64url(json: string): string {
  // btoa는 Edge/Node 모두 전역 사용 가능
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(b64: string): string {
  const pad = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padded = pad + '='.repeat((4 - (pad.length % 4)) % 4)
  return atob(padded)
}

// ── 공개 API ────────────────────────────────────────────────

/**
 * SessionPayload → 서명된 쿠키 문자열
 * 형식: base64url(JSON) . hex(HMAC-SHA256)
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const data = toBase64url(JSON.stringify(payload))
  const key  = await importHmacKey(getSecret())
  const sig  = await globalThis.crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(data),
  )
  return `${data}.${bufToHex(sig)}`
}

/**
 * 쿠키 문자열 → SessionPayload | null
 * 서명 불일치 또는 만료 시 null
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const dot = token.lastIndexOf('.')
    if (dot < 1) return null
    const data = token.slice(0, dot)
    const sig  = token.slice(dot + 1)

    const key  = await importHmacKey(getSecret())
    const valid = await globalThis.crypto.subtle.verify(
      'HMAC', key, hexToBuf(sig).buffer as ArrayBuffer, new TextEncoder().encode(data),
    )
    if (!valid) return null

    const payload: SessionPayload = JSON.parse(fromBase64url(data))
    const age = Math.floor(Date.now() / 1000) - payload.issuedAt
    if (age > SESSION_TTL) return null

    return payload
  } catch {
    return null
  }
}
