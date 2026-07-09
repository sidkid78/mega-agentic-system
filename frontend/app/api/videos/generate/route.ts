import { NextRequest, NextResponse } from "next/server"
import { geminiClient, missingKeyResponse } from "@/lib/server-gemini"

export const maxDuration = 60

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

        const body = await req.json()
        const {
            prompt,
            model = "veo-3.1-generate-preview",
            aspectRatio = "16:9",
            resolution = "720p",
            durationSeconds = 8,
            // image-to-video / interpolation
            imageBase64,
            imageMimeType,
            // last frame interpolation
            lastFrameBase64,
            lastFrameMimeType,
            // reference images (up to 3)
            referenceImages,
            // video extension
            videoBase64,
            videoMimeType,
        } = body

        if (!prompt && !videoBase64) {
            return NextResponse.json({ error: "prompt is required" }, { status: 400 })
        }

        // Build config
        const config: Record<string, unknown> = {
            aspectRatio,
            resolution,
            durationSeconds: Number(durationSeconds),
        }

        // Reference images
        if (referenceImages && referenceImages.length > 0) {
            config.referenceImages = referenceImages.map((ref: { imageBase64: string; mimeType: string }) => ({
                image: { imageBytes: ref.imageBase64, mimeType: ref.mimeType },
                referenceType: "asset",
            }))
        }

        // Last frame for interpolation
        if (lastFrameBase64) {
            config.lastFrame = { imageBytes: lastFrameBase64, mimeType: lastFrameMimeType || "image/png" }
        }

        // Build generate call params
        const params: Record<string, unknown> = {
            model,
            prompt: prompt || "",
            config,
        }

        // Image as first frame (image-to-video or interpolation)
        if (imageBase64) {
            params.image = { imageBytes: imageBase64, mimeType: imageMimeType || "image/png" }
        }

        // Video extension
        if (videoBase64) {
            params.video = { videoBytes: videoBase64, mimeType: videoMimeType || "video/mp4" }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const operation = await withRetry<{ name?: string }>(() => (ai.models as any).generateVideos(params))

        return NextResponse.json({ operationName: operation.name })
    } catch (err: unknown) {
        console.error("Video generate error:", err)
        const message = err instanceof Error ? err.message : "Failed to start video generation"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
