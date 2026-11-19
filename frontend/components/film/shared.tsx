"use client"

import { Loader2, ImageIcon } from "lucide-react"
import type { FilmProject, MediaRef } from "@/lib/film/types"
import type { Jobs } from "@/lib/film/use-jobs"
import { mediaUrl } from "@/lib/film/client"

export type FilmTab = "script" | "assets" | "storyboard" | "shoot"

export interface FilmTabProps {
    project: FilmProject
    /** Functional update, so concurrent jobs never overwrite each other. */
    update: (fn: (p: FilmProject) => FilmProject) => void
    jobs: Jobs
    goTo: (tab: FilmTab) => void
}

export function ErrorNote({ message, onDismiss }: { message?: string; onDismiss?: () => void }) {
    if (!message) return null
    return (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-800 dark:text-red-200">
            <span className="flex-1">{message}</span>
            {onDismiss && (
                <button onClick={onDismiss} className="font-medium underline" aria-label="Dismiss error">
                    Dismiss
                </button>
            )}
        </div>
    )
}

/** Image slot with a spinner overlay while a draw is running. */
export function MediaFrame({
    image,
    alt,
    isBusy,
    status,
    aspectClass = "aspect-video",
    emptyLabel = "No image yet",
}: {
    image?: MediaRef
    alt: string
    isBusy?: boolean
    status?: string
    aspectClass?: string
    emptyLabel?: string
}) {
    return (
        <div
            className={`relative ${aspectClass} w-full overflow-hidden rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-100 dark:bg-zinc-900`}
        >
            {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(image)} alt={alt} className="h-full w-full object-cover" />
            ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-zinc-400">
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-[11px]">{emptyLabel}</span>
                </div>
            )}
            {isBusy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="px-2 text-center text-[11px]">{status || "Drawing…"}</span>
                </div>
            )}
        </div>
    )
}

export const inputClass =
    "h-8 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
