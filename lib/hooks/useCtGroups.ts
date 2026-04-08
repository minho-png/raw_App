'use client'

import { useState, useEffect, useCallback } from 'react'
import type { CtPlusGroup } from '@/lib/ctGroupTypes'
import { createEmptyCtGroup } from '@/lib/ctGroupTypes'
import { genId } from '@/lib/idGenerator'

const LS_KEY   = 'ct-plus-groups-v1'
const API_TYPE = 'ct-groups'

function lsRead(): CtPlusGroup[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as CtPlusGroup[]) : []
  } catch { return [] }
}

function lsWrite(data: CtPlusGroup[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}

async function fetchFromMongo(): Promise<CtPlusGroup[]> {
  try {
    const res = await fetch(`/api/v1/master-data?type=${API_TYPE}`, { cache: 'no-store' })
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch { return [] }
}

async function saveToMongo(data: CtPlusGroup[]): Promise<void> {
  try {
    await fetch(`/api/v1/master-data?type=${API_TYPE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    })
  } catch {}
}

export interface UseCtGroupsReturn {
  groups: CtPlusGroup[]
  loading: boolean
  saveGroups: (data: CtPlusGroup[]) => Promise<void>
  addGroup: (g: CtPlusGroup) => Promise<void>
  updateGroup: (g: CtPlusGroup) => Promise<void>
  deleteGroup: (id: string) => Promise<void>
  newGroup: () => CtPlusGroup
  refresh: () => Promise<void>
}

export function useCtGroups(): UseCtGroupsReturn {
  const [groups, setGroups] = useState<CtPlusGroup[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    setGroups(lsRead())
    const remote = await fetchFromMongo()
    if (remote.length) {
      setGroups(remote)
      lsWrite(remote)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function saveGroups(data: CtPlusGroup[]) {
    setGroups(data)
    lsWrite(data)
    await saveToMongo(data)
  }

  async function addGroup(g: CtPlusGroup) {
    await saveGroups([...groups, g])
  }

  async function updateGroup(g: CtPlusGroup) {
    const updated = { ...g, updatedAt: new Date().toISOString() }
    await saveGroups(groups.map(x => x.id === g.id ? updated : x))
  }

  async function deleteGroup(id: string) {
    await saveGroups(groups.filter(x => x.id !== id))
  }

  function newGroup(): CtPlusGroup {
    return createEmptyCtGroup(genId())
  }

  return { groups, loading, saveGroups, addGroup, updateGroup, deleteGroup, newGroup, refresh: loadAll }
}
