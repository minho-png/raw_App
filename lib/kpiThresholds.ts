"use client"
import { useEffect, useState } from "react"

// KPI 경고 임계값 — 사용자 설정 가능. localStorage 에 저장.
// CT+ / CT / CTV 분석 페이지의 KPI 표 + 메인 대시보드 도메인 경고에 공통 적용.
//
// 판정 규칙:
//   - 예산(Budget): 진행률 - 소진률 ≥ budgetLagWarn(%p) → 지연 경고
//                  소진률 - 진행률 ≥ budgetOverWarn(%p) → 초과 소진 경고
//   - CTR/VTR (higher better): 목표 - 실적 ≥ deficit(%p) → 미달 경고
//   - CPC/CPM (lower better):  실적 / 목표 ≥ (1 + exceed/100) → 초과 경고

export interface KpiThresholds {
  /** 진행률 - 소진률 차이 (예: 15 = 15%p 이상 차이면 지연 경고) */
  budgetLagWarn: number
  /** 소진률 - 진행률 차이 (예: 15 = 초과 소진 경고) */
  budgetOverWarn: number
  /** CTR 목표 - 실적 (%p) — 이상이면 미달 경고 */
  ctrDeficitWarn: number
  /** VTR 목표 - 실적 (%p) */
  vtrDeficitWarn: number
  /** CPC 초과 비율 (%) — 실적 ≥ 목표 × (1 + N/100) 면 경고 */
  cpcExceedWarn: number
  /** CPM 초과 비율 (%) */
  cpmExceedWarn: number
}

export const DEFAULT_KPI_THRESHOLDS: KpiThresholds = {
  budgetLagWarn:   15,
  budgetOverWarn:  15,
  ctrDeficitWarn:  0.05,
  vtrDeficitWarn:  5,
  cpcExceedWarn:   10,
  cpmExceedWarn:   10,
}

const STORAGE_KEY = 'kpi-thresholds-v1'

export function loadKpiThresholds(): KpiThresholds {
  if (typeof window === 'undefined') return DEFAULT_KPI_THRESHOLDS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_KPI_THRESHOLDS
    const parsed = JSON.parse(raw) as Partial<KpiThresholds>
    return { ...DEFAULT_KPI_THRESHOLDS, ...parsed }
  } catch {
    return DEFAULT_KPI_THRESHOLDS
  }
}

export function saveKpiThresholds(t: KpiThresholds): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)) } catch {}
}

/** 다른 탭/창에서 동기화되도록 storage 이벤트 구독 */
export function useKpiThresholds() {
  const [thresholds, setThresholds] = useState<KpiThresholds>(DEFAULT_KPI_THRESHOLDS)
  useEffect(() => {
    setThresholds(loadKpiThresholds())
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setThresholds(loadKpiThresholds())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const update = (next: KpiThresholds) => {
    setThresholds(next)
    saveKpiThresholds(next)
  }
  return { thresholds, update, reset: () => update(DEFAULT_KPI_THRESHOLDS) }
}

// ── 경고 판정 헬퍼 ────────────────────────────────────────────
export type KpiWarnKind = 'budget_lag' | 'budget_over' | 'ctr' | 'vtr' | 'cpc' | 'cpm'

export interface KpiWarning {
  kind: KpiWarnKind
  message: string
}

export function checkBudgetWarning(
  spendRate: number, progress: number, t: KpiThresholds,
): KpiWarning | null {
  const lag = progress - spendRate   // 진행 대비 소진 부족
  const over = spendRate - progress  // 진행 대비 소진 초과
  if (lag >= t.budgetLagWarn) {
    return { kind: 'budget_lag', message: `소진 지연 ${lag.toFixed(1)}%p` }
  }
  if (over >= t.budgetOverWarn) {
    return { kind: 'budget_over', message: `소진 초과 ${over.toFixed(1)}%p` }
  }
  return null
}

export function checkRateWarning(
  metric: 'CTR' | 'VTR',
  target: number, actual: number, t: KpiThresholds,
): KpiWarning | null {
  if (target <= 0) return null
  const deficit = target - actual  // higher better
  const limit = metric === 'CTR' ? t.ctrDeficitWarn : t.vtrDeficitWarn
  if (deficit >= limit) {
    return { kind: metric === 'CTR' ? 'ctr' : 'vtr',
      message: `${metric} 미달 ${deficit.toFixed(2)}%p` }
  }
  return null
}

export function checkCostWarning(
  metric: 'CPC' | 'CPM',
  target: number, actual: number, t: KpiThresholds,
): KpiWarning | null {
  if (target <= 0 || actual <= 0) return null
  const exceedPct = ((actual - target) / target) * 100  // lower better
  const limit = metric === 'CPC' ? t.cpcExceedWarn : t.cpmExceedWarn
  if (exceedPct >= limit) {
    return { kind: metric === 'CPC' ? 'cpc' : 'cpm',
      message: `${metric} 초과 ${exceedPct.toFixed(1)}%` }
  }
  return null
}
