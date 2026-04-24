import { fetchCampaigns } from '@/lib/motivApi/campaignService'
import type { MotivCampaign, MotivCampaignType } from '@/lib/motivApi/types'
import { motivTypeToProduct, type MediaProductType } from '@/lib/motivApi/productMapping'

// 알림 대상 campaign_type (CT + CTV)
const ALERT_TYPES: MotivCampaignType[] = ['DISPLAY', 'VIDEO', 'PARTNERS', 'TV']

export interface ZeroSpendEntry {
  campaign: MotivCampaign
  product: MediaProductType  // 'CT' | 'CTV' (CT_PLUS 는 Motiv 에 없음)
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

/**
 * CT/CTV 활성 캠페인 중 오늘(기준일) 집행 0원인 항목을 조회.
 * 조건: status=Y + 기간 내 + daily_spent === 0.
 *
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
      if (c.status !== 'Y') continue
      if (!isTodayInRange(c, now)) continue
      const dailySpent = Number(c.daily_spent ?? 0)
      if (dailySpent !== 0) continue
      const product = motivTypeToProduct(c.campaign_type)
      if (product !== 'CT' && product !== 'CTV') continue
      out.push({ campaign: c, product })
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
  const subject = `[${dateStr} 09:00] 집행 0원 캠페인 ${entries.length}건`

  if (entries.length === 0) {
    const text = `${dateStr} 오전 9시 기준 — 집행 0원인 활성 CT/CTV 캠페인이 없습니다.`
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
    `${dateStr} 오전 9시 기준 집행 0원 캠페인 ${entries.length}건`,
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
  <h2 style="font-size:16px;margin:0 0 8px">${dateStr} 09:00 기준 집행 0원 캠페인 ${entries.length}건</h2>
  <p style="font-size:12px;color:#666;margin:0 0 16px">활성 상태이며 기간 내이지만 오늘 집행액(daily_spent)이 0원인 CT · CTV 캠페인입니다.</p>
  <table style="border-collapse:separate;border-spacing:0 4px"><tbody>${rows}</tbody></table>
</div>`

  return { subject, text, html }
}
