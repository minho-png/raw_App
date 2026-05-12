"use client"

import { Platform, AdProduct, getProducts } from "@/lib/adSpecs"

const PLATFORM_INFO: { key: Platform; label: string; color: string; bg: string }[] = [
  { key: 'kakao',  label: '카카오모먼트', color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-300' },
  { key: 'naver',  label: '네이버 GFA',   color: 'text-green-700',  bg: 'bg-green-50 border-green-300'  },
  { key: 'google', label: '구글',          color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-300'    },
  { key: 'meta',   label: 'Meta',          color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-300'},
]

export function PlatformSelector({
  platform, onPlatformChange,
  productId, onProductChange,
  activeMediaType,
}: {
  platform: Platform
  onPlatformChange: (p: Platform) => void
  productId: string
  onProductChange: (id: string) => void
  // 'image' | 'video' 지정 시 호환되지 않는 상품은 비활성화 (QA BUG-003/005).
  activeMediaType?: 'image' | 'video'
}) {
  const products: AdProduct[] = getProducts(platform)
  const isCompat = (p: AdProduct) =>
    !activeMediaType || p.mediaType === 'both' || p.mediaType === activeMediaType

  return (
    <div className="space-y-3 mb-4">
      {/* 매체 선택 */}
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">매체 선택</p>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_INFO.map(p => (
            <button
              key={p.key}
              onClick={() => onPlatformChange(p.key)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                platform === p.key
                  ? `${p.bg} ${p.color} shadow-sm`
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 상품 선택 */}
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">광고 상품 선택</p>
        <div className="flex flex-wrap gap-2">
          {products.map(prod => {
            const compat   = isCompat(prod)
            const selected = productId === prod.id && compat
            return (
              <button
                key={prod.id}
                onClick={() => compat && onProductChange(prod.id)}
                disabled={!compat}
                title={compat ? undefined
                  : `${activeMediaType === 'video' ? '동영상' : '이미지'} 탭에서는 지원되지 않는 상품입니다`}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  !compat
                    ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed opacity-60'
                    : selected
                      ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {prod.name}
                <span className={`ml-1.5 text-[9px] font-normal ${
                  !compat ? 'text-gray-300' : selected ? 'text-blue-100' : 'text-gray-400'
                }`}>
                  {prod.mediaType === 'image' ? '이미지' : prod.mediaType === 'video' ? '동영상' : '이미지+동영상'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
