/**
 * Publica 데일리 리포트 에이전트 — Model 계층 (순수 타입).
 *
 * ARCHITECTURE.md 규칙: React/Next import 없음, 런타임 의존 없음.
 * (tests/ 는 `node --experimental-strip-types` 로 실행되므로 이 파일은
 *  타입만 포함해야 격리 실행이 가능하다.)
 *
 * ── 실제 수신 구조 (2026-08 샘플 기준) ──────────────────────
 * 발신: svc-publica-reporting@... → 매일 3통, 각 1개 CSV 첨부.
 * 각 CSV 는 생성일 기준 **직전 7일** 구간을 담는다.
 *
 *  1) Motiv/Publica Daily Report     — email_report_motiv_basic_daily_report_*.csv
 *     date 별 전체 집계 (7행)
 *  2) Motiv/Publica Publisher Report — email_report_motiv_pub_daily_report_*.csv
 *     publisher 별 기간 집계
 *  3) Motiv/Publica Error Report     — email_report_motiv_error_daily_report_*.csv
 *     publisher × error_code 별 오류 건수
 */

import type { ErrorCodeClass } from './errorCodes'

/** 리포트 종류. */
export type PublicaReportKind = 'basic' | 'publisher' | 'error'

/** 이상 징후 심각도. */
export type AnomalySeverity = 'critical' | 'warning' | 'info'

/** 탐지 규칙 종류. */
export type AnomalyKind =
  | 'no_bid_response'     // 요청은 있는데 응답 0 — 연동 중단 의심
  | 'no_win'              // 응답은 있는데 낙찰 0
  | 'no_impression'       // 낙찰은 있는데 노출 0 — 렌더 실패
  | 'no_revenue'          // 노출은 있는데 매출 0
  | 'low_render_rate'     // 렌더율 임계 미만
  | 'timeout_spike'       // 타임아웃율 임계 초과
  | 'integration_errors'  // integration 등급 에러코드 비중 과다
  | 'unknown_error_code'  // 사전에 없는 에러코드 출현
  | 'metric_drop'         // 최신일 지표가 기간 기준선 대비 급락
  | 'parse_warning'       // 파싱 단계 경고

/** 첨부파일 원본 — IMAP Repository → Service 로 전달. */
export interface PublicaAttachment {
  filename: string
  /** 디코딩된 첨부 바이트 (transfer-encoding 해제 후). */
  content: Buffer
}

/** 수신한 리포트 메일 1통. */
export interface PublicaMessage {
  uid: number
  subject: string
  from: string
  receivedAt: Date
  attachments: PublicaAttachment[]
}

/** 공통 실적 지표 — basic/publisher 리포트가 동일 컬럼을 공유. */
export interface PublicaMetrics {
  bidRequests: number
  bidResponses: number
  bidErrors: number
  bidTimeouts: number
  bidWon: number
  impressions: number
  revenue: number
  /** Publica 가 계산해 내려주는 비율. 분모 0 이면 CSV 가 빈 값 → null. */
  responseRate: number | null
  timeoutRate: number | null
  winRate: number | null
  renderRate: number | null
  avgImpEcpm: number | null
}

/** basic 리포트 1행 (날짜별 전체 집계). */
export interface BasicRow extends PublicaMetrics {
  /** 원본 `date` 컬럼 (예: "2026-08-20 00:00:00+00:00"). */
  rawDate: string
  /** YYYY-MM-DD 로 정규화. 파싱 실패 시 rawDate 그대로. */
  date: string
}

/** publisher 리포트 1행 (퍼블리셔별 기간 집계). */
export interface PublisherRow extends PublicaMetrics {
  publisherId: string
  publisherName: string
}

/** error 리포트 1행 (퍼블리셔 × 에러코드). */
export interface ErrorRow {
  publisherId: string
  publisherName: string
  /** CSV 는 "22.0" 처럼 float 표기. 빈 값 행이 존재해 null 허용. */
  errorCode: number | null
  bidErrors: number
}

/** 파싱 결과 — 첨부 1개 단위. kind 에 따라 rows 타입이 갈린다. */
export type ParsedReport =
  | { kind: 'basic';     filename: string; rows: BasicRow[] }
  | { kind: 'publisher'; filename: string; rows: PublisherRow[] }
  | { kind: 'error';     filename: string; rows: ErrorRow[] }

/** 탐지된 이상 징후 1건. */
export interface PublicaAnomaly {
  kind: AnomalyKind
  severity: AnomalySeverity
  /** 어느 리포트에서 나왔는지. */
  source: PublicaReportKind
  /** 대상 식별자 (퍼블리셔명 또는 날짜). */
  subject: string
  /** 사람이 읽는 한 줄 설명. */
  message: string
  /** 판정 근거 (지표명 → 값). */
  evidence: Record<string, string>
}

/** 퍼블리셔별 에러코드 집계 — 알림 본문의 상세 블록에 사용. */
export interface ErrorBreakdown {
  publisherId: string
  publisherName: string
  totalErrors: number
  /** 등급별 합계. */
  byClass: Record<ErrorCodeClass, number>
  /** 건수 내림차순 코드 목록. */
  codes: { code: number | null; name: string; class: ErrorCodeClass | null; count: number }[]
}

/** 탐지 임계값 — env 로 override 가능. */
export interface DetectOptions {
  /** 렌더율이 이 값 미만이면 warning (기본 0.80). */
  renderRateFloor: number
  /** 타임아웃율이 이 값 초과면 warning (기본 0.01 = 1%). */
  timeoutRateCeiling: number
  /** integration 에러 비중 warning 임계 (기본 0.05). */
  integrationShareWarn: number
  /** integration 에러 비중 critical 임계 (기본 0.20). */
  integrationShareCritical: number
  /** 최신일 지표가 기준선 대비 이 비율 이상 하락하면 warning (기본 0.30). */
  metricDropRatio: number
  /** 알림 1통당 최대 항목 수 (기본 100). */
  maxAnomalies: number
}

/** 탐지 결과. */
export interface DetectResult {
  anomalies: PublicaAnomaly[]
  /** maxAnomalies 상한으로 제외된 건수. */
  truncated: number
}

/** LLM 보조 분석 결과 (선택 기능 — 비활성 시 null). */
export interface LlmInsight {
  summary: string
  observations: string[]
}

/** 하루치 3종 리포트에 대한 최종 분석 결과. */
export interface PublicaAnalysis {
  /** 분석에 사용된 메일들. */
  messages: PublicaMessage[]
  reports: ParsedReport[]
  anomalies: PublicaAnomaly[]
  truncated: number
  counts: Record<AnomalySeverity, number>
  /** 퍼블리셔별 에러 분해 (error 리포트가 있을 때만). */
  breakdowns: ErrorBreakdown[]
  /** basic 리포트의 최신일 요약 (있을 때만). */
  latest: BasicRow | null
  llm: LlmInsight | null
  /** 비치명적 경고 (첨부 1개 파싱 실패 등). */
  warnings: string[]
}
