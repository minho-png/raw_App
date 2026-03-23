"use client"

interface Campaign {
  id: number
  name: string
  advertiser: string
  media: string
  spend: number
  impression: number
  click: number
  ctr: number
  status: string
}

interface CampaignTableProps {
  campaigns: Campaign[]
}

export default function CampaignTable({ campaigns }: CampaignTableProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-700">캠페인별 현황</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
              <th className="px-5 py-3 text-left font-medium">캠페인명</th>
              <th className="px-5 py-3 text-left font-medium">광고주</th>
              <th className="px-5 py-3 text-left font-medium">매체</th>
              <th className="px-5 py-3 text-right font-medium">소진금액</th>
              <th className="px-5 py-3 text-right font-medium">노출수</th>
              <th className="px-5 py-3 text-right font-medium">클릭수</th>
              <th className="px-5 py-3 text-right font-medium">CTR</th>
              <th className="px-5 py-3 text-center font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr
                key={c.id}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td className="px-5 py-3 font-medium text-gray-800">
                  {c.name}
                </td>
                <td className="px-5 py-3 text-gray-500">{c.advertiser}</td>
                <td className="px-5 py-3 text-gray-500">{c.media}</td>
                <td className="px-5 py-3 text-right font-medium text-gray-800">
                  {c.spend.toLocaleString()}원
                </td>
                <td className="px-5 py-3 text-right text-gray-500">
                  {c.impression.toLocaleString()}
                </td>
                <td className="px-5 py-3 text-right text-gray-500">
                  {c.click.toLocaleString()}
                </td>
                <td className="px-5 py-3 text-right text-gray-500">
                  {c.ctr}%
                </td>
                <td className="px-5 py-3 text-center">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      c.status === "진행중"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
