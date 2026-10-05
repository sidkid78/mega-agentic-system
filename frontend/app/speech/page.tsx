"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiClient } from "@/lib/api"
import { Loader2, Volume2, Download, Mic, Users, Radio } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { GeminiLive } from "@/components/gemini-live"

// 30 prebuilt voices (kept in sync with backend/speech_generation.py VOICES)
const VOICES: Array<{ name: string; description: string }> = [
  { name: "Zephyr", description: "Bright" },
  { name: "Puck", description: "Upbeat" },
  { name: "Charon", description: "Informative" },
  { name: "Kore", description: "Firm" },
  { name: "Fenrir", description: "Excitable" },
  { name: "Leda", description: "Youthful" },
  { name: "Orus", description: "Firm" },
  { name: "Aoede", description: "Breezy" },
  { name: "Callirrhoe", description: "Easy-going" },
  { name: "Autonoe", description: "Bright" },
  { name: "Enceladus", description: "Breathy" },
  { name: "Iapetus", description: "Clear" },
  { name: "Umbriel", description: "Easy-going" },
  { name: "Algieba", description: "Smooth" },
  { name: "Despina", description: "Smooth" },
  { name: "Erinome", description: "Clear" },
  { name: "Algenib", description: "Gravelly" },
  { name: "Rasalgethi", description: "Informative" },
  { name: "Laomedeia", description: "Upbeat" },
  { name: "Achernar", description: "Soft" },
  { name: "Alnilam", description: "Firm" },
  { name: "Schedar", description: "Even" },
  { name: "Gacrux", description: "Mature" },
  { name: "Pulcherrima", description: "Forward" },
  { name: "Achird", description: "Friendly" },
  { name: "Zubenelgenubi", description: "Casual" },
  { name: "Vindemiatrix", description: "Gentle" },
  { name: "Sadachbia", description: "Lively" },
  { name: "Sadaltager", description: "Knowledgeable" },
  { name: "Sulafat", description: "Warm" },
]

const MODELS: Array<{ id: string; label: string; streaming: boolean; multiSpeaker: boolean }> = [
  { id: "gemini-3.8-flash-tts", label: "3.8 Flash TTS (Newest)", streaming: true, multiSpeaker: false },
  { id: "gemini-3.8-flash-lite-tts", label: "3.8 Flash Lite TTS (Fastest)", streaming: true, multiSpeaker: false },
  { id: "gemini-3.1-flash-tts-preview", label: "3.1 Flash TTS", streaming: true, multiSpeaker: true },
  { id: "gemini-2.5-flash-preview-tts", label: "2.5 Flash TTS", streaming: false, multiSpeaker: true },
  { id: "gemini-2.5-pro-preview-tts", label: "2.5 Pro TTS (Highest quality)", streaming: false, multiSpeaker: true },
]

// The 3.8 models reject multi-speaker unless every text part carries
// speech_metadata.speaker, which the installed SDK cannot send. Rather than
// let someone pick a model that will 400, the conversation tab only offers
// the models that work.
const MULTI_SPEAKER_MODELS = MODELS.filter((m) => m.multiSpeaker)

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "", label: "Auto-detect" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "es-ES", label: "Spanish" },
  { code: "it-IT", label: "Italian" },
  { code: "pt-BR", label: "Portuguese (BR)" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ar-EG", label: "Arabic" },
]

const STYLE_TAGS = ["[whispers]", "[excitedly]", "[laughs]", "[sighs]", "[shouting]", "Say cheerfully:"]

interface SpeechResult {
  audioUrl: string
  mimeType: string
  modelUsed: string
  label: string
}

/** Join base64 PCM chunks from the speech stream into one playable WAV.
 *  The chunks have no headers of their own: they are fragments of a single
 *  24 kHz mono 16-bit stream, so one RIFF header goes on the front of the lot. */
function pcmChunksToWavBlob(chunks: string[]): Blob {
  const parts = chunks.map((c) => {
    const binary = atob(c)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  })
  const dataLength = parts.reduce((n, p) => n + p.length, 0)
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  const sampleRate = 24000
  const channels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8

  writeAscii(0, "RIFF")
  view.setUint32(4, 36 + dataLength, true)
  writeAscii(8, "WAVE")
  writeAscii(12, "fmt ")
  view.setUint32(16, 16, true)        // PCM header size
  view.setUint16(20, 1, true)         // PCM format
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, (channels * bitsPerSample) / 8, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(36, "data")
  view.setUint32(40, dataLength, true)

  const out = new Uint8Array(buffer)
  let offset = 44
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return new Blob([buffer], { type: "audio/wav" })
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

export default function SpeechPage() {
  // Single-speaker state
  const [prompt, setPrompt] = useState("")
  const [voice, setVoice] = useState("Kore")
  const [model, setModel] = useState("gemini-3.8-flash-tts")
  const [language, setLanguage] = useState("")
  const [streaming, setStreaming] = useState(true)
  const [streamProgress, setStreamProgress] = useState<{ chunks: number; seconds: number } | null>(null)

  // Multi-speaker state
  const [convoPrompt, setConvoPrompt] = useState("")
  const [speaker1Name, setSpeaker1Name] = useState("Joe")
  const [speaker1Voice, setSpeaker1Voice] = useState("Kore")
  const [speaker2Name, setSpeaker2Name] = useState("Jane")
  const [speaker2Voice, setSpeaker2Voice] = useState("Puck")
  const [multiModel, setMultiModel] = useState("gemini-3.1-flash-tts-preview")

  // Shared state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SpeechResult | null>(null)

  const insertTag = (tag: string) => {
    setPrompt((p) => (p ? `${tag} ${p}` : `${tag} `))
  }

  const modelInfo = MODELS.find((m) => m.id === model)
  const canStream = Boolean(modelInfo?.streaming)

  const handleGenerateSingle = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    setStreamProgress(null)
    const lang = language || undefined
    try {
      if (streaming && canStream) {
        // Chunks are PCM fragments of one stream, so they are collected and
        // wrapped as a single WAV at the end - wrapping each chunk would
        // produce a sequence of unplayable snippets.
        const chunks: string[] = []
        let bytes = 0
        for await (const ev of apiClient.streamSpeech({ prompt, voice, model, language: lang })) {
          if (ev.type === "audio") {
            chunks.push(ev.data)
            bytes += Math.floor((ev.data.length * 3) / 4)
            // 24 kHz, mono, 16-bit => 48000 bytes per second.
            setStreamProgress({ chunks: chunks.length, seconds: bytes / 48000 })
          } else if (ev.type === "error") {
            throw new Error(ev.message)
          }
        }
        if (chunks.length === 0) throw new Error("No audio was streamed.")
        const blob = pcmChunksToWavBlob(chunks)
        setResult({
          audioUrl: URL.createObjectURL(blob),
          mimeType: "audio/wav",
          modelUsed: model,
          label: `${voice} · ${model} · streamed`,
        })
      } else {
        const res = await apiClient.generateSpeech({ prompt, voice, model, language: lang })
        const blob = base64ToBlob(res.audio_base64, res.mime_type)
        setResult({
          audioUrl: URL.createObjectURL(blob),
          mimeType: res.mime_type,
          modelUsed: res.model_used,
          label: `${res.voice} · ${res.model_used}`,
        })
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Speech generation failed")
    } finally {
      setLoading(false)
      setStreamProgress(null)
    }
  }

  const handleGenerateMulti = async () => {
    if (!convoPrompt.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await apiClient.generateMultiSpeakerSpeech({
        prompt: convoPrompt,
        speakers: [
          { speaker: speaker1Name, voice: speaker1Voice },
          { speaker: speaker2Name, voice: speaker2Voice },
        ],
        model: multiModel,
      })
      const blob = base64ToBlob(res.audio_base64, res.mime_type)
      setResult({
        audioUrl: URL.createObjectURL(blob),
        mimeType: res.mime_type,
        modelUsed: res.model_used,
        label: `${speaker1Name} + ${speaker2Name} · ${res.model_used}`,
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Speech generation failed")
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!result) return
    const a = document.createElement("a")
    a.href = result.audioUrl
    a.download = `speech-${Date.now()}.wav`
    a.click()
  }

  const VoiceSelect = ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {VOICES.map((v) => (
          <SelectItem key={v.name} value={v.name}>
            {v.name} <span className="text-zinc-400">— {v.description}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="mega-bg fixed inset-0" />

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight gradient-text mb-2">
              🔊 Speech Generation
            </h1>
            <p className="text-lg text-zinc-700 dark:text-zinc-300">
              Natural, expressive text-to-speech powered by Gemini TTS
            </p>
          </div>
          <ThemeToggle />
        </div>

        <Tabs defaultValue="single" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-xl">
            <TabsTrigger value="single">
              <Mic className="mr-2 h-4 w-4" />
              Single Speaker
            </TabsTrigger>
            <TabsTrigger value="multi">
              <Users className="mr-2 h-4 w-4" />
              Multi-Speaker
            </TabsTrigger>
            <TabsTrigger value="live">
              <Radio className="mr-2 h-4 w-4" />
              Live
            </TabsTrigger>
          </TabsList>

          {/* ── Single Speaker ── */}
          <TabsContent value="single" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Text to Speak</CardTitle>
                <CardDescription>
                  Steer style and emotion with natural language — e.g. &ldquo;Say cheerfully:&rdquo; or inline tags like [whispers].
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Say cheerfully: Have a wonderful day!"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  className="resize-none"
                />

                <div className="flex flex-wrap gap-1.5">
                  {STYLE_TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => insertTag(tag)}
                      className="text-xs font-mono px-2.5 py-1 rounded-full border border-zinc-200/50 dark:border-zinc-800/50 text-zinc-500 hover:text-indigo-500 hover:border-indigo-500/30 transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="voice" className="text-sm font-medium">Voice</label>
                    <VoiceSelect id="voice" value={voice} onChange={setVoice} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="model" className="text-sm font-medium">Model</label>
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger id="model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="language" className="text-sm font-medium">Language</label>
                    <Select value={language || "auto"} onValueChange={(v) => setLanguage(v === "auto" ? "" : v)}>
                      <SelectTrigger id="language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((l) => (
                          <SelectItem key={l.code || "auto"} value={l.code || "auto"}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Streaming: audio starts arriving in about two seconds
                    instead of waiting for the whole clip. */}
                <div className="flex items-center justify-between rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 px-3 py-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Stream audio</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {canStream
                        ? "First audio in ~2s instead of waiting for the full clip."
                        : `${modelInfo?.label ?? model} does not support streaming.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={streaming && canStream}
                    aria-label="Stream audio"
                    disabled={!canStream}
                    onClick={() => setStreaming((s) => !s)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                      streaming && canStream ? "bg-indigo-500" : "bg-zinc-300 dark:bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        streaming && canStream ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                {streamProgress && (
                  <p className="text-xs font-mono text-indigo-500">
                    streaming… {streamProgress.chunks} chunks · {streamProgress.seconds.toFixed(1)}s of audio
                  </p>
                )}

                <Button
                  onClick={handleGenerateSingle}
                  disabled={loading || !prompt.trim()}
                  className="w-full pulse-glow"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Synthesizing…
                    </>
                  ) : (
                    <>
                      <Volume2 className="mr-2 h-4 w-4" />
                      Generate Speech
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Multi-Speaker ── */}
          <TabsContent value="multi" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Conversation</CardTitle>
                <CardDescription>
                  Write a dialogue that names each speaker. Assign each speaker a distinct voice (up to 2 speakers).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder={
                    "TTS the following conversation between Joe and Jane:\nJoe: How's it going today Jane?\nJane: Not too bad, how about you?"
                  }
                  value={convoPrompt}
                  onChange={(e) => setConvoPrompt(e.target.value)}
                  rows={6}
                  className="resize-none font-mono text-sm"
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 p-3">
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Speaker 1</p>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-500">Name</label>
                      <Input value={speaker1Name} onChange={(e) => setSpeaker1Name(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-500">Voice</label>
                      <VoiceSelect id="s1-voice" value={speaker1Voice} onChange={setSpeaker1Voice} />
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 p-3">
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Speaker 2</p>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-500">Name</label>
                      <Input value={speaker2Name} onChange={(e) => setSpeaker2Name(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-500">Voice</label>
                      <VoiceSelect id="s2-voice" value={speaker2Voice} onChange={setSpeaker2Voice} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="multi-model" className="text-sm font-medium">Model</label>
                  <Select value={multiModel} onValueChange={setMultiModel}>
                    <SelectTrigger id="multi-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MULTI_SPEAKER_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    The 3.8 models are single-speaker only for now: they require a
                    speaker tag on every text part, which the current SDK cannot send.
                  </p>
                </div>

                <Button
                  onClick={handleGenerateMulti}
                  disabled={loading || !convoPrompt.trim()}
                  className="w-full pulse-glow"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Synthesizing…
                    </>
                  ) : (
                    <>
                      <Users className="mr-2 h-4 w-4" />
                      Generate Conversation
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Gemini Live (real-time voice) ── */}
          <TabsContent value="live" className="space-y-6">
            <GeminiLive />
          </TabsContent>
        </Tabs>

        {/* Error */}
        {error && (
          <Card className="mt-6 border-red-500/30">
            <CardContent className="pt-6">
              <p className="text-sm text-red-500">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Result */}
        {result && (
          <Card className="mt-6 border border-indigo-500/30 bg-indigo-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-indigo-500" />
                  Generated Audio
                  <span className="text-xs font-mono font-normal text-zinc-500 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-700/50">
                    {result.label}
                  </span>
                </CardTitle>
                <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 text-xs">
                  <Download className="h-3.5 w-3.5" />
                  Download WAV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <audio controls src={result.audioUrl} className="w-full h-10" />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
