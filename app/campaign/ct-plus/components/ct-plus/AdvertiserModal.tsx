"use client"
import React, { useState } from "react"
import { Advertiser, Agency } from "@/lib/campaignTypes"
import { MF, inputCls } from "./statusUtils"
import { ModalShell } from "@/components/atoms/ModalShell"

const MAX_PDF_SIZE = 10 * 1024 * 1024 // 10MB

export function AdvertiserModal({
  open, onClose, editAdv, agencies, onSave,
}: {
  open: boolean
  onClose: () => void
  editAdv: Advertiser | null
  agencies: Agency[]
  onSave: (adv: Advertiser) => void
}) {
  const [name,              setName]              = useState(editAdv?.name              ?? "")
  const [agencyId,          setAgencyId]          = useState(editAdv?.agencyId          ?? "")
  const [contactName,       setContactName]       = useState(editAdv?.contactName       ?? "")
  const [email,             setEmail]             = useState(editAdv?.email             ?? "")
  const [phone,             setPhone]             = useState(editAdv?.phone             ?? "")
  const [corporateName,     setCorporateName]     = useState(editAdv?.corporateName     ?? "")
  const [businessNumber,    setBusinessNumber]    = useState(editAdv?.businessNumber    ?? "")
  const [representative,    setRepresentative]    = useState(editAdv?.representative    ?? "")
  const [address,           setAddress]           = useState(editAdv?.address           ?? "")
  const [businessType,      setBusinessType]      = useState(editAdv?.businessType      ?? "")
  const [businessItem,      setBusinessItem]      = useState(editAdv?.businessItem      ?? "")
  const [defaultMarkupRate, setDefaultMarkupRate] = useState(editAdv?.defaultMarkupRate?.toString() ?? "")
  const [pdfBase64,         setPdfBase64]         = useState<string | undefined>(editAdv?.registrationPdfBase64)
  const [pdfName,           setPdfName]           = useState<string | undefined>(editAdv?.registrationPdfName)
  const [analyzing,         setAnalyzing]         = useState(false)
  const [analyzeToast,      setAnalyzeToast]      = useState<string | null>(null)

  async function analyzePdf(file: File) {
    setAnalyzing(true)
    setAnalyzeToast(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/v1/agencies/analyze-pdf', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('분석 실패')
      const { fields } = await res.json()
      if (fields) {
        if (fields.corporateName)  setCorporateName(fields.corporateName)
        if (fields.businessNumber) setBusinessNumber(fields.businessNumber)
        if (fields.representative) setRepresentative(fields.representative)
        if (fields.address)        setAddress(fields.address)
        if (fields.businessType)   setBusinessType(fields.businessType)
        if (fields.businessItem)   setBusinessItem(fields.businessItem)
        setAnalyzeToast('자동 분석 완료 — 내용을 확인하고 저장하세요')
      } else {
        setAnalyzeToast('추출된 필드가 없습니다. 직접 입력해주세요.')
      }
    } catch {
      setAnalyzeToast('분석 중 오류가 발생했습니다')
    } finally {
      setAnalyzing(false)
      setTimeout(() => setAnalyzeToast(null), 5000)
    }
  }

  async function handlePdfChange(file: File | null) {
    if (!file) { setPdfBase64(undefined); setPdfName(undefined); return }
    if (file.size > MAX_PDF_SIZE) {
      alert(`PDF 파일은 10MB 이하만 가능합니다. 현재: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
      return
    }
    const buf = await file.arrayBuffer()
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
    setPdfBase64(b64)
    setPdfName(file.name)
    analyzePdf(file)
  }

  function handleSave() {
    if (!name.trim() || !agencyId) { alert("광고주명과 대행사는 필수입니다."); return }
    const saved: Advertiser = {
      id: editAdv?.id ?? Date.now().toString(),
      name, agencyId,
      contactName: contactName || undefined,
      email: email || undefined,
      phone: phone || undefined,
      corporateName: corporateName || undefined,
      businessNumber: businessNumber || undefined,
      representative: representative || undefined,
      address: address || undefined,
      businessType: businessType || undefined,
      businessItem: businessItem || undefined,
      defaultMarkupRate: defaultMarkupRate ? parseFloat(defaultMarkupRate) : undefined,
      registrationPdfBase64: pdfBase64,
      registrationPdfName: pdfName,
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
      maxWidth="2xl"
      scrollable
    >
      <div className="space-y-6">
        {/* 기본 정보 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">기본 정보</h3>
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
          </div>
        </section>

        {/* 세금계산서 정보 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">세금계산서 정보</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <MF label="법인명">
                <input type="text" value={corporateName} onChange={e => setCorporateName(e.target.value)} className={inputCls} />
              </MF>
              <MF label="사업자등록번호">
                <input type="text" value={businessNumber} onChange={e => setBusinessNumber(e.target.value)} className={inputCls} placeholder="000-00-00000" />
              </MF>
            </div>
            <MF label="대표자명">
              <input type="text" value={representative} onChange={e => setRepresentative(e.target.value)} className={inputCls} />
            </MF>
            <MF label="주소">
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
            </MF>
            <div className="grid grid-cols-2 gap-4">
              <MF label="업태">
                <input type="text" value={businessType} onChange={e => setBusinessType(e.target.value)} className={inputCls} />
              </MF>
              <MF label="종목">
                <input type="text" value={businessItem} onChange={e => setBusinessItem(e.target.value)} className={inputCls} />
              </MF>
            </div>
          </div>
        </section>

        {/* 정산 정책 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">정산 정책</h3>
          <MF label="기본 대행수수료율 (%)">
            <input type="number" value={defaultMarkupRate} onChange={e => setDefaultMarkupRate(e.target.value)} className={inputCls} placeholder="10" min="0" step="0.1" />
          </MF>
        </section>

        {/* 사업자등록증 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">사업자등록증</h3>
          <div className="space-y-3">
            {pdfBase64 && pdfName && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-700"><span className="font-medium">현재 파일:</span> {pdfName}</p>
                <a
                  href={`data:application/pdf;base64,${pdfBase64}`}
                  download={pdfName}
                  className="text-xs text-green-600 hover:text-green-700 mt-1 block"
                >다운로드</a>
              </div>
            )}
            <MF label="PDF 파일 (10MB 이하)">
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={e => handlePdfChange(e.target.files?.[0] ?? null)}
                className={inputCls}
              />
            </MF>
            {analyzing && <p className="text-xs text-purple-600">PDF 분석 중...</p>}
            {analyzeToast && (
              <p className={`text-xs ${analyzeToast.includes('오류') ? 'text-red-600' : 'text-purple-700'}`}>
                {analyzeToast}
              </p>
            )}
          </div>
        </section>
      </div>
    </ModalShell>
  )
}
