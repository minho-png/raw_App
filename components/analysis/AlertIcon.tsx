"use client"
import { useState } from "react"
import type { AlertMsg } from "./types"

export function AlertIcon({ msgs }: { msgs: AlertMsg[] }) {
  const [show, setShow] = useState(false)
  const criticals = msgs.filter(m => m.kind === 'critical')
  const warns     = msgs.filter(m => m.kind === 'warn')
  const ups       = msgs.filter(m => m.kind === 'up')
  const hasCritical = criticals.length > 0
  const hasWarn     = warns.length > 0

  if (msgs.length === 0) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-50 text-green-500">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    )
  }
  return (
    <span className="relative inline-flex items-center justify-center">
      <button
        type="button"
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
          hasCritical ? 'animate-pulse bg-red-600 text-white hover:bg-red-700'
          : hasWarn   ? 'bg-red-100 text-red-500 hover:bg-red-200'
          : 'bg-blue-100 text-blue-500 hover:bg-blue-200'
        }`}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
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
      {show && (
        <div className="absolute bottom-full right-0 mb-2 z-50 w-60 rounded-lg border border-gray-200 bg-white shadow-lg p-3">
          {criticals.length > 0 && (
            <>
              <p className="text-[11px] font-bold text-red-700 mb-1.5">🚨 광고 미게재 감지</p>
              <div className="space-y-1 mb-2">
                {criticals.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
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
              <p className="text-[11px] font-semibold text-red-600 mb-1.5">이상 감지</p>
              <div className="space-y-1">
                {warns.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
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
          <div className="absolute -bottom-1.5 right-2 w-3 h-3 rotate-45 border-r border-b border-gray-200 bg-white" />
        </div>
      )}
    </span>
  )
}
