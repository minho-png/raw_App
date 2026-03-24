"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt,
  Search,
  RefreshCcw,
  Download,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from '@/lib/utils';
import { getAllCampaignsMonthlySettlement } from '@/server/actions/settlement';
import { AllCampaignsSettlementResult, AllCampaignsSettlementRow } from '@/types';
import { calcDmpFee, formatFeeRate } from '@/lib/dmpFeeRates';

type SortKey = 'campaign_name' | 'dmp_type' | 'total_execution' | 'total_net' | 'fee_amount' | 'total_impressions' | 'total_clicks';
type SortDir = 'asc' | 'desc';

const DMP_TYPES = ['전체', 'SKP', 'KB', 'LOTTE', 'TG360', 'BC', 'SH', 'WIFI', 'DIRECT', '미분류'];

export const SettlementTable: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString());
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<AllCampaignsSettlementResult | null>(null);
  const [search, setSearch] = useState('');
  const [dmpFilter, setDmpFilter] = useState('전체');
  const [sortKey, setSortKey] = useState<SortKey>('total_execution');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAllCampaignsMonthlySettlement(parseInt(year), parseInt(month));
      if ('error' in result) {
        console.error(result.error);
        setData(null);
      } else {
        setData(result);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filteredRows = useMemo(() => {
    if (!data) return [];
    let rows = data.rows;
    if (dmpFilter !== '전체') rows = rows.filter(r => r.dmp_type === dmpFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r =>
        r.campaign_name.toLowerCase().includes(q) ||
        r.dmp_type.toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, dmpFilter, search, sortKey, sortDir]);

  const filteredTotals = useMemo(() => ({
    execution: filteredRows.reduce((s, r) => s + r.total_execution, 0),
    net: filteredRows.reduce((s, r) => s + r.total_net, 0),
    fee: filteredRows.reduce((s, r) => s + r.fee_amount, 0),
    impressions: filteredRows.reduce((s, r) => s + r.total_impressions, 0),
    clicks: filteredRows.reduce((s, r) => s + r.total_clicks, 0),
  }), [filteredRows]);

  const handleExportCSV = () => {
    if (!filteredRows.length) return;
    const BOM = '\uFEFF';
    const headers = ['캠페인명', 'DMP 종류', '총 집행액(Gross)', '매체 순액(Net)', 'DMP 수수료', '노출', '클릭', '데이터 건수'];
    const rows = filteredRows.map(r => [
      r.campaign_name,
      r.dmp_type,
      r.total_execution,
      r.total_net,
      r.fee_amount,
      r.total_impressions,
      r.total_clicks,
      r.row_count,
    ].join(','));
    const csv = BOM + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DMP_정산_${year}년_${month}월.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronUp size={12} className="text-slate-300 ml-1" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-blue-500 ml-1" />
      : <ChevronDown size={12} className="text-blue-500 ml-1" />;
  };

  const SortableHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={cn("cursor-pointer select-none hover:text-blue-600 transition-colors font-bold text-slate-900", className)}
      onClick={() => handleSort(k)}
    >
      <span className="inline-flex items-center">
        {children}
        <SortIcon k={k} />
      </span>
    </TableHead>
  );

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <Receipt className="text-indigo-500" size={24} />
            DMP 월별 정산 테이블
          </h1>
          <p className="text-sm text-slate-500 mt-1">전체 캠페인의 DMP 정산 데이터를 월별로 조회합니다.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28 rounded-xl bg-white border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['2024', '2025', '2026'].map(y => <SelectItem key={y} value={y}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-24 rounded-xl bg-white border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>{i + 1}월</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={fetchData}
            disabled={isLoading}
            className="rounded-xl bg-white border-slate-200 hover:bg-slate-50"
          >
            <RefreshCcw size={15} className={cn(isLoading && "animate-spin")} />
          </Button>

          <Button
            onClick={handleExportCSV}
            disabled={!filteredRows.length}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 shadow-lg shadow-indigo-500/20"
          >
            <Download size={14} className="mr-2" /> CSV 내보내기
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {data && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          {[
            { label: '총 집행액 (Gross)', value: filteredTotals.execution, color: 'text-slate-800' },
            { label: '매체 순액 (Net)', value: filteredTotals.net, color: 'text-indigo-600' },
            { label: 'DMP 수수료', value: filteredTotals.fee, color: 'text-purple-600' },
          ].map(card => (
            <Card key={card.label} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{card.label}</p>
                <p className={cn("text-xl font-black", card.color)}>&#8361;{card.value.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{filteredRows.length}개 행 기준</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Filters */}
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="캠페인명 또는 DMP 종류로 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 rounded-xl bg-slate-50 border-slate-200 text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {DMP_TYPES.map(dmp => (
              <button
                key={dmp}
                onClick={() => setDmpFilter(dmp)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-bold transition-all",
                  dmpFilter === dmp
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                {dmp}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="p-20 flex flex-col items-center justify-center space-y-3">
              <RefreshCcw size={36} className="text-indigo-400 animate-spin" />
              <p className="text-slate-400 text-sm font-medium">MongoDB 집계 엔진 가동 중...</p>
            </motion.div>
          ) : filteredRows.length > 0 ? (
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow className="hover:bg-transparent border-b border-slate-100">
                      <SortableHead k="campaign_name" className="px-6 min-w-[180px]">캠페인명</SortableHead>
                      <SortableHead k="dmp_type" className="min-w-[100px]">DMP 종류</SortableHead>
                      <SortableHead k="total_execution" className="text-right min-w-[140px]">집행액 (Gross)</SortableHead>
                      <SortableHead k="total_net" className="text-right min-w-[130px]">순액 (Net)</SortableHead>
                      <SortableHead k="fee_amount" className="text-right min-w-[120px]">매체 수수료</SortableHead>
                      <TableHead className="text-right font-bold text-slate-900 min-w-[70px]">DMP 요율</TableHead>
                      <TableHead className="text-right font-bold text-slate-900 min-w-[120px]">DMP 수수료</TableHead>
                      <SortableHead k="total_impressions" className="text-right min-w-[80px]">노출</SortableHead>
                      <SortableHead k="total_clicks" className="text-right min-w-[70px]">클릭</SortableHead>
                      <TableHead className="text-center min-w-[60px] font-bold text-slate-900">건수</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row, idx) => (
                      <TableRow key={`${row.campaign_id}-${row.dmp_type}-${idx}`}
                        className="hover:bg-slate-50/60 transition-colors group border-b border-slate-50">
                        <TableCell className="px-6 font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors max-w-[220px]">
                          <span className="truncate block">{row.campaign_name}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            "font-bold text-xs",
                            row.dmp_type === 'DIRECT' || row.dmp_type === '미분류'
                              ? "border-slate-200 text-slate-400"
                              : "border-indigo-200 text-indigo-700 bg-indigo-50"
                          )}>
                            {row.dmp_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-700">
                          &#8361;{row.total_execution.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-bold text-indigo-600">
                          &#8361;{row.total_net.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-bold text-purple-600">
                          &#8361;{row.fee_amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-slate-400 font-mono text-xs">{formatFeeRate(row.dmp_type)}</TableCell>
                        <TableCell className="text-right font-bold text-orange-600">
                          {calcDmpFee(row.dmp_type, row.total_net) > 0 ? `₩${calcDmpFee(row.dmp_type, row.total_net).toLocaleString()}` : '—'}
                        </TableCell>
                        <TableCell className="text-right text-slate-500 font-mono text-xs">
                          {row.total_impressions.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-slate-500 font-mono text-xs">
                          {row.total_clicks.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center text-slate-400 font-mono text-xs">
                          {row.row_count}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="bg-slate-50/80 border-t-2 border-slate-200 font-black">
                      <TableCell className="px-6 text-slate-600 font-black">합계</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-slate-300 text-slate-500 text-xs">
                          {filteredRows.length}행
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-800">&#8361;{filteredTotals.execution.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-black text-indigo-700">&#8361;{filteredTotals.net.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-black text-purple-700">&#8361;{filteredTotals.fee.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-slate-400 text-xs">—</TableCell>
                      <TableCell className="text-right font-black text-orange-700">
                        &#8361;{filteredRows.reduce((s, r) => s + calcDmpFee(r.dmp_type, r.total_net), 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-600 font-mono text-xs">{filteredTotals.impressions.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-black text-slate-600 font-mono text-xs">{filteredTotals.clicks.toLocaleString()}</TableCell>
                      <TableCell className="text-center text-slate-400 font-mono text-xs">—</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="p-28 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                <TrendingDown size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">해당 월의 DMP 데이터가 없습니다</h3>
                <p className="text-slate-400 text-sm max-w-xs mx-auto mt-1">
                  CSV를 업로드하여 데이터를 쌓은 후 다시 조회하세요.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
};
