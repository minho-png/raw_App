import { Collection, Db, MongoClient, Filter, ObjectId } from 'mongodb';
import { PerformanceRecord } from '@/types';

export class RepositoryService {
  private dbName = 'gfa_master_pro';

  constructor(private client: MongoClient) {}

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
    const affectedDates = Array.from(
      new Set(
        data
          .map(d => new Date(d.date).toISOString())
          .filter(Boolean)
      )
    ).map(d => new Date(d));

    const deleteFilter = {
      campaign_id: campaignId,
      media: { $in: affectedMedias },
      date: { $in: affectedDates }
    } as any;

    const rawDeleteResult = await this.rawCollection.deleteMany(deleteFilter);
    await this.reportCollection.deleteMany(deleteFilter);

    const insertResult = await this.rawCollection.insertMany(data);

    return {
      deletedCount: rawDeleteResult.deletedCount || 0,
      insertedCount: insertResult.insertedCount
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
