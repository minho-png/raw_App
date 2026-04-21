# CT+ Architecture Guide

## MVC 레이어 구조

Next.js 기반으로 별도 서버 없이 MVC 패턴을 구현합니다.

### M — Model (`lib/models/`)

타입 정의, 순수 데이터 구조. 외부 의존성 없음.

**포함 파일:**
- `campaignTypes.ts` — 캠페인 타입 정의, 서브캠페인 구조
- `rawDataParser.ts` — Raw 데이터 파싱 로직 (순수 함수)
- `reportTypes.ts` — 리포트 타입 정의
- `ctGroupTypes.ts` — CT Group 타입 정의

**중요 규칙:**
- React/Next.js import 없음
- 순수 TypeScript만
- 비즈니스 로직은 Service 계층으로

### S — Service (`lib/services/`)

순수 비즈니스 계산. 외부 API/DB 의존 없음.

**포함 파일:**
- `calculationService.ts` — CPC/CPM/CTR 계산, 소진액 계산
- `markupService.ts` — Markup 계산
- `advertiserMatcher.ts` — 광고주 매칭 로직
- `csvChunker.ts` — CSV 청크 분할
- `excelParser.ts` — Excel 파싱
- `htmlReportGenerator.ts` — HTML 리포트 생성
- `pdfOcr.ts` — PDF OCR 처리
- `unifiedCsvParser.ts` — 통합 CSV 파싱
- `utils.ts` — 유틸리티 함수

**중요 규칙:**
- React/Next.js import 없음
- 외부 API 호출 금지 (DB/API는 Repository에서)
- 순수 함수로 구성

### R — Repository (`lib/repositories/`)

데이터 접근 추상화. MongoDB, localStorage, API 호출.

**포함 파일:**
- `rawDataStore.ts` — Raw 데이터 저장/조회
- `mongodb.ts` — MongoDB 연결 및 쿼리

**중요 규칙:**
- 데이터 접근만 담당
- 비즈니스 계산 로직 없음

### C — Controller

**HTTP Controller**: `app/api/v1/**/route.ts`
- Request validation
- Service 함수 호출
- Response 포맷팅

**Action Controller**: `server/actions/*.ts` (Server Actions)
- Client ↔ Server 통신
- Service 함수 호출
- Error handling

**Client Bridge**: `lib/hooks/use*.ts` (React Hooks)
- View ↔ Controller 연결
- Client에서 Server Action 호출
- 상태 관리

### V — View (`app/`, `components/`)

React 컴포넌트, 페이지. 렌더링만.

**중요 규칙:**
- 비즈니스 로직 없음
- 모든 계산은 Controller(hook/API) 통해
- TypeScript 타입은 Model에서 import

## 레이어 간 통신 규칙

```
View (React)
    ↓
Controller (hook/API)
    ↓
Service (비즈니스 계산)
    ↓
Model (타입만)

↕
Repository (데이터 접근)
```

### 허용되는 import 관계

| From | To | 허용? | 예시 |
|------|----|----|-----|
| View | Model | ✅ | `import { Campaign } from '@/lib/models'` |
| View | Service | ❌ | Service는 Controller 통해서만 |
| Controller | Model | ✅ | 타입 참조 및 Service 호출 |
| Controller | Service | ✅ | 비즈니스 로직 호출 |
| Controller | Repository | ✅ | 데이터 접근 |
| Service | Model | ✅ | 타입 참조 |
| Service | Repository | ❌ | Service는 순수 함수만 |
| Service | React/Next | ❌ | - |
| Repository | Service | ❌ | - |

## 마이그레이션 경로

### Phase 1 (완료): Barrel 생성
- `lib/models/index.ts` ✅
- `lib/services/index.ts` ✅
- `lib/repositories/index.ts` ✅
- `lib/controllers/index.ts` ✅

### Phase 2 (진행 중): 기존 import 경로 유지
```typescript
// Before (그대로 동작)
import { Campaign } from '@/lib/campaignTypes'

// After (새 경로, 더 명확함)
import { Campaign } from '@/lib/models'

// 둘 다 동작 가능 (re-export)
```

### Phase 3: Server Actions 통합
- `server/actions/` 구조화
- API routes 최적화

### Phase 4: 타입 검증
- Model 타입 강화
- Service 입출력 명확화

## 성능 고려사항

### Bundle Size
- Service 계층: tree-shake 가능 (순수 함수)
- Repository: 선택적 import (필요할 때만)
- View에서 Model만 import하면 Service 번들링 안 됨

### Runtime
- Service 계산은 CPU 집약적 (웹 워커 고려)
- Repository는 네트워크 I/O (caching 권장)
- Controller가 오케스트레이션 담당

## 기존 코드와의 호환성

이 구조는 **기존 import 경로를 유지**합니다:

```typescript
// 기존 코드 (그대로 동작)
import { Campaign } from '@/lib/campaignTypes'
import { calculateCost } from '@/lib/calculationService'

// 새 코드 (권장)
import { Campaign } from '@/lib/models'
import { calculateCost } from '@/lib/services'
```

Barrel export (`lib/models/index.ts`)는 re-export를 통해 기존 모듈을 감싸므로, 기존 import 경로는 변경되지 않습니다.
