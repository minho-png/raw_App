"use client"

import Link from "next/link"
import { mColor } from "@/lib/mediaColors"

// 도메인(CT+ / CT / CTV) 한 묶음의 집행 중 캠페인 현황 요약 카드.
// 메인 대시보드에서 3 개가 가로 배치되어 도메인별로 매체 분포·평균 소진률을 한 눈에 확인.
//
// 데이터 책임은 부모(app/page.tsx) — 본 컴포넌트는 presentational.
//
// 색상: mediaColors.ts 의 mColor 사용 (매체명 키로 동일 색상 보장).

export interface MediaDistribution {
  /** 매체 라벨 (mColor 키와 동일). 예: '네이버 GFA', 'DISPLAY', 'TV' */
  label: string
  count: number
}

interface Props {
  title: string                       // 'CT+' / 'CT' / 'CTV'
  subtitle?: string                   // '자체 입력 데이터' / '자체 DA' / 'TV'
  campaignCount: number               // 집행 중 (unique) 캠페인 수
  distribution: ReadonlyArray<MediaDistribution>  // 매체 분포 — 한 캠페인이 여러 매체일 수 있음
  /** 평균 소진률 (0~). null 이면 표시 안 함. */
  avgSpendRate?: number | null
  /** "분포" 라벨 옆 작은 안내 (N:M 표시 등). 비어있으면 미노출. */
  distributionNote?: string
  /** 카드 전체 클릭 시 이동할 경로 */
  href: string
  /** 데이터 로딩/에러 상태 */
  loading?: boolean
  error?: string | null
  /** 빈 상태일 때 추가 안내 (선택) */
  emptyHint?: string
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

function spendRateColor(rate: number): { bar: string; text: string } {
  if (rate >= 100) return { bar: 'bg-red-500',     text: 'text-red-600 font-bold' }
  if (rate >= 90)  return { bar: 'bg-orange-400',  text: 'text-orange-600 font-semibold' }
  if (rate >= 70)  return { bar: 'bg-yellow-400',  text: 'text-yellow-600' }
  return                  { bar: 'bg-blue-500',    text: 'text-blue-600' }
}

// 도트 시각화 — 최대 8개 + 초과 시 '+N'
function DotRow({ count, color }: { count: number; color: string }) {
  const visible = Math.min(count, 8)
  const overflow = count - visible
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: visible }).map((_, i) => (
        <span key={i} className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      ))}
      {overflow > 0 && (
        <span className="ml-1 text-[10px] font-medium text-gray-400">+{overflow}</span>
      )}
    </div>
  )
}

export function DomainStatusCard({
  title, subtitle, campaignCount, distribution,
  avgSpendRate, distributionNote, href,
  loading, error, emptyHint,
}: Props) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-gray-200 bg-white px-5 py-4 transition-all hover:border-blue-300 hover:shadow-md"
    >
      {/* 헤더 */}
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          {subtitle && <p className="text-[10px] text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-blue-700 tabular-nums">{campaignCount}</p>
          <p className="text-[10px] text-gray-400">집행 중</p>
        </div>
      </div>

      {/* 본문 */}
      {loading ? (
        <div className="py-3 text-center text-[11px] text-gray-400">
          <svg className="inline animate-spin h-3 w-3 mr-1 text-gray-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
          </svg>
          데이터 불러오는 중…
        </div>
      ) : error ? (
        <div className="py-3 text-center text-[11px] text-red-500">API 오류 · {error}</div>
      ) : campaignCount === 0 ? (
        <div className="py-3 text-center text-[11px] text-gray-400">
          {emptyHint ?? '집행 중 캠페인이 없습니다'}
        </div>
      ) : (
        <>
          {/* 분포 */}
          {distribution.length > 0 && (
            <div className="space-y-1 mb-3">
              <div className="flex items-baseline justify-between">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">분포</p>
                {distributionNote && (
                  <p className="text-[9px] text-gray-300">{distributionNote}</p>
                )}
              </div>
              {distribution.map(d => (
                <div key={d.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: mColor(d.label) }} />
                    <span className="text-[11px] text-gray-600 truncate">{d.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <DotRow count={d.count} color={mColor(d.label)} />
                    <span className="text-[11px] font-semibold text-gray-700 tabular-nums w-6 text-right">{d.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 평균 소진률 */}
          {avgSpendRate !== null && avgSpendRate !== undefined && (
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">평균 소진</p>
                <span className={`text-xs tabular-nums ${spendRateColor(avgSpendRate).text}`}>
                  {fmtPct(avgSpendRate)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${spendRateColor(avgSpendRate).bar}`}
                  style={{ width: `${Math.min(avgSpendRate, 100)}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </Link>
  )
}
