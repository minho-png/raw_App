import React from 'react';
import { Database, Loader2, Check, Settings2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { FileUploader } from '@/components/molecules/FileUploader';
import { ColumnMappingPreview } from '@/components/molecules/ColumnMappingPreview';
import { MediaProvider } from "@/types";
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface UploadSectionProps {
  rawParsedData: any[];
  activeMedia: MediaProvider;
  setActiveMedia: (media: MediaProvider) => void;
  groupByColumns: string[];
  toggleGroupBy: (col: string) => void;
  setIsBudgetModalOpen: (isOpen: boolean) => void;
  handleProcessData: () => void;
  isProcessing: boolean;
  handleAnalysisComplete: (data: any[]) => void;
  formatDate: (date: Date | string) => string;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  rawParsedData,
  activeMedia,
  setActiveMedia,
  groupByColumns,
  toggleGroupBy,
  setIsBudgetModalOpen,
  handleProcessData,
  isProcessing,
  handleAnalysisComplete,
  formatDate
}) => {
  return (
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
            <p className="text-slate-500 text-lg font-medium max-w-2xl">
              광고 데이터를 로드하고 인텔리전스 프로세싱을 위한 결과값 집계 기준을 정의합니다.
            </p>
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
  );
};
