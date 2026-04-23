// Extracted utilities for status page components
"use client"
import { ModalShell } from "@/components/atoms/ModalShell"
import React from "react"
import { Campaign, TargetingBudget, MediaBudget, getCampaignTotals } from "@/lib/campaignTypes"

function fmt(n: number) { return n.toLocaleString("ko-KR") }

function spendRateStyle(rate: number): { text: string; bar: string } {
  if (rate <= 20)  return { text: "text-blue-500",   bar: "bg-blue-400" }
  if (rate <= 40)  return { text: "text-sky-500",    bar: "bg-sky-400" }
  if (rate <= 60)  return { text: "text-green-600",  bar: "bg-green-500" }
  if (rate <= 75)  return { text: "text-yellow-600", bar: "bg-yellow-400" }
  if (rate <= 90)  return { text: "text-orange-500", bar: "bg-orange-400" }
  if (rate <= 100) return { text: "text-red-500",    bar: "bg-red-400" }
  return                   { text: "text-red-700",   bar: "bg-red-600" }
}

function getDailySuggestion(c: Campaign): string {
  const { totalSettingCost, totalSpend } = getCampaignTotals(c)
  const remaining = totalSettingCost - totalSpend
  if (remaining <= 0) return `세팅 금액 100% 초과 소진`
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const end   = new Date(c.endDate); end.setHours(0, 0, 0, 0)
  const days  = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return `미소진 ${fmt(remaining)}원 (기간 만료)`
  const daily = Math.round(remaining / days)
  return `미소진 ${fmt(remaining)}원 · 남은 ${days}일 기준 일 예산 약 ${fmt(daily)}원으로 조정 필요`
}

function emptyTB(): TargetingBudget { return { budget: 0, spend: 0, agencyFeeRate: 10, targetings: [] } }
function emptyMB(media: string): MediaBudget { return { media, dmp: emptyTB(), nonDmp: emptyTB() } }

type FilterStatus = "전체" | "집행 중" | "종료"
interface ConfirmCfg { title: string; message: string; onConfirm: () => void }

const btnPrimary = "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
const selectCls = "rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400 transition-colors"
const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"

export function ConfirmModal({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <ModalShell open={true} onClose={onCancel} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{message}</p>
        <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={onConfirm} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">확인</button>
        </div>
      </div>
    </ModalShell>
  )
}

export function SCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: "blue" | "gray"
}) {
  const cls = color === "blue" ? "text-blue-600" : color === "gray" ? "text-gray-400" : "text-gray-900"
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
      <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${cls}`}>{value} {sub && <span className="text-xs font-normal">{sub}</span>}</p>
    </div>
  )
}

export function MF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

export { btnPrimary, selectCls, inputCls, emptyTB, emptyMB, fmt, spendRateStyle, getDailySuggestion }
export type { FilterStatus, ConfirmCfg }
