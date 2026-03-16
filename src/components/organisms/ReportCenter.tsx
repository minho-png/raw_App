"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from '@/components/layout/Sidebar';
import { BudgetPacingCards } from '@/components/molecules/BudgetPacingCards';
import { FileUploader } from '@/components/molecules/FileUploader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Eye, FileSpreadsheet, Zap, BarChart4, Layout, Database, TrendingUp } from "lucide-react";
import { BudgetStatus, PerformanceRecord } from "@/types";
import { useCampaignStore } from '@/store/useCampaignStore';
import { cn } from '@/lib/utils';

export const ReportCenter: React.FC = () => {
  const { selectedCampaignId, campaigns } = useCampaignStore();
  const selectedCampaign = campaigns.find(c => c.campaign_id === selectedCampaignId);
  
  const [processedData, setProcessedData] = useState<PerformanceRecord[]>([]);
  const [reportType, setReportType] = useState('daily');

  // Filter data by selected campaign
  const filteredData = useMemo(() => {
    return processedData.filter(d => d.campaign_id === selectedCampaignId);
  }, [processedData, selectedCampaignId]);

  // Derived stats for BudgetPacingCards
  const budgetStatus: BudgetStatus = useMemo(() => {
    const spent = filteredData.reduce((sum, r) => sum + r.execution_amount, 0);
    const total = selectedCampaign?.total_budget || 0;
    const remaining = total - spent;
    
    // Mock burn rate and pacing for UI
    const burnRate = spent / (total || 1) * 100;
    
    return {
      total_budget: total,
      spent_budget: spent,
      remaining_budget: remaining,
      spent: spent,
      remaining: remaining,
      burn_rate: burnRate,
      pacing_index: burnRate > 50 ? 110 : 95,
      pacing_status: burnRate > 100 ? 'over' : (burnRate > 80 ? 'warning' : 'stable')
    };
  }, [filteredData, selectedCampaign]);

  const handleAnalysisComplete = (data: PerformanceRecord[]) => {
    // Append to total processed data (in a real app, this would also hit the DB)
    setProcessedData(prev => [...prev, ...data]);
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
          <p className="text-slate-500 mt-1">실시간 데이터 분석 및 통합 리포트 센터</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="rounded-xl border-slate-200 bg-white/50 backdrop-blur shadow-sm hover:translate-y-[-2px] transition-transform">
            <Database className="mr-2 h-4 w-4" /> DB 데이터 불러오기
          </Button>
          <Button className="rounded-xl bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-all">
            <Zap className="mr-2 h-4 w-4" /> 리포트 즉시 발행
          </Button>
        </div>
      </header>

      <BudgetPacingCards status={budgetStatus} />

      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="bg-slate-100/50 p-1 rounded-2xl border border-slate-200 inline-flex">
          <TabsTrigger value="upload" className="rounded-xl px-6 py-2.5 flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-md">
            <FileSpreadsheet size={16} /> RAW 데이터 관리
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
                <FileUploader onAnalysisComplete={handleAnalysisComplete} />
                
                {filteredData.length > 0 && (
                  <Card className="rounded-3xl border-white/40 bg-white/60 backdrop-blur-xl shadow-xl overflow-hidden border">
                    <CardHeader className="border-b border-slate-100/50 bg-white/20 px-8 py-6">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-xl font-bold text-slate-800">가공 완료 데이터 (Grid)</CardTitle>
                        <Button variant="ghost" size="sm" className="text-blue-500 font-semibold hover:bg-blue-50">CSV 다운로드</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
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
                            {filteredData.slice(0, 10).map((record, idx) => (
                              <TableRow key={idx} className="hover:bg-slate-50/30 transition-colors">
                                <TableCell className="px-8">{new Date(record.date).toLocaleDateString()}</TableCell>
                                <TableCell className="max-w-[250px] truncate font-medium">{record.ad_group_name}</TableCell>
                                <TableCell className="text-right">{record.impressions.toLocaleString()}</TableCell>
                                <TableCell className="text-right">{record.clicks.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-bold text-blue-600">₩{Math.round(record.execution_amount).toLocaleString()}</TableCell>
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
