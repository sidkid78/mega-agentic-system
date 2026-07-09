import { NextRequest, NextResponse } from "next/server"
import { geminiClient, missingKeyResponse } from "@/lib/server-gemini"

export const maxDuration = 60

export async function POST(req: NextRequest) {
    try {
        const ai = geminiClient(req)
        if (!ai) return missingKeyResponse()

        const {
            prompt,
            model = "gemini-3.1-flash-image-preview",
            images = [],        // [{ base64, mimeType }] — for edit / reference modes
            aspectRatio = "1:1",
            imageSize,          // "512" | "1K" | "2K" | "4K" — Gemini 3 models only
            useSearchGrounding = false,
            thinkingLevel,      // "minimal" | "high" — 3.1 Flash only
            includeText = false,
        } = await req.json()

        // ── Build content parts ──────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = [{ text: prompt || " " }]
        for (const img of images as Array<{ base64: string; mimeType: string }>) {
            parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } })
        }

        // ── Build config ────────────────────────────────────────────────────
        const isGemini25 = (model as string).startsWith("gemini-2.5")
        const isGemini31Flash = model === "gemini-3.1-flash-image-preview"

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config: any = {
            responseModalities: includeText ? ["TEXT", "IMAGE"] : ["IMAGE"],
        }

        // Aspect ratio (all models) + image size (Gemini 3 only)
        if (isGemini25) {
            config.responseFormat = { image: { aspectRatio } }
        } else {
            config.responseFormat = {
                image: {
                    aspectRatio,
                    ...(imageSize ? { imageSize } : {}),
                },
            }
        }

        // Google Search grounding
        if (useSearchGrounding) {
            config.tools = [{ googleSearch: {} }]
        }

        // Thinking level (Gemini 3.1 Flash Image only)
        if (isGemini31Flash && thinkingLevel) {
            config.thinkingConfig = { thinkingLevel }
        }

        // ── Call API ────────────────────────────────────────────────────────
        const response = await ai.models.generateContent({
            model,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            contents: [{ role: "user", parts }] as any,
            config,
        })

        // ── Extract results ──────────────────────────────────────────────────
        const resultImages: Array<{ base64: string; mimeType: string }> = []
        let resultText = ""

        for (const part of response.candidates?.[0]?.content?.parts ?? []) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = part as any
            if (p.thought) continue          // skip internal thought images
            if (p.text) {
                resultText += p.text
            } else if (p.inlineData) {
                resultImages.push({
                    base64: p.inlineData.data,
                    mimeType: p.inlineData.mimeType ?? "image/png",
                })
            }
        }

        return NextResponse.json({ images: resultImages, text: resultText })
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Image generation failed"
        console.error("[nano-banana]", err)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
