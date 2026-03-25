"use client";

import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ReportCenter } from '@/components/organisms/ReportCenter';
import { SettlementTable } from '@/components/organisms/SettlementTable';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCampaignStore } from '@/store/useCampaignStore';
import { BarChart3, ChevronRight, Home, ReceiptText, TrendingUp } from 'lucide-react';

export default function DashboardRoot() {
  const activeMainView = useCampaignStore(s => s.activeMainView);
  const setActiveMainView = useCampaignStore(s => s.setActiveMainView);
  const selectedCampaignId = useCampaignStore(s => s.selectedCampaignId);
  const campaigns = useCampaignStore(s => s.campaigns);

  const selectedCampaignName =
    campaigns.find(c => c.campaign_id === selectedCampaignId)?.campaign_name ?? '캠페인 선택 대기';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-800">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
                  <BarChart3 size={16} />
                </div>
                <span className="text-sm font-extrabold tracking-tight text-slate-800">
                  GFA <span className="text-indigo-600">RAW MASTER</span> PRO
                </span>
              </div>
              <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
                <span className="inline-flex items-center gap-1"><Home size={12} /> 대시보드</span>
                <ChevronRight size={12} />
                <span className="text-slate-700">{selectedCampaignName}</span>
              </div>
            </div>

            <Tabs
              value={activeMainView}
              onValueChange={(value) => setActiveMainView(value as 'campaigns' | 'settlement')}
              className="w-auto"
            >
              <TabsList className="h-auto rounded-xl border border-slate-200 bg-slate-100 p-1">
                <TabsTrigger
                  value="settlement"
                  className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-slate-200"
                >
                  <ReceiptText size={14} className="mr-2" />
                  DMP 정산
                </TabsTrigger>
                <TabsTrigger
                  value="campaigns"
                  className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-slate-200"
                >
                  <TrendingUp size={14} className="mr-2" />
                  캠페인 정산
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
          {activeMainView === 'settlement' ? <SettlementTable /> : <ReportCenter />}
        </section>
      </main>
    </div>
  );
}
