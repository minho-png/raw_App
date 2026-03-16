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
  Download, 
  Eye, 
  FileSpreadsheet, 
  Zap, 
  BarChart4, 
  Layout, 
  Database, 
  TrendingUp, 
  Calculator, 
  Layers, 
  Settings, 
  X, 
  Plus,
  Loader2,
  Edit3,
  Check,
  X as CloseIcon
} from "lucide-react";
import { BudgetStatus, PerformanceRecord, MediaProvider } from "@/types";
import { useCampaignStore } from '@/store/useCampaignStore';
import { cn } from '@/lib/utils';
import { DmpSettlementNode } from "@/components/settlement/DmpSettlementNode";
import { getPerformanceDataAction, updatePerformanceDataAction, savePerformanceData } from '@/server/actions/settlement';
import { saveCampaignAction, deleteCampaignAction } from "@/server/actions/campaign";
import { CalculationService } from "@/services/calculationService";

export const ReportCenter: React.FC = () => {
  const { campaigns, selectedCampaignId, selectCampaign, updateCampaign, addCampaign, activeTab, setActiveTab } = useCampaignStore();
  const selectedCampaign = campaigns.find(c => c.campaign_id === selectedCampaignId);
  
  const [processedData, setProcessedData] = useState<PerformanceRecord[]>([]);
  const [reportType, setReportType] = useState('daily');
  const [uploadStep, setUploadStep] = useState<'config' | 'mapping' | 'setup' | 'complete'>('config');
  const [activeMedia, setActiveMedia] = useState<MediaProvider>('네이버GFA');
  const [groupByColumns, setGroupByColumns] = useState<string[]>([]);
  const [rawParsedData, setRawParsedData] = useState<any[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [excelCampaignConfigs, setExcelCampaignConfigs] = useState<Record<string, {
    media: MediaProvider,
    fee_rate: number,
    budget: number,
    cpc_goal?: number,
    ctr_goal?: number
  }>>({});
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: string, value: number } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateAmount = async (id: string, newValue: number) => {
    setIsUpdating(true);
    try {
      const result = await updatePerformanceDataAction(id, { execution_amount: newValue });
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

  // Derived stats for BudgetPacingCards
  const budgetStatus: BudgetStatus = useMemo(() => {
    const totalExecution = filteredData.reduce((sum, r) => sum + r.execution_amount, 0);
    const totalClicks = filteredData.reduce((sum, r) => sum + r.clicks, 0);
    const totalImpressions = filteredData.reduce((sum, r) => sum + r.impressions, 0);
    
    const spent = totalExecution;
    const total = selectedCampaign?.total_budget || 0;
    const remaining = total - spent;
    
    const burnRate = total > 0 ? (spent / total) * 100 : 0;
    const actualCpc = totalClicks > 0 ? spent / totalClicks : 0;
    const actualCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    
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
      actual_ctr: actualCtr
    };
  }, [filteredData, selectedCampaign]);

  const handleAnalysisComplete = (data: PerformanceRecord[]) => {
    // Data is already saved to DB via Server Action in FileUploader
    setProcessedData(prev => [...prev, ...data]);
    setActiveTab('upload');
  };

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
          <Button className="rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-all">
            <Zap className="mr-2 h-4 w-4" /> 리포트 즉시 발행
          </Button>
        </div>
      </header>

      <BudgetPacingCards status={budgetStatus} campaign={selectedCampaign} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100/50 p-1 rounded-2xl border border-slate-200 inline-flex">
          <TabsTrigger value="upload" className="rounded-xl px-6 py-2.5 flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-md">
            <FileSpreadsheet size={16} /> RAW 데이터 관리
          </TabsTrigger>
          <TabsTrigger value="settlement" className="rounded-xl px-6 py-2.5 flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-md">
            <Calculator size={16} /> DMP 정산
          </TabsTrigger>
          <TabsTrigger value="dmp" className="rounded-xl px-6 py-2.5 flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-md">
            <BarChart4 size={16} /> DMP 성과 분석
          </TabsTrigger>
          <TabsTrigger value="report" className="rounded-xl px-6 py-2.5 flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-md">
            <Layout size={16} /> 통합 리포트
          </TabsTrigger>
        </TabsList>

        <div className="mt-8">
          <AnimatePresence mode="wait">
            <TabsContent value="upload" className="m-0 focus-visible:ring-0">
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {uploadStep === 'config' && (
                  <div className="bg-white/40 backdrop-blur-md rounded-3xl p-8 border border-white/40 shadow-xl space-y-8 flex flex-col items-center justify-center min-h-[300px]">
                    <div className="text-center space-y-2">
                      <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-2xl mx-auto mb-4">
                        <Database size={32} />
                      </div>
                      <h3 className="text-2xl font-black text-slate-800 tracking-tight">1단계: RAW 데이터 업로드</h3>
                      <div className="pt-2">
                        {selectedCampaign ? (
                          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 inline-block">
                             <p className="text-sm font-bold text-blue-700">
                               관리 대상: <span className="text-lg underline underline-offset-4">{selectedCampaign.campaign_name}</span>
                             </p>
                             <p className="text-[11px] text-blue-500/80 mt-1 font-medium italic">사이드바에서 선택된 통합 마스터 캠페인에 데이터가 등록됩니다.</p>
                          </div>
                        ) : (
                          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 inline-block">
                            <p className="text-sm font-bold text-rose-600">
                              먼저 왼쪽 사이드바에서 관리를 원하는 캠페인을 선택해주세요.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedCampaign && (
                      <div className="w-full max-w-md pt-4">
                        <FileUploader 
                          onAnalysisComplete={(data) => {
                            setRawParsedData(data);
                            // Auto-mapping for NaverGFA
                            if (data.length > 0) {
                              const headers = Object.keys(data[0]);
                              const mapping: Record<string, string> = { ...columnMapping };
                              if (headers.includes('기간')) mapping.date = '기간';
                              if (headers.includes('광고 그룹 이름')) mapping.ad_group = '광고 그룹 이름';
                              if (headers.includes('클릭')) mapping.clicks = '클릭';
                              if (headers.includes('노출')) mapping.impressions = '노출';
                              if (headers.includes('총 비용')) mapping.supply_value = '총 비용';
                              if (headers.includes('캠페인')) mapping.excel_campaign = '캠페인';
                              setColumnMapping(mapping);
                            }
                            setUploadStep('mapping');
                          }} 
                          overrides={{ media: '네이버GFA', group_by_columns: groupByColumns }}
                          isSimpleButton={true}
                        />
                      </div>
                    )}
                  </div>
                )}

                {uploadStep === 'mapping' && (
                  <div className="bg-white/40 backdrop-blur-md rounded-3xl p-8 border border-white/40 shadow-xl space-y-8">
                    <div className="flex items-center gap-4 border-b border-white/20 pb-6">
                      <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
                        <Eye size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-slate-800">2단계: 데이터 컬럼 매핑</h3>
                        <p className="text-sm text-slate-500">엑셀의 어떤 항목이 시스템의 어떤 필드인지 지정해주세요.</p>
                      </div>
                    </div>

                    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
                        <Database size={14} />
                        데이터 미리보기 (상위 3개 행)
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-blue-200 bg-white">
                        <table className="w-full text-[10px] text-slate-600">
                          <thead className="bg-blue-50 border-b border-blue-100">
                            <tr>
                              {Object.keys(rawParsedData[0] || {}).map(k => (
                                <th key={k} className="p-2 text-left whitespace-nowrap">{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rawParsedData.slice(0, 3).map((row, i) => (
                              <tr key={i} className="border-b border-slate-50 last:border-0">
                                {Object.values(row).map((v: any, j) => (
                                  <td key={j} className="p-2">{String(v)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {[
                        { key: 'date', label: '날짜 컬럼', required: true },
                        { key: 'excel_campaign', label: '캠페인 명(Excel) 컬럼', required: true },
                        { key: 'ad_group', label: '광고 그룹 컬럼', required: true },
                        { key: 'impressions', label: '노출수 컬럼', required: true },
                        { key: 'clicks', label: '클릭수 컬럼', required: true },
                        { key: 'supply_value', label: '집행 금액(VAT별도) 컬럼', required: true },
                      ].map(field => (
                        <div key={field.key} className="space-y-2">
                          <Label className="text-slate-700 font-bold flex items-center gap-1">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                          </Label>
                          <select 
                            className="w-full h-12 bg-white border border-slate-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={columnMapping[field.key] || ''}
                            onChange={(e) => setColumnMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                          >
                            <option value="">컬럼 선택</option>
                            {Object.keys(rawParsedData[0] || {}).map(k => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-4 pt-4">
                      <Button variant="outline" className="flex-1 h-14 rounded-2xl font-bold" onClick={() => setUploadStep('config')}>
                        이전 단계로
                      </Button>
                      <Button 
                        className="flex-3 h-14 rounded-2xl font-bold bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20"
                        disabled={!columnMapping.date || !columnMapping.excel_campaign || !columnMapping.ad_group || !columnMapping.supply_value}
                        onClick={() => {
                          const campaignCol = columnMapping.excel_campaign;
                          const uniqueCampaigns = Array.from(new Set(rawParsedData.map(row => String(row[campaignCol] || '')))).filter(Boolean);
                          
                          const initialConfigs: Record<string, any> = {};
                          uniqueCampaigns.forEach(campName => {
                            initialConfigs[campName] = {
                              media: '네이버GFA',
                              fee_rate: 10,
                              budget: 0,
                              cpc_goal: 0,
                              ctr_goal: 0
                            };
                          });
                          
                          setExcelCampaignConfigs(initialConfigs);
                          setUploadStep('setup');
                        }}
                      >
                        다음 단계: 캠페인 상세 설정
                      </Button>
                    </div>
                  </div>
                )}

                {uploadStep === 'setup' && (
                  <div className="bg-white/40 backdrop-blur-md rounded-3xl p-8 border border-white/40 shadow-xl space-y-8">
                    <div className="flex items-center gap-4 border-b border-white/20 pb-6">
                      <div className="w-12 h-12 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
                        <Settings size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-slate-800">3단계: 캠페인 상세 설정</h3>
                        <p className="text-sm text-slate-500">
                          통합 대상: <span className="text-blue-600 font-bold">[{selectedCampaign?.campaign_name}]</span>
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                      {Object.entries(excelCampaignConfigs).map(([name, config]) => (
                        <div key={name} className="bg-white/60 p-6 rounded-2xl border border-white/40 shadow-sm space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">엑셀 내 캠페인명 (매체별)</span>
                              <Label className="text-lg font-black text-blue-700">{name}</Label>
                            </div>
                            <Badge variant="outline" className="h-7 bg-blue-50/50 text-blue-600 border-blue-100 px-3 font-bold">분석 대상</Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-slate-500">매체 선택</Label>
                              <select 
                                className="w-full h-10 bg-white border border-slate-200 rounded-xl px-3 text-sm focus:ring-2 focus:ring-blue-500"
                                value={config.media}
                                onChange={(e) => setExcelCampaignConfigs(prev => ({
                                  ...prev,
                                  [name]: { ...prev[name], media: e.target.value as MediaProvider }
                                }))}
                              >
                                <option value="네이버GFA">네이버GFA</option>
                                <option value="카카오Moment">카카오Moment</option>
                                <option value="구글Ads">구글Ads</option>
                                <option value="메타Ads">메타Ads</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-slate-500">수수료율 (%)</Label>
                              <Input 
                                type="number" 
                                className="h-10 rounded-xl border-slate-200" 
                                value={config.fee_rate}
                                onChange={(e) => setExcelCampaignConfigs(prev => ({
                                  ...prev,
                                  [name]: { ...prev[name], fee_rate: Number(e.target.value) }
                                }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-slate-500">예산 (VAT 별도)</Label>
                              <Input 
                                type="number" 
                                className="h-10 rounded-xl border-slate-200" 
                                value={config.budget}
                                onChange={(e) => setExcelCampaignConfigs(prev => ({
                                  ...prev,
                                  [name]: { ...prev[name], budget: Number(e.target.value) }
                                }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-slate-500">목표 CPC</Label>
                              <Input 
                                type="number" 
                                className="h-10 rounded-xl border-slate-200" 
                                value={config.cpc_goal || 0}
                                onChange={(e) => setExcelCampaignConfigs(prev => ({
                                  ...prev,
                                  [name]: { ...prev[name], cpc_goal: Number(e.target.value) }
                                }))}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-white/20">
                      <Button variant="outline" className="flex-1 h-14 rounded-2xl font-bold" onClick={() => setUploadStep('mapping')}>
                        이전 단계로
                      </Button>
                      <Button 
                        className="flex-3 h-14 rounded-2xl font-bold bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20"
                        onClick={async () => {
                          setIsProcessing(true);
                          try {
                            const processed = CalculationService.processWithDanfo(
                              rawParsedData,
                              selectedCampaignId || 'UNASSIGNED',
                              activeMedia,
                              10, // dummy default, overridden by rows
                              groupByColumns,
                              columnMapping,
                              excelCampaignConfigs
                            );

                            const result = await savePerformanceData(processed);
                            if (result.success) {
                              setProcessedData(prev => [...prev, ...processed]);
                              setUploadStep('complete');
                              alert('데이터가 성공적으로 분석 및 저장되었습니다.');
                            } else {
                              alert('저장 중 오류가 발생했습니다.');
                            }
                          } catch (err) {
                            console.error(err);
                            alert('분석 중 오류가 발생했습니다.');
                          } finally {
                            setIsProcessing(false);
                          }
                        }}
                      >
                        {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Zap size={18} className="mr-2" />}
                        최종 분석 및 저장
                      </Button>
                    </div>
                  </div>
                )}

                {uploadStep === 'complete' && (
                  <div className="bg-white/40 backdrop-blur-md rounded-3xl p-12 border border-white/40 shadow-xl flex flex-col items-center justify-center text-center space-y-6">
                    <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center shadow-lg">
                      <Check size={40} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-slate-800">분석 완료 및 저장 성공!</h3>
                      <p className="text-slate-500 mt-2">데이터가 성공적으로 처리되어 데이터베이스에 반영되었습니다.</p>
                    </div>
                    <div className="flex gap-4 pt-4">
                      <Button variant="outline" className="h-14 px-8 rounded-2xl font-bold" onClick={() => setUploadStep('config')}>
                        새로운 파일 업로드
                      </Button>
                      <Button className="h-14 px-8 rounded-2xl font-bold bg-slate-900 text-white" onClick={() => setActiveTab('grid')}>
                        결과 확인하기 (Grid)
                      </Button>
                    </div>
                  </div>
                )}
                
                {filteredData.length > 0 && (
                  <Card className="rounded-3xl border-white/40 bg-white/60 backdrop-blur-xl shadow-xl overflow-hidden border">
                    <CardHeader className="border-b border-slate-100/50 bg-white/20 px-8 py-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-xl font-bold text-slate-800">가공 완료 데이터 (Grid)</CardTitle>
                          <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-tight">통합 캠페인: {selectedCampaign?.campaign_name}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="text-blue-500 font-semibold hover:bg-blue-50">CSV 다운로드</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Tabs defaultValue="all" className="w-full">
                        <div className="px-8 pt-4 pb-2 border-b border-slate-100/50 bg-slate-50/10">
                          <TabsList className="bg-slate-100/50 p-1 rounded-xl">
                            <TabsTrigger value="all" className="rounded-lg text-xs font-bold">전체</TabsTrigger>
                            {Array.from(new Set(filteredData.map(d => d.media))).map(m => (
                              <TabsTrigger key={m} value={m} className="rounded-lg text-xs font-bold">{m}</TabsTrigger>
                            ))}
                          </TabsList>
                        </div>

                        {["all", ...Array.from(new Set(filteredData.map(d => d.media)))].map(tabMedia => (
                          <TabsContent key={tabMedia} value={tabMedia} className="m-0 border-none outline-none">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader className="bg-slate-50/50">
                                  <TableRow>
                                    <TableHead className="px-8 font-bold text-slate-900">날짜</TableHead>
                                    <TableHead className="font-bold text-slate-900">광고 그룹</TableHead>
                                    <TableHead className="text-right font-bold text-slate-900">노출</TableHead>
                                    <TableHead className="text-right font-bold text-slate-900">클릭</TableHead>
                                    <TableHead className="text-right font-bold text-slate-900">집행 금액</TableHead>
                                    <TableHead className="px-8 font-bold text-slate-900">DMP</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(tabMedia === "all" ? filteredData : filteredData.filter(d => d.media === tabMedia)).slice(0, 10).map((record, idx) => (
                                    <TableRow key={idx} className="hover:bg-slate-50/30 transition-colors">
                                      <TableCell className="px-8">{new Date(record.date).toLocaleDateString()}</TableCell>
                                      <TableCell className="max-w-[250px] truncate font-medium">{record.ad_group_name}</TableCell>
                                      <TableCell className="text-right">{record.impressions.toLocaleString()}</TableCell>
                                      <TableCell className="text-right">{record.clicks.toLocaleString()}</TableCell>
                                      <TableCell className="text-right font-bold text-blue-600">
                                        {editingCell?.id === record._id ? (
                                          <div className="flex items-center justify-end gap-1">
                                            <Input 
                                              type="number"
                                              className="w-24 h-8 text-right px-2 rounded-lg border-blue-200 focus:ring-blue-500"
                                              value={editingCell?.value ?? 0}
                                              autoFocus
                                              disabled={isUpdating}
                                              onChange={(e) => {
                                                if (editingCell) {
                                                  setEditingCell({ ...editingCell, value: Number(e.target.value) });
                                                }
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter' && editingCell) handleUpdateAmount(record._id!, editingCell.value);
                                                if (e.key === 'Escape') setEditingCell(null);
                                              }}
                                            />
                                            <button 
                                              onClick={() => editingCell && handleUpdateAmount(record._id!, editingCell.value)}
                                              disabled={isUpdating}
                                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                                            >
                                              <Check size={14} />
                                            </button>
                                          </div>
                                        ) : (
                                          <div 
                                            className="group flex items-center justify-end gap-2 cursor-pointer hover:bg-white px-2 py-1 rounded transition-all"
                                            onClick={() => record._id && setEditingCell({ id: record._id, value: record.execution_amount })}
                                          >
                                            {record.is_edited && (
                                              <span className="bg-amber-100 text-amber-600 text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                                <Edit3 size={8} /> 수정됨
                                              </span>
                                            )}
                                            ₩{Math.round(record.execution_amount).toLocaleString()}
                                          </div>
                                        )}
                                      </TableCell>
                                      <TableCell className="px-8">
                                        <span className={cn(
                                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                          record.has_dmp ? "bg-purple-100 text-purple-600" : "bg-slate-100 text-slate-500"
                                        )}>
                                          {record.dmp_type}
                                        </span>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TabsContent>
                        ))}
                      </Tabs>
                      {filteredData.length > 10 && (
                        <div className="p-4 text-center border-t border-slate-100/50 bg-slate-50/20 text-xs text-slate-400">
                          외 {filteredData.length - 10}개의 데이터가 더 있습니다.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            </TabsContent>

            <TabsContent value="campaigns" className="m-0 focus-visible:ring-0">
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white/40 backdrop-blur-md rounded-3xl p-8 border border-white/40 shadow-xl space-y-8">
                  <div className="flex items-center justify-between border-b border-white/20 pb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center text-white shadow-xl">
                        <Settings size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-slate-800">캠페인 및 수수료 관리</h3>
                        <p className="text-sm text-slate-500">매체별 수수료율과 KPI 목표를 통합 관리합니다.</p>
                      </div>
                    </div>
                    <Button 
                      onClick={() => {
                        const newId = `CAMP-${Math.floor(Math.random() * 1000)}`;
                        const newCamp = {
                          campaign_id: newId,
                          campaign_name: `신규 캠페인 ${campaigns.length + 1}`,
                          media: '네이버GFA' as const,
                          total_budget: 10000000,
                          start_date: new Date(),
                          end_date: new Date(),
                          base_fee_rate: 10,
                          total_fee_rate: 10
                        };
                        saveCampaignAction(newCamp).then(() => addCampaign(newCamp));
                      }}
                      className="rounded-xl h-12 px-6 bg-slate-900 text-white font-bold"
                    >
                      <Plus size={18} className="mr-2" /> 신규 캠페인 생성
                    </Button>
                  </div>

                  <div className="grid gap-6">
                    {campaigns.map(camp => (
                      <div key={camp.campaign_id} className="bg-white/60 rounded-2xl p-6 border border-white/40 shadow-sm hover:shadow-md transition-shadow grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                              <Layout size={16} />
                            </div>
                            <h4 className="font-bold text-slate-800">{camp.campaign_name}</h4>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="bg-slate-50 p-2 rounded-lg">
                              <p className="text-slate-400 mb-1">매체</p>
                              <p className="font-bold text-slate-700">{camp.media}</p>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-lg">
                              <p className="text-slate-400 mb-1">ID</p>
                              <p className="font-bold text-slate-700">{camp.campaign_id}</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4 border-x border-slate-100 px-8">
                          <Label className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">수수료 및 예산 설정</Label>
                          <div className="grid gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-slate-500">대행 수수료율 (%)</Label>
                              <Input 
                                type="number"
                                value={camp.total_fee_rate}
                                onChange={(e) => {
                                  const updated = { ...camp, total_fee_rate: Number(e.target.value) };
                                  updateCampaign(updated);
                                  saveCampaignAction(updated);
                                }}
                                className="h-9 rounded-lg border-slate-200"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-slate-500">총 예산 (₩)</Label>
                              <Input 
                                type="number"
                                value={camp.total_budget}
                                onChange={(e) => {
                                  const updated = { ...camp, total_budget: Number(e.target.value) };
                                  updateCampaign(updated);
                                  saveCampaignAction(updated);
                                }}
                                className="h-9 rounded-lg border-slate-200"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <Label className="text-[11px] font-bold text-green-600 uppercase tracking-wider">KPI 성과 목표</Label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-slate-500">목표 CPC (₩)</Label>
                              <Input 
                                type="number"
                                value={camp.target_cpc || ''}
                                placeholder="800"
                                onChange={(e) => {
                                  const updated = { ...camp, target_cpc: Number(e.target.value) };
                                  updateCampaign(updated);
                                  saveCampaignAction(updated);
                                }}
                                className="h-9 rounded-lg border-slate-200"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-slate-500">목표 CTR (%)</Label>
                              <Input 
                                type="number"
                                step="0.01"
                                value={camp.target_ctr || ''}
                                placeholder="1.2"
                                onChange={(e) => {
                                  const updated = { ...camp, target_ctr: Number(e.target.value) };
                                  updateCampaign(updated);
                                  saveCampaignAction(updated);
                                }}
                                className="h-9 rounded-lg border-slate-200"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </TabsContent>

            <TabsContent value="settlement" className="m-0 focus-visible:ring-0">
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <DmpSettlementNode 
                  campaignId={selectedCampaignId} 
                  campaignName={selectedCampaign?.campaign_name || ''}
                  totalBudget={selectedCampaign?.total_budget || 0}
                />
              </motion.div>
            </TabsContent>

            <TabsContent value="dmp" className="m-0 focus-visible:ring-0">
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
              >
                {/* DMP Logic Placeholder */}
                <div className="col-span-full text-center py-20 bg-white/40 rounded-3xl border border-dashed border-slate-300">
                  <p className="text-slate-400">DMP별 분석 차트 및 가중치 집계 영역</p>
                </div>
              </motion.div>
            </TabsContent>

            <TabsContent value="report" className="m-0 focus-visible:ring-0">
              <motion.div 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white/60 backdrop-blur-xl border border-white/40 rounded-3xl p-8 shadow-xl"
              >
                <div className="grid gap-12 md:grid-cols-2">
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">리포트 발행 설정</h2>
                      <p className="text-slate-500 text-sm mt-1">발행할 리포트의 형식과 기간을 설정하십시오.</p>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">포맷 선택</label>
                        <Select value={reportType} onValueChange={setReportType}>
                          <SelectTrigger className="rounded-xl border-slate-200 bg-white shadow-sm h-12">
                            <SelectValue placeholder="타입 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">일일 성과 리포트</SelectItem>
                            <SelectItem value="final">최종 결과 리포트</SelectItem>
                            <SelectItem value="dmp">DMP 정산 리포트</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <Button variant="outline" className="flex-1 rounded-xl h-12 font-bold border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-sm">
                        <Eye className="mr-2 h-4 w-4 text-blue-500" /> 프리뷰 업데이트
                      </Button>
                      <Button className="flex-1 rounded-xl h-12 font-bold bg-green-600 hover:bg-green-700 transition-all shadow-lg shadow-green-600/20">
                        <Download className="mr-2 h-4 w-4" /> HTML 내려받기
                      </Button>
                    </div>
                  </div>

                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl blur opacity-10 group-hover:opacity-20 transition duration-1000"></div>
                    <div className="relative border border-slate-200/60 rounded-2xl bg-slate-900/5 p-4 h-[400px] flex flex-col shadow-inner overflow-hidden">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-2 h-2 rounded-full bg-red-400" />
                        <div className="w-2 h-2 rounded-full bg-orange-400" />
                        <div className="w-2 h-2 rounded-full bg-green-400" />
                        <span className="ml-2 text-[10px] font-mono text-slate-400">preview_render_engine.v1</span>
                      </div>
                      <div className="flex-1 bg-white rounded-lg shadow-sm p-4 overflow-y-auto">
                        {/* Preview Skeleton */}
                        <div className="space-y-4 animate-pulse">
                          <div className="h-6 bg-slate-100 rounded w-2/3" />
                          <div className="h-32 bg-slate-50 rounded" />
                          <div className="space-y-2">
                            <div className="h-4 bg-slate-100 rounded w-full" />
                            <div className="h-4 bg-slate-100 rounded w-5/6" />
                          </div>
                        </div>
                        <p className="text-center text-xs text-slate-300 mt-20">프리뷰를 렌더링하려면 상단 버튼을 클릭하십시오.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </div>
      </Tabs>
    </div>
  );
};
