/**
 * RawRow (기존 kim 타입) ↔ PerformanceRecord (RAW_APP/DB 타입) 변환 어댑터
 */
import type { RawRow } from './rawDataParser';
import type { PerformanceRecord } from '@/types';

export function rawRowToPerformanceRecord(
  row: RawRow,
  campaignId: string,
  adGroupName: string,
): PerformanceRecord {
  return {
    campaign_id: campaignId,
    media: row.media,
    date: new Date(row.date),
    ad_group_name: adGroupName || row.dmpName,
    impressions: row.impressions,
    clicks: row.clicks,
    execution_amount: row.executionAmount,
    net_amount: row.netAmount,
    dmp_type: row.dmpType,
    has_dmp: row.dmpType !== 'DIRECT',
    cost: row.grossCost,
    supply_value: row.supplyValue,
    creative_name: row.creativeName,
  };
}

export function performanceRecordToRawRow(record: PerformanceRecord): RawRow {
  const dateStr = record.date instanceof Date
    ? record.date.toISOString().slice(0, 10)
    : String(record.date).slice(0, 10);

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayOfWeek = dayNames[new Date(dateStr).getDay()];

  return {
    date: dateStr,
    dayOfWeek,
    media: record.media,
    creativeName: record.creative_name ?? '',
    dmpName: record.ad_group_name,
    dmpType: (record.dmp_type as RawRow['dmpType']) || 'DIRECT',
    impressions: record.impressions,
    clicks: record.clicks,
    views: null,
    grossCost: record.cost,
    netCost: record.net_amount,
    executionAmount: record.execution_amount,
    netAmount: record.net_amount,
    supplyValue: record.supply_value ?? record.net_amount,
  };
}
