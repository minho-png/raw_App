"use client"

// DMP 수수료 정산 페이지 — SSR 비활성화 wrapper.
// 사용자 보고 React #418 (hydration text mismatch) 회피.
// useState lazy initializer 의 new Date() 등이 서버/클라이언트 시각·locale 차이
// 유발 → 클라이언트 전용 페이지로 한정.
import dynamic from 'next/dynamic'

const DmpFeeClient = dynamic(() => import('./DmpFeeClient'), { ssr: false })

export default function DmpFeePage() {
  return <DmpFeeClient />
}
