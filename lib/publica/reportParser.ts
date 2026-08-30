/**
 * Publica 리포트 CSV 파서 — Service 계층 (순수 함수, papaparse 만 사용).
 *
 * 3종 리포트를 파일명(1순위) 또는 헤더 시그니처(2순위)로 판별해
 * 타입이 붙은 행 배열로 변환한다.
 *
 * 값 표기 특성 (실제 샘플 기준):
 *   - date       : "2026-08-20 00:00:00+00:00"  → YYYY-MM-DD 로 정규화
 *   - error_code : "22.0" 처럼 float 표기        → 정수로 정규화, 빈 값은 null
 *   - 비율 컬럼  : 분모가 0 이면 빈 문자열       → null (0 과 구분해야 함)
 */

import Papa from 'papaparse'
import type {
  PublicaReportKind,
  PublicaAttachment,
  ParsedReport,
  PublicaMetrics,
  BasicRow,
  PublisherRow,
  ErrorRow,
} from './types'

/** 분석 대상 확장자. */
export function isSupportedAttachment(filename: string): boolean {
  return /\.(csv|tsv)$/i.test(filename)
}

/**
 * CSV 바이트 → 문자열. UTF-8 우선, 치환문자 검출 시 CP949 재시도.
 * (현재 샘플은 UTF-8 이지만 국내 리포트 인코딩 변경에 대비한 방어.)
 */
function decodeText(buffer: Buffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '')
  try {
    return new TextDecoder('euc-kr').decode(buffer).replace(/^﻿/, '')
  } catch {
    return utf8.replace(/^﻿/, '')
  }
}

/** 숫자 파싱 — 빈 값/파싱 실패는 null. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim().replace(/,/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** 건수 컬럼 — 빈 값은 0 으로 취급 (Publica 는 0 을 명시하므로 사실상 방어용). */
function count(value: unknown): number {
  return num(value) ?? 0
}

/** "2026-08-20 00:00:00+00:00" → "2026-08-20". 형식이 다르면 원문 유지. */
export function normalizeDate(raw: string): string {
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : raw.trim()
}

/** "22.0" → 22, "" → null. */
export function normalizeErrorCode(raw: unknown): number | null {
  const n = num(raw)
  if (n === null) return null
  return Number.isInteger(n) ? n : Math.trunc(n)
}

/** 파일명으로 리포트 종류 판별. 매칭 실패 시 null. */
export function kindFromFilename(filename: string): PublicaReportKind | null {
  const f = filename.toLowerCase()
  if (f.includes('error_daily_report')) return 'error'
  if (f.includes('pub_daily_report')) return 'publisher'
  if (f.includes('basic_daily_report')) return 'basic'
  return null
}

/** 헤더 구성으로 리포트 종류 판별 (파일명 규칙 변경 대비 fallback). */
export function kindFromHeaders(headers: string[]): PublicaReportKind | null {
  const h = new Set(headers.map(x => x.trim().toLowerCase()))
  if (h.has('error_code') && h.has('publisher_id')) return 'error'
  if (h.has('publisher_id') && h.has('bid_requests')) return 'publisher'
  if (h.has('date') && h.has('bid_requests')) return 'basic'
  return null
}

/** basic/publisher 공통 지표 컬럼 추출. */
function metrics(row: Record<string, unknown>): PublicaMetrics {
  return {
    bidRequests: count(row['bid_requests']),
    bidResponses: count(row['bid_responses']),
    bidErrors: count(row['bid_errors']),
    bidTimeouts: count(row['bid_timeouts']),
    bidWon: count(row['bid_won']),
    impressions: count(row['impressions']),
    revenue: count(row['revenue']),
    // 비율은 분모 0 일 때 CSV 가 빈 문자열 → null 로 보존 (0 과 의미가 다름).
    responseRate: num(row['response_rate']),
    timeoutRate: num(row['timeout_rate']),
    winRate: num(row['win_rate']),
    renderRate: num(row['render_rate']),
    avgImpEcpm: num(row['avg_imp_ecpm']),
  }
}

/** 모든 셀이 비어 있는 행. */
function isEmptyRow(row: Record<string, unknown>): boolean {
  return Object.values(row).every(v => v === '' || v === null || v === undefined)
}

/**
 * 첨부 CSV 1개를 파싱. 지원 확장자가 아니거나 종류 판별에 실패하면 null.
 * 파싱 자체가 실패하면 throw — 호출부에서 warning 으로 수집한다.
 */
export function parseAttachment(attachment: PublicaAttachment): ParsedReport | null {
  if (!isSupportedAttachment(attachment.filename)) return null

  const text = decodeText(attachment.content)
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: /\.tsv$/i.test(attachment.filename) ? '\t' : undefined,
  })

  const headers = (parsed.meta.fields ?? []).map(h => h.trim())
  const kind = kindFromFilename(attachment.filename) ?? kindFromHeaders(headers)
  if (!kind) return null

  const records = (parsed.data ?? []).filter(r => !isEmptyRow(r))

  if (kind === 'basic') {
    const rows: BasicRow[] = records.map(r => {
      const rawDate = String(r['date'] ?? '').trim()
      return { rawDate, date: normalizeDate(rawDate), ...metrics(r) }
    })
    // 날짜 오름차순 — '최신일' 판정이 CSV 정렬에 의존하지 않도록 고정.
    rows.sort((a, b) => a.date.localeCompare(b.date))
    return { kind, filename: attachment.filename, rows }
  }

  if (kind === 'publisher') {
    const rows: PublisherRow[] = records.map(r => ({
      publisherId: String(r['publisher_id'] ?? '').trim(),
      publisherName: String(r['publisher_name'] ?? '').trim(),
      ...metrics(r),
    }))
    return { kind, filename: attachment.filename, rows }
  }

  const rows: ErrorRow[] = records.map(r => ({
    publisherId: String(r['publisher_id'] ?? '').trim(),
    publisherName: String(r['publisher_name'] ?? '').trim(),
    errorCode: normalizeErrorCode(r['error_code']),
    bidErrors: count(r['bid_errors']),
  }))
  return { kind, filename: attachment.filename, rows }
}
