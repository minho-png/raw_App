/**
 * Crosstarget Open API `/me` proxy — 토큰 헬스체크.
 *
 * 토큰 노출 방지 + 에러 정규화. 클라이언트(useOpenApiHealth) 는 본 endpoint
 * 응답으로 status badge 표시.
 *
 * 응답 코드 매핑 (가이드 §2 + client.ts):
 *   200: ok           — 토큰 유효
 *   401: unauthorized — 토큰 무효 / 만료 / 폐기
 *   403: forbidden    — DSP 권한 없음
 *   503: token_missing— OPEN_API_TOKEN env 미설정
 */

import { NextResponse } from 'next/server'
import { fetchMe } from '@/lib/openApi/meService'
import { OpenApiError } from '@/lib/openApi/client'

export async function GET() {
  try {
    const me = await fetchMe()
    // PII 최소화 (보안 리뷰 ⑦) — badge 는 mb_id/name 만 사용.
    // email/roles/permissions 는 브라우저로 내려보내지 않는다 (권한 추론 공격 표면 축소).
    // 권한 판정이 필요해지면 서버 측에서 me.data.permissions 를 직접 사용.
    return NextResponse.json({
      data: { mb_id: me.data.mb_id, name: me.data.name },
    })
  } catch (err) {
    if (err instanceof OpenApiError) {
      // 관측 (운영 리뷰 ⑩) — Vercel Functions Log 자동 수집. 토큰 값은 미포함.
      console.error('[open-api/me]', { code: err.code, status: err.status })
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error('[open-api/me] INTERNAL', message)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message } },
      { status: 500 },
    )
  }
}
