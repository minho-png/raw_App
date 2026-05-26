# 매입/매출 현황 — 컬럼 정리 + 매체비 매체별 집계 기획안

> 사용자 요청 (2026-05-22)
>
> 1. 매입/매출 현황에 반영
> 2. 매출 표 — "수금일 기준 / 수금 기한 / 수취이메일" 제거
> 3. 매입 표 — "송금일 기준 / 송금기한" 제거
> 4. 네이버 GFA / 카카오모먼트 / META 매입은 캠페인 별 분리 → 매체별 합산
> 5. 네이버 GFA + 카카오모먼트 = 동일 거래처(매드코퍼레이션) → 통합 1행
>    (META 는 별도 — 사용자 정정: "왜 메타를 통합하냐고 네이버 카카오만 통합")

---

## 1. 영향 범위 (실측)

| 영역 | 파일 | 라인 |
|---|---|---|
| 매출 빌더 (CT+) | `lib/export/settlementExcel.ts` | 161-206 (`buildSalesRows` CT+ block) |
| 매출 빌더 (Motiv CT/CTV) | `lib/export/settlementExcel.ts` | 208-267 |
| 매입 빌더 (CT+ 매체) | `lib/export/settlementExcel.ts` | 325-362 (`buildPurchaseRows` CT+ block) |
| 매입 빌더 (Motiv 대행수수료) | `lib/export/settlementExcel.ts` | 391-414 |
| 매입 빌더 (DMP vendor) | `lib/export/settlementExcel.ts` | 416-495 |
| 매출/매입 표 UI | `app/settlement/sales-purchase/page.tsx` | 348-518 (SalesTable / PurchaseTable) |
| Override 모달 필드 | `app/settlement/sales-purchase/page.tsx` | 535-590 (`SALES_FIELDS`, `PURCHASE_FIELDS`) |
| 대행사별 청구 양식 | `lib/export/agencyForms.ts` | 73-100, 200-225 |

---

## 2. 변경 상세

### 2-1. 컬럼 제거 (요구 #2, #3)

**`SalesRow` 인터페이스** (`settlementExcel.ts:109-135`)
- 제거: `'수금일 기준'`, `'수금 기한'`, `수취이메일`
- **이유**: 사용자 운영상 활용도 낮음. 빈 채 노출되어 노이즈.

**`PurchaseRow` 인터페이스** (`settlementExcel.ts:274-296`)
- 제거: `'송금일 기준'`, `'송금기한'`

**Excel 헤더 배열** (`settlementExcel.ts:496-518`)
- 제거: 동일 4개 키

**UI 표 헤더/셀** (`sales-purchase/page.tsx:381-383, 414-416, 475-476, 509-510`)
- 제거

**Override 모달 필드 정의** (`sales-purchase/page.tsx:546-549, 577-578`)
- 제거: 동일 4개 키

**대행사 청구 양식** (`agencyForms.ts:75, 91-94, 136-137, 162-163, 205, 220-221, 261`)
- 제거 또는 빈 값으로 변경 (downstream 양식 유지 필요 시 헤더만 빈 채로 출력)

### 2-2. 매입 매체비 매체별 합산 (요구 #4, #5)

#### 현재 동작 (`settlementExcel.ts:325-362`)
```
for each CT+ campaign:
  for each mediaBudget (mb):
    rows.push({ 캠페인명: c.name, 거래처: supplier(mb.media), 공급가액: mb.netAmount, ... })
```
→ 캠페인 N × 매체 M = N×M 행. 동일 매체에 같은 거래처여도 캠페인 단위로 쪼개짐.

#### 변경 후
```
정의:
  supplierKey(media):
    '네이버 GFA' | '카카오모먼트' → 'mad'
    'META'                        → 'meta'
    'Google'                      → 'google'
    그 외                          → media

매체비 합산 버킷 = Map<supplierKey, {
  공급가액 합, 광고주 set, 캠페인 set, _agencyId(첫 발견값),
  대표 거래처명, 라벨(매체 합산 표시용)
}>

for each CT+ campaign:
  for each mb:
    key = supplierKey(mb.media)
    bucket[key].공급가액 += mb.netAmount
    bucket[key].캠페인 += c.name
    bucket[key].광고주 += adv.name

emit:
  for key in bucket:
    rows.push({
      년월: month,
      구분: 'CT+ (IMC) 매체비',
      거래처명: 거래처라벨(key),    // mad → '매드코퍼레이션', meta → 'META', google → 'Google'
      광고주명: 광고주.size === 1 ? 단일값 : '(전체 광고주 합산)',
      캠페인명: '(매체별 합산, N건)',
      공급가액: 합,
      세액/합계: 계산,
      ...
    })
```

#### 거래처 라벨 매핑
| supplierKey | 라벨 | 비고 |
|---|---|---|
| `mad` | `매드코퍼레이션` | 네이버 GFA + 카카오모먼트 통합 (괄호 매체명 제거) |
| `meta` | `META` | 단독 매체. 사용자 정정 — 통합 X |
| `google` | `Google` | 단독 매체 |

#### `_agencyId` 정책
- 동일 supplierKey 의 행들이 서로 다른 internal `agencyId` 를 가질 수 있음 (예: 캠페인마다 다른 대행사로 매핑).
- 그러나 **매체비 매입의 거래처는 매체사**이지 광고대행사가 아님 — 기존 `_agencyId` 도 광고대행사 ID 라 모순적.
- **결정**: 매체별 합산 행의 `_agencyId` 는 `supplier:{key}` 합성 키 사용. AgencySummaryPanel 그룹핑 시 매드/메타/구글 별 카드로 보이도록.
- 변경 사이드 이펙트: 기존 캠페인별 행은 광고대행사 ID 로 묶였는데, 변경 후엔 supplier 별로 묶임 — **대행사별 청구 양식 (`agencyForms.ts`) 동작 영향 검토 필요** (§4).

#### `_rowKey` 정책
- 변경: `purchase:{month}:supplier-{key}` (캠페인 ID 제거 — 캠페인 분리 X)
- Override 호환성: 기존 캠페인 × 매체 단위 override 는 **stale** 처리 → UI 에서 자동 표시 (이미 `staleCount` 알림 존재)

#### Motiv CT/CTV 대행수수료 행 — **불변**
- 사용자 요구 #4 는 "네이버 카카오 메타 매체비"에 한정. Motiv 의 대행수수료는 캠페인별 분리 유지.
- 사용자 정정으로 META 는 합산 X (네이버+카카오만)였지만, 이는 **매체비 통합**에 대한 답. Motiv 매체비는 Motiv API breakdown 의 mediaCost 이고 이미 별도 (이건 DMP vendor 합산만 존재) — 변경 영향 없음.

### 2-3. 변경 전후 행 수 예시

가정: CT+ 캠페인 3개 × 매체 4개 (네이버/카카오/META/Google) = 12 행
- **Before**: 12 행 (캠페인 × 매체)
- **After**: 3 행 (매드 / META / Google)
  - 매드코퍼레이션: 네이버 3캠 + 카카오 3캠 = 6개 매체비 합산
  - META: 3캠 합산
  - Google: 3캠 합산

---

## 3. 회귀 위험

| ID | 위험 | 영향도 | 완화 |
|---|---|---|---|
| R-01 | 컬럼 제거로 기존 사용자가 운영 시 의존했던 정보 손실 | Medium | 사용자 명시 요청. 운영 영향 사용자 책임. |
| R-02 | `_agencyId` 정책 변경 → AgencySummaryPanel 그룹핑 변화 | Medium | supplier 별 카드로 노출되도록 의도된 변경. 시각 확인 필요. |
| R-03 | 기존 override (캠페인 × 매체) 가 stale 처리되며 손실 | High | Override 자체는 localStorage 에 보존. UI 에 staleCount 알림 표시. 마이그레이션 X (사용자 운영 결정). |
| R-04 | 대행사별 청구 양식 (`agencyForms.ts`) 이 캠페인별 행을 가정 — 합산 행 1건만 들어오면 양식 호환성 의문 | High | §4 별도 결정 항목 |
| R-05 | `mediaCost` settlement 페이지 (`/settlement/media-cost`) 와 표시 일관성 | Medium | media-cost 페이지는 별도 데이터 소스 — 영향 없음 (실측 필요) |

### R-04 별도 결정
**`agencyForms.ts` 의 매입 청구 양식이 캠페인별 행을 펼침** (line 200-225).
- 변경 후엔 supplier 별 1행만 들어오므로 양식이 캠페인 단위 detail 을 잃음.
- **옵션 A**: agencyForms 도 supplier 합산 행 그대로 사용 → 청구서가 "매드코퍼레이션 1줄" 로 단순화 (사용자 의도일 가능성 높음)
- **옵션 B**: agencyForms 만 기존 캠페인×매체 raw 행 별도 빌더 호출 (`buildPurchaseRowsDetailed`) 로 분기

→ **권장: 옵션 A**. 사용자가 "매체별로" 라고 한 것은 출력 일관성 의도로 해석.

---

## 4. 사용자 결정 필요 (Pending)

| ID | 질문 | 권장 |
|---|---|---|
| D-01 | `agencyForms.ts` 청구 양식도 합산 행 사용? | A (단순화) |
| D-02 | 기존 캠페인×매체 override 데이터 마이그레이션? | X (사용자 운영, stale 알림으로 충분) |
| D-03 | 합산 행 캠페인명 표시? | `'(매체별 합산, N건)'` 형식 |
| D-04 | 합산 행 광고주명? 다중인 경우 표시? | 단일이면 그대로, 다중이면 `'(N개 광고주)'` |

---

## 5. 테스트 계획

- [ ] `npm run build` 통과
- [ ] CT+ 매출 표: 수금일 기준 / 수금 기한 / 수취이메일 컬럼 없음
- [ ] CT+ 매입 표: 송금일 기준 / 송금기한 컬럼 없음
- [ ] 매입 표: 네이버/카카오 통합 "매드코퍼레이션" 1행 + META 1행 + Google 1행
- [ ] 매입 표: CT+ 캠페인 매체비가 캠페인 단위로 분리되지 않음
- [ ] 합산 행 공급가액 = (모든 캠페인 × 해당 매체) netAmount 합
- [ ] AgencySummaryPanel: 매드/META/Google supplier 카드 노출
- [ ] Excel 다운로드 헤더에 제거 컬럼 없음
- [ ] 기존 override (수동 수정값) — staleCount 정상 노출

---

## 6. 변경 파일 요약

| 파일 | 변경 유형 | 라인 추정 |
|---|---|---|
| `lib/export/settlementExcel.ts` | 인터페이스 필드 제거 + 매입 빌더 합산 로직 추가 | -20 +60 |
| `app/settlement/sales-purchase/page.tsx` | 표 헤더/셀 + override 필드 정의 제거 | -20 +0 |
| `lib/export/agencyForms.ts` | 헤더 컬럼 제거 (옵션 A) | -10 +0 |

총 ~3 파일, ~110 라인 변동. AGENTS.md §6 "5 파일 이상" 임계 미만 — 추가 승인 불필요.

---

## 7. 구현 순서 (검증 사이클)

1. `settlementExcel.ts` 인터페이스 + 빌더 변경 → `npm run verify`
2. `sales-purchase/page.tsx` UI 컬럼 제거 → `npm run verify`
3. `agencyForms.ts` 헤더 정리 → `npm run verify`
4. 수동 검증 (Vercel preview 또는 로컬)
5. Commit 1건 + PR

Two-Strike Rule 적용: 동일 빌드 에러 2회 시 stop.
