"use client"

/**
 * Open API 토큰 상태 배지.
 *
 * 정산 페이지의 공통 필터 바(SettlementFilterBar) 우측에 마운트되어
 * 토큰 유효성을 한눈에 확인. 클릭 동작 없음 (정보 표시 전용).
 *
 * 색 정책:
 *   ok            → emerald (정상)
 *   token_missing → amber   (운영자 설정 필요)
 *   unauthorized  → rose    (토큰 무효/만료)
 *   forbidden     → rose    (권한 없음)
 *   error/loading → gray    (네트워크/대기)
 */

import { useOpenApiHealth, type OpenApiHealthStatus } from '@/lib/hooks/useOpenApiHealth'

type Visual = { label: string; cls: string; dotCls: string; title: string }

const VISUAL: Record<OpenApiHealthStatus, Visual> = {
  idle: {
    label: 'Open API 대기',
    cls: 'bg-gray-100 text-gray-600 border-gray-300',
    dotCls: 'bg-gray-400',
    title: '연결 확인 전',
  },
  loading: {
    label: 'Open API 확인 중',
    cls: 'bg-gray-100 text-gray-600 border-gray-300',
    dotCls: 'bg-gray-400 animate-pulse',
    title: '/me 호출 중',
  },
  ok: {
    label: 'Open API 연결됨',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    dotCls: 'bg-emerald-500',
    title: '토큰 유효',
  },
  token_missing: {
    label: 'Open API 토큰 미설정',
    cls: 'bg-amber-50 text-amber-700 border-amber-300',
    dotCls: 'bg-amber-500',
    title: 'OPEN_API_TOKEN env 미등록 — .env.local / Vercel 환경변수 설정 필요',
  },
  unauthorized: {
    label: 'Open API 토큰 만료',
    cls: 'bg-rose-50 text-rose-700 border-rose-300',
    dotCls: 'bg-rose-500',
    title: '401 — 토큰이 무효하거나 폐기됨. 재발급 필요',
  },
  forbidden: {
    label: 'Open API 권한 없음',
    cls: 'bg-rose-50 text-rose-700 border-rose-300',
    dotCls: 'bg-rose-500',
    title: '403 — DSP 권한 없음. 관리자에 문의',
  },
  error: {
    label: 'Open API 오류',
    cls: 'bg-rose-50 text-rose-700 border-rose-300',
    dotCls: 'bg-rose-500',
    title: '/me 호출 실패',
  },
}

export function OpenApiStatusBadge() {
  const { status, identity, errorMessage } = useOpenApiHealth()
  const v = VISUAL[status]
  const title = status === 'ok' && identity
    ? `${v.title} (${identity.mb_id})`
    : errorMessage
      ? `${v.title} — ${errorMessage}`
      : v.title

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${v.cls}`}
      title={title}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${v.dotCls}`} aria-hidden />
      {v.label}
      {status === 'ok' && identity && (
        <span className="font-mono opacity-80">· {identity.mb_id}</span>
      )}
    </span>
  )
}
