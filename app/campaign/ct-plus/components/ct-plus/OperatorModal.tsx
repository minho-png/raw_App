"use client"
import React, { useState } from "react"
import { Operator } from "@/lib/campaignTypes"
import { MF, inputCls } from "./statusUtils"
import { ModalShell } from "@/components/atoms/ModalShell"

export function OperatorModal({
  open, onClose, editOp, onSave,
}: {
  open: boolean
  onClose: () => void
  editOp: Operator | null
  operators: Operator[]
  onSave: (op: Operator) => void
}) {
  const [name,  setName]  = useState(editOp?.name  ?? "")
  const [email, setEmail] = useState(editOp?.email ?? "")
  const [phone, setPhone] = useState(editOp?.phone ?? "")

  function handleSave() {
    if (!name.trim() || !email.trim() || !phone.trim()) { alert("모든 항목을 입력하세요."); return }
    onSave({ id: editOp?.id ?? Date.now().toString(), name, email, phone } as Operator)
  }

  return (
    <ModalShell open={open} onClose={onClose} title={editOp ? "운영자 수정" : "운영자 추가"} onSave={handleSave}>
      <div className="space-y-4">
        <MF label="운영자명 *">
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
        </MF>
        <MF label="이메일 *">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
        </MF>
        <MF label="전화 *">
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
        </MF>
      </div>
    </ModalShell>
  )
}
