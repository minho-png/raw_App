"use client"
import { useState, useEffect, useRef } from "react"

// 필터 상태를 sessionStorage 에 영속화하는 hook.
// 같은 세션 내 페이지 이동 후 돌아왔을 때 필터가 유지됨. 새 탭/창은 새 세션이라 초기값.
//
// 사용:
//   const [filter, setFilter] = useFilterPersistence('ct-analysis:filter', defaultValue)
//
// 버전 관리: 스키마 변경 시 key 에 ':v2' 등 suffix 를 붙여 이전 값 무시 가능.
// SSR 안전: 첫 렌더는 항상 defaultValue, mount 후 saved 값으로 hydrate.

export function useFilterPersistence<T>(
  key: string,
  defaultValue: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(defaultValue)
  const hydrated = useRef(false)

  // mount 시 sessionStorage 에서 hydrate
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = sessionStorage.getItem(key)
      if (raw != null) {
        const parsed = JSON.parse(raw) as T
        setValue(parsed)
      }
    } catch {
      // 파싱 실패 = 손상된 값. 무시하고 default 유지.
    }
    hydrated.current = true
  }, [key])

  // value 변경 시 sessionStorage 에 persist (hydrate 이후만)
  useEffect(() => {
    if (typeof window === "undefined" || !hydrated.current) return
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // 용량 초과 등 — 조용히 무시.
    }
  }, [key, value])

  return [value, setValue]
}
