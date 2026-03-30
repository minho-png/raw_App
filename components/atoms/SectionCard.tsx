"use client";

import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SectionCardProps {
  title: string;
  titleIcon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  titleIcon,
  actions,
  className,
  children,
  dragHandleProps,
}) => {
  return (
    <Card className={cn('bg-white border border-slate-200 shadow-sm rounded-2xl p-10', className)}>
      <div className="flex items-center justify-between mb-10">
        <div {...dragHandleProps}>
          <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase tracking-tight flex items-center gap-3">
            {titleIcon}
            {title}
          </h3>
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {children}
    </Card>
  );
};
