"use client"

import { useRef, useState } from "react"
import type { MediaType } from "@/lib/reportTypes"
import { MEDIA_CONFIG } from "@/lib/reportTypes"

interface Props {
  media: MediaType
  fileName?: string
  onFileSelect: (file: File) => void
  onRemove: () => void
}

export default function MediaUploadCard({ media, fileName, onFileSelect, onRemove }: Props) {
  const config = MEDIA_CONFIG[media]
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext ?? '')) {
      alert('Excel(.xlsx, .xls) 또는 CSV 파일만 업로드 가능합니다.')
      return
    }
    onFileSelect(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div
      className={`relative rounded-xl border-2 transition-all ${
        dragging ? 'border-blue-400 bg-blue-50' : fileName ? 'border-green-400 bg-green-50' : 'border-dashed border-gray-200 bg-white hover:border-gray-300'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* 미디어 헤더 */}
      <div
        className="flex items-center gap-2 rounded-t-xl px-4 py-2.5"
        style={{ backgroundColor: config.bgColor, borderBottom: `1px solid ${config.borderColor}` }}
      >
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        <span className="text-sm font-semibold text-gray-800">{config.label}</span>
      </div>

      {/* 업로드 영역 */}
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
        {fileName ? (
          <>
            <svg className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="max-w-full truncate text-xs font-medium text-gray-700">{fileName}</p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => inputRef.current?.click()}
                className="rounded-md bg-white px-3 py-1 text-xs border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                교체
              </button>
              <button
                onClick={onRemove}
                className="rounded-md bg-white px-3 py-1 text-xs border border-red-200 text-red-500 hover:bg-red-50"
              >
                삭제
              </button>
            </div>
          </>
        ) : (
          <>
            <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xs text-gray-400">파일을 드래그하거나</p>
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-md px-4 py-1.5 text-xs font-medium text-white transition-colors"
              style={{ backgroundColor: config.color }}
            >
              파일 선택
            </button>
            <p className="text-[10px] text-gray-300">.xlsx / .xls / .csv</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
