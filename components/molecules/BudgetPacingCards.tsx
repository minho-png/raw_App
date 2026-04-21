import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CircleDollarSign,
  Wallet,
  Flame,
  TrendingUp,
  TrendingDown,
  Zap
} from "lucide-react";
import { BudgetStatus, CampaignConfig } from "@/types";
import { cn } from "@/lib/utils";

interface BudgetPacingCardsProps {
  status: BudgetStatus;
  campaign?: CampaignConfig;
  isLoading?: boolean;
}

export const BudgetPacingCards: React.FC<BudgetPacingCardsProps> = ({ status, campaign: _campaign, isLoading }) => {
  const getBurnRateColor = (rate: number) => {
    if (rate >= 90) return "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]";
    if (rate >= 70) return "bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]";
    return "bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]";
  };

  const getPacingBadge = (pacing: string) => {
    switch (pacing) {
      case 'over': return <Badge className="bg-red-500 border-none">초과</Badge>;
      case 'warning': return <Badge className="bg-orange-500 border-none">주의</Badge>;
      default: return <Badge className="bg-green-500 border-none">정상</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-white border border-slate-200 shadow-sm animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">집행 금액 (VAT 포함)</CardTitle>
            <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600 border border-blue-100">
              <CircleDollarSign size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900 tracking-tight font-outfit">
              <span className="text-sm font-medium mr-1 text-slate-400">₩</span>
              {status.spent.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
              <p className="text-xs text-slate-400 font-bold uppercase tracking-tight italic">누적 집행 결과</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">잔여 예산</CardTitle>
            <div className="p-2.5 bg-slate-50 rounded-xl text-slate-700 border border-slate-200">
              <Wallet size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-800 tracking-tight font-outfit">
              <span className="text-sm font-medium mr-1 text-slate-400">₩</span>
              {status.remaining.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
              <p className="text-xs text-slate-400 font-bold uppercase tracking-tight">가용 잔액</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">예산 소진 속도</CardTitle>
            <div className={cn("p-2.5 rounded-xl text-white group-hover:scale-110 transition-transform shadow-lg", getBurnRateColor(status.burn_rate))}>
              <Flame size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-3">
              <div className="text-3xl font-black text-slate-900 tracking-tight font-outfit">{status.burn_rate.toFixed(1)}<span className="text-sm ml-0.5">%</span></div>
              <div className="flex flex-col items-end">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">상태</span>
                {getPacingBadge(status.pacing_status)}
              </div>
            </div>
            <Progress value={status.burn_rate} className="h-2 bg-slate-100/50" indicatorClassName={getBurnRateColor(status.burn_rate)} />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">KPI 인텔리전스</CardTitle>
            <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600 border border-blue-100">
              <Zap size={18} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-tighter leading-none mb-1">실질 CPC</p>
                <div className="text-xl font-black text-slate-900 font-outfit">₩{Math.round(status.actual_cpc).toLocaleString()}</div>
              </div>
              {status.target_cpc && (
                <div className="text-right">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-tighter mb-1">목표: ₩{status.target_cpc.toLocaleString()}</p>
                  <div className={cn(
                    "text-[10px] font-black px-2 py-0.5 rounded-lg inline-flex items-center gap-1",
                    status.actual_cpc <= status.target_cpc ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"
                  )}>
                    {status.actual_cpc <= status.target_cpc ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
                    {Math.abs(((status.actual_cpc - status.target_cpc) / status.target_cpc) * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100/50">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-tighter leading-none mb-1">광고 반응률 (CTR)</p>
                <div className="text-xl font-black text-slate-900 font-outfit">{status.actual_ctr.toFixed(2)}%</div>
              </div>
              {status.target_ctr && (
                <div className="text-right">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-tighter mb-1">목표: {status.target_ctr}%</p>
                  <div className={cn(
                    "text-[10px] font-black px-2 py-0.5 rounded-lg inline-flex items-center gap-1",
                    status.actual_ctr >= status.target_ctr ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"
                  )}>
                    {status.actual_ctr >= status.target_ctr ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {Math.abs(((status.actual_ctr - status.target_ctr) / status.target_ctr) * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
