# DB CRUD 및 실 세팅 금액 공식 개편 — 기획·진단 보고서

> 문서: `docs/db-crud-and-formula-fix-plan.md`
> 작성: 2026-05-12
> 작성자: Claude (AI 실행 주체)
> 검토 요청: 시스템 컨트롤러 (인간 승인 필요)
> 적용 규칙: `AGENTS.md` AI Harness Engineering System

---

## 0. Executive Summary

사용자 보고 4개 영역 (① DB CRUD 동작 ② 실 세팅 금액 공식 ③ 네이버 VAT 처리 ④ 매체별 총예산 자동/수동) 에 대한 코드 분석 결과:

- **②번 공식**은 현재 `calcSettingCost(budget, markup)` 가 **`budget × (1 - markup)`** 형태로, 사용자가 명시한 **`budget / (markup의 합)`** 공식과 **수학적·의미적으로 모순**. 정확한 의도 확인이 선행돼야 합니다.
- **④번 매체별 총예산**은 이미 `MediaBudget.totalBudget` 필드가 존재하나, 서브캠페인 합산 시 자동 갱신 로직이 없음 → 추가 필요.
- **③번 네이버 VAT**는 현재 코드 전반에 VAT 분기 없음 → 정의 필요.
- **①번 DB CRUD**는 잠재적 결함 3건 발견 (silent fail · 빈 응답 처리 · 동시 편집 race).

**5 파일 이상 변경이 확실**하므로 AGENTS.md §6 의 *Human-in-the-Loop 체크포인트* 발동 — **승인 전 코드 변경 없음**.

---

## 1. 현황 진단

### 1.1 DB CRUD 흐름
- 위치: `lib/hooks/useMasterData.ts`
- 패턴: localStorage 즉시 반영 → MongoDB 백그라운드 동기화 (best-effort)
- API: `GET/POST /api/v1/master-data?type={campaigns|agencies|advertisers|operators}`

**발견된 결함**:

| ID | 결함 | 위치 | 영향 |
|---|---|---|---|
| DB-001 | `saveToMongo`가 throw 를 silent catch — Mongo 저장 실패 시 UI는 성공 표시 | useMasterData.ts:32 | 사용자가 저장된 줄 알지만 서버에는 없음 → 새 브라우저/기기 진입 시 데이터 누락 |
| DB-002 | `if (mc.length)` — Mongo 가 빈 배열을 반환 시 localStorage 캐시 유지 | useMasterData.ts:85-88 | Mongo 에서 캠페인을 모두 삭제한 경우 화면에는 잔존 데이터 노출 → "삭제 안 됨" 인상 |
| DB-003 | 캠페인 1건 추가/삭제 시 전체 배열을 PUT — 동시 편집 시 후자 승 | useMasterData.ts:98-117 | 다중 사용자/탭 동시 편집 시 데이터 손실 |
| DB-004 | useCtGroups.ts 도 동일 패턴, 동일 결함 가능 | useCtGroups.ts | 부수 영향 |

### 1.2 현재 실 세팅 금액 공식
- 위치: `lib/campaignTypes.ts:150-156`
- 공식: `setting = budget × (1 - (mediaMarkup + dmpFeeRate + agencyFeeRate)/100)`
- 의미: 예산 = 광고주에게 청구한 gross, 세팅 = 매체에 실제 집행할 net
- 예시: budget=100, totalMarkup=40% → **setting = 60**

### 1.3 사용자 명시 공식 (재인용)
- "예산 100 / 0.4 → **실 세팅 250**"
- 0.4 = DMP 10% + 거래처 20% + 구글/메타 10% = 40% 의 소수 표기
- **수학적 해석 3가지**:
  - (A) `setting = budget / totalMarkup_decimal` (사용자 표기 그대로) → 100/0.4 = 250 ✓ 사용자 예시 일치
  - (B) `setting = budget / (1 - totalMarkup_decimal)` (일반적 광고 업계 gross-up) → 100/0.6 = 166.67 ✗ 사용자 예시 불일치
  - (C) "예산"의 정의가 net (마진) → setting = 마진/마진율 = 100/0.4 = 250 ✓ 사용자 예시 일치 (A 와 동치)

**판정 보류** — 사용자 의도가 (A)/(C)인지 확인 필요. (A) 라면 현재 공식의 **방향 자체가 반대** (×(1-m) → ÷m) 로 바뀌는 큰 변경.

### 1.4 네이버 VAT
- 현재 `MEDIA_MARKUP_RATE['네이버 GFA'] = 0` 만 정의, VAT 분기 없음
- 정산/대시보드 어디에도 VAT 가산 로직 없음
- 사용자 요구: 네이버는 실 세팅 금액에 VAT 10% 포함 → 별도 가산 필요

### 1.5 매체별 총예산 (totalBudget)
- `MediaBudget.totalBudget?: number` (optional) — 이미 존재
- `getMediaTotals` 가 `mb.totalBudget !== undefined && mb.totalFeeRate !== undefined` 일 때 우선 사용 (campaignTypes.ts:165)
- `SubCampaign[]` 가 존재하지만 sub 의 `budget` 합산을 `MediaBudget.totalBudget` 으로 자동 반영하는 로직 **없음**
- 사용자 요구: 서브 설정 시 자동, 미설정 시 수동 입력 가능

---

## 2. 변경 설계 (승인 후 적용)

### 2.1 실 세팅 금액 공식 [Phase A]
가정: 사용자 의도가 **(A) `setting = budget / totalMarkup_decimal`** 로 확정된 경우.

```ts
// lib/campaignTypes.ts
export function calcSettingCost(budget: number, totalMarkupPct: number): number {
  if (totalMarkupPct <= 0) return budget          // 수수료 0 → 분모 0 보호
  return Math.round(budget / (totalMarkupPct / 100))
}

export function getTotalMarkup(mediaMarkup: number, dmpFeeRate: number, agencyFeeRate: number): number {
  return mediaMarkup + dmpFeeRate + agencyFeeRate   // 합산 자체는 동일
}
```
- mediaMarkup: 구글/메타 10%, 네이버/카카오 0% (기존 유지)
- dmpFeeRate: DMP 활용 시 DMP_FEE_RATES_PERCENT (DMP별 차등, 기존 유지)
- agencyFeeRate: 거래처 수수료율 (입력값, 기존 유지)

### 2.2 네이버 VAT 처리 [Phase B]
```ts
export const VAT_RATE = 10
export function applyVatIfNaver(mediaName: string, settingCost: number): number {
  if (mediaName === '네이버 GFA') return Math.round(settingCost * (1 + VAT_RATE / 100))
  return settingCost
}
```
- `getMediaTotals` 에서 dmpSC / nonDmpSC 계산 직후 `applyVatIfNaver(mb.media, …)` 적용
- 표시는 "₩XXX (VAT 포함)" 라벨 병기 (UI 별도 작업)

### 2.3 매체별 총예산 자동/수동 [Phase C]
- `MediaBudgetCard.tsx` 에서:
  - `subCampaigns` 가 1개 이상이면 → `mb.totalBudget = Σ subCampaign.budget` 자동 계산 + 입력 필드 read-only
  - 0개면 → `mb.totalBudget` 수동 입력 가능
- 캠페인 저장 시 sub 합계와 totalBudget 불일치 검증 → 경고 토스트

### 2.4 DB CRUD 개선 [Phase D]
- DB-001: `saveToMongo` 실패 시 throw → 호출자가 토스트 띄움 + localStorage 는 유지 (다음 refresh 시 재시도)
- DB-002: `if (mc.length)` → `if (mc !== null)` 로 변경 + 빈 배열도 반영 (단, 실패와 구분 위해 fetchFromMongo 가 null 반환하도록 시그니처 수정)
- DB-003: 단건 PATCH API 신설 (`PATCH /api/v1/master-data?type=…&id=…`) — 큰 변경이라 본 기획에서는 **out of scope**, 별도 트랙 권장
- DB-004: useCtGroups 도 동일 패턴 적용

### 2.5 영향 범위 (예상)
| Phase | 파일 수 | 위험 | 회귀 가능 영역 |
|---|---|---|---|
| A. 공식 | 2-3 | **HIGH** | 대시보드 KPI / 모든 정산 페이지 / 분석 페이지 — 기존 데이터의 setting 값 의미 역전 |
| B. VAT | 2-3 | MEDIUM | 네이버 매체 포함 정산 결과 변경 |
| C. 매체 예산 | 1-2 | LOW | CampaignModal 입력 UX |
| D. CRUD | 2-3 | MEDIUM | 저장 실패 토스트가 새로 노출됨 |
| **합계** | **~9** | — | 5 files 초과 → §6 체크포인트 발동 |

---

## 3. 위험 평가

### 3.1 공식 변경의 데이터 일관성 위험
- 기존 캠페인은 모두 **현 공식 기준 (`× (1 - markup)`)** 으로 입력된 값. 코드만 바꾸면 기존 데이터의 "실 세팅 금액" 표시가 갑자기 다른 값으로 변경됨.
- 마이그레이션 옵션:
  - (i) **공식만 교체 + 재계산 안내** — 단순하지만 과거 정산 보고서와 불일치
  - (ii) **신규 캠페인만 새 공식 적용** — `Campaign.formulaVersion` 필드 도입
  - (iii) **이중 표시** — 두 공식 모두 보여주고 사용자 선택

### 3.2 두 공식의 비즈니스 의미 차이
- 현재 (×(1-m)): 예산 = 광고주 청구금, 세팅 = 매체 net 집행
- 신규 (÷m): 예산 = ?, 세팅 = ?  — 의미 정의 자체가 바뀌므로, 사용자가 정산서·계산서 발급에서 어떤 값을 어디에 쓰는지 재확인 필요

---

## 4. Human-in-the-Loop 체크포인트

§6 발동 사유:
- 5 files 이상 변경 (~9)
- 비즈니스 핵심 계산 로직 변경 (정산·계산서 직결)
- 데이터 의미 역전 위험

**승인 요청 항목** (다음 AskUserQuestion 으로 진행):
1. 실 세팅 공식 (A) `÷ markup` vs (B) `÷ (1 - markup)` 중 정확한 의도
2. 기존 캠페인 데이터의 마이그레이션 방식 (i/ii/iii)
3. 네이버 VAT 의 적용 위치 (실 세팅 금액 자체에 가산? 별도 라벨 표시?)
4. Phase D (CRUD 개선) 포함 여부 — 별도 트랙으로 분리할지

---

## 5. 실행 순서 (승인 후)

1. **Phase A**: 공식 교체 + 회귀 테스트 (대시보드/정산 페이지 수치 검증)
2. **Phase B**: 네이버 VAT 가산
3. **Phase C**: 매체별 총예산 sub 합산 자동화
4. **Phase D**: CRUD silent-fail 가시화 (선택)
5. 각 Phase: `npm run verify` → commit → push

§4 Two-Strike Rule 적용. §8 형식의 최종 보고.

---

## 6. 미해결 가설 / 추가 질의 후보

- 사용자가 "구글이며 거래처 수수료 20%" 표현 — "구글이고 거래처 수수료가 20%"의 오타로 해석. 맞는지 확인.
- 매체별 총예산이 "자동/수동 토글"인지 "조건부 자동(sub 있으면)"인지 확인.
- "예산"의 단위는 VAT 별도/포함? (네이버 외 매체도 VAT 별도가 일반적)
