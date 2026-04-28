import * as XLSX from 'xlsx'
import type { Campaign, Agency, Advertiser, Operator } from '@/lib/campaignTypes'
import type { MotivCampaign } from '@/lib/motivApi/types'
import {
  motivTypeToProduct,
  MEDIA_PRODUCT_LABEL,
  type MotivAssignment,
} from '@/lib/motivApi/productMapping'

// ─── 타입 ─────────────────────────────────────────────────────────

export interface CtPlusSettlementLike {
  campaign: Campaign
  agName: string
  advName: string
  mediaRows: {
    media: string
    netAmount: number          // RAW CSV 순집행 — 매입 공급가액
    executionAmount: number    // CSV 집행 (참고)
    budget: number             // 부킹 금액 — 매출 공급가액 산정 기준
    markup: number             // VAT 제외 마크업 합 (DMP비용 + 대행수수료 등) — 수수료(VAT포함) 산정 기준
  }[]
  totals: {
    netAmount: number          // 매입 합계 (VAT 제외)
    executionAmount: number
    budget: number             // 매출 공급가액 (VAT 제외)
    markup: number             // 수수료 합계 (VAT 제외) — × 1.1 하면 수수료(VAT포함)
  }
}

// ─── 공통 유틸 ────────────────────────────────────────────────────

function fmtDateDot(d: Date): string {
  const y = String(d.getFullYear()).slice(-2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function lastDayOfMonth(month: string): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0) // m+1 month 의 0일째 = 해당 월 말일
}

/** Agency 의 paymentBasis 가 비어있으면 paymentDueDays 로 자동 계산. */
function computePaymentDueDate(month: string, agency: Agency | undefined): string {
  if (!agency?.paymentDueDays) return ''
  const monthEnd = lastDayOfMonth(month)
  const due = new Date(monthEnd)
  due.setDate(due.getDate() + agency.paymentDueDays)
  return fmtDateDot(due)
}

function paymentBasisOf(agency: Agency | undefined): string {
  if (!agency?.paymentBasis) {
    if (agency?.paymentDueDays) return `월말 마감 익월 ${agency.paymentDueDays}일`
    return ''
  }
  return agency.paymentBasis
}

/**
 * 캠페인명 단순화 — Excel 출력 전용.
 *
 * 정리 규칙:
 *   1) 마지막의 날짜 코드 제거: `_250411`, `-230509`, ` 250411` 등 (6~8자리 숫자)
 *   2) 마지막의 괄호/대괄호 부가설명 제거: `(CTV광고사업본부)`, `[테스트]`
 *   3) trim 후 41자 이상이면 38자 + `…` 으로 단축
 * 플랫폼 UI 는 영향 없음 (build*Rows 는 원본 유지, 다운로드 함수에서만 적용).
 */
export function simplifyCampaignName(name: string | null | undefined): string {
  if (!name) return ''
  const original = String(name)
  let s = original.trim()
  // _YYMMDD / -YYYYMMDD 형태의 날짜 코드와 그 뒤를 통째로 제거 (단, 의미있는 본문은 보존)
  s = s.replace(/[_\-\s]\d{6,8}\b.*$/, '')
  // 끝부분의 (...) 또는 [...] 메타 제거
  s = s.replace(/\s*[(\[][^()\[\]]*[)\]]\s*$/, '')
  s = s.trim()
  if (s.length === 0) return original
  if (s.length > 40) s = s.slice(0, 38) + '…'
  return s
}

/**
 * 거래처(대행사) 단위로 정렬:
 *  - 미지정(_agencyId 없음) 행은 마지막
 *  - 거래처명 가나다순 → 같은 거래처 내 캠페인명 가나다순
 */
function sortByAgency<T extends { _agencyId?: string }>(
  rows: T[],
  agencyKey: (r: T) => string,
  campaignKey: (r: T) => string,
): T[] {
  return [...rows].sort((a, b) => {
    const aOrphan = !a._agencyId
    const bOrphan = !b._agencyId
    if (aOrphan !== bOrphan) return aOrphan ? 1 : -1
    const c = agencyKey(a).localeCompare(agencyKey(b))
    if (c !== 0) return c
    return campaignKey(a).localeCompare(campaignKey(b))
  })
}

// ─── 매출 (Sales) ─────────────────────────────────────────────────
// 1 row = 1 캠페인. 사용자 요구 컬럼 전체 (비고/참고/업데이트/수금여부/실수금일 포함).

export interface SalesRow {
  해당월: string
  담당자: string
  '세금계산서 작성일자': string
  '거래처명 (사업자등록증 기준)': string
  캠페인명: string
  공급가액: number
  세액: number
  합계금액: number
  '수금일 기준': string
  '수금 기한': string
  '수수료 (VAT포함)': number
  수취이메일: string
  '수수료 세금계산서 발행여부': string
  'CT 해당금액 (vat 제외)': number
  'IMC 해당금액 (vat 제외)': number
  'TV 해당금액 (vat 제외)': number
  비고: string
  참고: string
  업데이트: string
  '수금 여부': string
  '실 수금일': string
  // 내부 메타 (Excel 출력 시 헤더에서 제외 — 페이지에서 그룹핑용)
  _agencyId?: string
}

export interface SalesRowsParams {
  month: string
  ctPlus: CtPlusSettlementLike[]
  motivCampaigns: MotivCampaign[]
  assignments: MotivAssignment[]
  agencies: Agency[]
  advertisers: Advertiser[]
  operators: Operator[]
}

export function buildSalesRows(params: SalesRowsParams): SalesRow[] {
  const { month, ctPlus, motivCampaigns, assignments, agencies, advertisers, operators } = params
  const agById = new Map(agencies.map(a => [a.id, a]))
  const advById = new Map(advertisers.map(a => [a.id, a]))
  const opById = new Map(operators.map(o => [o.id, o]))
  const asgById = new Map(assignments.map(a => [a.motivCampaignId, a]))

  const rows: SalesRow[] = []

  for (const s of ctPlus) {
    const ag = agById.get(s.campaign.agencyId)
    const adv = advById.get(s.campaign.advertiserId)
    const op = opById.get(s.campaign.managerId)
    // CT+ 매출 공급가액 = 부킹 금액 (광고주 청구 기준)
    const net = Math.round(s.totals.budget)
    const vat = Math.round(net * 0.1)
    // CT+ 수수료 (VAT포함) = (DMP사 비용 + 대행수수료) × 1.1
    const fee = Math.round(s.totals.markup * 1.1)
    rows.push({
      해당월: s.campaign.settlementMonth || month,
      담당자: op?.name ?? '',
      '세금계산서 작성일자': '',
      '거래처명 (사업자등록증 기준)': ag?.corporateName || ag?.name || s.agName || '',
      캠페인명: s.campaign.campaignName,
      공급가액: net,
      세액: vat,
      합계금액: net + vat,
      '수금일 기준': paymentBasisOf(ag),
      '수금 기한': computePaymentDueDate(month, ag),
      '수수료 (VAT포함)': fee,
      수취이메일: adv?.email || ag?.email || '',
      '수수료 세금계산서 발행여부': '',
      'CT 해당금액 (vat 제외)': 0,
      'IMC 해당금액 (vat 제외)': net,
      'TV 해당금액 (vat 제외)': 0,
      비고: '',
      참고: '',
      업데이트: '',
      '수금 여부': '',
      '실 수금일': '',
      _agencyId: ag?.id,
    })
  }

  for (const c of motivCampaigns) {
    const product = motivTypeToProduct(c.campaign_type)
    if (product !== 'CT' && product !== 'CTV') continue
    if (c.is_free) continue
    const a = asgById.get(c.id)
    const ag = a?.agencyId ? agById.get(a.agencyId) : undefined
    const adv = a?.advertiserId ? advById.get(a.advertiserId) : undefined
    const op = a?.operatorId ? opById.get(a.operatorId) : undefined
    const agencyFee = Math.round(Number(c.stats?.agency_fee ?? 0))
    const revenue = Math.round(Number(c.stats?.revenue ?? c.stats?.cost ?? 0))
    const net = revenue
    const vat = Math.round(net * 0.1)
    rows.push({
      해당월: month,
      담당자: op?.name ?? '',
      '세금계산서 작성일자': '',
      '거래처명 (사업자등록증 기준)': ag?.corporateName || ag?.name || '',
      캠페인명: c.title ?? `#${c.id}`,
      공급가액: net,
      세액: vat,
      합계금액: net + vat,
      '수금일 기준': paymentBasisOf(ag),
      '수금 기한': computePaymentDueDate(month, ag),
      '수수료 (VAT포함)': Math.round(agencyFee * 1.1),
      수취이메일: adv?.email || ag?.email || '',
      '수수료 세금계산서 발행여부': '',
      'CT 해당금액 (vat 제외)': product === 'CT' ? net : 0,
      'IMC 해당금액 (vat 제외)': 0,
      'TV 해당금액 (vat 제외)': product === 'CTV' ? net : 0,
      비고: '',
      참고: '',
      업데이트: '',
      '수금 여부': '',
      '실 수금일': '',
      _agencyId: ag?.id,
    })
  }

  return rows
}

// ─── 매입 (Purchase) ──────────────────────────────────────────────

export interface PurchaseRow {
  년월: string
  담당자: string
  구분: string
  일자: string
  '거래처명 (세금계산서 기준)': string
  캠페인명: string
  공급가액: number
  세액: number
  합계금액: number
  IMC: number
  TV: number
  CT: number
  '송금일 기준': string
  송금기한: string
  // 내부 메타
  _agencyId?: string
}

export interface PurchaseRowsParams {
  month: string
  ctPlus: CtPlusSettlementLike[]
  motivCampaigns: MotivCampaign[]
  assignments: MotivAssignment[]
  agencies: Agency[]
  operators: Operator[]
}

export function buildPurchaseRows(params: PurchaseRowsParams): PurchaseRow[] {
  const { month, ctPlus, motivCampaigns, assignments, agencies, operators } = params
  const agById = new Map(agencies.map(a => [a.id, a]))
  const opById = new Map(operators.map(o => [o.id, o]))
  const asgById = new Map(assignments.map(a => [a.motivCampaignId, a]))
  const rows: PurchaseRow[] = []

  for (const s of ctPlus) {
    const ag = agById.get(s.campaign.agencyId)
    const op = opById.get(s.campaign.managerId)
    for (const mb of s.mediaRows) {
      // CT+ 매입 공급가액 = RAW CSV netAmount (VAT 별도) — 매체사 실 집행 기준
      const net = Math.round(mb.netAmount)
      if (net <= 0) continue
      const vat = Math.round(net * 0.1)
      rows.push({
        년월: s.campaign.settlementMonth || month,
        담당자: op?.name ?? '',
        구분: 'CT+ (IMC)',
        일자: '',
        '거래처명 (세금계산서 기준)': mb.media,
        캠페인명: s.campaign.campaignName,
        공급가액: net,
        세액: vat,
        합계금액: net + vat,
        IMC: net,
        TV: 0,
        CT: 0,
        '송금일 기준': paymentBasisOf(ag),
        송금기한: computePaymentDueDate(month, ag),
        _agencyId: ag?.id,
      })
    }
  }

  for (const c of motivCampaigns) {
    const product = motivTypeToProduct(c.campaign_type)
    if (product !== 'CT' && product !== 'CTV') continue
    const a = asgById.get(c.id)
    const ag = a?.agencyId ? agById.get(a.agencyId) : undefined
    const op = a?.operatorId ? opById.get(a.operatorId) : undefined
    const cost = Math.round(Number(c.stats?.cost ?? 0))
    const agencyFee = Math.round(Number(c.stats?.agency_fee ?? 0))
    const dataFee = Math.round(Number(c.stats?.data_fee ?? 0))
    const net = Math.max(0, cost - agencyFee - dataFee)
    if (net <= 0) continue
    const vat = Math.round(net * 0.1)
    const label = MEDIA_PRODUCT_LABEL[product]
    rows.push({
      년월: month,
      담당자: op?.name ?? '',
      구분: label,
      일자: '',
      '거래처명 (세금계산서 기준)': ag?.corporateName || ag?.name || 'Motiv',
      캠페인명: c.title ?? `#${c.id}`,
      공급가액: net,
      세액: vat,
      합계금액: net + vat,
      IMC: 0,
      TV: product === 'CTV' ? net : 0,
      CT: product === 'CT' ? net : 0,
      '송금일 기준': paymentBasisOf(ag),
      송금기한: computePaymentDueDate(month, ag),
      _agencyId: ag?.id,
    })
  }

  return rows
}

// ─── Excel 시트 헬퍼 ──────────────────────────────────────────────

const SALES_HEADERS: (keyof SalesRow)[] = [
  '해당월', '담당자', '세금계산서 작성일자', '거래처명 (사업자등록증 기준)',
  '캠페인명', '공급가액', '세액', '합계금액',
  '수금일 기준', '수금 기한', '수수료 (VAT포함)', '수취이메일',
  '수수료 세금계산서 발행여부',
  'CT 해당금액 (vat 제외)', 'IMC 해당금액 (vat 제외)', 'TV 해당금액 (vat 제외)',
  '비고', '참고', '업데이트', '수금 여부', '실 수금일',
]

const PURCHASE_HEADERS: (keyof PurchaseRow)[] = [
  '년월', '담당자', '구분', '일자',
  '거래처명 (세금계산서 기준)',
  '캠페인명', '공급가액', '세액', '합계금액',
  'IMC', 'TV', 'CT',
  '송금일 기준', '송금기한',
]

function rowsToSheet<T>(rows: T[], headers: (keyof T)[]): XLSX.WorkSheet {
  const data: Record<string, unknown>[] = rows.length > 0
    ? rows.map(r => {
        const obj: Record<string, unknown> = {}
        for (const k of headers) obj[k as string] = r[k]
        return obj
      })
    : [Object.fromEntries(headers.map(k => [k, '']))]
  return XLSX.utils.json_to_sheet(data, { header: headers as string[] })
}

// ─── 매출/매입 통합 시트 다운로드 ────────────────────────────────

export function downloadSalesExcel(rows: SalesRow[], month: string): void {
  const sorted = sortByAgency(
    rows,
    r => r['거래처명 (사업자등록증 기준)'] ?? '',
    r => r.캠페인명 ?? '',
  )
  const ready = sorted.map(r => ({ ...r, 캠페인명: simplifyCampaignName(r.캠페인명) }))
  const ws = rowsToSheet(ready, SALES_HEADERS)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '매출')
  XLSX.writeFile(wb, `매출_${month}.xlsx`)
}

export function downloadPurchaseExcel(rows: PurchaseRow[], month: string): void {
  const sorted = sortByAgency(
    rows,
    r => r['거래처명 (세금계산서 기준)'] ?? '',
    r => r.캠페인명 ?? '',
  )
  const ready = sorted.map(r => ({ ...r, 캠페인명: simplifyCampaignName(r.캠페인명) }))
  const ws = rowsToSheet(ready, PURCHASE_HEADERS)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '매입')
  XLSX.writeFile(wb, `매입_${month}.xlsx`)
}

// ─── 거래처(대행사)별 그룹핑 ────────────────────────────────────

export function groupSalesByAgency(rows: SalesRow[]): Map<string, SalesRow[]> {
  const m = new Map<string, SalesRow[]>()
  for (const r of rows) {
    const key = r._agencyId ?? '__unassigned__'
    const arr = m.get(key) ?? []
    arr.push(r)
    m.set(key, arr)
  }
  return m
}

export function groupPurchaseByAgency(rows: PurchaseRow[]): Map<string, PurchaseRow[]> {
  const m = new Map<string, PurchaseRow[]>()
  for (const r of rows) {
    const key = r._agencyId ?? '__unassigned__'
    const arr = m.get(key) ?? []
    arr.push(r)
    m.set(key, arr)
  }
  return m
}

export function sumSales(rows: SalesRow[]) {
  return rows.reduce(
    (acc, r) => ({
      net: acc.net + Number(r.공급가액 ?? 0),
      vat: acc.vat + Number(r.세액 ?? 0),
      total: acc.total + Number(r.합계금액 ?? 0),
      fee: acc.fee + Number(r['수수료 (VAT포함)'] ?? 0),
    }),
    { net: 0, vat: 0, total: 0, fee: 0 },
  )
}

export function sumPurchase(rows: PurchaseRow[]) {
  return rows.reduce(
    (acc, r) => ({
      net: acc.net + Number(r.공급가액 ?? 0),
      vat: acc.vat + Number(r.세액 ?? 0),
      total: acc.total + Number(r.합계금액 ?? 0),
    }),
    { net: 0, vat: 0, total: 0 },
  )
}
