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
   * processWithDanfo: Core logic using DataFrames for calculation and DMP detection.
   */
  public static processWithDanfo(rawData: any[], campaignId: string, media: MediaProvider, totalFeeRate: number, groupByColumns?: string[]): PerformanceRecord[] {
    const df = new dfd.DataFrame(rawData);

    // 1. Column normalization & cleaning
    // Assuming GFA standard columns: 날짜, 광고 그룹, 노출, 클릭, 집행 금액(VAT 별도)
    const columnMap: Record<string, string> = {
      '날짜': 'date_raw',
      '광고 그룹': 'ad_group_name',
      '노출': 'impressions',
      '클릭': 'clicks',
      '집행 금액(VAT 별도)': 'supply_value'
    };

    // Rename columns if they exist
    const currentCols = df.columns;
    const renameObj: Record<string, string> = {};
    Object.keys(columnMap).forEach(key => {
      if (currentCols.includes(key)) {
        renameObj[key] = columnMap[key];
      }
    });
    df.rename(renameObj, { inplace: true });

    // 2. Data Cleaning
    if (df.columns.includes('supply_value')) {
      // Remove commas if string and convert to numeric
      // Note: Danfo.js handles some numeric conversion automatically if dynamicTyping was on in Papa.
    }

    // 3. DMP Detection Logic
    const dmpKeywords = ['SKP', 'KB', 'LOTTE', 'TG360', 'WIFI', 'BC', 'SH'];
    const detectDMP = (name: any) => {
      if (typeof name !== 'string') return 'N/A';
      const upperName = name.toUpperCase();
      const found = dmpKeywords.find(k => upperName.includes(k));
      return found || 'DIRECT';
    };

    df.addColumn('dmp_type', df['ad_group_name'].map(detectDMP), { inplace: true });

    // 4. Total Commission Calculation
    // Formula: Execution Amount = Supply Value / (1 - (Total Fee Rate / 100))
    // Net Amount = Execution Amount * (1 - (Total Fee Rate / 100)) which is just Supply Value
    const feeDecimal = totalFeeRate / 100;
    const calcExecution = (val: any) => {
      const num = parseFloat(String(val).replace(/,/g, '')) || 0;
      return num / (1 - feeDecimal);
    };

    df.addColumn('execution_amount', df['supply_value'].map(calcExecution), { inplace: true });
    df.addColumn('net_amount', df['supply_value'], { inplace: true }); // Net is supply value in this logic

    // 5. Final Mapping to PerformanceRecord
    const records: PerformanceRecord[] = [];
    const json = df.toJSON() as any[];

    json.forEach(row => {
      const dmp = row.dmp_type;
      records.push({
        campaign_id: campaignId,
        media: media,
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
