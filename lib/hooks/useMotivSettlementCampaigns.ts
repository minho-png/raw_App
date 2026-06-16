"use client"
import { useEffect, useState } from "react"
import type { MotivCampaign, MotivCampaignListResponse, MotivCampaignType } from "@/lib/motivApi/types"
import { motivTypeToProduct, isExcludedCampaign, type MediaProductType } from "@/lib/motivApi/productMapping"

interface Options {
  // 가져올 Motiv campaign_type 집합 (예: ['TV'] for CTV, ['DISPLAY','VIDEO','PARTNERS'] for CT)
  types: MotivCampaignType[]
  // 대상 월 (YYYY-MM) — start_date 기준 필터에 사용. dateRange 가 있으면 무시.
  month?: string
  // 일자 범위 직접 지정 — dateRange 가 우선. start/end 는 'YYYY-MM-DD'
  dateRange?: { start: string; end: string }
  perPage?: number
  enabled?: boolean
  // useRefreshControl().key — 증가 시 재호출 (실시간 갱신)
  refreshKey?: number
}

interface State {
  data: MotivCampaign[]
  loading: boolean
  error: string | null
  exchangeRate: number
  total: number
  /** 진단 — 사용자 보고 '빠지는 캠페인이 많아'. 어디서 빠지는지 가시화. */
  diag: {
    serverTotal: number          // Motiv 서버가 보고한 총 캠페인 수 (meta.total)
    fetched: number              // 실제 page 순회로 받은 raw 캠페인 수
    excluded: number             // isExcludedCampaign 으로 제외된 수
    outOfRange: number           // 클라이언트 dateRange overlap 으로 제외된 수
    final: number                // 최종 노출 수 (data.length)
    /** 페이지 한계(MAX_PAGES) 도달했는지 — 추가 캠페인 누락 가능성 신호 */
    truncated: boolean
    /** 사용자 보고 — '제외로 포함되면 안되는 항목 확인'. 어떤 캠페인이 제외됐는지 노출. */
    excludedSamples: { id: number; title: string }[]
    outOfRangeSamples: { id: number; title: string; start: string | null; end: string | null }[]
  }
}

/**
 * YYYY-MM → [YYYY-MM-01, YYYY-MM-DD(마지막날)] 로 변환.
 */
function monthToRange(month: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const lastDay = new Date(y, mo, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start: `${y}-${pad(mo)}-01`,
    end:   `${y}-${pad(mo)}-${pad(lastDay)}`,
  }
}

/**
 * Motiv /api/motiv/campaigns 프록시를 type 별로 호출 후 병합.
 * Settlement 페이지에서 CT/CTV 캠페인 리스트 소스로 사용.
 *
 * 월별 필터:
 *   - month 지정 시 Motiv API 의 start_date/end_date 쿼리로 **서버측 필터**를 우선 적용.
 *   - 서버 필터 시맨틱이 불확실할 수 있으므로 클라이언트사이드에서 기간 overlap 재검증.
 *   - 결과 stats 는 Motiv 응답 그대로 — 월별 집계가 아닌 누적값일 수 있으며,
 *     실사용 시 Motiv 문서 확인 후 필요하면 per-month stats 엔드포인트로 교체.
 *
 * 주의: per_page 200, 첫 페이지만 조회 (향후 무한 스크롤/페이지네이션 고려).
 */
const EMPTY_DIAG = { serverTotal: 0, fetched: 0, excluded: 0, outOfRange: 0, final: 0, truncated: false, excludedSamples: [], outOfRangeSamples: [] }

export function useMotivSettlementCampaigns({ types, month, dateRange, perPage = 200, enabled = true, refreshKey = 0 }: Options) {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null, exchangeRate: 0, total: 0, diag: { ...EMPTY_DIAG } })

  // deps 안정화: dateRange 객체 자체는 매 렌더 새 참조라 primitive 로 분해
  const rangeStart = dateRange?.start
  const rangeEnd   = dateRange?.end

  useEffect(() => {
    if (!enabled || types.length === 0) {
      setState({ data: [], loading: false, error: null, exchangeRate: 0, total: 0, diag: { ...EMPTY_DIAG } })
      return
    }
    // 우선순위: dateRange > month
    const range = (rangeStart && rangeEnd)
      ? { start: rangeStart, end: rangeEnd }
      : (month ? monthToRange(month) : null)
    let cancelled = false
    ;(async () => {
      setState(s => ({ ...s, loading: true, error: null }))
      try {
        // 사용자 진단 결과 — 서버 총 18,950 중 MAX_PAGES=25 로 8,713 만 받아
        // 25페이지 밖 10,237 누락. 사용자 결정: '기간은 노출/비용 발생일 기준'.
        // 캠페인 lifetime 만으로 못 거르므로 모든 캠페인을 받아 광고그룹 단의
        // data_fee 발생 여부로 최종 필터해야 함 → MAX_PAGES 대폭 확장 + 페이지 병렬.
        const MAX_PAGES = 100   // per_page 200 × 100 = 20,000건 (18,950 충분)
        const PAGE_PARALLEL = 5 // 5 페이지 동시 fetch
        let truncated = false

        async function fetchPage(t: string, page: number): Promise<MotivCampaignListResponse> {
          const params = new URLSearchParams()
          params.set('campaign_type', t)
          params.set('per_page', String(perPage))
          params.set('page', String(page))
          params.set('sort', '-created_at')
          if (range) {
            params.set('start_date', range.start)
            params.set('end_date',   range.end)
          }
          const ac = new AbortController()
          // 60s — Open API client(25s × retry 2회 ≈ 75s) 와 race 시 hook 이 먼저 abort 하면
          // "signal is aborted without reason" 만 보이고 실제 원인을 못 봄. 25s 라우트
          // timeout 보다 길게 두어 라우트가 OpenApiError 로 명확히 응답할 시간 확보.
          const timer = setTimeout(() => ac.abort(), 60_000)
          const t0 = Date.now()
          try {
            const res = await fetch(`/api/motiv/campaigns?${params.toString()}`, {
              cache: 'no-store', signal: ac.signal,
            })
            const ms = Date.now() - t0
            // 서버 프록시가 부착한 진단 헤더 — 외부 호출 단계까지 콘솔에서 분간.
            const diag = {
              upstream: res.headers.get('X-OpenApi-Upstream'),
              upstreamStatus: res.headers.get('X-OpenApi-Upstream-Status'),
              upstreamLatencyMs: res.headers.get('X-OpenApi-Latency-Ms'),
              attempts: res.headers.get('X-OpenApi-Attempts'),
            }
            if (!res.ok) {
              // 응답 body 의 실제 에러 code/message 를 콘솔에 남김 (status 만으론 원인 불명).
              // 라우트별로 error 가 문자열({error:"..."}) 또는 객체({error:{code,message}})
              // 두 shape 가 섞여 있어 둘 다 안전 파싱.
              const body = await res.json().catch(() => null) as { error?: string | { code?: string; message?: string } } | null
              const errField = body?.error
              const code = typeof errField === 'object' && errField?.code ? errField.code : `HTTP_${res.status}`
              const message = typeof errField === 'string'
                ? errField
                : (errField?.message ?? '')
              console.group(`%c[Motiv→OpenAPI] campaigns ${t} ✗ ${res.status} ${code}`, 'color:#b91c1c;font-weight:600')
              console.error('message:', message || '(본문 없음)')
              console.info('page:', page, 'range:', range ?? '(none)', 'elapsed:', `${ms}ms`)
              console.info('upstream diag:', diag)
              console.info('hint: TOKEN_MISSING→env 미설정 / 401→토큰만료 / NETWORK→토큰 공백·개행 또는 연결 / 422→잘못된 파라미터')
              console.groupEnd()
              throw new Error(`Motiv ${t} ${res.status} — ${code}${message ? `: ${message}` : ''}`)
            }
            const json = (await res.json()) as MotivCampaignListResponse
            if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
              console.debug(`[Motiv→OpenAPI] campaigns ${t} ✓ ${res.status} (${json.data?.length ?? 0}건, ${ms}ms)`, { diag })
            }
            return json
          } catch (e) {
            // AbortError 를 사용자 친화 메시지로 — "signal is aborted without reason" 보다 정확.
            if (e instanceof Error && e.name === 'AbortError') {
              console.error(`[Motiv→OpenAPI] campaigns ${t} ✗ TIMEOUT (60s 초과 — 업스트림 응답 지연)`)
              throw new Error(`Motiv ${t} TIMEOUT — 60초 안에 응답 없음 (업스트림 지연 또는 네트워크)`)
            }
            throw e
          } finally {
            clearTimeout(timer)
          }
        }

        const results = await Promise.all(types.map(async t => {
          const merged: { data: MotivCampaign[]; meta?: { last_page?: number; total?: number }; exchange_rate?: number } = {
            data: [],
          }
          // 첫 페이지 호출 → last_page 확인.
          const first = await fetchPage(t, 1)
          merged.data.push(...first.data)
          if (first.exchange_rate) merged.exchange_rate = first.exchange_rate
          merged.meta = first.meta
          const lastPageServer = first.meta?.last_page ?? 1
          const lastPage = Math.min(lastPageServer, MAX_PAGES)
          if (lastPageServer > MAX_PAGES) truncated = true

          // 사용자 보고 '4월 힐스펫 캠페인이 안 보임' — 이전 PR 의 early-exit 휴리스틱
          // (한 페이지 모두 end_date < range.start 이면 break) 가 잘못된 가정 기반이었음.
          // 가정: 'sort=-created_at 이라 페이지가 진행할수록 옛 캠페인' — 그러나
          // created_at(생성일) 과 end_date(종료일) 는 다른 필드. 오래 전 생성된
          // 캠페인이 최근까지 운영될 수 있어서, 한 페이지가 모두 옛 종료여도
          // 다음 페이지에 4월 운영 캠페인이 있을 수 있음. → early-exit 제거.
          // 2..lastPage 를 PAGE_PARALLEL 씩 batch 로 병렬 fetch — 전체 페이지 끝까지.
          for (let start = 2; start <= lastPage; start += PAGE_PARALLEL) {
            const batch: Promise<MotivCampaignListResponse>[] = []
            for (let p = start; p < start + PAGE_PARALLEL && p <= lastPage; p++) {
              batch.push(fetchPage(t, p))
            }
            const pages = await Promise.all(batch)
            for (const pg of pages) merged.data.push(...pg.data)
          }
          return merged
        }))

        // 진단 카운트 — 어디서 빠지는지 가시화 (사용자 보고).
        // 디버그 키워드 — URL ?debug=KEYWORD 또는 sessionStorage 'dmp-debug' 로 설정.
        // 매칭 캠페인의 단계별 흐름을 console 로 출력.
        const debugKw = (typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('debug')
            || window.sessionStorage.getItem('dmp-debug') || ''
          : '').toLowerCase().trim()
        const matchKw = (s: string | null | undefined) =>
          !!debugKw && !!s && s.toLowerCase().includes(debugKw)

        let serverTotal = 0
        let fetched = 0
        let excluded = 0
        const excludedSamples: { id: number; title: string }[] = []
        const byId = new Map<number, MotivCampaign>()
        let exchangeRate = 0
        for (const r of results) {
          serverTotal += r.meta?.total ?? r.data.length
          fetched += r.data.length
          for (const c of r.data) {
            const matched = matchKw(c.title)
            if (isExcludedCampaign(c.title)) {
              excluded += 1
              excludedSamples.push({ id: c.id, title: c.title ?? '' })
              if (matched) console.log(`[DMP debug] '${c.title}' (id=${c.id}) → EXCLUDED 리스트로 제외`)
              continue
            }
            if (matched) console.log(`[DMP debug] '${c.title}' (id=${c.id}, type=${c.campaign_type}, start=${c.start_date}, end=${c.end_date}) ← campaign fetch 통과`)
            byId.set(c.id, c)
          }
          if (r.exchange_rate) exchangeRate = r.exchange_rate
        }
        let data: MotivCampaign[] = Array.from(byId.values())
        const afterDedup = data.length

        let outOfRange = 0
        const outOfRangeSamples: { id: number; title: string; start: string | null; end: string | null }[] = []
        if (range) {
          const mStart = new Date(`${range.start}T00:00:00`)
          const mEnd   = new Date(`${range.end}T23:59:59`)
          data = data.filter(c => {
            const s = c.start_date ? new Date(c.start_date) : null
            const e = c.end_date   ? new Date(c.end_date)   : null
            if (!s && !e) return true
            const cs = s ?? new Date(0)
            const ce = e ?? new Date(9e13)
            const keep = cs <= mEnd && ce >= mStart
            if (!keep) {
              outOfRange += 1
              if (outOfRangeSamples.length < 50) {
                outOfRangeSamples.push({ id: c.id, title: c.title ?? '', start: c.start_date, end: c.end_date })
              }
              if (matchKw(c.title)) {
                console.log(`[DMP debug] '${c.title}' (id=${c.id}) → outOfRange 제외 (운영 ${c.start_date}~${c.end_date} vs range ${range.start}~${range.end})`)
              }
            } else if (matchKw(c.title)) {
              console.log(`[DMP debug] '${c.title}' (id=${c.id}) ← outOfRange 통과 (운영 ${c.start_date}~${c.end_date})`)
            }
            return keep
          })
        }

        if (debugKw) {
          const matched = data.filter(c => matchKw(c.title))
          console.log(`[DMP debug] keyword='${debugKw}' — 최종 ${matched.length}개 통과`)
          for (const c of matched) console.log(`  ✓ ${c.title} (id=${c.id}, type=${c.campaign_type}, status=${c.status})`)
          if (matched.length === 0) {
            console.log('  ⚠ 통과한 캠페인 0건 — 위 로그 검토. 또는 ?debug= URL/sessionStorage 키워드 확인.')
            console.log('  진단:', { serverTotal, fetched, excluded, outOfRange, final: data.length, truncated })
          }
          console.groupEnd()
        }

        const diag = {
          serverTotal, fetched, excluded, outOfRange,
          final: data.length,
          truncated,
          excludedSamples,
          outOfRangeSamples,
        }
        if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
          console.log('[useMotivSettlementCampaigns] diag', diag, { types, range, dedupLost: fetched - excluded - afterDedup })
        }
        if (!cancelled) setState({ data, loading: false, error: null, exchangeRate, total: serverTotal, diag })
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[useMotivSettlementCampaigns] 로드 실패 (types=${types.join(',')}):`, msg)
        setState(s => ({ ...s, loading: false, error: msg }))
      }
    })()
    return () => { cancelled = true }
  }, [enabled, types.join(','), month, rangeStart, rangeEnd, perPage, refreshKey])

  return state
}

// 편의: product type (CT, CTV) 기반으로 types 자동 결정.
//
// 오버로드 — 기존 호출 호환 + 일자 범위 옵션 추가:
//   useMotivSettlementCampaignsByProduct('CT', '2026-05', true)        // 위치 인자 (기존)
//   useMotivSettlementCampaignsByProduct('CT', { dateRange })          // 옵션 객체
//   useMotivSettlementCampaignsByProduct('CT', { month: '2026-05' })   // 동등
export function useMotivSettlementCampaignsByProduct(
  product: MediaProductType | 'CT_CTV_BOTH',
  monthOrOptions?: string | { month?: string; dateRange?: { start: string; end: string }; enabled?: boolean; refreshKey?: number },
  enabledArg = true,
) {
  let types: MotivCampaignType[] = []
  if (product === 'CT')   types = ['DISPLAY', 'VIDEO', 'PARTNERS']
  if (product === 'CTV')  types = ['TV']
  if (product === 'CT_CTV_BOTH') types = ['DISPLAY', 'VIDEO', 'PARTNERS', 'TV']

  // 옵션 객체 vs 위치 인자 정규화
  const opts = typeof monthOrOptions === 'object' && monthOrOptions !== null
    ? monthOrOptions
    : { month: monthOrOptions, enabled: enabledArg }
  const enabled = opts.enabled ?? enabledArg

  return {
    ...useMotivSettlementCampaigns({
      types,
      month:      opts.month,
      dateRange:  'dateRange'  in opts ? opts.dateRange  : undefined,
      enabled,
      refreshKey: 'refreshKey' in opts ? opts.refreshKey : undefined,
    }),
    // helper: Motiv campaign → product type
    productOf: motivTypeToProduct,
  }
}
