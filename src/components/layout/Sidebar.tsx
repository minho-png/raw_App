"use client";

import React, { useEffect, useState } from 'react';
import { useCampaignStore } from '@/store/useCampaignStore';
import {
  Plus, AlertTriangle, Search, Layers, ChevronDown, ChevronRight, X,
  LayoutDashboard, ReceiptText, Building2, CreditCard, BarChart2, Sliders,
  Settings, Zap, FolderOpen,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getCampaignsAction, saveCampaignAction, deleteCampaignAction } from '@/server/actions/campaign';
import { getImcCampaignsAction, createImcCampaignAction } from '@/server/actions/imcCampaign';
import { CampaignConfig, Agency, AdAccount } from '@/types';
import { genId } from '@/lib/idGenerator';
import { CampaignListItem } from '@/components/molecules/CampaignListItem';
import { AnimatedModal } from '@/components/atoms/AnimatedModal';
import type { ActivePage } from '@/app/page';

interface SidebarProps {
  activePage: ActivePage;
  setActivePage: (page: ActivePage) => void;
}

interface NavItem {
  label: string;
  icon: React.ReactNode;
  page: ActivePage;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: '메인',
    items: [
      { label: '대시보드', icon: <LayoutDashboard size={16} />, page: 'dashboard' },
      { label: 'DMP 정산', icon: <ReceiptText size={16} />, page: 'settlement' },
    ],
  },
  {
    title: '관리',
    items: [
      { label: '대행사 관리', icon: <Building2 size={16} />, page: 'agencies' },
      { label: '광고 계정', icon: <CreditCard size={16} />, page: 'accounts' },
    ],
  },
  {
    title: '보고서',
    items: [
      { label: '리포트 센터', icon: <BarChart2 size={16} />, page: 'reports' },
      { label: 'DMP 규칙', icon: <Sliders size={16} />, page: 'dmp-rules' },
    ],
  },
];

export const Sidebar = ({ activePage, setActivePage }: SidebarProps) => {
  const {
    campaigns,
    selectedCampaignId,
    selectCampaign,
    setCampaigns,
    isSyncing,
    setIsSyncing,
    updateCampaign,
    refreshCampaigns,
    imcCampaigns,
    setImcCampaigns,
    selectedImcCampaignId,
    selectImcCampaign,
    agencies,
    setAgencies,
    adAccounts,
    setAdAccounts,
  } = useCampaignStore();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignConfig | null>(null);
  const [tempName, setTempName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<'all' | '네이버GFA' | '카카오Moment' | '구글Ads' | '메타Ads'>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const deletingCampaign = campaigns.find(c => c.campaign_id === deleteConfirmId);

  // IMC/마스터 캠페인 state
  const [collapsedImc, setCollapsedImc] = useState<Set<string>>(new Set());
  const [collapsedAgency, setCollapsedAgency] = useState<Set<string>>(new Set());
  const [collapsedAccount, setCollapsedAccount] = useState<Set<string>>(new Set());
  const [isCreatingImc, setIsCreatingImc] = useState(false);
  const [newImcName, setNewImcName] = useState('');
  const [newImcAgencyId, setNewImcAgencyId] = useState('');
  const [newImcAccountId, setNewImcAccountId] = useState('');
  const [isCreatingImcLoading, setIsCreatingImcLoading] = useState(false);
  const [campaignSectionOpen, setCampaignSectionOpen] = useState(true);

  // 선택된 agency에 따라 필터링된 adAccounts
  const filteredAccountsForCreate = newImcAgencyId
    ? adAccounts.filter(a => a.agency_id === newImcAgencyId)
    : adAccounts;

  const filteredCampaigns = campaigns.filter((campaign) => {
    const nameMatch = campaign.campaign_name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!nameMatch) return false;
    if (mediaFilter === 'all') return true;
    return (campaign.sub_campaigns || []).some((sub) => sub.media === mediaFilter);
  });

  useEffect(() => {
    const syncImc = async () => {
      const { campaigns: imc } = await getImcCampaignsAction();
      setImcCampaigns(imc);
    };
    const sync = () => {
      refreshCampaigns(getCampaignsAction);
      syncImc();
    };
    sync();
    const interval = setInterval(sync, 30000);
    return () => clearInterval(interval);
  }, [refreshCampaigns, setImcCampaigns]);

  useEffect(() => {
    const loadHierarchy = async () => {
      try {
        const [agRes, accRes] = await Promise.all([
          fetch('/api/v1/agencies').then(r => r.json()),
          fetch('/api/v1/ad-accounts').then(r => r.json()),
        ]);
        if (agRes.data) setAgencies(agRes.data as Agency[]);
        if (accRes.data) setAdAccounts(accRes.data as AdAccount[]);
      } catch {
        // silent — 계층 정보 없이도 캠페인 목록은 동작
      }
    };
    loadHierarchy();
  }, [setAgencies, setAdAccounts]);

  const handleAddCampaign = async () => {
    setIsSyncing(true);
    const newId = `CAMP-${genId(8)}`;
    const now = new Date().toISOString().split('T')[0];
    const newCampaign: CampaignConfig = {
      campaign_id: newId,
      campaign_name: `신규 캠페인 (${now})`,
      created_at: new Date(),
      sub_campaigns: [],
    };
    try {
      const result = await saveCampaignAction(newCampaign);
      if (result.success && result.campaigns) {
        setCampaigns(result.campaigns);
        selectCampaign(newId);
        setEditingCampaign(newCampaign);
        setTempName(newCampaign.campaign_name);
        setIsEditModalOpen(true);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteCampaign = (id: string) => setDeleteConfirmId(id);

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleteConfirmId(null);
    setIsSyncing(true);
    try {
      const result = await deleteCampaignAction(deleteConfirmId);
      if (result.success && result.campaigns) setCampaigns(result.campaigns);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateImc = async () => {
    if (!newImcName.trim()) return;
    setIsCreatingImcLoading(true);
    try {
      const result = await createImcCampaignAction(
        newImcName.trim(),
        undefined,
        undefined,
        newImcAccountId || undefined,
        newImcAgencyId || undefined
      );
      if (result.success && result.campaign) {
        setImcCampaigns([...imcCampaigns, result.campaign]);
        setNewImcName('');
        setNewImcAgencyId('');
        setNewImcAccountId('');
        setIsCreatingImc(false);
      }
    } finally {
      setIsCreatingImcLoading(false);
    }
  };

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectImc = (imcId: string) => {
    selectImcCampaign(selectedImcCampaignId === imcId ? null : imcId);
  };

  // ── 4단계 계층 그루핑 ─────────────────────────────────────────────────────
  // imc_campaign_id → campaigns
  const campaignsByImc = new Map<string, CampaignConfig[]>();
  filteredCampaigns.forEach(c => {
    if (c.imc_campaign_id) {
      const list = campaignsByImc.get(c.imc_campaign_id) ?? [];
      list.push(c);
      campaignsByImc.set(c.imc_campaign_id, list);
    }
  });

  // account_id → imc campaigns (for this account)
  const imcByAccount = new Map<string, typeof imcCampaigns>();
  imcCampaigns.forEach(imc => {
    if (imc.account_id) {
      const list = imcByAccount.get(imc.account_id) ?? [];
      list.push(imc);
      imcByAccount.set(imc.account_id, list);
    }
  });

  // agency_id → accounts
  const accountsByAgency = new Map<string, AdAccount[]>();
  adAccounts.forEach(acc => {
    const list = accountsByAgency.get(acc.agency_id) ?? [];
    list.push(acc);
    accountsByAgency.set(acc.agency_id, list);
  });

  // 완전히 독립된 캠페인: account_id도 없고 imc도 없음
  const rootIndependentCampaigns = filteredCampaigns.filter(c => !c.imc_campaign_id && !c.account_id);
  // IMC에 속하지만 IMC에 account_id가 없는 레거시 IMC 그룹
  const legacyImcGroups = imcCampaigns.filter(imc => !imc.account_id);

  return (
    <aside className="w-72 h-screen bg-[#0f172a] text-slate-300 flex flex-col shrink-0 z-20">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800/50 shrink-0">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        <span className="text-white font-bold text-sm tracking-tight">RAW MASTER PRO</span>
      </div>

      {/* Scrollable nav + campaigns */}
      <div className="flex-1 overflow-y-auto py-3">
        {/* Navigation sections */}
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-1">
            <p className="px-5 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {section.title}
            </p>
            {section.items.map((item) => {
              const isActive = activePage === item.page && !selectedImcCampaignId;
              return (
                <button
                  key={item.page}
                  onClick={() => {
                    selectImcCampaign(null);
                    setActivePage(item.page);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors text-left',
                    isActive
                      ? 'bg-[#1e293b] text-white'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                  )}
                >
                  {isActive ? (
                    <div className="relative shrink-0">
                      <div className="absolute inset-0 bg-blue-500 blur-[8px] opacity-40 rounded-full" />
                      <span className="relative z-10 text-blue-400">{item.icon}</span>
                    </div>
                  ) : (
                    <span className="shrink-0">{item.icon}</span>
                  )}
                  <span className={cn('font-medium', isActive && 'text-white')}>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}

        {/* System section */}
        <div className="mb-1">
          <p className="px-5 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            시스템
          </p>
          <button className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-slate-400 hover:bg-slate-800/60 hover:text-white transition-colors text-left">
            <Settings size={16} className="shrink-0" />
            <span className="font-medium">설정</span>
          </button>
        </div>

        {/* Campaign section divider */}
        <div className="mx-5 my-3 border-t border-slate-800/60" />

        {/* Campaigns collapsible section */}
        <div>
          <div
            onClick={() => setCampaignSectionOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-400 transition-colors cursor-pointer"
          >
            <span>캠페인</span>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreatingImc(v => !v);
                }}
                title="새 IMC 마스터 캠페인"
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Layers size={11} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleAddCampaign(); }}
                title="새 캠페인"
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Plus size={12} />
              </button>
              {campaignSectionOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {campaignSectionOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {/* 마스터 캠페인 생성 폼 */}
                <AnimatePresence>
                  {isCreatingImc && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mx-3 mb-2 overflow-hidden"
                    >
                      <div className="bg-slate-800 rounded-lg border border-slate-700 p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <Layers size={12} className="text-indigo-400 shrink-0" />
                          <input
                            autoFocus
                            value={newImcName}
                            onChange={(e) => setNewImcName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') { setIsCreatingImc(false); setNewImcName(''); setNewImcAgencyId(''); setNewImcAccountId(''); }
                            }}
                            placeholder="마스터 캠페인명"
                            className="flex-1 bg-transparent text-xs font-semibold text-slate-200 outline-none placeholder:text-slate-500"
                          />
                          <button onClick={() => { setIsCreatingImc(false); setNewImcName(''); setNewImcAgencyId(''); setNewImcAccountId(''); }} className="text-slate-500 hover:text-slate-300">
                            <X size={11} />
                          </button>
                        </div>
                        {agencies.length > 0 && (
                          <select
                            value={newImcAgencyId}
                            onChange={(e) => { setNewImcAgencyId(e.target.value); setNewImcAccountId(''); }}
                            className="w-full bg-slate-700 text-xs text-slate-200 rounded px-2 py-1 outline-none border border-slate-600"
                          >
                            <option value="">대행사 선택 (선택사항)</option>
                            {agencies.map(a => <option key={a.agency_id} value={a.agency_id}>{a.name}</option>)}
                          </select>
                        )}
                        {adAccounts.length > 0 && (
                          <select
                            value={newImcAccountId}
                            onChange={(e) => setNewImcAccountId(e.target.value)}
                            className="w-full bg-slate-700 text-xs text-slate-200 rounded px-2 py-1 outline-none border border-slate-600"
                          >
                            <option value="">광고계정 선택 (선택사항)</option>
                            {filteredAccountsForCreate.map(a => <option key={a.account_id} value={a.account_id}>{a.name}</option>)}
                          </select>
                        )}
                        {adAccounts.length === 0 && (
                          <p className="text-[10px] text-slate-500">광고계정을 먼저 등록하면 계층 구조로 관리됩니다.</p>
                        )}
                      </div>
                      <button
                        disabled={!newImcName.trim() || isCreatingImcLoading}
                        onClick={handleCreateImc}
                        className="w-full mt-1 h-7 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                      >
                        {isCreatingImcLoading ? '생성 중...' : '마스터 캠페인 생성'}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Search */}
                <div className="mx-3 mb-2">
                  <div className="flex items-center gap-2 bg-slate-800/70 rounded-lg border border-slate-700/50 px-3 py-1.5">
                    <Search size={11} className="text-slate-500 shrink-0" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="캠페인 검색"
                      className="w-full bg-transparent text-xs text-slate-300 outline-none placeholder:text-slate-500"
                    />
                  </div>
                </div>

                {/* Media filter chips */}
                <div className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-none">
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
                        'whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors shrink-0',
                        mediaFilter === chip.key
                          ? 'border-blue-500 bg-blue-900/40 text-blue-300'
                          : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400'
                      )}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* Campaign list */}
                <nav className="px-2 space-y-1">
                  {/* ── 4단계 계층 트리 ── */}
                  {/* 1. 대행사별 섹션 */}
                  {agencies.map(agency => {
                    const agAccounts = accountsByAgency.get(agency.agency_id) ?? [];
                    const agCollapsed = collapsedAgency.has(agency.agency_id);
                    return (
                      <div key={agency.agency_id} className="mb-1">
                        <button
                          onClick={() => toggleSet(setCollapsedAgency, agency.agency_id)}
                          className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-slate-800/40 rounded transition-colors"
                        >
                          {agCollapsed ? <ChevronRight size={10} className="text-slate-600 shrink-0" /> : <ChevronDown size={10} className="text-slate-600 shrink-0" />}
                          <Building2 size={10} className="text-slate-500 shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 truncate">{agency.name}</span>
                        </button>
                        <AnimatePresence>
                          {!agCollapsed && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                              {agAccounts.map(account => {
                                const accCollapsed = collapsedAccount.has(account.account_id);
                                const accImcs = imcByAccount.get(account.account_id) ?? [];
                                // campaigns directly under account (no imc)
                                const directCamps = filteredCampaigns.filter(c => c.account_id === account.account_id && !c.imc_campaign_id);
                                return (
                                  <div key={account.account_id} className="ml-3 mb-0.5">
                                    <button
                                      onClick={() => toggleSet(setCollapsedAccount, account.account_id)}
                                      className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-slate-800/40 rounded transition-colors"
                                    >
                                      {accCollapsed ? <ChevronRight size={10} className="text-slate-600 shrink-0" /> : <ChevronDown size={10} className="text-slate-600 shrink-0" />}
                                      <CreditCard size={10} className="text-slate-600 shrink-0" />
                                      <span className="text-[10px] font-semibold text-slate-600 truncate">{account.name}</span>
                                    </button>
                                    <AnimatePresence>
                                      {!accCollapsed && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.12 }} className="overflow-hidden">
                                          <div className="ml-3 space-y-0.5">
                                            {/* 마스터 캠페인 그룹 */}
                                            {accImcs.map(imc => {
                                              const groupCampaigns = campaignsByImc.get(imc.imc_campaign_id) ?? [];
                                              const isImcSelected = selectedImcCampaignId === imc.imc_campaign_id;
                                              const isImcCollapsed = collapsedImc.has(imc.imc_campaign_id);
                                              return (
                                                <div key={imc.imc_campaign_id} className="rounded-lg overflow-hidden border border-slate-700/40">
                                                  <button
                                                    onClick={() => handleSelectImc(imc.imc_campaign_id)}
                                                    className={cn('w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition-colors', isImcSelected ? 'bg-indigo-600/70 text-white' : 'bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-slate-200')}
                                                  >
                                                    <span onClick={(e) => { e.stopPropagation(); toggleSet(setCollapsedImc, imc.imc_campaign_id); }} className="shrink-0 text-slate-400 hover:text-slate-200 cursor-pointer">
                                                      {isImcCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                                                    </span>
                                                    <Layers size={10} className={cn('shrink-0', isImcSelected ? 'text-indigo-200' : 'text-indigo-400')} />
                                                    <span className="flex-1 text-[10px] font-bold truncate">{imc.name}</span>
                                                    <span className={cn('text-[10px] shrink-0', isImcSelected ? 'text-indigo-200' : 'text-slate-500')}>{groupCampaigns.length}개</span>
                                                  </button>
                                                  <AnimatePresence>
                                                    {!isImcCollapsed && groupCampaigns.length > 0 && (
                                                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.12 }} className="overflow-hidden bg-slate-900/40">
                                                        <div className="space-y-0.5 p-1">
                                                          {groupCampaigns.map(camp => (
                                                            <CampaignListItem key={camp.campaign_id} campaign={camp} isSelected={selectedCampaignId === camp.campaign_id} onSelect={selectCampaign} onEditClick={(c) => { setEditingCampaign(c); setTempName(c.campaign_name); setIsEditModalOpen(true); }} onDeleteClick={handleDeleteCampaign} />
                                                          ))}
                                                        </div>
                                                      </motion.div>
                                                    )}
                                                  </AnimatePresence>
                                                </div>
                                              );
                                            })}
                                            {/* 계정 직속 캠페인 (마스터 없음) */}
                                            {directCamps.map(camp => (
                                              <CampaignListItem key={camp.campaign_id} campaign={camp} isSelected={selectedCampaignId === camp.campaign_id} onSelect={selectCampaign} onEditClick={(c) => { setEditingCampaign(c); setTempName(c.campaign_name); setIsEditModalOpen(true); }} onDeleteClick={handleDeleteCampaign} />
                                            ))}
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                );
                              })}
                              {agAccounts.length === 0 && (
                                <p className="ml-5 text-[10px] text-slate-600 py-1">광고계정 없음</p>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}

                  {/* 2. 레거시 IMC 그룹 (account_id 없는 마스터 캠페인) */}
                  {legacyImcGroups.length > 0 && (
                    <div className="mb-1">
                      {agencies.length > 0 && (
                        <div className="px-2 py-1 flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">미분류 마스터</span>
                          <div className="flex-1 h-px bg-slate-700/40" />
                        </div>
                      )}
                      {legacyImcGroups.map(imc => {
                        const groupCampaigns = campaignsByImc.get(imc.imc_campaign_id) ?? [];
                        const isImcSelected = selectedImcCampaignId === imc.imc_campaign_id;
                        const isImcCollapsed = collapsedImc.has(imc.imc_campaign_id);
                        return (
                          <div key={imc.imc_campaign_id} className="rounded-lg overflow-hidden border border-slate-700/50 mb-0.5">
                            <button
                              onClick={() => handleSelectImc(imc.imc_campaign_id)}
                              className={cn('w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors', isImcSelected ? 'bg-indigo-600/80 text-white' : 'bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200')}
                            >
                              <span onClick={(e) => { e.stopPropagation(); toggleSet(setCollapsedImc, imc.imc_campaign_id); }} className="shrink-0 text-slate-400 hover:text-slate-200 cursor-pointer">
                                {isImcCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                              </span>
                              <Layers size={11} className={cn('shrink-0', isImcSelected ? 'text-indigo-200' : 'text-indigo-400')} />
                              <span className="flex-1 text-[10px] font-bold uppercase tracking-widest truncate">{imc.name}</span>
                              <span className={cn('text-[10px] font-bold shrink-0', isImcSelected ? 'text-indigo-200' : 'text-slate-500')}>{groupCampaigns.length}개</span>
                            </button>
                            <AnimatePresence>
                              {!isImcCollapsed && groupCampaigns.length > 0 && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden bg-slate-900/50">
                                  <div className="space-y-0.5 p-1">
                                    {groupCampaigns.map(camp => (
                                      <CampaignListItem key={camp.campaign_id} campaign={camp} isSelected={selectedCampaignId === camp.campaign_id} onSelect={selectCampaign} onEditClick={(c) => { setEditingCampaign(c); setTempName(c.campaign_name); setIsEditModalOpen(true); }} onDeleteClick={handleDeleteCampaign} />
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 3. 완전 독립 캠페인 (agency도 없고 imc도 없음) */}
                  {rootIndependentCampaigns.length > 0 && (
                    <div className="space-y-0.5">
                      {(agencies.length > 0 || legacyImcGroups.length > 0) && (
                        <div className="px-2 py-1 flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600">독립 캠페인</span>
                          <div className="flex-1 h-px bg-slate-700/40" />
                        </div>
                      )}
                      {rootIndependentCampaigns.map(camp => (
                        <CampaignListItem key={camp.campaign_id} campaign={camp} isSelected={selectedCampaignId === camp.campaign_id} onSelect={selectCampaign} onEditClick={(c) => { setEditingCampaign(c); setTempName(c.campaign_name); setIsEditModalOpen(true); }} onDeleteClick={handleDeleteCampaign} />
                      ))}
                    </div>
                  )}

                  {filteredCampaigns.length === 0 && imcCampaigns.length === 0 && (
                    <div className="rounded-lg border border-slate-700/50 px-3 py-5 text-center">
                      <p className="text-xs text-slate-500">캠페인이 없습니다.</p>
                    </div>
                  )}
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer: status indicator */}
      <div className="px-4 py-3 border-t border-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping opacity-60" />
          </div>
          <span className="text-[10px] text-slate-500">
            {isSyncing ? '동기화 중...' : '실시간 연결됨'}
          </span>
          <span className="ml-auto text-[10px] text-slate-600">{campaigns.length}개 캠페인</span>
        </div>
      </div>

      {/* Delete confirm modal */}
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

      {/* Campaign name edit modal */}
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
                    if (result.success && result.campaigns) setCampaigns(result.campaigns);
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
                    if (result.success && result.campaigns) setCampaigns(result.campaigns);
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
