"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Receipt,
  Search,
  RefreshCcw,
  Download,
  TrendingDown,
  Save,
  X,
} from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from '@/lib/utils';
import { getAllCampaignsMonthlySettlement } from '@/server/actions/settlement';
import { AllCampaignsSettlementResult } from '@/types';
import { calcDmpFee, formatFeeRate } from '@/lib/dmpFeeRates';
import { useToast } from '@/context/ToastContext';

const DMP_ORDER = ['SKP', 'KB', 'LOTTE', 'TG360', 'BC', 'SH', 'WIFI', 'DIRECT', '미분류'] as const;
type DmpType = typeof DMP_ORDER[number];

type DmpCell = {
  net: number;
  fee: number;
  dmpFee: number;
  impressions: number;
  clicks: number;
};

type CampaignPivotRow = {
  campaign_id: string;
  campaign_name: string;
  byDmp: Record<string, DmpCell>;
  totalNet: number;
  totalFee: number;
  totalDmpFee: number;
  totalImpressions: number;
  totalClicks: number;
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from(
  { length: CURRENT_YEAR - 2022 + 1 },
  (_, i) => (2022 + i).toString()
);

export const SettlementTable: React.FC = () => {
  const now = new Date();
  const toast = useToast();
  const [year, setYear] = useState(now.getFullYear().toString());
  const [month, setMonth] = useState((now.getMonth() + 1).toString());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [data, setData] = useState<AllCampaignsSettlementResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (y: string, m: string) => {
    setIsLoading(true);
    try {
      const result = await getAllCampaignsMonthlySettlement(parseInt(y), parseInt(m));
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
  }, []);

  // year/month 변경 시 300ms debounce — 연속 변경 시 첫 번째 API 호출 방지
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchData(year, month);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [year, month, fetchData]);

  const handleConfirmSettlement = async () => {
    setIsSaving(true);
    try {
      // TODO: BE 성준 — POST /api/v1/settlements/confirm 구현 후 아래 주석 해제
      // const res = await fetch('/api/v1/settlements/confirm', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ year: parseInt(year), month: parseInt(month) }),
      // });
      // if (!res.ok) throw new Error(await res.text());
      // const json = await res.json();

      // 임시: API 미구현 상태이므로 stub 처리
      await new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('API 미구현 — BE 성준 작업 대기 중')), 200)
      );

      toast.success('정산 확정 완료', `${year}년 ${month}월 정산이 저장되었습니다.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      toast.error('정산 확정 실패', message);
    } finally {
      setIsSaving(false);
    }
  };

  const normalizeDmpType = (dmpType: string | null | undefined): DmpType => {
    if (!dmpType || dmpType === 'N/A') return '미분류';
    if (DMP_ORDER.includes(dmpType as DmpType)) return dmpType as DmpType;
    return '미분류';
  };

  const parseQuery = (query: string) => {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    const campaignFilters: string[] = [];
    const dmpFilters: string[] = [];
    const keywordFilters: string[] = [];

    tokens.forEach(token => {
      const idx = token.indexOf(':');
      if (idx <= 0) {
        keywordFilters.push(token.toLowerCase());
        return;
      }
      const key = token.slice(0, idx).toLowerCase();
      const value = token.slice(idx + 1).toLowerCase();
      if (!value) return;
      if (key === 'campaign' || key === 'camp') campaignFilters.push(value);
      else if (key === 'dmp') dmpFilters.push(value);
      else keywordFilters.push(token.toLowerCase());
    });

    return { campaignFilters, dmpFilters, keywordFilters };
  };

  const dmpColumns = useMemo(() => {
    if (!data) return [...DMP_ORDER];
    const detected = new Set<DmpType>();
    data.rows.forEach(r => detected.add(normalizeDmpType(r.dmp_type)));
    return DMP_ORDER.filter(type => detected.has(type));
  }, [data]);

  const campaignRows = useMemo<CampaignPivotRow[]>(() => {
    if (!data) return [];
    const byCampaign = new Map<string, CampaignPivotRow>();

    data.rows.forEach(row => {
      const dmpType = normalizeDmpType(row.dmp_type);
      const campaignKey = row.campaign_id;
      const existing = byCampaign.get(campaignKey);
      const base = existing ?? {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        byDmp: {},
        totalNet: 0,
        totalFee: 0,
        totalDmpFee: 0,
        totalImpressions: 0,
        totalClicks: 0,
      };

      const prevCell = base.byDmp[dmpType] ?? { net: 0, fee: 0, dmpFee: 0, impressions: 0, clicks: 0 };
      const cellNet = row.total_net || 0;
      const cellFee = row.fee_amount || 0;
      const cellDmpFee = calcDmpFee(dmpType, cellNet);
      const cellImpressions = row.total_impressions || 0;
      const cellClicks = row.total_clicks || 0;

      base.byDmp[dmpType] = {
        net: prevCell.net + cellNet,
        fee: prevCell.fee + cellFee,
        dmpFee: prevCell.dmpFee + cellDmpFee,
        impressions: prevCell.impressions + cellImpressions,
        clicks: prevCell.clicks + cellClicks,
      };
      base.totalNet += cellNet;
      base.totalFee += cellFee;
      base.totalDmpFee += cellDmpFee;
      base.totalImpressions += cellImpressions;
      base.totalClicks += cellClicks;

      byCampaign.set(campaignKey, base);
    });

    const { campaignFilters, dmpFilters, keywordFilters } = parseQuery(searchQuery);

    const filtered = Array.from(byCampaign.values()).filter(row => {
      const campaignNameLower = row.campaign_name.toLowerCase();
      const campaignMatch = campaignFilters.length === 0 || campaignFilters.every(f => campaignNameLower.includes(f));
      if (!campaignMatch) return false;

      const dmpMatch = dmpFilters.length === 0 || dmpFilters.every(f =>
        Object.keys(row.byDmp).some(d => d.toLowerCase().includes(f))
      );
      if (!dmpMatch) return false;

      const keywordMatch = keywordFilters.length === 0 || keywordFilters.every(k =>
        campaignNameLower.includes(k) || Object.keys(row.byDmp).some(d => d.toLowerCase().includes(k))
      );
      if (!keywordMatch) return false;

      return true;
    });

    return filtered.sort((a, b) => b.totalNet - a.totalNet);
  }, [data, searchQuery]);

  const totalsByDmp = useMemo(() => {
    const totals: Record<string, DmpCell> = {};
    dmpColumns.forEach(type => {
      totals[type] = { net: 0, fee: 0, dmpFee: 0, impressions: 0, clicks: 0 };
    });

    campaignRows.forEach(row => {
      dmpColumns.forEach(type => {
        const cell = row.byDmp[type] ?? { net: 0, fee: 0, dmpFee: 0, impressions: 0, clicks: 0 };
        totals[type].net += cell.net;
        totals[type].fee += cell.fee;
        totals[type].dmpFee += cell.dmpFee;
        totals[type].impressions += cell.impressions;
        totals[type].clicks += cell.clicks;
      });
    });

    return totals;
  }, [campaignRows, dmpColumns]);

  const totalNet = useMemo(() => campaignRows.reduce((s, r) => s + r.totalNet, 0), [campaignRows]);
  const totalFee = useMemo(() => campaignRows.reduce((s, r) => s + r.totalFee, 0), [campaignRows]);
  const totalDmpFee = useMemo(() => campaignRows.reduce((s, r) => s + r.totalDmpFee, 0), [campaignRows]);
  const totalImpressions = useMemo(() => campaignRows.reduce((s, r) => s + r.totalImpressions, 0), [campaignRows]);
  const totalClicks = useMemo(() => campaignRows.reduce((s, r) => s + r.totalClicks, 0), [campaignRows]);

  // CSV 셀 포맷: 숫자는 천단위 콤마(ko-KR), 따옴표로 감싸 콤마 구분자 충돌 방지
  const formatCsvNumber = (value: number): string =>
    `"${Math.round(value).toLocaleString('ko-KR')}"`;

  const formatCsvText = (value: string): string =>
    `"${value.replace(/"/g, '""')}"`;

  const calcCtr = (clicks: number, impressions: number): string =>
    impressions > 0 ? (clicks / impressions * 100).toFixed(2) : '0.00';

  const handleExportCSV = () => {
    if (!campaignRows.length) return;
    const BOM = '\uFEFF';
    const headers = [formatCsvText('캠페인명')];
    dmpColumns.forEach(type => {
      headers.push(
        formatCsvText(`${type} NET`),
        formatCsvText(`${type} 노출`),
        formatCsvText(`${type} 클릭`),
        formatCsvText(`${type} CTR(%)`),
        formatCsvText(`${type} DMP수수료`),
      );
    });
    headers.push(
      formatCsvText('캠페인 총 NET'),
      formatCsvText('캠페인 총 노출'),
      formatCsvText('캠페인 총 클릭'),
      formatCsvText('캠페인 총 CTR(%)'),
      formatCsvText('캠페인 총 수수료'),
      formatCsvText('캠페인 총 DMP수수료'),
    );

    const rows = campaignRows.map(row => {
      const rowValues = [formatCsvText(row.campaign_name)];
      dmpColumns.forEach(type => {
        const cell = row.byDmp[type] ?? { net: 0, fee: 0, dmpFee: 0, impressions: 0, clicks: 0 };
        rowValues.push(
          formatCsvNumber(cell.net),
          formatCsvNumber(cell.impressions),
          formatCsvNumber(cell.clicks),
          `"${calcCtr(cell.clicks, cell.impressions)}"`,
          formatCsvNumber(cell.dmpFee),
        );
      });
      rowValues.push(
        formatCsvNumber(row.totalNet),
        formatCsvNumber(row.totalImpressions),
        formatCsvNumber(row.totalClicks),
        `"${calcCtr(row.totalClicks, row.totalImpressions)}"`,
        formatCsvNumber(row.totalFee),
        formatCsvNumber(row.totalDmpFee),
      );
      return rowValues.join(',');
    });

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

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-8 text-slate-800">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-black text-slate-800">
            <Receipt className="text-indigo-500" size={24} />
            DMP 월별 정산 테이블
          </h1>
          <p className="mt-1 text-sm text-slate-500">캠페인 마스터 선택과 무관하게 DB 전체 데이터를 월별로 조회합니다.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28 rounded-xl border-slate-200 bg-white text-slate-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map(y => <SelectItem key={y} value={y}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-24 rounded-xl border-slate-200 bg-white text-slate-800">
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
            onClick={() => fetchData(year, month)}
            disabled={isLoading}
            className="rounded-xl border-slate-200 bg-white hover:bg-slate-50"
          >
            <RefreshCcw size={15} className={cn(isLoading && "animate-spin")} />
          </Button>

          <Button
            onClick={handleExportCSV}
            disabled={!campaignRows.length}
            className="rounded-xl bg-indigo-600 px-5 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-700"
          >
            <Download size={14} className="mr-2" /> CSV 내보내기
          </Button>

          {/* 정산 확정 저장 — BE 성준 /api/v1/settlements/confirm 구현 후 stub 제거 */}
          <Button
            onClick={handleConfirmSettlement}
            disabled={isSaving || !campaignRows.length}
            variant="outline"
            className="rounded-xl border-emerald-500/60 bg-emerald-50 px-5 text-emerald-700 hover:bg-emerald-100"
          >
            <Save size={14} className={cn("mr-2", isSaving && "animate-pulse")} />
            {isSaving ? '저장 중...' : '이 달 정산 확정'}
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
            { label: '총 NET', value: totalNet, color: 'text-indigo-600' },
            { label: '총 수수료', value: totalFee, color: 'text-purple-600' },
            { label: '총 DMP 수수료', value: totalDmpFee, color: 'text-orange-600' },
          ].map(card => (
            <Card key={card.label} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{card.label}</p>
                <p className={cn("text-xl font-black", card.color)}>&#8361;{card.value.toLocaleString()}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{campaignRows.length}개 캠페인 기준</p>
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
              placeholder="검색어 또는 SQL 스타일 (예: campaign:롯데 dmp:SKP)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="rounded-xl border-slate-200 bg-slate-50 pl-8 text-sm text-slate-800 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="p-20 flex flex-col items-center justify-center space-y-3">
              <RefreshCcw size={36} className="text-indigo-400 animate-spin" />
              <p className="text-slate-400 text-sm font-medium">MongoDB 집계 엔진 가동 중...</p>
            </motion.div>
          ) : campaignRows.length > 0 ? (
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="border-b border-slate-200 hover:bg-transparent">
                      <TableHead className="sticky left-0 z-10 min-w-[220px] bg-slate-50 px-6 font-black text-slate-700">
                        캠페인
                      </TableHead>
                      {dmpColumns.map((dmp) => (
                        <TableHead key={dmp} className="min-w-[280px] text-right font-black text-slate-700">
                          {dmp}
                          <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                            NET / 노출 / 클릭 / CTR / DMP 수수료 ({formatFeeRate(dmp)})
                          </span>
                        </TableHead>
                      ))}
                      <TableHead className="min-w-[280px] text-right font-black text-slate-700">
                        캠페인 합계
                        <span className="mt-0.5 block text-[10px] font-medium text-slate-500">NET / 노출 / 클릭 / CTR / 수수료 / DMP 수수료</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignRows.map((row) => (
                      <TableRow key={row.campaign_id} className="group border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                        <TableCell className="sticky left-0 z-10 max-w-[220px] bg-white px-6 font-semibold text-slate-600 transition-colors group-hover:bg-slate-50 group-hover:text-indigo-600">
                          <span className="truncate block">{row.campaign_name}</span>
                        </TableCell>
                        {dmpColumns.map(type => {
                          const cell = row.byDmp[type] ?? { net: 0, fee: 0, dmpFee: 0, impressions: 0, clicks: 0 };
                          const ctr = cell.impressions > 0 ? (cell.clicks / cell.impressions * 100).toFixed(2) : '0.00';
                          return (
                            <TableCell key={type} className="text-right">
                              <div className="text-xs leading-relaxed">
                                <div className="font-bold text-indigo-600">NET: &#8361;{cell.net.toLocaleString()}</div>
                                <div className="font-medium text-slate-400">노출: {cell.impressions.toLocaleString('ko-KR')}</div>
                                <div className="font-medium text-slate-400">클릭: {cell.clicks.toLocaleString('ko-KR')}</div>
                                <div className="font-medium text-teal-600">CTR: {ctr}%</div>
                                <div className="font-medium text-orange-600">DMP: &#8361;{cell.dmpFee.toLocaleString()}</div>
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="bg-slate-50 text-right">
                          <div className="text-xs leading-relaxed">
                            <div className="font-black text-indigo-600">NET: &#8361;{row.totalNet.toLocaleString()}</div>
                            <div className="font-semibold text-slate-400">노출: {row.totalImpressions.toLocaleString('ko-KR')}</div>
                            <div className="font-semibold text-slate-400">클릭: {row.totalClicks.toLocaleString('ko-KR')}</div>
                            <div className="font-semibold text-teal-600">CTR: {calcCtr(row.totalClicks, row.totalImpressions)}%</div>
                            <div className="font-bold text-purple-600">수수료: &#8361;{row.totalFee.toLocaleString()}</div>
                            <div className="font-bold text-orange-600">DMP: &#8361;{row.totalDmpFee.toLocaleString()}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="border-t-2 border-slate-200 bg-slate-50 font-black">
                      <TableCell className="sticky left-0 z-10 bg-slate-50 px-6 font-black text-slate-700">
                        합계 ({campaignRows.length}개 캠페인)
                      </TableCell>
                      {dmpColumns.map(type => {
                        const cell = totalsByDmp[type] ?? { net: 0, fee: 0, dmpFee: 0, impressions: 0, clicks: 0 };
                        const ctr = cell.impressions > 0 ? (cell.clicks / cell.impressions * 100).toFixed(2) : '0.00';
                        return (
                          <TableCell key={type} className="text-right">
                            <div className="text-xs leading-relaxed">
                              <div className="font-black text-indigo-600">NET: &#8361;{cell.net.toLocaleString()}</div>
                              <div className="font-black text-slate-400">노출: {cell.impressions.toLocaleString('ko-KR')}</div>
                              <div className="font-black text-slate-400">클릭: {cell.clicks.toLocaleString('ko-KR')}</div>
                              <div className="font-black text-teal-600">CTR: {ctr}%</div>
                              <div className="font-black text-orange-600">DMP: &#8361;{cell.dmpFee.toLocaleString()}</div>
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell className="bg-slate-100 text-right">
                        <div className="text-xs leading-relaxed">
                          <div className="font-black text-indigo-700">NET: &#8361;{totalNet.toLocaleString()}</div>
                          <div className="font-black text-slate-600">노출: {totalImpressions.toLocaleString('ko-KR')}</div>
                          <div className="font-black text-slate-600">클릭: {totalClicks.toLocaleString('ko-KR')}</div>
                          <div className="font-black text-teal-700">CTR: {calcCtr(totalClicks, totalImpressions)}%</div>
                          <div className="font-black text-purple-700">수수료: &#8361;{totalFee.toLocaleString()}</div>
                          <div className="font-black text-orange-700">DMP: &#8361;{totalDmpFee.toLocaleString()}</div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="p-28 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-600">
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
