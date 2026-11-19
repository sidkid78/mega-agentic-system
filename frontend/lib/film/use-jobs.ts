"use client"

import { useCallback, useState } from "react"

/**
 * Tracks long-running jobs (image draws, breakdowns, renders) by key. Lives at
 * page level so spinners and errors survive switching tabs while a job runs.
 */
export interface Jobs {
    /** Status text per running job ("" when running with no message). */
    busy: Record<string, string>
    errors: Record<string, string>
    isBusy: (key: string) => boolean
    run: (key: string, fn: (setStatus: (msg: string) => void) => Promise<void>) => Promise<boolean>
    clearError: (key: string) => void
}

export function useJobs(): Jobs {
    const [busy, setBusy] = useState<Record<string, string>>({})
    const [errors, setErrors] = useState<Record<string, string>>({})

    const run = useCallback(
        async (key: string, fn: (setStatus: (msg: string) => void) => Promise<void>) => {
            setBusy((b) => ({ ...b, [key]: "" }))
            setErrors((e) => {
                const { [key]: _drop, ...rest } = e
                void _drop
                return rest
            })
            try {
                await fn((msg) => setBusy((b) => (key in b ? { ...b, [key]: msg } : b)))
                return true
            } catch (err) {
                setErrors((e) => ({ ...e, [key]: err instanceof Error ? err.message : String(err) }))
                return false
            } finally {
                setBusy((b) => {
                    const { [key]: _drop, ...rest } = b
                    void _drop
                    return rest
                })
            }
        },
        [],
    )

    const isBusy = useCallback((key: string) => key in busy, [busy])
    const clearError = useCallback(
        (key: string) =>
            setErrors((e) => {
                const { [key]: _drop, ...rest } = e
                void _drop
                return rest
            }),
        [],
    )

    return { busy, errors, isBusy, run, clearError }
}
