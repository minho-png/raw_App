/**
 * 워크스페이스(테넌트) 타입 정의
 * Sprint 0 - 시니어 풀스택 작성
 */

export interface Workspace {
  workspace_id: string;       // UUID
  name: string;               // 대행사/팀 이름
  slug: string;               // URL용 식별자 (e.g. "gfa-team")
  plan: 'free' | 'pro' | 'enterprise';
  owner_id: string;           // User ID
  created_at: Date;
  updated_at: Date;
  settings: WorkspaceSettings;
}

export interface WorkspaceSettings {
  default_currency: 'KRW' | 'USD';
  timezone: string;           // e.g. "Asia/Seoul"
  logo_url?: string;
  report_watermark?: string;
  allowed_domains?: string[]; // 초대 가능한 이메일 도메인
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

/**
 * 공유 보고서 링크
 */
export interface SharedReport {
  share_id: string;           // URL 토큰 (nanoid)
  workspace_id: string;
  campaign_id: string;
  created_by: string;         // user_id
  expires_at?: Date;
  password_hash?: string;     // 선택적 비밀번호 보호
  view_count: number;
  last_viewed_at?: Date;
  config: SharedReportConfig;
  created_at: Date;
}

export interface SharedReportConfig {
  sections: string[];         // 표시할 섹션 목록
  date_range?: { start: string; end: string };
  show_budget: boolean;       // 예산 정보 노출 여부
  branding: boolean;          // 워크스페이스 로고 포함 여부
}

/**
 * AI 인사이트 결과
 */
export interface AiInsight {
  insight_id: string;
  workspace_id: string;
  campaign_id: string;
  generated_at: Date;
  model: string;              // e.g. "claude-sonnet-4-6"
  summary: string;            // 1-2줄 요약
  recommendations: AiRecommendation[];
  anomalies: AiAnomaly[];
  token_usage: number;
  is_stale?: boolean;         // true when underlying data has been updated since insight generation
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

/**
 * 알림 타입
 */
export interface AlertRule {
  rule_id: string;
  workspace_id: string;
  campaign_id: string;
  type: 'budget_threshold' | 'cpc_spike' | 'ctr_drop' | 'daily_spend';
  threshold: number;          // 퍼센트 또는 절대값
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
