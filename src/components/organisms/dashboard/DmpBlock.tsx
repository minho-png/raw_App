"use client";

import React, { useMemo } from 'react';
import { Receipt } from 'lucide-react';
import { SectionCard } from '@/components/atoms/SectionCard';
import { StatsGrid, StatItem } from '@/components/atoms/StatsGrid';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PerformanceRecord } from '@/types';
import { DMP_FEE_RATES, calcDmpFee, formatFeeRate } from '@/lib/dmpFeeRates';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DmpBlockProps {
  filteredData: PerformanceRecord[];
}

interface DmpAggRow {
  key: string;
  label: string;
  execution: number;
  net: number;
  dmpFee: number;
  impressions: number;
  clicks: number;
  count: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DMP_LABEL: Record<string, string> = {
  SKP: 'SKP',
  KB: 'KB',
  LOTTE: 'LOTTE',
  TG360: 'TG360',
  WIFI: '실내위치 (WIFI)',
  BC: 'BC',
  SH: 'SH',
  DIRECT: '직접 집행',
  'N/A': '직접 집행',
};

const DMP_ORDER = ['SKP', 'KB', 'LOTTE', 'TG360', 'WIFI', 'BC', 'SH', 'DIRECT', 'N/A'];

const KEYWORD_HINT: Record<string, string> = {
  SKP: 'SKP',
  KB: 'KB',
  LOTTE: 'LOTTE',
  TG360: 'TG360',
  WIFI: 'WIFI, 실내위치',
  BC: 'BC',
  SH: 'SH',
  DIRECT: '—',
};

// ─── Component ────────────────────────────────────────────────────────────────

export const DmpBlock: React.FC<DmpBlockProps> = ({ filteredData }) => {
  // Plain-JS Map aggregation — no Danfo (Vercel/serverless safe)
  const { allDmpRows, totalExecution, totalNet, dmpOnlyCount } = useMemo(() => {
    const dmpMap = new Map<string, Omit<DmpAggRow, 'key' | 'label'>>();

    filteredData.forEach(r => {
      const key = r.dmp_type || 'DIRECT';
      const prev = dmpMap.get(key) ?? {
        execution: 0,
        net: 0,
        dmpFee: 0,
        impressions: 0,
        clicks: 0,
        count: 0,
      };
      const netVal = r.net_amount || 0;
      dmpMap.set(key, {
        execution: prev.execution + (r.execution_amount || 0),
        net: prev.net + netVal,
        dmpFee: prev.dmpFee + calcDmpFee(key, netVal),
        impressions: prev.impressions + (r.impressions || 0),
        clicks: prev.clicks + (r.clicks || 0),
        count: prev.count + 1,
      });
    });

    const ordered: DmpAggRow[] = DMP_ORDER
      .filter(k => dmpMap.has(k))
      .map(k => ({ key: k, label: DMP_LABEL[k] ?? k, ...dmpMap.get(k)! }));

    // Merge DIRECT + N/A into one display row
    const directRow = ordered
      .filter(r => r.key === 'DIRECT' || r.key === 'N/A')
      .reduce<DmpAggRow | null>((acc, r) => {
        if (!acc) return { ...r, key: 'DIRECT', label: '직접 집행' };
        return {
          ...acc,
          execution: acc.execution + r.execution,
          net: acc.net + r.net,
          dmpFee: acc.dmpFee + r.dmpFee,
          impressions: acc.impressions + r.impressions,
          clicks: acc.clicks + r.clicks,
          count: acc.count + r.count,
        };
      }, null);

    const dmpOnlyRows = ordered.filter(r => r.key !== 'DIRECT' && r.key !== 'N/A');
    const allRows = directRow ? [...dmpOnlyRows, directRow] : dmpOnlyRows;

    const totExec = allRows.reduce((s, r) => s + r.execution, 0);
    const totNet = allRows.reduce((s, r) => s + r.net, 0);

    return {
      allDmpRows: allRows,
      totalExecution: totExec,
      totalNet: totNet,
      dmpOnlyCount: dmpOnlyRows.length,
    };
  }, [filteredData]);

  const totalFee = useMemo(
    () => allDmpRows.reduce((s, r) => s + r.dmpFee, 0),
    [allDmpRows]
  );

  if (allDmpRows.length === 0) return null;

  const summaryStats: StatItem[] = [
    {
      label: 'DMP 종류',
      value: String(dmpOnlyCount),
      unit: '개',
      colorClass: 'text-indigo-600',
    },
    {
      label: '총 집행액',
      value: `₩${totalExecution.toLocaleString('ko-KR')}`,
      colorClass: 'text-slate-800',
    },
    {
      label: '매체 순액',
      value: `₩${totalNet.toLocaleString('ko-KR')}`,
      colorClass: 'text-blue-600',
    },
    {
      label: 'DMP 수수료',
      value: `₩${totalFee.toLocaleString('ko-KR')}`,
      colorClass: 'text-orange-600',
    },
  ];

  return (
    <SectionCard
      title="DMP 집행 분석"
      titleIcon={
        <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
          <Receipt size={20} />
        </div>
      }
      actions={
        <p className="text-xs text-slate-400 font-medium">
          광고 그룹명 키워드 기반 자동 분류 · WIFI = 실내위치
        </p>
      }
    >
      <StatsGrid items={summaryStats} columns={4} className="mb-8" />

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <Table>
          <TableHeader className="bg-slate-50/80">
            <TableRow className="hover:bg-transparent border-b border-slate-100">
              <TableHead className="px-6 font-black text-slate-700 min-w-[160px]">DMP 종류</TableHead>
              <TableHead className="font-black text-slate-700 min-w-[120px] text-xs">감지 키워드</TableHead>
              <TableHead className="text-right font-black text-slate-700 min-w-[140px]">집행액 (Gross)</TableHead>
              <TableHead className="text-right font-black text-slate-700 min-w-[130px]">순액 (Net)</TableHead>
              <TableHead className="text-right font-black text-slate-700 min-w-[70px]">요율</TableHead>
              <TableHead className="text-right font-black text-slate-700 min-w-[120px]">DMP 수수료</TableHead>
              <TableHead className="text-right font-black text-slate-700 min-w-[80px]">노출</TableHead>
              <TableHead className="text-right font-black text-slate-700 min-w-[70px]">클릭</TableHead>
              <TableHead className="text-center font-black text-slate-700 min-w-[60px]">건수</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allDmpRows.map(row => {
              const isDirect = row.key === 'DIRECT' || row.key === 'N/A';
              return (
                <TableRow
                  key={row.key}
                  className={cn(
                    'hover:bg-slate-50/60 transition-colors border-b border-slate-50',
                    isDirect && 'opacity-60'
                  )}
                >
                  <TableCell className="px-6 font-bold text-slate-700">
                    {isDirect ? (
                      <span className="text-slate-400">{row.label}</span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                        {row.label}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-400 font-mono">
                    {KEYWORD_HINT[row.key] ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-700">
                    ₩{row.execution.toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell className="text-right font-bold text-blue-600">
                    ₩{row.net.toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell className="text-right text-slate-400 font-mono text-xs">
                    {formatFeeRate(row.key)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-orange-600">
                    {row.dmpFee > 0 ? `₩${row.dmpFee.toLocaleString('ko-KR')}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-slate-500 font-mono text-xs">
                    {row.impressions.toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell className="text-right text-slate-500 font-mono text-xs">
                    {row.clicks.toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell className="text-center text-slate-400 font-mono text-xs">
                    {row.count}
                  </TableCell>
                </TableRow>
              );
            })}

            {/* 합계 row */}
            <TableRow className="bg-slate-50 border-t-2 border-slate-200 font-black">
              <TableCell className="px-6 font-black text-slate-700">합계</TableCell>
              <TableCell />
              <TableCell className="text-right font-black text-slate-800">
                ₩{totalExecution.toLocaleString('ko-KR')}
              </TableCell>
              <TableCell className="text-right font-black text-blue-700">
                ₩{totalNet.toLocaleString('ko-KR')}
              </TableCell>
              <TableCell className="text-right text-slate-400 text-xs">—</TableCell>
              <TableCell className="text-right font-black text-orange-700">
                ₩{totalFee.toLocaleString('ko-KR')}
              </TableCell>
              <TableCell className="text-right font-black text-slate-600 font-mono text-xs">
                {allDmpRows.reduce((s, r) => s + r.impressions, 0).toLocaleString('ko-KR')}
              </TableCell>
              <TableCell className="text-right font-black text-slate-600 font-mono text-xs">
                {allDmpRows.reduce((s, r) => s + r.clicks, 0).toLocaleString('ko-KR')}
              </TableCell>
              <TableCell className="text-center text-slate-400 font-mono text-xs">
                {allDmpRows.reduce((s, r) => s + r.count, 0)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
};
