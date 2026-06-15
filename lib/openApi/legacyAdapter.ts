/**
 * Open API ↔ Motiv 스키마 호환 어댑터 (사용자 요청 2026-06-15).
 *
 * 사용자 결정: 모든 데이터 출처를 Open API 로 일원화하되, 기존 Motiv-스키마
 * 호출자(`/api/motiv/*` route · cron · zeroSpend)는 표면을 유지하고 내부 변환만
 * 어댑터를 통과시킴 — 페이지/hook 코드 변경 최소.
 *
 * 핵심 제약 (가용 정보로 "논리적 동일 결과" 도출):
 *   Open API Phase 1 은 insights (집계) 만 제공. 정산성 필드(agency_fee/data_fee/
 *   revenue/profit/profit_rate/is_free) 와 RTB 입찰 메트릭(bid/win/winprice/...) 은
 *   *존재하지 않음*. 어댑터는 0 으로 fallback 한다.
 *
 *   영향 범위:
 *     - 분석 페이지(cost/impressions/clicks/ctr/v_play*) — Open API 로 정상 표시.
 *     - 정산 페이지(agency_fee/data_fee) — 0 으로 내려가 정산금이 0 으로 보일 수
 *       있음. 정산성 지표는 Phase 2 도입 시 어댑터 확장 또는 우회 계산
 *       (custom rate × cost) 로 보완.
 *     - 영상 노출 판정 (zeroSpend) — `win + v_impression` → `impressions +
 *       videoCompletions` (정확도 OK, 의미 동일).
 *
 *   ID 변환: Open API string ↔ Motiv number — Number() 변환, 실패 시 -1.
 *   상태 변환: ACTIVE↔Y, PAUSED↔N.
 *
 * 본 어댑터는 pure 함수 — 외부 호출 없음, 호출자가 Open API 결과를 먼저 받아 전달.
 */

import type {
  InsightsRow,
  InsightsMetrics,
  InsightsCampaignDimensions,
  InsightsAdGroupDimensions,
  InsightsPaging,
  OpenApiStatus,
} from './types'
import type {
  MotivCampaign,
  MotivAdGroup,
  MotivAdAccount,
  MotivAgency,
  MotivCampaignStats,
  MotivStatus,
  MotivDeliveryType,
  PaginationMeta,
} from '../motivApi/types'

// ── 상태 매핑 ────────────────────────────────────────────────────
export function openStatusToMotiv(s: OpenApiStatus | undefined): MotivStatus {
  return s === 'ACTIVE' ? 'Y' : 'N'
}

export function motivStatusToOpen(s: MotivStatus | undefined): OpenApiStatus | undefined {
  if (s === 'Y') return 'ACTIVE'
  if (s === 'N') return 'PAUSED'
  return undefined
}

// ── ID 변환 ─────────────────────────────────────────────────────
// Motiv 는 number, Open API 는 string. NaN 시 -1 sentinel (UI 가 조건부 가드).
function toNumberId(s: string | number | undefined | null): number {
  if (s === undefined || s === null || s === '') return -1
  const n = Number(s)
  return Number.isFinite(n) ? n : -1
}

// ── Metrics 매핑 ────────────────────────────────────────────────
// Open API InsightsMetrics → Motiv stats. 누락 필드는 0.
export function metricsToMotivStats(m: InsightsMetrics | undefined): MotivCampaignStats {
  const impressions = num(m?.impressions)
  const clicks = num(m?.clicks)
  return {
    bid: 0,
    win: impressions,
    click: clicks,
    noclick: Math.max(0, impressions - clicks),
    winprice: 0,
    pubprice: 0,
    payprice: 0,
    cost: num(m?.cost),
    revenue: 0,           // Open API 미제공 — 정산성 (Phase 2)
    agency_fee: 0,        // Open API 미제공
    data_fee: 0,          // Open API 미제공
    profit: 0,            // Open API 미제공
    profit_rate: 0,       // Open API 미제공
    v_impression: impressions,
    v_play: num(m?.videoStarts),
    v_play25: num(m?.videoP25Watched),
    v_play50: num(m?.videoP50Watched),
    v_play75: num(m?.videoP75Watched),
    v_play100: num(m?.videoCompletions),
    v_view: num(m?.videoViews),
    conv: num(m?.conversions30d ?? m?.conversions),
    open: num(m?.opens30d),
    install: num(m?.installs30d),
    purchase: num(m?.purchases30d),
    purchaseprice: num(m?.conversionValue30d),
    ctr: num(m?.ctr),
    winrate: 0,
    ecpm: num(m?.cpm),
    ecpc: num(m?.cpc),
    cpc: num(m?.cpc),
    cvr: num(m?.conversionRate30d ?? m?.conversionRate),
    convcvr: 0,
    opencvr: 0,
    installcvr: 0,
    purchasecvr: 0,
    purchasepricecvr: 0,
  }
}

function num(v: number | string | undefined | null): number {
  if (v === undefined || v === null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

// ── Campaign 매핑 ───────────────────────────────────────────────
export function campaignInsightToMotivCampaign(
  row: InsightsRow<InsightsCampaignDimensions>,
): MotivCampaign {
  const d = row.dimensions
  return {
    id: toNumberId(d.campaignId),
    adaccount_id: toNumberId(d.accountId),
    title: d.campaignName ?? null,
    campaign_product_id: d.productType ?? null,
    campaign_type: d.campaignType ?? 'DISPLAY',
    goal: '',
    status: openStatusToMotiv(d.status),
    // Motiv delivery_type 은 Open API 에 없음 — VIDEO/TV 는 NON_RTB, 그 외 RTB 추정.
    delivery_type: deliveryTypeFromCampaignType(d.campaignType),
    start_date: d.startDate ?? null,
    end_date: d.endDate ?? null,
    is_free: false,   // Open API 미제공
    total_budget: d.totalBudget ?? null,
    total_spent: d.totalSpent ?? null,
    daily_budget: d.dailyBudget ?? null,
    daily_spent: d.dailySpent ?? null,
    created_at: null,
    stats: metricsToMotivStats(row.metrics),
  }
}

function deliveryTypeFromCampaignType(t?: string): MotivDeliveryType {
  // Motiv 운영 관행 (추정): VIDEO/TV/PARTNERS 는 비-실시간, DISPLAY 는 RTB.
  // 외부에서 delivery_type 으로 분기하는 코드는 현재 없음 (productMapping 은
  // campaign_type 사용) — 기본값 'NON_RTB' 로 두어도 영향 없음.
  if (t === 'DISPLAY') return 'RTB'
  return 'NON_RTB'
}

// ── AdGroup 매핑 ────────────────────────────────────────────────
export function adGroupInsightToMotivAdGroup(
  row: InsightsRow<InsightsAdGroupDimensions>,
): MotivAdGroup {
  const d = row.dimensions
  return {
    id: toNumberId(d.adGroupId),
    campaign_id: toNumberId(d.campaignId),
    adaccount_id: d.accountId !== undefined ? toNumberId(d.accountId) : undefined,
    title: d.adGroupName ?? null,
    status: openStatusToMotiv(d.status),
    start_date: null,         // Open API ADGROUP dimension 미제공
    end_date: null,
    is_free: false,
    total_budget: null,
    total_spent: null,
    daily_budget: null,
    daily_spent: null,
    created_at: null,
    // 광고그룹의 DMP targeting 식별자 — Open API 에 직접 매칭 필드 없음. costMethod
    // 가 가까울 수 있음(매체별 상이) — 안전하게 undefined.
    targeting_product_id: undefined,
    stats: metricsToMotivStats(row.metrics),
  }
}

// ── AdAccount 합성 (distinct) ───────────────────────────────────
// Open API 가 별도 명세 목록을 주지 않으므로 insights row 들에서 distinct accountId
// 추출. agency 정보는 insights 가 채워줬다면 보존.
export function distinctAdAccountsFromCampaignRows(
  rows: ReadonlyArray<InsightsRow<InsightsCampaignDimensions>>,
): MotivAdAccount[] {
  const map = new Map<number, MotivAdAccount>()
  for (const r of rows) {
    const id = toNumberId(r.dimensions.accountId)
    if (id < 0 || map.has(id)) continue
    map.set(id, {
      id,
      name: r.dimensions.accountName ?? null,
      agency_id: r.dimensions.agencyId !== undefined ? toNumberId(r.dimensions.agencyId) : undefined,
      agency_name: r.dimensions.agencyName ?? null,
      agency: r.dimensions.agencyId
        ? { id: toNumberId(r.dimensions.agencyId), name: r.dimensions.agencyName ?? null }
        : null,
      advertiser_id: undefined,
      advertiser_name: r.dimensions.accountName ?? null,
      status: 'Y',
      created_at: null,
    })
  }
  return Array.from(map.values()).sort((a, b) => a.id - b.id)
}

// ── Agency 합성 (distinct) ──────────────────────────────────────
export function distinctAgenciesFromCampaignRows(
  rows: ReadonlyArray<InsightsRow<InsightsCampaignDimensions>>,
): MotivAgency[] {
  const map = new Map<number, MotivAgency>()
  for (const r of rows) {
    const id = r.dimensions.agencyId !== undefined ? toNumberId(r.dimensions.agencyId) : -1
    if (id < 0 || map.has(id)) continue
    map.set(id, {
      id,
      name: r.dimensions.agencyName ?? `Agency ${id}`,
      status: 'Y',
      is_active: true,
      created_at: '',
    })
  }
  return Array.from(map.values()).sort((a, b) => a.id - b.id)
}

// ── Paging 매핑 ─────────────────────────────────────────────────
export function pagingToMotivMeta(p: InsightsPaging | undefined | null, perPageHint?: number): PaginationMeta {
  // 업스트림이 paging 을 생략한 변형(가이드 §7) 방어 — undefined 면 단일 페이지로 합성.
  const page = p?.page ?? 1
  const totalCount = p?.totalCount ?? 0
  const perPage = p?.limit || perPageHint || 0
  const totalPages = p?.totalPages || (perPage > 0 ? Math.max(1, Math.ceil(totalCount / perPage)) : 1)
  const from = totalCount === 0 ? null : Math.min(totalCount, (page - 1) * perPage + 1)
  const to = totalCount === 0 ? null : Math.min(totalCount, page * perPage)
  return {
    current_page: page,
    from,
    last_page: totalPages,
    per_page: perPage,
    to,
    total: totalCount,
    path: '',
  }
}

// ── stats 행(Record<string,string>) 직렬화 ─────────────────────
// Motiv stats route 의 응답은 dictionary<string,string>. Open API metrics 를
// 같은 평탄 dictionary 로 변환 (rowsToDailyPoints 가 cost/revenue/profit/
// agency_fee/data_fee key 를 읽음).
export function metricsToStatsRecord(m: InsightsMetrics | undefined): Record<string, string> {
  const s = metricsToMotivStats(m)
  const rec: Record<string, string> = {}
  for (const [k, v] of Object.entries(s)) {
    rec[k] = String(v)
  }
  return rec
}

export function dailyRowToStatsRecord(
  row: { dimensions: { date?: string | null | undefined; [k: string]: unknown }; metrics: InsightsMetrics },
): Record<string, string> {
  return {
    date: String(row.dimensions.date ?? ''),
    ...metricsToStatsRecord(row.metrics),
  }
}

export function campaignRowToStatsRecord(
  row: InsightsRow<InsightsCampaignDimensions>,
): Record<string, string> {
  return {
    campaign_id: row.dimensions.campaignId,
    campaign_title: row.dimensions.campaignName ?? '',
    campaign_type: row.dimensions.campaignType ?? '',
    adaccount_id: row.dimensions.accountId,
    ...metricsToStatsRecord(row.metrics),
  }
}
