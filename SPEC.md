# CT+ 캠페인 리포트 기능 기획서

> 작성일: 2026-03-31
> 대상 서비스: 크로스타겟플러스(CT+) 광고 운영 대시보드

---

## 1. 개요

CT+ 광고 캠페인의 **데이터 관리 → 성과 분석 → 보고서 출력**을 단일 워크플로우로 연결한다.
운영자는 캠페인을 등록하고, 매체 RAW 데이터를 업로드하여 파싱한 뒤, 통합 리포트와 종료 보고서를 생성·출력할 수 있다.

---

## 2. 전체 흐름

```
① 캠페인 등록 (집행 현황)
        ↓  [데이터 입력 →] 버튼
② 데일리 데이터 입력 (데일리 리포트)
        ↓  저장 후 [통합 리포트 보기 →] 토스트
③ 통합 리포트 조회 (다단계 필터링 가능)
        ↓  [HTML 다운로드] or [인쇄/PDF]
④ 종료 리포트 생성 (선택 섹션, HTML 출력)

⑤ 소재 및 랜딩URL 확인 (독립 기능)
```

---

## 3. 페이지별 기능 명세

### 3.1 캠페인 집행 현황 `/campaign/ct-plus/status`

| 기능 | 설명 |
|------|------|
| 캠페인 목록 | 상태·월·담당자·매체 필터, 텍스트 검색 |
| 캠페인 CRUD | 등록·수정·삭제, 상태 토글(집행 중/종료) |
| 소진율 시각화 | 바 그래프 + 색상 코딩 (파랑→초록→주황→빨강) |
| 집행 지연 알림 | 진행률 대비 소진율 15%p 이상 지연 시 경고 배너 |
| 대행사·광고주·운영자 관리 | 탭 전환 CRUD |
| 데이터 입력 바로가기 | 캠페인별 "데이터 입력" 클릭 → `/daily?campaignId={id}` |
| 빈 상태 | 캠페인 0개 시 등록 유도 UI 표시 |

**데이터 저장**: localStorage (`ct-plus-campaigns-v7` 등)

---

### 3.2 데일리 리포트 `/campaign/ct-plus/daily`

**입력은 한 번에** — 파일 업로드부터 저장까지 단일 플로우.

| 단계 | 내용 |
|------|------|
| STEP 1 파일 업로드 | 4개 매체(Google·네이버 GFA·카카오모먼트·META) 파일을 한번에 업로드 |
| STEP 2 캠페인 선택 | `?campaignId=` URL 파라미터로 자동 선택 가능 |
| STEP 3 데이터 확인 | 파싱 결과 테이블 확인 → 리포트 저장 |
| 저장 후 이동 | 저장 성공 시 "통합 리포트 보기 →" 링크 포함 토스트 표시 (4초) |

**지원 형식**: `.xlsx`, `.xls`, `.csv`
**DMP 자동 감지**: 광고그룹명 키워드(SKP, KB, LOTTE, TG360 등) 기반
**마크업 자동 적용**: 캠페인 설정(미디어 마크업 + DMP 수수료 + 대행사 수수료) 역산
**데이터 저장**: localStorage (`ct-plus-daily-reports-v1`)

---

### 3.3 통합 리포트 `/campaign/ct-plus/report`

**조회는 다단계** — 날짜 범위, 리포트 선택, 섹션 네비게이션 자유롭게 조합.

| 섹션 | 내용 |
|------|------|
| 전체 KPI | 노출·클릭·CTR·CPC·집행금액·NET 카드 + 매체별 요약 표 |
| 일별 추이 | 집행금액·CTR/CPC·노출/클릭 라인 차트 |
| DMP 정산 | DMP별 집행금액·순금액·수수료율·수수료금액 표 |
| 매체별 | 매체별 노출·클릭·CTR·비용 비교 차트 + 표 |
| 소재별 | 집행금액 기준 Top 10 소재 성과 |

**출력 방식**:
- **HTML 다운로드**: 외부 의존성 없는 단일 `.html` 파일 생성 (오프라인 열람, 공유 가능)
- **인쇄 / PDF**: 브라우저 인쇄 다이얼로그 호출

**빈 상태**: "데일리 데이터 입력하기" 버튼으로 `/daily` 페이지 이동 안내

---

### 3.4 종료 리포트 `/campaign/ct-plus/final`

| 기능 | 설명 |
|------|------|
| 파일 업로드 | 매체별 Excel 파일 업로드 (기존 daily 데이터와 별개) |
| 섹션 선택 | 전체 요약 KPI / 주차별 추이 / 매체별 비중 / 인구통계 / 소재별 / 인사이트 |
| 리포트 생성 | ReportViewer 컴포넌트로 시각화 |
| HTML 출력 | 선택 섹션만 포함한 단일 `.html` 파일 다운로드 |
| 이력 관리 | 최대 5개 이력 저장/복원/삭제 |

---

### 3.5 소재 및 랜딩URL 확인 `/campaign/ct-plus/creative-check`

| 기능 | 설명 |
|------|------|
| 이미지 규격 검수 | 300×250, 640×100, 640×960, 1200×627, 80×80 |
| 영상 규격 검수 | 1920×1080, 15초/30초, MP4 형식 |
| 랜딩 URL 분석 | UTM 파라미터(6종) + MMP 감지(AppsFlyer, Adjust, Branch 등) |
| 필수 파라미터 누락 체크 | clk_id, GAID 등 |

---

## 4. 데이터 모델

### 4.1 localStorage 키

| 키 | 타입 | 용도 |
|----|------|------|
| `ct-plus-campaigns-v7` | `Campaign[]` | 캠페인 목록 |
| `ct-plus-agencies-v1` | `Agency[]` | 대행사 목록 |
| `ct-plus-advertisers-v1` | `Advertiser[]` | 광고주 목록 |
| `ct-plus-operators-v1` | `Operator[]` | 운영자 목록 |
| `ct-plus-daily-reports-v1` | `SavedReport[]` | 데일리 입력 이력 |
| `ct-plus-final-history` | `SavedReport[]` | 종료 리포트 이력 |

### 4.2 핵심 타입 위치

| 타입 | 파일 |
|------|------|
| `Campaign`, `MediaBudget`, `TargetingBudget` | `lib/campaignTypes.ts` |
| `RawRow`, `DmpType` | `lib/rawDataParser.ts` |
| `MediaData`, `ReportSection`, `MediaType` | `lib/reportTypes.ts` |
| `DmpSettlement`, `DmpSettlementRow` | `lib/calculationService.ts` |

---

## 5. HTML 보고서 출력 명세

### 5.1 통합 리포트 HTML (`lib/htmlReportGenerator.ts`)

**함수**: `generateDailyHtmlReport(params: DailyReportParams): string`
**다운로드**: `downloadHtml(html, filename)` — Blob URL 방식

**포함 섹션**:
1. 커버 (제목·기간·생성일)
2. 전체 KPI 카드 (6개)
3. 일별 성과 추이 테이블
4. DMP 정산 테이블
5. 매체별 성과 테이블
6. 소재별 Top N 테이블

**파일명**: `CT+_통합리포트_YYYY-MM-DD.html`
**외부 의존성**: 없음 (인라인 CSS + 순수 HTML 테이블)
**오프라인 열람**: 가능

---

## 6. 사이드바 메뉴 구조

```
캠페인 리포트
  CT/CTV
    └ 종료 리포트
  CT+
    └ 캠페인 집행 현황   ← 진입점
    └ 데일리 리포트
    └ 통합 리포트
    └ 종료 리포트
    └ 소재 및 랜딩URL 확인
```

---

## 7. 제약 사항

| 항목 | 내용 |
|------|------|
| 데이터 영속성 | localStorage 기반 (서버 저장 없음, 브라우저별 격리) |
| 최대 저장 용량 | localStorage ~5MB 제한 |
| 다중 기기 동기화 | 미지원 |
| 지원 파일 형식 | `.xlsx`, `.xls`, `.csv` |
| 지원 매체 | 네이버 GFA, 카카오모먼트, Google, META |
| HTML 보고서 | 차트 미포함 (테이블 기반, 인쇄 최적화) |

---

## 8. 목업 데이터 제거 내역

| 위치 | 제거 항목 |
|------|-----------|
| `status/page.tsx` | `SAMPLE`, `SAMPLE_AGENCIES`, `SAMPLE_ADVERTISERS` 상수 및 fallback |
| `app/page.tsx` | `lib/mockData` import 제거, 더미 데이터 컴포넌트 제거 |
| `lib/mockData.ts` | 파일 미사용 상태 (참조 없음) |
