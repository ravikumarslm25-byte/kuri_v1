import { useEffect, useRef, useState, type RefObject } from 'react'
import { analyzePalm, jitter, type PalmStatus, type Pt } from './analyze'
import { loadHandLandmarker } from './detector'

export const HOLD_MS = 1300 // how long the palm must stay good & still before auto-capture
const FRAME_MS = 66 // ~15 detections per second is plenty and keeps the PC cool
const STILL = 0.006 // max mean palm-centre movement per frame (crop units)

export interface PalmDetectorState {
  ready: boolean
  error: string
  status: PalmStatus
  /** 0..1 progress of the steady hold. */
  hold: number
  /** Landmarks in square-crop coords for drawing the overlay. */
  landmarks: Pt[]
}

/**
 * Runs MediaPipe on the palm camera and fires `onCapture(landmarks)` once the palm has been
 * open, palm-up, centred and still for HOLD_MS.
 */
export function usePalmDetector(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onCapture: (landmarks: Pt[]) => void,
  opts: { checkPalmFacing?: boolean } = {},
): PalmDetectorState {
  const [state, setState] = useState<PalmDetectorState>({ ready: false, error: '', status: 'none', hold: 0, landmarks: [] })
  const captureRef = useRef(onCapture)
  captureRef.current = onCapture
  const checkPalmFacing = opts.checkPalmFacing !== false

  useEffect(() => {
    if (!enabled) return
    let alive = true
    let raf = 0
    let last = 0
    let holdStart = 0
    let fired = false
    const centres: Pt[] = []

    loadHandLandmarker()
      .then((hl) => {
        if (!alive) return
        setState((s) => ({ ...s, ready: true }))
        const tick = (now: number) => {
          if (!alive) return
          raf = requestAnimationFrame(tick)
          const v = videoRef.current
          if (fired || !v || v.readyState < 2 || !v.videoWidth || now - last < FRAME_MS) return
          last = now
          let res
          try {
            res = hl.detectForVideo(v, now)
          } catch {
            return // transient (e.g. camera hiccup)
          }
          const hands = res.landmarks.map((lm, i) => ({
            landmarks: lm,
            handedness: res.handedness[i]?.[0] ? { label: res.handedness[i][0].categoryName, score: res.handedness[i][0].score } : undefined,
          }))
          const a = analyzePalm(hands, { width: v.videoWidth, height: v.videoHeight }, { checkPalmFacing })
          if (a.status === 'ok') {
            centres.push(a.center)
            if (centres.length > 6) centres.shift()
          } else {
            centres.length = 0
          }
          const steady = a.status === 'ok' && centres.length >= 4 && jitter(centres) < STILL
          if (steady) {
            if (!holdStart) holdStart = now
          } else {
            holdStart = 0
          }
          const hold = holdStart ? Math.min(1, (now - holdStart) / HOLD_MS) : 0
          setState({ ready: true, error: '', status: a.status === 'ok' && !steady ? 'ok' : a.status, hold, landmarks: a.crop })
          if (hold >= 1 && !fired) {
            fired = true
            captureRef.current(a.crop)
          }
        }
        raf = requestAnimationFrame(tick)
      })
      .catch((e) => alive && setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) })))

    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [enabled, videoRef, checkPalmFacing])

  return state
}
