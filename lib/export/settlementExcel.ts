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
    netAmount: number      // VAT 제외 순매체비
    executionAmount: number // VAT 포함 집행금액 (청구 기준)
  }[]
  totals: {
    netAmount: number
    executionAmount: number
  }
}

// ─── 매출 (Sales) ─────────────────────────────────────────────────
// 한 row = 한 캠페인. 제품 구분(CT+/CT/CTV)에 따라 해당 컬럼에 공급가액 기입.

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
}

export function buildSalesRows(params: {
  month: string
  ctPlus: CtPlusSettlementLike[]
  motivCampaigns: MotivCampaign[]
  assignments: MotivAssignment[]
  agencies: Agency[]
  advertisers: Advertiser[]
  operators: Operator[]
}): SalesRow[] {
  const { month, ctPlus, motivCampaigns, assignments, agencies, advertisers, operators } = params
  const agById = new Map(agencies.map(a => [a.id, a]))
  const advById = new Map(advertisers.map(a => [a.id, a]))
  const opById = new Map(operators.map(o => [o.id, o]))
  const asgById = new Map(assignments.map(a => [a.motivCampaignId, a]))

  const rows: SalesRow[] = []

  // CT+ (내부 DB) — campaignType 'IMC' 는 IMC 컬럼, 그 외 = CT+ 자체 구분 없으므로 IMC 에 합산
  for (const s of ctPlus) {
    const ag = agById.get(s.campaign.agencyId)
    const adv = advById.get(s.campaign.advertiserId)
    const op = opById.get(s.campaign.managerId)
    const net = Math.round(s.totals.netAmount)
    const vat = Math.round(net * 0.1)
    const total = net + vat
    rows.push({
      해당월: s.campaign.settlementMonth || month,
      담당자: op?.name ?? '',
      '세금계산서 작성일자': '',
      '거래처명 (사업자등록증 기준)': ag?.corporateName || ag?.name || s.agName || '',
      캠페인명: s.campaign.campaignName,
      공급가액: net,
      세액: vat,
      합계금액: total,
      '수금일 기준': '',
      '수금 기한': '',
      '수수료 (VAT포함)': 0, // CT+ 수수료는 markup 에 포함. 필요 시 별도 계산.
      수취이메일: adv?.email || ag?.email || '',
      '수수료 세금계산서 발행여부': '',
      'CT 해당금액 (vat 제외)': 0,
      'IMC 해당금액 (vat 제외)': net,
      'TV 해당금액 (vat 제외)': 0,
    })
  }

  // Motiv CT / CTV
  for (const c of motivCampaigns) {
    const product = motivTypeToProduct(c.campaign_type)
    if (product !== 'CT' && product !== 'CTV') continue
    // 무료 캠페인은 매출 정산 대상 아님 (사용자 정책)
    if (c.is_free) continue
    const a = asgById.get(c.id)
    const ag = a?.agencyId ? agById.get(a.agencyId) : undefined
    const adv = a?.advertiserId ? advById.get(a.advertiserId) : undefined
    const op = a?.operatorId ? opById.get(a.operatorId) : undefined
    const cost = Math.round(Number(c.stats?.cost ?? 0))
    const agencyFee = Math.round(Number(c.stats?.agency_fee ?? 0))
    const revenue = Math.round(Number(c.stats?.revenue ?? cost))
    // Motiv: cost 는 이미 VAT 제외 원화 가정 (exchange_rate 적용 여부는 Motiv 응답 기준)
    const net = revenue
    const vat = Math.round(net * 0.1)
    const total = net + vat
    rows.push({
      해당월: month,
      담당자: op?.name ?? '',
      '세금계산서 작성일자': '',
      '거래처명 (사업자등록증 기준)': ag?.corporateName || ag?.name || '',
      캠페인명: c.title ?? `#${c.id}`,
      공급가액: net,
      세액: vat,
      합계금액: total,
      '수금일 기준': '',
      '수금 기한': '',
      '수수료 (VAT포함)': Math.round(agencyFee * 1.1),
      수취이메일: adv?.email || ag?.email || '',
      '수수료 세금계산서 발행여부': '',
      'CT 해당금액 (vat 제외)': product === 'CT' ? net : 0,
      'IMC 해당금액 (vat 제외)': 0,
      'TV 해당금액 (vat 제외)': product === 'CTV' ? net : 0,
    })
  }

  return rows
}

// ─── 매입 (Purchase) ──────────────────────────────────────────────
// 한 row = 캠페인×매체. DMP 수수료 제외한 순매체비.

export interface PurchaseRow {
  담당자: string
  구분: string   // CT / CT+ / CTV
  '세금계산서 작성일자': string
  '거래처명 (세금계산서 기준 거래처명)': string
  캠페인명: string
  공급가액: number
  세액: number
  합계금액: number
  CT: number
  TV: number
  IMC: number
  송금기한: string
  '송금일 기준': string
}

export function buildPurchaseRows(params: {
  month: string
  ctPlus: CtPlusSettlementLike[]
  motivCampaigns: MotivCampaign[]
  assignments: MotivAssignment[]
  operators: Operator[]
}): PurchaseRow[] {
  const { ctPlus, motivCampaigns, assignments, operators } = params
  const opById = new Map(operators.map(o => [o.id, o]))
  const asgById = new Map(assignments.map(a => [a.motivCampaignId, a]))

  const rows: PurchaseRow[] = []

  // CT+ — 매체별 1 row (매체사에게 지급하는 순매체비, DMP 제외)
  for (const s of ctPlus) {
    const op = opById.get(s.campaign.managerId)
    for (const mb of s.mediaRows) {
      const net = Math.round(mb.netAmount)
      if (net <= 0) continue
      const vat = Math.round(net * 0.1)
      const total = net + vat
      rows.push({
        담당자: op?.name ?? '',
        구분: 'CT+',
        '세금계산서 작성일자': '',
        '거래처명 (세금계산서 기준 거래처명)': mb.media, // 매체사명
        캠페인명: s.campaign.campaignName,
        공급가액: net,
        세액: vat,
        합계금액: total,
        CT: 0,
        TV: 0,
        IMC: net, // CT+ 는 IMC 로 분류
        송금기한: '',
        '송금일 기준': '',
      })
    }
  }

  // Motiv CT / CTV — 캠페인 1건 = 1 row (매체 세분화 없음)
  for (const c of motivCampaigns) {
    const product = motivTypeToProduct(c.campaign_type)
    if (product !== 'CT' && product !== 'CTV') continue
    const a = asgById.get(c.id)
    const op = a?.operatorId ? opById.get(a.operatorId) : undefined
    const cost = Math.round(Number(c.stats?.cost ?? 0))
    const agencyFee = Math.round(Number(c.stats?.agency_fee ?? 0))
    const dataFee = Math.round(Number(c.stats?.data_fee ?? 0))
    // 매입 = cost - agency_fee - data_fee (DMP/data_fee 제외)
    const net = Math.max(0, cost - agencyFee - dataFee)
    if (net <= 0) continue
    const vat = Math.round(net * 0.1)
    const total = net + vat
    const label = MEDIA_PRODUCT_LABEL[product]
    rows.push({
      담당자: op?.name ?? '',
      구분: label,
      '세금계산서 작성일자': '',
      '거래처명 (세금계산서 기준 거래처명)': 'Motiv',
      캠페인명: c.title ?? `#${c.id}`,
      공급가액: net,
      세액: vat,
      합계금액: total,
      CT: product === 'CT' ? net : 0,
      TV: product === 'CTV' ? net : 0,
      IMC: 0,
      송금기한: '',
      '송금일 기준': '',
    })
  }

  return rows
}

// ─── Excel 다운로드 ──────────────────────────────────────────────

function rowsToWorksheet<T>(rows: T[], headerOrder: (keyof T)[]): XLSX.WorkSheet {
  // 빈 배열이어도 헤더는 표시
  const data: Record<string, unknown>[] = rows.length > 0
    ? rows.map(r => {
        const obj: Record<string, unknown> = {}
        for (const k of headerOrder) obj[k as string] = r[k]
        return obj
      })
    : [Object.fromEntries(headerOrder.map(k => [k, '']))]
  const ws = XLSX.utils.json_to_sheet(data, { header: headerOrder as string[] })
  // 공급가액/세액/합계금액 등 숫자 컬럼에 천단위 포맷
  // (간단 버전 — 필요 시 엄격한 cell number-format 적용)
  return ws
}

export function downloadSalesExcel(rows: SalesRow[], month: string): void {
  const headers: (keyof SalesRow)[] = [
    '해당월', '담당자', '세금계산서 작성일자', '거래처명 (사업자등록증 기준)',
    '캠페인명', '공급가액', '세액', '합계금액',
    '수금일 기준', '수금 기한', '수수료 (VAT포함)', '수취이메일',
    '수수료 세금계산서 발행여부',
    'CT 해당금액 (vat 제외)', 'IMC 해당금액 (vat 제외)', 'TV 해당금액 (vat 제외)',
  ]
  const ws = rowsToWorksheet(rows, headers)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '매출')
  XLSX.writeFile(wb, `매출_${month}.xlsx`)
}

export function downloadPurchaseExcel(rows: PurchaseRow[], month: string): void {
  const headers: (keyof PurchaseRow)[] = [
    '담당자', '구분', '세금계산서 작성일자',
    '거래처명 (세금계산서 기준 거래처명)',
    '캠페인명', '공급가액', '세액', '합계금액',
    'CT', 'TV', 'IMC',
    '송금기한', '송금일 기준',
  ]
  const ws = rowsToWorksheet(rows, headers)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '매입')
  XLSX.writeFile(wb, `매입_${month}.xlsx`)
}
