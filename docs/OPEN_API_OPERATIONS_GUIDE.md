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
| 🟡 amber `경로 없음 · HTTP_404` | ⚠ | `/me` 엔드포인트 미배포/경로 오류 | Crosstarget API 배포 상태 확인 (아래 §7 진단) |
| 🟡 amber `응답 지연 · TIMEOUT` | ⚠ | 30초 초과 | 잠시 후 badge 클릭 재시도 |
| 🟡 amber `연결 실패 · NETWORK` | ⚠ | 서버 연결 불가 | 네트워크 확인 후 재시도 |
| 🔴 rose `토큰 만료 · HTTP_401` | ✗ | 401 무효/폐기 | 재발급 → env 갱신 |
| 🔴 rose `권한 없음 · HTTP_403` | ✗ | 403 DSP 권한 부재 | 관리자 권한 요청 |
| 🔴 rose `서버 오류 · HTTP_5xx` | ✗ | 업스트림 5xx | 잠시 후 재시도, 지속 시 관리자 |
| ⚪ gray `확인 중` | · | /me 호출 중 | 대기 |

> 색 + 아이콘 이중 부호화로 색약 사용자도 구별(WCAG 1.4.1). 라벨 옆 `· CODE` 칩으로 정확한 원인 표시.
> 키보드 포커스 시 Enter/Space, 또는 클릭으로 재확인.
>
> **중요**: badge 색은 **Open API 연결 상태**만 나타냅니다. 정산 매출/매입 데이터는 **Motiv+CT+** 기반이라
> badge 가 빨강이어도 정산 화면은 정상 동작하며, 반대로 badge 가 🟢 여도 데이터가 없을 수 있습니다 (별개 시스템).

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

---

## 7. `/me` 실패 원인 진단 (운영망 curl)

badge 가 `경로 없음(404)` 또는 `오류` 일 때, 토큰 문제인지 엔드포인트 미배포인지 가르는 절차.
`/me` 와 `/ads/insights` 는 **동일 토큰·base·인증**을 공유하므로 둘을 대조하면 원인이 확정됩니다.

```bash
T=$OPEN_API_TOKEN; B=https://manage2.crosstarget.co.kr/api/v1

# 1) /me 직접 호출 — 200=정상 / 404=경로오류 / 401=토큰무효
curl -i -H "Authorization: Bearer $T" -H "Accept: application/json" "$B/me"

# 2) insights 대조 — 토큰 자체 유효성 확인
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $T" \
  "$B/ads/insights?level=CAMPAIGN&dateFrom=2026-06-01&dateTo=2026-06-11"

# 3) /me 응답 shape 확인 — null 이면 {data:{...}} 구조 불일치
curl -s -H "Authorization: Bearer $T" "$B/me" | jq '.data.mb_id'
```

판별:
| /me | insights | 결론 |
|---|---|---|
| 404 | 200 | **엔드포인트 미배포/경로오류** (토큰은 정상) — Crosstarget 측 `/me` 배포 확인 |
| 401 | 401 | 토큰 무효/만료 — 재발급 |
| 503 | 503 | `OPEN_API_TOKEN` 미설정 |
| 200(data=null) | — | 응답 shape 불일치 — proxy 가 `data.mb_id` 접근 실패로 500 |

> insights 가 200 인데 /me 만 404 라면, badge 는 amber `경로 없음` 으로 표시되며 **정산 기능에는 영향 없음**.
> Open API 의 본격 데이터 활용(Phase 2 settlements reconciliation)은 `/me`·`/settlements` 엔드포인트가
> 운영망에서 200 으로 확인된 뒤 진행하는 것을 권장합니다.
