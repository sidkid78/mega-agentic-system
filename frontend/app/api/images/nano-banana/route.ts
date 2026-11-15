import { NextRequest, NextResponse } from "next/server"
import { geminiClient, missingKeyResponse } from "@/lib/server-gemini"
import {
    NANO_BANANA_MODEL,
    supportsImageSearch,
    supportsSearchGrounding,
    supportsThinkingLevel,
    supportsVideoInput,
} from "@/lib/image-models"
import type { ImageBlock, OutputBlock } from "@/lib/image-models"

export const maxDuration = 60

interface InputImage {
    base64: string
    mimeType: string
}

export async function POST(req: NextRequest) {
    try {
        const ai = geminiClient(req)
        if (!ai) return missingKeyResponse()

        const {
            prompt,
            model = NANO_BANANA_MODEL,
            images = [],            // [{ base64, mimeType }] — for edit / reference modes
            videoUrl,               // public YouTube URL — video-to-image
            aspectRatio,            // omit to keep the shape of the input / previous image
            imageSize,              // "1K" | "2K" | "4K"
            useSearchGrounding = false,
            useImageSearch = false, // Google Image Search as visual context
            thinkingLevel,          // "minimal" | "high" — not sent for Pro
            includeText = false,
            previousInteractionId,  // continue an earlier turn (multi-turn editing)
        } = await req.json()

        // ── Build input ─────────────────────────────────────────────────────
        const inputImages = images as InputImage[]
        const hasVideo = Boolean(videoUrl) && supportsVideoInput(model)
        const text = prompt || " "
        const input =
            inputImages.length === 0 && !hasVideo
                ? text
                : [
                      ...(hasVideo
                          ? [{ type: "video", uri: videoUrl, mime_type: "video/mp4" }]
                          : []),
                      { type: "text", text },
                      ...inputImages.map((img) => ({
                          type: "image",
                          data: img.base64,
                          mime_type: img.mimeType,
                      })),
                  ]

        // ── Output format ───────────────────────────────────────────────────
        const imageFormat = {
            type: "image",
            ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
            ...(imageSize ? { image_size: imageSize } : {}),
        }

        // ── Grounding ───────────────────────────────────────────────────────
        const searchTypes = [
            ...(useSearchGrounding && supportsSearchGrounding(model) ? ["web_search"] : []),
            ...(useImageSearch && supportsImageSearch(model) ? ["image_search"] : []),
        ]

        // ── Call API ────────────────────────────────────────────────────────
        // The SDK's types lag the Interactions API, as in lib/omni-video.ts.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const interaction: any = await (ai as any).interactions.create({
            model,
            input,
            // An image-only format drops the model's commentary; a list keeps it.
            response_format: includeText ? [{ type: "text" }, imageFormat] : imageFormat,
            ...(searchTypes.length > 0
                ? { tools: [{ type: "google_search", search_types: searchTypes }] }
                : {}),
            ...(thinkingLevel && supportsThinkingLevel(model)
                ? { generation_config: { thinking_level: thinkingLevel } }
                : {}),
            ...(previousInteractionId
                ? { previous_interaction_id: previousInteractionId }
                : {}),
        })

        // ── Extract results ──────────────────────────────────────────────────
        // Blocks keep the model's order, so interleaved text and images (Pro)
        // read as written. Thoughts are their own step type and are skipped.
        const blocks: OutputBlock[] = []
        const searchSuggestions = new Set<string>()
        let usedSearch = false

        for (const step of interaction?.steps ?? []) {
            if (step?.type === "google_search_call") {
                usedSearch = true
            } else if (step?.type === "google_search_result") {
                // Google's terms require showing these when Search grounding is used.
                for (const result of step.result ?? []) {
                    if (result?.search_suggestions) searchSuggestions.add(result.search_suggestions)
                }
            } else if (step?.type === "model_output") {
                for (const block of step.content ?? []) {
                    if (block?.type === "text" && block.text) {
                        blocks.push({ type: "text", text: block.text })
                    } else if (block?.type === "image" && block.data) {
                        blocks.push({
                            type: "image",
                            base64: block.data,
                            mimeType: block.mime_type ?? "image/png",
                        })
                    }
                }
            }
        }

        const resultImages = blocks.filter((b): b is ImageBlock => b.type === "image")

        return NextResponse.json({
            blocks,
            images: resultImages.map(({ base64, mimeType }) => ({ base64, mimeType })),
            text: blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n\n"),
            interactionId: interaction?.id ?? null,
            // A turn that ran Search cannot be continued by id (see the page's refine flow).
            usedSearch,
            searchSuggestions: [...searchSuggestions],
        })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Image generation failed"
        console.error("[nano-banana]", err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
