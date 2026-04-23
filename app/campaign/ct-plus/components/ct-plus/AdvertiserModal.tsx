"use client"
import React, { useState } from "react"
import { Advertiser, Agency } from "@/lib/campaignTypes"
import { MF, inputCls } from "./statusUtils"
import { ModalShell } from "@/components/atoms/ModalShell"

export function AdvertiserModal({
  open, onClose, editAdv, agencies, onSave,
}: {
  open: boolean
  onClose: () => void
  editAdv: Advertiser | null
  agencies: Agency[]
  onSave: (adv: Advertiser) => void
}) {
  const [name,     setName]     = useState(editAdv?.name     ?? "")
  const [agencyId, setAgencyId] = useState(editAdv?.agencyId ?? "")

  function handleSave() {
    if (!name.trim() || !agencyId) { alert("모든 항목을 입력하세요."); return }
    onSave({ id: editAdv?.id ?? Date.now().toString(), name, agencyId } as Advertiser)
  }

  return (
    <ModalShell open={open} onClose={onClose} title={editAdv ? "광고주 수정" : "광고주 추가"} onSave={handleSave}>
      <div className="space-y-4">
        <MF label="광고주명 *">
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </MF>
        <MF label="대행사 *">
          <select value={agencyId} onChange={e => setAgencyId(e.target.value)} className={inputCls}>
            <option value="">선택하세요</option>
            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </MF>
      </div>
    </ModalShell>
  )
}
