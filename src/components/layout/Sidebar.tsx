"use client";

import React, { useEffect, useState } from 'react';
import { useCampaignStore } from '@/store/useCampaignStore';
import { Plus, BarChart3, AlertTriangle, Receipt, Search, LayoutGrid } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getCampaignsAction, saveCampaignAction, deleteCampaignAction } from '@/server/actions/campaign';
import { CampaignConfig } from '@/types';
import { genId } from '@/lib/idGenerator';
import { CampaignListItem } from '@/components/molecules/CampaignListItem';
import { AnimatedModal } from '@/components/atoms/AnimatedModal';

export const Sidebar = () => {
  const { campaigns, selectedCampaignId, selectCampaign, setCampaigns, isSyncing, setIsSyncing, updateCampaign, refreshCampaigns, activeMainView, setActiveMainView } = useCampaignStore();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignConfig | null>(null);
  const [tempName, setTempName] = useState("");
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<'all' | '네이버GFA' | '카카오Moment' | '구글Ads' | '메타Ads'>('all');
  // 삭제 확인 모달 상태 (디자이너 유진: confirm() 대신 디자인된 모달)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const deletingCampaign = campaigns.find(c => c.campaign_id === deleteConfirmId);

  const filteredCampaigns = campaigns.filter((campaign) => {
    const nameMatch = campaign.campaign_name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!nameMatch) return false;
    if (mediaFilter === 'all') return true;
    return (campaign.sub_campaigns || []).some((sub) => sub.media === mediaFilter);
  });

  // Initial fetch and polling
  useEffect(() => {
    const sync = () => refreshCampaigns(getCampaignsAction);
    sync(); // Initial
    
    const interval = setInterval(sync, 30000); // Poll every 30s for "streaming" feel
    return () => clearInterval(interval);
  }, [refreshCampaigns]);

  const handleAddCampaign = async () => {
    setIsSyncing(true); // Prevent background sync
    const newId = `CAMP-${genId(8)}`;
    const now = new Date().toISOString().split('T')[0];
    const newCampaign: CampaignConfig = {
      campaign_id: newId,
      campaign_name: `신규 캠페인 (${now})`,
      created_at: new Date(),
      sub_campaigns: []
    };

    try {
      const result = await saveCampaignAction(newCampaign);
      if (result.success && result.campaigns) {
        setCampaigns(result.campaigns);
        selectCampaign(newId);
        // 생성 즉시 이름 편집 모달 오픈 — 사용자가 바로 이름을 지정할 수 있도록
        setEditingCampaign(newCampaign);
        setTempName(newCampaign.campaign_name);
        setIsEditModalOpen(true);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleteConfirmId(null);
    setIsSyncing(true);
    try {
      const result = await deleteCampaignAction(deleteConfirmId);
      if (result.success && result.campaigns) {
        setCampaigns(result.campaigns);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <aside className="w-72 h-screen bg-slate-100 border-r border-slate-200 text-slate-800 flex flex-col p-6 shadow-sm z-20">
      <div className="flex items-center gap-3 mb-10 px-2 group cursor-pointer">
        <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform duration-300">
          <BarChart3 size={20} className="text-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-outfit font-black text-xl tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-500">RAW MASTER</span>
          <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mt-1">인텔리전스 프로</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-2 -mr-2 scrollbar-thin">
        <div className="mb-4 flex items-center justify-between px-2">
          <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">캠페인 관리</h2>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleAddCampaign}
            className="w-7 h-7 flex items-center justify-center bg-slate-200 hover:bg-blue-600 rounded-lg transition-colors text-slate-500 hover:text-white shadow-inner"
          >
            <Plus size={16} />
          </motion.button>
        </div>

        <div className="mb-3 px-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
            <Search size={13} className="text-slate-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="캠페인 검색"
              className="w-full bg-transparent text-xs font-semibold text-slate-800 outline-none placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto px-2 pb-1">
          {[
            { key: 'all', label: '전체' },
            { key: '네이버GFA', label: '네이버' },
            { key: '카카오Moment', label: '카카오' },
            { key: '구글Ads', label: '구글' },
            { key: '메타Ads', label: '메타' },
          ].map((chip) => (
            <button
              key={chip.key}
              onClick={() => setMediaFilter(chip.key as typeof mediaFilter)}
              className={cn(
                "whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors",
                mediaFilter === chip.key
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <nav className="space-y-1.5">
          {filteredCampaigns.map((camp) => (
            <CampaignListItem
              key={camp.campaign_id}
              campaign={camp}
              isSelected={selectedCampaignId === camp.campaign_id}
              onSelect={selectCampaign}
              onEditClick={(c) => {
                setEditingCampaign(c);
                setTempName(c.campaign_name);
                setIsEditModalOpen(true);
              }}
              onDeleteClick={handleDeleteCampaign}
            />
          ))}
          {filteredCampaigns.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white/60 px-3 py-6 text-center">
              <p className="text-xs font-semibold text-slate-500">조건에 맞는 캠페인이 없습니다.</p>
            </div>
          )}
        </nav>
      </div>

      <div className="pt-4 mt-4 border-t border-slate-200">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveMainView('campaigns')}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all",
              activeMainView === 'campaigns'
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700"
            )}
          >
            <LayoutGrid size={13} />
            <span className="text-[11px] font-extrabold">캠페인 정산</span>
          </button>
          <button
            onClick={() => setActiveMainView('settlement')}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all",
              activeMainView === 'settlement'
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-200 text-slate-500 hover:bg-white hover:text-slate-700"
            )}
          >
            <Receipt size={13} />
            <span className="text-[11px] font-extrabold">DMP 정산</span>
          </button>
        </div>

        <button
          onClick={() => setActiveMainView(activeMainView === 'settlement' ? 'campaigns' : 'settlement')}
          className={cn(
            "w-full flex items-center gap-3 p-3.5 rounded-xl transition-all text-left",
            activeMainView === 'settlement'
              ? "bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100"
              : "hover:bg-white border border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0",
            activeMainView === 'settlement' ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"
          )}>
            <Receipt size={14} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black tracking-tight">DMP 정산</span>
            <span className="text-[10px] text-slate-500 mt-0.5">월별 전체 캠페인</span>
          </div>
        </button>
      </div>

      <div className="pt-6 mt-6 border-t border-slate-200">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-colors" />
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">요약 현황</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <p className="text-[10px] text-slate-500">활성 캠페인</p>
              <p className="text-xs font-extrabold text-slate-700">{campaigns.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <p className="text-[10px] text-slate-500">필터 결과</p>
              <p className="text-xs font-extrabold text-slate-700">{filteredCampaigns.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />
              <div className="absolute inset-0 w-2.5 h-2.5 bg-green-500 rounded-full animate-ping opacity-75" />
            </div>
            <span className="text-xs font-bold text-slate-600">실시간 데이터 동기화 중</span>
          </div>
        </div>
      </div>

      {/* 삭제 확인 모달 — 디자이너 유진: confirm() 대신 디자인된 경고 모달 */}
      <AnimatedModal isOpen={!!(deleteConfirmId && deletingCampaign)} onClose={() => setDeleteConfirmId(null)} maxWidth="sm">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">캠페인 삭제</h3>
              <p className="text-xs text-slate-500 mt-0.5">이 작업은 되돌릴 수 없습니다.</p>
            </div>
          </div>
          {deletingCampaign && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-sm font-bold text-red-700 truncate">"{deletingCampaign.campaign_name}"</p>
              <p className="text-xs text-red-500 mt-1">캠페인과 관련된 모든 성과 데이터가 영구 삭제됩니다.</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-11 border-slate-200 text-slate-600 font-bold"
              onClick={() => setDeleteConfirmId(null)}
            >
              취소
            </Button>
            <Button
              className="flex-1 rounded-xl h-11 bg-red-600 hover:bg-red-700 text-white font-bold border-none"
              onClick={confirmDelete}
            >
              삭제
            </Button>
          </div>
        </div>
      </AnimatedModal>

      <AnimatedModal isOpen={isEditModalOpen && !!editingCampaign} onClose={() => setIsEditModalOpen(false)} maxWidth="sm">
        <div className="p-6 space-y-4">
          <h3 className="text-lg font-bold text-slate-900 border-b pb-2">캠페인 이름 수정</h3>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">캠페인 명칭</label>
            <input
              autoFocus
              className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 font-bold"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && editingCampaign) {
                  const updated = { ...editingCampaign, campaign_name: tempName, updated_at: new Date() };
                  setIsEditModalOpen(false);
                  updateCampaign(updated);
                  setIsSyncing(true);
                  try {
                    const result = await saveCampaignAction(updated);
                    if (result.success && result.campaigns) {
                      setCampaigns(result.campaigns);
                    }
                  } finally {
                    setIsSyncing(false);
                  }
                }
              }}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-11 border-slate-200 text-slate-600 font-bold"
              onClick={() => setIsEditModalOpen(false)}
            >
              취소
            </Button>
            <Button
              className="flex-1 rounded-xl h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold"
              onClick={async () => {
                if (editingCampaign) {
                  const updated = { ...editingCampaign, campaign_name: tempName, updated_at: new Date() };
                  setIsEditModalOpen(false);
                  updateCampaign(updated);
                  setIsSyncing(true);
                  try {
                    const result = await saveCampaignAction(updated);
                    if (result.success && result.campaigns) {
                      setCampaigns(result.campaigns);
                    }
                  } finally {
                    setIsSyncing(false);
                  }
                }
              }}
            >
              저장
            </Button>
          </div>
        </div>
      </AnimatedModal>
    </aside>
  );
};
