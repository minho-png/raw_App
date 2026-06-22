import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth/session'

/**
 * 월별 매체 매입 비용 (monthly_media_costs).
 *
 * 사용자 요청 (2026-06-22): 이미지 패턴 — 매체사별 월(1~12)별 매입 비용 그리드.
 * 행: 매체사(APM/삼성TV플러스/매드코퍼레이션/엑셀비드 등), 열: 1~12월, 셀: ₩ 입력.
 * 카테고리(CTV/CT/CT+) 별 그룹 표시. 엑셀비드처럼 USD 결제 매체는 환율($)도 저장.
 *
 * 데이터 모델:
 *   { workspace_id, year, mediaName, category?('CTV'|'CT'|'CT+'),
 *     amounts: { '1': number, ..., '12': number },   // KRW 매입금액
 *     currency?: 'KRW'|'USD',                        // 기본 KRW
 *     fxRates?:  { '1': number, ..., '12': number }, // USD 매체 환율(예: 엑셀비드)
 *     order?: number,                                // 행 표시 순서
 *     memo?: string,
 *     createdAt, updatedAt }
 *
 * unique index: workspace_id + year + mediaName
 */

const COLLECTION = 'monthly_media_costs'
const AUDIT_COLLECTION = 'settlement_audit_logs'
const WORKSPACE = 'system'

export type MediaCostCategory = 'CTV' | 'CT' | 'CT+'

export interface MonthlyMediaCostDoc {
  year: number
  mediaName: string
  category?: MediaCostCategory
  amounts: Record<string, number>     // {"1":0,"2":0,...,"12":0}
  currency?: 'KRW' | 'USD'
  fxRates?: Record<string, number>
  order?: number
  memo?: string
  updatedAt?: string
}

function emptyAmounts(): Record<string, number> {
  const o: Record<string, number> = {}
  for (let m = 1; m <= 12; m++) o[String(m)] = 0
  return o
}

async function getCollection() {
  const client = await clientPromise
  const col = client.db('kim_dashboard').collection(COLLECTION)
  await col.createIndex(
    { workspace_id: 1, year: 1, mediaName: 1 },
    { unique: true, background: true },
  ).catch(() => null)
  return col
}

async function currentUser(req: NextRequest): Promise<string> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return 'system'
  const payload = await verifySessionToken(token)
  return payload?.username ?? 'system'
}

async function audit(entry: { rowKey: string; action: string; before?: unknown; after?: unknown; userId: string }) {
  try {
    const client = await clientPromise
    const col = client.db('kim_dashboard').collection(AUDIT_COLLECTION)
    await col.insertOne({ workspace_id: WORKSPACE, ...entry, timestamp: new Date() })
  } catch {
    console.error('[monthly-media-costs] audit insert failed')
  }
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: { code: 'BAD_REQUEST', message } }, { status })
}

function sanitizeAmounts(input: unknown): Record<string, number> {
  const out = emptyAmounts()
  if (!input || typeof input !== 'object') return out
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const m = Number(k)
    if (!Number.isInteger(m) || m < 1 || m > 12) continue
    const n = Number(v)
    if (Number.isFinite(n)) out[String(m)] = n
  }
  return out
}

function sanitizeFxRates(input: unknown): Record<string, number> | undefined {
  if (!input || typeof input !== 'object') return undefined
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const m = Number(k)
    if (!Number.isInteger(m) || m < 1 || m > 12) continue
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) out[String(m)] = n
  }
  return Object.keys(out).length > 0 ? out : undefined
}

// GET /api/v1/monthly-media-costs?year=2026
export async function GET(req: NextRequest) {
  try {
    const year = Number(req.nextUrl.searchParams.get('year'))
    if (!Number.isInteger(year) || year < 2000 || year > 3000) return bad('year(2000~3000) required')
    const col = await getCollection()
    const docs = await col.find({ workspace_id: WORKSPACE, year }).sort({ order: 1, mediaName: 1 }).toArray()
    const data: MonthlyMediaCostDoc[] = docs.map(d => ({
      year: d.year,
      mediaName: d.mediaName,
      category: d.category,
      amounts: sanitizeAmounts(d.amounts),
      currency: d.currency ?? 'KRW',
      fxRates: d.fxRates,
      order: d.order,
      memo: d.memo,
      updatedAt: d.updated_at?.toISOString?.() ?? d.updatedAt,
    }))
    return NextResponse.json({ data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}

// PUT /api/v1/monthly-media-costs   body: MonthlyMediaCostDoc
//   upsert by (year, mediaName).
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as MonthlyMediaCostDoc
    if (!Number.isInteger(body.year) || body.year < 2000 || body.year > 3000) return bad('year invalid')
    if (!body.mediaName || typeof body.mediaName !== 'string' || body.mediaName.length > 100) {
      return bad('mediaName 필수(≤100자)')
    }
    if (body.category && !['CTV', 'CT', 'CT+'].includes(body.category)) return bad('category 는 CTV/CT/CT+ 중 하나')
    if (body.currency && !['KRW', 'USD'].includes(body.currency)) return bad('currency 는 KRW/USD')

    const user = await currentUser(req)
    const col = await getCollection()
    const now = new Date()
    const existing = await col.findOne({ workspace_id: WORKSPACE, year: body.year, mediaName: body.mediaName })

    const setDoc: Record<string, unknown> = {
      year: body.year,
      mediaName: body.mediaName,
      amounts: sanitizeAmounts(body.amounts),
      currency: body.currency ?? 'KRW',
      updated_at: now,
    }
    if (body.category) setDoc.category = body.category
    if (body.order !== undefined) setDoc.order = Number(body.order) || 0
    if (body.memo !== undefined) setDoc.memo = String(body.memo).slice(0, 500)
    const fxRates = sanitizeFxRates(body.fxRates)
    if (fxRates) setDoc.fxRates = fxRates

    await col.updateOne(
      { workspace_id: WORKSPACE, year: body.year, mediaName: body.mediaName },
      { $set: setDoc, $setOnInsert: { created_at: now } },
      { upsert: true },
    )
    await audit({
      rowKey: `media-cost:${body.year}:${body.mediaName}`,
      action: existing ? 'update' : 'create',
      before: existing?.amounts,
      after: setDoc.amounts,
      userId: user,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}

// DELETE /api/v1/monthly-media-costs?year=2026&mediaName=APM
export async function DELETE(req: NextRequest) {
  try {
    const year = Number(req.nextUrl.searchParams.get('year'))
    const mediaName = req.nextUrl.searchParams.get('mediaName')
    if (!Number.isInteger(year) || !mediaName) return bad('year, mediaName required')
    const user = await currentUser(req)
    const col = await getCollection()
    const existing = await col.findOne({ workspace_id: WORKSPACE, year, mediaName })
    await col.deleteOne({ workspace_id: WORKSPACE, year, mediaName })
    await audit({
      rowKey: `media-cost:${year}:${mediaName}`,
      action: 'delete',
      before: existing?.amounts,
      userId: user,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: { code: 'INTERNAL', message: msg } }, { status: 500 })
  }
}
