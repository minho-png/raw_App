"use client"

/**
 * Open API 토큰 상태 배지.
 *
 * 정산 페이지의 공통 필터 바(SettlementFilterBar) 우측에 마운트되어
 * 토큰 유효성을 한눈에 확인. 클릭 시 강제 재조회(revalidate) — 토큰 추가/교체 후
 * 새로고침 없이 상태 갱신.
 *
 * 접근성 (UX 리뷰 ⑧):
 *   - 색 + 아이콘(✓/⚠/✗/·) 이중 부호화 → 색약 사용자도 구별 (WCAG 1.4.1).
 *   - role="status" + aria-live="polite" → 상태 변경을 스크린리더가 announce.
 *   - tabIndex={0} + aria-label → 키보드 포커스·읽기 가능. Enter/Space 로 재조회.
 *
 * 색 정책:
 *   ok            → emerald (정상)   · 아이콘 ✓
 *   token_missing → amber   (설정필요) · 아이콘 ⚠
 *   unauthorized  → rose    (토큰무효) · 아이콘 ✗
 *   forbidden     → rose    (권한없음) · 아이콘 ✗
 *   error/loading → gray    (대기)    · 아이콘 ·
 */

import { useOpenApiHealth, type OpenApiHealthStatus } from '@/lib/hooks/useOpenApiHealth'

type Visual = { label: string; icon: string; cls: string; dotCls: string; title: string }

const VISUAL: Record<OpenApiHealthStatus, Visual> = {
  idle: {
    label: 'Open API 대기',
    icon: '·',
    cls: 'bg-gray-100 text-gray-600 border-gray-300',
    dotCls: 'bg-gray-400',
    title: '연결 확인 전',
  },
  loading: {
    label: 'Open API 확인 중',
    icon: '·',
    cls: 'bg-gray-100 text-gray-600 border-gray-300',
    dotCls: 'bg-gray-400 animate-pulse',
    title: '/me 호출 중',
  },
  ok: {
    label: 'Open API 연결됨',
    icon: '✓',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    dotCls: 'bg-emerald-500',
    title: '토큰 유효',
  },
  token_missing: {
    label: 'Open API 토큰 미설정',
    icon: '⚠',
    cls: 'bg-amber-50 text-amber-700 border-amber-300',
    dotCls: 'bg-amber-500',
    title: 'OPEN_API_TOKEN env 미등록 — .env.local / Vercel 환경변수 설정 필요',
  },
  unauthorized: {
    label: 'Open API 토큰 만료',
    icon: '✗',
    cls: 'bg-rose-50 text-rose-700 border-rose-300',
    dotCls: 'bg-rose-500',
    title: '401 — 토큰이 무효하거나 폐기됨. 재발급 필요',
  },
  forbidden: {
    label: 'Open API 권한 없음',
    icon: '✗',
    cls: 'bg-rose-50 text-rose-700 border-rose-300',
    dotCls: 'bg-rose-500',
    title: '403 — DSP 권한 없음. 관리자에 문의',
  },
  // ── 'error' 세분화 (정확한 원인 노출) ──────────────────────────
  // 일시적·환경 원인(미배포/지연/연결)은 amber — 데이터 자체는 Motiv 기반이라 정상 동작.
  not_found: {
    label: 'Open API 경로 없음',
    icon: '⚠',
    cls: 'bg-amber-50 text-amber-700 border-amber-300',
    dotCls: 'bg-amber-500',
    title: '404 — /me 엔드포인트가 미배포이거나 경로가 잘못됨. Crosstarget API 배포 상태 확인',
  },
  timeout: {
    label: 'Open API 응답 지연',
    icon: '⚠',
    cls: 'bg-amber-50 text-amber-700 border-amber-300',
    dotCls: 'bg-amber-500',
    title: '응답이 30초를 초과했습니다. 잠시 후 클릭하여 재시도',
  },
  network: {
    label: 'Open API 연결 실패',
    icon: '⚠',
    cls: 'bg-amber-50 text-amber-700 border-amber-300',
    dotCls: 'bg-amber-500',
    title: '서버에 연결할 수 없습니다. 네트워크 확인 후 클릭하여 재시도',
  },
  server_error: {
    label: 'Open API 서버 오류',
    icon: '✗',
    cls: 'bg-rose-50 text-rose-700 border-rose-300',
    dotCls: 'bg-rose-500',
    title: 'Crosstarget 서버 일시 장애(5xx). 잠시 후 재시도, 지속 시 관리자 문의',
  },
  error: {
    label: 'Open API 오류',
    icon: '✗',
    cls: 'bg-rose-50 text-rose-700 border-rose-300',
    dotCls: 'bg-rose-500',
    title: '알 수 없는 오류. 클릭하여 재시도',
  },
}

// 라벨 옆 칩에 노출할 상태 — 비정상(분류된 오류)일 때 errorCode 를 모노폰트로 표시해
// "정확한 원인"(HTTP_404 / TIMEOUT / NETWORK 등)을 한눈에. ok/loading/idle 은 칩 없음.
const ERROR_STATES = new Set([
  'token_missing', 'unauthorized', 'forbidden', 'not_found', 'timeout', 'network', 'server_error', 'error',
])

export function OpenApiStatusBadge() {
  const { status, identity, errorCode, errorMessage, revalidate } = useOpenApiHealth()
  const v = VISUAL[status]
  const detail = status === 'ok' && identity
    ? `${v.title} (${identity.mb_id})`
    : errorMessage
      ? `${v.title} — ${errorMessage}`
      : v.title
  const ariaLabel = `${v.label}. ${detail}. 클릭하면 다시 확인합니다.`
  const showCode = ERROR_STATES.has(status) && !!errorCode

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      title={detail}
      tabIndex={0}
      onClick={() => revalidate()}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          revalidate()
        }
      }}
      className={`inline-flex cursor-pointer items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${v.cls} focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-current`}
    >
      <span className={`flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold text-white ${v.dotCls}`} aria-hidden>
        {v.icon}
      </span>
      <span className="hidden sm:inline">{v.label}</span>
      <span className="sm:hidden" aria-hidden>API</span>
      {status === 'ok' && identity && (
        <span className="font-mono opacity-80 hidden sm:inline">· {identity.mb_id}</span>
      )}
      {showCode && (
        <span className="font-mono opacity-70 hidden sm:inline">· {errorCode}</span>
      )}
    </span>
  )
}
