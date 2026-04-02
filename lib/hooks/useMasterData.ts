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

async function fetchFromMongo<T>(type: MasterDataType): Promise<T[]> {
  try {
    const res = await fetch(`/api/v1/master-data?type=${type}`, { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch { return [] }
}

async function saveToMongo<T>(type: MasterDataType, data: T[]): Promise<void> {
  try {
    await fetch(`/api/v1/master-data?type=${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    })
  } catch { /* best-effort */ }
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
    const [mc, ma, mdv, mo] = await Promise.all([
      fetchFromMongo<Campaign>('campaigns'),
      fetchFromMongo<Agency>('agencies'),
      fetchFromMongo<Advertiser>('advertisers'),
      fetchFromMongo<Operator>('operators'),
    ])

    if (mc.length)  { setCampaigns(mc);    lsWrite(LS_KEYS.campaigns,   mc) }
    if (ma.length)  { setAgencies(ma);     lsWrite(LS_KEYS.agencies,    ma) }
    if (mdv.length) { setAdvertisers(mdv); lsWrite(LS_KEYS.advertisers, mdv) }
    if (mo.length)  { setOperators(mo);    lsWrite(LS_KEYS.operators,   mo) }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function saveCampaigns(data: Campaign[]) {
    setCampaigns(data)
    lsWrite(LS_KEYS.campaigns, data)
    await saveToMongo('campaigns', data)
  }
  async function saveAgencies(data: Agency[]) {
    setAgencies(data)
    lsWrite(LS_KEYS.agencies, data)
    await saveToMongo('agencies', data)
  }
  async function saveAdvertisers(data: Advertiser[]) {
    setAdvertisers(data)
    lsWrite(LS_KEYS.advertisers, data)
    await saveToMongo('advertisers', data)
  }
  async function saveOperators(data: Operator[]) {
    setOperators(data)
    lsWrite(LS_KEYS.operators, data)
    await saveToMongo('operators', data)
  }

  return {
    campaigns, agencies, advertisers, operators, loading,
    saveCampaigns, saveAgencies, saveAdvertisers, saveOperators,
    refresh: loadAll,
  }
}
