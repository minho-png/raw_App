# Crosstarget Open API `/ads/insights` 실제 명세 (정산 집계)

> 출처: 사용자 제공 명세 이미지 (2026-06-16). **중요**: 현재 코드(types.ts/insightsService/
> legacyAdapter)는 이 명세와 **근본적으로 불일치**한다. 본 문서가 정본(正本)이다.
> 코드 교정은 별도 PR 예정 — 정산은 금융 정보라 metrics 전체 필드 확정 후 진행.

---

## 1. 결정적 차이 — 코드 가정 vs 실제

| 항목 | 코드 현재 (틀림) | 실제 명세 |
|---|---|---|
| 집계 파라미터 | `level=CAMPAIGN/ADGROUP/AD/DAILY/HOURLY` | **`groupBy`** (DATE/AGENCY/MEDIA/DATA_PROVIDER) — `level` 없음 |
| 필터 | campaignType/campaignIds/accountId/status/q | **agencyId / mediaId / dataProviderId** (각 단일값) |
| 응답 행 | `{ dimensions: {flat object}, metrics }` | **`{ dimension: [노드 배열], metrics }`** (dimension 단수·배열) |
| 캠페인 차원 | campaignId/campaignName/adGroupName/totalBudget... | **존재하지 않음** — 차원은 DATE/AGENCY/MEDIA/DATA_PROVIDER 뿐 |
| 정산 metrics | 미제공 → cost×요율 파생 | **revenue/grossProfit/margin/mediaCost/mediaCostInternal 직접 제공** |

→ 이 엔드포인트는 **캠페인 단위가 아니라 정산 집계 API**다. 대시보드/캠페인 목록이 쓰는
캠페인 단위 데이터(campaignId/title/budget/status)는 **이 API 로는 얻을 수 없다**(별도 출처 필요).

---

## 2. 쿼리 파라미터 (명세 확정)

| 이름 | 타입 | 필수 | 기본값 | 허용값/형식 | 설명 |
|---|---|---|---|---|---|
| `dateFrom` | string | ✅ | - | YYYY-MM-DD | 조회 시작일(포함) |
| `dateTo` | string | ✅ | - | YYYY-MM-DD (≥ dateFrom) | 조회 종료일(포함). **기간 최대 366일** |
| `groupBy` | string | 선택 | `DATE` | `DATE,AGENCY,MEDIA,DATA_PROVIDER` 콤마결합 | 집계 차원(최대 4개, 중복 불가). 나열 순서 = dimension 배열 순서 |
| `output` | enum | 선택 | `json` | `json`\|`csv` | 응답 형식(구조 동일, csv 는 파일 스트림) |
| `agencyId` | string | 선택 | - | 단일 ID | 에이전시 필터 — **단일 값만** |
| `mediaId` | string | 선택 | - | 단일 ID | 매체 필터 — **단일 값만** |
| `dataProviderId` | string | 선택 | - | 단일 코드 | 데이터 제공자 필터 — **단일 값만** |
| `includeInternalTrade` | boolean | 선택 | `true` | `true`\|`false` | `false` 면 mediaCost 에서 내부거래 매체비(`mediaCostInternal`) 제외 |
| `orderBy` | string | 선택 | (집계순서) | metrics 키 (예: `revenue`,`grossProfit`,`margin`) | 정렬 키. 미지정 시 집계 원본 순서 |
| `order` | enum | 선택 | `DESC` | `ASC`\|`DESC` | 정렬 방향 |
| `page` | int | 선택 | `1` | ≥ 1 | 페이지 번호 |
| `limit` | int | 선택 | `50` | 1~1000 | 페이지 크기(집계 행 기준) |

- 조회 기간 초과(>366일) 시 **422**.

---

## 3. groupBy 차원 (dimension 노드)

| 토큰 | 집계 단위 | dimension 노드 | 비고 |
|---|---|---|---|
| `DATE` | 일자 | `{ "type":"DATE", "date":"YYYY-MM-DD" }` | 기본값 |
| `AGENCY` | 에이전시(대행사) | `{ "type":"AGENCY", "id", "name" }` | → 대행수수료 정산 |
| `MEDIA` | 매체(매체사) | `{ "type":"MEDIA", "id", "name" }` | → 매체비 정산 |
| `DATA_PROVIDER` | 데이터 제공자(DMP) | `{ "type":"DATA_PROVIDER", "id", "name" }` | → DMP 수수료 정산. 데이터비용 없으면 `id="NON"`, `name="데이터비용 없음"` |

---

## 4. 응답 구조

```jsonc
{
  "groupBy": ["AGENCY", "MEDIA"],          // 요청 반영
  "data": [
    {
      "dimension": [                        // 단수 'dimension', groupBy 순서대로 노드 배열
        { "type": "AGENCY", "id": "...", "name": "..." },
        { "type": "MEDIA",  "id": "...", "name": "..." }
      ],
      "metrics": { "revenue": 0, "grossProfit": 0, "margin": 0, "mediaCost": 0, "mediaCostInternal": 0, /* ... */ }
    }
  ],
  "paging": { "page": 1, "limit": 50, "totalCount": 0, "totalPages": 0 }
}
```

- `data[]` 의 각 원소 = `dimension`(차원 노드 배열) + `metrics`.
- 차원이 늘면 **중첩 대신** dimension 배열 원소가 늘어남.
- `paging` 은 집계 행 수 기준.
- 배열 키는 `data` (코드의 data/rows 호환 처리로 양쪽 안전).

---

## 5. metrics (부분 — 전체 표 확정 필요)

명세 본문/파라미터에서 확인된 정산 metric:
- `revenue` (매출)
- `grossProfit` (매출총이익)
- `margin` (마진율)
- `mediaCost` (매체비)
- `mediaCostInternal` (내부거래 매체비 — includeInternalTrade=false 시 mediaCost 에서 제외)

> ⚠️ 전체 metrics 필드 목록(노출/클릭/수수료 분해 등)은 명세의 metrics 표 전문 확보 후 확정.
> 그 전까지 정산 코드 교정은 보류(추측 금지 — 금융 정확도).

---

## 6. 정산 페이지 대응 (설계 방향)

| 정산 페이지 | groupBy | 사용 metric |
|---|---|---|
| 대행수수료 (agency-fee) | `AGENCY` (+MEDIA) | revenue, grossProfit, mediaCost |
| DMP 수수료 (dmp-fee) | `DATA_PROVIDER` | (데이터비용 metric — 표 확정 필요) |
| 매체비 (media-cost) | `MEDIA` | mediaCost, mediaCostInternal |
| 매출/매입 (sales-purchase) | `AGENCY,MEDIA` | revenue, mediaCost, grossProfit, margin |

→ **cost×요율 파생(#133) 불필요** — 실제 revenue/grossProfit/margin/mediaCost 직접 사용.
   파생 로직(deriveSettlementFromCost/settlementDerive)은 Phase 교정 시 제거 또는 fallback 강등.

---

## 7. 코드 교정 To-Do (별도 PR)

1. `types.ts`: InsightsQuery(level→groupBy, agencyId/mediaId/dataProviderId), InsightsRow(dimensions→dimension 배열), InsightsMetrics(정산 metric 추가).
2. `insightsService`: level helper 제거 → groupBy 기반 단일 호출. (이미 data/rows 호환 처리됨)
3. `app/api/open-api/insights/route.ts`: 파라미터 검증 재작성 (groupBy 화이트리스트, 366일 제약).
4. 정산 페이지: dimension 배열 파싱 + 실제 metric 소비.
5. 캠페인 단위 데이터(대시보드/캠페인 목록): **별도 데이터 출처 결정 필요** — 이 API 로는 불가.
