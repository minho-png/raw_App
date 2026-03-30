"use client";

import React, { useMemo } from 'react';
import { Layout as LayoutIcon } from 'lucide-react';
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

interface CreativeBlockProps {
  filteredData: PerformanceRecord[];
}

export const CreativeBlock: React.FC<CreativeBlockProps> = ({ filteredData }) => {
  const creativeData = useMemo(() => {
    const data = filteredData.reduce(
      (acc: Record<string, { name: string; spend: number; clicks: number; imps: number }>, curr) => {
        const c = curr.creative_name || 'N/A';
        if (!acc[c]) acc[c] = { name: c, spend: 0, clicks: 0, imps: 0 };
        acc[c].spend += (Number(curr.execution_amount) || 0);
        acc[c].clicks += (Number(curr.clicks) || 0);
        acc[c].imps += (Number(curr.impressions) || 0);
        return acc;
      },
      {}
    );
    return Object.values(data)
      .map((v) => ({
        ...v,
        ctr: v.imps > 0 ? (v.clicks / v.imps) * 100 : 0,
        cpc: v.clicks > 0 ? Math.round(v.spend / v.clicks) : 0,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);
  }, [filteredData]);

  const titleIcon = <LayoutIcon size={24} className="text-blue-600" />;

  return (
    <SectionCard title="TOP 10 Creative Impact" titleIcon={titleIcon}>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={creativeData} layout="vertical">
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={true}
              vertical={false}
              stroke="#f1f5f9"
            />
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              width={120}
              tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip />
            <Bar dataKey="spend" name="Investment" fill="#2563eb" radius={[0, 6, 6, 0]} barSize={16} />
            <Line dataKey="ctr" name="CTR Performance" stroke="#0f172a" strokeWidth={3} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
};
