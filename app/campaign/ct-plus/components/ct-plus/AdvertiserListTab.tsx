"use client"
import React from "react"
import { Advertiser, Agency, Campaign } from "@/lib/campaignTypes"

export function AdvertiserListTab({ 
  advertisers, agencies, campaigns, onEdit, onDelete 
}: {
  advertisers: Advertiser[]
  agencies: Agency[]
  campaigns: Campaign[]
  onEdit: (adv: Advertiser) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      {advertisers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
          <p className="text-sm text-gray-500">광고주가 없습니다.</p>
        </div>
      ) : (
        advertisers.map(adv => {
          const agencyName = agencies.find(a => a.id === adv.agencyId)?.name ?? "-"
          const assigned = campaigns.filter(c => c.advertiserId === adv.id)
          return (
            <div key={adv.id} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900">{adv.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{agencyName} · 캠페인 {assigned.length}개</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => onEdit(adv)} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">수정</button>
                  <button onClick={() => onDelete(adv.id)} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">삭제</button>
                </div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
