# 메인 대시보드 — 도메인별 캠페인 현황 시각화 기획안

작성일: 2026-05-13
근거: 사용자 요청 + Explore 에이전트 분석

---

## 1. 변경 목적

사용자 요청 원문:
> "CT+, CT, CTV 캠페인 을 간략하게 확인 할 수 있는 시각화된 요소정도만 캠페인 현황으로 표기하고 각 매체별 운영 집행중인 캠페인을 표시하는 방식으로 나눠서 확인 가능하게 시각적으로 단순화"

핵심 의도:
- 메인의 캠페인 현황을 **CT+ / CT / CTV 3 도메인**으로 분리
- 각 도메인 안에서 **매체별** 집행 중 캠페인 분포 시각화
- **세부 행 없이** 단순 지표 + 분포 도트/막대

---

## 2. 분석 결과 요약 (Explore 에이전트)

| 항목 | 결과 |
|---|---|
| 현재 캠페인 카드 grid | `app/page.tsx:351-416` (CT+ 만, `filterStatus` 토글) |
| 데이터 출처 — CT+ | `useMasterData().campaigns` (이미 호출 중) |
| 데이터 출처 — CT | `useMotivSettlementCampaignsByProduct('CT')` (DISPLAY/VIDEO/PARTNERS) |
| 데이터 출처 — CTV | `useMotivSettlementCampaignsByProduct('CTV')` (TV) |
| 집행 중 필터 | CT+ `status.replace(/\s+/g,'')==='집행중'` / MOTIV `status==='Y'` |
| 색상 | `lib/mediaColors.ts` 의 `mColor()` 재사용 |
| 매체별 매핑 | CT+ `mediaBudgets[].media` (4개) / CT `campaign_type` (3) / CTV `campaign_type` (1) |
| API 부하 | CT + CTV 병렬 호출 ≤ 400행 — 경미 |

---

## 3. 설계

### 3.1 도메인 카드 레이아웃 (3 컬럼)

```
┌─ CT+ ──────────────────┐ ┌─ CT ───────────────────┐ ┌─ CTV ──────────────┐
│ 집행 중  N개 →         │ │ 집행 중 M개 →          │ │ 집행 중 K개 →      │
│                        │ │                        │ │                    │
│ 네이버 GFA  ●●● 3      │ │ DISPLAY     ●●●●● 5    │ │ TV     ●●●● 4      │
│ 카카오모먼트 ●● 2      │ │ VIDEO       ●●● 3      │ │                    │
│ Google      ●● 2       │ │ PARTNERS    ● 1        │ │ 평균 소진          │
│ META        ● 1        │ │                        │ │ ▓▓▓▓▓░░░ 65%       │
│ 평균 소진              │ │ 평균 소진              │ │                    │
│ ▓▓▓▓░░░░ 52%           │ │ ▓▓▓▓▓▓░░ 73%           │ │                    │
└────────────────────────┘ └────────────────────────┘ └────────────────────┘
```

### 3.2 도메인 카드 내용 (공통 구조)

| 영역 | CT+ | CT | CTV |
|---|---|---|---|
| 헤더 | "CT+ · 자체 입력" + N개 + 화살표(→ status 페이지) | "CT · 자체 DA" + M개 + 화살표 | "CTV · TV" + K개 + 화살표 |
| 분포 막대 (라벨 "분포") | 매체(4) 별 캠페인 수 + 매체색 도트 (한 캠페인이 여러 매체 포함 가능 — 중복 카운트) | campaign_type(3) 별 캠페인 수 + 매체색 도트 | TV 단일 |
| 핵심 지표 | 평균 소진률 (집행 중 캠페인 평균) | 평균 소진률 (`total_spent/total_budget`) | 평균 소진률 |
| 빈 상태 | "집행 중 캠페인이 없습니다" + 등록 링크 | 동일 | 동일 |
| 로딩 | MOTIV API 응답 대기 표시 | 동일 | 동일 |

**검증 반영 (v2)**:
- **A2 — MOTIV 집행 중 필터 강화**: `status === 'Y'` 만으로는 종료 캠페인 포함 위험 → `isActiveMotivCampaign(c, now)` 헬퍼 신설. `status === 'Y' && start_date ≤ now && now ≤ end_date` 적용. `useZeroSpendMotivCampaigns.ts:94-95` 패턴 재사용.
- **A3 — 평균 소진률 공식**: month 미지정 시 `stats.cost` 가 누적이라 "현재 집행률" 의미 모호 → `MotivCampaign.total_spent / total_budget` 사용 (필드 이미 존재, types.ts:60).
- **B2 — CT+ N:M 표시**: 도메인 카드 매체 분포 영역에 "분포" 라벨 명시 + 안내 ("한 캠페인이 여러 매체에 걸치면 중복 표기").

### 3.3 시각화 원칙
- **도트 시각화** (textbased + colored dot) 채택 — 차트 라이브러리 추가 호출 없음
- 매체별 라인: `{매체명}  ●●●●● {n}개` 형식. 도트 수는 캠페인 개수 (최대 8개까지 표시 + `+N`)
- 평균 소진률은 가는 게이지 바 + `%` 텍스트

### 3.4 인터랙션
- 카드 클릭(또는 화살표 클릭) → 각 도메인 페이지로 이동
  - CT+ → `/campaign/ct-plus/status?alert=...` 또는 단순 `/campaign/ct-plus/status`
  - CT → `/campaign/ct/analysis`
  - CTV → `/campaign/ct-ctv/analysis`
- 도메인 카드는 *세부 행 없이* — 더 자세히 보고 싶으면 클릭

---

## 4. Phase 분할

| Phase | 영역 | 영향 파일 | 비고 |
|---|---|---|---|
| **D1** | 신규 컴포넌트 `DomainStatusCard` (단일 도메인 카드) | `components/molecules/DomainStatusCard.tsx` 신규 1 | molecule — 재사용 |
| **D2** | 메인 페이지 교체 | `app/page.tsx` 1 | 캠페인 현황 섹션 교체 + MOTIV hook 호출 + 매체별 분포 계산 |

총 2 파일. 단일 commit 으로 묶을 수 있으나 D1 (컴포넌트) → D2 (페이지 통합) 분할이 git 리뷰 가독성 ↑. **단일 commit 으로 진행** (영향 작음).

---

## 5. 영향 파일

```
components/molecules/DomainStatusCard.tsx  (신규)
app/page.tsx                                (캠페인 현황 섹션 교체)
```

총 2 파일 — AGENTS.md §6 5+ 임계 안전.

---

## 6. 회귀 위험

| 위험 | 검증 |
|---|---|
| MOTIV API 호출 실패 시 도메인 카드 빈 상태 | hook 의 error 분기에서 "API 오류" 표시 |
| filter 토글 제거 → 종료 캠페인 못 봄 | 도메인 카드 클릭으로 상세 페이지(필터 지원) 이동 가능 — 의도된 단순화 |
| 매체별 분포 그룹화 시 캠페인이 여러 매체에 걸치는 경우 | CT+ 의 `mediaBudgets[]` 는 N:M — 한 캠페인이 매체별로 카운트됨 (정확한 분포 표현). 도메인 헤더의 캠페인 수는 unique 캠페인 |
| `CampaignCard` / `filterStatus` 등 미사용 코드 정리 | unused import/state 제거 |

---

## 7. AGENTS.md 하네스 엔지니어링 준수
- §3 5-step self-review: tsc + next build + 자기 검증
- §5 Layered: `lib/` 로직 변경 없음, hook 재사용
- §5 Immutability: `useMasterData` / `useMotivSettlementCampaignsByProduct` 시그니처 변경 없음
- §6: 영향 파일 2개로 임계 미만