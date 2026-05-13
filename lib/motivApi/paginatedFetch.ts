// MOTIV Laravel paginator 응답을 모든 페이지 끝까지 받아오는 공통 헬퍼.
//
// 흐름:
//   1) page=1 호출 → meta.last_page 확인 (없으면 1)
//   2) 2~lastPage 페이지를 Promise.allSettled 로 병렬 호출
//   3) 개별 페이지 실패는 errors[] 에 기록 + 가능한 데이터로 진행 (partial)
//
// 안전 상한 maxPages 로 무한 페이지 방지. 초과 시 partial 결과 + console.warn.

interface PaginatedResponseShape<T> {
  data?: T[]
  meta?: { last_page?: number; total?: number; per_page?: number }
}

export interface PaginatedResult<T> {
  data: T[]
  partial: boolean       // 일부 페이지 실패 또는 maxPages 초과
  errors: string[]       // 페이지별 오류 메시지
  total?: number         // meta.total — 응답에 있으면 채움
}

interface Options {
  /** /api/motiv/... 형태 또는 절대 URL. */
  endpoint: string
  /** 쿼리스트링 베이스 (page/per_page 제외). */
  extraParams?: Record<string, string>
  perPage?: number
  /** 안전 상한 — 한 hook 호출에서 fetch 할 수 있는 최대 페이지 수. */
  maxPages?: number
}

export async function fetchAllPages<T>({
  endpoint, extraParams = {}, perPage = 200, maxPages = 20,
}: Options): Promise<PaginatedResult<T>> {
  const errors: string[] = []
  const buildUrl = (page: number) => {
    const sp = new URLSearchParams(extraParams)
    sp.set('per_page', String(perPage))
    sp.set('page', String(page))
    return `${endpoint}?${sp.toString()}`
  }

  // 1) 첫 페이지
  let firstJson: PaginatedResponseShape<T>
  try {
    const res = await fetch(buildUrl(1), { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    firstJson = (await res.json()) as PaginatedResponseShape<T>
  } catch (e) {
    return { data: [], partial: false, errors: [e instanceof Error ? e.message : String(e)] }
  }

  const firstData = firstJson.data ?? []
  const metaLastPage = firstJson.meta?.last_page
  const total        = firstJson.meta?.total

  // meta 가 응답에 없는 경우 (Laravel paginator 가 아닌 단순 배열 반환 등) 의 fallback:
  //   첫 페이지가 perPage 만큼 가득 차면 다음 페이지를 시도해 보고, 빈 응답이 나올 때까지 진행.
  //   meta 가 있으면 그 값을 신뢰.
  const lastPage = metaLastPage ?? (firstData.length >= perPage ? maxPages : 1)
  const usingMetaFallback = metaLastPage == null && firstData.length >= perPage

  if (lastPage <= 1) return { data: firstData, partial: false, errors: [], total }

  // 2) 한도 초과 점검
  const effectiveLast = Math.min(lastPage, maxPages)
  const exceeded      = lastPage > maxPages
  if (exceeded) {
    const msg = `MOTIV ${endpoint} 페이지 수(${lastPage})가 한도(${maxPages})를 초과 — 부분 데이터만 적재`
    errors.push(msg)
    if (typeof console !== 'undefined') console.warn(msg)
  }

  // 3) 2~effectiveLast 병렬 호출 (Promise.allSettled — 부분 실패 허용)
  //    meta 없는 fallback 모드에선 빈 응답이 나올 때까지 순차 호출 (조기 종료 위해)
  const all: T[] = [...firstData]
  if (usingMetaFallback) {
    for (let p = 2; p <= effectiveLast; p++) {
      try {
        const res = await fetch(buildUrl(p), { cache: 'no-store' })
        if (!res.ok) {
          errors.push(`page=${p} HTTP ${res.status}`)
          break
        }
        const json = (await res.json()) as PaginatedResponseShape<T>
        const rows = json.data ?? []
        if (rows.length === 0) break  // 빈 응답 = 끝
        for (const row of rows) all.push(row)
        if (rows.length < perPage) break  // 마지막 페이지 = 끝
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`page=${p}: ${msg}`)
        break
      }
    }
    return { data: all, partial: errors.length > 0 || exceeded, errors, total }
  }

  const pageNums = Array.from({ length: effectiveLast - 1 }, (_, i) => i + 2)
  const results = await Promise.allSettled(
    pageNums.map(async p => {
      const res = await fetch(buildUrl(p), { cache: 'no-store' })
      if (!res.ok) throw new Error(`page=${p} HTTP ${res.status}`)
      return (await res.json()) as PaginatedResponseShape<T>
    }),
  )

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      for (const row of r.value.data ?? []) all.push(row)
    } else {
      const p = pageNums[i]
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
      errors.push(`page=${p}: ${msg}`)
    }
  })

  return { data: all, partial: errors.length > 0 || exceeded, errors, total }
}
