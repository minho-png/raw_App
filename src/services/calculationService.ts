import * as dfd from 'danfojs';
import Papa from 'papaparse';
import { PerformanceRecord, MediaProvider, DmpRule } from '../types';

export class CalculationService {
  private static STANDARD_ALIASES: Record<string, string[]> = {
    date_raw:             ['날짜', '기간', 'Date', '일자', '집행일', 'Day'],
    ad_group_name:        ['광고 그룹', '광고 그룹 이름', '광고그룹명', 'Ad Group', '그룹'],
    excel_campaign_name:  ['캠페인', '캠페인명', '캠페인 이름', 'Campaign', 'Campaign Name'],
    impressions:          ['노출', '노출수', 'Impressions', 'Imps'],
    clicks:               ['클릭', '클릭수', 'Clicks'],
    supply_value:         ['집행 금액(VAT 별도)', '총 비용', '공급가액', '집행금액', 'Spend', 'Cost'],
    placement:            ['게재지면', '게재위치', '노출지면', 'Placement', '게재 위치'],
    creative_name:        ['소재', '소재 이름', '소재명', 'Creative', '광고 소재 이름', '광고소재이름'],
    // 차원 컬럼 — 복합형 먼저 (contains match 우선순위 보장)
    device_os:            ['기기 및 OS', '기기및OS', 'Device and OS'],
    age_gender:           ['연령 및 성별', '연령및성별', 'Age and Gender'],
    // 차원 컬럼 — 단순형 (복합형 이후 처리)
    device:               ['기기', 'Device', '기기 유형'],
    age:                  ['연령', 'Age', '연령대'],
    gender:               ['성별', 'Gender'],
    media_group:          ['매체 그룹', '매체그룹', 'Media Group'],
  };

  /** 집계 키(groupBy)로 사용할 수 있는 차원 컬럼 집합 */
  private static readonly DIMENSION_COLS = new Set([
    'ad_group_name', 'creative_name', 'placement',
    'device', 'os', 'age', 'gender', 'media_group',
  ]);

  private static normalizeHeader(value: any) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[_\-]/g, '');
  }

  private static buildFuzzyRenameMap(currentCols: string[]) {
    const renameObj: Record<string, string> = {};
    const normalizedCols = currentCols.map((c) => ({ original: c, norm: this.normalizeHeader(c) }));

    const matchedTarget = new Set<string>();
    const matchedSource = new Set<string>();

    const tryMatch = (target: string, aliases: string[]) => {
      if (matchedTarget.has(target)) return;
      const aliasNorms = aliases.map(a => this.normalizeHeader(a));

      // 1) exact normalized match
      for (const col of normalizedCols) {
        if (matchedSource.has(col.original)) continue;
        if (aliasNorms.includes(col.norm)) {
          renameObj[col.original] = target;
          matchedTarget.add(target);
          matchedSource.add(col.original);
          return;
        }
      }

      // 2) contains match (fuzzy)
      for (const col of normalizedCols) {
        if (matchedSource.has(col.original)) continue;
        const hit = aliasNorms.some(a => col.norm.includes(a) || a.includes(col.norm));
        if (hit) {
          renameObj[col.original] = target;
          matchedTarget.add(target);
          matchedSource.add(col.original);
          return;
        }
      }
    };

    Object.entries(this.STANDARD_ALIASES).forEach(([target, aliases]) => tryMatch(target, aliases));
    return renameObj;
  }

  private static parseDateNormalized(raw: any): Date {
    if (raw instanceof Date) {
      // UTC 자정으로 정규화하여 DB 날짜 매칭 일관성 보장
      return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate()));
    }
    const s = String(raw ?? '').trim();
    if (!s) {
      return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    }

    // 범위 형식 감지: "2026.02.10. ~ 2026.03.01." → 시작일만 추출
    const rangeMatch = s.match(/^(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})[\s\.]*~/);
    if (rangeMatch) return this.parseDateNormalized(rangeMatch[1]);

    // Strip trailing dot: 네이버 표준 YYYY.MM.DD. 형식 지원
    const cleaned = s.replace(/\.$/, '');

    // Normalize separators: 2024.03.01 / 2024/03/01 -> 2024-03-01
    let normalized = cleaned.replace(/[\.\/]/g, '-').replace(/\s+/g, '');

    // Handle YY-MM-DD (e.g., 24-03-01 -> 2024-03-01)
    const m = normalized.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      const yy = Number(m[1]);
      const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
      normalized = `${yyyy}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }

    // Handle YYYYMMDD
    const compact = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) {
      normalized = `${compact[1]}-${compact[2]}-${compact[3]}`;
    }

    // UTC 자정으로 파싱하여 타임존 차이로 인한 날짜 어긋남 방지
    const parts = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (parts) {
      return new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
    }

    const d = new Date(normalized);
    if (isNaN(d.getTime())) {
      console.warn(`[CalculationService] 날짜 파싱 실패: "${raw}" — 오늘 날짜로 대체`);
      return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    }
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  /**
   * parseCsv: Parses raw CSV string into an array of objects
   */
  public static async parseCsv(csvString: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(csvString, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (error: any) => reject(error)
      });
    });
  }
  /**
   * ensureRecords: Robustly extracts row objects from a DataFrame, handling
   * both row-oriented and column-oriented JSON output from Danfo.js.
   */
  private static ensureRecords(df: any): any[] {
    // We try 'row' format as it's the recommended one for records
    const jsonOutput = dfd.toJSON(df, { format: 'row' });
    const data = typeof jsonOutput === 'string' ? JSON.parse(jsonOutput) : jsonOutput;
    
    if (Array.isArray(data)) return data;
    
    // If we got an object { col1: [v1, v2], ... }, pivot it back to rows (records)
    // This happens in some environments/versions with Danfo.js
    const columns = Object.keys(data);
    if (columns.length === 0) return [];
    
    const rowCount = (data[columns[0]] as any[]).length;
    const records = [];
    for (let i = 0; i < rowCount; i++) {
      const record: any = {};
      columns.forEach(col => {
        record[col] = data[col][i];
      });
      records.push(record);
    }
    return records;
  }


  /**
   * processWithDanfo: Core logic using DataFrames for calculation and DMP detection.
   * Returns an object containing both raw records and aggregated (report) records.
   */
  public static processWithDanfo(
    rawData: any[], 
    campaignId: string, 
    media: MediaProvider, 
    totalFeeRate: number, 
    groupByColumns: string[] = [],
    columnMapping?: Record<string, string>,
    campaignConfigs?: Record<string, {
      media: MediaProvider,
      fee_rate: number,
      budget: number,
      budget_type: 'integrated' | 'individual',
      cpc_goal?: number,
      ctr_goal?: number,
      dmp_column?: string
    }>,
    dmpRules?: DmpRule[]
  ): { raw: PerformanceRecord[], report: PerformanceRecord[] } {

    // ══════════════════════════════════════════════════════════════════════
    // STEP 1: Plain JS rename + complex column split (Danfo.js 완전 우회)
    //   df.rename() + Korean 컬럼명 조합은 내부 DType 처리 불안정.
    //   rawData 자체를 JS Map으로 먼저 변환해 guaranteed-string 키 확보.
    // ══════════════════════════════════════════════════════════════════════
    const sampleKeys = Object.keys(rawData[0] ?? {});
    let renameMap: Record<string, string> = {};
    if (columnMapping) {
      if (columnMapping.date)           renameMap[columnMapping.date]           = 'date_raw';
      if (columnMapping.excel_campaign) renameMap[columnMapping.excel_campaign] = 'excel_campaign_name';
      if (columnMapping.ad_group)       renameMap[columnMapping.ad_group]       = 'ad_group_name';
      if (columnMapping.impressions)    renameMap[columnMapping.impressions]    = 'impressions';
      if (columnMapping.clicks)         renameMap[columnMapping.clicks]         = 'clicks';
      if (columnMapping.supply_value)   renameMap[columnMapping.supply_value]   = 'supply_value';
    } else {
      renameMap = this.buildFuzzyRenameMap(sampleKeys);
    }

    // Plain JS 변환: rename + 복합 컬럼 분리 (기기 및 OS, 연령 및 성별)
    const rows: Record<string, any>[] = rawData.map(orig => {
      const r: Record<string, any> = {};
      for (const [k, v] of Object.entries(orig)) {
        r[renameMap[k] ?? k] = v;
      }
      // 복합 컬럼 A: device_os ("모바일 > Android") → device + os
      if ('device_os' in r && !('device' in r)) {
        const parts = String(r['device_os'] ?? '').split('>');
        r['device'] = parts[0].trim() || 'Unknown';
        r['os']     = parts[1]?.trim() || 'Unknown';
      }
      // 복합 컬럼 B: age_gender ("35세~39세 여자") → age + gender
      if ('age_gender' in r && !('age' in r)) {
        const s = String(r['age_gender'] ?? '');
        const i = s.lastIndexOf(' ');
        r['age']    = i > 0 ? s.slice(0, i).trim() : s;
        r['gender'] = i > 0 ? s.slice(i + 1).trim() : 'Unknown';
      }
      return r;
    });

    // ══════════════════════════════════════════════════════════════════════
    // STEP 2: DMP Detection — 100% plain JS, Danfo 타입 변환 완전 차단
    // ══════════════════════════════════════════════════════════════════════
    const buildDmpDetector = (rules?: DmpRule[]): (name: any) => string => {
      if (!rules || rules.length === 0) {
        return (name: any): string => {
          if (typeof name !== 'string' || !name.trim()) return 'DIRECT';
          const u = name.toUpperCase();
          if (u.includes('WIFI') || u.includes('실내위치')) return 'WIFI';
          const found = ['SKP', 'KB', 'LOTTE', 'TG360', 'BC', 'SH'].find(k => u.includes(k));
          if (found) return found;
          if (name.trim()) console.warn(`[DMP] 미분류 ad_group_name: "${name}" → DIRECT`);
          return 'DIRECT';
        };
      }
      return (name: any): string => {
        if (typeof name !== 'string' || !name.trim()) return 'DIRECT';
        const u = name.toUpperCase();
        for (const rule of rules) {
          const k = rule.keyword.toUpperCase();
          const matched =
            rule.match_type === 'contains'   ? u.includes(k) :
            rule.match_type === 'startsWith' ? u.startsWith(k) :
            u === k;
          if (matched) return rule.map_to;
        }
        if (name.trim()) console.warn(`[DMP] 미분류 ad_group_name: "${name}" → DIRECT`);
        return 'DIRECT';
      };
    };
    const detectDMP = buildDmpDetector(dmpRules);

    // 각 행의 dmp_type을 plain JS에서 직접 결정 (guaranteed string ad_group_name)
    const dmpTypes: string[] = rows.map(r => detectDMP(String(r['ad_group_name'] ?? '')));

    // ══════════════════════════════════════════════════════════════════════
    // STEP 3: Danfo.js DataFrame은 집계용으로만 사용
    //   rows(이미 rename 완료) + dmp_type을 주입한 뒤 DataFrame 생성
    // ══════════════════════════════════════════════════════════════════════
    const rowsWithDmp = rows.map((r, i) => ({ ...r, dmp_type: dmpTypes[i] }));
    const df = new dfd.DataFrame(rowsWithDmp);

    // 필수 컬럼 기본값 주입 (DF에 없는 경우만)
    const rowCount = df.shape[0];
    if (!df.columns.includes('date_raw'))            df.addColumn('date_raw',           new Array(rowCount).fill(new Date()), { inplace: true });
    if (!df.columns.includes('ad_group_name'))       df.addColumn('ad_group_name',      new Array(rowCount).fill('Unknown'),  { inplace: true });
    if (!df.columns.includes('excel_campaign_name')) df.addColumn('excel_campaign_name',new Array(rowCount).fill(''),         { inplace: true });
    if (!df.columns.includes('impressions'))         df.addColumn('impressions',         new Array(rowCount).fill(0),          { inplace: true });
    if (!df.columns.includes('clicks'))              df.addColumn('clicks',              new Array(rowCount).fill(0),          { inplace: true });
    if (!df.columns.includes('supply_value'))        df.addColumn('supply_value',        new Array(rowCount).fill(0),          { inplace: true });
    if (!df.columns.includes('placement'))           df.addColumn('placement',           new Array(rowCount).fill('Unknown'),  { inplace: true });

    // groupByColumns 구성: placement + 차원 자동 감지 + dmp_type 강제 포함
    if (!groupByColumns.includes('placement')) groupByColumns = [...groupByColumns, 'placement'];
    const _autoDims = df.columns.filter((c: string) => CalculationService.DIMENSION_COLS.has(c));
    groupByColumns = Array.from(new Set([...groupByColumns, ..._autoDims]));
    groupByColumns = groupByColumns.filter(c => df.columns.includes(c));
    if (!groupByColumns.includes('dmp_type')) groupByColumns = [...groupByColumns, 'dmp_type'];

    // ══════════════════════════════════════════════════════════════════════
    // STEP 4: Calculation & Raw Records (rows 배열 직접 사용 — ensureRecords 불필요)
    // ══════════════════════════════════════════════════════════════════════
    const executionAmounts: number[] = [];
    const netAmounts: number[] = [];
    const rawRecords: PerformanceRecord[] = [];

    rows.forEach((row, idx) => {
      // rows는 이미 rename 완료된 plain JS 객체 — 키가 guaranteed string
      const excelCampName = row.excel_campaign_name;
      const config = campaignConfigs && excelCampName
        ? (Object.values(campaignConfigs).find(c => (c as any).mapping_value === excelCampName || (c as any).excel_name === excelCampName))
        : null;
      
      // Integrated vs Individual budget logic: 
      // Individual uses its own fee rate, Integrated uses global (totalFeeRate)
      const rowMedia = config ? config.media : media;
      const rowFeeRate = (config && config.budget_type === 'individual') ? config.fee_rate : totalFeeRate;
      const feeDecimal = rowFeeRate / 100;
      
      const supplyVal = parseFloat(String(row.supply_value).replace(/,/g, '')) || 0;
      const baseValue = (rowMedia === '네이버GFA') ? (supplyVal / 1.1) : supplyVal;
      const executionAmt = feeDecimal === 1 ? baseValue : baseValue / (1 - feeDecimal);
      
      executionAmounts.push(executionAmt);
      netAmounts.push(baseValue);

      const parsedDate = this.parseDateNormalized(row.date_raw);

      // dmpTypes[idx]는 STEP 2에서 plain JS로 확정된 DMP값 — row.dmp_type 참조 불필요
      const dmpType = dmpTypes[idx];
      let customDmp = dmpType;
      if (config?.dmp_column && row[config.dmp_column]) {
        customDmp = String(row[config.dmp_column]);
      }

      rawRecords.push({
        campaign_id: campaignId,
        excel_campaign_name: excelCampName,
        media: rowMedia,
        date: parsedDate,
        ad_group_name: String(row.ad_group_name ?? 'Unknown') || 'Unknown',
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        execution_amount: executionAmt,
        net_amount: baseValue,
        dmp_type: dmpType,
        dmp: customDmp,
        has_dmp: dmpType !== 'DIRECT' && dmpType !== 'N/A',
        cost: executionAmt,
        supply_value: supplyVal,
        is_raw: true,
        placement: String(row.placement ?? 'Unknown') || 'Unknown',
        creative_name: row.creative_name,
        age: row.age,
        gender: row.gender,
        device: row.device,
        os: row.os,
        media_group: row.media_group,
      });
    });

    // ══════════════════════════════════════════════════════════════════════
    // STEP 5: Aggregation — rowsWithDmp 직접 사용 (ensureRecords 완전 제거)
    //   Danfo.js toJSON 변환을 거치지 않으므로 Korean 값 손실 없음
    // ══════════════════════════════════════════════════════════════════════
    const sumCols = ['impressions', 'clicks', 'supply_value', 'execution_amount', 'net_amount', 'cost'];
    // rowsWithDmp에 execution/net/cost를 추가한 fullRows 빌드
    const fullRows: Record<string, any>[] = rowsWithDmp.map((r, i) => ({
      ...r,
      execution_amount: executionAmounts[i],
      net_amount: netAmounts[i],
      cost: executionAmounts[i],
    }));
    const allCols = Object.keys(fullRows[0] ?? {});
    const availableSumCols = sumCols.filter(col => allCols.includes(col));

    // 집계용 DF 컬럼 업데이트 (리포트 저장 등에서 df 참조할 경우를 대비)
    if (df.columns.includes('execution_amount') === false) {
      df.addColumn('execution_amount', executionAmounts, { inplace: true });
      df.addColumn('net_amount',       netAmounts,       { inplace: true });
      df.addColumn('cost',             executionAmounts, { inplace: true });
    }

    let reportRecords: PerformanceRecord[] = [];
    if (groupByColumns.length > 0) {
      if (availableSumCols.length === 0) {
        reportRecords = rawRecords.map(r => ({ ...r, is_raw: false }));
        return { raw: rawRecords, report: reportRecords };
      }

      const groups = new Map<string, any>();
      fullRows.forEach(row => {
        const key = groupByColumns.map(col => String(row[col] ?? '')).join('\x00');
        if (!groups.has(key)) {
          const seed: any = {};
          groupByColumns.forEach(col => { seed[col] = row[col]; });
          availableSumCols.forEach(col => { seed[col] = 0; });
          seed['excel_campaign_name'] = row['excel_campaign_name'];
          seed['creative_name'] = row['creative_name'];
          seed['age'] = row['age'];
          seed['gender'] = row['gender'];
          seed['device'] = row['device'];
          seed['os'] = row['os'];
          seed['media_group'] = row['media_group'];
          groups.set(key, seed);
        }
        const g = groups.get(key)!;
        availableSumCols.forEach(col => { g[col] = (g[col] || 0) + (Number(row[col]) || 0); });
      });

      const finalJson = Array.from(groups.values());
      finalJson.forEach(row => {
        const dmp = row.dmp_type || 'N/A';
        const customDmp = row.dmp || dmp;
        
        // Handle date_raw from grouping (might be string or Date)
        const reportDate = this.parseDateNormalized(row.date_raw);

        reportRecords.push({
          _id: `temp_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
          campaign_id: campaignId,
          excel_campaign_name: row.excel_campaign_name,
          mapping_value: row.excel_campaign_name, // Explicitly track mapping source
          media: media, 
          date: reportDate,
          ad_group_name: row.ad_group_name || 'Grouped',
          impressions: row.impressions || 0,
          clicks: row.clicks || 0,
          execution_amount: row.execution_amount || 0,
          net_amount: row.net_amount || 0,
          dmp_type: dmp,
          dmp: customDmp,
          has_dmp: dmp !== 'DIRECT' && dmp !== 'N/A',
          cost: row.cost || 0,
          supply_value: row.supply_value || 0,
          is_raw: false,
          placement: row.placement || 'Unknown',
          creative_name: row.creative_name,
          age: row.age,
          gender: row.gender,
          device: row.device,
          os: row.os,
          media_group: row.media_group,
        });
      });
    } else {
      // If no grouping, report records are same as raw (but marked as report)
      reportRecords = rawRecords.map(r => ({ ...r, is_raw: false }));
    }

    return { raw: rawRecords, report: reportRecords };
  }
}
