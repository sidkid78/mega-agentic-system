/**
 * Prompt builders for Film Studio. Pure, so the client can preview them.
 */
import { buildScenePrompt, type BuiltScene, type SceneAsset } from "@/lib/omni-scene"
import type {
    FilmAsset,
    FilmProject,
    FilmScene,
    MediaRef,
    StoryboardShot,
} from "@/lib/film/types"
import { emptyScene, normalizeName } from "@/lib/film/types"
import { dubbedSpeakers, parseDialogue } from "@/lib/film/voices"

// ─── Script import ────────────────────────────────────────────────────────────

const SLUG_LINE = /^\s*(INT\.|EXT\.|INT\/EXT\.|I\/E\.|EST\.)/i

/**
 * Splits a pasted screenplay into scenes on its slug lines (INT./EXT.).
 * Text before the first slug line becomes its own untitled scene.
 */
export function splitScreenplay(text: string): FilmScene[] {
    const scenes: FilmScene[] = []
    let current: FilmScene | null = null
    for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
        if (SLUG_LINE.test(line)) {
            current = { ...emptyScene(1), heading: line.trim() }
            scenes.push(current)
        } else {
            if (!current) {
                if (!line.trim()) continue
                current = { ...emptyScene(1), heading: "" }
                scenes.push(current)
            }
            current.body += (current.body ? "\n" : "") + line
        }
    }
    return scenes.map((s) => ({ ...s, body: s.body.trim() }))
}

// ─── Asset images ─────────────────────────────────────────────────────────────

export function assetImagePrompt(asset: FilmAsset, style: string): string {
    const look = style.trim() ? ` Visual style: ${style.trim()}.` : ""
    switch (asset.kind) {
        case "character":
            return (
                `Film pre-production character reference sheet for "${asset.name}". ${asset.description}` +
                ` Show a full-body front view and a head-and-shoulders close-up side by side,` +
                ` neutral grey studio backdrop, soft even lighting, wardrobe clearly visible.${look}` +
                ` No text, labels or watermarks.`
            )
        case "location":
            return (
                `Establishing wide shot of the film location "${asset.name}". ${asset.description}` +
                ` No people. Cinematic composition that shows the space, its lighting and time of day.${look}` +
                ` No text or watermarks.`
            )
        case "prop":
            return (
                `Film prop reference for "${asset.name}". ${asset.description}` +
                ` Three-quarter view, isolated on a neutral studio backdrop, every identifying detail` +
                ` (shape, color, markings) clearly visible.${look} No text or watermarks.`
            )
    }
}

export function assetAspectRatio(asset: FilmAsset, project: FilmProject): string {
    if (asset.kind === "location") return project.aspectRatio
    return asset.kind === "character" ? "3:2" : "4:3"
}

// ─── Storyboard frames ────────────────────────────────────────────────────────

export interface FrameRequest {
    prompt: string
    images: MediaRef[]
}

/**
 * Builds a Nano Banana request for one storyboard frame. Every asset image in
 * play goes in as a reference, and the prompt names which image is which so
 * identities, the location and props stay consistent across frames.
 */
export function framePrompt(
    shot: StoryboardShot,
    scene: FilmScene,
    project: FilmProject,
): FrameRequest {
    const byId = new Map(project.assets.map((a) => [a.id, a]))
    const location = scene.locationId ? byId.get(scene.locationId) : undefined
    const characters = shot.characterIds.map((id) => byId.get(id)).filter(Boolean) as FilmAsset[]
    const props = shot.propIds.map((id) => byId.get(id)).filter(Boolean) as FilmAsset[]

    const images: MediaRef[] = []
    const refLines: string[] = []
    const addRef = (asset: FilmAsset, role: string) => {
        if (!asset.image || images.length >= 14) {
            refLines.push(`- ${role} "${asset.name}" (no reference image): ${asset.description}`)
            return
        }
        images.push(asset.image)
        refLines.push(`- Image ${images.length}: ${role} "${asset.name}" — ${asset.description}`)
    }
    characters.forEach((c) => addRef(c, "character"))
    if (location) addRef(location, "location")
    props.forEach((p) => addRef(p, "prop"))

    const lines = [
        `A single storyboard frame for a film: one cinematic still, ${project.aspectRatio} composition.`,
        `Scene: ${scene.heading}${scene.summary ? ` — ${scene.summary}` : ""}`,
        `Shot: ${shot.description}`,
        shot.camera ? `Camera: ${shot.camera}` : "",
        shot.dialogue ? `The moment while this line is spoken: ${shot.dialogue}` : "",
        refLines.length ? `Use these references and match them exactly:\n${refLines.join("\n")}` : "",
        characters.length
            ? "Keep each character's face, hair, build and wardrobe identical to their reference sheet — show them once, in the scene, not as a reference sheet."
            : "",
        project.style.trim() ? `Visual style: ${project.style.trim()}.` : "",
        "No text, captions, panel borders or watermarks.",
    ]
    return { prompt: lines.filter(Boolean).join("\n"), images }
}

// ─── Scene video ──────────────────────────────────────────────────────────────

/**
 * Turns a scene's storyboard into an Omni request: each frame becomes a
 * reference image tied to its timecoded shot, dialogue goes in quotes, and the
 * project style plus location set the direction.
 */
export function sceneVideoPrompt(
    scene: FilmScene,
    project: FilmProject,
    options: { startOnFirstFrame: boolean },
): BuiltScene {
    const byId = new Map(project.assets.map((a) => [a.id, a]))
    const dubbed = dubbedSpeakers(scene, project)
    const framed = scene.shots.filter((s) => s.image)

    const cast: SceneAsset[] = framed.map((s, i) => ({
        id: s.id,
        kind: "image",
        name: `Shot${i + 1}`,
        role: i === 0 && options.startOnFirstFrame ? "first_frame" : "reference",
        base64: s.image!.base64,
        mimeType: s.image!.mimeType,
    }))

    const shots = scene.shots.map((s) => {
        const frameIndex = framed.indexOf(s)
        const tag = frameIndex >= 0 ? `@Shot${frameIndex + 1} ` : ""
        const camera = s.camera ? `${s.camera}. ` : ""
        return {
            id: s.id,
            start: s.start,
            end: s.end,
            description: `${tag}${camera}${withStop(s.description)}${formatDialogue(s.dialogue, dubbed)}`,
        }
    })

    const location = scene.locationId ? byId.get(scene.locationId) : undefined
    const direction = [
        location ? `Setting: ${location.name}. ${location.description}` : "",
        project.style.trim() ? `Look: ${project.style.trim()}.` : "",
        "Characters keep the same faces and wardrobe as in the reference frames. Speak dialogue exactly as written, with natural ambient sound for the setting.",
        dubbed.size
            ? "Lines marked as mouthed are dubbed in afterwards: show the character's lips moving in time, but generate no voice for them — ambient sound and effects only during those lines."
            : "",
    ]
        .filter(Boolean)
        .join(" ")

    return buildScenePrompt({ shots, cast, direction })
}

/** "Two-shot" → "Two-shot." so dialogue doesn't run on from the action. */
function withStop(text: string): string {
    const t = text.trim()
    return !t || /[.!?…]$/.test(t) ? t : `${t}.`
}

/**
 * "MARA: Get in." → ` MARA says: "Get in."` — Omni voices quoted dialogue.
 * A speaker in `dubbed` has their own TTS voice, so Omni only animates the line.
 */
function formatDialogue(dialogue: string, dubbed: Set<string>): string {
    const lines = parseDialogue(dialogue).map(({ speaker, style, text }) => {
        const quoted = `"${text.replace(/"/g, "'")}"`
        if (!speaker) return quoted
        if (dubbed.has(normalizeName(speaker))) return `${speaker} mouths ${quoted} (silent, voice dubbed later)`
        return `${speaker} says${style ? ` (${style})` : ""}: ${quoted}`
    })
    return lines.length ? ` ${lines.join(" ")}` : ""
}
