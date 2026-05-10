"use client"
import React from "react"
import type { DailySpendEntry } from "@/lib/hooks/useDailySpendMap"

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR") + "원"

interface Props {
  entry: DailySpendEntry | undefined
  /** 'cell' = 테이블 td 형태, 'inline' = div */
  variant?: 'cell' | 'inline'
  className?: string
}

/**
 * 전일 대비 소진율 표시 (네이버 광고 시스템 스타일).
 *   당일 소진액 (큰 숫자)
 *   ▲ +증감액 (+증감률%)   ← 상승=파랑 / 하락=빨강 / 보합=회색
 *   전일: 전일소진액
 */
export function DailyDeltaCell({ entry, variant = 'cell', className }: Props) {
  const { today, yesterday, delta, deltaRate } = entry ?? {
    today: 0, yesterday: 0, delta: 0, deltaRate: 0,
  }
  const isUp = delta > 0
  const isDown = delta < 0
  const color = isUp ? 'text-blue-600' : isDown ? 'text-red-500' : 'text-gray-400'
  const arrow = isUp ? '▲' : isDown ? '▼' : '—'
  const sign = isUp ? '+' : ''  // 음수는 자동으로 '-'

  const content = (
    <>
      <div className="font-medium text-gray-900 tabular-nums">{fmt(today)}</div>
      <div className={`text-[11px] mt-0.5 tabular-nums ${color}`}>
        {arrow} {sign}{fmt(delta)}
        {' '}
        <span>({sign}{deltaRate.toFixed(1)}%)</span>
      </div>
      <div className="text-[10px] text-gray-400 tabular-nums">전일: {fmt(yesterday)}</div>
    </>
  )

  if (variant === 'inline') {
    return <div className={className}>{content}</div>
  }
  return <td className={`px-4 py-3 text-right ${className ?? ''}`}>{content}</td>
}
