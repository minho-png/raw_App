# Crosstarget Open API 운영 가이드

> 대상: raw_App 운영자 · 정산 담당자. Open API 토큰 발급/등록/운영과 장애 대응 절차.
> 관련 PR: #126 (Phase 1 인프라) · #127 (전문가 리뷰 반영 — 견고성/보안/UX/테스트)

---

## 1. 토큰 발급

1. https://manage2.crosstarget.co.kr 로그인 → 우측 상단 **프로필 메뉴** → **API 토큰**
2. **새 토큰 발급** 클릭
3. 입력
   - **이름**: `raw_App-prod` (production) / `raw_App-preview` (preview) — 환경별 분리 권장
   - **만료일**: **1년** 권장 (무기한 금지 — 회전 추적 불가)
4. 발급된 토큰 문자열을 **즉시 복사** (이후 재조회 불가)
5. 분실 시: 해당 토큰 **폐기 → 재발급**

> 1 사용자당 최대 **5개**. production / preview / local 분리 시 3개 사용.

---

## 2. 환경변수 등록

### 로컬 (`.env.local`)
프로젝트 루트의 `.env.local.example` 을 `.env.local` 로 복사 후 값 채우기:

```bash
cp .env.local.example .env.local
# 편집기로 OPEN_API_TOKEN= 뒤에 발급 토큰 붙여넣기
npm run dev   # env 는 핫리로드 안 됨 — dev server 재시작 필요
```

### Vercel (Production / Preview)
**Settings → Environment Variables**:

| Key | Environment | 비고 |
|---|---|---|
| `OPEN_API_TOKEN` | **Production** | production용 토큰 |
| `OPEN_API_TOKEN` | **Preview** | **별도 발급 토큰** — preview 빌드가 prod quota 소진 방지 (운영 리뷰 ⑩) |
| `OPEN_API_BASE_URL` | — | 생략 가능 (기본값 동일) |

등록 후 마지막 deploy 를 **Redeploy** (env 는 새 빌드부터 적용).

> ⚠️ 보안: `.env.local` 커밋 금지(이미 `.gitignore` 처리), 토큰을 슬랙/이슈/PR 본문에 평문 금지,
> `NEXT_PUBLIC_` prefix 금지(브라우저 노출됨).

---

## 3. 동작 검증 — Status Badge

정산 페이지(`/settlement/*`) 우측 상단 badge 로 확인. **badge 클릭 시 즉시 재확인**(토큰 추가/교체 후 새로고침 불필요).

| Badge | 아이콘 | 의미 | 조치 |
|---|---|---|---|
| 🟢 emerald `연결됨 · {mb_id}` | ✓ | 토큰 유효 | 정상 |
| 🟡 amber `토큰 미설정` | ⚠ | `OPEN_API_TOKEN` 누락 | env 확인 후 재시작·재배포 |
| 🔴 rose `토큰 만료` | ✗ | 401 무효/폐기 | 재발급 → env 갱신 |
| 🔴 rose `권한 없음` | ✗ | 403 DSP 권한 부재 | 관리자 권한 요청 |
| 🔴 rose `오류` | ✗ | 네트워크/5xx | 잠시 후 badge 클릭 재시도 |
| ⚪ gray `확인 중` | · | /me 호출 중 | 대기 |

> 색 + 아이콘 이중 부호화로 색약 사용자도 구별(WCAG 1.4.1). 키보드 포커스 시 Enter/Space 로 재확인.

---

## 4. 견고성 동작 (PR #127)

- **타임아웃**: 업스트림 호출 30초 한도 + 5xx/네트워크 한정 지수 backoff 재시도 2회. 무기한 hang 방지.
- **호출 dedup**: 정산 4페이지가 badge 를 각각 mount 해도 `/me` 실제 호출은 60초 TTL 내 1회.
- **PII 최소화**: `/me` proxy 는 `mb_id`/`name` 만 브라우저로 전달 (email/roles/permissions 미노출).
- **입력 검증**: insights id 류는 숫자 콤마 다중(최대 500), `q` ≤128자, `orderBy` 화이트리스트.

---

## 5. SLI / SLO 권장 (운영 리뷰 ⑩)

도입 시 모니터링 지표 (Vercel Functions Log + 추후 Sentry):

| SLI | 목표(SLO) | alert |
|---|---|---|
| `open_api_5xx_rate` | < 1% / 5min | ≥ 1% |
| `p95_latency` | < 800ms | 초과 지속 |
| `token_days_to_expiry` | ≥ 30일 | 30/14/7일 전 |
| `settlement_page_availability` | ≥ 99.5% | 미달 |

- **토큰 만료 대비**: 정산 마감주(매월 25일~말일)에 만료가 겹치지 않도록 발급일 관리.
  현재 만료 30일 전 자동 알림은 미구현 — Vercel Cron 도입은 후속 과제.
- **로깅**: route handler 의 에러는 `console.error('[open-api/*]', ...)` 로 기록 (토큰 값 미포함).
  Sentry/Datadog 연동은 후속 과제.

---

## 6. 장애 대응

| 증상 | 원인 후보 | 조치 |
|---|---|---|
| 모든 badge amber | `OPEN_API_TOKEN` 누락 | env 등록 → redeploy |
| 모든 badge rose(만료) | 토큰 만료/폐기 | 재발급 → env 갱신 |
| 간헐 badge 오류 | 업스트림 지연/5xx | 자동 재시도 후에도 지속 시 Crosstarget 상태 확인 |
| 정산 페이지 자체는 정상 | (설계상) Open API 는 부가 기능 | 토큰 문제와 무관하게 기존 정산 동작 유지 |

> Open API 는 **부가 레이어**입니다. 토큰 미설정/장애 시에도 기존 Motiv/RAW CSV 기반 정산은
> 정상 동작하도록 격리되어 있습니다 (badge 만 비정상 색).
