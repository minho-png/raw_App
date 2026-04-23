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
}: {
  platform: Platform
  onPlatformChange: (p: Platform) => void
  productId: string
  onProductChange: (id: string) => void
}) {
  const products: AdProduct[] = getProducts(platform)

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
          {products.map(prod => (
            <button
              key={prod.id}
              onClick={() => onProductChange(prod.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                productId === prod.id
                  ? 'border-blue-400 bg-blue-600 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {prod.name}
              <span className={`ml-1.5 text-[9px] font-normal opacity-70 ${productId === prod.id ? 'text-blue-100' : 'text-gray-400'}`}>
                {prod.mediaType === 'image' ? '이미지' : prod.mediaType === 'video' ? '동영상' : '이미지+동영상'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
