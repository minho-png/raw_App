"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BudgetPacingCards } from '@/components/molecules/BudgetPacingCards';
import { FileUploader } from '@/components/molecules/FileUploader';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  BarChart4
} from "lucide-react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { BudgetStatus, PerformanceRecord, MediaProvider } from "@/types";
import { useCampaignStore } from '@/store/useCampaignStore';
import { cn } from '@/lib/utils';
import { getPerformanceDataAction, updatePerformanceDataAction, savePerformanceData } from '@/server/actions/settlement';
import { getCampaignsAction, saveCampaignAction } from '@/server/actions/campaign';
import { CalculationService } from "@/services/calculationService";
import { BudgetSettingsModal } from "./BudgetSettingsModal";
import { ReportService } from "@/services/reportService";
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
  const { campaigns, selectedCampaignId, selectCampaign, updateCampaign, addCampaign, activeTab, setActiveTab, refreshCampaigns, setCampaigns, setIsSyncing } = useCampaignStore();
  const selectedCampaign = campaigns.find(c => c.campaign_id === selectedCampaignId);
  
  const [processedData, setProcessedData] = useState<PerformanceRecord[]>([]);
  const [reportType, setReportType] = useState('daily');
  const [activeTabStep, setActiveTabStep] = useState('source');
  const [activeMedia, setActiveMedia] = useState<MediaProvider>('네이버GFA');
  const [groupByColumns, setGroupByColumns] = useState<string[]>(['date_raw']); 
  const [rawParsedData, setRawParsedData] = useState<any[]>([]);

  const suggestedExcelNames = useMemo(() => {
    if (rawParsedData.length === 0) return [];
    const firstRow = rawParsedData[0];
    const keys = Object.keys(firstRow);
    
    // Strict priority list for campaign-related columns
    const priorityKeywords = ['캠페인명', '캠페인 이름', '캠페인', 'Campaign Name', 'Campaign'];
    const excludeKeywords = ['소재', 'Creative', '그룹', 'Group', '번호', 'ID', '날짜', 'Date'];

    const campaignCol = keys.find(k => 
      priorityKeywords.some(pk => k.includes(pk)) && 
      !excludeKeywords.some(ek => k.includes(ek))
    ) || keys.find(k => priorityKeywords.some(pk => k.includes(pk))) || keys[0];

    // Log the selected column for debugging if needed (internal)
    const names = rawParsedData.map(r => String(r[campaignCol])).filter(Boolean);
    return Array.from(new Set(names)).sort();
  }, [rawParsedData]);
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

  const defaultDashboardLayout = useMemo(
    () => ['trend', 'share', 'budget', 'audience', 'creative', 'matrix', 'insights'],
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
    }
    alert('인사이트가 저장되었습니다.');
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
        } else {
          alert('DB 업데이트에 실패했습니다.');
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
        // Replace current data with DB data for the selected campaign
        setProcessedData(prev => [
          ...prev.filter(d => d.campaign_id !== selectedCampaignId),
          ...result.data
        ]);
        alert(`${result.data.length}건의 데이터를 DB에서 성공적으로 불러왔습니다.`);
      } else {
        alert('데이터를 불러오는데 실패했습니다.');
      }
    } catch (error) {
      console.error('Fetch DB data failed:', error);
      alert('데이터 요청 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingDb(false);
    }
  };

  // Filter data by selected campaign
  const filteredData = useMemo(() => {
    return processedData.filter(d => d.campaign_id === selectedCampaignId);
  }, [processedData, selectedCampaignId]);

  const totalBudget = useMemo(() => {
    if (!selectedCampaign || !selectedCampaign.sub_campaigns) return 0;
    return selectedCampaign.sub_campaigns
      .filter(sub => sub.enabled !== false) // Ignore disabled media
      .reduce((sum, sub) => sum + (sub.budget || 0), 0);
  }, [selectedCampaign]);

  // Derived stats for BudgetPacingCards
  const budgetStatus: BudgetStatus = useMemo(() => {
    const totalExecution = filteredData.reduce((sum, r) => sum + r.execution_amount, 0);
    const totalClicks = filteredData.reduce((sum, r) => sum + r.clicks, 0);
    const totalImpressions = filteredData.reduce((sum, r) => sum + r.impressions, 0);
    
    const spent = totalExecution;
    const total = totalBudget;
    const remaining = total - spent;
    
    const burnRate = total > 0 ? (spent / total) * 100 : 0;
    const actualCpc = totalClicks > 0 ? spent / totalClicks : 0;
    const actualCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

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
      pacing_index: burnRate > 50 ? 110 : 95,
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

      // Filter raw data to only include enabled media/campaigns
      // If no sub-campaigns are defined, we check against the activeMedia
      // If sub-campaigns are defined, we only include those that match enabled excel_names
      const filteredRaw = rawParsedData.filter(row => {
        // This is a simplified check; might need more robust matching logic
        const rowCamp = String(row.excel_campaign_name || row['캠페인'] || row['캠페인명']);
        if (selectedCampaign?.sub_campaigns && selectedCampaign.sub_campaigns.length > 0) {
          return enabledExcelNames.has(rowCamp);
        }
        return true; // If no sub-campaigns, process all (standard behavior)
      });

      const { raw, report } = CalculationService.processWithDanfo(
        filteredRaw,
        selectedCampaignId,
        activeMedia,
        10, // Default fee rate if not configured
        groupByColumns,
        undefined,
        configs
      );
      
      setProcessedData(report);
      setActiveTabStep('processing');
    } catch (error) {
      console.error('Processing failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const [isSavingReport, setIsSavingReport] = useState(false);
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
        alert('분석된 리포트 데이터가 DB에 저장되었습니다.');
      } else {
        alert('저장 실패: ' + res.error);
      }
    } catch (err) {
      console.error(err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleGenerateReport = () => {
    if (!selectedCampaign || filteredData.length === 0) return;
    
    try {
      const html = ReportService.generateHtmlReport(selectedCampaign, filteredData, budgetStatus);
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
      alert('리포트 생성 중 오류가 발생했습니다.');
    }
  };

  // Chart Data Derivation
  const dailyTrendData = useMemo(() => {
    // Process filteredData into { date, execution_amount, actual_cpc }
    const grouped = filteredData.reduce((acc: any, curr) => {
      const dateStr = new Date(curr.date).toLocaleDateString();
      if (!acc[dateStr]) {
        acc[dateStr] = { date: dateStr, execution_amount: 0, clicks: 0 };
      }
      acc[dateStr].execution_amount += curr.execution_amount;
      acc[dateStr].clicks += curr.clicks;
      return acc;
    }, {});

    return Object.values(grouped).map((v: any) => ({
      ...v,
      actual_cpc: v.clicks > 0 ? Math.round(v.execution_amount / v.clicks) : 0
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
      acc[dmp] = (acc[dmp] || 0) + curr.execution_amount;
      return acc;
    }, {});

    return Object.entries(shares).map(([name, value]) => ({ name, value }));
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
          .reduce((sum, d) => sum + d.execution_amount, 0);
        
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
      acc[age] = (acc[age] || 0) + curr.execution_amount;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  const genderData = useMemo(() => {
    const counts = filteredData.reduce((acc: any, curr) => {
      const g = curr.gender || 'Unknown';
      acc[g] = (acc[g] || 0) + curr.execution_amount;
      return acc;
    }, {});
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  const creativeData = useMemo(() => {
    const data = filteredData.reduce((acc: any, curr) => {
      const c = curr.creative_name || 'N/A';
      if (!acc[c]) acc[c] = { name: c, spend: 0, clicks: 0, imps: 0 };
      acc[c].spend += curr.execution_amount;
      acc[c].clicks += curr.clicks;
      acc[c].imps += curr.impressions;
      return acc;
    }, {});
    return Object.values(data).map((v: any) => ({
      ...v,
      ctr: v.imps > 0 ? (v.clicks / v.imps) * 100 : 0
    })).sort((a, b) => b.spend - a.spend).slice(0, 10);
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
          <Button 
            variant="outline" 
            onClick={() => setIsBudgetModalOpen(true)}
            className="rounded-2xl border-slate-200 bg-white h-12 px-6 font-bold shadow-sm transition-all border-2"
          >
            <Settings2 className="mr-2 h-4 w-4 text-blue-600" /> 예산 및 KPI 관리
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
                  <Button 
                    className="bg-green-600 hover:bg-green-700 h-14 px-8 rounded-2xl font-black text-lg shadow-xl shadow-green-600/20 transition-all hover:translate-y-[-4px] active:translate-y-0" 
                    onClick={handleSaveProcessedData}
                    disabled={isSavingReport || processedData.length === 0}
                  >
                    {isSavingReport ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <Check size={20} className="mr-2 stroke-[3px]"/>}
                    최종 변경 사항 반영
                  </Button>
                </div>

                <div className="overflow-hidden rounded-[40px] border border-slate-200 bg-white shadow-sm max-h-[600px] overflow-y-auto custom-scrollbar">
                  <Table>
                    <TableHeader className="bg-slate-900 sticky top-0 z-20">
                      <TableRow className="hover:bg-slate-900 border-none">
                        <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-8">집행 일자</TableHead>
                        <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-8">캠페인 메타</TableHead>
                        <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-8">기술 스택</TableHead>
                        <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-8 text-right">노출수</TableHead>
                        <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-8 text-right">클릭수</TableHead>
                        <TableHead className="text-blue-400 font-black text-xs uppercase tracking-widest py-6 px-8 text-right bg-slate-800/50">집행 금액 (KRW)</TableHead>
                        <TableHead className="text-slate-400 font-black text-xs uppercase tracking-widest py-6 px-8">무결성</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.map((record) => (
                        <TableRow key={record._id || Math.random()} className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 last:border-none group">
                          <TableCell className="py-6 px-8 font-bold text-slate-500">{formatDate(record.date)}</TableCell>
                          <TableCell className="py-6 px-8 font-black text-slate-900">{record.excel_campaign_name || record.ad_group_name}</TableCell>
                          <TableCell className="py-6 px-8">
                            <Badge className="bg-slate-100 text-slate-600 font-black border-none px-3 py-1 rounded-lg">
                              {record.dmp || record.dmp_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-6 px-8 text-right font-bold text-slate-600">{record.impressions.toLocaleString()}</TableCell>
                          <TableCell className="py-6 px-8 text-right font-bold text-slate-600">{record.clicks.toLocaleString()}</TableCell>
                          
                          <TableCell className="py-6 px-8 text-right bg-blue-50/30">
                            {editingCell?.id === record._id ? (
                              <Input 
                                type="number"
                                autoFocus
                                className="w-32 h-10 text-right font-black border-2 border-blue-500 rounded-xl bg-white shadow-xl"
                                value={editingCell?.value || 0}
                                onChange={(e) => setEditingCell({ id: record._id!, value: Number(e.target.value) })}
                                onBlur={() => editingCell && handleUpdateAmount(record._id!, editingCell.value)}
                                onKeyDown={(e) => e.key === 'Enter' && editingCell && handleUpdateAmount(record._id!, editingCell.value)}
                              />
                            ) : (
                              <div 
                                className="cursor-pointer hover:bg-blue-600 hover:text-white px-4 py-2 rounded-xl transition-all font-black text-lg text-blue-600 border-2 border-transparent hover:border-blue-700"
                                onDoubleClick={() => setEditingCell({ id: record._id!, value: record.cost || record.execution_amount })}
                              >
                                ₩{Math.round(record.cost || record.execution_amount).toLocaleString()}
                              </div>
                            )}
                          </TableCell>

                          <TableCell className="py-6 px-8">
                            {record.is_edited ? (
                              <Badge className="bg-orange-100 text-orange-700 border-orange-200 font-bold px-3 py-1 rounded-lg flex items-center gap-1 w-fit">
                                <Edit3 size={10} /> 검증완료
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-400 border-slate-200 font-bold px-3 py-1 rounded-lg">원본데이터</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
                                      const subData = filteredData.filter(d => sub.excel_name ? d.excel_campaign_name === sub.excel_name : d.media === sub.media);
                                      const subSpent = subData.reduce((s, d) => s + d.execution_amount, 0);
                                      const subClicks = subData.reduce((s, d) => s + d.clicks, 0);
                                      const subImps = subData.reduce((s, d) => s + d.impressions, 0);
                                      const actualCpc = subClicks > 0 ? subSpent / subClicks : 0;
                                      const actualCtr = subImps > 0 ? (subClicks / subImps) * 100 : 0;
                                      const cpcStatus = sub.target_cpc ? (actualCpc <= sub.target_cpc ? 'Good' : 'High') : 'N/A';

                                      return (
                                        <TableRow key={sub.id} className="hover:bg-blue-50/50 transition-colors border-b border-slate-100 last:border-none">
                                          <TableCell className="py-6 px-8 font-black text-slate-900">{sub.excel_name || sub.media}</TableCell>
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
                        return (
                          <SortableItem id="insights" key="insights">
                            <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
                              <div className="flex justify-between items-center mb-8">
                                <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase flex items-center gap-3">
                                  <MessageSquare size={24} className="text-blue-600"/> Intelligence Synthesis
                                </h3>
                                <Button onClick={handleSaveInsights} className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-2xl font-black shadow-sm transition-all">
                                  Commit Insights
                                </Button>
                              </div>
                              <textarea 
                                className="w-full min-h-[200px] p-8 rounded-[24px] border border-slate-200 bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all text-slate-700 text-lg font-medium placeholder:text-slate-300"
                                placeholder="Synthesize performance results and outline strategic pivots..."
                                value={campaignInsights}
                                onChange={(e) => setCampaignInsights(e.target.value)}
                              />
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
