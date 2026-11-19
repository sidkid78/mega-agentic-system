"use client"

import { useEffect, useMemo, useState } from "react"
import { Clapperboard, Download, Loader2, Mic, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OMNI_RESOLUTIONS } from "@/lib/omni-video-options"
import type { FilmProject, FilmScene, MediaRef } from "@/lib/film/types"
import { sceneVideoPrompt } from "@/lib/film/prompts"
import { dubVideo, mediaUrl, shootVideo } from "@/lib/film/client"
import { sceneDubLines } from "@/lib/film/voices"
import type { Jobs } from "@/lib/film/use-jobs"
import { ErrorNote, type FilmTabProps } from "@/components/film/shared"

const shootKey = (sceneId: string) => `shoot:${sceneId}`
const dubKey = (sceneId: string) => `dub:${sceneId}`

/** How loud Omni's own soundtrack stays under the dubbed lines. */
const ORIGINAL_LEVELS = [
    { value: "0.35", label: "Ambience low" },
    { value: "0.7", label: "Ambience high" },
    { value: "0", label: "Voices only" },
] as const

function shootScene(
    scene: FilmScene,
    project: FilmProject,
    update: FilmTabProps["update"],
    jobs: Jobs,
    opts: { startOnFirstFrame: boolean; resolution: string },
) {
    return jobs.run(shootKey(scene.id), async (setStatus) => {
        const built = sceneVideoPrompt(scene, project, { startOnFirstFrame: opts.startOnFirstFrame })
        const video = await shootVideo(
            {
                prompt: built.prompt,
                images: built.images,
                aspectRatio: project.aspectRatio,
                resolution: opts.resolution,
                durationSeconds: scene.durationSeconds,
            },
            setStatus,
        )
        // A reshoot invalidates the old dub.
        update((p) => ({
            ...p,
            scenes: p.scenes.map((s) => (s.id === scene.id ? { ...s, video, dubbedVideo: undefined } : s)),
        }))
    })
}

function dubScene(scene: FilmScene, project: FilmProject, update: FilmTabProps["update"], jobs: Jobs, level: number) {
    return jobs.run(dubKey(scene.id), async (setStatus) => {
        if (!scene.video) throw new Error("Shoot the scene first")
        const lines = sceneDubLines(scene, project).filter((l) => l.voice)
        setStatus(`Voicing ${lines.length} line${lines.length === 1 ? "" : "s"} & mixing…`)
        const result = await dubVideo(scene.video, lines, level)
        update((p) => ({
            ...p,
            scenes: p.scenes.map((s) => (s.id === scene.id ? { ...s, dubbedVideo: result.video } : s)),
        }))
        if (result.warnings.length) throw new Error(`Dubbed, but: ${result.warnings.join(" · ")}`)
    })
}

export function ShootTab({ project, update, jobs, goTo }: FilmTabProps) {
    const [resolution, setResolution] = useState("720p")
    const [startOnFirst, setStartOnFirst] = useState<Record<string, boolean>>({})

    const ready = project.scenes.filter((s) => s.shots.some((sh) => sh.image))

    const handleShootAll = () =>
        Promise.all(
            ready
                .filter((s) => !jobs.isBusy(shootKey(s.id)))
                .map((s) =>
                    shootScene(s, project, update, jobs, {
                        startOnFirstFrame: startOnFirst[s.id] ?? false,
                        resolution,
                    }),
                ),
        )

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 rounded-xl glass-card border border-zinc-200/50 dark:border-zinc-800/50 p-3">
                <p className="flex-1 text-sm text-zinc-600 dark:text-zinc-300">
                    Each scene becomes one Omni clip. Its storyboard frames go in as reference images,
                    tied to their timecodes, with the dialogue in quotes.
                </p>
                <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger className="h-8 w-28" aria-label="Resolution"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {OMNI_RESOLUTIONS.map((r) => (
                            <SelectItem key={r} value={r}>{r.toUpperCase()}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button size="sm" onClick={handleShootAll} disabled={ready.length === 0}>
                    <Clapperboard className="mr-1 h-4 w-4" /> Shoot all ({ready.length})
                </Button>
            </div>

            {project.scenes.map((scene, i) => (
                <SceneShoot
                    key={scene.id}
                    index={i}
                    scene={scene}
                    project={project}
                    update={update}
                    jobs={jobs}
                    goTo={goTo}
                    resolution={resolution}
                    startOnFirstFrame={startOnFirst[scene.id] ?? false}
                    onStartOnFirstFrame={(v) => setStartOnFirst((m) => ({ ...m, [scene.id]: v }))}
                />
            ))}
        </div>
    )
}

function SceneShoot({
    index,
    scene,
    project,
    update,
    jobs,
    goTo,
    resolution,
    startOnFirstFrame,
    onStartOnFirstFrame,
}: FilmTabProps & {
    index: number
    scene: FilmScene
    resolution: string
    startOnFirstFrame: boolean
    onStartOnFirstFrame: (v: boolean) => void
}) {
    const [isPromptOpen, setIsPromptOpen] = useState(false)
    const [level, setLevel] = useState<string>(ORIGINAL_LEVELS[0].value)
    const [showDub, setShowDub] = useState(true)
    const key = shootKey(scene.id)
    const dKey = dubKey(scene.id)
    const isDubbing = jobs.isBusy(dKey)
    const dubLines = useMemo(() => sceneDubLines(scene, project), [scene, project])
    const voicedCount = dubLines.filter((l) => l.voice).length
    const isBusy = jobs.isBusy(key)
    const frames = scene.shots.filter((s) => s.image)
    const built = useMemo(
        () => sceneVideoPrompt(scene, project, { startOnFirstFrame }),
        [scene, project, startOnFirstFrame],
    )

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="font-mono text-base uppercase">
                    Scene {index + 1} · {scene.heading || "Untitled"}
                </CardTitle>
                <CardDescription>
                    {scene.durationSeconds}s · {frames.length} frame{frames.length === 1 ? "" : "s"}
                    {scene.shots.length > frames.length && ` (${scene.shots.length - frames.length} card(s) without a frame)`}
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                    {frames.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center text-sm text-zinc-500">
                            No frames yet.{" "}
                            <button className="underline" onClick={() => goTo("storyboard")}>Build the storyboard</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-1">
                            {frames.map((s) => (
                                <div key={s.id} className="relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={mediaUrl(s.image!)} alt={s.description} className="aspect-video w-full rounded object-cover" />
                                    <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[10px] text-white">
                                        {s.start}–{s.end}s
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-indigo-500" checked={startOnFirstFrame}
                            onChange={(e) => onStartOnFirstFrame(e.target.checked)} disabled={frames.length === 0} />
                        Open on frame 1 exactly (instead of using it as a reference)
                    </label>

                    {built.warnings.length > 0 && frames.length > 0 && (
                        <ul className="list-inside list-disc rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                            {built.warnings.map((w) => <li key={w}>{w}</li>)}
                        </ul>
                    )}

                    <div className="rounded-lg border border-zinc-200/60 dark:border-zinc-800/60">
                        <button onClick={() => setIsPromptOpen((v) => !v)} aria-expanded={isPromptOpen}
                            className="flex w-full justify-between px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                            Prompt sent to Omni <span>{isPromptOpen ? "Hide" : "Show"}</span>
                        </button>
                        {isPromptOpen && (
                            <pre className="max-h-56 overflow-auto whitespace-pre-wrap border-t border-zinc-200/60 dark:border-zinc-800/60 px-3 py-2 text-[11px] leading-relaxed">
                                {built.prompt}
                            </pre>
                        )}
                    </div>

                    <Button className="w-full pulse-glow" disabled={isBusy || frames.length === 0}
                        onClick={() => shootScene(scene, project, update, jobs, { startOnFirstFrame, resolution })}>
                        {isBusy ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {jobs.busy[key] || "Shooting…"}</>
                        ) : (
                            <><Play className="mr-2 h-4 w-4" /> {scene.video ? "Reshoot scene" : "Shoot scene"}</>
                        )}
                    </Button>
                    <ErrorNote message={jobs.errors[key]} onDismiss={() => jobs.clearError(key)} />
                </div>

                <div className="space-y-3">
                    {scene.video && scene.dubbedVideo && (
                        <div className="flex gap-1 text-xs" role="group" aria-label="Which version to play">
                            {[true, false].map((dub) => (
                                <button key={String(dub)} onClick={() => setShowDub(dub)} aria-pressed={showDub === dub}
                                    className={`rounded-full border px-3 py-1 ${showDub === dub
                                        ? "border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                                        : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"}`}>
                                    {dub ? "Dubbed" : "Omni original"}
                                </button>
                            ))}
                        </div>
                    )}
                    {scene.video ? (
                        <ScenePlayer
                            video={scene.dubbedVideo && showDub ? scene.dubbedVideo : scene.video}
                            filename={`scene-${index + 1}${scene.dubbedVideo && showDub ? "-dubbed" : ""}.mp4`}
                        />
                    ) : (
                        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500">
                            {isBusy ? "Rendering — Omni usually takes 30s–3 min" : "The clip will appear here"}
                        </div>
                    )}

                    {dubLines.length > 0 && (
                        <div className="space-y-2 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 p-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <Mic className="h-4 w-4 text-indigo-500" /> Voices
                                <span className="text-xs font-normal text-zinc-500">
                                    {voicedCount}/{dubLines.length} line{dubLines.length === 1 ? "" : "s"} dubbed
                                </span>
                            </div>
                            <ul className="space-y-1 text-xs">
                                {dubLines.map((l, i) => (
                                    <li key={`${l.shotId}-${i}`} className="flex gap-2">
                                        <span className="w-10 shrink-0 font-mono text-zinc-500">{l.start}s</span>
                                        <span className="min-w-0 flex-1">
                                            <b>{l.speaker || "—"}</b>{l.style && <i className="text-zinc-500"> ({l.style})</i>}: {l.text}
                                        </span>
                                        <span className={l.voice ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}>
                                            {l.voice ? "own voice" : "Omni"}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            {voicedCount === 0 ? (
                                <p className="text-xs text-zinc-500">
                                    Give a character a voice on the{" "}
                                    <button className="underline" onClick={() => goTo("assets")}>Assets tab</button>{" "}
                                    to dub their lines. Do it before shooting, so Omni leaves those lines silent.
                                </p>
                            ) : (
                                <div className="flex gap-2">
                                    <Select value={level} onValueChange={setLevel}>
                                        <SelectTrigger className="h-8 w-36" aria-label="Omni soundtrack level"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {ORIGINAL_LEVELS.map((o) => (
                                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button size="sm" className="flex-1" disabled={!scene.video || isDubbing || isBusy}
                                        onClick={() => dubScene(scene, project, update, jobs, Number(level)).then((ok) => ok && setShowDub(true))}>
                                        {isDubbing
                                            ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> {jobs.busy[dKey] || "Dubbing…"}</>
                                            : <><Mic className="mr-1 h-4 w-4" /> {scene.dubbedVideo ? "Re-dub" : "Dub voices"}</>}
                                    </Button>
                                </div>
                            )}
                            <ErrorNote message={jobs.errors[dKey]} onDismiss={() => jobs.clearError(dKey)} />
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

function ScenePlayer({ video, filename }: { video: MediaRef; filename: string }) {
    // Object URL, not a data: URL — large MP4s won't seek or start from data: URIs.
    const src = useMemo(() => {
        const bytes = Uint8Array.from(atob(video.base64), (c) => c.charCodeAt(0))
        return URL.createObjectURL(new Blob([bytes], { type: video.mimeType }))
    }, [video])
    useEffect(() => () => URL.revokeObjectURL(src), [src])

    return (
        <div className="space-y-2">
            <video key={src} src={src} controls className="w-full rounded-lg border border-zinc-200/60 dark:border-zinc-800/60" />
            <Button variant="outline" size="sm" className="w-full" asChild>
                <a href={src} download={filename}>
                    <Download className="mr-2 h-4 w-4" /> Download clip
                </a>
            </Button>
        </div>
    )
}
