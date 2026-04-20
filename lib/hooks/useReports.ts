'use client'

import { useState, useEffect, useCallback } from 'react'
import type { MediaType } from '@/lib/reportTypes'
import type { RawRow } from '@/lib/rawDataParser'
import type { Campaign } from '@/lib/campaignTypes'
import {
  needsChunking,
  splitIntoChunks,
  mergeChunks,
  totalRowCount,
  type ChunkedRowsMap,
} from '@/lib/csvChunker'

// ── 타입 정의 ────────────────────────────────────────────────────

export interface SavedReport {
  id: string
  savedAt: string
  label: string
  campaignName: string | null
  mediaTypes: MediaType[]
  /** 소규모: 행 보유 / chunked=true: 빈 객체 → expandReport()로 로드 */
  rowsByMedia: Partial<Record<MediaType, RawRow[]>>
  campaign: Campaign | null
  chunked?: boolean
  totalRows?: number
  totalChunks?: number
  /** 계정명에서 추출된 광고주 힌트 목록 (Google 제외) */
  detectedAdvertiserHints?: string[]
  /** 행(row)에서 추출된 캠페인명 목록 — 청크 리포트에서도 참조 가능 */
  detectedCampaignNames?: string[]
}

export interface SaveProgress {
  phase: 'saving' | 'done' | 'error'
  current: number
  total: number
  message: string
}

// ── 상수 ─────────────────────────────────────────────────────────

const LS_KEY      = 'ct-plus-daily-reports-v1'
const REPORT_TYPE = 'ct-plus'

// ── DB API 헬퍼 ──────────────────────────────────────────────────

async function fetchReports(): Promise<SavedReport[]> {
  try {
    const res = await fetch(`/api/v1/reports?type=${REPORT_TYPE}`, { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    return json.reports ?? []
  } catch { return [] }
}

async function fetchChunks(parentId: string): Promise<ChunkedRowsMap[]> {
  try {
    const res = await fetch(`/api/v1/reports?parentId=${parentId}`, { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (json.chunks ?? []).map((c: any) => c.rowsByMedia as ChunkedRowsMap)
  } catch { return [] }
}

async function postReport(body: object): Promise<void> {
  await fetch('/api/v1/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── localStorage 헬퍼 ─────────────────────────────────────────────

function lsRead(): SavedReport[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/** 청크 리포트는 rowsByMedia를 비워서 저장 (크기 절약) */
function lsWrite(data: SavedReport[]): void {
  try {
    const lean = data.map(r => r.chunked ? { ...r, rowsByMedia: {} } : r)
    localStorage.setItem(LS_KEY, JSON.stringify(lean))
  } catch {
    // 용량 초과 시 최근 5개 메타데이터만
    try {
      const lean = data.slice(0, 5).map(r => ({ ...r, rowsByMedia: {} }))
      localStorage.setItem(LS_KEY, JSON.stringify(lean))
    } catch {}
  }
}

// ── mergeReport 헬퍼 함수 ────────────────────────────────────────

/**
 * 들어오는 리포트의 행들을 기존 리포트의 행들과 병합한다.
 * 합성 키(date + campaignName + dmpName)로 기존 행을 찾아서:
 * - 찾으면: 수치 필드(impressions, clicks, 비용 필드들)을 덮어쓴다
 * - 찾지 못하면: 새 행으로 추가한다
 *
 * @param incoming 들어오는 CSV 데이터
 * @param existing 기존 리포트 목록
 * @returns { mergedReports, overwrittenCount } 병합된 리포트 목록과 덮어쓴 행 개수
 */
export function mergeReport(
  incoming: SavedReport,
  existing: SavedReport[],
): { mergedReports: SavedReport[]; overwrittenCount: number } {
  let overwrittenCount = 0
  const now = new Date().toISOString()

  // 들어오는 리포트의 미디어 타입 추출
  const incomingMediaTypes = incoming.mediaTypes ?? []

  // 기존 리포트 중 들어오는 리포트와 같은 미디어를 가진 리포트 찾기
  // 없으면 새로 만들 것
  const result = existing.map(existingReport => {
    // 겹치는 미디어가 없으면 그대로 반환
    const overlap = incomingMediaTypes.filter(m => existingReport.mediaTypes?.includes(m))
    if (overlap.length === 0) return existingReport

    // 겹치는 미디어별로 행 병합
    const mergedRowsByMedia = { ...existingReport.rowsByMedia }

    for (const mediaType of overlap) {
      const incomingRows = incoming.rowsByMedia[mediaType] ?? []
      const existingRows = mergedRowsByMedia[mediaType] ?? []

      // 합성 키 맵 생성: 기존 행들을 빠르게 찾기 위해
      const existingMap = new Map<string, RawRow>()
      for (const row of existingRows) {
        const key = `${row.date}__${row.campaignName}__${row.dmpName}`
        existingMap.set(key, row)
      }

      // 들어오는 행들을 순회하면서 병합
      for (const incomingRow of incomingRows) {
        const key = `${incomingRow.date}__${incomingRow.campaignName}__${incomingRow.dmpName}`
        const existing = existingMap.get(key)

        if (existing) {
          // 찾았으면: 수치 필드 덮어쓰기
          existing.impressions = incomingRow.impressions
          existing.clicks = incomingRow.clicks
          existing.grossCost = incomingRow.grossCost
          existing.netCost = incomingRow.netCost
          existing.executionAmount = incomingRow.executionAmount
          existing.netAmount = incomingRow.netAmount
          existing.supplyValue = incomingRow.supplyValue
          if (incomingRow.views !== null) {
            existing.views = incomingRow.views
          }
          overwrittenCount++
        } else {
          // 찾지 못했으면: 새 행 추가
          existingRows.push(incomingRow)
        }
      }

      mergedRowsByMedia[mediaType] = existingRows
    }

    return {
      ...existingReport,
      rowsByMedia: mergedRowsByMedia,
      savedAt: now,
    }
  })

  // 기존 리포트에 없는 미디어가 들어온 경우 새 리포트 추가
  const existingMediaTypes = new Set<MediaType>()
  for (const report of existing) {
    report.mediaTypes?.forEach(m => existingMediaTypes.add(m))
  }

  const newMediaTypes = incomingMediaTypes.filter(m => !existingMediaTypes.has(m))
  if (newMediaTypes.length > 0) {
    // 새로운 미디어만 가진 리포트 추가
    const newMediaRowsByMedia: Partial<Record<MediaType, RawRow[]>> = {}
    for (const mediaType of newMediaTypes) {
      newMediaRowsByMedia[mediaType] = incoming.rowsByMedia[mediaType] ?? []
    }

    const newReport: SavedReport = {
      ...incoming,
      id: incoming.id.startsWith('tmp-') ? `report-${Date.now()}` : incoming.id,
      mediaTypes: newMediaTypes,
      rowsByMedia: newMediaRowsByMedia,
      savedAt: now,
    }
    result.push(newReport)
  }

  return { mergedReports: result, overwrittenCount }
}

// ── 훅 ──────────────────────────────────────────────────────────

export function useReports() {
  const [reports, setReports]           = useState<SavedReport[]>([])
  const [loading, setLoading]           = useState(true)
  const [saveProgress, setSaveProgress] = useState<SaveProgress | null>(null)

  const loadAll = useCallback(async () => {
    setReports(lsRead())
    const mongoReports = await fetchReports()
    if (mongoReports.length) {
      setReports(mongoReports)
      lsWrite(mongoReports)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  /** 청크 리포트의 전체 행 데이터를 MongoDB에서 조립하여 반환 */
  const expandReport = useCallback(async (id: string): Promise<SavedReport | null> => {
    const meta = reports.find(r => r.id === id)
    if (!meta) return null
    if (!meta.chunked) return meta

    const chunkMaps = await fetchChunks(id)
    if (chunkMaps.length === 0) return meta
    return { ...meta, rowsByMedia: mergeChunks(chunkMaps) }
  }, [reports])

  /** 저장 — 5,000행 초과 시 자동 청크 분할 */
  async function saveReport(
    report: SavedReport,
    onProgress?: (p: SaveProgress) => void,
  ) {
    const notify = (p: SaveProgress) => {
      setSaveProgress(p)
      onProgress?.(p)
    }

    const isLarge  = needsChunking(report.rowsByMedia)
    const rowCount = totalRowCount(report.rowsByMedia)

    if (!isLarge) {
      notify({ phase: 'saving', current: 0, total: 1, message: 'DB에 저장 중...' })
      const next = [report, ...reports.filter(r => r.id !== report.id)]
      setReports(next)
      lsWrite(next)
      try { await postReport({ ...report, type: REPORT_TYPE }) } catch {}
      notify({ phase: 'done', current: 1, total: 1, message: '저장 완료' })
      setTimeout(() => setSaveProgress(null), 3000)
      return
    }

    // ── 대규모: 청크 분할 저장 ────────────────────────────────
    const chunks      = splitIntoChunks(report.rowsByMedia)
    const totalChunks = chunks.length

    const parentDoc: SavedReport = {
      ...report,
      chunked: true,
      totalRows: rowCount,
      totalChunks,
      rowsByMedia: {},
    }
    const next = [parentDoc, ...reports.filter(r => r.id !== report.id)]
    setReports(next)
    lsWrite(next)

    notify({ phase: 'saving', current: 0, total: totalChunks + 1, message: '메타데이터 저장 중...' })
    try { await postReport({ ...parentDoc, type: REPORT_TYPE }) } catch {}

    for (let i = 0; i < chunks.length; i++) {
      notify({
        phase: 'saving',
        current: i + 1,
        total: totalChunks + 1,
        message: `청크 저장 중 (${i + 1} / ${totalChunks})…`,
      })
      try {
        await postReport({
          id: `${report.id}_chunk_${i}`,
          isChunk: true,
          parentId: report.id,
          chunkIndex: i,
          rowsByMedia: chunks[i],
        })
      } catch {}
    }

    notify({
      phase: 'done',
      current: totalChunks + 1,
      total: totalChunks + 1,
      message: `저장 완료 — ${rowCount.toLocaleString('ko-KR')}행 (${totalChunks}청크)`,
    })
    setTimeout(() => setSaveProgress(null), 4000)
  }

  /** 삭제 — MongoDB에서 청크 cascade 삭제는 API route가 담당 */
  async function deleteReport(id: string) {
    const next = reports.filter(r => r.id !== id)
    setReports(next)
    lsWrite(next)
    try { await fetch(`/api/v1/reports?id=${id}`, { method: 'DELETE' }) } catch {}
  }

  return { reports, loading, saveProgress, saveReport, deleteReport, expandReport, refresh: loadAll, mergeReport }
}
