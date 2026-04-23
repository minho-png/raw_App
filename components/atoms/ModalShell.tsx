import React from "react"

type MaxWidth = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl"

const MAX_W: Record<MaxWidth, string> = {
  sm:  "max-w-sm",
  md:  "max-w-md",
  lg:  "max-w-lg",
  xl:  "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
}

interface ModalShellProps {
  open: boolean
  onClose: () => void
  title: string
  /** footer의 주 액션 버튼 클릭 핸들러. 없으면 footer 미표시 */
  onSave?: () => void
  saveLabel?: string
  /** 저장 버튼 비활성화 */
  saveDisabled?: boolean
  maxWidth?: MaxWidth
  /** 스크롤 필요한 큰 모달에 사용 */
  scrollable?: boolean
  children: React.ReactNode
}

/**
 * ModalShell — 재사용 가능한 모달 껍데기 atom
 *
 * 제공 기능:
 *   - 반투명 backdrop overlay
 *   - 흰색 패널 (maxWidth 조절 가능)
 *   - 상단 title
 *   - 하단 취소/저장 버튼 (onSave 없으면 미표시)
 *   - 내부 스크롤 (scrollable=true)
 *
 * 사용 예:
 *   <ModalShell open={open} onClose={onClose} title="광고주 추가" onSave={handleSave}>
 *     <FormFields ... />
 *   </ModalShell>
 */
export function ModalShell({
  open,
  onClose,
  title,
  onSave,
  saveLabel = "저장",
  saveDisabled = false,
  maxWidth = "sm",
  scrollable = false,
  children,
}: ModalShellProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={[
          "bg-white rounded-xl shadow-xl w-full p-6 space-y-4",
          MAX_W[maxWidth],
          scrollable ? "max-h-[90vh] overflow-y-auto" : "",
        ].join(" ")}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="닫기"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div>{children}</div>

        {/* 푸터 */}
        {onSave && (
          <div className="flex gap-2 justify-end pt-4 border-t border-gray-100">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={onSave}
              disabled={saveDisabled}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saveLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
