export type MediaProvider = '네이버GFA' | 'Kakao' | 'Google' | 'Meta';

export interface CampaignConfig {
  campaign_id: string;
  campaign_name: string;
  media: MediaProvider;
  total_budget: number;
  start_date: Date;
  end_date: Date;
  base_fee_rate: number; // Percentage, e.g., 10 for 10%
  total_fee_rate: number; // Inputted total fee rate (%)
}

export interface PerformanceRecord {
  campaign_id: string;
  media: MediaProvider;
  date: Date;
  ad_group_name: string;
  impressions: number;
  clicks: number;
  execution_amount: number; // 공급가액 / (1 - 수수료율)
  net_amount: number;       // 실제 집행 순액
  dmp_type: string;         // 추출된 DMP 종류 (SKP, KB 등)
  has_dmp: boolean;
  cost: number;             // 집행 금액과 동일하거나 별도 집계용
  placement?: string;
  [key: string]: any; // Catch-all for other CSV columns
}

export interface BudgetStatus {
  spent: number;
  remaining: number;
  burn_rate: number;
  pacing_index: number;
  pacing_status: string;
}
