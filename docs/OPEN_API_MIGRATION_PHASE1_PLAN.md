# Crosstarget Open API 마이그레이션 — Phase 1 기획안

> 사용자 결정 (2026-05-22): 인프라 + `app/page.tsx` 만 신 API 로 전환. 토큰 발급/환경변수 등록은 사용자 액션.

---

## 1. 범위

### 마이그레이션 대상
- **`app/page.tsx`** (홈 대시보드) 1개 페이지만
- 사용 필드: `total_budget`, `total_spent`, `start_date`, `end_date`, `status`, `campaign_type`, `id`, `title`
- 새 API CAMPAIGN level dimensions 으로 100% 커버 가능

### 대상 외 (현행 유지)
- 정산 페이지 5개 — `agency_fee`/`data_fee`/`targeting_product_id` 의존
- CT/CTV analysis — `profit_rate` 의존
- CT motiv-campaigns master 페이지 — agency/adAccount 단독 엔드포인트 의존
- `app/campaign/ct-plus/*` — Motiv API 미사용 (자체 entity)

---

## 2. 인프라 구성

### 2-1. 디렉토리 구조 (신규)
```
lib/openApi/
  ├── types.ts            # AdsInsightsRequest/Response, Dimensions, Metrics
  ├── client.ts           # fetch wrapper (Authorization 헤더, 에러 정규화)
  └── insightsService.ts  # fetchCampaignInsights(params) — CAMPAIGN level helper

app/api/open-api/
  └── insights/route.ts   # server-side proxy (env 토큰 사용, client 노출 X)

lib/hooks/
  └── useOpenApiCampaigns.ts  # MotivCampaign[] 호환 형식 반환
```

### 2-2. 환경변수 (사용자 액션 필요)
```bash
# .env.local
OPEN_API_TOKEN=<Crosstarget 우측 상단 프로필 → API 토큰에서 발급>
OPEN_API_BASE_URL=https://manage2.crosstarget.co.kr/api/v1
```

Vercel `Settings → Environment Variables` 에도 동일 추가.

### 2-3. Server-side proxy 패턴
- **이유**: 토큰을 브라우저에 노출하지 않기 위함 (기존 `app/api/motiv/*` 와 동일 패턴)
- **route**: `GET /api/open-api/insights?level=CAMPAIGN&dateFrom=...&dateTo=...&campaignType=...`
- **응답**: 새 API JSON 을 그대로 통과 (data + summary + paging)
- **에러**: 401/422/500 그대로 forward, 토큰 미설정 시 503 + 메시지

---

## 3. 타입 정의 (`lib/openApi/types.ts`)

```ts
// 새 API 명세 기반 — 사용자 제공 문서 (2026-05-22)
export type InsightsLevel = 'CAMPAIGN' | 'ADGROUP' | 'AD' | 'DAILY' | 'HOURLY'

export interface InsightsCampaignDimensions {
  campaignId: string
  campaignName: string
  status: 'ACTIVE' | 'PAUSED'
  campaignType?: string
  productType?: string
  productTypeName?: string
  startDate: string | null
  endDate: string | null
  accountId: string
  accountName: string
  agencyId?: string
  agencyName?: string
  totalBudget: number
  totalSpent: number
  dailyBudget: number
  dailySpent: number
}

export interface InsightsMetrics {
  impressions: number
  clicks: number
  ctr: number
  cost: number
  currency: string
  cpc: number
  cpm: number
  // ... (30개 전체 — 사용자 문서 참조)
}

export interface InsightsRow<D = InsightsCampaignDimensions> {
  dimensions: D
  metrics: InsightsMetrics
}

export interface InsightsResponse<D = InsightsCampaignDimensions> {
  data: InsightsRow<D>[]
  summary: { metrics: InsightsMetrics }
  paging: { page: number; limit: number; totalCount: number; totalPages: number }
}

export interface InsightsError {
  error: {
    code: string
    message: string
    details?: Record<string, string[]>
  }
}
```

---

## 4. Hook 호환 매핑 (`useOpenApiCampaigns.ts`)

### 4-1. 시그니처 호환
기존:
```ts
useMotivSettlementCampaignsByProduct(product: 'CT' | 'CTV', opts?) => { data: MotivCampaign[], ... }
```

신규:
```ts
useOpenApiCampaigns(product: 'CT' | 'CTV', opts?) => { data: MotivCampaign[], ... }
```

**핵심**: 반환 타입을 `MotivCampaign[]` 으로 통일하여 `app/page.tsx` 코드 거의 변경 없음.

### 4-2. 응답 매핑
| Open API dimensions | → MotivCampaign 필드 |
|---|---|
| `campaignId` (string) | `id` (number, parseInt) |
| `campaignName` | `title` |
| `totalBudget` | `total_budget` |
| `totalSpent` | `total_spent` |
| `dailyBudget` | `daily_budget` |
| `dailySpent` | `daily_spent` |
| `startDate` | `start_date` |
| `endDate` | `end_date` |
| `status` (ACTIVE/PAUSED) | `status` |
| `campaignType` (DISPLAY/VIDEO/TV) | `campaign_type` |
| `accountId` | `adaccount_id` (parseInt) |

**미매핑** (호환을 위해 빈 stats 반환):
```ts
stats: undefined  // app/page.tsx 에서 사용 안 함
is_free: false   // 새 API 에 없음 — 정책 분기 시 주의
```

### 4-3. `product` → `campaignType` 매핑
| product | campaignType (filter) |
|---|---|
| CT | `DISPLAY` |
| CTV | `VIDEO` |

(*확인 필요*: 사용자/Crosstarget 측 정의에 따라 `TV` 도 CTV 에 포함될 수 있음 — D-01)

### 4-4. 기간 (date) 파라미터
- 새 API 는 `dateFrom`/`dateTo` 필수
- 홈 대시보드는 "현재 진행 중인 캠페인" 표시
- **권장**: 현재 월 1일 ~ 말일 (or `today - 90d ~ today`) — D-02

---

## 5. 사용자 결정 필요

| ID | 질문 | 권장값 |
|---|---|---|
| D-01 | `product='CTV'` 시 `campaignType=VIDEO` 만? 아니면 `VIDEO,TV` 모두? | VIDEO 우선, 결과 비교 후 결정 |
| D-02 | 홈 대시보드 기간: 현재 월 vs 90일 lookback? | **현재 월** (기존 동작 호환) |
| D-03 | 토큰 만료일 정책 — 무기한 vs 1년? | 1년 (재발급 운영 룰 명확) |

---

## 6. 회귀 위험

| ID | 위험 | 영향도 | 완화 |
|---|---|---|---|
| R-01 | 새 API 응답이 기존 Motiv 와 데이터 다름 (다른 source) → 홈 dashboard 수치 변동 가능 | High | 마이그레이션 후 사용자 수동 검증 |
| R-02 | `campaign_type` 매핑 (DISPLAY/VIDEO/TV) 가 product (CT/CTV) 와 정확히 맞지 않음 | Medium | 결과 표본 비교 후 매핑 조정 |
| R-03 | 새 API 가 `is_free` 미제공 → 기존 `c.is_free` 분기 (`app/page.tsx` 검색해서 의존 여부 확인) | Medium | 의존 시 default false 처리 + 주석 |
| R-04 | API 토큰 미설정 시 503 — 사용자 미 설정 상태로 deploy 되면 홈 페이지 깨짐 | High | 토큰 미설정 시 Motiv hook 으로 fallback 또는 명확한 안내 노출 |
| R-05 | `dateFrom/dateTo` 강제로 기존 lifetime view 가 불가능 — 기간 한정 view 만 가능 | Low | 홈은 진행 중 캠페인 view 라 기간 fit |

---

## 7. 안전 가드 (R-04 대응)

`useOpenApiCampaigns` 내부에서 503 응답 감지 시:
```ts
// 환경변수 미설정 케이스 — 기존 Motiv hook 으로 자동 fallback
if (response.status === 503) {
  console.warn('[OpenAPI] Token not configured, falling back to Motiv API')
  return useMotivSettlementCampaignsByProduct(product, opts)
}
```

> 이 fallback 으로 사용자가 토큰을 설정하기 전에도 홈 페이지가 깨지지 않음.

---

## 8. 테스트 계획

- [ ] `npm run build` 통과
- [ ] 토큰 미설정 상태 — 홈 페이지가 Motiv fallback 으로 정상 동작
- [ ] 토큰 설정 후 — 홈 페이지가 새 API 데이터 표시
- [ ] CT/CTV product 필터 결과가 기존과 유사 (캠페인 수, 진행률 alert 등)
- [ ] 401/422 응답 시 사용자 친화 메시지

---

## 9. 변경 파일 (예상)

| 파일 | 변경 유형 | 라인 |
|---|---|---|
| `lib/openApi/types.ts` | 신규 | ~80 |
| `lib/openApi/client.ts` | 신규 | ~60 |
| `lib/openApi/insightsService.ts` | 신규 | ~50 |
| `app/api/open-api/insights/route.ts` | 신규 | ~60 |
| `lib/hooks/useOpenApiCampaigns.ts` | 신규 (fallback 포함) | ~120 |
| `app/page.tsx` | hook swap 만 | ±10 |
| `.env.local.example` | 신규 (선택) | ~5 |

**총 6 파일** (AGENTS.md §6 "5 파일 이상" 임계 — 사용자 결정 명시 받음, 진행 OK).

---

## 10. 사용자 액션 체크리스트 (PR 머지 후)

1. Crosstarget 우측 상단 프로필 → API 토큰 → 새 토큰 발급 (이름: `raw_App-prod`, 만료일: 1년)
2. 발급된 토큰 문자열 복사
3. `.env.local` 에 `OPEN_API_TOKEN=...` 추가 (로컬)
4. Vercel `Settings → Environment Variables` 에 동일 추가 (Production)
5. Vercel 재배포
6. 홈 페이지 데이터 확인
