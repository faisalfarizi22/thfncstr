"use client"

import { useState, useEffect } from "react"
import { parseEther, isAddress, encodeFunctionData, createPublicClient, http, decodeEventLog } from "viem"
import { base } from "wagmi/chains"
import { useSendTransaction } from "wagmi"
import { Button } from "./ui/button"
import { Card } from "./ui/card"
import { useToast } from "@/hooks/use-toast"
import { NFT_ABI } from "@/lib/nft-abi"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "./ui/alert-dialog"
import { Spinner } from "./ui/spinner"
import { CheckCircle2, ExternalLink, Share2, Eye } from "lucide-react"

const WARPLETS_ADDRESS = (process.env.NEXT_PUBLIC_WARPLETS_ADDRESS || "0x699727f9e01a822efdcf7333073f0461e5914b4e") as `0x${string}`
const FUNCASTER_ADDRESS = (process.env.NEXT_PUBLIC_FUNCASTER_ADDRESS || "0xfc3EFAdEBcB41c0a151431F518e06828DA03841a") as `0x${string}`

const METADATA_BASE = process.env.NEXT_PUBLIC_METADATA_BASE || "https://chocolate-brilliant-galliform-191.mypinata.cloud/ipfs/bafybeih4eat5zptl3ll2phhyeij6glgnipi6ixsnssuac5tjvhs5cy3t2i/"
const IMAGES_BASE = process.env.NEXT_PUBLIC_IMAGES_BASE || "https://chocolate-brilliant-galliform-191.mypinata.cloud/ipfs/bafybeie4gmevlia7jbxcnqyelotdor7dvmfklkv3f7mqnahkdjwetd6yne/"

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
})

interface MintingCardProps {
  address: string
}

const TOTAL_IMAGES = 100
const LOOP_INTERVAL_MS = 100

const generateLoopOrder = () => {
    const order: number[] = []
    for (let j = 0; j < 10; j++) {
      for (let i = 0; i < 10; i++) {
        const index = (i * 10) + j + 1
        if (index <= TOTAL_IMAGES) {
          order.push(index)
        }
      }
    }
    return order
}

const loopOrder = generateLoopOrder()

export default function MintingCard({ address }: MintingCardProps) {
  const { toast } = useToast()
  const { sendTransaction } = useSendTransaction()
  const [isHolder, setIsHolder] = useState(false)
  const [eligibilityLoading, setEligibilityLoading] = useState(true)
  const [isMinting, setIsMinting] = useState(false)
  const [mintPrice, setMintPrice] = useState<bigint | null>(null)
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [mintingComplete, setMintingComplete] = useState(false)
  const [mintedImageUrl, setMintedImageUrl] = useState<string | null>(null)
  const [mintedTxHash, setMintedTxHash] = useState<string | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [alreadyOwnsNFT, setAlreadyOwnsNFT] = useState(false)
  const [existingTokenId, setExistingTokenId] = useState<string | null>(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [totalMinted, setTotalMinted] = useState<number>(0)
  const [maxSupply, setMaxSupply] = useState<number>(10000)

  const validAddress = address && isAddress(address) ? (address as `0x${string}`) : undefined
  
  const ipfsToGateway = (u?: string | null) => {
    if (!u) return null
    if (u.startsWith("ipfs://")) {
      const hash = u.replace("ipfs://", "")
      return `https://chocolate-brilliant-galliform-191.mypinata.cloud/ipfs/${hash}`
    }
    return u
  }

  const resolveImageForToken = async (tokenId: string) => {
    const candidates = [
      `${METADATA_BASE}${tokenId}.json`,
      `${METADATA_BASE}${tokenId}`,
    ]
    for (const url of candidates) {
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const json = await res.json()
        if (json?.image) return ipfsToGateway(json.image) || json.image
      } catch (e) {
        // ignore
      }
    }

    const exts = [".png", ".jpg", ".jpeg", ".webp", ""]
    for (const ext of exts) {
      const candidate = `${IMAGES_BASE}${tokenId}${ext}`
      try {
        const r = await fetch(candidate, { method: "HEAD" })
        if (r.ok) return candidate
      } catch {
        // ignore
      }
    }

    return null
  }

  useEffect(() => {
    if (mintingComplete || eligibilityLoading) return

    const interval = setInterval(() => {
        setCurrentImageIndex(prevIndex => (prevIndex + 1) % loopOrder.length)
    }, LOOP_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [mintingComplete, eligibilityLoading])

  useEffect(() => {
    const checkEligibility = async () => {
      if (!validAddress) {
        setEligibilityLoading(false)
        return
      }

      try {
        setEligibilityLoading(true)

        // Check if user already owns a Funcaster NFT
        const funcasterBalance = await publicClient.readContract({
          address: FUNCASTER_ADDRESS,
          abi: NFT_ABI,
          functionName: "balanceOf",
          args: [validAddress],
        })

        const ownsNFT = funcasterBalance && typeof funcasterBalance === "bigint" ? funcasterBalance > BigInt(0) : false

        if (ownsNFT) {
          try {
            const tokenId = (await publicClient.readContract({
              address: FUNCASTER_ADDRESS,
              abi: NFT_ABI,
              functionName: "tokenOfOwnerByIndex",
              args: [validAddress, BigInt(0)],
            })) as unknown as bigint

            const tokenIdStr = tokenId.toString()
            setExistingTokenId(tokenIdStr)
            setMintedTokenId(tokenIdStr)
            setAlreadyOwnsNFT(true)
            setMintingComplete(true)

            setIsResolving(true)
            const imageUrl = await resolveImageForToken(tokenIdStr)
            if (imageUrl) {
              setMintedImageUrl(imageUrl)
            }
            setIsResolving(false)

            toast({
              title: "NFT Found!",
              description: `You already own Funcaster NFT #${tokenIdStr}`,
            })
          } catch (error) {
            console.error("[v0] Error fetching existing NFT:", error)
          }

          setEligibilityLoading(false)
          return
        }

        // Check Warplets eligibility
        const balance = await publicClient.readContract({
          address: WARPLETS_ADDRESS,
          abi: NFT_ABI,
          functionName: "balanceOf",
          args: [validAddress],
        })

        const holderStatus = balance && typeof balance === "bigint" ? balance > BigInt(0) : false
        setIsHolder(holderStatus)

        // Fetch supply information
        try {
          const minted = await publicClient.readContract({
            address: FUNCASTER_ADDRESS,
            abi: NFT_ABI,
            functionName: "totalMinted",
            args: [],
          })
          setTotalMinted(typeof minted === "bigint" ? Number(minted) : 0)
        } catch {
          setTotalMinted(0)
        }

        try {
          const supply = await publicClient.readContract({
            address: FUNCASTER_ADDRESS,
            abi: NFT_ABI,
            functionName: "MAX_SUPPLY",
            args: [],
          })
          setMaxSupply(typeof supply === "bigint" ? Number(supply) : 10000)
        } catch {
          setMaxSupply(10000)
        }

        try {
          const price = await publicClient.readContract({
            address: FUNCASTER_ADDRESS,
            abi: NFT_ABI,
            functionName: "MINT_PRICE",
            args: [],
          })
          setMintPrice(typeof price === "bigint" ? price : null)
        } catch {
          setMintPrice(parseEther("0.00025"))
        }

        if (holderStatus) {
          toast({
            title: "Eligible!",
            description: "You can mint the Funcaster NFT now.",
          })
        } else {
          toast({
            title: "Not Eligible",
            description: "You need to hold a Warplets NFT to mint Funcaster.",
            variant: "destructive",
          })
        }

        setEligibilityLoading(false)
      } catch (error) {
        console.error("[v0] Eligibility check error:", error)
        toast({
          title: "Error",
          description: "Failed to check eligibility. Please try again.",
          variant: "destructive",
        })
        setEligibilityLoading(false)
      }
    }

    checkEligibility()
  }, [validAddress, toast])

  const handleMint = async () => {
    if (!isHolder || !validAddress || isMinting) return

    try {
      setIsMinting(true)
      toast({
        title: "Minting Started",
        description: "Fetching your Warplets FID...",
      })

      // Get user's Warplets FID
      let warpletsFID: bigint
      try {
        const warpletsBalance = await publicClient.readContract({
          address: WARPLETS_ADDRESS,
          abi: NFT_ABI,
          functionName: "balanceOf",
          args: [validAddress],
        }) as unknown as bigint

        if (warpletsBalance === BigInt(0)) {
          throw new Error("You don't own any Warplets NFT")
        }

        warpletsFID = (await publicClient.readContract({
          address: WARPLETS_ADDRESS,
          abi: NFT_ABI,
          functionName: "tokenOfOwnerByIndex",
          args: [validAddress, BigInt(0)],
        })) as unknown as bigint

        console.log("Using Warplets FID:", warpletsFID.toString())
      } catch (error) {
        setIsMinting(false)
        toast({
          title: "Error",
          description: "Failed to fetch your Warplets FID. Please try again.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Minting Started",
        description: "Check your Farcaster wallet to confirm the transaction...",
      })

      const data = encodeFunctionData({
        abi: NFT_ABI as any[],
        functionName: "claimFuncaster",
        args: [warpletsFID],
      })

      let prevTotal: bigint | null = null
      try {
        const t = await publicClient.readContract({
          address: FUNCASTER_ADDRESS,
          abi: NFT_ABI,
          functionName: "totalMinted",
          args: [],
        })
        prevTotal = typeof t === "bigint" ? t : BigInt(Number(t))
      } catch (e) {
        prevTotal = null
      }

      sendTransaction(
        {
          to: FUNCASTER_ADDRESS,
          data: data as `0x${string}`,
          value: mintPrice || parseEther("0.00025"),
        },
        {
          onSuccess: async (hash) => {
            toast({
              title: "Success!",
              description: `Your Funcaster NFT is being minted! TX: ${hash.slice(0, 10)}...`,
            })

            setMintedTxHash(hash)
            setIsResolving(true)
            setResolveError(null)

            try {
              const receipt = await publicClient.waitForTransactionReceipt({ hash })
              if ((receipt as any).status) {
                let decodedTokenId: string | null = null
                let decodedAssetId: string | null = null
                for (const log of (receipt as any).logs ?? []) {
                  try {
                    const d = decodeEventLog({ abi: NFT_ABI as any[], data: log.data, topics: log.topics }) as any
                    if (d && (d as any).eventName === "FuncasterClaimed") {
                      const args = (d as any).args ?? (d as any).values ?? d
                      if (args && args.tokenId != null) {
                        decodedTokenId = String(args.tokenId)
                      }
                      if (args && args.assetID != null) {
                        decodedAssetId = String(args.assetID)
                      }
                      break
                    }
                  } catch {
                    // ignore
                  }
                }

                let finalTokenId: string | null = null
                if (decodedTokenId) {
                  finalTokenId = decodedTokenId
                } else {
                  try {
                    const t2 = await publicClient.readContract({
                      address: FUNCASTER_ADDRESS,
                      abi: NFT_ABI,
                      functionName: "totalMinted",
                      args: [],
                    })
                    const newTotal = typeof t2 === "bigint" ? t2 : BigInt(Number(t2))
                    if (newTotal) finalTokenId = newTotal.toString()
                  } catch (e) {
                    // last resort: use prevTotal + 1
                    if (prevTotal !== null) {
                      finalTokenId = (prevTotal + BigInt(1)).toString()
                    }
                  }
                }

                if (finalTokenId) {
                  setMintedTokenId(finalTokenId)
                  setMintingComplete(true)
                  setShowSuccessModal(true)

                  try {
                    if (decodedAssetId) {
                      const img = `${IMAGES_BASE}${decodedAssetId}.jpeg`
                      setMintedImageUrl(img)
                    }

                    const tokenUriRes = await publicClient.readContract({
                      address: FUNCASTER_ADDRESS,
                      abi: NFT_ABI,
                      functionName: "tokenURI",
                      args: [BigInt(finalTokenId)],
                    })
                    const tokenUri = typeof tokenUriRes === "string" ? tokenUriRes : String(tokenUriRes)
                    if (tokenUri) {
                      try {
                        const metaUrl = tokenUri.startsWith("ipfs://") ? ipfsToGateway(tokenUri) || tokenUri : tokenUri
                        const metaResp = await fetch(metaUrl)
                        if (metaResp.ok) {
                          const meta = await metaResp.json()
                          const img = ipfsToGateway(meta.image) || meta.image
                          if (img) setMintedImageUrl(img)
                        } else {
                          const fallback = await resolveImageForToken(finalTokenId)
                          if (fallback) setMintedImageUrl(fallback)
                        }
                      } catch (e) {
                        const fallback = await resolveImageForToken(finalTokenId)
                        if (fallback) setMintedImageUrl(fallback)
                      }
                    }
                  } catch (e) {
                    const fallback = await resolveImageForToken(finalTokenId)
                    if (fallback) setMintedImageUrl(fallback)
                  }
                }
              }
            } catch (err) {
              let tokenIdFallback = "unknown"
              if (prevTotal !== null) {
                tokenIdFallback = (prevTotal + BigInt(1)).toString()
              }
              
              setMintedTokenId(tokenIdFallback)
              setMintingComplete(true)
              setShowSuccessModal(true)
              
              if (tokenIdFallback !== "unknown") {
                resolveImageForToken(tokenIdFallback).then((url) => {
                  if (url) setMintedImageUrl(url)
                })
              }
              
              setResolveError("Could not confirm token ID from receipt. Please check Basescan.")
              console.warn("Could not confirm receipt, using fallback token id", err)
            } finally {
              setIsResolving(false)
            }

            setIsMinting(false)
          },
          onError: (error) => {
            setIsMinting(false)
            toast({
              title: "Minting Error",
              description: error.message || "Failed to mint NFT. Please try again.",
              variant: "destructive",
            })
          },
        },
      )
    } catch (error) {
      setIsMinting(false)
      console.error("[v0] Mint error:", error)
      toast({
        title: "Minting Error",
        description: error instanceof Error ? error.message : "Failed to mint NFT. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleShareToCast = () => {
      const miniAppUrl = "https://farcaster.xyz/miniapps/6fh_i3HvDXkG/the-funcaster";
      
      let rawCastText = `🎉 I just minted Funcaster NFT #${mintedTokenId || 'unknown'}!\n`;
      rawCastText += `Check out The Funcaster Mini App here: ${miniAppUrl}\n`;
      
      if (mintedImageUrl) {
          rawCastText += `\n ${mintedImageUrl}`; 
      } else {
          rawCastText += `%23TheFuncaster %23Funcaster`;
      }

      const castText = encodeURIComponent(rawCastText);
      const castShareUrl = `https://warpcast.com/~/compose?text=${castText}&embeds[]=${miniAppUrl}`;
      window.open(castShareUrl, "_blank");
  };

  const handleViewOnOpensea = () => {
    if (!mintedTokenId) return
    window.open(`https://opensea.io/assets/base/${FUNCASTER_ADDRESS}/${mintedTokenId}`, "_blank")
  }

  const handleViewOnBasescan = () => {
    if (!mintedTxHash) return
    window.open(`https://basescan.org/tx/${mintedTxHash}`, "_blank")
  }

  const currentImageId = loopOrder[currentImageIndex]
  const currentImageUrl = `${IMAGES_BASE}${currentImageId}.jpeg`
  const remainingSupply = maxSupply - totalMinted
  const mintProgress = maxSupply > 0 ? (totalMinted / maxSupply) * 100 : 0

  return (
    <div>
      {/* Success Modal - Improved */}
      <AlertDialog open={showSuccessModal} onOpenChange={(open) => { if (!open) setShowSuccessModal(false) }}>
        <AlertDialogContent className="sm:max-w-[480px] p-0 overflow-hidden">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-6 text-white">
            <div className="flex items-center justify-center mb-3">
              <div className="bg-white/20 p-3 rounded-full">
                <CheckCircle2 className="w-8 h-8" />
              </div>
            </div>
            <AlertDialogTitle className="text-center text-2xl font-bold">
              Minting Successful!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-emerald-50 mt-2">
              Your Funcaster NFT has been minted successfully
            </AlertDialogDescription>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* NFT Preview */}
            {mintedImageUrl && !isResolving && (
              <div className="relative rounded-xl overflow-hidden border-2 border-slate-200">
                <img
                  src={mintedImageUrl}
                  alt="Minted NFT"
                  className="w-full aspect-square object-cover"
                />
              </div>
            )}

            {/* Token Info */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              {mintedTokenId && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Token ID</span>
                  <span className="font-mono font-semibold text-slate-900">#{mintedTokenId}</span>
                </div>
              )}
              {mintedTxHash && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Transaction</span>
                  <button
                    onClick={handleViewOnBasescan}
                    className="flex items-center gap-1 text-sm font-mono text-blue-600 hover:text-blue-700"
                  >
                    {mintedTxHash.slice(0, 6)}...{mintedTxHash.slice(-4)}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {isResolving && (
              <div className="flex items-center justify-center py-6 text-slate-600">
                <Spinner className="w-5 h-5 mr-2" />
                <span className="text-sm">Loading NFT metadata...</span>
              </div>
            )}

            {resolveError && (
              <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
                {resolveError}
              </div>
            )}
          </div>

          {/* Actions */}
          <AlertDialogFooter className="p-6 pt-0 flex-col sm:flex-col gap-2">
            <Button
              onClick={handleShareToCast}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-5 text-base"
              disabled={isResolving}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share on farcaster
            </Button>
            <Button
              onClick={handleViewOnOpensea}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-5 text-base"
              disabled={isResolving}
            >
              <Eye className="w-4 h-4 mr-2" />
              View on OpenSea
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main Card */}
      <Card className="bg-white border-0 overflow-hidden shadow-xl">
        <div className="p-8 space-y-6">
          {/* NFT Preview */}
          <div className="aspect-square w-full bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center overflow-hidden relative">
            {(mintingComplete && mintedTokenId) || alreadyOwnsNFT ? (
              <div className="relative w-full h-full">
                {isResolving ? (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <Spinner className="w-10 h-10 text-slate-700 mb-3" />
                    <p className="text-sm text-slate-600">Loading your NFT...</p>
                  </div>
                ) : (
                  <>
                    <img
                      src={mintedImageUrl ?? `https://thfncstr.vercel.app/api/image/${mintedTokenId}`}
                      alt="Your Funcaster NFT"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                    <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                      <Button 
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg backdrop-blur-sm" 
                        onClick={handleShareToCast}
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Share
                      </Button>
                      <Button 
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg backdrop-blur-sm" 
                        onClick={handleViewOnOpensea}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        OpenSea
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <img 
                src={currentImageUrl} 
                alt="Funcaster NFT Preview" 
                className="w-full h-full object-cover transition-opacity duration-75" 
              />
            )}
          </div>

          {/* Title & Status */}
          <div className="space-y-4">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">The Funcaster</h2>
              <p className="text-slate-600 text-sm mt-1">Exclusive NFT Collection on Base</p>
            </div>

            {/* Status Badge */}
            {alreadyOwnsNFT ? (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900">
                    You own NFT #{mintedTokenId}
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Already minted • View your NFT below
                  </p>
                </div>
              </div>
            ) : eligibilityLoading ? (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <Spinner className="w-4 h-4 text-slate-600" />
                <p className="text-sm text-slate-600">Checking eligibility...</p>
              </div>
            ) : (
              <div className={`flex items-center gap-3 border rounded-xl p-4 ${
                isHolder 
                  ? "bg-emerald-50 border-emerald-200" 
                  : "bg-red-50 border-red-200"
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full ${isHolder ? "bg-emerald-500" : "bg-red-500"}`}></div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${isHolder ? "text-emerald-900" : "text-red-900"}`}>
                    {isHolder ? "Eligible to Mint" : "Not Eligible"}
                  </p>
                  <p className={`text-xs mt-0.5 ${isHolder ? "text-emerald-700" : "text-red-700"}`}>
                    {isHolder 
                      ? "You hold a Warplets NFT • Ready to mint" 
                      : "Warplets NFT required to mint"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Supply & Price Info */}
          {!alreadyOwnsNFT && (
            <>
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-5 space-y-4 border border-slate-200">
                {/* Supply Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">Supply</span>
                    <span className="text-sm font-bold text-slate-900">
                      {totalMinted.toLocaleString()} / {maxSupply.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-500 rounded-full"
                      style={{ width: `${mintProgress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span>{remainingSupply.toLocaleString()} remaining</span>
                    <span>{mintProgress.toFixed(1)}% minted</span>
                  </div>
                </div>

                <div className="h-px bg-slate-200"></div>

                {/* Price Info */}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Mint Price</span>
                  <span className="text-lg font-bold text-slate-900">
                    {mintPrice ? (Number(mintPrice) / 1e18).toFixed(5) : "—"} ETH
                  </span>
                </div>
              </div>

              {/* Mint Button */}
              <Button
                onClick={handleMint}
                disabled={!isHolder || isMinting || eligibilityLoading}
                className={`w-full py-7 text-lg font-bold rounded-xl transition-all duration-200 shadow-lg ${
                  isHolder && !isMinting
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
                    : "bg-slate-200 text-slate-500 cursor-not-allowed"
                }`}
              >
                {eligibilityLoading
                  ? "Verifying Eligibility..."
                  : isMinting
                    ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner className="w-5 h-5" />
                        Minting in Progress...
                      </span>
                    )
                    : !isHolder
                      ? "Not Eligible to Mint"
                      : "Mint Funcaster NFT"}
              </Button>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Minting Requirements</h4>
                <ul className="space-y-1.5 text-xs text-blue-800">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>Must hold a Warplets NFT to be eligible</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>Each Warplets FID can only mint once</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>Transaction processed via Farcaster wallet on Base</span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}