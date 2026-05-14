"use client"
import React from "react"

// 공통 필터 atoms — 분석/정산/상태 페이지가 일관된 외관·UX 를 갖도록 통일.
//
// 디자인 톤:
//   bar:    rounded-lg border-gray-200 bg-white px-3 py-2
//   chip:   세그먼트 그룹 = 회색 배경 컨테이너 + 활성 chip 은 흰 배경 + 강조 텍스트
//   toggle: 단일 boolean — emerald/blue/amber tone 선택 가능
//   search: 좌측 돋보기 아이콘 + min-w-[180px]
//   reset:  조건 있을 때만 우측 정렬로 표시
//
// 모든 atom 은 controlled — 부모가 state 보유.

interface FilterBarProps {
  /** 좌측 라벨 (예: '필터'). 생략 가능. */
  label?: string
  children: React.ReactNode
  className?: string
}
export function FilterBar({ label, children, className = "" }: FilterBarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 ${className}`}
      role="toolbar"
      aria-label="필터"
    >
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

interface ChipOption<T extends string | number> {
  value: T
  label: string
  /** 활성 시 색 (hex) — 미지정 시 blue */
  color?: string
}
interface FilterChipGroupProps<T extends string | number> {
  /** 그룹 위 라벨 (선택). 미지정 시 미표시. */
  label?: string
  options: ReadonlyArray<ChipOption<T>>
  value: T
  onChange: (next: T) => void
  /** segmented (배경 그룹) vs separate (개별 chip) */
  variant?: "segmented" | "separate"
  size?: "sm" | "md"
}
export function FilterChipGroup<T extends string | number>({
  label, options, value, onChange, variant = "segmented", size = "md",
}: FilterChipGroupProps<T>) {
  const pxy = size === "sm" ? "px-2 py-0.5" : "px-3 py-1"
  const textSize = size === "sm" ? "text-[11px]" : "text-xs"
  if (variant === "segmented") {
    return (
      <div className="flex items-center gap-1.5">
        {label && <span className="text-[11px] text-gray-500">{label}</span>}
        <div className="flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-50 p-0.5">
          {options.map(o => {
            const active = o.value === value
            return (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => onChange(o.value)}
                aria-pressed={active}
                className={`rounded-md ${pxy} ${textSize} font-medium transition-colors ${
                  active
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                style={active && o.color ? { color: o.color } : undefined}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  // separate variant — 컬러풀 chip (매체 등)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {label && <span className="text-[11px] text-gray-500">{label}</span>}
      {options.map(o => {
        const active = o.value === value
        const accent = o.color ?? "#2563eb"
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`rounded-full border ${pxy} ${textSize} font-medium transition-colors`}
            style={{
              backgroundColor: active ? accent : `${accent}14`,
              color: active ? "#fff" : accent,
              borderColor: active ? accent : "transparent",
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

type ToggleTone = "emerald" | "blue" | "amber" | "rose"
interface FilterToggleProps {
  label: string
  active: boolean
  onChange: (next: boolean) => void
  tone?: ToggleTone
  title?: string
}
const TONE_CLASSES: Record<ToggleTone, { on: string; dot: string }> = {
  emerald: { on: "border-emerald-300 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  blue:    { on: "border-blue-300 bg-blue-50 text-blue-700",          dot: "bg-blue-500" },
  amber:   { on: "border-amber-300 bg-amber-50 text-amber-700",       dot: "bg-amber-500" },
  rose:    { on: "border-rose-300 bg-rose-50 text-rose-700",          dot: "bg-rose-500" },
}
export function FilterToggle({ label, active, onChange, tone = "emerald", title }: FilterToggleProps) {
  const t = TONE_CLASSES[tone]
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      aria-pressed={active}
      title={title}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
        active ? t.on : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? t.dot : "bg-gray-300"}`} />
      {label}
    </button>
  )
}

interface FilterSearchProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  minWidth?: string
}
export function FilterSearch({ value, onChange, placeholder = "검색", minWidth = "180px" }: FilterSearchProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border border-gray-200 pl-6 pr-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        style={{ minWidth }}
      />
    </div>
  )
}

interface FilterResetProps {
  onClick: () => void
  visible: boolean
}
export function FilterReset({ onClick, visible }: FilterResetProps) {
  if (!visible) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto text-[11px] text-gray-500 hover:text-gray-800 underline"
    >
      초기화
    </button>
  )
}

interface FilterDateRangeProps {
  start: string
  end: string
  onStartChange: (s: string) => void
  onEndChange: (s: string) => void
  /** 프리셋 버튼 (선택) */
  presets?: ReadonlyArray<{ label: string; onClick: () => void }>
}
export function FilterDateRange({
  start, end, onStartChange, onEndChange, presets,
}: FilterDateRangeProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <input
        type="date"
        value={start}
        max={end || undefined}
        onChange={e => onStartChange(e.target.value)}
        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
      />
      <span className="text-gray-300 text-xs">~</span>
      <input
        type="date"
        value={end}
        min={start || undefined}
        onChange={e => onEndChange(e.target.value)}
        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none"
      />
      {presets && presets.length > 0 && (
        <div className="flex items-center gap-1 ml-1">
          {presets.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={p.onClick}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface FilterMonthProps {
  /** YYYY-MM */
  month: string
  onChange: (next: string) => void
}
function shiftMonth(month: string, dir: -1 | 1): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(y, m - 1 + dir, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
export function FilterMonth({ month, onChange }: FilterMonthProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        className="rounded-md border border-gray-200 bg-white p-1 text-gray-600 hover:bg-gray-50"
        aria-label="이전 월"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <input
        type="month"
        value={month}
        onChange={e => onChange(e.target.value)}
        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700"
      />
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        className="rounded-md border border-gray-200 bg-white p-1 text-gray-600 hover:bg-gray-50"
        aria-label="다음 월"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

interface FilterDividerProps { vertical?: boolean }
export function FilterDivider({ vertical = true }: FilterDividerProps) {
  return vertical
    ? <div className="h-5 w-px bg-gray-200" aria-hidden />
    : <div className="w-full h-px bg-gray-200" aria-hidden />
}
