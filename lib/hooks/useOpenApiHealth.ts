"use client"

/**
 * Open API 토큰 헬스체크 hook — `/api/open-api/me` 호출.
 *
 * 정책:
 *  - 최초 mount 시 1회 호출. autoRefresh 미사용 (헬스 상태는 토큰 발급/폐기
 *    시점에만 바뀜 — 잦은 polling 불필요).
 *  - 503 (TOKEN_MISSING) / 401 / 403 은 각각 다른 badge 색으로 구분.
 *  - 두 번 연속 실패해도 재시도 안 함 — 사용자가 토큰 갱신 후 새로고침으로 회복
 *    (AGENTS.md §4 Two-Strike Rule 정신과 일치 — 무한 폴링 금지).
 */

import { useEffect, useState } from 'react'
import type { MeResponse } from '@/lib/openApi/types'

export type OpenApiHealthStatus =
  | 'idle'
  | 'loading'
  | 'ok'
  | 'token_missing'   // 503 — env 미설정
  | 'unauthorized'    // 401 — 토큰 무효/만료
  | 'forbidden'       // 403 — 권한 부족
  | 'error'           // 그 외 (네트워크 / 5xx)

interface State {
  status: OpenApiHealthStatus
  identity: MeResponse['data'] | null
  errorCode: string | null
  errorMessage: string | null
}

const INITIAL: State = {
  status: 'idle',
  identity: null,
  errorCode: null,
  errorMessage: null,
}

export function useOpenApiHealth(): State {
  const [state, setState] = useState<State>({ ...INITIAL, status: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/open-api/me', { cache: 'no-store' })
        const body = await res.json().catch(() => ({} as Record<string, unknown>))
        if (cancelled) return

        if (res.ok) {
          const identity = (body as MeResponse).data ?? null
          setState({ status: 'ok', identity, errorCode: null, errorMessage: null })
          return
        }

        const errBody = body as { error?: { code?: string; message?: string } }
        const code = errBody.error?.code ?? `HTTP_${res.status}`
        const message = errBody.error?.message ?? `Open API ${res.status}`
        const status: OpenApiHealthStatus =
          code === 'TOKEN_MISSING' || res.status === 503 ? 'token_missing'
          : res.status === 401 ? 'unauthorized'
          : res.status === 403 ? 'forbidden'
          : 'error'
        setState({ status, identity: null, errorCode: code, errorMessage: message })
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : String(e)
        setState({ status: 'error', identity: null, errorCode: 'NETWORK', errorMessage: message })
      }
    })()
    return () => { cancelled = true }
  }, [])

  return state
}
