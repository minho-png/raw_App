"use client";

import React from 'react';
import { SectionCard } from '@/components/atoms/SectionCard';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface BudgetProgressItem {
  id: string;
  name: string;
  budget: number;
  spent: number;
  percent: number;
}

interface BudgetBlockProps {
  items: BudgetProgressItem[];
}

export const BudgetBlock: React.FC<BudgetBlockProps> = ({ items }) => {
  if (items.length === 0) return null;

  return (
    <SectionCard title="Strategic Budget Alignment">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {items.map((item) => (
          <div
            key={item.id}
            className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex justify-between items-end">
              <span className="text-sm font-black text-slate-900 uppercase truncate max-w-[200px]">
                {item.name}
              </span>
              <span
                className={cn(
                  'text-xs font-black px-2 py-1 rounded-lg',
                  item.percent > 90
                    ? 'text-red-600 bg-red-50'
                    : 'text-blue-600 bg-blue-50'
                )}
              >
                {item.percent.toFixed(1)}%
              </span>
            </div>
            <Progress
              value={item.percent}
              className="h-2.5 bg-slate-100/50"
              indicatorClassName={item.percent > 90 ? 'bg-red-500' : 'bg-blue-600'}
            />
            <div className="flex justify-between text-[11px] font-black text-slate-400 font-outfit tracking-tighter">
              <span className="text-slate-900">₩{Math.round(item.spent).toLocaleString()}</span>
              <span>OF ₩{Math.round(item.budget).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
};
