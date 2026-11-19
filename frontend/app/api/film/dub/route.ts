import { NextRequest, NextResponse } from "next/server"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { geminiClient, missingKeyResponse } from "@/lib/server-gemini"
import { errorMessage } from "@/lib/film/server"
import { FILM_TTS_MODEL } from "@/lib/film/voices"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Dubs a scene clip: speaks each voiced line with gemini-3.8-flash-tts in the
 * character's own voice, then mixes the lines over the Omni clip at their
 * shot timecodes with ffmpeg (Omni's own track stays underneath as ambience).
 *
 * Needs ffmpeg/ffprobe on PATH (or FFMPEG_PATH / FFPROBE_PATH), so it runs on
 * a local or self-hosted server — not on Vercel's serverless runtime.
 */

const run = promisify(execFile)
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg"
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe"

/** Gap kept between two dubbed lines, and lead-in after a shot cut. */
const LINE_GAP = 0.15
const SHOT_LEAD_IN = 0.2
const MAX_LINES = 24

interface DubRequest {
    video: { base64: string; mimeType: string }
    lines: { start: number; voice: string; text: string; style?: string; speaker?: string }[]
    /** 0–1: how loud Omni's original track stays under the dub. */
    originalVolume?: number
}

interface Placed {
    speaker: string
    text: string
    start: number
    end: number
}

async function speak(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ai: any,
    line: DubRequest["lines"][number],
): Promise<Buffer> {
    const item: Record<string, unknown> = { type: "text", text: line.text }
    if (line.style) item.annotations = [{ type: "speech_metadata", style: line.style }]
    let lastError: unknown
    // 3.8 TTS occasionally throws a transient 500 — retry like the backend does.
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const interaction = await ai.interactions.create({
                model: FILM_TTS_MODEL,
                input: [{ type: "user_input", content: [item] }],
                response_format: { type: "audio" },
                generation_config: { speech_config: [{ voice: line.voice }] },
            })
            const data = interaction?.output_audio?.data
            if (!data) throw new Error("The voice model returned no audio")
            return Buffer.isBuffer(data) ? data : Buffer.from(data, "base64")
        } catch (err) {
            lastError = err
            const status = (err as { status?: number })?.status
            if (status && status < 500) break
        }
    }
    throw new Error(`Couldn't voice "${line.text.slice(0, 40)}": ${errorMessage(lastError, "TTS failed")}`)
}

async function probe(file: string): Promise<{ duration: number; hasAudio: boolean }> {
    const { stdout } = await run(FFPROBE, [
        "-v", "error",
        "-show_entries", "format=duration:stream=codec_type",
        "-of", "json",
        file,
    ])
    const info = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string }[] }
    return {
        duration: Number(info.format?.duration) || 0,
        hasAudio: (info.streams ?? []).some((s) => s.codec_type === "audio"),
    }
}

export async function POST(req: NextRequest) {
    const ai = geminiClient(req)
    if (!ai) return missingKeyResponse()

    let dir = ""
    try {
        const body = (await req.json()) as DubRequest
        const lines = (body.lines ?? []).filter((l) => l?.voice?.trim() && l?.text?.trim()).slice(0, MAX_LINES)
        if (!body.video?.base64) return NextResponse.json({ error: "No clip to dub" }, { status: 400 })
        if (lines.length === 0) return NextResponse.json({ error: "No voiced dialogue in this scene" }, { status: 400 })
        const originalVolume = Math.min(1, Math.max(0, Number(body.originalVolume ?? 0.35)))

        dir = await mkdtemp(path.join(tmpdir(), "film-dub-"))
        const videoFile = path.join(dir, "clip.mp4")
        await writeFile(videoFile, Buffer.from(body.video.base64, "base64"))

        // Voice the lines three at a time.
        const audio: Buffer[] = new Array(lines.length)
        let next = 0
        await Promise.all(
            Array.from({ length: Math.min(3, lines.length) }, async () => {
                while (next < lines.length) {
                    const i = next++
                    audio[i] = await speak(ai, lines[i])
                }
            }),
        )

        const lineFiles = await Promise.all(
            audio.map(async (buf, i) => {
                const file = path.join(dir, `line-${i}.wav`)
                await writeFile(file, buf)
                return file
            }),
        )
        const [clip, ...lineInfo] = await Promise.all([videoFile, ...lineFiles].map(probe))
        if (!clip.duration) throw new Error("Couldn't read the clip's duration")

        // Lines start at their shot (plus a beat), never on top of the previous line.
        const placed: Placed[] = []
        let cursor = 0
        lines.forEach((line, i) => {
            const start = Math.max(line.start + SHOT_LEAD_IN, cursor)
            const end = start + lineInfo[i].duration
            placed.push({ speaker: line.speaker ?? "", text: line.text, start, end })
            cursor = end + LINE_GAP
        })

        // Input 0: clip, 1: silent bed as long as the clip, 2…: the lines.
        const args = ["-y", "-i", videoFile, "-f", "lavfi", "-t", String(clip.duration), "-i", "anullsrc=r=48000:cl=stereo"]
        lineFiles.forEach((f) => args.push("-i", f))

        const filters: string[] = []
        const mix = ["[1:a]"]
        if (clip.hasAudio && originalVolume > 0) {
            filters.push(`[0:a]volume=${originalVolume.toFixed(2)},aresample=48000[orig]`)
            mix.push("[orig]")
        }
        placed.forEach((p, i) => {
            const ms = Math.round(p.start * 1000)
            filters.push(`[${i + 2}:a]aresample=48000,adelay=${ms}:all=1[l${i}]`)
            mix.push(`[l${i}]`)
        })
        filters.push(`${mix.join("")}amix=inputs=${mix.length}:duration=first:normalize=0[aout]`)

        const outFile = path.join(dir, "dubbed.mp4")
        args.push(
            "-filter_complex", filters.join(";"),
            "-map", "0:v", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            outFile,
        )
        await run(FFMPEG, args, { maxBuffer: 16 * 1024 * 1024 })

        const warnings = placed
            .filter((p) => p.end > clip.duration + 0.05)
            .map((p) => `${p.speaker || "A line"} runs past the end of the clip and is cut off: "${p.text.slice(0, 50)}"`)

        return NextResponse.json({
            video: { base64: (await readFile(outFile)).toString("base64"), mimeType: "video/mp4" },
            lines: placed,
            warnings,
        })
    } catch (err) {
        const code = (err as { code?: string })?.code
        const message =
            code === "ENOENT"
                ? "ffmpeg isn't installed on the server (or set FFMPEG_PATH / FFPROBE_PATH)"
                : errorMessage(err, "Dubbing failed")
        console.error("Film dub error:", err)
        return NextResponse.json({ error: message }, { status: 500 })
    } finally {
        if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
    }
}
