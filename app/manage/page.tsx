import { redirect } from "next/navigation"

// feature/ui-improvements-v2 의 /manage 링크 호환 — main의 /management 페이지로 리다이렉트
export default function ManageAliasPage() {
  redirect("/management")
}
