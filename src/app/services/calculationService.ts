import { MediaProvider, PerformanceRecord } from '../types';

export class CalculationService {
  private static DMP_KEYWORDS = ['SKP', 'KB', 'LOTTE', 'TG360', 'WIFI', '실내위치', '실내 위치'];

  /**
   * cleanNumeric: Removes commas and converts string to number.
   */
  public static cleanNumeric(val: string | number): number {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const cleaned = val.toString().replace(/,/g, '').trim();
    if (cleaned === '' || cleaned === '-') return 0;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * detectDmpType: Scans ad group name for DMP keywords.
   */
  public static detectDmpType(groupName: string): { dmpType: string; hasDmp: boolean } {
    if (!groupName) return { dmpType: 'None', hasDmp: false };
    
    const upperName = groupName.toUpperCase();
    for (const kw of this.DMP_KEYWORDS) {
      if (upperName.includes(kw.toUpperCase())) {
        // Normalize WIFI related keywords
        if (['WIFI', '실내위치', '실내 위치'].includes(kw.toUpperCase())) {
          return { dmpType: 'WIFI', hasDmp: true };
        }
        return { dmpType: kw.toUpperCase(), hasDmp: true };
      }
    }
    return { dmpType: 'None', hasDmp: false };
  }

  /**
   * calculateExecutionAmount: 
   * Formula: Execution Amount = Supply Value / (1 - (Total Fee Rate / 100))
   * Supply Value (NET가) is assumed to be Cost / 1.1 (excluding VAT)
   */
  public static calculateExecutionAmount(
    cost: number, 
    totalFeeRate: number
  ): { netAmount: number; executionAmount: number } {
    const netAmount = cost / 1.1;
    let executionAmount = netAmount;

    const feeDecimal = totalFeeRate / 100;
    
    if (feeDecimal < 1.0) {
      executionAmount = netAmount / (1 - feeDecimal);
    } else {
      // Avoid division by zero if fee rate is 100% or more (failsafe)
      executionAmount = netAmount;
    }

    return { netAmount, executionAmount };
  }

  /**
   * processCsvRow: Maps a raw CSV row to a PerformanceRecord.
   */
  public static processCsvRow(
    row: any, 
    campaignId: string, 
    media: MediaProvider, 
    totalFeeRate: number
  ): PerformanceRecord {
    const cost = this.cleanNumeric(row['총 비용'] || row['cost'] || 0);
    const { netAmount, executionAmount } = this.calculateExecutionAmount(cost, totalFeeRate);
    const adGroupName = row['광고 그룹 이름'] || row['ad_group_name'] || '';
    const { dmpType, hasDmp } = this.detectDmpType(adGroupName);

    return {
      ...row,
      campaign_id: campaignId,
      media: media,
      date: new Date(row['날짜'] || row['date']),
      ad_group_name: adGroupName,
      impressions: this.cleanNumeric(row['노출'] || row['impressions'] || 0),
      clicks: this.cleanNumeric(row['클릭'] || row['clicks'] || 0),
      cost: cost,
      net_amount: netAmount,
      execution_amount: executionAmount,
      dmp_type: dmpType,
      has_dmp: hasDmp,
    };
  }
}
