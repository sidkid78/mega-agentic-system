/**
 * Scene / storyboard prompt builder for Gemini Omni Flash.
 *
 * Omni has no dedicated "scene" endpoint: multi-shot scenes are expressed in
 * the prompt itself (see the Omni guide's prompt section). This module turns a
 * structured storyboard — a cast of uploaded media with roles, plus timecoded
 * shots — into that prompt syntax:
 *
 *   - timecoded shots: `[0-3s] … [3-6s] …`
 *   - simple role tags: `<IMAGE_REF_N>`, `<VIDEO_REF_N>`, `<FIRST_FRAME>`
 *   - explicit declarations when frames and references are mixed:
 *     `[# Sources <FIRST_FRAME>@Image1] [# References <IMAGE_REF_0>@Image2]`
 *
 * Pure and SDK-free, so the client page can import it directly.
 */
import { OMNI_MAX_DURATION } from "@/lib/omni-video-options"

/** Each extension adds up to 10s; Omni caps an extended video at 40s total. */
export const OMNI_MAX_EXTENDED_SECONDS = 40

/** Soft UI caps — the guide demonstrates 6 reference images in one prompt. */
export const SCENE_MAX_REFERENCE_IMAGES = 6
export const SCENE_MAX_REFERENCE_VIDEOS = 2

export const SCENE_ASSET_ROLES = ["reference", "first_frame", "last_frame"] as const
export type SceneAssetRole = (typeof SCENE_ASSET_ROLES)[number]

export interface SceneAsset {
    id: string
    kind: "image" | "video"
    /** Handle used in shot text as `@Name` — letters, digits, `_` and `-`. */
    name: string
    /** Videos are always references; images may also be first/last frames. */
    role: SceneAssetRole
    base64: string
    mimeType: string
    /** Data URL for image thumbnails; absent for videos. */
    preview?: string
}

export interface SceneShot {
    id: string
    /** Seconds from the start of this clip (or of the extension, when continuing). */
    start: number
    end: number
    description: string
}

export interface SceneSpec {
    shots: SceneShot[]
    cast: SceneAsset[]
    /** Global style / camera / audio direction appended after the shots. */
    direction?: string
    /** Reuse the first frame as the last frame so the clip loops. */
    loop?: boolean
    /** Building an extension turn (previous_interaction_id) rather than a first clip. */
    isContinuation?: boolean
}

export interface BuiltScene {
    prompt: string
    /** Images in the exact order the prompt's @ImageN / <IMAGE_REF_N> tags assume. */
    images: { base64: string; mimeType: string }[]
    /** Reference videos in <VIDEO_REF_N> order. */
    referenceVideos: { base64: string; mimeType: string }[]
    /** Problems the UI should show before letting the user generate. */
    warnings: string[]
}

const NAME_PATTERN = /@([A-Za-z0-9_-]+)/g

export function sanitizeAssetName(raw: string): string {
    return raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24)
}

/**
 * Builds the Omni prompt and the ordered media for one scene turn.
 *
 * Input order to the API is: images (first frame, last frame, then
 * references), then reference videos, then the text — `startOmniVideo` keeps
 * that order, so `@ImageN` and `<IMAGE_REF_N>` line up with what is sent.
 */
export function buildScenePrompt(spec: SceneSpec): BuiltScene {
    const warnings: string[] = []
    const { isContinuation = false } = spec

    // First/last frames only make sense for a fresh clip: an extension starts
    // from the previous video's tail.
    const first = isContinuation
        ? undefined
        : spec.cast.find((a) => a.kind === "image" && a.role === "first_frame")
    const explicitLast = isContinuation
        ? undefined
        : spec.cast.find((a) => a.kind === "image" && a.role === "last_frame")
    const refImages = spec.cast.filter(
        (a) => a.kind === "image" && (a.role === "reference" || isContinuation),
    )
    const refVideos = spec.cast.filter((a) => a.kind === "video")

    if (explicitLast && !first) {
        warnings.push("A last frame needs a first frame too — add one or switch it to a reference.")
    }
    if (spec.loop && !first) {
        warnings.push("Looping reuses the first frame as the last — add a first frame.")
    }
    if (spec.loop && explicitLast) {
        warnings.push("Looping ignores the last-frame image — the first frame closes the clip.")
    }

    // Ordered images: first frame, last frame (unless looping reuses Image1), references.
    const orderedImages: SceneAsset[] = []
    if (first) orderedImages.push(first)
    const last = spec.loop ? undefined : explicitLast && first ? explicitLast : undefined
    if (last) orderedImages.push(last)
    orderedImages.push(...refImages)

    // Name → tag lookup for @Name substitution in shot text.
    const tagFor = new Map<string, string>()
    refImages.forEach((a, i) => tagFor.set(a.name.toLowerCase(), `<IMAGE_REF_${i}>`))
    refVideos.forEach((a, i) => tagFor.set(a.name.toLowerCase(), `<VIDEO_REF_${i}>`))
    if (first) tagFor.set(first.name.toLowerCase(), "<FIRST_FRAME>")
    if (last) tagFor.set(last.name.toLowerCase(), "<LAST_FRAME>")

    const unknown = new Set<string>()
    const substitute = (text: string) =>
        text.replace(NAME_PATTERN, (match, name: string) => {
            const tag = tagFor.get(name.toLowerCase())
            if (!tag) unknown.add(name)
            return tag ?? match
        })

    const shots = [...spec.shots]
        .filter((s) => s.description.trim())
        .sort((a, b) => a.start - b.start)

    const cap = isContinuation ? 10 : OMNI_MAX_DURATION
    for (const s of shots) {
        if (s.end <= s.start) warnings.push(`Shot at ${s.start}s ends before it starts.`)
        if (s.end > cap) {
            warnings.push(
                isContinuation
                    ? `Shot ending at ${s.end}s overruns the 10s an extension adds (0s is the start of the extension).`
                    : `Shot ending at ${s.end}s overruns Omni's ${OMNI_MAX_DURATION}s clip limit — continue the scene for longer.`,
            )
        }
    }
    for (let i = 1; i < shots.length; i++) {
        if (shots[i].start < shots[i - 1].end) {
            warnings.push(`Shots at ${shots[i - 1].start}s and ${shots[i].start}s overlap.`)
        }
    }
    if (shots.length === 0) warnings.push("Add at least one shot with a description.")

    const lines: string[] = []

    // Explicit declarations only when a first frame is in play alongside
    // other media; otherwise the simple tags (Google's recommended form) suffice.
    // A loop always declares, so <LAST_FRAME> is bound to Image1 unambiguously.
    const needsDeclarations =
        Boolean(first) && (Boolean(spec.loop) || orderedImages.length + refVideos.length > 1)
    if (needsDeclarations) {
        const sources = [`<FIRST_FRAME>@Image1`]
        if (spec.loop) sources.push(`<LAST_FRAME>@Image1`)
        else if (last) sources.push(`<LAST_FRAME>@Image2`)
        const refOffset = last ? 3 : 2
        const references = [
            ...refImages.map((_, i) => `<IMAGE_REF_${i}>@Image${i + refOffset}`),
            ...refVideos.map((_, i) => `<VIDEO_REF_${i}>@Video${i + 1}`),
        ]
        lines.push(
            `[# Sources ${sources.join(" ")}]` +
                (references.length ? ` [# References ${references.join(" ")}]` : ""),
        )
    } else if (first) {
        // A lone first frame: the simple tag leads the prompt.
        lines.push(spec.loop ? "<FIRST_FRAME> <LAST_FRAME>" : "<FIRST_FRAME>")
    }

    if (isContinuation) {
        lines.push("The scene continues.")
    }

    for (const s of shots) {
        lines.push(`[${s.start}-${s.end}s] ${substitute(s.description.trim())}`)
    }

    if (spec.direction?.trim()) lines.push(substitute(spec.direction.trim()))

    // Guiding instructions from the prompt guide, matched to the roles in use.
    const guidance: string[] = []
    if (needsDeclarations) {
        if (spec.loop) guidance.push("Use Image1 as the first frame and the last frame.")
        else if (last) guidance.push("Use Image1 as the starting frame and Image2 as the final frame.")
        else guidance.push("Use Image1 as the starting frame.")
    }
    if (refImages.length) {
        guidance.push(
            "Use the given reference image(s) as references for video generation. They should not be used as literal initial frames.",
        )
    }
    if (refVideos.length) {
        guidance.push("Use the given video(s) as references. Do not use them as a source for video editing.")
    }
    if (guidance.length) lines.push(guidance.join(" "))

    if (unknown.size) {
        warnings.push(`Unknown cast name(s): ${[...unknown].map((n) => "@" + n).join(", ")}`)
    }
    if (refImages.length > SCENE_MAX_REFERENCE_IMAGES) {
        warnings.push(`More than ${SCENE_MAX_REFERENCE_IMAGES} reference images may be ignored.`)
    }
    if (refVideos.length > SCENE_MAX_REFERENCE_VIDEOS) {
        warnings.push(`More than ${SCENE_MAX_REFERENCE_VIDEOS} reference videos may be ignored.`)
    }

    return {
        prompt: lines.join("\n"),
        images: orderedImages.map(({ base64, mimeType }) => ({ base64, mimeType })),
        referenceVideos: refVideos.map(({ base64, mimeType }) => ({ base64, mimeType })),
        warnings,
    }
}

/** Seconds the next continuation can add without passing Omni's 40s ceiling. */
export function remainingExtensionSeconds(totalSoFar: number): number {
    return Math.max(0, Math.min(10, OMNI_MAX_EXTENDED_SECONDS - totalSoFar))
}
