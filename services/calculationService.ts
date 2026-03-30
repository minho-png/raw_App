import Papa from 'papaparse';
import { PerformanceRecord, MediaProvider, DmpRule } from '@/types';

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
    device_os:            ['기기 및 OS', '기기및OS', 'Device and OS'],
    age_gender:           ['연령 및 성별', '연령및성별', 'Age and Gender'],
    device:               ['기기', 'Device', '기기 유형'],
    age:                  ['연령', 'Age', '연령대'],
    gender:               ['성별', 'Gender'],
    media_group:          ['매체 그룹', '매체그룹', 'Media Group'],
  };

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
    const normalizedCols = currentCols.map(c => ({ original: c, norm: this.normalizeHeader(c) }));
    const matchedTarget = new Set<string>();
    const matchedSource = new Set<string>();

    const tryMatch = (target: string, aliases: string[]) => {
      if (matchedTarget.has(target)) return;
      const aliasNorms = aliases.map(a => this.normalizeHeader(a));

      for (const col of normalizedCols) {
        if (matchedSource.has(col.original)) continue;
        if (aliasNorms.includes(col.norm)) {
          renameObj[col.original] = target;
          matchedTarget.add(target);
          matchedSource.add(col.original);
          return;
        }
      }

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
      return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate()));
    }
    const s = String(raw ?? '').trim();
    if (!s) {
      return new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    }

    const rangeMatch = s.match(/^(\d{4}[\.\-\/]\d{1,2}[\.\-\/]\d{1,2})[\s\.]*~/);
    if (rangeMatch) return this.parseDateNormalized(rangeMatch[1]);

    const cleaned = s.replace(/\.$/, '');
    let normalized = cleaned.replace(/[\.\/]/g, '-').replace(/\s+/g, '');

    const m = normalized.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      const yy = Number(m[1]);
      const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
      normalized = `${yyyy}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }

    const compact = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) {
      normalized = `${compact[1]}-${compact[2]}-${compact[3]}`;
    }

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
   * processWithDanfo: 5단계 파이프라인 (Danfo.js 집계 우회 — plain JS Map 사용)
   * STEP 1: 컬럼 매핑 (퍼지 헤더 매핑)
   * STEP 2: DMP 탐지 (규칙 엔진)
   * STEP 3: VAT 처리 + 수수료 계산
   * STEP 4: Raw Records 생성
   * STEP 5: 집계 (plain JS Map<string, Row>)
   */
  public static processWithDanfo(
    rawData: any[],
    campaignId: string,
    media: MediaProvider,
    totalFeeRate: number,
    groupByColumns: string[] = [],
    columnMapping?: Record<string, string>,
    campaignConfigs?: Record<string, {
      media: MediaProvider;
      fee_rate: number;
      budget: number;
      budget_type: 'integrated' | 'individual';
      cpc_goal?: number;
      ctr_goal?: number;
      dmp_column?: string;
    }>,
    dmpRules?: DmpRule[]
  ): { raw: PerformanceRecord[]; report: PerformanceRecord[] } {

    // STEP 1: Plain JS rename + complex column split
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

    const rows: Record<string, any>[] = rawData.map(orig => {
      const r: Record<string, any> = {};
      for (const [k, v] of Object.entries(orig)) {
        r[renameMap[k] ?? k] = v;
      }
      if ('device_os' in r && !('device' in r)) {
        const parts = String(r['device_os'] ?? '').split('>');
        r['device'] = parts[0].trim() || 'Unknown';
        r['os']     = parts[1]?.trim() || 'Unknown';
      }
      if ('age_gender' in r && !('age' in r)) {
        const s = String(r['age_gender'] ?? '');
        const i = s.lastIndexOf(' ');
        r['age']    = i > 0 ? s.slice(0, i).trim() : s;
        r['gender'] = i > 0 ? s.slice(i + 1).trim() : 'Unknown';
      }
      return r;
    });

    // STEP 2: DMP Detection
    const buildDmpDetector = (rules?: DmpRule[]): (name: any) => string => {
      if (!rules || rules.length === 0) {
        return (name: any): string => {
          if (typeof name !== 'string' || !name.trim()) return 'DIRECT';
          const u = name.toUpperCase();
          if (u.includes('WIFI') || u.includes('실내위치')) return 'WIFI';
          const found = ['SKP', 'KB', 'LOTTE', 'TG360', 'BC', 'SH'].find(k => u.includes(k));
          if (found) return found;
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
        return 'DIRECT';
      };
    };
    const detectDMP = buildDmpDetector(dmpRules);
    const dmpTypes: string[] = rows.map(r => detectDMP(String(r['ad_group_name'] ?? '')));

    // STEP 3 + 4: 수수료 계산 + Raw Records
    const executionAmounts: number[] = [];
    const netAmounts: number[] = [];
    const rawRecords: PerformanceRecord[] = [];

    rows.forEach((row, idx) => {
      const excelCampName = row.excel_campaign_name;
      const config = campaignConfigs && excelCampName
        ? Object.values(campaignConfigs).find(c => (c as any).mapping_value === excelCampName || (c as any).excel_name === excelCampName)
        : null;

      const rowMedia = config ? config.media : media;
      const rowFeeRate = (config && config.budget_type === 'individual') ? config.fee_rate : totalFeeRate;
      const feeDecimal = rowFeeRate / 100;

      const supplyVal = parseFloat(String(row.supply_value).replace(/,/g, '')) || 0;
      // 네이버 VAT: supply / 1.1 = netAmount, execution = net / (1 - feeRate)
      const baseValue = (rowMedia === '네이버GFA') ? (supplyVal / 1.1) : supplyVal;
      const executionAmt = feeDecimal === 1 ? baseValue : baseValue / (1 - feeDecimal);

      executionAmounts.push(executionAmt);
      netAmounts.push(baseValue);

      const parsedDate = this.parseDateNormalized(row.date_raw);
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

    // STEP 5: Aggregation — plain JS Map (Danfo.js 완전 우회)
    const rowsWithDmp = rows.map((r, i) => ({
      ...r,
      dmp_type: dmpTypes[i],
      execution_amount: executionAmounts[i],
      net_amount: netAmounts[i],
      cost: executionAmounts[i],
    }));

    // 집계할 차원 컬럼 결정
    const allCols = Object.keys(rowsWithDmp[0] ?? {});
    if (!groupByColumns.includes('placement')) groupByColumns = [...groupByColumns, 'placement'];
    const autoDims = allCols.filter(c => CalculationService.DIMENSION_COLS.has(c));
    groupByColumns = Array.from(new Set([...groupByColumns, ...autoDims]));
    groupByColumns = groupByColumns.filter(c => allCols.includes(c));
    if (!groupByColumns.includes('dmp_type')) groupByColumns = [...groupByColumns, 'dmp_type'];

    const sumCols = ['impressions', 'clicks', 'supply_value', 'execution_amount', 'net_amount', 'cost'];
    const availableSumCols = sumCols.filter(col => allCols.includes(col));

    let reportRecords: PerformanceRecord[] = [];

    if (groupByColumns.length > 0 && availableSumCols.length > 0) {
      const groups = new Map<string, Record<string, any>>();
      rowsWithDmp.forEach(row => {
        const key = groupByColumns.map(col => String(row[col] ?? '')).join('\x00');
        if (!groups.has(key)) {
          const seed: Record<string, any> = {};
          groupByColumns.forEach(col => { seed[col] = row[col]; });
          availableSumCols.forEach(col => { seed[col] = 0; });
          seed['date_raw'] = row['date_raw'];
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

      groups.forEach(row => {
        const dmp = String(row.dmp_type || 'N/A');
        const customDmp = String(row.dmp || dmp);
        const reportDate = this.parseDateNormalized(row.date_raw);

        reportRecords.push({
          campaign_id: campaignId,
          excel_campaign_name: row.excel_campaign_name,
          mapping_value: row.excel_campaign_name,
          media,
          date: reportDate,
          ad_group_name: String(row.ad_group_name || 'Grouped'),
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          execution_amount: Number(row.execution_amount) || 0,
          net_amount: Number(row.net_amount) || 0,
          dmp_type: dmp,
          dmp: customDmp,
          has_dmp: dmp !== 'DIRECT' && dmp !== 'N/A',
          cost: Number(row.cost) || 0,
          supply_value: Number(row.supply_value) || 0,
          is_raw: false,
          placement: String(row.placement || 'Unknown'),
          creative_name: row.creative_name,
          age: row.age,
          gender: row.gender,
          device: row.device,
          os: row.os,
          media_group: row.media_group,
        });
      });
    } else {
      reportRecords = rawRecords.map(r => ({ ...r, is_raw: false }));
    }

    return { raw: rawRecords, report: reportRecords };
  }
}
