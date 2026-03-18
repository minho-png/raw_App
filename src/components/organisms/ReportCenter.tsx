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
  Zap, 
  Database, 
  TrendingUp, 
  Loader2,
  Edit3,
  Check,
  PieChart as PieChartIcon
} from "lucide-react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { BudgetStatus, PerformanceRecord, MediaProvider } from "@/types";
import { useCampaignStore } from '@/store/useCampaignStore';
import { cn } from '@/lib/utils';
import { getPerformanceDataAction, updatePerformanceDataAction } from '@/server/actions/settlement';
import { CalculationService } from "@/services/calculationService";

export const ReportCenter: React.FC = () => {
  const { campaigns, selectedCampaignId, selectCampaign, updateCampaign, addCampaign, activeTab, setActiveTab } = useCampaignStore();
  const selectedCampaign = campaigns.find(c => c.campaign_id === selectedCampaignId);
  
  const [processedData, setProcessedData] = useState<PerformanceRecord[]>([]);
  const [reportType, setReportType] = useState('daily');
  const [activeTabStep, setActiveTabStep] = useState('source');
  const [activeMedia, setActiveMedia] = useState<MediaProvider>('네이버GFA');
  const [groupByColumns, setGroupByColumns] = useState<string[]>(['date_raw']); 
  const [rawParsedData, setRawParsedData] = useState<any[]>([]);
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

  const totalBudget = useMemo(() => {
    if (!selectedCampaign || !selectedCampaign.sub_campaigns) return 0;
    return selectedCampaign.sub_campaigns.reduce((sum, sub) => sum + (sub.budget || 0), 0);
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

    const subWithCtr = selectedCampaign?.sub_campaigns?.filter(s => s.target_ctr && s.target_ctr > 0) || [];
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
      const { raw, report } = CalculationService.processWithDanfo(
        rawParsedData,
        selectedCampaignId,
        activeMedia,
        10, // Default fee rate if not configured
        groupByColumns
      );
      
      setProcessedData(report);
      setActiveTabStep('processing');
    } catch (error) {
      console.error('Processing failed:', error);
    } finally {
      setIsProcessing(false);
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

  const dmpShareData = useMemo(() => {
    const shares = filteredData.reduce((acc: any, curr) => {
      const dmp = curr.dmp_type || 'DIRECT';
      acc[dmp] = (acc[dmp] || 0) + curr.execution_amount;
      return acc;
    }, {});

    return Object.entries(shares).map(([name, value]) => ({ name, value }));
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
          <Button className="rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-all">
            <Zap className="mr-2 h-4 w-4" /> 리포트 즉시 발행
          </Button>
        </div>
      </header>

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
            <TabsContent key="source" value="source">
              <div className="bg-white/60 backdrop-blur-xl border border-white/40 rounded-3xl p-8 shadow-xl">
                <FileUploader 
                  onAnalysisComplete={handleAnalysisComplete} 
                  isSimpleButton={true} 
                />

                {rawParsedData.length > 0 && (
                  <div className="mt-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex gap-6 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="flex-1 space-y-2">
                        <Label className="font-bold text-slate-700">매체 선택</Label>
                        <Select value={activeMedia} onValueChange={(val) => setActiveMedia(val as MediaProvider)}>
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="매체 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="네이버GFA">네이버 GFA</SelectItem>
                            <SelectItem value="카카오Moment">카카오 모먼트</SelectItem>
                            <SelectItem value="메타Ads">메타 Ads</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex-[2] space-y-2">
                        <Label className="font-bold text-slate-700">그룹화 기준 (아래 데이터를 보고 선택하세요)</Label>
                        <div className="flex gap-2">
                          {['date_raw', 'ad_group_name', 'excel_campaign_name'].map(col => (
                            <Badge 
                              key={col}
                              variant={groupByColumns.includes(col) ? 'default' : 'outline'}
                              className={cn("cursor-pointer px-4 py-1.5 text-sm transition-all", groupByColumns.includes(col) && "bg-blue-600")}
                              onClick={() => toggleGroupBy(col)}
                            >
                              {col === 'date_raw' ? '날짜' : col === 'ad_group_name' ? '광고 그룹' : '캠페인'}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-end">
                        <Button onClick={handleProcessData} className="bg-blue-600 hover:bg-blue-700 h-10 px-8">
                          가공 탭으로 이동 ➔
                        </Button>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <Table>
                        <TableHeader className="bg-slate-100">
                          <TableRow>
                            {Object.keys(rawParsedData[0]).slice(0, 8).map(header => (
                              <TableHead key={header} className="font-bold text-slate-700">{header}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rawParsedData.slice(0, 5).map((row, idx) => (
                            <TableRow key={idx}>
                              {Object.values(row).slice(0, 8).map((val: any, i) => (
                                <TableCell key={i} className="truncate max-w-[150px]">{String(val)}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
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
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => alert('변경사항이 저장되었습니다.')}>
                    <Check size={16} className="mr-2"/> 변경사항 최종 저장
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white max-h-[500px]">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <TableRow>
                        <TableHead>날짜</TableHead>
                        <TableHead>광고 그룹</TableHead>
                        <TableHead className="text-right">노출</TableHead>
                        <TableHead className="text-right">클릭</TableHead>
                        <TableHead className="text-right text-blue-600 font-bold flex items-center justify-end gap-1">
                          <Edit3 size={14}/> 집행 금액 (더블클릭하여 수정)
                        </TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.map((record) => (
                        <TableRow key={record._id || Math.random()} className="hover:bg-slate-50/50">
                          <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                          <TableCell className="font-medium text-slate-700">{record.ad_group_name}</TableCell>
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
                                onDoubleClick={() => record._id && setEditingCell({ id: record._id, value: record.execution_amount })}
                              >
                                ₩{Math.round(record.execution_amount).toLocaleString()}
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
            </TabsContent>
          </AnimatePresence>
        </div>
      </Tabs>
    </div>
  );
};
