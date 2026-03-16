import { Collection, Db, MongoClient, Filter } from 'mongodb';
import { PerformanceRecord } from '@/types';

export class RepositoryService {
  private dbName = 'gfa_master_pro';
  private collectionName = 'performance_data';

  constructor(private client: MongoClient) {}

  private get collection(): Collection<PerformanceRecord> {
    return this.client.db(this.dbName).collection(this.collectionName);
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
}
