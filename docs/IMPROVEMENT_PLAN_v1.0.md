# RAW_APP 개선 기획안 v1.0

> 작성: [PM 정훈/Orchestrator] | 2026-03-24
> 상태: 초안 (팀 토론 전)
> 대상: GFA RAW_APP - 한국 디지털 광고 캠페인 CSV 데이터 정제/분석/보고서 SaaS

---

## 현황 요약

| 항목 | 현재 상태 |
|------|----------|
| 인증 | Auth 스텁 (middleware.ts, auth.ts 모두 bypass) |
| 멀티테넌시 | SYSTEM_WORKSPACE_ID 하드코딩, 단일 워크스페이스 |
| 알림 | DB 저장만 가능, 이메일/Slack 발송 미구현 |
| 데이터 탐색 | 테이블 페이지네이션만 있음, 검색/필터 없음 |
| 파일 지원 | CSV만 가능, Excel(.xlsx) 미지원 |
| 테스트 | 자동화 테스트 0건 (scripts/ 내 수동 검증 스크립트만 존재) |
| AI 인사이트 | 캠페인 변경 시 캐시 초기화 안 됨 |
| 공유 보고서 | 비밀번호 보호 미구현 |
| ReportCenter | 1,584줄 단일 파일 (god component) |
| API 보안 | 입력 검증 없음, rate limiting 없음 |

---

## 우선순위 매트릭스 (임팩트 x 구현 난이도)

```
                높은 임팩트
                    |
    P0-3 (테스트)   |   P0-1 (검색/필터)
    P1-1 (Auth)     |   P0-2 (AI 캐시)
    P1-3 (알림)     |   P0-4 (API 검증)
                    |
  어려움 ----------+---------- 쉬움
                    |
    P2-1 (멀티테넌시)|   P1-2 (Excel)
    P2-3 (ReportCenter|  P1-4 (공유보고서)
          분리)     |
                    |
                낮은 임팩트
```

---

## P0 - 즉시 (이번 스프린트, ~5일)

### P0-1. 데이터 테이블 검색/필터 기능
**비즈니스 가치**: 마케터가 수천 건 데이터에서 특정 광고그룹/날짜/매체를 즉시 찾지 못하면 보고서 활용도가 0이다.

| 항목 | 내용 |
|------|------|
| 담당 | FE 지석, 디자인 유진 |
| 범위 | ReportCenter.tsx 처리 테이블에 검색바 + 매체/날짜 필터 추가 |
| 구현 | 클라이언트 사이드 필터링 (이미 전체 데이터 로딩 중) |
| AC | (1) 텍스트 검색으로 광고그룹명/캠페인명 필터링 (2) 매체 드롭다운 필터 (3) 날짜 범위 필터 (4) 필터 상태가 페이지네이션과 연동 |

### P0-2. AI 인사이트 캐시 무효화
**비즈니스 가치**: 새 CSV 업로드 후 이전 분석이 남아있으면 의사결정 오류 발생.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 |
| 범위 | CSV 업로드 성공 시 해당 캠페인의 ai_insights 삭제 |
| 파일 | `src/server/actions/settlement.ts` (savePerformanceData) + `src/services/workspaceRepository.ts` |
| AC | (1) CSV 업로드 완료 후 기존 AI 인사이트 자동 삭제 (2) 대시보드에서 "새 데이터 감지 - 재분석 필요" 안내 표시 |

### P0-3. 핵심 비즈니스 로직 단위 테스트 구축
**비즈니스 가치**: CalculationService 버그는 금액 오산출로 직결 - 수수료/DMP/VAT 계산이 틀리면 광고주 신뢰 상실.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (테스트 작성), 마케터 민수 (테스트 케이스 검증) |
| 범위 | Vitest 도입 + CalculationService 핵심 함수 테스트 |
| 대상 함수 | (1) 컬럼 매핑 (fuzzy rename) (2) DMP 타입 탐지 (3) VAT 별도 공급가액 계산 (4) 수수료 적용 로직 (5) 날짜 UTC 정규화 (6) pacing_index 계산 |
| AC | (1) `npm run test` 명령 동작 (2) CalculationService 핵심 로직 커버리지 80%+ (3) 실패 시 CI에서 빌드 차단 가능한 구조 |

### P0-4. API 입력 검증 강화
**비즈니스 가치**: 현재 모든 API가 `req.json()`을 무검증으로 받아 DB에 저장 - 잘못된 데이터 유입 시 복구 불가.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 |
| 범위 | Zod 스키마 도입, 4개 API Route(/api/v1/*) 입력 검증 |
| AC | (1) POST 요청에 Zod validation 적용 (2) 잘못된 입력 시 400 + 구체적 에러 메시지 (3) campaign_name 빈 문자열, fee_rate 범위(0~1), budget 양수 등 비즈니스 규칙 검증 |

---

## P1 - 다음 스프린트 (~7일)

### P1-1. NextAuth.js 인증 활성화
**비즈니스 가치**: SaaS 제품으로 외부 사용자 접근 시 인증 필수. 현재 누구든 접속 가능.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (OAuth 연동), FE 지석 (로그인 UI) |
| 범위 | Google OAuth + Credentials Provider |
| 파일 | `src/auth.ts`, `src/middleware.ts`, 신규 `/app/login/page.tsx` |
| AC | (1) Google OAuth 로그인/로그아웃 (2) 세션 기반 접근 제어 (3) API Route에 인증 체크 미들웨어 (4) /share/* 경로는 인증 예외 |
| 의존 | P0-4 (API 검증) 완료 후 진행 |

### P1-2. Excel(.xlsx) 파일 지원
**비즈니스 가치**: 광고 플랫폼(네이버, 카카오) 리포트가 xlsx로 다운로드되는 경우 빈번. CSV 변환 강요는 UX 저해.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (파서), FE 지석 (UI 수정) |
| 범위 | SheetJS(xlsx) 라이브러리 도입, FileUploader에서 .xlsx accept 추가 |
| AC | (1) .xlsx 파일 드래그앤드롭/선택 가능 (2) 내부적으로 CSV와 동일한 파이프라인으로 처리 (3) 다중 시트 시 시트 선택 UI |

### P1-3. 알림 실제 발송 (이메일)
**비즈니스 가치**: 예산 소진률 100% 초과 등 긴급 상황에서 앱 접속 없이 알림 수신 필요.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 |
| 범위 | Resend API 연동 (비용 효율적), 알림 이메일 템플릿 |
| AC | (1) alert_rules 트리거 시 이메일 발송 (2) 이메일 발송 실패 시 alert_events에 에러 로깅 (3) 일일 발송 한도 설정 (과금 보호) |

### P1-4. 공유 보고서 비밀번호 보호
**비즈니스 가치**: 광고주에게 공유 시 URL만으로 접근 가능하면 정보 유출 리스크.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (해시/검증), FE 지석 + 유진 (비밀번호 입력 UI) |
| 범위 | shared_reports에 password_hash 필드 추가, /share/[shareId] 진입 시 검증 |
| AC | (1) 공유 생성 시 비밀번호 설정 옵션 (2) bcrypt 해시 저장 (3) 비밀번호 입력 UI + 3회 실패 시 잠금 |

---

## P2 - 백로그 (향후 스프린트)

### P2-1. 실제 멀티테넌시 활성화
**비즈니스 가치**: 복수 광고주/대행사 운영을 위한 필수 인프라. Auth 완료 후 진행.

| 항목 | 내용 |
|------|------|
| 담당 | 도윤 (설계), 성준 (구현) |
| 범위 | workspace_id 동적 주입, 워크스페이스 CRUD UI, 멤버 초대 플로우 |
| 의존 | P1-1 (Auth) 완료 필수 |
| 리스크 | 기존 데이터 마이그레이션 필요 (system -> 실제 workspace_id) |

### P2-2. Slack 알림 연동
**비즈니스 가치**: 마케팅팀 내부 커뮤니케이션 채널에서 직접 알림 수신.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 |
| 범위 | Slack Incoming Webhook 연동 |
| 의존 | P1-3 (이메일 알림) 완료 후 |

### P2-3. ReportCenter.tsx 컴포넌트 분리
**비즈니스 가치**: 직접적 사용자 가치는 없으나, 1,584줄 단일 파일은 향후 모든 FE 작업의 병목.

| 항목 | 내용 |
|------|------|
| 담당 | 도윤 (구조 설계), 지석 (실행) |
| 범위 | 기능 단위 분리: UploadSection, DataTable, ChartSection, AiInsightPanel, BudgetOverview |
| 리스크 | 리팩토링 중 기존 기능 회귀 가능 -> P0-3 테스트 완료 후 진행 권장 |

### P2-4. 데이터 내보내기 (CSV/PDF)
**비즈니스 가치**: 처리된 보고서를 다운로드하여 사내 보고에 활용.

| 항목 | 내용 |
|------|------|
| 담당 | FE 지석, 디자인 유진 |

---

## 테스트 전략

### 현재 상태
- 자동화 테스트 **0건**
- `scripts/test_dmp_wifi.ts`, `scripts/test_groupby.ts` — 수동 검증 스크립트만 존재
- 검증 방식: `npm run dev` 후 수동 CSV 업로드 테스트

### 목표 테스트 피라미드

```
          E2E (P2)
         /       \
       통합 (P1)
      /           \
    단위 테스트 (P0)
```

### Phase 1: 단위 테스트 (P0 — 이번 스프린트)

**도구**: Vitest (Next.js 14와 호환, Jest보다 빠름, ESM 네이티브)

**대상 우선순위**:
1. `CalculationService` — 금액 계산, DMP 탐지, 컬럼 매핑
2. `repositoryService.ts` — upsert 로직 (MongoDB Memory Server)
3. `insightService.ts` — prompt 빌드 로직 (API 호출 mock)

**테스트 케이스 (민수 검증 필요)**:

| # | 테스트 | 검증 항목 | 기대값 |
|---|--------|----------|--------|
| 1 | 네이버GFA VAT 별도 계산 | supply 100,000 -> execution | 90,909 (100000/1.1) |
| 2 | 수수료 15% 적용 | execution 100,000, fee 0.15 | net_amount 85,000 |
| 3 | DMP 탐지 - SKP | ad_group "SKP_브랜드" | dmp_type: "SKP", has_dmp: true |
| 4 | DMP 탐지 - WIFI | ad_group "WIFI_타겟팅" | dmp_type: "WIFI", has_dmp: true |
| 5 | DMP 없음 | ad_group "일반캠페인" | dmp_type: "", has_dmp: false |
| 6 | 컬럼매핑 - 한글 | "노출수" | impressions |
| 7 | 컬럼매핑 - 영문 | "Clicks" | clicks |
| 8 | 날짜 UTC 정규화 | "2024-03-15" | UTC midnight |
| 9 | pacing_index | 예산 100만, 소진 60만, 기간 50% | 1.2 |
| 10 | 빈 CSV | 0행 데이터 | 에러 핸들링, 빈 배열 반환 |

**설정 파일**:
```
vitest.config.ts
  - tsconfig path aliases 해석
  - src/ 대상
  - coverage: v8
```

### Phase 2: 통합 테스트 (P1)

**대상**:
- API Route 핸들러 (/api/v1/campaigns, /api/v1/reports)
- Server Actions (savePerformanceData, saveCampaignAction)
- MongoDB 연동 (mongodb-memory-server)

### Phase 3: E2E 테스트 (P2)

**도구**: Playwright
**핵심 시나리오**:
1. 캠페인 생성 -> CSV 업로드 -> 대시보드 확인
2. AI 인사이트 요청 -> 결과 확인
3. 공유 보고서 생성 -> 외부 접근 확인

---

## 각 팀별 작업 범위

### BE 성준 (Safety First)

| 스프린트 | 작업 | 파일 |
|----------|------|------|
| P0 | Zod 스키마 + API 입력 검증 | `/api/v1/*/route.ts` |
| P0 | AI 캐시 무효화 로직 | `settlement.ts`, `workspaceRepository.ts` |
| P0 | Vitest 설정 + CalculationService 테스트 | `vitest.config.ts`, `__tests__/` |
| P1 | NextAuth.js 구현 | `auth.ts`, `middleware.ts` |
| P1 | Excel 파서 (SheetJS) | `calculationService.ts` |
| P1 | Resend 이메일 알림 | `scripts/worker/` |
| P1 | 공유 보고서 비밀번호 해시 | `workspaceRepository.ts` |

### FE 지석 (Performance King)

| 스프린트 | 작업 | 파일 |
|----------|------|------|
| P0 | 데이터 테이블 검색/필터 | `ReportCenter.tsx` |
| P1 | 로그인 페이지 UI | `/app/login/page.tsx` |
| P1 | .xlsx 업로드 UI | `FileUploader.tsx` |
| P1 | 비밀번호 입력 UI (공유보고서) | `/app/share/[shareId]/page.tsx` |
| P2 | ReportCenter 컴포넌트 분리 | 신규 컴포넌트 파일들 |

### 디자이너 유진 (UI Auditor)

| 스프린트 | 작업 | 파일 |
|----------|------|------|
| P0 | 검색/필터 UI 레이아웃 설계 | ReportCenter 영역 |
| P0 | "재분석 필요" 배너 디자인 | ReportCenter AI 섹션 |
| P1 | 로그인 페이지 디자인 | `/app/login/page.tsx` |
| P1 | 비밀번호 입력 모달 디자인 | 공유 보고서 페이지 |
| P1 | 시트 선택 UI (Excel) | FileUploader |

### 마케터 민수 (Business Validator)

| 스프린트 | 작업 | 산출물 |
|----------|------|--------|
| P0 | 테스트 케이스 검증 (VAT, DMP, 수수료) | 테스트 데이터 + 기대값 승인 |
| P0 | 검색/필터 요구사항 명세 | 필터 기준 목록 (어떤 필드로 검색 필요한지) |
| P1 | Auth 후 워크플로우 검증 | 로그인 -> 대시보드 -> 보고서 시나리오 |
| P1 | 알림 규칙 시나리오 | 어떤 조건에서 어떤 알림이 필요한지 |
| 전체 | 최종 QA 및 승인 | "광고주에게 보낼 수 있는가?" 판정 |

### 아키텍트 도윤 (Architect)

| 스프린트 | 작업 | 산출물 |
|----------|------|--------|
| P0 | 테스트 디렉토리 구조 설계 | `__tests__/` 폴더 구조 |
| P1 | Auth + 멀티테넌시 전환 설계 | 마이그레이션 계획 문서 |
| P2 | ReportCenter 분리 아키텍처 | 컴포넌트 트리 설계 |

---

## 성공 기준 (Definition of Done)

### 전체 공통
- [ ] TypeScript strict 모드 에러 0건
- [ ] `npm run build` 성공
- [ ] `npm run lint` 경고 0건
- [ ] DB 작업은 반드시 `repositoryService.ts` 또는 `workspaceRepository.ts` 경유
- [ ] `normalizeCampaignInput()` — CampaignConfig 저장 전 호출 확인
- [ ] `ensureRecords()` — `dfd.toJSON()` 후 호출 확인
- [ ] 신규 환경변수는 `.env.example` 업데이트

### P0 완료 기준
- [ ] `npm run test` 실행 시 CalculationService 핵심 10개 테스트 모두 통과
- [ ] 데이터 테이블에서 "네이버GFA" 필터 적용 시 해당 매체만 표시
- [ ] CSV 재업로드 후 AI 인사이트 캐시 자동 삭제 확인
- [ ] 잘못된 JSON으로 POST /api/v1/campaigns 호출 시 400 반환 확인
- [ ] 민수 최종 승인: "이 테이블로 매체별 성과를 즉시 확인할 수 있는가?" -> YES

### P1 완료 기준
- [ ] Google OAuth 로그인 후 대시보드 접근 가능
- [ ] .xlsx 파일 업로드 시 CSV와 동일한 결과 출력
- [ ] 알림 이메일 실제 수신 확인 (Resend sandbox)
- [ ] 공유 보고서에 비밀번호 설정 시 미입력 사용자 차단 확인
- [ ] 민수 최종 승인: "광고주에게 바로 보낼 수 있는가?" -> YES

### 품질 게이트 (모든 기능)
1. **마케터 피벗 테이블 테스트**: 민수가 출력 데이터를 Excel 피벗으로 가공 가능한가?
2. **광고주 프레젠테이션 테스트**: 대시보드 스크린샷이 광고주 보고에 바로 사용 가능한가?
3. **데이터 정합성**: 동일 CSV 2회 업로드 시 중복 데이터 없이 덮어쓰기 정상 동작?

---

## 리스크 및 의존성

| 리스크 | 영향도 | 대응 |
|--------|--------|------|
| ReportCenter 1,584줄에 기능 추가 시 회귀 | 높음 | P0-3 테스트부터 구축, P2에서 분리 |
| Danfo.js groupby 사용 금지 규칙 위반 | 높음 | 테스트에서 검증, 코드리뷰 체크리스트 |
| Auth 활성화 시 기존 API 호출 깨짐 | 중간 | /api/v1/* 경로 인증 체크를 middleware에서 관리 |
| MongoDB Memory Server가 Windows에서 불안정 | 중간 | Docker Compose의 MongoDB 사용 또는 testcontainers |
| Vitest + Next.js 14 path alias 호환 | 낮음 | vite-tsconfig-paths 플러그인 |

---

## 스프린트 일정 (제안)

```
P0 스프린트 (5일)
  Day 1: Vitest 설정 + 테스트 구조 (성준, 도윤)
  Day 1: 검색/필터 UI 설계 (유진), 요구사항 (민수)
  Day 2-3: CalculationService 테스트 작성 (성준)
  Day 2-3: 검색/필터 구현 (지석)
  Day 3: API Zod 검증 (성준)
  Day 4: AI 캐시 무효화 (성준)
  Day 4: 필터 + 페이지네이션 연동 (지석)
  Day 5: 민수 QA + 버그 수정 + 회고

P1 스프린트 (7일)
  Day 1-2: NextAuth 구현 (성준) + 로그인 UI (지석, 유진)
  Day 3-4: Excel 파서 + UI (성준, 지석)
  Day 5: 이메일 알림 (성준)
  Day 6: 공유 보고서 비밀번호 (성준, 지석)
  Day 7: 통합 QA (민수) + 회고
```

---

## 다음 단계

이 기획안은 **초안**입니다. 다음 팀 미팅에서 각 에이전트의 피드백을 수렴합니다:

1. **민수**: 비즈니스 우선순위 맞는지? 빠진 마케터 요구사항은?
2. **유진**: UI/UX 관점에서 검색/필터 설계 의견
3. **지석**: FE 성능 관점에서 클라이언트 필터링 vs 서버 필터링
4. **성준**: Vitest + Zod 구조, Auth 의존성 순서
5. **도윤**: 전체 아키텍처 관점에서 의존성/순서 적절성

**비즈니스 가치가 최우선. 결정되지 않은 코딩은 시간 낭비다.**

---

[PM 정훈/Orchestrator]
