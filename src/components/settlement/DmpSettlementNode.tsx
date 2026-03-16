"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCcw, 
  FileText,
  TrendingDown,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MonthlySettlementResult } from '@/types';
import { getMonthlySettlement } from '@/server/actions/settlement';
import { cn } from '@/lib/utils';

interface DmpSettlementNodeProps {
  campaignId: string;
  campaignName: string;
  totalBudget: number;
}

export const DmpSettlementNode: React.FC<DmpSettlementNodeProps> = ({ 
  campaignId, 
  campaignName, 
  totalBudget 
}) => {
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [month, setMonth] = useState<string>((new Date().getMonth() + 1).toString());
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<MonthlySettlementResult | null>(null);

  const fetchSettlement = useCallback(async () => {
    if (!campaignId) return;
    setIsLoading(true);
    try {
      const result = await getMonthlySettlement(
        parseInt(year), 
        parseInt(month), 
        campaignId, 
        totalBudget
      );
      
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
  }, [year, month, campaignId, totalBudget]);

  useEffect(() => {
    fetchSettlement();
  }, [fetchSettlement]);

  const handleExport = () => {
    if (!data) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>DMP 정산 리포트 - ${campaignName}</title>
        <style>
          body { font-family: sans-serif; padding: 40px; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #f8fafc; }
          .header { margin-bottom: 30px; }
          .total-row { font-weight: bold; background-color: #f1f5f9; }
          .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
          .status-valid { background-color: #dcfce7; color: #166534; }
          .status-warning { background-color: #fee2e2; color: #991b1b; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>DMP 정산 리포트</h1>
          <p>캠페인: ${campaignName} (${campaignId})</p>
          <p>정산 연월: ${data.year}년 ${data.month}월</p>
          <p>검증 상태: <span class="status status-${data.verification_status}">${data.verification_status.toUpperCase()}</span></p>
        </div>
        <table>
          <thead>
            <tr>
              <th>DMP 종류</th>
              <th>총 집행액 (A)</th>
              <th>매체 순액 (B)</th>
              <th>수수료 (A-B)</th>
              <th>데이터 건수</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows.map(row => `
              <tr>
                <td>${row.dmp_type}</td>
                <td>₩${row.total_execution.toLocaleString()}</td>
                <td>₩${row.total_net.toLocaleString()}</td>
                <td>₩${row.fee_amount.toLocaleString()}</td>
                <td>${row.row_count.toLocaleString()}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>합계</td>
              <td>₩${data.total_execution.toLocaleString()}</td>
              <td>₩${data.total_net.toLocaleString()}</td>
              <td>₩${data.total_fee.toLocaleString()}</td>
              <td>-</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DMP_Settlement_${campaignName}_${year}_${month}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-white/40 bg-white/60 backdrop-blur-xl shadow-xl overflow-hidden border">
        <CardHeader className="border-b border-slate-100/50 bg-white/20 px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="text-blue-500" size={20} />
                월별 DMP 정산 조회
              </CardTitle>
              <CardDescription>연도와 월을 선택하여 정산 내역을 확인하세요.</CardDescription>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-28 rounded-xl bg-white/50 border-slate-200">
                  <SelectValue placeholder="연도" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024년</SelectItem>
                  <SelectItem value="2025">2025년</SelectItem>
                  <SelectItem value="2026">2026년</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-24 rounded-xl bg-white/50 border-slate-200">
                  <SelectValue placeholder="월" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {i + 1}월
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button 
                variant="outline" 
                size="icon" 
                onClick={fetchSettlement}
                className="rounded-xl bg-white/50 border-slate-200 hover:bg-white"
                disabled={isLoading}
              >
                <RefreshCcw size={16} className={cn(isLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-20 flex flex-col items-center justify-center space-y-4"
              >
                <RefreshCcw size={40} className="text-blue-500 animate-spin" />
                <p className="text-slate-400 font-medium tracking-tight">MongoDB 집계 엔진 가동 중...</p>
              </motion.div>
            ) : data && data.rows.length > 0 ? (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="divide-y divide-slate-100/50"
              >
                {/* Verification Header */}
                <div className="px-8 py-4 bg-slate-50/30 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">검증 상태</span>
                      {data.verification_status === 'warning' ? (
                        <Badge variant="destructive" className="flex items-center gap-1 px-2 py-0.5 mt-0.5 bg-red-500 shadow-lg shadow-red-500/20">
                          <AlertCircle size={12} /> 검토 필요 (오차 {data.diff_percentage.toFixed(2)}%)
                        </Badge>
                      ) : (
                        <Badge className="flex items-center gap-1 px-2 py-0.5 mt-0.5 bg-green-500 shadow-lg shadow-green-500/20">
                          <CheckCircle2 size={12} /> 정산 일치
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-8">
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">총 집행액</p>
                      <p className="text-lg font-bold text-slate-800">₩{data.total_execution.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">순 집행액</p>
                      <p className="text-lg font-bold text-blue-600">₩{data.total_net.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow>
                        <TableHead className="px-8 font-bold text-slate-900">DMP 종류</TableHead>
                        <TableHead className="text-right font-bold text-slate-900">집행 금액 (Gross)</TableHead>
                        <TableHead className="text-right font-bold text-slate-900">매체 순액 (Net)</TableHead>
                        <TableHead className="text-right font-bold text-slate-900">DMP 수수료</TableHead>
                        <TableHead className="px-8 text-center font-bold text-slate-900">건수</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((row, idx) => (
                        <TableRow key={idx} className="hover:bg-slate-50/30 transition-colors group">
                          <TableCell className="px-8 font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
                            {row.dmp_type}
                          </TableCell>
                          <TableCell className="text-right group-hover:bg-slate-100/30 font-medium">
                            ₩{row.total_execution.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right group-hover:bg-blue-50/30 text-blue-600 font-bold">
                            ₩{row.total_net.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right group-hover:bg-purple-50/30 text-purple-600 font-bold">
                            ₩{row.fee_amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="px-8 text-center text-slate-400 font-mono text-xs">
                            {row.row_count}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="px-8 py-6 bg-slate-50/20 flex justify-between items-center">
                  <p className="text-xs text-slate-400 italic">
                    * 수수료(DMP) = 집행 금액 - 매체 순액. 위 금액은 수수료 포함 기준입니다.
                  </p>
                  <Button 
                    onClick={handleExport}
                    className="rounded-xl bg-slate-900 hover:bg-black text-white px-6 shadow-xl shadow-slate-900/10 hover:translate-y-[-2px] transition-all"
                  >
                    <FileText className="mr-2 h-4 w-4" /> HTML 리포트 내보내기
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-32 flex flex-col items-center justify-center text-center space-y-4"
              >
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                  <TrendingDown size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">해당 월의 데이터가 없습니다</h3>
                  <p className="text-slate-400 text-sm max-w-[280px] mx-auto mt-1">
                    CSV 파일을 먼저 업로드하여 데이터베이스를 구축하십시오.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
};
