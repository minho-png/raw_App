"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Wallet, Megaphone, Layout } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CampaignConfig, SubCampaignConfig, MediaProvider } from "@/types";
import { cn } from "@/lib/utils";

interface BudgetSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: CampaignConfig;
  onUpdate: (updatedCampaign: CampaignConfig) => void;
  suggestedNames?: string[];
  totalSpent?: number; // Added: actual spend to calculate pacing
}

export const BudgetSettingsModal: React.FC<BudgetSettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  campaign, 
  onUpdate,
  suggestedNames = [],
  totalSpent = 0
}) => {
  const [subCampaigns, setSubCampaigns] = useState<SubCampaignConfig[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSubCampaigns(campaign.sub_campaigns || []);
    }
  }, [isOpen, campaign.sub_campaigns]);

  const handleAddField = () => {
    const newField: SubCampaignConfig = {
      id: Math.random().toString(36).substr(2, 9),
      mapping_value: '',
      excel_name: '',
      media: '네이버GFA',
      fee_rate: 10,
      budget: 0,
      budget_type: 'individual',
      target_cpc: 0,
      target_ctr: 0,
      enabled: true
    };
    setSubCampaigns([...subCampaigns, newField]);
  };

  const handleAddSuggested = (name: string) => {
    if (subCampaigns.some(s => s.excel_name === name)) return;
    const newField: SubCampaignConfig = {
      id: Math.random().toString(36).substr(2, 9),
      mapping_value: name,
      excel_name: name,
      media: '네이버GFA',
      fee_rate: 10,
      budget: 0,
      budget_type: 'individual',
      target_cpc: 0,
      target_ctr: 0,
      enabled: true
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
            <div className="flex flex-col h-full overflow-hidden bg-white/70 backdrop-blur-2xl relative">
              {/* Premium Background Elements */}
              <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
              <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
              
              <div className="p-8 md:p-10 flex flex-col h-full overflow-hidden relative z-10">
                <header className="flex justify-between items-start mb-10">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[24px] flex items-center justify-center text-white shadow-2xl shadow-indigo-500/40 rotate-3 hover:rotate-0 transition-transform duration-500">
                      <Wallet size={32} />
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-slate-900 tracking-tighter leading-tight">
                        정밀 예산 및 <span className="text-indigo-600">KPI 설정</span>
                      </h2>
                      <p className="text-slate-500 font-medium mt-1">캠페인 효율 극대화를 위한 초정밀 예산 설정</p>
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

                {suggestedNames.length > 0 && (
                  <div className="mb-8 p-6 bg-white/40 backdrop-blur-sm rounded-[32px] border border-white/60 shadow-sm transition-all hover:bg-white/60">
                    <h3 className="text-xs font-black text-indigo-400 mb-4 flex items-center gap-2 uppercase tracking-[0.2em]">
                      <Plus size={14} /> 추천 엑셀 매칭 항목
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {suggestedNames.map(name => {
                        const isAdded = subCampaigns.some(s => s.mapping_value === name || s.excel_name === name);
                        return (
                          <button
                            key={name}
                            disabled={isAdded}
                            onClick={() => handleAddSuggested(name)}
                            className={cn(
                              "text-xs font-bold rounded-xl px-4 py-2 transition-all border-2",
                              isAdded 
                                ? "bg-slate-100 border-slate-200 text-slate-400" 
                                : "bg-white border-slate-100 text-slate-600 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 hover:scale-105 active:scale-95"
                            )}
                          >
                            {name} {isAdded && '✓'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Total Pacing Section - Redesigned */}
                <div className="mb-8 overflow-hidden rounded-[32px] border border-white/80 shadow-2xl shadow-indigo-500/5 relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950" />
                  <div className="relative p-8 flex items-center justify-between">
                    <div className="z-10">
                      <h3 className="text-xs font-black text-indigo-300 uppercase tracking-[0.2em] mb-3">실시간 캠페인 소진율</h3>
                      <div className="flex items-baseline gap-4">
                        <span className="text-6xl font-black text-white tracking-tighter">
                          {Math.round((subCampaigns.reduce((acc, curr) => acc + (curr.enabled ? curr.budget : 0), 0) || 0) > 0 
                            ? (totalSpent / subCampaigns.reduce((acc, curr) => acc + (curr.enabled ? curr.budget : 0), 0)) * 100 
                            : 0)}%
                        </span>
                        <div className="flex flex-col">
                          <span className="text-indigo-200/60 font-bold text-xs">전체 통합 집행률</span>
                          <div className="w-32 h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, (totalSpent / (subCampaigns.reduce((acc, curr) => acc + (curr.enabled ? curr.budget : 0), 0) || 1)) * 100)}%` }}
                              className="h-full bg-gradient-to-r from-indigo-400 to-cyan-400"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-10 text-right pr-6 z-10">
                      <div className="space-y-1">
                        <p className="text-xs font-black text-indigo-300 uppercase tracking-widest">목표 예산</p>
                        <p className="text-2xl font-black text-white">
                          <span className="text-xs text-indigo-400 mr-1">₩</span>
                          {(subCampaigns.reduce((acc, curr) => acc + (curr.enabled ? curr.budget : 0), 0)).toLocaleString()}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-black text-emerald-300 uppercase tracking-widest">집행 금액 (실제)</p>
                        <p className="text-2xl font-black text-emerald-400">
                          <span className="text-xs mr-1">₩</span>
                          {totalSpent.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-8 custom-scrollbar pb-10">
                  {subCampaigns.length === 0 && (
                    <div className="text-center py-20 bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-200">
                      <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100">
                        <Megaphone className="text-slate-200" size={32} />
                      </div>
                      <p className="text-slate-400 text-lg font-bold">등록된 예산 항목이 없습니다.</p>
                      <p className="text-slate-300 text-sm mt-1">상단의 추천 항목이나 하단의 추가 버튼을 이용하세요.</p>
                    </div>
                  )}

                  {subCampaigns.map((sub, index) => (
                    <div 
                      key={sub.id} 
                      className={cn(
                        "relative group transition-all duration-500",
                        !sub.enabled && "opacity-40 grayscale-[0.5]"
                      )}
                    >
                      <div className="absolute -left-3 top-0 bottom-0 w-1 bg-indigo-500 rounded-full scale-y-0 group-hover:scale-y-100 transition-transform" />
                      
                      <Card className="p-10 border-slate-100 bg-white/60 backdrop-blur-xl shadow-xl hover:shadow-2xl hover:border-indigo-100 rounded-[40px] border-2 transition-all overflow-visible">
                        <div className="px-10 py-6 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                          <div className="flex items-center gap-4">
                            <span className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center text-xs font-black">
                              {(index + 1).toString().padStart(2, '0')}
                            </span>
                            <h4 className="text-xl font-black text-slate-800 tracking-tight">
                              {sub.mapping_value || sub.excel_name || "항목 이름을 입력하세요"}
                            </h4>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex bg-slate-100 p-1 rounded-2xl">
                              <button 
                                onClick={() => handleUpdateField(sub.id, { enabled: true })}
                                className={cn(
                                  "px-4 py-2 rounded-xl text-[10px] font-black transition-all",
                                  sub.enabled ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                )}
                              >
                                활성화함
                              </button>
                              <button 
                                onClick={() => handleUpdateField(sub.id, { enabled: false })}
                                className={cn(
                                  "px-4 py-2 rounded-xl text-[10px] font-black transition-all",
                                  !sub.enabled ? "bg-white text-rose-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                                )}
                              >
                                비활성
                              </button>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleRemoveField(sub.id)}
                              className="text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-2xl h-12 w-12 transition-all"
                            >
                              <Trash2 size={20} />
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-10">
                          <div className="space-y-3">
                            <Label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">엑셀 매칭 키워드</Label>
                            <Input 
                              placeholder="Excel Campaign Name" 
                              value={sub.mapping_value || sub.excel_name}
                              onChange={(e) => handleUpdateField(sub.id, { mapping_value: e.target.value })}
                              className="bg-slate-50/50 border-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 rounded-2xl h-14 text-base font-bold text-slate-900 border-2 border-transparent transition-all px-6"
                            />
                          </div>
                          <div className="space-y-3">
                            <Label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">매체 플랫폼</Label>
                            <Select 
                              value={sub.media} 
                              onValueChange={(val) => handleUpdateField(sub.id, { media: val as MediaProvider })}
                            >
                              <SelectTrigger className="bg-slate-50/50 border-none rounded-2xl h-14 focus:ring-4 focus:ring-indigo-500/10 text-base font-bold text-slate-900 transition-all px-6">
                                <SelectValue placeholder="Select Provider" />
                              </SelectTrigger>
                              <SelectContent className="z-[300] rounded-2xl border-slate-100 p-2 shadow-2xl">
                                <SelectItem value="네이버GFA" className="rounded-xl py-3 font-bold">네이버 GFA</SelectItem>
                                <SelectItem value="카카오Moment" className="rounded-xl py-3 font-bold">카카오 모먼트</SelectItem>
                                <SelectItem value="메타Ads" className="rounded-xl py-3 font-bold">메타 Ads</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-3">
                            <Label className="text-xs font-black text-indigo-400 uppercase tracking-widest ml-1">배정 목표 예산</Label>
                            <div className="relative group">
                              <span className="absolute left-6 top-1/2 -translate-y-1/2 text-indigo-300 font-bold">₩</span>
                              <Input 
                                type="number" 
                                value={sub.budget}
                                onChange={(e) => handleUpdateField(sub.id, { budget: Number(e.target.value) })}
                                className="bg-white border-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 rounded-2xl h-14 font-mono font-black text-indigo-600 pl-12 pr-6 text-xl border-2 transition-all shadow-inner"
                              />
                            </div>
                          </div>
                          <div className="space-y-3">
                            <Label className="text-xs font-black text-emerald-400 uppercase tracking-widest ml-1">대행 수수료율 (%)</Label>
                            <div className="relative">
                              <Input 
                                type="number" 
                                value={sub.fee_rate}
                                onChange={(e) => handleUpdateField(sub.id, { fee_rate: Number(e.target.value) })}
                                className="bg-emerald-50/30 border-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 rounded-2xl h-14 w-full text-center font-mono font-black border-2 border-transparent text-emerald-700 text-xl transition-all"
                              />
                              <span className="absolute right-6 top-1/2 -translate-y-1/2 text-emerald-300 font-bold">%</span>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <Label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">목표 CPC (건당 비용)</Label>
                            <Input 
                              type="number" 
                              value={sub.target_cpc || ''}
                              onChange={(e) => handleUpdateField(sub.id, { target_cpc: Number(e.target.value) })}
                              className="bg-slate-50/50 border-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 rounded-2xl h-14 font-mono font-bold text-slate-700 px-6 border-2 border-transparent transition-all"
                            />
                          </div>
                          <div className="space-y-3">
                            <Label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">목표 CTR (%)</Label>
                            <Input 
                              type="number" 
                              step="0.01"
                              value={sub.target_ctr || ''}
                              onChange={(e) => handleUpdateField(sub.id, { target_ctr: Number(e.target.value) })}
                              className="bg-slate-50/50 border-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 rounded-2xl h-14 font-mono font-bold text-slate-700 px-6 border-2 border-transparent transition-all"
                            />
                          </div>
                          <div className="lg:col-span-2 space-y-3">
                            <Label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">DMP 데이터 컬럼 명칭 (오버라이드)</Label>
                            <Input 
                              placeholder="DMP 정보를 가져올 엑셀 컬럼 명칭을 입력하세요" 
                              value={sub.dmp_column || ''}
                              onChange={(e) => handleUpdateField(sub.id, { dmp_column: e.target.value })}
                              className="bg-slate-50/50 border-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 rounded-2xl h-14 text-sm font-medium text-slate-600 px-6 border-2 border-transparent transition-all"
                            />
                          </div>
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>

                {/* RAW Matching Table - Redesigned */}
                <div className="mt-10 mb-8 flex-shrink-0 bg-slate-900 rounded-[40px] p-10 shadow-2xl shadow-indigo-500/20 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]" />
                  
                  <div className="flex items-center gap-5 mb-10">
                    <div className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/10">
                      <Layout size={28} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-white tracking-tight">엑셀 캠페인별 통합 매칭 (RAW)</h3>
                      <p className="text-indigo-200/50 text-sm font-medium">데이터 가공 시 적용될 고유 설정값을 매트릭스 형태로 확인하십시오.</p>
                    </div>
                  </div>
                  
                  <div className="rounded-[24px] overflow-hidden border border-white/5 bg-white/5">
                    <Table>
                      <TableHeader className="bg-white/5">
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-indigo-200/60 font-black h-14 px-8 uppercase text-xs tracking-widest">마스터 명칭</TableHead>
                          <TableHead className="text-indigo-200/60 font-black h-14 px-8 uppercase text-xs tracking-widest">플랫폼</TableHead>
                          <TableHead className="text-indigo-200/60 font-black h-14 px-8 uppercase text-xs tracking-widest">예산 구성</TableHead>
                          <TableHead className="text-indigo-200/60 font-black h-14 px-8 uppercase text-xs tracking-widest">수수료 상태</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subCampaigns.length === 0 && (
                          <TableRow className="hover:bg-transparent border-none">
                            <TableCell colSpan={4} className="text-center py-10 text-slate-500 font-bold uppercase text-[10px] tracking-widest">
                              No data available for reconciliation
                            </TableCell>
                          </TableRow>
                        )}
                        {subCampaigns.map((sub) => (
                          <TableRow key={`raw-${sub.id}`} className="border-white/5 hover:bg-white/[0.03] transition-colors">
                            <TableCell className="px-8 font-black text-indigo-400 whitespace-nowrap">{sub.mapping_value || sub.excel_name || "???"}</TableCell>
                            <TableCell className="px-8">
                              <span className="px-3 py-1 bg-white/10 rounded-lg text-white font-black text-[10px]">{sub.media}</span>
                            </TableCell>
                            <TableCell className="px-8">
                              <div className="flex flex-col">
                                <span className="text-white font-mono font-black">₩{sub.budget.toLocaleString()}</span>
                                <span className="text-[10px] text-slate-500 font-bold uppercase italic">Verified Target</span>
                              </div>
                            </TableCell>
                            <TableCell className="px-8">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                <span className="text-emerald-400 font-mono font-black">{sub.fee_rate}% Fixed</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-slate-100/50 flex justify-between items-center bg-transparent flex-shrink-0">
                  <Button 
                    variant="outline" 
                    onClick={handleAddField} 
                    className="rounded-[24px] border-slate-200 bg-white h-16 px-10 text-slate-800 hover:bg-slate-50 hover:border-indigo-200 transition-all font-black text-lg border-2"
                  >
                    <Plus size={24} className="mr-3 text-indigo-600" /> 커스텀 예산 항목 추가
                  </Button>
                  <div className="flex gap-4">
                    <Button variant="ghost" onClick={onClose} className="rounded-[24px] h-16 px-10 text-slate-400 hover:text-slate-600 transition-all font-bold text-lg">닫기</Button>
                    <Button 
                      onClick={handleSave} 
                      className="bg-gradient-to-br from-indigo-600 to-indigo-800 border-none hover:from-indigo-700 hover:to-indigo-900 text-white px-12 rounded-[24px] h-16 shadow-2xl shadow-indigo-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] font-black text-lg flex items-center gap-3"
                    >
                      설정 데이터 저장 및 가공 엔진 적용
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
