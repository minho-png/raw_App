// 캠페인 페이싱(소진 속도) 계산 — 일예산 기준.
//
// 비교 모델:
//   timeProgress = 현재 시각의 하루 진행률 (0.00 ~ 1.00)
//   spendRate    = daily_spent / daily_budget (0.00 ~ 1.00+)
//   diff         = spendRate - timeProgress  (퍼센트 포인트)
//
// 판정 (사용자 설정 — 10%p / 20%p):
//   |diff| < 10%p  → OK (정상 페이스)
//   |diff| < 20%p  → WARN (경고)
//   |diff| ≥ 20%p  → DANGER (위험)
// 부호:
//   diff < 0  → 과소 소진 (under-pacing)
//   diff > 0  → 과다 소진 (over-pacing)

export type PacingLevel = 'ok' | 'warn' | 'danger' | 'no_budget'
export type PacingDirection = 'under' | 'over' | 'on'

export interface PacingResult {
  level: PacingLevel
  direction: PacingDirection
  spendRate: number    // 0~1+
  timeProgress: number // 0~1
  diffPp: number       // (spendRate - timeProgress) * 100, 부호 포함 %p
  label: string        // UI 표시용 (예: '-15%p · 과소', '+22%p · 과다')
}

const DEFAULT_WARN_PP = 10
const DEFAULT_DANGER_PP = 20

export function todayProgress(now: Date = new Date()): number {
  const ms = now.getHours() * 3600_000 + now.getMinutes() * 60_000 + now.getSeconds() * 1000
  return ms / 86_400_000
}

export function pacingStatus(
  dailySpent: number,
  dailyBudget: number,
  opts: { warnPp?: number; dangerPp?: number; now?: Date } = {},
): PacingResult {
  const warnPp = opts.warnPp ?? DEFAULT_WARN_PP
  const dangerPp = opts.dangerPp ?? DEFAULT_DANGER_PP
  const tp = todayProgress(opts.now)

  if (!dailyBudget || dailyBudget <= 0) {
    return {
      level: 'no_budget',
      direction: 'on',
      spendRate: 0, timeProgress: tp, diffPp: 0,
      label: '일예산 없음',
    }
  }

  const sr = dailySpent / dailyBudget
  const diff = sr - tp
  const diffPp = Math.round(diff * 100 * 10) / 10
  const absPp = Math.abs(diffPp)

  const level: PacingLevel =
    absPp < warnPp ? 'ok'
    : absPp < dangerPp ? 'warn'
    : 'danger'

  const direction: PacingDirection =
    Math.abs(diffPp) < 1 ? 'on'
    : diffPp < 0 ? 'under'
    : 'over'

  const sign = diffPp > 0 ? '+' : ''
  const dirLabel = direction === 'under' ? '과소'
    : direction === 'over' ? '과다'
    : '정상'

  return {
    level,
    direction,
    spendRate: sr,
    timeProgress: tp,
    diffPp,
    label: `${sign}${diffPp}%p · ${dirLabel}`,
  }
}

// UI tone — Tailwind 클래스 매핑
export function pacingToneClasses(level: PacingLevel): { bg: string; text: string; dot: string } {
  switch (level) {
    case 'ok':        return { bg: 'bg-emerald-50',  text: 'text-emerald-700',  dot: 'bg-emerald-500' }
    case 'warn':      return { bg: 'bg-amber-50',    text: 'text-amber-700',    dot: 'bg-amber-500' }
    case 'danger':    return { bg: 'bg-rose-50',     text: 'text-rose-700',     dot: 'bg-rose-500' }
    case 'no_budget': return { bg: 'bg-gray-50',     text: 'text-gray-500',     dot: 'bg-gray-300' }
  }
}
