"use client"

function SpecMatchBadge({ matchType, specName }: { matchType: 'exact' | 'ratio-match' | 'no-match'; specName?: string }) {
  if (matchType === 'exact') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
        <span>✓</span> {specName}
      </span>
    )
  }
  if (matchType === 'ratio-match') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
        <span>⚠</span> 비율 일치 ({specName})
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600">
      <span>✕</span> 불일치
    </span>
  )
}

export default SpecMatchBadge
