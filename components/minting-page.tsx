"use client"

import { useEffect, useState } from "react"
import { useAccount, useConnect } from "wagmi"
import MintingCard from "./minting-card"
import { Button } from "./ui/button"
import { useToast } from "@/hooks/use-toast"
import { Wallet, Sparkles } from "lucide-react"

export default function MintingPage() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { toast } = useToast()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !isConnected && connectors.length > 0) {
      connect({ connector: connectors[0] })
    }
  }, [mounted, isConnected, connect, connectors])

  if (!mounted) {
    return null
  }

  const handleConnect = () => {
    if (connectors.length > 0) {
      connect({ connector: connectors[0] })
    } else {
      toast({
        title: "Error",
        description: "No wallet connector available. Please enable Farcaster wallet.",
        variant: "destructive",
      })
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {!isConnected || !address ? (
          <div className="bg-white rounded-3xl p-8 shadow-2xl border border-slate-200">
            <div className="text-center space-y-6">
              {/* Logo/Icon */}
              <div className="flex justify-center">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-5 rounded-2xl shadow-lg">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Funcaster NFT
                </h1>
                <p className="text-slate-600 text-base">
                  Mint your exclusive NFT on Base
                </p>
              </div>

              {/* Info Card */}
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-2xl p-6 text-left">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Before you start:</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 font-bold mt-0.5">•</span>
                    <span>Connect your Farcaster wallet</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 font-bold mt-0.5">•</span>
                    <span>Must hold a Warplets NFT to mint</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 font-bold mt-0.5">•</span>
                    <span>One mint per Warplets FID</span>
                  </li>
                </ul>
              </div>

              {/* Connect Button */}
              <Button
                onClick={handleConnect}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-6 rounded-xl text-lg shadow-lg transition-all duration-200 hover:shadow-xl"
              >
                <Wallet className="w-5 h-5 mr-2" />
                Connect Farcaster Wallet
              </Button>

              {/* Footer Info */}
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Base Mainnet</span>
                <span>•</span>
                <span>Warplets Required</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connected Address Badge */}
            <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-slate-200 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                  <div className="absolute inset-0 w-3 h-3 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
                </div>
                <div>
                  <p className="text-xs text-slate-600 font-medium">Connected Wallet</p>
                  <p className="text-sm font-mono font-bold text-slate-900">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </p>
                </div>
              </div>
              <div className="bg-emerald-50 px-3 py-1.5 rounded-lg">
                <p className="text-xs font-semibold text-emerald-700">Active</p>
              </div>
            </div>

            {/* Minting Card */}
            <MintingCard address={address} />
          </div>
        )}
      </div>
    </main>
  )
}