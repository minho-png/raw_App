# CT/CTV 일자 범위 + 정산 Motiv 값 직접 표시 기획안

작성일: 2026-05-13
근거: 사용자 요청 + Explore 에이전트 분석

---

## 1. 변경 목적

| # | 요구 |
|---|---|
| 1 | CT/CTV 분석 페이지 — 월별뿐 아니라 **일자 범위(startDate ~ endDate)** 로도 조회 |
| 2 | 정산 4 페이지 — 월별 조회 흐름 그대로 유지 (변경 없음) |
| 3 | 정산 시 광고주·대행사 표시 — **Motiv API 값 직접 사용** (자체 master data 매칭 일시 우회). **추후 매칭 추가 예정** — 코드 삭제 금지, 우회만 |

---

## 2. 분석 요약

- `useMotivSettlementCampaigns` 가 이미 `month → start/end_date` 변환 (`monthToRange`) → **새 시그니처는 `month` 또는 `dateRange` 둘 다 받게 확장**
- CT/CTV 분석 페이지는 `<input type="month">` 사용 중 → **'월별' / '일자 범위' 토글** 추가
- 정산 페이지 4 곳은 모두 month 기반 — **변경 불요**
- `MotivSettlementTable` L56-73 의 `suggestedInternalAgencyId()` 가 자체 매칭 — **props flag 로 우회**

---

## 3. 설계

### 3.1 CT/CTV 분석 — 일자 범위 옵션 (Phase R1)

**훅 시그니처 확장** — `useMotivSettlementCampaigns`:
```ts
interface Options {
  types: MotivCampaignType[]
  month?: string                              // YYYY-MM (기존)
  dateRange?: { start: string; end: string }  // 신규 (우선순위 ↑)
  perPage?: number
  enabled?: boolean
}
```
- `dateRange` 가 있으면 `dateRange` 사용, 없고 `month` 가 있으면 기존 `monthToRange` 사용 → **역호환**
- `useMotivSettlementCampaignsByProduct(product, monthOrRange, enabled)` 도 옵션 객체로 확장

**페이지 UI**:
- 토글: `[ 월별 ▾ ]` / `[ 일자 범위 ▾ ]` chip 2개
- 월별 모드: 기존 `<input type="month">` 유지
- 일자 범위 모드: `<input type="date">` ×2 + 정합성 안내(시작일 > 종료일 시 경고) — 이미 ct/motiv-campaigns 의 `FilterBar` 패턴(min/max 양방향 제약) 재사용

### 3.2 정산 페이지 — 변경 없음

확인 결과 4 페이지 모두 월별 흐름 정상. **수정 없음**.

### 3.3 광고주·대행사 Motiv 값 직접 표시 (Phase R2)

**MotivSettlementTable 우회**:
- 신규 props: `directMotivDisplay?: boolean = false` (기본 기존 동작 유지)
- `true` 시:
  - 내부 master data 매칭 (`suggestedInternalAgencyId`) 호출하되 **결과를 무시**하고 Motiv API 값 직접 표시
  - 드롭다운 선택값은 매핑 안 된 상태로 두고, 표시 라벨만 `apiAgencyName` / `apiAdvName` 으로 노출
- L56-73 의 매칭 함수는 **그대로 둠** — props=true 일 때 결과만 무시

**호출처 변경**:
- 정산 4 페이지의 `<MotivSettlementTable>` 호출에 `directMotivDisplay` 옵션 명시. 우선 정산 페이지만 적용. CT/CTV 분석 페이지의 동일 컴포넌트 호출도 일관성 위해 같이 적용.

**향후 복구**: props 를 `false` 로 바꾸거나 prop 제거하면 즉시 기존 매칭 동작 복구.

---

## 4. Phase 분할

| Phase | 영역 | 영향 파일 수 |
|---|---|---|
| **R1** | `useMotivSettlementCampaigns` 시그니처 확장 + CT/CTV 분석 페이지 토글 UI | 3 (hook + 2 페이지) |
| **R2** | `MotivSettlementTable.directMotivDisplay` props + 호출처 적용 | 1 컴포넌트 + ≤6 호출처 |

각 Phase 영향 ≤ 7 파일. AGENTS.md §6 임계 안전 (Phase 분할).

---

## 5. 영향 파일

```
lib/hooks/useMotivSettlementCampaigns.ts                    [R1]
app/campaign/ct/analysis/page.tsx                           [R1+R2]
app/campaign/ct-ctv/analysis/page.tsx                       [R1+R2]
components/settlement/MotivSettlementTable.tsx              [R2]
app/settlement/sales-purchase/page.tsx (MotivSettlementTable 호출 시 props 추가)  [R2 — 호출처 점검]
app/settlement/agency-fee/page.tsx                          [R2 — 호출처 점검]
app/settlement/dmp-fee/page.tsx                             [R2 — 호출처 점검]
app/settlement/media-cost/page.tsx                          [R2 — 호출처 점검]
app/campaign/ct/motiv-campaigns/page.tsx                    [R2 — 호출처 점검]
```

호출처 6 곳 정도. props 기본값을 `false` 로 두면 사용 안 하는 곳은 변경 없음.

---

## 6. 회귀 위험

| 위험 | 대응 |
|---|---|
| `dateRange` 와 `month` 동시 입력 | hook 내부에서 `dateRange` 우선, `month` 무시 |
| 일자 범위가 너무 길어 API 부하 | 사용자 책임, 별도 가드 없음 (Motiv API 측 제한 따름) |
| `directMotivDisplay=true` 일 때도 매핑 저장 기능 동작 | 드롭다운은 그대로 — 사용자가 수동 매칭 가능. 표시 라벨만 우회 |
| 추후 매칭 복구 시 코드 위치 모름 | 모든 우회 지점에 `// TEMP[motiv-direct-display]` 주석 표시 — 검색 가능 |
| `useMotivStatsDaily` 의 date range 일관성 | 이미 startDate/endDate 받음 — CT/CTV 페이지에서 동일 dateRange 사용 |

---

## 7. AGENTS.md 준수

- §5 Immutability: `useMotivSettlementCampaigns` 시그니처 확장이되 **기존 month 인자 호환 유지** (옵션 객체 추가, 위치 인자 → 호환 wrapper)
- §6: Phase 분할로 각 phase ≤ 4 파일