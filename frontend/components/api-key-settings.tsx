"use client"

import { useEffect, useState } from "react"
import { KeyRound, X, ExternalLink, Eye, EyeOff, Check, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    getApiKey,
    setApiKey,
    GET_KEY_URL,
} from "@/lib/api-key"

/** Reactive read of the stored key — updates on save/remove in this or other tabs. */
function useStoredKey(): string {
    const [key, setKey] = useState("")
    useEffect(() => {
        const sync = () => setKey(getApiKey())
        sync()
        window.addEventListener("gemini-key-changed", sync)
        window.addEventListener("storage", sync)
        return () => {
            window.removeEventListener("gemini-key-changed", sync)
            window.removeEventListener("storage", sync)
        }
    }, [])
    return key
}

function maskKey(key: string): string {
    if (key.length <= 8) return "••••"
    return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}

export function ApiKeySettings() {
    const storedKey = useStoredKey()
    const hasKey = storedKey.length > 0

    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState("")
    const [reveal, setReveal] = useState(false)
    const [justSaved, setJustSaved] = useState(false)

    // Seed the input with the current key each time the modal opens.
    useEffect(() => {
        if (open) {
            setDraft(getApiKey())
            setReveal(false)
            setJustSaved(false)
        }
    }, [open])

    const handleSave = () => {
        setApiKey(draft)
        setJustSaved(true)
        setTimeout(() => setOpen(false), 600)
    }

    const handleRemove = () => {
        setApiKey("")
        setDraft("")
    }

    return (
        <>
            {/* Floating launcher — visible on every page */}
            <button
                onClick={() => setOpen(true)}
                className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full glass-card border border-zinc-200/50 dark:border-zinc-700/50 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 shadow-lg hover:scale-105 transition-transform"
                title="Gemini API key settings"
            >
                <span className="relative flex h-2.5 w-2.5">
                    {!hasKey && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    )}
                    <span
                        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                            hasKey ? "bg-emerald-500" : "bg-red-500"
                        }`}
                    />
                </span>
                <KeyRound className="h-4 w-4" />
                <span className="hidden sm:inline">{hasKey ? "API Key" : "Add API Key"}</span>
            </button>

            {!open ? null : (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Gemini API key settings"
                >
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                    />

                    {/* Panel */}
                    <div className="relative w-full max-w-md rounded-2xl glass-card border border-zinc-200/50 dark:border-zinc-700/50 p-6 shadow-2xl">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <KeyRound className="h-5 w-5 text-indigo-500" />
                                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                                    Your Gemini API key
                                </h2>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="rounded-full p-1 text-zinc-500 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors"
                                aria-label="Close"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                            This app runs on <strong>your own</strong> Gemini key — usage is billed to
                            your Google account, not the host&apos;s. The key is stored only in this
                            browser and sent directly with each request.
                        </p>

                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            API key
                        </label>
                        <div className="relative mt-1.5 mb-2">
                            <Input
                                type={reveal ? "text" : "password"}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                placeholder="AIza…"
                                autoComplete="off"
                                spellCheck={false}
                                className="pr-10 font-mono text-sm"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && draft.trim()) handleSave()
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setReveal((r) => !r)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                                aria-label={reveal ? "Hide key" : "Show key"}
                            >
                                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>

                        <a
                            href={GET_KEY_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline mb-5"
                        >
                            Get a free key at Google AI Studio
                            <ExternalLink className="h-3 w-3" />
                        </a>

                        <div className="flex items-center gap-2">
                            <Button
                                onClick={handleSave}
                                disabled={!draft.trim() || justSaved}
                                className="flex-1"
                            >
                                {justSaved ? (
                                    <>
                                        <Check className="mr-2 h-4 w-4" /> Saved
                                    </>
                                ) : (
                                    "Save key"
                                )}
                            </Button>
                            {getApiKey() && (
                                <Button variant="outline" onClick={handleRemove} title="Remove stored key">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>

                        {getApiKey() && !justSaved && (
                            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                                Current key: <span className="font-mono">{maskKey(getApiKey())}</span>
                            </p>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
