'use client';

/**
 * 컬럼 매핑 미리보기 — 디지털 마케터 요청
 * CSV 업로드 직후 어떤 컬럼이 인식/매핑됐는지 시각적으로 표시합니다.
 */
import React, { useMemo } from 'react';
import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// CalculationService의 STANDARD_ALIASES 동기화
const STANDARD_ALIASES: Record<string, { label: string; aliases: string[] }> = {
  date_raw:             { label: '날짜',        aliases: ['날짜', '기간', 'date', '일자', '집행일', 'day'] },
  ad_group_name:        { label: '광고 그룹',   aliases: ['광고그룹', '광고그룹명', '광고 그룹 이름', 'adgroup', 'group'] },
  excel_campaign_name:  { label: '캠페인명',    aliases: ['캠페인', '캠페인명', '캠페인이름', 'campaign', 'campaignname'] },
  impressions:          { label: '노출수',      aliases: ['노출', '노출수', 'impressions', 'imps'] },
  clicks:               { label: '클릭수',      aliases: ['클릭', '클릭수', 'clicks'] },
  supply_value:         { label: '집행금액',    aliases: ['집행금액', '총비용', '공급가액', '집행금액(VAT별도)', '집행 금액(VAT 별도)', 'spend', 'cost'] },
  placement:            { label: '게재지면',    aliases: ['게재지면', '게재위치', '노출지면', 'placement', '게재위치'] },
  creative_name:        { label: '소재명',      aliases: ['소재', '소재이름', '소재명', 'creative', '광고소재이름'] },
  // 차원 컬럼 — 단순형
  device:               { label: '기기',        aliases: ['기기', '기기유형', 'device'] },
  age:                  { label: '연령',        aliases: ['연령', '연령대', 'age'] },
  gender:               { label: '성별',        aliases: ['성별', 'gender'] },
  media_group:          { label: '매체 그룹',   aliases: ['매체그룹', '매체 그룹', 'mediagroup'] },
  // 차원 컬럼 — 복합형 (자동 분리됨)
  device_os:            { label: '기기 및 OS',  aliases: ['기기및os', '기기 및 os'] },
  age_gender:           { label: '연령 및 성별', aliases: ['연령및성별', '연령 및 성별'] },
};

// CalculationService.normalizeHeader()와 동일한 로직 유지
function normalize(v: string) {
  return v.toLowerCase().replace(/\s+/g, '').replace(/[_\-]/g, '');
}

interface Props {
  rawHeaders: string[];
}

export const ColumnMappingPreview: React.FC<Props> = ({ rawHeaders }) => {
  const mappingResult = useMemo(() => {
    const normalizedHeaders = rawHeaders.map(h => ({ original: h, norm: normalize(h) }));
    const matched = new Map<string, string>(); // targetField → originalHeader
    const matchedSources = new Set<string>();

    for (const [field, { aliases }] of Object.entries(STANDARD_ALIASES)) {
      const aliasNorms = aliases.map(a => normalize(a));
      // 1) exact match
      for (const h of normalizedHeaders) {
        if (matchedSources.has(h.original)) continue;
        if (aliasNorms.includes(h.norm)) {
          matched.set(field, h.original);
          matchedSources.add(h.original);
          break;
        }
      }
      // 2) contains match
      if (!matched.has(field)) {
        for (const h of normalizedHeaders) {
          if (matchedSources.has(h.original)) continue;
          if (aliasNorms.some(a => h.norm.includes(a) || a.includes(h.norm))) {
            matched.set(field, h.original);
            matchedSources.add(h.original);
            break;
          }
        }
      }
    }

    const unmapped = rawHeaders.filter(h => !matchedSources.has(h));
    const required = ['date_raw', 'impressions', 'clicks', 'supply_value'];

    return { matched, unmapped, required };
  }, [rawHeaders]);

  const { matched, unmapped, required } = mappingResult;
  const missingRequired = required.filter(f => !matched.has(f));

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-slate-700 uppercase tracking-widest">컬럼 매핑 결과</span>
          <span className="text-xs font-bold text-slate-400">
            {matched.size}/{Object.keys(STANDARD_ALIASES).length} 인식됨
          </span>
        </div>
        {missingRequired.length > 0 ? (
          <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600 bg-orange-50 border border-orange-100 px-3 py-1 rounded-lg">
            <AlertCircle size={12} />
            필수 컬럼 {missingRequired.length}개 미인식
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 border border-green-100 px-3 py-1 rounded-lg">
            <CheckCircle2 size={12} />
            필수 컬럼 모두 인식됨
          </div>
        )}
      </div>

      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 매핑된 표준 컬럼 */}
        {Object.entries(STANDARD_ALIASES).map(([field, { label }]) => {
          const originalCol = matched.get(field);
          const isRequired = required.includes(field);
          return (
            <div
              key={field}
              className={cn(
                'rounded-xl p-3 border text-xs',
                originalCol
                  ? 'bg-white border-green-200'
                  : isRequired
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-slate-50 border-dashed border-slate-200'
              )}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                {originalCol ? (
                  <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                ) : isRequired ? (
                  <AlertCircle size={12} className="text-orange-400 shrink-0" />
                ) : (
                  <HelpCircle size={12} className="text-slate-300 shrink-0" />
                )}
                <span className={cn(
                  'font-black uppercase tracking-tight',
                  originalCol ? 'text-slate-700' : isRequired ? 'text-orange-600' : 'text-slate-400'
                )}>
                  {label}
                  {isRequired && <span className="text-orange-400 ml-0.5">*</span>}
                </span>
              </div>
              {originalCol ? (
                <div className="font-bold text-slate-500 truncate" title={originalCol}>
                  &quot;{originalCol}&quot;
                </div>
              ) : (
                <div className="text-slate-300 italic">미인식</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 미매핑 컬럼 */}
      {unmapped.length > 0 && (
        <div className="px-6 pb-5">
          <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
            기타 컬럼 ({unmapped.length}개 — 원본 그대로 보존)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unmapped.map(h => (
              <span key={h} className="text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg truncate max-w-[160px]" title={h}>
                {h}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
