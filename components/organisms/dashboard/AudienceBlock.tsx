"use client";

import React, { useMemo } from 'react';
import { Users } from 'lucide-react';
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

interface AudienceBlockProps {
  filteredData: PerformanceRecord[];
}

const AGE_COLORS = ['#2563eb', '#60a5fa', '#93c5fd', '#bfdbfe'] as const;
const GENDER_COLORS = ['#0f172a', '#2563eb', '#94a3b8'] as const;

export const AudienceBlock: React.FC<AudienceBlockProps> = ({ filteredData }) => {
  const ageData = useMemo(() => {
    const counts = filteredData.reduce((acc: Record<string, number>, curr) => {
      const age = curr.age || 'Unknown';
      acc[age] = (acc[age] || 0) + (Number(curr.execution_amount) || 0);
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }, [filteredData]);

  const genderData = useMemo(() => {
    const counts = filteredData.reduce((acc: Record<string, number>, curr) => {
      const g = curr.gender || 'Unknown';
      acc[g] = (acc[g] || 0) + (Number(curr.execution_amount) || 0);
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }, [filteredData]);

  const titleIcon = <Users size={24} className="text-blue-600" />;

  return (
    <SectionCard title="Audience Intelligence" titleIcon={titleIcon}>
      <div className="grid grid-cols-2 gap-8 h-[300px]">
        <div className="flex flex-col">
          <p className="text-[10px] font-black text-center text-slate-400 uppercase tracking-widest mb-4">
            Age Lifecycle
          </p>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={ageData}
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                nameKey="name"
                stroke="none"
              >
                {ageData.map((_, i) => (
                  <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} iconType="rect" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col">
          <p className="text-[10px] font-black text-center text-slate-400 uppercase tracking-widest mb-4">
            Gender Binary
          </p>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={genderData}
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                nameKey="name"
                stroke="none"
              >
                {genderData.map((_, i) => (
                  <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} iconType="rect" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </SectionCard>
  );
};
