/**
 * Publica 리포트 분석 오케스트레이션 — Service 계층.
 *
 * 메일(첨부 포함) → 파싱 → 규칙 탐지 → 분석 결과.
 * 규칙 탐지는 순수 동기 함수(analyzeMessages)로 두고, 선택 기능인 LLM 요약만
 * 별도 비동기 함수로 분리한다 — LLM 장애가 알림 자체를 막지 않도록.
 */

import Anthropic from '@anthropic-ai/sdk'
import { parseAttachment } from './reportParser'
import { buildErrorBreakdowns } from './errorCodes'
import {
  detectBasicAnomalies,
  detectPublisherAnomalies,
  detectErrorAnomalies,
  finalizeAnomalies,
  countBySeverity,
  DEFAULT_DETECT_OPTIONS,
} from './anomalyDetector'
import type {
  PublicaMessage,
  PublicaAnalysis,
  PublicaAnomaly,
  ParsedReport,
  BasicRow,
  ErrorBreakdown,
  DetectOptions,
  LlmInsight,
} from './types'

/** env 로 임계값 override. 미설정·비정상 값은 기본값 유지. */
export function detectOptionsFromEnv(): DetectOptions {
  const num = (key: string, fallback: number): number => {
    const raw = process.env[key]
    if (!raw) return fallback
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : fallback
  }
  return {
    renderRateFloor: num('PUBLICA_RENDER_RATE_FLOOR', DEFAULT_DETECT_OPTIONS.renderRateFloor),
    timeoutRateCeiling: num('PUBLICA_TIMEOUT_RATE_CEILING', DEFAULT_DETECT_OPTIONS.timeoutRateCeiling),
    integrationShareWarn: num('PUBLICA_INTEGRATION_SHARE_WARN', DEFAULT_DETECT_OPTIONS.integrationShareWarn),
    integrationShareCritical: num('PUBLICA_INTEGRATION_SHARE_CRITICAL', DEFAULT_DETECT_OPTIONS.integrationShareCritical),
    metricDropRatio: num('PUBLICA_METRIC_DROP_RATIO', DEFAULT_DETECT_OPTIONS.metricDropRatio),
    maxAnomalies: num('PUBLICA_MAX_ANOMALIES', DEFAULT_DETECT_OPTIONS.maxAnomalies),
  }
}

/**
 * 메일 묶음을 분석한다 (LLM 제외 — 순수 동기).
 *
 * 첨부 1개의 파싱 실패가 전체를 막지 않도록 개별 try/catch 로 감싸고
 * warnings 에 수집한다 (부분 성공 우선).
 */
export function analyzeMessages(
  messages: PublicaMessage[],
  options: DetectOptions = DEFAULT_DETECT_OPTIONS,
): PublicaAnalysis {
  const reports: ParsedReport[] = []
  const warnings: string[] = []

  for (const message of messages) {
    for (const attachment of message.attachments) {
      try {
        const report = parseAttachment(attachment)
        if (report) reports.push(report)
        // 판별 실패(null)는 Publica 리포트가 아닌 첨부일 수 있으므로 조용히 무시.
      } catch (e) {
        warnings.push(`첨부 파싱 실패: ${attachment.filename} — ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  const raw: PublicaAnomaly[] = []
  let latest: BasicRow | null = null
  let breakdowns: ErrorBreakdown[] = []

  for (const report of reports) {
    if (report.kind === 'basic') {
      raw.push(...detectBasicAnomalies(report.rows, options))
      if (report.rows.length > 0) latest = report.rows[report.rows.length - 1]
    } else if (report.kind === 'publisher') {
      raw.push(...detectPublisherAnomalies(report.rows, options))
    } else {
      const bds = buildErrorBreakdowns(report.rows)
      breakdowns = breakdowns.concat(bds)
      raw.push(...detectErrorAnomalies(bds, options))
    }
  }

  const { anomalies, truncated } = finalizeAnomalies(raw, options)

  if (reports.length === 0 && messages.length > 0) {
    warnings.push('수신한 메일에서 분석 가능한 Publica 리포트 CSV 를 찾지 못했습니다.')
  }

  return {
    messages,
    reports,
    anomalies,
    truncated,
    counts: countBySeverity(anomalies),
    breakdowns,
    latest,
    llm: null,
    warnings,
  }
}

// ─────────────────────────────────────────────────────────────
//  선택 기능 — LLM 보조 요약
// ─────────────────────────────────────────────────────────────

/** LLM 요약 활성 여부 (기본 비활성 — 명시적으로 켜야 호출). */
export function isLlmEnabled(): boolean {
  return process.env.PUBLICA_LLM_ENABLED === 'true' && Boolean(process.env.ANTHROPIC_API_KEY)
}

const INSIGHT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '전체 상황 3~4문장 한국어 요약' },
    observations: {
      type: 'array',
      items: { type: 'string' },
      description: '규칙이 놓쳤을 수 있는 추가 관찰 사항 (없으면 빈 배열)',
    },
  },
  required: ['summary', 'observations'],
  additionalProperties: false,
} as const

/** LLM 에 넘길 압축 컨텍스트 — 원본 CSV 전체가 아니라 집계·탐지 결과만 전달. */
function buildLlmContext(analysis: PublicaAnalysis): string {
  const lines: string[] = []
  if (analysis.latest) {
    const l = analysis.latest
    lines.push(`최신일(${l.date}) 전체: 요청 ${l.bidRequests}, 응답 ${l.bidResponses}, 에러 ${l.bidErrors}, 타임아웃 ${l.bidTimeouts}, 낙찰 ${l.bidWon}, 노출 ${l.impressions}, 매출 ${l.revenue}, 응답률 ${l.responseRate}, 렌더율 ${l.renderRate}`)
  }
  for (const b of analysis.breakdowns) {
    lines.push(`퍼블리셔 ${b.publisherName}: 총에러 ${b.totalErrors} (연동 ${b.byClass.integration}/설정 ${b.byClass.config}/정상 ${b.byClass.expected}); 상위코드 ${b.codes.slice(0, 5).map(c => `${c.code}:${c.name}=${c.count}`).join(', ')}`)
  }
  lines.push('', '규칙 기반 탐지 결과:')
  if (analysis.anomalies.length === 0) lines.push('  (없음)')
  for (const a of analysis.anomalies) {
    lines.push(`  [${a.severity}] ${a.source}/${a.subject}: ${a.message}`)
  }
  return lines.join('\n')
}

const SYSTEM_PROMPT = `당신은 CTV 광고 SSP 운영 분석가입니다. Publica(SSP)의 일일 입찰 리포트 분석 결과를 검토합니다.

판단 기준:
- Publica 에러의 상당수(중복 제거, No fill, 낙찰 실패, 플로어 미달)는 정상적인 경매 결과이며 대응이 필요 없습니다.
- 연동 장애(BID_CONNECTION_ERROR, BAD_SERVER_RESPONSE, CONNECTION_ERROR 등)와 퍼널 단절(요청 대비 응답 0, 낙찰 대비 노출 0)이 실제 조치 대상입니다.

한국어로, 운영자가 바로 판단할 수 있게 간결히 작성하세요. 데이터에 없는 수치를 추측하지 마세요.`

/**
 * 규칙 탐지 결과에 LLM 요약을 덧붙인다.
 *
 * 실패해도 분석 자체는 유지 — 경고만 남기고 llm 은 null 로 둔다.
 * (일일 cron 이므로 알림 발송이 LLM 가용성에 묶이면 안 됨)
 */
export async function attachLlmInsight(analysis: PublicaAnalysis): Promise<PublicaAnalysis> {
  if (!isLlmEnabled()) return analysis

  try {
    const client = new Anthropic()
    const response = await client.messages.parse({
      model: process.env.PUBLICA_LLM_MODEL?.trim() || 'claude-opus-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `다음은 Publica 데일리 리포트의 집계와 규칙 기반 탐지 결과입니다.\n\n${buildLlmContext(analysis)}\n\n전체 상황을 요약하고, 규칙이 놓쳤을 수 있는 관찰 사항이 있으면 지적해 주세요.`,
      }],
      output_config: { format: { type: 'json_schema', schema: INSIGHT_SCHEMA } },
    })

    const parsed = response.parsed_output as LlmInsight | null
    if (!parsed || typeof parsed.summary !== 'string') {
      return { ...analysis, warnings: [...analysis.warnings, 'LLM 응답을 해석하지 못해 요약을 생략했습니다.'] }
    }
    return {
      ...analysis,
      llm: {
        summary: parsed.summary,
        observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      },
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[publica] LLM 요약 실패:', msg)
    return { ...analysis, warnings: [...analysis.warnings, `LLM 요약 실패 (분석은 정상): ${msg}`] }
  }
}
