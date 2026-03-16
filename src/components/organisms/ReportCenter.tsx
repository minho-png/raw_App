import React, { useState } from 'react';
import { BudgetPacingCards } from '@/components/molecules/BudgetPacingCards';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Eye } from "lucide-react";
import { BudgetStatus, PerformanceRecord } from "@/types";

interface ReportCenterProps {
  budgetStatus: BudgetStatus;
  recentPerformance: PerformanceRecord[];
}

export const ReportCenter: React.FC<ReportCenterProps> = ({ budgetStatus, recentPerformance }) => {
  const [reportType, setReportType] = useState('daily');

  return (
    <div className="space-y-6 p-6 bg-slate-50 min-h-screen">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Report Center</h1>
          <p className="text-muted-foreground">통합 광고 성과 리포트 및 정산 관리</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">설정</Button>
          <Button className="bg-[#5865F2] hover:bg-[#4752C4]">데이터 새로고침</Button>
        </div>
      </header>

      {/* Top: Budget Status Section */}
      <BudgetPacingCards status={budgetStatus} />

      {/* Main Content: Daily Results & Report Gen Tabs */}
      <Tabs defaultValue="results" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="results">일일 결과 (Daily Results)</TabsTrigger>
          <TabsTrigger value="generation">리포트 생성 (Generation)</TabsTrigger>
        </TabsList>
        
        <TabsContent value="results" className="mt-4 border rounded-xl bg-white p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">최신 집행 데이터</h2>
            <Button size="sm" variant="ghost">전체 보기</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>매체</TableHead>
                  <TableHead>광고 그룹</TableHead>
                  <TableHead className="text-right">노출</TableHead>
                  <TableHead className="text-right">클릭</TableHead>
                  <TableHead className="text-right">집행 금액 (VAT별도)</TableHead>
                  <TableHead>DMP종류</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPerformance.map((record, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{new Date(record.date).toLocaleDateString()}</TableCell>
                    <TableCell>{record.media}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{record.ad_group_name}</TableCell>
                    <TableCell className="text-right">{record.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{record.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium">
                      ₩{Math.round(record.execution_amount).toLocaleString()}
                    </TableCell>
                    <TableCell>{record.dmp_type}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="generation" className="mt-4 border rounded-xl bg-white p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">리포트 설정</h2>
              <div className="space-y-2">
                <label className="text-sm font-medium">리포트 타입</label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger>
                    <SelectValue placeholder="타입 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">일일 성과 리포트</SelectItem>
                    <SelectItem value="final">최종 결과 리포트</SelectItem>
                    <SelectItem value="dmp">DMP 정산 리포트</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline">
                  <Eye className="mr-2 h-4 w-4" /> 프리뷰 업데이트
                </Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700">
                  <Download className="mr-2 h-4 w-4" /> HTML 다운로드
                </Button>
              </div>
            </div>

            <div className="border rounded-lg bg-slate-100 p-4 min-h-[300px] flex flex-col">
              <h3 className="text-sm font-medium mb-2 text-muted-foreground uppercase tracking-wider">HTML Preview</h3>
              <div className="flex-1 bg-white border rounded shadow-inner p-4 overflow-y-auto">
                <div className="animate-pulse space-y-4">
                  <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                  <div className="h-24 bg-slate-200 rounded"></div>
                  <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                </div>
                <p className="text-center text-sm text-muted-foreground mt-4">실시간 프리뷰가 로드되고 있습니다...</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
