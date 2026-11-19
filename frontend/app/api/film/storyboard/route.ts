import { NextRequest, NextResponse } from "next/server"
import { geminiClient, missingKeyResponse } from "@/lib/server-gemini"
import { generateJson, errorMessage } from "@/lib/film/server"

export const maxDuration = 120

/**
 * Plans a scene's storyboard: up to `maxShots` timecoded shots that fit one
 * Omni clip, each naming the characters and props it shows.
 */

interface StoryboardRequest {
    heading: string
    body: string
    summary?: string
    style?: string
    durationSeconds: number
    maxShots: number
    location?: { name: string; description: string }
    characters: { name: string; description: string }[]
    props: { name: string; description: string }[]
}

const SCHEMA = {
    type: "object",
    properties: {
        shots: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    start: { type: "integer", description: "Start second within the clip" },
                    end: { type: "integer", description: "End second within the clip" },
                    description: { type: "string", description: "What the frame shows — subjects, action, setting" },
                    camera: { type: "string", description: "Shot size, angle and movement" },
                    dialogue: { type: "string", description: "Line spoken during this shot as 'NAME: line', or empty" },
                    characters: { type: "array", items: { type: "string" } },
                    props: { type: "array", items: { type: "string" } },
                },
                required: ["start", "end", "description", "camera", "dialogue", "characters", "props"],
            },
        },
    },
    required: ["shots"],
}

export async function POST(req: NextRequest) {
    try {
        const ai = geminiClient(req)
        if (!ai) return missingKeyResponse()

        const b = (await req.json()) as StoryboardRequest
        const duration = Math.min(10, Math.max(3, Math.round(b.durationSeconds || 8)))
        const maxShots = Math.min(6, Math.max(1, Math.round(b.maxShots || 6)))

        const list = (items: { name: string; description: string }[]) =>
            items.length ? items.map((i) => `- ${i.name}: ${i.description}`).join("\n") : "(none)"

        const prompt = [
            "You are a film director and storyboard artist. Break this scene into shots for a single continuous AI-generated video clip.",
            `The clip is exactly ${duration} seconds. Plan between 2 and ${maxShots} shots that cover 0–${duration}s back to back with no gaps or overlaps; each shot lasts at least 1 second. Fewer, longer shots read better than many flashes — use the full ${maxShots} only when the action calls for quick cuts.`,
            "Cover the scene's key beats and every line of dialogue (shorten lines that cannot be spoken in the time available). Vary shot sizes like a real editor: establish, then coverage, then reaction or insert.",
            "Name characters and props exactly as listed below. Only include those visible in each shot.",
            `Visual style: ${b.style || "cinematic"}.`,
            "",
            `SCENE: ${b.heading}`,
            b.summary ? `Summary: ${b.summary}` : "",
            b.body,
            "",
            `Location: ${b.location ? `${b.location.name} — ${b.location.description}` : "(unspecified)"}`,
            `Characters:\n${list(b.characters ?? [])}`,
            `Props:\n${list(b.props ?? [])}`,
        ].join("\n")

        const result = await generateJson<{ shots: unknown[] }>(ai, prompt, SCHEMA)
        return NextResponse.json({ shots: (result.shots ?? []).slice(0, maxShots), durationSeconds: duration })
    } catch (err) {
        console.error("[film/storyboard]", err)
        return NextResponse.json({ error: errorMessage(err, "Storyboard planning failed") }, { status: 500 })
    }
}
