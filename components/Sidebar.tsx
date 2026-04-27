"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
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
      { label: "Motiv 캠페인 리스트",   href: "/campaign/ct/motiv-campaigns" },
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
      { label: "계산서 발급",      href: "/campaign/ct-plus/final" },
      { label: "매입/매출 확인",   href: "/settlement/sales-purchase" },
      { label: "대행사별 수수료",  href: "/settlement/agency-fee" },
      { label: "DMP 수수료",       href: "/settlement/dmp-fee" },
      { label: "매체 비용",        href: "/settlement/media-cost" },
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
          <Image
            src="/CrossTarget_BI.png"
            alt="CrossTarget"
            width={140}
            height={36}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
        <p className="text-xs font-semibold text-gray-700">광고 운영 대시보드</p>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* 거래처 관리 — 모든 섹션 상단 단독 링크 (입체 호버 효과) */}
        <Link
          href="/manage"
          className={`group mb-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
            pathname === "/manage" || pathname === "/management"
              ? "bg-gradient-to-r from-indigo-500 to-blue-600 text-white"
              : "bg-white text-gray-700 border border-gray-200 hover:border-indigo-300 hover:text-indigo-700"
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zm0 0V5a2 2 0 00-2-2H6a2 2 0 00-2 2v2" />
            </svg>
            거래처 관리
          </span>
        </Link>

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
                    {group.items.filter(item => !item.badge).map(item => (
                      <Link key={item.href} href={item.href} className={linkCls(item.href)}>
                        <span className="flex items-center min-w-0">
                          {dot}
                          <span className="truncate">{item.label}</span>
                        </span>
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
