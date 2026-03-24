# RAW_APP 개선 기획안 v2.0

> 작성: [PM 정훈/Orchestrator] | 2026-03-24
> 상태: **확정 (팀 토론 완료)**
> 버전: v1.0 초안 -> v2.0 (4개 에이전트 토론 결과 반영)
> 대상: GFA RAW_APP - 한국 디지털 광고 캠페인 CSV 데이터 정제/분석/보고서 SaaS

---

## 변경 이력

| 버전 | 날짜 | 변경 사항 |
|------|------|----------|
| v1.0 | 2026-03-24 | 초안 작성 (팀 토론 전) |
| v2.0 | 2026-03-24 | 팀 토론 결과 반영: Hotfix 3건 추가, P0 순서 변경, P0-5 신규, P1 2건 추가, 기술 결정 사항 확정 |

---

## HOTFIX - 즉시 처리 (스프린트 외, P0 착수 전 완료 필수)

> **[BE 성준] 코드 감사에서 발견된 보안/데이터 무결성 버그 3건.**
> 이 항목들은 스프린트 대상이 아닌 **즉시 핫픽스**로 처리한다.

### HF-1. 공유 보고서 supply_value 데이터 유출

| 항목 | 내용 |
|------|------|
| 심각도 | **CRITICAL - 보안** |
| 현상 | `share/[shareId]/route.ts`에서 응답 데이터 strip 시 `supply_value` 필드 누락 |
| 리스크 | 공유 보고서 수신자가 공급가액(원가)을 역산할 수 있음 -> 수수료 구조 노출 |
| 수정 | 공유 보고서 응답의 필드 화이트리스트에 `supply_value` strip 추가 |
| 담당 | BE 성준 |
| AC | 공유 보고서 API 응답에 `supply_value`, `fee_rate`, `net_amount` 등 민감 필드가 포함되지 않음을 수동 검증 |

### HF-2. deleteCampaign 트랜잭션 누락

| 항목 | 내용 |
|------|------|
| 심각도 | **HIGH - 데이터 무결성** |
| 현상 | 캠페인 삭제 시 4개 컬렉션(`campaign_configs`, `raw_metrics`, `processed_reports`, `ai_insights`) 순차 삭제에 트랜잭션 없음 |
| 리스크 | 중간 실패 시 고아 데이터 발생 (예: config 삭제됐으나 metrics 잔존) |
| 수정 | MongoDB session + `withTransaction()` 래핑 |
| 담당 | BE 성준 |
| AC | (1) 4개 컬렉션 삭제가 원자적으로 실행됨 (2) 중간 실패 시 전체 롤백 확인 |

### HF-3. upsertCampaignData 트랜잭션 누락

| 항목 | 내용 |
|------|------|
| 심각도 | **HIGH - 데이터 무결성** |
| 현상 | CSV 재업로드 시 기존 데이터 delete -> 신규 데이터 insert 사이에 트랜잭션 없음 |
| 리스크 | delete 성공 후 insert 실패 시 데이터 유실 (복구 불가) |
| 수정 | MongoDB session + `withTransaction()` 래핑 |
| 담당 | BE 성준 |
| AC | (1) delete-insert가 원자적 실행 (2) insert 실패 시 기존 데이터 보존 확인 |

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
| 공유 보고서 | 비밀번호 보호 미구현, supply_value 유출 (HF-1) |
| ReportCenter | 1,584줄 단일 파일 (god component) |
| API 보안 | 입력 검증 없음, rate limiting 없음 |
| 데이터 재처리 | 수동으로 개발팀에 요청해야 함 |
| 트랜잭션 | 삭제/업서트에 트랜잭션 없음 (HF-2, HF-3) |

---

## 우선순위 매트릭스 (임팩트 x 구현 난이도)

```
                높은 임팩트
                    |
    P0-1 (Zod)     |   P0-4 (검색/필터)
    P0-2 (테스트)   |   P0-3 (AI 캐시)
    P0-5 (재처리)   |
                    |
  어려움 ----------+---------- 쉬움
                    |
    P2-1 (멀티테넌시)|   P1-1 (Auth)
    P2-3 (ReportCenter|  P1-2 (Excel)
          분리)     |   P1-3 (정산확정)
                    |   P1-4 (CSV 내보내기)
                낮은 임팩트
```

> **P0 순서 변경 근거** (v1.0 대비):
> [BE 성준] 제안 채택 - Zod 검증이 가장 먼저 와야 후속 기능들의 입력 안전성이 보장됨.
> Vitest는 Zod 스키마를 테스트 대상으로 포함하므로 Zod 이후가 효율적.
> AI 캐시와 검색/필터는 독립적이므로 병렬 진행 가능.

---

## P0 - 즉시 (이번 스프린트, ~6일)

### P0-1. API 입력 검증 강화 (Zod)

**비즈니스 가치**: 모든 API가 `req.json()`을 무검증으로 받아 DB에 저장 - 잘못된 데이터 유입 시 복구 불가.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 |
| 범위 | Zod 스키마 도입, 4개 API Route(/api/v1/*) 입력 검증 |
| AC | (1) POST 요청에 Zod validation 적용 (2) 잘못된 입력 시 400 + 구체적 에러 메시지 (3) 비즈니스 규칙 검증 포함 |

**Zod 적용 우선순위** ([BE 성준] 제안):

| 순서 | API 그룹 | 우선도 | 이유 |
|------|----------|--------|------|
| 1 | campaigns (CRUD) | Critical | 금액/비율 필드 직접 입력, 오염 시 모든 하위 데이터 영향 |
| 2 | alerts (규칙 설정) | High | 잘못된 규칙이 오알림/누락 발생 |
| 3 | reports (보고서 조회) | Medium | 쿼리 파라미터 검증 |
| 4 | ai (인사이트 요청) | Low | 내부 처리 위주, 입력 단순 |

**검증 규칙 예시**:
- `campaign_name`: 비어있지 않은 문자열, 최대 200자
- `fee_rate`: 0 이상 1 이하 숫자
- `budget`: 양수 (0 초과)
- `media_type`: enum 검증 (허용된 매체 목록)

### P0-2. 핵심 비즈니스 로직 단위 테스트 구축 (Vitest)

**비즈니스 가치**: CalculationService 버그는 금액 오산출로 직결 - 수수료/DMP/VAT 계산이 틀리면 광고주 신뢰 상실.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (테스트 작성), 마케터 민수 (테스트 케이스 검증) |
| 범위 | Vitest 도입 + CalculationService 핵심 함수 테스트 |
| 대상 함수 | (1) 컬럼 매핑 (fuzzy rename) (2) DMP 타입 탐지 (3) VAT 별도 공급가액 계산 (4) 수수료 적용 로직 (5) 날짜 UTC 정규화 (6) pacing_index 계산 |
| AC | (1) `npm run test` 명령 동작 (2) CalculationService 핵심 로직 커버리지 80%+ (3) 실패 시 CI에서 빌드 차단 가능한 구조 |

**테스트 케이스 (v2.0 수정 반영)**:

| # | 테스트 | 검증 항목 | 기대값 | v2.0 변경사항 |
|---|--------|----------|--------|-------------|
| 1 | 네이버GFA VAT 별도 계산 | supply 100,000 -> execution | 90,909 (100000/1.1) | - |
| 2 | 수수료 15% 적용 | execution 100,000, fee 0.15 | net_amount 85,000 | - |
| 3 | DMP 탐지 - SKP | ad_group "SKP_브랜드" | dmp_type: "SKP", has_dmp: true | **대소문자 무시 검증 추가**: "skp_브랜드", "Skp_타겟" 도 탐지 |
| 4 | DMP 탐지 - WIFI | ad_group "WIFI_타겟팅" | dmp_type: "WIFI", has_dmp: true | **위치 중립 검증 추가**: "브랜드_wifi_30대", "타겟팅wifi" 등 어디에 있든 탐지 |
| 5 | DMP 없음 | ad_group "일반캠페인" | dmp_type: "", has_dmp: false | - |
| 6 | 컬럼매핑 - 한글 | "노출수" | impressions | - |
| 7 | 컬럼매핑 - 영문 | "Clicks" | clicks | - |
| 8 | 날짜 UTC 정규화 | "2024-03-15" | UTC midnight | - |
| 9 | pacing_index 계산 | 예산 100만, 소진 60만, 기간 50% | 1.2 | **방향 명시**: >1.0 = 초과소진(과다), <1.0 = 미소진(여유) |
| 10 | 빈 CSV | 0행 데이터 | 에러 핸들링, 빈 배열 반환 | - |
| 11 | DMP 타입 필터링 | 전체 데이터에서 dmp_type="SKP" 필터 | SKP DMP 행만 반환 | **신규** (민수 요청) |

**설정 파일**:
```
vitest.config.ts
  - tsconfig path aliases 해석 (vite-tsconfig-paths)
  - src/ 대상
  - coverage: v8
```

### P0-3. AI 인사이트 캐시 무효화

**비즈니스 가치**: 새 CSV 업로드 후 이전 분석이 남아있으면 의사결정 오류 발생.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (로직), FE 지석 + 디자인 유진 (배너 UI) |
| 범위 | CSV 업로드 성공 시 해당 캠페인의 ai_insights 무효화 + 재분석 유도 배너 |
| 파일 | `src/server/actions/settlement.ts` (savePerformanceData) + `src/services/workspaceRepository.ts` |

**기술 결정: `is_stale` 플래그 방식 채택** ([BE 성준] 제안)
- hard delete 대신 `is_stale: true` 플래그를 설정
- **이유**: 인사이트 히스토리 보존 (과거 분석 비교 가능) + UI에서 "이전 분석" 배너 표시 가능
- DB 변경: `ai_insights` 컬렉션에 `is_stale: boolean` 필드 추가 (기본값 `false`)

| AC | 내용 |
|----|------|
| 1 | CSV 업로드 완료 후 해당 캠페인의 기존 ai_insights에 `is_stale: true` 설정 |
| 2 | 대시보드에서 stale 인사이트 감지 시 amber 배너 표시: "새 데이터가 업로드되었습니다. 재분석을 실행해주세요." |
| 3 | 재분석 실행 시 새 인사이트 생성 + 이전 stale 인사이트 보존 |
| 4 | 배너는 dismiss 가능 (유진 디자인) |

**배너 UI 스펙** ([디자이너 유진] 제안):
- 색상: amber (경고 톤, 에러 아님)
- 애니메이션: Framer Motion slide-down
- dismiss 버튼: 우측 X 아이콘
- 재분석 CTA 버튼 포함

### P0-4. 데이터 테이블 검색/필터 기능

**비즈니스 가치**: 마케터가 수천 건 데이터에서 특정 광고그룹/날짜/매체를 즉시 찾지 못하면 보고서 활용도가 0이다.

| 항목 | 내용 |
|------|------|
| 담당 | FE 지석 (구현), 디자인 유진 (UI), 마케터 민수 (요구사항) |
| 범위 | ReportCenter 처리 테이블에 검색바 + 매체/DMP 타입 필터 추가 |
| 신규 파일 | `TableFilterBar.tsx`, `DataTable.tsx`, `useDebouncedValue.ts` |
| 구현 | 클라이언트 사이드 필터링 (이미 전체 데이터 로딩 중) |

**기술 결정: 두 레이어 filteredData 분리** ([FE 지석] 제안 채택)

```
filteredData (기존, 변경 없음)
  └─ campaign_id + 날짜 범위 필터만
  └─ 차트 데이터 소스로 사용
  └─ 차트-테이블 간 데이터 일관성 유지

tableFilteredData (신규)
  └─ filteredData 기반
  └─ + 텍스트 검색 (광고그룹명/캠페인명)
  └─ + 매체 드롭다운 필터
  └─ + DMP 타입 필터 (민수 요청)
  └─ 테이블 전용, 차트에 영향 없음
```

**필터 항목**:

| 필터 | 타입 | 대상 필드 | 비고 |
|------|------|----------|------|
| 텍스트 검색 | input | ad_group_name, campaign_name | debounce 300ms |
| 매체 필터 | dropdown | media_type | 복수 선택 가능 |
| DMP 타입 필터 | dropdown | dmp_type | SKP, WIFI, 없음 (민수 필수 요청) |
| 초기화 | button | 전체 | 모든 필터를 기본값으로 리셋 |

**기술 결정 사항**:
- **debounce**: 300ms ([FE 지석] 제안)
- **커스텀 훅**: `useDebouncedValue(value, delay)` -> 신규 파일 `src/hooks/useDebouncedValue.ts`
- **필터 state**: ReportCenter 내부 `useState`로 관리, **sessionStorage 저장 안 함** ([FE 지석] 결정 - 페이지 새로고침 시 초기화가 자연스러움)
- **tablePage 리셋**: `tableFilteredData` 변경 시 자동으로 테이블 페이지 1로 리셋 ([FE 지석] 필수 사항)
- **필터 초기화**: 전체 초기화 버튼 1개 (개별 필터 초기화는 P2에서 검토)
- **검색 버튼 제거**: 입력 즉시 debounce 필터링 ([디자이너 유진] 결정)

**UI 스펙** ([디자이너 유진] 제안):
- 검색/필터 바: 테이블 상단 sticky 배치
- 테이블: zebra striping 추가 (현재 시각적 계층 부족)
- 수정 인터페이스: 호버 시 edit 아이콘 표시 (현재 더블클릭 숨김 패턴 개선)

**DMP 필터 비즈니스 요구사항** ([마케터 민수] 필수 요청):
- 현재 매주 DMP 정산 시 수동으로 SKP/WIFI 행을 눈으로 골라내는 작업 -> 30초로 단축
- DMP 타입별 소계 표시 (필터 적용 시)

| AC | 내용 |
|----|------|
| 1 | 텍스트 검색으로 광고그룹명/캠페인명 필터링 (300ms debounce) |
| 2 | 매체 드롭다운 필터 (복수 선택) |
| 3 | DMP 타입 드롭다운 필터 (SKP/WIFI/없음) |
| 4 | 필터 적용 시 테이블 페이지 1로 자동 리셋 |
| 5 | 차트 데이터는 필터 영향 받지 않음 (filteredData 분리) |
| 6 | 전체 초기화 버튼으로 모든 필터 리셋 |
| 7 | 민수 검증: "DMP 타입 필터로 SKP 정산 데이터만 즉시 추출 가능한가?" -> YES |

### P0-5. 데이터 재처리 기능 (신규)

**비즈니스 가치**: 캠페인 설정(수수료율, VAT 옵션 등) 변경 후 기존 데이터에 반영하려면 현재 개발팀에 수동 요청해야 함. 마케터 자율 운영 불가. ([마케터 민수] 요청)

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (로직), FE 지석 (UI) |
| 범위 | 캠페인 설정 변경 시 기존 raw_metrics를 재계산하여 processed_reports 갱신 |
| 트리거 | 캠페인 설정 저장 후 "데이터 재처리" 버튼 클릭 |

**처리 흐름**:
```
1. 사용자가 캠페인 설정 변경 (수수료율, VAT 설정 등)
2. "데이터 재처리" 버튼 클릭
3. 해당 캠페인의 raw_metrics 전체 조회
4. 변경된 설정으로 CalculationService 재실행
5. processed_reports 갱신 (트랜잭션 내)
6. AI 인사이트 is_stale 플래그 설정
7. 완료 알림 표시
```

| AC | 내용 |
|----|------|
| 1 | 캠페인 설정 변경 후 "데이터 재처리" 버튼 활성화 |
| 2 | 재처리 중 프로그레스 표시 (처리 건수/전체 건수) |
| 3 | 재처리 완료 후 테이블/차트 데이터 자동 갱신 |
| 4 | 재처리 시 기존 AI 인사이트 `is_stale: true` 설정 |
| 5 | 트랜잭션 내 실행 (실패 시 기존 데이터 보존) |
| 6 | 민수 검증: "수수료율 변경 후 재처리 버튼만 누르면 끝인가?" -> YES |

---

## P1 - 다음 스프린트 (~7일)

### P1-1. NextAuth.js 인증 활성화

**비즈니스 가치**: SaaS 제품으로 외부 사용자 접근 시 인증 필수.

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (OAuth 연동), FE 지석 (로그인 UI), 디자이너 유진 (로그인 디자인) |
| 범위 | Google OAuth + Credentials Provider |
| 파일 | `src/auth.ts`, `src/middleware.ts`, 신규 `/app/login/page.tsx` |
| AC | (1) Google OAuth 로그인/로그아웃 (2) 세션 기반 접근 제어 (3) API Route에 인증 체크 미들웨어 (4) /share/* 경로는 인증 예외 |
| 의존 | P0-1 (API 검증) 완료 후 진행 |

**Auth 전환 전략** ([BE 성준] 제안):
- P0 단계에서는 Auth 활성화하지 않음 (공수 대비 임팩트 불균형)
- P0 기간 중 API_SECRET 헤더 기반 임시 보호 적용 검토
- P1에서 본격 NextAuth 구현

**로그인 페이지 디자인** ([디자이너 유진] 제안):
- 배경: slate-900 그라디언트
- 카드: 글래스모피즘 스타일 (backdrop-blur + 반투명)
- Google OAuth 버튼 + Credentials 폼

### P1-2. Excel(.xlsx) 파일 지원

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (파서), FE 지석 (UI 수정) |
| 범위 | SheetJS(xlsx) 라이브러리 도입, FileUploader에서 .xlsx accept 추가 |
| AC | (1) .xlsx 파일 드래그앤드롭/선택 가능 (2) 내부적으로 CSV와 동일한 파이프라인으로 처리 (3) 다중 시트 시 시트 선택 UI |

### P1-3. 정산 확정 상태 관리 (신규)

**비즈니스 가치**: 정산 데이터가 Draft/검토중/확정 상태 없이 모두 동일하게 취급됨. 확정된 데이터의 실수 수정 방지 및 워크플로우 가시성 필요. ([마케터 민수] 요청)

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (스키마/로직), FE 지석 (UI), 마케터 민수 (워크플로우 검증) |
| 범위 | 정산 데이터에 상태 필드 추가 + 상태 전이 UI |

**상태 흐름**:
```
Draft (초안) -> 검토중 (Review) -> Confirmed (확정)
     ^                                   |
     └── 확정 해제 (관리자 전용) ─────────┘
```

**스키마 변경**:
- `processed_reports` 컬렉션에 `settlement_status` 필드 추가
- 허용값: `"draft"`, `"review"`, `"confirmed"`
- 기본값: `"draft"`

| AC | 내용 |
|----|------|
| 1 | 정산 데이터에 상태 배지 표시 (Draft=gray, 검토중=amber, Confirmed=green) |
| 2 | Confirmed 상태에서는 데이터 수정/삭제 차단 |
| 3 | 상태 전이 버튼 (Draft->검토중->Confirmed) |
| 4 | Confirmed 해제는 별도 확인 다이얼로그 |

### P1-4. CSV 내보내기 형식 개선 (신규)

**비즈니스 가치**: 현재 CSV 내보내기 시 기호(%, 원 등)가 포함되어 피벗 테이블에서 수치로 인식되지 않음. 컬럼명이 영문 DB 필드명 그대로 출력. ([마케터 민수] 요청)

| 항목 | 내용 |
|------|------|
| 담당 | FE 지석, 마케터 민수 (컬럼명 매핑 검증) |
| 범위 | CSV 내보내기 시 형식 옵션 추가 |

| AC | 내용 |
|----|------|
| 1 | 내보내기 시 "기호 제거" 옵션 (%, 원, 쉼표 제거 -> 순수 숫자) |
| 2 | 컬럼명을 비즈니스 한글명으로 변환 옵션 (impressions -> 노출수, clicks -> 클릭수) |
| 3 | 민수 검증: "이 CSV를 Excel 피벗 테이블에 바로 넣을 수 있는가?" -> YES |

### P1-5. 알림 실제 발송 (이메일)

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 |
| 범위 | Resend API 연동, 알림 이메일 템플릿 |
| AC | (1) alert_rules 트리거 시 이메일 발송 (2) 실패 시 에러 로깅 (3) 일일 발송 한도 설정 |

### P1-6. 공유 보고서 비밀번호 보호

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 (해시/검증), FE 지석 + 유진 (비밀번호 입력 UI) |
| 범위 | shared_reports에 password_hash 필드 추가, /share/[shareId] 진입 시 검증 |
| AC | (1) 공유 생성 시 비밀번호 설정 옵션 (2) bcrypt 해시 저장 (3) 3회 실패 시 잠금 |

---

## P2 - 백로그 (향후 스프린트)

### P2-1. 실제 멀티테넌시 활성화

| 항목 | 내용 |
|------|------|
| 담당 | 도윤 (설계), 성준 (구현) |
| 범위 | workspace_id 동적 주입, 워크스페이스 CRUD UI, 멤버 초대 플로우 |
| 의존 | P1-1 (Auth) 완료 필수 |

### P2-2. Slack 알림 연동

| 항목 | 내용 |
|------|------|
| 담당 | BE 성준 |
| 범위 | Slack Incoming Webhook 연동 |
| 의존 | P1-5 (이메일 알림) 완료 후 |

### P2-3. ReportCenter.tsx 컴포넌트 분리

| 항목 | 내용 |
|------|------|
| 담당 | 도윤 (구조 설계), 지석 (실행) |
| 범위 | 기능 단위 분리: UploadSection, DataTable, ChartSection, AiInsightPanel, BudgetOverview |
| 리스크 | P0-2 테스트 완료 후 진행 권장 (회귀 방지) |
| 비고 | P0-4에서 TableFilterBar.tsx, DataTable.tsx 신규 파일 생성으로 분리 준비 시작 |

### P2-4. 데이터 내보내기 (PDF)

| 항목 | 내용 |
|------|------|
| 담당 | FE 지석, 디자인 유진 |

### P2-5. 개별 필터 초기화 UX

| 항목 | 내용 |
|------|------|
| 담당 | FE 지석, 디자인 유진 |
| 범위 | 각 필터 옆 개별 X 버튼으로 해당 필터만 초기화 |
| 비고 | P0-4에서는 전체 초기화만 구현, 개별 초기화는 사용자 피드백 후 결정 |

---

## 테스트 전략

### Phase 1: 단위 테스트 (P0-2 — 이번 스프린트)

**도구**: Vitest (Next.js 14와 호환, Jest보다 빠름, ESM 네이티브)

**대상 우선순위**:
1. `CalculationService` — 금액 계산, DMP 탐지, 컬럼 매핑
2. `repositoryService.ts` — upsert 로직 (MongoDB Memory Server)
3. `insightService.ts` — prompt 빌드 로직 (API 호출 mock)

**설정 파일**:
```
vitest.config.ts
  - vite-tsconfig-paths 플러그인
  - src/ 대상
  - coverage: v8
  - reporters: ['default', 'json']
```

### Phase 2: 통합 테스트 (P1)

**대상**: API Route 핸들러, Server Actions, MongoDB 연동

### Phase 3: E2E 테스트 (P2)

**도구**: Playwright

---

## 기술 결정 사항 요약

> 팀 토론에서 확정된 기술 결정 사항. 이 결정들은 구현 시 반드시 준수한다.

| # | 결정 사항 | 제안자 | 근거 |
|---|----------|--------|------|
| 1 | AI 캐시: hard delete 대신 `is_stale` 플래그 | 성준 | 히스토리 보존 + UI 배너 표시 가능 |
| 2 | filteredData 두 레이어 분리 (차트용 vs 테이블용) | 지석 | 차트-테이블 독립성 보장, 기존 차트 로직 변경 없음 |
| 3 | debounce 300ms | 지석 | 타이핑 UX와 반응성의 균형 |
| 4 | 필터 state: sessionStorage 미저장 | 지석 | 새로고침 시 초기화가 자연스러운 UX |
| 5 | 검색 버튼 제거, 입력 즉시 필터링 | 유진 | 현대적 UX, 불필요한 클릭 제거 |
| 6 | 필터 초기화: 전체 1개 버튼 (개별은 P2) | PM 정훈 | 스코프 관리, P0 배포 후 피드백 기반 결정 |
| 7 | Zod 적용 순서: campaigns > alerts > reports > ai | 성준 | 비즈니스 크리티컬 순서 |
| 8 | P0에서 Auth 미활성화, API_SECRET 임시 대안 검토 | 성준 | 공수 대비 임팩트 불균형 |
| 9 | 신규 파일로 시작: TableFilterBar.tsx, DataTable.tsx | 지석 | P2 ReportCenter 분리 준비 |
| 10 | tablePage 리셋: tableFilteredData 변경 시 자동 | 지석 | 필터 적용 후 빈 페이지 방지 |

---

## 각 팀별 작업 범위

### BE 성준 (Safety First)

| 스프린트 | 작업 | 파일 | 비고 |
|----------|------|------|------|
| **Hotfix** | supply_value strip 추가 | `share/[shareId]/route.ts` | 즉시 |
| **Hotfix** | deleteCampaign 트랜잭션 | `workspaceRepository.ts` | 즉시 |
| **Hotfix** | upsertCampaignData 트랜잭션 | `workspaceRepository.ts` | 즉시 |
| P0-1 | Zod 스키마 + API 입력 검증 | `/api/v1/*/route.ts` | campaigns 우선 |
| P0-2 | Vitest 설정 + CalculationService 테스트 | `vitest.config.ts`, `__tests__/` | DMP 대소문자/위치 케이스 포함 |
| P0-3 | AI 캐시 무효화 (is_stale 방식) | `settlement.ts`, `workspaceRepository.ts` | hard delete 아님 |
| P0-5 | 데이터 재처리 로직 | `settlement.ts`, `calculationService.ts` | 트랜잭션 내 실행 |
| P1-1 | NextAuth.js 구현 | `auth.ts`, `middleware.ts` | |
| P1-2 | Excel 파서 (SheetJS) | `calculationService.ts` | |
| P1-3 | 정산 확정 상태 스키마/로직 | `workspaceRepository.ts` | |
| P1-5 | Resend 이메일 알림 | 신규 | |
| P1-6 | 공유 보고서 비밀번호 해시 | `workspaceRepository.ts` | |

### FE 지석 (Performance King)

| 스프린트 | 작업 | 파일 | 비고 |
|----------|------|------|------|
| P0-3 | 재분석 배너 UI | `ReportCenter.tsx` | amber + Framer Motion |
| P0-4 | TableFilterBar 컴포넌트 | 신규 `TableFilterBar.tsx` | sticky 배치 |
| P0-4 | DataTable 컴포넌트 | 신규 `DataTable.tsx` | zebra striping |
| P0-4 | useDebouncedValue 훅 | 신규 `src/hooks/useDebouncedValue.ts` | 300ms |
| P0-4 | 두 레이어 filteredData 구현 | `ReportCenter.tsx` (또는 분리 파일) | tableFilteredData 추가 |
| P0-5 | 재처리 버튼 + 프로그레스 UI | `ReportCenter.tsx` | |
| P1-1 | 로그인 페이지 UI | 신규 `/app/login/page.tsx` | |
| P1-3 | 정산 상태 배지/전이 UI | `ReportCenter.tsx` | |
| P1-4 | CSV 내보내기 형식 옵션 | `ReportCenter.tsx` | |

### 디자이너 유진 (UI Auditor)

| 스프린트 | 작업 | 대상 | 비고 |
|----------|------|------|------|
| P0-3 | 재분석 배너 디자인 | AI 섹션 | amber, dismiss 가능 |
| P0-4 | 검색/필터 바 레이아웃 | 테이블 상단 | sticky, 검색 버튼 제거 |
| P0-4 | 테이블 zebra striping | DataTable | 시각적 계층 개선 |
| P0-4 | 호버 edit 아이콘 | DataTable | 더블클릭 패턴 대체 |
| P1-1 | 로그인 페이지 디자인 | `/app/login/page.tsx` | slate-900 + 글래스모피즘 |
| P1-6 | 비밀번호 입력 모달 | 공유 보고서 | |

### 마케터 민수 (Business Validator)

| 스프린트 | 작업 | 산출물 |
|----------|------|--------|
| P0-2 | 테스트 케이스 검증 (DMP 대소문자/위치 포함) | 테스트 데이터 + 기대값 승인 |
| P0-4 | DMP 필터 요구사항 확인 | 필터 기준 + 정산 시나리오 |
| P0-5 | 재처리 워크플로우 검증 | "버튼 하나로 끝나는가?" |
| P1-3 | 정산 상태 워크플로우 검증 | Draft->검토중->Confirmed 시나리오 |
| P1-4 | CSV 컬럼명 매핑 검증 | 영문->한글 컬럼명 매핑표 |
| 전체 | 최종 QA 및 승인 | "광고주에게 보낼 수 있는가?" 판정 |

### 아키텍트 도윤 (Architect)

| 스프린트 | 작업 | 산출물 |
|----------|------|--------|
| P0 | 테스트 디렉토리 구조 설계 | `__tests__/` 폴더 구조 |
| P0 | TableFilterBar/DataTable 파일 위치 결정 | 컴포넌트 디렉토리 구조 |
| P1 | Auth + 멀티테넌시 전환 설계 | 마이그레이션 계획 문서 |
| P2 | ReportCenter 분리 아키텍처 | 컴포넌트 트리 설계 |

---

## 스프린트 일정 (확정)

```
Hotfix (Day 0 - 스프린트 시작 전)
  성준: supply_value strip + 트랜잭션 2건 핫픽스
  검증: 수동 테스트로 3건 모두 확인

P0 스프린트 (6일)
  Day 1: Zod 스키마 설계 + campaigns API 검증 (성준)
         테스트 디렉토리 구조 설계 (도윤)
         검색/필터 UI 레이아웃 설계 (유진)
         DMP 필터 요구사항 정리 (민수)

  Day 2: Vitest 설정 + CalculationService 테스트 시작 (성준)
         TableFilterBar.tsx + useDebouncedValue.ts (지석)
         테스트 케이스 검증 (민수)

  Day 3: CalculationService 테스트 완료 + Zod alerts/reports (성준)
         DataTable.tsx + 두 레이어 filteredData 구현 (지석)

  Day 4: AI 캐시 무효화 is_stale 구현 (성준)
         재분석 배너 UI (지석 + 유진)
         DMP 필터 + 매체 필터 구현 (지석)

  Day 5: 데이터 재처리 로직 (성준)
         재처리 UI + 전체 필터 통합 (지석)

  Day 6: 민수 QA + 버그 수정 + 스프린트 회고
         "DMP 필터로 정산 데이터 즉시 추출 가능한가?" 검증

P1 스프린트 (7일)
  Day 1-2: NextAuth 구현 (성준) + 로그인 UI (지석, 유진)
  Day 3: Excel 파서 + UI (성준, 지석)
  Day 4: 정산 확정 상태 관리 (성준, 지석)
  Day 5: CSV 내보내기 형식 개선 (지석, 민수 검증)
  Day 6: 이메일 알림 + 공유 보고서 비밀번호 (성준, 지석)
  Day 7: 통합 QA (민수) + 회고
```

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

### Hotfix 완료 기준
- [ ] 공유 보고서 응답에 supply_value/fee_rate/net_amount 미포함 확인
- [ ] deleteCampaign 중간 실패 시 전체 롤백 확인
- [ ] upsertCampaignData insert 실패 시 기존 데이터 보존 확인

### P0 완료 기준
- [ ] `npm run test` 실행 시 CalculationService 11개 테스트 모두 통과
- [ ] DMP 대소문자 무시 탐지 테스트 통과 ("skp", "Skp", "SKP" 모두)
- [ ] DMP 위치 중립 탐지 테스트 통과 ("브랜드_wifi_30대" 등)
- [ ] pacing_index 방향성 테스트 통과 (>1.0 = 초과소진)
- [ ] 데이터 테이블에서 DMP 타입 필터 적용 시 해당 타입만 표시
- [ ] CSV 재업로드 후 AI 인사이트 is_stale 플래그 설정 + 배너 표시
- [ ] 잘못된 JSON으로 POST /api/v1/campaigns 호출 시 400 반환
- [ ] 데이터 재처리 버튼 클릭 시 변경된 설정으로 데이터 갱신
- [ ] 민수 최종 승인: "DMP 필터로 정산 즉시 추출 가능한가?" -> YES

### P1 완료 기준
- [ ] Google OAuth 로그인 후 대시보드 접근 가능
- [ ] .xlsx 파일 업로드 시 CSV와 동일한 결과 출력
- [ ] 정산 데이터에 상태 배지 표시 + Confirmed 시 수정 차단
- [ ] CSV 내보내기 시 기호 제거 + 한글 컬럼명 변환 가능
- [ ] 민수 최종 승인: "광고주에게 바로 보낼 수 있는가?" -> YES

### 품질 게이트 (모든 기능)
1. **마케터 피벗 테이블 테스트**: 민수가 출력 데이터를 Excel 피벗으로 가공 가능한가?
2. **광고주 프레젠테이션 테스트**: 대시보드 스크린샷이 광고주 보고에 바로 사용 가능한가?
3. **데이터 정합성**: 동일 CSV 2회 업로드 시 중복 데이터 없이 덮어쓰기 정상 동작?

---

## 리스크 및 의존성

| 리스크 | 영향도 | 대응 |
|--------|--------|------|
| ReportCenter 1,584줄에 기능 추가 시 회귀 | 높음 | P0-2 테스트부터 구축, 신규 파일 분리로 터치 최소화 |
| Danfo.js groupby 사용 금지 규칙 위반 | 높음 | 테스트에서 검증, 코드리뷰 체크리스트 |
| MongoDB 트랜잭션은 Replica Set 필요 | 중간 | 개발환경에서 standalone -> replica set 전환 필요 여부 확인 |
| Auth 활성화 시 기존 API 호출 깨짐 | 중간 | P0에서는 미활성화, P1에서 middleware 기반 관리 |
| MongoDB Memory Server가 Windows에서 불안정 | 중간 | Docker Compose의 MongoDB 사용 또는 testcontainers |
| 데이터 재처리 시 대량 데이터 성능 | 중간 | batch 처리 + 프로그레스 UI로 체감 성능 개선 |
| Vitest + Next.js 14 path alias 호환 | 낮음 | vite-tsconfig-paths 플러그인 |

---

**비즈니스 가치가 최우선. 결정되지 않은 코딩은 시간 낭비다.**

[PM 정훈/Orchestrator]
