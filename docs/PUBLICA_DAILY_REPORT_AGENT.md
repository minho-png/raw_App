# Publica 데일리 리포트 분석 에이전트

매일 도착하는 Publica 리포트 메일을 읽어 **이상 징후만 골라** 메일로 알려주는 cron 에이전트.

---

## 1. 무엇을 읽는가

Publica(`svc-publica-reporting@…`)는 매일 **3통**을 보내고, 각 메일에 CSV 1개가 붙어 있다.
각 CSV 는 생성일 기준 **직전 7일** 구간을 담는다.

| 메일 제목 | 첨부 파일명 | 내용 |
|---|---|---|
| Motiv/Publica Daily Report | `…motiv_basic_daily_report_…csv` | 날짜별 전체 집계 (7행) |
| Motiv/Publica Publisher Report | `…motiv_pub_daily_report_…csv` | 퍼블리셔별 기간 집계 |
| Motiv/Publica Error Report | `…motiv_error_daily_report_…csv` | 퍼블리셔 × 에러코드별 건수 |

컬럼 스펙은 `lib/publica/types.ts`, 파싱은 `lib/publica/reportParser.ts` 참고.
리포트 종류는 **파일명 1순위 → 헤더 시그니처 2순위**로 판별하므로, 파일명 규칙이 바뀌어도 동작한다.

---

## 2. 개인 메일함을 열지 않는 구조

리포트는 개인 업무 계정으로 도착하지만, 에이전트에 개인 메일함 자격증명을 넣지 않는다.

```
개인 계정 (예: dk.lee@motiv-i.com)
   └─ Gmail 필터: from:(publica) → 봇 주소로 자동 전달
                                        │
                                        ▼
                              봇 메일함 (리포트 전용)
                                        │  IMAP 읽기 전용
                                        ▼
                                     raw_App
                                        │  분석
                                        ▼
                        봇 메일함에서 발신 ──▶ 개인 계정 (분석 결과 수신)
```

봇 메일함은 **하나**다. 같은 계정이 리포트를 받고(IMAP) 분석 결과를 보낸다(SMTP).

- 저장소·Vercel 환경변수에는 **봇 메일함** 자격증명만 들어간다.
- 개인 메일은 전달 대상이 아니므로 애초에 도달하지 않는다.
- 필터를 끄면 그 즉시 파이프라인이 멈춘다 (권한 회수가 곧바로 가능).
- IMAP 은 `readOnly` 로 열어 메일 플래그를 바꾸지 않는다 → 사람이 보는 받은편지함 상태에 영향 없고, 재실행도 안전하다.

### 설정 절차

1. **봇 메일함 준비** — 리포트 전용 계정을 만들고 2단계 인증 활성화 후 앱 비밀번호를 발급한다.
   Workspace 계정이면 관리자 정책상 앱 비밀번호가 막혀 있을 수 있으니 먼저 확인할 것.
2. **개인 계정에 전달 필터 생성** — Gmail 설정 → 필터 → `from:(publica)` (실제 발신 주소로 좁히면 더 안전) →
   "다음 주소로 전달" 에 봇 주소 지정. 전달 주소는 봇 메일함에서 승인 메일을 받아야 활성화된다.
3. **환경변수 등록** — 아래 3번 항목.
4. **동작 확인** — 아래 5번 항목.

---

## 3. 환경변수

필수:

| 변수 | 설명 |
|---|---|
| `CRON_SECRET` | cron 엔드포인트 인증 (기존 cron 과 공용) |
| `PUBLICA_IMAP_USER` | 봇 메일함 주소 |
| `PUBLICA_IMAP_PASSWORD` | 봇 계정 앱 비밀번호 (공백은 자동 제거) |
| `PUBLICA_ALERT_RECIPIENT` | 결과 수신 주소 (예: `dk.lee@motiv-i.com`). **폴백 없음** |

> **발신 계정은 공용 `GMAIL_USER` 를 쓰지 않는다.**
> Publica 알림은 위 봇 계정(`PUBLICA_IMAP_*`)으로 발송된다 — 봇 메일함 하나가
> 리포트 수신과 알림 발신을 겸한다. 발신만 다른 계정으로 나누고 싶으면
> `PUBLICA_SMTP_USER` / `PUBLICA_SMTP_PASSWORD` 를 따로 지정한다.
> 전용 계정이 없거나 공용 `GMAIL_USER` 와 같은 주소면 **발송 대신 에러**를 낸다
> (잘못된 계정으로 새어나가는 것보다 안 나가는 편이 낫다).
> 의도적으로 같은 주소를 쓰려면 `PUBLICA_ALLOW_SHARED_SENDER=true`.

선택값(조회 조건·발송 정책·탐지 임계값·LLM)은 `.env.local.example` 의
「Publica 데일리 리포트 에이전트」 절에 전부 주석과 함께 정리되어 있다.

---

## 4. 무엇을 이상으로 보는가

### 4-1. 에러코드 등급 분류가 핵심

Publica 의 `bid_errors` 는 **대부분 정상 경매 결과**다. 실제 샘플에서 삼성 코리아의
주간 에러 103만 건 중 78만 건이 "Pod 내 미디어파일 중복 제거"(코드 22)였다.
따라서 **총 에러 건수는 신호가 되지 않는다.**

`lib/publica/errorCodes.ts` 는 문서에 정의된 74개 코드를 3등급으로 나눈다.

| 등급 | 의미 | 예시 | 대응 |
|---|---|---|---|
| `integration` | 연동·프로토콜 장애 | 83 `BID_CONNECTION_ERROR`, 3 `BAD_SERVER_RESPONSE` | 엔지니어 확인 |
| `config` | 설정·소재 문제 | 37 비트레이트 초과, 60 소재 URL 404 | 세팅 조정 |
| `expected` | 정상 경매 결과 | 22/23 중복 제거, 13 No fill, 26 낙찰 실패 | 대응 불필요 |

> ⚠️ 이 등급 분류는 문서의 Description 을 근거로 한 **운영 판단**이며 Publica 공식 구분이 아니다.
> 운영하며 조정이 필요하면 `lib/publica/errorCodes.ts` 의 `class` 값만 고치면 된다.
> 사전에 없는 코드가 나오면 `integration`(조사 대상)으로 간주하고 별도 경고를 낸다.

### 4-2. 탐지 규칙

`lib/publica/anomalyDetector.ts`

**basic 리포트** — 최신일을 직전 6일 **중앙값**과 비교 (평균은 하루 급등에 흔들려 중앙값 사용).

| 규칙 | 조건 | 등급 |
|---|---|---|
| `metric_drop` | 매출·노출·응답·낙찰이 기준선 대비 30% 이상 하락 | 주의 |
| `metric_drop` | 위 지표가 0 (기준선은 0 초과) | 심각 |
| `low_render_rate` | 렌더율 < 0.8 | 주의 |
| `timeout_spike` | 타임아웃율 > 1% | 주의 |

**publisher 리포트** — 요청 → 응답 → 낙찰 → 노출 → 매출 퍼널에서 **끊긴 첫 지점만** 보고한다
(한 장애가 5건으로 부풀지 않도록).

| 규칙 | 조건 | 등급 |
|---|---|---|
| `no_bid_response` | 요청 > 0, 응답 = 0 | 심각 |
| `no_win` | 응답 > 0, 낙찰 = 0 | 심각 |
| `no_impression` | 낙찰 > 0, 노출 = 0 | 심각 |
| `no_revenue` | 노출 > 0, 매출 = 0 | 주의 |
| `low_render_rate` / `timeout_spike` | 퍼널이 정상이어도 별도 점검 | 주의 |

**error 리포트** — `integration` 등급의 **비중**으로 판정한다.

| 규칙 | 조건 | 등급 |
|---|---|---|
| `integration_errors` | integration 비중 ≥ 20% | 심각 |
| `integration_errors` | integration 비중 ≥ 5% | 주의 |
| `unknown_error_code` | 사전에 없는 코드 출현 | 주의 |

**리포트 미수신** — 조회 구간에 메일이 없으면 그 자체를 알린다 (`PUBLICA_ALERT_ON_MISSING=false` 로 끌 수 있음).
무소식이 곧 장애일 수 있으므로 기본 활성.

### 4-3. 실제 샘플 검증 결과

2026-08-20~26 리포트로 파이프라인을 돌린 결과:

```
[심각] (error)     LG Electronics — 연동성 에러 비중 100.0% (5,169/5,169건) — 최다 83 BID_CONNECTION_ERROR
[심각] (publisher) LG Electronics — 입찰 요청 20,545,752건에 응답 0건 — 연동 중단 의심
[주의] (error)     Samsung Korea  — 연동성 에러 비중 14.8% (153,032/1,031,799건) — 최다 83 BID_CONNECTION_ERROR
```

삼성은 퍼널·지표 모두 정상이라 퍼블리셔 규칙에서는 걸리지 않았고, basic 리포트도 이상 없음으로 나왔다.

---

## 5. 동작 확인

```bash
# 로컬
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/publica-daily-report

# 배포 후
curl -H "Authorization: Bearer $CRON_SECRET" https://<배포주소>/api/cron/publica-daily-report
```

응답 예시:

```json
{
  "ok": true, "sent": true, "messages": 3,
  "reports": ["basic", "error", "publisher"],
  "counts": { "critical": 2, "warning": 1, "info": 0 }
}
```

`sent: false` 이고 `reason: "no_anomalies"` 면 정상 동작 중이며 알릴 이상이 없다는 뜻이다.
401 이 나오면 응답의 `reason`/`hint` 가 원인을 짚어준다.

---

## 6. 스케줄

`vercel.json` 에 `0 4 * * *` (UTC) = **13:00 KST** 로 등록되어 있다.
샘플의 리포트 생성 시각이 03:00 UTC 근처라 그 이후로 잡았다.
실제 도착 시각을 며칠 관찰한 뒤 조정하는 것을 권한다.
조회 구간이 기본 26시간이라 다소 지연돼도 놓치지 않는다.

---

## 7. LLM 보조 요약 (선택)

`PUBLICA_LLM_ENABLED=true` + `ANTHROPIC_API_KEY` 설정 시, 규칙 탐지 결과에
한국어 요약과 추가 관찰 사항을 덧붙인다.

- 원본 CSV 전체가 아니라 **집계와 탐지 결과만** 전달한다 (토큰·정보 노출 최소화).
- 호출이 실패해도 알림은 그대로 발송된다 (경고만 본문에 남음).
- 기본 비활성 — 규칙 탐지만으로 완결 동작한다.

---

## 8. 구성 파일

| 경로 | 계층 | 역할 |
|---|---|---|
| `lib/publica/types.ts` | Model | 리포트·이상징후 타입 |
| `lib/publica/errorCodes.ts` | Model | 에러코드 74종 사전 + 등급 분류 + 퍼블리셔별 집계 |
| `lib/publica/reportParser.ts` | Service | CSV → 타입 있는 행 |
| `lib/publica/anomalyDetector.ts` | Service | 탐지 규칙 (순수 함수) |
| `lib/publica/alertFormatter.ts` | Service | 메일 제목·본문 |
| `lib/publica/reportAnalyzer.ts` | Service | 오케스트레이션 + LLM |
| `lib/email/imapReader.ts` | Repository | 봇 메일함 IMAP 조회 |
| `lib/email/publicaSender.ts` | Repository | 전용 계정 발신 (공용 계정 폴백 차단) |
| `lib/auth/cronAuth.ts` | — | cron Bearer 인증 |
| `app/api/cron/publica-daily-report/route.ts` | Controller | 엔드포인트 |
| `tests/publicaErrorCodes.test.ts` | 테스트 | 사전·집계 |
| `tests/publicaAnomalyDetector.test.ts` | 테스트 | 탐지 규칙 (실제 샘플 수치 사용) |

`anomalyDetector.ts` 와 `errorCodes.ts` 는 런타임 import 가 없어
(`import type` 만 사용) `npm run verify` 의 격리 테스트에서 node_modules 없이 실행된다.
이 제약 때문에 에러코드 분류를 쓰는 집계(`buildErrorBreakdowns`)는 `errorCodes.ts` 안에 있다.
