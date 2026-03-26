'use client';

import React, { useState } from 'react';
import { useCampaignStore } from '@/store/useCampaignStore';
import { Layers, TrendingUp, MousePointer, DollarSign, Edit2, Check, X } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { updateImcCampaignAction } from '@/server/actions/imcCampaign';

const MEDIA_COLORS: Record<string, string> = {
  '네이버GFA': '#03c75a',
  '카카오Moment': '#ffe812',
  '메타Ads': '#1877f2',
  '구글Ads': '#ea4335',
};
const FALLBACK_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];

/**
 * ImcDashboard — IMC 마스터 캠페인 선택 시 렌더링되는 통합 대시보드.
 * selectedImcCampaignId가 null이면 null 반환.
 */
export const ImcDashboard: React.FC = () => {
  const { imcCampaigns, setImcCampaigns, selectedImcCampaignId, campaigns, selectCampaign } = useCampaignStore();

  const selectedImc = imcCampaigns.find(i => i.imc_campaign_id === selectedImcCampaignId);
  const subCampaigns = campaigns.filter(c => c.imc_campaign_id === selectedImcCampaignId);

  // IMC 이름 인라인 편집 상태
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  if (!selectedImc) return null;

  // 매체별 서브캠페인 수 집계
  const mediaGroups = subCampaigns.reduce<Record<string, number>>((acc, camp) => {
    (camp.sub_campaigns || []).forEach(s => {
      acc[s.media] = (acc[s.media] || 0) + 1;
    });
    return acc;
  }, {});

  const pieData = Object.entries(mediaGroups).map(([name, value]) => ({ name, value }));
  const getColor = (name: string, idx: number) => MEDIA_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];

  const totalSubCampaigns = subCampaigns.reduce((s, c) => s + (c.sub_campaigns?.length || 0), 0);

  const handleSaveName = async () => {
    if (!editName.trim() || editName === selectedImc.name) {
      setIsEditingName(false);
      return;
    }
    const result = await updateImcCampaignAction(selectedImc.imc_campaign_id, { name: editName.trim() });
    if (result.success) {
      setImcCampaigns(imcCampaigns.map(i =>
        i.imc_campaign_id === selectedImc.imc_campaign_id ? { ...i, name: editName.trim() } : i
      ));
    }
    setIsEditingName(false);
  };

  return (
    <div className="p-8 space-y-8">
      {/* IMC 헤더 */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0">
          <Layers size={24} />
        </div>
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
                className="text-2xl font-black text-slate-900 tracking-tight bg-white border-b-2 border-indigo-500 outline-none px-1 w-full max-w-sm"
              />
              <button onClick={handleSaveName} className="text-green-600 hover:text-green-700">
                <Check size={18} />
              </button>
              <button onClick={() => setIsEditingName(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight truncate">{selectedImc.name}</h2>
              <button
                onClick={() => { setEditName(selectedImc.name); setIsEditingName(true); }}
                className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Edit2 size={16} />
              </button>
            </div>
          )}
          <p className="text-slate-500 text-sm font-medium mt-0.5">
            IMC 마스터 캠페인 · {subCampaigns.length}개 캠페인
          </p>
        </div>
      </div>

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: '소속 캠페인',
            value: subCampaigns.length,
            unit: '개',
            icon: Layers,
            color: 'text-indigo-500',
            bg: 'bg-indigo-50',
          },
          {
            label: '총 예산',
            value: selectedImc.total_budget
              ? `${(selectedImc.total_budget / 1e8).toFixed(2)}억`
              : '미설정',
            unit: '',
            icon: DollarSign,
            color: 'text-emerald-500',
            bg: 'bg-emerald-50',
          },
          {
            label: '활성 매체',
            value: Object.keys(mediaGroups).length,
            unit: '개',
            icon: TrendingUp,
            color: 'text-blue-500',
            bg: 'bg-blue-50',
          },
          {
            label: '총 서브캠페인',
            value: totalSubCampaigns,
            unit: '개',
            icon: MousePointer,
            color: 'text-violet-500',
            bg: 'bg-violet-50',
          },
        ].map(({ label, value, unit, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={14} className={color} />
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</span>
            </div>
            <div className="text-2xl font-black text-slate-900">
              {value}
              {unit && <span className="text-sm text-slate-400 ml-1">{unit}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* 매체 구성 파이차트 (서브캠페인이 있을 때만) */}
      {pieData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-6">매체 구성</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={entry.name} fill={getColor(entry.name, i)} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${value}개`, '서브캠페인 수']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 소속 캠페인 목록 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">소속 캠페인</h3>
        {subCampaigns.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Layers size={20} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-400">아직 연결된 캠페인이 없습니다.</p>
            <p className="text-xs text-slate-400 mt-1">캠페인 설정 모달에서 이 IMC 그룹에 연결하세요.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {subCampaigns.map(camp => {
              const mediasRaw = (camp.sub_campaigns || []).map(s => s.media);
              const medias = mediasRaw.filter((m, idx) => mediasRaw.indexOf(m) === idx);
              return (
                <button
                  key={camp.campaign_id}
                  onClick={() => selectCampaign(camp.campaign_id)}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-indigo-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors text-left group"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 text-sm group-hover:text-indigo-700 transition-colors truncate">
                      {camp.campaign_name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {medias.length > 0 ? medias.join(' · ') : '매체 미설정'}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-slate-300 group-hover:text-indigo-300 shrink-0 ml-4 transition-colors">
                    {camp.campaign_id}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
