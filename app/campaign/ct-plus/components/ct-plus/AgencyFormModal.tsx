"use client"
import React, { useState } from "react"
import { Agency } from "@/lib/campaignTypes"
import { MF, inputCls } from "./statusUtils"

export function AgencyFormModal({ 
  open, onClose, editAg, onSave 
}: {
  open: boolean
  onClose: () => void
  editAg: Agency | null
  onSave: (ag: Agency) => void
}) {
  const [name, setName] = useState(editAg?.name ?? "")
  const [contactName, setContactName] = useState(editAg?.contactName ?? "")
  const [email, setEmail] = useState(editAg?.email ?? "")
  const [phone, setPhone] = useState(editAg?.phone ?? "")

  function handleSave() {
    if (!name.trim() || !contactName.trim()) {
      alert("대행사명과 담당자명은 필수입니다.")
      return
    }
    onSave({
      id: editAg?.id ?? Date.now().toString(),
      name, contactName, email, phone,
      corporateName: editAg?.corporateName,
      businessNumber: editAg?.businessNumber,
      representative: editAg?.representative,
      address: editAg?.address,
      businessType: editAg?.businessType,
      businessItem: editAg?.businessItem,
      createdAt: editAg?.createdAt,
      updatedAt: new Date().toISOString(),
    } as Agency)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{editAg ? "대행사 수정" : "대행사 추가"}</h2>
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
        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
          <button onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">저장</button>
        </div>
      </div>
    </div>
  )
}
