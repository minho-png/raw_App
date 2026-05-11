# CT+ 캠페인 상세 · 모달 리팩토링 계획서

문서 위치: `docs/refactor-ct-plus-detail.md`
작성일: 2026-05-11
영향 라우트: `/campaign/ct-plus/status/[id]`, `/campaign/ct-plus/status` (CampaignModal)
관련 PR: #21 (claude/review-project-setup-aeFQp)

---

## 1. 요구사항 (사용자 메시지 기반)

| # | 요구 | 현재 | 변경 |
|---|---|---|---|
| R1 | 상세 페이지 금액 단위 | `900만원`, `334만원`, `110만`, `223만` | `9,000,000원`, `3,340,000원`, `1,100,000원`, `2,230,000원` (단위 약어 없음, 천 단위 콤마) |
| R2 | 탭 구조 | 단일 레벨: `요약 / 일별 / 주간 / 소재별 / 매체별 / RAW 편집` | 2단계: 상단 **매체 탭** → 하위 **기능 탭(요약/일별/주간/소재/RAW 편집)** |
| R3 | 필터 | 없음 | 각 기능 탭에 필터 (기간·검색 등) |
| R4 | 서브 캠페인 명칭 | "서브 캠페인" | "캠페인" |
| R5 | 매체 카드 총 예산 | 사용자 직접 입력 | 하위 캠페인 예산 합으로 **자동 산출 + read-only** |
| R6 | 수수료율 구분 | "총 수수료율 (%)", "거래처 수수료율 (%)" | **"DMP 수수료율 (%)"**, **"거래처 수수료율 (%)"** |

---

## 2. 영향 파일

| 파일 | 변경 종류 |
|---|---|
| `app/campaign/ct-plus/status/[id]/page.tsx` (687 LOC) | 큰 리팩토링 — 탭 구조, 단위 표기, 필터 |
| `app/campaign/ct-plus/components/ct-plus/CampaignModal.tsx` | "서브 캠페인" 라벨 → "캠페인" |
| `app/campaign/ct-plus/components/ct-plus/MediaBudgetCard.tsx` | 라벨 변경 + 총 예산 read-only + 수수료율 라벨 변경 |
| `app/campaign/ct-plus/components/ct-plus/SubCampaignList.tsx` | "서브 캠페인" 라벨 변경 |
| `lib/campaignTypes.ts` | `MediaBudget` 필드/계산 함수 점검 (필요시) |

---

## 3. 데이터 모델 영향

### 3-1. `MediaBudget` 필드 매핑 (현재 → 변경)

| 현재 필드 | 의미 | 변경 |
|---|---|---|
| `totalBudget` | 매체 전체 예산 (사용자 입력) | 캠페인 합으로 산출 (저장 시 derived) — 입력 비활성 |
| `totalFeeRate` | 총 수수료율 | 분리됨 → `dmpFeeRate` + `agencyFeeRate` (이미 존재) |
| `subCampaigns[]` | 서브 캠페인 배열 | UI 명칭 "캠페인" 으로 변경 (타입명 `SubCampaign` 그대로 유지 — 외부 호환) |

### 3-2. 수수료율 분리
현재 `MediaBudget`에는 이미 `dmp.agencyFeeRate`, `nonDmp.agencyFeeRate` 구조가 있고
`MEDIA_MARKUP_RATE`, `DMP_FEE_RATE` 상수가 별도. 모달은 단일 "총 수수료율" 슬롯만 노출.
→ UI에 두 슬롯으로 분리 노출하면 됨 (백엔드 데이터 영향 최소).

---

## 4. 단계별 실행 (Phase)

### Phase 1 — 금액 단위 정리 (저위험)
- `app/campaign/ct-plus/status/[id]/page.tsx`의 `formatMan` 사용처를 모두 `fmt(n) + "원"` 으로 치환
- 천 단위 콤마 유지, 단위 약어(`만`/`억`) 제거
- 다른 페이지(`/campaign/ct-plus/status`, 상세 요약 등)에 영향 없음 확인
- verify: tsc + build + 시각 확인

### Phase 2 — 매체 ⇄ 기능 탭 2단계 재구조
- L1 매체 탭: `campaign.mediaBudgets[].media` 동적 생성
- L2 기능 탭: 요약 / 일별 / 주간 / 소재 / RAW 편집
- 선택된 매체로 모든 데이터 필터링 (raw rows의 `media` 필드 매칭)
- 첫 진입: `mediaBudgets[0]` + `summary`
- "매체별" 단일 탭은 제거 (L1으로 흡수)

### Phase 3 — 각 탭별 필터
- 공통 상태: `dateRange`(전체/최근 7일/최근 30일/사용자 지정)
- 요약: 기간 필터
- 일별/주간: 기간 필터
- 소재: 광고그룹·소재명 검색
- RAW 편집: 기간 + 소재 검색

### Phase 4 — 모달 변경
1. `CampaignModal.tsx`, `SubCampaignList.tsx`, `MediaBudgetCard.tsx`에서
   "서브 캠페인" 텍스트 → "캠페인"
2. `MediaBudgetCard.tsx` — 총 예산 입력란을 read-only 표시
   값은 `mb.subCampaigns.reduce((s, sc) => s + sc.budget, 0)` 자동 계산
3. 수수료율 라벨 분리:
   - "총 수수료율" → "DMP 수수료율"
   - "거래처 수수료율" 유지 (그대로)

---

## 5. 단위 표기 유틸 결정

`status/[id]/page.tsx` 내부 함수:
```ts
// 변경 전
function formatMan(n: number) {
  if (n >= 100_000_000) return `${(n/100_000_000).toFixed(1)}억`
  if (n >= 10_000)      return `${(n/10_000).toFixed(0)}만`
  return fmt(n)
}

// 변경 후 — 전부 fmt(n) + "원" 로 대체
// fmt(n) = n.toLocaleString("ko-KR")
```

---

## 6. 검증 체크리스트

- [ ] tsc --noEmit 통과
- [ ] next build 통과
- [ ] 상세 페이지: KPI/매체×캠페인 집계의 모든 금액 "원" 단위로 표기
- [ ] 매체 탭 클릭 시 해당 매체 데이터만 표시
- [ ] 기능 탭별 필터 동작 (기간 변경 시 즉시 반영)
- [ ] 캠페인 모달: 매체 카드에서 "총 예산" 칸 비활성 + 캠페인 합과 일치
- [ ] 수수료율 슬롯이 DMP/거래처 두 필드로 분리
- [ ] 모달 라벨 "서브 캠페인" → "캠페인" 모두 반영

---

## 7. 비고

- 페이지가 687 LOC 라 phase별 분리 커밋 필수
- 기존 캠페인 데이터의 `totalBudget`은 보존하되 UI에서는 자동 계산값으로 덮음
  → 정산식(`getCampaignTotals` 등)은 영향 검토 필요
- "캠페인 제안" / "게재 목업" 메뉴는 직전 커밋(`b57fdee`)에서 사이드바 비공개 처리 완료
