/**
 * Gemini Omni Flash video generation.
 *
 * Omni replaced the Veo family on the Gemini API — every `veo-*` id this app
 * used has been shut down (veo-3.0/2.0 on June 30 2026, the veo-3.1 previews on
 * October 22 2026), and `gemini-omni-flash-preview` went with them. One model
 * now covers every task the videos page exposes: text-to-video, image-to-video,
 * first+last frame interpolation, extension and conversational editing, all
 * with native audio.
 *
 * Requests go through the Interactions API in `background: true` mode — start
 * the interaction, return its id, then poll. Generation runs for minutes, so
 * this keeps each individual request well under serverless duration caps.
 */
import { GoogleGenAI } from "@google/genai"
import {
    OMNI_VIDEO_MODEL,
    OMNI_MIN_DURATION,
    OMNI_MAX_DURATION,
} from "@/lib/omni-video-options"

export * from "@/lib/omni-video-options"

export interface OmniMedia {
    base64: string
    mimeType: string
}

export interface OmniVideoRequest {
    prompt?: string
    model?: string
    aspectRatio?: string
    resolution?: string
    durationSeconds?: string | number
    /**
     * Ordered input images, sent inline as base64. One image seeds the video;
     * two are read as first and last frame for interpolation; further images
     * act as references the model draws on as the prompt directs.
     */
    images?: OmniMedia[]
    /** A clip to edit or extend — uploaded via the Files API, since Omni takes video by uri. */
    video?: OmniMedia
    /** A prior interaction to continue, for turn-by-turn refinement. */
    previousInteractionId?: string
}

export interface OmniVideoResult {
    videoBase64: string
    mimeType: string
    interactionId: string
}

/** Thrown when a background interaction ends in a terminal failure. */
export class OmniInteractionError extends Error {}

/** Clamps a requested duration into the range Omni actually supports. */
export function clampDuration(value: string | number): number | null {
    const secs = parseInt(String(value).replace(/s$/i, ""), 10)
    if (Number.isNaN(secs)) return null
    return Math.min(OMNI_MAX_DURATION, Math.max(OMNI_MIN_DURATION, secs))
}

function base64ToBlob(base64: string, mimeType: string): Blob {
    return new Blob([Buffer.from(base64, "base64")], { type: mimeType })
}

/** Uploads a base64 clip via the Files API and waits for it to leave PROCESSING. */
async function uploadVideoAndWait(media: OmniMedia, ai: GoogleGenAI) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = await ai.files.upload({
        file: base64ToBlob(media.base64, media.mimeType),
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
        throw new Error("File processing failed for the uploaded video.")
    }

    return {
        uri: current.uri as string,
        mimeType: (current.mimeType || media.mimeType) as string,
    }
}

/**
 * Starts a background Omni interaction and returns its id.
 *
 * Input order matters: images first (first frame, then last frame when
 * interpolating), then any source video, then the text prompt.
 */
export async function startOmniVideo(
    ai: GoogleGenAI,
    req: OmniVideoRequest,
): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const input: any[] = []

    for (const img of req.images ?? []) {
        input.push({ type: "image", data: img.base64, mime_type: img.mimeType })
    }

    if (req.video) {
        const { uri, mimeType } = await uploadVideoAndWait(req.video, ai)
        input.push({ type: "video", uri, mime_type: mimeType })
    }

    if (req.prompt && req.prompt.trim()) {
        input.push({ type: "text", text: req.prompt })
    }

    if (input.length === 0) {
        throw new Error("Nothing to generate from — provide a prompt, an image or a video.")
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseFormat: any = {
        type: "video",
        // URI delivery keeps the create response small; the poll downloads the bytes.
        delivery: "uri",
    }
    if (req.aspectRatio) responseFormat.aspect_ratio = req.aspectRatio
    if (req.resolution) responseFormat.resolution = req.resolution
    if (req.durationSeconds !== undefined) {
        const secs = clampDuration(req.durationSeconds)
        if (secs !== null) responseFormat.duration = `${secs}s`
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interaction: any = await (ai as any).interactions.create({
        model: req.model || OMNI_VIDEO_MODEL,
        input,
        response_format: responseFormat,
        background: true,
        ...(req.previousInteractionId
            ? { previous_interaction_id: req.previousInteractionId }
            : {}),
    })

    if (!interaction?.id) {
        throw new Error("Omni did not return an interaction id")
    }
    return interaction.id as string
}

/**
 * Checks a background interaction. Returns null while it is still running, or
 * the finished video once it completes.
 */
export async function pollOmniVideo(
    ai: GoogleGenAI,
    apiKey: string,
    id: string,
): Promise<OmniVideoResult | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interaction: any = await (ai as any).interactions.get(id)
    const status: string | undefined = interaction?.status

    if (status === "failed" || status === "cancelled") {
        throw new OmniInteractionError(
            interaction?.error?.message || `Omni interaction ${status}`,
        )
    }
    if (status !== "completed") return null

    // Omni reports the clip as output_video; older shapes put it in outputs[].
    const outputs = interaction?.outputs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let videoOut: any = interaction?.output_video ?? interaction?.outputVideo ?? null
    if (!videoOut && Array.isArray(outputs)) {
        videoOut = outputs.find((o: { type?: string }) => o?.type === "video") ?? null
    }

    if (!videoOut) {
        throw new OmniInteractionError(
            "Omni completed but returned no video. If you uploaded a video to edit, note " +
                "that video-to-video edits are region-restricted (unavailable in the EEA, UK, " +
                "Switzerland, and some US states).",
        )
    }

    // A completed interaction usually carries the bytes inline, even when it was
    // created with uri delivery.
    const inline = videoOut.data ?? videoOut.videoBytes
    if (inline) {
        return {
            videoBase64:
                typeof inline === "string" ? inline : Buffer.from(inline).toString("base64"),
            mimeType: videoOut.mime_type || videoOut.mimeType || "video/mp4",
            interactionId: interaction.id,
        }
    }

    const uri: string | undefined = videoOut.uri
    if (!uri) {
        throw new OmniInteractionError("No video uri or data in the Omni response")
    }

    const sep = uri.includes("?") ? "&" : "?"
    const dlRes = await fetch(`${uri}${sep}alt=media`, {
        headers: { "x-goog-api-key": apiKey },
    })
    if (!dlRes.ok) {
        throw new OmniInteractionError(
            `Failed to download the Omni video: ${dlRes.status} ${await dlRes.text()}`,
        )
    }

    return {
        videoBase64: Buffer.from(await dlRes.arrayBuffer()).toString("base64"),
        mimeType: dlRes.headers.get("content-type") || "video/mp4",
        interactionId: interaction.id,
    }
}
