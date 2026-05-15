"use client"
import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import type { AlertMsg } from "./types"
import { motivCampaignAdGroupUrl } from "@/lib/motivApi/consoleLinks"

interface Props {
  msgs: AlertMsg[]
  /**
   * 외부 매체 콘솔(crosstarget) 의 캠페인 상세로 이동할 때 사용.
   * 사용자 요청 — 경고 창에서 해당 캠페인으로 바로 이동.
   */
  motivId?: number
  startDate?: string
  endDate?: string
}

export function AlertIcon({ msgs, motivId, startDate, endDate }: Props) {
  const [show, setShow] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  const criticals = msgs.filter(m => m.kind === 'critical')
  const warns     = msgs.filter(m => m.kind === 'warn')
  const ups       = msgs.filter(m => m.kind === 'up')
  const hasCritical = criticals.length > 0
  const hasWarn     = warns.length > 0

  // 팝오버 위치 — table 의 overflow:hidden 으로 잘리던 문제 해결 위해 portal + 절대좌표.
  useEffect(() => {
    if (!show || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({
      top:   r.top + window.scrollY - 6,   // 버튼 위로 6px
      right: window.innerWidth - r.right,
    })
  }, [show])

  if (msgs.length === 0) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 text-emerald-500">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    )
  }

  const externalUrl = motivId
    ? motivCampaignAdGroupUrl({ campaignId: motivId, startDate, endDate })
    : null

  return (
    <span className="relative inline-flex items-center justify-center">
      <button
        ref={btnRef}
        type="button"
        aria-label={`알림 ${msgs.length}건`}
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
          hasCritical ? 'animate-pulse bg-red-600 text-white hover:bg-red-700'
          : hasWarn   ? 'bg-red-100 text-red-500 hover:bg-red-200'
          : 'bg-blue-100 text-blue-500 hover:bg-blue-200'
        }`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
      >
        {(hasCritical || hasWarn) ? (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        )}
      </button>
      {show && pos && typeof window !== 'undefined' && createPortal(
        <div
          className="fixed z-[100] w-72 rounded-xl border border-gray-200 bg-white shadow-2xl p-3 -translate-y-full"
          style={{ top: pos.top, right: pos.right }}
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
        >
          {criticals.length > 0 && (
            <>
              <p className="text-[11px] font-bold text-red-700 mb-1.5">🚨 즉시 확인 필요</p>
              <div className="space-y-1 mb-2">
                {criticals.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0 animate-pulse" />
                    <span>{m.text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {warns.length > 0 && (
            <>
              {criticals.length > 0 && <div className="border-t border-gray-100 my-2" />}
              <p className="text-[11px] font-semibold text-amber-600 mb-1.5">이상 감지</p>
              <div className="space-y-1">
                {warns.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span>{m.text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {ups.length > 0 && (
            <>
              {(criticals.length > 0 || warns.length > 0) && <div className="border-t border-gray-100 my-2" />}
              <p className="text-[11px] font-semibold text-blue-600 mb-1.5">상승 감지</p>
              <div className="space-y-1">
                {ups.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span>{m.text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-gray-700 transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              매체 콘솔에서 캠페인 열기
            </a>
          )}
        </div>,
        document.body,
      )}
    </span>
  )
}
