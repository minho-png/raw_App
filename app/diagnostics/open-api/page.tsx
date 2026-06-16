"use client"

/**
 * Crosstarget Open API 진단 페이지.
 *
 * 목적: 브라우저 개발자 콘솔을 열어 두고 본 페이지에 접속하면 — 신 API 가
 * 어떤 상태인지(토큰 미설정/네트워크 차단/4xx/정상)를 단계별로 분간 가능.
 *
 * 출력:
 *   - 화면: 상태 카드(요청 url / proxy latency / upstream latency / status / 에러 메시지).
 *   - 콘솔: [OpenAPI] 그룹 로그 (useOpenApiCampaigns 가 호출 시 자동 출력).
 *
 * 호출 흐름: 브라우저 → `/api/open-api/insights` (this app) → server openApiFetch →
 *           https://manage2.crosstarget.co.kr/api/v1/ads/insights
 */

import { useState } from 'react'
import { useOpenApiCampaigns } from '@/lib/hooks/useOpenApiCampaigns'

function row(label: string, value: string | number | null | undefined) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #eee' }}>
      <div style={{ width: 200, color: '#666', fontFamily: 'monospace', fontSize: 13 }}>{label}</div>
      <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>
        {value === null || value === undefined || value === '' ? <span style={{ color: '#bbb' }}>—</span> : String(value)}
      </div>
    </div>
  )
}

export default function OpenApiDiagnosticsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, summary, loading, error, errorCode } = useOpenApiCampaigns({
    all: true,
    enabled: true,
    refreshKey,
  })

  const statusColor =
    error ? '#c00' : loading ? '#888' : '#080'
  const statusLabel =
    error ? `FAIL — ${errorCode ?? 'UNKNOWN'}` : loading ? '호출 중…' : `OK (${data.length} rows)`

  return (
    <main style={{ padding: 24, maxWidth: 880, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: 6 }}>Open API 진단</h1>
      <p style={{ color: '#666', marginBottom: 20, fontSize: 14 }}>
        브라우저 개발자 콘솔(F12 → Console) 을 열고 새로고침하세요. <code>[OpenAPI]</code> 그룹 로그가
        호출 단계별로 출력됩니다. Server console (Vercel Functions Log 또는 <code>npm run dev</code>{' '}
        터미널) 에는 <code>[OpenAPI:server]</code> 로그가 찍힙니다.
      </p>

      <div style={{ padding: 16, border: '1px solid #ddd', borderRadius: 6, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: statusColor,
          }} />
          <strong style={{ fontSize: 16 }}>{statusLabel}</strong>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            style={{ marginLeft: 'auto', padding: '6px 12px', cursor: 'pointer' }}
            disabled={loading}
          >
            재호출
          </button>
        </div>

        {row('호출 endpoint', '/api/open-api/insights (proxy)')}
        {row('대상 외부 API', 'manage2.crosstarget.co.kr/api/v1/ads/insights')}
        {row('errorCode', errorCode)}
        {row('error.message', error)}
        {row('rows', data.length)}
        {row('summary.impressions', summary?.impressions)}
        {row('summary.clicks', summary?.clicks)}
        {row('summary.cost', summary?.cost)}
      </div>

      <details style={{ marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer', fontSize: 14, color: '#666' }}>
          오류 코드 가이드
        </summary>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: '#444' }}>
          <p><code>TOKEN_MISSING</code> — <code>.env.local</code> 또는 Vercel 환경변수에{' '}
          <code>OPEN_API_TOKEN</code> 추가 필요.</p>
          <p><code>HTTP_401</code> — 토큰 무효/만료. Crosstarget 우측 상단 프로필 → API 토큰 메뉴에서 재발급.</p>
          <p><code>HTTP_403</code> — DSP 권한 없음. 계정 관리자에게 권한 요청.</p>
          <p><code>HTTP_404</code> — 엔드포인트 경로 오류 (서버 라우트 또는 외부 API path).</p>
          <p><code>NETWORK</code> — 외부 API 도달 불가. 로컬: 인터넷/방화벽 확인. Vercel: egress 정책,
          Crosstarget IP allowlist 확인. 브라우저 콘솔의 server log 에서 정확한 원인(getaddrinfo / ECONNREFUSED 등) 확인.</p>
          <p><code>HTTP_5xx</code> — Crosstarget 측 일시 장애. 잠시 후 재시도.</p>
        </div>
      </details>

      <p style={{ fontSize: 12, color: '#999' }}>
        본 페이지는 인프라 진단 전용 — production navigation 에 노출하지 않음.
      </p>
    </main>
  )
}
