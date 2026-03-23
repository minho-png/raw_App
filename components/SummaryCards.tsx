"use client"

interface SummaryCardsProps {
  totalSpend: number
  totalCampaigns: number
  totalMedia: number
  avgCtr: number
}

export default function SummaryCards({
  totalSpend,
  totalCampaigns,
  totalMedia,
  avgCtr,
}: SummaryCardsProps) {
  const cards = [
    {
      label: "총 소진금액",
      value: `${(totalSpend / 10000).toLocaleString()}만원`,
      sub: "이번 주 기준",
      color: "bg-blue-50 border-blue-200",
      textColor: "text-blue-700",
    },
    {
      label: "진행 캠페인",
      value: `${totalCampaigns}개`,
      sub: "활성 캠페인",
      color: "bg-green-50 border-green-200",
      textColor: "text-green-700",
    },
    {
      label: "집행 매체 수",
      value: `${totalMedia}개`,
      sub: "연동 매체",
      color: "bg-purple-50 border-purple-200",
      textColor: "text-purple-700",
    },
    {
      label: "평균 CTR",
      value: `${avgCtr}%`,
      sub: "전체 캠페인 평균",
      color: "bg-orange-50 border-orange-200",
      textColor: "text-orange-700",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border p-5 ${card.color}`}
        >
          <p className="text-sm text-gray-500">{card.label}</p>
          <p className={`mt-1 text-2xl font-bold ${card.textColor}`}>
            {card.value}
          </p>
          <p className="mt-1 text-xs text-gray-400">{card.sub}</p>
        </div>
      ))}
    </div>
  )
}
