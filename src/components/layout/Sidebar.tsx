"use client";

import React, { useEffect, useState } from 'react';
import { useCampaignStore } from '@/store/useCampaignStore';
import { Plus, Trash2, Layout, BarChart3, Database, Loader2, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getCampaignsAction, saveCampaignAction, deleteCampaignAction } from '@/server/actions/campaign';
import { CampaignSettingsModal } from '@/components/molecules/CampaignSettingsModal';
import { CampaignConfig } from '@/types';

export const Sidebar = () => {
  const { campaigns, selectedCampaignId, selectCampaign, deleteCampaign, addCampaign, setCampaigns, isLoading, setIsLoading } = useCampaignStore();
  const [settingsCampaign, setSettingsCampaign] = useState<CampaignConfig | null>(null);

  useEffect(() => {
    const fetchCampaigns = async () => {
      setIsLoading(true);
      const result = await getCampaignsAction();
      if (result.success && result.campaigns) {
        setCampaigns(result.campaigns);
      }
      setIsLoading(false);
    };
    fetchCampaigns();
  }, [setCampaigns, setIsLoading]);

  const handleAddCampaign = async () => {
    const newId = `CAMP-${Math.floor(Math.random() * 1000)}`;
    const newCampaign = {
      campaign_id: newId,
      campaign_name: `신규 캠페인 ${campaigns.length + 1}`,
      media: '네이버GFA' as const,
      total_budget: 10000000,
      start_date: new Date(),
      end_date: new Date(),
      base_fee_rate: 10,
      total_fee_rate: 10
    };
    
    await saveCampaignAction(newCampaign);
    addCampaign(newCampaign);
    selectCampaign(newId);
  };

  const handleDeleteCampaign = async (id: string) => {
    if (confirm('캠페인을 삭제하시겠습니까? 관련 데이터도 함께 삭제됩니다.')) {
      await deleteCampaignAction(id);
      deleteCampaign(id);
    }
  };

  return (
    <aside className="w-64 h-screen bg-slate-900/90 backdrop-blur-xl border-r border-slate-800 text-white flex flex-col p-4">
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
          <BarChart3 size={18} />
        </div>
        <span className="font-bold text-lg tracking-tight">RAW MASTER <span className="text-blue-400">PRO</span></span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Campaigns</h2>
          <button 
            onClick={handleAddCampaign}
            className="p-1 hover:bg-slate-800 rounded-md transition-colors text-blue-400"
          >
            <Plus size={16} />
          </button>
        </div>

        <nav>
          <AnimatePresence mode="popLayout">
            {campaigns.map((camp) => (
              <motion.div
                key={camp.campaign_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                layout
                className={cn(
                  "group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all mb-1",
                  selectedCampaignId === camp.campaign_id 
                    ? "bg-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.3)]" 
                    : "hover:bg-slate-800/50"
                )}
                onClick={() => selectCampaign(camp.campaign_id)}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <Database size={14} className={selectedCampaignId === camp.campaign_id ? "text-white" : "text-slate-400"} />
                  <span className="text-sm font-medium truncate">{camp.campaign_name}</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsCampaign(camp);
                    }}
                    className="p-1 hover:bg-white/20 rounded text-blue-200 transition-colors"
                  >
                    <Settings size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCampaign(camp.campaign_id);
                    }}
                    className="p-1 hover:bg-red-500/20 rounded text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </nav>
      </div>

      <div className="pt-4 border-t border-slate-800">
        <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">System Status</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium">Data Engine Ready</span>
          </div>
        </div>
      </div>

      {settingsCampaign && (
        <CampaignSettingsModal 
          campaign={settingsCampaign} 
          isOpen={!!settingsCampaign} 
          onClose={() => setSettingsCampaign(null)} 
        />
      )}
    </aside>
  );
};
