"use client"
import React, { useState } from "react"
import { Agency } from "@/lib/campaignTypes"
import { MF, inputCls } from "./statusUtils"
import { ModalShell } from "@/components/atoms/ModalShell"

export function AgencyFormModal({
  open, onClose, editAg, onSave,
}: {
  open: boolean
  onClose: () => void
  editAg: Agency | null
  onSave: (ag: Agency) => void
}) {
  const [name,        setName]        = useState(editAg?.name        ?? "")
  const [contactName, setContactName] = useState(editAg?.contactName ?? "")
  const [email,       setEmail]       = useState(editAg?.email       ?? "")
  const [phone,       setPhone]       = useState(editAg?.phone       ?? "")

  function handleSave() {
    if (!name.trim() || !contactName.trim()) { alert("대행사명과 담당자명은 필수입니다."); return }
    onSave({
      id: editAg?.id ?? Date.now().toString(),
      name, contactName, email, phone,
      corporateName:   editAg?.corporateName,
      businessNumber:  editAg?.businessNumber,
      representative:  editAg?.representative,
      address:         editAg?.address,
      businessType:    editAg?.businessType,
      businessItem:    editAg?.businessItem,
      createdAt:       editAg?.createdAt,
      updatedAt:       new Date().toISOString(),
    } as Agency)
  }

  return (
    <ModalShell open={open} onClose={onClose} title={editAg ? "대행사 수정" : "대행사 추가"} onSave={handleSave}>
      <div className="space-y-4">
        <MF label="대행사명 *">
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </MF>
        <MF label="담당자명 *">
          <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className={inputCls} />
        </MF>
        <MF label="이메일">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
        </MF>
        <MF label="전화번호">
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
        </MF>
      </div>
    </ModalShell>
  )
}
