# CT/CTV 분리 페이지 구성 — 기획·설계 보고서

> 문서: `docs/ct-ctv-split-plan.md`
> 작성: 2026-05-12
> 작성자: Claude (AI 실행 주체)
> 검토 요청: 시스템 컨트롤러 (인간 승인 필요 — 새 페이지 신설 + 5 파일 초과)
> 적용 규칙: `AGENTS.md` AI Harness Engineering System

---

## 0. Executive Summary

사용자 요구:
> "CT+, CT, CTV는 (서로 다른 데이터). 연결된 API 데이터 중 CT 와 TV를 분리해서 각각의 페이지를 현재 목업 페이지처럼 구성해줘."

해석:
- **분리 대상**: MOTIV API 응답 (`/api/motiv/campaigns`) 의 `campaign_type` 필드를 기준으로 **CT (DISPLAY/VIDEO/PARTNERS)** 와 **CTV (TV)** 를 분리.
- **목업 페이지 = `app/campaign/ct-ctv/analysis/page.tsx`** (849줄, mock 캠페인 9건 + KPI 카드 + 알람 + 시간대 차트 + 정산 테이블).
- **분리된 각 도메인용 분석 페이지**를 동일 디자인으로 구성 + 실 MOTIV 데이터 연결.

---

## 1. 현황

### 1.1 기존 페이지
| 페이지 | 상태 | 비고 |
|---|---|---|
| `app/campaign/ct/motiv-campaigns/page.tsx` | 실 데이터 | 테이블+필터+페이지네이션 (분석 X) |
| `app/campaign/ct/status/page.tsx` | 실 데이터 | DISPLAY/VIDEO/PARTNERS KPI |
| `app/campaign/ct-ctv/analysis/page.tsx` | **mock + 일부 hook 미사용** | KPI 카드/알람/차트 디자인 — 본 작업의 목업 레퍼런스 |
| `app/campaign/ct-ctv/daily/page.tsx` | raw CSV | 별도 |
| `app/campaign/ct-ctv/final/page.tsx` | 정산 | 별도 |

### 1.2 productMapping (기존 분리 로직)
```ts
// lib/motivApi/productMapping.ts
motivTypeToProduct('DISPLAY' | 'VIDEO' | 'PARTNERS') → 'CT'
motivTypeToProduct('TV')                               → 'CTV'
productToMotivTypes('CT')  → ['DISPLAY', 'VIDEO', 'PARTNERS']
productToMotivTypes('CTV') → ['TV']
```
이미 분리 함수 완비. `useMotivSettlementCampaignsByProduct(product, month)` 가 product 인자로 자동 분기.

### 1.3 MOTIV API 응답 (`MotivCampaign.stats`)
mock DailyMetrics 와 1:1 매핑 가능한 필드 보유:

| mock 필드 | MOTIV stats 필드 | 비고 |
|---|---|---|
| impressions | `v_impression` 또는 `win` | 노출 |
| clicks | `click` | 클릭 |
| spend | `cost` 또는 `revenue` | "비용"의 정의에 따라 |
| agencyFee | `agency_fee` | |
| dmpFee | `data_fee` | DMP 수수료 |
| mediaCost | `cost - agency_fee - data_fee - profit` | 도출값 |
| completedViews | `v_play100` | VTR 분자 |
| ctr | `ctr` | 직제공 |
| profit_rate | `profit_rate` | 직제공 |

### 1.4 전일 비교 한계
- mock 은 today / yesterday 둘 다 자체 생성.
- MOTIV API 는 캠페인 누적값 stats 제공이 기본. 일별 분리값은 별도 endpoint(미확인) 필요.
- **본 기획에서는 전일 비교를 "오늘 누적 vs 전일자 0시 스냅샷" 또는 "전일 동시각 비교"로 단순화 → 1차에서는 비활성화 또는 "데이터 미연동" 표시**, 2차에서 일별 endpoint 도입.

---

## 2. 변경 설계

### 2.1 페이지 배치 (3가지 옵션)

**옵션 A — 신규 분석 페이지 2개 신설 (기존 mock 유지)** *(권장)*
```
app/campaign/ct/analysis/page.tsx     [신규] — CT(DISPLAY/VIDEO/PARTNERS) 실데이터
app/campaign/ct-ctv/analysis/page.tsx [기존 유지 — mock] — 디자인 레퍼런스
app/campaign/ctv/analysis/page.tsx    [신규] — CTV(TV) 실데이터
```
- 장점: 기존 mock 페이지가 디자인 참고용으로 보존됨 (사용자가 "목업처럼"으로 지칭하는 화면 유지)
- 단점: 같은 페이지 3개 (mock 1 + 실데이터 2)

**옵션 B — 기존 mock 페이지를 두 개로 분리 + 실데이터 연결**
```
app/campaign/ct/analysis/page.tsx      [신규] — CT 실데이터
app/campaign/ct-ctv/analysis/page.tsx  [교체] — CTV 실데이터 (mock 제거)
```
- 장점: mock 데이터 제거 (AUD-005 동시 해결)
- 단점: mock UI 손실 → 디자인 비교 어려움

**옵션 C — 단일 페이지에 product 토글 (CT/CTV 한 페이지에서 전환)**
```
app/campaign/analysis/page.tsx [신규] — product=CT|CTV 탭으로 전환
```
- 장점: 컴포넌트 1개로 유지
- 단점: 사용자가 "각각의 페이지"를 명시 → 의도와 불일치

### 2.2 공통 분석 컴포넌트 추출
`components/analysis/` 신설:
- `<KpiCard>` — 오늘/전일/임계값 비교 카드 (mock에서 추출)
- `<AlertIcon>` — 이상/상승 아이콘 + 툴팁
- `<HourlyChart>` — 24시간대 차트 (recharts LineChart)
- `<MotivKpiBoard product="CT"|"CTV" month={...} />` — 위 카드들을 product별로 묶음

→ ct/analysis 와 ctv/analysis 가 동일 컴포넌트를 product prop 만 바꿔 재사용.

### 2.3 데이터 매핑 레이어
`lib/motivApi/statsMapper.ts` 신설:
```ts
export interface UnifiedDailyMetrics {
  impressions: number; clicks: number; spend: number;
  agencyFee: number; dmpFee: number; mediaCost: number;
  completedViews: number; ctr: number; profitRate: number;
}
export function motivStatsToMetrics(stats: MotivCampaignStats): UnifiedDailyMetrics
export function aggregateMotivStats(campaigns: MotivCampaign[]): UnifiedDailyMetrics
```
- mock 의 `DailyMetrics` 와 동일 스키마로 통일 → 컴포넌트는 mock/실데이터 무관.

### 2.4 카테고리 구분 (CT 내부)
mock 의 `Category = 'total' | 'display' | 'video' | 'ctv'` 를 product 별로 분기:
- **CT 페이지**: `'total' | 'display' | 'video' | 'partners'`
- **CTV 페이지**: `'total'` 만 (TV 단일)

### 2.5 영향 범위 (예상)
| 항목 | 파일 |
|---|---|
| 신규 페이지 | ct/analysis/page.tsx, ctv/analysis/page.tsx (옵션 A 기준 2건) |
| 신규 컴포넌트 | components/analysis/{KpiCard,AlertIcon,HourlyChart,MotivKpiBoard}.tsx (~4건) |
| 신규 매퍼 | lib/motivApi/statsMapper.ts |
| 사이드바 메뉴 추가 | components/Sidebar.tsx |
| 기존 mock 페이지 처리 | (옵션 A) 미변경 / (옵션 B) 두 개로 분리 |
| **합계** | **8~10 파일** |

§6 체크포인트 발동 — 사용자 승인 필수.

---

## 3. 위험 평가

| 항목 | 위험도 | 완화책 |
|---|---|---|
| 전일 비교 데이터 부재 | HIGH | 1차: 비활성화/안내, 2차: 일별 stats endpoint 또는 자체 일별 스냅샷 컬렉션 |
| MOTIV API rate limit / 응답 지연 | MEDIUM | 기존 useMotivSettlementCampaigns 의 SWR 패턴 유지 |
| mock 알람 임계값(DEFAULT_SETTINGS)이 실 데이터와 동떨어질 가능성 | MEDIUM | 페이지 상단에 임계값 조정 UI 노출 (이미 mock 에 존재) |
| ct-ctv 디렉터리 구조와 ctv 신규 디렉터리 공존 시 혼란 | LOW | 사이드바에서 명시적 라벨 분리 ("CTV 분석" vs "CT/CTV 통합 정산") |

---

## 4. Human-in-the-Loop 체크포인트

§6 발동 사유:
- 새 페이지 신설 (5 파일 초과)
- 도메인 구조 변경 (CT vs CTV 분리)

**승인 요청 항목** (다음 AskUserQuestion):
1. 페이지 배치 옵션 A/B/C 중 선택
2. CT 페이지의 카테고리 분기 — DISPLAY/VIDEO/PARTNERS 별 토글 노출 여부
3. 전일 비교 데이터 — 1차에서 비활성화 vs mock 임시 표시 vs 보류
4. 사이드바 메뉴 위치 (CT 분석 / CTV 분석을 어느 그룹 아래)

---

## 5. 실행 순서 (승인 후)

1. statsMapper.ts + 공통 컴포넌트 추출 (mock 페이지에서 KpiCard/AlertIcon 분리)
2. ct/analysis/page.tsx 신설 (product='CT')
3. ctv/analysis/page.tsx 신설 (product='CTV') — 옵션 B 면 ct-ctv/analysis 교체
4. Sidebar 메뉴 추가
5. verify + commit + push

§4 Two-Strike Rule 적용. §8 형식의 최종 보고.
