"use client"

/**
 * 레거시(참고용) 섹션 collapse 래퍼 — QA 보고서 2026-06-23 (BUG-CT-04/05) 후속.
 *
 * 4 정산 페이지 + ct-ctv/analysis 의 기존 Motiv lifetime / CT+ raw 기반 표는
 * Open API 신규 정산 공식값으로 마이그레이션 완료. 그러나 마감 검토 / 대조를 위해
 * 즉시 제거하지 않고 보존. 기본 접힘으로 무한 로딩·422 에러 노출을 차단한다.
 *
 * 사용:
 *   <LegacyCollapseSection title="..." subtitle="...">
 *     ...기존 섹션 JSX...
 *   </LegacyCollapseSection>
 */

import { useState, type ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  /** 기본값 false (접힘). 펼친 상태가 기본이면 true. */
  defaultOpen?: boolean
  children: ReactNode
}

export function LegacyCollapseSection({ title, subtitle, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/40">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-100/60 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 shrink-0">레거시 · 참고용</span>
          <span className="text-xs font-medium text-gray-700 truncate">{title}</span>
          {subtitle && <span className="text-[11px] text-gray-400 truncate">— {subtitle}</span>}
        </div>
        <span className={`text-gray-400 text-sm shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && (
        <div className="border-t border-gray-200 p-3 bg-white">
          {children}
        </div>
      )}
    </div>
  )
}
