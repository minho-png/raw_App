# CT+ 리포트 개선 기획안
> 작성일: 2026-03-31 | AI Harness Engineering 기반

---

## 1. 현황 분석 (As-Is)

### 1-1. 데이터 흐름
```
CSV 업로드 (daily/page.tsx)
  └── POST /api/parse-unified-csv
        └── parseUnifiedCsv() [lib/unifiedCsvParser.ts]
              ├── 읽는 컬럼: 일자, 매체, 광고그룹명, 소재명, 노출, 클릭, 총재생, 비용
              ├── 버리는 컬럼: 수집일, 계정명, 캠페인명, 캠페인ID, 광고그룹ID, 게재위치, 소재ID
              └── 반환: RawRow[] (per media)
  └── localStorage 저장 (ct-plus-daily-reports-v1)

report/page.tsx
  └── localStorage 로드 → allRows: RawRow[] 집계
  └── 5개 탭: summary | daily | dmp | media | creative
  └── HTML 다운로드: 텍스트 테이블만 (차트 없음)
```

### 1-2. 문제점 (Gap Analysis)

| 항목 | 현황 | 문제 |
|------|------|------|
| `캠페인명` | CSV에 있지만 RawRow에 미포함 | 캠페인별 분석 불가 |
| `계정명` | CSV에 있지만 RawRow에 미포함 | 계정별 분석 불가 |
| `총재생 (views)` | RawRow에 저장되나 리포트에서 미사용 | VTR/CPV 지표 산출 불가 |
| `게재위치` | 파싱 시 버려짐 | 지면별 분석 불가 |
| HTML 리포트 차트 | 테이블만 출력 | 시각화 없이 데이터 해석 어려움 |
| `supplyValue` | RawRow에 있으나 리포트에 미노출 | 원본 비용 vs 집행금액 대사 불가 |

---

## 2. 개선 방향 (To-Be)

### Phase 1 — 데이터 레이어 보강 ✅ (완료)
- [x] `RawRow`에 `campaignName`, `accountName` 필드 추가
- [x] `unifiedCsvParser.ts`에서 CSV `캠페인명`, `계정명` 컬럼 캡처
- [x] 모델명 공식 안정화: `imagen-4.0-ultra-generate-001`

### Phase 2 — 리포트 페이지 확장
- [ ] **영상 성과 탭** 추가: views, VTR (노출 대비 재생률), CPV (재생당 비용)
- [ ] **캠페인별 집계** 탭 추가: CSV 캠페인명 기준 impressions/clicks/cost 분해
- [ ] **계정별 집계** 탭 추가: 계정명 기준 분해
- [ ] 기존 summary에 `총재생수`, `VTR` KPI 카드 추가

### Phase 3 — HTML 리포트 시각화 강화
- [ ] **인라인 SVG 차트** 추가 (CDN 없이 독립 실행 가능)
  - 일별 추이: 집행금액 막대 + CTR 꺾은선 (이중축)
  - 매체별 비중: 가로 비율 바 차트
  - DMP 비중: 컬러 도넛 (CSS 기반)
- [ ] **영상 성과 섹션** 추가 (views > 0인 경우만 출력)
- [ ] **캠페인 브레이크다운** 테이블 추가
- [ ] 커버 페이지에 대행사/광고주 정보 추가

### Phase 4 — 데이터 대사 강화 (향후)
- [ ] `supplyValue` (공급가액) vs `executionAmount` (집행금액) 비교 섹션
- [ ] 게재위치(`게재위치` 컬럼) 파싱 및 지면별 성과 탭
- [ ] CSV 캠페인 ↔ 등록 캠페인 매칭 정확도 개선 (퍼지 매칭 고도화)

---

## 3. 구현 우선순위

```
P0 (이번 스프린트)
  ├── Phase 2: 영상 성과 탭 (VTR/CPV)
  ├── Phase 2: 캠페인별/계정별 탭
  └── Phase 3: HTML 리포트 SVG 차트 + 영상 섹션

P1 (다음 스프린트)
  └── Phase 4: supplyValue 대사, 게재위치 파싱

P2 (백로그)
  └── 통합 대시보드에 실시간 리포트 카드 노출
```

---

## 4. 데이터 구조 변경 (확정)

### RawRow 추가 필드
```typescript
interface RawRow {
  // ... 기존 필드 ...
  campaignName: string   // CSV 캠페인명 (원본) — Phase 1 ✅
  accountName: string    // CSV 계정명 (원본)  — Phase 1 ✅
}
```

### DailyReportParams 추가 필드 (HTML 생성용)
```typescript
interface DailyReportParams {
  // ... 기존 필드 ...
  videoData?: Array<{ date: string; views: number; vtr: number; cpv: number; impressions: number; cost: number }>
  campaignBreakdown?: Array<{ name: string; impressions: number; clicks: number; cost: number; ctr: number; cpc: number }>
  accountBreakdown?:  Array<{ name: string; impressions: number; clicks: number; cost: number; ctr: number; cpc: number }>
  reportMeta?: { advertiser?: string; agency?: string }
}
```

---

## 5. 아키텍처 원칙 (AI Harness Engineering 준수)

| 원칙 | 적용 |
|------|------|
| **Verify over Guess** | 모든 변경 후 `npm run verify` 3/3 통과 필수 |
| **lib/ = 순수 함수** | `htmlReportGenerator.ts`는 React 의존 없음 유지 |
| **단방향 데이터 흐름** | CSV → parser → RawRow → useMemo → chart/table |
| **localStorage 키 불변** | 기존 `ct-plus-daily-reports-v1` 구조 유지 |
| **공개 인터페이스 불변** | `generateDailyHtmlReport` 시그니처는 하위호환 유지 (optional 필드만 추가) |
