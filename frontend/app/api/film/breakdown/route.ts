import { NextRequest, NextResponse } from "next/server"
import { geminiClient, missingKeyResponse } from "@/lib/server-gemini"
import { generateJson, errorMessage } from "@/lib/film/server"

export const maxDuration = 120

/**
 * Script breakdown: reads every scene and returns the characters, locations
 * and props it needs — each with a visual description an image model can draw
 * — plus which of them each scene uses.
 */

interface BreakdownRequest {
    title?: string
    style?: string
    scenes: { id: string; heading: string; body: string }[]
    /** Assets the user already has, so names stay stable across re-runs. */
    existing?: { kind: string; name: string; description: string }[]
}

const assetList = (what: string) => ({
    type: "array",
    items: {
        type: "object",
        properties: {
            name: { type: "string", description: `Short, consistent name of the ${what}` },
            description: {
                type: "string",
                description: `Concrete visual description of the ${what} for an illustrator (2–4 sentences)`,
            },
        },
        required: ["name", "description"],
    },
})

const SCHEMA = {
    type: "object",
    properties: {
        characters: assetList("character"),
        locations: assetList("location"),
        props: assetList("prop"),
        scenes: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    sceneId: { type: "string" },
                    summary: { type: "string", description: "One-sentence summary of what happens" },
                    location: { type: "string", description: "Name of the location, exactly as in locations" },
                    characters: { type: "array", items: { type: "string" } },
                    props: { type: "array", items: { type: "string" } },
                },
                required: ["sceneId", "summary", "location", "characters", "props"],
            },
        },
    },
    required: ["characters", "locations", "props", "scenes"],
}

export async function POST(req: NextRequest) {
    try {
        const ai = geminiClient(req)
        if (!ai) return missingKeyResponse()

        const body = (await req.json()) as BreakdownRequest
        const scenes = (body.scenes ?? []).filter((s) => s.heading?.trim() || s.body?.trim())
        if (scenes.length === 0) {
            return NextResponse.json({ error: "Write at least one scene first" }, { status: 400 })
        }

        const existing = (body.existing ?? [])
            .map((a) => `- ${a.kind}: ${a.name} — ${a.description}`)
            .join("\n")

        const prompt = [
            "You are a film production designer doing a script breakdown for AI-generated pre-production art.",
            `Film: ${body.title || "Untitled"}. Visual style: ${body.style || "cinematic"}.`,
            "",
            "Extract:",
            "- characters: every character who appears on screen. Describe age range, build, face, hair, skin tone, and wardrobe concretely. Invent tasteful specifics the script leaves open, consistent with the story.",
            "- locations: every distinct setting. Describe terrain/architecture, time of day, weather, lighting and mood (e.g. a desert highway at noon: cracked asphalt, heat shimmer, bleached sky).",
            "- props: only objects that matter visually or to the story — vehicles, weapons, signature items, devices. Keep exact makes and models from the script (e.g. 'Porsche 911 Turbo', with year/color if implied). Skip generic background objects.",
            "- scenes: for each scene id, a one-sentence summary and the exact names of its location, characters and props.",
            "Use the same name for the same thing everywhere. Characters who are only mentioned and never seen are not included.",
            existing
                ? `\nThese assets already exist — reuse these exact names when they match, and do not duplicate them:\n${existing}`
                : "",
            "",
            "SCRIPT:",
            ...scenes.map((s) => `\n[sceneId: ${s.id}]\n${s.heading}\n${s.body}`),
        ].join("\n")

        const result = await generateJson(ai, prompt, SCHEMA)
        return NextResponse.json(result)
    } catch (err) {
        console.error("[film/breakdown]", err)
        return NextResponse.json({ error: errorMessage(err, "Breakdown failed") }, { status: 500 })
    }
}
