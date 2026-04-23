"use client"

import { useState, useRef, useCallback } from "react"

function DropZone({
  accept, multiple, onFiles, children,
}: {
  accept: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  children: React.ReactNode
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const items = Array.from(e.dataTransfer.files)
    if (items.length) onFiles(items)
  }, [onFiles])

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors \${
        dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={e => {
          const items = Array.from(e.target.files ?? [])
          if (items.length) onFiles(items)
          e.target.value = ''
        }}
      />
      {children}
    </div>
  )
}

export default DropZone
