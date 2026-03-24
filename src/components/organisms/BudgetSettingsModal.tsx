"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wallet } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { CampaignConfig, SubCampaignConfig, MediaProvider } from "@/types";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/idGenerator";

interface BudgetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: CampaignConfig;
  onUpdate: (updatedCampaign: CampaignConfig) => void;
  totalSpent?: number; // Added: actual spend to calculate pacing
}

export const BudgetSettingsModal: React.FC<BudgetSettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  campaign, 
  onUpdate,
  totalSpent = 0
}) => {
  const [subCampaigns, setSubCampaigns] = useState<SubCampaignConfig[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSubCampaigns(campaign.sub_campaigns || []);
    }
  }, [isOpen, campaign.sub_campaigns]);

  const medias: MediaProvider[] = useMemo(
    () => ['네이버GFA', '카카오Moment', '메타Ads', '구글Ads'],
    []
  );

  const enabledMedias = useMemo(() => {
    const set = new Set<MediaProvider>();
    for (const sub of subCampaigns) {
      if (sub.enabled !== false && medias.includes(sub.media)) {
        set.add(sub.media);
      }
    }
    return set;
  }, [subCampaigns, medias]);

  const masterBudget = useMemo(() => {
    return subCampaigns
      .filter(s => s.enabled !== false && enabledMedias.has(s.media))
      .reduce((sum, s) => sum + (Number(s.budget) || 0), 0);
  }, [subCampaigns, enabledMedias]);

  const ensureSubCampaignForMedia = (media: MediaProvider) => {
    const existing = subCampaigns.find(s => s.media === media);
    if (existing) {
      if (existing.enabled === false) {
        setSubCampaigns(prev => prev.map(s => s.media === media ? { ...s, enabled: true } : s));
      }
      return;
    }
    const newField: SubCampaignConfig = {
      id: genId(9),
      mapping_value: '',
      media,
      fee_rate: 10,
      budget: 0,
      budget_type: 'individual',
      target_cpc: 0,
      target_ctr: 0,
      enabled: true
    };
    setSubCampaigns(prev => [...prev, newField]);
  };

  const handleToggleMedia = (media: MediaProvider, enabled: boolean) => {
    if (enabled) {
      ensureSubCampaignForMedia(media);
      return;
    }
    setSubCampaigns(prev => prev.map(s => s.media === media ? { ...s, enabled: false } : s));
  };

  const handleUpdateByMedia = (media: MediaProvider, updates: Partial<SubCampaignConfig>) => {
    setSubCampaigns(prev => prev.map(s => s.media === media ? { ...s, ...updates } : s));
  };

  const handleSave = () => {
    onUpdate({ ...campaign, sub_campaigns: subCampaigns });
    onClose();
  };

  const formatKRW = (value: number) => `₩${Math.round(value).toLocaleString('ko-KR')}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 md:p-8"
          onClick={onClose}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white rounded-[40px] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] z-[101] border border-slate-200 flex flex-col"
          >
            <div className="flex flex-col h-full overflow-hidden bg-white relative">
              <div className="p-8 md:p-10 flex flex-col h-full overflow-hidden relative">
                <header className="flex justify-between items-start mb-6 flex-shrink-0">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-sm">
                      <Wallet size={32} />
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-slate-900 tracking-tighter leading-tight">
                        IMC 예산 및 <span className="text-blue-600">KPI 설정</span>
                      </h2>
                      <p className="text-slate-500 font-medium mt-1">매체별 설정을 통합 마스터 기준으로 관리합니다.</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={onClose} 
                    className="rounded-2xl hover:bg-slate-100/50 h-12 w-12 transition-all group"
                  >
                    <X size={24} className="text-slate-400 group-hover:text-slate-900 group-hover:rotate-90 transition-all duration-300" />
                  </Button>
                </header>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6 pb-4">
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">통합 마스터 예산</p>
                        <p className="text-3xl font-black text-slate-900 tracking-tight">{formatKRW(masterBudget)}</p>
                        <p className="text-xs text-slate-500 font-medium mt-1">
                          실제 집행: <span className="font-bold text-slate-700">{formatKRW(totalSpent)}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {medias.map((m) => {
                          const checked = enabledMedias.has(m);
                          return (
                            <label
                              key={m}
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black cursor-pointer select-none transition-colors",
                                checked
                                  ? "bg-blue-600 border-blue-600 text-white"
                                  : "bg-white border-slate-200 text-slate-700 hover:border-blue-300"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={checked}
                                onChange={(e) => handleToggleMedia(m, e.target.checked)}
                              />
                              <span className={cn("w-2.5 h-2.5 rounded-full", checked ? "bg-white" : "bg-slate-300")} />
                              {m}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {medias.map((media) => {
                      const enabled = enabledMedias.has(media);
                      if (!enabled) return null;
                      const sub = subCampaigns.find(s => s.media === media) || null;
                      if (!sub) return null;

                      return (
                        <motion.div
                          key={media}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Card className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm">
                            <div className="flex items-center justify-between mb-5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                                  <Wallet size={18} />
                                </div>
                                <div>
                                  <p className="text-sm font-black text-slate-900 tracking-tight">{media}</p>
                                  <p className="text-xs text-slate-500 font-medium">필수 입력만으로 빠르게 설정합니다.</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleToggleMedia(media, false)}
                                className="text-xs font-black text-slate-500 hover:text-slate-900"
                              >
                                비활성화
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                              <div className="space-y-2">
                                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">매핑 키워드 (mapping_value)</Label>
                                <Input
                                  value={sub.mapping_value || ''}
                                  onChange={(e) => handleUpdateByMedia(media, { mapping_value: e.target.value })}
                                  placeholder="엑셀 식별용 키워드"
                                  className="h-12 rounded-xl bg-white text-slate-800 border-slate-200 focus-visible:ring-blue-600 dark:bg-white dark:text-slate-800 dark:border-slate-200"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">할당 예산 (budget)</Label>
                                <Input
                                  type="number"
                                  value={sub.budget ?? 0}
                                  onChange={(e) => handleUpdateByMedia(media, { budget: Number(e.target.value) })}
                                  className="h-12 rounded-xl bg-white text-slate-800 border-slate-200 focus-visible:ring-blue-600 dark:bg-white dark:text-slate-800 dark:border-slate-200"
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">수수료율 (fee_rate)</Label>
                                <Input
                                  type="number"
                                  value={sub.fee_rate ?? 10}
                                  onChange={(e) => handleUpdateByMedia(media, { fee_rate: Number(e.target.value) })}
                                  className="h-12 rounded-xl bg-white text-slate-800 border-slate-200 focus-visible:ring-blue-600 dark:bg-white dark:text-slate-800 dark:border-slate-200"
                                />
                                <p className="text-[11px] text-slate-500 font-medium">기본값: 10%</p>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">목표 CPC (target_cpc)</Label>
                                <Input
                                  type="number"
                                  value={sub.target_cpc ?? 0}
                                  onChange={(e) => handleUpdateByMedia(media, { target_cpc: Number(e.target.value) })}
                                  className="h-12 rounded-xl bg-white text-slate-800 border-slate-200 focus-visible:ring-blue-600 dark:bg-white dark:text-slate-800 dark:border-slate-200"
                                />
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">목표 CTR (target_ctr)</Label>
                                <Input
                                  type="number"
                                  value={sub.target_ctr ?? 0}
                                  onChange={(e) => handleUpdateByMedia(media, { target_ctr: Number(e.target.value) })}
                                  className="h-12 rounded-xl bg-white text-slate-800 border-slate-200 focus-visible:ring-blue-600 dark:bg-white dark:text-slate-800 dark:border-slate-200"
                                />
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-shrink-0 mt-6 pt-6 border-t border-slate-200 flex justify-end items-center bg-white">
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      className="rounded-xl h-12 px-6 border-slate-200 text-slate-700 font-bold"
                    >
                      닫기
                    </Button>
                    <Button
                      onClick={handleSave}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl h-12 shadow-sm font-black"
                    >
                      저장
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
