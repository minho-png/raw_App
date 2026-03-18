import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const outfit = Outfit({ subsets: ["latin"], variable: '--font-outfit' });

export const metadata: Metadata = {
  title: "GFA RAW MASTER PRO | Advanced Ads Intelligence",
  description: "Advanced Ads Performance Management Platform with Real-time Analysis",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={cn(inter.variable, outfit.variable)}>
      <body className={cn(inter.className, "antialiased selection:bg-blue-100 selection:text-blue-900")}>
        {children}
      </body>
    </html>
  );
}
