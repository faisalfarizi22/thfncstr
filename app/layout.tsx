// layout.tsx
import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Providers } from "@/lib/providers"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

const APP_URL = "https://thfncstr.vercel.app"

export const metadata: Metadata = {
  title: "The Funcaster NFT Mint",
  description: "Simple NFT Minting Page",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "The Funcaster NFT",
    description: "A Tribute to Warplets Holders. Mint yours now!",
    images: [`${APP_URL}/image.png`],
    url: APP_URL,
    type: "website",
  },
  other: {
    "fc:frame": "vNext",
    "fc:frame:image": `${APP_URL}/image.png`, 
    "fc:frame:button:1": "Mint", 
    "fc:frame:button:1:action": "post_redirect", 
    "fc:frame:post_url": APP_URL, 
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  )
}