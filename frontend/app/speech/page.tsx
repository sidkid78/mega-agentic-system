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

const MODELS: Array<{ id: string; label: string }> = [
  { id: "gemini-2.5-flash-preview-tts", label: "2.5 Flash TTS (Fast)" },
  { id: "gemini-2.5-pro-preview-tts", label: "2.5 Pro TTS (Highest quality)" },
  { id: "gemini-3.1-flash-tts-preview", label: "3.1 Flash TTS (Newest preview)" },
]

const STYLE_TAGS = ["[whispers]", "[excitedly]", "[laughs]", "[sighs]", "[shouting]", "Say cheerfully:"]

interface SpeechResult {
  audioUrl: string
  mimeType: string
  modelUsed: string
  label: string
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
  const [model, setModel] = useState("gemini-2.5-flash-preview-tts")

  // Multi-speaker state
  const [convoPrompt, setConvoPrompt] = useState("")
  const [speaker1Name, setSpeaker1Name] = useState("Joe")
  const [speaker1Voice, setSpeaker1Voice] = useState("Kore")
  const [speaker2Name, setSpeaker2Name] = useState("Jane")
  const [speaker2Voice, setSpeaker2Voice] = useState("Puck")
  const [multiModel, setMultiModel] = useState("gemini-2.5-flash-preview-tts")

  // Shared state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SpeechResult | null>(null)

  const insertTag = (tag: string) => {
    setPrompt((p) => (p ? `${tag} ${p}` : `${tag} `))
  }

  const handleGenerateSingle = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await apiClient.generateSpeech({ prompt, voice, model })
      const blob = base64ToBlob(res.audio_base64, res.mime_type)
      setResult({
        audioUrl: URL.createObjectURL(blob),
        mimeType: res.mime_type,
        modelUsed: res.model_used,
        label: `${res.voice} · ${res.model_used}`,
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Speech generation failed")
    } finally {
      setLoading(false)
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
                </div>

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
                      {MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
