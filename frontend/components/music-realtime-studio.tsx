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
import {
  apiClient,
  type LiveMusicConfig,
  type MusicRealtimeMetadata,
  type WeightedPrompt,
} from "@/lib/api"
import { PcmStreamPlayer } from "@/lib/music-stream"
import { Loader2, Play, Pause, Square, RotateCcw, Plus, X, Radio, Volume2 } from "lucide-react"

type ConnState = "idle" | "connecting" | "playing" | "paused" | "stopped" | "error"

const STARTER_PROMPTS: WeightedPrompt[] = [
  { text: "minimal techno", weight: 1.0 },
  { text: "warm analog synths", weight: 0.6 },
]

const SLIDER_CLASS =
  "w-full h-1.5 cursor-pointer appearance-none rounded-full bg-zinc-200 dark:bg-zinc-800 accent-indigo-500"

function formatScale(name: string): string {
  return name
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function MusicRealtimeStudio() {
  const [metadata, setMetadata] = useState<MusicRealtimeMetadata | null>(null)
  const [metadataError, setMetadataError] = useState<string | null>(null)
  const [prompts, setPrompts] = useState<WeightedPrompt[]>(STARTER_PROMPTS)
  const [config, setConfig] = useState<LiveMusicConfig>({})
  const [state, setState] = useState<ConnState>("idle")
  const [bufferedAhead, setBufferedAhead] = useState(0)
  const [notices, setNotices] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolume] = useState(1)

  const wsRef = useRef<WebSocket | null>(null)
  const playerRef = useRef<PcmStreamPlayer | null>(null)

  // Load steering metadata + seed default config values.
  useEffect(() => {
    let cancelled = false
    apiClient
      .getMusicRealtimeMetadata()
      .then((meta) => {
        if (cancelled) return
        setMetadata(meta)
        const r = meta.config_ranges
        setConfig({
          bpm: r.bpm.default,
          guidance: r.guidance.default,
          density: r.density.default,
          brightness: r.brightness.default,
          temperature: r.temperature.default,
          scale: meta.scales[0],
          music_generation_mode: meta.modes[0],
          mute_bass: false,
          mute_drums: false,
          only_bass_and_drums: false,
        })
      })
      .catch((e: unknown) =>
        setMetadataError(e instanceof Error ? e.message : "Failed to load RealTime metadata"),
      )
    return () => {
      cancelled = true
    }
  }, [])

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      wsRef.current?.close()
      void playerRef.current?.close()
    }
  }, [])

  const sendControl = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }, [])

  const cleanPrompts = useCallback(
    () => prompts.filter((p) => p.text.trim().length > 0),
    [prompts],
  )

  const handleConnect = useCallback(async () => {
    if (state === "connecting" || state === "playing") return
    setError(null)
    setNotices([])

    const player = new PcmStreamPlayer({
      onBufferedChange: setBufferedAhead,
    })
    player.setVolume(volume)
    await player.resume()
    playerRef.current = player

    setState("connecting")
    const ws = new WebSocket(apiClient.getMusicRealtimeWsUrl())
    ws.binaryType = "arraybuffer"
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "start",
          prompts: cleanPrompts(),
          config,
        }),
      )
    }

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data) as { type: string; state?: string; message?: string; text?: string }
          if (msg.type === "status" && msg.state) {
            if (msg.state === "playing") setState("playing")
            else if (msg.state === "paused") setState("paused")
            else if (msg.state === "stopped") setState("stopped")
          } else if (msg.type === "filtered" && msg.text) {
            setNotices((n) => [...n, `Filtered: ${msg.text}`])
          } else if (msg.type === "error" && msg.message) {
            setError(msg.message)
          }
        } catch {
          // ignore malformed control frame
        }
      } else if (event.data instanceof ArrayBuffer) {
        playerRef.current?.enqueue(event.data)
      }
    }

    ws.onerror = () => {
      setError("WebSocket connection error")
      setState("error")
    }

    ws.onclose = () => {
      wsRef.current = null
      setState((s) => (s === "error" ? s : "idle"))
      setBufferedAhead(0)
    }
  }, [state, config, volume, cleanPrompts])

  const handlePauseResume = useCallback(() => {
    if (state === "playing") {
      sendControl({ type: "pause" })
    } else if (state === "paused" || state === "stopped") {
      void playerRef.current?.resume()
      sendControl({ type: "play" })
    }
  }, [state, sendControl])

  const handleStop = useCallback(() => {
    sendControl({ type: "stop" })
    playerRef.current?.flush()
  }, [sendControl])

  const handleReset = useCallback(() => {
    sendControl({ type: "reset" })
    playerRef.current?.flush()
  }, [sendControl])

  const handleDisconnect = useCallback(() => {
    wsRef.current?.close()
    void playerRef.current?.close()
    playerRef.current = null
    setState("idle")
    setBufferedAhead(0)
  }, [])

  const applyPrompts = useCallback(() => {
    sendControl({ type: "set_prompts", prompts: prompts.filter((p) => p.text.trim()) })
  }, [prompts, sendControl])

  const updateConfig = useCallback(
    (patch: Partial<LiveMusicConfig>, send = true) => {
      setConfig((c) => ({ ...c, ...patch }))
      if (send) sendControl({ type: "set_config", config: patch })
    },
    [sendControl],
  )

  const handleVolume = useCallback((v: number) => {
    setVolume(v)
    playerRef.current?.setVolume(v)
  }, [])

  const isLive = state === "playing" || state === "paused" || state === "stopped" || state === "connecting"

  if (metadataError) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="pt-6">
          <p className="text-sm text-red-500">{metadataError}</p>
          <p className="text-xs text-zinc-500 mt-2">
            Make sure the backend is running and exposes <code>/music/realtime/metadata</code>.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!metadata) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading RealTime controls…
        </CardContent>
      </Card>
    )
  }

  const r = metadata.config_ranges

  return (
    <div className="space-y-6">
      {/* Transport */}
      <Card className="border border-indigo-500/30 bg-indigo-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className={`h-4 w-4 ${state === "playing" ? "text-emerald-500 animate-pulse" : "text-indigo-500"}`} />
              Lyria RealTime
              <span className="text-xs font-mono font-normal text-zinc-500 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800">
                {state}
              </span>
            </CardTitle>
            {isLive && (
              <span className="text-xs text-zinc-500 tabular-nums">
                buffer {bufferedAhead.toFixed(1)}s
              </span>
            )}
          </div>
          <CardDescription>
            Continuous, steerable stream — change prompts and knobs live. 48 kHz stereo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {!isLive ? (
              <Button onClick={handleConnect} className="pulse-glow gap-2">
                <Play className="h-4 w-4" /> Start stream
              </Button>
            ) : (
              <>
                <Button
                  onClick={handlePauseResume}
                  disabled={state === "connecting"}
                  variant="outline"
                  className="gap-2"
                >
                  {state === "playing" ? (
                    <><Pause className="h-4 w-4" /> Pause</>
                  ) : (
                    <><Play className="h-4 w-4" /> Resume</>
                  )}
                </Button>
                <Button onClick={handleStop} variant="outline" className="gap-2">
                  <Square className="h-4 w-4" /> Stop
                </Button>
                <Button onClick={handleReset} variant="outline" className="gap-2" title="Reset musical context">
                  <RotateCcw className="h-4 w-4" /> Reset
                </Button>
                <Button onClick={handleDisconnect} variant="ghost" className="gap-2 text-red-500">
                  <X className="h-4 w-4" /> Disconnect
                </Button>
              </>
            )}
            <div className="flex items-center gap-2 ml-auto min-w-[140px]">
              <Volume2 className="h-4 w-4 text-zinc-500 shrink-0" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => handleVolume(Number(e.target.value))}
                className={SLIDER_CLASS}
                aria-label="Volume"
              />
            </div>
          </div>

          {state === "connecting" && (
            <p className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Connecting & buffering…
            </p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {notices.length > 0 && (
            <div className="space-y-1">
              {notices.map((n, i) => (
                <p key={i} className="text-xs text-amber-600 dark:text-amber-400">{n}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weighted prompt mixer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Prompt mix</CardTitle>
          <CardDescription>
            Blend multiple text prompts. Higher weight = more influence. Changes apply live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {prompts.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <Textarea
                value={p.text}
                onChange={(e) => {
                  const text = e.target.value
                  setPrompts((prev) => prev.map((pp, j) => (j === i ? { ...pp, text } : pp)))
                }}
                onBlur={applyPrompts}
                rows={1}
                placeholder="e.g. driving bassline, lush pads…"
                className="resize-none text-sm min-h-[40px]"
              />
              <div className="flex flex-col items-center gap-1 w-28 shrink-0 pt-1">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={p.weight}
                  onChange={(e) => {
                    const weight = Number(e.target.value)
                    setPrompts((prev) => prev.map((pp, j) => (j === i ? { ...pp, weight } : pp)))
                  }}
                  onPointerUp={applyPrompts}
                  className={SLIDER_CLASS}
                  aria-label={`Weight for prompt ${i + 1}`}
                />
                <span className="text-[10px] tabular-nums text-zinc-500">{p.weight.toFixed(2)}</span>
              </div>
              <button
                onClick={() => {
                  setPrompts((prev) => prev.filter((_, j) => j !== i))
                  setTimeout(applyPrompts, 0)
                }}
                disabled={prompts.length <= 1}
                className="mt-1.5 text-zinc-400 hover:text-red-500 disabled:opacity-30"
                aria-label="Remove prompt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPrompts((prev) => [...prev, { text: "", weight: 1.0 }])}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Add prompt
            </Button>
            <Button variant="ghost" size="sm" onClick={applyPrompts} className="text-xs">
              Apply mix
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Steerable config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Controls</CardTitle>
          <CardDescription>
            Tweak the generation in real time. BPM & scale apply on the next bar (context reset).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
            <KnobSlider label="BPM" value={config.bpm ?? r.bpm.default} min={r.bpm.min} max={r.bpm.max} step={r.bpm.step}
              onChange={(v) => updateConfig({ bpm: v }, false)} onCommit={(v) => updateConfig({ bpm: v })} format={(v) => String(v)} />
            <KnobSlider label="Guidance" value={config.guidance ?? r.guidance.default} min={r.guidance.min} max={r.guidance.max} step={r.guidance.step}
              onChange={(v) => updateConfig({ guidance: v }, false)} onCommit={(v) => updateConfig({ guidance: v })} format={(v) => v.toFixed(1)} />
            <KnobSlider label="Density" value={config.density ?? r.density.default} min={r.density.min} max={r.density.max} step={r.density.step}
              onChange={(v) => updateConfig({ density: v }, false)} onCommit={(v) => updateConfig({ density: v })} format={(v) => v.toFixed(2)} />
            <KnobSlider label="Brightness" value={config.brightness ?? r.brightness.default} min={r.brightness.min} max={r.brightness.max} step={r.brightness.step}
              onChange={(v) => updateConfig({ brightness: v }, false)} onCommit={(v) => updateConfig({ brightness: v })} format={(v) => v.toFixed(2)} />
            <KnobSlider label="Temperature" value={config.temperature ?? r.temperature.default} min={r.temperature.min} max={r.temperature.max} step={r.temperature.step}
              onChange={(v) => updateConfig({ temperature: v }, false)} onCommit={(v) => updateConfig({ temperature: v })} format={(v) => v.toFixed(1)} />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Scale</label>
              <Select value={config.scale} onValueChange={(v) => updateConfig({ scale: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metadata.scales.map((s) => (
                    <SelectItem key={s} value={s}>{formatScale(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Generation mode</label>
              <Select value={config.music_generation_mode} onValueChange={(v) => updateConfig({ music_generation_mode: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metadata.modes.map((m) => (
                    <SelectItem key={m} value={m}>{formatScale(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Toggle label="Mute bass" active={!!config.mute_bass} onClick={() => updateConfig({ mute_bass: !config.mute_bass })} />
            <Toggle label="Mute drums" active={!!config.mute_drums} onClick={() => updateConfig({ mute_drums: !config.mute_drums })} />
            <Toggle label="Only bass & drums" active={!!config.only_bass_and_drums} onClick={() => updateConfig({ only_bass_and_drums: !config.only_bass_and_drums })} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface KnobSliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  onCommit: (v: number) => void
  format: (v: number) => string
}

function KnobSlider({ label, value, min, max, step, onChange, onCommit, format }: KnobSliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
        <span className="text-xs tabular-nums text-indigo-600 dark:text-indigo-400">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        className={SLIDER_CLASS}
        aria-label={label}
      />
    </div>
  )
}

interface ToggleProps {
  label: string
  active: boolean
  onClick: () => void
}

function Toggle({ label, active, onClick }: ToggleProps) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
        active
          ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-600 dark:text-indigo-400"
          : "border-zinc-200/50 dark:border-zinc-800/50 text-zinc-500 hover:border-indigo-500/30"
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}
