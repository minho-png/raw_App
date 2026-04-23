"use client"

import { AdProduct, ProductImageSpec, ProductVideoSpec, formatFileSize } from "@/lib/adSpecs"

function SpecTable({ product }: { product: AdProduct }) {
  const hasImage = product.imageSpecs.length > 0
  const hasVideo = product.videoSpecs.length > 0

  return (
    <div className="space-y-2">
      {hasImage && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">규격</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">크기</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">파일 형식</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">용량</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {product.imageSpecs.map((spec: ProductImageSpec, i: number) => (
                <tr key={i} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{spec.label}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-700">
                    {spec.sizeMode === 'exact'
                      ? `${spec.minWidth}×${spec.minHeight}px`
                      : `${spec.minWidth}×${spec.minHeight}px 이상`}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {spec.allowedFormats.map(f => (
                        <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 uppercase">{f}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 tabular-nums">
                    {spec.minFileSizeBytes
                      ? `${formatFileSize(spec.minFileSizeBytes)} ~ ${formatFileSize(spec.maxFileSizeBytes)}`
                      : `${formatFileSize(spec.maxFileSizeBytes)} 이하`}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 max-w-[200px]">
                    {spec.transparentRequired && <span className="text-purple-600 font-medium">투명배경 필수 · </span>}
                    {spec.transparentForbidden && <span className="text-orange-500 font-medium">투명배경 불가 · </span>}
                    {spec.note ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasVideo && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">규격</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">최소 해상도</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">파일 형식</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">용량</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">재생시간</th>
                <th className="px-4 py-2.5 text-left font-semibold text-gray-500">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {product.videoSpecs.map((spec: ProductVideoSpec, i: number) => (
                <tr key={i} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{spec.label}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-700">{spec.minWidth}×{spec.minHeight}px</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {spec.allowedFormats.map(f => (
                        <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 uppercase">{f}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600 tabular-nums">{formatFileSize(spec.maxFileSizeBytes)} 이하</td>
                  <td className="px-4 py-2.5 text-gray-600 tabular-nums">
                    {spec.minDurationSec ? `${spec.minDurationSec}초 ~ ` : ''}{spec.maxDurationSec}초
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 max-w-[200px]">
                    {spec.requiresSound && <span className="text-red-500 font-medium">사운드 필수 · </span>}
                    {spec.note ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default SpecTable
