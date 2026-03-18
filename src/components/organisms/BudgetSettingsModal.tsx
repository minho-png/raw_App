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
            <div className="p-8 md:p-12 flex flex-col h-full overflow-hidden">
              <header className="flex justify-between items-start mb-10">
                <div>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-500/40">
                      <Wallet size={24} />
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                      정밀 예산 및 KPI 설정
                    </h2>
                  </div>
                  <p className="text-slate-500 text-lg">매체별 기본 설정에서 엑셀 캠페인명 매칭까지 세밀하게 관리하세요.</p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-2xl hover:bg-slate-100 h-14 w-14 transition-all">
                  <X size={28} className="text-slate-400" />
                </Button>
              </header>

              {suggestedNames.length > 0 && (
                <div className="mb-8 p-8 bg-blue-50/40 rounded-[32px] border border-blue-100/50 shadow-inner">
                  <h3 className="text-sm font-bold text-blue-900 mb-5 flex items-center gap-2 uppercase tracking-widest">
                    <Plus size={16} /> 업로드된 파일 매칭 추천 (Excel Match)
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {suggestedNames.map(name => {
                      const isAdded = subCampaigns.some(s => s.excel_name === name);
                      return (
                        <Button
                          key={name}
                          variant={isAdded ? "secondary" : "outline"}
                          size="sm"
                          disabled={isAdded}
                          onClick={() => handleAddSuggested(name)}
                          className={cn(
                            "text-xs font-bold rounded-2xl px-5 py-3 h-auto transition-all border-2",
                            isAdded ? "bg-blue-100 text-blue-700 border-blue-200 opacity-60" : "bg-white border-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/20"
                          )}
                        >
                          {name} {isAdded && '✓'}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Total Pacing Section */}
              <div className="mb-10 p-8 bg-slate-50 rounded-[32px] border-2 border-slate-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">캠페인 총 소진율 (Pacing)</h3>
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-black text-slate-900">
                      {Math.round((subCampaigns.reduce((acc, curr) => acc + (curr.enabled ? curr.budget : 0), 0) || 0) > 0 
                        ? (totalSpent / subCampaigns.reduce((acc, curr) => acc + (curr.enabled ? curr.budget : 0), 0)) * 100 
                        : 0)}%
                    </span>
                    <span className="text-slate-400 font-bold">전체 매체 통합 데이터 기준</span>
                  </div>
                </div>
                <div className="flex gap-8">
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-400 mb-1">총 예산</p>
                    <p className="text-xl font-black text-slate-900">
                      ₩{(subCampaigns.reduce((acc, curr) => acc + (curr.enabled ? curr.budget : 0), 0)).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-400 mb-1">오늘까지 집행액</p>
                    <p className="text-xl font-black text-blue-600">₩{totalSpent.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto pr-4 space-y-6 custom-scrollbar pb-6">
                {subCampaigns.length === 0 && (
                  <div className="text-center py-24 bg-slate-50/50 rounded-[32px] border-2 border-dashed border-slate-200">
                    <Megaphone className="mx-auto text-slate-200 mb-6" size={64} />
                    <p className="text-slate-400 text-lg font-medium">등록된 예산 항목이 없습니다.<br/>커스텀 항목을 추가하거나 엑셀 매칭을 활용하세요.</p>
                  </div>
                )}

                {subCampaigns.map((sub) => (
                  <Card key={sub.id} className={cn(
                    "p-8 border-slate-100 transition-all bg-white shadow-sm overflow-visible rounded-[32px] group border-2 relative",
                    !sub.enabled && "opacity-40 grayscale"
                  )}>
                    <div className="absolute top-6 right-20 flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400">{sub.enabled ? '매체 ON' : '매체 OFF'}</span>
                      <Button 
                        size="sm" 
                        variant={sub.enabled ? "default" : "outline"} 
                        onClick={() => handleUpdateField(sub.id, { enabled: !sub.enabled })}
                        className="rounded-full px-4 h-8 text-[10px] font-black"
                      >
                        {sub.enabled ? '활성화됨' : '제외됨'}
                      </Button>
                    </div>
                    <div className="flex items-start gap-8">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        <div className="space-y-3">
                          <Label className="text-sm font-black text-slate-700 ml-1">매칭 키워드 (Excel Name)</Label>
                          <Input 
                            placeholder="예: GFA_메인_DA" 
                            value={sub.excel_name}
                            onChange={(e) => handleUpdateField(sub.id, { excel_name: e.target.value })}
                            className="bg-white border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-2xl h-14 transition-all text-base px-5 border-2 text-slate-900"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-sm font-black text-slate-700 ml-1">매체 구분</Label>
                          <Select 
                            value={sub.media} 
                            onValueChange={(val) => handleUpdateField(sub.id, { media: val as MediaProvider })}
                          >
                            <SelectTrigger className="bg-white border-slate-200 rounded-2xl h-14 focus:ring-4 focus:ring-blue-500/5 transition-all text-base px-5 border-2 text-slate-900">
                              <SelectValue placeholder="매체 선택" />
                            </SelectTrigger>
                            <SelectContent className="z-[200] rounded-2xl border-slate-200 p-2">
                              <SelectItem value="네이버GFA" className="rounded-xl py-3">네이버 GFA</SelectItem>
                              <SelectItem value="카카오Moment" className="rounded-xl py-3">카카오 모먼트</SelectItem>
                              <SelectItem value="메타Ads" className="rounded-xl py-3">메타 Ads</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-sm font-black text-slate-700 ml-1">할당 예산 (Total Budget)</Label>
                          <div className="relative">
                            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₩</span>
                            <Input 
                              type="number" 
                              placeholder="0" 
                              value={sub.budget}
                              onChange={(e) => handleUpdateField(sub.id, { budget: Number(e.target.value) })}
                              className="bg-white border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-2xl h-14 transition-all font-mono font-black text-blue-600 pl-10 pr-5 text-lg border-2"
                            />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-sm font-black text-slate-700 ml-1">목표 CPC (Target)</Label>
                          <Input 
                            type="number" 
                            placeholder="0" 
                            value={sub.target_cpc || ''}
                            onChange={(e) => handleUpdateField(sub.id, { target_cpc: Number(e.target.value) })}
                            className="bg-white border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-2xl h-14 transition-all font-mono px-5 border-2 text-slate-900"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-sm font-black text-slate-700 ml-1">목표 CTR (Target %)</Label>
                          <div className="relative">
                            <Input 
                              type="number" 
                              step="0.01"
                              placeholder="0.00" 
                              value={sub.target_ctr || ''}
                              onChange={(e) => handleUpdateField(sub.id, { target_ctr: Number(e.target.value) })}
                              className="bg-white border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-2xl h-14 transition-all font-mono pr-10 px-5 border-2 text-slate-900"
                            />
                            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-sm font-black text-slate-700 ml-1">수수료율 (Fee %)</Label>
                          <div className="flex items-center gap-4">
                            <Input 
                              type="number" 
                              placeholder="10" 
                              value={sub.fee_rate}
                              onChange={(e) => handleUpdateField(sub.id, { fee_rate: Number(e.target.value) })}
                              className="bg-white border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-2xl h-14 w-28 text-center transition-all font-mono font-bold border-2 text-slate-900"
                            />
                            <Badge variant="outline" className="text-xs text-slate-500 border-slate-200 py-2 px-4 rounded-xl bg-slate-50 font-bold border-2">Default 10%</Badge>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-sm font-black text-slate-700 ml-1">DMP 칼럼명 (Optional)</Label>
                          <Input 
                            placeholder="원본 DMP 칼럼 매칭" 
                            value={sub.dmp_column || ''}
                            onChange={(e) => handleUpdateField(sub.id, { dmp_column: e.target.value })}
                            className="bg-white border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 rounded-2xl h-14 transition-all text-base px-5 border-2 text-slate-900"
                          />
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveField(sub.id)}
                        className="text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-2xl h-14 w-14 transition-all group-hover:text-slate-300"
                      >
                        <Trash2 size={24} />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              {/* RAW Mapping Table Section */}
              <div className="mt-8 mb-12 flex-shrink-0">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
                    <Layout size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">캠페인명별 정밀 예산 설정 (RAW)</h3>
                    <p className="text-slate-400 text-sm font-medium">엑셀의 원본 캠페인명 단위로 개별 예산을 관리합니다.</p>
                  </div>
                </div>
                
                <div className="border-2 border-slate-100 rounded-[32px] overflow-hidden bg-slate-50/30">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="border-slate-100 hover:bg-transparent">
                        <TableHead className="font-black text-slate-900 h-14 px-6">엑셀 캠페인명</TableHead>
                        <TableHead className="font-black text-slate-900 h-14 w-40">매체</TableHead>
                        <TableHead className="font-black text-slate-900 h-14 w-48">개별 예산 설정</TableHead>
                        <TableHead className="font-black text-slate-900 h-14 w-32">수수료(%)</TableHead>
                        <TableHead className="font-black text-slate-900 h-14 w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subCampaigns.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-12 text-slate-400 font-medium">
                            상단에서 항목을 추가하면 여기에 캠페인 리스트가 나타납니다.
                          </TableCell>
                        </TableRow>
                      )}
                      {subCampaigns.map((sub) => (
                        <TableRow key={`raw-${sub.id}`} className="border-slate-100 hover:bg-blue-50/30 transition-colors">
                          <TableCell className="px-6 font-bold text-slate-700">{sub.excel_name || '(이름 미지정)'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-white text-slate-500 border-slate-200">{sub.media}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">₩</span>
                              <input 
                                type="number" 
                                value={sub.budget}
                                onChange={(e) => handleUpdateField(sub.id, { budget: Number(e.target.value) })}
                                className="w-full bg-white border-2 border-slate-100 focus:border-blue-400 rounded-xl h-10 pl-7 pr-3 text-sm font-mono font-bold text-slate-700 transition-all focus:outline-none focus:ring-0"
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <input 
                              type="number" 
                              value={sub.fee_rate}
                              onChange={(e) => handleUpdateField(sub.id, { fee_rate: Number(e.target.value) })}
                              className="w-full bg-white border-2 border-slate-100 focus:border-blue-400 rounded-xl h-10 px-3 text-sm font-mono font-bold text-center text-slate-700 transition-all focus:outline-none focus:ring-0"
                            />
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleRemoveField(sub.id)}
                              className="text-slate-300 hover:text-red-500"
                            >
                              <Trash2 size={16} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="mt-12 pt-10 border-t border-slate-100 flex justify-between items-center bg-white flex-shrink-0">
                <Button variant="outline" onClick={handleAddField} className="rounded-[20px] border-slate-200 h-16 px-10 text-slate-600 hover:bg-slate-50 transition-all font-black text-lg border-2">
                  <Plus size={24} className="mr-3" /> 직접 항목 추가
                </Button>
                <div className="flex gap-5">
                  <Button variant="ghost" onClick={onClose} className="rounded-[20px] h-16 px-10 text-slate-400 hover:text-slate-600 transition-all font-bold text-lg">취소</Button>
                  <Button onClick={handleSave} className="bg-slate-900 border-none hover:bg-black text-white px-12 rounded-[20px] h-16 shadow-2xl shadow-slate-300 transition-all hover:translate-y-[-4px] active:translate-y-0 font-black text-lg">
                    설정 데이터 저장 및 상시 적용
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
