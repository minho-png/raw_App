"use client"

/**
 * Open API 토큰 헬스체크 hook — `/api/open-api/me` 호출.
 *
 * 모듈 싱글톤 스토어 패턴 (프론트 리뷰 ⑤ 반영):
 *  - 전역 in-flight dedup + TTL 캐시 → 4개 정산 페이지가 badge 를 각각 mount 해도
 *    실제 `/me` 호출은 1회 (페이지 전환·동시 mount 시 중복 제거).
 *  - `revalidate()` 노출 + window `focus`/`online` 이벤트 → 사용자가 토큰을 추가/교체한 뒤
 *    새로고침 없이 회복 가능 (mount 1회 고착 문제 해결).
 *  - 자동 폴링은 하지 않음 — 헬스 상태는 토큰 발급/폐기 시점에만 바뀜
 *    (AGENTS.md §4 Two-Strike Rule 정신 — 무한 재시도 금지).
 */

import { useEffect, useReducer } from 'react'
import type { MeHealthResponse } from '@/lib/openApi/types'
import { mapHealthStatus, type OpenApiHealthStatus } from '@/lib/openApi/health'

export type { OpenApiHealthStatus }

type Identity = MeHealthResponse['data']

interface State {
  status: OpenApiHealthStatus
  identity: Identity | null
  errorCode: string | null
  errorMessage: string | null
}

export interface UseOpenApiHealthResult extends State {
  /** 강제 재조회 (TTL 무시). badge 클릭·수동 새로고침용. */
  revalidate: () => void
}

// ── 모듈 싱글톤 스토어 ────────────────────────────────────────
const TTL_MS = 60_000  // 60초 내 재요청은 캐시 사용 (focus 연타 방어)

let cache: State = { status: 'idle', identity: null, errorCode: null, errorMessage: null }
let lastFetched = 0
let inflight: Promise<void> | null = null
const subscribers = new Set<() => void>()

function notify() {
  for (const fn of subscribers) fn()
}

function setCache(next: State) {
  cache = next
  notify()
}

async function load(force: boolean): Promise<void> {
  if (inflight) return inflight
  if (!force && cache.status !== 'idle' && Date.now() - lastFetched < TTL_MS) return

  if (cache.status === 'idle') setCache({ ...cache, status: 'loading' })

  inflight = (async () => {
    try {
      const res = await fetch('/api/open-api/me', { cache: 'no-store' })
      const body = await res.json().catch(() => ({} as Record<string, unknown>))

      if (res.ok) {
        const identity = (body as MeHealthResponse).data ?? null
        setCache({ status: 'ok', identity, errorCode: null, errorMessage: null })
      } else {
        const errBody = body as { error?: { code?: string; message?: string } }
        const code = errBody.error?.code ?? `HTTP_${res.status}`
        const message = errBody.error?.message ?? `Open API ${res.status}`
        const status = mapHealthStatus(res.status, errBody.error?.code)
        setCache({ status, identity: null, errorCode: code, errorMessage: message })
      }
    } catch (e) {
      // 브라우저 → proxy fetch 자체 실패 (오프라인 등) — network 로 분류.
      const message = e instanceof Error ? e.message : String(e)
      setCache({ status: 'network', identity: null, errorCode: 'NETWORK', errorMessage: message })
    } finally {
      lastFetched = Date.now()
      inflight = null
    }
  })()
  return inflight
}

export function useOpenApiHealth(): UseOpenApiHealthResult {
  const [, forceRender] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    const sub = () => forceRender()
    subscribers.add(sub)
    void load(false)

    const onWake = () => { void load(false) }
    window.addEventListener('focus', onWake)
    window.addEventListener('online', onWake)
    return () => {
      subscribers.delete(sub)
      window.removeEventListener('focus', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [])

  return { ...cache, revalidate: () => { void load(true) } }
}
