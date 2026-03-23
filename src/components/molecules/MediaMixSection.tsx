'use client';

/**
 * 매체 믹스 비교 섹션 — IMC 마케터 + 브랜딩 마케터 요청
 * 매체별 성과(노출/클릭/집행/CPC/CTR/CPM)를 한 화면에서 비교합니다.
 */
import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { PerformanceRecord } from '@/types';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  records: PerformanceRecord[];
}

const MEDIA_COLORS: Record<string, string> = {
  '네이버GFA':   '#03C75A',
  '카카오Moment':'#FEE500',
  '메타Ads':     '#1877F2',
  '구글Ads':     '#EA4335',
};
const FALLBACK_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

// 숫자 축약 포맷
function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

function fmtKrw(n: number) {
  if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₩${(n / 1_000).toFixed(0)}K`;
  return `₩${Math.round(n)}`;
}

export const MediaMixSection: React.FC<Props> = ({ records }) => {
  const mediaStats = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number; spend: number }>();

    for (const r of records) {
      const key = r.media || '기타';
      const prev = map.get(key) ?? { impressions: 0, clicks: 0, spend: 0 };
      map.set(key, {
        impressions: prev.impressions + (r.impressions ?? 0),
        clicks:      prev.clicks      + (r.clicks      ?? 0),
        spend:       prev.spend       + (r.execution_amount ?? 0),
      });
    }

    return Array.from(map.entries())
      .map(([media, v], i) => ({
        media,
        color: MEDIA_COLORS[media] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        impressions: v.impressions,
        clicks:      v.clicks,
        spend:       v.spend,
        cpc:  v.clicks > 0 ? Math.round(v.spend / v.clicks) : 0,
        ctr:  v.impressions > 0 ? parseFloat(((v.clicks / v.impressions) * 100).toFixed(2)) : 0,
        cpm:  v.impressions > 0 ? parseFloat(((v.spend / v.impressions) * 1000).toFixed(0)) : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [records]);

  if (mediaStats.length === 0) return null;

  const totalSpend = mediaStats.reduce((s, m) => s + m.spend, 0);
  const avgCpc = mediaStats.reduce((s, m) => s + m.clicks, 0) > 0
    ? Math.round(mediaStats.reduce((s, m) => s + m.spend, 0) / mediaStats.reduce((s, m) => s + m.clicks, 0))
    : 0;

  // 차트용 데이터
  const chartData = mediaStats.map(m => ({
    name: m.media,
    '집행금액': Math.round(m.spend),
    '클릭수': m.clicks,
    'CPC': m.cpc,
    'CPM': m.cpm,
  }));

  return (
    <div className="space-y-6">
      {/* 매체별 성과 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {mediaStats.map(m => {
          const sharePercent = totalSpend > 0 ? ((m.spend / totalSpend) * 100).toFixed(1) : '0';
          const cpcVsAvg = avgCpc > 0 ? ((m.cpc - avgCpc) / avgCpc) * 100 : 0;
          return (
            <div
              key={m.media}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm overflow-hidden relative"
            >
              {/* 매체 컬러 바 */}
              <div className="absolute top-0 left-0 right-0 h-1" style={{ background: m.color }} />

              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">{m.media}</span>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-lg"
                  style={{ background: `${m.color}20`, color: m.color }}
                >
                  {sharePercent}%
                </span>
              </div>

              {/* 집행 금액 */}
              <div className="text-2xl font-black text-slate-900 font-outfit mb-1">
                {fmtKrw(m.spend)}
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
                <Metric label="CPC" value={`₩${m.cpc.toLocaleString()}`}
                  trend={cpcVsAvg > 5 ? 'bad' : cpcVsAvg < -5 ? 'good' : 'neutral'}
                />
                <Metric label="CTR" value={`${m.ctr}%`} />
                <Metric label="CPM" value={fmtKrw(m.cpm)} />
              </div>

              <div className="flex justify-between text-xs text-slate-400 font-bold mt-3">
                <span>노출 {fmt(m.impressions)}</span>
                <span>클릭 {fmt(m.clicks)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 집행금액 비교 차트 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-5">매체별 집행금액 · CPC · CPM 비교</h4>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => fmtKrw(v)} width={60} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₩${v.toLocaleString()}`} width={70} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 12, padding: '10px 14px' }}
                labelStyle={{ color: '#f8fafc', fontWeight: 900, fontSize: 12 }}
                itemStyle={{ color: '#94a3b8', fontSize: 11 }}
                formatter={(value: any, name: any) => {
                  if (name === '집행금액' || name === 'CPC' || name === 'CPM')
                    return [`₩${Number(value).toLocaleString()}`, name];
                  return [value, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
              <Bar yAxisId="left" dataKey="집행금액" radius={[8, 8, 0, 0]}
                fill="#6366f1"
                label={false}
              />
              <Bar yAxisId="right" dataKey="CPC" radius={[8, 8, 0, 0]} fill="#10b981" />
              <Bar yAxisId="right" dataKey="CPM" radius={[8, 8, 0, 0]} fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

function Metric({
  label, value, trend = 'neutral'
}: {
  label: string; value: string; trend?: 'good' | 'bad' | 'neutral'
}) {
  const Icon = trend === 'good' ? TrendingDown : trend === 'bad' ? TrendingUp : Minus;
  const color = trend === 'good' ? 'text-green-500' : trend === 'bad' ? 'text-red-400' : 'text-slate-300';
  return (
    <div className="text-center">
      <div className="text-[10px] font-black text-slate-400 uppercase mb-0.5">{label}</div>
      <div className={cn('text-xs font-black text-slate-700 flex items-center justify-center gap-0.5')}>
        <Icon size={9} className={color} />
        {value}
      </div>
    </div>
  );
}
