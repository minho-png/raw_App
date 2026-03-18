"use client";

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from '@/components/layout/Sidebar';
import { BudgetPacingCards } from '@/components/molecules/BudgetPacingCards';
import { FileUploader } from '@/components/molecules/FileUploader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const ReportCenter: React.FC = () => {
  const { campaigns, selectedCampaignId, selectCampaign, updateCampaign, addCampaign, activeTab, setActiveTab, refreshCampaigns, setCampaigns } = useCampaignStore();
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
    setIsUpdating(true);
    try {
      const result = await updatePerformanceDataAction(id, { 
        execution_amount: newValue,
        cost: newValue // Sync cost with execution_amount
      });
      if (result.success) {
        setProcessedData(prev => prev.map(d => 
          d._id === id ? { ...d, execution_amount: newValue, is_edited: true } : d
        ));
        setEditingCell(null);
      } else {
        alert('업데이트에 실패했습니다.');
      }
    } catch (error) {
      console.error('Update failed:', error);
    } finally {
      setIsUpdating(false);
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
          if (sub.excel_name) {
            configs[sub.excel_name] = sub;
            enabledExcelNames.add(sub.excel_name);
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
            if (sub.excel_name) return d.excel_campaign_name === sub.excel_name;
            return d.media === sub.media;
          })
          .reduce((sum, d) => sum + d.execution_amount, 0);
        
        return {
          id: sub.id,
          name: sub.excel_name || sub.media,
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
        <div className="text-center p-8 bg-white/60 backdrop-blur-md border border-white/40 rounded-3xl shadow-xl max-w-md">
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
    <div className="p-8 space-y-8 animate-in fade-in duration-700">
      <header className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded uppercase tracking-wider shadow-sm">Active</span>
            <span className="text-xs text-slate-400 font-medium">Campaign ID: {selectedCampaignId}</span>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">{selectedCampaign?.campaign_name}</h1>
          <p className="text-slate-500 mt-1">실시간 광고 정산 및 성과 분석 엔진</p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={handleFetchDbData}
            disabled={isLoadingDb}
            className="rounded-xl border-slate-200 bg-white/50 backdrop-blur shadow-sm hover:translate-y-[-2px] transition-transform"
          >
            {isLoadingDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
            DB 데이터 불러오기
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setIsBudgetModalOpen(true)}
            className="rounded-xl border-slate-200 bg-white shadow-sm hover:translate-y-[-2px] transition-transform"
          >
            <Settings2 className="mr-2 h-4 w-4" /> 예산 관리
          </Button>
          <Button 
            onClick={handleGenerateReport}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-all"
          >
            <Zap className="mr-2 h-4 w-4" /> 리포트 즉시 발행
          </Button>
        </div>
      </header>

      {selectedCampaign && (
        <BudgetSettingsModal 
          isOpen={isBudgetModalOpen}
          onClose={() => setIsBudgetModalOpen(false)}
          campaign={selectedCampaign}
          suggestedNames={suggestedExcelNames}
          totalSpent={budgetStatus.spent} // Pass spent for pacing calculation
          onUpdate={async (updated) => {
            const result = await saveCampaignAction(updated);
            if (result.success && result.campaigns) {
              setCampaigns(result.campaigns);
            }
          }}
        />
      )}

      <BudgetPacingCards status={budgetStatus} campaign={selectedCampaign} />

      <Tabs value={activeTabStep} onValueChange={setActiveTabStep} className="w-full">
        <TabsList className="bg-slate-100/50 p-1 rounded-2xl border border-slate-200 inline-flex">
          <TabsTrigger value="source" className="rounded-xl px-6 py-2.5 flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-md">
            1. 데이터 원본 설정
          </TabsTrigger>
          <TabsTrigger value="processing" className="rounded-xl px-6 py-2.5 flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-md">
            2. 데이터 가공 (수기 수정)
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="rounded-xl px-6 py-2.5 flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-md">
            3. 마케팅 대시보드
          </TabsTrigger>
        </TabsList>

        <div className="mt-8">
          <AnimatePresence mode="wait">
            <TabsContent key="source" value="source" className="space-y-6">
              <div className="bg-white/60 backdrop-blur-xl border border-white/40 rounded-[32px] p-10 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-10 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -z-10" />
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                        <Database size={20} />
                      </div>
                      1. 데이터 원본 및 모델링
                    </h2>
                    <p className="text-slate-500 mt-2 text-lg">데이터를 로드하고 분석 기준(Dimensions)을 설정하여 정밀한 리포트를 생성하세요.</p>
                  </div>
                  <FileUploader 
                    onAnalysisComplete={handleAnalysisComplete} 
                    isSimpleButton={true} 
                  />
                </div>

                {rawParsedData.length > 0 ? (
                  <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                      {/* Config Card 1: Media */}
                      <div className="lg:col-span-1 p-8 bg-white/80 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all border-b-4 border-b-blue-500">
                        <Label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 block">A. 매체 선택</Label>
                        <Select value={activeMedia} onValueChange={(val) => setActiveMedia(val as MediaProvider)}>
                          <SelectTrigger className="bg-slate-50 border-none rounded-2xl h-14 text-base font-bold shadow-inner">
                            <SelectValue placeholder="매체 선택" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-slate-100">
                            <SelectItem value="네이버GFA" className="rounded-xl py-3 font-medium">네이버 GFA</SelectItem>
                            <SelectItem value="카카오Moment" className="rounded-xl py-3 font-medium">카카오 모먼트</SelectItem>
                            <SelectItem value="메타Ads" className="rounded-xl py-3 font-medium">메타 Ads</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Config Card 2: Modeling */}
                      <div className="lg:col-span-2 p-8 bg-white/80 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl transition-all border-b-4 border-b-purple-500">
                        <Label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 block">B. 데이터 모델링 (Group By)</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { id: 'date_raw', label: '날짜', icon: '📅' },
                            { id: 'ad_group_name', label: '광고 그룹', icon: '📁' },
                            { id: 'excel_campaign_name', label: '캠페인', icon: '🎯' },
                            { id: 'creative_name', label: '소재', icon: '🎨' },
                            { id: 'age', label: '연령', icon: '👤' },
                            { id: 'gender', label: '성별', icon: '🚻' },
                            { id: 'device', label: '기기', icon: '📱' }
                          ].map(col => {
                            const active = groupByColumns.includes(col.id);
                            return (
                              <button 
                                key={col.id}
                                onClick={() => toggleGroupBy(col.id)}
                                className={cn(
                                  "px-4 py-2.5 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 border-2",
                                  active 
                                    ? "bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-500/30 scale-105" 
                                    : "bg-white border-slate-100 text-slate-600 hover:border-purple-200 hover:bg-purple-50"
                                )}
                              >
                                <span>{col.icon}</span>
                                {col.label}
                                {active && <Check size={14} className="ml-1" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Config Card 3: Budget & Process */}
                      <div className="lg:col-span-1 p-8 bg-slate-900 rounded-[32px] shadow-2xl flex flex-col justify-between">
                        <Label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">C. 최종 처리</Label>
                        <div className="space-y-4">
                          <Button 
                            variant="outline"
                            onClick={() => setIsBudgetModalOpen(true)}
                            className="w-full bg-slate-800 border-slate-700 text-white hover:bg-slate-700 h-14 rounded-2xl font-bold transition-all border-2"
                          >
                            <Settings2 className="mr-2 h-5 w-5 text-blue-400" /> 엑셀 캠페인 예산 설정
                          </Button>
                          <Button 
                            onClick={handleProcessData} 
                            disabled={isProcessing}
                            className="w-full bg-blue-600 hover:bg-blue-500 h-14 rounded-2xl font-black text-lg shadow-xl shadow-blue-500/40 transition-all hover:translate-y-[-2px] active:translate-y-0"
                          >
                            {isProcessing ? <Loader2 className="animate-spin h-6 w-6" /> : "가공 탭으로 이동 ➔"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-end px-4">
                        <Label className="text-sm font-black text-slate-500 uppercase tracking-widest">데이터 미리보기 (상위 5개 행)</Label>
                        <span className="text-xs font-bold text-slate-400">Total Rows: {rawParsedData.length.toLocaleString()}</span>
                      </div>
                      <div className="overflow-hidden rounded-[32px] border-2 border-slate-100 bg-white/80 shadow-inner">
                        <Table>
                          <TableHeader className="bg-slate-50/50 border-b-2 border-slate-100">
                            <TableRow>
                              {Object.keys(rawParsedData[0]).slice(0, 8).map(header => (
                                <TableHead key={header} className="font-black text-slate-700 py-6 px-6 text-xs uppercase">{header}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rawParsedData.slice(0, 5).map((row, idx) => (
                              <TableRow key={idx} className="hover:bg-blue-50/30 transition-colors border-none">
                                {Object.entries(row).slice(0, 8).map(([key, val]: [string, any], i) => (
                                  <TableCell key={i} className="py-5 px-6 font-medium text-slate-600">
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
                  <div className="py-32 flex flex-col items-center justify-center text-center animate-in fade-in duration-1000">
                    <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center text-slate-200 mb-8 shadow-inner">
                      <Database size={48} />
                    </div>
                    <h3 className="text-2xl font-black text-slate-300">데이터가 로드되지 않았습니다.</h3>
                    <p className="text-slate-400 mt-2 max-w-sm">상단의 파일 업로드 버튼을 눌러 분석할 엑셀 파일을 로드하세요.</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent key="processing" value="processing">
              <div className="bg-white/60 backdrop-blur-xl border border-white/40 rounded-3xl p-8 shadow-xl">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">데이터 검수 및 수동 보정</h2>
                    <p className="text-slate-500 text-sm">실제 집행 금액과 차이가 있다면 셀을 클릭하여 수정하세요.</p>
                  </div>
                  <Button 
                    className="bg-green-600 hover:bg-green-700" 
                    onClick={handleSaveProcessedData}
                    disabled={isSavingReport || processedData.length === 0}
                  >
                    {isSavingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check size={16} className="mr-2"/>}
                    변경사항 최종 저장
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-[500px]">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <TableRow>
                        <TableHead>날짜</TableHead>
                        <TableHead>캠페인명</TableHead>
                        <TableHead>DMP</TableHead>
                        <TableHead className="text-right">노출</TableHead>
                        <TableHead className="text-right">클릭</TableHead>
                        <TableHead className="text-right text-blue-600 font-bold flex items-center justify-end gap-1">
                          <Edit3 size={14}/> 비용 (수정 가능)
                        </TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.map((record) => (
                        <TableRow key={record._id || Math.random()} className="hover:bg-slate-50/50">
                          <TableCell>{formatDate(record.date)}</TableCell>
                          <TableCell className="font-medium text-slate-700">{record.excel_campaign_name || record.ad_group_name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-bold">
                              {record.dmp || record.dmp_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{record.impressions.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{record.clicks.toLocaleString()}</TableCell>
                          
                          <TableCell className="text-right">
                            {editingCell?.id === record._id ? (
                              <Input 
                                type="number"
                                autoFocus
                                className="w-28 h-8 text-right float-right border-blue-400 focus:ring-blue-500"
                                value={editingCell?.value || 0}
                                onChange={(e) => setEditingCell({ id: record._id!, value: Number(e.target.value) })}
                                onBlur={() => editingCell && handleUpdateAmount(record._id!, editingCell.value)}
                                onKeyDown={(e) => e.key === 'Enter' && editingCell && handleUpdateAmount(record._id!, editingCell.value)}
                              />
                            ) : (
                              <div 
                                className="cursor-pointer hover:bg-slate-100 px-2 py-1 rounded inline-block transition-colors font-semibold"
                                onDoubleClick={() => record._id && setEditingCell({ id: record._id, value: record.cost || record.execution_amount })}
                              >
                                ₩{Math.round(record.cost || record.execution_amount).toLocaleString()}
                              </div>
                            )}
                          </TableCell>

                          <TableCell>
                            {record.is_edited ? (
                              <Badge className="bg-amber-100 text-amber-700 border-none">수동 보정됨</Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-400">원본</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            <TabsContent key="dashboard" value="dashboard">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 p-6 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/40 shadow-xl">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">일별 성과 추이 (Spend vs CPC)</h3>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={dailyTrendData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}/>
                        <Legend wrapperStyle={{ paddingTop: '20px' }}/>
                        <Bar yAxisId="left" dataKey="execution_amount" name="집행액" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                        <Line yAxisId="right" type="monotone" dataKey="actual_cpc" name="CPC" stroke="#f59e0b" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-6 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/40 shadow-xl">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">DMP 예산 점유율</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dmpShareData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          nameKey="name"
                        >
                          {dmpShareData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#64748b'][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              {budgetProgressData.length > 0 && (
                <div className="mt-6">
                  <Card className="p-6 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/40 shadow-xl">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">항목별 예산 소급율 (Budget Fulfillment)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {budgetProgressData.map((item) => (
                        <div key={item.id} className="space-y-3 bg-white/40 p-4 rounded-2xl border border-white/60">
                          <div className="flex justify-between items-end">
                            <span className="text-sm font-bold text-slate-700 truncate max-w-[150px]">{item.name}</span>
                            <span className="text-xs font-medium text-blue-600">{item.percent.toFixed(1)}%</span>
                          </div>
                          <Progress value={item.percent} className="h-2 bg-slate-100" />
                          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                            <span>₩{Math.round(item.spent).toLocaleString()}</span>
                            <span>/ ₩{Math.round(item.budget).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                 {/* Age & Gender Distribution */}
                 <Card className="p-6 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/40 shadow-xl">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Users size={20} className="text-blue-500"/> 연령 및 성별 분포 (집행액 기준)
                  </h3>
                  <div className="grid grid-cols-2 gap-4 h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={ageData} innerRadius={40} outerRadius={60} dataKey="value" nameKey="name">
                          {ageData.map((_, i) => <Cell key={i} fill={['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'][i % 4]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={genderData} innerRadius={40} outerRadius={60} dataKey="value" nameKey="name">
                          {genderData.map((_, i) => <Cell key={i} fill={['#ec4899', '#3b82f6', '#94a3b8'][i % 3]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Top Creatives */}
                <Card className="p-6 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/40 shadow-xl">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <LayoutIcon size={20} className="text-purple-500"/> 소재별 성과 TOP 10 (Spend vs CTR)
                  </h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={creativeData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 10}} />
                        <Tooltip />
                        <Bar dataKey="spend" name="집행액" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={12} />
                        <Line dataKey="ctr" name="CTR (%)" stroke="#f59e0b" strokeWidth={2} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              {/* Performance Comparison Detail */}
              <Card className="p-6 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/40 shadow-xl mt-6">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <BarChart4 size={20} className="text-green-500"/> 매체별 목표 달성률 상세 비교
                </h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>항목 (매체/캠페인)</TableHead>
                        <TableHead className="text-right">집행액 / 예산</TableHead>
                        <TableHead className="text-right">실제 CPC / 목표</TableHead>
                        <TableHead className="text-right">실제 CTR / 목표</TableHead>
                        <TableHead className="text-center">상태</TableHead>
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
                        const ctrStatus = sub.target_ctr ? (actualCtr >= sub.target_ctr ? 'Good' : 'Low') : 'N/A';

                        return (
                          <TableRow key={sub.id}>
                            <TableCell className="font-medium">{sub.excel_name || sub.media}</TableCell>
                            <TableCell className="text-right">
                              <span className="text-slate-900 font-bold">{Math.round(subSpent).toLocaleString()}</span>
                              <span className="text-slate-400 text-xs"> / {sub.budget?.toLocaleString()}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={cn("font-bold", cpcStatus === 'Good' ? 'text-green-600' : 'text-amber-600')}>
                                ₩{Math.round(actualCpc).toLocaleString()}
                              </span>
                              <span className="text-slate-400 text-xs"> / {sub.target_cpc || '-'}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={cn("font-bold", ctrStatus === 'Good' ? 'text-green-600' : 'text-amber-600')}>
                                {actualCtr.toFixed(2)}%
                              </span>
                              <span className="text-slate-400 text-xs"> / {sub.target_ctr || '-'}%</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={cn(
                                progress && progress.percent > 90 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                              )}>
                                {progress ? `${progress.percent.toFixed(0)}% 소진` : 'N/A'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>

              {/* User Insights */}
              <Card className="p-6 rounded-3xl bg-white/60 backdrop-blur-xl border border-white/40 shadow-xl mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <MessageSquare size={20} className="text-blue-500"/> 캠페인 분석 인사이트
                  </h3>
                  <Button size="sm" onClick={handleSaveInsights} className="bg-blue-600 hover:bg-blue-700 rounded-xl">
                    인사이트 저장
                  </Button>
                </div>
                <textarea 
                  className="w-full min-h-[150px] p-4 rounded-2xl border border-slate-200 bg-white/50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all text-slate-700 placeholder:text-slate-300"
                  placeholder="분석 결과와 향후 전략을 기록하세요..."
                  value={campaignInsights}
                  onChange={(e) => setCampaignInsights(e.target.value)}
                />
              </Card>
            </TabsContent>
          </AnimatePresence>
        </div>
      </Tabs>
    </div>
  );
};
