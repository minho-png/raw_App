"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ReportRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace("/campaign/ct-plus/status") }, [router])
  return null
}
