"use client"
import React, { useState } from "react"
import { Advertiser, Agency } from "@/lib/campaignTypes"
import { MF, inputCls } from "./statusUtils"
import { ModalShell } from "@/components/atoms/ModalShell"
import { genId } from "@/lib/idGen"

export function AdvertiserModal({
  open, onClose, editAdv, agencies, onSave,
}: {
  open: boolean
  onClose: () => void
  editAdv: Advertiser | null
  agencies: Agency[]
  onSave: (adv: Advertiser) => void
}) {
  const [name,        setName]        = useState(editAdv?.name        ?? "")
  const [agencyId,    setAgencyId]    = useState(editAdv?.agencyId    ?? "")
  const [contactName, setContactName] = useState(editAdv?.contactName ?? "")
  const [email,       setEmail]       = useState(editAdv?.email       ?? "")
  const [phone,       setPhone]       = useState(editAdv?.phone       ?? "")

  function handleSave() {
    if (!name.trim() || !agencyId) { alert("광고주명과 대행사는 필수입니다."); return }
    // 세금계산서·정산·사업자등록증 PDF 는 대행사 단위로 관리하므로 광고주에서는 보존만 함.
    const saved: Advertiser = {
      id: editAdv?.id ?? genId(),
      name,
      agencyId,
      contactName: contactName || undefined,
      email:       email       || undefined,
      phone:       phone       || undefined,
      corporateName:         editAdv?.corporateName,
      businessNumber:        editAdv?.businessNumber,
      representative:        editAdv?.representative,
      address:               editAdv?.address,
      businessType:          editAdv?.businessType,
      businessItem:          editAdv?.businessItem,
      defaultMarkupRate:     editAdv?.defaultMarkupRate,
      registrationPdfBase64: editAdv?.registrationPdfBase64,
      registrationPdfName:   editAdv?.registrationPdfName,
      createdAt: editAdv?.createdAt,
      updatedAt: new Date().toISOString(),
    }
    onSave(saved)
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={editAdv ? "광고주 수정" : "광고주 추가"}
      onSave={handleSave}
      maxWidth="md"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <MF label="광고주명 *">
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="ex) OO 브랜드" />
          </MF>
          <MF label="대행사 *">
            <select value={agencyId} onChange={e => setAgencyId(e.target.value)} className={inputCls}>
              <option value="">선택하세요</option>
              {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </MF>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <MF label="담당자명">
            <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className={inputCls} placeholder="담당자 이름" />
          </MF>
          <MF label="전화번호">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="010-0000-0000" />
          </MF>
        </div>
        <MF label="이메일">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="email@example.com" />
        </MF>
        <p className="text-[11px] text-gray-400 pt-1">
          세금계산서·정산 정책·사업자등록증은 대행사 단위로 관리합니다.
        </p>
      </div>
    </ModalShell>
  )
}
