"use client"
import React, { useState } from "react"
import { Operator } from "@/lib/campaignTypes"
import { MF, inputCls } from "./statusUtils"

export function OperatorModal({ 
  open, onClose, editOp, operators, onSave 
}: {
  open: boolean
  onClose: () => void
  editOp: Operator | null
  operators: Operator[]
  onSave: (op: Operator) => void
}) {
  const [name, setName] = useState(editOp?.name ?? "")
  const [email, setEmail] = useState(editOp?.email ?? "")
  const [phone, setPhone] = useState(editOp?.phone ?? "")

  function handleSave() {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      alert("모든 항목을 입력하세요.")
      return
    }
    onSave({ id: editOp?.id ?? Date.now().toString(), name, email, phone } as Operator)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">{editOp ? "운영자 수정" : "운영자 추가"}</h2>
        <MF label="운영자명 *">
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </MF>
        <MF label="이메일 *">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
        </MF>
        <MF label="전화 *">
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
