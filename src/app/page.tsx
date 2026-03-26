"use client";

import React, { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ReportCenter } from '@/components/organisms/ReportCenter';
import { SettlementTable } from '@/components/organisms/SettlementTable';
import { ImcDashboard } from '@/components/organisms/ImcDashboard';
import { AgencyManagement } from '@/components/organisms/AgencyManagement';
import { AdAccountManagement } from '@/components/organisms/AdAccountManagement';
import { useCampaignStore } from '@/store/useCampaignStore';
import { Bell, HelpCircle, User, Search, ChevronRight, Home } from 'lucide-react';

export type ActivePage = 'dashboard' | 'settlement' | 'agencies' | 'accounts' | 'dmp-rules' | 'reports';

export default function DashboardRoot() {
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');

  const activeMainView = useCampaignStore(s => s.activeMainView);
  const setActiveMainView = useCampaignStore(s => s.setActiveMainView);
  const selectedImcCampaignId = useCampaignStore(s => s.selectedImcCampaignId);
  const imcCampaigns = useCampaignStore(s => s.imcCampaigns);
  const campaigns = useCampaignStore(s => s.campaigns);
  const selectedCampaignId = useCampaignStore(s => s.selectedCampaignId);

  const selectedCampaignName =
    campaigns.find(c => c.campaign_id === selectedCampaignId)?.campaign_name ?? '캠페인 선택 대기';

  const selectedImcName = selectedImcCampaignId
    ? imcCampaigns.find(i => i.imc_campaign_id === selectedImcCampaignId)?.name ?? 'IMC 그룹'
    : null;

  const pageTitles: Record<ActivePage, string> = {
    dashboard: '캠페인 대시보드',
    settlement: 'DMP 정산',
    agencies: '대행사 관리',
    accounts: '광고 계정 관리',
    'dmp-rules': 'DMP 규칙',
    reports: '리포트 센터',
  };

  // Sync activePage with activeMainView for backward compatibility
  const handleSetActivePage = (page: ActivePage) => {
    setActivePage(page);
    if (page === 'dashboard') setActiveMainView('campaigns');
    else if (page === 'settlement') setActiveMainView('settlement');
  };

  const renderContent = () => {
    if (selectedImcCampaignId) {
      return <ImcDashboard />;
    }
    switch (activePage) {
      case 'settlement':
        return <SettlementTable />;
      case 'agencies':
        return <AgencyManagement />;
      case 'accounts':
        return <AdAccountManagement />;
      case 'reports':
        return <ReportCenter />;
      case 'dmp-rules':
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <p className="text-lg font-semibold">DMP 규칙 관리</p>
            <p className="text-sm">준비 중입니다.</p>
          </div>
        );
      case 'dashboard':
      default:
        return <ReportCenter />;
    }
  };

  const breadcrumbLabel = () => {
    if (selectedImcName) return selectedImcName;
    if (activePage === 'dashboard') return selectedCampaignName;
    return pageTitles[activePage];
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] font-sans">
      <Sidebar activePage={activePage} setActivePage={handleSetActivePage} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 z-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Home size={14} className="text-slate-400" />
            <ChevronRight size={14} className="text-slate-300" />
            <span className="text-slate-600 font-medium">{pageTitles[activePage]}</span>
            {(activePage === 'dashboard' || selectedImcName) && (
              <>
                <ChevronRight size={14} className="text-slate-300" />
                <span className="text-slate-800 font-semibold truncate max-w-[240px]">
                  {breadcrumbLabel()}
                </span>
              </>
            )}
          </div>

          {/* Right side: search + actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 w-96 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input
                placeholder="검색..."
                className="bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 w-full"
              />
            </div>
            <button className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
              <Bell size={15} />
            </button>
            <button className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
              <HelpCircle size={15} />
            </button>
            <button className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors">
              <User size={15} />
            </button>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-8 bg-[#f8fafc]">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
