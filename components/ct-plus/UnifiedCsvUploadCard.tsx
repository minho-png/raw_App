"use client"

import { useRef } from "react"

interface Props {
  fileName?: string
  onFileSelect: (file: File) => void
  onRemove: () => void
}

export default function UnifiedCsvUploadCard({ fileName, onFileSelect, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) onFileSelect(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
    e.target.value = ''
  }

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        fileName
          ? 'border-green-300 bg-green-50'
          : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
      } cursor-pointer`}
      onClick={() => !fileName && inputRef.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleChange}
      />

      {fileName ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="max-w-xs truncate text-sm font-medium text-green-700">{fileName}</p>
          <p className="text-xs text-green-500">통합 CSV 업로드 완료</p>
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="mt-1 rounded-md px-3 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            파일 변경
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">통합 CSV 파일 업로드</p>
            <p className="mt-1 text-xs text-gray-400">클릭하거나 파일을 드래그하세요</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-4 py-2 text-left text-xs text-gray-500">
            <p className="font-medium text-gray-600 mb-1">지원 컬럼</p>
            <p>수집일 · 일자 · 매체 · 광고그룹명 · 소재명</p>
            <p>노출 · 클릭 · 총재생 · 비용</p>
          </div>
          <p className="text-[11px] text-gray-500">.csv 형식만 지원</p>
        </div>
      )}
    </div>
  )
}
