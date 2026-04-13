/**
 * csvChunker.ts
 * 대용량 CSV 데이터를 DB 청크 단위로 분할/복원하는 유틸리티
 *
 * 전략:
 * - 총 행수 > CHUNK_THRESHOLD → 자동 청크 모드
 * - 각 청크: 최대 CHUNK_SIZE 행 (매체 경계 유지)
 * - DB 저장: 부모(메타데이터) + N개 청크 도큐먼트
 * - localStorage: 청크 리포트는 메타데이터만 저장 (행 데이터 제외)
 */

import type { MediaType } from './reportTypes'
import type { RawRow } from './rawDataParser'

export const CHUNK_SIZE      = 3_000  // 청크 당 최대 행수 (~900KB/청크)
export const CHUNK_THRESHOLD = 5_000  // 이 이상이면 자동 청크 모드

export type ChunkedRowsMap = Partial<Record<MediaType, RawRow[]>>

/**
 * rowsByMedia의 총 행수 반환
 */
export function totalRowCount(rowsByMedia: ChunkedRowsMap): number {
  return Object.values(rowsByMedia).reduce((s, rows) => s + (rows?.length ?? 0), 0)
}

/**
 * rowsByMedia를 CHUNK_SIZE 단위로 분할
 * 매체 경계를 유지하면서 행 순서대로 분할
 *
 * @returns 청크 배열. 각 원소는 rowsByMedia 슬라이스
 */
export function splitIntoChunks(rowsByMedia: ChunkedRowsMap): ChunkedRowsMap[] {
  // 모든 (media, row) 쌍을 순서대로 flatten
  const flat: Array<{ media: MediaType; row: RawRow }> = []
  for (const [media, rows] of Object.entries(rowsByMedia) as [MediaType, RawRow[]][]) {
    for (const row of rows) {
      flat.push({ media, row })
    }
  }

  const chunks: ChunkedRowsMap[] = []
  for (let start = 0; start < flat.length; start += CHUNK_SIZE) {
    const slice = flat.slice(start, start + CHUNK_SIZE)
    const chunkMap: ChunkedRowsMap = {}
    for (const { media, row } of slice) {
      if (!chunkMap[media]) chunkMap[media] = []
      chunkMap[media]!.push(row)
    }
    chunks.push(chunkMap)
  }
  return chunks
}

/**
 * 청크 배열을 단일 rowsByMedia로 복원
 */
export function mergeChunks(chunks: ChunkedRowsMap[]): ChunkedRowsMap {
  const merged: ChunkedRowsMap = {}
  for (const chunk of chunks) {
    for (const [media, rows] of Object.entries(chunk) as [MediaType, RawRow[]][]) {
      if (!merged[media]) merged[media] = []
      merged[media]!.push(...rows)
    }
  }
  return merged
}

/**
 * 리포트가 청크 모드인지 판단
 */
export function needsChunking(rowsByMedia: ChunkedRowsMap): boolean {
  return totalRowCount(rowsByMedia) > CHUNK_THRESHOLD
}
