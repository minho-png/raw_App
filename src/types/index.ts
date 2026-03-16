export type MediaProvider = '네이버GFA' | '카카오Moment' | '구글Ads' | '메타Ads' | 'Kakao' | 'Google' | 'Meta';

export interface SubCampaignConfig {
  id: string; // Unique ID for this sub-campaign setting
  excel_name: string; // Mapping name from Excel
  media: MediaProvider;
  fee_rate: number;
  budget: number;
  target_cpc?: number;
  target_ctr?: number;
}

export interface CampaignConfig {
  campaign_id: string;
  campaign_name: string;
  sub_campaigns: SubCampaignConfig[];
}

export interface PerformanceRecord {
  _id?: string;               // MongoDB Object ID
  campaign_id: string;
  excel_campaign_name?: string; 
  media: string;
  date: Date;
  ad_group_name: string;
  impressions: number;
  clicks: number;
  execution_amount: number; // 공급가액 / (1 - 수수료율)
  net_amount: number;       // 실제 집행 순액
  dmp_type: string;         // 추출된 DMP 종류 (SKP, KB 등)
  has_dmp: boolean;
  cost: number;             // 집행 금액과 동일하거나 별도 집계용
  is_edited?: boolean;        // 사용자가 수정한 데이터인지 여부
  placement?: string;
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
