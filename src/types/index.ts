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
  cost: number; // Raw cost from CSV
  net_amount: number; // cost / 1.1
  execution_amount: number; // net_amount / (1 - (total_fee_rate / 100))
  dmp_type: string;
  has_dmp: boolean;
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
