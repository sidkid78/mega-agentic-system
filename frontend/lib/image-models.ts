/**
 * Nano Banana image model option surface, shared by the images page and the
 * /api/images/nano-banana route. Mirrors the constants in
 * backend/image_generation.py.
 *
 * Imagen was shut down on the Gemini API on 2026-08-17 and
 * gemini-3.1-flash-image is deprecated, so neither is offered.
 */

/** Nano Banana 2.1 — the current workhorse for generation and editing. */
export const NANO_BANANA_MODEL = "gemini-nano-banana-2.1"
/** Nano Banana Pro — slower, for complex instructions and high-fidelity text. */
export const NANO_BANANA_PRO_MODEL = "gemini-3-pro-image"
/** Nano Banana 2 Lite — fastest and cheapest. */
export const NANO_BANANA_LITE_MODEL = "gemini-3.1-flash-lite-image"

export const IMAGE_MODEL_OPTIONS = [
  { value: NANO_BANANA_MODEL, label: "Nano Banana 2.1 (Recommended)" },
  { value: NANO_BANANA_PRO_MODEL, label: "Nano Banana Pro (highest quality)" },
  { value: NANO_BANANA_LITE_MODEL, label: "Nano Banana 2 Lite (fastest)" },
] as const

export const IMAGE_SIZES = ["1K", "2K", "4K"] as const

const STANDARD_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
] as const

/** Tall and wide panoramas. Pro is not documented for these. */
const PANORAMIC_ASPECT_RATIOS = ["1:4", "4:1", "1:8", "8:1"] as const

export function imageAspectRatios(model: string): readonly string[] {
  return model === NANO_BANANA_PRO_MODEL
    ? STANDARD_ASPECT_RATIOS
    : [...STANDARD_ASPECT_RATIOS, ...PANORAMIC_ASPECT_RATIOS]
}

/** Lite is 1K only: asking it for 2K or 4K returns a bare 404. */
export function imageSizes(model: string): readonly string[] {
  return model === NANO_BANANA_LITE_MODEL ? ["1K"] : IMAGE_SIZES
}

/** Lite rejects the google_search tool ("Search as tool is not enabled"). */
export function supportsSearchGrounding(model: string): boolean {
  return model !== NANO_BANANA_LITE_MODEL
}

/**
 * Whether to offer the minimal/high `generation_config.thinking_level` choice.
 * Both levels are confirmed on 2.1 and Lite; Pro is left on its own default.
 */
export function supportsThinkingLevel(model: string): boolean {
  return model !== NANO_BANANA_PRO_MODEL
}

/** Nano Banana 2.1 can also ground on Google Image Search results. */
export function supportsImageSearch(model: string): boolean {
  return model === NANO_BANANA_MODEL
}

/** Video-to-image (a public YouTube URL as context) is not available on Pro. */
export function supportsVideoInput(model: string): boolean {
  return model !== NANO_BANANA_PRO_MODEL
}

/** Up to 14 reference images can be mixed into one request. */
export const MAX_REFERENCE_IMAGES = 14

/** Model output in the order it was written: Pro can interleave text and images. */
export interface TextBlock {
  type: "text"
  text: string
}

export interface ImageBlock {
  type: "image"
  base64: string
  mimeType: string
}

export type OutputBlock = TextBlock | ImageBlock
