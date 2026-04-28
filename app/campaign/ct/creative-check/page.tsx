import { redirect } from "next/navigation"

// CT 소재 검수는 CT+ 의 소재 검수 페이지를 그대로 재사용 (사용자 정책: 동일 검수 로직).
// 향후 CT 전용 매체별 규격 도입 시 여기에 별도 구현 가능.
export default function CtCreativeCheckPage() {
  redirect("/campaign/ct-plus/creative-check")
}
