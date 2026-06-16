/**
 * `/api/motiv/adgroups` — `/ad-groups` 의 별칭. 본 route 도 Open API 로 교체.
 *
 * 사용자 보고 — 기존 Motiv `/v1/stats/adgroup/breakdown` 은 404. 새 API 는
 * insights ADGROUP level 로 통일.
 */

export { GET } from '../ad-groups/route'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
