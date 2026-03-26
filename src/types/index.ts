export type MediaProvider = '네이버GFA' | '카카오Moment' | '구글Ads' | '메타Ads' | 'Kakao' | 'Google' | 'Meta';

export * from './workspace';

export interface SubCampaignConfig {
  id: string; // Unique ID for this sub-campaign setting
  mapping_value: string; // Explicitly what value in Excel to match (replaces ambiguous excel_name)
  excel_name?: string; // Kept for backward compatibility but deprecated
  media: MediaProvider;
  fee_rate: number;
  budget: number;
  budget_type: 'integrated' | 'individual';
  target_cpc?: number;
  target_ctr?: number;
  enabled: boolean;
  dmp_column?: string;
}

export interface CampaignConfig {
  campaign_id: string;
  campaign_name: string;
  workspace_id?: string;  // v2.0 멀티테넌시 격리 키 — 없는 레코드는 SYSTEM_WORKSPACE_ID로 취급
  account_id?: string;    // v2.0 계층 구조: FK to ad_accounts collection
  agency_id?: string;     // v2.0 계층 구조: 빠른 필터링을 위한 비정규화
  imc_campaign_id?: string; // IMC 마스터 캠페인 연결 FK
  created_at?: Date;
  updated_at?: Date;
  sub_campaigns: SubCampaignConfig[];
  insights?: string;
  target_cpc?: number;
  target_ctr?: number;
  dashboard_layout?: string[];
}

// ── DMP 규칙 엔진 ──────────────────────────────────────────────────────────
export interface DmpRule {
  rule_id: string;
  workspace_id: string;
  account_id?: string;                                   // 계정 종속 규칙 (없으면 워크스페이스 전체 적용)
  match_field: 'ad_group_name';                          // 현재는 ad_group_name만 지원
  match_type: 'contains' | 'startsWith' | 'equals';
  keyword: string;
  map_to: string;                                        // 'SKP', 'KB', 'LOTTE' 등 정규 DMP 코드
  priority: number;                                      // 낮을수록 우선순위 높음 (0 = 최우선)
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ── 3단계 계층 구조 ────────────────────────────────────────────────────────
export interface Agency {
  agency_id: string;
  workspace_id: string;
  name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AdAccount {
  account_id: string;
  workspace_id: string;
  agency_id: string;     // FK to agencies
  name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PerformanceRecord {
  _id?: string;               // MongoDB Object ID
  campaign_id: string;
  excel_campaign_name?: string; 
  mapping_value?: string; // Track which value was used for mapping
  media: string;
  date: Date;
  ad_group_name: string;
  impressions: number;
  clicks: number;
  execution_amount: number; // 공급가액 / (1 - 수수료율)
  net_amount: number;       // 실제 집행 순액
  dmp_type: string;         // 추출된 DMP 종류 (SKP, KB 등)
  dmp?: string;             // Added: separate DMP column
  has_dmp: boolean;
  cost: number;             // DB에는 "비용"으로 저장 (수수료 적용된 최종 비용)
  supply_value?: number;    // 원본 공급가액
  is_edited?: boolean;        // 사용자가 수정한 데이터인지 여부
  is_raw?: boolean;           // Added: raw data vs report data
  placement?: string;         // 게재지면(필수): 누락 시 CalculationService에서 기본값 주입
  creative_name?: string;     // 광고 소재 이름
  age?: string;               // 연령 (예: "35세~39세")
  gender?: string;            // 성별 (예: "남자", "여자")
  device?: string;            // 기기 (예: "모바일", "PC")
  os?: string;                // OS (예: "Android", "iOS") — 기기 및 OS 복합 컬럼 분리 결과
  media_group?: string;       // 매체 그룹 (예: "네이버+")
  group_id?: string;          // Link grouped reports back to source groups
  [key: string]: any; // Catch-all for other CSV columns
}

export interface BudgetStatus {
  total_budget: number;
  spent_budget: number;
  remaining_budget: number;
  spent: number;
  remaining: number;
  burn_rate: number;
  pacing_index: number;
  pacing_status: string;
  actual_cpc: number;
  actual_ctr: number;
  target_cpc?: number;
  target_ctr?: number;
}

export interface DmpSettlementRow {
  dmp_type: string;
  total_execution: number;
  total_net: number;
  fee_amount: number;
  row_count: number;
}

export interface MonthlySettlementResult {
  year: number;
  month: number;
  campaign_id: string;
  rows: DmpSettlementRow[];
  total_execution: number;
  total_net: number;
  total_fee: number;
  verification_status: 'valid' | 'warning';
  diff_percentage: number;
}

export interface AllCampaignsSettlementRow {
  campaign_id: string;
  campaign_name: string;
  dmp_type: string;
  total_execution: number;
  total_net: number;
  fee_amount: number;
  total_impressions: number;
  total_clicks: number;
  row_count: number;
}

export interface AllCampaignsSettlementResult {
  year: number;
  month: number;
  rows: AllCampaignsSettlementRow[];
  total_execution: number;
  total_net: number;
  total_fee: number;
}

// ── IMC 마스터 캠페인 ────────────────────────────────────────────────────────
export interface ImcCampaign {
  imc_campaign_id: string;
  workspace_id: string;
  name: string;
  description?: string;
  total_budget?: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * DmpSettlementSnapshot: dmp_settlements 컬렉션에 저장되는 월별 정산 스냅샷 도큐먼트.
 * upsert 키: { workspace_id, year, month, campaign_id }
 * - campaign_id가 없는 경우(전체 집계) campaign_id = '__ALL__' 사용
 */
export interface DmpSettlementSnapshot {
  workspace_id: string;
  year: number;
  month: number;
  campaign_id: string;          // 단일 캠페인 정산이면 campaign_id, 전체 집계면 '__ALL__'
  rows: DmpSettlementRow[];
  total_execution: number;
  total_net: number;
  total_fee: number;
  verification_status: 'valid' | 'warning';
  diff_percentage: number;
  snapshotted_at: Date;         // 스냅샷 생성 시각 (UTC)
  created_at?: Date;
  updated_at: Date;
}
