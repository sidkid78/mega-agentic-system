/**
 * Gemini Omni Flash option surface, shared by the client UI and the API routes.
 *
 * Kept separate from `lib/omni-video.ts` so the videos page can import these
 * without pulling the `@google/genai` SDK (and `Buffer`) into the client bundle.
 */

/** The only video model still live on the Gemini API. */
export const OMNI_VIDEO_MODEL = "gemini-omni-1.1-flash"

/** Output resolutions. 1080p and 4k are produced by upscaling. */
export const OMNI_RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const

/** Omni emits 3–10s clips at 24 FPS. */
export const OMNI_MIN_DURATION = 3
export const OMNI_MAX_DURATION = 10

/** Selectable clip lengths, as strings for use directly in a <Select>. */
export const OMNI_DURATIONS = ["3", "4", "5", "6", "7", "8", "9", "10"] as const

/** Input video is capped at 10s for editing and extension. */
export const OMNI_MAX_INPUT_VIDEO_SECONDS = 10
