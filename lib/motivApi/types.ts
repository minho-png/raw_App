// Motiv CrossTarget Operating Desk API types
// Source: https://desk-ct.motiv-i.com/docs/api

export type MotivCampaignType = 'DISPLAY' | 'VIDEO' | 'TV' | 'PARTNERS';
export type MotivStatus = 'Y' | 'N';
export type MotivDeliveryType = 'NON_RTB' | 'AFFILIATE' | 'RTB';

export interface MotivCampaignStats {
  bid: number;
  win: number;
  click: number;
  noclick: number;
  winprice: number;
  pubprice: number;
  payprice: number;
  cost: number;
  revenue: number;
  agency_fee: number;
  data_fee: number;
  profit: number;
  profit_rate: number;
  v_impression: number;
  v_play: number;
  v_play25: number;
  v_play50: number;
  v_play75: number;
  v_play100: number;
  v_view: number;
  conv: number;
  open: number;
  install: number;
  purchase: number;
  purchaseprice: number;
  ctr: number;
  winrate: number;
  ecpm: number;
  ecpc: number;
  cpc: number;
  cvr: number;
  convcvr: number;
  opencvr: number;
  installcvr: number;
  purchasecvr: number;
  purchasepricecvr: number;
}

export interface MotivCampaign {
  id: number;
  adaccount_id: number;
  title: string | null;
  campaign_product_id: string | null;
  campaign_type: string;
  goal: string;
  status: string;
  delivery_type: MotivDeliveryType;
  start_date: string | null;
  end_date: string | null;
  is_free: boolean;
  total_budget: number | null;
  total_spent: number | null;
  daily_budget: number | null;
  daily_spent: number | null;
  created_at: string | null;
  stats: MotivCampaignStats;
}

export interface PaginationMeta {
  current_page: number;
  from: number | null;
  last_page: number;
  per_page: number;
  to: number | null;
  total: number;
  path: string;
}

export interface MotivCampaignListResponse {
  data: MotivCampaign[];
  links: { first: string | null; last: string | null; prev: string | null; next: string | null };
  meta: PaginationMeta;
  totals: MotivCampaignStats;
  exchange_rate: number;
}

export interface MotivCampaignQuery {
  q?: string;
  status?: MotivStatus;
  adaccount_id?: number;
  campaign_type?: MotivCampaignType;
  per_page?: number;
  page?: number;
  sort?: string;
  start_date?: string;
  end_date?: string;
  exchange_rate?: number;
}
