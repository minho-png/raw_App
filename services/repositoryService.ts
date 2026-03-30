import { Collection, MongoClient, ClientSession, ObjectId } from 'mongodb';
import { PerformanceRecord, MonthlySettlementResult, DmpSettlementSnapshot, DmpRule, AdAccount, Agency, ImcCampaign } from '@/types';
import { genId } from '@/lib/idGenerator';

export const SYSTEM_WORKSPACE_ID = 'system';

export class RepositoryService {
  private dbName = 'kim_dashboard';

  constructor(private client: MongoClient) {}

  public async ensureIndexes(): Promise<void> {
    const db = this.client.db(this.dbName);
    await Promise.all([
      db.collection('raw_metrics').createIndex({ campaign_id: 1, date: 1, media: 1 }, { background: true }),
      db.collection('raw_metrics').createIndex({ campaign_id: 1, is_raw: 1 }, { background: true }),
      db.collection('processed_reports').createIndex({ campaign_id: 1, date: 1, media: 1 }, { background: true }),
      db.collection('processed_reports').createIndex({ campaign_id: 1 }, { background: true }),
      db.collection('campaign_configs').createIndex({ campaign_id: 1 }, { unique: true, background: true }),
      db.collection('campaign_configs').createIndex({ workspace_id: 1 }, { background: true }),
      db.collection('processed_reports').createIndex({ workspace_id: 1, date: 1 }, { background: true }),
      db.collection('dmp_settlements').createIndex({ workspace_id: 1, year: 1, month: 1 }, { background: true }),
      db.collection('dmp_rules').createIndex({ workspace_id: 1, is_active: 1, priority: 1 }, { background: true }),
      db.collection('dmp_rules').createIndex({ workspace_id: 1, account_id: 1, is_active: 1 }, { background: true }),
      db.collection('ad_accounts').createIndex({ workspace_id: 1, agency_id: 1 }, { background: true }),
      db.collection('ad_accounts').createIndex({ account_id: 1 }, { unique: true, background: true }),
      db.collection('agencies').createIndex({ workspace_id: 1 }, { background: true }),
      db.collection('agencies').createIndex({ agency_id: 1 }, { unique: true, background: true }),
      db.collection('imc_campaigns').createIndex({ workspace_id: 1 }, { background: true }),
      db.collection('imc_campaigns').createIndex({ imc_campaign_id: 1 }, { unique: true, background: true }),
    ]);
  }

  private get rawCollection(): Collection<PerformanceRecord> {
    return this.client.db(this.dbName).collection('raw_metrics');
  }

  private get reportCollection(): Collection<PerformanceRecord> {
    return this.client.db(this.dbName).collection('processed_reports');
  }

  private get settlementCollection(): Collection<PerformanceRecord> {
    return this.client.db(this.dbName).collection('dmp_settlements');
  }

  private get campaignCollection(): Collection<any> {
    return this.client.db(this.dbName).collection('campaign_configs');
  }

  public async upsertCampaignData(data: PerformanceRecord[]): Promise<{ deletedCount: number; insertedCount: number }> {
    if (data.length === 0) return { deletedCount: 0, insertedCount: 0 };

    const campaignId = data[0].campaign_id;
    const affectedMedias = Array.from(new Set(data.map(d => d.media).filter(Boolean)));

    const toUtcMidnight = (d: Date | string): Date => {
      const dt = new Date(d);
      return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    };

    const affectedDates = Array.from(
      new Set(data.map(d => toUtcMidnight(d.date).toISOString()).filter(Boolean))
    ).map(d => new Date(d));

    const deleteFilter = {
      campaign_id: campaignId,
      media: { $in: affectedMedias },
      date: { $in: affectedDates }
    } as any;

    const rawRecords = data.filter(d => d.is_raw !== false);
    const reportRecords = data.filter(d => d.is_raw === false);

    const executeOps = async (session?: ClientSession): Promise<{ deletedCount: number; insertedCount: number }> => {
      const opts = session ? { session } : {};
      const rawDeleteResult = await this.rawCollection.deleteMany(deleteFilter, opts);
      await this.reportCollection.deleteMany(deleteFilter, opts);

      let insertedCount = 0;
      if (rawRecords.length > 0) {
        const rawInsert = await this.rawCollection.insertMany(rawRecords, opts);
        insertedCount += rawInsert.insertedCount;
      }
      if (reportRecords.length > 0) {
        const reportInsert = await this.reportCollection.insertMany(reportRecords, opts);
        insertedCount += reportInsert.insertedCount;
      }
      return { deletedCount: rawDeleteResult.deletedCount || 0, insertedCount };
    };

    try {
      const session = this.client.startSession();
      try {
        let result: { deletedCount: number; insertedCount: number } = { deletedCount: 0, insertedCount: 0 };
        await session.withTransaction(async () => { result = await executeOps(session); });
        return result;
      } finally {
        await session.endSession();
      }
    } catch (e: any) {
      if (e.code === 20 || e.codeName === 'IllegalOperation' || e.message?.includes('transaction')) {
        console.warn('[upsertCampaignData] 트랜잭션 미지원 환경 — fallback');
        return await executeOps();
      }
      throw e;
    }
  }

  public async getCampaignSummary(campaignId: string) {
    const pipeline = [
      { $match: { campaign_id: campaignId } },
      {
        $group: {
          _id: '$campaign_id',
          total_spent: { $sum: '$execution_amount' },
          total_net: { $sum: '$net_amount' },
          total_impressions: { $sum: '$impressions' },
          total_clicks: { $sum: '$clicks' },
        }
      }
    ];
    return await this.reportCollection.aggregate(pipeline).toArray();
  }

  public async getMonthlySettlementData(year: number, month: number, campaignId: string) {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1) - 1);

    const pipeline = [
      { $match: { campaign_id: campaignId, date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $ifNull: ['$dmp', '$dmp_type'] },
          total_execution: { $sum: '$execution_amount' },
          total_net: { $sum: '$net_amount' },
          row_count: { $count: {} }
        }
      },
      {
        $project: {
          dmp_type: '$_id',
          total_execution: 1,
          total_net: 1,
          fee_amount: { $subtract: ['$total_execution', '$total_net'] },
          row_count: 1,
          _id: 0
        }
      },
      { $sort: { total_execution: -1 } }
    ];
    return await this.reportCollection.aggregate(pipeline).toArray();
  }

  public async getAllCampaignsMonthlySettlementData(year: number, month: number) {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const pipeline = [
      { $match: { date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { campaign_id: '$campaign_id', dmp: { $ifNull: ['$dmp', '$dmp_type'] } },
          total_execution: { $sum: '$execution_amount' },
          total_net: { $sum: '$net_amount' },
          total_impressions: { $sum: '$impressions' },
          total_clicks: { $sum: '$clicks' },
          row_count: { $count: {} }
        }
      },
      {
        $lookup: {
          from: 'campaign_configs',
          localField: '_id.campaign_id',
          foreignField: 'campaign_id',
          as: 'campaign_info'
        }
      },
      {
        $project: {
          campaign_id: '$_id.campaign_id',
          campaign_name: { $ifNull: [{ $arrayElemAt: ['$campaign_info.campaign_name', 0] }, '$_id.campaign_id'] },
          dmp_type: '$_id.dmp',
          total_execution: 1,
          total_net: 1,
          fee_amount: { $subtract: ['$total_execution', '$total_net'] },
          total_impressions: 1,
          total_clicks: 1,
          row_count: 1,
          _id: 0
        }
      },
      { $sort: { campaign_name: 1, total_execution: -1 } }
    ];
    return await this.reportCollection.aggregate(pipeline).toArray();
  }

  public async getCampaigns(workspaceId: string = SYSTEM_WORKSPACE_ID) {
    const filter = {
      $or: [
        { workspace_id: workspaceId },
        { workspace_id: { $exists: false } },
      ],
    };
    return await this.campaignCollection.find(filter).toArray();
  }

  public async upsertCampaignConfig(campaign: any) {
    const now = new Date();
    const { _id, created_at, ...updateData } = campaign;
    return await this.campaignCollection.updateOne(
      { campaign_id: campaign.campaign_id },
      {
        $set: { ...updateData, updated_at: now },
        $setOnInsert: { created_at: now }
      },
      { upsert: true }
    );
  }

  public async deleteCampaign(campaignId: string) {
    const executeOps = async (session?: ClientSession) => {
      const opts = session ? { session } : {};
      await this.campaignCollection.deleteOne({ campaign_id: campaignId }, opts);
      await this.rawCollection.deleteMany({ campaign_id: campaignId }, opts);
      await this.reportCollection.deleteMany({ campaign_id: campaignId }, opts);
      return await this.settlementCollection.deleteMany({ campaign_id: campaignId }, opts);
    };

    try {
      const session = this.client.startSession();
      try {
        let result: any;
        await session.withTransaction(async () => { result = await executeOps(session); });
        return result;
      } finally {
        await session.endSession();
      }
    } catch (e: any) {
      if (e.code === 20 || e.codeName === 'IllegalOperation' || e.message?.includes('transaction')) {
        console.warn('[deleteCampaign] 트랜잭션 미지원 환경 — fallback');
        return await executeOps();
      }
      throw e;
    }
  }

  public async getPerformanceData(campaignId: string) {
    return await this.reportCollection.find({ campaign_id: campaignId }).sort({ date: -1 }).toArray();
  }

  public async updatePerformanceData(id: string, updates: Partial<PerformanceRecord>) {
    return await this.reportCollection.updateOne(
      { _id: new ObjectId(id) } as any,
      { $set: { ...updates, is_edited: true } }
    );
  }

  public async saveMonthlySettlement(
    workspaceId: string,
    data: MonthlySettlementResult
  ): Promise<{ upsertedId: unknown; matchedCount: number; modifiedCount: number }> {
    const now = new Date();
    const campaignId = data.campaign_id ?? '__ALL__';

    const snapshot: Omit<DmpSettlementSnapshot, 'created_at'> = {
      workspace_id: workspaceId,
      year: data.year,
      month: data.month,
      campaign_id: campaignId,
      rows: data.rows,
      total_execution: data.total_execution,
      total_net: data.total_net,
      total_fee: data.total_fee,
      verification_status: data.verification_status,
      diff_percentage: data.diff_percentage,
      snapshotted_at: now,
      updated_at: now,
    };

    const result = await this.settlementCollection.updateOne(
      { workspace_id: workspaceId, year: data.year, month: data.month, campaign_id: campaignId },
      { $set: snapshot, $setOnInsert: { created_at: now } },
      { upsert: true }
    );

    return { upsertedId: result.upsertedId, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
  }

  private get dmpRulesCollection(): Collection<DmpRule> {
    return this.client.db(this.dbName).collection('dmp_rules');
  }

  public async getDmpRules(workspaceId: string, accountId?: string): Promise<DmpRule[]> {
    const filter: any = { workspace_id: workspaceId, is_active: true };
    const rules = await this.dmpRulesCollection.find(filter).sort({ priority: 1 }).toArray();

    if (rules.length === 0) {
      await this.seedDefaultDmpRules(workspaceId);
      return await this.dmpRulesCollection.find(filter).sort({ priority: 1 }).toArray();
    }

    if (accountId) {
      const accountRules = await this.dmpRulesCollection
        .find({ workspace_id: workspaceId, account_id: accountId, is_active: true })
        .sort({ priority: 1 })
        .toArray();
      const globalRules = rules.filter(r => !r.account_id);
      return [...globalRules, ...accountRules].sort((a, b) => a.priority - b.priority);
    }

    return rules.filter(r => !r.account_id);
  }

  public async seedDefaultDmpRules(workspaceId: string): Promise<void> {
    const now = new Date();
    const defaults: Array<Pick<DmpRule, 'keyword' | 'match_type' | 'map_to' | 'priority'>> = [
      { priority: 0, keyword: 'WIFI',     match_type: 'contains', map_to: 'WIFI'  },
      { priority: 1, keyword: '실내위치', match_type: 'contains', map_to: 'WIFI'  },
      { priority: 2, keyword: 'SKP',      match_type: 'contains', map_to: 'SKP'   },
      { priority: 3, keyword: 'KB',       match_type: 'contains', map_to: 'KB'    },
      { priority: 4, keyword: 'LOTTE',    match_type: 'contains', map_to: 'LOTTE' },
      { priority: 5, keyword: 'TG360',    match_type: 'contains', map_to: 'TG360' },
      { priority: 6, keyword: 'BC',       match_type: 'contains', map_to: 'BC'    },
      { priority: 7, keyword: 'SH',       match_type: 'contains', map_to: 'SH'    },
    ];

    const ops = defaults.map(d => ({
      updateOne: {
        filter: { workspace_id: workspaceId, keyword: d.keyword, match_type: d.match_type, map_to: d.map_to },
        update: {
          $set: { ...d, workspace_id: workspaceId, match_field: 'ad_group_name' as const, is_active: true, updated_at: now },
          $setOnInsert: { rule_id: genId(16), created_at: now },
        },
        upsert: true,
      },
    }));

    await this.dmpRulesCollection.bulkWrite(ops);
  }

  public async upsertDmpRule(rule: Partial<DmpRule> & { workspace_id: string }): Promise<void> {
    const now = new Date();
    const ruleId = rule.rule_id ?? genId(16);
    await this.dmpRulesCollection.updateOne(
      { rule_id: ruleId },
      {
        $set: { ...rule, rule_id: ruleId, updated_at: now },
        $setOnInsert: { created_at: now },
      },
      { upsert: true }
    );
  }

  public async deleteDmpRule(ruleId: string): Promise<void> {
    await this.dmpRulesCollection.updateOne(
      { rule_id: ruleId },
      { $set: { is_active: false, updated_at: new Date() } }
    );
  }

  private get agenciesCollection(): Collection<Agency> {
    return this.client.db(this.dbName).collection('agencies');
  }

  private get adAccountsCollection(): Collection<AdAccount> {
    return this.client.db(this.dbName).collection('ad_accounts');
  }

  public async getAgencies(workspaceId: string): Promise<Agency[]> {
    return await this.agenciesCollection
      .find({ workspace_id: workspaceId, is_active: true })
      .sort({ name: 1 })
      .toArray();
  }

  public async upsertAgency(agency: Partial<Agency> & { workspace_id: string; name: string }): Promise<string> {
    const now = new Date();
    const agencyId = agency.agency_id ?? genId(16);
    const { is_active, ...rest } = agency as Agency;
    await this.agenciesCollection.updateOne(
      { agency_id: agencyId },
      {
        $set: { ...rest, agency_id: agencyId, updated_at: now },
        $setOnInsert: { is_active: is_active ?? true, created_at: now },
      },
      { upsert: true }
    );
    return agencyId;
  }

  public async getAdAccounts(workspaceId: string, agencyId?: string): Promise<AdAccount[]> {
    const filter: any = { workspace_id: workspaceId, is_active: true };
    if (agencyId) filter.agency_id = agencyId;
    return await this.adAccountsCollection.find(filter).sort({ name: 1 }).toArray();
  }

  public async upsertAdAccount(account: Partial<AdAccount> & { workspace_id: string; name: string; agency_id: string }): Promise<string> {
    const now = new Date();
    const accountId = account.account_id ?? genId(16);
    const { is_active, ...rest } = account as AdAccount;
    await this.adAccountsCollection.updateOne(
      { account_id: accountId },
      {
        $set: { ...rest, account_id: accountId, updated_at: now },
        $setOnInsert: { is_active: is_active ?? true, created_at: now },
      },
      { upsert: true }
    );
    return accountId;
  }

  private get imcCollection(): Collection<any> {
    return this.client.db(this.dbName).collection('imc_campaigns');
  }

  public async getImcCampaigns(workspaceId: string, accountId?: string): Promise<ImcCampaign[]> {
    const filter: Record<string, any> = { workspace_id: workspaceId };
    if (accountId) filter.account_id = accountId;
    return (await this.imcCollection.find(filter).sort({ created_at: -1 }).toArray()) as unknown as ImcCampaign[];
  }

  public async createImcCampaign(data: Omit<ImcCampaign, 'created_at' | 'updated_at'>): Promise<ImcCampaign> {
    const now = new Date();
    const doc = { ...data, created_at: now, updated_at: now };
    await this.imcCollection.insertOne(doc);
    return doc as ImcCampaign;
  }

  public async updateImcCampaign(
    imcId: string,
    patch: Partial<Pick<ImcCampaign, 'name' | 'description' | 'total_budget' | 'account_id' | 'agency_id'>>
  ): Promise<void> {
    await this.imcCollection.updateOne(
      { imc_campaign_id: imcId },
      { $set: { ...patch, updated_at: new Date() } }
    );
  }

  public async deleteImcCampaign(imcId: string): Promise<void> {
    await this.imcCollection.deleteOne({ imc_campaign_id: imcId });
    await this.campaignCollection.updateMany(
      { imc_campaign_id: imcId },
      { $unset: { imc_campaign_id: '' }, $set: { updated_at: new Date() } }
    );
  }

  public async assignImcCampaign(campaignId: string, imcCampaignId: string | null): Promise<void> {
    if (imcCampaignId) {
      await this.campaignCollection.updateOne(
        { campaign_id: campaignId },
        { $set: { imc_campaign_id: imcCampaignId, updated_at: new Date() } }
      );
    } else {
      await this.campaignCollection.updateOne(
        { campaign_id: campaignId },
        { $unset: { imc_campaign_id: '' }, $set: { updated_at: new Date() } }
      );
    }
  }
}
