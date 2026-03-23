/**
 * 워크스페이스/인증 관련 Repository
 * Sprint 1 - BE 개발자 작성
 * Auth 비활성화 모드: workspace_id 없이 단일 시스템 워크스페이스로 동작
 */
import { Collection, MongoClient } from 'mongodb';
import { Workspace, WorkspaceMember, User, SharedReport, AlertRule, AlertEvent, AiInsight } from '@/types';
import { genId } from '@/lib/idGenerator';

export const SYSTEM_WORKSPACE_ID = 'system';

export class WorkspaceRepository {
  private dbName = 'gfa_master_pro';

  constructor(private client: MongoClient) {}

  private get workspacesCol(): Collection<Workspace> {
    return this.client.db(this.dbName).collection('workspaces');
  }
  private get membersCol(): Collection<WorkspaceMember> {
    return this.client.db(this.dbName).collection('workspace_members');
  }
  private get usersCol(): Collection<User> {
    return this.client.db(this.dbName).collection('users');
  }
  private get sharedReportsCol(): Collection<SharedReport> {
    return this.client.db(this.dbName).collection('shared_reports');
  }
  private get alertRulesCol(): Collection<AlertRule> {
    return this.client.db(this.dbName).collection('alert_rules');
  }
  private get alertEventsCol(): Collection<AlertEvent> {
    return this.client.db(this.dbName).collection('alert_events');
  }
  private get aiInsightsCol(): Collection<AiInsight> {
    return this.client.db(this.dbName).collection('ai_insights');
  }

  async ensureIndexes(): Promise<void> {
    await this.sharedReportsCol.createIndex({ share_id: 1 }, { unique: true });
    await this.sharedReportsCol.createIndex({ workspace_id: 1, campaign_id: 1 });
    await this.sharedReportsCol.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    await this.alertRulesCol.createIndex({ workspace_id: 1, campaign_id: 1 });
    await this.alertEventsCol.createIndex({ workspace_id: 1, triggered_at: -1 });
    await this.aiInsightsCol.createIndex({ workspace_id: 1, campaign_id: 1, generated_at: -1 });
  }

  async getMemberRole(workspaceId: string, userId: string): Promise<WorkspaceMember['role']> {
    // Auth 비활성화 모드: 항상 admin 권한 반환
    return 'admin';
  }

  async createSharedReport(data: Omit<SharedReport, 'share_id' | 'view_count' | 'created_at'>): Promise<SharedReport> {
    const report: SharedReport = {
      ...data,
      share_id: genId(12),
      view_count: 0,
      created_at: new Date(),
    };
    await this.sharedReportsCol.insertOne(report as any);
    return report;
  }

  async getSharedReport(shareId: string): Promise<SharedReport | null> {
    const report = await this.sharedReportsCol.findOne({ share_id: shareId }) as any;
    if (!report) return null;
    if (report.expires_at && new Date(report.expires_at) < new Date()) return null;
    return report;
  }

  async incrementSharedReportViewCount(shareId: string): Promise<void> {
    await this.sharedReportsCol.updateOne(
      { share_id: shareId },
      { $inc: { view_count: 1 }, $set: { last_viewed_at: new Date() } }
    );
  }

  async getSharedReportsByCampaign(workspaceId: string, campaignId: string): Promise<SharedReport[]> {
    return this.sharedReportsCol.find({ workspace_id: workspaceId, campaign_id: campaignId }).toArray() as any;
  }

  async deleteSharedReport(shareId: string): Promise<void> {
    await this.sharedReportsCol.deleteOne({ share_id: shareId });
  }

  async upsertAlertRule(rule: AlertRule): Promise<void> {
    const { rule_id, ...rest } = rule;
    await this.alertRulesCol.updateOne(
      { rule_id },
      { $set: rest, $setOnInsert: { rule_id, created_at: new Date() } },
      { upsert: true }
    );
  }

  async getAlertRules(workspaceId: string, campaignId: string): Promise<AlertRule[]> {
    return this.alertRulesCol.find({ workspace_id: workspaceId, campaign_id: campaignId, is_active: true }).toArray() as any;
  }

  async createAlertEvent(event: AlertEvent): Promise<void> {
    await this.alertEventsCol.insertOne(event as any);
  }

  async getRecentAlerts(workspaceId: string, limit = 20): Promise<AlertEvent[]> {
    return this.alertEventsCol
      .find({ workspace_id: workspaceId })
      .sort({ triggered_at: -1 })
      .limit(limit)
      .toArray() as any;
  }

  async saveAiInsight(insight: AiInsight): Promise<void> {
    await this.aiInsightsCol.insertOne(insight as any);
  }

  async getLatestAiInsight(workspaceId: string, campaignId: string): Promise<AiInsight | null> {
    return this.aiInsightsCol
      .findOne(
        { workspace_id: workspaceId, campaign_id: campaignId },
        { sort: { generated_at: -1 } }
      ) as any;
  }
}
