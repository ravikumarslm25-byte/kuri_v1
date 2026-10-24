/**
 * Offline outbox (Stage F). Every reading is saved on the kiosk FIRST (IndexedDB), then uploaded.
 * If the kiosk is not registered yet, the hall Wi-Fi is down or the server is unreachable, readings
 * wait here and are sent later, oldest first, with backoff. Nothing is lost on a power cut either:
 * IndexedDB survives restarts.
 */
import { api, ApiError, type SessionUpload } from './api'
import type { KioskSettings } from '../config/settings'

const DB = 'kuri-kiosk'
const STORE = 'outbox'
const MAX_ITEMS = 2000 // ~3 MB each with photos -> a few GB worst case; Chrome allows far more on a PC

interface Item {
  sessionId: string
  payload: SessionUpload
  queuedAt: number
  attempts: number
  nextAttemptAt: number
  lastError?: string
}

export interface OutboxStatus {
  pending: number
  syncing: boolean
  lastSyncAt: number | null
  lastError: string
}

let status: OutboxStatus = { pending: 0, syncing: false, lastSyncAt: null, lastError: '' }
const listeners = new Set<(s: OutboxStatus) => void>()
const emit = (patch: Partial<OutboxStatus>) => {
  status = { ...status, ...patch }
  listeners.forEach((l) => l(status))
}
export const getOutboxStatus = () => status
export function onOutboxChange(fn: (s: OutboxStatus) => void) {
  listeners.add(fn)
  fn(status)
  return () => void listeners.delete(fn)
}

// ---------------------------------------------------------------- tiny IndexedDB wrapper
let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'sessionId' })
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
  }
  return dbp
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const t = d.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        t.oncomplete = () => res(req.result)
        t.onerror = () => rej(t.error)
        t.onabort = () => rej(t.error)
      }),
  )
}
const all = () => tx<Item[]>('readonly', (s) => s.getAll())
const put = (i: Item) => tx('readwrite', (s) => s.put(i))
const del = (id: string) => tx('readwrite', (s) => s.delete(id))
const count = () => tx<number>('readonly', (s) => s.count())

async function refreshCount() {
  try {
    emit({ pending: await count() })
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- public API
/** Save a reading to the outbox. Re-queuing the same sessionId replaces it (e.g. printed later). */
export async function enqueue(payload: SessionUpload) {
  try {
    const items = await all()
    if (items.length >= MAX_ITEMS) {
      // Disk safety valve: drop the oldest reading's photos rather than the reading itself.
      const oldest = items.sort((a, b) => a.queuedAt - b.queuedAt)[0]
      const p = oldest.payload
      await put({ ...oldest, payload: { ...p, facePhoto: undefined, palmPhoto: undefined, palmEnhanced: undefined, cardImage: undefined } })
    }
    await put({ sessionId: payload.sessionId, payload, queuedAt: Date.now(), attempts: 0, nextAttemptAt: 0 })
  } catch (e) {
    console.error('[outbox] could not save reading', e)
  }
  await refreshCount()
}

let flushing: Promise<void> | null = null

/** Upload everything that is due. Safe to call often; concurrent calls share one run. */
export function flush(settings: KioskSettings, { force = false } = {}): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    if (!settings.token) {
      await refreshCount()
      emit({ lastError: 'Kiosk not registered' })
      return
    }
    emit({ syncing: true })
    try {
      const items = (await all()).sort((a, b) => a.queuedAt - b.queuedAt)
      for (const it of items) {
        if (!force && it.nextAttemptAt > Date.now()) continue
        try {
          await api.uploadSession(settings, it.payload)
          await del(it.sessionId)
          emit({ lastSyncAt: Date.now(), lastError: '' })
        } catch (e) {
          const err = e instanceof ApiError ? e : null
          const msg = e instanceof Error ? e.message : String(e)
          if (err?.status === 401 || err?.status === 403) {
            // Token revoked / machine retired: stop; staff must register again.
            emit({ lastError: `Server refused this kiosk (${err.status}). Register it again in Setup.` })
            break
          }
          if (err && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
            // Bad data will never succeed: keep a record in the console and drop it.
            console.error('[outbox] dropping reading the server rejected', it.sessionId, msg)
            await del(it.sessionId)
            continue
          }
          // Network / server error: back off (30 s, 1 m, 2 m ... max 30 m) and stop this round.
          const attempts = it.attempts + 1
          await put({ ...it, attempts, lastError: msg, nextAttemptAt: Date.now() + Math.min(30_000 * 2 ** (attempts - 1), 30 * 60_000) })
          emit({ lastError: msg })
          break
        }
      }
    } finally {
      await refreshCount()
      emit({ syncing: false })
    }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

void refreshCount()
