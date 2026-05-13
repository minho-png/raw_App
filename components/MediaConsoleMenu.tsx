"use client"

import { useState, useRef, useEffect } from "react"
import { mColor } from "@/lib/mediaColors"

// 매체 운영 콘솔 외부 링크.
// 데스크톱(sm 이상): 가로 5버튼 chip 그룹.
// 모바일: 드롭다운(▾) 으로 자동 컴팩트화 (sm:hidden).
//
// URL 출처 (2026-05-13 공식 사이트 검증):
//   카카오모먼트   moment.kakao.com           (카카오 비즈니스 공식)
//   네이버 GFA     gfa.naver.com              (네이버 광고 API 공식)
//   Google Ads     ads.google.com             (Google 고객센터 공식)
//   Meta Ads       adsmanager.facebook.com    (Meta for Business 공식)
//   CrossTarget   manage.crosstarget.co.kr   (모티브 인텔리전스 공식 광고주 콘솔)

interface ConsoleItem {
  key: string
  label: string
  url: string
  // mediaColors 의 매체명 키와 동일하게 정렬
  colorKey: string
}

const CONSOLES: ReadonlyArray<ConsoleItem> = [
  { key: 'kakao',   label: '카카오모먼트', url: 'https://moment.kakao.com/',          colorKey: '카카오모먼트' },
  { key: 'naver',   label: '네이버 GFA',   url: 'https://gfa.naver.com/',             colorKey: '네이버 GFA'   },
  { key: 'google',  label: 'Google Ads',   url: 'https://ads.google.com/',            colorKey: 'Google'       },
  { key: 'meta',    label: 'Meta Ads',     url: 'https://adsmanager.facebook.com/',   colorKey: 'META'         },
  { key: 'ct',      label: 'CrossTarget',  url: 'https://manage.crosstarget.co.kr/',  colorKey: 'CrossTarget'  },
]

function ExternalIcon() {
  return (
    <svg className="h-2.5 w-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  )
}

function ChipLink({ item }: { item: ConsoleItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${item.label} 운영 콘솔 (새 탭)`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
    >
      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: mColor(item.colorKey) }} />
      <span>{item.label}</span>
      <ExternalIcon />
    </a>
  )
}

export function MediaConsoleMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 닫기 (모바일 드롭다운)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <>
      {/* 데스크톱: 가로 chip 5개 */}
      <div className="hidden lg:flex items-center gap-1.5">
        {CONSOLES.map(c => <ChipLink key={c.key} item={c} />)}
      </div>

      {/* 모바일·태블릿: 드롭다운 */}
      <div ref={ref} className="relative lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          매체 콘솔
          <svg className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute right-0 mt-1.5 w-56 rounded-lg border border-gray-200 bg-white shadow-lg py-1 z-50">
            {CONSOLES.map(item => (
              <a
                key={item.key}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-gray-50"
              >
                <span className="flex items-center gap-2 text-gray-700">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: mColor(item.colorKey) }} />
                  {item.label}
                </span>
                <ExternalIcon />
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
