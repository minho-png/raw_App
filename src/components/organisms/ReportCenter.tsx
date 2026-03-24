"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BudgetPacingCards } from '@/components/molecules/BudgetPacingCards';
import { FileUploader } from '@/components/molecules/FileUploader';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Zap,
  Database,
  TrendingUp,
  Loader2,
  Edit3,
  Check,
  Settings2,
  PieChart as PieChartIcon,
  MessageSquare,
  Users,
  Layout as LayoutIcon,
  BarChart4,
  Download,
  Layers,
  Sparkles,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Receipt,
} from "lucide-react";
import { useToast } from '@/context/ToastContext';
import { ColumnMappingPreview } from '@/components/molecules/ColumnMappingPreview';
import { MediaMixSection } from '@/components/molecules/MediaMixSection';
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { BudgetStatus, PerformanceRecord, MediaProvider } from "@/types";
import { useCampaignStore } from '@/store/useCampaignStore';
import { cn } from '@/lib/utils';
import { getPerformanceDataAction, updatePerformanceDataAction, savePerformanceData } from '@/server/actions/settlement';
import { saveCampaignAction } from '@/server/actions/campaign';
import { CalculationService } from "@/services/calculationService";
import { BudgetSettingsModal } from "./BudgetSettingsModal";
import { ReportService } from "@/services/reportService";
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { TableFilterBar } from '@/components/molecules/TableFilterBar';
import { DataTable } from '@/components/molecules/DataTable';
import { StaleInsightBanner } from '@/components/molecules/StaleInsightBanner';
import debounce from 'lodash/debounce';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export const ReportCenter: React.FC = () => {
  const toast = useToast();
  const { campaigns, selectedCampaignId, updateCampaign, setCampaigns, setIsSyncing } = useCampaignStore();
  const selectedCampaign = campaigns.find(c => c.campaign_id === selectedCampaignId);
  
  const [processedData, setProcessedData] = useState<PerformanceRecord[]>([]);
  const [activeTabStep, setActiveTabStep] = useState('source');
  const [activeMedia, setActiveMedia] = useState<MediaProvider>('네이버GFA');
  const [groupByColumns, setGroupByColumns] = useState<string[]>(['date_raw']); 
  const [rawParsedData, setRawParsedData] = useState<any[]>([]);

  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: string, value: number } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [campaignInsights, setCampaignInsights] = useState(selectedCampaign?.insights || '');

  // Update insights when campaign changes
  useEffect(() => {
    setCampaignInsights(selectedCampaign?.insights || '');
  }, [selectedCampaignId, selectedCampaign?.insights]);

  // Persist in-progress work per campaign (back/forward, tab switch)
  useEffect(() => {
    if (!selectedCampaignId) return;
    const key = `gfa:reportcenter:${selectedCampaignId}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.rawParsedData)) setRawParsedData(parsed.rawParsedData);
      if (Array.isArray(parsed.processedData)) setProcessedData(parsed.processedData);
      if (Array.isArray(parsed.groupByColumns)) setGroupByColumns(parsed.groupByColumns);
      if (typeof parsed.activeMedia === 'string') setActiveMedia(parsed.activeMedia as MediaProvider);
      if (typeof parsed.activeTabStep === 'string') setActiveTabStep(parsed.activeTabStep);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCampaignId]);

  const persistDraft = useMemo(() => {
    return debounce((snapshot: any) => {
      if (!selectedCampaignId) return;
      const key = `gfa:reportcenter:${selectedCampaignId}`;
      try {
        sessionStorage.setItem(key, JSON.stringify(snapshot));
      } catch {
        // ignore
      }
    }, 250);
  }, [selectedCampaignId]);

  useEffect(() => {
    persistDraft({
      rawParsedData,
      processedData,
      groupByColumns,
      activeMedia,
      activeTabStep,
    });
    return () => {
      persistDraft.cancel();
    };
  }, [rawParsedData, processedData, groupByColumns, activeMedia, activeTabStep, persistDraft]);

  const defaultDashboardLayout = useMemo(
    () => ['trend', 'share', 'budget', 'dmp', 'audience', 'creative', 'matrix', 'insights'],
    []
  );

  const dashboardLayout = useMemo(() => {
    const layout = selectedCampaign?.dashboard_layout;
    if (!layout || layout.length === 0) return defaultDashboardLayout;
    const unique = Array.from(new Set(layout));
    const withNewOnes = [...unique];
    for (const id of defaultDashboardLayout) {
      if (!withNewOnes.includes(id)) withNewOnes.push(id);
    }
    return withNewOnes;
  }, [selectedCampaign?.dashboard_layout, defaultDashboardLayout]);

  const debouncedSaveCampaign = useMemo(() => {
    return debounce(async (updatedCampaign: any) => {
      setIsSyncing(true);
      try {
        const result = await saveCampaignAction(updatedCampaign);
        if (result.success && result.campaigns) {
          setCampaigns(result.campaigns);
        }
      } finally {
        setIsSyncing(false);
      }
    }, 1500);
  }, [setCampaigns, setIsSyncing]);

  useEffect(() => {
    return () => {
      debouncedSaveCampaign.cancel();
    };
  }, [debouncedSaveCampaign]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDashboardDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!selectedCampaign) return;
    if (!over || active.id === over.id) return;

    const oldIndex = dashboardLayout.indexOf(String(active.id));
    const newIndex = dashboardLayout.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const nextLayout = arrayMove(dashboardLayout, oldIndex, newIndex);
    const updated = { ...selectedCampaign, dashboard_layout: nextLayout, updated_at: new Date() };
    updateCampaign(updated);
    debouncedSaveCampaign(updated);
  };

  const SortableItem: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.85 : 1,
    };
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={cn("touch-none", isDragging && "z-10")}>
        {children}
      </div>
    );
  };

  const handleSaveInsights = async () => {
    if (!selectedCampaign) return;
    const updated = { ...selectedCampaign, insights: campaignInsights };
    const result = await saveCampaignAction(updated);
    if (result.success && result.campaigns) {
      setCampaigns(result.campaigns);
      toast.success('인사이트 저장 완료');
    } else {
      toast.error('저장 실패', '잠시 후 다시 시도해 주세요.');
    }
  };

  const handleUpdateAmount = async (id: string, newValue: number) => {
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(id);
    
    if (isMongoId) {
      setIsUpdating(true);
      try {
        const result = await updatePerformanceDataAction(id, {
          execution_amount: newValue,
          cost: newValue
        });
        if (result.success) {
          setProcessedData(prev => prev.map(d =>
            d._id === id ? { ...d, execution_amount: newValue, is_edited: true } : d
          ));
          setEditingCell(null);
          toast.success('금액 수정 완료', `₩${newValue.toLocaleString()}으로 업데이트되었습니다.`);
        } else {
          toast.error('DB 업데이트 실패', '잠시 후 다시 시도해 주세요.');
        }
      } catch (error) {
        console.error('Update failed:', error);
      } finally {
        setIsUpdating(false);
      }
    } else {
      // Local-only update for temp records
      setProcessedData(prev => prev.map(d => 
        d._id === id ? { ...d, execution_amount: newValue, is_edited: true } : d
      ));
      setEditingCell(null);
    }
  };

  const handleFetchDbData = async () => {
    if (!selectedCampaignId) return;
    
    setIsLoadingDb(true);
    try {
      const result = await getPerformanceDataAction(selectedCampaignId);
      if (result.success && result.data) {
        setProcessedData(prev => [
          ...prev.filter(d => d.campaign_id !== selectedCampaignId),
          ...result.data
        ]);
        toast.success('DB 동기화 완료', `${result.data.length.toLocaleString()}건의 데이터를 불러왔습니다.`);
        setActiveTabStep('dashboard');
      } else {
        toast.error('동기화 실패', '데이터를 불러오는 데 실패했습니다.');
      }
    } catch (error) {
      console.error('Fetch DB data failed:', error);
      toast.error('요청 오류', '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoadingDb(false);
    }
  };

  // 날짜 범위 필터 상태 (마케터 민수 요청: 정산 기간 필터)
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Filter data by selected campaign + date range
  const filteredData = useMemo(() => {
    return processedData.filter(d => {
      if (d.campaign_id !== selectedCampaignId) return false;
      if (filterStartDate) {
        const start = new Date(filterStartDate + 'T00:00:00Z');
        if (new Date(d.date) < start) return false;
      }
      if (filterEndDate) {
        const end = new Date(filterEndDate + 'T23:59:59Z');
        if (new Date(d.date) > end) return false;
      }
      return true;
    });
  }, [processedData, selectedCampaignId, filterStartDate, filterEndDate]);

  const totalBudget = useMemo(() => {
    if (!selectedCampaign || !selectedCampaign.sub_campaigns) return 0;
    return selectedCampaign.sub_campaigns
      .filter(sub => sub.enabled !== false) // Ignore disabled media
      .reduce((sum, sub) => sum + (sub.budget || 0), 0);
  }, [selectedCampaign]);

  // Derived stats for BudgetPacingCards
  // NaN 방어: DB에서 오는 값이 undefined/null일 수 있어 모든 numeric 필드에 ?? 0 적용
  const budgetStatus: BudgetStatus = useMemo(() => {
    const totalExecution = filteredData.reduce((sum, r) => sum + (Number(r.execution_amount) || 0), 0);
    const totalClicks = filteredData.reduce((sum, r) => sum + (Number(r.clicks) || 0), 0);
    const totalImpressions = filteredData.reduce((sum, r) => sum + (Number(r.impressions) || 0), 0);
    
    const spent = totalExecution;
    const total = totalBudget;
    const remaining = total - spent;
    
    const burnRate = total > 0 ? (spent / total) * 100 : 0;
    const actualCpc = totalClicks > 0 ? spent / totalClicks : 0;
    const actualCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    // pacing_index: 실제 집행비율 / 기간경과비율 × 100
    // 데이터 날짜 범위를 기준으로 "오늘이 몇 % 경과했는지" 계산
    let pacingIndex = 100;
    if (filteredData.length > 0 && total > 0) {
      const dates = filteredData.map(r => new Date(r.date).getTime()).filter(t => !isNaN(t));
      if (dates.length > 0) {
        const startTs = Math.min(...dates);
        const endTs = Math.max(...dates);
        const rangeMs = endTs - startTs;
        const nowTs = Date.now();
        const elapsedRatio = rangeMs > 0 ? Math.min((nowTs - startTs) / rangeMs, 1) : 1;
        const spendRatio = total > 0 ? spent / total : 0;
        pacingIndex = elapsedRatio > 0 ? Math.round((spendRatio / elapsedRatio) * 100) : 100;
      }
    }

    // Calculate Master Target CPC/CTR (Simple Average of sub-campaigns that have targets)
    const subWithCpc = selectedCampaign?.sub_campaigns?.filter(s => s.target_cpc && s.target_cpc > 0) || [];
    const avgTargetCpc = subWithCpc.length > 0
      ? subWithCpc.reduce((sum, s) => sum + (s.target_cpc || 0), 0) / subWithCpc.length
      : undefined;

    const subWithCtr = selectedCampaign?.sub_campaigns?.filter(s => s.enabled !== false && s.target_ctr && s.target_ctr > 0) || [];
    const avgTargetCtr = subWithCtr.length > 0
      ? subWithCtr.reduce((sum, s) => sum + (s.target_ctr || 0), 0) / subWithCtr.length
      : undefined;

    return {
      total_budget: total,
      spent_budget: spent,
      remaining_budget: remaining,
      spent: spent,
      remaining: remaining,
      burn_rate: burnRate,
      pacing_index: pacingIndex,
      pacing_status: burnRate > 100 ? 'over' : (burnRate > 80 ? 'warning' : 'stable'),
      actual_cpc: actualCpc,
      actual_ctr: actualCtr,
      target_cpc: avgTargetCpc,
      target_ctr: avgTargetCtr
    };
  }, [filteredData, totalBudget, selectedCampaign]);

  const handleAnalysisComplete = (data: any[]) => {
    setRawParsedData(data);
  };

  const toggleGroupBy = (col: string) => {
    setGroupByColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const handleProcessData = async () => {
    if (!selectedCampaignId || rawParsedData.length === 0) return;
    
    setIsProcessing(true);
    try {
      // Transform sub_campaigns array to record for CalculationService
      const configs: Record<string, any> = {};
      const enabledExcelNames = new Set<string>();
      const enabledMedias = new Set<string>();

      selectedCampaign?.sub_campaigns?.forEach(sub => {
        if (sub.enabled !== false) {
          const mKey = sub.mapping_value || sub.excel_name;
          if (mKey) {
            configs[mKey] = sub;
            enabledExcelNames.add(mKey);
          }
          enabledMedias.add(sub.media);
        }
      });

      // Filter raw data to only include enabled sub-campaigns.
      // rawParsedData has original CSV column names (not normalized), so we must
      // detect the campaign column from the raw headers before filtering.
      const filteredRaw = (() => {
        if (!selectedCampaign?.sub_campaigns || selectedCampaign.sub_campaigns.length === 0 || enabledExcelNames.size === 0) {
          return rawParsedData; // No sub-campaign config → process all rows
        }
        // Detect which column holds the campaign name value in the raw CSV.
        // Matches the same priority list used by suggestedExcelNames above.
        const rawKeys = Object.keys(rawParsedData[0] ?? {});
        const campKeywords = ['캠페인명', '캠페인 이름', '캠페인', 'Campaign Name', 'Campaign'];
        const excludeKeywords = ['소재', 'Creative', '그룹', 'Group', '번호', 'ID', '날짜', 'Date'];
        const campCol = rawKeys.find(k =>
          campKeywords.some(pk => k.includes(pk)) && !excludeKeywords.some(ek => k.includes(ek))
        ) || rawKeys.find(k => campKeywords.some(pk => k.includes(pk)));

        return rawParsedData.filter(row => {
          const rowCamp = campCol ? String(row[campCol] ?? '') : '';
          return enabledExcelNames.has(rowCamp);
        });
      })();

      const { raw, report } = CalculationService.processWithDanfo(
        filteredRaw,
        selectedCampaignId,
        activeMedia,
        10, // Default fee rate if not configured
        groupByColumns,
        undefined,
        configs
      );
      
      if (report.length === 0) {
        toast.warning(
          '처리 결과가 없습니다',
          enabledExcelNames.size > 0
            ? 'mapping_value와 일치하는 CSV 행이 없습니다. 예산 설정에서 매핑 값을 확인하세요.'
            : 'CSV 파일에 처리 가능한 데이터가 없습니다.'
        );
        return;
      }

      setProcessedData(report);
      setActiveTabStep('processing');
    } catch (error) {
      console.error('Processing failed:', error);
      toast.error('데이터 처리 실패', error instanceof Error ? error.message : '파일 형식 또는 컬럼 매핑을 확인하세요.');
    } finally {
      setIsProcessing(false);
    }
  };

  const [isSavingReport, setIsSavingReport] = useState(false);

  // AI 인사이트 상태
  const [aiInsight, setAiInsight] = useState<any>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const TABLE_PAGE_SIZE = 50;

  // 테이블 전용 필터 state (차트에는 영향 없음 — filteredData와 분리)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMedia, setFilterMedia] = useState('all');
  const [filterDmp, setFilterDmp] = useState('all');
  const [staleBannerDismissed, setStaleBannerDismissed] = useState(false);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  // 테이블 전용 필터 적용 — 차트는 filteredData를 그대로 사용하고 이 데이터만 테이블에 전달
  const tableFilteredData = useMemo(() => {
    return filteredData.filter(d => {
      if (filterMedia !== 'all' && d.media !== filterMedia) return false;
      if (filterDmp !== 'all' && (d.dmp_type || 'DIRECT') !== filterDmp) return false;
      if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.toLowerCase();
        const name = (d.excel_campaign_name || d.ad_group_name || '').toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [filteredData, debouncedSearchQuery, filterMedia, filterDmp]);

  // 필터 변경 시 테이블 1페이지로 자동 리셋
  useEffect(() => {
    setTablePage(0);
  }, [debouncedSearchQuery, filterMedia, filterDmp, filterStartDate, filterEndDate]);

  // 매체 / DMP 옵션 동적 생성 (filteredData 기준 — 날짜 필터 반영, 검색어는 미반영)
  const mediaOptions = useMemo(
    () => ['all', ...Array.from(new Set(filteredData.map(d => d.media).filter(Boolean)))],
    [filteredData]
  );
  const dmpOptions = useMemo(
    () => ['all', ...Array.from(new Set(filteredData.map(d => d.dmp_type || 'DIRECT').filter(Boolean)))],
    [filteredData]
  );

  const handleSaveProcessedData = async () => {
    if (!selectedCampaignId || processedData.length === 0) return;
    
    setIsSavingReport(true);
    try {
      // Normalize dates and ensure is_raw is false for report data
      const normalized = processedData.map(d => ({
        ...d,
        date: new Date(d.date),
        is_raw: false
      }));

      const res = await savePerformanceData(normalized as any);
      if (res.success) {
        toast.success('저장 완료', `${normalized.length.toLocaleString()}건의 데이터가 DB에 저장되었습니다.`);
        // 저장 성공 후 DB에서 재로드하여 대시보드로 자동 이동
        const dbResult = await getPerformanceDataAction(selectedCampaignId);
        if (dbResult.success && dbResult.data) {
          setProcessedData(dbResult.data);
        }
        setActiveTabStep('dashboard');
      } else {
        toast.error('저장 실패', res.error);
      }
    } catch (err) {
      console.error(err);
      toast.error('저장 오류', '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleGenerateAiInsight = async () => {
    if (!selectedCampaignId || filteredData.length === 0) return;
    setIsGeneratingAi(true);
    try {
      const res = await fetch('/api/v1/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: selectedCampaignId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error('AI 분석 실패', json.error ?? '잠시 후 다시 시도해 주세요.');
        return;
      }
      setAiInsight(json.data);
      toast.success('AI 분석 완료', `${json.data.recommendations?.length ?? 0}개의 권장사항이 생성되었습니다.`);
    } catch {
      toast.error('AI 분석 오류', '네트워크 오류가 발생했습니다.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleGenerateReport = () => {
    if (!selectedCampaign || filteredData.length === 0) return;
    
    try {
      const html = ReportService.generateHtmlReport(
        selectedCampaign,
        filteredData,
        budgetStatus,
        selectedCampaign.dashboard_layout
      );
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedCampaign.campaign_name}_성과보고서_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Report generation failed:', error);
      toast.error('리포트 생성 실패', '잠시 후 다시 시도해 주세요.');
    }
  };

  // CSV 내보내기 — 브랜딩 마케터 + IMC 마케터 요청
  const handleCsvExport = () => {
    if (filteredData.length === 0) {
      toast.warning('내보낼 데이터 없음', '먼저 데이터를 처리하거나 DB에서 불러오세요.');
      return;
    }
    const headers = ['날짜', '캠페인명', '매체', 'DMP', '노출수', '클릭수', 'CTR(%)', 'CPC(₩)', 'CPM(₩)', '집행금액(₩)'];
    const rows = filteredData.map(r => {
      const imps = r.impressions ?? 0;
      const clicks = r.clicks ?? 0;
      const spend = r.execution_amount ?? 0;
      return [
        new Date(r.date).toISOString().slice(0, 10),
        r.excel_campaign_name || r.ad_group_name || '',
        r.media || '',
        r.dmp_type || 'DIRECT',
        imps,
        clicks,
        imps > 0 ? ((clicks / imps) * 100).toFixed(2) : '0.00',
        clicks > 0 ? Math.round(spend / clicks) : 0,
        imps > 0 ? Math.round((spend / imps) * 1000) : 0,
        Math.round(spend),
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const bom = '\uFEFF'; // 한글 깨짐 방지
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCampaign?.campaign_name ?? 'report'}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV 내보내기 완료', `${filteredData.length.toLocaleString()}건이 다운로드되었습니다.`);
  };

  // Chart Data Derivation
  const dailyTrendData = useMemo(() => {
    // Key by ISO date string (YYYY-MM-DD) to avoid locale-dependent sort issues
    const grouped = filteredData.reduce((acc: any, curr) => {
      const d = new Date(curr.date);
      const iso = isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
      if (!iso) return acc;
      if (!acc[iso]) {
        acc[iso] = { date: iso, execution_amount: 0, clicks: 0, impressions: 0 };
      }
      acc[iso].execution_amount += (Number(curr.execution_amount) || 0);
      acc[iso].clicks += (Number(curr.clicks) || 0);
      acc[iso].impressions += (Number(curr.impressions) || 0);
      return acc;
    }, {});

    return Object.values(grouped)
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .map((v: any) => ({
        ...v,
        actual_cpc: v.clicks > 0 ? Math.round(v.execution_amount / v.clicks) : 0,
        ctr: v.impressions > 0 ? ((v.clicks / v.impressions) * 100).toFixed(2) : '0.00',
      }));
  }, [filteredData]);

  const formatDate = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const dmpShareData = useMemo(() => {
    const shares = filteredData.reduce((acc: any, curr) => {
      const dmp = curr.dmp_type || 'DIRECT';
      acc[dmp] = (acc[dmp] || 0) + (Number(curr.execution_amount) || 0);
      return acc;
    }, {});

    return Object.entries(shares)
      .map(([name, value]) => ({ name, value: value as number }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const budgetProgressData = useMemo(() => {
    if (!selectedCampaign || !selectedCampaign.sub_campaigns) return [];
    
    return selectedCampaign.sub_campaigns
      .filter(sub => sub.enabled !== false)
      .map(sub => {
        const spent = filteredData
          .filter(d => {
            const mKey = sub.mapping_value || sub.excel_name;
            if (mKey) return d.excel_campaign_name === mKey || d.mapping_value === mKey;
            return d.media === sub.media;
          })
          .reduce((sum, d) => sum + (Number(d.execution_amount) || 0), 0);
        
        return {
          id: sub.id,
          name: sub.mapping_value || sub.excel_name || sub.media,
          budget: sub.budget || 0,
          spent: spent,
          percent: sub.budget > 0 ? Math.min((spent / sub.budget) * 100, 100) : 0
        };
      });
  }, [selectedCampaign, filteredData]);

  const ageData = useMemo(() => {
    const counts = filteredData.reduce((acc: any, curr) => {
      const age = curr.age || 'Unknown';
      acc[age] = (acc[age] || 0) + (Number(curr.execution_amount) || 0);
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value: value as number }))
      .filter(d => d.value > 0);
  }, [filteredData]);

  const genderData = useMemo(() => {
    const counts = filteredData.reduce((acc: any, curr) => {
      const g = curr.gender || 'Unknown';
      acc[g] = (acc[g] || 0) + (Number(curr.execution_amount) || 0);
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value: value as number }))
      .filter(d => d.value > 0);
  }, [filteredData]);

  const creativeData = useMemo(() => {
    const data = filteredData.reduce((acc: any, curr) => {
      const c = curr.creative_name || 'N/A';
      if (!acc[c]) acc[c] = { name: c, spend: 0, clicks: 0, imps: 0 };
      acc[c].spend += (Number(curr.execution_amount) || 0);
      acc[c].clicks += (Number(curr.clicks) || 0);
      acc[c].imps += (Number(curr.impressions) || 0);
      return acc;
    }, {});
    return Object.values(data).map((v: any) => ({
      ...v,
      ctr: v.imps > 0 ? (v.clicks / v.imps) * 100 : 0,
      cpc: v.clicks > 0 ? Math.round(v.spend / v.clicks) : 0,
    })).sort((a: any, b: any) => b.spend - a.spend).slice(0, 10);
  }, [filteredData]);

  if (!selectedCampaignId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50/50">
        <div className="text-center p-8 bg-white border border-slate-200 shadow-sm rounded-2xl max-w-md">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 mb-6 mx-auto shadow-inner">
            <TrendingUp size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">캠페인 선택 대기 중</h2>
          <p className="text-slate-500 mt-2">왼쪽 사이드바에서 캠페인을 선택하거나 새 캠페인을 추가하여 분석을 시작하세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 space-y-10 animate-in fade-in duration-1000">
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Badge className="bg-blue-600 text-white border-none px-3 py-1 rounded-lg text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-500/20">실시간 인텔리전스</Badge>
            <span className="text-xs text-slate-400 font-bold uppercase tracking-[0.2em] px-2 py-1 bg-slate-100 rounded-lg">ID: {selectedCampaignId}</span>
          </div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tighter font-outfit drop-shadow-sm">
            {selectedCampaign?.campaign_name}
          </h1>
          <p className="text-slate-500 text-lg font-medium flex items-center gap-2">
            <Zap size={18} className="text-blue-500 fill-blue-500" />
            초정밀 퍼포먼스 정산 및 인텔리전스 엔진
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Button
            variant="outline"
            onClick={handleFetchDbData}
            disabled={isLoadingDb}
            className="rounded-2xl border-slate-200 bg-white h-12 px-6 font-bold shadow-sm transition-all border-2"
          >
            {isLoadingDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4 text-blue-500" />}
            DB 데이터 동기화
          </Button>
          {/* 날짜 범위 필터 — 마케터 민수 요청: 정산 기간 필터링 */}
          <div className="flex items-center gap-2 bg-white border-2 border-slate-200 rounded-2xl px-4 h-12 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">기간</span>
            <input
              type="date"
              value={filterStartDate}
              onChange={e => setFilterStartDate(e.target.value)}
              className="text-sm font-medium text-slate-700 bg-transparent border-none outline-none w-32"
            />
            <span className="text-slate-300 font-bold">—</span>
            <input
              type="date"
              value={filterEndDate}
              onChange={e => setFilterEndDate(e.target.value)}
              className="text-sm font-medium text-slate-700 bg-transparent border-none outline-none w-32"
            />
            {(filterStartDate || filterEndDate) && (
              <button
                onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}
                className="ml-1 text-slate-400 hover:text-slate-600 text-xs font-black"
                title="필터 초기화"
              >✕</button>
            )}
          </div>
          <Button 
            variant="outline" 
            onClick={() => setIsBudgetModalOpen(true)}
            className="rounded-2xl border-slate-200 bg-white h-12 px-6 font-bold shadow-sm transition-all border-2"
          >
            <Settings2 className="mr-2 h-4 w-4 text-blue-600" /> 예산 및 KPI 관리
          </Button>
          <Button
            variant="outline"
            onClick={handleCsvExport}
            disabled={filteredData.length === 0}
            className="rounded-2xl border-slate-200 bg-white h-12 px-6 font-bold shadow-sm transition-all border-2"
          >
            <Download className="mr-2 h-4 w-4 text-green-600" /> CSV 내보내기
          </Button>
          <Button
            onClick={handleGenerateReport}
            className="rounded-2xl bg-slate-900 hover:bg-black text-white h-12 px-8 font-black shadow-xl transition-all hover:scale-[1.05] active:scale-95 border-b-4 border-slate-700"
          >
            <BarChart4 className="mr-2 h-5 w-5" /> 리포트 내보내기
          </Button>
        </div>
      </header>

      {selectedCampaign && (
        <BudgetSettingsModal 
          isOpen={isBudgetModalOpen}
          onClose={() => setIsBudgetModalOpen(false)}
          campaign={selectedCampaign}
          totalSpent={budgetStatus.spent}
          onUpdate={async (updated) => {
            setIsSyncing(true);
            const result = await saveCampaignAction(updated);
            if (result.success && result.campaigns) {
              setCampaigns(result.campaigns);
            }
            setIsSyncing(false);
          }}
        />
      )}

      <BudgetPacingCards status={budgetStatus} campaign={selectedCampaign} />

      <div className="relative">
        {/* Horizontal Stepper Background Line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
        
        <div className="relative z-10 flex justify-between items-center max-w-4xl mx-auto">
          {[
            { id: 'source', label: '데이터 모델링', icon: Database, step: '01' },
            { id: 'processing', label: '데이터 검증', icon: Edit3, step: '02' },
            { id: 'dashboard', label: '퍼포먼스 인사이트', icon: PieChartIcon, step: '03' }
          ].map((step, idx) => {
            const active = activeTabStep === step.id;
            const StepIcon = step.icon;
            return (
              <button
                key={step.id}
                onClick={() => setActiveTabStep(step.id)}
                className="group flex flex-col items-center gap-3 focus:outline-none"
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border-2",
                  active 
                    ? "bg-blue-600 border-blue-600 text-white shadow-2xl shadow-blue-500/40 scale-125" 
                    : "bg-white border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500"
                )}>
                  <StepIcon size={20} />
                </div>
                <div className="flex flex-col items-center">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest leading-none mb-1",
                    active ? "text-blue-600" : "text-slate-400"
                  )}>Step {step.step}</span>
                  <span className={cn(
                    "text-xs font-black tracking-tight font-outfit transition-colors",
                    active ? "text-slate-900" : "text-slate-500 group-hover:text-blue-500"
                  )}>{step.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-12">
        <AnimatePresence mode="wait">
          {activeTabStep === 'source' && (
            <motion.div
              key="source"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="outline-none"
            >
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-12 relative overflow-hidden">
                
                <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-12 gap-8">
                  <div className="space-y-2">
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight font-outfit flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl">
                        <Database size={24} />
                      </div>
                      01. 데이터 모델링 & 소스 로드
                    </h2>
                    <p className="text-slate-500 text-lg font-medium max-w-2xl">광고 데이터를 로드하고 인텔리전스 프로세싱을 위한 결과값 집계 기준을 정의합니다.</p>
                  </div>
                  <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
                    <FileUploader onAnalysisComplete={handleAnalysisComplete} isSimpleButton={true} />
                  </div>
                </div>

                {rawParsedData.length > 0 ? (
                  <div className="space-y-12">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                      <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-8 border-t-4 border-t-blue-600">
                        <Label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 block">A. 광고 매체 식별</Label>
                        <Select value={activeMedia} onValueChange={(val) => setActiveMedia(val as MediaProvider)}>
                          <SelectTrigger className="bg-white border-slate-200 rounded-2xl h-14 text-base font-bold shadow-sm focus:ring-blue-500">
                            <SelectValue placeholder="Select Media" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-slate-100 shadow-2xl">
                            <SelectItem value="네이버GFA" className="rounded-xl py-3 font-bold text-slate-700">Naver GFA Engine</SelectItem>
                            <SelectItem value="카카오Moment" className="rounded-xl py-3 font-bold text-slate-700">Kakao Moment</SelectItem>
                            <SelectItem value="메타Ads" className="rounded-xl py-3 font-bold text-slate-700">Meta Ads Manager</SelectItem>
                          </SelectContent>
                        </Select>
                      </Card>

                      <Card className="xl:col-span-2 bg-white border border-slate-200 shadow-sm rounded-2xl p-8 border-t-4 border-t-blue-600">
                        <Label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 block">B. 인텔리전스 모델링 (집계 기준)</Label>
                        <div className="flex flex-wrap gap-2.5">
                          {[
                            { id: 'date_raw', label: 'Date', icon: '📅' },
                            { id: 'ad_group_name', label: 'Ad Group', icon: '📁' },
                            { id: 'excel_campaign_name', label: 'Campaign', icon: '🎯' },
                            { id: 'creative_name', label: 'Creative', icon: '🎨' },
                            { id: 'age', label: 'Age', icon: '👤' },
                            { id: 'gender', label: 'Gender', icon: '🚻' },
                            { id: 'device', label: 'Device', icon: '📱' }
                          ].map(col => {
                            const active = groupByColumns.includes(col.id);
                            return (
                              <button 
                                key={col.id}
                                onClick={() => toggleGroupBy(col.id)}
                                className={cn(
                                  "px-5 py-3 rounded-2xl text-xs font-black transition-all flex items-center gap-2 border-2",
                                  active 
                                    ? "bg-slate-900 border-slate-900 text-white shadow-xl scale-105" 
                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-white"
                                )}
                              >
                                <span className="text-lg">{col.icon}</span>
                                {col.label}
                                {active && <Check size={14} className="ml-1 text-blue-400" />}
                              </button>
                            );
                          })}
                        </div>
                      </Card>

                      <Card className="bg-slate-900 rounded-2xl p-8 shadow-sm border border-slate-800 flex flex-col justify-between group">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-4 block group-hover:text-blue-400 transition-colors">C. 엔진 가공 실행</Label>
                        <div className="space-y-4">
                          <Button 
                            variant="outline"
                            onClick={() => setIsBudgetModalOpen(true)}
                            className="w-full bg-slate-800/50 border-slate-700 text-white hover:bg-slate-800 h-14 rounded-2xl font-black text-xs transition-all border-2"
                          >
                            <Settings2 className="mr-2 h-5 w-5 text-blue-400" /> 외부 예산 데이터 동기화
                          </Button>
                          <Button 
                            onClick={handleProcessData} 
                            disabled={isProcessing}
                            className="w-full bg-blue-600 hover:bg-blue-500 h-16 rounded-2xl font-black text-lg shadow-xl shadow-blue-600/20 transition-all hover:translate-y-[-4px] active:translate-y-0"
                          >
                            {isProcessing ? <Loader2 className="animate-spin h-6 w-6" /> : "데이터 가공 시작 ➔"}
                          </Button>
                        </div>
                      </Card>
                    </div>

                    {/* 컬럼 매핑 미리보기 — 디지털 마케터 요청 */}
                    <ColumnMappingPreview rawHeaders={Object.keys(rawParsedData[0] ?? {})} />

                    <div className="space-y-6">
                      <div className="flex justify-between items-end px-4">
                        <div className="flex items-center gap-3">
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">실시간 업로드 데이터 결과</h3>
                          <Badge variant="outline" className="text-xs font-bold text-slate-400 border-slate-200">상위 5개 레코드</Badge>
                        </div>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">전체 데이터 풀: {rawParsedData.length.toLocaleString()} 행</span>
                      </div>
                      <div className="overflow-hidden rounded-[40px] border border-slate-200 bg-white shadow-sm">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow className="hover:bg-transparent border-b-2 border-slate-100">
                              {Object.keys(rawParsedData[0]).slice(0, 8).map(header => (
                                <TableHead key={header} className="font-black text-slate-500 py-6 px-8 text-[10px] uppercase tracking-widest">{header}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rawParsedData.slice(0, 5).map((row, idx) => (
                              <TableRow key={idx} className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 last:border-none">
                                {Object.entries(row).slice(0, 8).map(([key, val]: [string, any], i) => (
                                  <TableCell key={i} className="py-6 px-8 font-bold text-slate-700 text-sm">
                                    {(key.includes('날짜') || key === 'date_raw' || key === 'date') ? formatDate(val) : String(val)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-40 flex flex-col items-center justify-center text-center animate-in fade-in duration-1000">
                    <div className="w-32 h-32 bg-slate-100 rounded-[50px] flex items-center justify-center text-slate-300 mb-10 shadow-inner group">
                      <Database size={56} className="group-hover:scale-110 transition-transform duration-500" />
                    </div>
                    <h3 className="text-3xl font-black text-slate-300 font-outfit uppercase tracking-tighter">데이터 처리 엔진 대기 중</h3>
                    <p className="text-slate-400 mt-4 max-w-md text-lg font-medium leading-relaxed">시스템이 데이터 입력을 기다리고 있습니다. 성과 리포트 파일을 업로드하여 인텔리전스 가공을 시작해 주세요.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTabStep === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight font-outfit uppercase">성과 검증 및 수동 보정</h2>
                    <p className="text-slate-500 font-medium text-lg mt-1">집계된 성과를 검토하고 실제 집행 금액을 정밀하게 보정하십시오.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={handleCsvExport}
                      disabled={filteredData.length === 0}
                      className="h-12 px-6 rounded-2xl border-slate-200 font-bold"
                    >
                      <Download className="mr-2 h-4 w-4 text-green-600" /> CSV
                    </Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700 h-14 px-8 rounded-2xl font-black text-lg shadow-xl shadow-green-600/20 transition-all hover:translate-y-[-4px] active:translate-y-0"
                      onClick={handleSaveProcessedData}
                      disabled={isSavingReport || processedData.length === 0}
                    >
                      {isSavingReport ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <Check size={20} className="mr-2 stroke-[3px]"/>}
                      최종 변경 사항 반영
                    </Button>
                  </div>
                </div>

                {filteredData.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-5">
                      <Settings2 size={28} className="text-amber-400" />
                    </div>
                    <h3 className="text-xl font-black text-slate-700 tracking-tight mb-2">처리된 데이터가 없습니다</h3>
                    <p className="text-slate-400 text-sm font-medium max-w-sm mb-6">
                      서브캠페인의 <span className="font-black text-slate-600">mapping_value</span>와 CSV 캠페인명이 일치하지 않거나, 아직 CSV를 업로드하지 않았습니다.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setActiveTabStep('source')}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
                      >
                        01. 데이터 로드로 돌아가기
                      </button>
                      <button
                        onClick={() => setIsBudgetModalOpen(true)}
                        className="px-5 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold hover:border-blue-300 transition-colors"
                      >
                        매핑 설정 확인
                      </button>
                    </div>
                  </div>
                )}

                {filteredData.length > 0 && (
                  <div className="space-y-0">
                    <TableFilterBar
                      searchQuery={searchQuery}
                      onSearchChange={setSearchQuery}
                      filterMedia={filterMedia}
                      onMediaChange={setFilterMedia}
                      filterDmp={filterDmp}
                      onDmpChange={setFilterDmp}
                      mediaOptions={mediaOptions}
                      dmpOptions={dmpOptions}
                      totalCount={filteredData.length}
                      filteredCount={tableFilteredData.length}
                      onReset={() => {
                        setSearchQuery('');
                        setFilterMedia('all');
                        setFilterDmp('all');
                      }}
                    />
                    <DataTable
                      data={tableFilteredData}
                      editingCell={editingCell}
                      onEditStart={(id, value) => setEditingCell({ id, value })}
                      onEditChange={(id, value) => setEditingCell({ id, value })}
                      onEditConfirm={handleUpdateAmount}
                      onEditCancel={() => setEditingCell(null)}
                      isUpdating={isUpdating}
                      page={tablePage}
                      pageSize={TABLE_PAGE_SIZE}
                      onPageChange={setTablePage}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTabStep === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* Empty state — 디자이너 유진 요청: 데이터 없을 때 안내 UI */}
              {filteredData.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-6">
                    <Database size={36} className="text-slate-300" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-700 tracking-tight mb-2">표시할 데이터가 없습니다</h3>
                  <p className="text-slate-400 font-medium mb-2">
                    {(filterStartDate || filterEndDate) ? '선택한 기간에 해당하는 데이터가 없습니다.' : 'CSV를 업로드하거나 DB에서 데이터를 불러오세요.'}
                  </p>
                  {(filterStartDate || filterEndDate) && (
                    <button
                      onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}
                      className="mt-2 text-xs font-bold text-blue-500 hover:text-blue-700 underline"
                    >
                      기간 필터 초기화
                    </button>
                  )}
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => setActiveTabStep('source')}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
                    >
                      CSV 업로드
                    </button>
                    <button
                      onClick={handleFetchDbData}
                      disabled={isLoadingDb}
                      className="px-5 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold hover:border-slate-300 transition-colors"
                    >
                      {isLoadingDb ? <Loader2 size={14} className="inline animate-spin mr-1" /> : null}
                      DB 동기화
                    </button>
                  </div>
                </div>
              )}

              {/* 매체 믹스 비교 — IMC 마케터 + 브랜딩 마케터 요청 */}
              {filteredData.length > 0 && (() => {
                const hasMultiMedia = new Set(filteredData.map(r => r.media).filter(Boolean)).size > 1;
                if (!hasMultiMedia) return null;
                return (
                  <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                        <Layers size={20} />
                      </div>
                      <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase tracking-tight">매체 믹스 성과 비교</h3>
                    </div>
                    <MediaMixSection records={filteredData} />
                  </Card>
                );
              })()}

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDashboardDragEnd}>
                <SortableContext items={dashboardLayout} strategy={verticalListSortingStrategy}>
                  <div className="space-y-8">
                    {dashboardLayout.map((blockId) => {
                      if (blockId === 'trend') {
                        return (
                          <SortableItem id="trend" key="trend">
                            <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                              <div className="flex justify-between items-center mb-10">
                                <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase tracking-tight">집행 속도 및 효율성 트렌드</h3>
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center gap-1.5 text-xs font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100">
                                    <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" /> 지출액
                                  </span>
                                  <span className="flex items-center gap-1.5 text-xs font-black text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                                    CPC 추이
                                  </span>
                                </div>
                              </div>
                              <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <ComposedChart data={dailyTrendData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="date" tick={{fontSize: 11, fontWeight: 700, fill: '#64748b'}} axisLine={false} tickLine={false} dy={10} />
                                    <YAxis yAxisId="left" tick={{fontSize: 11, fontWeight: 700, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="right" orientation="right" tick={{fontSize: 11, fontWeight: 700, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.08)', fontWeight: 800 }}/>
                                    <Bar yAxisId="left" dataKey="execution_amount" name="Daily Spend" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={32} />
                                    <Line yAxisId="right" type="monotone" dataKey="actual_cpc" name="Actual CPC" stroke="#0f172a" strokeWidth={3} dot={{r: 5, fill: '#fff', stroke: '#0f172a', strokeWidth: 2}} activeDot={{r: 7, strokeWidth: 0}} />
                                  </ComposedChart>
                                </ResponsiveContainer>
                              </div>
                            </Card>
                          </SortableItem>
                        );
                      }

                      if (blockId === 'share') {
                        return (
                          <SortableItem id="share" key="share">
                            <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                              <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase tracking-tight mb-8">매체별 점유율</h3>
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
                                          fill={['#2563eb', '#0f172a', '#10b981', '#f59e0b', '#94a3b8'][index % 5]}
                                          className="hover:opacity-80 transition-opacity outline-none"
                                        />
                                      ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend wrapperStyle={{ paddingTop: '32px' }} iconType="circle" />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            </Card>
                          </SortableItem>
                        );
                      }

                      if (blockId === 'budget') {
                        if (budgetProgressData.length === 0) return null;
                        return (
                          <SortableItem id="budget" key="budget">
                            <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                              <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase tracking-tight mb-10">Strategic Budget Alignment</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                                {budgetProgressData.map((item) => (
                                  <div key={item.id} className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                    <div className="flex justify-between items-end">
                                      <span className="text-sm font-black text-slate-900 uppercase truncate max-w-[200px]">{item.name}</span>
                                      <span className={cn(
                                        "text-xs font-black px-2 py-1 rounded-lg",
                                        item.percent > 90 ? "text-red-600 bg-red-50" : "text-blue-600 bg-blue-50"
                                      )}>{item.percent.toFixed(1)}%</span>
                                    </div>
                                    <Progress value={item.percent} className="h-2.5 bg-slate-100/50" indicatorClassName={item.percent > 90 ? "bg-red-500" : "bg-blue-600"} />
                                    <div className="flex justify-between text-[11px] font-black text-slate-400 font-outfit tracking-tighter">
                                      <span className="text-slate-900">₩{Math.round(item.spent).toLocaleString()}</span>
                                      <span>OF ₩{Math.round(item.budget).toLocaleString()}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </Card>
                          </SortableItem>
                        );
                      }

                      if (blockId === 'audience') {
                        return (
                          <SortableItem id="audience" key="audience">
                            <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                              <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase flex items-center gap-3 mb-10">
                                <Users size={24} className="text-blue-600"/> Audience Intelligence
                              </h3>
                              <div className="grid grid-cols-2 gap-8 h-[300px]">
                                <div className="flex flex-col">
                                  <p className="text-[10px] font-black text-center text-slate-400 uppercase tracking-widest mb-4">Age Lifecycle</p>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie data={ageData} innerRadius={50} outerRadius={80} dataKey="value" nameKey="name" stroke="none">
                                        {ageData.map((_, i) => <Cell key={i} fill={['#2563eb', '#60a5fa', '#93c5fd', '#bfdbfe'][i % 4]} />)}
                                      </Pie>
                                      <Tooltip />
                                      <Legend verticalAlign="bottom" height={36} iconType="rect" iconSize={8}/>
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="flex flex-col">
                                  <p className="text-[10px] font-black text-center text-slate-400 uppercase tracking-widest mb-4">Gender Binary</p>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie data={genderData} innerRadius={50} outerRadius={80} dataKey="value" nameKey="name" stroke="none">
                                        {genderData.map((_, i) => <Cell key={i} fill={['#0f172a', '#2563eb', '#94a3b8'][i % 3]} />)}
                                      </Pie>
                                      <Tooltip />
                                      <Legend verticalAlign="bottom" height={36} iconType="rect" iconSize={8}/>
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>
                            </Card>
                          </SortableItem>
                        );
                      }

                      if (blockId === 'creative') {
                        return (
                          <SortableItem id="creative" key="creative">
                            <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                              <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase flex items-center gap-3 mb-10">
                                <LayoutIcon size={24} className="text-blue-600"/> TOP 10 Creative Impact
                              </h3>
                              <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <ComposedChart data={creativeData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={120} tick={{fontSize: 10, fontWeight: 700, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Bar dataKey="spend" name="Investment" fill="#2563eb" radius={[0, 6, 6, 0]} barSize={16} />
                                    <Line dataKey="ctr" name="CTR Performance" stroke="#0f172a" strokeWidth={3} dot={false} />
                                  </ComposedChart>
                                </ResponsiveContainer>
                              </div>
                            </Card>
                          </SortableItem>
                        );
                      }

                      if (blockId === 'matrix') {
                        return (
                          <SortableItem id="matrix" key="matrix">
                            <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                              <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase flex items-center gap-3 mb-10">
                                <BarChart4 size={24} className="text-blue-600"/> Matrix Comparison Analytics
                              </h3>
                              <div className="overflow-hidden rounded-[32px] border border-slate-200">
                                <Table>
                                  <TableHeader className="bg-slate-900 border-none">
                                    <TableRow className="hover:bg-slate-900 border-none">
                                      <TableHead className="text-slate-400 font-black text-[10px] uppercase tracking-widest py-6 px-8">Vertical Solution</TableHead>
                                      <TableHead className="text-right text-slate-400 font-black text-[10px] uppercase tracking-widest py-6 px-8">Budget Fulfillment</TableHead>
                                      <TableHead className="text-right text-slate-400 font-black text-[10px] uppercase tracking-widest py-6 px-8">CPM/CPC Efficiency</TableHead>
                                      <TableHead className="text-right text-slate-400 font-black text-[10px] uppercase tracking-widest py-6 px-8">Interaction rate</TableHead>
                                      <TableHead className="text-center text-slate-400 font-black text-[10px] uppercase tracking-widest py-6 px-8">Fulfillment Level</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {selectedCampaign?.sub_campaigns?.map((sub) => {
                                      const progress = budgetProgressData.find(p => p.id === sub.id);
                                      // mapping_value 우선, excel_name은 deprecated fallback (CLAUDE.md 기준)
                                      const mKey = sub.mapping_value || sub.excel_name;
                                      const subData = filteredData.filter(d =>
                                        mKey
                                          ? (d.excel_campaign_name === mKey || d.mapping_value === mKey)
                                          : d.media === sub.media
                                      );
                                      const subSpent = subData.reduce((s, d) => s + (Number(d.execution_amount) || 0), 0);
                                      const subClicks = subData.reduce((s, d) => s + (Number(d.clicks) || 0), 0);
                                      const subImps = subData.reduce((s, d) => s + (Number(d.impressions) || 0), 0);
                                      const actualCpc = subClicks > 0 ? subSpent / subClicks : 0;
                                      const actualCtr = subImps > 0 ? (subClicks / subImps) * 100 : 0;
                                      const cpcStatus = sub.target_cpc ? (actualCpc <= sub.target_cpc ? 'Good' : 'High') : 'N/A';

                                      return (
                                        <TableRow key={sub.id} className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 last:border-none">
                                          <TableCell className="py-6 px-8 font-black text-slate-900">{mKey || sub.media}</TableCell>
                                          <TableCell className="py-6 px-8 text-right">
                                            <span className="text-slate-900 font-black block leading-none">₩{Math.round(subSpent).toLocaleString()}</span>
                                            <span className="text-slate-400 text-[10px] font-bold uppercase mt-1 block">TARGET ₩{sub.budget?.toLocaleString()}</span>
                                          </TableCell>
                                          <TableCell className="py-6 px-8 text-right">
                                            <span className={cn("font-black block leading-none", cpcStatus === 'Good' ? 'text-green-600' : 'text-orange-600')}>
                                              ₩{Math.round(actualCpc).toLocaleString()}
                                            </span>
                                            <span className="text-slate-400 text-[10px] font-bold uppercase mt-1 block">GOAL ₩{sub.target_cpc || '-'}</span>
                                          </TableCell>
                                          <TableCell className="py-6 px-8 text-right">
                                            <span className="text-slate-900 font-black block leading-none">{actualCtr.toFixed(2)}%</span>
                                            <span className="text-slate-400 text-[10px] font-bold uppercase mt-1 block">GOAL {sub.target_ctr || '-'}%</span>
                                          </TableCell>
                                          <TableCell className="py-6 px-8 text-center">
                                            <Badge className={cn(
                                              "font-black px-3 py-1 rounded-lg border-none shadow-sm",
                                              progress && progress.percent > 90 ? "bg-red-50 text-red-600" : "bg-blue-600 text-white"
                                            )}>
                                              {progress ? `${progress.percent.toFixed(0)}% PACING` : 'N/A'}
                                            </Badge>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </Card>
                          </SortableItem>
                        );
                      }

                      if (blockId === 'insights') {
                        const priorityColor = (p: string) =>
                          p === 'high' ? 'text-red-600 bg-red-50 border-red-100' :
                          p === 'medium' ? 'text-amber-600 bg-amber-50 border-amber-100' :
                          'text-slate-500 bg-slate-50 border-slate-200';
                        const priorityLabel = (p: string) =>
                          p === 'high' ? '긴급' : p === 'medium' ? '권장' : '참고';

                        return (
                          <SortableItem id="insights" key="insights">
                            <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                              <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
                                <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase flex items-center gap-3">
                                  <MessageSquare size={24} className="text-blue-600"/> Intelligence Synthesis
                                </h3>
                                <div className="flex items-center gap-3">
                                  <Button
                                    onClick={handleGenerateAiInsight}
                                    disabled={isGeneratingAi || filteredData.length === 0}
                                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 rounded-2xl font-black shadow-lg shadow-blue-500/20 transition-all"
                                  >
                                    {isGeneratingAi
                                      ? <><Loader2 size={16} className="mr-2 animate-spin" />AI 분석 중...</>
                                      : <><Sparkles size={16} className="mr-2" />AI 성과 분석</>
                                    }
                                  </Button>
                                  <Button onClick={handleSaveInsights} variant="outline" className="rounded-2xl font-black border-slate-200">
                                    메모 저장
                                  </Button>
                                </div>
                              </div>

                              {/* Stale 인사이트 배너 — 새 데이터 업로드 후 AI 미실행 시 표시 */}
                              <AnimatePresence>
                                {aiInsight?.is_stale && !staleBannerDismissed && (
                                  <StaleInsightBanner
                                    onReanalyze={handleGenerateAiInsight}
                                    onDismiss={() => setStaleBannerDismissed(true)}
                                  />
                                )}
                              </AnimatePresence>

                              {/* AI 분석 결과 */}
                              {aiInsight && (
                                <div className="mb-8 space-y-6">
                                  {/* 요약 */}
                                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6">
                                    <div className="flex items-center gap-2 mb-3">
                                      <Sparkles size={16} className="text-blue-600" />
                                      <span className="text-xs font-black text-blue-600 uppercase tracking-widest">AI 요약</span>
                                      <span className="ml-auto text-[10px] font-bold text-slate-400">
                                        {new Date(aiInsight.generated_at).toLocaleString('ko-KR')} · {aiInsight.model}
                                      </span>
                                    </div>
                                    <p className="text-slate-700 font-medium leading-relaxed">{aiInsight.summary}</p>
                                  </div>

                                  {/* 이상 탐지 */}
                                  {aiInsight.anomalies?.length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <AlertTriangle size={14} className="text-amber-500" /> 이상 탐지
                                      </h4>
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {aiInsight.anomalies.map((a: any, i: number) => (
                                          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                                            <div className="flex items-center gap-2 mb-2">
                                              {a.direction === 'spike'
                                                ? <ArrowUp size={14} className="text-red-500" />
                                                : <ArrowDown size={14} className="text-blue-500" />
                                              }
                                              <span className="text-xs font-black text-slate-600 uppercase">{a.metric}</span>
                                              <span className="text-xs text-slate-400 ml-auto">{a.date}</span>
                                            </div>
                                            <p className="text-sm font-medium text-slate-600 leading-snug">{a.description}</p>
                                            <div className="mt-3 flex items-center gap-2 text-xs font-black">
                                              <span className="text-slate-900">{a.value?.toLocaleString()}</span>
                                              <span className="text-slate-300">vs</span>
                                              <span className="text-slate-400">{a.baseline?.toLocaleString()} 기준</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 권장사항 */}
                                  {aiInsight.recommendations?.length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">권장사항</h4>
                                      <div className="space-y-3">
                                        {aiInsight.recommendations.map((r: any, i: number) => (
                                          <div key={i} className="flex items-start gap-4 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                                            <span className={cn('text-[10px] font-black px-2.5 py-1 rounded-xl border mt-0.5 shrink-0', priorityColor(r.priority))}>
                                              {priorityLabel(r.priority)}
                                            </span>
                                            <div>
                                              <p className="font-black text-slate-800 text-sm">{r.title}</p>
                                              <p className="text-slate-500 text-sm mt-1 leading-relaxed">{r.description}</p>
                                              {r.action && (
                                                <p className="text-blue-600 text-xs font-bold mt-2 flex items-center gap-1">
                                                  <Check size={11} /> {r.action}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* 수동 메모 */}
                              <div>
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">수동 메모</p>
                                <textarea
                                  className="w-full min-h-[140px] p-6 rounded-[20px] border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all text-slate-700 text-base font-medium placeholder:text-slate-300"
                                  placeholder="성과 결과를 종합하고 전략적 방향을 기록하세요..."
                                  value={campaignInsights}
                                  onChange={(e) => setCampaignInsights(e.target.value)}
                                />
                              </div>
                            </Card>
                          </SortableItem>
                        );
                      }

                      if (blockId === 'dmp') {
                        // DMP 집계 (plain-JS Map, no Danfo)
                        const DMP_FEE_RATES: Record<string, number> = {
                          SKP: 0.10, KB: 0.10, LOTTE: 0.08, TG360: 0.10,
                          BC: 0, SH: 0, WIFI: 0, DIRECT: 0, 'N/A': 0,
                        };
                        const calcDmpFee = (type: string, net: number) =>
                          Math.round(net * (DMP_FEE_RATES[type] ?? 0));
                        const formatFeeRate = (type: string): string => {
                          const rate = DMP_FEE_RATES[type] ?? 0;
                          return rate === 0 ? '—' : `${(rate * 100).toFixed(0)}%`;
                        };
                        const dmpLabel: Record<string, string> = {
                          SKP: 'SKP', KB: 'KB', LOTTE: 'LOTTE', TG360: 'TG360',
                          WIFI: '실내위치 (WIFI)', BC: 'BC', SH: 'SH',
                          DIRECT: '직접 집행', 'N/A': '직접 집행',
                        };
                        const dmpOrder = ['SKP', 'KB', 'LOTTE', 'TG360', 'WIFI', 'BC', 'SH', 'DIRECT', 'N/A'];

                        const dmpMap = new Map<string, { execution: number; net: number; dmpFee: number; impressions: number; clicks: number; count: number }>();
                        filteredData.forEach(r => {
                          const key = r.dmp_type || 'DIRECT';
                          const prev = dmpMap.get(key) ?? { execution: 0, net: 0, dmpFee: 0, impressions: 0, clicks: 0, count: 0 };
                          const netVal = r.net_amount || 0;
                          dmpMap.set(key, {
                            execution: prev.execution + (r.execution_amount || 0),
                            net: prev.net + netVal,
                            dmpFee: prev.dmpFee + calcDmpFee(key, netVal),
                            impressions: prev.impressions + (r.impressions || 0),
                            clicks: prev.clicks + (r.clicks || 0),
                            count: prev.count + 1,
                          });
                        });

                        const dmpRows = dmpOrder
                          .filter(k => dmpMap.has(k))
                          .map(k => ({ key: k, label: dmpLabel[k] ?? k, ...dmpMap.get(k)! }));

                        // Merge DIRECT + N/A into one row
                        const directRow = dmpRows.filter(r => r.key === 'DIRECT' || r.key === 'N/A')
                          .reduce<{ key: string; label: string; execution: number; net: number; dmpFee: number; impressions: number; clicks: number; count: number } | null>((acc, r) => {
                            if (!acc) return { ...r, key: 'DIRECT', label: '직접 집행' };
                            return { ...acc, execution: acc.execution + r.execution, net: acc.net + r.net, dmpFee: acc.dmpFee + r.dmpFee, impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks, count: acc.count + r.count };
                          }, null);
                        const dmpOnlyRows = dmpRows.filter(r => r.key !== 'DIRECT' && r.key !== 'N/A');
                        const allDmpRows = directRow ? [...dmpOnlyRows, directRow] : dmpOnlyRows;

                        const totalExecution = allDmpRows.reduce((s, r) => s + r.execution, 0);
                        const totalNet = allDmpRows.reduce((s, r) => s + r.net, 0);

                        if (allDmpRows.length === 0) return null;

                        return (
                          <SortableItem id="dmp" key="dmp">
                            <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                              <div className="flex items-center gap-3 mb-8">
                                <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                                  <Receipt size={20} />
                                </div>
                                <div>
                                  <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase tracking-tight">DMP 집행 분석</h3>
                                  <p className="text-xs text-slate-400 mt-0.5 font-medium">광고 그룹명 키워드 기반 자동 분류 · WIFI = 실내위치</p>
                                </div>
                              </div>

                              {/* Summary strip */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                                {[
                                  { label: 'DMP 종류', value: String(dmpOnlyRows.length), unit: '개', color: 'text-indigo-600' },
                                  { label: '총 집행액', value: `₩${totalExecution.toLocaleString()}`, unit: '', color: 'text-slate-800' },
                                  { label: '매체 순액', value: `₩${totalNet.toLocaleString()}`, unit: '', color: 'text-blue-600' },
                                  { label: 'DMP 수수료', value: `₩${allDmpRows.reduce((s, r) => s + r.dmpFee, 0).toLocaleString()}`, unit: '', color: 'text-orange-600' },
                                ].map(c => (
                                  <div key={c.label} className="bg-slate-50 rounded-2xl p-4">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{c.label}</p>
                                    <p className={cn("text-lg font-black", c.color)}>{c.value}<span className="text-sm ml-0.5">{c.unit}</span></p>
                                  </div>
                                ))}
                              </div>

                              <div className="overflow-x-auto rounded-xl border border-slate-100">
                                <Table>
                                  <TableHeader className="bg-slate-50/80">
                                    <TableRow className="hover:bg-transparent border-b border-slate-100">
                                      <TableHead className="px-6 font-black text-slate-700 min-w-[160px]">DMP 종류</TableHead>
                                      <TableHead className="font-black text-slate-700 min-w-[120px] text-xs">감지 키워드</TableHead>
                                      <TableHead className="text-right font-black text-slate-700 min-w-[140px]">집행액 (Gross)</TableHead>
                                      <TableHead className="text-right font-black text-slate-700 min-w-[130px]">순액 (Net)</TableHead>
                                      <TableHead className="text-right font-black text-slate-700 min-w-[70px]">요율</TableHead>
                                      <TableHead className="text-right font-black text-slate-700 min-w-[120px]">DMP 수수료</TableHead>
                                      <TableHead className="text-right font-black text-slate-700 min-w-[80px]">노출</TableHead>
                                      <TableHead className="text-right font-black text-slate-700 min-w-[70px]">클릭</TableHead>
                                      <TableHead className="text-center font-black text-slate-700 min-w-[60px]">건수</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {allDmpRows.map((row) => {
                                      const isDirect = row.key === 'DIRECT' || row.key === 'N/A';
                                      const keywordHint: Record<string, string> = {
                                        SKP: 'SKP', KB: 'KB', LOTTE: 'LOTTE', TG360: 'TG360',
                                        WIFI: 'WIFI, 실내위치', BC: 'BC', SH: 'SH', DIRECT: '—',
                                      };
                                      return (
                                        <TableRow key={row.key} className={cn("hover:bg-slate-50/60 transition-colors border-b border-slate-50", isDirect && "opacity-60")}>
                                          <TableCell className="px-6 font-bold text-slate-700">
                                            {isDirect ? (
                                              <span className="text-slate-400">{row.label}</span>
                                            ) : (
                                              <span className="inline-flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                                                {row.label}
                                              </span>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-xs text-slate-400 font-mono">{keywordHint[row.key] ?? '—'}</TableCell>
                                          <TableCell className="text-right font-medium text-slate-700">₩{row.execution.toLocaleString()}</TableCell>
                                          <TableCell className="text-right font-bold text-blue-600">₩{row.net.toLocaleString()}</TableCell>
                                          <TableCell className="text-right text-slate-400 font-mono text-xs">{formatFeeRate(row.key)}</TableCell>
                                          <TableCell className="text-right font-bold text-orange-600">
                                            {row.dmpFee > 0 ? `₩${row.dmpFee.toLocaleString()}` : '—'}
                                          </TableCell>
                                          <TableCell className="text-right text-slate-500 font-mono text-xs">{row.impressions.toLocaleString()}</TableCell>
                                          <TableCell className="text-right text-slate-500 font-mono text-xs">{row.clicks.toLocaleString()}</TableCell>
                                          <TableCell className="text-center text-slate-400 font-mono text-xs">{row.count}</TableCell>
                                        </TableRow>
                                      );
                                    })}
                                    {/* 합계 */}
                                    <TableRow className="bg-slate-50 border-t-2 border-slate-200 font-black">
                                      <TableCell className="px-6 font-black text-slate-700">합계</TableCell>
                                      <TableCell />
                                      <TableCell className="text-right font-black text-slate-800">₩{totalExecution.toLocaleString()}</TableCell>
                                      <TableCell className="text-right font-black text-blue-700">₩{totalNet.toLocaleString()}</TableCell>
                                      <TableCell className="text-right text-slate-400 text-xs">—</TableCell>
                                      <TableCell className="text-right font-black text-orange-700">₩{allDmpRows.reduce((s, r) => s + r.dmpFee, 0).toLocaleString()}</TableCell>
                                      <TableCell className="text-right font-black text-slate-600 font-mono text-xs">
                                        {allDmpRows.reduce((s, r) => s + r.impressions, 0).toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-right font-black text-slate-600 font-mono text-xs">
                                        {allDmpRows.reduce((s, r) => s + r.clicks, 0).toLocaleString()}
                                      </TableCell>
                                      <TableCell className="text-center text-slate-400 font-mono text-xs">
                                        {allDmpRows.reduce((s, r) => s + r.count, 0)}
                                      </TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              </div>
                            </Card>
                          </SortableItem>
                        );
                      }

                      return null;
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
