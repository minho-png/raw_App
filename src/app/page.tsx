"use client";

import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ReportCenter } from '@/components/organisms/ReportCenter';
import { SettlementTable } from '@/components/organisms/SettlementTable';
import { useCampaignStore } from '@/store/useCampaignStore';

export default function DashboardRoot() {
  const activeMainView = useCampaignStore(s => s.activeMainView);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-y-auto">
        {activeMainView === 'settlement' ? <SettlementTable /> : <ReportCenter />}
      </main>
    </div>
  );
}
