"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

interface SubItem {
  label: string
  href: string
}

// ── CT+ 전용 네비게이션 (7 → 4개로 통합) ────────────────────
// 현황·집행관리·그룹관리 → /status 한 페이지 (탭 전환)
// 리포트 생성·종료 리포트  → /report 한 페이지 (탭 전환)
const CT_PLUS_ITEMS: SubItem[] = [
  { label: "캠페인 현황",    href: "/campaign/ct-plus/status" },
  { label: "데이터 업로드",  href: "/campaign/ct-plus/daily" },
  { label: "데이터 조회",    href: "/campaign/ct-plus/view" },
  { label: "정산 확인",      href: "/campaign/ct-plus/final" },
]

// ── 그 외 메뉴 ────────────────────────────────────────────
const SETTLEMENT_ITEMS: SubItem[] = [
  { label: "대행사별 대행수수료", href: "/settlement/agency-fee" },
  { label: "DMP 수수료",          href: "/settlement/dmp-fee" },
  { label: "매체 비용",           href: "/settlement/media-cost" },
]

const CT_CTV_ITEMS: SubItem[] = [
  { label: "종료 리포트",       href: "/campaign/ct-ctv/final" },
  { label: "CTV 데일리 리포트", href: "/campaign/ct-ctv/daily" },
]

export default function Sidebar() {
  const pathname  = usePathname()
  const router    = useRouter()

  const [ctPlusOpen,    setCtPlusOpen]    = useState(false)
  const [settlementOpen, setSettlementOpen] = useState(false)
  const [ctCtvOpen,     setCtCtvOpen]     = useState(false)
  const [username,      setUsername]      = useState<string | null>(null)
  const [loggingOut,    setLoggingOut]    = useState(false)

  // 현재 경로에 따라 메뉴 자동 열기
  useEffect(() => {
    if (pathname.startsWith('/campaign/ct-plus')) setCtPlusOpen(true)
    if (pathname.startsWith('/settlement'))       setSettlementOpen(true)
    if (pathname.startsWith('/campaign/ct-ctv'))  setCtCtvOpen(true)
  }, [pathname])

  // 세션 사용자명 조회
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then((data: { username?: string } | null) => {
        if (data?.username) setUsername(data.username)
      })
      .catch(() => null)
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.replace('/login')
      router.refresh()
    } finally {
      setLoggingOut(false)
    }
  }

  const linkCls = (href: string) =>
    `flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
      pathname === href
        ? "bg-blue-50 font-medium text-blue-700"
        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
    }`

  const dot = <span className="mr-2 text-gray-500">·</span>

  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-200 bg-white">
      {/* 로고 */}
      <div className="border-b border-gray-100 px-5 py-4 space-y-2">
        <Link href="/">
          <svg viewBox="0 0 112 26" xmlns="http://www.w3.org/2000/svg" className="h-7 w-auto">
            <g>
              <g>
                <path fill="#EF4F23" d="M47,17.292h7.046v1.74h-2.462v6.436h-2.123v-6.436h-2.462L47,17.292L47,17.292z"/>
                <path fill="#EF4F23" d="M57.28,25.468l2.721-8.176h2.925l2.71,8.176h-2.315l-0.491-1.604h-2.738l-0.485,1.604H57.28z M62.333,22.239l-0.841-2.744h-0.068l-0.836,2.744H62.333z"/>
                <path fill="#EF4F23" d="M70.153,17.292h3.477c1.829,0,3.026,1.039,3.026,2.767c0,1.129-0.519,1.926-1.401,2.343l1.671,3.066h-2.337l-1.451-2.721h-0.841v2.721h-2.145L70.153,17.292L70.153,17.292z M73.133,21.064c0.807,0,1.282-0.293,1.276-1.005c0.005-0.722-0.468-1.044-1.276-1.05h-0.836v2.055L73.133,21.064L73.133,21.064z"/>
                <path fill="#EF4F23" d="M85.294,19.054c-1.141,0-1.807,0.853-1.807,2.315c0,1.468,0.621,2.331,1.795,2.337c1.016-0.006,1.547-0.485,1.559-1.243h-1.513v-1.536h3.591v1.118c0,2.224-1.524,3.535-3.659,3.535c-2.372,0-3.98-1.598-3.986-4.19c0.005-2.686,1.773-4.211,3.975-4.211c1.919,0,3.399,1.163,3.579,2.8h-2.179C86.502,19.393,86.011,19.054,85.294,19.054z"/>
                <path fill="#EF4F23" d="M93.695,17.292h5.838v1.74H95.84v1.479h3.387v1.739H95.84v1.479h3.681v1.739h-5.827L93.695,17.292L93.695,17.292z"/>
                <path fill="#EF4F23" d="M104.127,17.292h7.046v1.74h-2.462v6.436h-2.123v-6.436h-2.462L104.127,17.292L104.127,17.292z"/>
              </g>
              <path fill="#1F2353" d="M33.242,1.443c-2.297-0.915-4.811-1.176-7.237-0.741c-2.037,0.349-3.987,1.219-5.591,2.527c-0.563,1.525-1.084,3.006-1.647,4.531c-0.39-0.392-0.823-0.784-1.344-1.089c-0.997,1.743-1.56,3.748-1.647,5.751c-0.087,2.352,0.477,4.705,1.647,6.753c1.56-0.349,3.163-0.697,4.724-1.002c-0.563,1.525-1.127,3.049-1.69,4.574c2.124,1.699,4.811,2.658,7.542,2.744c3.034,0.087,6.111-0.915,8.495-2.876c2.124-1.743,3.597-4.226,4.16-6.883c0.737-3.355,0.043-7.014-1.907-9.846C37.403,3.883,35.453,2.358,33.242,1.443z"/>
              <path fill="#EF4F23" d="M23.447,6.826c-1.56,0.305-3.12,0.653-4.681,0.959c0.13,0.13,0.26,0.305,0.39,0.479c0.607,0.784,1.084,1.699,1.344,2.701c0.347,1.351,0.347,2.788-0.043,4.139c0.303,1.176,0.91,2.222,1.733,3.093c-1.56,0.305-3.163,0.697-4.724,1.002c-1.473,1.002-3.251,1.525-4.984,1.481c-2.167,0-4.377-0.784-5.938-2.352c-1.257-1.263-2.037-3.006-2.167-4.792S4.81,9.92,5.894,8.482c1.3-1.699,3.251-2.788,5.33-3.093c2.124-0.305,4.421,0.087,6.241,1.307c0.477,0.305,0.91,0.697,1.344,1.089c0.563-1.525,1.084-3.006,1.647-4.531c-1.95-1.525-4.334-2.483-6.805-2.658c-2.341-0.218-4.767,0.218-6.891,1.307C4.464,3.036,2.558,4.952,1.387,7.217C0.563,8.829,0.087,10.659,0,12.489v0.959c0.043,2.309,0.78,4.661,2.081,6.578c1.344,2.004,3.337,3.616,5.591,4.488c2.514,1.002,5.33,1.219,7.974,0.566c1.733-0.435,3.38-1.219,4.811-2.352c0.563-1.525,1.171-3.049,1.69-4.574c0.39,0.392,0.823,0.784,1.257,1.089c1.257-2.179,1.821-4.749,1.604-7.275C24.921,10.137,24.357,8.394,23.447,6.826z"/>
            </g>
          </svg>
        </Link>
        <p className="text-xs font-semibold text-gray-700">광고 운영 대시보드</p>
      </div>

      {/* 단독 링크 */}
      <div className="px-3 pt-3 space-y-0.5">
        <Link href="/campaign/ct-ctv/analysis" className={linkCls("/campaign/ct-ctv/analysis")}>
          데이터 분석 대시보드
        </Link>
        <Link href="/mockup" className={
          `flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
            pathname.startsWith("/mockup")
              ? "bg-blue-50 font-medium text-blue-700"
              : "text-gray-600 hover:bg-gray-50"
          }`
        }>
          목업 게재 이미지 생성
        </Link>
      </div>

      {/* ── CT+ 섹션 (시각적 구분) ──────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {/* CT+ 블록 */}
        <div className="rounded-xl overflow-hidden border border-orange-100 bg-orange-50/40">
          <button
            onClick={() => setCtPlusOpen(v => !v)}
            className="flex w-full items-center justify-between px-3 py-2.5"
          >
            <span className="flex items-center gap-1.5">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-orange-500 text-[10px] font-bold text-white">C+</span>
              <span className="text-sm font-semibold text-orange-700">CT+</span>
            </span>
            <svg
              className={`h-4 w-4 text-orange-400 transition-transform duration-200 ${ctPlusOpen ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {ctPlusOpen && (
            <div className="px-1 pb-1.5 space-y-0.5">
              {CT_PLUS_ITEMS.map(item => {
                // 병합된 페이지들도 활성으로 처리
                const isActive =
                  pathname === item.href ||
                  (item.href === "/campaign/ct-plus/status" &&
                    ["/campaign/ct-plus/overview", "/campaign/ct-plus/manage"].some(p => pathname === p)) ||
                  (item.href === "/campaign/ct-plus/report" &&
                    pathname === "/campaign/ct-plus/final")
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? "bg-orange-100 font-medium text-orange-700"
                        : "text-orange-600/80 hover:bg-orange-100/60 hover:text-orange-700"
                    }`}
                  >
                    {dot}{item.label}
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* 정산 리포트 */}
        <div>
          <button
            onClick={() => setSettlementOpen(v => !v)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>정산 리포트</span>
            <svg
              className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${settlementOpen ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {settlementOpen && (
            <div className="ml-2 mt-1 space-y-0.5">
              {SETTLEMENT_ITEMS.map(item => (
                <Link key={item.href} href={item.href} className={linkCls(item.href)}>
                  {dot}{item.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* CT/CTV */}
        <div>
          <button
            onClick={() => setCtCtvOpen(v => !v)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>캠페인 리포트 (CT/CTV)</span>
            <svg
              className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${ctCtvOpen ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {ctCtvOpen && (
            <div className="ml-2 mt-1 space-y-0.5">
              {CT_CTV_ITEMS.map(item => (
                <Link key={item.href} href={item.href} className={linkCls(item.href)}>
                  {dot}{item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* 하단 사용자 영역 */}
      <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="text-xs text-gray-500 truncate">
          {username ? (
            <span className="font-medium text-gray-700">{username}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="로그아웃"
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
