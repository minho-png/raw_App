import * as dfd from 'danfojs';
import Papa from 'papaparse';
import { PerformanceRecord, MediaProvider } from '../types';

export class CalculationService {
  private static STANDARD_ALIASES: Record<string, string[]> = {
    date_raw: ['날짜', '기간', 'Date', '일자', '집행일', 'Day'],
    ad_group_name: ['광고 그룹', '광고 그룹 이름', '광고그룹명', 'Ad Group', '그룹'],
    excel_campaign_name: ['캠페인', '캠페인명', '캠페인 이름', 'Campaign', 'Campaign Name'],
    impressions: ['노출', '노출수', 'Impressions', 'Imps'],
    clicks: ['클릭', '클릭수', 'Clicks'],
    supply_value: ['집행 금액(VAT 별도)', '총 비용', '공급가액', '집행금액', 'Spend', 'Cost'],
    placement: ['게재지면', '게재위치', '노출지면', 'Placement'],
    creative_name: ['소재', '소재 이름', '소재명', 'Creative'],
  };

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
    if (raw instanceof Date) return raw;
    const s = String(raw ?? '').trim();
    if (!s) return new Date();

    // Normalize separators: 2024.03.01 / 2024/03/01 -> 2024-03-01
    let normalized = s.replace(/[\.\/]/g, '-').replace(/\s+/g, '');

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

    const d = new Date(normalized);
    if (isNaN(d.getTime())) return new Date(); // fallback to prevent data loss
    return d;
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
    }>
  ): { raw: PerformanceRecord[], report: PerformanceRecord[] } {
    const df = new dfd.DataFrame(rawData);

    // 1. Column normalization & cleaning
    const renameObj: Record<string, string> = {};
    const currentCols = df.columns;

    if (columnMapping) {
      if (columnMapping.date && currentCols.includes(columnMapping.date)) renameObj[columnMapping.date] = 'date_raw';
      if (columnMapping.excel_campaign && currentCols.includes(columnMapping.excel_campaign)) renameObj[columnMapping.excel_campaign] = 'excel_campaign_name';
      if (columnMapping.ad_group && currentCols.includes(columnMapping.ad_group)) renameObj[columnMapping.ad_group] = 'ad_group_name';
      if (columnMapping.impressions && currentCols.includes(columnMapping.impressions)) renameObj[columnMapping.impressions] = 'impressions';
      if (columnMapping.clicks && currentCols.includes(columnMapping.clicks)) renameObj[columnMapping.clicks] = 'clicks';
      if (columnMapping.supply_value && currentCols.includes(columnMapping.supply_value)) renameObj[columnMapping.supply_value] = 'supply_value';
    } else {
      Object.assign(renameObj, this.buildFuzzyRenameMap(currentCols));
    }
    df.rename(renameObj, { inplace: true });

    // 1.1 placement is required: inject default if missing
    if (!df.columns.includes('placement')) {
      df.addColumn('placement', new Array(df.shape[0]).fill('Unknown'), { inplace: true });
    }

    // 1.2 placement must be included in grouping
    if (!groupByColumns.includes('placement')) {
      groupByColumns = [...groupByColumns, 'placement'];
    }

    // 2. DMP Detection
    const detectDMP = (name: any) => {
      if (typeof name !== 'string') return 'N/A';
      const upperName = name.toUpperCase();
      if (upperName.includes('WIFI') || name.includes('실내위치')) return 'WIFI';
      const found = ['SKP', 'KB', 'LOTTE', 'TG360', 'BC', 'SH'].find(k => upperName.includes(k.toUpperCase()));
      return found || 'DIRECT';
    };

    if (df.columns.includes('ad_group_name')) {
      df.addColumn('dmp_type', df['ad_group_name'].map(detectDMP), { inplace: true });
    } else {
      df.addColumn('dmp_type', new Array(df.shape[0]).fill('N/A'), { inplace: true });
    }

    // 3. Calculation & Raw Records
    const executionAmounts: number[] = [];
    const netAmounts: number[] = [];
    const rawRecords: PerformanceRecord[] = [];

    const json = this.ensureRecords(df);
    json.forEach((row, idx) => {
      const excelCampName = row.excel_campaign_name;
      // Preference: mapping_value matching excel_campaign_name
      // Fallback: older excel_name field if mapping_value is missing
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

      // 2.1 Custom DMP Detection based on config mapping
      let customDmp = row.dmp_type;
      if (config?.dmp_column && row[config.dmp_column]) {
        customDmp = String(row[config.dmp_column]);
      }

      rawRecords.push({
        campaign_id: campaignId,
        excel_campaign_name: excelCampName,
        media: rowMedia,
        date: parsedDate,
        ad_group_name: row.ad_group_name || 'Unknown',
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        execution_amount: executionAmt,
        net_amount: baseValue,
        dmp_type: row.dmp_type,
        dmp: customDmp, // Added: separate DMP column
        has_dmp: row.dmp_type !== 'DIRECT' && row.dmp_type !== 'N/A',
        cost: executionAmt, // Updated: DB "비용" 컬럼 (수수료 적용된 금액)
        supply_value: supplyVal, // 원본 공급가액
        is_raw: true,
        placement: row.placement || 'Unknown',
        creative_name: row.creative_name,
        age: row.age,
        gender: row.gender,
        device: row.device
      });
    });

    df.addColumn('execution_amount', executionAmounts, { inplace: true });
    df.addColumn('net_amount', netAmounts, { inplace: true });
    df.addColumn('cost', executionAmounts, { inplace: true }); // "비용" 컬럼 추가

    // 4. Aggregation (Report Data)
    let reportRecords: PerformanceRecord[] = [];
    if (groupByColumns.length > 0) {
      const sumCols = ['impressions', 'clicks', 'supply_value', 'execution_amount', 'net_amount', 'cost'];
      const availableSumCols = sumCols.filter(col => df.columns.includes(col));
      const groupDf = df.groupby(groupByColumns).col(availableSumCols).sum();
      
      const renameMap: Record<string, string> = {};
      availableSumCols.forEach(col => { renameMap[`${col}_sum`] = col; });
      groupDf.rename(renameMap, { inplace: true });

      const finalJson = this.ensureRecords(groupDf);
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
          device: row.device
        });
      });
    } else {
      // If no grouping, report records are same as raw (but marked as report)
      reportRecords = rawRecords.map(r => ({ ...r, is_raw: false }));
    }

    return { raw: rawRecords, report: reportRecords };
  }
}
