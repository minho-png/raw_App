/**
 * rawDuplicateDetection.ts
 *
 * CT+ raw CSV 업로드 시 중복 행을 검출.
 *
 * 사용자 정의 — '캠페인 / 소재 / 날짜' 세 항목이 정확히 동일하면 중복으로
 * 간주하고 해당 행은 업로드에서 제외, 모달로 사용자에게 알림.
 */

import type { RawRow } from '@/lib/rawDataParser'

export type DuplicateKey = `${string}|${string}|${string}` // `${date}|${campaignName}|${creativeName}`

/** 중복 비교 키 — (date, campaignName, creativeName) 3-튜플. */
export function rowDuplicateKey(r: RawRow): DuplicateKey {
  return `${r.date}|${r.campaignName.trim()}|${r.creativeName.trim()}` as DuplicateKey
}

/** (campaignName, date) 단위 묶음 — 모달 표시용 요약. */
export interface DuplicateGroup {
  campaignName: string
  date: string
  creativeNames: string[] // 중복된 소재명 (중복 제거된 unique 목록)
  rowCount: number        // 해당 묶음에서 중복으로 판정된 raw 행 수
}

export interface DuplicateDetectionResult {
  duplicates: RawRow[]
  uniqueRows: RawRow[]
  groups: DuplicateGroup[] // 사용자에게 보여줄 (campaign,date) 단위 요약
}

/**
 * 신규 업로드 행들 중 기존 데이터와 (날짜, 캠페인명, 소재명) 이 모두 동일한
 * 항목을 찾는다. 기존(existing) 은 호출자가 raw store 의 전체 행을 넘긴다.
 */
export function detectDuplicates(
  newRows: RawRow[],
  existing: RawRow[],
): DuplicateDetectionResult {
  const existingKeys = new Set<DuplicateKey>()
  for (const r of existing) existingKeys.add(rowDuplicateKey(r))

  const duplicates: RawRow[] = []
  const uniqueRows: RawRow[] = []
  for (const r of newRows) {
    if (existingKeys.has(rowDuplicateKey(r))) duplicates.push(r)
    else uniqueRows.push(r)
  }

  // (캠페인, 날짜) 단위 그룹핑 — 모달에서 한 줄에 모아 보여주기 위함.
  const groupMap = new Map<string, DuplicateGroup>()
  for (const r of duplicates) {
    const k = `${r.campaignName}||${r.date}`
    const g = groupMap.get(k)
    if (g) {
      if (!g.creativeNames.includes(r.creativeName)) g.creativeNames.push(r.creativeName)
      g.rowCount += 1
    } else {
      groupMap.set(k, {
        campaignName: r.campaignName,
        date: r.date,
        creativeNames: [r.creativeName],
        rowCount: 1,
      })
    }
  }
  const groups = [...groupMap.values()].sort((a, b) =>
    a.date === b.date ? a.campaignName.localeCompare(b.campaignName) : a.date.localeCompare(b.date),
  )

  return { duplicates, uniqueRows, groups }
}
