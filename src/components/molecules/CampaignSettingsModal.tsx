"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Target, TrendingUp, Layers, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampaignConfig } from '@/types';
import { saveCampaignAction } from '@/server/actions/campaign';
import { useCampaignStore } from '@/store/useCampaignStore';
import { cn } from '@/lib/utils';

interface CampaignSettingsModalProps {
  campaign: CampaignConfig;
  isOpen: boolean;
  onClose: () => void;
}

export const CampaignSettingsModal: React.FC<CampaignSettingsModalProps> = ({ campaign, isOpen, onClose }) => {
  const { updateCampaign } = useCampaignStore();
  const [formData, setFormData] = useState<CampaignConfig>(campaign);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData(campaign);
  }, [campaign]);

  const handleChange = (field: keyof CampaignConfig, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveCampaignAction(formData);
      if (result.success) {
        updateCampaign(formData);
        onClose();
      } else {
        alert('설정 저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Save settings failed:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-3xl shadow-2xl z-[101] overflow-hidden border border-slate-100"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                  <Target size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">캠페인 상세 설정</h2>
                  <p className="text-xs text-slate-500">목표 KPI 및 운영 기준을 설정합니다.</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600 shadow-sm"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">캠페인 명</Label>
                  <Input 
                    id="name" 
                    value={formData.campaign_name} 
                    onChange={(e) => handleChange('campaign_name', e.target.value)}
                    className="rounded-xl border-slate-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="budget">총 예산 (₩)</Label>
                    <div className="relative">
                      <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input 
                        id="budget" 
                        type="number"
                        value={formData.total_budget} 
                        onChange={(e) => handleChange('total_budget', Number(e.target.value))}
                        className="rounded-xl border-slate-200 pl-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <Label htmlFor="groupby" className="text-slate-700 font-bold">동적 그룹바이 기준 (다중 선택)</Label>
                    <div className="flex flex-wrap gap-2 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                      {['날짜', '광고 그룹', 'DMP', '소재', '캠페인'].map((col) => {
                        const isSelected = (formData.group_by_columns || []).includes(col);
                        return (
                          <button
                            key={col}
                            onClick={() => {
                              const current = formData.group_by_columns || [];
                              if (isSelected) {
                                handleChange('group_by_columns', current.filter(c => c !== col));
                              } else {
                                handleChange('group_by_columns', [...current, col]);
                              }
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-xs font-semibold transition-all border",
                              isSelected 
                                ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20" 
                                : "bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-500"
                            )}
                          >
                            {col}
                            {isSelected && <X size={10} className="inline ml-1.5" />}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400">데이터 업로드 시 위 기준들에 맞춰 리포트가 자동 그룹화됩니다.</p>
                  </div>
                </div>

                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp size={16} className="text-blue-500" />
                    <span className="text-sm font-bold text-blue-700">심화 KPI 목표 설정</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="target_cpc" className="text-blue-600 text-xs">기대 CPC (₩)</Label>
                      <Input 
                        id="target_cpc" 
                        type="number"
                        placeholder="예: 800"
                        value={formData.target_cpc || ''} 
                        onChange={(e) => handleChange('target_cpc', Number(e.target.value))}
                        className="rounded-xl border-blue-100 bg-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="target_ctr" className="text-blue-600 text-xs">기대 CTR (%)</Label>
                      <Input 
                        id="target_ctr" 
                        type="number" 
                        step="0.01"
                        placeholder="예: 1.5"
                        value={formData.target_ctr || ''} 
                        onChange={(e) => handleChange('target_ctr', Number(e.target.value))}
                        className="rounded-xl border-blue-100 bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 flex gap-3">
              <Button 
                variant="outline" 
                onClick={onClose}
                className="flex-1 rounded-xl h-12 font-bold border-slate-200"
              >
                취소
              </Button>
              <Button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 rounded-xl h-12 font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
              >
                {isSaving ? '저장 중...' : '설정 저장'}
                <Save size={16} className="ml-2" />
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
