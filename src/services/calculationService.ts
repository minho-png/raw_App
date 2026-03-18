import * as dfd from 'danfojs';
import Papa from 'papaparse';
import { PerformanceRecord, MediaProvider } from '../types';

export class CalculationService {
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
      const columnMap: Record<string, string> = {
        '날짜': 'date_raw', '기간': 'date_raw',
        '광고 그룹': 'ad_group_name', '광고 그룹 이름': 'ad_group_name',
        '노출': 'impressions', '클릭': 'clicks',
        '집행 금액(VAT 별도)': 'supply_value', '총 비용': 'supply_value',
        '캠페인': 'excel_campaign_name',
        '소재': 'creative_name', '소재 이름': 'creative_name',
        '연령': 'age',
        '성별': 'gender',
        '기기': 'device'
      };
      Object.keys(columnMap).forEach(key => {
        if (currentCols.includes(key)) renameObj[key] = columnMap[key];
      });
    }
    df.rename(renameObj, { inplace: true });

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
      const config = campaignConfigs && excelCampName ? campaignConfigs[excelCampName] : null;
      
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

      const rawDate = row.date_raw;
      let parsedDate: Date;
      if (rawDate instanceof Date) {
        parsedDate = rawDate;
      } else {
        const dateStr = String(rawDate).replace(/\./g, '-');
        parsedDate = new Date(dateStr);
      }

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
        let reportDate: Date;
        if (row.date_raw instanceof Date) {
          reportDate = row.date_raw;
        } else {
          reportDate = new Date(String(row.date_raw).replace(/\./g, '-'));
        }

        reportRecords.push({
          campaign_id: campaignId,
          excel_campaign_name: row.excel_campaign_name,
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
