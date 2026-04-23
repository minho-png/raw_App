
"use client"
import React from "react"
import { MediaBudget } from "@/lib/campaignTypes"
import { inputCls, MF } from "./statusUtils"

export function KpiTargetSection({
  mb,
  onUpdateMBField,
}: {
  mb: MediaBudget
  onUpdateMBField: (media: string, field: string, value: number | boolean | undefined) => void
}) {
  return (
    <>
      {/* KPI 목표 */}
      <div className="grid grid-cols-3 gap-3">
        <MF label="CPC 목표">
          <input
            type="number" min="0"
            value={mb.cpcTarget ?? ''}
            onChange={e => onUpdateMBField(mb.media, 'cpcTarget', parseFloat(e.target.value) || undefined)}
            className={inputCls}
            placeholder="원"
          />
        </MF>
        <MF label="CPM 목표">
          <input
            type="number" min="0"
            value={mb.cpmTarget ?? ''}
            onChange={e => onUpdateMBField(mb.media, 'cpmTarget', parseFloat(e.target.value) || undefined)}
            className={inputCls}
            placeholder="원"
          />
        </MF>
        {mb.isVideo ? (
          <MF label="VTR 목표 (%)">
            <input
              type="number" min="0" max="100" step="0.01"
              value={mb.vtrTarget ?? ''}
              onChange={e => onUpdateMBField(mb.media, 'vtrTarget', parseFloat(e.target.value) || undefined)}
              className={inputCls}
              placeholder="예: 50"
            />
          </MF>
        ) : (
          <MF label="CTR 목표 (%)">
            <input
              type="number" min="0" max="100" step="0.01"
              value={mb.ctrTarget ?? ''}
              onChange={e => onUpdateMBField(mb.media, 'ctrTarget', parseFloat(e.target.value) || undefined)}
              className={inputCls}
              placeholder="예: 0.05"
            />
          </MF>
        )}
      </div>

      {/* 예상 노출수 계산 */}
      {(mb.cpmTarget || mb.cpcTarget) && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1">
          <p className="text-xs font-semibold text-blue-900">예상 노출수 계산:</p>
          {mb.cpmTarget && (
            <p className="text-[11px] text-blue-700">
              CPM 기준: ({(mb.totalBudget ?? 0).toLocaleString()} / {mb.cpmTarget}) × 1000 = {((mb.totalBudget ?? 0) / mb.cpmTarget * 1000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}회
            </p>
          )}
          {mb.cpcTarget && mb.ctrTarget && (
            <p className="text-[11px] text-blue-700">
              CPC+CTR 기준: ({(mb.totalBudget ?? 0).toLocaleString()} / {mb.cpcTarget}) / ({mb.ctrTarget} / 100) = {((mb.totalBudget ?? 0) / mb.cpcTarget / (mb.ctrTarget / 100)).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}회
            </p>
          )}
        </div>
      )}
    </>
  )
}
