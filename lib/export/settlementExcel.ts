import * as XLSX from 'xlsx'
import { roundWon } from '@/lib/calculationService'
import type { Campaign, Agency, Advertiser, Operator } from '@/lib/campaignTypes'
import type { MotivCampaign } from '@/lib/motivApi/types'
import {
  motivTypeToProduct,
  MEDIA_PRODUCT_LABEL,
  labelForTargetingProductId,
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
  광고주명: string
  캠페인명: string
  공급가액: number
  세액: number
  합계금액: number
  // 사용자 요청 (2026-05-22) — '수금일 기준' / '수금 기한' / '수취이메일' 제거.
  '수수료 (VAT포함)': number
  '수수료 세금계산서 발행여부': string
  'CT 해당금액 (vat 제외)': number
  'IMC 해당금액 (vat 제외)': number
  'TV 해당금액 (vat 제외)': number
  비고: string
  참고: string
  업데이트: string
  '수금 여부': string
  '실 수금일': string
  // 내부 메타 (Excel 출력 시 헤더에서 제외 — 페이지에서 그룹핑/수정 식별용)
  _agencyId?: string
  _rowKey: string  // 'sales:{month}:{campaignId}' (override 식별)
}

export interface SalesRowsParams {
  month: string
  ctPlus: CtPlusSettlementLike[]
  motivCampaigns: MotivCampaign[]
  assignments: MotivAssignment[]
  agencies: Agency[]
  advertisers: Advertiser[]
  operators: Operator[]
  /**
   * 기간 정확 stats — /v1/stats/campaign/breakdown 결과 (campaignId → metrics).
   * Motiv list 응답의 c.stats 는 lifetime 누적이라 월별 매출이 부정확.
   * 이 map 의 값을 우선 사용, 없으면 c.stats 폴백.
   *
   * statsByMotivId.get(c.id)?.spend  = 해당 기간의 매출 (revenue)
   * statsByMotivId.get(c.id)?.mediaCost = 매체비 (cost)
   * statsByMotivId.get(c.id)?.agencyFee + dmpFee = 대행+DMP (agency_fee)
   * statsByMotivId.get(c.id)?.dmpFee = DMP (data_fee)
   */
  statsByMotivId?: Map<number, { spend: number; mediaCost: number; agencyFee: number; dmpFee: number }>
  /** 사용자 결정 — 매칭 없이 Motiv API 의 광고계정 정보를 그대로 사용.
   *  campaign.adaccount_id → MotivAdAccount (광고주명·대행사명 포함). */
  adAccountById?: Map<number, import('@/lib/motivApi/types').MotivAdAccount>
}

export function buildSalesRows(params: SalesRowsParams): SalesRow[] {
  const { month, ctPlus, motivCampaigns, assignments, agencies, advertisers, operators, statsByMotivId, adAccountById } = params
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
    const net = roundWon(s.totals.budget)
    if (net <= 0) continue
    const vat = roundWon(net * 0.1)
    // CT+ 수수료 (VAT포함) = (DMP사 비용 + 대행수수료) × 1.1
    const fee = roundWon(s.totals.markup * 1.1)
    rows.push({
      해당월: s.campaign.settlementMonth || month,
      담당자: op?.name ?? '',
      '세금계산서 작성일자': '',
      '거래처명 (사업자등록증 기준)': ag?.corporateName || ag?.name || s.agName || '',
      광고주명: adv?.name || s.advName || '',
      캠페인명: s.campaign.campaignName,
      공급가액: net,
      세액: vat,
      합계금액: net + vat,
      '수수료 (VAT포함)': fee,
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
      _rowKey: `sales:${s.campaign.settlementMonth || month}:${s.campaign.id}`,
    })
  }

  for (const c of motivCampaigns) {
    const product = motivTypeToProduct(c.campaign_type)
    if (product !== 'CT' && product !== 'CTV') continue
    if (c.is_free) continue
    // 사용자 결정 — 광고주/대행사 매칭 없이 Motiv API adAccount 의 값 그대로 사용.
    // assignments(수동 매핑) 은 _agencyId 그룹 키 용도로만 보조 사용. 표시명은 adAccount 우선.
    const a = asgById.get(c.id)
    const op = a?.operatorId ? opById.get(a.operatorId) : undefined
    const adAccount = adAccountById?.get(c.adaccount_id)
    const advertiserDisplay = adAccount?.advertiser_name
      || adAccount?.advertiser?.name
      || adAccount?.name
      || ''
    const agencyDisplay = adAccount?.agency?.corporate_name
      || adAccount?.agency_name
      || adAccount?.agency?.name
      || ''
    // _agencyId 그룹 키 — 우선 internal assignment, 없으면 Motiv agency_id (motiv:{id}) 로 합성.
    const internalAgId = a?.agencyId
    const motivAgId = adAccount?.agency_id ?? (typeof adAccount?.agency?.id === 'number' ? adAccount.agency.id : undefined)
    const groupAgencyId: string | undefined =
      internalAgId ?? (motivAgId != null ? `motiv:${motivAgId}` : undefined)
    const ag = internalAgId ? agById.get(internalAgId) : undefined
    // 사용자 정책 — '해당 기간에 발생한 정확한 매출 SPEND 만'.
    // c.total_spent / c.stats.revenue 모두 lifetime 누적이라 부정확.
    // /stats/campaign/breakdown 결과(periodStats)만 사용. 없으면 0 (집계 불가).
    const periodStats = statsByMotivId?.get(c.id)
    if (!periodStats) continue   // breakdown 결과 없으면 매출 행 skip
    const agencyFee = periodStats.agencyFee + periodStats.dmpFee
    const revenue   = periodStats.spend
    const net = revenue
    if (net <= 0) continue
    const vat = roundWon(net * 0.1)
    rows.push({
      해당월: month,
      담당자: op?.name ?? '',
      '세금계산서 작성일자': '',
      // 사용자 요청 — CT/CTV 매출 거래처명 비어 있는 케이스 fallback.
      //   adAccount API 의 agency_* 가 비어 있으면 internal 대행사 매핑(ag) →
      //   '미지정 대행사' 순으로 채워 표 빈 칸 방지. 광고주명/캠페인명 으로는 fallback 하지 않음 (의미 다름).
      '거래처명 (사업자등록증 기준)': agencyDisplay || ag?.corporateName || ag?.name || '미지정 대행사',
      광고주명: advertiserDisplay,
      캠페인명: c.title ?? `#${c.id}`,
      공급가액: net,
      세액: vat,
      합계금액: net + vat,
      '수수료 (VAT포함)': roundWon(agencyFee * 1.1),
      '수수료 세금계산서 발행여부': '',
      'CT 해당금액 (vat 제외)': product === 'CT' ? net : 0,
      'IMC 해당금액 (vat 제외)': 0,
      'TV 해당금액 (vat 제외)': product === 'CTV' ? net : 0,
      비고: '',
      참고: '',
      업데이트: '',
      '수금 여부': '',
      '실 수금일': '',
      _agencyId: groupAgencyId,
      _rowKey: `sales:${month}:motiv-${c.id}`,
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
  광고주명: string
  캠페인명: string
  공급가액: number
  세액: number
  합계금액: number
  // 사용자 요청 — 매입 행에 거래처별 대행 수수료(agency_fee) + DMP 비용(data_fee) 표시.
  '대행 수수료': number
  '데이터(DMP) 비용': number
  IMC: number
  TV: number
  CT: number
  // 사용자 요청 (2026-05-22) — '송금일 기준' / '송금기한' 제거.
  // 내부 메타
  _agencyId?: string
  _rowKey: string  // 'purchase:{month}:{campaignId}[:media]' (override 식별)
}

export interface PurchaseRowsParams {
  month: string
  ctPlus: CtPlusSettlementLike[]
  motivCampaigns: MotivCampaign[]
  assignments: MotivAssignment[]
  agencies: Agency[]
  advertisers: Advertiser[]
  operators: Operator[]
  /** SalesRowsParams 와 동일 — 매입(매체비)도 기간 stats 로 정확히 계산. */
  statsByMotivId?: Map<number, { spend: number; mediaCost: number; agencyFee: number; dmpFee: number }>
  /** 사용자 결정 — DMP 비용을 vendor(SKP/TG360/...) 별 합산하기 위한 광고그룹 데이터. */
  adGroups?: import('@/lib/hooks/useMotivAdGroups').AdGroupRow[]
  /** 사용자 결정 — 광고주/대행사 매칭 없이 adAccount API 응답 그대로 사용. */
  adAccountById?: Map<number, import('@/lib/motivApi/types').MotivAdAccount>
}

export function buildPurchaseRows(params: PurchaseRowsParams): PurchaseRow[] {
  const { month, ctPlus, motivCampaigns, assignments, agencies, advertisers, operators, statsByMotivId, adAccountById } = params
  const advById = new Map(advertisers.map(a => [a.id, a]))
  const agById = new Map(agencies.map(a => [a.id, a]))
  const opById = new Map(operators.map(o => [o.id, o]))
  const asgById = new Map(assignments.map(a => [a.motivCampaignId, a]))
  const rows: PurchaseRow[] = []

  // 사용자 요청 (2026-05-22) — CT+ 매체비를 캠페인별이 아니라 매체별(supplier 별)로 합산.
  //   네이버 GFA + 카카오모먼트 = '매드코퍼레이션' 통합 1행 (괄호 매체명 제거).
  //   META = 단독 거래처 1행.  Google = 단독 거래처 1행.
  //   _agencyId: 'supplier:{key}' — AgencySummaryPanel 에서 매체별 카드로 그룹핑.
  //   R-07 주의: 캠페인별 개별 반올림 합과 합산 후 반올림 ±1원 차이 가능. Excel total 검산 시 인지 필요.
  type SupplierKey = 'mad' | 'meta' | 'google' | string
  const SUPPLIER_LABEL: Record<string, string> = {
    mad:    '매드코퍼레이션',
    meta:   'META',
    google: 'Google',
  }
  function ctplusSupplierKey(media: string): SupplierKey {
    if (media === '네이버 GFA' || media === '카카오모먼트') return 'mad'
    if (media === 'META')   return 'meta'
    if (media === 'Google') return 'google'
    return media  // 나머지 매체는 매체명 그대로
  }

  type SupplierBucket = {
    net: number
    campaigns: Set<string>
    advertisers: Set<string>
    settleMonth: string
  }
  const supplierBuckets = new Map<SupplierKey, SupplierBucket>()

  for (const s of ctPlus) {
    const adv = advById.get(s.campaign.advertiserId)
    for (const mb of s.mediaRows) {
      // main #122 — CT+ 매입을 공급처(매체)별로 합산. roundWon 으로 IEEE754 보정.
      const net = roundWon(mb.netAmount)
      if (net <= 0) continue
      const key = ctplusSupplierKey(mb.media)
      const bucket = supplierBuckets.get(key) ?? {
        net: 0,
        campaigns: new Set<string>(),
        advertisers: new Set<string>(),
        settleMonth: s.campaign.settlementMonth || month,
      }
      bucket.net += net
      bucket.campaigns.add(s.campaign.campaignName)
      bucket.advertisers.add(adv?.name || s.advName || '')
      supplierBuckets.set(key, bucket)
    }
  }

  for (const [key, bucket] of supplierBuckets) {
    const net = roundWon(bucket.net)
    const vat = roundWon(net * 0.1)
    const label = SUPPLIER_LABEL[key] ?? key
    const advDisplay = bucket.advertisers.size === 1
      ? [...bucket.advertisers][0]
      : `(${bucket.advertisers.size}개 광고주)`
    const campDisplay = `(매체별 합산, ${bucket.campaigns.size}건)`
    rows.push({
      년월: bucket.settleMonth,
      담당자: '',
      구분: 'CT+ (IMC) 매체비',
      일자: '',
      '거래처명 (세금계산서 기준)': label,
      광고주명: advDisplay,
      캠페인명: campDisplay,
      공급가액: net,
      세액: vat,
      합계금액: net + vat,
      '대행 수수료': 0,
      '데이터(DMP) 비용': 0,
      IMC: net,
      TV: 0,
      CT: 0,
      _agencyId: `supplier:${key}`,
      _rowKey: `purchase:${bucket.settleMonth}:supplier-${key}`,
    })
  }

  // 사용자 결정 — Motiv 매입은 (a) 대행수수료 행 + (b) DMP 비용 vendor 별 행 으로 분리.
  // (a) 대행수수료: 캠페인 별. adAccount 의 광고주/대행사 그대로 표시 (매칭 X).
  // (b) DMP 비용: vendor(SKP/TG360/LOTTE/KB/WIFI/ETC) 별 합산, CT/CTV 컬럼 split.
  const dmpVendorAcc = new Map<string, { CT: number; TV: number }>()  // vendor → product 합

  for (const c of motivCampaigns) {
    const product = motivTypeToProduct(c.campaign_type)
    if (product !== 'CT' && product !== 'CTV') continue
    const a = asgById.get(c.id)
    const op = a?.operatorId ? opById.get(a.operatorId) : undefined
    const adAccount = adAccountById?.get(c.adaccount_id)
    const advertiserDisplay = adAccount?.advertiser_name
      || adAccount?.advertiser?.name
      || adAccount?.name
      || ''
    const agencyDisplay = adAccount?.agency?.corporate_name
      || adAccount?.agency_name
      || adAccount?.agency?.name
      || ''
    const internalAgId = a?.agencyId
    const motivAgId = adAccount?.agency_id ?? (typeof adAccount?.agency?.id === 'number' ? adAccount.agency.id : undefined)
    const groupAgencyId: string | undefined =
      internalAgId ?? (motivAgId != null ? `motiv:${motivAgId}` : undefined)
    const ag = internalAgId ? agById.get(internalAgId) : undefined
    const periodStats = statsByMotivId?.get(c.id)
    const agencyFee = periodStats ? periodStats.agencyFee : roundWon(Number(c.stats?.agency_fee ?? 0))
    const dataFee   = periodStats ? periodStats.dmpFee    : roundWon(Number(c.stats?.data_fee ?? 0))
    const label = MEDIA_PRODUCT_LABEL[product]

    // (a) 대행수수료 행 — agency_fee 만, DMP 제외.
    if (agencyFee > 0) {
      const vat = roundWon(agencyFee * 0.1)
      rows.push({
        년월: month,
        담당자: op?.name ?? '',
        구분: `${label} 대행수수료`,
        일자: '',
        // 사용자 요청 — CT/CTV 매입 거래처명 비어 있는 케이스 fallback.
        //   adAccount API agency_* 가 비어 있으면 internal 대행사 매핑(ag) → '미지정 대행사' 순.
        //   이전 'Motiv' fallback 은 자사명이 거래처 자리에 들어가 부적절 → 제거.
        '거래처명 (세금계산서 기준)': agencyDisplay || ag?.corporateName || ag?.name || '미지정 대행사',
        광고주명: advertiserDisplay,
        캠페인명: c.title ?? `#${c.id}`,
        공급가액: agencyFee,
        세액: vat,
        합계금액: agencyFee + vat,
        '대행 수수료': agencyFee,
        '데이터(DMP) 비용': 0,
        IMC: 0,
        TV: product === 'CTV' ? agencyFee : 0,
        CT: product === 'CT' ? agencyFee : 0,
        _agencyId: groupAgencyId,
        _rowKey: `purchase:${month}:motiv-${c.id}:agencyFee`,
      })
    }

    // (b) DMP vendor 합산 — vendor 별 product split.
    if (dataFee > 0) {
      // 광고그룹 비율 추출 — adGroups 가 없으면 ETC 로 몰림.
      const campAdGroups = (params.adGroups ?? []).filter(g => g.campaignId === c.id)
      const totalGroupFee = campAdGroups.reduce((s, g) => s + g.dataFee, 0)
      const vendorWeights = new Map<string, number>()  // vendor → weight
      if (totalGroupFee > 0) {
        for (const g of campAdGroups) {
          const v = labelForTargetingProductId(g.targetingProductId)
          const key = (v === 'SKP' || v === 'TG360' || v === 'LOTTE' || v === 'KB' || v === 'WIFI') ? v : 'ETC'
          vendorWeights.set(key, (vendorWeights.get(key) ?? 0) + g.dataFee)
        }
        for (const [vendor, w] of vendorWeights) {
          const share = (w / totalGroupFee) * dataFee
          const cur = dmpVendorAcc.get(vendor) ?? { CT: 0, TV: 0 }
          if (product === 'CT') cur.CT += share
          else                  cur.TV += share
          dmpVendorAcc.set(vendor, cur)
        }
      } else if (campAdGroups.length > 0) {
        // adGroup dataFee 모두 0 → 광고그룹 개수 비율로 vendor 분배.
        for (const g of campAdGroups) {
          const v = labelForTargetingProductId(g.targetingProductId)
          const key = (v === 'SKP' || v === 'TG360' || v === 'LOTTE' || v === 'KB' || v === 'WIFI') ? v : 'ETC'
          vendorWeights.set(key, (vendorWeights.get(key) ?? 0) + 1)
        }
        const total = campAdGroups.length
        for (const [vendor, count] of vendorWeights) {
          const share = (count / total) * dataFee
          const cur = dmpVendorAcc.get(vendor) ?? { CT: 0, TV: 0 }
          if (product === 'CT') cur.CT += share
          else                  cur.TV += share
          dmpVendorAcc.set(vendor, cur)
        }
      } else {
        const cur = dmpVendorAcc.get('ETC') ?? { CT: 0, TV: 0 }
        if (product === 'CT') cur.CT += dataFee
        else                  cur.TV += dataFee
        dmpVendorAcc.set('ETC', cur)
      }
    }
  }

  // DMP vendor 행 일괄 추가 — 캠페인 별이 아닌 vendor 별 합산 (사용자 요구).
  const dmpOrder = ['SKP', 'TG360', 'LOTTE', 'KB', 'WIFI', 'ETC'] as const
  for (const vendor of dmpOrder) {
    const acc = dmpVendorAcc.get(vendor)
    if (!acc) continue
    const ct = roundWon(acc.CT)
    const tv = roundWon(acc.TV)
    const net = ct + tv
    if (net <= 0) continue
    const vat = roundWon(net * 0.1)
    rows.push({
      년월: month,
      담당자: '',
      구분: `DMP (${vendor})`,
      일자: '',
      '거래처명 (세금계산서 기준)': vendor,
      광고주명: '',
      캠페인명: '(전체 캠페인 합산)',
      공급가액: net,
      세액: vat,
      합계금액: net + vat,
      '대행 수수료': 0,
      '데이터(DMP) 비용': net,
      IMC: 0,
      TV: tv,
      CT: ct,
      _rowKey: `purchase:${month}:dmp-vendor-${vendor}`,
    })
  }

  return rows
}

// ─── Excel 시트 헬퍼 ──────────────────────────────────────────────

// 사용자 요청 (2026-05-22) — Excel 출력 컬럼에서 '담당자', '세금계산서 작성일자' 제거.
// 인터페이스의 필드 자체는 UI 편집/override 영역에서 여전히 사용 가능하나 시트 출력에서만 숨김.
const SALES_HEADERS: (keyof SalesRow)[] = [
  '해당월', '거래처명 (사업자등록증 기준)', '광고주명',
  '캠페인명', '공급가액', '세액', '합계금액',
  '수수료 (VAT포함)', '수수료 세금계산서 발행여부',
  'CT 해당금액 (vat 제외)', 'IMC 해당금액 (vat 제외)', 'TV 해당금액 (vat 제외)',
  '비고', '참고', '업데이트', '수금 여부', '실 수금일',
]

// 사용자 요청 (2026-05-22) — '담당자', '일자' 제거.
const PURCHASE_HEADERS: (keyof PurchaseRow)[] = [
  '년월', '구분',
  '거래처명 (세금계산서 기준)', '광고주명',
  '캠페인명', '공급가액', '세액', '합계금액',
  '대행 수수료', '데이터(DMP) 비용',
  'IMC', 'TV', 'CT',
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
