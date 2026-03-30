export interface Workspace {
  workspace_id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  owner_id: string;
  created_at: Date;
  updated_at: Date;
  settings: WorkspaceSettings;
}

export interface WorkspaceSettings {
  default_currency: 'KRW' | 'USD';
  timezone: string;
  logo_url?: string;
  report_watermark?: string;
  allowed_domains?: string[];
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  invited_at: Date;
  joined_at?: Date;
}

export interface User {
  user_id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: Date;
  last_login_at?: Date;
}

export interface SharedReport {
  share_id: string;
  workspace_id: string;
  campaign_id: string;
  created_by: string;
  expires_at?: Date;
  password_hash?: string;
  view_count: number;
  last_viewed_at?: Date;
  config: SharedReportConfig;
  created_at: Date;
  is_download_only?: boolean;
  html_snapshot?: string;
  report_period?: { start: string; end: string };
  included_sections?: string[];
  report_title?: string;
}

export interface SharedReportConfig {
  sections: string[];
  date_range?: { start: string; end: string };
  show_budget: boolean;
  branding: boolean;
}

export interface AiInsight {
  insight_id: string;
  workspace_id: string;
  campaign_id: string;
  generated_at: Date;
  model: string;
  summary: string;
  recommendations: AiRecommendation[];
  anomalies: AiAnomaly[];
  token_usage: number;
  is_stale?: boolean;
}

export interface AiRecommendation {
  type: 'budget' | 'creative' | 'targeting' | 'pacing';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action?: string;
}

export interface AiAnomaly {
  metric: string;
  direction: 'spike' | 'drop';
  date: string;
  value: number;
  baseline: number;
  description: string;
}

export interface AlertRule {
  rule_id: string;
  workspace_id: string;
  campaign_id: string;
  type: 'budget_threshold' | 'cpc_spike' | 'ctr_drop' | 'daily_spend';
  threshold: number;
  notify_channels: ('email' | 'slack' | 'webhook')[];
  is_active: boolean;
  created_by: string;
  created_at: Date;
}

export interface AlertEvent {
  event_id: string;
  rule_id: string;
  workspace_id: string;
  campaign_id: string;
  triggered_at: Date;
  metric_value: number;
  threshold: number;
  message: string;
  is_resolved: boolean;
  resolved_at?: Date;
}
