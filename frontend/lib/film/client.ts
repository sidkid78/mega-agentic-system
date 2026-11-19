/**
 * Browser-side calls for Film Studio, plus pure helpers that fold API results
 * into the project.
 */
import { apiKeyHeader } from "@/lib/api-key"
import { NANO_BANANA_MODEL } from "@/lib/image-models"
import type {
    AssetKind,
    FilmAsset,
    FilmProject,
    MediaRef,
    StoryboardShot,
} from "@/lib/film/types"
import { MAX_SHOTS_PER_SCENE, newId, normalizeName } from "@/lib/film/types"
import { presetVoiceFor, type DubLine } from "@/lib/film/voices"

async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeader() },
        body: JSON.stringify(body),
    })
    let data: unknown = null
    try {
        data = await res.json()
    } catch {
        // non-JSON error page
    }
    if (!res.ok) {
        const msg = (data as { error?: string } | null)?.error
        throw new Error(msg || `Request failed (HTTP ${res.status})`)
    }
    return data as T
}

// ─── Images ───────────────────────────────────────────────────────────────────

/**
 * Re-encodes an image as a JPEG no larger than `max` px on its long edge.
 * Reference images only need to carry identity, and a dozen full-size PNGs
 * would make every frame request tens of megabytes.
 */
export function downscaleImage(media: MediaRef, max = 1024): Promise<MediaRef> {
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
            const scale = Math.min(1, max / Math.max(img.width, img.height))
            const canvas = document.createElement("canvas")
            canvas.width = Math.round(img.width * scale)
            canvas.height = Math.round(img.height * scale)
            const ctx = canvas.getContext("2d")
            if (!ctx) return resolve(media)
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            const dataUrl = canvas.toDataURL("image/jpeg", 0.88)
            resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" })
        }
        img.onerror = () => resolve(media)
        img.src = mediaUrl(media)
    })
}

export function mediaUrl(media: MediaRef): string {
    return `data:${media.mimeType};base64,${media.base64}`
}

export async function fileToMedia(file: File): Promise<MediaRef> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
    })
    return downscaleImage(
        { base64: dataUrl.split(",")[1], mimeType: file.type || "image/png" },
        1536,
    )
}

export async function generateImage(
    prompt: string,
    aspectRatio: string,
    references: MediaRef[] = [],
): Promise<MediaRef> {
    const images = await Promise.all(references.map((r) => downscaleImage(r)))
    const data = await postJson<{ images?: MediaRef[]; text?: string }>("/api/images/nano-banana", {
        prompt,
        model: NANO_BANANA_MODEL,
        aspectRatio,
        imageSize: "1K",
        images,
    })
    const image = data.images?.[0]
    if (!image) throw new Error(data.text?.trim() || "No image was returned — try rewording the description.")
    // Stored at 1536px max: crisp on screen, light enough for IndexedDB.
    return downscaleImage(image, 1536)
}

/** Runs async jobs with a concurrency cap; one failure doesn't stop the rest. */
export async function runPool<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    let next = 0
    const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const item = items[next++]
            try {
                await worker(item)
            } catch {
                // the worker records its own error
            }
        }
    })
    await Promise.all(lanes)
}

// ─── Breakdown ────────────────────────────────────────────────────────────────

interface BreakdownAsset {
    name: string
    description: string
}

export interface BreakdownResult {
    characters: BreakdownAsset[]
    locations: BreakdownAsset[]
    props: BreakdownAsset[]
    scenes: {
        sceneId: string
        summary: string
        location: string
        characters: string[]
        props: string[]
    }[]
}

export function runBreakdown(project: FilmProject): Promise<BreakdownResult> {
    return postJson<BreakdownResult>("/api/film/breakdown", {
        title: project.title,
        style: project.style,
        scenes: project.scenes.map(({ id, heading, body }) => ({ id, heading, body })),
        existing: project.assets.map(({ kind, name, description }) => ({ kind, name, description })),
    })
}

/**
 * Folds a breakdown into the project. Existing assets win — their edited
 * descriptions and generated images are kept — and only new names are added.
 */
export function mergeBreakdown(project: FilmProject, result: BreakdownResult): FilmProject {
    const assets = [...project.assets]
    const find = (kind: AssetKind, name: string) =>
        assets.find((a) => a.kind === kind && normalizeName(a.name) === normalizeName(name))

    const upsert = (kind: AssetKind, items: BreakdownAsset[] = []) => {
        for (const item of items) {
            if (!item?.name?.trim()) continue
            const found = find(kind, item.name)
            if (found) {
                if (!found.description.trim()) found.description = item.description
            } else {
                assets.push({
                    id: newId(),
                    kind,
                    name: item.name.trim(),
                    description: item.description ?? "",
                    // A character named like a saved voice ("Cliff") gets it straight away.
                    voiceId: kind === "character" ? presetVoiceFor(item.name) : undefined,
                })
            }
        }
    }
    upsert("character", result.characters)
    upsert("location", result.locations)
    upsert("prop", result.props)

    const ids = (kind: AssetKind, names: string[] = []) =>
        [...new Set(names.map((n) => find(kind, n)?.id).filter(Boolean) as string[])]

    const scenes = project.scenes.map((scene) => {
        const info = result.scenes?.find((s) => s.sceneId === scene.id)
        if (!info) return scene
        return {
            ...scene,
            summary: info.summary ?? scene.summary,
            locationId: find("location", info.location ?? "")?.id ?? scene.locationId,
            characterIds: ids("character", info.characters),
            propIds: ids("prop", info.props),
        }
    })

    return { ...project, assets, scenes }
}

// ─── Storyboard planning ──────────────────────────────────────────────────────

interface PlannedShot {
    start: number
    end: number
    description: string
    camera: string
    dialogue: string
    characters: string[]
    props: string[]
}

export async function planStoryboard(
    project: FilmProject,
    sceneId: string,
): Promise<StoryboardShot[]> {
    const scene = project.scenes.find((s) => s.id === sceneId)
    if (!scene) throw new Error("Scene not found")
    const byId = new Map(project.assets.map((a) => [a.id, a]))
    const pick = (ids: string[]) =>
        ids.map((id) => byId.get(id)).filter(Boolean).map((a) => ({
            name: (a as FilmAsset).name,
            description: (a as FilmAsset).description,
        }))
    const location = scene.locationId ? byId.get(scene.locationId) : undefined

    const data = await postJson<{ shots: PlannedShot[]; durationSeconds: number }>(
        "/api/film/storyboard",
        {
            heading: scene.heading,
            body: scene.body,
            summary: scene.summary,
            style: project.style,
            durationSeconds: scene.durationSeconds,
            maxShots: MAX_SHOTS_PER_SCENE,
            location: location ? { name: location.name, description: location.description } : undefined,
            characters: pick(scene.characterIds),
            props: pick(scene.propIds),
        },
    )

    const match = (kind: AssetKind, names: string[] = []) =>
        names
            .map((n) =>
                project.assets.find((a) => a.kind === kind && normalizeName(a.name) === normalizeName(n))?.id,
            )
            .filter(Boolean) as string[]

    return fitShots(
        data.shots.map((s) => ({
            id: newId(),
            start: Number(s.start) || 0,
            end: Number(s.end) || 0,
            description: s.description ?? "",
            camera: s.camera ?? "",
            dialogue: s.dialogue ?? "",
            characterIds: match("character", s.characters),
            propIds: match("prop", s.props),
        })),
        data.durationSeconds,
    )
}

/**
 * Makes shot timecodes contiguous within [0, duration]: models occasionally
 * leave gaps or overrun, and Omni reads the timecodes literally.
 */
export function fitShots(shots: StoryboardShot[], duration: number): StoryboardShot[] {
    // Every shot needs at least a second, so a 3s clip holds at most 3 shots.
    const sorted = [...shots]
        .sort((a, b) => a.start - b.start)
        .slice(0, Math.min(MAX_SHOTS_PER_SCENE, Math.floor(duration)))
    if (sorted.length === 0) return sorted
    const each = duration / sorted.length
    let cursor = 0
    return sorted.map((s, i) => {
        const isLast = i === sorted.length - 1
        const wanted = s.end > s.start ? s.end - s.start : each
        const remainingShots = sorted.length - i - 1
        const maxLen = duration - cursor - remainingShots // leave ≥1s per later shot
        const len = isLast ? duration - cursor : Math.max(1, Math.min(Math.round(wanted), maxLen))
        const shot = { ...s, start: cursor, end: cursor + len }
        cursor += len
        return shot
    })
}

// ─── Video ────────────────────────────────────────────────────────────────────

export async function shootVideo(
    payload: Record<string, unknown>,
    onStatus: (msg: string) => void,
): Promise<MediaRef & { interactionId: string }> {
    onStatus("Uploading references & submitting to Omni…")
    const { interactionId } = await postJson<{ interactionId: string }>("/api/videos/generate", payload)

    for (let attempt = 1; attempt <= 72; attempt++) {
        onStatus(`Rendering… ${attempt * 10}s elapsed`)
        await new Promise((r) => setTimeout(r, 10000))
        const res = await fetch(`/api/videos/poll?id=${encodeURIComponent(interactionId)}`, {
            headers: { ...apiKeyHeader() },
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || "Poll failed")
        if (data.done) {
            if (typeof data.videoBase64 !== "string" || data.videoBase64.length < 256) {
                throw new Error("The render finished but returned no usable video data.")
            }
            return {
                base64: data.videoBase64,
                mimeType: data.mimeType || "video/mp4",
                interactionId: data.interactionId ?? interactionId,
            }
        }
    }
    throw new Error("Timed out waiting for the video (12 min)")
}


export interface DubResult {
    video: MediaRef
    lines: { speaker: string; text: string; start: number; end: number }[]
    warnings: string[]
}

/** Voices the scene's lines in each character's own voice and mixes them over the clip. */
export function dubVideo(video: MediaRef, lines: DubLine[], originalVolume: number): Promise<DubResult> {
    return postJson<DubResult>("/api/film/dub", {
        video,
        originalVolume,
        lines: lines
            .filter((l) => l.voice)
            .map(({ start, voice, text, style, speaker }) => ({ start, voice, text, style, speaker })),
    })
}
