/**
 * BYOK (bring-your-own-key) storage.
 *
 * Each user pastes their own Gemini API key; we keep it in the browser's
 * localStorage and send it as the `X-Gemini-Key` header on every request that
 * reaches Gemini (the FastAPI backend and the Next.js /api/* routes). The server
 * holds no key of its own.
 */

const STORAGE_KEY = "gemini_api_key";

/** Header name carrying the user's key. Must match the backend dependency. */
export const GEMINI_KEY_HEADER = "X-Gemini-Key";

/** Where users get a free key. */
export const GET_KEY_URL = "https://aistudio.google.com/apikey";

export function getApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setApiKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = key.trim();
    if (trimmed) window.localStorage.setItem(STORAGE_KEY, trimmed);
    else window.localStorage.removeItem(STORAGE_KEY);
    // Let same-tab listeners (the settings UI) react immediately; the native
    // "storage" event only fires in *other* tabs.
    window.dispatchEvent(new Event("gemini-key-changed"));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 0;
}

/** Header object to spread into fetch(); empty when no key is set. */
export function apiKeyHeader(): Record<string, string> {
  const key = getApiKey();
  return key ? { [GEMINI_KEY_HEADER]: key } : {};
}
