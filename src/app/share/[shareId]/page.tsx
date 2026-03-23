'use client';

/**
 * 공개 공유 보고서 페이지 — 인증 불필요
 * Sprint 3 - FE 개발자 작성
 *
 * URL: /share/[shareId]
 * 기능:
 * - 비밀번호 보호 처리
 * - 캠페인 성과 차트 + 테이블 렌더링
 * - 인쇄/PDF 저장 지원
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface ShareData {
  campaign: { campaign_name: string; campaign_id: string };
  records: any[];
  config: { sections: string[]; show_budget: boolean; branding: boolean };
  generated_at: string;
  view_count: number;
}

const DMP_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

// ──────────────────────────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────────────────────────

export default function SharedReportPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchReport();
  }, [shareId]);

  async function fetchReport() {
    setStatus('loading');
    try {
      const res = await fetch(`/api/v1/share/${shareId}`);
      const json = await res.json();

      if (!res.ok) {
        setErrorMsg(json.error ?? '알 수 없는 오류');
        setStatus('error');
        return;
      }
      setData(json);
      setStatus('ready');
    } catch {
      setErrorMsg('보고서를 불러오는 중 오류가 발생했습니다.');
      setStatus('error');
    }
  }

  // ── 로딩 ──────────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-sm animate-pulse">보고서 불러오는 중...</div>
      </div>
    );
  }

  // ── 에러 ──────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-white mb-2">보고서를 찾을 수 없습니다</div>
          <div className="text-gray-400 text-sm">{errorMsg}</div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // ── 보고서 렌더링 ──────────────────────────────────────────────────────────
  const { campaign, records, config } = data;

  // 일별 집계
  const dailyMap = new Map<string, { impressions: number; clicks: number; spend?: number }>();
  for (const r of records) {
    const date = new Date(r.date).toISOString().slice(0, 10);
    const prev = dailyMap.get(date) ?? { impressions: 0, clicks: 0, spend: 0 };
    dailyMap.set(date, {
      impressions: prev.impressions + (r.impressions ?? 0),
      clicks: prev.clicks + (r.clicks ?? 0),
      spend: (prev.spend ?? 0) + (r.execution_amount ?? 0),
    });
  }
  const dailyData = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date: date.slice(5),  // MM-DD
      노출수: v.impressions,
      클릭수: v.clicks,
      CPC: v.clicks > 0 ? Math.round((v.spend ?? 0) / v.clicks) : 0,
    }));

  // DMP 집계
  const dmpMap = new Map<string, number>();
  for (const r of records) {
    const key = r.dmp_type || 'DIRECT';
    dmpMap.set(key, (dmpMap.get(key) ?? 0) + (r.clicks ?? 0));
  }
  const dmpData = Array.from(dmpMap.entries()).map(([name, value]) => ({ name, value }));

  return (
    <div className="min-h-screen bg-gray-950 text-white print:bg-white print:text-black">
      {/* 헤더 */}
      <header className="border-b border-gray-800 print:border-gray-200 px-8 py-5 flex items-center justify-between">
        <div>
          {config.branding && (
            <div className="text-xs text-indigo-400 mb-0.5 font-medium tracking-wide uppercase">
              GFA RAW MASTER PRO
            </div>
          )}
          <h1 className="text-xl font-bold text-white print:text-black">{campaign.campaign_name}</h1>
          <div className="text-xs text-gray-500 mt-0.5">
            생성일: {new Date(data.generated_at).toLocaleDateString('ko-KR')}
            {' · '}조회 {data.view_count.toLocaleString()}회
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="print:hidden text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg transition-colors"
        >
          PDF 저장
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-10 space-y-10">

        {/* 요약 KPI */}
        {config.sections.includes('trend') && (
          <Section title="성과 트렌드">
            <KpiCards records={records} showBudget={config.show_budget} />
            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                    labelStyle={{ color: '#f9fafb' }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="노출수" fill="#6366f1" opacity={0.8} />
                  <Line yAxisId="right" type="monotone" dataKey="클릭수" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="CPC" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Section>
        )}

        {/* DMP 분포 */}
        {config.sections.includes('dmp_share') && dmpData.length > 0 && (
          <Section title="DMP 분포">
            <div className="h-64 flex items-center">
              <ResponsiveContainer width="50%" height="100%">
                <PieChart>
                  <Pie data={dmpData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                    dataKey="value" nameKey="name" label={(props: any) =>
                      `${props.name ?? ''} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`
                    }
                  >
                    {dmpData.map((_, i) => (
                      <Cell key={i} fill={DMP_COLORS[i % DMP_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {dmpData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full inline-block" style={{ background: DMP_COLORS[i % DMP_COLORS.length] }} />
                    <span className="text-gray-300 flex-1">{d.name}</span>
                    <span className="text-white font-medium">{d.value.toLocaleString()} 클릭</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* 워터마크 */}
        {config.branding && (
          <div className="text-center text-xs text-gray-600 pt-4 border-t border-gray-800">
            Powered by GFA RAW MASTER PRO
          </div>
        )}
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-200 mb-4 pb-2 border-b border-gray-800">{title}</h2>
      {children}
    </section>
  );
}

function KpiCards({ records, showBudget }: { records: any[]; showBudget: boolean }) {
  const totalImpressions = records.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const totalClicks = records.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const totalSpend = records.reduce((s, r) => s + (r.execution_amount ?? 0), 0);
  const avgCpc = totalClicks > 0 ? Math.round(totalSpend / totalClicks) : 0;
  const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';

  const cards = [
    { label: '총 노출', value: totalImpressions.toLocaleString() },
    { label: '총 클릭', value: totalClicks.toLocaleString() },
    { label: 'CTR', value: `${avgCtr}%` },
    { label: 'CPC', value: `₩${avgCpc.toLocaleString()}` },
    ...(showBudget ? [{ label: '총 집행액', value: `₩${Math.round(totalSpend).toLocaleString()}` }] : []),
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-gray-900 print:bg-gray-100 rounded-xl p-4 border border-gray-800">
          <div className="text-xs text-gray-500 mb-1">{c.label}</div>
          <div className="text-xl font-bold text-white print:text-black">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
