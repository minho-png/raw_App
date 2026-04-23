"use client"
import React, { useState } from "react"
import { Advertiser, Agency } from "@/lib/campaignTypes"
import { MF, inputCls } from "./statusUtils"

export function AdvertiserModal({ 
  open, onClose, editAdv, agencies, onSave 
}: {
  open: boolean
  onClose: () => void
  editAdv: Advertiser | null
  agencies: Agency[]
  onSave: (adv: Advertiser) => void
}) {
  const [name, setName] = useState(editAdv?.name ?? "")
  const [agencyId, setAgencyId] = useState(editAdv?.agencyId ?? "")

  function handleSave() {
    if (!name.trim() || !agencyId) {
      alert("모든 항목을 입력하세요.")
      return
    }
    onSave({ id: editAdv?.id ?? Date.now().toString(), name, agencyId } as Advertiser)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{editAdv ? "광고주 수정" : "광고주 추가"}</h2>
        <MF label="광고주명 *">
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </MF>
        <MF label="대행사 *">
          <select value={agencyId} onChange={e => setAgencyId(e.target.value)} className={inputCls}>
            <option value="">선택하세요</option>
            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </MF>
        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
          <button onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">저장</button>
        </div>
      </div>
    </div>
  )
}
