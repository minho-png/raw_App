import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  CircleDollarSign, 
  Wallet, 
  Flame, 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Zap 
} from "lucide-react";
import { BudgetStatus } from "../../types";
import { cn } from "@/lib/utils";

interface BudgetPacingCardsProps {
  status: BudgetStatus;
  isLoading?: boolean;
}

export const BudgetPacingCards: React.FC<BudgetPacingCardsProps> = ({ status, isLoading }) => {
  const getBurnRateColor = (rate: number) => {
    if (rate >= 90) return "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]";
    if (rate >= 70) return "bg-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]";
    return "bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]";
  };

  const getPacingBadge = (pacing: string) => {
    switch (pacing) {
      case 'over': return <Badge className="bg-red-500 border-none">OVER</Badge>;
      case 'warning': return <Badge className="bg-orange-500 border-none">WARN</Badge>;
      default: return <Badge className="bg-green-500 border-none">STABLE</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 rounded-3xl bg-white/40 backdrop-blur-md border border-white/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="rounded-3xl border-white/40 bg-white/30 backdrop-blur-xl shadow-xl overflow-hidden border hover:border-white/60 transition-colors group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">소진액 (Spent)</CardTitle>
            <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500 group-hover:scale-110 transition-transform">
              <CircleDollarSign size={16} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              ₩{status.spent.toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium italic">당일 포함 누적 집행</p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="rounded-3xl border-white/40 bg-white/30 backdrop-blur-xl shadow-xl overflow-hidden border hover:border-white/60 transition-colors group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">잔여 예산 (Rem.)</CardTitle>
            <div className="p-2 bg-slate-100 rounded-xl text-slate-400 group-hover:scale-110 transition-transform">
              <Wallet size={16} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800 tracking-tight">
              ₩{status.remaining.toLocaleString()}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">총 예산 대비 잔액</p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="rounded-3xl border-white/40 bg-white/30 backdrop-blur-xl shadow-xl overflow-hidden border hover:border-white/60 transition-colors group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">소진율 (Burn)</CardTitle>
            <div className={cn("p-2 rounded-xl text-white group-hover:scale-110 transition-transform shadow-lg", getBurnRateColor(status.burn_rate))}>
              <Flame size={16} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-2">
              <div className="text-2xl font-black text-slate-900 tracking-tight">{status.burn_rate.toFixed(1)}%</div>
              <span className="text-[10px] font-bold text-slate-400">Target 100%</span>
            </div>
            <Progress value={status.burn_rate} className="h-1.5 bg-slate-100" indicatorClassName={getBurnRateColor(status.burn_rate)} />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="rounded-3xl border-white/40 bg-white/30 backdrop-blur-xl shadow-xl overflow-hidden border hover:border-white/60 transition-colors group">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-wider">페이스 지수</CardTitle>
            {getPacingBadge(status.pacing_status)}
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-black text-slate-900 tracking-tight">{status.pacing_index.toFixed(1)}</div>
              {status.pacing_index > 100 ? (
                <TrendingUp size={20} className="text-red-500" />
              ) : (
                <TrendingDown size={20} className="text-blue-500" />
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">권장 소진 속도 대비 <span className={status.pacing_index > 100 ? "text-red-500" : "text-blue-500"}>{status.pacing_index > 100 ? "상회" : "하회"}</span></p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
