import { Collection, Db, MongoClient, ClientSession, Filter, ObjectId } from 'mongodb';
import { PerformanceRecord, MonthlySettlementResult, DmpSettlementSnapshot, DmpRule, AdAccount, Agency, ImcCampaign } from '@/types';
import { SYSTEM_WORKSPACE_ID } from '@/services/workspaceRepository';
import { genId } from '@/lib/idGenerator';

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
      // DMP 규칙 엔진 인덱스
      db.collection('dmp_rules').createIndex({ workspace_id: 1, is_active: 1, priority: 1 }, { background: true }),
      db.collection('dmp_rules').createIndex({ workspace_id: 1, account_id: 1, is_active: 1 }, { background: true }),
      // 3단계 계층 구조 인덱스
      db.collection('ad_accounts').createIndex({ workspace_id: 1, agency_id: 1 }, { background: true }),
      db.collection('ad_accounts').createIndex({ account_id: 1 }, { unique: true, background: true }),
      db.collection('agencies').createIndex({ workspace_id: 1 }, { background: true }),
      db.collection('agencies').createIndex({ agency_id: 1 }, { unique: true, background: true }),
      // IMC 마스터 캠페인 인덱스
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

  // ── DMP 규칙 엔진 ──────────────────────────────────────────────────────────

  private get dmpRulesCollection(): Collection<DmpRule> {
    return this.client.db(this.dbName).collection('dmp_rules');
  }

  /**
   * getDmpRules: 워크스페이스의 활성 DMP 규칙을 priority ASC으로 반환.
   * 빈 경우 기본 하드코딩 규칙 8개를 시드한 후 재조회.
   */
  public async getDmpRules(workspaceId: string, accountId?: string): Promise<DmpRule[]> {
    const filter: any = { workspace_id: workspaceId, is_active: true };

    const rules = await this.dmpRulesCollection
      .find(filter)
      .sort({ priority: 1 })
      .toArray();

    if (rules.length === 0) {
      await this.seedDefaultDmpRules(workspaceId);
      return await this.dmpRulesCollection
        .find(filter)
        .sort({ priority: 1 })
        .toArray();
    }

    // accountId가 지정된 경우: 워크스페이스 전역 규칙 + 계정 전용 규칙 합산 후 priority 재정렬
    if (accountId) {
      const accountFilter = { workspace_id: workspaceId, account_id: accountId, is_active: true };
      const accountRules = await this.dmpRulesCollection
        .find(accountFilter)
        .sort({ priority: 1 })
        .toArray();
      const globalRules = rules.filter(r => !r.account_id);
      return [...globalRules, ...accountRules].sort((a, b) => a.priority - b.priority);
    }

    return rules.filter(r => !r.account_id);
  }

  /**
   * seedDefaultDmpRules: 기존 하드코딩 DMP 탐지 로직을 DB 규칙으로 초기화.
   * bulkWrite + upsert 방식으로 멱등성 보장 (중복 실행 안전).
   */
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

  /**
   * upsertDmpRule: DMP 규칙 생성 또는 업데이트.
   */
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

  /**
   * deleteDmpRule: 소프트 삭제 (is_active: false).
   */
  public async deleteDmpRule(ruleId: string): Promise<void> {
    await this.dmpRulesCollection.updateOne(
      { rule_id: ruleId },
      { $set: { is_active: false, updated_at: new Date() } }
    );
  }

  // ── 3단계 계층 구조 (Agency > Ad Account) ─────────────────────────────────

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
    await this.agenciesCollection.updateOne(
      { agency_id: agencyId },
      {
        $set: { ...agency, agency_id: agencyId, updated_at: now },
        $setOnInsert: { is_active: true, created_at: now },
      },
      { upsert: true }
    );
    return agencyId;
  }

  public async getAdAccounts(workspaceId: string, agencyId?: string): Promise<AdAccount[]> {
    const filter: any = { workspace_id: workspaceId, is_active: true };
    if (agencyId) filter.agency_id = agencyId;
    return await this.adAccountsCollection
      .find(filter)
      .sort({ name: 1 })
      .toArray();
  }

  public async upsertAdAccount(account: Partial<AdAccount> & { workspace_id: string; name: string; agency_id: string }): Promise<string> {
    const now = new Date();
    const accountId = account.account_id ?? genId(16);
    await this.adAccountsCollection.updateOne(
      { account_id: accountId },
      {
        $set: { ...account, account_id: accountId, updated_at: now },
        $setOnInsert: { is_active: true, created_at: now },
      },
      { upsert: true }
    );
    return accountId;
  }

  // ── IMC 마스터 캠페인 CRUD ──────────────────────────────────────────────────

  private get imcCollection(): Collection<any> {
    return this.client.db(this.dbName).collection('imc_campaigns');
  }

  public async getImcCampaigns(workspaceId: string): Promise<ImcCampaign[]> {
    return (await this.imcCollection
      .find({ workspace_id: workspaceId })
      .sort({ created_at: -1 })
      .toArray()) as unknown as ImcCampaign[];
  }

  public async createImcCampaign(
    data: Omit<ImcCampaign, 'created_at' | 'updated_at'>
  ): Promise<ImcCampaign> {
    const now = new Date();
    const doc = { ...data, created_at: now, updated_at: now };
    await this.imcCollection.insertOne(doc);
    return doc as ImcCampaign;
  }

  public async updateImcCampaign(
    imcId: string,
    patch: Partial<Pick<ImcCampaign, 'name' | 'description' | 'total_budget'>>
  ): Promise<void> {
    await this.imcCollection.updateOne(
      { imc_campaign_id: imcId },
      { $set: { ...patch, updated_at: new Date() } }
    );
  }

  /**
   * deleteImcCampaign: IMC 캠페인 삭제 후 소속 campaign_configs의 imc_campaign_id 필드 해제.
   * 두 컬렉션 변경을 트랜잭션 없이 순차 실행 — standalone 환경 호환.
   * campaign_configs 해제 실패 시 고아 FK가 남을 수 있으므로 로그 필수.
   */
  public async deleteImcCampaign(imcId: string): Promise<void> {
    await this.imcCollection.deleteOne({ imc_campaign_id: imcId });
    // 소속 캠페인의 imc_campaign_id 해제
    await this.campaignCollection.updateMany(
      { imc_campaign_id: imcId },
      { $unset: { imc_campaign_id: '' }, $set: { updated_at: new Date() } }
    );
  }

  /**
   * assignImcCampaign: campaign_config에 IMC 마스터 캠페인 연결/해제.
   * imcCampaignId가 null이면 imc_campaign_id 필드를 $unset으로 제거.
   */
  public async assignImcCampaign(
    campaignId: string,
    imcCampaignId: string | null
  ): Promise<void> {
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
