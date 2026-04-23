"use client"
import React from "react"
import { Agency } from "@/lib/campaignTypes"

export function AgencyListTab({ 
  agencies, onEdit, onDelete 
}: {
  agencies: Agency[]
  onEdit: (ag: Agency) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      {agencies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
          <p className="text-sm text-gray-500">대행사가 없습니다.</p>
        </div>
      ) : (
        agencies.map(ag => (
          <div key={ag.id} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">{ag.name}</h3>
                <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-600">
                  <div><span className="text-gray-500">담당자:</span> {ag.contactName}</div>
                  <div><span className="text-gray-500">이메일:</span> {ag.email}</div>
                  <div><span className="text-gray-500">전화:</span> {ag.phone}</div>
                  {ag.defaultMarkupRate !== undefined && <div><span className="text-gray-500">기본수수료:</span> {ag.defaultMarkupRate}%</div>}
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-shrink-0">
                {ag.registrationPdfBase64 && ag.registrationPdfName && (
                  <a href={`data:application/pdf;base64,${ag.registrationPdfBase64}`} download={ag.registrationPdfName}
                    className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors text-center">
                    📄 PDF
                  </a>
                )}
                <button onClick={() => onEdit(ag)} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">수정</button>
                <button onClick={() => onDelete(ag.id)} className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">삭제</button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
