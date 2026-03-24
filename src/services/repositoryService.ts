import { Collection, Db, MongoClient, ClientSession, Filter, ObjectId } from 'mongodb';
import { PerformanceRecord, MonthlySettlementResult, DmpSettlementSnapshot } from '@/types';
import { SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';

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
      // v2.0 멀티테넌시: workspace_id 격리 쿼리용 인덱스
      db.collection('campaign_configs').createIndex({ workspace_id: 1 }, { background: true }),
      db.collection('processed_reports').createIndex({ workspace_id: 1, date: 1 }, { background: true }),
      // B-06: dmp_settlements 월별 정산 조회 및 upsert 키 — workspace_id + year + month
      db.collection('dmp_settlements').createIndex({ workspace_id: 1, year: 1, month: 1 }, { background: true }),
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

    /**
     * 트랜잭션 래핑: deleteMany x2 → insertMany x2 를 원자적으로 실행.
     * standalone MongoDB (replica set 없음)에서는 트랜잭션 미지원 → fallback 처리.
     */
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

      return {
        deletedCount: rawDeleteResult.deletedCount || 0,
        insertedCount,
      };
    };

    try {
      const session = this.client.startSession();
      try {
        let result: { deletedCount: number; insertedCount: number } = { deletedCount: 0, insertedCount: 0 };
        await session.withTransaction(async () => {
          result = await executeOps(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    } catch (e: any) {
      // MongoDB error code 20: Transaction not supported (standalone, no replica set)
      // MongoDB error code 263: OperationNotSupportedInTransaction variant
      if (e.code === 20 || e.codeName === 'IllegalOperation' || e.message?.includes('transaction')) {
        console.warn('[upsertCampaignData] 트랜잭션 미지원 환경 — fallback to non-transactional');
        return await executeOps();
      }
      throw e;
    }
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
    // UTC 자정 기준으로 생성 — 로컬타임 new Date(year, month-1, 1)은 KST(UTC+9)에서
    // 전달 오후 15:00Z로 해석되어 월초 데이터가 누락되는 버그 방지
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 1) - 1); // 월말 23:59:59.999 UTC

    const pipeline = [
      {
        $match: {
          campaign_id: campaignId,
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        // dmp 필드 기준 집계: config.dmp_column 오버라이드가 반영된 최종 DMP 값.
        // dmp_type(키워드 탐지 원시값) 대신 dmp를 사용해야 커스텀 DMP 컬럼 설정이 정산에 반영됨.
        // dmp 필드가 없는 레거시 도큐먼트는 $ifNull로 dmp_type 폴백 처리.
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

  /**
   * getAllCampaignsMonthlySettlementData: 전체 캠페인 월별 DMP 정산 집계
   * campaign_id + dmp(최종 확정 DMP 값) 기준으로 그룹화 후 campaign_configs에서 이름 조인.
   * dmp_type(키워드 탐지 원시값)이 아닌 dmp 필드를 사용하여 config.dmp_column 오버라이드가 반영됨.
   */
  public async getAllCampaignsMonthlySettlementData(year: number, month: number) {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const pipeline = [
      {
        $match: {
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        // dmp 필드(최종 확정 DMP 값) 기준 집계.
        // dmp_type은 ad_group_name 키워드 매칭 원시값이고,
        // dmp는 config.dmp_column 오버라이드가 반영된 최종값이다.
        // 레거시 도큐먼트(dmp 필드 미존재)는 $ifNull로 dmp_type 폴백.
        $group: {
          _id: {
            campaign_id: '$campaign_id',
            dmp: { $ifNull: ['$dmp', '$dmp_type'] }
          },
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
          // 출력 필드명은 dmp_type으로 유지 — UI/타입 변경 없이 소스만 dmp로 교체
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

  /**
   * getCampaigns: Fetches all campaign configurations for a given workspace.
   *
   * @param workspaceId  워크스페이스 격리 키. 기본값 SYSTEM_WORKSPACE_ID (단일 테넌트 모드).
   *
   * 하위호환성: 기존 레코드 중 workspace_id 필드가 없는 도큐먼트는 마이그레이션 전까지
   * SYSTEM_WORKSPACE_ID 쿼리에서 계속 노출되도록 $or 조건을 사용한다.
   * 실제 멀티테넌시 전환 시 backfill 마이그레이션 후 단순 `{ workspace_id: workspaceId }` 로 교체할 것.
   *
   * TODO(migration): workspace_id 없는 레코드를 SYSTEM_WORKSPACE_ID로 backfill하는
   *   일회성 마이그레이션 스크립트 실행 후 $or 조건 제거.
   */
  public async getCampaigns(workspaceId: string = SYSTEM_WORKSPACE_ID) {
    const filter = {
      $or: [
        { workspace_id: workspaceId },
        { workspace_id: { $exists: false } },
      ],
    };
    return await this.campaignCollection.find(filter).toArray();
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
    /**
     * 4개 컬렉션 순차 삭제를 트랜잭션으로 래핑.
     * 중간 실패 시 고아 데이터 방지. standalone 환경에서는 fallback.
     */
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
        await session.withTransaction(async () => {
          result = await executeOps(session);
        });
        return result;
      } finally {
        await session.endSession();
      }
    } catch (e: any) {
      if (e.code === 20 || e.codeName === 'IllegalOperation' || e.message?.includes('transaction')) {
        console.warn('[deleteCampaign] 트랜잭션 미지원 환경 — fallback to non-transactional');
        return await executeOps();
      }
      throw e;
    }
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

  /**
   * saveMonthlySettlement: 월별 DMP 정산 데이터를 dmp_settlements에 스냅샷으로 저장.
   *
   * Upsert 키: { workspace_id, year, month, campaign_id }
   * - 동일 키가 존재하면 전체 rows 및 집계값을 덮어씀 (재정산 시 멱등성 보장)
   * - campaign_id가 없는 전체 집계 저장 시 campaign_id = '__ALL__' 사용
   *
   * @param workspaceId  워크스페이스 격리 키 — 반드시 호출자가 검증된 값을 전달할 것
   * @param data         getMonthlySettlementData 또는 getAllCampaigns... 에서 반환된 집계 결과
   */
  public async saveMonthlySettlement(
    workspaceId: string,
    data: MonthlySettlementResult
  ): Promise<{ upsertedId: unknown; matchedCount: number; modifiedCount: number }> {
    const now = new Date();

    // campaign_id 없는 전체 집계인 경우 sentinel 값 사용
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
      // snapshotted_at은 항상 갱신 — 마지막 정산 시각 추적용
      snapshotted_at: now,
      updated_at: now,
    };

    const result = await this.settlementCollection.updateOne(
      // upsert 필터: workspace_id 격리 + 월별 스냅샷 고유 키
      { workspace_id: workspaceId, year: data.year, month: data.month, campaign_id: campaignId },
      {
        $set: snapshot,
        $setOnInsert: { created_at: now },
      },
      { upsert: true }
    );

    return {
      upsertedId: result.upsertedId,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    };
  }
}
