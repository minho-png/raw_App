"use client"
import React, { useState } from "react"
import { Agency } from "@/lib/campaignTypes"
import { inputCls, MF } from "./statusUtils"

export function AgencyEditTab({ agency, agencies: _agencies, onSave, onCancel }: {
  agency: Agency | null
  agencies: Agency[]
  onSave: (ag: Agency) => void
  onCancel: () => void
}) {
  const [name,                setName]                = useState(agency?.name ?? "")
  const [contactName,         setContactName]         = useState(agency?.contactName ?? "")
  const [email,               setEmail]               = useState(agency?.email ?? "")
  const [phone,               setPhone]               = useState(agency?.phone ?? "")
  const [corporateName,       setCorporateName]       = useState(agency?.corporateName ?? "")
  const [businessNumber,      setBusinessNumber]      = useState(agency?.businessNumber ?? "")
  const [representative,      setRepresentative]      = useState(agency?.representative ?? "")
  const [address,             setAddress]             = useState(agency?.address ?? "")
  const [businessType,        setBusinessType]        = useState(agency?.businessType ?? "")
  const [businessItem,        setBusinessItem]        = useState(agency?.businessItem ?? "")
  const [defaultMarkupRate,   setDefaultMarkupRate]   = useState(agency?.defaultMarkupRate?.toString() ?? "")
  const [pdfFile,             setPdfFile]             = useState<File | null>(null)
  const [uploading,           setUploading]           = useState(false)
  const [analyzing,           setAnalyzing]           = useState(false)
  const [analyzeToast,        setAnalyzeToast]        = useState<string | null>(null)

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
        if (fields.corporateName) setCorporateName(fields.corporateName)
        if (fields.businessNumber) setBusinessNumber(fields.businessNumber)
        if (fields.representative) setRepresentative(fields.representative)
        if (fields.address) setAddress(fields.address)
        if (fields.businessType) setBusinessType(fields.businessType)
        if (fields.businessItem) setBusinessItem(fields.businessItem)
        setAnalyzeToast('자동 분석 완료 — 내용을 확인하고 저장하세요')
      } else {
        setAnalyzeToast('추출된 필드가 없습니다. 직접 입력해주세요.')
      }
    } catch (err) {
      console.error(err)
      setAnalyzeToast('분석 중 오류가 발생했습니다')
    } finally {
      setAnalyzing(false)
      setTimeout(() => setAnalyzeToast(null), 5000)
    }
  }

  function handleAnalyzePdf() { if (pdfFile) analyzePdf(pdfFile) }

  function handleSave() {
    if (!name.trim() || !contactName.trim()) {
      alert("대행사명과 담당자명은 필수입니다.")
      return
    }
    const saved: Agency = {
      id: agency?.id ?? Date.now().toString(),
      name,
      contactName,
      email,
      phone,
      corporateName: corporateName || undefined,
      businessNumber: businessNumber || undefined,
      representative: representative || undefined,
      address: address || undefined,
      businessType: businessType || undefined,
      businessItem: businessItem || undefined,
      defaultMarkupRate: defaultMarkupRate ? parseFloat(defaultMarkupRate) : undefined,
      registrationPdfBase64: agency?.registrationPdfBase64,
      registrationPdfName: agency?.registrationPdfName,
      createdAt: agency?.createdAt,
      updatedAt: new Date().toISOString() }

    if (pdfFile) {
      // PDF 선택 시: 업로드 후 저장 (신규/기존 모두)
      handlePdfUpload(saved)
    } else {
      onSave(saved)
    }
  }

  async function handlePdfUpload(ag: Agency) {
    if (!pdfFile || !ag.id) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", pdfFile)
      formData.append("agencyId", ag.id)
      const res = await fetch("/api/v1/agencies/upload-pdf", { method: "POST", body: formData })
      if (!res.ok) throw new Error("PDF 업로드 실패")
      const { pdfBase64, pdfName } = await res.json()
      onSave({ ...ag, registrationPdfBase64: pdfBase64, registrationPdfName: pdfName })
    } catch (err) {
      alert("PDF 업로드 중 오류가 발생했습니다.")
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{agency ? "대행사 정보 수정" : "새 대행사 추가"}</h2>
        </div>

        {/* 기본 정보 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">기본 정보</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <MF label="대행사명 *">
                <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="ex) OO 에이전시" />
              </MF>
              <MF label="담당자명 *">
                <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} className={inputCls} placeholder="담당자 이름" />
              </MF>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <MF label="이메일">
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="email@example.com" />
              </MF>
              <MF label="전화번호">
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="010-0000-0000" />
              </MF>
            </div>
          </div>
        </section>

        {/* 세금계산서 정보 */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">세금계산서 정보</h3>
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
          <h3 className="text-sm font-semibold text-gray-900 mb-4">정산 정책</h3>
          <div className="space-y-3">
            <MF label="기본 대행수수료율 (%)">
              <input type="number" value={defaultMarkupRate} onChange={e => setDefaultMarkupRate(e.target.value)} className={inputCls} placeholder="10" min="0" step="0.1" />
            </MF>
          </div>
        </section>

        {/* 사업자등록증 PDF */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">사업자등록증</h3>
          <div className="space-y-3">
            {agency?.registrationPdfBase64 && agency?.registrationPdfName && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-700">
                  <span className="font-medium">현재 파일:</span> {agency.registrationPdfName}
                </p>
                <a href={`data:application/pdf;base64,${agency.registrationPdfBase64}`} download={agency.registrationPdfName}
                  className="text-xs text-green-600 hover:text-green-700 mt-1 block">
                  다운로드
                </a>
              </div>
            )}
            <MF label="PDF 파일">
              <input type="file" accept=".pdf" onChange={e => {
                const file = e.target.files?.[0] ?? null
                setPdfFile(file)
                if (file) analyzePdf(file)  // 파일 선택 즉시 자동 분석
              }} className={inputCls} />
            </MF>
            {pdfFile && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAnalyzePdf}
                  disabled={analyzing}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analyzing ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      분석 중...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.5 3.5 0 00-1.043 2.31v.133a1 1 0 01-1 1H9.92a1 1 0 01-1-1v-.133c0-.895-.356-1.754-.988-2.386l-.347-.347z" />
                      </svg>
                      PDF 자동 분석
                    </>
                  )}
                </button>
                {analyzeToast && (
                  <span className={`text-sm font-medium ${analyzeToast.includes('오류') ? 'text-red-600' : 'text-purple-700'}`}>
                    {analyzeToast}
                  </span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 액션 */}
        <div className="flex gap-2 justify-end pt-4 border-t border-gray-200">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">취소</button>
          <button onClick={handleSave} disabled={uploading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:bg-gray-400">{uploading ? "업로드 중..." : "저장"}</button>
        </div>
      </div>
    </div>
  )
}