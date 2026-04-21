/**
 * rawDataStore.ts
 * 원본 CSV 데이터 저장소 — markup 미적용 raw rows를 로컬스토리지에 영속
 *
 * 업로드 시 supplyValue만 존재하는 raw rows를 배치 단위로 저장.
 * markupService.applyMarkupToRows()로 캠페인 수수료 적용 후 계산된 rows 생성.
 */

import type { RawRow } from './rawDataParser'

const STORAGE_KEY = 'ct-plus-raw-batches-v1'

export interface RawBatch {
  id: string           // Date.now().toString()
  uploadedAt: string   // ISO 8601
  fileName: string
  rowCount: number
  rows: RawRow[]       // markup 미적용 (netAmount = supplyValue or supplyValue/1.1 for naver)
}

export function saveRawBatch(batch: RawBatch): void {
  try {
    const existing = loadRawBatches()
    const filtered = existing.filter(b => b.id !== batch.id)
    const updated = [...filtered, batch]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (e) {
    console.warn('[rawDataStore] save failed:', e)
  }
}

export function loadRawBatches(): RawBatch[] {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? (JSON.parse(s) as RawBatch[]) : []
  } catch { return [] }
}

export function loadAllRawRows(): RawRow[] {
  return loadRawBatches().flatMap(b => b.rows)
}

export function deleteRawBatch(id: string): void {
  try {
    const updated = loadRawBatches().filter(b => b.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {}
}

export function clearAllRawData(): void {
  localStorage.removeItem(STORAGE_KEY)
}
