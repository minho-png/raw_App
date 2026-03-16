import { Collection, Db, MongoClient, Filter, ObjectId } from 'mongodb';
import { PerformanceRecord } from '@/types';

export class RepositoryService {
  private dbName = 'gfa_master_pro';
  private collectionName = 'performance_data';

  constructor(private client: MongoClient) {}

  private get collection(): Collection<PerformanceRecord> {
    return this.client.db(this.dbName).collection(this.collectionName);
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

    // 1. Identify all unique { campaign_id, media, date } combinations in the input
    const uniqueKeys = data.reduce((acc, curr) => {
      const key = `${curr.campaign_id}|${curr.media}|${curr.date.toISOString()}`;
      if (!acc.has(key)) {
        acc.set(key, {
          campaign_id: curr.campaign_id,
          media: curr.media,
          date: curr.date
        });
      }
      return acc;
    }, new Map<string, { campaign_id: string; media: any; date: Date }>());

    // 2. Perform deletions for each unique combination found in the new data
    let totalDeleted = 0;
    
    // Using $or to delete all relevant records in one go
    // Strict Unique Key: { campaign_id, media, date }
    const deleteFilters = Array.from(uniqueKeys.values()).map(k => ({
      campaign_id: k.campaign_id,
      media: k.media,
      date: k.date
    })) as Filter<PerformanceRecord>[];

    const deleteResult = await this.collection.deleteMany({
      $or: deleteFilters
    } as any);
    
    totalDeleted = deleteResult.deletedCount || 0;

    // 3. Insert the new data
    const insertResult = await this.collection.insertMany(data);

    return {
      deletedCount: totalDeleted,
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

    return await this.collection.aggregate(pipeline).toArray();
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

    return await this.collection.aggregate(pipeline).toArray();
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
    return await this.campaignCollection.updateOne(
      { campaign_id: campaign.campaign_id },
      { $set: campaign },
      { upsert: true }
    );
  }

  /**
   * deleteCampaignConfig: Deletes a campaign configuration and its associated performance data.
   */
  public async deleteCampaign(campaignId: string) {
    await this.campaignCollection.deleteOne({ campaign_id: campaignId });
    return await this.collection.deleteMany({ campaign_id: campaignId });
  }

  /**
   * getPerformanceData: Fetches all performance records for a campaign.
   */
  public async getPerformanceData(campaignId: string) {
    return await this.collection.find({ campaign_id: campaignId }).sort({ date: -1 }).toArray();
  }

  /**
   * updatePerformanceData: Updates a single performance record.
   */
  public async updatePerformanceData(id: string, updates: Partial<PerformanceRecord>) {
    return await this.collection.updateOne(
      { _id: new ObjectId(id) } as any,
      { $set: { ...updates, is_edited: true } }
    );
  }
}
