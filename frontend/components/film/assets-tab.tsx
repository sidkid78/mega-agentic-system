"use client"

import { useRef } from "react"
import { ArrowRight, Loader2, MapPin, Mic, Package, Plus, RefreshCw, Sparkles, Trash2, Upload, User, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { ASSET_KINDS, newId, type AssetKind, type FilmAsset, type FilmProject } from "@/lib/film/types"
import { assetAspectRatio, assetImagePrompt } from "@/lib/film/prompts"
import { fileToMedia, generateImage, mergeBreakdown, runBreakdown, runPool } from "@/lib/film/client"
import type { Jobs } from "@/lib/film/use-jobs"
import { VOICE_PRESETS } from "@/lib/film/voices"
import { ErrorNote, MediaFrame, inputClass, type FilmTabProps } from "@/components/film/shared"

const KIND_META: Record<AssetKind, { title: string; icon: typeof User; blurb: string; aspect: string }> = {
    character: {
        title: "Characters",
        icon: User,
        blurb: "Reference sheets keep faces and wardrobe identical from frame to frame.",
        aspect: "aspect-[3/2]",
    },
    location: {
        title: "Locations",
        icon: MapPin,
        blurb: "Establishing plates set the terrain, light and time of day for each scene.",
        aspect: "aspect-video",
    },
    prop: {
        title: "Props",
        icon: Package,
        blurb: "Vehicles, weapons and signature items — drawn once, reused in every shot.",
        aspect: "aspect-[4/3]",
    },
}

export const assetJobKey = (id: string) => `asset:${id}`

/** Draws one asset and stores the image. Shared with the storyboard's "autofill everything". */
export function drawAsset(
    asset: FilmAsset,
    project: FilmProject,
    update: FilmTabProps["update"],
    jobs: Jobs,
) {
    return jobs.run(assetJobKey(asset.id), async () => {
        const image = await generateImage(
            assetImagePrompt(asset, project.style),
            assetAspectRatio(asset, project),
        )
        update((p) => ({ ...p, assets: p.assets.map((a) => (a.id === asset.id ? { ...a, image } : a)) }))
    })
}

export function AssetsTab({ project, update, jobs, goTo }: FilmTabProps) {
    const missing = project.assets.filter((a) => !a.image && a.description.trim())

    const handleAutofill = (kind?: AssetKind) => {
        const todo = missing.filter((a) => !kind || a.kind === kind).filter((a) => !jobs.isBusy(assetJobKey(a.id)))
        return runPool(todo, 3, (a) => drawAsset(a, project, update, jobs).then(() => undefined))
    }

    const handleRebreakdown = () =>
        jobs.run("breakdown", async () => {
            const result = await runBreakdown(project)
            update((p) => mergeBreakdown(p, result))
        })

    if (project.assets.length === 0) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                    <Sparkles className="h-8 w-8 text-indigo-500" />
                    <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-300">
                        No assets yet. Write your scenes, then run the breakdown to pull out
                        characters, locations and props — or add them by hand below.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Button onClick={() => goTo("script")} variant="outline">Back to script</Button>
                        <Button onClick={handleRebreakdown} disabled={jobs.isBusy("breakdown")}>
                            {jobs.isBusy("breakdown") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            Run breakdown
                        </Button>
                    </div>
                    <ErrorNote message={jobs.errors.breakdown} onDismiss={() => jobs.clearError("breakdown")} />
                    <div className="flex gap-2 pt-2">
                        {ASSET_KINDS.map((k) => (
                            <AddAssetButton key={k} kind={k} update={update} />
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-center gap-2 rounded-xl glass-card border border-zinc-200/50 dark:border-zinc-800/50 p-3">
                <p className="flex-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {missing.length
                        ? `${missing.length} asset${missing.length === 1 ? "" : "s"} still need an image.`
                        : "Every asset has an image — on to the storyboard."}
                </p>
                <Button variant="outline" size="sm" onClick={handleRebreakdown} disabled={jobs.isBusy("breakdown")}>
                    {jobs.isBusy("breakdown") ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                    Re-run breakdown
                </Button>
                <Button size="sm" onClick={() => handleAutofill()} disabled={missing.length === 0}>
                    <Wand2 className="mr-1 h-4 w-4" /> Autofill all ({missing.length})
                </Button>
                <Button size="sm" variant="outline" onClick={() => goTo("storyboard")}>
                    Storyboard <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
            </div>
            <ErrorNote message={jobs.errors.breakdown} onDismiss={() => jobs.clearError("breakdown")} />

            {ASSET_KINDS.map((kind) => {
                const meta = KIND_META[kind]
                const items = project.assets.filter((a) => a.kind === kind)
                const kindMissing = missing.filter((a) => a.kind === kind).length
                const Icon = meta.icon
                return (
                    <section key={kind} className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Icon className="h-5 w-5 text-indigo-500" />
                            <h2 className="text-lg font-semibold">{meta.title} ({items.length})</h2>
                            <span className="hidden text-xs text-zinc-500 dark:text-zinc-400 md:inline">{meta.blurb}</span>
                            <div className="flex-1" />
                            <Button size="sm" variant="outline" onClick={() => handleAutofill(kind)} disabled={kindMissing === 0}>
                                <Wand2 className="mr-1 h-4 w-4" /> Autofill {kindMissing ? `(${kindMissing})` : ""}
                            </Button>
                            <AddAssetButton kind={kind} update={update} />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {items.map((asset) => (
                                <AssetCard
                                    key={asset.id}
                                    asset={asset}
                                    aspect={meta.aspect}
                                    project={project}
                                    update={update}
                                    jobs={jobs}
                                />
                            ))}
                        </div>
                    </section>
                )
            })}
        </div>
    )
}

function AddAssetButton({ kind, update }: { kind: AssetKind; update: FilmTabProps["update"] }) {
    return (
        <Button
            size="sm"
            variant="outline"
            onClick={() =>
                update((p) => ({
                    ...p,
                    assets: [...p.assets, { id: newId(), kind, name: `New ${kind}`, description: "" }],
                }))
            }
        >
            <Plus className="mr-1 h-4 w-4" /> {kind[0].toUpperCase() + kind.slice(1)}
        </Button>
    )
}

function AssetCard({
    asset,
    aspect,
    project,
    update,
    jobs,
}: {
    asset: FilmAsset
    aspect: string
    project: FilmProject
    update: FilmTabProps["update"]
    jobs: Jobs
}) {
    const fileRef = useRef<HTMLInputElement>(null)
    const key = assetJobKey(asset.id)
    const isBusy = jobs.isBusy(key)

    const set = (patch: Partial<FilmAsset>) =>
        update((p) => ({ ...p, assets: p.assets.map((a) => (a.id === asset.id ? { ...a, ...patch } : a)) }))

    const handleDelete = () =>
        update((p) => ({
            ...p,
            assets: p.assets.filter((a) => a.id !== asset.id),
            // Unlink it everywhere it was used.
            scenes: p.scenes.map((s) => ({
                ...s,
                locationId: s.locationId === asset.id ? undefined : s.locationId,
                characterIds: s.characterIds.filter((id) => id !== asset.id),
                propIds: s.propIds.filter((id) => id !== asset.id),
                shots: s.shots.map((sh) => ({
                    ...sh,
                    characterIds: sh.characterIds.filter((id) => id !== asset.id),
                    propIds: sh.propIds.filter((id) => id !== asset.id),
                })),
            })),
        }))

    const usedIn = project.scenes
        .map((s, i) =>
            s.locationId === asset.id || s.characterIds.includes(asset.id) || s.propIds.includes(asset.id)
                ? i + 1
                : null,
        )
        .filter(Boolean)

    return (
        <Card>
            <CardContent className="space-y-2 p-3">
                <MediaFrame
                    image={asset.image}
                    alt={asset.name}
                    isBusy={isBusy}
                    aspectClass={aspect}
                    emptyLabel="Autofill or upload"
                />
                <input
                    className={`${inputClass} font-medium`}
                    value={asset.name}
                    aria-label="Asset name"
                    onChange={(e) => set({ name: e.target.value })}
                />
                <Textarea
                    rows={3}
                    className="resize-none text-xs"
                    value={asset.description}
                    placeholder="What it looks like — the image is drawn from this."
                    aria-label={`${asset.name} description`}
                    onChange={(e) => set({ description: e.target.value })}
                />
                {asset.kind === "character" && <VoiceField asset={asset} onChange={(voiceId) => set({ voiceId })} />}
                {usedIn.length > 0 && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">In scene {usedIn.join(", ")}</p>
                )}
                <div className="flex gap-1">
                    <Button
                        size="sm"
                        className="flex-1"
                        disabled={isBusy || !asset.description.trim()}
                        onClick={() => drawAsset(asset, project, update, jobs)}
                    >
                        <Wand2 className="mr-1 h-3.5 w-3.5" /> {asset.image ? "Redraw" : "Autofill"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} aria-label="Upload image">
                        <Upload className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="hover:text-red-500" onClick={handleDelete} aria-label={`Delete ${asset.name}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
                <ErrorNote message={jobs.errors[key]} onDismiss={() => jobs.clearError(key)} />
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ""
                        if (file) set({ image: await fileToMedia(file) })
                    }}
                />
            </CardContent>
        </Card>
    )
}

/** A character's dubbing voice: a saved preset, or any voice id pasted in. */
function VoiceField({ asset, onChange }: { asset: FilmAsset; onChange: (voiceId: string | undefined) => void }) {
    const listId = `voices-${asset.id}`
    const preset = VOICE_PRESETS.find((v) => v.id === asset.voiceId)
    return (
        <div className="space-y-1">
            <label className="flex items-center gap-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                <Mic className="h-3 w-3" /> Voice {preset && <span className="text-indigo-600 dark:text-indigo-400">· {preset.name}</span>}
            </label>
            <input
                className={`${inputClass} font-mono text-xs`}
                list={listId}
                value={asset.voiceId ?? ""}
                placeholder="voice_… id — empty lets Omni voice them"
                aria-label={`${asset.name} voice id`}
                onChange={(e) => onChange(e.target.value.trim() || undefined)}
            />
            <datalist id={listId}>
                {VOICE_PRESETS.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                ))}
            </datalist>
            {VOICE_PRESETS.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {VOICE_PRESETS.map((v) => (
                        <button
                            key={v.id}
                            type="button"
                            onClick={() => onChange(asset.voiceId === v.id ? undefined : v.id)}
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                asset.voiceId === v.id
                                    ? "border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                                    : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                            }`}
                        >
                            {v.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
