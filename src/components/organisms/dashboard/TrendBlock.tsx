"use client";

import React, { useMemo } from 'react';
import { SectionCard } from '@/components/atoms/SectionCard';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { PerformanceRecord } from '@/types';

interface TrendBlockProps {
  filteredData: PerformanceRecord[];
}

export const TrendBlock: React.FC<TrendBlockProps> = ({ filteredData }) => {
  const dailyTrendData = useMemo(() => {
    // Key by ISO date string (YYYY-MM-DD) to avoid locale-dependent sort issues
    const grouped = filteredData.reduce((acc: Record<string, { date: string; execution_amount: number; clicks: number; impressions: number }>, curr) => {
      const d = new Date(curr.date);
      const iso = isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
      if (!iso) return acc;
      if (!acc[iso]) {
        acc[iso] = { date: iso, execution_amount: 0, clicks: 0, impressions: 0 };
      }
      acc[iso].execution_amount += (Number(curr.execution_amount) || 0);
      acc[iso].clicks += (Number(curr.clicks) || 0);
      acc[iso].impressions += (Number(curr.impressions) || 0);
      return acc;
    }, {});

    return Object.values(grouped)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((v) => ({
        ...v,
        actual_cpc: v.clicks > 0 ? Math.round(v.execution_amount / v.clicks) : 0,
        ctr: v.impressions > 0 ? ((v.clicks / v.impressions) * 100).toFixed(2) : '0.00',
      }));
  }, [filteredData]);

  const actions = (
    <>
      <span className="flex items-center gap-1.5 text-xs font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">
        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" /> 지출액
      </span>
      <span className="flex items-center gap-1.5 text-xs font-black text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
        CPC 추이
      </span>
    </>
  );

  return (
    <SectionCard title="집행 속도 및 효율성 트렌드" actions={actions}>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={dailyTrendData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.08)',
                fontWeight: 800,
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="execution_amount"
              name="Daily Spend"
              fill="#2563eb"
              radius={[6, 6, 0, 0]}
              barSize={32}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="actual_cpc"
              name="Actual CPC"
              stroke="#0f172a"
              strokeWidth={3}
              dot={{ r: 5, fill: '#fff', stroke: '#0f172a', strokeWidth: 2 }}
              activeDot={{ r: 7, strokeWidth: 0 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
};
