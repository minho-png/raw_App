# 코드베이스 구조 감사 보고서

> 문서: `docs/architecture-audit-2026-05-12.md`
> 작성: 2026-05-12
> 작성자: Claude (AI 실행 주체)
> 적용 규칙: `AGENTS.md` — 본 작업은 **코드 변경 없는 분석 작업** (Allowed 영역)
> 도메인 매핑: **CT+ = 셀프 매체** · **CT = 자체 DA 매체** · **CTV = TV 매체**

---

## 0. Executive Summary

본 보고서는 `/home/user/raw_App` 의 전체 구조를 도메인(CT+/CT/CTV/정산/공통) 별로 분리하여 분석하고, 각 영역의 **기능적 특징 → 구조적 특이점 → QA 위험 항목** 을 정리합니다.

핵심 결론:
- **3개 도메인이 서로 다른 데이터 수집 방식**: CT+ 는 모달 입력 + CSV 업로드, CT/CTV 는 외부 MOTIV API. 그러나 정산 페이지는 두 흐름을 혼합 사용하면서 **데이터 소스 일관성이 깨져 있음**.
- **`spendRate` (소진율)** 라는 동일 이름의 값이 페이지마다 다른 공식으로 계산됨 → 운영자 혼란 위험.
- 인증은 `middleware.ts` 가 `/api/v1/*` 전체를 보호 (서브에이전트 1차 보고의 "인증 없음" 주장은 정정).
- MongoDB 쓰기는 전체 배열 PUT 패턴이 잔존 (saveCampaigns 등) — 직전 Phase D 에서 단건 PATCH 가 도입됐으나 일부 호출원만 마이그레이션됨.

QA 후속 작업 후보 21건이 식별되었고, P0 3건 · P1 8건 · P2 10건 으로 분류했습니다.

---

## 1. 시스템 개요

### 1.1 디렉터리 토폴로지

```
raw_App/
├ app/                     # Next.js App Router
│  ├ api/
│  │  ├ auth/              # login / logout / me / init-admin
│  │  ├ cron/              # CRON_SECRET 헤더 검증
│  │  ├ motiv/             # MOTIV 외부 API 프록시 (CT/CTV)
│  │  ├ parse-raw / parse-unified-csv / generate-mockup-image
│  │  └ v1/                # 내부 도메인 API (campaigns, master-data, raw-data,
│  │                       #   settlements, settlement-overrides, performance,
│  │                       #   agencies, motiv-assignments, dmp-rules, reports)
│  ├ campaign/
│  │  ├ ct-plus/           # 셀프 매체 (8 페이지)
│  │  ├ ct/                # 자체 DA (MOTIV 연동)
│  │  └ ct-ctv/            # TV (MOTIV 연동 + raw 업로드)
│  ├ settlement/           # 4 페이지 (agency-fee, dmp-fee, media-cost, sales-purchase)
│  ├ management/           # 마스터 데이터 CRUD (대행사·광고주·운영자)
│  ├ login/ mockup/ manage/
│  └ page.tsx              # 메인 대시보드
├ lib/
│  ├ campaignTypes.ts      # Campaign / MediaBudget / SubCampaign 타입 + 계산식
│  ├ calculationService.ts # DMP 감지 + 정산 계산
│  ├ markupService.ts      # raw rows + campaigns 매칭 + 마크업 적용
│  ├ auth/                 # session.ts (HS-256 JWT) + cookies
│  ├ motivApi/             # productMapping, EXCLUDED 캠페인, etc.
│  ├ hooks/                # useMasterData, useRawData, useReports, useCtGroups,
│  │                       #   useDailySpendMap, useMotivSettlementCampaigns
│  ├ models/ repositories/ services/ controllers/   # 부분적으로 도입된 레이어드 패턴
│  └ mongodb.ts
└ middleware.ts            # 전 경로 세션 검증 (공개 경로 4종 외)
```

### 1.2 도메인 데이터 흐름 (요약)

| 도메인 | 입력 | 저장 | 가공 | 표시 |
|---|---|---|---|---|
| CT+ (셀프매체) | 캠페인 모달 + CSV 업로드 | MongoDB(`ct_master_data` + `ct_raw_batches`) + localStorage | `markupService.applyMarkupToRows` | overview/status/daily/final/view |
| CT (자체 DA) | MOTIV API fetch (`/api/motiv/campaigns?campaign_type=DISPLAY|VIDEO|PARTNERS`) | `motiv_assignments` 컬렉션 (대행사 매칭만) | `useMotivSettlementCampaignsByProduct('CT')` | ct/motiv-campaigns, ct/status |
| CTV (TV) | MOTIV API (TV) + raw CSV (ct-ctv/daily) | 동일 | 동일 + 일별 raw 파싱 | ct-ctv/analysis/daily/final/creative-check |
| 정산 | 위 3개 도메인 + 캠페인 모달 spend 필드 + raw data 합산 | localStorage 스냅샷 (`media-cost-snapshots-v1` 등) | 각 페이지 in-page 계산 | settlement/* |

---

## 2. 기능별 특징 정리

### 2.1 CT+ (셀프 매체) — 8 페이지

| 페이지 | 역할 | 핵심 의존성 |
|---|---|---|
| **overview** | 선택 캠페인 KPI 카드 · DMP별 소진 비교 · 일별 추이 · 연결 리포트 | useMasterData, useRawData, useDailySpendMap, calcDmpSettlement |
| **status** | 캠페인 목록 · 필터 · 이상치 감지(지연/초과/데이터누락) · 상태 토글 · 삭제 | upsertCampaign/deleteCampaign (Phase D) |
| **daily** | CSV 업로드 (RawBatch 누적) · 전일/당일 비교 · 매체별 뷰 | useRawData.addBatch |
| **final** | 월별 정산 · 캠페인별 부킹/세팅/순집행 · 세금계산서·대금지급 Excel | getCampaignTotals + getMediaTotals |
| **manage** | CtPlusGroup CRUD (마크업·예산 매핑) · 미연결 캠페인명 · 리포트 관리 | useCtGroups (별도 컬렉션) |
| **proposal** | DMP 타겟팅 · 매체 단가 제안서 → Excel | adSpecs.ts |
| **view** | 캠페인 선택 후 연결 리포트 필터 · 매체/일자 상세 | useReports |
| **creative-check** | 이미지/영상 규격 검증 · 랜딩 URL UTM/MMP 분석 | adSpecs.ts |

### 2.2 CT (자체 DA) — MOTIV 연동

- 입력: `/api/motiv/campaigns?campaign_type=DISPLAY|VIDEO|PARTNERS` (Motiv 데스크 API 프록시)
- `useMotivSettlementCampaignsByProduct('CT')` 이 3개 카테고리 병합
- `MotivCampaign[].adaccount_id` → `MotivAdAccount.agency_id` 로 내부 Agency 자동 매칭 시도
- 정산 지정(대행사/광고주/운영자 ID 매핑)은 `motiv_assignments` MongoDB 컬렉션에 단건 저장
- 페이지: `ct/motiv-campaigns` (필터바+페이지네이션+정산 테이블), `ct/status` (DISPLAY/VIDEO/PARTNERS KPI)

### 2.3 CTV (TV 매체)

- MOTIV TV 카테고리 + 자체 raw CSV 업로드 병행
- `ct-ctv/analysis` (성과 분석), `ct-ctv/daily` (raw 업로드 + 파싱), `ct-ctv/final` (종료 리포트), `ct-ctv/creative-check` (MP4 길이 15s/30s 검증)
- ⚠ 컴포넌트는 `components/ct-plus/MediaUploadCard` 를 재사용 — 이름은 CT+ 전용이지만 실제 도메인 무관

### 2.4 정산 (4 페이지)

| 페이지 | 데이터 소스 | 핵심 출력 |
|---|---|---|
| **agency-fee** | raw data `netAmount` (실 매체비) | 대행사별 수수료 정산 |
| **dmp-fee** | calcDmpSettlement(rawRows, campaigns) | DMP별 수수료 |
| **media-cost** | `mb.dmp.spend` + `mb.nonDmp.spend` (모달 수동값) + raw 폴백 *(BUG-006 fix)* | 매체별 비용 |
| **sales-purchase** | `executionAmount` (세금계산서 기준) | 매출·매입 |

### 2.5 데이터 레이어 / 인증

- **MongoDB**: 단일 DB `kim_dashboard`. 컬렉션 ≥6 개 (`ct_master_data`, `ct_raw_batches`, `motiv_assignments`, `ct_groups`, `settlements`, `settlement_overrides`, `dmp_rules`, `reports`)
- **localStorage**: `ct-plus-campaigns-v7`, `ct-plus-agencies-v1`, `ct-plus-advertisers-v1`, `ct-plus-operators-v1`, `ct-plus-raw-batches-v1`, `media-cost-snapshots-v1` 등
- **인증**: `middleware.ts` 가 `/login`, `/api/auth/login|init-admin`, `/api/cron/` 을 제외한 **전 경로** 에서 JWT 세션 쿠키 검증. `/api/v1/*` 도 보호됨 (서브에이전트 1차 주장 정정)
- 세션 secret: `SESSION_SECRET` env 우선, 폴백으로 `MONGODB_URI` 파생값 사용 (운영 미설정 시 약화)

---

## 3. 현재 구조의 특이점 (긍정적·중립)

### 3.1 좋은 패턴
- **레이어드 시작**: `lib/{models,repositories,services,controllers}` 부분적으로 도입 → 향후 풀 마이그레이션 가능
- **타입 안정성**: `Campaign`, `MediaBudget`, `SubCampaign` 등 핵심 타입이 한 곳(`campaignTypes.ts`)에 집중
- **localStorage 하이드레이션 → MongoDB 동기화**: 빠른 초기 렌더 + 서버 권위 패턴 일관 적용
- **미들웨어 일괄 인증**: 페이지·API 모두 한 곳에서 차단되어 라우트별 누락 위험 적음
- **Phase D 단건 PATCH/DELETE**: race condition 차단 (직전 작업)

### 3.2 중립적 특이점
- **CTV 의 컴포넌트 재사용**: `components/ct-plus/` 의 카드를 CTV 도 사용 → DRY 측면 좋지만 네이밍 오해 유발
- **2종의 raw 수집 경로**: CT+ daily 페이지 = `useRawData.addBatch`, CTV daily 페이지 = `MediaUploadCard` (별도 파서) → 동일 도메인 개념이 두 경로
- **CtPlusGroup 의 별도 존재**: `useCtGroups` (`ct_groups` 컬렉션) 가 Campaign 과 분리 — 의도가 명확하지 않음
- **HS-256 직접 구현**: Next 미들웨어에서 외부 lib 없이 JWT 검증 (lib/auth/session.ts) — 가벼움 vs 검증 신뢰성 트레이드오프

---

## 4. 이상한 점 / 안티패턴 / 잠재 버그

### 4.1 P0 — 운영 신뢰도 직결

| ID | 위치 | 증상 | 원인 |
|---|---|---|---|
| AUD-001 | overview/status/final 의 `spendRate` | 같은 이름이지만 페이지마다 분모·분자가 다른 공식 | overview: 세팅비용 분모 (모달값) / status: raw netAmount ÷ 세팅 / final: getCampaignTotals 의 spendRate. 운영자는 어느 값을 신뢰할지 결정 불가 |
| AUD-002 | settlement/agency-fee vs dmp-fee vs media-cost | 동일 캠페인·매체에 대해 3 페이지의 집행금액이 다를 수 있음 | agency-fee=raw netAmount, dmp-fee=raw rows로 재계산, media-cost=mb.spend(폴백 raw). 정합성 보장 함수 없음 |
| AUD-003 | daily(CT+)/page.tsx 의 `r.netCost` 참조 | RawRow 타입에 `netCost` 필드 없음 → 항상 undefined | markupService 가 computed row 에 netCost 를 attach 하지만, daily 페이지는 raw rows 자체를 참조하는 경로가 섞여 있음 |

### 4.2 P1 — 데이터 일관성 / UX

| ID | 위치 | 증상 |
|---|---|---|
| AUD-004 | manage/page.tsx 의 CtPlusGroup | CtPlusGroup에 mediaMarkups + csvNames 가 있으나 Campaign 에 반영되지 않음 — 이원 관리 |
| AUD-005 | ct-ctv/analysis | useMotivSettlementCampaignsByProduct('CTV') 호출하지만 화면은 mock 데이터만 표시 (주석 "MCP 미연결") → 실 데이터 표시 안 됨 |
| AUD-006 | productMapping.ts | `EXCLUDED_MOTIV_CAMPAIGN_NAMES` 가 하드코딩 — 테스트 캠페인 추가/제거 시 코드 수정 필요 |
| AUD-007 | useMotivSettlementCampaigns | Motiv stats 가 캠페인 누적값일 수 있는데 월별 overlap 계산으로 비례 분배 (의심) — 월별 정산 정확도 |
| AUD-008 | useCtGroups | useMasterData 와 동일한 결함 (Promise.all reject 시 무한 로딩) 가능성. 직전 Phase D-002 에서 useMasterData/useRawData 만 fix됨 |
| AUD-009 | saveAgencies (전체 배열 PUT) | management/page.tsx 의 시드/삭제 일괄 작업이 여전히 전체 배열 PUT → 동시 편집 race 잔존 |
| AUD-010 | components/ct-plus/MediaUploadCard 를 CTV 가 import | 도메인 의미 오염 — 향후 CT+ 만 변경하려 해도 CTV 깨질 위험 |
| AUD-011 | SESSION_SECRET fallback | 운영에서 SESSION_SECRET 미설정 시 MONGODB_URI 기반 파생값 사용 — 회피적 보안 |

### 4.3 P2 — 정리·문서·접근성

| ID | 위치 | 증상 |
|---|---|---|
| AUD-012 | getMediaTotals (campaignTypes:163) | unified 모드에서 `dmpSC = totalSettingCost, nonDmpSC = 0` 반환 — 후속 코드 어디서도 활용 안 함 |
| AUD-013 | markupService 의 cache 함수 | computed rows localStorage 캐시 함수 정의돼 있으나 호출원 없음 (dead code) |
| AUD-014 | detectDmpType 중복 | calculationService 가 adGroupName 으로 DMP 자동 감지하는데 캠페인 모달은 dmp/nonDmp 분리 입력 → 두 정보가 충돌 가능 |
| AUD-015 | localStorage 키 분산 | `ct-plus-raw-batches-v1` 가 useRawData 와 별도 업로더에서 중복 정의 가능성 (서브에이전트 보고) — 재검증 필요 |
| AUD-016 | snapshot 키 (media-cost-snapshots-v1 등) | 정산별로 다른 키 사용, 백업·내보내기 일관성 없음 |
| AUD-017 | UI 텍스트 "셋팅 비용" vs "세팅 금액" | 동일 개념인데 페이지마다 다른 라벨 |
| AUD-018 | "부킹" vs "총 예산" | final 테이블 "부킹금액" = mb.totalBudget — 의미 정의 문서 부재 |
| AUD-019 | "daily" 페이지 전일 비교 | 직전 날짜만 자동 계산 — 주말/공휴일 휴면 데이터 처리 미정의 |
| AUD-020 | ct/motiv-campaigns 페이지네이션 | 클라이언트 측 페이지네이션으로 보임 — 대량 데이터 시 모두 fetch |
| AUD-021 | TypeScript any/unknown 미흡 | route.ts 등 일부에서 `$push` cast `as never` 사용 (Phase D 도입) — Mongo 드라이버 타입 검토 필요 |

---

## 5. QA 후속 작업 우선순위 (권장)

### Phase R1 (P0) — 정합성 회복
- AUD-001: `spendRate` 정의를 lib 단일 함수로 통일 + 페이지 모두 동일 함수 호출
- AUD-002: 정산 데이터 소스 단일화 (raw netAmount 우선, mb.spend 폴백)
- AUD-003: daily 페이지 netCost 참조를 computed row 로 일관 변경

### Phase R2 (P1) — 도메인 정리
- AUD-005: ct-ctv/analysis mock 제거 + 실 Motiv 데이터 연결
- AUD-006: EXCLUDED_MOTIV_CAMPAIGN_NAMES 를 dmp-rules 컬렉션처럼 DB 관리
- AUD-008: useCtGroups try/finally 보강
- AUD-009: management 일괄 작업도 단건 호출로 마이그레이션 (시드/삭제)
- AUD-010: CTV 가 쓰는 카드 컴포넌트를 `components/shared/` 로 이동
- AUD-011: SESSION_SECRET 미설정 시 build 단계에서 fail (개발/프리뷰만 허용)

### Phase R3 (P2) — 청소
- AUD-013: dead cache 코드 제거 또는 활성화
- AUD-016/017/018: 라벨·키·용어 사전 정리 (`docs/glossary.md` 신설)
- AUD-019: 전일 비교에 영업일 옵션 추가
- AUD-020: ct/motiv-campaigns 서버 페이지네이션

---

## 6. 한계 / 추가 검증 필요

- 본 보고서는 정적 분석 위주. 실제 운영 데이터에서의 수치 불일치 정도는 라이브 검증 필요.
- AUD-007 (Motiv stats 의 월별 비례) 은 Motiv API 응답 샘플 없이는 단정 불가. 한 달 치 응답 캡처 후 재검토 권장.
- 보안 검토 (XSS, CSRF, 파일 업로드) 는 별도 트랙 — `/security-review` 슬래시 스킬로 추가 점검 권장.

---

## 7. 참고

- 관련 선행 문서: `docs/qa-fix-plan.md` (2026-05-11 QA 후속), `docs/db-crud-and-formula-fix-plan.md` (2026-05-12 CRUD/공식 개편), `lib/ARCHITECTURE.md`, `SPEC.md`
- 본 보고서는 코드 변경 없는 분석 작업으로, AGENTS.md §2 의 Allowed 범위 내에서 진행됨.
