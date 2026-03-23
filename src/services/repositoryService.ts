import { Collection, Db, MongoClient, Filter, ObjectId } from 'mongodb';
import { PerformanceRecord } from '@/types';

export class RepositoryService {
  private dbName = 'gfa_master_pro';

  constructor(private client: MongoClient) {}

  /**
   * ensureIndexes: 쿼리 성능을 위한 인덱스 생성 (앱 시작 시 1회 호출)
   * campaign_id + date + media 복합 인덱스 — upsert 필터와 조회 쿼리에서 사용
   */
  public async ensureIndexes(): Promise<void> {
    const db = this.client.db(this.dbName);
    await Promise.all([
      db.collection('raw_metrics').createIndex({ campaign_id: 1, date: 1, media: 1 }, { background: true }),
      db.collection('raw_metrics').createIndex({ campaign_id: 1, is_raw: 1 }, { background: true }),
      db.collection('processed_reports').createIndex({ campaign_id: 1, date: 1, media: 1 }, { background: true }),
      db.collection('processed_reports').createIndex({ campaign_id: 1 }, { background: true }),
      db.collection('campaign_configs').createIndex({ campaign_id: 1 }, { unique: true, background: true }),
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

  /**
   * upsertCampaignData: 
   * Deletes existing data for the same campaign, media, and dates present in the new set,
   * then inserts the new data. This ensures 'Overwrite' behavior for existing dates
   * while allowing 'Append' behavior for new dates.
   * 
   * Unique Key: { campaign_id, media, date }
   */
  public async upsertCampaignData(data: PerformanceRecord[]): Promise<{ deletedCount: number; insertedCount: number }> {
    if (data.length === 0) return { deletedCount: 0, insertedCount: 0 };

    const campaignId = data[0].campaign_id;
    const affectedMedias = Array.from(new Set(data.map(d => d.media).filter(Boolean)));

    // UTC 자정으로 정규화하여 타임존/밀리초 차이로 인한 날짜 중복 방지
    const toUtcMidnight = (d: Date | string): Date => {
      const dt = new Date(d);
      return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    };

    const affectedDates = Array.from(
      new Set(
        data
          .map(d => toUtcMidnight(d.date).toISOString())
          .filter(Boolean)
      )
    ).map(d => new Date(d));

    const deleteFilter = {
      campaign_id: campaignId,
      media: { $in: affectedMedias },
      date: { $in: affectedDates }
    } as any;

    // is_raw 기준으로 컬렉션 분리: raw_metrics ↔ processed_reports
    const rawRecords = data.filter(d => d.is_raw !== false);
    const reportRecords = data.filter(d => d.is_raw === false);

    const rawDeleteResult = await this.rawCollection.deleteMany(deleteFilter);
    await this.reportCollection.deleteMany(deleteFilter);

    let insertedCount = 0;

    if (rawRecords.length > 0) {
      const rawInsert = await this.rawCollection.insertMany(rawRecords);
      insertedCount += rawInsert.insertedCount;
    }
    if (reportRecords.length > 0) {
      const reportInsert = await this.reportCollection.insertMany(reportRecords);
      insertedCount += reportInsert.insertedCount;
    }

    return {
      deletedCount: rawDeleteResult.deletedCount || 0,
      insertedCount
    };
  }

  /**
   * getCampaignSummary: Fetches aggregated data for a specific campaign.
   */
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

  /**
   * getMonthlySettlementData: Aggregates execution and net amounts by dmp_type for a given month.
   */
  public async getMonthlySettlementData(year: number, month: number, campaignId: string) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const pipeline = [
      {
        $match: {
          campaign_id: campaignId,
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$dmp_type',
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

  /**
   * getCampaigns: Fetches all campaign configurations.
   */
  public async getCampaigns() {
    return await this.campaignCollection.find({}).toArray();
  }

  /**
   * upsertCampaignConfig: Saves or updates a campaign configuration.
   */
  public async upsertCampaignConfig(campaign: any) {
    const now = new Date();
    // 💡 _id 필드를 제외한 나머지 데이터만 추출합니다.
    const { _id, created_at, ...updateData } = campaign; 

    return await this.campaignCollection.updateOne(
      { campaign_id: campaign.campaign_id },
      { 
        $set: { 
          ...updateData, // _id가 제거된 데이터를 사용
          updated_at: now 
        },
        $setOnInsert: { created_at: now }
      },
      { upsert: true }
    );
  }

  /**
   * deleteCampaignConfig: Deletes a campaign configuration and its associated performance data.
   */
  public async deleteCampaign(campaignId: string) {
    await this.campaignCollection.deleteOne({ campaign_id: campaignId });
    await this.rawCollection.deleteMany({ campaign_id: campaignId });
    await this.reportCollection.deleteMany({ campaign_id: campaignId });
    return await this.settlementCollection.deleteMany({ campaign_id: campaignId });
  }

  /**
   * getPerformanceData: Fetches all performance records for a campaign.
   */
  public async getPerformanceData(campaignId: string) {
    return await this.reportCollection.find({ campaign_id: campaignId }).sort({ date: -1 }).toArray();
  }

  /**
   * updatePerformanceData: Updates a single performance record.
   */
  public async updatePerformanceData(id: string, updates: Partial<PerformanceRecord>) {
    return await this.reportCollection.updateOne(
      { _id: new ObjectId(id) } as any,
      { $set: { ...updates, is_edited: true } }
    );
  }
}
