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
    const data = await fetchMe()
    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof OpenApiError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.status },
      )
    }
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: { code: 'INTERNAL', message } },
      { status: 500 },
    )
  }
}
