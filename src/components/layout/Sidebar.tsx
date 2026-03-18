"use client";

import React, { useEffect, useState } from 'react';
import { useCampaignStore } from '@/store/useCampaignStore';
import { Plus, Trash2, Layout, BarChart3, Database, Loader2, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getCampaignsAction, saveCampaignAction, deleteCampaignAction } from '@/server/actions/campaign';
import { CampaignConfig } from '@/types';

export const Sidebar = () => {
  const { campaigns, selectedCampaignId, selectCampaign, deleteCampaign, addCampaign, setCampaigns, isLoading, setIsLoading, isSyncing, setIsSyncing, updateCampaign, refreshCampaigns } = useCampaignStore();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CampaignConfig | null>(null);
  const [tempName, setTempName] = useState("");

  // Initial fetch and polling
  useEffect(() => {
    const sync = () => refreshCampaigns(getCampaignsAction);
    sync(); // Initial
    
    const interval = setInterval(sync, 30000); // Poll every 30s for "streaming" feel
    return () => clearInterval(interval);
  }, [refreshCampaigns]);

  const handleAddCampaign = async () => {
    setIsSyncing(true); // Prevent background sync
    const newId = `CAMP-${Math.floor(Math.random() * 10000)}`;
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
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (confirm('캠페인을 삭제하시겠습니까? 관련 데이터도 함께 삭제됩니다.')) {
      setIsSyncing(true);
      try {
        const result = await deleteCampaignAction(id);
        if (result.success && result.campaigns) {
          setCampaigns(result.campaigns);
        }
      } finally {
        setIsSyncing(false);
      }
    }
  };

  return (
    <aside className="w-72 h-screen bg-[#0f172a] border-r border-slate-800/50 text-white flex flex-col p-6 shadow-2xl z-20">
      <div className="flex items-center gap-3 mb-10 px-2 group cursor-pointer">
        <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform duration-300">
          <BarChart3 size={20} className="text-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-outfit font-black text-xl tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">RAW MASTER</span>
          <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mt-1">Intelligence Pro</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 pr-2 -mr-2 scrollbar-thin">
        <div className="flex items-center justify-between mb-6 px-2">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Master Campaigns</h2>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleAddCampaign}
            className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-blue-600 rounded-lg transition-colors text-slate-400 hover:text-white shadow-inner"
          >
            <Plus size={16} />
          </motion.button>
        </div>

        <nav className="space-y-1.5">
          <AnimatePresence mode="popLayout">
            {campaigns.map((camp) => (
              <motion.div
                key={camp.campaign_id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                whileHover={{ x: 4 }}
                layout
                className={cn(
                  "group flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all relative overflow-hidden",
                  selectedCampaignId === camp.campaign_id 
                    ? "bg-blue-600/10 border border-blue-500/30 shadow-[0_0_20px_rgba(37,99,235,0.1)]" 
                    : "hover:bg-slate-800/40 border border-transparent"
                )}
                onClick={() => selectCampaign(camp.campaign_id)}
              >
                {selectedCampaignId === camp.campaign_id && (
                  <motion.div 
                    layoutId="active-indicator"
                    className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-blue-500 rounded-r-full"
                  />
                )}
                
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                    selectedCampaignId === camp.campaign_id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 group-hover:bg-slate-700"
                  )}>
                    <Database size={14} />
                  </div>
                  <span className={cn(
                    "text-sm font-bold truncate tracking-tight transition-colors",
                    selectedCampaignId === camp.campaign_id ? "text-white" : "text-slate-400 group-hover:text-slate-200"
                  )}>
                    {camp.campaign_name}
                  </span>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCampaign(camp);
                      setTempName(camp.campaign_name);
                      setIsEditModalOpen(true);
                    }}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                  >
                    <Settings size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCampaign(camp.campaign_id);
                    }}
                    className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </nav>
      </div>

      <div className="pt-6 mt-6 border-t border-slate-800/50">
        <div className="p-4 bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-slate-700/30 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-colors" />
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Engine Status</p>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />
              <div className="absolute inset-0 w-2.5 h-2.5 bg-green-500 rounded-full animate-ping opacity-75" />
            </div>
            <span className="text-xs font-bold text-slate-300">Live Synchronization</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isEditModalOpen && editingCampaign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4"
            >
              <h3 className="text-lg font-bold text-slate-900 border-b pb-2">캠페인 이름 수정</h3>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Campaign Name</label>
                <input 
                  autoFocus
                  className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-slate-900 font-bold"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      const updated = { ...editingCampaign, campaign_name: tempName };
                      const result = await saveCampaignAction(updated);
                      if (result.success && result.campaigns) {
                        setCampaigns(result.campaigns);
                      }
                      setIsEditModalOpen(false);
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
                  className="flex-1 rounded-xl h-11 bg-slate-900 hover:bg-slate-800 text-white font-bold"
                  onClick={async () => {
                    if (editingCampaign) {
                      const updated = { ...editingCampaign, campaign_name: tempName };
                      const result = await saveCampaignAction(updated);
                      if (result.success && result.campaigns) {
                        setCampaigns(result.campaigns);
                      }
                    }
                    setIsEditModalOpen(false);
                  }}
                >
                  저장
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </aside>
  );
};
