import { NextRequest, NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"
import { geminiClient, missingKeyResponse } from "@/lib/server-gemini"

// Starts an Omni interaction in `background: true` mode and returns immediately
// with the interaction id — the client then polls /api/videos/omni/poll.
// Upload + file processing still happen here (bounded), but the multi-minute
// video generation is offloaded to the background job, keeping this well under
// serverless duration caps for the common (text / refine / small-clip) cases.
export const maxDuration = 300

interface MediaInput {
    base64: string
    mimeType: string
}

function base64ToBlob(base64: string, mimeType: string): Blob {
    return new Blob([Buffer.from(base64, "base64")], { type: mimeType })
}

// Uploads a base64 asset via the Files API and polls until it is ACTIVE.
async function uploadAndWait(media: MediaInput, kind: "image" | "video", ai: GoogleGenAI) {
    const blob = base64ToBlob(media.base64, media.mimeType)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = await ai.files.upload({
        file: blob,
        config: { mimeType: media.mimeType },
    })

    const name = current.name
    let attempts = 0
    while (
        name &&
        current.state &&
        String(current.state).toUpperCase().includes("PROCESSING") &&
        attempts < 40
    ) {
        await new Promise((r) => setTimeout(r, 3000))
        current = await ai.files.get({ name })
        attempts++
    }

    if (current.state && String(current.state).toUpperCase().includes("FAILED")) {
        throw new Error(`File processing failed for uploaded ${kind}.`)
    }

    return { uri: current.uri as string, mimeType: (current.mimeType || media.mimeType) as string }
}

export async function POST(req: NextRequest) {
    try {
        const ai = geminiClient(req)
        if (!ai) return missingKeyResponse()

        const body = await req.json()
        const {
            prompt,
            model = "gemini-omni-flash-preview",
            aspectRatio = "16:9",
            duration,
            images = [],
            video,
            previousInteractionId,
        } = body as {
            prompt?: string
            model?: string
            aspectRatio?: string
            duration?: string | number
            images?: MediaInput[]
            video?: MediaInput
            previousInteractionId?: string
        }

        if (!prompt || !String(prompt).trim()) {
            return NextResponse.json({ error: "prompt is required" }, { status: 400 })
        }

        // Build the ordered input parts: images → video → text.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inputParts: any[] = []

        for (const img of images ?? []) {
            const { uri, mimeType } = await uploadAndWait(img, "image", ai)
            inputParts.push({ type: "image", uri, mime_type: mimeType })
        }

        if (video) {
            const { uri, mimeType } = await uploadAndWait(video, "video", ai)
            inputParts.push({ type: "video", uri, mime_type: mimeType })
        }

        inputParts.push({ type: "text", text: prompt })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const responseFormat: any = {
            type: "video",
            aspect_ratio: aspectRatio,
            delivery: "uri",
        }
        if (duration) {
            const secs = parseInt(String(duration).replace(/s$/i, ""), 10)
            if (!Number.isNaN(secs)) responseFormat.duration = `${secs}s`
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const interaction: any = await (ai as any).interactions.create({
            model,
            input: inputParts,
            response_format: responseFormat,
            background: true,
            ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
        })

        if (!interaction?.id) {
            return NextResponse.json(
                { error: "Omni did not return an interaction id" },
                { status: 500 },
            )
        }

        return NextResponse.json({ interactionId: interaction.id })
    } catch (err: unknown) {
        console.error("Omni generate error:", err)
        const message = err instanceof Error ? err.message : "Failed to start Omni generation"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
