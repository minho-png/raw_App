"use client"
import React, { useState } from "react"
import { Operator } from "@/lib/campaignTypes"
import { MF, inputCls } from "./statusUtils"
import { ModalShell } from "@/components/atoms/ModalShell"
import { genId } from "@/lib/idGen"

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

  // QA UX-017: '010' 한 자리만 저장되던 케이스 차단 — 010-XXXX-XXXX 형식 강제.
  const PHONE_RE = /^01[0-9]-?\d{3,4}-?\d{4}$/
  const phoneValid = PHONE_RE.test(phone.trim())

  function handleSave() {
    if (!name.trim() || !email.trim() || !phone.trim()) { alert("모든 항목을 입력하세요."); return }
    if (!phoneValid) { alert("전화번호 형식이 올바르지 않습니다. 예: 010-0000-0000"); return }
    onSave({ id: editOp?.id ?? genId(), name, email, phone } as Operator)
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
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="010-0000-0000"
            className={`${inputCls} ${phone && !phoneValid ? 'border-red-300 focus:ring-red-400' : ''}`}
          />
          {phone && !phoneValid && (
            <p className="mt-1 text-[11px] text-red-600">형식 예: 010-0000-0000</p>
          )}
        </MF>
      </div>
    </ModalShell>
  )
}
