# GFA RAW MASTER PRO — Claude Code 가이드

## 프로젝트 개요
한국 디지털 광고(Naver GFA, Kakao, Meta, Google) 캠페인 CSV 데이터를 정제·분석·보고서화하는 SaaS 플랫폼.

## 기술 스택
- **프레임워크**: Next.js 14 (App Router), TypeScript
- **DB**: MongoDB (`gfa_master_pro`)
- **상태관리**: Zustand (`useCampaignStore`)
- **데이터처리**: Danfo.js (클라이언트), PapaParse (CSV)
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`)
- **UI**: Tailwind CSS, Radix UI, Recharts, Framer Motion, DnD Kit

## 핵심 규칙

### API 설계
- 외부 API: `/api/v1/` Route Handler
- 내부 UI용: Server Actions (`src/server/actions/`)
- 신규 엔드포인트는 반드시 `/api/v1/` 하위에 작성

### 멀티테넌시
- 모든 DB 쿼리에 `workspace_id` 격리 유지
- 현재는 `SYSTEM_WORKSPACE_ID` 단일 테넌트로 동작

### 데이터 처리
- Danfo.js `groupby().sum()`은 Vercel/serverless에서 크래시 발생 → 반드시 plain-JS Map 집계 사용
- 날짜는 반드시 UTC 자정으로 정규화 (`Date.UTC(y, m, d)`)
- 네이버GFA 공급가액은 VAT 별도: `supply / 1.1`

### DMP 탐지
- `ad_group_name` 내 키워드 매칭: SKP, KB, LOTTE, TG360, BC, SH, WIFI

## DB 컬렉션
```
campaign_configs    — 캠페인 및 서브캠페인 설정
raw_metrics         — 원본 CSV 행 데이터 (is_raw: true)
processed_reports   — 집계된 리포트 데이터 (is_raw: false)
dmp_settlements     — DMP 정산 기록
workspaces          — 워크스페이스 (v2.0)
workspace_members   — 멤버 역할 (v2.0)
users               — 사용자 (v2.0)
shared_reports      — 공유 보고서 링크
alert_rules         — 알림 규칙
alert_events        — 알림 이벤트
ai_insights         — AI 분석 결과 캐시
```

## 주요 파일
| 파일 | 역할 |
|------|------|
| `src/services/calculationService.ts` | CSV 파싱, 컬럼 매핑, DMP 탐지, 집계 |
| `src/services/repositoryService.ts` | MongoDB CRUD (캠페인, 성과 데이터) |
| `src/services/workspaceRepository.ts` | 공유 보고서, 알림, AI 인사이트 |
| `src/services/ai/insightService.ts` | Claude AI 캠페인 분석 |
| `src/services/reportService.ts` | HTML 보고서 생성 |
| `src/components/organisms/ReportCenter.tsx` | 메인 대시보드 (업로드→처리→분석) |
| `src/components/layout/Sidebar.tsx` | 캠페인 목록 및 CRUD |
| `src/lib/mongodb.ts` | MongoDB 연결 풀 + 인덱스 생성 |

## 환경 변수 (`.env.local`)
```
MONGODB_URI=mongodb://localhost:27017/gfa_master_pro
ANTHROPIC_API_KEY=sk-ant-...   # AI 인사이트 필수
WORKER_SECRET=...               # 알림 워커 인증
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 개발 명령
```bash
npm run dev    # 개발 서버
npm run build  # 프로덕션 빌드
npm run lint   # ESLint
```

## v2.0 진행 상황
- [x] Sprint 0: 타입 시스템 (workspace.ts)
- [x] Sprint 1: DB 멀티테넌시 기반 (workspaceRepository.ts)
- [x] Sprint 2: REST API /api/v1/* + Claude AI 인사이트
- [x] Sprint 3: 공유 보고서 URL (/share/[shareId])
- [x] Sprint 4: 알림 시스템
- [ ] Auth: NextAuth.js OAuth (현재 비활성화)
- [ ] 실제 멀티테넌시 (현재 SYSTEM_WORKSPACE_ID 단일 운영)
