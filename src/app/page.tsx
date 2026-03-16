"use client";

import React, { useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ReportCenter } from '@/components/organisms/ReportCenter';
import { useCampaignStore } from '@/store/useCampaignStore';

export default function DashboardRoot() {
  const { setCampaigns } = useCampaignStore();

  useEffect(() => {
    // Initial mock campaigns
    setCampaigns([
      {
        campaign_id: 'CAMP-001',
        campaign_name: '네이버 GFA 3월 프로모션',
        media: '네이버GFA',
        total_budget: 15000000,
        start_date: new Date('2026-03-01'),
        end_date: new Date('2026-03-31'),
        base_fee_rate: 10,
        total_fee_rate: 12
      },
      {
        campaign_id: 'CAMP-002',
        campaign_name: '카카오 비즈보드 봄 시즌',
        media: 'Kakao',
        total_budget: 8000000,
        start_date: new Date('2026-03-15'),
        end_date: new Date('2026-04-15'),
        base_fee_rate: 15,
        total_fee_rate: 15
      }
    ]);
  }, [setCampaigns]);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] overflow-y-auto">
        <ReportCenter />
      </main>
    </div>
  );
}
