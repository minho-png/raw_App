import Link from "next/link"

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">광고 운영 대시보드</h1>
            <p className="text-xs text-gray-400 mt-0.5">크로스타겟 캠페인 현황</p>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickCard
            href="/campaign/ct-plus/status"
            title="캠페인 집행 현황"
            desc="CT+ 캠페인 등록 및 소진율 관리"
            icon="📊"
          />
          <QuickCard
            href="/campaign/ct-plus/daily"
            title="데일리 리포트"
            desc="매체별 RAW 데이터 업로드 및 파싱"
            icon="📥"
          />
          <QuickCard
            href="/campaign/ct-plus/report"
            title="통합 리포트"
            desc="KPI 분석·DMP 정산·소재 성과 조회"
            icon="📈"
          />
          <QuickCard
            href="/campaign/ct-plus/final"
            title="종료 리포트"
            desc="캠페인 종료 후 최종 성과 보고서 생성"
            icon="📋"
          />
          <QuickCard
            href="/campaign/ct-plus/creative-check"
            title="소재 및 랜딩URL 확인"
            desc="규격 검수 및 UTM/MMP 파라미터 분석"
            icon="🔍"
          />
          <QuickCard
            href="/mockup"
            title="목업 게재 이미지 생성"
            desc="AI로 광고 소재 목업 이미지 제작"
            icon="🎨"
          />
        </div>
      </main>
    </div>
  )
}

function QuickCard({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-blue-300 hover:shadow-md transition-all">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="mt-0.5 text-xs text-gray-500">{desc}</p>
        </div>
      </div>
    </Link>
  )
}
