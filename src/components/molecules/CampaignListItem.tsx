"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Database, Settings, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CampaignConfig } from '@/types';

interface CampaignListItemProps {
  campaign: CampaignConfig;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEditClick: (campaign: CampaignConfig) => void;
  onDeleteClick: (id: string) => void;
}

export const CampaignListItem: React.FC<CampaignListItemProps> = ({
  campaign,
  isSelected,
  onSelect,
  onEditClick,
  onDeleteClick,
}) => {
  return (
    <motion.div
      key={campaign.campaign_id}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      whileHover={{ x: 4 }}
      layout
      className={cn(
        "group relative flex cursor-pointer items-center justify-between overflow-hidden rounded-xl border p-3.5 transition-all",
        isSelected
          ? "border-indigo-500/40 bg-indigo-500/15 shadow-[0_0_18px_rgba(99,102,241,0.18)]"
          : "border-transparent hover:border-slate-700/70 hover:bg-slate-800/40"
      )}
      onClick={() => onSelect(campaign.campaign_id)}
    >
      {isSelected && (
        <motion.div
          layoutId="active-indicator"
          className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-blue-500 rounded-r-full"
        />
      )}

      <div className="flex items-center gap-3 overflow-hidden">
        <div className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
          isSelected ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-400 group-hover:bg-slate-700"
        )}>
          <Database size={14} />
        </div>
        <span className={cn(
          "truncate text-sm font-bold tracking-tight transition-colors",
          isSelected ? "text-indigo-100" : "text-slate-400 group-hover:text-slate-200"
        )}>
          {campaign.campaign_name}
        </span>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEditClick(campaign);
          }}
          className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteClick(campaign.campaign_id);
          }}
          className="p-1.5 hover:bg-red-500/20 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
};
