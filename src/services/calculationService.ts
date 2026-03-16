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
      cpc_goal?: number,
      ctr_goal?: number
    }>
  ): PerformanceRecord[] {
    const df = new dfd.DataFrame(rawData);

    // 1. Column normalization & cleaning
    const renameObj: Record<string, string> = {};
    const currentCols = df.columns;

    if (columnMapping) {
      // Manual mapping: { internalKey: csvHeader }
      if (columnMapping.date && currentCols.includes(columnMapping.date)) renameObj[columnMapping.date] = 'date_raw';
      if (columnMapping.excel_campaign && currentCols.includes(columnMapping.excel_campaign)) renameObj[columnMapping.excel_campaign] = 'excel_campaign_name';
      if (columnMapping.ad_group && currentCols.includes(columnMapping.ad_group)) renameObj[columnMapping.ad_group] = 'ad_group_name';
      if (columnMapping.impressions && currentCols.includes(columnMapping.impressions)) renameObj[columnMapping.impressions] = 'impressions';
      if (columnMapping.clicks && currentCols.includes(columnMapping.clicks)) renameObj[columnMapping.clicks] = 'clicks';
      if (columnMapping.supply_value && currentCols.includes(columnMapping.supply_value)) renameObj[columnMapping.supply_value] = 'supply_value';
    } else {
      // Automatic fallback (including NaverGFA specific headers)
      const columnMap: Record<string, string> = {
        '날짜': 'date_raw',
        '기간': 'date_raw', // NaverGFA
        '광고 그룹': 'ad_group_name',
        '광고 그룹 이름': 'ad_group_name', // NaverGFA
        '노출': 'impressions',
        '클릭': 'clicks',
        '집행 금액(VAT 별도)': 'supply_value',
        '총 비용': 'supply_value', // NaverGFA
        '캠페인': 'excel_campaign_name' // NaverGFA
      };
      Object.keys(columnMap).forEach(key => {
        if (currentCols.includes(key)) {
          renameObj[key] = columnMap[key];
        }
      });
    }
    df.rename(renameObj, { inplace: true });

    // 2. DMP Detection Logic
    const dmpKeywords = ['SKP', 'KB', 'LOTTE', 'TG360', 'WIFI', 'BC', 'SH'];
    const detectDMP = (name: any) => {
      if (typeof name !== 'string') return 'N/A';
      const upperName = name.toUpperCase();
      const found = dmpKeywords.find(k => upperName.includes(k));
      return found || 'DIRECT';
    };

    if (df.columns.includes('ad_group_name')) {
      df.addColumn('dmp_type', df['ad_group_name'].map(detectDMP), { inplace: true });
    } else {
      df.addColumn('dmp_type', new Array(df.shape[0]).fill('N/A'), { inplace: true });
    }

    // 3. Total Commission Calculation
    // NaverGFA: Execution Amount = (Supply Value / 1.1) / (1 - (Fee Rate / 100))
    // Others: Execution Amount = Supply Value / (1 - (Fee Rate / 100))
    const executionAmounts: number[] = [];
    const netAmounts: number[] = [];

    const json = this.ensureRecords(df);
    json.forEach(row => {
      const excelCampName = row.excel_campaign_name;
      const config = campaignConfigs && excelCampName ? (campaignConfigs as Record<string, any>)[excelCampName] : null;
      
      const rowMedia = config ? config.media : media;
      const rowFeeRate = config ? (config.fee_rate ?? totalFeeRate) : totalFeeRate;
      const feeDecimal = rowFeeRate / 100;
      
      let supplyVal = parseFloat(String(row.supply_value).replace(/,/g, '')) || 0;
      
      // NaverGFA VAT logic: Divide by 1.1
      const baseValue = (rowMedia === '네이버GFA') ? (supplyVal / 1.1) : supplyVal;
      
      const executionAmt = feeDecimal === 1 ? baseValue : baseValue / (1 - feeDecimal);
      
      executionAmounts.push(executionAmt);
      netAmounts.push(baseValue); // Net is usually VAT excluded
    });

    df.addColumn('execution_amount', executionAmounts, { inplace: true });
    df.addColumn('net_amount', netAmounts, { inplace: true });

    // 4. Final Mapping to PerformanceRecord
    const records: PerformanceRecord[] = [];
    const finalJson = this.ensureRecords(df);

    finalJson.forEach(row => {
      const excelCampName = row.excel_campaign_name;
      const config = campaignConfigs && excelCampName ? campaignConfigs[excelCampName] : null;
      const dmp = row.dmp_type;
      
      records.push({
        campaign_id: campaignId, // Always use the sidebar-selected campaign ID
        excel_campaign_name: excelCampName,
        media: config ? config.media : media,
        date: new Date(row.date_raw),
        ad_group_name: row.ad_group_name || 'Unknown',
        impressions: row.impressions || 0,
        clicks: row.clicks || 0,
        execution_amount: row.execution_amount || 0,
        net_amount: row.net_amount || 0,
        dmp_type: dmp,
        has_dmp: dmp !== 'DIRECT' && dmp !== 'N/A',
        cost: row.supply_value || 0
      });
    });

    return records;
  }
}
