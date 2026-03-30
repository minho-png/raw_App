export type MediaProvider = '네이버GFA' | '카카오Moment' | '구글Ads' | '메타Ads' | 'Kakao' | 'Google' | 'Meta';

export * from './workspace';

export interface SubCampaignConfig {
  id: string;
  mapping_value: string;
  excel_name?: string; // deprecated, kept for backward compatibility
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
  workspace_id?: string;
  account_id?: string;
  agency_id?: string;
  imc_campaign_id?: string;
  created_at?: Date;
  updated_at?: Date;
  sub_campaigns: SubCampaignConfig[];
  insights?: string;
  target_cpc?: number;
  target_ctr?: number;
  dashboard_layout?: string[];
}

export interface DmpRule {
  rule_id: string;
  workspace_id: string;
  account_id?: string;
  match_field: 'ad_group_name';
  match_type: 'contains' | 'startsWith' | 'equals';
  keyword: string;
  map_to: string;
  priority: number;
  is_active: boolean;
  fee_rate?: number;
  created_at: Date;
  updated_at: Date;
}

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
  agency_id: string;
  name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PerformanceRecord {
  _id?: string;
  campaign_id: string;
  excel_campaign_name?: string;
  mapping_value?: string;
  media: string;
  date: Date;
  ad_group_name: string;
  impressions: number;
  clicks: number;
  execution_amount: number;
  net_amount: number;
  dmp_type: string;
  dmp?: string;
  has_dmp: boolean;
  cost: number;
  supply_value?: number;
  is_edited?: boolean;
  is_raw?: boolean;
  placement?: string;
  creative_name?: string;
  age?: string;
  gender?: string;
  device?: string;
  os?: string;
  media_group?: string;
  group_id?: string;
  [key: string]: unknown;
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

export interface TargetKpis {
  target_cpc?: number;
  target_ctr?: number;
  target_roas?: number;
  target_conversions?: number;
}

export interface ImcCampaign {
  imc_campaign_id: string;
  workspace_id: string;
  account_id?: string;
  agency_id?: string;
  name: string;
  description?: string;
  total_budget?: number;
  start_date?: string;
  end_date?: string;
  target_kpis?: TargetKpis;
  created_at: Date;
  updated_at: Date;
}

export interface DmpSettlementSnapshot {
  workspace_id: string;
  year: number;
  month: number;
  campaign_id: string;
  rows: DmpSettlementRow[];
  total_execution: number;
  total_net: number;
  total_fee: number;
  verification_status: 'valid' | 'warning';
  diff_percentage: number;
  snapshotted_at: Date;
  created_at?: Date;
  updated_at: Date;
}
