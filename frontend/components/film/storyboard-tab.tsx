"use client"

import { ArrowRight, LayoutGrid, Loader2, Plus, Trash2, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OMNI_DURATIONS } from "@/lib/omni-video-options"
import {
    MAX_SHOTS_PER_SCENE,
    newId,
    type FilmAsset,
    type FilmProject,
    type FilmScene,
    type StoryboardShot,
} from "@/lib/film/types"
import { assetAspectRatio, assetImagePrompt, framePrompt } from "@/lib/film/prompts"
import { fitShots, generateImage, planStoryboard, runPool } from "@/lib/film/client"
import type { Jobs } from "@/lib/film/use-jobs"
import { ErrorNote, MediaFrame, inputClass, type FilmTabProps } from "@/components/film/shared"

const frameKey = (shotId: string) => `frame:${shotId}`
const sceneKey = (sceneId: string) => `board:${sceneId}`

type Update = FilmTabProps["update"]

function patchShot(update: Update, sceneId: string, shotId: string, patch: Partial<StoryboardShot>) {
    update((p) => ({
        ...p,
        scenes: p.scenes.map((s) =>
            s.id === sceneId
                ? { ...s, shots: s.shots.map((sh) => (sh.id === shotId ? { ...sh, ...patch } : sh)) }
                : s,
        ),
    }))
}

function drawFrame(shot: StoryboardShot, scene: FilmScene, project: FilmProject, update: Update, jobs: Jobs) {
    return jobs.run(frameKey(shot.id), async () => {
        const { prompt, images } = framePrompt(shot, scene, project)
        const image = await generateImage(prompt, project.aspectRatio, images)
        patchShot(update, scene.id, shot.id, { image })
    })
}

/**
 * The full autofill: draw any of the scene's assets that lack an image, plan
 * the shots (unless some exist and `replan` is false), then draw every frame.
 * Works on a local copy of the project so each step sees the previous one's
 * results without waiting for React state.
 */
async function autofillScene(
    sceneId: string,
    project: FilmProject,
    update: Update,
    jobs: Jobs,
    setStatus: (msg: string) => void,
    replan: boolean,
): Promise<FilmProject> {
    let local = project
    const scene0 = local.scenes.find((s) => s.id === sceneId)
    if (!scene0) return local

    // 1. Assets this scene uses that have no image yet.
    const used = new Set([
        ...(scene0.locationId ? [scene0.locationId] : []),
        ...scene0.characterIds,
        ...scene0.propIds,
        ...scene0.shots.flatMap((s) => [...s.characterIds, ...s.propIds]),
    ])
    const missing = local.assets.filter((a) => used.has(a.id) && !a.image && a.description.trim())
    if (missing.length) {
        setStatus(`Drawing ${missing.length} missing asset${missing.length === 1 ? "" : "s"}…`)
        const drawn = new Map<string, FilmAsset>()
        await runPool(missing, 3, async (a) => {
            const image = await generateImage(assetImagePrompt(a, local.style), assetAspectRatio(a, local))
            drawn.set(a.id, { ...a, image })
        })
        const merge = (assets: FilmAsset[]) => assets.map((a) => drawn.get(a.id) ?? a)
        local = { ...local, assets: merge(local.assets) }
        update((p) => ({ ...p, assets: p.assets.map((a) => (drawn.has(a.id) ? { ...a, image: drawn.get(a.id)!.image } : a)) }))
    }

    // 2. Plan the shots.
    let scene = local.scenes.find((s) => s.id === sceneId)!
    if (replan || scene.shots.length === 0) {
        setStatus("Planning shots…")
        const shots = await planStoryboard(local, sceneId)
        scene = { ...scene, shots }
        local = { ...local, scenes: local.scenes.map((s) => (s.id === sceneId ? scene : s)) }
        update((p) => ({ ...p, scenes: p.scenes.map((s) => (s.id === sceneId ? { ...s, shots } : s)) }))
    }

    // 3. Draw every frame that needs one (all of them after a replan).
    const todo = scene.shots.filter((s) => replan || !s.image)
    let done = 0
    let failed = 0
    setStatus(`Drawing frames 0/${todo.length}…`)
    await runPool(todo, 2, async (shot) => {
        if (!(await drawFrame(shot, scene, local, update, jobs))) failed++
        setStatus(`Drawing frames ${++done}/${todo.length}…`)
    })
    if (failed) throw new Error(`${failed} frame(s) failed — see the cards below.`)
    return local
}

export function StoryboardTab({ project, update, jobs, goTo }: FilmTabProps) {
    // Scenes run one after another, each starting from the previous one's
    // result, so a character shared by several scenes is drawn only once.
    const handleAutofillAll = async () => {
        let local = project
        for (const s of project.scenes) {
            await jobs.run(sceneKey(s.id), async (setStatus) => {
                local = await autofillScene(s.id, local, update, jobs, setStatus, false)
            })
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 rounded-xl glass-card border border-zinc-200/50 dark:border-zinc-800/50 p-3">
                <p className="flex-1 text-sm text-zinc-600 dark:text-zinc-300">
                    Up to {MAX_SHOTS_PER_SCENE} cards per scene. Each card&apos;s frame is drawn with the
                    scene&apos;s character, location and prop images as references, then becomes a reference
                    for the video.
                </p>
                <Button size="sm" onClick={handleAutofillAll}>
                    <Wand2 className="mr-1 h-4 w-4" /> Autofill all scenes
                </Button>
                <Button size="sm" variant="outline" onClick={() => goTo("shoot")}>
                    Shoot <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
            </div>

            {project.scenes.map((scene, i) => (
                <SceneBoard key={scene.id} index={i} scene={scene} project={project} update={update} jobs={jobs} />
            ))}
        </div>
    )
}

function SceneBoard({
    index,
    scene,
    project,
    update,
    jobs,
}: {
    index: number
    scene: FilmScene
    project: FilmProject
    update: Update
    jobs: Jobs
}) {
    const key = sceneKey(scene.id)
    const isBusy = jobs.isBusy(key)
    const byId = new Map(project.assets.map((a) => [a.id, a]))
    const locations = project.assets.filter((a) => a.kind === "location")
    const sceneAssets = [scene.locationId, ...scene.characterIds, ...scene.propIds]
        .map((id) => (id ? byId.get(id) : undefined))
        .filter(Boolean) as FilmAsset[]
    const lackingImages = sceneAssets.filter((a) => !a.image).length

    const setScene = (patch: Partial<FilmScene>) =>
        update((p) => ({ ...p, scenes: p.scenes.map((s) => (s.id === scene.id ? { ...s, ...patch } : s)) }))

    const handleAutofill = (replan: boolean) =>
        jobs.run(key, async (setStatus) => {
            await autofillScene(scene.id, project, update, jobs, setStatus, replan)
        })

    const handleAddCard = () => {
        const shots = [
            ...scene.shots,
            {
                id: newId(),
                start: 0,
                end: 0,
                description: "",
                camera: "",
                dialogue: "",
                characterIds: [...scene.characterIds],
                propIds: [],
            },
        ]
        setScene({ shots: fitShots(shots, scene.durationSeconds) })
    }

    const handleDuration = (seconds: number) =>
        setScene({ durationSeconds: seconds, shots: fitShots(scene.shots, seconds) })

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <CardTitle className="font-mono text-base uppercase">
                            Scene {index + 1} · {scene.heading || "Untitled"}
                        </CardTitle>
                        <CardDescription className="mt-1">{scene.summary || scene.body.slice(0, 160)}</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={scene.locationId ?? "none"} onValueChange={(v) => setScene({ locationId: v === "none" ? undefined : v })}>
                            <SelectTrigger className="h-8 w-44" aria-label="Scene location"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">No location</SelectItem>
                                {locations.map((l) => (
                                    <SelectItem key={l.id} value={l.id}>📍 {l.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={String(scene.durationSeconds)} onValueChange={(v) => handleDuration(Number(v))}>
                            <SelectTrigger className="h-8 w-[5.5rem]" aria-label="Clip length"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {OMNI_DURATIONS.map((d) => (
                                    <SelectItem key={d} value={d}>{d}s</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button size="sm" onClick={() => handleAutofill(scene.shots.length === 0)} disabled={isBusy}>
                            {isBusy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
                            {scene.shots.length ? "Fill missing frames" : "Autofill storyboard"}
                        </Button>
                        {scene.shots.length > 0 && (
                            <Button size="sm" variant="outline" onClick={() => handleAutofill(true)} disabled={isBusy}>
                                <LayoutGrid className="mr-1 h-4 w-4" /> Re-plan
                            </Button>
                        )}
                    </div>
                </div>
                {sceneAssets.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2">
                        {sceneAssets.map((a) => (
                            <span
                                key={a.id}
                                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                    a.image
                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                        : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                }`}
                                title={a.image ? "Has a reference image" : "No image yet — autofill draws it first"}
                            >
                                {a.kind === "character" ? "👤" : a.kind === "location" ? "📍" : "📦"} {a.name}
                            </span>
                        ))}
                    </div>
                )}
                {isBusy && <p className="pt-1 text-xs text-indigo-600 dark:text-indigo-400">{jobs.busy[key]}</p>}
                {!isBusy && lackingImages > 0 && (
                    <p className="pt-1 text-xs text-amber-700 dark:text-amber-400">
                        {lackingImages} asset{lackingImages === 1 ? "" : "s"} without an image — autofill will draw
                        {lackingImages === 1 ? " it" : " them"} first so frames stay consistent.
                    </p>
                )}
                <ErrorNote message={jobs.errors[key]} onDismiss={() => jobs.clearError(key)} />
            </CardHeader>
            <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {scene.shots.map((shot, i) => (
                        <ShotCard key={shot.id} index={i} shot={shot} scene={scene} project={project} update={update} jobs={jobs} />
                    ))}
                    {scene.shots.length < Math.min(MAX_SHOTS_PER_SCENE, scene.durationSeconds) && (
                        <button
                            onClick={handleAddCard}
                            className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500 hover:border-indigo-500/60"
                        >
                            <Plus className="h-5 w-5" />
                            Add card ({scene.shots.length}/{MAX_SHOTS_PER_SCENE})
                        </button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

function ShotCard({
    index,
    shot,
    scene,
    project,
    update,
    jobs,
}: {
    index: number
    shot: StoryboardShot
    scene: FilmScene
    project: FilmProject
    update: Update
    jobs: Jobs
}) {
    const key = frameKey(shot.id)
    const set = (patch: Partial<StoryboardShot>) => patchShot(update, scene.id, shot.id, patch)
    const toggle = (field: "characterIds" | "propIds", id: string) =>
        set({ [field]: shot[field].includes(id) ? shot[field].filter((x) => x !== id) : [...shot[field], id] })

    const chips = project.assets.filter((a) => a.kind !== "location")
    const numberClass = "h-7 w-12 rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-1 text-xs"

    return (
        <div className="space-y-2 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 p-2">
            <MediaFrame
                image={shot.image}
                alt={`Shot ${index + 1}`}
                isBusy={jobs.isBusy(key)}
                aspectClass={project.aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-video"}
                emptyLabel="Frame not drawn"
            />
            <div className="flex items-center gap-1 text-xs">
                <span className="font-semibold">#{index + 1}</span>
                <input type="number" min={0} max={scene.durationSeconds} value={shot.start} className={numberClass}
                    aria-label="Start second" onChange={(e) => set({ start: Number(e.target.value) })} />
                <span>–</span>
                <input type="number" min={1} max={scene.durationSeconds} value={shot.end} className={numberClass}
                    aria-label="End second" onChange={(e) => set({ end: Number(e.target.value) })} />
                <span className="text-zinc-500">s</span>
                <div className="flex-1" />
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={jobs.isBusy(key) || !shot.description.trim()}
                    onClick={() => drawFrame(shot, scene, project, update, jobs)}>
                    <Wand2 className="mr-1 h-3 w-3" /> {shot.image ? "Redraw" : "Draw"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-red-500" aria-label={`Delete shot ${index + 1}`}
                    onClick={() => update((p) => ({
                        ...p,
                        scenes: p.scenes.map((s) => s.id === scene.id
                            ? { ...s, shots: fitShots(s.shots.filter((x) => x.id !== shot.id), s.durationSeconds) }
                            : s),
                    }))}>
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <input className={`${inputClass} h-7 text-xs`} value={shot.camera} placeholder="Camera — e.g. low tracking shot"
                aria-label="Camera" onChange={(e) => set({ camera: e.target.value })} />
            <Textarea rows={3} className="resize-none text-xs" value={shot.description} placeholder="What we see"
                aria-label="Shot description" onChange={(e) => set({ description: e.target.value })} />
            <Textarea rows={1} className="min-h-0 resize-none text-xs" value={shot.dialogue} placeholder="MARA: Not for long."
                aria-label="Dialogue" onChange={(e) => set({ dialogue: e.target.value })} />
            {chips.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {chips.map((a) => {
                        const field = a.kind === "character" ? "characterIds" : "propIds"
                        const isOn = shot[field].includes(a.id)
                        return (
                            <button key={a.id} onClick={() => toggle(field, a.id)} aria-pressed={isOn}
                                className={`rounded-full border px-2 py-0.5 text-[11px] ${isOn
                                    ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                                    : "border-zinc-300 dark:border-zinc-700 text-zinc-500"}`}>
                                {a.kind === "character" ? "👤" : "📦"} {a.name}
                            </button>
                        )
                    })}
                </div>
            )}
            <ErrorNote message={jobs.errors[key]} onDismiss={() => jobs.clearError(key)} />
        </div>
    )
}
