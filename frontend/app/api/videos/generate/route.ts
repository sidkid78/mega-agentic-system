import { NextRequest, NextResponse } from "next/server"
import { geminiClient, missingKeyResponse } from "@/lib/server-gemini"
import { startOmniVideo, type OmniMedia } from "@/lib/omni-video"

// Image uploads happen here (bounded), but the multi-minute generation is
// offloaded to a background interaction, so this stays well under serverless
// duration caps. The client then polls /api/videos/poll.
export const maxDuration = 300

// ECONNRESET / "fetch failed" reaching the Gemini API is transient — retry with backoff.
function isTransientNetworkError(err: unknown): boolean {
    if (!(err instanceof Error)) return false
    const cause = (err as { cause?: { code?: string } }).cause
    const code = cause?.code
    return (
        err.message === "fetch failed" ||
        code === "ECONNRESET" ||
        code === "ETIMEDOUT" ||
        code === "ECONNREFUSED" ||
        code === "EAI_AGAIN"
    )
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastErr: unknown
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn()
        } catch (err) {
            lastErr = err
            if (!isTransientNetworkError(err) || i === attempts - 1) throw err
            await new Promise((r) => setTimeout(r, 1000 * 2 ** i)) // 1s, 2s, 4s
        }
    }
    throw lastErr
}

export async function POST(req: NextRequest) {
    try {
        const ai = geminiClient(req)
        if (!ai) return missingKeyResponse()

        const body = (await req.json()) as {
            prompt?: string
            model?: string
            aspectRatio?: string
            resolution?: string
            durationSeconds?: string | number
            images?: OmniMedia[]
            video?: OmniMedia
            previousInteractionId?: string
        }

        const {
            prompt,
            model,
            aspectRatio = "16:9",
            resolution = "720p",
            durationSeconds,
            images = [],
            video,
            previousInteractionId,
        } = body

        // A refinement turn needs only a prompt; a first turn needs a prompt or media.
        if (!prompt?.trim() && images.length === 0 && !video) {
            return NextResponse.json(
                { error: "prompt is required" },
                { status: 400 },
            )
        }

        const interactionId = await withRetry(() =>
            startOmniVideo(ai, {
                prompt,
                model,
                aspectRatio,
                resolution,
                durationSeconds,
                images,
                video,
                previousInteractionId,
            }),
        )

        return NextResponse.json({ interactionId })
    } catch (err: unknown) {
        console.error("Video generate error:", err)
        const message = err instanceof Error ? err.message : "Failed to start video generation"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
