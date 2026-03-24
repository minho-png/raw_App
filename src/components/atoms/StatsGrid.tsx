"use client";

import React from 'react';
import { cn } from '@/lib/utils';

export interface StatItem {
  label: string;
  value: string;
  unit?: string;
  colorClass?: string;
}

interface StatsGridProps {
  items: StatItem[];
  columns?: 2 | 3 | 4;
  className?: string;
}

const columnsMap = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
} as const;

export const StatsGrid: React.FC<StatsGridProps> = ({
  items,
  columns = 4,
  className,
}) => {
  return (
    <div className={cn('grid gap-4', columnsMap[columns], className)}>
      {items.map((item) => (
        <div key={item.label} className="bg-slate-50 rounded-2xl p-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            {item.label}
          </p>
          <p className={cn('text-lg font-black', item.colorClass ?? 'text-slate-800')}>
            {item.value}
            {item.unit && (
              <span className="text-sm ml-0.5">{item.unit}</span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
};
