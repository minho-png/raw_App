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
  created_at?: Date;
  updated_at?: Date;
  sub_campaigns: SubCampaignConfig[];
  insights?: string;
  target_cpc?: number;
  target_ctr?: number;
  dashboard_layout?: string[];
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
