import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import SidebarWrapper from "@/components/SidebarWrapper"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "광고 정산 대시보드",
  description: "크로스타겟 캠페인 정산 대시보드",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex h-full bg-gray-50">
        <SidebarWrapper />
        <div className="flex flex-1 flex-col overflow-auto">
          {children}
        </div>
      </body>
    </html>
  )
}
