import type { CardLayout } from './cardLayout'
/** Thin client for the Kuri admin API (see server/API.md). */
// Dev: the API on :5010. Production: served by the same server, so same origin ('' = relative /api/...).
export const API_BASE = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5010' : '')).replace(/\/$/, '')
const TOKEN_KEY = 'kuri.admin.token'

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}
export function setToken(t: string) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode: token lives for this tab only */
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Fired when the server says the session is no longer valid. */
export const AUTH_EXPIRED = 'kuri:auth-expired'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_BASE + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && path !== '/admin/auth/login') window.dispatchEvent(new Event(AUTH_EXPIRED))
    throw new ApiError(res.status, data.error || res.statusText)
  }
  return data as T
}

export const api = {
  get: <T,>(p: string) => request<T>('GET', p),
  post: <T,>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  put: <T,>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
  patch: <T,>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
  del: <T,>(p: string) => request<T>('DELETE', p),
}

/** Server-relative URLs (signed images, template artwork) -> absolute. */
export const fileUrl = (u?: string | null) => (u ? (u.startsWith('http') ? u : API_BASE + u) : '')

/** Download a CSV export (needs the auth header, so it can't be a plain link). */
export async function downloadCsv(path: string, filename: string) {
  const res = await fetch(API_BASE + '/api' + path, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new ApiError(res.status, 'Export failed')
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all')
  return p.length ? '?' + new URLSearchParams(p.map(([k, v]) => [k, String(v)])).toString() : ''
}

export async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = rej
    r.readAsDataURL(f)
  })
}

// ---------------------------------------------------------------- types
export type Permission = 'dashboard' | 'events' | 'bookings' | 'machines' | 'templates' | 'sessions' | 'team' | 'reports'
export type Role = 'super_admin' | 'event_manager' | 'operations_manager' | 'support'

export interface AdminUser {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  permissions: Permission[]
  status: 'active' | 'disabled'
  lastActiveAt?: string
  createdAt?: string
}

export interface Ref {
  id: string
  name: string
}

export interface Machine {
  id: string
  machineId: string
  name: string
  location: string
  status: 'available' | 'active' | 'maintenance' | 'retired'
  online: boolean
  registered: boolean
  appVersion: string
  lastHeartbeatAt: string | null
  lastState: string
  pendingUploads: number
  hardware?: { faceCamera: string; palmCamera: string; printer: string }
  readingsToday: number
  readingsTotal: number
  currentEvent: Ref | null
  /** What the kiosk prints right now: from its booking, its event, or the machine's default template. */
  currentTemplate: { code: string; name: string; source: 'booking' | 'event' | 'machine default'; customCard: boolean; hasArtwork: boolean } | null
  /** Template id used when no booking/event gives the kiosk one. */
  defaultTemplate: string | null
}

export interface Template {
  id: string
  code: string
  name: string
  status: 'active' | 'draft' | 'archived'
  theme: 'general' | 'love' | 'career' | 'wealth' | 'health'
  promptHint: string
  fallbackFortunes: string[]
  usageCount: number
  cardImageUrl: string
  /** Where the photos + fortune go on the artwork; null = standard Kuri card on top of the artwork. */
  cardLayout: CardLayout | null
}

export type Phase = 'upcoming' | 'live' | 'completed' | 'cancelled'
export interface EventItem {
  id: string
  name: string
  client: string
  venue: string
  startDate: string
  endDate: string
  phase: Phase
  language: 'en' | 'ta' | 'en+ta'
  deliveryOptions: { print: boolean; whatsapp: boolean; email: boolean }
  branding: { cardFooter: string; logoUrl: string }
  expectedAttendees: number
  contact: { name: string; phone: string }
  template: { id: string; code: string; name: string } | null
  machineCount: number
  scans: number
}

export interface Booking {
  id: string
  bookingId: string
  event: { id: string; name: string; client: string; venue: string } | null
  machine: { id: string; machineId: string; name: string } | null
  template: { id: string; code: string; name: string } | null
  startDate: string
  endDate: string
  shift: 'full' | 'morning' | 'evening'
  status: 'pending' | 'confirmed' | 'cancelled'
  amount: number
  notes: string
}

export interface Reading {
  sessionId: string
  createdAt: string
  durationSec: number | null
  event: Ref | null
  machine: { id: string; machineId: string } | null
  template: { code: string; name: string } | null
  language: string
  consent: boolean
  outcome: 'completed' | 'abandoned'
  abandonedAt: string
  fortuneSource: 'ai' | 'fallback'
  delivery: { printed: boolean; whatsapp: string; email: string }
  thumb: string | null
  photosErased: boolean
  fortune?: string
  images?: { face: string | null; palm: string | null; palmEnhanced: string | null; card: string | null }
}

export interface Lookups {
  events: { id: string; name: string; startDate: string; endDate: string }[]
  machines: { id: string; machineId: string; name: string }[]
  templates: { id: string; code: string; name: string }[]
}
