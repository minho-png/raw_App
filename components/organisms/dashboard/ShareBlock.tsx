"use client";

import React, { useMemo } from 'react';
import { SectionCard } from '@/components/atoms/SectionCard';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PerformanceRecord } from '@/types';

interface ShareBlockProps {
  filteredData: PerformanceRecord[];
}

const SHARE_COLORS = ['#2563eb', '#0f172a', '#10b981', '#f59e0b', '#94a3b8'] as const;

export const ShareBlock: React.FC<ShareBlockProps> = ({ filteredData }) => {
  const dmpShareData = useMemo(() => {
    const shares = filteredData.reduce((acc: Record<string, number>, curr) => {
      const dmp = curr.dmp_type || 'DIRECT';
      acc[dmp] = (acc[dmp] || 0) + (Number(curr.execution_amount) || 0);
      return acc;
    }, {});

    return Object.entries(shares)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  return (
    <SectionCard title="매체별 점유율">
      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dmpShareData}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={110}
              paddingAngle={8}
              dataKey="value"
              nameKey="name"
              stroke="none"
            >
              {dmpShareData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={SHARE_COLORS[index % SHARE_COLORS.length]}
                  className="hover:opacity-80 transition-opacity outline-none"
                />
              ))}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ paddingTop: '32px' }} iconType="circle" />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
};
