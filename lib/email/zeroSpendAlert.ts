import { fetchCampaigns } from '@/lib/motivApi/campaignService'
import { fetchAdGroups } from '@/lib/motivApi/adGroupService'
import type { MotivCampaign, MotivCampaignType, MotivAdGroup } from '@/lib/motivApi/types'
import { motivTypeToProduct, isExcludedCampaign, type MediaProductType } from '@/lib/motivApi/productMapping'

// 알림 대상 campaign_type (CT + CTV)
const ALERT_TYPES: MotivCampaignType[] = ['DISPLAY', 'VIDEO', 'PARTNERS', 'TV']

export interface ZeroSpendEntry {
  campaign: MotivCampaign
  product: MediaProductType
  impressions: number
  /** 캠페인 자체는 노출 > 0 이지만 개별 광고그룹이 0 인 경우 해당 그룹들 나열 */
  zeroAdGroups: MotivAdGroup[]
}

function isTodayInRange(start: string | null, end: string | null, now: Date): boolean {
  if (!start && !end) return false
  const cs = start ? new Date(start) : new Date(0)
  const ce = end   ? new Date(end)   : new Date(9e13)
  ce.setHours(23, 59, 59, 999)
  return now >= cs && now <= ce
}

function campaignImpressions(c: MotivCampaign): number {
  const win  = Number(c.stats?.win ?? 0)
  const vImp = Number(c.stats?.v_impression ?? 0)
  return (Number.isFinite(win) ? win : 0) + (Number.isFinite(vImp) ? vImp : 0)
}

function adGroupImpressions(g: MotivAdGroup): number {
  const win  = Number(g.stats?.win ?? 0)
  const vImp = Number(g.stats?.v_impression ?? 0)
  return (Number.isFinite(win) ? win : 0) + (Number.isFinite(vImp) ? vImp : 0)
}

/**
 * CT/CTV 활성 캠페인 중 **노출 0** 항목을 조회 (campaign + ad-group 레벨 드릴다운).
 *
 * 두 가지 케이스를 모두 감지:
 *   A) 캠페인 전체 노출 0
 *   B) 캠페인은 노출 > 0 이지만, 활성·기간 내 광고그룹 중 노출 0 인 것이 있음
 *
 * 광고그룹 API 장애/미존재 시: campaign 레벨만 보고 (graceful degrade).
 */
export async function collectZeroSpendCampaigns(now: Date = new Date()): Promise<ZeroSpendEntry[]> {
  // 1) 활성 campaigns 조회 (type 별 4회 병렬)
  const campResults = await Promise.all(ALERT_TYPES.map(t =>
    fetchCampaigns({
      campaign_type: t,
      status: 'Y',
      per_page: 200,
      page: 1,
      sort: '-created_at',
    })
  ))

  const eligibleCampaigns: { campaign: MotivCampaign; product: MediaProductType }[] = []
  for (const r of campResults) {
    for (const c of r.data) {
      if (isExcludedCampaign(c.title)) continue
      if (c.status !== 'Y') continue
      if (!isTodayInRange(c.start_date, c.end_date, now)) continue
      const product = motivTypeToProduct(c.campaign_type)
      if (product !== 'CT' && product !== 'CTV') continue
      eligibleCampaigns.push({ campaign: c, product })
    }
  }

  // 2) 활성 ad-groups 조회 (1회, status=Y). 실패해도 campaign-level 로 fallback.
  let adGroups: MotivAdGroup[] = []
  try {
    const agRes = await fetchAdGroups({
      status: 'Y',
      per_page: 200,
      page: 1,
      sort: '-created_at',
    })
    adGroups = agRes.data
  } catch (e) {
    // 404/401/네트워크 실패 시 광고그룹 드릴다운 스킵
    console.warn('[zeroSpendAlert] adgroups fetch failed, falling back to campaign-level:', (e as Error).message)
    adGroups = []
  }

  // 3) campaign_id → zero-impression ad-groups 매핑
  const zeroByCampId = new Map<number, MotivAdGroup[]>()
  for (const g of adGroups) {
    if (g.status !== 'Y') continue
    if (!isTodayInRange(g.start_date, g.end_date, now)) continue
    if (adGroupImpressions(g) > 0) continue
    const arr = zeroByCampId.get(g.campaign_id) ?? []
    arr.push(g)
    zeroByCampId.set(g.campaign_id, arr)
  }

  // 4) 병합: 캠페인 레벨 0 이거나 그룹 레벨 0 이 하나라도 있으면 entry 생성
  const out: ZeroSpendEntry[] = []
  for (const { campaign, product } of eligibleCampaigns) {
    const impressions = campaignImpressions(campaign)
    const zeroGroups = zeroByCampId.get(campaign.id) ?? []
    if (impressions > 0 && zeroGroups.length === 0) continue
    out.push({ campaign, product, impressions, zeroAdGroups: zeroGroups })
  }
  return out
}

/**
 * 이메일 제목 · 본문 포매팅 (campaign → adgroup 계층).
 */
export function formatZeroSpendEmail(entries: ZeroSpendEntry[], now: Date): {
  subject: string
  text: string
  html: string
} {
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const totalGroups = entries.reduce((s, e) => s + e.zeroAdGroups.length, 0)
  const campaignOnlyCount = entries.filter(e => e.impressions === 0).length
  const subject = `[${dateStr} 09:00] 미노출 CT/CTV ${entries.length}건 (광고그룹 ${totalGroups}개)`

  if (entries.length === 0) {
    const text = `${dateStr} 오전 9시 기준 — 미노출(노출 0) 활성 CT/CTV 캠페인·광고그룹이 없습니다.`
    const html = `<p>${text}</p>`
    return { subject, text, html }
  }

  // 정렬: CTV 먼저, 그 안에서 가나다순
  const sorted = [...entries].sort((a, b) => {
    if (a.product !== b.product) return a.product === 'CTV' ? -1 : 1
    return (a.campaign.title ?? '').localeCompare(b.campaign.title ?? '')
  })

  // ── 평문 ──
  const textLines: string[] = [
    `${dateStr} 오전 9시 기준 미노출 CT/CTV`,
    `캠페인 ${entries.length}건 (전체 노출 0: ${campaignOnlyCount}건) / 광고그룹 ${totalGroups}개`,
    '',
  ]
  for (const { campaign, product, impressions, zeroAdGroups } of sorted) {
    const name = campaign.title ?? `#${campaign.id}`
    if (impressions === 0) {
      textLines.push(`[${product}] ${name}  ← 캠페인 전체 노출 0`)
    } else {
      textLines.push(`[${product}] ${name}`)
    }
    for (const g of zeroAdGroups) {
      textLines.push(`    └ 광고그룹: ${g.title ?? `#${g.id}`}`)
    }
  }
  const text = textLines.join('\n')

  // ── HTML ──
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const blocks = sorted.map(({ campaign, product, impressions, zeroAdGroups }) => {
    const pillBg = product === 'CTV' ? '#eef2ff' : '#dbeafe'
    const pillFg = product === 'CTV' ? '#3730a3' : '#1e40af'
    const campAllDark = impressions === 0
    const nameHtml = `<span style="font-weight:600;color:#111">${esc(campaign.title ?? `#${campaign.id}`)}</span>`
    const statusHtml = campAllDark
      ? `<span style="margin-left:6px;padding:1px 6px;font-size:10px;font-weight:700;color:#991b1b;background:#fee2e2;border-radius:9999px">캠페인 전체 노출 0</span>`
      : ''
    const freeHtml = campaign.is_free
      ? `<span style="margin-left:4px;padding:1px 6px;font-size:10px;color:#065f46;background:#d1fae5;border-radius:9999px;font-weight:600">무료</span>`
      : ''
    const groupList = zeroAdGroups.length === 0 ? '' : `
      <ul style="margin:4px 0 0 0;padding:0 0 0 18px;color:#555;font-size:12px">
        ${zeroAdGroups.map(g => `<li>광고그룹: ${esc(g.title ?? `#${g.id}`)}</li>`).join('')}
      </ul>`
    return `<div style="margin-bottom:10px">
      <span style="display:inline-block;padding:2px 8px;font-size:11px;color:${pillFg};background:${pillBg};font-weight:700;border-radius:9999px">${product}</span>
      ${nameHtml}${freeHtml}${statusHtml}
      ${groupList}
    </div>`
  }).join('')

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.5">
  <h2 style="font-size:16px;margin:0 0 6px">${dateStr} 09:00 기준 미노출 CT/CTV</h2>
  <p style="font-size:12px;color:#666;margin:0 0 14px">
    캠페인 ${entries.length}건 · 전체 노출 0 ${campaignOnlyCount}건 · 광고그룹 ${totalGroups}개<br/>
    판정: 활성(status=Y) + 기간 내 + <code>win + v_impression = 0</code>. 무료 캠페인(is_free) 도 포함.
  </p>
  ${blocks}
</div>`

  return { subject, text, html }
}
