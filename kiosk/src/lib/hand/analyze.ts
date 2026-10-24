/**
 * Pure geometry on MediaPipe hand landmarks: is this a usable palm for a reading?
 * No DOM / MediaPipe imports so it can be unit-tested.
 *
 * Landmark ids: 0 wrist · thumb 1–4 · index 5–8 · middle 9–12 · ring 13–16 · pinky 17–20
 * (for each finger: MCP, PIP, DIP, TIP).
 */
export interface Pt {
  x: number
  y: number
}

export type PalmStatus =
  | 'none' // no hand
  | 'multiple' // more than one hand
  | 'back' // back of the hand is facing the camera
  | 'closed' // fingers curled
  | 'too-far'
  | 'too-close' // hand too big or partly outside the frame
  | 'off-center'
  | 'ok'

export interface HandInput {
  /** Landmarks normalised to the FULL video frame (0..1). */
  landmarks: Pt[]
  /** MediaPipe handedness label ('Left' | 'Right') and score. */
  handedness?: { label: string; score: number }
}

export interface Frame {
  width: number
  height: number
}

export interface PalmAnalysis {
  status: PalmStatus
  /** Landmarks in the centred SQUARE crop (0..1), which is what we capture. */
  crop: Pt[]
  center: Pt
  span: number
  fingersOpen: number
  palmFacing: boolean | null
}

export const PALM = {
  minSpan: 0.42, // hand must fill at least this much of the square
  maxSpan: 0.97,
  edge: 0.015, // landmarks closer than this to the crop edge = partly outside
  centerTol: 0.17,
  fingerExtend: 1.12, // tip must be this much farther from wrist than the PIP joint
  minOpenFingers: 3, // of index/middle/ring/pinky
  handednessTrust: 0.8, // only judge palm vs back when MediaPipe is this sure of L/R
}

const FINGERS = [
  [6, 8],
  [10, 12],
  [14, 16],
  [18, 20],
] // [PIP, TIP]

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Full-frame normalised coords -> centred square crop coords. */
export function toSquareCrop(lm: Pt[], f: Frame): Pt[] {
  const s = Math.min(f.width, f.height)
  const ox = (f.width - s) / 2
  const oy = (f.height - s) / 2
  return lm.map((p) => ({ x: (p.x * f.width - ox) / s, y: (p.y * f.height - oy) / s }))
}

export function palmCenter(c: Pt[]): Pt {
  const ids = [0, 5, 9, 13, 17]
  return { x: ids.reduce((a, i) => a + c[i].x, 0) / 5, y: ids.reduce((a, i) => a + c[i].y, 0) / 5 }
}

/**
 * Palm vs back of hand from the winding of wrist→index-MCP→pinky-MCP.
 * In a NON-mirrored camera image a right palm gives a negative cross product (y down),
 * a left palm a positive one; showing the back of the hand flips the sign.
 * Verified on tasks-vision 1.1.0: on a raw (non-mirrored) frame the handedness label
 * names the guest's actual hand (despite the docs' selfie-mirroring note).
 * Returns null when MediaPipe is not sure which hand it is.
 */
export function isPalmFacing(c: Pt[], handedness: HandInput['handedness'], mirrored = false): boolean | null {
  if (!handedness || handedness.score < PALM.handednessTrust) return null
  const w = c[0]
  const v1 = { x: c[5].x - w.x, y: c[5].y - w.y }
  const v2 = { x: c[17].x - w.x, y: c[17].y - w.y }
  let cross = v1.x * v2.y - v1.y * v2.x
  if (mirrored) cross = -cross
  const right = mirrored ? handedness.label === 'Left' : handedness.label === 'Right'
  return right ? cross < 0 : cross > 0
}

export function analyzePalm(hands: HandInput[], frame: Frame, opts: { checkPalmFacing?: boolean; mirrored?: boolean } = {}): PalmAnalysis {
  const empty: PalmAnalysis = { status: 'none', crop: [], center: { x: 0.5, y: 0.5 }, span: 0, fingersOpen: 0, palmFacing: null }
  if (!hands.length) return empty
  if (hands.length > 1) return { ...empty, status: 'multiple' }

  const h = hands[0]
  const crop = toSquareCrop(h.landmarks, frame)
  const center = palmCenter(crop)
  const xs = crop.map((p) => p.x)
  const ys = crop.map((p) => p.y)
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const outside = crop.some((p) => p.x < PALM.edge || p.y < PALM.edge || p.x > 1 - PALM.edge || p.y > 1 - PALM.edge)
  const fingersOpen = FINGERS.filter(([pip, tip]) => dist(crop[0], crop[tip]) > dist(crop[0], crop[pip]) * PALM.fingerExtend).length
  const palmFacing = isPalmFacing(crop, h.handedness, opts.mirrored)

  const base = { crop, center, span, fingersOpen, palmFacing }
  if (opts.checkPalmFacing !== false && palmFacing === false) return { ...base, status: 'back' }
  if (fingersOpen < PALM.minOpenFingers) return { ...base, status: 'closed' }
  if (span < PALM.minSpan) return { ...base, status: 'too-far' }
  if (span > PALM.maxSpan || outside) return { ...base, status: 'too-close' }
  if (Math.abs(center.x - 0.5) > PALM.centerTol || Math.abs(center.y - 0.5) > PALM.centerTol) return { ...base, status: 'off-center' }
  return { ...base, status: 'ok' }
}

/** Mean frame-to-frame movement of the palm centre over a window (crop units). */
export function jitter(history: Pt[]): number {
  if (history.length < 2) return Infinity
  let sum = 0
  for (let i = 1; i < history.length; i++) sum += dist(history[i], history[i - 1])
  return sum / (history.length - 1)
}
