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
          ? "border-indigo-300 bg-indigo-50 shadow-sm"
          : "border-transparent hover:border-slate-200 hover:bg-white"
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
          isSelected ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-500 group-hover:bg-slate-300"
        )}>
          <Database size={14} />
        </div>
        <span className={cn(
          "truncate text-sm font-bold tracking-tight transition-colors",
          isSelected ? "text-indigo-700" : "text-slate-600 group-hover:text-slate-800"
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
          className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteClick(campaign.campaign_id);
          }}
          className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
};
