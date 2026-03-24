"use client";

import React from 'react';
import { Edit3, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PerformanceRecord } from '@/types';

interface DataTableProps {
  data: PerformanceRecord[];
  editingCell: { id: string; value: number } | null;
  onEditStart: (id: string, value: number) => void;
  onEditChange: (id: string, value: number) => void;
  onEditConfirm: (id: string, value: number) => void;
  onEditCancel: () => void;
  isUpdating: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const DataTable: React.FC<DataTableProps> = ({
  data,
  editingCell,
  onEditChange,
  onEditConfirm,
  onEditCancel,
  isUpdating,
  page,
  pageSize,
  onPageChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = data.slice(safePage * pageSize, (safePage + 1) * pageSize);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center bg-white">
        <p className="text-slate-400 font-bold text-sm">필터 조건에 맞는 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-8 py-4">
      {/* 페이지네이션 헤더 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
          전체 {data.length.toLocaleString('ko-KR')}건 · {safePage + 1}/{totalPages} 페이지
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="w-9 h-9 flex items-center justify-center rounded-xl border-2 border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            aria-label="이전 페이지"
          >
            <ChevronLeft size={16} />
          </button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = Math.max(0, Math.min(totalPages - 5, safePage - 2)) + i;
            return (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={cn(
                  'w-9 h-9 flex items-center justify-center rounded-xl text-xs font-black transition-all border-2',
                  p === safePage
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600'
                )}
              >
                {p + 1}
              </button>
            );
          })}

          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage >= totalPages - 1}
            className="w-9 h-9 flex items-center justify-center rounded-xl border-2 border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            aria-label="다음 페이지"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-[40px] border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-slate-900 sticky top-[64px] z-20">
            <TableRow className="hover:bg-slate-900 border-none">
              <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-8">
                집행 일자
              </TableHead>
              <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-8">
                소재명
              </TableHead>
              <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-8 text-right">
                노출수
              </TableHead>
              <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-8 text-right">
                클릭수
              </TableHead>
              <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-4 text-right">
                CTR
              </TableHead>
              <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-4 text-right">
                CPC(₩)
              </TableHead>
              <TableHead className="text-blue-400 font-black text-xs uppercase tracking-widest py-6 px-8 text-right bg-slate-800/50">
                집행 금액 (KRW)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((record, idx) => {
              const isEditing = editingCell?.id === record._id;
              const imps = Number(record.impressions) || 0;
              const clicks = Number(record.clicks) || 0;
              const spend = Number(record.execution_amount) || 0;
              const cost = Number(record.cost) || spend;

              return (
                <TableRow
                  key={record._id || `row-${idx}`}
                  className={cn(
                    'transition-colors border-b border-slate-100 last:border-none group',
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                    'hover:bg-blue-50/50'
                  )}
                >
                  <TableCell className="py-6 px-8 font-bold text-slate-500">
                    {formatDate(record.date)}
                  </TableCell>
                  <TableCell className="py-6 px-8 font-black text-slate-900 max-w-[200px] truncate">
                    {record.creative_name || record.ad_group_name || record.excel_campaign_name || '-'}
                  </TableCell>
                  <TableCell className="py-6 px-8 text-right font-bold text-slate-600">
                    {imps.toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell className="py-6 px-8 text-right font-bold text-slate-600">
                    {clicks.toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell className="py-6 px-4 text-right font-bold text-slate-500 text-sm">
                    {imps > 0 ? ((clicks / imps) * 100).toFixed(2) : '0.00'}%
                  </TableCell>
                  <TableCell className="py-6 px-4 text-right font-bold text-slate-500 text-sm">
                    {clicks > 0
                      ? `₩${Math.round(spend / clicks).toLocaleString('ko-KR')}`
                      : '-'}
                  </TableCell>

                  {/* 집행 금액 — 더블클릭 인라인 편집 */}
                  <TableCell className="py-6 px-8 text-right bg-blue-50/30">
                    {isEditing ? (
                      <Input
                        type="number"
                        autoFocus
                        disabled={isUpdating}
                        className="w-32 h-10 text-right font-black border-2 border-blue-500 rounded-xl bg-white shadow-xl"
                        value={editingCell?.value ?? 0}
                        onChange={(e) =>
                          record._id &&
                          onEditChange(record._id, Number(e.target.value))
                        }
                        onBlur={() => {
                          if (editingCell && record._id) {
                            onEditConfirm(record._id, editingCell.value);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editingCell && record._id) {
                            onEditConfirm(record._id, editingCell.value);
                          } else if (e.key === 'Escape') {
                            onEditCancel();
                          }
                        }}
                      />
                    ) : (
                      <div
                        className={cn(
                          'px-4 py-2 rounded-xl transition-all font-black text-lg border-2 border-transparent flex items-center justify-end gap-2',
                          record._id
                            ? 'cursor-pointer hover:bg-blue-600 hover:text-white text-blue-600 hover:border-blue-700'
                            : 'text-slate-400 cursor-not-allowed'
                        )}
                        onDoubleClick={() =>
                          record._id &&
                          onEditChange(record._id, cost)
                        }
                        title={record._id ? '더블클릭하여 수정' : '저장 후 수정 가능'}
                      >
                        <Edit3
                          size={12}
                          className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0"
                        />
                        ₩{Math.round(cost).toLocaleString('ko-KR')}
                      </div>
                    )}
                  </TableCell>

                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
