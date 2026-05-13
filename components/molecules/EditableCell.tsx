"use client"

import { useState } from "react"

// 인라인 편집 가능한 숫자 셀.
// 클릭 → input 편집, Enter/Blur 저장, Escape 취소, disabled 면 텍스트만 표시.
//
// 이전엔 DailyDataTable.tsx 내부 inline 함수였음 (재사용 불가).
// molecule 로 추출하여 다른 표(RAW 편집 그리드 등) 에서도 사용 가능.

interface Props {
  value: number
  onUpdate: (newValue: number) => void
  disabled?: boolean
  /** 표시 포맷터 — 기본 toLocaleString('ko-KR') */
  formatter?: (n: number) => string
  /** 입력 타입 — 기본 'number' */
  inputType?: 'number' | 'text'
  className?: string
}

const defaultFormat = (n: number) => n.toLocaleString('ko-KR')

export function EditableCell({
  value, onUpdate, disabled = false,
  formatter = defaultFormat,
  inputType = 'number',
  className,
}: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState(String(value))

  const commit = () => {
    const num = parseInt(inputValue.replace(/,/g, ''), 10)
    if (!isNaN(num)) onUpdate(num)
    setIsEditing(false)
    setInputValue(String(value))
  }

  const cancel = () => {
    setIsEditing(false)
    setInputValue(String(value))
  }

  if (!isEditing && disabled) {
    return <span className={className}>{formatter(value)}</span>
  }

  if (isEditing) {
    return (
      <input
        type={inputType}
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter')      commit()
          else if (e.key === 'Escape') cancel()
        }}
        autoFocus
        className={className ?? 'w-full border-0 bg-transparent px-0 py-1 text-right text-xs text-gray-700 tabular-nums outline-none ring-1 ring-blue-400 rounded'}
        style={{ fontSize: 'inherit' }}
      />
    )
  }

  return (
    <span
      onClick={() => !disabled && setIsEditing(true)}
      className={className ?? (!disabled ? 'cursor-text hover:bg-blue-50 rounded px-1' : '')}
    >
      {formatter(value)}
    </span>
  )
}
