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
    OMNI_VIDEO_TASKS,
    type OmniVideoTask,
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
    /**
     * Character/object reference clips, addressed in the prompt as
     * `<VIDEO_REF_N>`. Sent after any source video, in order.
     */
    referenceVideos?: OmniMedia[]
    /** A prior interaction to continue, for turn-by-turn refinement. */
    previousInteractionId?: string
    /**
     * Optional explicit mode hint. Omitted, Omni infers the mode from the
     * prompt and inputs, which is what Google recommends.
     */
    task?: OmniVideoTask
}

/** Narrows an untrusted body value to a task the API actually accepts. */
export function parseOmniTask(value: unknown): OmniVideoTask | undefined {
    return OMNI_VIDEO_TASKS.includes(value as OmniVideoTask)
        ? (value as OmniVideoTask)
        : undefined
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
 * interpolating, then references), then any source video, then reference
 * videos, then the text prompt.
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

    // Uploaded in parallel, pushed in order so <VIDEO_REF_N> lines up.
    const refs = await Promise.all(
        (req.referenceVideos ?? []).map((v) => uploadVideoAndWait(v, ai)),
    )
    for (const { uri, mimeType } of refs) {
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
        ...(req.task
            ? { generation_config: { video_config: { task: req.task } } }
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
        // Failures arrive as `errors: [{code, message}]`; older shapes used `error`.
        const err = interaction?.errors?.[0] ?? interaction?.error
        const detail = [err?.code, err?.message].filter(Boolean).join(": ")
        throw new OmniInteractionError(detail || `Omni interaction ${status}`)
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

    // One line per completed generation, so a malformed payload is diagnosable
    // from the server log without reproducing it.
    console.log("Omni interaction completed:", {
        id: interaction.id,
        videoFields: Object.keys(videoOut),
        uri: videoOut.uri ?? null,
    })

    // A completed interaction sometimes carries the bytes inline even when it
    // was created with uri delivery.
    const inline = videoOut.data ?? videoOut.videoBytes
    if (inline) {
        const videoBase64 =
            typeof inline === "string" ? inline : Buffer.from(inline).toString("base64")
        assertLooksLikeVideo(Buffer.from(videoBase64, "base64"), "inline data")
        return {
            videoBase64,
            mimeType: videoOut.mime_type || videoOut.mimeType || "video/mp4",
            interactionId: interaction.id,
        }
    }

    const uri: string | undefined = videoOut.uri
    if (!uri) {
        throw new OmniInteractionError("No video uri or data in the Omni response")
    }

    // URI delivery hands back a file that may not be finalized the instant the
    // interaction reports completed. Rather than trust the Files API state
    // enum, just attempt the download and judge the bytes: a real video ends
    // the poll, a not-yet-ready response returns null so the client's existing
    // loop tries again, and only a hard HTTP failure throws.
    //
    // The uri already carries its own query string (`:download?alt=media`), so
    // it is fetched verbatim.
    const dlRes = await fetch(uri, { headers: { "x-goog-api-key": apiKey } })

    if (!dlRes.ok) {
        const body = await dlRes.text()
        // These mean "ask again shortly"; everything else is a real failure
        // worth surfacing rather than hiding behind a spinner.
        if (RETRYABLE_DOWNLOAD_STATUSES.has(dlRes.status) || dlRes.status >= 500) {
            console.warn(
                `Omni video not downloadable yet (HTTP ${dlRes.status}), will retry:`,
                body.slice(0, 200),
            )
            return null
        }
        throw new OmniInteractionError(
            `Failed to download the Omni video: ${dlRes.status} ${body.slice(0, 500)}`,
        )
    }

    const bytes = Buffer.from(await dlRes.arrayBuffer())
    const contentType = dlRes.headers.get("content-type") || ""

    if (!looksLikeVideo(bytes)) {
        // A 200 that isn't video means the file is still being finalized.
        console.warn(
            `Omni video not ready yet: ${bytes.length} bytes, content-type ` +
                `${contentType || "none"}: ${bytes.toString("utf8").slice(0, 200)}`,
        )
        return null
    }

    return {
        videoBase64: bytes.toString("base64"),
        mimeType: contentType.startsWith("video/") ? contentType : "video/mp4",
        interactionId: interaction.id,
    }
}

/** Download failures that just mean the generated file isn't finalized yet. */
const RETRYABLE_DOWNLOAD_STATUSES = new Set([404, 409, 425, 429])

/**
 * Whether a payload is plausibly a video file.
 *
 * MP4/MOV carry an "ftyp" box in the first few bytes; WebM starts with the
 * EBML magic number. Anything else — an empty body, a JSON error, an HTML
 * page — would otherwise be base64'd straight into a `<video src="data:...">`
 * and render as a player that silently plays nothing.
 */
function looksLikeVideo(bytes: Buffer): boolean {
    if (bytes.length < 1024) return false
    if (bytes.subarray(0, 64).includes("ftyp")) return true
    return bytes.subarray(0, 4).toString("hex") === "1a45dfa3"
}

/** The same check for the inline path, where there is nothing to retry. */
function assertLooksLikeVideo(bytes: Buffer, source: string): void {
    if (!looksLikeVideo(bytes)) {
        throw new OmniInteractionError(
            `Omni returned ${bytes.length} bytes from ${source} that are not a ` +
                `recognizable video: ${bytes.toString("utf8").slice(0, 200)}`,
        )
    }
}
