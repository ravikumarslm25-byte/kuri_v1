import { APP_VERSION, type KioskSettings, type Language } from '../config/settings'
import type { CardLayout } from './print/cardLayout'

export interface RemoteConfig {
  machine: { machineId: string; name: string; status: string; location: string }
  event: null | {
    id: string
    name: string
    client: string
    venue: string
    language: 'en' | 'ta' | 'en+ta'
    deliveryOptions: { print: boolean; whatsapp: boolean; email: boolean }
    branding: { cardFooter: string; logoUrl: string }
  }
  template: null | { code: string; name: string; theme: string; cardImageUrl: string; cardLayout?: CardLayout | null }
  serverTime: string
}

export interface FortuneResult {
  fortune: string
  source: 'ai' | 'fallback'
  language: Language
}

export interface SessionUpload {
  sessionId: string
  consent: boolean
  startedAt: string
  completedAt?: string
  language: Language
  facePhoto?: string
  palmPhoto?: string
  palmEnhanced?: string
  cardImage?: string
  fortune?: string
  fortuneSource?: 'ai' | 'fallback'
  delivery?: { printed: boolean; whatsapp?: string; email?: string }
  outcome: 'completed' | 'abandoned'
  abandonedAt?: string
}

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(s: Pick<KioskSettings, 'apiUrl' | 'token'>, path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 10_000)
  try {
    const res = await fetch(s.apiUrl.replace(/\/$/, '') + path, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(s.token ? { Authorization: `Bearer ${s.token}` } : {}),
        ...(init.headers || {}),
      },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, body.error || res.statusText)
    return body as T
  } finally {
    clearTimeout(t)
  }
}

export const api = {
  register: (s: KioskSettings, provisionKey: string) =>
    call<{ token: string; config: RemoteConfig }>(s, '/api/kiosk/register', {
      method: 'POST',
      body: JSON.stringify({ machineId: s.machineId, provisionKey, appVersion: APP_VERSION }),
    }),
  config: (s: KioskSettings) => call<RemoteConfig>(s, '/api/kiosk/config'),
  heartbeat: (s: KioskSettings, state: string, hardware: Record<string, string>, pendingUploads: number) =>
    call<RemoteConfig>(s, '/api/kiosk/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ state, appVersion: APP_VERSION, hardware, pendingUploads }),
    }),
  fortune: (s: KioskSettings, palmImage: string, language: Language) =>
    call<FortuneResult>(s, '/api/kiosk/fortune', {
      method: 'POST',
      body: JSON.stringify({ palmImage, language }),
      timeoutMs: 14_000,
    }),
  uploadSession: (s: KioskSettings, body: SessionUpload) =>
    call<{ ok: true }>(s, '/api/kiosk/sessions', { method: 'POST', body: JSON.stringify(body), timeoutMs: 30_000 }),
}

export { ApiError }
