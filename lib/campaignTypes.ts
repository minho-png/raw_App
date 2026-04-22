export type CampaignStatus = '집행 중' | '종료'
// CT+ 캠페인은 정산 분류상 IMC에 해당. CT(CT-CTV)는 별도 브랜치에서 관리.
export type CampaignType = 'IMC' | 'video'
export const CAMPAIGN_TYPES: CampaignType[] = ['IMC', 'video']

export const AVAILABLE_MEDIA = ['네이버 GFA', '카카오모먼트', 'Google', 'META'] as const
export type MediaName = typeof AVAILABLE_MEDIA[number]

export const MEDIA_MARKUP_RATE: Record<string, number> = {
  '네이버 GFA': 0, '카카오모먼트': 0, 'Google': 10, 'META': 10,
}

export const MEDIA_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '네이버 GFA':   { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200' },
  '카카오모먼트': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  'Google':       { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200' },
  'META':         { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
}

// DMP 활용 타겟팅 → DMP 수수료 10% 고정
export const DMP_TARGETS = ['SKP', 'LOTTE', 'TG360', 'WIFI', 'KB', 'HyperLocal'] as const
// DMP 미활용 타겟팅 → DMP 수수료 0%
export const NON_DMP_TARGETS = ['리타겟팅', '매체 타겟팅'] as const
export const DMP_FEE_RATE = 10

// DMP별 개별 정산 수수료율
export const DMP_FEE_RATES: Record<string, number> = {
  'SKP': 10, 'LOTTE': 9, 'TG360': 10, 'WIFI': 10, 'KB': 10, 'HyperLocal': 0,
}

export interface TargetingBudget {
  budget: number
  spend: number
  agencyFeeRate: number
  targetings: string[]
}

export interface SubCampaign {
  id: string
  name: string                 // 서브 캠페인명 (UI 표시용)
  csvCampaignNames?: string[]  // CSV 캠페인명 매핑 목록 (raw 데이터 매칭용)
  budget: number               // 예산
  spend: number                // 집행액
  totalFeeRate?: number        // 개별 수수료율 (%) — 부모 MediaBudget보다 우선
  cpcTarget?: number           // CPC 목표
  cpmTarget?: number           // CPM 목표
  ctrTarget?: number           // CTR 목표 (%)
  vtrTarget?: number           // VTR 목표 (%) — 동영상 캠페인용
  isVideo?: boolean            // 동영상 캠페인 여부
}

export interface MediaBudget {
  media: string
  dmp: TargetingBudget    // DMP 활용 (fee=10%)
  nonDmp: TargetingBudget // DMP 미활용 (fee=0%)
  totalFeeRate?: number      // 총 수수료율 (%) — DMP+대행수수료 통합
  totalBudget?: number       // 총 부킹 예산
  cpcTarget?: number         // CPC 목표
  cpmTarget?: number         // CPM 목표
  ctrTarget?: number         // CTR 목표 (%)
  vtrTarget?: number         // VTR 목표 (%) — 동영상 캠페인용
  isVideo?: boolean          // 동영상 캠페인 여부
  subCampaigns?: SubCampaign[]  // 매체 내 서브 캠페인 목록
  // ── 실 집행 데이터 (수동 입력) ───────────────────────────
  actualSettingCost?: number  // 실 세팅금액 (직접 입력)
  actualNetAmount?: number    // 실 소진액 (직접 입력)
}

export interface Operator {
  id: string
  name: string
  email: string
  phone: string
}

export interface Agency {
  id: string
  name: string                   // 대행사명
  contactName: string            // 담당자명
  email: string
  phone: string
  // ── 세금계산서 발행 정보 ──────────────────────────────────
  corporateName?: string         // 법인명 (계산서 수신처)
  businessNumber?: string        // 사업자등록번호 (000-00-00000)
  representative?: string        // 대표자명
  address?: string               // 주소
  businessType?: string          // 업태
  businessItem?: string          // 종목
  // ── 정산 정책 ──────────────────────────────────────────
  defaultMarkupRate?: number     // 기본 대행수수료율 (%)
  // ── 첨부 파일 ──────────────────────────────────────────
  registrationPdfBase64?: string // 사업자등록증 PDF (base64)
  registrationPdfName?: string   // 원본 파일명
  // ── 메타 ───────────────────────────────────────────────
  createdAt?: string
  updatedAt?: string
}

export interface Advertiser {
  id: string
  name: string
  agencyId: string       // Agency.id 참조
}

export interface Campaign {
  id: string
  advertiserId: string   // Advertiser.id 참조
  campaignName: string
  campaignType?: CampaignType  // 캠페인 유형: CT+ | IMC (정산 분류용)
  memo?: string          // 특이사항 메모
  mediaBudgets: MediaBudget[]
  startDate: string
  endDate: string
  settlementMonth: string
  agencyId: string       // Agency.id 참조
  managerId: string
  status: CampaignStatus
  createdAt: string
  agencyFeeRate?: number  // 대행수수료율 (%) — 정산 페이지 기본값으로 활용
  csvNames?: string[]    // CSV 캠페인명 연결 목록 (데이터 입력 시 매칭용)
}

export function getTotalMarkup(mediaMarkup: number, dmpFeeRate: number, agencyFeeRate: number): number {
  return mediaMarkup + dmpFeeRate + agencyFeeRate
}

export function calcSettingCost(budget: number, totalMarkupRate: number): number {
  return Math.round(budget * (1 - totalMarkupRate / 100))
}

export function calcSpendRate(spend: number, settingCost: number): number {
  if (settingCost <= 0) return 0
  return Math.round((spend / settingCost) * 1000) / 10
}

export function getMediaTotals(mb: MediaBudget) {
  // totalBudget + totalFeeRate unified setting takes priority
  if (mb.totalBudget !== undefined && mb.totalFeeRate !== undefined) {
    const totalSettingCost = calcSettingCost(mb.totalBudget, mb.totalFeeRate)
    const totalSpend = mb.dmp.spend + mb.nonDmp.spend
    return {
      totalBudget: mb.totalBudget, totalSettingCost, totalSpend,
      spendRate: calcSpendRate(totalSpend, totalSettingCost),
      dmpMarkup: mb.totalFeeRate, nonDmpMarkup: mb.totalFeeRate,
      dmpSC: totalSettingCost, nonDmpSC: 0,
    }
  }
  // Fallback to separate DMP / non-DMP approach
  const mm = MEDIA_MARKUP_RATE[mb.media] ?? 0
  const dmpMarkup    = getTotalMarkup(mm, DMP_FEE_RATE, mb.dmp.agencyFeeRate)
  const nonDmpMarkup = getTotalMarkup(mm, 0,            mb.nonDmp.agencyFeeRate)
  const dmpSC    = calcSettingCost(mb.dmp.budget,    dmpMarkup)
  const nonDmpSC = calcSettingCost(mb.nonDmp.budget, nonDmpMarkup)
  const totalBudget      = mb.dmp.budget    + mb.nonDmp.budget
  const totalSettingCost = dmpSC            + nonDmpSC
  const totalSpend       = mb.dmp.spend     + mb.nonDmp.spend
  return {
    totalBudget, totalSettingCost, totalSpend,
    spendRate: calcSpendRate(totalSpend, totalSettingCost),
    dmpMarkup, nonDmpMarkup, dmpSC, nonDmpSC,
  }
}

export function getCampaignTotals(c: Campaign) {
  let totalBudget = 0, totalSettingCost = 0, totalSpend = 0
  for (const mb of c.mediaBudgets) {
    const t = getMediaTotals(mb)
    totalBudget      += t.totalBudget
    totalSettingCost += t.totalSettingCost
    totalSpend       += t.totalSpend
  }
  return { totalBudget, totalSettingCost, totalSpend, spendRate: calcSpendRate(totalSpend, totalSettingCost) }
}

export function getCampaignProgress(startDate: string, endDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(startDate); start.setHours(0, 0, 0, 0)
  const end   = new Date(endDate);   end.setHours(0, 0, 0, 0)
  if (today <= start) return 0
  if (today >= end)   return 100
  const totalDays   = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  const elapsedDays = (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  return Math.round((elapsedDays / totalDays) * 1000) / 10
}
export function getDday(endDate: string) {
  const end = new Date(endDate)
  const now = new Date()
  now.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0)
  const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 0) return { days, label: `D+${Math.abs(days)}`, urgent: false, expired: true }
  if (days === 0) return { days, label: 'D-0',   urgent: true,  expired: false }
  return          { days, label: `D-${days}`,    urgent: days <= 7, expired: false }
}
