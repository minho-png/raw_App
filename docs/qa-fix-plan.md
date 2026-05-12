# QA 리포트 (2026-05-11) 후속 조치 계획서

> 문서 위치: `docs/qa-fix-plan.md`
> 작성: 2026-05-11
> 관련 PR: #21 (claude/review-project-setup-aeFQp)
> 검증 방식: 사용자 답변에 따라 **코드 분석 기반** (Vercel 라이브 미접근)

---

## 0. 우선순위 정렬 (QA 리포트 발췌)

| Priority | ID | 내용 | 위험 |
|---|---|---|---|
| **P0** | BUG-001 | 메인 대시보드 "집행 중 캠페인" 0건 (실제 2건) | 운영자 첫 화면 신뢰도 |
| **P0** | BUG-006 | 매체비용 정산 CT+ 데이터 미연동 | 월말 정산 오류 |
| **P0** | RISK-001 | 삭제 확인 다이얼로그 부재 가능성 | 데이터 손실 |
| **P1** | BUG-002 | 누적 소진금액 ₩0 (실제 3,002,446원) | KPI 오류 |
| **P1** | BUG-005 | 계산서 발급 로딩 스피너 지속 | 진입 불가 |
| **P1** | UX-016 | 목업 시드 버튼 프로덕션 노출 | 사고 가능성 |
| **P2** | UX-001 | 광고주/대행사 비어있음 경고 오탐 | 안내 신뢰도 |
| P2+ | UX-002~UX-021 | 기타 UX/접근성 | 사용성 |

---

## 1. P0 해결 방안 (코드 위치 + 수정 방향)

### BUG-001/002 — 대시보드 KPI 불일치 + 누적 소진 ₩0
- **위치**: `app/page.tsx:205-218`
- **원인**: `activeStats.totalSpend`가 `getCampaignTotals(c).totalSpend` 합산인데, 이 값은 캠페인 모달에서 직접 입력한 `mb.dmp.spend + mb.nonDmp.spend` 필드. 사용자가 입력하지 않으면 0. 실제 집행은 raw data(`r.executionAmount`)에 있음.
- **수정**: `activeStats`에서 `useRawData()` + `applyMarkupToRows`로 raw data 기반 누적 집계 도입. 캠페인이 `csvNames`로 raw rows와 매칭된 경우 그 합을 totalSpend로 사용. 입력값(`mb.spend`)은 폴백.
- **부가**: "집행 중 캠페인" 수치는 단순 count라 별도 버그가 아닐 가능성 — `isActive()` 정규화는 이미 적용됨(BUG-03 fix). 사용자 QA에서 0 표시는 상태값 변종일 수 있어 콘솔 로깅으로 진단 가능. 우선 raw 데이터 KPI 통합으로 두 BUG 모두 해결.

### BUG-006 — 매체비용 정산 데이터 미연동
- **위치**: `app/settlement/media-cost/page.tsx`
- **원인**: CT+ 캠페인의 집행금액이 raw data와 연동 안 됨. 매체 비용 정산이 캠페인 모달의 `mb.spend` 값만 보고 있을 가능성.
- **수정**: `useRawData` + `applyMarkupToRows`로 raw 기반 매체별 합계를 추가 계산. settlement 매체 테이블에 raw 집행금액 컬럼 노출(이미 sales-purchase 페이지가 동일 패턴).
- **검증**: BUG-001 fix와 동일 데이터 소스 통일.

### RISK-001 — 삭제 확인 다이얼로그
- **현황**: `app/campaign/ct-plus/status/page.tsx:170-179`에 이미 `ConfirmModal` 호출 존재. 즉 화면상 빨간 버튼이지만 클릭하면 모달이 뜬다. **버그 아님**.
- **추가 강화**: 메시지에 "이 작업은 되돌릴 수 없습니다" 문구 명시되어 있는지 확인. 또 데이터 업로드의 "전체 초기화"(UX-004)도 동일하게 점검.

---

## 2. P1 해결 방안

### BUG-005 — 계산서 발급 로딩 스피너
- **위치**: `app/campaign/ct-plus/final/page.tsx:120-122`
- **원인**: `loading = masterLoading || rawLoading`. raw가 빈 케이스(`useRawData`의 초기 `setLoading(true)` 후 fetch 실패/지연) 에서 끝나지 않을 수 있음.
- **수정**: useRawData가 빈 응답이어도 `setLoading(false)` 보장. 또는 final 페이지에서 raw 없어도 캠페인만으로 진행 가능하게 분기.

### UX-016 — 목업 시드 버튼 프로덕션 노출
- **위치**: `app/management/page.tsx:118-127`
- **수정**: `process.env.NODE_ENV !== 'production'` 조건부 렌더링.

### UX-005 — `볼 표 복사` 오탈자
- **위치**: 코드 검색 결과 "볼 표" 문자열 미발견. QA 리포트의 시각 인식 오류(예: "엑셀 복사" 폰트 렌더링 깨짐)일 가능성. 일단 **보류** + 사용자 재확인 요청.

---

## 3. P2 — 추가 UX 개선 (선택적)

| ID | 내용 | 위치 | 권장 |
|---|---|---|---|
| UX-001 | 광고주/대행사 비어있음 경고 오탐 | `app/page.tsx` | 직전 커밋에서 보강했으나 조건 재검토 |
| UX-002 | "대시보드 소진액" 가이드 부족 | CampaignModal | 툴팁 추가 |
| UX-004 | 전체 초기화 확인 모달 | daily/page.tsx | confirm 호출 확인 |
| UX-009 | DMP 정산 좌측 컬럼 sticky | dmp-fee/page.tsx | CSS `sticky left-0` |
| UX-010 | 매입/매출 수금일/이메일 공백 | sales-purchase | RowEditModal로 이미 편집 가능 — 안내 추가 |
| UX-011 | CT/CTV 분석 필터 부재 | analysis/page.tsx | 큰 작업 — phase 분리 |
| UX-013 | 캠페인명 말줄임 툴팁 | analysis 테이블 | `title` 속성 추가 |
| UX-017 | 운영자 전화번호 유효성 | OperatorModal | 정규식 검증 |
| ACC-001 | `DB 4` 등 aria-label | CampaignTableSection | `aria-label` 추가 |

---

## 4. 단계별 실행

### Phase Q1 — P0 (3건)
1. BUG-001/002: 대시보드 KPI에 raw 집계 통합
2. BUG-006: 매체비용 정산에 raw 집계 통합
3. RISK-001: 삭제·초기화 액션 confirm 통일

### Phase Q2 — P1 (3건)
1. BUG-005: 계산서 발급 로딩 종료 보장
2. UX-016: 시드 버튼 NODE_ENV 가드
3. UX-005: 오탈자 — 보류 (사용자 재확인)

### Phase Q3 — P2 잔여 (선별)
- UX-009, UX-013, UX-017, ACC-001 (저위험·국소)
- UX-011, MISSING-001/002 (구조 변경 — 별도 트랙)

각 phase: tsc + build verify → commit → push.

---

## 5. 비고

- BUG-006의 데이터 파이프라인 통일은 sales-purchase, agency-fee 등 다른 정산 페이지와 동일한 구조여야 함. raw + campaign 매칭은 `applyMarkupToRows()` 패턴 재사용.
- MISSING-002 (목업 작업 저장)은 직전 커밋에서 LocalStorage 탭 저장은 도입했으나 캔버스 상태는 메모리 유지. 별도 트랙.
- BUG-007 (목업 레이어 추가 UI)은 코드상 배경 업로드 후 레이어 추가가 가능한 구조. 정상 동작이라면 안내 메시지 보강만으로도 해소.
