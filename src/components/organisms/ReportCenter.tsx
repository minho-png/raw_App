"use client";

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BudgetPacingCards } from '@/components/molecules/BudgetPacingCards';
import { FileUploader } from '@/components/molecules/FileUploader';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  BarChart4,
  Download,
  Layers,
} from "lucide-react";
import { useToast } from '@/context/ToastContext';
import { ColumnMappingPreview } from '@/components/molecules/ColumnMappingPreview';
import { MediaMixSection } from '@/components/molecules/MediaMixSection';
import { BudgetStatus, PerformanceRecord, MediaProvider } from "@/types";
import { useCampaignStore } from '@/store/useCampaignStore';
import { cn } from '@/lib/utils';
import { getPerformanceDataAction, updatePerformanceDataAction, savePerformanceData } from '@/server/actions/settlement';
import { saveCampaignAction } from '@/server/actions/campaign';
import { getDmpRulesAction } from '@/server/actions/dmpRules';
import { CalculationService } from "@/services/calculationService";
import { BudgetSettingsModal } from "./BudgetSettingsModal";
import { ReportService } from "@/services/reportService";
import { ReportBuilderModal, type ReportBuilderConfig } from "./ReportBuilderModal";
import { UploadSection } from "./UploadSection";
import { TableSection } from "./TableSection";
import { DashboardSection } from "./DashboardSection";
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { TableFilterBar } from '@/components/molecules/TableFilterBar';
import { DataTable } from '@/components/molecules/DataTable';
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
  arrayMove,
} from '@dnd-kit/sortable';
import { SortableItem } from '@/components/molecules/SortableItem';
import { TrendBlock } from '@/components/organisms/dashboard/TrendBlock';
import { ShareBlock } from '@/components/organisms/dashboard/ShareBlock';
import { BudgetBlock } from '@/components/organisms/dashboard/BudgetBlock';
import type { BudgetProgressItem } from '@/components/organisms/dashboard/BudgetBlock';
import { AudienceBlock } from '@/components/organisms/dashboard/AudienceBlock';
import { CreativeBlock } from '@/components/organisms/dashboard/CreativeBlock';
import { MatrixBlock } from '@/components/organisms/dashboard/MatrixBlock';
import { InsightsBlock } from '@/components/organisms/dashboard/InsightsBlock';
import { DmpBlock } from '@/components/organisms/dashboard/DmpBlock';

// Block registry — keyed by blockId from dashboardLayout
const BLOCK_COMPONENTS: Record<string, React.ComponentType<any>> = {
  trend:    TrendBlock,
  share:    ShareBlock,
  budget:   BudgetBlock,
  audience: AudienceBlock,
  creative: CreativeBlock,
  matrix:   MatrixBlock,
  insights: InsightsBlock,
  dmp:      DmpBlock,
};

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
  const [isReportBuilderOpen, setIsReportBuilderOpen] = useState(false);

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

  const handleSaveInsights = useCallback(async (value: string) => {
    if (!selectedCampaign) return;
    const updated = { ...selectedCampaign, insights: value };
    const result = await saveCampaignAction(updated);
    if (result.success && result.campaigns) {
      setCampaigns(result.campaigns);
      toast.success('인사이트 저장 완료');
    } else {
      toast.error('저장 실패', '잠시 후 다시 시도해 주세요.');
    }
  }, [selectedCampaign, setCampaigns, toast]);

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

      const { rules: dmpRules } = await getDmpRulesAction();

      const { raw, report } = CalculationService.processWithDanfo(
        filteredRaw,
        selectedCampaignId,
        activeMedia,
        10, // Default fee rate if not configured
        groupByColumns,
        undefined,
        configs,
        dmpRules
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

  const [tablePage, setTablePage] = useState(0);
  const TABLE_PAGE_SIZE = 50;

  // 테이블 전용 필터 state (차트에는 영향 없음 — filteredData와 분리)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMedia, setFilterMedia] = useState('all');
  const [filterDmp, setFilterDmp] = useState('all');
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

  const handleGenerateFromConfig = useCallback((config: ReportBuilderConfig) => {
    if (!selectedCampaign || filteredData.length === 0) return;
    try {
      const html = ReportService.generateHtmlReport(
        selectedCampaign,
        filteredData,
        budgetStatus,
        config
      );
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.client_name || selectedCampaign.campaign_name}_성과보고서_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setIsReportBuilderOpen(false);
    } catch (error) {
      console.error('Report generation failed:', error);
      toast.error('리포트 생성 실패', '잠시 후 다시 시도해 주세요.');
    }
  }, [selectedCampaign, filteredData, budgetStatus]);

  // CSV 내보내기 — 브랜딩 마케터 + IMC 마케터 요청
  const handleCsvExport = (numericOnly = false) => {
    if (filteredData.length === 0) {
      toast.warning('내보낼 데이터 없음', '먼저 데이터를 처리하거나 DB에서 불러오세요.');
      return;
    }
    const headers = ['날짜', '캠페인명', '매체', 'DMP', '노출수', '클릭수', 'CTR', 'CPC', 'CPM', '집행금액'];
    const rows = filteredData.map(r => {
      const imps = r.impressions ?? 0;
      const clicks = r.clicks ?? 0;
      const spend = r.execution_amount ?? 0;
      const ctr = imps > 0 ? ((clicks / imps) * 100).toFixed(2) : '0.00';
      const cpc = clicks > 0 ? Math.round(spend / clicks) : 0;
      const cpm = imps > 0 ? Math.round((spend / imps) * 1000) : 0;
      const roundedSpend = Math.round(spend);

      const ctrValue = numericOnly ? ctr : `${ctr}%`;
      const cpcValue = numericOnly ? String(cpc) : `₩${cpc}`;
      const cpmValue = numericOnly ? String(cpm) : `₩${cpm}`;
      const spendValue = numericOnly ? String(roundedSpend) : `₩${roundedSpend}`;

      return [
        new Date(r.date).toISOString().slice(0, 10),
        r.excel_campaign_name || r.ad_group_name || '',
        r.media || '',
        r.dmp_type || 'DIRECT',
        imps,
        clicks,
        ctrValue,
        cpcValue,
        cpmValue,
        spendValue,
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const bom = '\uFEFF'; // 한글 깨짐 방지
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCampaign?.campaign_name ?? 'report'}_${numericOnly ? 'pivot' : 'display'}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(
      'CSV 내보내기 완료',
      `${filteredData.length.toLocaleString()}건이 ${numericOnly ? '숫자형(피벗용)' : '표시형'} 포맷으로 다운로드되었습니다.`
    );
  };

  const formatDate = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

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

  const getBlockProps = useCallback((blockId: string) => {
    switch (blockId) {
      case 'trend':    return { filteredData };
      case 'share':    return { filteredData };
      case 'budget':   return { items: budgetProgressData as BudgetProgressItem[] };
      case 'audience': return { filteredData };
      case 'creative': return { filteredData };
      case 'matrix':   return { subCampaigns: selectedCampaign?.sub_campaigns ?? [], filteredData, budgetProgressData };
      case 'insights': return {
        campaignId: selectedCampaignId ?? '',
        hasData: filteredData.length > 0,
        memoValue: selectedCampaign?.insights ?? '',
        onMemoSave: handleSaveInsights,
      };
      case 'dmp':      return { filteredData };
      default:         return {};
    }
  }, [filteredData, budgetProgressData, selectedCampaign, selectedCampaignId, handleSaveInsights]);

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
    <div className="animate-in fade-in space-y-10 p-10 duration-1000">
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
            className="rounded-2xl border border-slate-200 bg-white h-12 px-6 font-bold shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
          >
            {isLoadingDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4 text-blue-500" />}
            DB 데이터 동기화
          </Button>
          {/* 날짜 범위 필터 — 마케터 민수 요청: 정산 기간 필터링 */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 h-12 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all">
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
            className="rounded-2xl border border-slate-200 bg-white h-12 px-6 font-bold shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
          >
            <Settings2 className="mr-2 h-4 w-4 text-blue-600" /> 예산 및 KPI 관리
          </Button>
          <Button
            variant="outline"
            onClick={() => handleCsvExport(false)}
            disabled={filteredData.length === 0}
            className="rounded-2xl border border-slate-200 bg-white h-12 px-6 font-bold shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
          >
            <Download className="mr-2 h-4 w-4 text-green-600" /> CSV(표시형)
          </Button>
          <Button
            variant="outline"
            onClick={() => handleCsvExport(true)}
            disabled={filteredData.length === 0}
            className="rounded-2xl border border-slate-200 bg-white h-12 px-6 font-bold shadow-sm transition-all hover:bg-slate-50 hover:border-slate-300"
          >
            <Download className="mr-2 h-4 w-4 text-emerald-600" /> CSV(숫자형)
          </Button>
          <Button
            onClick={() => setIsReportBuilderOpen(true)}
            disabled={filteredData.length === 0}
            className="rounded-2xl bg-blue-600 hover:bg-blue-700 text-white h-12 px-8 font-black shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.05] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <BarChart4 className="mr-2 h-5 w-5" /> 리포트 내보내기
          </Button>
        </div>
      </header>

      {/* ── 캠페인 설정 요약 카드 (버튼 없이 즉시 표시) ── */}
      {selectedCampaign && selectedCampaign.sub_campaigns && selectedCampaign.sub_campaigns.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-indigo-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">캠페인 설정</span>
              <span className="text-xs text-slate-400">— {selectedCampaign.sub_campaigns.length}개 서브캠페인</span>
            </div>
            <button
              onClick={() => setIsBudgetModalOpen(true)}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
            >
              <Settings2 size={12} /> 설정 편집
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-0 divide-x divide-slate-100">
            {selectedCampaign.sub_campaigns.filter(s => s.enabled !== false).map(sub => (
              <div key={sub.id} className="px-5 py-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{sub.media}</p>
                <p className="text-sm font-bold text-slate-800 truncate mt-0.5">{sub.mapping_value || sub.excel_name || '—'}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-slate-500">예산 <span className="font-bold text-slate-700">₩{(sub.budget || 0).toLocaleString()}</span></span>
                  <span className="text-xs text-slate-400">수수료 <span className="font-bold text-slate-600">{sub.fee_rate ?? 0}%</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      <ReportBuilderModal
        isOpen={isReportBuilderOpen}
        onClose={() => setIsReportBuilderOpen(false)}
        campaignName={selectedCampaign?.campaign_name ?? ''}
        onGenerate={handleGenerateFromConfig}
      />

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
            <UploadSection
              rawParsedData={rawParsedData}
              activeMedia={activeMedia}
              setActiveMedia={setActiveMedia}
              groupByColumns={groupByColumns}
              toggleGroupBy={toggleGroupBy}
              setIsBudgetModalOpen={setIsBudgetModalOpen}
              handleProcessData={handleProcessData}
              isProcessing={isProcessing}
              handleAnalysisComplete={handleAnalysisComplete}
              formatDate={formatDate}
            />
          )}

          {activeTabStep === 'processing' && (
            <TableSection
              filteredData={filteredData}
              tableFilteredData={tableFilteredData}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filterMedia={filterMedia}
              setFilterMedia={setFilterMedia}
              filterDmp={filterDmp}
              setFilterDmp={setFilterDmp}
              mediaOptions={mediaOptions}
              dmpOptions={dmpOptions}
              editingCell={editingCell}
              setEditingCell={setEditingCell}
              handleUpdateAmount={handleUpdateAmount}
              isUpdating={isUpdating}
              tablePage={tablePage}
              setTablePage={setTablePage}
              TABLE_PAGE_SIZE={TABLE_PAGE_SIZE}
              handleCsvExport={handleCsvExport}
              handleSaveProcessedData={handleSaveProcessedData}
              isSavingReport={isSavingReport}
              setActiveTabStep={setActiveTabStep}
              setIsBudgetModalOpen={setIsBudgetModalOpen}
            />
          )}

          {activeTabStep === 'dashboard' && (
            <DashboardSection
              filteredData={filteredData}
              filterStartDate={filterStartDate}
              filterEndDate={filterEndDate}
              setFilterStartDate={setFilterStartDate}
              setFilterEndDate={setFilterEndDate}
              setActiveTabStep={setActiveTabStep}
              handleFetchDbData={handleFetchDbData}
              isLoadingDb={isLoadingDb}
              dashboardLayout={dashboardLayout}
              sensors={sensors}
              handleDashboardDragEnd={handleDashboardDragEnd}
              getBlockProps={getBlockProps}
              BLOCK_COMPONENTS={BLOCK_COMPONENTS}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
