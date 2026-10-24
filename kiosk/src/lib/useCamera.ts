import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraRole = 'face' | 'palm'
export type CameraStatus = 'starting' | 'ready' | 'error'

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  let devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
  // Labels are blank until the page has camera permission once.
  if (devices.length && devices.every((d) => !d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      s.getTracks().forEach((t) => t.stop())
      devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
    } catch {
      /* permission denied: return unlabeled list */
    }
  }
  return devices
}

/**
 * Picks the camera for a role by label (set on the Setup screen). Without a label:
 * face = first camera, palm = second camera (or first if only one is connected).
 */
export function pickCamera(devices: MediaDeviceInfo[], role: CameraRole, labelHint: string) {
  if (labelHint) {
    const hit = devices.find((d) => d.label.toLowerCase().includes(labelHint.toLowerCase()))
    if (hit) return hit
  }
  if (role === 'palm') return devices[1] ?? devices[0]
  return devices[0]
}

export interface CaptureOptions {
  /** width / height of the output crop (centre crop of the live frame). */
  aspect: number
  /** Longest output edge in px. */
  maxEdge?: number
  mirror?: boolean
  quality?: number
}

export function useCamera(role: CameraRole, labelHint: string) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<CameraStatus>('starting')
  const [error, setError] = useState('')
  const [deviceLabel, setDeviceLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available')
        const devices = await listCameras()
        const dev = pickCamera(devices, role, labelHint)
        if (!dev) throw new Error('No camera connected')
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: dev.deviceId ? { exact: dev.deviceId } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 } },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        setDeviceLabel(dev.label || role)
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          await v.play().catch(() => undefined)
        }
        setStatus('ready')
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [role, labelHint])

  const capture = useCallback((o: CaptureOptions): string | null => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return null
    const vw = v.videoWidth
    const vh = v.videoHeight
    let sw = vw
    let sh = vw / o.aspect
    if (sh > vh) {
      sh = vh
      sw = vh * o.aspect
    }
    const sx = (vw - sw) / 2
    const sy = (vh - sh) / 2
    const max = o.maxEdge ?? 1600
    const scale = Math.min(1, max / Math.max(sw, sh))
    const c = document.createElement('canvas')
    c.width = Math.round(sw * scale)
    c.height = Math.round(sh * scale)
    const ctx = c.getContext('2d')
    if (!ctx) return null
    if (o.mirror) {
      ctx.translate(c.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', o.quality ?? 0.9)
  }, [])

  return { videoRef, status, error, deviceLabel, capture }
}
