/**
 * IndexedDB persistence for the Film Studio project.
 *
 * Generated images and clips are megabytes of base64 — well past
 * localStorage's ~5MB — so the project lives in IndexedDB. Failures (private
 * windows, blocked storage) degrade to an in-memory session rather than
 * breaking the page.
 */
import type { FilmProject } from "@/lib/film/types"

const DB_NAME = "film-studio"
const STORE = "projects"
const CURRENT_KEY = "current"

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

export async function loadProject(): Promise<FilmProject | null> {
    try {
        const db = await openDb()
        return await new Promise((resolve, reject) => {
            const req = db.transaction(STORE, "readonly").objectStore(STORE).get(CURRENT_KEY)
            req.onsuccess = () => resolve((req.result as FilmProject | undefined) ?? null)
            req.onerror = () => reject(req.error)
        })
    } catch (err) {
        console.warn("Film Studio: could not load the saved project", err)
        return null
    }
}

export async function saveProject(project: FilmProject): Promise<boolean> {
    try {
        const db = await openDb()
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite")
            tx.objectStore(STORE).put(project, CURRENT_KEY)
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
        return true
    } catch (err) {
        console.warn("Film Studio: could not save the project", err)
        return false
    }
}
