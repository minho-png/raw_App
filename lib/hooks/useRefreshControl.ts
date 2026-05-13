"use client"
import { useCallback, useEffect, useState } from "react"

// 데이터 hook 들의 실시간 갱신을 위한 공통 컨트롤.
//
// 동작:
//   1) `refresh()` 호출 시 key 증가 → key 를 의존성으로 받는 hook 들이 재실행
//   2) `autoMs > 0` 이면 해당 주기로 자동 polling
//   3) document visibility 가 visible 로 전환되면 즉시 1회 refresh (탭 복귀 = 신선 데이터)
//   4) `lastRefresh` 는 호출자 UI ('마지막 갱신: HH:MM:SS') 에 사용
//
// 사용처: CT/CTV 분석 페이지, 메인 대시보드. hook 들에 refreshKey 옵셔널 인자로 전달.

export interface RefreshControl {
  key: number
  refresh: () => void
  autoMs: number
  setAutoMs: (ms: number) => void
  lastRefresh: Date
}

export const AUTO_INTERVALS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: '수동',  ms: 0 },
  { label: '30초',  ms: 30_000 },
  { label: '1분',   ms: 60_000 },
  { label: '5분',   ms: 300_000 },
]

export function useRefreshControl(initialAutoMs = 0): RefreshControl {
  const [key, setKey]                 = useState(0)
  const [autoMs, setAutoMs]           = useState(initialAutoMs)
  const [lastRefresh, setLastRefresh] = useState<Date>(() => new Date())

  const refresh = useCallback(() => {
    setKey(k => k + 1)
    setLastRefresh(new Date())
  }, [])

  // 자동 polling
  useEffect(() => {
    if (autoMs <= 0) return
    const id = setInterval(refresh, autoMs)
    return () => clearInterval(id)
  }, [autoMs, refresh])

  // 탭 복귀 시 자동 1회 refresh
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refresh])

  return { key, refresh, autoMs, setAutoMs, lastRefresh }
}
