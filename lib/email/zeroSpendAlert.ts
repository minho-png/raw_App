import { fetchCampaigns } from '@/lib/motivApi/campaignService'
import type { MotivCampaign, MotivCampaignType } from '@/lib/motivApi/types'
import { motivTypeToProduct, isExcludedCampaign, type MediaProductType } from '@/lib/motivApi/productMapping'

// 알림 대상 campaign_type (CT + CTV)
const ALERT_TYPES: MotivCampaignType[] = ['DISPLAY', 'VIDEO', 'PARTNERS', 'TV']

export interface ZeroSpendEntry {
  campaign: MotivCampaign
  product: MediaProductType  // 'CT' | 'CTV' (CT_PLUS 는 Motiv 에 없음)
  impressions: number
}

function isTodayInRange(c: MotivCampaign, now: Date): boolean {
  const s = c.start_date ? new Date(c.start_date) : null
  const e = c.end_date   ? new Date(c.end_date)   : null
  if (!s && !e) return false
  const cs = s ?? new Date(0)
  const ce = e ?? new Date(9e13)
  ce.setHours(23, 59, 59, 999)
  return now >= cs && now <= ce
}

function totalImpressions(c: MotivCampaign): number {
  const win  = Number(c.stats?.win ?? 0)
  const vImp = Number(c.stats?.v_impression ?? 0)
  return (Number.isFinite(win) ? win : 0) + (Number.isFinite(vImp) ? vImp : 0)
}

/**
 * CT/CTV 활성 캠페인 중 **노출 0** 항목을 조회 (실제 미노출 여부).
 * 조건: status=Y + 기간 내 + win + v_impression === 0.
 *
 * daily_spent 기반에서 전환 — 무료 캠페인(is_free) 오탐 방지 및
 * 과금 구조와 무관한 실노출 여부로 판단.
 * 서버사이드 전용 (process.env.MOTIV_API_TOKEN 직접 사용).
 */
export async function collectZeroSpendCampaigns(now: Date = new Date()): Promise<ZeroSpendEntry[]> {
  const results = await Promise.all(ALERT_TYPES.map(t =>
    fetchCampaigns({
      campaign_type: t,
      status: 'Y',
      per_page: 200,
      page: 1,
      sort: '-created_at',
    })
  ))

  const out: ZeroSpendEntry[] = []
  for (const r of results) {
    for (const c of r.data) {
      if (isExcludedCampaign(c.title)) continue
      if (c.status !== 'Y') continue
      if (!isTodayInRange(c, now)) continue
      const impressions = totalImpressions(c)
      if (impressions > 0) continue
      const product = motivTypeToProduct(c.campaign_type)
      if (product !== 'CT' && product !== 'CTV') continue
      out.push({ campaign: c, product, impressions })
    }
  }
  return out
}

/**
 * 이메일 제목 · 본문 포매팅.
 * 사용자 요구: "캠페인 명하고 상품CTV인지 CT인지만 표기"
 */
export function formatZeroSpendEmail(entries: ZeroSpendEntry[], now: Date): {
  subject: string
  text: string
  html: string
} {
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const subject = `[${dateStr} 09:00] 미노출 CT/CTV 캠페인 ${entries.length}건`

  if (entries.length === 0) {
    const text = `${dateStr} 오전 9시 기준 — 미노출(노출 0) 활성 CT/CTV 캠페인이 없습니다.`
    const html = `<p>${text}</p>`
    return { subject, text, html }
  }

  // 정렬: CTV 먼저, 그 안에서 가나다순
  const sorted = [...entries].sort((a, b) => {
    if (a.product !== b.product) return a.product === 'CTV' ? -1 : 1
    return (a.campaign.title ?? '').localeCompare(b.campaign.title ?? '')
  })

  const lines = sorted.map(({ campaign, product }) => {
    const name = campaign.title ?? `#${campaign.id}`
    return `[${product}] ${name}`
  })

  const text = [
    `${dateStr} 오전 9시 기준 미노출 CT/CTV 캠페인 ${entries.length}건`,
    '(활성 · 기간 내 · win+v_impression = 0)',
    '',
    ...lines,
  ].join('\n')

  const rows = sorted.map(({ campaign, product }) => {
    const name = (campaign.title ?? `#${campaign.id}`)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const bg = product === 'CTV' ? '#eef2ff' : '#dbeafe'
    const fg = product === 'CTV' ? '#3730a3' : '#1e40af'
    return `<tr><td style="padding:6px 10px;font-size:11px;color:${fg};background:${bg};font-weight:600;border-radius:9999px;display:inline-block">${product}</td><td style="padding:6px 10px;font-size:13px;color:#111">${name}</td></tr>`
  }).join('')

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;color:#111">
  <h2 style="font-size:16px;margin:0 0 8px">${dateStr} 09:00 기준 미노출 CT/CTV 캠페인 ${entries.length}건</h2>
  <p style="font-size:12px;color:#666;margin:0 0 16px">활성 상태이며 기간 내이지만 오늘 노출(win + v_impression)이 0인 캠페인입니다. 무료 캠페인(is_free)도 포함 — 노출 여부는 과금과 무관.</p>
  <table style="border-collapse:separate;border-spacing:0 4px"><tbody>${rows}</tbody></table>
</div>`

  return { subject, text, html }
}
