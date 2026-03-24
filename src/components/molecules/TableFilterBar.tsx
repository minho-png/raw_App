"use client";

import React from 'react';
import { Search, X, RotateCcw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TableFilterBarProps {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  filterMedia: string;
  onMediaChange: (v: string) => void;
  filterDmp: string;
  onDmpChange: (v: string) => void;
  mediaOptions: string[];
  dmpOptions: string[];
  totalCount: number;
  filteredCount: number;
  onReset: () => void;
}

const MEDIA_LABEL: Record<string, string> = {
  all: '매체 전체',
};

const DMP_LABEL: Record<string, string> = {
  all: 'DMP 전체',
  DIRECT: 'DIRECT',
};

function mediaLabel(v: string): string {
  return MEDIA_LABEL[v] ?? v;
}

function dmpLabel(v: string): string {
  return DMP_LABEL[v] ?? v;
}

export const TableFilterBar: React.FC<TableFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  filterMedia,
  onMediaChange,
  filterDmp,
  onDmpChange,
  mediaOptions,
  dmpOptions,
  totalCount,
  filteredCount,
  onReset,
}) => {
  const isFiltered =
    searchQuery !== '' || filterMedia !== 'all' || filterDmp !== 'all';

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200 px-8 py-4 shadow-sm">
      <div className="flex items-center gap-4 flex-wrap">
        {/* 텍스트 검색 */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="검색어 초기화"
            >
              <X size={14} />
            </button>
          )}
          <Input
            placeholder="광고그룹명 또는 캠페인명 검색"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-9 h-10 rounded-xl border-slate-200 bg-slate-50 text-sm font-medium focus:bg-white transition-colors"
          />
        </div>

        {/* 매체 필터 */}
        <Select value={filterMedia} onValueChange={onMediaChange}>
          <SelectTrigger className="w-[160px] h-10 rounded-xl border-slate-200 bg-slate-50 text-sm font-bold focus:ring-blue-500">
            <SelectValue placeholder="매체 전체" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-slate-100 shadow-2xl">
            {mediaOptions.map((opt) => (
              <SelectItem key={opt} value={opt} className="rounded-lg font-bold text-slate-700">
                {mediaLabel(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* DMP 필터 — 민수 필수 요청 */}
        <Select value={filterDmp} onValueChange={onDmpChange}>
          <SelectTrigger className="w-[160px] h-10 rounded-xl border-slate-200 bg-slate-50 text-sm font-bold focus:ring-blue-500">
            <SelectValue placeholder="DMP 전체" />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-slate-100 shadow-2xl">
            {dmpOptions.map((opt) => (
              <SelectItem key={opt} value={opt} className="rounded-lg font-bold text-slate-700">
                {dmpLabel(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 결과 카운트 */}
        <div className="flex items-center gap-3 ml-auto">
          <span
            className={cn(
              'text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-xl',
              isFiltered
                ? 'text-blue-700 bg-blue-50 border border-blue-200'
                : 'text-slate-400 bg-slate-50 border border-slate-200'
            )}
          >
            {filteredCount.toLocaleString('ko-KR')} / {totalCount.toLocaleString('ko-KR')}건
          </span>

          {isFiltered && (
            <Button
              size="sm"
              variant="outline"
              onClick={onReset}
              className="h-8 px-3 rounded-xl border-slate-200 text-xs font-black text-slate-500 hover:text-slate-800 hover:border-slate-300 flex items-center gap-1.5 transition-all"
            >
              <RotateCcw size={12} />
              초기화
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
