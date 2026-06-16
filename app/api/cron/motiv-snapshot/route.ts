import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { fetchAllCampaignInsights } from '@/lib/openApi/insightsService'
import { campaignInsightToMotivCampaign } from '@/lib/openApi/legacyAdapter'
import type { MotivCampaignType } from '@/lib/motivApi/types'

/**
 * 매일 0시 (Vercel cron) — 전 캠페인의 누적 stats 를 캡처해 저장.
 *
 * 데이터 출처: Open API CAMPAIGN insights (사용자 결정 2026-06-15 — Motiv → Open API
 * 일원화). lifetime 누적에 근사하기 위해 dateFrom 을 2년 전으로 widen.
 *
 * 분석 페이지의 전일 비교용 — (today 누적 - yesterday 누적) = 오늘 발생량.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLLECTION = 'motiv_daily_snapshots'
const TYPES: MotivCampaignType[] = ['DISPLAY', 'VIDEO', 'TV', 'PARTNERS']

function checkAuth(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.CRON_SECRET
  if (!secret) return { ok: false, reason: 'server_missing_secret' }
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return { ok: false, reason: 'no_bearer' }
  const token = auth.slice(7).trim()
  if (token !== secret) return { ok: false, reason: 'token_mismatch' }
  return { ok: true }
}

function yesterdayStr(now: Date): string {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateFromTwoYearsAgo(now: Date): string {
  const d = new Date(now)
  d.setFullYear(d.getFullYear() - 2)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req)
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'unauthorized', reason: auth.reason }, { status: 401 })
  }

  const now = new Date()
  const date = yesterdayStr(now)
  const dateFrom = dateFromTwoYearsAgo(now)

  try {
    // PARTNERS 는 Open API Phase 1 미지원 (가이드 §4) — 불필요한 422 호출 회피.
    const supported = TYPES.filter(t => t !== 'PARTNERS')
    const results = await Promise.allSettled(
      supported.map(t =>
        fetchAllCampaignInsights({
          dateFrom,
          dateTo: date,
          campaignType: t,
          limit: 200,
        }),
      ),
    )

    const campaigns: Array<{
      motivId: number
      campaign_type: string
      adaccount_id: number
      total_budget: number | null
      stats: unknown
    }> = []
    const errors: Array<{ type: MotivCampaignType; error: string }> = []

    results.forEach((r, i) => {
      const t = supported[i]
      if (r.status === 'rejected') {
        errors.push({ type: t, error: r.reason instanceof Error ? r.reason.message : String(r.reason) })
        return
      }
      for (const row of r.value.data ?? []) {
        const c = campaignInsightToMotivCampaign(row)
        campaigns.push({
          motivId: c.id,
          campaign_type: c.campaign_type,
          adaccount_id: c.adaccount_id,
          total_budget: c.total_budget,
          stats: c.stats,
        })
      }
    })

    const client = await clientPromise
    const col = client.db('kim_dashboard').collection(COLLECTION)
    await col.updateOne(
      { date },
      {
        $set: { date, capturedAt: now, campaigns, partialErrors: errors.length > 0 ? errors : undefined },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    )

    return NextResponse.json({
      ok: true,
      date,
      count: campaigns.length,
      partialErrors: errors,
      ranAt: now.toISOString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron/motiv-snapshot] error:', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
