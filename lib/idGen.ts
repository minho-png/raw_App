/**
 * 안전한 로컬 ID 생성기.
 *
 * Date.now().toString() 단독은 같은 ms 에 여러 항목을 동시에 추가하면
 * 충돌 가능. base36 ms + 7자리 random 으로 충돌 확률을 사실상 0으로 낮춤.
 *
 * 사용처: LocalStorage 기반 마스터 데이터(operator/agency/advertiser/campaign 등)
 *         의 신규 row id. 기존 데이터의 ID 형식과 호환 (문자열).
 */
export function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}
