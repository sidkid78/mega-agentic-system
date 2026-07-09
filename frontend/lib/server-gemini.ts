/**
 * Server-side BYOK helpers for the Next.js /api/* routes.
 *
 * These routes call Gemini directly (video + nano-banana image gen). Under BYOK
 * they hold no key of their own — each reads the caller's key from the
 * `X-Gemini-Key` request header and builds a per-request client.
 */
import { NextRequest, NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"

export const MISSING_KEY_MESSAGE =
    "No Gemini API key provided. Add your key in Settings to use this feature."

/** The caller's Gemini key from the request header, or "" if absent. */
export function requestGeminiKey(req: NextRequest): string {
    return (req.headers.get("x-gemini-key") ?? "").trim()
}

export function missingKeyResponse(): NextResponse {
    return NextResponse.json({ error: MISSING_KEY_MESSAGE }, { status: 401 })
}

/** Per-request client, or null when no key was provided (return missingKeyResponse). */
export function geminiClient(req: NextRequest): GoogleGenAI | null {
    const apiKey = requestGeminiKey(req)
    if (!apiKey) return null
    return new GoogleGenAI({ apiKey })
}
