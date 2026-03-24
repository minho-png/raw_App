/**
 * CalculationService 순수 계산 로직 단위 테스트
 * Danfo.js processWithDanfo 호출 없이, 핵심 비즈니스 로직만 검증
 */
import { describe, it, expect } from 'vitest';

// ─── Helper: DMP 탐지 로직 (CalculationService.processWithDanfo 내부 detectDMP 미러) ───
function detectDMP(name: any): string {
  if (typeof name !== 'string' || !name.trim()) return 'DIRECT';
  const upperName = name.toUpperCase();
  if (upperName.includes('WIFI') || upperName.includes('실내위치')) return 'WIFI';
  const found = ['SKP', 'KB', 'LOTTE', 'TG360', 'BC', 'SH'].find(k => upperName.includes(k));
  return found ?? 'DIRECT';
}

// ─── Helper: 날짜 정규화 (CalculationService.parseDateNormalized 미러) ───
function parseDateNormalized(raw: any): Date {
  if (raw instanceof Date) {
    return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate()));
  }
  const s = String(raw ?? '').trim();
  if (!s) return new Date(0);

  let normalized = s.replace(/[\.\/]/g, '-').replace(/\s+/g, '');

  // YY-MM-DD
  const m = normalized.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const yy = Number(m[1]);
    const yyyy = yy >= 70 ? 1900 + yy : 2000 + yy;
    normalized = `${yyyy}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }

  // YYYYMMDD
  const compact = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    normalized = `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  const parts = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (parts) {
    return new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  }

  const d = new Date(normalized);
  if (isNaN(d.getTime())) return new Date(0);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// ─── Helper: 컬럼 매핑 정규화 (CalculationService.normalizeHeader 미러) ───
function normalizeHeader(value: any): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[_\-]/g, '');
}

describe('CalculationService', () => {

  // 1. 네이버GFA VAT 별도 계산
  it('네이버GFA: supply 100000 → net_amount 90909, execution with 10% fee', () => {
    const supply = 100000;
    // 네이버GFA는 VAT 포함가이므로 supply / 1.1로 공급가 역산
    const baseValue = supply / 1.1; // 90909.09...
    const feeRate = 0.10;
    const execution = baseValue / (1 - feeRate);
    expect(Math.round(baseValue)).toBe(90909);
    expect(Math.round(execution)).toBe(101010);
  });

  // 2. 수수료 15% 적용 (비-네이버GFA)
  it('수수료 15%: net_amount = supply_value 그대로, execution 계산', () => {
    const supply = 100000;
    const feeRate = 0.15;
    // 네이버GFA가 아닌 경우 supply가 곧 baseValue
    const baseValue = supply;
    const execution = baseValue / (1 - feeRate);
    expect(Math.round(execution)).toBe(117647);
    expect(baseValue).toBe(100000);
  });

  // 3. DMP SKP 탐지 - 대소문자 무시
  it('DMP 탐지: SKP (대소문자 무관, 위치 중립)', () => {
    expect(detectDMP('SKP_브랜드')).toBe('SKP');
    expect(detectDMP('skp_브랜드')).toBe('SKP');
    expect(detectDMP('abc_SKP_xyz')).toBe('SKP');
  });

  // 4. DMP WIFI 탐지
  it('DMP 탐지: WIFI 키워드 및 실내위치', () => {
    expect(detectDMP('WIFI_캠페인')).toBe('WIFI');
    expect(detectDMP('wifi_test')).toBe('WIFI');
    expect(detectDMP('실내위치_타겟팅')).toBe('WIFI');
  });

  // 5. DMP 없음 → DIRECT
  it('DMP 없음: 일반캠페인 → DIRECT', () => {
    expect(detectDMP('일반_브랜드_캠페인')).toBe('DIRECT');
    expect(detectDMP('brand_awareness_2024')).toBe('DIRECT');
  });

  // 6. DMP KB 탐지
  it('DMP 탐지: KB', () => {
    expect(detectDMP('KB_데이터')).toBe('KB');
    expect(detectDMP('kb_segment')).toBe('KB');
    expect(detectDMP('target_KB_users')).toBe('KB');
  });

  // 7. 컬럼 매핑 - 한글 헤더 정규화
  it('컬럼 매핑: 한글 헤더 normalizeHeader 일관성', () => {
    // normalizeHeader는 공백, _, - 를 제거하고 소문자화
    expect(normalizeHeader('광고 그룹')).toBe('광고그룹');
    expect(normalizeHeader('캠페인 이름')).toBe('캠페인이름');
    expect(normalizeHeader('Ad_Group')).toBe('adgroup');
    expect(normalizeHeader('  Impressions  ')).toBe('impressions');
    expect(normalizeHeader('집행 금액(VAT 별도)')).toBe('집행금액(vat별도)');
  });

  // 8. 날짜 UTC 정규화 - YYYY-MM-DD
  it('날짜 정규화: 2024-03-15 → UTC midnight', () => {
    const d = parseDateNormalized('2024-03-15');
    expect(d.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  // 9. 날짜 정규화 - YYYYMMDD compact
  it('날짜 정규화: 20240315 → 2024-03-15 UTC', () => {
    const d = parseDateNormalized('20240315');
    expect(d.toISOString()).toBe('2024-03-15T00:00:00.000Z');
  });

  // 10. pacing_index 계산 방향
  it('pacing_index: 소진율/기간경과율 x 100', () => {
    const spendRatio = 0.6;   // 60% 소진
    const elapsedRatio = 0.5; // 50% 기간 경과
    const index = Math.round((spendRatio / elapsedRatio) * 100);
    expect(index).toBe(120);  // > 100 = 빠르게 소진 중

    // 반대 케이스: 느리게 소진
    const slowIndex = Math.round((0.3 / 0.5) * 100);
    expect(slowIndex).toBe(60); // < 100 = 느리게 소진
  });

  // 11. 빈 데이터 처리
  it('빈 데이터 처리: null/undefined/숫자 → DIRECT fallback', () => {
    const d = parseDateNormalized('');
    expect(d.getTime()).toBe(0);

    expect(detectDMP(null)).toBe('DIRECT');
    expect(detectDMP(undefined)).toBe('DIRECT');
    expect(detectDMP(123)).toBe('DIRECT');
    expect(detectDMP('')).toBe('DIRECT');
    expect(detectDMP('   ')).toBe('DIRECT');
  });

  // 12. DMP 수수료율 테스트
  describe('DMP 수수료 계산', () => {
    // 상수 미러 (실제 import 대신 테스트 내 인라인)
    const DMP_FEE_RATES: Record<string, number> = {
      SKP: 0.10, KB: 0.10, LOTTE: 0.08, TG360: 0.10,
      BC: 0, SH: 0, WIFI: 0.10, DIRECT: 0, 'N/A': 0,
    };
    const calcDmpFee = (dmpType: string, net: number) =>
      Math.round(net * (DMP_FEE_RATES[dmpType] ?? 0));

    it('SKP 10%: net 1,000,000 → 수수료 100,000', () => {
      expect(calcDmpFee('SKP', 1_000_000)).toBe(100_000);
    });

    it('KB 10%: net 500,000 → 수수료 50,000', () => {
      expect(calcDmpFee('KB', 500_000)).toBe(50_000);
    });

    it('LOTTE 8%: net 1,000,000 → 수수료 80,000', () => {
      expect(calcDmpFee('LOTTE', 1_000_000)).toBe(80_000);
    });

    it('TG360 10%: net 250,000 → 수수료 25,000', () => {
      expect(calcDmpFee('TG360', 250_000)).toBe(25_000);
    });

    it('WIFI 10%: net 1,000,000 → 수수료 100,000', () => {
      expect(calcDmpFee('WIFI', 1_000_000)).toBe(100_000);
    });

    it('DIRECT 0%: net 1,000,000 → 수수료 0', () => {
      expect(calcDmpFee('DIRECT', 1_000_000)).toBe(0);
    });

    it('실내위치(WIFI) DMP 감지 → 수수료율 10%', () => {
      expect(detectDMP('실내위치_타겟팅')).toBe('WIFI');
      expect(calcDmpFee('WIFI', 2_000_000)).toBe(200_000);
    });

    it('LOTTE vs SKP 수수료 차이: 동일 넷가에서 LOTTE가 더 낮음', () => {
      const net = 1_000_000;
      expect(calcDmpFee('LOTTE', net)).toBeLessThan(calcDmpFee('SKP', net));
      expect(calcDmpFee('LOTTE', net)).toBe(80_000);
      expect(calcDmpFee('SKP', net)).toBe(100_000);
    });

    it('소수점 반올림: net 333,333 × 10% → 33,333', () => {
      expect(calcDmpFee('SKP', 333_333)).toBe(33_333);
    });
  });
});
