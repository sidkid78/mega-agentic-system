/**
 * Film Studio project model: Script → Assets → Storyboard → Shoot.
 *
 * Scenes hold the script; the breakdown links each scene to the characters,
 * locations and props it uses; storyboard shots are timecoded beats inside a
 * scene, each with a generated frame; Shoot turns a scene's frames into one
 * Omni clip.
 */

export interface MediaRef {
    base64: string
    mimeType: string
}

export const ASSET_KINDS = ["character", "location", "prop"] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

export interface FilmAsset {
    id: string
    kind: AssetKind
    name: string
    /** Visual description used to draw the asset and to keep it consistent. */
    description: string
    image?: MediaRef
    /** Characters only: a TTS voice (custom voice_… id or a prebuilt name) that dubs their lines. */
    voiceId?: string
}

export interface StoryboardShot {
    id: string
    /** Seconds from the start of the scene clip. */
    start: number
    end: number
    /** What we see. */
    description: string
    /** Framing and movement, e.g. "Low-angle tracking shot". */
    camera: string
    /** Spoken line(s) in "NAME: line" form, or empty. */
    dialogue: string
    characterIds: string[]
    propIds: string[]
    image?: MediaRef
}

export interface FilmScene {
    id: string
    /** Slug line, e.g. "EXT. MOJAVE HIGHWAY - DAY". */
    heading: string
    /** Action and dialogue, screenplay style ("MARA: Get in."). */
    body: string
    /** Filled by the breakdown. */
    summary: string
    locationId?: string
    characterIds: string[]
    propIds: string[]
    /** One Omni clip runs 3–10s. */
    durationSeconds: number
    shots: StoryboardShot[]
    video?: MediaRef & { interactionId: string }
    /** `video` with the dialogue dubbed in the characters' own voices. Cleared on reshoot. */
    dubbedVideo?: MediaRef
}

export interface FilmProject {
    id: string
    title: string
    /** Global look applied to every asset, frame and clip. */
    style: string
    aspectRatio: "16:9" | "9:16"
    scenes: FilmScene[]
    assets: FilmAsset[]
    updatedAt: number
}

/** Max storyboard cards per scene — one Omni reference image each. */
export const MAX_SHOTS_PER_SCENE = 6

export const FILM_TEXT_MODEL = "gemini-3.8-flash"

export function newId(): string {
    return Math.random().toString(36).slice(2, 10)
}

export function emptyScene(index: number): FilmScene {
    return {
        id: newId(),
        heading: index === 0 ? "EXT. LOCATION - DAY" : "",
        body: "",
        summary: "",
        characterIds: [],
        propIds: [],
        durationSeconds: 8,
        shots: [],
    }
}

export function emptyProject(): FilmProject {
    return {
        id: newId(),
        title: "Untitled film",
        style: "Cinematic, photorealistic, 35mm film look, natural color grading",
        aspectRatio: "16:9",
        scenes: [emptyScene(0)],
        assets: [],
        updatedAt: Date.now(),
    }
}

export function normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, " ")
}
