import SummaryCards from "@/components/SummaryCards"
import SpendChart from "@/components/SpendChart"
import CampaignTable from "@/components/CampaignTable"
import { summaryData, dailySpendData, mediaSpendData, campaignData } from "@/lib/mockData"

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 상단 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">메인 대시보드</h1>
            <p className="text-xs text-gray-400 mt-0.5">크로스타겟 캠페인 현황</p>
          </div>
          <div className="text-xs text-gray-400 bg-gray-100 rounded-lg px-3 py-1.5">
            2026.03.17 — 2026.03.23
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="space-y-5 p-6">
        {/* 요약 카드 */}
        <SummaryCards
          totalSpend={summaryData.totalSpend}
          totalCampaigns={summaryData.totalCampaigns}
          totalMedia={summaryData.totalMedia}
          avgCtr={summaryData.avgCtr}
        />

        {/* 차트 */}
        <SpendChart dailyData={dailySpendData} mediaData={mediaSpendData} />

        {/* 캠페인 테이블 */}
        <CampaignTable campaigns={campaignData} />
      </main>
    </div>
  )
}
