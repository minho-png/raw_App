"use client";

import React, { useMemo } from 'react';
import { BarChart4 } from 'lucide-react';
import { SectionCard } from '@/components/atoms/SectionCard';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { PerformanceRecord, SubCampaignConfig } from '@/types';
import type { BudgetProgressItem } from './BudgetBlock';

interface MatrixBlockProps {
  subCampaigns: SubCampaignConfig[];
  filteredData: PerformanceRecord[];
  budgetProgressData: BudgetProgressItem[];
}

export const MatrixBlock: React.FC<MatrixBlockProps> = ({
  subCampaigns,
  filteredData,
  budgetProgressData,
}) => {
  // Per-sub-campaign aggregation — computed here so MatrixBlock is self-contained
  const subMetrics = useMemo(() => {
    return subCampaigns.map((sub) => {
      // mapping_value 우선, excel_name은 deprecated fallback (CLAUDE.md 기준)
      const mKey = sub.mapping_value || sub.excel_name;
      const subData = filteredData.filter((d) =>
        mKey
          ? d.excel_campaign_name === mKey || d.mapping_value === mKey
          : d.media === sub.media
      );
      const subSpent = subData.reduce((s, d) => s + (Number(d.execution_amount) || 0), 0);
      const subClicks = subData.reduce((s, d) => s + (Number(d.clicks) || 0), 0);
      const subImps = subData.reduce((s, d) => s + (Number(d.impressions) || 0), 0);
      const actualCpc = subClicks > 0 ? subSpent / subClicks : 0;
      const actualCtr = subImps > 0 ? (subClicks / subImps) * 100 : 0;
      const cpcStatus = sub.target_cpc
        ? actualCpc <= sub.target_cpc
          ? 'Good'
          : 'High'
        : 'N/A';
      const progress = budgetProgressData.find((p) => p.id === sub.id);

      return {
        sub,
        mKey,
        subSpent,
        actualCpc,
        actualCtr,
        cpcStatus,
        progress,
      };
    });
  }, [subCampaigns, filteredData, budgetProgressData]);

  const titleIcon = <BarChart4 size={24} className="text-blue-600" />;

  return (
    <SectionCard title="Matrix Comparison Analytics" titleIcon={titleIcon}>
      <div className="overflow-hidden rounded-[32px] border border-slate-200">
        <Table>
          <TableHeader className="bg-slate-900 border-none">
            <TableRow className="hover:bg-slate-900 border-none">
              <TableHead className="text-slate-400 font-black text-[10px] uppercase tracking-widest py-6 px-8">
                Vertical Solution
              </TableHead>
              <TableHead className="text-right text-slate-400 font-black text-[10px] uppercase tracking-widest py-6 px-8">
                Budget Fulfillment
              </TableHead>
              <TableHead className="text-right text-slate-400 font-black text-[10px] uppercase tracking-widest py-6 px-8">
                CPM/CPC Efficiency
              </TableHead>
              <TableHead className="text-right text-slate-400 font-black text-[10px] uppercase tracking-widest py-6 px-8">
                Interaction rate
              </TableHead>
              <TableHead className="text-center text-slate-400 font-black text-[10px] uppercase tracking-widest py-6 px-8">
                Fulfillment Level
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subMetrics.map(({ sub, mKey, subSpent, actualCpc, actualCtr, cpcStatus, progress }) => (
              <TableRow
                key={sub.id}
                className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 last:border-none"
              >
                <TableCell className="py-6 px-8 font-black text-slate-900">
                  {mKey || sub.media}
                </TableCell>
                <TableCell className="py-6 px-8 text-right">
                  <span className="text-slate-900 font-black block leading-none">
                    ₩{Math.round(subSpent).toLocaleString()}
                  </span>
                  <span className="text-slate-400 text-[10px] font-bold uppercase mt-1 block">
                    TARGET ₩{sub.budget?.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell className="py-6 px-8 text-right">
                  <span
                    className={cn(
                      'font-black block leading-none',
                      cpcStatus === 'Good' ? 'text-green-600' : 'text-orange-600'
                    )}
                  >
                    ₩{Math.round(actualCpc).toLocaleString()}
                  </span>
                  <span className="text-slate-400 text-[10px] font-bold uppercase mt-1 block">
                    GOAL ₩{sub.target_cpc || '-'}
                  </span>
                </TableCell>
                <TableCell className="py-6 px-8 text-right">
                  <span className="text-slate-900 font-black block leading-none">
                    {actualCtr.toFixed(2)}%
                  </span>
                  <span className="text-slate-400 text-[10px] font-bold uppercase mt-1 block">
                    GOAL {sub.target_ctr || '-'}%
                  </span>
                </TableCell>
                <TableCell className="py-6 px-8 text-center">
                  <Badge
                    className={cn(
                      'font-black px-3 py-1 rounded-lg border-none shadow-sm',
                      progress && progress.percent > 90
                        ? 'bg-red-50 text-red-600'
                        : 'bg-blue-600 text-white'
                    )}
                  >
                    {progress ? `${progress.percent.toFixed(0)}% PACING` : 'N/A'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
};
