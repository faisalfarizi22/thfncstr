import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Providers } from "@/lib/providers"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

const APP_URL = "https://thfncstr.vercel.app" 

const miniappEmbed = {
  version: "1",
  imageUrl: `${APP_URL}/image.png`, 
  button: {
    title: "Mint Funcaster NFT", 
    action: {
      type: "launch_miniapp",
      url: APP_URL,
      name: "The Funcaster",
      splashImageUrl: `${APP_URL}/5.jpeg`, 
      splashBackgroundColor: "#6a0ad1",
    },
  },
}

const frameEmbed = {
  ...miniappEmbed,
  button: {
    ...miniappEmbed.button,
    action: {
      ...miniappEmbed.button.action,
      type: "launch_frame",
    }
  }
}


export const metadata: Metadata = {
  title: "NFT Minting",
  description: "Simple NFT Minting Page",
  icons: {
    icon: "/favicon.ico",
  },
  other: {
    "fc:miniapp": JSON.stringify(miniappEmbed), 
    "fc:frame": JSON.stringify(frameEmbed), 
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