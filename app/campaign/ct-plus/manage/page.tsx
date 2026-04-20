"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { useCtGroups } from "@/lib/hooks/useCtGroups"
import { useReports } from "@/lib/hooks/useReports"
import { useMasterData } from "@/lib/hooks/useMasterData"
import type { CtPlusGroup, CtGroupMediaMarkup } from "@/lib/ctGroupTypes"
import type { SavedReport } from "@/lib/hooks/useReports"
import type { Campaign } from "@/lib/campaignTypes"
import { MEDIA_CONFIG } from "@/lib/reportTypes"
import type { MediaType } from "@/lib/reportTypes"

const MEDIA_TYPES: MediaType[] = ['google', 'naver', 'kakao', 'meta']

export type ManageTab = 'groups' | 'upload'

function fmt(n: number) { return n.toLocaleString('ko-KR') }

export default function CtPlusManagePage() {
  const { groups, loading, addGroup, updateGroup, deleteGroup, newGroup } = useCtGroups()
  const { reports, deleteReport } = useReports()
  const { campaigns, saveCampaigns } = useMasterData()

  // ── 탭 상태 ────────────────────────────────────────────────
  const [manageTab, setManageTab] = useState<ManageTab>('groups')

  // ── 선택/편집 상태 ──────────────────────────────────────────
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<CtPlusGroup | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedToast, setSavedToast] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // ── 저장 데이터 관리 상태 ────────────────────────────────────
  const [deleteReportConfirm, setDeleteReportConfirm] = useState<string | null>(null)
  const [deleteMonthConfirm, setDeleteMonthConfirm] = useState<string | null>(null)

  // ── DB 저장 리포트에서 고유 캠페인명 추출 ───────────────────
  const allCsvNames = useMemo<string[]>(() => {
    const set = new Set<string>()
    for (const r of reports) {
      for (const rows of Object.values(r.rowsByMedia)) {
        rows?.forEach(row => { if (row.campaignName) set.add(row.campaignName) })
      }
    }
    return Array.from(set).sort()
  }, [reports])

  // ── 이미 어느 그룹에 연결된 csvName 집합 ───────────────────
  const assignedCsvNames = useMemo<Set<string>>(() => {
    const s = new Set<string>()
    for (const g of groups) g.csvNames.forEach(n => s.add(n))
    return s
  }, [groups])

  const unassignedCsvNames = useMemo(
    () => allCsvNames.filter(n => !assignedCsvNames.has(n)),
    [allCsvNames, assignedCsvNames]
  )

  // ── 그룹 선택 ───────────────────────────────────────────────
  function selectGroup(g: CtPlusGroup) {
    setSelectedGroupId(g.id)
    setEditDraft(JSON.parse(JSON.stringify(g)))
    setIsDirty(false)
  }

  function openNewGroup(initialCsvName?: string) {
    const g = newGroup()
    if (initialCsvName) g.csvNames = [initialCsvName]
    setSelectedGroupId(g.id)
    setEditDraft(g)
    setIsDirty(true)
  }

  // ── 편집 헬퍼 ───────────────────────────────────────────────
  function patchDraft(patch: Partial<CtPlusGroup>) {
    setEditDraft(prev => prev ? { ...prev, ...patch } : prev)
    setIsDirty(true)
  }

  function addCsvName(name: string) {
    if (!editDraft || editDraft.csvNames.includes(name)) return
    patchDraft({ csvNames: [...editDraft.csvNames, name] })
  }

  function removeCsvName(name: string) {
    if (!editDraft) return
    patchDraft({ csvNames: editDraft.csvNames.filter(n => n !== name) })
  }

  function patchMarkup(mt: MediaType, field: keyof CtGroupMediaMarkup, value: number) {
    if (!editDraft) return
    const prev = editDraft.mediaMarkups[mt] ?? { dmpRate: 0, nonDmpRate: 0, budget: 0 }
    setEditDraft(d => d ? {
      ...d,
      mediaMarkups: { ...d.mediaMarkups, [mt]: { ...prev, [field]: value } }
    } : d)
    setIsDirty(true)
  }

  function toggleMediaMarkup(mt: MediaType, enabled: boolean) {
    if (!editDraft) return
    const next = { ...editDraft.mediaMarkups }
    if (enabled) {
      next[mt] = next[mt] ?? { dmpRate: 0, nonDmpRate: 0, budget: 0 }
    } else {
      delete next[mt]
    }
    setEditDraft(d => d ? { ...d, mediaMarkups: next } : d)
    setIsDirty(true)
  }

  // ── 저장 ────────────────────────────────────────────────────
  async function handleSave() {
    if (!editDraft || !editDraft.name.trim()) return
    setSaving(true)
    const isNew = !groups.some(g => g.id === editDraft.id)
    if (isNew) await addGroup(editDraft)
    else await updateGroup(editDraft)
    setSaving(false)
    setIsDirty(false)
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 3000)
  }

  // ── 삭제 ────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    await deleteGroup(id)
    setDeleteConfirm(null)
    if (selectedGroupId === id) {
      setSelectedGroupId(null)
      setEditDraft(null)
    }
  }

  // editDraft와 groups 동기화 (외부 저장 후)
  useEffect(() => {
    if (!selectedGroupId) return
    const g = groups.find(x => x.id === selectedGroupId)
    if (g && !isDirty) setEditDraft(JSON.parse(JSON.stringify(g)))
  }, [groups, selectedGroupId, isDirty])

  // ── 보고서들을 연월(YYYY-MM)별로 그룹화 ─────────────────────
  const groupedReports = useMemo(() => {
    const map: Record<string, SavedReport[]> = {}
    for (const r of reports) {
      // 모든 행에서 날짜 추출
      const dates: string[] = []
      for (const rows of Object.values(r.rowsByMedia)) {
        dates.push(...(rows ?? []).map(row => row.date))
      }
      // 가장 빠른 날짜의 연월 추출 또는 저장일 사용
      const ym = dates.length > 0
        ? dates.sort()[0].slice(0, 7)  // YYYY-MM
        : r.savedAt.slice(0, 7)
      ;(map[ym] ??= []).push(r)
    }
    // 최신순 정렬
    return Object.fromEntries(
      Object.entries(map).sort(([a], [b]) => b.localeCompare(a))
    )
  }, [reports])

  async function handleDeleteReport(id: string) {
    setDeleteReportConfirm(null)
    await deleteReport(id)
  }

  async function handleDeleteMonth(ym: string, reportsInMonth: SavedReport[]) {
    setDeleteMonthConfirm(null)
    for (const r of reportsInMonth) {
      await deleteReport(r.id)
    }
  }

  // ── 캠페인 연결 저장 ────────────────────────────────────────
  async function handleConnectSave() {
    if (!selectedConnectCampaignId || selectedCampaigns.size === 0) return

    const targetCampaign = campaigns.find(c => c.id === selectedConnectCampaignId)
    if (!targetCampaign) return

    const selectedNames = Array.from(selectedCampaigns)
    const existingNames = targetCampaign.csvNames ?? []

    // 중복 제거하면서 병합
    const merged = Array.from(new Set([...existingNames, ...selectedNames]))

    // 업데이트된 campaigns 배열 생성
    const updated = campaigns.map(c =>
      c.id === selectedConnectCampaignId
        ? { ...c, csvNames: merged }
        : c
    )

    await saveCampaigns(updated)
    setConnectSaved(true)
    setTimeout(() => setConnectSaved(false), 3000)
    setSelectedCampaigns(new Set())
    setSelectedConnectCampaignId('')
  }

  // ── 데이터 업로드 탭 상태 ────────────────────────────────────
  const [uploadFilterStart, setUploadFilterStart] = useState('')
  const [uploadFilterEnd, setUploadFilterEnd] = useState('')
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set())
  const [selectedMedias, setSelectedMedias] = useState<Set<string>>(new Set())
  const [selectedConnectCampaignId, setSelectedConnectCampaignId] = useState<string>('')
  const [connectSaved, setConnectSaved] = useState(false)

  // ── 날짜 필터링된 리포트 (데이터 업로드 탭용) ────────────────
  const filteredUploadReports = useMemo(() => {
    if (!uploadFilterStart && !uploadFilterEnd) return reports
    return reports.filter(r => {
      let minDate: string | null = null
      let maxDate: string | null = null
      if (r.chunked) {
        // label에서 날짜 파싱
        const match = r.label.match(/(\d{4}[-./]\d{2}[-./]\d{2})\s*[~–]\s*(\d{4}[-./]\d{2}[-./]\d{2})/)
        if (match) { minDate = match[1].replace(/[./]/g, '-'); maxDate = match[2].replace(/[./]/g, '-') }
        else {
          const single = r.label.match(/(\d{4}[-./]\d{2}[-./]\d{2})/)
          if (single) { minDate = single[1].replace(/[./]/g, '-'); maxDate = minDate }
        }
        if (!minDate) return true // 날짜 파싱 불가 → 항상 포함
      } else {
        const dates = r.mediaTypes.flatMap(m => (r.rowsByMedia[m] ?? []).map(row => row.date)).sort()
        if (!dates.length) return true
        minDate = dates[0]; maxDate = dates[dates.length - 1]
      }
      if (uploadFilterEnd && minDate > uploadFilterEnd) return false
      if (uploadFilterStart && maxDate! < uploadFilterStart) return false
      return true
    })
  }, [reports, uploadFilterStart, uploadFilterEnd])

  // ── 캠페인명 테이블 데이터 ────────────────────────────────────
  const campaignTableRows = useMemo(() => {
    type Entry = { mediaTypes: Set<MediaType>; dateMin: string; dateMax: string; rowCount: number }
    const map = new Map<string, Entry>()
    for (const r of filteredUploadReports) {
      for (const mt of r.mediaTypes as MediaType[]) {
        const rows = r.rowsByMedia[mt]
        if (!rows) continue
        for (const row of rows) {
          if (!row.campaignName) continue
          const e = map.get(row.campaignName) ?? { mediaTypes: new Set(), dateMin: row.date, dateMax: row.date, rowCount: 0 }
          e.mediaTypes.add(mt)
          if (row.date < e.dateMin) e.dateMin = row.date
          if (row.date > e.dateMax) e.dateMax = row.date
          e.rowCount++
          map.set(row.campaignName, e)
        }
      }
    }
    // chunked 리포트의 campaignName 메타도 추가
    for (const r of filteredUploadReports) {
      if (!r.chunked || !r.campaignName) continue
      if (!map.has(r.campaignName)) {
        map.set(r.campaignName, { mediaTypes: new Set(r.mediaTypes as MediaType[]), dateMin: '', dateMax: '', rowCount: r.totalRows ?? 0 })
      }
    }
    return Array.from(map.entries())
      .map(([name, e]) => ({ name, mediaTypes: Array.from(e.mediaTypes), dateMin: e.dateMin, dateMax: e.dateMax, rowCount: e.rowCount }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [filteredUploadReports])

  // ── 매체명 테이블 데이터 ──────────────────────────────────────
  const mediaTableRows = useMemo(() => {
    type MEntry = { reportCount: number; rowCount: number }
    const map = new Map<MediaType, MEntry>()
    for (const r of filteredUploadReports) {
      for (const mt of r.mediaTypes as MediaType[]) {
        const e = map.get(mt) ?? { reportCount: 0, rowCount: 0 }
        e.reportCount++
        e.rowCount += r.rowsByMedia[mt]?.length ?? 0
        map.set(mt, e)
      }
    }
    return Array.from(map.entries()).map(([mt, e]) => ({ mt, ...e }))
  }, [filteredUploadReports])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">CT+ 관리</h1>
            <p className="text-xs text-gray-400 mt-0.5">캠페인 리포트 · CT+ · 관리</p>
          </div>
          {manageTab === 'groups' && (
            <button
              onClick={() => openNewGroup()}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              새 그룹
            </button>
          )}
        </div>
      </header>

      {/* 탭 바 */}
      <div className="flex gap-0 border-b border-gray-200 bg-white px-6">
        {[
          { id: 'groups' as ManageTab, label: '그룹 관리' },
          { id: 'upload'   as ManageTab, label: '데이터 업로드' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setManageTab(tab.id)}
            className={`border-b-2 px-5 py-3 text-xs font-medium transition-colors ${
              manageTab === tab.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{tab.label}</button>
        ))}
      </div>

      {manageTab === 'groups' ? (
      <div className="flex flex-1 min-h-0">
        {/* ── 좌측 패널 ─────────────────────────────────────── */}
        <aside className="w-72 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">

          {/* 그룹 목록 */}
          <div className="px-3 pt-4">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              CT+ 그룹 ({groups.length})
            </p>
            {loading ? (
              <p className="px-2 py-4 text-xs text-gray-400">로딩 중...</p>
            ) : groups.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center">
                <p className="text-xs text-gray-400">그룹이 없습니다</p>
                <p className="mt-0.5 text-[11px] text-gray-500">아래 미연결 캠페인에서 바로 생성하세요</p>
              </div>
            ) : (
              <div className="space-y-1 pb-2">
                {groups.map(g => {
                  const mediaCount = Object.keys(g.mediaMarkups).length
                  const isSelected = selectedGroupId === g.id
                  return (
                    <div key={g.id} className="relative group">
                      <button
                        onClick={() => selectGroup(g)}
                        className={`w-full rounded-lg px-3 py-3 text-left transition-colors ${
                          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>
                          {g.name || '(이름 없음)'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          CSV {g.csvNames.length}개
                          {mediaCount > 0 && ` · 매체 ${mediaCount}개`}
                          {g.startDate && ` · ${g.startDate.slice(2)}`}
                          {g.endDate && `~${g.endDate.slice(2)}`}
                        </p>
                        {g.csvNames.length > 0 && (
                          <p className="mt-1 text-[10px] text-gray-500 truncate">
                            {g.csvNames.join(', ')}
                          </p>
                        )}
                      </button>
                      {/* 삭제 버튼 */}
                      <button
                        onClick={() => setDeleteConfirm(g.id)}
                        className="absolute right-2 top-2 hidden rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-500 group-hover:block"
                        title="삭제"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 미연결 캠페인명 */}
          {unassignedCsvNames.length > 0 && (
            <div className="border-t border-gray-100 px-3 pt-4 pb-4">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                미연결 캠페인 ({unassignedCsvNames.length})
              </p>
              <div className="space-y-0.5">
                {unassignedCsvNames.map(name => (
                  <div key={name} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-amber-50 group">
                    <span className="text-[11px] text-gray-600 truncate flex-1" title={name}>{name}</span>
                    <button
                      onClick={() => openNewGroup(name)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-200 hover:bg-amber-100 whitespace-nowrap"
                    >
                      + 새 그룹
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {allCsvNames.length === 0 && (
            <div className="border-t border-gray-100 px-4 py-6 text-center">
              <p className="text-xs text-gray-400">저장된 데이터가 없습니다</p>
              <Link href="/campaign/ct-plus/daily" className="mt-2 inline-block text-[11px] text-blue-600 hover:underline">
                데이터 업로드 →
              </Link>
            </div>
          )}
        </aside>

        {/* ── 우측 편집 패널 ────────────────────────────────── */}
        <main className="flex-1 p-6 overflow-y-auto">
          {!editDraft ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white text-center">
              <p className="text-sm text-gray-400">왼쪽에서 그룹을 선택하거나 새 그룹을 만드세요</p>
              <button
                onClick={() => openNewGroup()}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                + 새 그룹 만들기
              </button>
            </div>
          ) : (
            <div className="space-y-5 max-w-2xl">
              {/* 저장 헤더 */}
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">
                  {groups.some(g => g.id === editDraft.id) ? '그룹 편집' : '새 그룹'}
                </h2>
                <div className="flex items-center gap-2">
                  {savedToast && <span className="text-xs font-medium text-green-600">저장 완료 ✓</span>}
                  {isDirty && (
                    <button
                      onClick={() => {
                        const orig = groups.find(g => g.id === editDraft.id)
                        if (orig) { setEditDraft(JSON.parse(JSON.stringify(orig))); setIsDirty(false) }
                        else { setEditDraft(null); setSelectedGroupId(null) }
                      }}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                    >
                      취소
                    </button>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving || !editDraft.name.trim()}
                    className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>

              {/* 기본 정보 */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3">
                  <p className="text-xs font-semibold text-gray-600">기본 정보</p>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">그룹명 *</label>
                    <input
                      type="text"
                      value={editDraft.name}
                      onChange={e => patchDraft({ name: e.target.value })}
                      placeholder="예: 삼성 브랜드 캠페인 2025"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">시작일</label>
                      <input
                        type="date"
                        value={editDraft.startDate}
                        onChange={e => patchDraft({ startDate: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">종료일</label>
                      <input
                        type="date"
                        value={editDraft.endDate}
                        onChange={e => patchDraft({ endDate: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">메모</label>
                    <textarea
                      value={editDraft.note ?? ''}
                      onChange={e => patchDraft({ note: e.target.value })}
                      rows={2}
                      placeholder="특이사항, 광고주 정보 등"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* 캠페인명 연결 */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600">캠페인명 연결</p>
                  <span className="text-[11px] text-gray-400">{editDraft.csvNames.length}개</span>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {/* 현재 연결된 태그 */}
                  {editDraft.csvNames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {editDraft.csvNames.map(name => (
                        <span key={name} className="flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 pl-2.5 pr-1 py-0.5 text-[11px] text-blue-700">
                          {name}
                          <button onClick={() => removeCsvName(name)} className="rounded-full p-0.5 hover:bg-blue-200">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 추가: 미연결 목록 드롭다운 */}
                  {(() => {
                    const addable = allCsvNames.filter(n => !editDraft.csvNames.includes(n))
                    if (addable.length === 0) return (
                      <p className="text-[11px] text-gray-400">
                        {allCsvNames.length === 0
                          ? 'DB에 저장된 데이터가 없습니다'
                          : '연결 가능한 캠페인명이 없습니다'}
                      </p>
                    )
                    return (
                      <select
                        defaultValue=""
                        onChange={e => { if (e.target.value) { addCsvName(e.target.value); e.target.value = '' } }}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">+ 캠페인명 추가...</option>
                        {addable.map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    )
                  })()}
                </div>
              </div>

              {/* 매체별 마크업+예산 */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3">
                  <p className="text-xs font-semibold text-gray-600">매체별 마크업 &amp; 예산</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">활성화한 매체만 리포트에서 마크업이 적용됩니다</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {MEDIA_TYPES.map(mt => {
                    const cfg = MEDIA_CONFIG[mt]
                    const markup = editDraft.mediaMarkups[mt]
                    const enabled = !!markup
                    return (
                      <div key={mt} className={`px-5 py-4 transition-colors ${enabled ? '' : 'opacity-50'}`}>
                        <div className="flex items-center gap-3 mb-3">
                          <button
                            onClick={() => toggleMediaMarkup(mt, !enabled)}
                            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors ${
                              enabled ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-gray-200'
                            }`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 translate-y-[-1px] rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                          <span className="text-sm font-medium text-gray-700">{cfg.label}</span>
                        </div>
                        {enabled && (
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-1">DMP 수수료율 (%)</label>
                              <input
                                type="number" min={0} max={100} step={0.1}
                                value={markup.dmpRate}
                                onChange={e => patchMarkup(mt, 'dmpRate', parseFloat(e.target.value) || 0)}
                                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-1">일반 수수료율 (%)</label>
                              <input
                                type="number" min={0} max={100} step={0.1}
                                value={markup.nonDmpRate}
                                onChange={e => patchMarkup(mt, 'nonDmpRate', parseFloat(e.target.value) || 0)}
                                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-1">예산 (원)</label>
                              <input
                                type="number" min={0} step={1000}
                                value={markup.budget}
                                onChange={e => patchMarkup(mt, 'budget', parseInt(e.target.value) || 0)}
                                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        )}
                        {enabled && markup.budget > 0 && (
                          <p className="mt-1 text-[10px] text-gray-400 text-right">
                            예산: {fmt(markup.budget)}원
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 예산 합계 */}
                {Object.values(editDraft.mediaMarkups).some(m => m && m.budget > 0) && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">총 예산</span>
                    <span className="text-sm font-bold text-gray-800">
                      {fmt(Object.values(editDraft.mediaMarkups).reduce((s, m) => s + (m?.budget ?? 0), 0))}원
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      ) : (
      /* 데이터 업로드 탭 */
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="space-y-5 max-w-5xl">
          {/* 날짜 필터 */}
          <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">날짜 범위 필터</p>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={uploadFilterStart}
                onChange={e => setUploadFilterStart(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">~</span>
              <input
                type="date"
                value={uploadFilterEnd}
                onChange={e => setUploadFilterEnd(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {(uploadFilterStart || uploadFilterEnd) && (
                <button
                  onClick={() => { setUploadFilterStart(''); setUploadFilterEnd('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  초기화
                </button>
              )}
              <span className="ml-auto text-[11px] text-gray-400">
                {filteredUploadReports.length}건 / 전체 {reports.length}건
              </span>
            </div>
          </div>

          {/* 캠페인 연결 패널 */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/30 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">캠페인 연결</p>
              <div className="flex items-center gap-2">
                {connectSaved && <span className="text-xs font-medium text-green-600">연결이 저장됐습니다 ✓</span>}
                <button
                  onClick={handleConnectSave}
                  disabled={selectedCampaigns.size === 0 || !selectedConnectCampaignId}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  연결 저장
                </button>
              </div>
            </div>

            <p className="text-[11px] text-gray-600 mb-3">선택한 캠페인명을 아래 캠페인과 연결합니다.</p>

            {selectedCampaigns.size === 0 ? (
              <p className="text-[11px] text-gray-400 py-2">위 테이블에서 캠페인명을 선택하세요</p>
            ) : (
              <>
                <div className="mb-3">
                  <label className="block text-[11px] text-gray-600 mb-1.5">캠페인 선택:</label>
                  <select
                    value={selectedConnectCampaignId}
                    onChange={e => setSelectedConnectCampaignId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">캠페인을 선택하세요</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.campaignName}</option>
                    ))}
                  </select>
                </div>

                {selectedConnectCampaignId && (() => {
                  const selectedCampaign = campaigns.find(c => c.id === selectedConnectCampaignId)
                  return selectedCampaign ? (
                    <>
                      {(selectedCampaign.csvNames ?? []).length > 0 && (
                        <div className="mb-3">
                          <p className="text-[11px] text-gray-600 mb-1.5">현재 연결:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(selectedCampaign.csvNames ?? []).map(name => (
                              <span key={name} className="rounded-full bg-green-100 border border-green-300 px-2.5 py-0.5 text-[11px] text-green-700">
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mb-3">
                        <p className="text-[11px] text-gray-600 mb-1.5">추가될 캠페인명 ({selectedCampaigns.size}개):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {Array.from(selectedCampaigns).map(name => (
                            <span key={name} className="rounded-full bg-blue-100 border border-blue-300 px-2.5 py-0.5 text-[11px] text-blue-700">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null
                })()}
              </>
            )}
          </div>

          {/* 캠페인명 테이블 */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-700">
                캠페인명
                <span className="ml-2 text-xs font-normal text-gray-400">({campaignTableRows.length}개)</span>
              </h3>
              <div className="flex items-center gap-2">
                {selectedCampaigns.size > 0 && (
                  <span className="text-[11px] text-blue-600 font-medium">{selectedCampaigns.size}개 선택됨</span>
                )}
                <button
                  onClick={() => {
                    if (selectedCampaigns.size === campaignTableRows.length) setSelectedCampaigns(new Set())
                    else setSelectedCampaigns(new Set(campaignTableRows.map(r => r.name)))
                  }}
                  className="text-[11px] text-gray-400 hover:text-gray-600"
                >
                  {selectedCampaigns.size === campaignTableRows.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>
            </div>
            {campaignTableRows.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-gray-400">
                {reports.length === 0 ? (
                  <span>저장된 데이터가 없습니다. <Link href="/campaign/ct-plus/daily" className="text-blue-600 hover:underline">데이터 업로드 →</Link></span>
                ) : '선택한 날짜 범위에 캠페인 데이터가 없습니다.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60 text-gray-500">
                      <th className="w-10 px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedCampaigns.size === campaignTableRows.length && campaignTableRows.length > 0}
                          onChange={e => setSelectedCampaigns(e.target.checked ? new Set(campaignTableRows.map(r => r.name)) : new Set())}
                          className="rounded"
                        />
                      </th>
                      <th className="px-4 py-2.5 text-left">캠페인명</th>
                      <th className="px-4 py-2.5 text-left">매체</th>
                      <th className="px-4 py-2.5 text-left">날짜 범위</th>
                      <th className="px-4 py-2.5 text-right">행 수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {campaignTableRows.map(row => {
                      const checked = selectedCampaigns.has(row.name)
                      return (
                        <tr
                          key={row.name}
                          onClick={() => {
                            const next = new Set(selectedCampaigns)
                            checked ? next.delete(row.name) : next.add(row.name)
                            setSelectedCampaigns(next)
                          }}
                          className={`cursor-pointer transition-colors ${checked ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}
                        >
                          <td className="w-10 px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const next = new Set(selectedCampaigns)
                                e.target.checked ? next.add(row.name) : next.delete(row.name)
                                setSelectedCampaigns(next)
                              }}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-2.5 font-medium text-gray-700 max-w-xs truncate" title={row.name}>{row.name}</td>
                          <td className="px-4 py-2.5 text-gray-500">
                            {row.mediaTypes.map(mt => MEDIA_CONFIG[mt]?.label ?? mt).join(', ') || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 tabular-nums">
                            {row.dateMin ? (row.dateMin === row.dateMax ? row.dateMin : `${row.dateMin} ~ ${row.dateMax}`) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                            {row.rowCount > 0 ? fmt(row.rowCount) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 매체명 테이블 */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-700">
                매체명
                <span className="ml-2 text-xs font-normal text-gray-400">({mediaTableRows.length}개)</span>
              </h3>
              <div className="flex items-center gap-2">
                {selectedMedias.size > 0 && (
                  <span className="text-[11px] text-blue-600 font-medium">{selectedMedias.size}개 선택됨</span>
                )}
                <button
                  onClick={() => {
                    if (selectedMedias.size === mediaTableRows.length) setSelectedMedias(new Set())
                    else setSelectedMedias(new Set(mediaTableRows.map(r => r.mt)))
                  }}
                  className="text-[11px] text-gray-400 hover:text-gray-600"
                >
                  {selectedMedias.size === mediaTableRows.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>
            </div>
            {mediaTableRows.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-gray-400">
                {reports.length === 0 ? '저장된 데이터가 없습니다.' : '선택한 날짜 범위에 매체 데이터가 없습니다.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60 text-gray-500">
                      <th className="w-10 px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedMedias.size === mediaTableRows.length && mediaTableRows.length > 0}
                          onChange={e => setSelectedMedias(e.target.checked ? new Set(mediaTableRows.map(r => r.mt)) : new Set())}
                          className="rounded"
                        />
                      </th>
                      <th className="px-4 py-2.5 text-left">매체명</th>
                      <th className="px-4 py-2.5 text-right">리포트 수</th>
                      <th className="px-4 py-2.5 text-right">행 수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {mediaTableRows.map(row => {
                      const checked = selectedMedias.has(row.mt)
                      const cfg = MEDIA_CONFIG[row.mt]
                      return (
                        <tr
                          key={row.mt}
                          onClick={() => {
                            const next = new Set(selectedMedias)
                            checked ? next.delete(row.mt) : next.add(row.mt)
                            setSelectedMedias(next)
                          }}
                          className={`cursor-pointer transition-colors ${checked ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}
                        >
                          <td className="w-10 px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => {
                                const next = new Set(selectedMedias)
                                e.target.checked ? next.add(row.mt) : next.delete(row.mt)
                                setSelectedMedias(next)
                              }}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cfg?.color ?? '#888' }} />
                              <span className="font-medium text-gray-700">{cfg?.label ?? row.mt}</span>
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{fmt(row.reportCount)}건</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                            {row.rowCount > 0 ? fmt(row.rowCount) + '행' : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
      )}

      {/* 그룹 삭제 확인 모달 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white shadow-xl p-6 w-80">
            <p className="text-sm font-semibold text-gray-800">그룹을 삭제하시겠습니까?</p>
            <p className="mt-1 text-xs text-gray-400">
              &ldquo;{groups.find(g => g.id === deleteConfirm)?.name ?? ''}&rdquo; 그룹이 삭제됩니다.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 리포트 삭제 확인 모달 */}
      {deleteReportConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white shadow-xl p-6 w-80">
            <p className="text-sm font-semibold text-gray-800">리포트를 삭제하시겠습니까?</p>
            <p className="mt-1 text-xs text-gray-400">삭제된 리포트는 복구할 수 없습니다.</p>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setDeleteReportConfirm(null)} className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={() => handleDeleteReport(deleteReportConfirm)} className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 월별 전체 삭제 확인 모달 */}
      {deleteMonthConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white shadow-xl p-6 w-80">
            <p className="text-sm font-semibold text-gray-800">{deleteMonthConfirm} 데이터를 모두 삭제하시겠습니까?</p>
            <p className="mt-1 text-xs text-gray-400">
              {groupedReports[deleteMonthConfirm]?.length ?? 0}건의 리포트가 삭제됩니다.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setDeleteMonthConfirm(null)} className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={() => handleDeleteMonth(deleteMonthConfirm, groupedReports[deleteMonthConfirm] ?? [])} className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700">삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
