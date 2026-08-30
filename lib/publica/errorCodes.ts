/**
 * Publica Bid Error 코드 사전 — Model 계층 (순수 데이터).
 *
 * 출처: Publica 「Bid Error Definitions」 문서 (12p).
 * 런타임 의존 없음 — tests/ 의 type stripping 격리 실행 대상.
 *
 * ── class 분류 기준 (운영 대응 관점) ────────────────────────
 *  integration : 연동·프로토콜 장애. 엔지니어 확인 필요 → critical
 *  config      : 엔드포인트/채널 설정·소재 문제. 세팅 조정으로 해소 → warning
 *  expected    : 정상 경매 결과(중복 제거·노플·낙찰 실패 등). 대응 불필요 → info
 *
 * ⚠️ class 분류는 문서의 Description 을 근거로 한 운영 판단이며 Publica 공식
 *    구분이 아니다. 실제 운영 경험에 따라 조정 가능 (이 파일만 수정하면 됨).
 */

import type { ErrorRow, ErrorBreakdown } from './types'

/** 코드 대응 등급. */
export type ErrorCodeClass = 'integration' | 'config' | 'expected'

export interface PublicaErrorCode {
  /** APIError Code (리포트 CSV 의 error_code 값). */
  code: number
  /** CSV File Report Error 명칭. */
  name: string
  /** 한 줄 설명 (한국어 요약). */
  description: string
  class: ErrorCodeClass
}

const CODES: PublicaErrorCode[] = [
  // ── integration: 연동·프로토콜 장애 ────────────────────────
  { code: 0,  name: 'UNDEFINED',                   class: 'integration', description: '정의되지 않은 오류' },
  { code: 1,  name: 'TIMEOUT_ERROR',               class: 'integration', description: 'Bid Request 타임아웃 (Publica 기본 1초)' },
  { code: 2,  name: 'BID_INPUT_ERROR',             class: 'integration', description: 'Bid Request 입력값 오류' },
  { code: 3,  name: 'BAD_SERVER_RESPONSE',         class: 'integration', description: '비더 서버가 오류 반환 — 연동 설정 오류 가능성' },
  { code: 4,  name: 'FAILED_TO_REQUEST_BIDS_ERROR',class: 'integration', description: 'Publica 가 Bid Request 전송 실패' },
  { code: 5,  name: 'BID_AUCTION_FAILED',          class: 'integration', description: 'Publica 가 경매 개시 실패' },
  { code: 6,  name: 'RATE_LIMIT_BLOCKED',          class: 'integration', description: '비더 서버 QPS 한도 초과' },
  { code: 7,  name: 'FAILED_TO_PARSE_RESPONSE',    class: 'integration', description: 'Publica 가 Bid Response 파싱 실패' },
  { code: 8,  name: 'CONNECTION_ERROR',            class: 'integration', description: 'Bid Request 후 응답·오류 모두 없음' },
  { code: 9,  name: 'PANIC',                       class: 'integration', description: '예기치 못한 내부 오류' },
  { code: 10, name: 'PREBID_ERROR',                class: 'integration', description: 'Prebid 프로토콜 실패' },
  { code: 16, name: 'CACHE_PUT_CACHE_MISS',        class: 'integration', description: 'Prebid 캐시 GET 실패' },
  { code: 17, name: 'UNWRAP_TIMEOUT_ERROR',        class: 'integration', description: 'VAST 언랩 중 타임아웃' },
  { code: 19, name: 'UNKNOWN_ERROR',               class: 'integration', description: '알 수 없는 오류' },
  { code: 20, name: 'BID_REJECTED_UNKNOWN',        class: 'integration', description: '입찰 거절 — 원인 불명' },
  { code: 25, name: 'BID_REJECTED_CACHE_ID',       class: 'integration', description: 'Publica 가 cache ID 생성 실패' },
  { code: 44, name: 'BID_PRICE_MISSING',           class: 'integration', description: 'Bid Response 에 CPM 없음' },
  { code: 58, name: 'INVALID_REQUEST_URL',         class: 'integration', description: 'VAST 태그 URL 에서 유효 응답 수신 실패' },
  { code: 59, name: 'BID_REJECTED_CREATIVE_BLOCK_UNKNOWN', class: 'integration', description: '소재 검증 관련 기타 오류' },
  { code: 65, name: 'BID_SITE_LOOP_ERROR',         class: 'integration', description: '요청이 발신자와 동일 네트워크를 호출 (루프)' },
  { code: 69, name: 'BID_REJECTED_OVER_MAX_UNWRAP',class: 'integration', description: 'VAST 래퍼 최대 개수(4) 초과' },
  { code: 71, name: 'BID_MISSING_VAST_META',       class: 'integration', description: 'VAST 언랩 시 필수 노드 누락' },
  { code: 72, name: 'BID_REJECTED_XML_SYNTAX_ERROR', class: 'integration', description: 'Bid Response XML 문법 오류' },
  { code: 79, name: 'BID_REJECTED_EOF',            class: 'integration', description: '응답이 닫는 태그 없이 종료 — VAST 래퍼 불량' },
  { code: 83, name: 'BID_CONNECTION_ERROR',        class: 'integration', description: '비더 서버가 HTTP 연결 종료 (connection reset / broken pipe)' },

  // ── config: 설정·소재 문제 ─────────────────────────────────
  { code: 15, name: 'VAST_VALIDATE_ERROR',         class: 'config', description: 'Bid Response 검증 후 유효 미디어파일 없음' },
  { code: 29, name: 'BID_REJECTED_ADOMAIN_MISSING',class: 'config', description: 'Bid Response 에 광고주 도메인 누락' },
  { code: 30, name: 'BID_REJECTED_ABOVE_MAX_AD_DURATION', class: 'config', description: '광고 길이가 max_ad_duration 초과' },
  { code: 31, name: 'BID_REJECTED_BELOW_MIN_AD_DURATION', class: 'config', description: '광고 길이가 min_ad_duration 미만' },
  { code: 32, name: 'NO_MEDIAFILE_SATISFY_SITE_MAX_BITRATE', class: 'config', description: '미디어파일 비트레이트가 채널 설정 최대치 초과' },
  { code: 37, name: 'NO_MEDIAFILE_SATISFY_ENDPOINT_MAX_BITRATE', class: 'config', description: '모든 미디어파일 비트레이트가 max_bitrate 초과' },
  { code: 38, name: 'NO_MEDIAFILE_SATISFY_ENDPOINT_MIN_BITRATE', class: 'config', description: '모든 미디어파일 비트레이트가 min_bitrate 미만' },
  { code: 39, name: 'NO_MEDIAFILE_SATISFY_SITE_MIN_BITRATE', class: 'config', description: '미디어파일 비트레이트가 채널 설정 최소치 미만' },
  { code: 41, name: 'BID_REJECTED_MIN_POD_SIZE_NOT_MEET', class: 'config', description: 'Pod 최소 광고 개수 미충족' },
  { code: 49, name: 'BID_REJECTED_PRICE_ABOVE_ERROR_THRESHOLD', class: 'config', description: '입찰가 2000 초과 — demand 측 입찰 실수 방지' },
  { code: 56, name: 'BID_REJECTED_NONSECURE_VAST', class: 'config', description: '응답에 non-secure 링크 포함' },
  { code: 57, name: 'BID_REJECTED_SLOT_TARGETING_MISMATCH', class: 'config', description: '배정 슬롯이 타게팅 슬롯과 불일치' },
  { code: 60, name: 'BID_REJECTED_CREATIVE_BLOCK_404_NOT_FOUND', class: 'config', description: '소재 URL 이 404 반환' },
  { code: 61, name: 'BID_REJECTED_CREATIVE_BLOCK_MISMATCH_DURATION', class: 'config', description: 'VAST 선언 길이와 실제 미디어파일 길이 불일치' },
  { code: 62, name: 'BID_REJECTED_CREATIVE_VALIDATION_REJECTED', class: 'config', description: 'Creative Review 에서 미디어파일 차단됨' },

  // ── expected: 정상 경매 결과 ───────────────────────────────
  { code: 11, name: 'EMPTY_RESPONSE_ERROR',        class: 'expected', description: '비더가 빈 Bid Response 반환' },
  { code: 12, name: 'NO_CONTENT_204_ERROR',        class: 'expected', description: '콘텐츠 없음 — SSP 수요 없을 때 정상' },
  { code: 13, name: 'NO_FILL_ERROR',               class: 'expected', description: 'No fill — SSP 수요 없을 때 정상' },
  { code: 14, name: 'EMPTY_VAST_ERROR',            class: 'expected', description: '빈 VAST — 수요 없을 때 정상' },
  { code: 18, name: 'BID_PRICE_BELOW_FLOOR',       class: 'expected', description: '입찰가가 플로어 미만' },
  { code: 21, name: 'BID_REJECTED_DURATION',       class: 'expected', description: 'Pod 길이가 이미 충족됨' },
  { code: 22, name: 'BID_REJECTED_DUP_MEDIAFILE_URL', class: 'expected', description: 'Pod 내 미디어파일 중복 (중복 제거 설정)' },
  { code: 23, name: 'BID_REJECTED_DUP_ADOMAIN',    class: 'expected', description: 'Pod 내 광고주 도메인 중복 (중복 제거 설정)' },
  { code: 24, name: 'BID_REJECTED_DUP_CATEGORY',   class: 'expected', description: 'Pod 내 카테고리 중복 (중복 제거 설정)' },
  { code: 26, name: 'BID_REJECTED_PRICE',          class: 'expected', description: '더 높은 CPM 에 낙찰 실패' },
  { code: 27, name: 'BID_REJECTED_ADVERTISER_BLOCKLIST', class: 'expected', description: '채널 레벨 광고주 차단' },
  { code: 28, name: 'BID_REJECTED_IAB_CAT_BLOCKLIST', class: 'expected', description: '채널 레벨 IAB 카테고리 차단' },
  { code: 33, name: 'BID_REJECTED_POD_FLOOR',      class: 'expected', description: 'Pod CPM 합계가 pod floor 미만' },
  { code: 34, name: 'BID_REJECTED_ALL_HOUSE_ADS',  class: 'expected', description: 'Pod 전체가 하우스 광고 (채널 설정)' },
  { code: 35, name: 'BID_REJECTED_DUP_AD_ID',      class: 'expected', description: 'Pod 내 Ad ID 중복 (중복 제거 설정)' },
  { code: 36, name: 'BID_REJECTED_DUP_CREATIVE_ID',class: 'expected', description: 'Pod 내 Creative ID 중복 (중복 제거 설정)' },
  { code: 40, name: 'BID_REJECTED_BRAND_SAFETY_RULE_BLOCK', class: 'expected', description: 'Brand Safety 룰로 차단' },
  { code: 46, name: 'BID_REJECTED_DUP_ADOMAIN_ELEA',class: 'expected', description: 'Elea AI 기준 광고주 도메인 중복' },
  { code: 47, name: 'BID_REJECTED_DUP_ADOMAIN_CLICK_THROUGH', class: 'expected', description: '클릭스루 기준 광고주 도메인 중복' },
  { code: 48, name: 'BID_REJECTED_DUP_CATEGORY_ELEA', class: 'expected', description: 'Elea AI 기준 카테고리 중복' },
  { code: 50, name: 'BID_REJECTED_DUP_CAMPAIGN_ID',class: 'expected', description: 'VMAP 다중 광고 브레이크에서 빈도 제한 보호' },
  { code: 52, name: 'BID_REJECTED_MEDIAFILE_BLOCKLIST', class: 'expected', description: 'Brand Safety 룰로 미디어파일 차단' },
  { code: 53, name: 'BID_NOT_FIRST_SLOT_IN_POD',   class: 'expected', description: 'Pod 첫 슬롯 전용 입찰인데 다른 슬롯 배정' },
  { code: 54, name: 'BID_REJECTED_DUP_MEDIAFILE_URL_NORMAL', class: 'expected', description: '정규화 URL 기준 미디어파일 중복' },
  { code: 55, name: 'BID_REJECTED_CREATIVE_ID_BLOCK', class: 'expected', description: 'Brand Safety 룰로 Creative ID 차단' },
  { code: 63, name: 'BID_REJECTED_OVER_ORDER_FREQUENCY_CAP', class: 'expected', description: '오더 레벨 빈도 제한 초과' },
  { code: 64, name: 'BID_REJECTED_OVER_CAMPAIGN_FREQUENCY_CAP', class: 'expected', description: '라인아이템 레벨 빈도 제한 초과' },
  { code: 66, name: 'BID_REJECTED_BLOCKED_BY_ADVERTISER', class: 'expected', description: 'IAS 파트너 광고주가 해당 퍼블리셔 게재 거부' },
  { code: 68, name: 'BID_REJECTED_TIER',           class: 'expected', description: '낮은 티어로 거절' },
  { code: 70, name: 'BID_REJECTED_LANGUAGE_BLOCKLIST', class: 'expected', description: 'Elea AI 감지 언어가 Brand Safety 룰로 차단' },
  { code: 73, name: 'BID_REJECTED_ADVERTISER_RULE_DO_NOT_AIR', class: 'expected', description: '광고주 Do Not Air 룰로 거절' },
  { code: 74, name: 'BID_REJECTED_ADVERTISER_RULE_COMPETITIVE_SEPARATION_SELF', class: 'expected', description: '동일 광고주 경쟁 분리 룰로 거절' },
  { code: 75, name: 'BID_REJECTED_ADVERTISER_RULE_COMPETITIVE_SEPARATION_OTHER', class: 'expected', description: '타 광고주 경쟁 분리 룰로 거절' },
  { code: 78, name: 'BID_REJECTED_CACTEGORY_EXCLUSIVITY', class: 'expected', description: '카테고리 독점(exclusivity) 설정으로 거절' },
]

const BY_CODE = new Map<number, PublicaErrorCode>(CODES.map(c => [c.code, c]))

/** 전체 코드 목록 (읽기 전용). */
export const PUBLICA_ERROR_CODES: readonly PublicaErrorCode[] = CODES

/**
 * 코드 조회. 문서에 없는 코드는 null —
 * 호출부에서 '미정의 코드'로 취급해 integration 급으로 올린다.
 */
export function lookupErrorCode(code: number): PublicaErrorCode | null {
  return BY_CODE.get(code) ?? null
}

/** 코드 → 등급. 미정의 코드는 조사 필요이므로 integration 으로 간주. */
export function classifyErrorCode(code: number): ErrorCodeClass {
  return BY_CODE.get(code)?.class ?? 'integration'
}

/** 사람이 읽는 코드 라벨. 예) `83 BID_CONNECTION_ERROR` */
export function formatErrorCode(code: number): string {
  const def = BY_CODE.get(code)
  return def ? `${code} ${def.name}` : `${code} (미정의 코드)`
}

/**
 * error 리포트 행 → 퍼블리셔별 에러 분해.
 *
 * 이 함수를 errorCodes.ts 안에 두는 이유: 코드 분류(classifyErrorCode)를
 * 런타임으로 쓰는 유일한 지점이라, 여기에 모아두면 anomalyDetector 는
 * `import type` 만으로 유지되어 tests/ 의 strip-types 격리 실행이 가능하다.
 *
 * error_code 가 빈 값인 행(패딩)은 건수 0 이므로 제외한다.
 */
export function buildErrorBreakdowns(rows: ErrorRow[]): ErrorBreakdown[] {
  const byPublisher = new Map<string, ErrorBreakdown>()

  for (const row of rows) {
    if (row.errorCode === null && row.bidErrors === 0) continue // 패딩 행
    const key = row.publisherId || row.publisherName
    let entry = byPublisher.get(key)
    if (!entry) {
      entry = {
        publisherId: row.publisherId,
        publisherName: row.publisherName,
        totalErrors: 0,
        byClass: { integration: 0, config: 0, expected: 0 },
        codes: [],
      }
      byPublisher.set(key, entry)
    }

    entry.totalErrors += row.bidErrors

    if (row.errorCode === null) {
      entry.codes.push({ code: null, name: '(코드 없음)', class: null, count: row.bidErrors })
      continue
    }
    const cls = classifyErrorCode(row.errorCode)
    entry.byClass[cls] += row.bidErrors
    entry.codes.push({
      code: row.errorCode,
      name: lookupErrorCode(row.errorCode)?.name ?? '(미정의 코드)',
      class: cls,
      count: row.bidErrors,
    })
  }

  const out = [...byPublisher.values()]
  for (const entry of out) entry.codes.sort((a, b) => b.count - a.count)
  out.sort((a, b) => b.totalErrors - a.totalErrors)
  return out
}
