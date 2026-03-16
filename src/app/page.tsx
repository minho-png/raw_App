"use client";

import React, { useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ReportCenter } from '@/components/organisms/ReportCenter';
import { useCampaignStore } from '@/store/useCampaignStore';

export default function DashboardRoot() {
  const { setCampaigns } = useCampaignStore();

  useEffect(() => {
    // Campaigns are now handled by Sidebar's useEffect and Zustand store persistence
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-y-auto">
        <ReportCenter />
      </main>
    </div>
  );
}
