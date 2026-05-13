"use client"

import Link from "next/link"
import type { Campaign } from "@/lib/campaignTypes"

// 메인 대시보드 이상 알림 카드.
// 도메인 타입(Campaign[]) 을 받아 캠페인명 mini-list + querystring 점프를 제공하므로
// 단순 atom 이 아닌 molecule 분류. 본 파일로 추출하여 app/page.tsx 비대화 완화.
//
// 사용 예:
//   <AlertCard
//     title="소진 과다" count={n} note="95% 이상" tone="red"
//     campaigns={overspendList} alertKey="overspend"
//   />
//
// alertKey 는 status 페이지가 querystring 으로 받아 자동 필터 적용 (R5).

export type AlertTone = 'red' | 'orange' | 'yellow'

const ALERT_TONE: Record<AlertTone, { border: string; bg: string; text: string; dot: string; pulse?: boolean }> = {
  red:    { border: 'border-red-200',    bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500',    pulse: true },
  orange: { border: 'border-orange-200', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  yellow: { border: 'border-yellow-200', bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
}

interface Props {
  title: string
  count: number
  note: string
  tone: AlertTone
  campaigns: Campaign[]
  alertKey: 'overspend' | 'underspend' | 'expiring'
}

export function AlertCard({ title, count, note, tone, campaigns, alertKey }: Props) {
  const s = ALERT_TONE[tone]
  if (count === 0) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white px-4 py-3.5 opacity-60">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold text-gray-400">{title}</p>
          <span className="text-xs text-gray-300">0개</span>
        </div>
        <p className="mt-1 text-[10px] text-gray-300">{note}</p>
        <p className="mt-2 text-[11px] text-gray-300">해당 없음</p>
      </div>
    )
  }
  return (
    <Link
      href={`/campaign/ct-plus/status?alert=${alertKey}`}
      className={`block rounded-xl border ${s.border} ${s.bg} px-4 py-3.5 transition-transform hover:scale-[1.01] hover:shadow-sm`}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${s.pulse ? 'animate-pulse' : ''}`} />
          <p className={`text-xs font-semibold ${s.text}`}>{title}</p>
        </div>
        <span className={`text-sm font-bold ${s.text} tabular-nums`}>{count}개</span>
      </div>
      <p className="mt-0.5 text-[10px] text-gray-500">{note}</p>
      <div className="mt-2 space-y-0.5">
        {campaigns.slice(0, 3).map(c => (
          <p key={c.id} className="text-[11px] text-gray-700 truncate" title={c.campaignName}>
            · {c.campaignName}
          </p>
        ))}
        {campaigns.length > 3 && (
          <p className="text-[10px] text-gray-400">+{campaigns.length - 3}개 더 보기 →</p>
        )}
      </div>
    </Link>
  )
}
