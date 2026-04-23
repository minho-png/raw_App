"use client";

import type { MotivCampaign } from '@/lib/motivApi/types';

interface Props {
  campaigns: MotivCampaign[];
  isLoading: boolean;
}

const nf = new Intl.NumberFormat('ko-KR');
const fmtNum = (n: number | null | undefined) => (n == null ? '-' : nf.format(Math.round(n)));
const fmtPct = (n: number | null | undefined) => (n == null ? '-' : `${n.toFixed(2)}%`);

function statusBadge(status: string) {
  const isActive = status === 'Y';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      {isActive ? '활성' : '비활성'}
    </span>
  );
}

function typeBadge(type: string) {
  const map: Record<string, string> = {
    DISPLAY: 'bg-blue-100 text-blue-700',
    VIDEO: 'bg-purple-100 text-purple-700',
    TV: 'bg-indigo-100 text-indigo-700',
    PARTNERS: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${map[type] ?? 'bg-slate-100 text-slate-600'}`}>
      {type}
    </span>
  );
}

export function CampaignTable({ campaigns, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-500">
        불러오는 중…
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-500">
        조건에 맞는 캠페인이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th className="border-b px-4 py-3 text-left">ID</th>
            <th className="border-b px-4 py-3 text-left">캠페인명</th>
            <th className="border-b px-4 py-3 text-left">타입</th>
            <th className="border-b px-4 py-3 text-left">상태</th>
            <th className="border-b px-4 py-3 text-left">기간</th>
            <th className="border-b px-4 py-3 text-right">예산(일/총)</th>
            <th className="border-b px-4 py-3 text-right">소진(일/총)</th>
            <th className="border-b px-4 py-3 text-right">노출</th>
            <th className="border-b px-4 py-3 text-right">클릭</th>
            <th className="border-b px-4 py-3 text-right">CTR</th>
            <th className="border-b px-4 py-3 text-right">CPC</th>
            <th className="border-b px-4 py-3 text-right">집행비용</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c, idx) => (
            <tr
              key={c.id}
              className={`border-b last:border-none hover:bg-blue-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
            >
              <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.id}</td>
              <td className="max-w-[280px] truncate px-4 py-3 font-medium text-gray-900" title={c.title ?? ''}>
                {c.title ?? '-'}
              </td>
              <td className="px-4 py-3">{typeBadge(c.campaign_type)}</td>
              <td className="px-4 py-3">{statusBadge(c.status)}</td>
              <td className="px-4 py-3 text-xs text-gray-600">
                {c.start_date ?? '-'}
                <span className="mx-1 text-gray-300">~</span>
                {c.end_date ?? '-'}
              </td>
              <td className="px-4 py-3 text-right text-xs text-gray-700">
                {fmtNum(c.daily_budget)}
                <div className="text-gray-400">{fmtNum(c.total_budget)}</div>
              </td>
              <td className="px-4 py-3 text-right text-xs text-gray-700">
                {fmtNum(c.daily_spent)}
                <div className="text-gray-400">{fmtNum(c.total_spent)}</div>
              </td>
              <td className="px-4 py-3 text-right">{fmtNum(c.stats.v_impression || c.stats.win)}</td>
              <td className="px-4 py-3 text-right">{fmtNum(c.stats.click)}</td>
              <td className="px-4 py-3 text-right">{fmtPct(c.stats.ctr)}</td>
              <td className="px-4 py-3 text-right">{fmtNum(c.stats.cpc)}</td>
              <td className="px-4 py-3 text-right font-semibold text-blue-700">
                ₩{fmtNum(c.stats.payprice)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
