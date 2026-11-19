"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { emptyProject, type FilmProject } from "@/lib/film/types"
import { loadProject, saveProject } from "@/lib/film/store"
import { useJobs } from "@/lib/film/use-jobs"
import type { FilmTab } from "@/components/film/shared"
import { ScriptTab } from "@/components/film/script-tab"
import { AssetsTab } from "@/components/film/assets-tab"
import { StoryboardTab } from "@/components/film/storyboard-tab"
import { ShootTab } from "@/components/film/shoot-tab"

type SaveState = "loading" | "saved" | "saving" | "unsaved"

export default function FilmStudioPage() {
    const [project, setProject] = useState<FilmProject | null>(null)
    const [tab, setTab] = useState<FilmTab>("script")
    const [saveState, setSaveState] = useState<SaveState>("loading")
    const jobs = useJobs()
    const isLoaded = useRef(false)

    useEffect(() => {
        loadProject().then((saved) => {
            setProject(saved ?? emptyProject())
            isLoaded.current = true
            setSaveState("saved")
        })
    }, [])

    // Debounced autosave — generated images make each write a few MB.
    useEffect(() => {
        if (!project || !isLoaded.current) return
        const t = setTimeout(async () => {
            setSaveState("saving")
            setSaveState((await saveProject(project)) ? "saved" : "unsaved")
        }, 800)
        return () => clearTimeout(t)
    }, [project])

    const update = useCallback((fn: (p: FilmProject) => FilmProject) => {
        setProject((p) => (p ? { ...fn(p), updatedAt: Date.now() } : p))
    }, [])

    const handleNewProject = () => {
        if (Object.keys(jobs.busy).length > 0) return
        if (!window.confirm("Start a new film? The current script, assets, storyboard and clips will be cleared.")) return
        setProject(emptyProject())
        setTab("script")
    }

    const counts = project
        ? {
              scenes: project.scenes.length,
              assets: project.assets.length,
              frames: project.scenes.reduce((n, s) => n + s.shots.filter((sh) => sh.image).length, 0),
              clips: project.scenes.filter((s) => s.video).length,
          }
        : null

    return (
        <div className="relative min-h-screen overflow-hidden">
            <div className="mega-bg fixed inset-0" />
            <div className="relative z-10 container mx-auto max-w-7xl px-4 py-8">
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="gradient-text mb-2 text-4xl font-bold tracking-tight md:text-5xl">🎞️ Film Studio</h1>
                        <p className="text-lg text-zinc-700 dark:text-zinc-300">
                            Script → assets → storyboard → shoot. Every step hands the next one its context.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
                            {saveState === "loading" && "Loading…"}
                            {saveState === "saving" && "Saving…"}
                            {saveState === "saved" && "Saved in this browser"}
                            {saveState === "unsaved" && "⚠ Couldn't save — storage may be full or blocked"}
                        </span>
                        <Button variant="outline" size="sm" onClick={handleNewProject} disabled={!project}>
                            New film
                        </Button>
                        <a href="/videos" className="text-sm text-indigo-600 underline dark:text-indigo-400">Videos</a>
                        <ThemeToggle />
                    </div>
                </div>

                {!project || !counts ? (
                    <div className="flex justify-center py-24">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                    </div>
                ) : (
                    <Tabs value={tab} onValueChange={(v) => setTab(v as FilmTab)} className="space-y-6">
                        <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-4">
                            <TabsTrigger value="script">1 · Script ({counts.scenes})</TabsTrigger>
                            <TabsTrigger value="assets">2 · Assets ({counts.assets})</TabsTrigger>
                            <TabsTrigger value="storyboard">3 · Storyboard ({counts.frames})</TabsTrigger>
                            <TabsTrigger value="shoot">4 · Shoot ({counts.clips})</TabsTrigger>
                        </TabsList>
                        <TabsContent value="script">
                            <ScriptTab project={project} update={update} jobs={jobs} goTo={setTab} />
                        </TabsContent>
                        <TabsContent value="assets">
                            <AssetsTab project={project} update={update} jobs={jobs} goTo={setTab} />
                        </TabsContent>
                        <TabsContent value="storyboard">
                            <StoryboardTab project={project} update={update} jobs={jobs} goTo={setTab} />
                        </TabsContent>
                        <TabsContent value="shoot">
                            <ShootTab project={project} update={update} jobs={jobs} goTo={setTab} />
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    )
}
