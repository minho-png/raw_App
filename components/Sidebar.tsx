"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

interface SubItem {
  label: string
  href: string
  badge?: string  // optional "준비중" 배지
}

interface MenuGroup {
  title: string
  items: SubItem[]
}

interface Section {
  key: string
  label: string
  color: string   // tailwind text color class
  groups: MenuGroup[]
}

// ── CT+ ────────────────────────────────────────────────
const CT_PLUS_SECTIONS: MenuGroup[] = [
  {
    title: "CT+",
    items: [
      { label: "캠페인 세팅 내역 검수", href: "/campaign/ct-plus/creative-check" },
      { label: "게재 목업 데이터 생성",  href: "/mockup" },
      { label: "리포트 데이터 업로드",   href: "/campaign/ct-plus/daily" },
      { label: "캠페인 현황",            href: "/campaign/ct-plus/status" },
      { label: "데일리 리포트",          href: "/campaign/ct-plus/daily-report", badge: "준비중" },
    ],
  },
]

// ── CT ────────────────────────────────────────────────
const CT_SECTIONS: MenuGroup[] = [
  {
    title: "CT",
    items: [
      { label: "캠페인 세팅 내역 검수", href: "/campaign/ct/check",  badge: "준비중" },
      { label: "캠페인 현황",           href: "/campaign/ct/status", badge: "준비중" },
    ],
  },
]

// ── CT TV ─────────────────────────────────────────────
const CTTV_SECTIONS: MenuGroup[] = [
  {
    title: "CT TV",
    items: [
      { label: "캠페인 세팅 내역 검수", href: "/campaign/ct-ctv/check",    badge: "준비중" },
      { label: "캠페인 현황",           href: "/campaign/ct-ctv/analysis" },
    ],
  },
]

// ── 정산/수익분석 ──────────────────────────────────────
const SETTLEMENT_SECTIONS: MenuGroup[] = [
  {
    title: "정산/수익분석",
    items: [
      { label: "정산 확인",       href: "/campaign/ct-plus/final" },
      { label: "대행사별 수수료", href: "/settlement/agency-fee" },
      { label: "DMP 수수료",      href: "/settlement/dmp-fee" },
      { label: "매체 비용",       href: "/settlement/media-cost" },
    ],
  },
]

const ALL_SECTIONS: Section[] = [
  { key: "ctplus",     label: "CT+",         color: "text-orange-500", groups: CT_PLUS_SECTIONS },
  { key: "ct",         label: "CT",          color: "text-blue-500",   groups: CT_SECTIONS },
  { key: "cttv",       label: "CT TV",       color: "text-indigo-500", groups: CTTV_SECTIONS },
  { key: "settlement", label: "정산/수익분석", color: "text-green-600",  groups: SETTLEMENT_SECTIONS },
]

// 관리 메뉴 (최하단 공통)
const MGMT_ITEM: SubItem = { label: "광고주·대행사·운영자 관리", href: "/management" }

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [username,   setUsername]   = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  // 현재 경로에 따라 해당 그룹 자동 열기
  useEffect(() => {
    const next: Record<string, boolean> = {}
    ALL_SECTIONS.forEach(sec =>
      sec.groups.forEach(g => {
        if (g.items.some(item => pathname.startsWith(item.href.split("/").slice(0, 3).join("/")))) {
          next[g.title] = true
        }
      })
    )
    setOpenGroups(next)
  }, [pathname])

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then((data: { username?: string } | null) => { if (data?.username) setUsername(data.username) })
      .catch(() => null)
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      router.replace("/login")
      router.refresh()
    } finally {
      setLoggingOut(false)
    }
  }

  const toggleGroup = (title: string) =>
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }))

  const linkCls = (href: string) =>
    `flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
      pathname === href
        ? "bg-blue-50 font-medium text-blue-700"
        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
    }`

  const dot = <span className="mr-2 text-gray-300 flex-shrink-0">·</span>

  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-200 bg-white">
      {/* 로고 */}
      <div className="border-b border-gray-100 px-5 py-4 space-y-2 flex-shrink-0">
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

      {/* 메뉴 */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {ALL_SECTIONS.map(sec => (
          <div key={sec.key}>
            {/* 섹션 레이블 */}
            <p className={`px-3 pb-1 text-[10px] font-bold uppercase tracking-widest ${sec.color}`}>
              {sec.label}
            </p>

            {sec.groups.map(group => (
              <div key={group.title}>
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>{group.title}</span>
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                      openGroups[group.title] ? "rotate-180" : ""
                    }`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openGroups[group.title] && (
                  <div className="ml-2 mt-0.5 space-y-0.5">
                    {group.items.map(item => (
                      <Link key={item.href} href={item.href} className={linkCls(item.href)}>
                        <span className="flex items-center min-w-0">
                          {dot}
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badge && (
                          <span className="ml-1.5 flex-shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-400">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>

      {/* 최하단 공통 관리 */}
      <div className="border-t border-gray-100 px-3 py-2">
        <Link
          href={MGMT_ITEM.href}
          className={`flex items-center rounded-lg px-3 py-2 text-xs transition-colors ${
            pathname === MGMT_ITEM.href
              ? "bg-blue-50 font-medium text-blue-700"
              : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          }`}
        >
          <svg className="mr-2 h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {MGMT_ITEM.label}
        </Link>
      </div>

      {/* 사용자 영역 */}
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
