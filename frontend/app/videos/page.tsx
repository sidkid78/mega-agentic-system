"use client"

import { useState, useRef, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Loader2, Video, Download, Upload, X, Plus } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { apiKeyHeader } from "@/lib/api-key"

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoResult {
    videoBase64: string
    mimeType: string
}

interface ReferenceImageSlot {
    base64: string
    mimeType: string
    preview: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string; preview: string }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const dataUrl = reader.result as string
            const base64 = dataUrl.split(",")[1]
            resolve({ base64, mimeType: file.type, preview: dataUrl })
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

async function startGeneration(payload: Record<string, unknown>): Promise<string> {
    const res = await fetch("/api/videos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader() },
        body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to start generation")
    return data.operationName as string
}

async function pollOperation(operationName: string): Promise<VideoResult | null> {
    const res = await fetch(`/api/videos/poll?op=${encodeURIComponent(operationName)}`, {
        headers: { ...apiKeyHeader() },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Poll failed")
    if (!data.done) return null
    return { videoBase64: data.videoBase64, mimeType: data.mimeType }
}

// Gemini Omni Flash — background interaction + polling (serverless-friendly).
// startOmni kicks off a background job; pollOmni checks it until the video is ready.
async function startOmni(payload: Record<string, unknown>): Promise<string> {
    const res = await fetch("/api/videos/omni/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader() },
        body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to start Omni generation")
    return data.interactionId as string
}

async function pollOmni(
    id: string,
): Promise<(VideoResult & { interactionId: string }) | null> {
    const res = await fetch(`/api/videos/omni/poll?id=${encodeURIComponent(id)}`, {
        headers: { ...apiKeyHeader() },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Omni poll failed")
    if (!data.done) return null
    return {
        videoBase64: data.videoBase64,
        mimeType: data.mimeType,
        interactionId: data.interactionId ?? id,
    }
}

function downloadVideo(base64: string, mimeType: string, filename: string) {
    const byteStr = atob(base64)
    const arr = new Uint8Array(byteStr.length)
    for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)
    const blob = new Blob([arr], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ImageDropZone({
    label,
    value,
    onChange,
    accept = "image/*",
}: {
    label: string
    value: { base64: string; mimeType: string; preview: string } | null
    onChange: (v: { base64: string; mimeType: string; preview: string } | null) => void
    accept?: string
}) {
    const inputRef = useRef<HTMLInputElement>(null)

    const handleFile = useCallback(
        async (file: File) => {
            const result = await fileToBase64(file)
            onChange(result)
        },
        [onChange]
    )

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
        },
        [handleFile]
    )

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium">{label}</label>
            {value ? (
                <div className="relative rounded-lg overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50">
                    <img src={value.preview} alt="Uploaded" className="w-full h-32 object-cover" />
                    <button
                        onClick={() => onChange(null)}
                        className="absolute top-1 right-1 rounded-full bg-black/60 p-1 hover:bg-black/80 transition-colors"
                        title="Remove image"
                        aria-label="Remove image"
                    >
                        <X className="h-3 w-3 text-white" />
                    </button>
                </div>
            ) : (
                <div
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => inputRef.current?.click()}
                    className="flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-indigo-500/60 cursor-pointer transition-colors"
                >
                    <Upload className="h-6 w-6 text-zinc-400 mb-2" />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Click or drag &amp; drop
                    </p>
                </div>
            )}
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) await handleFile(file)
                }}
            />
        </div>
    )
}

function VideoDropZone({
    label,
    value,
    onChange,
}: {
    label: string
    value: { base64: string; mimeType: string } | null
    onChange: (v: { base64: string; mimeType: string } | null) => void
}) {
    const inputRef = useRef<HTMLInputElement>(null)

    const handleFile = useCallback(
        async (file: File) => {
            const reader = new FileReader()
            reader.onload = () => {
                const dataUrl = reader.result as string
                const base64 = dataUrl.split(",")[1]
                onChange({ base64, mimeType: file.type })
            }
            reader.readAsDataURL(file)
        },
        [onChange]
    )

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium">{label}</label>
            {value ? (
                <div className="flex items-center gap-3 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 p-3">
                    <Video className="h-6 w-6 text-indigo-500 shrink-0" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate flex-1">
                        Video loaded ({(value.base64.length * 0.75 / 1024 / 1024).toFixed(1)} MB)
                    </span>
                    <button
                        onClick={() => onChange(null)}
                        className="rounded-full bg-zinc-200 dark:bg-zinc-700 p-1 hover:bg-red-500/30 transition-colors"
                        title="Remove video"
                        aria-label="Remove video"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ) : (
                <div
                    onClick={() => inputRef.current?.click()}
                    className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-indigo-500/60 cursor-pointer transition-colors"
                >
                    <Upload className="h-6 w-6 text-zinc-400 mb-2" />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Upload a Veo-generated video (.mp4)
                    </p>
                </div>
            )}
            <input
                ref={inputRef}
                type="file"
                accept="video/mp4,video/*"
                className="hidden"
                onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (file) await handleFile(file)
                }}
            />
        </div>
    )
}

function VideoConfigPanel({
    model,
    onModelChange,
    aspectRatio,
    onAspectRatioChange,
    resolution,
    onResolutionChange,
    durationSeconds,
    onDurationChange,
}: {
    model: string
    onModelChange: (v: string) => void
    aspectRatio: string
    onAspectRatioChange: (v: string) => void
    resolution: string
    onResolutionChange: (v: string) => void
    durationSeconds: string
    onDurationChange: (v: string) => void
}) {
    const isLite = model.includes("lite")
    const resolutions = isLite ? ["720p", "1080p"] : ["720p", "1080p", "4k"]
    // 1080p and 4k only support 8s
    const durations =
        resolution === "1080p" || resolution === "4k" ? ["8"] : ["4", "6", "8"]

    return (
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <label className="text-sm font-medium">Model</label>
                <Select value={model} onValueChange={onModelChange}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="veo-3.1-generate-preview">Veo 3.1 (Best quality)</SelectItem>
                        <SelectItem value="veo-3.1-fast-generate-preview">Veo 3.1 Fast</SelectItem>
                        <SelectItem value="veo-3.1-lite-generate-preview">Veo 3.1 Lite</SelectItem>
                        <SelectItem value="veo-3.0-generate-001">Veo 3.0 (Stable)</SelectItem>
                        <SelectItem value="veo-3.0-fast-generate-001">Veo 3.0 Fast (Stable)</SelectItem>
                        <SelectItem value="veo-2.0-generate-001">Veo 2.0</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Aspect Ratio</label>
                <Select value={aspectRatio} onValueChange={onAspectRatioChange}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                        <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Resolution</label>
                <Select
                    value={resolution}
                    onValueChange={(v) => {
                        onResolutionChange(v)
                        if (v === "1080p" || v === "4k") onDurationChange("8")
                    }}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {resolutions.map((r) => (
                            <SelectItem key={r} value={r}>
                                {r.toUpperCase()}{r !== "720p" ? " (8s only)" : ""}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Duration</label>
                <Select value={durationSeconds} onValueChange={onDurationChange}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {durations.map((d) => (
                            <SelectItem key={d} value={d}>
                                {d} seconds
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
    )
}

function VideoOutput({
    result,
    isLoading,
    statusMsg,
    error,
    tabKey,
    latencyHint = "Veo 3.1 typically takes 30s–6 min",
}: {
    result: VideoResult | null
    isLoading: boolean
    statusMsg: string
    error: string | null
    tabKey: string
    latencyHint?: string
}) {
    const videoSrc = result
        ? `data:${result.mimeType};base64,${result.videoBase64}`
        : null

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Generated Video</CardTitle>
                <CardDescription>
                    {result ? "Video ready — click to play" : "Video will appear here"}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-xs">
                            {statusMsg}
                        </p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {latencyHint}
                        </p>
                    </div>
                )}

                {error && !isLoading && (
                    <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-4">
                        <p className="text-sm text-red-900 dark:text-red-100">{error}</p>
                    </div>
                )}

                {!isLoading && !error && !result && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <div className="w-16 h-16 rounded-full bg-linear-to-r from-indigo-500/20 to-emerald-500/20 border-2 border-dashed border-indigo-500/30 flex items-center justify-center">
                            <Video className="h-8 w-8 text-indigo-500" />
                        </div>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center max-w-xs">
                            Configure your settings and click Generate
                        </p>
                    </div>
                )}

                {videoSrc && !isLoading && (
                    <div className="space-y-3">
                        <video
                            key={`${tabKey}-${result?.videoBase64.slice(0, 20)}`}
                            src={videoSrc}
                            controls
                            autoPlay
                            loop
                            className="w-full rounded-lg border border-zinc-200/50 dark:border-zinc-800/50"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() =>
                                downloadVideo(result!.videoBase64, result!.mimeType, `veo-${tabKey}.mp4`)
                            }
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Download Video
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// ─── Polling hook ─────────────────────────────────────────────────────────────

function useVideoGeneration() {
    const [isLoading, setIsLoading] = useState(false)
    const [statusMsg, setStatusMsg] = useState("")
    const [result, setResult] = useState<VideoResult | null>(null)
    const [error, setError] = useState<string | null>(null)

    const generate = useCallback(async (payload: Record<string, unknown>) => {
        setIsLoading(true)
        setError(null)
        setResult(null)
        setStatusMsg("Submitting to Veo 3.1…")

        try {
            const operationName = await startGeneration(payload)
            setStatusMsg("Generation started — polling for completion…")

            let attempts = 0
            const maxAttempts = 72 // 72 × 10s = 12 min ceiling

            const poll = async (): Promise<void> => {
                if (attempts >= maxAttempts) {
                    throw new Error("Timed out waiting for video generation")
                }
                attempts++
                setStatusMsg(`Waiting… (${attempts * 10}s elapsed)`)

                const video = await pollOperation(operationName)
                if (video) {
                    setResult(video)
                    return
                }
                await new Promise((r) => setTimeout(r, 10000))
                return poll()
            }

            await poll()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Generation failed")
        } finally {
            setIsLoading(false)
            setStatusMsg("")
        }
    }, [])

    return { isLoading, statusMsg, result, error, generate }
}

// Omni is a single blocking request (no polling), and it threads an
// interactionId through so the result can be refined turn-by-turn.
function useOmniGeneration() {
    const [isLoading, setIsLoading] = useState(false)
    const [statusMsg, setStatusMsg] = useState("")
    const [result, setResult] = useState<VideoResult | null>(null)
    const [interactionId, setInteractionId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const generate = useCallback(async (payload: Record<string, unknown>) => {
        setIsLoading(true)
        setError(null)
        setResult(null)
        const hasVideo = Boolean(payload.video)
        const isRefine = Boolean(payload.previousInteractionId)
        setStatusMsg(
            isRefine
                ? "Submitting refinement to Omni…"
                : hasVideo
                  ? "Uploading source video & submitting to Omni…"
                  : "Submitting to Omni…",
        )

        try {
            const id = await startOmni(payload)
            setInteractionId(id)
            setStatusMsg("Generation started — polling for completion…")

            let attempts = 0
            const maxAttempts = 72 // 72 × 10s = 12 min ceiling

            const poll = async (): Promise<void> => {
                if (attempts >= maxAttempts) {
                    throw new Error("Timed out waiting for Omni video")
                }
                attempts++
                setStatusMsg(`Waiting… (${attempts * 10}s elapsed)`)

                const out = await pollOmni(id)
                if (out) {
                    setResult({ videoBase64: out.videoBase64, mimeType: out.mimeType })
                    setInteractionId(out.interactionId)
                    return
                }
                await new Promise((r) => setTimeout(r, 10000))
                return poll()
            }

            await poll()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Omni generation failed")
        } finally {
            setIsLoading(false)
            setStatusMsg("")
        }
    }, [])

    return { isLoading, statusMsg, result, interactionId, error, generate }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VideosPage() {
    const [activeTab, setActiveTab] = useState("text")

    // ── Text-to-video state
    const [txtPrompt, setTxtPrompt] = useState("")
    const [txtModel, setTxtModel] = useState("veo-3.1-generate-preview")
    const [txtAspect, setTxtAspect] = useState("16:9")
    const [txtRes, setTxtRes] = useState("720p")
    const [txtDur, setTxtDur] = useState("8")
    const txtGen = useVideoGeneration()

    // ── Image-to-video state
    const [img2vPrompt, setImg2vPrompt] = useState("")
    const [img2vImage, setImg2vImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
    const [img2vModel, setImg2vModel] = useState("veo-3.1-generate-preview")
    const [img2vAspect, setImg2vAspect] = useState("16:9")
    const [img2vRes, setImg2vRes] = useState("720p")
    const [img2vDur, setImg2vDur] = useState("8")
    const img2vGen = useVideoGeneration()

    // ── Reference images state
    const [refPrompt, setRefPrompt] = useState("")
    const [refImages, setRefImages] = useState<(ReferenceImageSlot | null)[]>([null, null, null])
    const [refModel, setRefModel] = useState("veo-3.1-generate-preview")
    const [refAspect, setRefAspect] = useState("16:9")
    const [refRes, setRefRes] = useState("720p")
    const [refDur, setRefDur] = useState("8")
    const refGen = useVideoGeneration()

    // ── Interpolation state
    const [interpPrompt, setInterpPrompt] = useState("")
    const [interpFirst, setInterpFirst] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
    const [interpLast, setInterpLast] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
    const [interpModel, setInterpModel] = useState("veo-3.1-generate-preview")
    const [interpAspect, setInterpAspect] = useState("16:9")
    const [interpRes, setInterpRes] = useState("720p")
    const interpGen = useVideoGeneration()

    // ── Extension state
    const [extPrompt, setExtPrompt] = useState("")
    const [extVideo, setExtVideo] = useState<{ base64: string; mimeType: string } | null>(null)
    const [extModel, setExtModel] = useState("veo-3.1-generate-preview")
    const [extAspect, setExtAspect] = useState("16:9")
    const extGen = useVideoGeneration()

    // ── Omni editing state (Gemini Omni Flash)
    const [omniPrompt, setOmniPrompt] = useState("")
    const [omniVideo, setOmniVideo] = useState<{ base64: string; mimeType: string } | null>(null)
    const [omniAspect, setOmniAspect] = useState("16:9")
    const [omniDuration, setOmniDuration] = useState("none")
    const [omniRefinePrompt, setOmniRefinePrompt] = useState("")
    const omniGen = useOmniGeneration()

    // ── Handlers ──

    const handleTextGen = () => {
        if (!txtPrompt.trim()) return
        txtGen.generate({
            prompt: txtPrompt,
            model: txtModel,
            aspectRatio: txtAspect,
            resolution: txtRes,
            durationSeconds: txtDur,
        })
    }

    const handleImg2v = () => {
        if (!img2vPrompt.trim() || !img2vImage) return
        img2vGen.generate({
            prompt: img2vPrompt,
            model: img2vModel,
            aspectRatio: img2vAspect,
            resolution: img2vRes,
            durationSeconds: img2vDur,
            imageBase64: img2vImage.base64,
            imageMimeType: img2vImage.mimeType,
        })
    }

    const handleRefGen = () => {
        const filled = refImages.filter((r) => r !== null) as ReferenceImageSlot[]
        if (!refPrompt.trim() || filled.length === 0) return
        refGen.generate({
            prompt: refPrompt,
            model: refModel,
            aspectRatio: refAspect,
            resolution: refRes,
            durationSeconds: refDur,
            referenceImages: filled.map((r) => ({
                imageBase64: r.base64,
                mimeType: r.mimeType,
            })),
        })
    }

    const handleInterp = () => {
        if (!interpFirst) return
        interpGen.generate({
            prompt: interpPrompt,
            model: interpModel,
            aspectRatio: interpAspect,
            resolution: interpRes,
            durationSeconds: "8", // interpolation requires 8s
            imageBase64: interpFirst.base64,
            imageMimeType: interpFirst.mimeType,
            ...(interpLast
                ? { lastFrameBase64: interpLast.base64, lastFrameMimeType: interpLast.mimeType }
                : {}),
        })
    }

    const handleExtend = () => {
        if (!extVideo) return
        extGen.generate({
            prompt: extPrompt,
            model: extModel,
            aspectRatio: extAspect,
            resolution: "720p", // extension is 720p only
            durationSeconds: "8",
            videoBase64: extVideo.base64,
            videoMimeType: extVideo.mimeType,
        })
    }

    const handleOmni = () => {
        if (!omniPrompt.trim()) return
        omniGen.generate({
            prompt: omniPrompt,
            aspectRatio: omniAspect,
            ...(omniDuration !== "none" ? { duration: omniDuration } : {}),
            ...(omniVideo ? { video: { base64: omniVideo.base64, mimeType: omniVideo.mimeType } } : {}),
        })
    }

    const handleOmniRefine = () => {
        if (!omniRefinePrompt.trim() || !omniGen.interactionId) return
        omniGen.generate({
            prompt: omniRefinePrompt,
            aspectRatio: omniAspect,
            ...(omniDuration !== "none" ? { duration: omniDuration } : {}),
            previousInteractionId: omniGen.interactionId,
        })
        setOmniRefinePrompt("")
    }

    const updateRefImage = (
        idx: number,
        val: { base64: string; mimeType: string; preview: string } | null
    ) => {
        setRefImages((prev) => {
            const next = [...prev]
            next[idx] = val
            return next
        })
    }

    return (
        <div className="relative min-h-screen overflow-hidden">
            <div className="mega-bg fixed inset-0" />

            <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
                            🎬 Video Generation
                        </h1>
                        <p className="text-lg text-zinc-700 dark:text-zinc-300">
                            Generate stunning 8-second HD videos with Veo 3.1
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                            <span className="px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/50 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                                ⚡ POWERED BY VEO 3.1
                            </span>
                            <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                🎵 NATIVE AUDIO
                            </span>
                            <span className="px-3 py-1 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/50 text-xs font-semibold text-fuchsia-600 dark:text-fuchsia-400">
                                ✨ OMNI EDITING
                            </span>
                        </div>
                    </div>
                    <ThemeToggle />
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
                        <TabsTrigger value="text">Text → Video</TabsTrigger>
                        <TabsTrigger value="image">Image → Video</TabsTrigger>
                        <TabsTrigger value="reference">Reference Images</TabsTrigger>
                        <TabsTrigger value="interpolation">Interpolation</TabsTrigger>
                        <TabsTrigger value="extend">Extend Video</TabsTrigger>
                        <TabsTrigger value="omni">Edit ✨ Omni</TabsTrigger>
                    </TabsList>

                    {/* ── Text-to-Video ── */}
                    <TabsContent value="text">
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Text to Video</CardTitle>
                                    <CardDescription>
                                        Describe a scene and Veo 3.1 will generate an 8-second video with native audio
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Prompt *</label>
                                        <Textarea
                                            placeholder={`A cinematic close-up of two astronauts floating in space, Earth reflecting in their visors. One whispers, "We made it." Ambient space soundtrack.`}
                                            value={txtPrompt}
                                            onChange={(e) => setTxtPrompt(e.target.value)}
                                            rows={5}
                                            className="resize-none"
                                        />
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                            Tip: Use quotes for dialogue, describe sounds and ambient noise for richer audio.
                                        </p>
                                    </div>

                                    <VideoConfigPanel
                                        model={txtModel}
                                        onModelChange={setTxtModel}
                                        aspectRatio={txtAspect}
                                        onAspectRatioChange={setTxtAspect}
                                        resolution={txtRes}
                                        onResolutionChange={setTxtRes}
                                        durationSeconds={txtDur}
                                        onDurationChange={setTxtDur}
                                    />

                                    <Button
                                        onClick={handleTextGen}
                                        disabled={txtGen.isLoading || !txtPrompt.trim()}
                                        className="w-full pulse-glow"
                                    >
                                        {txtGen.isLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Generating…
                                            </>
                                        ) : (
                                            <>
                                                <Video className="mr-2 h-4 w-4" />
                                                Generate Video
                                            </>
                                        )}
                                    </Button>

                                    {txtGen.error && (
                                        <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-4">
                                            <p className="text-sm text-red-900 dark:text-red-100">{txtGen.error}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <VideoOutput
                                result={txtGen.result}
                                isLoading={txtGen.isLoading}
                                statusMsg={txtGen.statusMsg}
                                error={txtGen.error}
                                tabKey="text"
                            />
                        </div>
                    </TabsContent>

                    {/* ── Image-to-Video ── */}
                    <TabsContent value="image">
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Image to Video</CardTitle>
                                    <CardDescription>
                                        Animate a starting image with a text prompt
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <ImageDropZone
                                        label="Starting Frame *"
                                        value={img2vImage}
                                        onChange={setImg2vImage}
                                    />

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Motion Prompt *</label>
                                        <Textarea
                                            placeholder="Describe how the scene should animate — camera motion, subject action, ambient sounds…"
                                            value={img2vPrompt}
                                            onChange={(e) => setImg2vPrompt(e.target.value)}
                                            rows={4}
                                            className="resize-none"
                                        />
                                    </div>

                                    <VideoConfigPanel
                                        model={img2vModel}
                                        onModelChange={setImg2vModel}
                                        aspectRatio={img2vAspect}
                                        onAspectRatioChange={setImg2vAspect}
                                        resolution={img2vRes}
                                        onResolutionChange={setImg2vRes}
                                        durationSeconds={img2vDur}
                                        onDurationChange={setImg2vDur}
                                    />

                                    <Button
                                        onClick={handleImg2v}
                                        disabled={img2vGen.isLoading || !img2vImage || !img2vPrompt.trim()}
                                        className="w-full pulse-glow"
                                    >
                                        {img2vGen.isLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Generating…
                                            </>
                                        ) : (
                                            <>
                                                <Video className="mr-2 h-4 w-4" />
                                                Animate Image
                                            </>
                                        )}
                                    </Button>

                                    {img2vGen.error && (
                                        <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-4">
                                            <p className="text-sm text-red-900 dark:text-red-100">{img2vGen.error}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <VideoOutput
                                result={img2vGen.result}
                                isLoading={img2vGen.isLoading}
                                statusMsg={img2vGen.statusMsg}
                                error={img2vGen.error}
                                tabKey="image"
                            />
                        </div>
                    </TabsContent>

                    {/* ── Reference Images ── */}
                    <TabsContent value="reference">
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Reference Images</CardTitle>
                                    <CardDescription>
                                        Provide up to 3 asset images — Veo preserves the subjects&apos; appearance in the output
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        {refImages.map((img, idx) => (
                                            <ImageDropZone
                                                key={idx}
                                                label={`Reference ${idx + 1}${idx === 0 ? " *" : ""}`}
                                                value={img}
                                                onChange={(v) => updateRefImage(idx, v)}
                                            />
                                        ))}
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Scene Prompt *</label>
                                        <Textarea
                                            placeholder="Describe what should happen in the video using the reference subjects…"
                                            value={refPrompt}
                                            onChange={(e) => setRefPrompt(e.target.value)}
                                            rows={4}
                                            className="resize-none"
                                        />
                                    </div>

                                    <VideoConfigPanel
                                        model={refModel}
                                        onModelChange={setRefModel}
                                        aspectRatio={refAspect}
                                        onAspectRatioChange={setRefAspect}
                                        resolution={refRes}
                                        onResolutionChange={setRefRes}
                                        durationSeconds={refDur}
                                        onDurationChange={setRefDur}
                                    />

                                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                                        <p className="text-xs text-amber-700 dark:text-amber-400">
                                            Veo 3.1 only — reference images require the duration to be 8s.
                                        </p>
                                    </div>

                                    <Button
                                        onClick={handleRefGen}
                                        disabled={
                                            refGen.isLoading ||
                                            !refPrompt.trim() ||
                                            refImages.every((r) => r === null)
                                        }
                                        className="w-full pulse-glow"
                                    >
                                        {refGen.isLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Generating…
                                            </>
                                        ) : (
                                            <>
                                                <Video className="mr-2 h-4 w-4" />
                                                Generate with References
                                            </>
                                        )}
                                    </Button>

                                    {refGen.error && (
                                        <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-4">
                                            <p className="text-sm text-red-900 dark:text-red-100">{refGen.error}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <VideoOutput
                                result={refGen.result}
                                isLoading={refGen.isLoading}
                                statusMsg={refGen.statusMsg}
                                error={refGen.error}
                                tabKey="reference"
                            />
                        </div>
                    </TabsContent>

                    {/* ── Interpolation ── */}
                    <TabsContent value="interpolation">
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>First &amp; Last Frame Interpolation</CardTitle>
                                    <CardDescription>
                                        Define the opening and closing frames — Veo generates the journey between them
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <ImageDropZone
                                            label="First Frame *"
                                            value={interpFirst}
                                            onChange={setInterpFirst}
                                        />
                                        <ImageDropZone
                                            label="Last Frame (optional)"
                                            value={interpLast}
                                            onChange={setInterpLast}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Scene Prompt (optional)</label>
                                        <Textarea
                                            placeholder="Describe the transition or leave blank to let Veo decide…"
                                            value={interpPrompt}
                                            onChange={(e) => setInterpPrompt(e.target.value)}
                                            rows={3}
                                            className="resize-none"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Model</label>
                                            <Select value={interpModel} onValueChange={setInterpModel}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="veo-3.1-generate-preview">Veo 3.1</SelectItem>
                                                    <SelectItem value="veo-3.1-fast-generate-preview">Veo 3.1 Fast</SelectItem>
                                                    <SelectItem value="veo-3.1-lite-generate-preview">Veo 3.1 Lite</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Aspect Ratio</label>
                                            <Select value={interpAspect} onValueChange={setInterpAspect}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                                                    <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Resolution</label>
                                            <Select value={interpRes} onValueChange={setInterpRes}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="720p">720p</SelectItem>
                                                    <SelectItem value="1080p">1080p</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Duration</label>
                                            <div className="flex h-10 items-center rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm text-zinc-500">
                                                8 seconds (fixed)
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        onClick={handleInterp}
                                        disabled={interpGen.isLoading || !interpFirst}
                                        className="w-full pulse-glow"
                                    >
                                        {interpGen.isLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Generating…
                                            </>
                                        ) : (
                                            <>
                                                <Video className="mr-2 h-4 w-4" />
                                                Generate Interpolation
                                            </>
                                        )}
                                    </Button>

                                    {interpGen.error && (
                                        <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-4">
                                            <p className="text-sm text-red-900 dark:text-red-100">{interpGen.error}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <VideoOutput
                                result={interpGen.result}
                                isLoading={interpGen.isLoading}
                                statusMsg={interpGen.statusMsg}
                                error={interpGen.error}
                                tabKey="interpolation"
                            />
                        </div>
                    </TabsContent>

                    {/* ── Video Extension ── */}
                    <TabsContent value="extend">
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Extend Video</CardTitle>
                                    <CardDescription>
                                        Continue a Veo-generated video by up to 7 seconds — up to 20 times total
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <VideoDropZone
                                        label="Veo-Generated Video *"
                                        value={extVideo}
                                        onChange={setExtVideo}
                                    />

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Extension Prompt (optional)</label>
                                        <Textarea
                                            placeholder="Describe what should happen next — continues from the last second of the input video…"
                                            value={extPrompt}
                                            onChange={(e) => setExtPrompt(e.target.value)}
                                            rows={4}
                                            className="resize-none"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Model</label>
                                            <Select value={extModel} onValueChange={setExtModel}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="veo-3.1-generate-preview">Veo 3.1</SelectItem>
                                                    <SelectItem value="veo-3.1-fast-generate-preview">Veo 3.1 Fast</SelectItem>
                                                    <SelectItem value="veo-3.0-generate-001">Veo 3.0 (Stable)</SelectItem>
                                                    <SelectItem value="veo-3.0-fast-generate-001">Veo 3.0 Fast</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Aspect Ratio</label>
                                            <Select value={extAspect} onValueChange={setExtAspect}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                                                    <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 space-y-1">
                                        <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                                            Extension requirements
                                        </p>
                                        <ul className="text-xs text-amber-700/80 dark:text-amber-400/80 space-y-0.5 list-disc list-inside">
                                            <li>Veo-generated videos only (not available for Veo 3.1 Lite)</li>
                                            <li>720p resolution, 141s or less, 16:9 or 9:16</li>
                                            <li>Video must have been generated or extended in the last 2 days</li>
                                        </ul>
                                    </div>

                                    <Button
                                        onClick={handleExtend}
                                        disabled={extGen.isLoading || !extVideo}
                                        className="w-full pulse-glow"
                                    >
                                        {extGen.isLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Extending…
                                            </>
                                        ) : (
                                            <>
                                                <Plus className="mr-2 h-4 w-4" />
                                                Extend Video
                                            </>
                                        )}
                                    </Button>

                                    {extGen.error && (
                                        <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-4">
                                            <p className="text-sm text-red-900 dark:text-red-100">{extGen.error}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <VideoOutput
                                result={extGen.result}
                                isLoading={extGen.isLoading}
                                statusMsg={extGen.statusMsg}
                                error={extGen.error}
                                tabKey="extend"
                            />
                        </div>
                    </TabsContent>

                    {/* ── Omni: Video Editing & Turn-by-Turn ── */}
                    <TabsContent value="omni">
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        Edit &amp; Refine
                                        <span className="px-2 py-0.5 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/50 text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-400">
                                            GEMINI OMNI FLASH
                                        </span>
                                    </CardTitle>
                                    <CardDescription>
                                        Restyle, inpaint, or rewrite a clip — then refine the result
                                        turn-by-turn. Leave the video empty to generate from text alone.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <VideoDropZone
                                        label="Source Video (optional — required for edits)"
                                        value={omniVideo}
                                        onChange={setOmniVideo}
                                    />

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">
                                            {omniVideo ? "Edit Instruction *" : "Prompt *"}
                                        </label>
                                        <Textarea
                                            placeholder={
                                                omniVideo
                                                    ? `Simple edits work best, e.g. "Make this video anime" or "Change the text on the sign to say Omni". Add "Keep everything else the same" to preserve the rest.`
                                                    : `A continuous, unbroken handheld shot of a tabby cat on a sunny windowsill. Gentle breeze, distant bird chirps. No dialogue.`
                                            }
                                            value={omniPrompt}
                                            onChange={(e) => setOmniPrompt(e.target.value)}
                                            rows={4}
                                            className="resize-none"
                                        />
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                            Omni renders on-screen text accurately and generates native
                                            audio. Describe the audio you want for best results.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Aspect Ratio</label>
                                            <Select value={omniAspect} onValueChange={setOmniAspect}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                                                    <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Duration</label>
                                            <Select value={omniDuration} onValueChange={setOmniDuration}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Auto (model decides)</SelectItem>
                                                    <SelectItem value="3">3 seconds</SelectItem>
                                                    <SelectItem value="5">5 seconds</SelectItem>
                                                    <SelectItem value="8">8 seconds</SelectItem>
                                                    <SelectItem value="10">10 seconds</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                                        <p className="text-xs text-amber-700 dark:text-amber-400">
                                            Uploading a video to edit is region-restricted — unavailable
                                            in the EEA, UK, Switzerland, and some US states. Source clips
                                            should be ≤10s at 720p / 24fps for best results.
                                        </p>
                                    </div>

                                    <Button
                                        onClick={handleOmni}
                                        disabled={omniGen.isLoading || !omniPrompt.trim()}
                                        className="w-full pulse-glow"
                                    >
                                        {omniGen.isLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Working…
                                            </>
                                        ) : (
                                            <>
                                                <Video className="mr-2 h-4 w-4" />
                                                {omniVideo ? "Edit Video" : "Generate Video"}
                                            </>
                                        )}
                                    </Button>

                                    {/* Turn-by-turn refinement — appears once we have a result */}
                                    {omniGen.interactionId && omniGen.result && (
                                        <div className="space-y-2 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-3">
                                            <label className="text-sm font-medium">
                                                Refine this result (turn-by-turn)
                                            </label>
                                            <Textarea
                                                placeholder={`e.g. "Change the setting to a snowy winter wonderland." — continues from the last result, no re-upload needed.`}
                                                value={omniRefinePrompt}
                                                onChange={(e) => setOmniRefinePrompt(e.target.value)}
                                                rows={2}
                                                className="resize-none"
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={handleOmniRefine}
                                                disabled={omniGen.isLoading || !omniRefinePrompt.trim()}
                                            >
                                                <Plus className="mr-2 h-4 w-4" />
                                                Refine
                                            </Button>
                                        </div>
                                    )}

                                    {omniGen.error && (
                                        <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-4">
                                            <p className="text-sm text-red-900 dark:text-red-100">{omniGen.error}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <VideoOutput
                                result={omniGen.result}
                                isLoading={omniGen.isLoading}
                                statusMsg={omniGen.statusMsg}
                                error={omniGen.error}
                                tabKey="omni"
                                latencyHint="Omni Flash typically takes 30s–3 min"
                            />
                        </div>
                    </TabsContent>
                </Tabs>

                {/* Info footer */}
                <div className="mt-8 rounded-xl glass-card border border-zinc-200/50 dark:border-zinc-800/50 p-6">
                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                        About Veo 3.1
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                        <div>
                            <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">Resolution</p>
                            <p>720p · 1080p · 4K</p>
                        </div>
                        <div>
                            <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">Duration</p>
                            <p>4s · 6s · 8s @ 24fps</p>
                        </div>
                        <div>
                            <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">Audio</p>
                            <p>Natively generated — dialogue, SFX, ambient</p>
                        </div>
                        <div>
                            <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">Latency</p>
                            <p>~30s – 6 min depending on load</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
