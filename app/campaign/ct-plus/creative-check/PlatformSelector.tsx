"use client"

import { Platform } from "@/lib/adSpecs"

const PLATFORM_INFO: { key: Platform; label: string; color: string }[] = [
  { key: 'kakao', label: '카카오모먼트', color: 'text-yellow-600' },
  { key: 'naver', label: '네이버 GFA', color: 'text-green-600' },
  { key: 'google', label: '구글 GDN', color: 'text-blue-600' },
  { key: 'meta', label: 'META', color: 'text-blue-500' },
]

export function PlatformSelector({ platform, onChange }: { platform: Platform; onChange: (p: Platform) => void }) {
  return (
    <div className="mb-6 flex gap-2 border-b border-gray-200 pb-4">
      {PLATFORM_INFO.map(p => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors \${
            platform === p.key
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
