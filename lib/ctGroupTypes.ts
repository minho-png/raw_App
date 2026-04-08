import type { MediaType } from '@/lib/reportTypes'

export interface CtGroupMediaMarkup {
  dmpRate: number     // DMP 타겟팅 행 대행수수료율 (%)
  nonDmpRate: number  // non-DMP 타겟팅 행 대행수수료율 (%)
  budget: number      // 해당 매체 예산 (원, gross 기준)
}

export interface CtPlusGroup {
  id: string
  name: string                                               // 표시명
  csvNames: string[]                                        // 포함할 CSV campaignName 목록
  mediaMarkups: Partial<Record<MediaType, CtGroupMediaMarkup>>
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  note?: string
  createdAt: string
  updatedAt: string
}

export function createEmptyCtGroup(id: string): CtPlusGroup {
  const now = new Date().toISOString()
  return {
    id,
    name: '',
    csvNames: [],
    mediaMarkups: {},
    startDate: '',
    endDate: '',
    note: '',
    createdAt: now,
    updatedAt: now,
  }
}

/** 선택된 그룹들의 csvNames를 Set으로 합산 — allRows 필터링에 사용 */
export function buildCsvNameSet(groups: CtPlusGroup[], selectedIds: Set<string>): Set<string> {
  const names = new Set<string>()
  for (const g of groups) {
    if (selectedIds.has(g.id)) {
      for (const n of g.csvNames) names.add(n)
    }
  }
  return names
}
