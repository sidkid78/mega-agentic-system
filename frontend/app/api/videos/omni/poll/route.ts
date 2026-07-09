import { NextRequest, NextResponse } from "next/server"
import { requestGeminiKey, geminiClient, missingKeyResponse } from "@/lib/server-gemini"

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const interaction: any = await (ai as any).interactions.get(id)
        const status: string | undefined = interaction?.status

        if (status === "failed" || status === "cancelled") {
            return NextResponse.json(
                { error: interaction?.error?.message || `Omni interaction ${status}` },
                { status: 500 },
            )
        }
        if (status !== "completed") {
            return NextResponse.json({ done: false, status: status ?? "in_progress" })
        }

        // Completed — locate the video output.
        const outputs = interaction?.outputs
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let videoOut: any = Array.isArray(outputs)
            ? outputs.find((o: { type?: string }) => o?.type === "video")
            : null
        videoOut = videoOut ?? interaction?.output_video ?? interaction?.outputVideo ?? null

        if (!videoOut) {
            return NextResponse.json(
                {
                    error:
                        "Omni completed but returned no video. If you uploaded a video to edit, note " +
                        "that video-to-video edits are region-restricted (unavailable in the EEA, UK, " +
                        "Switzerland, and some US states).",
                },
                { status: 500 },
            )
        }

        // Inline delivery
        const inline = videoOut.data ?? videoOut.videoBytes
        if (inline) {
            const base64 =
                typeof inline === "string" ? inline : Buffer.from(inline).toString("base64")
            return NextResponse.json({
                done: true,
                videoBase64: base64,
                mimeType: videoOut.mime_type || videoOut.mimeType || "video/mp4",
                interactionId: interaction.id,
            })
        }

        // URI delivery — download via the Files API
        const uri: string | undefined = videoOut.uri
        if (uri) {
            const sep = uri.includes("?") ? "&" : "?"
            const dlRes = await fetch(`${uri}${sep}alt=media`, {
                headers: { "x-goog-api-key": apiKey },
            })
            if (!dlRes.ok) {
                const text = await dlRes.text()
                return NextResponse.json(
                    { error: `Failed to download Omni video: ${dlRes.status} ${text}` },
                    { status: 502 },
                )
            }
            const arrayBuffer = await dlRes.arrayBuffer()
            const base64 = Buffer.from(arrayBuffer).toString("base64")
            const contentType = dlRes.headers.get("content-type") || "video/mp4"
            return NextResponse.json({
                done: true,
                videoBase64: base64,
                mimeType: contentType,
                interactionId: interaction.id,
            })
        }

        return NextResponse.json(
            { error: "No video uri or data in Omni response" },
            { status: 500 },
        )
    } catch (err: unknown) {
        console.error("Omni poll error:", err)
        const message = err instanceof Error ? err.message : "Failed to poll Omni interaction"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
