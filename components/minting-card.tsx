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
  const [mintedAssetId, setMintedAssetId] = useState<string | null>(null)
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

  const getAssetIdFromTokenId = async (tokenId: string): Promise<string | null> => {
    try {
      console.log(`[getAssetIdFromTokenId] Getting assetID for tokenId: ${tokenId}`)
      const result = await publicClient.readContract({
        address: FUNCASTER_ADDRESS,
        abi: NFT_ABI,
        functionName: "assetIDLookup",
        args: [BigInt(tokenId)],
      })
      
      const assetId = typeof result === 'bigint' ? result : BigInt(String(result))
      const assetIdStr = assetId.toString()
      console.log(`[getAssetIdFromTokenId] TokenId ${tokenId} → AssetId ${assetIdStr}`)
      return assetIdStr
    } catch (error) {
      console.error(`[getAssetIdFromTokenId] Error getting assetId for tokenId ${tokenId}:`, error)
      return null
    }
  }

  const resolveImageForAsset = async (assetId: string): Promise<string | null> => {
    console.log(`[resolveImageForAsset] Resolving image for assetId: ${assetId}`)
    
    const candidates = [
      `${IMAGES_BASE}${assetId}.jpeg`,
      `${IMAGES_BASE}${assetId}.jpg`,
      `${IMAGES_BASE}${assetId}.png`,
      `${IMAGES_BASE}${assetId}.webp`,
      `${IMAGES_BASE}${assetId}`,
    ]
    
    for (const imageUrl of candidates) {
      try {
        const response = await fetch(imageUrl, { method: "HEAD" })
        if (response.ok) {
          console.log(`[resolveImageForAsset] Found image: ${imageUrl}`)
          return imageUrl
        }
      } catch (error) {
      }
    }
    
    console.warn(`[resolveImageForAsset] No image found for assetId: ${assetId}`)
    return null
  }

  const resolveImageForToken = async (tokenId: string): Promise<string | null> => {
    console.log(`[resolveImageForToken] Resolving image for tokenId: ${tokenId}`)
    
    const assetId = await getAssetIdFromTokenId(tokenId)
    if (assetId) {
      const imageUrl = await resolveImageForAsset(assetId)
      if (imageUrl) return imageUrl
    }

    const metadataCandidates = [
      `${METADATA_BASE}${tokenId}.json`,
      `${METADATA_BASE}${tokenId}`,
    ]
    
    for (const url of metadataCandidates) {
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const json = await res.json()
        if (json?.image) {
          const imageUrl = ipfsToGateway(json.image) || json.image
          console.log(`[resolveImageForToken] Found image from metadata: ${imageUrl}`)
          return imageUrl
        }
      } catch (e) {
      }
    }

    console.warn(`[resolveImageForToken] No image found for tokenId: ${tokenId}`)
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
          console.log("[checkEligibility] User already owns Funcaster NFT")
          try {
            const tokenId = (await publicClient.readContract({
              address: FUNCASTER_ADDRESS,
              abi: NFT_ABI,
              functionName: "tokenOfOwnerByIndex",
              args: [validAddress, BigInt(0)],
            })) as unknown as bigint

            const tokenIdStr = tokenId.toString()
            console.log(`[checkEligibility] Existing tokenId: ${tokenIdStr}`)
            
            setExistingTokenId(tokenIdStr)
            setMintedTokenId(tokenIdStr)
            setAlreadyOwnsNFT(true)
            setMintingComplete(true)

            setIsResolving(true)
            
            const assetId = await getAssetIdFromTokenId(tokenIdStr)
            if (assetId) {
              console.log(`[checkEligibility] Found assetId: ${assetId}`)
              setMintedAssetId(assetId)
              const imageUrl = await resolveImageForAsset(assetId)
              if (imageUrl) {
                console.log(`[checkEligibility] Setting image: ${imageUrl}`)
                setMintedImageUrl(imageUrl)
              } else {
                console.warn("[checkEligibility] Could not resolve image for assetId")
              }
            } else {
              console.warn("[checkEligibility] Could not get assetId, trying fallback")
              const imageUrl = await resolveImageForToken(tokenIdStr)
              if (imageUrl) {
                setMintedImageUrl(imageUrl)
              }
            }
            
            setIsResolving(false)

            toast({
              title: "NFT Found!",
              description: `You already own Funcaster NFT #${tokenIdStr}${assetId ? ` (Asset #${assetId})` : ''}`,
            })
          } catch (error) {
            console.error("[checkEligibility] Error fetching existing NFT:", error)
            setIsResolving(false)
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
        console.log(`[checkEligibility] Warplets holder status: ${holderStatus}`)

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
        console.error("[checkEligibility] Eligibility check error:", error)
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
      console.log("[handleMint] Starting mint process")
      
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

        console.log(`[handleMint] Using Warplets FID: ${warpletsFID.toString()}`)
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

      sendTransaction(
        {
          to: FUNCASTER_ADDRESS,
          data: data as `0x${string}`,
          value: mintPrice || parseEther("0.00025"),
        },
        {
          onSuccess: async (hash) => {
            console.log(`[handleMint] Transaction sent: ${hash}`)
            toast({
              title: "Success!",
              description: `Your Funcaster NFT is being minted! TX: ${hash.slice(0, 10)}...`,
            })

            setMintedTxHash(hash)
            setIsResolving(true)
            setResolveError(null)

            try {
              console.log("[handleMint] Waiting for transaction receipt...")
              const receipt = await publicClient.waitForTransactionReceipt({ hash })
              
              if ((receipt as any).status) {
                console.log("[handleMint] Transaction confirmed!")
                
                let decodedTokenId: string | null = null
                let decodedAssetId: string | null = null
                
                for (const log of (receipt as any).logs ?? []) {
                  try {
                    const d = decodeEventLog({ 
                      abi: NFT_ABI as any[], 
                      data: log.data, 
                      topics: log.topics 
                    }) as any
                    
                    if (d && (d as any).eventName === "FuncasterClaimed") {
                      const args = (d as any).args ?? (d as any).values ?? d
                      
                      if (args && args.tokenId != null) {
                        decodedTokenId = String(args.tokenId)
                        console.log(`[handleMint] Decoded tokenId from event: ${decodedTokenId}`)
                      }
                      
                      if (args && args.assetID != null) {
                        decodedAssetId = String(args.assetID)
                        console.log(`[handleMint] Decoded assetID from event: ${decodedAssetId}`)
                      }
                      
                      break
                    }
                  } catch (err) {
                    console.error("[handleMint] Error decoding log:", err)
                  }
                }

                if (decodedTokenId) {
                  console.log(`[handleMint] Setting minted token ID: ${decodedTokenId}`)
                  setMintedTokenId(decodedTokenId)
                  setMintingComplete(true)
                  setShowSuccessModal(true)

                  let finalAssetId = decodedAssetId
                  
                  if (!finalAssetId) {
                    console.log("[handleMint] AssetID not in event, fetching from contract...")
                    finalAssetId = await getAssetIdFromTokenId(decodedTokenId)
                  }

                  if (finalAssetId) {
                    console.log(`[handleMint] Using assetID: ${finalAssetId}`)
                    setMintedAssetId(finalAssetId)
                    
                    const imageUrl = await resolveImageForAsset(finalAssetId)
                    if (imageUrl) {
                      console.log(`[handleMint] Setting minted image: ${imageUrl}`)
                      setMintedImageUrl(imageUrl)
                    } else {
                      console.warn("[handleMint] Could not resolve image for assetID")
                      setResolveError("Image not found for this NFT")
                    }
                  } else {
                    console.error("[handleMint] Could not get assetID!")
                    setResolveError("Could not determine NFT asset ID")
                  }
                } else {
                  console.warn("[handleMint] Could not decode tokenId from event")
                  setResolveError("Could not confirm token ID from transaction")
                }
              } else {
                console.error("[handleMint] Transaction failed")
                toast({
                  title: "Transaction Failed",
                  description: "The minting transaction was reverted.",
                  variant: "destructive",
                })
              }
            } catch (err) {
              console.error("[handleMint] Error waiting for receipt:", err)
              setResolveError("Could not confirm transaction. Please check Basescan.")
            } finally {
              setIsResolving(false)
              setIsMinting(false)
            }
          },
          onError: (error) => {
            console.error("[handleMint] Transaction error:", error)
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
      console.error("[handleMint] Mint error:", error)
      toast({
        title: "Minting Error",
        description: error instanceof Error ? error.message : "Failed to mint NFT. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleShareToCast = () => {
    const miniAppUrl = "https://farcaster.xyz/miniapps/6fh_i3HvDXkG/the-funcaster";
    
    const displayId = mintedAssetId ? `Asset #${mintedAssetId}` : `#${mintedTokenId || 'unknown'}`
    const castText = `🎉 I just minted Funcaster NFT ${displayId}!\n\nCheck out The Funcaster Mini App:`;
    const encodedText = encodeURIComponent(castText);
    
    const embeds: string[] = [];
    embeds.push(encodeURIComponent(miniAppUrl));
    
    if (mintedImageUrl) {
      embeds.push(encodeURIComponent(mintedImageUrl));
    }
    
    const embedParams = embeds.map(e => `embeds[]=${e}`).join('&');
    const castShareUrl = `https://warpcast.com/~/compose?text=${encodedText}&${embedParams}`;
    
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
      {/* Success Modal */}
      <AlertDialog open={showSuccessModal} onOpenChange={(open) => { if (!open) setShowSuccessModal(false) }}>
        <AlertDialogContent className="sm:max-w-[480px] p-0 overflow-hidden">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iYSIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVHJhbnNmb3JtPSJyb3RhdGUoNDUpIj48cGF0aCBkPSJNLTEwIDMwaDYwdjJoLTYweiIgZmlsbD0iI2ZmZiIgZmlsbC1vcGFjaXR5PSIuMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNhKSIvPjwvc3ZnPg==')] opacity-20"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-center mb-4">
                <div className="bg-white/20 backdrop-blur-sm p-3 rounded-full">
                  <CheckCircle2 className="w-12 h-12 text-white" />
                </div>
              </div>
              <AlertDialogTitle className="text-2xl font-bold text-white text-center">
                Minting Successful! 🎉
              </AlertDialogTitle>
              <AlertDialogDescription className="text-emerald-50 text-center mt-2 text-sm">
                Your Funcaster NFT #{mintedTokenId}{mintedAssetId && ` (Asset #${mintedAssetId})`} has been minted
              </AlertDialogDescription>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* NFT Preview */}
            <div className="relative aspect-square w-full bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl overflow-hidden shadow-lg">
              {isResolving ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Spinner className="w-10 h-10 text-emerald-600 mb-3" />
                  <p className="text-sm text-slate-600 font-medium">Loading your NFT...</p>
                </div>
              ) : mintedImageUrl ? (
                <img
                  src={mintedImageUrl}
                  alt="Your Funcaster NFT"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <p className="text-sm text-slate-600 font-medium">NFT #{mintedTokenId}</p>
                    {mintedAssetId && (
                      <p className="text-xs text-emerald-600 font-bold">Asset #{mintedAssetId}</p>
                    )}
                    {resolveError && (
                      <p className="text-xs text-amber-600 mt-2 max-w-[200px] mx-auto">{resolveError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Transaction Info */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Token ID</span>
                <span className="text-sm font-mono font-bold text-slate-900">#{mintedTokenId}</span>
              </div>
              
              {mintedAssetId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Asset ID</span>
                  <span className="text-sm font-mono font-bold text-emerald-600">#{mintedAssetId}</span>
                </div>
              )}
              
              {mintedTxHash && (
                <>
                  <div className="h-px bg-slate-200"></div>
                  <button
                    onClick={handleViewOnBasescan}
                    className="flex items-center justify-between w-full text-sm text-blue-600 hover:text-blue-700 transition-colors group"
                  >
                    <span className="font-medium">View Transaction</span>
                    <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <AlertDialogFooter className="p-6 pt-0 flex-col sm:flex-col gap-3">
            <Button
              onClick={handleShareToCast}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-5 text-base"
              disabled={isResolving}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share on Warpcast
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
                      src={mintedImageUrl ?? `https://thfncstr.vercel.app/api/image/${mintedAssetId || mintedTokenId}`}
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
                    You own NFT #{mintedTokenId}{mintedAssetId && ` (Asset #${mintedAssetId})`}
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Already minted • View your NFT on OpenSea
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
                      : "Mint Yours"}
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
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>Your NFT will be randomly assigned from 100 unique designs</span>
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