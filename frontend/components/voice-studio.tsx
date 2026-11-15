"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiClient, type TtsVoice, type VoiceLibraryFilters } from "@/lib/api"
import { base64ToBlob, startRecording, toWav24kMono } from "@/lib/wav-audio"
import {
  Check,
  Copy,
  Library,
  Loader2,
  Mic,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
  UserRound,
  Wand2,
  X,
} from "lucide-react"

// The statement the speaker must read in the consent recording (English).
// Other supported languages have their own wording: see /docs/voice-replication.
export const CONSENT_PHRASE_EN =
  "I am the owner of this voice and I consent to Google using this voice to create a synthetic voice model."

// Library previews synthesize a short line on the fast model.
const PREVIEW_MODEL = "gemini-3.8-flash-lite-tts"
const PREVIEW_LINE = "(natural, relaxed) Hello. This is a short sample of how I sound."

const GENDERS = [
  { value: "any", label: "Any gender" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "neutral", label: "Neutral" },
] as const

const PITCHES = [
  { value: "any", label: "Any pitch" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const

const LANGUAGES = [
  { value: "any", label: "Any language" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-AU", label: "English (AU)" },
  { value: "en-CA", label: "English (CA)" },
  { value: "en-IN", label: "English (IN)" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "es-ES", label: "Spanish (ES)" },
  { value: "es-US", label: "Spanish (US)" },
  { value: "it-IT", label: "Italian" },
  { value: "pt-BR", label: "Portuguese (BR)" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "hi-IN", label: "Hindi" },
  { value: "ar-EG", label: "Arabic (EG)" },
] as const

const TYPE_LABELS: Record<TtsVoice["type"], string> = {
  prebuilt: "Library",
  prompted: "Designed",
  replicated: "Replicated",
}

const orUndefined = (value: string) => (value && value !== "any" ? value : undefined)
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

interface VoiceStudioProps {
  customVoices: TtsVoice[]
  isLoadingCustom: boolean
  customError: string | null
  onRefreshCustom: () => void
  /** Select this voice in the Single Speaker tab. */
  onUseVoice: (voice: TtsVoice) => void
}

/** Plays one clip at a time and remembers which voice it belongs to. */
function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const stop = useCallback(() => {
    audioRef.current?.pause()
    if (audioRef.current?.src.startsWith("blob:")) URL.revokeObjectURL(audioRef.current.src)
    audioRef.current = null
    setPlayingId(null)
  }, [])

  const play = useCallback(
    (id: string, blob: Blob) => {
      stop()
      const audio = new Audio(URL.createObjectURL(blob))
      audio.onended = stop
      audioRef.current = audio
      setPlayingId(id)
      void audio.play().catch(stop)
    },
    [stop],
  )

  useEffect(() => stop, [stop])
  return { play, stop, playingId }
}

function VoiceTypeBadge({ type }: { type: TtsVoice["type"] }) {
  const tone =
    type === "prompted"
      ? "border-indigo-500/30 text-indigo-600 dark:text-indigo-400"
      : type === "replicated"
        ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
        : "border-zinc-300/60 text-zinc-500 dark:border-zinc-700"
  return <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${tone}`}>{TYPE_LABELS[type]}</span>
}

function CopyIdButton({ id }: { id: string }) {
  const [isCopied, setIsCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 1500)
    } catch {
      // clipboard blocked; the id is visible to select by hand
    }
  }
  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2 text-xs" aria-label={`Copy ${id}`}>
      {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

interface ClipValue {
  wav: Blob
  seconds: number | null
}

/** Record from the mic or upload a file; normalized to 24 kHz mono WAV when the browser can decode it. */
function AudioClipInput({
  label,
  hint,
  value,
  onChange,
  player,
  playerId,
}: {
  label: string
  hint: string
  value: ClipValue | null
  onChange: (value: ClipValue | null) => void
  player: ReturnType<typeof usePlayer>
  playerId: string
}) {
  const recorderRef = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isRecording) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 200)
    return () => clearInterval(timer)
  }, [isRecording])

  useEffect(() => () => recorderRef.current?.cancel(), [])

  const ingest = async (blob: Blob) => {
    setIsProcessing(true)
    try {
      const { wav, seconds } = await toWav24kMono(blob)
      onChange({ wav, seconds })
    } catch {
      // The browser couldn't decode it; send the original and let the API judge.
      onChange({ wav: blob, seconds: null })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRecord = async () => {
    setError(null)
    if (isRecording) {
      const recorder = recorderRef.current
      recorderRef.current = null
      setIsRecording(false)
      if (recorder) await ingest(await recorder.stop())
      return
    }
    try {
      recorderRef.current = await startRecording()
      setElapsed(0)
      setIsRecording(true)
    } catch (e) {
      setError(errorText(e, "Microphone unavailable"))
    }
  }

  const handleFile = async (file: File | undefined) => {
    setError(null)
    if (file) await ingest(file)
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 p-3">
      <div>
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{label}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={isRecording ? "destructive" : "outline"} size="sm" onClick={handleRecord} disabled={isProcessing}>
          {isRecording ? <Square className="mr-1.5 h-3.5 w-3.5" /> : <Mic className="mr-1.5 h-3.5 w-3.5" />}
          {isRecording ? `Stop (${elapsed.toFixed(0)}s)` : "Record"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={isRecording || isProcessing}>
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Upload
        </Button>
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
        {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
        {value && !isRecording && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => (player.playingId === playerId ? player.stop() : player.play(playerId, value.wav))}
            >
              {player.playingId === playerId ? <Square className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
              {value.seconds !== null ? `${value.seconds.toFixed(1)}s` : "Play"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} aria-label={`Clear ${label}`}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function VoiceStudio({ customVoices, isLoadingCustom, customError, onRefreshCustom, onUseVoice }: VoiceStudioProps) {
  const player = usePlayer()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const samplesRef = useRef(new Map<string, Blob>())

  // Designed voices carry their own reference sample; everything else gets a
  // short synthesized line.
  const handlePreview = async (voice: TtsVoice) => {
    if (player.playingId === voice.id) {
      player.stop()
      return
    }
    setRowError(null)
    const cached = samplesRef.current.get(voice.id)
    if (cached) {
      player.play(voice.id, cached)
      return
    }
    setBusyId(voice.id)
    try {
      let blob: Blob
      if (voice.sample_audio_base64) {
        blob = base64ToBlob(voice.sample_audio_base64, voice.sample_mime_type || "audio/wav")
      } else if (voice.type === "prompted") {
        const res = await apiClient.getVoice(voice.id)
        if (!res.voice.sample_audio_base64) throw new Error("This voice has no sample audio.")
        blob = base64ToBlob(res.voice.sample_audio_base64, res.voice.sample_mime_type || "audio/wav")
      } else {
        const res = await apiClient.generateSpeech({ prompt: PREVIEW_LINE, voice: voice.id, model: PREVIEW_MODEL })
        blob = base64ToBlob(res.audio_base64, res.mime_type)
      }
      samplesRef.current.set(voice.id, blob)
      player.play(voice.id, blob)
    } catch (e) {
      setRowError(`${voice.display_name || voice.id}: ${errorText(e, "Preview failed")}`)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (voice: TtsVoice) => {
    if (pendingDeleteId !== voice.id) {
      setPendingDeleteId(voice.id)
      return
    }
    setPendingDeleteId(null)
    setBusyId(voice.id)
    setRowError(null)
    try {
      await apiClient.deleteVoice(voice.id)
      samplesRef.current.delete(voice.id)
      onRefreshCustom()
    } catch (e) {
      setRowError(`${voice.display_name || voice.id}: ${errorText(e, "Delete failed")}`)
    } finally {
      setBusyId(null)
    }
  }

  const renderVoiceRow = (voice: TtsVoice, canDelete: boolean) => {
    const details = voice.type === "prebuilt" ? voice.description : voice.prompt
    const tags = [voice.language_code, voice.accent, voice.gender, voice.pitch && `${voice.pitch} pitch`].filter(Boolean)
    const isBusy = busyId === voice.id
    return (
      <li key={voice.id} className="flex flex-col gap-2 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{voice.display_name || voice.id}</span>
            <VoiceTypeBadge type={voice.type} />
            <code className="text-[11px] text-zinc-500">{voice.id}</code>
            <CopyIdButton id={voice.id} />
          </div>
          {details && <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{details}</p>}
          {tags.length > 0 && <p className="text-[11px] text-zinc-400">{tags.join(" · ")}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => handlePreview(voice)} disabled={isBusy} className="h-8">
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : player.playingId === voice.id ? (
              <Square className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button size="sm" onClick={() => onUseVoice(voice)} className="h-8">
            Use
          </Button>
          {canDelete && (
            <Button
              variant={pendingDeleteId === voice.id ? "destructive" : "ghost"}
              size="sm"
              onClick={() => handleDelete(voice)}
              onBlur={() => setPendingDeleteId((id) => (id === voice.id ? null : id))}
              disabled={isBusy}
              className="h-8"
              aria-label={`Delete ${voice.display_name || voice.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {pendingDeleteId === voice.id && <span className="ml-1.5 text-xs">Confirm</span>}
            </Button>
          )}
        </div>
      </li>
    )
  }

  // ── Design ──
  const [designName, setDesignName] = useState("")
  const [designDescription, setDesignDescription] = useState("")
  const [designGender, setDesignGender] = useState("any")
  const [designLanguage, setDesignLanguage] = useState("any")
  const [isDesigning, setIsDesigning] = useState(false)
  const [designError, setDesignError] = useState<string | null>(null)
  const [designedVoice, setDesignedVoice] = useState<TtsVoice | null>(null)

  const handleDesign = async () => {
    setIsDesigning(true)
    setDesignError(null)
    setDesignedVoice(null)
    try {
      const res = await apiClient.designVoice({
        display_name: designName.trim(),
        description: designDescription.trim(),
        gender: orUndefined(designGender),
        language_code: orUndefined(designLanguage),
      })
      setDesignedVoice(res.voice)
      onRefreshCustom()
      if (res.voice.sample_audio_base64) {
        const blob = base64ToBlob(res.voice.sample_audio_base64, res.voice.sample_mime_type || "audio/wav")
        samplesRef.current.set(res.voice.id, blob)
        player.play(res.voice.id, blob)
      }
    } catch (e) {
      setDesignError(errorText(e, "Voice design failed"))
    } finally {
      setIsDesigning(false)
    }
  }

  // ── Replicate ──
  const [replicaName, setReplicaName] = useState("")
  const [sourceClip, setSourceClip] = useState<ClipValue | null>(null)
  const [consentClip, setConsentClip] = useState<ClipValue | null>(null)
  const [isConsentConfirmed, setIsConsentConfirmed] = useState(false)
  const [isReplicating, setIsReplicating] = useState(false)
  const [replicaError, setReplicaError] = useState<string | null>(null)
  const [replicatedVoice, setReplicatedVoice] = useState<TtsVoice | null>(null)

  const sourceSeconds = sourceClip?.seconds ?? null
  const sourceLengthWarning =
    sourceSeconds !== null && (sourceSeconds < 10 || sourceSeconds > 30)
      ? `The sample is ${sourceSeconds.toFixed(1)}s; 10-30s of clean speech works best.`
      : null

  const handleReplicate = async () => {
    if (!sourceClip || !consentClip) return
    setIsReplicating(true)
    setReplicaError(null)
    setReplicatedVoice(null)
    try {
      const res = await apiClient.replicateVoice({
        display_name: replicaName.trim(),
        source_audio: sourceClip.wav,
        consent_audio: consentClip.wav,
        consent_confirmed: isConsentConfirmed,
      })
      setReplicatedVoice(res.voice)
      onRefreshCustom()
    } catch (e) {
      setReplicaError(errorText(e, "Voice replication failed"))
    } finally {
      setIsReplicating(false)
    }
  }

  // ── Library ──
  const [librarySearch, setLibrarySearch] = useState("")
  const [libraryGender, setLibraryGender] = useState("any")
  const [libraryLanguage, setLibraryLanguage] = useState("any")
  const [libraryPitch, setLibraryPitch] = useState("any")
  const [libraryVoices, setLibraryVoices] = useState<TtsVoice[]>([])
  const [libraryToken, setLibraryToken] = useState<string | null>(null)
  const [libraryFilters, setLibraryFilters] = useState<VoiceLibraryFilters | null>(null)
  const [isLibraryLoading, setIsLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)

  // A page token is only valid with the filters that produced it, so "load
  // more" reuses the saved filters rather than whatever the inputs say now.
  const fetchLibrary = async (filters: VoiceLibraryFilters, append: boolean) => {
    setIsLibraryLoading(true)
    setLibraryError(null)
    try {
      const res = await apiClient.listVoiceLibrary(filters)
      setLibraryVoices((prev) => (append ? [...prev, ...res.voices] : res.voices))
      setLibraryToken(res.next_page_token)
    } catch (e) {
      setLibraryError(errorText(e, "Could not load the voice library"))
    } finally {
      setIsLibraryLoading(false)
    }
  }

  const handleLibrarySearch = () => {
    const filters: VoiceLibraryFilters = {
      type: ["prebuilt"],
      search: librarySearch.trim() || undefined,
      gender: orUndefined(libraryGender),
      language_code: orUndefined(libraryLanguage),
      pitch: orUndefined(libraryPitch),
      page_size: 30,
    }
    setLibraryFilters(filters)
    void fetchLibrary(filters, false)
  }

  const handleLibraryMore = () => {
    if (libraryFilters && libraryToken) void fetchLibrary({ ...libraryFilters, page_token: libraryToken }, true)
  }

  const renderCreatedVoice = (voice: TtsVoice, action: string) => (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
      <Check className="h-4 w-4 text-emerald-500" />
      <span>
        {action} <strong>{voice.display_name}</strong>
      </span>
      <code className="text-xs text-zinc-500">{voice.id}</code>
      <CopyIdButton id={voice.id} />
      <div className="ml-auto flex gap-1.5">
        {voice.type === "prompted" && (
          <Button variant="outline" size="sm" onClick={() => handlePreview(voice)} className="h-8">
            {player.playingId === voice.id ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
        )}
        <Button size="sm" onClick={() => onUseVoice(voice)} className="h-8">
          Use
        </Button>
      </div>
    </div>
  )

  return (
    <Tabs defaultValue="mine" className="space-y-4">
      <TabsList className="grid w-full grid-cols-4 max-w-xl">
        <TabsTrigger value="mine">
          <UserRound className="mr-1.5 h-4 w-4" />
          My voices
        </TabsTrigger>
        <TabsTrigger value="design">
          <Wand2 className="mr-1.5 h-4 w-4" />
          Design
        </TabsTrigger>
        <TabsTrigger value="replicate">
          <Mic className="mr-1.5 h-4 w-4" />
          Replicate
        </TabsTrigger>
        <TabsTrigger value="library">
          <Library className="mr-1.5 h-4 w-4" />
          Library
        </TabsTrigger>
      </TabsList>

      {rowError && <p className="text-sm text-red-500">{rowError}</p>}

      {/* ── My voices ── */}
      <TabsContent value="mine">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>My voices</CardTitle>
                <CardDescription>
                  Designed and replicated voices stored in your project. They work on the 3.8 models in every tab and
                  expire after a year without use.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={onRefreshCustom} disabled={isLoadingCustom}>
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingCustom ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {customError && <p className="text-sm text-red-500">{customError}</p>}
            {!customError && isLoadingCustom && customVoices.length === 0 && (
              <p className="text-sm text-zinc-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your voices…
              </p>
            )}
            {!customError && !isLoadingCustom && customVoices.length === 0 && (
              <p className="text-sm text-zinc-500">No custom voices yet. Create one in Design or Replicate.</p>
            )}
            {customVoices.length > 0 && (
              <ul className="space-y-2">
                {customVoices.map((v) => renderVoiceRow(v, true))}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Design ── */}
      <TabsContent value="design">
        <Card>
          <CardHeader>
            <CardTitle>Design a voice</CardTitle>
            <CardDescription>
              Describe the permanent traits in one or two specific sentences: age, gender, pitch, timbre, texture,
              accent and pacing. Leave out situational emotion; that goes in each line&apos;s style.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="design-name" className="text-sm font-medium">Name</label>
              <Input id="design-name" placeholder="e.g. Satan" value={designName} onChange={(e) => setDesignName(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-2">
              <label htmlFor="design-description" className="text-sm font-medium">Description</label>
              <Textarea
                id="design-description"
                placeholder="A commanding man in his 40s with a deep, low-pitched, dark baritone, smooth and resonant with a cold metallic edge, a refined British RP accent, and a slow, precise, deliberate delivery."
                value={designDescription}
                onChange={(e) => setDesignDescription(e.target.value)}
                rows={4}
                maxLength={4000}
                className="resize-none text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select value={designGender} onValueChange={setDesignGender}>
                <SelectTrigger aria-label="Gender">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={designLanguage} onValueChange={setDesignLanguage}>
                <SelectTrigger aria-label="Language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleDesign}
              disabled={isDesigning || !designName.trim() || !designDescription.trim()}
              className="w-full pulse-glow"
            >
              {isDesigning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {isDesigning ? "Designing… (about 20s)" : "Create voice"}
            </Button>
            {designError && <p className="text-sm text-red-500">{designError}</p>}
            {designedVoice && renderCreatedVoice(designedVoice, "Created")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Replicate ── */}
      <TabsContent value="replicate">
        <Card>
          <CardHeader>
            <CardTitle>Replicate a voice</CardTitle>
            <CardDescription>
              Copy a real adult speaker&apos;s voice from two recordings of that same person. Only replicate a voice
              with its owner&apos;s permission: Google checks the consent recording against the sample and rejects
              mismatches.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="replica-name" className="text-sm font-medium">Name</label>
              <Input id="replica-name" placeholder="e.g. My narration voice" value={replicaName} onChange={(e) => setReplicaName(e.target.value)} maxLength={200} />
            </div>
            <AudioClipInput
              label="1. Voice sample"
              hint="10-30 seconds of clean, natural speech in a quiet room. No music or other voices."
              value={sourceClip}
              onChange={setSourceClip}
              player={player}
              playerId="clip:source"
            />
            {sourceLengthWarning && <p className="text-xs text-amber-600 dark:text-amber-400">{sourceLengthWarning}</p>}
            <AudioClipInput
              label="2. Consent recording"
              hint="The same speaker reading this statement aloud, word for word:"
              value={consentClip}
              onChange={setConsentClip}
              player={player}
              playerId="clip:consent"
            />
            <blockquote className="-mt-2 rounded-lg border-l-4 border-indigo-500/50 bg-indigo-500/5 px-4 py-3 text-sm italic">
              &ldquo;{CONSENT_PHRASE_EN}&rdquo;
            </blockquote>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isConsentConfirmed}
                onChange={(e) => setIsConsentConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-indigo-500"
              />
              <span>
                The speaker in both recordings is an adult who owns this voice and has agreed to it being replicated.
              </span>
            </label>
            <Button
              onClick={handleReplicate}
              disabled={isReplicating || !replicaName.trim() || !sourceClip || !consentClip || !isConsentConfirmed}
              className="w-full pulse-glow"
            >
              {isReplicating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
              {isReplicating ? "Replicating…" : "Create replicated voice"}
            </Button>
            {replicaError && <p className="text-sm text-red-500">{replicaError}</p>}
            {replicatedVoice && renderCreatedVoice(replicatedVoice, "Replicated")}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── Extended Voice Library ── */}
      <TabsContent value="library">
        <Card>
          <CardHeader>
            <CardTitle>Voice library</CardTitle>
            <CardDescription>
              About 1,000 catalog voices across languages, accents and personas. Library voices need a 3.8 model.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                handleLibrarySearch()
              }}
            >
              <div className="flex gap-2">
                <Input
                  placeholder="Search names and descriptions, e.g. narrator, warm, documentary"
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  aria-label="Search the voice library"
                />
                <Button type="submit" disabled={isLibraryLoading}>
                  {isLibraryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Select value={libraryLanguage} onValueChange={setLibraryLanguage}>
                  <SelectTrigger aria-label="Language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={libraryGender} onValueChange={setLibraryGender}>
                  <SelectTrigger aria-label="Gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={libraryPitch} onValueChange={setLibraryPitch}>
                  <SelectTrigger aria-label="Pitch">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PITCHES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </form>

            {libraryError && <p className="text-sm text-red-500">{libraryError}</p>}
            {libraryFilters && !isLibraryLoading && libraryVoices.length === 0 && !libraryError && (
              <p className="text-sm text-zinc-500">No voices match those filters.</p>
            )}
            {libraryVoices.length > 0 && (
              <ul className="space-y-2">
                {libraryVoices.map((v) => renderVoiceRow(v, false))}
              </ul>
            )}
            {libraryToken && (
              <Button variant="outline" onClick={handleLibraryMore} disabled={isLibraryLoading} className="w-full">
                {isLibraryLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load more
              </Button>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
