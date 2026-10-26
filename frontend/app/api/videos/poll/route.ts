import { NextRequest, NextResponse } from "next/server"
import { requestGeminiKey, geminiClient, missingKeyResponse } from "@/lib/server-gemini"
import { pollOmniVideo, OmniInteractionError } from "@/lib/omni-video"

export const maxDuration = 60

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get("id")
        if (!id) {
            return NextResponse.json({ error: "id parameter required" }, { status: 400 })
        }

        const apiKey = requestGeminiKey(req)
        const ai = geminiClient(req)
        if (!ai) return missingKeyResponse()

        const result = await pollOmniVideo(ai, apiKey, id)
        if (!result) return NextResponse.json({ done: false })

        return NextResponse.json({ done: true, ...result })
    } catch (err: unknown) {
        console.error("Video poll error:", err)
        const message = err instanceof Error ? err.message : "Failed to poll video generation"
        // A terminal interaction failure is an upstream result, not a bug here.
        const status = err instanceof OmniInteractionError ? 502 : 500
        return NextResponse.json({ error: message }, { status })
    }
}
