/**
 * Dialogue dubbing: characters can carry a TTS voice (a custom `voice_…` id
 * from Voice design / replication, or a prebuilt name). Omni can't take a
 * voice — it only reads text, images and video — so voiced lines are spoken
 * by gemini-3.8-flash-tts and mixed over the clip at their shot's timecode.
 */
import { normalizeName, type FilmAsset, type FilmProject, type FilmScene } from "@/lib/film/types"

export const FILM_TTS_MODEL = "gemini-3.8-flash-tts"

export interface VoicePreset {
    name: string
    id: string
}

/**
 * Named voices from NEXT_PUBLIC_FILM_VOICES ("Cliff=voice_abc,Shaun=voice_def")
 * in .env.local — kept out of the repo, offered on every character card.
 */
export const VOICE_PRESETS: VoicePreset[] = (process.env.NEXT_PUBLIC_FILM_VOICES ?? "")
    .split(",")
    .map((pair) => {
        const [name, id] = pair.split("=").map((s) => s?.trim() ?? "")
        return { name, id }
    })
    .filter((v) => v.name && v.id)

/** A preset whose name matches the character's name or first name. */
export function presetVoiceFor(characterName: string): string | undefined {
    const name = normalizeName(characterName)
    const first = name.split(" ")[0]
    return VOICE_PRESETS.find((v) => {
        const preset = normalizeName(v.name)
        return preset === name || preset === first
    })?.id
}

export interface DialogueLine {
    speaker: string
    /** From "NAME (whispering): line". */
    style?: string
    text: string
}

/** "MARA (low): Get in." → { speaker: "MARA", style: "low", text: "Get in." } */
export function parseDialogue(dialogue: string): DialogueLine[] {
    return dialogue
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
            const m = l.match(/^([^:(]{1,40}?)\s*(?:\(([^)]{1,80})\))?\s*:\s*(.+)$/)
            return m
                ? { speaker: m[1].trim(), style: m[2]?.trim() || undefined, text: m[3].trim() }
                : { speaker: "", text: l }
        })
}

/** The character a dialogue speaker name refers to (full or first name). */
export function findSpeaker(speaker: string, characters: FilmAsset[]): FilmAsset | undefined {
    const name = normalizeName(speaker)
    if (!name) return undefined
    return (
        characters.find((c) => normalizeName(c.name) === name) ??
        characters.find((c) => normalizeName(c.name).split(" ")[0] === name.split(" ")[0])
    )
}

export interface DubLine {
    shotId: string
    /** Earliest start, seconds into the clip; later lines in a shot follow on. */
    start: number
    speaker: string
    voice?: string
    style?: string
    text: string
}

/** Every dialogue line in a scene, in order, with its character's voice if any. */
export function sceneDubLines(scene: FilmScene, project: FilmProject): DubLine[] {
    const characters = project.assets.filter((a) => a.kind === "character")
    return [...scene.shots]
        .sort((a, b) => a.start - b.start)
        .flatMap((shot) =>
            parseDialogue(shot.dialogue).map((line) => ({
                shotId: shot.id,
                start: shot.start,
                speaker: line.speaker,
                voice: findSpeaker(line.speaker, characters)?.voiceId?.trim() || undefined,
                style: line.style,
                text: line.text,
            })),
        )
}

/** Speakers in this scene who have a voice — Omni is told to leave them silent. */
export function dubbedSpeakers(scene: FilmScene, project: FilmProject): Set<string> {
    return new Set(sceneDubLines(scene, project).filter((l) => l.voice).map((l) => normalizeName(l.speaker)))
}
