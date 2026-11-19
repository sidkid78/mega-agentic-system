/**
 * Server-only helper: a structured-JSON call through the Interactions API.
 */
import type { GoogleGenAI } from "@google/genai"
import { FILM_TEXT_MODEL } from "@/lib/film/types"

export async function generateJson<T>(
    ai: GoogleGenAI,
    prompt: string,
    schema: Record<string, unknown>,
): Promise<T> {
    // The SDK's types lag the Interactions API, as in lib/omni-video.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interaction: any = await (ai as any).interactions.create({
        model: FILM_TEXT_MODEL,
        input: prompt,
        response_format: { type: "text", mime_type: "application/json", schema },
    })

    let text: string = interaction?.output_text ?? ""
    if (!text) {
        for (const step of interaction?.steps ?? []) {
            if (step?.type !== "model_output") continue
            for (const block of step.content ?? []) {
                if (block?.type === "text" && block.text) text += block.text
            }
        }
    }
    if (!text.trim()) throw new Error("The model returned no output")

    try {
        return JSON.parse(text) as T
    } catch {
        // Tolerate a fenced reply.
        const fenced = text.match(/\{[\s\S]*\}/)
        if (fenced) return JSON.parse(fenced[0]) as T
        throw new Error("The model returned malformed JSON")
    }
}

export function errorMessage(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback
}
