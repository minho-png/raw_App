"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Wallet, Megaphone, Settings2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignConfig, SubCampaignConfig, MediaProvider } from "@/types";

interface BudgetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: CampaignConfig;
  onUpdate: (updatedCampaign: CampaignConfig) => void;
}

export const BudgetSettingsModal: React.FC<BudgetSettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  campaign, 
  onUpdate 
}) => {
  const [subCampaigns, setSubCampaigns] = useState<SubCampaignConfig[]>(campaign.sub_campaigns || []);

  const handleAddField = () => {
    const newField: SubCampaignConfig = {
      id: Math.random().toString(36).substr(2, 9),
      excel_name: '',
      media: '네이버GFA',
      fee_rate: 10,
      budget: 0,
      budget_type: 'individual',
      target_cpc: 0,
      target_ctr: 0
    };
    setSubCampaigns([...subCampaigns, newField]);
  };

  const handleRemoveField = (id: string) => {
    setSubCampaigns(subCampaigns.filter(s => s.id !== id));
  };

  const handleUpdateField = (id: string, updates: Partial<SubCampaignConfig>) => {
    setSubCampaigns(subCampaigns.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleSave = () => {
    onUpdate({ ...campaign, sub_campaigns: subCampaigns });
    onClose();
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
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[85vh] overflow-hidden bg-white rounded-3xl shadow-2xl z-[101] border border-slate-200"
          >
            <div className="p-8 flex flex-col h-full">
              <header className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Wallet className="text-blue-500" size={24} /> 예산 및 매체 설정
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">캠페인별 예산과 수수료율을 세밀하게 제어하세요.</p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100">
                  <X size={20} />
                </Button>
              </header>

              <div className="flex-1 overflow-y-auto pr-2 space-y-4 min-h-[400px]">
                {subCampaigns.length === 0 && (
                  <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <Megaphone className="mx-auto text-slate-300 mb-4" size={48} />
                    <p className="text-slate-400">등록된 상세 설정이 없습니다. 추가 버튼을 눌러 시작하세요.</p>
                  </div>
                )}

                {subCampaigns.map((sub, index) => (
                  <Card key={sub.id} className="p-5 border-slate-200 hover:border-blue-200 transition-colors bg-white shadow-sm overflow-visible">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500">엑셀 매칭 키워드 (캠페인명)</Label>
                          <Input 
                            placeholder="예: GFA_메인_DA" 
                            value={sub.excel_name}
                            onChange={(e) => handleUpdateField(sub.id, { excel_name: e.target.value })}
                            className="bg-slate-50/50 border-slate-200 focus:bg-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500">매체</Label>
                          <Select 
                            value={sub.media} 
                            onValueChange={(val) => handleUpdateField(sub.id, { media: val as MediaProvider })}
                          >
                            <SelectTrigger className="bg-slate-50/50 border-slate-200 focus:bg-white">
                              <SelectValue placeholder="매체 선택" />
                            </SelectTrigger>
                            <SelectContent className="z-[200]">
                              <SelectItem value="네이버GFA">네이버 GFA</SelectItem>
                              <SelectItem value="카카오Moment">카카오 모먼트</SelectItem>
                              <SelectItem value="메타Ads">메타 Ads</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500">할당 예산 (₩)</Label>
                          <Input 
                            type="number" 
                            placeholder="0" 
                            value={sub.budget}
                            onChange={(e) => handleUpdateField(sub.id, { budget: Number(e.target.value) })}
                            className="bg-slate-50/50 border-slate-200 focus:bg-white font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500">목표 CPC (₩)</Label>
                          <Input 
                            type="number" 
                            placeholder="0" 
                            value={sub.target_cpc || ''}
                            onChange={(e) => handleUpdateField(sub.id, { target_cpc: Number(e.target.value) })}
                            className="bg-slate-50/50 border-slate-200 focus:bg-white font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500">목표 CTR (%)</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            placeholder="0.00" 
                            value={sub.target_ctr || ''}
                            onChange={(e) => handleUpdateField(sub.id, { target_ctr: Number(e.target.value) })}
                            className="bg-slate-50/50 border-slate-200 focus:bg-white font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500">수수료율 (%)</Label>
                          <div className="flex items-center gap-2">
                            <Input 
                              type="number" 
                              placeholder="10" 
                              value={sub.fee_rate}
                              onChange={(e) => handleUpdateField(sub.id, { fee_rate: Number(e.target.value) })}
                              className="bg-slate-50/50 border-slate-200 focus:bg-white w-20 text-center"
                            />
                            <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-200 py-1">Standard 10%</Badge>
                          </div>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveField(sub.id)}
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
                <Button variant="outline" onClick={handleAddField} className="rounded-xl border-slate-200">
                  <Plus size={16} className="mr-2" /> 상세 항목 추가
                </Button>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={onClose} className="rounded-xl text-slate-500">취소</Button>
                  <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 px-8 rounded-xl shadow-lg shadow-blue-500/20">
                    설정 저장하기
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
