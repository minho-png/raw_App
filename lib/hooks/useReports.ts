'use client'

import { useState, useEffect, useCallback } from 'react'
import type { MediaType } from '@/lib/reportTypes'
import type { RawRow } from '@/lib/rawDataParser'
import type { Campaign } from '@/lib/campaignTypes'

export interface SavedReport {
  id: string
  savedAt: string
  label: string
  campaignName: string | null
  mediaTypes: MediaType[]
  rowsByMedia: Partial<Record<MediaType, RawRow[]>>
  campaign: Campaign | null
}

const LS_KEY = 'ct-plus-daily-reports-v1'
const REPORT_TYPE = 'ct-plus'

async function fetchReports(): Promise<SavedReport[]> {
  try {
    const res = await fetch(`/api/v1/reports?type=${REPORT_TYPE}`, { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    return json.reports ?? []
  } catch { return [] }
}

function lsRead(): SavedReport[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function lsWrite(data: SavedReport[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

export function useReports() {
  const [reports, setReports] = useState<SavedReport[]>([])
  const [loading, setLoading]  = useState(true)

  const loadAll = useCallback(async () => {
    // Instant from localStorage
    setReports(lsRead())
    // Sync from MongoDB
    const mongoReports = await fetchReports()
    if (mongoReports.length) {
      setReports(mongoReports)
      lsWrite(mongoReports)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function saveReport(report: SavedReport) {
    const next = [report, ...reports.filter(r => r.id !== report.id)]
    setReports(next)
    lsWrite(next)
    try {
      await fetch('/api/v1/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...report, type: REPORT_TYPE }),
      })
    } catch {}
  }

  async function deleteReport(id: string) {
    const next = reports.filter(r => r.id !== id)
    setReports(next)
    lsWrite(next)
    try {
      await fetch(`/api/v1/reports?id=${id}`, { method: 'DELETE' })
    } catch {}
  }

  return { reports, loading, saveReport, deleteReport, refresh: loadAll }
}
