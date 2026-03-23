"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

interface SubItem {
  label: string
  href: string
}

interface SubSection {
  label: string
  items: SubItem[]
}

interface NavItem {
  label: string
  sections?: SubSection[]
  items?: SubItem[]
}

const navItems: NavItem[] = [
  {
    label: "정산 리포트",
    items: [
      { label: "매체 비용", href: "/settlement/media-cost" },
      { label: "대행사별 대행수수료", href: "/settlement/agency-fee" },
      { label: "DMP 수수료", href: "/settlement/dmp-fee" },
    ],
  },
  {
    label: "캠페인 리포트",
    sections: [
      {
        label: "CT/CTV",
        items: [
          { label: "데일리 리포트", href: "/campaign/ct-ctv/daily" },
          { label: "종료 리포트", href: "/campaign/ct-ctv/final" },
        ],
      },
      {
        label: "CT+",
        items: [
          { label: "데일리 리포트", href: "/campaign/ct-plus/daily" },
          { label: "종료 리포트", href: "/campaign/ct-plus/final" },
        ],
      },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [openMenus, setOpenMenus] = useState<string[]>([])
  const [openSections, setOpenSections] = useState<string[]>([])

  function toggleMenu(label: string) {
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  function toggleSection(label: string) {
    setOpenSections((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    )
  }

  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-200 bg-white">
      {/* 로고 */}
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="text-sm font-bold text-gray-900">광고 정산 대시보드</p>
        <p className="text-xs text-gray-400 mt-0.5">크로스타겟</p>
      </div>

      {/* 홈 링크 */}
      <div className="px-3 pt-3">
        <Link
          href="/"
          className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
            pathname === "/"
              ? "bg-blue-50 font-medium text-blue-700"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          메인 대시보드
        </Link>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {navItems.map((nav) => (
          <div key={nav.label}>
            {/* 상위 메뉴 버튼 */}
            <button
              onClick={() => toggleMenu(nav.label)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span>{nav.label}</span>
              <svg
                className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                  openMenus.includes(nav.label) ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* 하위 메뉴 */}
            {openMenus.includes(nav.label) && (
              <div className="ml-2 mt-1 space-y-0.5">
                {/* 단순 아이템 목록 */}
                {nav.items?.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                      pathname === item.href
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    }`}
                  >
                    <span className="mr-2 text-gray-300">·</span>
                    {item.label}
                  </Link>
                ))}

                {/* 섹션이 있는 경우 (CT/CTV, CT+) */}
                {nav.sections?.map((section) => (
                  <div key={section.label}>
                    <button
                      onClick={() => toggleSection(section.label)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:bg-gray-50 transition-colors"
                    >
                      <span>{section.label}</span>
                      <svg
                        className={`h-3 w-3 transition-transform duration-200 ${
                          openSections.includes(section.label) ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {openSections.includes(section.label) && (
                      <div className="ml-2 space-y-0.5">
                        {section.items.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                              pathname === item.href
                                ? "bg-blue-50 font-medium text-blue-700"
                                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                            }`}
                          >
                            <span className="mr-2 text-gray-300">·</span>
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  )
}
