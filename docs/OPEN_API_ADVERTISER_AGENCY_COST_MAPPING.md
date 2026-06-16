# Open API — 광고주·대행사·비용 정보 매핑 명세

> 작성 2026-06-16. 6개 조사 에이전트 + 사용자 결정("파생 계산 포함", "메인=당일자") 반영.
> 관련 코드: `lib/openApi/legacyAdapter.ts`, `lib/calculationService.ts`, `app/api/motiv/*`.

---

## 1. 결론 요약

| 정보 | Open API Phase 1 제공? | 본 작업 처리 |
|---|---|---|
| 광고계정명 (`accountName`) | ✅ CAMPAIGN level 필수 | 그대로 surfacing |
| 대행사 ID/명 (`agencyId`/`agencyName`) | ⚠️ optional (직영·일부 매체 null) | distinct 추출로 surfacing |
| 광고주 ID (`advertiser_id`) | ❌ 없음 | `accountName` 을 광고주명으로 fallback (advertiser_id = undefined) |
| 매체비 (`cost`) | ✅ KRW | 그대로 매핑 |
| 대행료 (`agency_fee`) | ❌ 없음 (Phase 2 `/settlements`) | **cost × 대행요율 파생** |
| DMP 수수료 (`data_fee`) | ❌ 없음 | **cost × DMP요율 파생** (광고그룹명 DMP 자동감지) |
| 매출 (`revenue`) | ❌ 없음 | **매체비 + 총수수료 파생** |
| 이익/이익률 (`profit`/`profit_rate`) | ❌ 없음 | 0 (보수적 — margin 미반영) |

---

## 2. 광고주/대행사 식별 (실데이터)

Open API insights 응답의 **dimensions** 에서 추출 (전용 목록 엔드포인트 없음):

| Motiv 필드 | Open API 원본 | level | 비고 |
|---|---|---|---|
| `MotivAdAccount.id` / `.name` | `accountId` / `accountName` | CAMPAIGN(필수) | `distinctAdAccountsFromCampaignRows` |
| `MotivAdAccount.advertiser_name` | `accountName` (fallback) | CAMPAIGN | 광고주 전용 필드 부재 — 계정명 사용 |
| `MotivAdAccount.agency_id` / `.agency_name` / `.agency` | `agencyId` / `agencyName` | CAMPAIGN(optional) | 직영/일부 매체는 null |
| `MotivAgency.id` / `.name` | `agencyId` / `agencyName` | CAMPAIGN | `distinctAgenciesFromCampaignRows` |

- 소비 경로: `/api/motiv/ad-accounts`, `/api/motiv/agencies` → `useMotivAdAccounts`/`useMotivAgencies` → 정산 페이지 `adAccountById` Map.
- **한계**: `advertiser_id` 는 Open API 에 차원이 없어 정확한 광고주 ID 별 집계 불가 (Phase 2 대기).

---

## 3. 비용·정산성 파생 (cost × 요율)

Open API 가 정산성 필드를 안 주므로, **기존 CT+ 정산 방법론과 동일하게** 매체비에서 파생.
공식은 `lib/calculationService.ts::deriveSettlementFromCost` 단일 소스 (CLAUDE.md "공식 우회 금지" 준수).

```
mediaCost   = cost
dataFee     = cost × dmpFeeDecimal       (광고그룹명 DMP 자동감지: detectDmpType)
pureAgency  = cost × agencyFeeRate        (대행 요율)
agency_fee  = pureAgency + dataFee         (Motiv 관례: "대행+DMP합")
revenue     = mediaCost + pureAgency + dataFee
profit      = 0                            (보수적, margin 미반영)
```

### 3-1. DMP 수수료 (`data_fee`) — 자동, 즉시 동작
- `adGroupInsightToMotivAdGroup` 가 광고그룹명에서 `detectDmpType` 으로 DMP 사 감지 →
  `DMP_FEE_RATES_DECIMAL` 요율 적용. `targeting_product_id` 에 DMP 분류도 기록.
- DMP-fee 정산 페이지가 `targeting_product_id` + `data_fee` 를 직접 사용.
- `_N` 토큰(매체 타게팅)·DIRECT 는 요율 0.

### 3-2. 대행료 (`agency_fee`) — opt-in
- 캠페인별 정확한 요율은 `motiv_assignments.customAgencyFeeRate` (소비부에서 override 권장).
- 서버 기본값: 환경변수 **`OPEN_API_DEFAULT_AGENCY_FEE_RATE`** (소수, 예 `0.15`).
  - 미설정 시 `agency_fee` = DMP 분만 (대행 0). → 기존과 동일하게 안전.
  - `lib/openApi/legacyAdapter.ts::defaultSettlementDerive` 가 읽음.

### 3-3. ⚠️ 추정치 경고
파생값은 **추정**이며 실제 Motiv 정산 청구액과 다를 수 있다. 정확 정산은 Phase 2
`/settlements` 엔드포인트(가이드 §7) 도입 후 raw 값으로 대체할 것. UI 표시 시 "추정" 라벨 권장.

---

## 4. 조회 기간 정책 (사용자 결정 2026-06-16)

| 화면 | 조회 기간 | 근거 |
|---|---|---|
| **메인 대시보드** (`app/page.tsx`) | **당일자(오늘)** | 집행중 캠페인은 오늘 활동 존재. 1일 집계로 비용 최소·TIMEOUT 해소 |
| 정산/분석 페이지 | 각 페이지의 month/dateRange 설정대로 | 기간 정확 집계 필요 |

- 메인은 `dashboardRange = { start: today, end: today }` + `perPage: 1000`.
- 정산 페이지는 기존 month/dateRange 를 그대로 `/api/motiv/*` 에 전달.

---

## 5. Phase 2 전환 지점

`/settlements` 엔드포인트가 운영망 200 으로 확인되면:
1. `metricsToMotivStats` 의 파생 분기를 raw `/settlements` 필드로 교체.
2. `advertiser_id` 등 신규 dimension 이 생기면 `distinctAdAccountsFromCampaignRows` 보강.
3. `deriveSettlementFromCost` 는 fallback 으로 유지 (엔드포인트 장애 시).
