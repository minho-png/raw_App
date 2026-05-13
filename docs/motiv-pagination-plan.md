# MOTIV API 페이지네이션 처리 기획안

작성일: 2026-05-13

## 1. 변경 목적
사용자 환경: 광고계정 약 1,100건 (`meta.last_page: 11`). 현재 hook 이 첫 페이지(200건) 만 호출 → 200건 이후의 광고계정 매핑 실패 → 캠페인의 광고주/대행사 컬럼이 '—' 로 표시.

## 2. 영향 hook (시그니처 무변경)
- `lib/hooks/useMotivAdAccounts.ts` — 4 사용처 (ct/analysis, ctv/analysis, ct/motiv-campaigns, ct/status)
- `lib/hooks/useMotivAgencies.ts` — 동일 + `normalizeAgencyName` export 1 곳

각 호출부는 `byId: Map` 만 사용 → 내부만 변경.

## 3. 설계

### 3.1 공통 헬퍼 신설 — `lib/motivApi/paginatedFetch.ts`
```ts
async function fetchAllPages<T>({
  endpoint, perPage = 200, maxPages = 20, extraParams = {}
}: Options): Promise<{ data: T[]; partial: boolean; errors: string[] }>
```
- 1페이지 호출 → `meta.last_page` 읽음 (없으면 1로 가정)
- 2~N 페이지 `Promise.allSettled` 로 병렬 호출
- 개별 페이지 실패 시 부분 결과 + `errors[]` 누적, 전체 실패는 첫 페이지 실패시만
- `maxPages` 안전 상한 (200 × 20 = 4,000건)

### 3.2 hook 변경
- 첫 페이지 응답으로 `data` 즉시 set → 사용자에게 빠른 초기 표시
- 후속 페이지 도착 시 누적 set → 추가 캠페인 매핑 자연 갱신
- 또는 단순화: 전체 페이지 다 받은 후 한 번에 set (구현 단순, latency 1~2초)

**결정**: 단순화 — 전체 받은 후 한 번에 set. 1100건 / 200건 = 6 페이지 병렬 = ~1.5초 추정. 분석 페이지 mount 1회 비용 허용.

## 4. 회귀 위험
| 위험 | 대응 |
|---|---|
| `meta` 가 응답에 없는 환경 | `?? 1` 가드 — 1페이지만 호출 (기존 동작 유지) |
| 병렬 호출이 Motiv rate limit 트리거 | 동시 호출 6개 이내 → 일반적 API rate limit 안전. 문제 발견 시 순차로 회귀 가능 |
| `maxPages: 20` 한도 초과 | 4,000건 초과 환경에서만 발생 — 경고 로그 + 부분 데이터로 graceful |
| 첫 페이지 실패 | 기존과 동일하게 빈 Map + error 반환 |

## 5. AGENTS.md 준수
- §5 Immutability: hook export 시그니처 무변경 (`data`, `byId`, `loading`, `error`)
- §6: 영향 파일 3 (헬퍼 신설 + 2 hook) — 임계 안전