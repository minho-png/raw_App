/**
 * 월(YYYY-MM) ↔ 일자 범위 변환 — 정산/분석 페이지 공용.
 *
 * 정산 조회는 **월 단위로만** 한다 (사용자 결정 2026-06-16): 기간을 넘어가는 정보를
 * 불러오면 업스트림 집계·전송 과부하가 생긴다. 본 유틸로 항상 단일 월 [1일~말일] 만
 * 만들어 Open API 정산 호출에 전달한다.
 *
 * 이전엔 useMotivSettlementCampaigns 내부 private monthToRange + 각 정산 페이지가
 * 동일 로직을 inline 재구현했다. 단일 소스로 추출해 중복 제거.
 */

export interface DateRange {
  /** YYYY-MM-DD (해당 월 1일) */
  start: string
  /** YYYY-MM-DD (해당 월 말일) */
  end: string
}

const MONTH_RE = /^(\d{4})-(\d{2})$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 'YYYY-MM' → { start: 'YYYY-MM-01', end: 'YYYY-MM-말일' }. 형식 오류 시 null.
 * 말일은 로컬 TZ 무관하게 계산 (Date(y, mo, 0) = 그 달 마지막 날).
 */
export function monthToRange(month: string): DateRange | null {
  const m = MONTH_RE.exec(month)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  const lastDay = new Date(y, mo, 0).getDate()
  return {
    start: `${y}-${pad2(mo)}-01`,
    end: `${y}-${pad2(mo)}-${pad2(lastDay)}`,
  }
}

/** 현재(KST) 월 'YYYY-MM'. 정산 페이지 기본 선택 월. */
export function currentMonthKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}`
}

/** 'YYYY-MM' 형식 유효성. */
export function isValidMonth(month: string): boolean {
  const m = MONTH_RE.exec(month)
  if (!m) return false
  const mo = Number(m[2])
  return mo >= 1 && mo <= 12
}
