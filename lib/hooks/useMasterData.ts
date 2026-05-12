'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Campaign, Agency, Advertiser, Operator } from '@/lib/campaignTypes'

// localStorage keys (unchanged — backward compat)
const LS_KEYS = {
  campaigns:   'ct-plus-campaigns-v7',
  agencies:    'ct-plus-agencies-v1',
  advertisers: 'ct-plus-advertisers-v1',
  operators:   'ct-plus-operators-v1',
} as const

type MasterDataType = keyof typeof LS_KEYS

// null = fetch 실패 (네트워크/서버 오류), [] = 서버에 데이터 없음 (정상 빈 응답)
async function fetchFromMongo<T>(type: MasterDataType): Promise<T[] | null> {
  try {
    const res = await fetch(`/api/v1/master-data?type=${type}`, { cache: 'no-store' })
    if (!res.ok) return null
    const json = await res.json()
    return Array.isArray(json.data) ? json.data as T[] : []
  } catch { return null }
}

// QA DB-001: 실패 시 throw — 호출자가 토스트 등으로 사용자에게 알림.
async function saveToMongo<T>(type: MasterDataType, data: T[]): Promise<void> {
  const res = await fetch(`/api/v1/master-data?type=${type}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`)
    throw new Error(`MongoDB 저장 실패 (${type}): ${msg.slice(0, 200)}`)
  }
}

// QA DB-003: 단건 upsert — 전체 배열 덮어쓰기 대신 해당 id 만 수정.
async function patchOneToMongo<T extends { id: string }>(type: MasterDataType, item: T): Promise<void> {
  const res = await fetch(`/api/v1/master-data?type=${type}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item }),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`)
    throw new Error(`MongoDB 단건 저장 실패 (${type}): ${msg.slice(0, 200)}`)
  }
}

async function deleteOneFromMongo(type: MasterDataType, id: string): Promise<void> {
  const res = await fetch(`/api/v1/master-data?type=${type}&id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`)
    throw new Error(`MongoDB 단건 삭제 실패 (${type}): ${msg.slice(0, 200)}`)
  }
}

function lsRead<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch { return [] }
}

function lsWrite<T>(key: string, data: T[]): void {
  try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* quota */ }
}

export interface MasterData {
  campaigns:   Campaign[]
  agencies:    Agency[]
  advertisers: Advertiser[]
  operators:   Operator[]
  loading:     boolean
  // Persist the full list (replaces what's in localStorage + MongoDB)
  saveCampaigns:   (data: Campaign[])   => Promise<void>
  saveAgencies:    (data: Agency[])     => Promise<void>
  saveAdvertisers: (data: Advertiser[]) => Promise<void>
  saveOperators:   (data: Operator[])   => Promise<void>
  // 단건 upsert — 동시 편집 안전 (QA DB-003)
  upsertCampaign:   (c: Campaign)   => Promise<void>
  upsertAgency:     (a: Agency)     => Promise<void>
  upsertAdvertiser: (a: Advertiser) => Promise<void>
  upsertOperator:   (o: Operator)   => Promise<void>
  // 단건 삭제
  deleteCampaign:   (id: string) => Promise<void>
  deleteAgency:     (id: string) => Promise<void>
  deleteAdvertiser: (id: string) => Promise<void>
  deleteOperator:   (id: string) => Promise<void>
  // Convenience: reload from MongoDB
  refresh: () => Promise<void>
}

export function useMasterData(): MasterData {
  const [campaigns,   setCampaigns]   = useState<Campaign[]>([])
  const [agencies,    setAgencies]    = useState<Agency[]>([])
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([])
  const [operators,   setOperators]   = useState<Operator[]>([])
  const [loading,     setLoading]     = useState(true)

  const loadAll = useCallback(async () => {
    // 1. Instant hydration from localStorage
    setCampaigns(lsRead<Campaign>(LS_KEYS.campaigns))
    setAgencies(lsRead<Agency>(LS_KEYS.agencies))
    setAdvertisers(lsRead<Advertiser>(LS_KEYS.advertisers))
    setOperators(lsRead<Operator>(LS_KEYS.operators))

    // 2. Fetch from MongoDB and update (MongoDB wins on conflict)
    // QA BUG-005: Promise.all 중 하나라도 reject 시 setLoading(false) 미호출 → 무한 로딩.
    // try/finally 로 종료 보장.
    // QA DB-002: fetchFromMongo 가 null(실패) / [](정상 빈) 을 구분 → 빈 배열도 정상 반영.
    //   기존 if (mc.length) 는 서버에서 모두 삭제된 경우 localStorage 잔존 데이터 노출 문제.
    try {
      const [mc, ma, mdv, mo] = await Promise.all([
        fetchFromMongo<Campaign>('campaigns'),
        fetchFromMongo<Agency>('agencies'),
        fetchFromMongo<Advertiser>('advertisers'),
        fetchFromMongo<Operator>('operators'),
      ])
      if (mc  !== null) { setCampaigns(mc);    lsWrite(LS_KEYS.campaigns,   mc) }
      if (ma  !== null) { setAgencies(ma);     lsWrite(LS_KEYS.agencies,    ma) }
      if (mdv !== null) { setAdvertisers(mdv); lsWrite(LS_KEYS.advertisers, mdv) }
      if (mo  !== null) { setOperators(mo);    lsWrite(LS_KEYS.operators,   mo) }
    } catch (e) {
      console.error('[useMasterData] MongoDB fetch failed, falling back to localStorage:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // QA DB-001: 저장 실패 시 사용자에게 명시적으로 알림 (silent-fail 차단).
  //   localStorage 는 이미 반영되어 있으므로 단기 작업은 계속 가능,
  //   다만 새 기기/세션에서는 손실되므로 사용자가 인지해야 함.
  async function persistWithAlert<T>(type: MasterDataType, label: string, data: T[]) {
    try {
      await saveToMongo(type, data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[useMasterData] ${type} save failed:`, e)
      if (typeof window !== 'undefined') {
        window.alert(
          `[서버 저장 실패] ${label}\n` +
          `${msg}\n\n` +
          `현재 브라우저에는 임시 저장되었지만, 다른 기기나 새 세션에서는 보이지 않을 수 있습니다.\n` +
          `네트워크 상태를 확인한 뒤 다시 시도해 주세요.`
        )
      }
      throw e
    }
  }

  async function saveCampaigns(data: Campaign[]) {
    setCampaigns(data)
    lsWrite(LS_KEYS.campaigns, data)
    await persistWithAlert('campaigns', '캠페인', data)
  }
  async function saveAgencies(data: Agency[]) {
    setAgencies(data)
    lsWrite(LS_KEYS.agencies, data)
    await persistWithAlert('agencies', '대행사', data)
  }
  async function saveAdvertisers(data: Advertiser[]) {
    setAdvertisers(data)
    lsWrite(LS_KEYS.advertisers, data)
    await persistWithAlert('advertisers', '광고주', data)
  }
  async function saveOperators(data: Operator[]) {
    setOperators(data)
    lsWrite(LS_KEYS.operators, data)
    await persistWithAlert('operators', '운영자', data)
  }

  // ── 단건 헬퍼 ────────────────────────────────────────────────────
  async function patchOneWithAlert<T extends { id: string }>(
    type: MasterDataType, label: string, item: T,
  ): Promise<void> {
    try {
      await patchOneToMongo(type, item)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[useMasterData] ${type} upsert failed:`, e)
      if (typeof window !== 'undefined') {
        window.alert(`[서버 저장 실패] ${label}\n${msg}\n\n브라우저에는 임시 저장되었습니다.`)
      }
      throw e
    }
  }
  async function deleteOneWithAlert(type: MasterDataType, label: string, id: string): Promise<void> {
    try {
      await deleteOneFromMongo(type, id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[useMasterData] ${type} delete failed:`, e)
      if (typeof window !== 'undefined') {
        window.alert(`[서버 삭제 실패] ${label}\n${msg}\n\n브라우저에서는 삭제되었지만 서버에는 남아있습니다.`)
      }
      throw e
    }
  }

  async function upsertCampaign(c: Campaign) {
    const next = campaigns.some(x => x.id === c.id)
      ? campaigns.map(x => x.id === c.id ? c : x)
      : [...campaigns, c]
    setCampaigns(next)
    lsWrite(LS_KEYS.campaigns, next)
    await patchOneWithAlert('campaigns', '캠페인', c)
  }
  async function upsertAgency(a: Agency) {
    const next = agencies.some(x => x.id === a.id)
      ? agencies.map(x => x.id === a.id ? a : x)
      : [...agencies, a]
    setAgencies(next)
    lsWrite(LS_KEYS.agencies, next)
    await patchOneWithAlert('agencies', '대행사', a)
  }
  async function upsertAdvertiser(a: Advertiser) {
    const next = advertisers.some(x => x.id === a.id)
      ? advertisers.map(x => x.id === a.id ? a : x)
      : [...advertisers, a]
    setAdvertisers(next)
    lsWrite(LS_KEYS.advertisers, next)
    await patchOneWithAlert('advertisers', '광고주', a)
  }
  async function upsertOperator(o: Operator) {
    const next = operators.some(x => x.id === o.id)
      ? operators.map(x => x.id === o.id ? o : x)
      : [...operators, o]
    setOperators(next)
    lsWrite(LS_KEYS.operators, next)
    await patchOneWithAlert('operators', '운영자', o)
  }

  async function deleteCampaign(id: string) {
    const next = campaigns.filter(x => x.id !== id)
    setCampaigns(next)
    lsWrite(LS_KEYS.campaigns, next)
    await deleteOneWithAlert('campaigns', '캠페인', id)
  }
  async function deleteAgency(id: string) {
    const next = agencies.filter(x => x.id !== id)
    setAgencies(next)
    lsWrite(LS_KEYS.agencies, next)
    await deleteOneWithAlert('agencies', '대행사', id)
  }
  async function deleteAdvertiser(id: string) {
    const next = advertisers.filter(x => x.id !== id)
    setAdvertisers(next)
    lsWrite(LS_KEYS.advertisers, next)
    await deleteOneWithAlert('advertisers', '광고주', id)
  }
  async function deleteOperator(id: string) {
    const next = operators.filter(x => x.id !== id)
    setOperators(next)
    lsWrite(LS_KEYS.operators, next)
    await deleteOneWithAlert('operators', '운영자', id)
  }

  return {
    campaigns, agencies, advertisers, operators, loading,
    saveCampaigns, saveAgencies, saveAdvertisers, saveOperators,
    upsertCampaign, upsertAgency, upsertAdvertiser, upsertOperator,
    deleteCampaign, deleteAgency, deleteAdvertiser, deleteOperator,
    refresh: loadAll,
  }
}
