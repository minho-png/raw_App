# KIM × crosstarget_1 통합 기획 문서

**작성일:** 2026-04-14  
**AI 하네스 엔지니어링 버전:** v1.0

---

## 1. 분석 결론

| 항목 | KIM | crosstarget_1 | 우선순위 |
|------|-----|---------------|---------|
| 백엔드 | MongoDB (고도화) | localStorage | KIM 우선 |
| 청크 저장 | ✅ | ❌ | KIM 유지 |
| 광고주 매칭 | ✅ (advertiserMatcher) | ❌ | KIM 유지 |
| critical 알림 | ❌ | ✅ | **통합 필요** |
| Campaign.agencyFeeRate | ❌ | ✅ | **통합 필요** |
| 데이터 흐름 자동화 | ❌ | ❌ | **신규 개발** |
| 통합 대시보드 | ❌ | ❌ | **신규 개발** |

---

## 2. 구현 계획

### Phase 1 – 빠른 패치 (Quick Wins)
**1-A. CT/CTV 분석 critical 알림 타입 추가**
- `AlertMsg.kind`에 `'critical'` 추가
- 노출=0 / 소진=0 시 최우선 경보 (pulse 애니메이션)
- 테이블 행 배경 빨간 강조

**1-B. Campaign 인터페이스 agencyFeeRate 추가**
- `lib/campaignTypes.ts`의 `Campaign`에 `agencyFeeRate?: number` 추가
- `settlement/agency-fee`에서 Campaign.agencyFeeRate 기본값 활용

### Phase 2 – 데이터 연결 자동화
**2-A. 데일리 리포트 → 캠페인 소진 자동 동기화**
- CT+ daily 저장 리포트를 캠페인과 연결
- `lib/hooks/useReportCampaignSync.ts` 신규: 저장 리포트에서 매체별 소진 집계
- campaign status 페이지에 "소진 동기화" 버튼 + 리포트 선택 UI
- 일치 로직: `detectedAdvertiserHints` ↔ `Advertiser.name` 퍼지 매칭

### Phase 3 – 통합 대시보드
**3-A. 캠페인 현황 개요 페이지 (`app/page.tsx` 개편)**
- 전체 캠페인 카드 그리드 (소진률 프로그레스바, D-day, 매체 뱃지)
- 알림 우선순위 집계 패널 (critical → warn → up)
- 정산 진행 현황 (DMP/대행수수료/매체비 3단계)
- CT/CTV 캠페인 별도 섹션 (VTR 지표 포함)
- 빠른 액션 버튼 (데이터 입력 / 리포트 보기 / 정산)

---

## 3. 아키텍처 규칙

```
CSV 업로드 (daily/page)
    ↓ parseUnifiedCsv
    ↓ saveReport (chunked DB)
    ↓
useReportCampaignSync         ← Phase 2 신규
    ↓ 매체별 소진 집계
    ↓ Campaign.mediaBudgets[].dmp.spend 업데이트
    ↓
Campaign Status (status/page)  ← 소진 자동 반영
    ↓
Settlement Pages               ← 정산 자동 계산
    ↓
Dashboard (page.tsx)           ← 전체 현황 통합 뷰
```

---

## 4. 파일 변경 목록

| 파일 | 유형 | 내용 |
|------|------|------|
| `app/campaign/ct-ctv/analysis/page.tsx` | 수정 | critical 알림 추가 |
| `lib/campaignTypes.ts` | 수정 | agencyFeeRate 필드 |
| `lib/hooks/useReportCampaignSync.ts` | 신규 | 리포트-캠페인 소진 연동 훅 |
| `app/campaign/ct-plus/status/page.tsx` | 수정 | 소진 동기화 UI |
| `app/page.tsx` | 수정 | 통합 대시보드 |

---

## 5. 하네스 검증 기준

- `npm run verify` (tsc + eslint) 통과 필수
- 기존 localStorage 키 불변 유지
- 기존 공개 함수 시그니처 불변 유지
- 신규 기능은 기존 워크플로우를 차단하지 않음 (graceful degradation)
