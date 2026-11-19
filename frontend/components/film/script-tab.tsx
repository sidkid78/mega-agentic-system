"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, FileText, Loader2, Plus, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OMNI_DURATIONS } from "@/lib/omni-video-options"
import { emptyScene, type FilmScene } from "@/lib/film/types"
import { splitScreenplay } from "@/lib/film/prompts"
import { mergeBreakdown, runBreakdown } from "@/lib/film/client"
import { ErrorNote, inputClass, type FilmTabProps } from "@/components/film/shared"

const SAMPLE = `EXT. MOJAVE HIGHWAY - NOON
Heat shimmer over an empty two-lane road. A silver Porsche 911 Turbo tears past a bullet-riddled speed-limit sign.
Inside, MARA (30s, aviators, dust on her leather jacket) drives one-handed. Beside her, ELI (20s, nervous, clutching a duffel bag) checks the mirror.
ELI: They're still back there.
MARA: Not for long.
She drops a gear. The engine screams.`

export function ScriptTab({ project, update, jobs, goTo }: FilmTabProps) {
    const [isImportOpen, setIsImportOpen] = useState(false)
    const [importText, setImportText] = useState("")

    const setScene = (id: string, patch: Partial<FilmScene>) =>
        update((p) => ({ ...p, scenes: p.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))

    const moveScene = (index: number, delta: number) =>
        update((p) => {
            const scenes = [...p.scenes]
            const target = index + delta
            if (target < 0 || target >= scenes.length) return p
            ;[scenes[index], scenes[target]] = [scenes[target], scenes[index]]
            return { ...p, scenes }
        })

    const handleImport = (mode: "replace" | "append") => {
        const scenes = splitScreenplay(importText)
        if (scenes.length === 0) return
        update((p) => ({ ...p, scenes: mode === "replace" ? scenes : [...p.scenes, ...scenes] }))
        setImportText("")
        setIsImportOpen(false)
    }

    const handleBreakdown = () =>
        jobs.run("breakdown", async () => {
            const result = await runBreakdown(project)
            update((p) => mergeBreakdown(p, result))
            goTo("assets")
        })

    const hasScript = project.scenes.some((s) => s.body.trim() || s.heading.trim())
    const isBreakingDown = jobs.isBusy("breakdown")

    return (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <Card className="h-fit">
                <CardHeader>
                    <CardTitle>Project</CardTitle>
                    <CardDescription>The look here carries into every asset, frame and clip.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor="film-title">Title</label>
                        <input
                            id="film-title"
                            className={inputClass}
                            value={project.title}
                            onChange={(e) => update((p) => ({ ...p, title: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor="film-style">Visual style</label>
                        <Textarea
                            id="film-style"
                            rows={3}
                            className="resize-none text-sm"
                            value={project.style}
                            onChange={(e) => update((p) => ({ ...p, style: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium">Aspect ratio</label>
                        <Select
                            value={project.aspectRatio}
                            onValueChange={(v) => update((p) => ({ ...p, aspectRatio: v as "16:9" | "9:16" }))}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                                <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2 border-t border-zinc-200/60 dark:border-zinc-800/60 pt-4">
                        <Button
                            className="w-full pulse-glow"
                            onClick={handleBreakdown}
                            disabled={!hasScript || isBreakingDown}
                        >
                            {isBreakingDown ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Breaking down…</>
                            ) : (
                                <><Sparkles className="mr-2 h-4 w-4" /> Break down → Assets</>
                            )}
                        </Button>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Finds the characters, locations and props in every scene. Assets you
                            already have, and their images, are kept.
                        </p>
                        <ErrorNote message={jobs.errors.breakdown} onDismiss={() => jobs.clearError("breakdown")} />
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">Scenes ({project.scenes.length})</h2>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setIsImportOpen((v) => !v)}>
                            <FileText className="mr-1 h-4 w-4" /> Paste screenplay
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                update((p) => ({ ...p, scenes: [...p.scenes, emptyScene(p.scenes.length)] }))
                            }
                        >
                            <Plus className="mr-1 h-4 w-4" /> Scene
                        </Button>
                    </div>
                </div>

                {isImportOpen && (
                    <Card>
                        <CardContent className="space-y-2 pt-6">
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Scenes are split on slug lines (INT. / EXT.). Write dialogue as
                                <code className="mx-1">NAME: line</code>.
                            </p>
                            <Textarea
                                rows={10}
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder={SAMPLE}
                                className="font-mono text-xs"
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => handleImport("replace")} disabled={!importText.trim()}>
                                    Replace scenes
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleImport("append")} disabled={!importText.trim()}>
                                    Append
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setImportText(SAMPLE)}>
                                    Load sample
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {project.scenes.map((scene, i) => (
                    <Card key={scene.id}>
                        <CardContent className="space-y-3 pt-6">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-indigo-500/15 px-2 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                                    Scene {i + 1}
                                </span>
                                <input
                                    className={`${inputClass} flex-1 min-w-[12rem] font-mono uppercase`}
                                    value={scene.heading}
                                    placeholder="EXT. MOJAVE HIGHWAY - NOON"
                                    aria-label={`Scene ${i + 1} heading`}
                                    onChange={(e) => setScene(scene.id, { heading: e.target.value })}
                                />
                                <Select
                                    value={String(scene.durationSeconds)}
                                    onValueChange={(v) => setScene(scene.id, { durationSeconds: Number(v) })}
                                >
                                    <SelectTrigger className="h-8 w-[5.5rem]" aria-label="Clip length">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {OMNI_DURATIONS.map((d) => (
                                            <SelectItem key={d} value={d}>{d}s clip</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <div className="flex">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveScene(i, -1)} disabled={i === 0} aria-label="Move scene up">
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveScene(i, 1)} disabled={i === project.scenes.length - 1} aria-label="Move scene down">
                                        <ArrowDown className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 hover:text-red-500"
                                        disabled={project.scenes.length === 1}
                                        aria-label="Delete scene"
                                        onClick={() => update((p) => ({ ...p, scenes: p.scenes.filter((s) => s.id !== scene.id) }))}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            <Textarea
                                rows={7}
                                value={scene.body}
                                onChange={(e) => setScene(scene.id, { body: e.target.value })}
                                placeholder={"Action lines describe what we see.\nMARA: Dialogue goes like this."}
                                className="font-mono text-sm"
                                aria-label={`Scene ${i + 1} action and dialogue`}
                            />
                            {scene.summary && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    <span className="font-medium">Breakdown:</span> {scene.summary}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
