"use client"

import { usePathname } from "next/navigation"
import Sidebar from "@/components/Sidebar"

const NO_SIDEBAR_PATHS = ["/login"]

export default function SidebarWrapper() {
  const pathname = usePathname()
  if (NO_SIDEBAR_PATHS.some(p => pathname.startsWith(p))) return null
  return <Sidebar />
}
