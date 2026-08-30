/**
 * Publica 리포트 이상 징후 탐지 — Service 계층 (순수 함수).
 *
 * ARCHITECTURE.md 규칙: React/Next import 없음, 외부 API 호출 없음.
 * 런타임 import 도 없음 (`import type` 만) — tests/ 가
 * `node --experimental-strip-types` 로 node_modules 없이 격리 실행되기 때문.
 * 에러코드 분류가 필요한 집계는 errorCodes.buildErrorBreakdowns 가 먼저 수행하고,
 * 여기서는 그 결과(ErrorBreakdown)만 받는다.
 */

import type {
  BasicRow,
  PublisherRow,
  ErrorBreakdown,
  PublicaAnomaly,
  AnomalySeverity,
  DetectOptions,
  DetectResult,
} from './types'

/** 기본 임계값 — route 에서 env 로 override 가능. */
export const DEFAULT_DETECT_OPTIONS: DetectOptions = {
  renderRateFloor: 0.8,
  timeoutRateCeiling: 0.01,
  integrationShareWarn: 0.05,
  integrationShareCritical: 0.2,
  metricDropRatio: 0.3,
  maxAnomalies: 100,
}

const SEVERITY_ORDER: Record<AnomalySeverity, number> = { critical: 0, warning: 1, info: 2 }

/** 천단위 구분 정수 포맷 (로케일 비의존 — 테스트 결정성 확보). */
export function fmtInt(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** 비율 → 퍼센트 문자열. */
export function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

/** 짝수 개수면 가운데 두 값의 평균. 빈 배열은 null. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ─────────────────────────────────────────────────────────────
//  1) basic 리포트 — 최신일 vs 직전일들 기준선
// ─────────────────────────────────────────────────────────────

/** 기준선 대비 급락을 감시할 지표. */
const TRACKED_METRICS: { key: keyof BasicRow; label: string }[] = [
  { key: 'revenue', label: '매출' },
  { key: 'impressions', label: '노출' },
  { key: 'bidResponses', label: '응답' },
  { key: 'bidWon', label: '낙찰' },
]

/**
 * 날짜별 전체 집계에서 최신일 이상을 탐지.
 * rows 는 날짜 오름차순 가정 (reportParser 가 정렬 보장).
 */
export function detectBasicAnomalies(
  rows: BasicRow[],
  options: DetectOptions = DEFAULT_DETECT_OPTIONS,
): PublicaAnomaly[] {
  if (rows.length === 0) return []
  const latest = rows[rows.length - 1]
  const previous = rows.slice(0, -1)
  const found: PublicaAnomaly[] = []

  // ── 최신일 절대 지표 점검 ────────────────────────────────
  if (latest.renderRate !== null && latest.renderRate < options.renderRateFloor) {
    found.push({
      kind: 'low_render_rate', severity: 'warning', source: 'basic', subject: latest.date,
      message: `렌더율 ${fmtPct(latest.renderRate)} — 기준 ${fmtPct(options.renderRateFloor)} 미만`,
      evidence: { render_rate: String(latest.renderRate), bid_won: fmtInt(latest.bidWon), impressions: fmtInt(latest.impressions) },
    })
  }
  if (latest.timeoutRate !== null && latest.timeoutRate > options.timeoutRateCeiling) {
    found.push({
      kind: 'timeout_spike', severity: 'warning', source: 'basic', subject: latest.date,
      message: `타임아웃율 ${fmtPct(latest.timeoutRate)} — 기준 ${fmtPct(options.timeoutRateCeiling)} 초과`,
      evidence: { timeout_rate: String(latest.timeoutRate), bid_timeouts: fmtInt(latest.bidTimeouts) },
    })
  }

  // ── 기준선(직전일 중앙값) 대비 급락 ──────────────────────
  if (previous.length > 0) {
    for (const { key, label } of TRACKED_METRICS) {
      const baseline = median(previous.map(r => Number(r[key])))
      if (baseline === null || baseline <= 0) continue
      const current = Number(latest[key])

      if (current === 0) {
        found.push({
          kind: 'metric_drop', severity: 'critical', source: 'basic', subject: latest.date,
          message: `${label} 0 — 직전 ${previous.length}일 중앙값 ${fmtInt(baseline)} 대비 전면 중단`,
          evidence: { [String(key)]: '0', baseline: fmtInt(baseline) },
        })
        continue
      }
      const drop = (baseline - current) / baseline
      if (drop >= options.metricDropRatio) {
        found.push({
          kind: 'metric_drop', severity: 'warning', source: 'basic', subject: latest.date,
          message: `${label} ${fmtPct(drop)} 급락 — ${fmtInt(current)} (직전 중앙값 ${fmtInt(baseline)})`,
          evidence: { [String(key)]: fmtInt(current), baseline: fmtInt(baseline), drop: fmtPct(drop) },
        })
      }
    }
  }

  return found
}

// ─────────────────────────────────────────────────────────────
//  2) publisher 리포트 — 퍼블리셔별 퍼널 단절 탐지
// ─────────────────────────────────────────────────────────────

/**
 * 퍼널 각 단계에서 '앞 단계는 있는데 다음 단계가 0' 인 지점을 찾는다.
 * 요청 → 응답 → 낙찰 → 노출 → 매출 순으로, 끊긴 첫 지점만 보고해
 * 하나의 장애가 5건으로 부풀지 않게 한다.
 */
export function detectPublisherAnomalies(
  rows: PublisherRow[],
  options: DetectOptions = DEFAULT_DETECT_OPTIONS,
): PublicaAnomaly[] {
  const found: PublicaAnomaly[] = []

  for (const row of rows) {
    const who = row.publisherName || row.publisherId
    const base = { source: 'publisher' as const, subject: who }

    if (row.bidRequests > 0 && row.bidResponses === 0) {
      found.push({
        ...base, kind: 'no_bid_response', severity: 'critical',
        message: `입찰 요청 ${fmtInt(row.bidRequests)}건에 응답 0건 — 연동 중단 의심`,
        evidence: { bid_requests: fmtInt(row.bidRequests), bid_responses: '0', bid_errors: fmtInt(row.bidErrors) },
      })
    } else if (row.bidResponses > 0 && row.bidWon === 0) {
      found.push({
        ...base, kind: 'no_win', severity: 'critical',
        message: `입찰 응답 ${fmtInt(row.bidResponses)}건에 낙찰 0건`,
        evidence: { bid_responses: fmtInt(row.bidResponses), bid_won: '0' },
      })
    } else if (row.bidWon > 0 && row.impressions === 0) {
      found.push({
        ...base, kind: 'no_impression', severity: 'critical',
        message: `낙찰 ${fmtInt(row.bidWon)}건에 노출 0건 — 렌더 실패`,
        evidence: { bid_won: fmtInt(row.bidWon), impressions: '0' },
      })
    } else if (row.impressions > 0 && row.revenue === 0) {
      found.push({
        ...base, kind: 'no_revenue', severity: 'warning',
        message: `노출 ${fmtInt(row.impressions)}건에 매출 0`,
        evidence: { impressions: fmtInt(row.impressions), revenue: '0' },
      })
    }

    // 퍼널이 이어져 있어도 품질 지표는 별도로 점검.
    if (row.renderRate !== null && row.renderRate < options.renderRateFloor) {
      found.push({
        ...base, kind: 'low_render_rate', severity: 'warning',
        message: `렌더율 ${fmtPct(row.renderRate)} — 기준 ${fmtPct(options.renderRateFloor)} 미만`,
        evidence: { render_rate: String(row.renderRate), bid_won: fmtInt(row.bidWon), impressions: fmtInt(row.impressions) },
      })
    }
    if (row.timeoutRate !== null && row.timeoutRate > options.timeoutRateCeiling) {
      found.push({
        ...base, kind: 'timeout_spike', severity: 'warning',
        message: `타임아웃율 ${fmtPct(row.timeoutRate)} — 기준 ${fmtPct(options.timeoutRateCeiling)} 초과`,
        evidence: { timeout_rate: String(row.timeoutRate), bid_timeouts: fmtInt(row.bidTimeouts) },
      })
    }
  }

  return found
}

// ─────────────────────────────────────────────────────────────
//  3) error 리포트 — integration 등급 비중 + 미정의 코드
// ─────────────────────────────────────────────────────────────

/** 알림 본문에 나열할 상위 integration 코드 개수. */
const TOP_CODES = 3

/**
 * 퍼블리셔별 에러 분해에서 이상을 탐지.
 *
 * Publica 에러의 다수(중복 제거·노플·낙찰 실패)는 정상 경매 결과라
 * 총 에러 건수 자체는 신호가 되지 않는다. 연동 장애를 뜻하는
 * integration 등급의 **비중**을 기준으로 판정한다.
 */
export function detectErrorAnomalies(
  breakdowns: ErrorBreakdown[],
  options: DetectOptions = DEFAULT_DETECT_OPTIONS,
): PublicaAnomaly[] {
  const found: PublicaAnomaly[] = []

  for (const bd of breakdowns) {
    const who = bd.publisherName || bd.publisherId
    if (bd.totalErrors <= 0) continue

    const share = bd.byClass.integration / bd.totalErrors
    if (share >= options.integrationShareWarn) {
      const severity: AnomalySeverity = share >= options.integrationShareCritical ? 'critical' : 'warning'
      const top = bd.codes
        .filter(c => c.class === 'integration')
        .slice(0, TOP_CODES)
      const evidence: Record<string, string> = {
        integration_errors: fmtInt(bd.byClass.integration),
        total_errors: fmtInt(bd.totalErrors),
        share: fmtPct(share),
      }
      for (const c of top) evidence[`${c.code} ${c.name}`] = fmtInt(c.count)

      found.push({
        kind: 'integration_errors', severity, source: 'error', subject: who,
        message: `연동성 에러 비중 ${fmtPct(share)} (${fmtInt(bd.byClass.integration)}/${fmtInt(bd.totalErrors)}건)`
          + (top.length > 0 ? ` — 최다 ${top[0].code} ${top[0].name}` : ''),
        evidence,
      })
    }

    // 사전에 없는 코드 → 정의 확인 필요.
    const unknown = bd.codes.filter(c => c.name === '(미정의 코드)' || c.class === null)
    for (const c of unknown) {
      if (c.count <= 0) continue
      found.push({
        kind: 'unknown_error_code', severity: 'warning', source: 'error', subject: who,
        message: `사전에 없는 에러코드 ${c.code ?? '(빈 값)'} — ${fmtInt(c.count)}건. 코드 정의 확인 필요`,
        evidence: { error_code: String(c.code ?? ''), bid_errors: fmtInt(c.count) },
      })
    }
  }

  return found
}

// ─────────────────────────────────────────────────────────────
//  종합
// ─────────────────────────────────────────────────────────────

/** 심각도 → 대상 순 정렬 후 상한 적용. */
export function finalizeAnomalies(
  anomalies: PublicaAnomaly[],
  options: DetectOptions = DEFAULT_DETECT_OPTIONS,
): DetectResult {
  const sorted = [...anomalies].sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    return s !== 0 ? s : a.subject.localeCompare(b.subject)
  })
  const limit = Math.max(0, options.maxAnomalies)
  return { anomalies: sorted.slice(0, limit), truncated: Math.max(0, sorted.length - limit) }
}

/** 심각도별 건수 집계. */
export function countBySeverity(anomalies: PublicaAnomaly[]): Record<AnomalySeverity, number> {
  const counts: Record<AnomalySeverity, number> = { critical: 0, warning: 0, info: 0 }
  for (const a of anomalies) counts[a.severity]++
  return counts
}
