"use client"

import { ImageSpec, VideoSpec } from "@/lib/adSpecs"

function SpecTable({ specs }: { specs: (ImageSpec | VideoSpec)[] }) {
  const isImageSpec = (s: any): s is ImageSpec => 'width' in s
  
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-semibold text-gray-500">규격명</th>
            {isImageSpec(specs[0]) ? (
              <>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">크기 (W×H)</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">비율</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">최대 용량</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">형식</th>
              </>
            ) : (
              <>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">최소 해상도</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">비율</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">최대 길이</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">최대 용량</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">형식</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {specs.map((spec, idx) => (
            <tr key={idx} className="hover:bg-gray-50/50">
              <td className="px-4 py-3 font-medium text-gray-800">{spec.name}</td>
              {isImageSpec(spec) ? (
                <>
                  <td className="px-4 py-3 font-mono text-gray-700">{spec.width}×{spec.height}</td>
                  <td className="px-4 py-3 text-gray-600">{spec.ratio || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{spec.maxSizeMB}MB</td>
                  <td className="px-4 py-3 text-gray-600">{spec.formats.join(', ')}</td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 font-mono text-gray-700">{spec.minWidth}×{spec.minHeight}</td>
                  <td className="px-4 py-3 text-gray-600">{spec.ratio || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{spec.maxDurationSec}초</td>
                  <td className="px-4 py-3 text-gray-600">{spec.maxSizeMB}MB</td>
                  <td className="px-4 py-3 text-gray-600">{spec.formats.join(', ')}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default SpecTable
