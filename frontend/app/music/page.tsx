"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiClient, type MusicImageInput } from "@/lib/api"
import { Loader2, Music, Play, Pause, Download, Mic2, Wand2, Radio, ImagePlus, X } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { MusicRealtimeStudio } from "@/components/music-realtime-studio"

type Model = "lyria-3-clip-preview" | "lyria-3-pro-preview"
type Tab = Model | "realtime"
type OutputFormat = "mp3" | "wav"

interface InspirationImage extends MusicImageInput {
  name: string
  preview: string
}

const MAX_IMAGES = 10

interface MusicResult {
  audioUrl: string
  mimeType: string
  lyrics: string
  modelUsed: string
  prompt: string
}

const EXAMPLE_PROMPTS: Record<Model, string[]> = {
  "lyria-3-clip-preview": [
    "A bright chiptune melody in C Major, retro 8-bit video game style. Instrumental only, no vocals.",
    "A 30-second cheerful acoustic folk song with guitar and harmonica.",
    "A 30-second lofi hip hop beat with dusty vinyl crackle, mellow Rhodes piano chords, and a slow boom-bap drum pattern at 85 BPM. Instrumental only.",
    "Dark ambient electronic music with deep bass drones, sparse high-frequency tones, and an eerie atmosphere. No vocals.",
  ],
  "lyria-3-pro-preview": [
    "An epic cinematic orchestral piece about a journey home. Starts with a solo piano intro, builds through sweeping strings, and climaxes with a massive wall of sound.",
    "An upbeat, feel-good pop song in G major at 120 BPM with bright acoustic guitar strumming, claps, and warm vocal harmonies about a summer road trip.",
    "A dark, atmospheric trap beat at 140 BPM with heavy 808 bass, eerie synth pads, sharp hi-hats, and a haunting vocal sample. In D minor. Create a 2-minute song.",
    "A melancholic jazz fusion track in D minor, featuring a smooth saxophone melody, walking bass line, and complex drum rhythms. Full length with a verse, chorus, and bridge.",
  ],
}

export default function MusicPage() {
  const [tab, setTab] = useState<Tab>("lyria-3-clip-preview")
  const [prompt, setPrompt] = useState("")
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("mp3")
  const [images, setImages] = useState<InspirationImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MusicResult | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const model: Model = tab === "realtime" ? "lyria-3-clip-preview" : tab

  const handleTabChange = (v: string) => {
    const next = v as Tab
    setTab(next)
    setPrompt("")
    setResult(null)
    setError(null)
    setImages([])
    if (next === "lyria-3-clip-preview") setOutputFormat("mp3")
  }

  const handleAddImages = async (files: FileList | null) => {
    if (!files) return
    const room = MAX_IMAGES - images.length
    const picked = Array.from(files).slice(0, room)
    const loaded = await Promise.all(
      picked.map(
        (file) =>
          new Promise<InspirationImage>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const dataUrl = reader.result as string
              resolve({
                name: file.name,
                preview: dataUrl,
                mime_type: file.type || "image/jpeg",
                data: dataUrl.split(",", 2)[1] ?? "",
              })
            }
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(file)
          }),
      ),
    )
    setImages((prev) => [...prev, ...loaded].slice(0, MAX_IMAGES))
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    setIsPlaying(false)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    try {
      const imagePayload: MusicImageInput[] | undefined =
        model === "lyria-3-pro-preview" && images.length > 0
          ? images.map(({ data, mime_type }) => ({ data, mime_type }))
          : undefined
      const res = await apiClient.generateMusic(prompt, model, outputFormat, imagePayload)
      const ext = res.mime_type.includes("wav") ? "wav" : "mp3"
      const blob = base64ToBlob(res.audio_base64, res.mime_type)
      const url = URL.createObjectURL(blob)
      setResult({
        audioUrl: url,
        mimeType: res.mime_type,
        lyrics: res.lyrics,
        modelUsed: res.model_used,
        prompt,
      })
      // Pre-load audio
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setIsPlaying(false)
      void ext
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Music generation failed")
    } finally {
      setLoading(false)
    }
  }

  const togglePlay = () => {
    if (!audioRef.current || !result) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      void audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const handleDownload = () => {
    if (!result) return
    const ext = result.mimeType.includes("wav") ? "wav" : "mp3"
    const a = document.createElement("a")
    a.href = result.audioUrl
    a.download = `lyria-${Date.now()}.${ext}`
    a.click()
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="mega-bg fixed inset-0" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
              Music Generation
            </h1>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">
              Powered by Lyria 3 — Google&apos;s AI music model
            </p>
          </div>
          <ThemeToggle />
        </div>

        <Tabs value={tab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="glass-card p-1.5 gap-1">
            <TabsTrigger value="lyria-3-clip-preview">
              <Music className="mr-2 h-4 w-4" />
              Lyria 3 Clip
              <span className="ml-2 text-xs font-normal opacity-60">30s</span>
            </TabsTrigger>
            <TabsTrigger value="lyria-3-pro-preview">
              <Wand2 className="mr-2 h-4 w-4" />
              Lyria 3 Pro
              <span className="ml-2 text-xs font-normal opacity-60">Full song</span>
            </TabsTrigger>
            <TabsTrigger value="realtime">
              <Radio className="mr-2 h-4 w-4" />
              RealTime
              <span className="ml-2 text-xs font-normal opacity-60">Live</span>
            </TabsTrigger>
          </TabsList>

          {tab === "realtime" && (
            <TabsContent value="realtime" forceMount className="mt-0">
              <MusicRealtimeStudio />
            </TabsContent>
          )}

          {tab !== "realtime" && (
          <>
          {/* Shared prompt card */}
          <Card>
            <CardHeader>
              <CardTitle>Prompt</CardTitle>
              <CardDescription>
                {model === "lyria-3-clip-preview"
                  ? "Describe a 30-second music clip. Be specific about genre, instruments, mood, and BPM."
                  : "Describe a full-length song. Include structure ([Verse], [Chorus], [Bridge]), tempo, key, and lyric themes."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="e.g. A bright chiptune melody in C Major, retro 8-bit video game style. Instrumental only."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                className="resize-none font-mono text-sm"
              />

              {/* Example prompts */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Example prompts:</p>
                <div className="flex flex-col gap-1.5">
                  {EXAMPLE_PROMPTS[model].map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(ex)}
                      className="text-left text-xs text-zinc-600 dark:text-zinc-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors line-clamp-2 bg-zinc-50 dark:bg-zinc-900/50 rounded-md px-3 py-2 border border-zinc-200/50 dark:border-zinc-800/50 hover:border-indigo-500/30"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* WAV option for Pro only */}
              {model === "lyria-3-pro-preview" && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Output format:</span>
                  <div className="flex gap-2">
                    {(["mp3", "wav"] as OutputFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setOutputFormat(fmt)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                          outputFormat === fmt
                            ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-600 dark:text-indigo-400"
                            : "border-zinc-200/50 dark:border-zinc-800/50 text-zinc-500 hover:border-indigo-500/30"
                        }`}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Inspiration images for Pro only */}
              {model === "lyria-3-pro-preview" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      Inspiration images <span className="text-xs text-zinc-400">(optional, up to {MAX_IMAGES})</span>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={images.length >= MAX_IMAGES}
                      className="gap-1.5 text-xs"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Add images
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      void handleAddImages(e.target.files)
                      e.target.value = ""
                    }}
                  />
                  {images.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {images.map((img, i) => (
                        <div key={i} className="relative group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.preview}
                            alt={img.name}
                            className="h-16 w-16 rounded-md object-cover border border-zinc-200/50 dark:border-zinc-800/50"
                          />
                          <button
                            type="button"
                            onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                            className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-white border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label={`Remove ${img.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="w-full pulse-glow"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Composing{model === "lyria-3-pro-preview" ? " (this may take a minute…)" : "…"}
                  </>
                ) : (
                  <>
                    <Music className="mr-2 h-4 w-4" />
                    Generate Music
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <Card className="border-red-500/30">
              <CardContent className="pt-6">
                <p className="text-sm text-red-500">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {result && (
            <TabsContent value={model} forceMount className="space-y-4 mt-0">
              {/* Audio player */}
              <Card className="border border-indigo-500/30 bg-indigo-500/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Music className="h-4 w-4 text-indigo-500" />
                      Generated Track
                      <span className="text-xs font-mono font-normal text-zinc-500 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-700/50">
                        {result.modelUsed}
                      </span>
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      className="gap-1.5 text-xs"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* HTML5 native player */}
                  <audio
                    controls
                    src={result.audioUrl}
                    className="w-full h-10"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />

                  {/* Play/pause button as fallback visual */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-500 hover:bg-indigo-400 transition-colors text-white shrink-0"
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                    </button>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 italic">
                      &ldquo;{result.prompt}&rdquo;
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Lyrics / structure */}
              {result.lyrics && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Mic2 className="h-4 w-4 text-emerald-500" />
                      Lyrics &amp; Structure
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans">
                      {result.lyrics}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}
          </>
          )}
        </Tabs>
      </div>
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}
