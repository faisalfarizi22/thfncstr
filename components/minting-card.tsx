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
} from "./ui/alert-dialog"
import { Spinner } from "./ui/spinner"

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
const LOOP_INTERVAL_MS = 150

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
      }
    }

    const exts = [".png", ".jpg", ".jpeg", ".webp", ""]
    for (const ext of exts) {
      const candidate = `${IMAGES_BASE}${tokenId}${ext}`
      try {
        const r = await fetch(candidate, { method: "HEAD" })
        if (r.ok) return candidate
      } catch {
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

        const balance = await publicClient.readContract({
          address: WARPLETS_ADDRESS,
          abi: NFT_ABI,
          functionName: "balanceOf",
          args: [validAddress],
        })

        const holderStatus = balance && typeof balance === "bigint" ? balance > BigInt(0) : false
        setIsHolder(holderStatus)

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
                    finalTokenId = hash.slice(2, 12)
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
      const liveAppUrl = "https://thfncstr.vercel.app/";
      
      if (!mintedTokenId) {
          const fallbackText = encodeURIComponent(
              `🎉 I just discovered The Funcaster! Time to Mint your favorite NFT. %23TheFuncaster`
          );
          window.open(`https://warpcast.com/~/compose?text=${fallbackText}&embeds[]=${liveAppUrl}`, "_blank");
          return;
      }

      const rawCastText = 
          `🎉 I just minted Funcaster NFT #${mintedTokenId}!\n` +
          `Check the link below to Mint yours.\n` +
          `%23TheFuncaster %23Funcaster`;

      const castText = encodeURIComponent(rawCastText);

      const castShareUrl = `https://warpcast.com/~/compose?text=${castText}&embeds[]=${liveAppUrl}`;

      window.open(castShareUrl, "_blank");
  };

  const handleViewOnOpensea = () => {
    if (!mintedTokenId) return
    window.open(`https://opensea.io/assets/base/${FUNCASTER_ADDRESS}/${mintedTokenId}`, "_blank")
  }

  const currentImageId = loopOrder[currentImageIndex]
  const currentImageUrl = `${IMAGES_BASE}${currentImageId}.jpeg`

  return (
    <div>
      <AlertDialog open={showSuccessModal} onOpenChange={(open) => { if (!open) setShowSuccessModal(false) }}>
        <AlertDialogContent className="sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-2xl">🎉 Minting Success!</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              Congratulations! Your Funcaster NFT has been successfully minted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-4 space-y-3">
            <div className="text-center text-sm text-slate-600">
              {mintedTokenId && (
                <div>Token ID: <span className="font-mono text-slate-800">{mintedTokenId}</span></div>
              )}
              {mintedTxHash && (
                <div>
                  TX: <a className="underline" target="_blank" rel="noreferrer" href={`https://base.blockscout.com/tx/${mintedTxHash}`}>{mintedTxHash.slice(0,10)}...</a>
                </div>
              )}
              {resolveError && (
                <div className="text-xs text-red-600 mt-2">Error resolving metadata: {resolveError}</div>
              )}
            </div>

            {isResolving ? (
              <div className="flex items-center justify-center py-4">
                <Spinner className="w-6 h-6 text-slate-700" />
                <span className="ml-2 text-sm text-slate-700">Resolving metadata...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white" onClick={handleShareToCast}>
                  Share to Cast
                </Button>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleViewOnOpensea}>
                  View on OpenSea
                </Button>
              </div>
            )}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="bg-white border-0 overflow-hidden shadow-lg">
        <div className="p-8 space-y-6">
          <div className="aspect-square w-full bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center overflow-hidden">
            {(mintingComplete && mintedTokenId) || alreadyOwnsNFT ? (
              <div className="relative w-full h-full">
                {isResolving ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Spinner className="w-8 h-8 text-slate-700" />
                  </div>
                ) : (
                  <>
                    <img
                      src={mintedImageUrl ?? `https://thfncstr.vercel.app/api/image/${mintedTokenId}`}
                      alt="Your Funcaster NFT"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                      <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={handleShareToCast}>
                        Share to Cast
                      </Button>
                      <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleViewOnOpensea}>
                        View on OpenSea
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <img 
                  src={currentImageUrl} 
                  alt={`Funcaster NFT Preview ${currentImageId}`} 
                  className="w-full h-full object-cover" 
                  crossOrigin="anonymous" 
              />
            )}
          </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900">The Funcaster</h2>

          {alreadyOwnsNFT ? (
            <div className="flex items-center space-x-3">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
              <span className="text-sm font-medium text-blue-700">
                You own NFT #{mintedTokenId}
              </span>
            </div>
          ) : eligibilityLoading ? (
            <div className="flex items-center space-x-3">
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-slate-600">Verifying eligibility...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <div className={`w-2.5 h-2.5 rounded-full ${isHolder ? "bg-emerald-500" : "bg-red-500"}`}></div>
              <span className={`text-sm font-medium ${isHolder ? "text-emerald-700" : "text-red-700"}`}>
                {isHolder ? "Eligible to Mint" : "Not Eligible"}
              </span>
            </div>
          )}
        </div>

        {!alreadyOwnsNFT && (
          <>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Mint Price</span>
                <span className="text-sm font-semibold text-slate-900">
                  {mintPrice ? (Number(mintPrice) / 1e18).toFixed(5) : "—"} ETH
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Status</span>
                <span className="text-sm font-semibold text-slate-900">
                  {eligibilityLoading ? "Checking..." : isHolder ? "Ready" : "Locked"}
                </span>
              </div>
            </div>

            <Button
              onClick={handleMint}
              disabled={!isHolder || isMinting || eligibilityLoading}
              className={`w-full py-6 text-base font-semibold rounded-lg transition-all duration-200 ${
                isHolder
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed"
              }`}
            >
              {eligibilityLoading
                ? "Verifying Eligibility..."
                : isMinting
                  ? "Minting in Progress..."
                  : !isHolder
                    ? "Not Eligible"
                    : "Mint Now"}
            </Button>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs text-blue-800 font-medium">
                Only Warplets NFT holders can mint Funcaster. This transaction will be processed through your Farcaster
                wallet on Base Mainnet.
              </p>
            </div>
          </>
        )}
      </div>
    </Card>
    </div>
  )
}