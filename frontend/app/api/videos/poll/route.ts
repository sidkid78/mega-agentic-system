import { NextRequest, NextResponse } from "next/server"
import { requestGeminiKey, missingKeyResponse } from "@/lib/server-gemini"

export const maxDuration = 60

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const operationName = searchParams.get("op")

        if (!operationName) {
            return NextResponse.json({ error: "op parameter required" }, { status: 400 })
        }

        const apiKey = requestGeminiKey(req)
        if (!apiKey) return missingKeyResponse()

        // Poll the operation directly via REST — avoids SDK internal hydration issues
        const opRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`,
        )
        if (!opRes.ok) {
            const text = await opRes.text()
            return NextResponse.json(
                { error: `Operation poll failed: ${opRes.status} ${text}` },
                { status: 502 },
            )
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const operation: any = await opRes.json()

        if (!operation.done) {
            return NextResponse.json({ done: false })
        }

        // Surface API-level error (e.g. safety block)
        if (operation.error) {
            return NextResponse.json({ error: operation.error.message || "API error" }, { status: 500 })
        }

        // Extract from actual API response shape:
        // response.generateVideoResponse.generatedSamples[].video
        const resp = operation.response ?? {}
        const generatedSamples =
            resp.generateVideoResponse?.generatedSamples ??  // real shape
            resp.generatedVideos ??                           // fallback (older docs)
            resp.videos ??
            null

        if (!generatedSamples || generatedSamples.length === 0) {
            return NextResponse.json(
                { error: "No video in response", _debug: operation },
                { status: 500 },
            )
        }

        const video = generatedSamples[0].video ?? generatedSamples[0]

        // videoBytes already present — return as base64
        if (video?.videoBytes) {
            const base64 =
                typeof video.videoBytes === "string"
                    ? video.videoBytes
                    : Buffer.from(video.videoBytes).toString("base64")
            return NextResponse.json({
                done: true,
                videoBase64: base64,
                mimeType: video.mimeType || "video/mp4",
            })
        }

        // Download from signed URI
        if (video?.uri) {
            const downloadUrl = video.uri.includes("?")
                ? `${video.uri}&key=${apiKey}`
                : `${video.uri}?key=${apiKey}`

            const dlRes = await fetch(downloadUrl)
            if (!dlRes.ok) {
                return NextResponse.json(
                    { error: `Failed to download video: ${dlRes.statusText}` },
                    { status: 502 },
                )
            }
            const arrayBuffer = await dlRes.arrayBuffer()
            const base64 = Buffer.from(arrayBuffer).toString("base64")
            const contentType = dlRes.headers.get("content-type") || "video/mp4"

            return NextResponse.json({ done: true, videoBase64: base64, mimeType: contentType })
        }

        return NextResponse.json({ error: "No video bytes or URI in response" }, { status: 500 })
    } catch (err: unknown) {
        console.error("Video poll error:", err)
        const message = err instanceof Error ? err.message : "Failed to check video status"
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
