"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Loader2, Mic, MicOff, PhoneOff, Radio, Sparkles } from "lucide-react"
import { apiClient } from "@/lib/api"
import { hasApiKey } from "@/lib/api-key"

// ─── Audio helpers ──────────────────────────────────────────────────────────

/** Average-decimate a Float32 buffer from inRate to outRate. */
function downsample(buffer: Float32Array, inRate: number, outRate: number): Float32Array {
    if (outRate >= inRate) return buffer
    const ratio = inRate / outRate
    const outLen = Math.round(buffer.length / ratio)
    const result = new Float32Array(outLen)
    let iOut = 0
    let iIn = 0
    while (iOut < outLen) {
        const nextIn = Math.round((iOut + 1) * ratio)
        let accum = 0
        let count = 0
        for (let i = iIn; i < nextIn && i < buffer.length; i++) {
            accum += buffer[i]
            count++
        }
        result[iOut] = count > 0 ? accum / count : 0
        iOut++
        iIn = nextIn
    }
    return result
}

/** Float32 [-1,1] → little-endian 16-bit PCM. */
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
    const buf = new ArrayBuffer(input.length * 2)
    const view = new DataView(buf)
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]))
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
    return buf
}

const VOICES = [
    "Puck", "Kore", "Zephyr", "Charon", "Fenrir", "Leda", "Orus", "Aoede",
    "Callirrhoe", "Autonoe", "Enceladus", "Achird", "Sulafat", "Vindemiatrix",
]

const INPUT_RATE = 16000
const OUTPUT_RATE = 24000

type Status = "idle" | "connecting" | "live" | "error"
interface TranscriptTurn { role: "user" | "model"; text: string }

export function GeminiLive() {
    const [status, setStatus] = useState<Status>("idle")
    const [voice, setVoice] = useState("Puck")
    const [system, setSystem] = useState("")
    const [micMuted, setMicMuted] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [turns, setTurns] = useState<TranscriptTurn[]>([])
    const [speaking, setSpeaking] = useState(false)

    // Live audio plumbing (refs so they survive re-renders).
    const wsRef = useRef<WebSocket | null>(null)
    const inputCtxRef = useRef<AudioContext | null>(null)
    const outputCtxRef = useRef<AudioContext | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const processorRef = useRef<ScriptProcessorNode | null>(null)
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
    const playheadRef = useRef(0)
    const micMutedRef = useRef(false)
    // Accumulate streaming transcript fragments per turn.
    const partialInRef = useRef("")
    const partialOutRef = useRef("")

    useEffect(() => {
        micMutedRef.current = micMuted
    }, [micMuted])

    const teardown = useCallback(() => {
        try { processorRef.current?.disconnect() } catch { }
        processorRef.current = null
        try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch { }
        streamRef.current = null
        try { inputCtxRef.current?.close() } catch { }
        inputCtxRef.current = null
        for (const s of sourcesRef.current) { try { s.stop() } catch { } }
        sourcesRef.current.clear()
        try { outputCtxRef.current?.close() } catch { }
        outputCtxRef.current = null
        playheadRef.current = 0
        try { wsRef.current?.close() } catch { }
        wsRef.current = null
    }, [])

    // Clean up on unmount.
    useEffect(() => () => teardown(), [teardown])

    const clearPlayback = useCallback(() => {
        for (const s of sourcesRef.current) { try { s.stop() } catch { } }
        sourcesRef.current.clear()
        playheadRef.current = 0
        setSpeaking(false)
    }, [])

    const playChunk = useCallback((pcm: ArrayBuffer) => {
        const ctx = outputCtxRef.current
        if (!ctx) return
        const int16 = new Int16Array(pcm)
        const float = new Float32Array(int16.length)
        for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000
        const buffer = ctx.createBuffer(1, float.length, OUTPUT_RATE)
        buffer.getChannelData(0).set(float)
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.connect(ctx.destination)
        const startAt = Math.max(ctx.currentTime, playheadRef.current)
        src.start(startAt)
        playheadRef.current = startAt + buffer.duration
        sourcesRef.current.add(src)
        setSpeaking(true)
        src.onended = () => {
            sourcesRef.current.delete(src)
            if (sourcesRef.current.size === 0) setSpeaking(false)
        }
    }, [])

    const appendTranscript = useCallback((role: "user" | "model", text: string) => {
        // Merge consecutive fragments from the same role into one bubble.
        setTurns((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.role === role) {
                const next = prev.slice(0, -1)
                next.push({ role, text: last.text + text })
                return next
            }
            return [...prev, { role, text }]
        })
    }, [])

    const start = useCallback(async () => {
        setError(null)
        if (!hasApiKey()) {
            setError("Add your Gemini API key first (button in the bottom-right).")
            return
        }
        setStatus("connecting")
        setTurns([])
        try {
            // Mic capture
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
            })
            streamRef.current = stream

            const inputCtx = new AudioContext()
            inputCtxRef.current = inputCtx
            const source = inputCtx.createMediaStreamSource(stream)
            const processor = inputCtx.createScriptProcessor(4096, 1, 1)
            processorRef.current = processor

            // Output context pinned to the model's 24 kHz.
            outputCtxRef.current = new AudioContext({ sampleRate: OUTPUT_RATE })

            const ws = new WebSocket(apiClient.getLiveWsUrl({ voice, system: system.trim() }))
            ws.binaryType = "arraybuffer"
            wsRef.current = ws

            ws.onopen = () => {
                // Pipe mic → downsample → PCM16 → ws. A zero-gain sink keeps
                // onaudioprocess firing without echoing the mic to the speakers.
                processor.onaudioprocess = (e) => {
                    if (micMutedRef.current) return
                    if (ws.readyState !== WebSocket.OPEN) return
                    const input = e.inputBuffer.getChannelData(0)
                    const down = downsample(input, inputCtx.sampleRate, INPUT_RATE)
                    ws.send(floatTo16BitPCM(down))
                }
                const sink = inputCtx.createGain()
                sink.gain.value = 0
                source.connect(processor)
                processor.connect(sink)
                sink.connect(inputCtx.destination)
            }

            ws.onmessage = (e) => {
                if (e.data instanceof ArrayBuffer) {
                    playChunk(e.data)
                    return
                }
                try {
                    const msg = JSON.parse(e.data as string)
                    switch (msg.type) {
                        case "ready":
                            setStatus("live")
                            break
                        case "input_transcript":
                            partialInRef.current += msg.text
                            appendTranscript("user", msg.text)
                            break
                        case "output_transcript":
                            partialOutRef.current += msg.text
                            appendTranscript("model", msg.text)
                            break
                        case "interrupted":
                            clearPlayback()
                            break
                        case "turn_complete":
                            partialInRef.current = ""
                            partialOutRef.current = ""
                            break
                        case "error":
                            setError(msg.message || "Live session error")
                            setStatus("error")
                            teardown()
                            break
                    }
                } catch {
                    // ignore malformed frames
                }
            }

            ws.onerror = () => {
                setError("Connection error. Check your API key and network.")
                setStatus("error")
            }
            ws.onclose = () => {
                if (status === "live" || status === "connecting") setStatus("idle")
                teardown()
            }
        } catch (err: unknown) {
            const message =
                err instanceof DOMException && err.name === "NotAllowedError"
                    ? "Microphone permission denied. Allow mic access and try again."
                    : err instanceof Error
                        ? err.message
                        : "Failed to start Live session"
            setError(message)
            setStatus("error")
            teardown()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [voice, system, playChunk, clearPlayback, appendTranscript, teardown])

    const stop = useCallback(() => {
        setStatus("idle")
        setSpeaking(false)
        teardown()
    }, [teardown])

    const isLive = status === "live"
    const isConnecting = status === "connecting"

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    Gemini Live
                    <span className="px-2 py-0.5 rounded-full bg-fuchsia-500/20 border border-fuchsia-500/50 text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-400">
                        REAL-TIME VOICE
                    </span>
                </CardTitle>
                <CardDescription>
                    Talk to Gemini out loud — it listens on your mic and replies with live
                    speech. Just start talking; it detects when you pause. Use headphones to
                    avoid echo.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Config (locked while a session is running) */}
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Voice</label>
                        <Select value={voice} onValueChange={setVoice} disabled={isLive || isConnecting}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                                {VOICES.map((v) => (
                                    <SelectItem key={v} value={v}>{v}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Persona / system instruction (optional)</label>
                        <Textarea
                            placeholder="e.g. You are a friendly Spanish tutor. Keep replies short."
                            value={system}
                            onChange={(e) => setSystem(e.target.value)}
                            rows={2}
                            disabled={isLive || isConnecting}
                            className="resize-none"
                        />
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                    {!isLive && !isConnecting && (
                        <Button onClick={start} className="flex-1 pulse-glow">
                            <Radio className="mr-2 h-4 w-4" />
                            Start conversation
                        </Button>
                    )}
                    {isConnecting && (
                        <Button disabled className="flex-1">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Connecting…
                        </Button>
                    )}
                    {isLive && (
                        <>
                            <Button
                                variant={micMuted ? "default" : "outline"}
                                onClick={() => setMicMuted((m) => !m)}
                                className="flex-1"
                            >
                                {micMuted ? (
                                    <><MicOff className="mr-2 h-4 w-4" /> Mic muted</>
                                ) : (
                                    <><Mic className="mr-2 h-4 w-4" /> Mic on</>
                                )}
                            </Button>
                            <Button variant="outline" onClick={stop} className="flex-1">
                                <PhoneOff className="mr-2 h-4 w-4" />
                                End
                            </Button>
                        </>
                    )}
                </div>

                {/* Live status indicator */}
                {isLive && (
                    <div className="flex items-center justify-center gap-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 py-3">
                        <span className="relative flex h-3 w-3">
                            <span className={`absolute inline-flex h-full w-full rounded-full ${speaking ? "bg-emerald-400 animate-ping" : "bg-fuchsia-400"} opacity-75`} />
                            <span className={`relative inline-flex h-3 w-3 rounded-full ${speaking ? "bg-emerald-500" : "bg-fuchsia-500"}`} />
                        </span>
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            {speaking ? "Gemini is speaking…" : micMuted ? "Muted — tap Mic on to talk" : "Listening…"}
                        </span>
                    </div>
                )}

                {error && (
                    <div className="rounded-lg bg-red-500/20 border border-red-500/30 p-4">
                        <p className="text-sm text-red-900 dark:text-red-100">{error}</p>
                    </div>
                )}

                {/* Transcript */}
                {turns.length > 0 && (
                    <div className="space-y-2 max-h-80 overflow-y-auto rounded-lg border border-zinc-200/50 dark:border-zinc-800/50 p-3">
                        {turns.map((t, i) => (
                            <div
                                key={i}
                                className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                                        t.role === "user"
                                            ? "bg-indigo-500/15 text-zinc-800 dark:text-zinc-100"
                                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                                    }`}
                                >
                                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-60 mb-0.5">
                                        {t.role === "user" ? "You" : <><Sparkles className="h-3 w-3" /> Gemini</>}
                                    </span>
                                    {t.text}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
