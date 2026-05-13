# MOTIV API GET 엔드포인트 반영 기획안

작성일: 2026-05-13
근거: MOTIV API 문서 + Explore 에이전트 분석 + 코드베이스 직독

---

## 1. 변경 목적
사용자 요청:
- MOTIV API 의 데이터 읽기(GET) 기능을 CT 와 CT+ 영역에 반영
- **대행사·광고주는 필수**
- 비용 데이터도 가져올 수 있게

## 2. 현황 (Explore 에이전트 분석)

| 데이터 | CT | CT+ |
|---|---|---|
| 대행사 | ✓ 이미 노출 (MotivSettlementTable + 분석 페이지) | 자체 마스터데이터 |
| 광고주 | ⚠ `MotivAdAccount.advertiser_name` 데이터 존재하나 UI 미노출 | 자체 마스터데이터 |
| 비용 | ✓ `stats.cost` 사용 중 (agency_fee/data_fee/profit 도 파싱됨 — 미표시) | CSV `netAmount` / `executionAmount` |
| Stats API | ✗ 전혀 미사용 — 첫 페이지 `campaigns.stats` 만 사용 | N/A |

## 3. 활용 가능한 GET 엔드포인트 매트릭스

| 엔드포인트 | 용도 | 현재 | 도입 단계 |
|---|---|---|---|
| `GET /v1/agencies` | 대행사 목록 | 사용 중 | — |
| `GET /v1/adaccounts` | 광고계정(=광고주) 목록 | 사용 중 | — |
| `GET /v1/campaigns` | 캠페인 + stats | 사용 중 | — |
| `GET /v1/stats/daily/breakdown` | 일별 비용/수익 | **미사용** | **P3** |
| `GET /v1/stats/campaign/breakdown` | 캠페인별 집계 | 미사용 | P3 (선택) |
| `GET /v1/stats/publisher/breakdown` | 매체별 | 미사용 | 향후 |
| `GET /v1/stats/conversion/breakdown` | 전환 | 미사용 | 향후 |
| `GET /v1/ads` | 광고 소재 | 미사용 | 별 트랙 |
| `GET /v1/adgroups` | 광고 그룹 | 미사용 | 별 트랙 |

## 4. Phase 분할

### Phase P1 — 광고주명 노출 (필수, 즉시 가능)
- `lib/motivApi/types.ts` 의 `MotivAdAccount` 는 이미 `advertiser_name` / `advertiser.name` / `agency.corporate_name` 등 보유
- 헬퍼 `getAdvertiserName(adAccount)`: `advertiser_name ?? advertiser?.name ?? name ?? '—'`
- 헬퍼 `getAgencyDisplayName(motivAgency)`: `corporate_name ?? name ?? '—'` (정산용 corporate_name 우선)
- 적용 위치:
  - `app/campaign/ct/analysis/page.tsx` — 캠페인 테이블에 "광고주" 컬럼 추가 (대행사 뒤)
  - `app/campaign/ct-ctv/analysis/page.tsx` — 동일
  - `lib/motivApi/statsMapper.ts` — `UnifiedCampaignSnapshot` 에 `advertiser` 필드 추가, `motivCampaignToSnapshot()` 가 인자로 받아 채움

영향 파일: 4개 (statsMapper / ct analysis / ct-ctv analysis / 헬퍼 추가)

### Phase P2 — 비용 분해 표시
현재 `motivStatsToMetrics` 가 이미 5가지로 분해:
- `spend` (= cost)
- `agencyFee` (= agency_fee)
- `dmpFee` (= data_fee)
- `mediaCost` (= cost - agency_fee - data_fee - profit)
- `completedViews`

분석 페이지의 "요약 통계" 영역(SummaryCard 4개)에 비용 분해를 명시:
- 총 소진금액 → 그 아래 sub-text: "수수료 ₩X + DMP ₩Y + 매체비 ₩Z + 이익 ₩W"
- 또는 별도 카드: 매체비 / 대행수수료 / DMP 수수료 / 이익(profit)

영향 파일: 2개 (CT/CTV analysis page)

### Phase P3 — Stats Daily API 일별 비용 추세 차트
신규:
- `lib/motivApi/statsService.ts` — `fetchStatsDaily(query): Promise<StatsDailyResponse>` 서버측 wrapper
- `app/api/motiv/stats/daily/route.ts` — Next.js route handler (CRON_SECRET 불필요, 일반 인증 흐름)
- `lib/hooks/useMotivStatsDaily.ts` — 클라이언트 hook (`{ agencyId, adaccountId, campaignId, startDate, endDate }` 받음)
- CT analysis / CTV analysis 페이지에 미니 라인차트 추가 (recharts)
  - X: 일자, Y: cost / revenue / profit
  - 권한 규칙(API 문서): "campaign_id / adaccount_id / agency_id / publisher_id 중 하나 필수" → 페이지가 선택된 캠페인이 있으면 캠페인 ID, 없으면 전체 (Platform 권한 시)

API 응답 구조 (문서):
> "data 배열의 각 행은 dictionary[string, string]"

타입: `Record<string, string>[]` 그대로 노출하되 우리 쪽에서 number 변환 helper 별도.

영향 파일: 4개 (statsService / route / hook / 차트 컴포넌트)

## 5. 영향 파일 (총)

```
lib/motivApi/types.ts                    [P1] (UnifiedCampaignSnapshot.advertiser 필드 추가 시)
lib/motivApi/statsMapper.ts              [P1]
lib/motivApi/advertiserHelpers.ts (신규) [P1]
app/campaign/ct/analysis/page.tsx        [P1+P2+P3]
app/campaign/ct-ctv/analysis/page.tsx    [P1+P2+P3]
lib/motivApi/statsService.ts (신규)      [P3]
app/api/motiv/stats/daily/route.ts (신규)[P3]
lib/hooks/useMotivStatsDaily.ts (신규)   [P3]
components/analysis/DailyCostChart.tsx (신규) [P3]
```

총 9개 파일 (5+ 임계 초과). 그러나 Phase 별로 commit:
- P1: 4개
- P2: 2개
- P3: 4개

각 Phase 자체는 4개 이하 — AGENTS.md §6 임계 안전.

## 6. 회귀 위험

| 위험 | 검증 |
|---|---|
| `advertiser` 필드가 응답에 없으면 빈 값 처리 | helper 에서 fallback chain 적용 — 빈 케이스 표시 '—' |
| Stats API 응답 권한 에러 (campaign_id 없을 때) | route handler 에서 400 / 401 명시적 처리 |
| Stats Daily 응답이 dictionary[string,string] 이라 number 파싱 누락 | helper `toNum(value)` 적용 |
| 추가 KPI 카드로 인한 모바일 레이아웃 깨짐 | grid 4 → md:grid-cols-4 lg:grid-cols-5 적용 |

## 7. 검증 1회 (Plan 에이전트)
다음 항목 위주:
1. `MotivAdAccount.advertiser_name` 가 실제 Motiv API 응답에 존재하는지 (코드는 optional 타입 정의 — 응답 확인 필요)
2. Stats API route handler 에 토큰 흐름이 올바른지 (기존 `/api/motiv/campaigns` 패턴)
3. 권한 규칙 (scope 파라미터 필수) 처리