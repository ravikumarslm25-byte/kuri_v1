/**
 * Per-machine settings, entered once on the hidden Setup screen and kept in localStorage.
 * (Tap the top-left corner of the Idle screen 5 times within 3 seconds to open Setup.)
 */
export type Language = 'en' | 'ta'

export interface KioskSettings {
  apiUrl: string
  machineId: string
  token: string
  faceCameraLabel: string // matched by device label, so USB order changes don't swap cameras
  palmCameraLabel: string
  language: Language
  idleTimeoutSec: number
  /** Reject the back of the hand. Turn off on site if it misfires with the scanner's camera. */
  checkPalmFacing: boolean
}

const KEY = 'kuri.settings.v1'

export const defaultSettings: KioskSettings = {
  // Dev: local API. Production served by the Kuri server: the same server. A kiosk running its own
  // local copy (deploy/windows) enters the server address on the Setup screen.
  apiUrl: import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5010' : location.origin),
  machineId: '',
  token: '',
  faceCameraLabel: '',
  palmCameraLabel: '',
  language: 'en',
  idleTimeoutSec: 45,
  checkPalmFacing: true,
}

export function loadSettings(): KioskSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(s: KioskSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: settings live for this run only */
  }
}

export const APP_VERSION = '0.1.0'
