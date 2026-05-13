# 대시보드·업로드·데이터 일관성 리워크 기획안

작성일: 2026-05-13
작성자: Claude (Anthropic) — AI 하네스 엔지니어링 룰 준수
근거: 사용자 메인 페이지 리뷰 + Explore/general-purpose 에이전트 4건 분석

---

## 1. 변경 목적

### 사용자 요청 6건
1. 메인 대시보드의 **워크플로우 설명(4그룹 화살표 카드)** 제거
2. 사라진 기능(리포트) 관련 영역 제거 — KPI "저장 리포트" + 하단 "최근 저장 리포트"
3. 캠페인 현황(카드) **간소화**
4. **매체 운영 콘솔 외부 링크 버튼 5개 추가** — 카카오모먼트 / 네이버 GFA / Google Ads / Meta Ads / CrossTarget
5. **이상 알림 강화** — 카운트만이 아니라 즉시 확인 가능한 UI
6. 리포트 데이터 업로드 페이지에서 **하단 이미지·raw 영역 제거**, 단 새 파일의 캠페인명·데이터는 업로드 당시 미리 확인 가능
7. **모달 vs 상세 분석 데이터 불일치** — 상세 분석(권위 함수 기준) 으로 통일

---

## 2. 분석 결과 요약 (4 에이전트)

### A. 메인 페이지 (`app/page.tsx`)
| 영역 | 라인 | 처리 |
|---|---|---|
| `WORKFLOWS` 상수 + 카드 렌더 | L26-68 / L371-397 | **제거** |
| KPI "저장 리포트" 카드 | L339-341 | **제거** |
| 하단 "최근 저장 리포트" 섹션 | L466-501 | **제거** |
| `useReports` import + `reportCount` | L13 / L225 / L291 | **제거** |
| `CampaignCard` 표시 항목 | L90-202 | **간소화** (캠페인명 / 광고주 / D-day / 소진률 + 색띠 / 매체 배지 + 전일대비 만) — 기간진행률 / 메모 / 예산 텍스트 / 풀 게이지 행 제거 |
| `alertCounts` 패널 | L344-369 | **강화**: 각 카테고리 클릭 시 status 페이지로 querystring 전달 → 자동 필터 적용 + 카드 형식 |

### B. daily 페이지 (`app/campaign/ct-plus/daily/page.tsx`)
| 영역 | 라인 | 처리 |
|---|---|---|
| 매체별 탭 + `DailyDataTable` | L454-490 | **제거** |
| 빈 상태 메시지 | L454-464 | **제거** |
| state: `activeTab` / `rowsByMedia` / `activeMediaTypes` | L65 / L206-217 | **제거** |
| imports: `MEDIA_LABEL_TO_TYPE` / `MEDIA_CONFIG` / `MediaType` / `DailyDataTable` | L4 / L6-7 / L22-27 | **제거** |
| CSV preview (행수 / 매체별 / 캠페인명) | L313-333 | **강화** — 매체별 그룹 헤더 + 전체 캠페인명 + 토글 펼침 |
| 전일/당일 비교표 (`comparisonRows`) | L360-451 | **유지** (의존성 안전 확인됨) |

### C. 모달 vs 상세 분석 데이터 불일치
| 항목 | 모달 (`CampaignDetailPanel.tsx`) | 상세 (`status/[id]/page.tsx`) | 권위 |
|---|---|---|---|
| rawRows | props 그대로 (마크업 미적용) | `applyMarkupToRows(rawRows, campaigns)` | **상세 ✓** |
| 소진률 분자 | `netAmount` 합 | `executionAmount` 합 | **상세 ✓** |
| KPI 매체별 계산 | 마크업 미적용 spd | 마크업 적용 spd | **상세 ✓** |

**통일 결정**: 모달 측 `campRows` 를 `applyMarkupToRows(rawRows, campaigns)` 후 필터링으로 변경. 소진률 분자를 `executionAmount` 합으로 통일. KPI 매체별 계산도 함께 정합.

### D. 외부 매체 운영 콘솔 URL (공식 사이트 검증 완료)
| 매체 | URL | 색상 |
|---|---|---|
| 카카오모먼트 | https://moment.kakao.com/ | #FEE500 |
| 네이버 GFA | https://gfa.naver.com/ | #03C75A |
| Google Ads | https://ads.google.com/ | #4285F4 |
| Meta Ads | https://adsmanager.facebook.com/ | #1877F2 |
| CrossTarget | https://manage.crosstarget.co.kr/ | #FF6B35 (추정 — 공식 미공개) |

---

## 3. 설계 결정

### 3.1 메인 페이지 새 구조
```
┌────────────────────────────────────────────────┐
│ 헤더: 광고 운영 대시보드     [매체 콘솔▾] [데이터 입력] │
├────────────────────────────────────────────────┤
│ KPI(3개): 집행 중 캠페인 / 전체 소진률 / 누적 소진금액   │
│ ── 저장 리포트 카드 제거 ──                          │
├────────────────────────────────────────────────┤
│ ⚠ 주의 필요 캠페인 (강화)                            │
│ ┌ 소진 과다 X개 │ 소진 저조 Y개 │ 종료 임박 Z개 ┐    │
│ └ 클릭 시 status 페이지 자동필터 적용 ┘             │
├────────────────────────────────────────────────┤
│ ── WORKFLOWS 카드 제거 ──                          │
├────────────────────────────────────────────────┤
│ 캠페인 현황 [전체 / 집행 중 / 종료]                  │
│ ┌ 간소화된 카드 (3열 그리드) ┐                      │
│ │ 캠페인명 + D-day                                │
│ │ 광고주 · 대행사                                  │
│ │ ▒▒▒▒░░░░░░ 소진률 73%   (전일대비 ▲ +5%)         │
│ │ 매체 도트 배지                                    │
│ └────────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

**외부 매체 콘솔 버튼** (검증 반영: 데스크톱 가로 + 모바일 컴팩트):
- 헤더 우측에 **가로 5버튼 chip 그룹** (lg 이상). 각 버튼: 매체색 도트 + 라벨 + 외부 아이콘.
- 모바일/sm 화면: 같은 영역을 **드롭다운(▾)** 으로 자동 축소 (`hidden sm:flex` + `sm:hidden`).
- 모든 버튼: `target="_blank" rel="noopener noreferrer"`.

**이상 알림 강화** (검증 반영: 메인 인라인 우선):
- 기존 동그란 chip → **카드 + 미니 리스트**. 각 카테고리(과다/저조/임박) 카드 안에 해당 캠페인명 상위 3건 직접 노출 (캠페인명 클릭 시 status 페이지로 점프).
- 카드 헤더 클릭 시 `?alert=overspend|underspend|expiring` 쿼리스트링 전달 → status 페이지 자동 필터.
- status 페이지는 querystring 진입 1회만 override, 그 후 변경은 sessionStorage 자동 저장 (R5).

### 3.2 daily 페이지 새 구조
```
┌────────────────────────────────────────────────┐
│ 헤더: 데이터 업로드 / 누적 X행 / [전체 초기화]         │
├────────────────────────────────────────────────┤
│ CSV 업로드 카드                                    │
│ [클릭하여 CSV 파일 선택]                            │
│ → 파일 선택 시 분석 결과 강화:                       │
│   · 총 X행 + 매체별 행수 배지                       │
│   · 감지된 캠페인 N개 (매체별 그룹, 전체 펼침 가능)     │
│ [업로드 확정]                                       │
├────────────────────────────────────────────────┤
│ 전일/당일 비교표 (유지)                              │
└────────────────────────────────────────────────┘
── 매체별 탭 + DailyDataTable 제거 ──
```

### 3.3 모달 데이터 통일 방안 (검증 반영: 부모 props 채택)
- `applyMarkupToRows(rows, campaigns)` 는 buildCsvLookup 으로 **전체 campaigns** 를 매칭 테이블로 쓰므로 단일 캠페인만 넘기면 매칭 누락 위험.
- **권장 흐름**:
  - 부모 `app/campaign/ct-plus/status/page.tsx` 가 `useMemo(() => applyMarkupToRows(rawRows, campaigns), [rawRows, campaigns])` 로 한 번 계산
  - 결과 `computedRows` 를 `CampaignDetailPanel` 에 props 로 전달
  - 모달은 props 받은 rows 를 `filter(r => r.matchedCampaignId === campaign.id)` 만 적용
- 소진률 분자: `rawNetTotal` → `executionAmount` 합 (`status/[id]` 의 `aggRows().spend` 와 동일)
- KPI 매체별 계산: byMedia 가 이미 `executionAmount` 사용 — 마크업 적용 결과를 받으므로 자동 정합

---

## 4. Phase 분할 (개발 단위)

AGENTS.md §6 (5+ 파일 동시 변경 시 사용자 사전 확인) 을 고려해 4 phase 로 분리. 각 phase: tsc + next build 통과 후 commit + push.

| Phase | 영역 | 영향 파일 수 | 핵심 변경 |
|---|---|---|---|
| **R1** | 데이터 통일 | 2 | status/page.tsx 가 computedRows 메모이즈 → CampaignDetailPanel props 전달, 소진률·KPI 모두 executionAmount 기준 |
| **R2** | daily 페이지 | 1 | 매체 탭 + DailyDataTable 제거, preview 강화 (매체별 그룹 + 캠페인 전체 펼침) |
| **R3+R5** | 메인 + status querystring | 2 | **반드시 동시 머지** — 메인의 이상 알림 인라인 mini-list + querystring 발행, status 페이지 진입 시 querystring 수신해 sessionStorage 와 공존 |
| **R4** | 외부 매체 콘솔 | 1-2 | 신규 `MediaConsoleMenu` 컴포넌트 (헤더에 가로 5버튼/모바일 드롭다운), `lib/mediaColors` 에 CrossTarget 색 추가 |

⚠ **R3+R5 동시성**: R3 단독 머지 시 메인의 알림 클릭이 status 페이지에서 필터 미적용 → "쉽게 확인" 의도 미충족 가능. 한 PR 또는 같은 머지 묶음 처리 필수.

---

## 5. 영향받는 파일 (총 6개 — 5+ 임계 근처)

```
app/page.tsx                                                    [R3]
app/campaign/ct-plus/daily/page.tsx                             [R2]
app/campaign/ct-plus/components/ct-plus/CampaignDetailPanel.tsx [R1]
app/campaign/ct-plus/status/page.tsx                            [R5]
components/MediaConsoleMenu.tsx (신규)                          [R4]
lib/mediaColors.ts (CrossTarget 색 추가)                        [R4]
```

5+ 파일에 해당. AGENTS.md §6 에 따라 **사용자 사전 승인 필요** — 본 기획안 자체로 승인 의제 제시.

---

## 6. 회귀 위험 + 검증 방법

| 위험 | 검증 |
|---|---|
| 모달 통일 후 기존 상세분석과 여전히 미일치 | 동일 캠페인의 모달 + 상세 둘 다 노출 후 노출/클릭/소진/CTR/CPC 값 sample 비교 |
| 매체 탭 제거 후 사용자가 raw 데이터 보고 싶을 때 경로 부재 | daily 페이지에서 status 페이지의 캠페인 상세 RAW 탭으로 이동 안내 |
| 외부 링크 보안 | 모든 외부 링크 `rel="noopener noreferrer"` + `target="_blank"` |
| querystring 필터가 sessionStorage 와 충돌 (UX-003 작업) | querystring 이 있을 때만 override, 없으면 sessionStorage 우선 |
| `applyMarkupToRows` 가 전체 campaigns 받아야 정확한 마크업 적용 — 모달에 `[campaign]` 만 넘기면 다른 캠페인의 마크업이 누락될 수 있음 | 부모(status/page.tsx) 가 `applyMarkupToRows(rawRows, campaigns)` 전체를 한 번 계산해 props 로 넘기는 흐름 채택 |

---

## 7. AGENTS.md 워크플로우 준수

| 룰 | 적용 |
|---|---|
| §3 Self-Review 5 step | 각 phase 별 git diff → npm run verify → 자기 점검 → 자동 수정 → 재검증 |
| §4 Two-Strike | 같은 에러 2회 실패 시 즉시 보고하고 멈춤 |
| §5 Layered | `lib/` 내 비즈니스 로직 신규 추가 (applyMarkupToRows 재사용 — 변경 없음) |
| §5 Immutability | `localStorage` 키 변경 금지 — 신규 querystring 만 추가 |
| §6 5+ 파일 변경 | 본 기획안으로 의제 제시, 사용자 승인 후 진행 |

---

## 8. 미결 / 사용자 확인 필요

1. **CrossTarget 브랜드 색 `#FF6B35`** — 공식 디자인 시스템 미공개라 추정. 운영팀이 정확한 색을 알면 알려 주세요.
2. **외부 매체 콘솔 진입 위치** — 헤더 드롭다운(권장) vs 워크플로우 자리(전 영역 사용) 중 선택.
3. **`CampaignCard` 간소화 강도** — 현재 안은 5개 항목만 남김. 만약 사용자가 예산 텍스트도 원하면 알려 주세요.
