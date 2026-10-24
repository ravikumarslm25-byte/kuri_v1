import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { plates } from '../config/plates'
import type { Strings } from '../config/strings'
import { Plate } from '../components/Plate'
import { OrnateButton } from '../components/OrnateButton'
import { Corners, Sparkles, Title } from '../components/Decor'
import { useCamera } from '../lib/useCamera'
import { usePalmDetector } from '../lib/hand/usePalmDetector'
import { loadHandLandmarker } from '../lib/hand/detector'
import { toSquareCrop, type Pt } from '../lib/hand/analyze'
import { processPalm, type DestinyLine } from '../lib/palm/enhance'

const SIZE = 820 // square guide frame (stage px)
const MANUAL_AFTER_MS = 12_000 // show a manual button if auto-capture hasn't happened by then

export interface PalmCapture {
  raw: string
  enhanced: string | null
  art: string | null
  lines: DestinyLine[]
}

const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]

async function enrich(raw: string, lm: Pt[] | null): Promise<PalmCapture> {
  try {
    let landmarks = lm
    if (!landmarks) {
      // Manual capture: try to find the hand in the still image.
      const hl = await loadHandLandmarker()
      const im = new Image()
      im.src = raw
      await im.decode()
      const r = hl.detectForVideo(im, performance.now())
      if (r.landmarks[0]) landmarks = toSquareCrop(r.landmarks[0], { width: im.width, height: im.height })
    }
    if (!landmarks) return { raw, enhanced: null, art: null, lines: [] }
    const p = await processPalm(raw, landmarks)
    return { raw, enhanced: p.enhanced, art: p.art, lines: p.lines }
  } catch (e) {
    console.warn('[palm] enhancement failed, using raw image', e)
    return { raw, enhanced: null, art: null, lines: [] }
  }
}

export function PalmScreen({
  t,
  cameraLabel,
  checkPalmFacing = true,
  onDone,
}: {
  t: Strings
  cameraLabel: string
  checkPalmFacing?: boolean
  onDone: (palm: PalmCapture | null) => void
}) {
  const cam = useCamera('palm', cameraLabel)
  const [phase, setPhase] = useState<'live' | 'processing'>('live')
  const [flash, setFlash] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [showManual, setShowManual] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  const finish = useCallback(
    async (lm: Pt[] | null) => {
      const raw = cam.capture({ aspect: 1, mirror: false, maxEdge: 1600, quality: 0.93 })
      if (!raw) return
      setFlash(true)
      setPhase('processing')
      setTimeout(() => setFlash(false), 450)
      const [result] = await Promise.all([enrich(raw, lm), new Promise((r) => setTimeout(r, 900))])
      doneRef.current(result)
    },
    [cam],
  )

  const det = usePalmDetector(cam.videoRef, cam.status === 'ready' && phase === 'live', (lm) => void finish(lm), { checkPalmFacing })

  // Manual fallback appears after a while, or straight away if the AI model can't load.
  useEffect(() => {
    const id = setTimeout(() => setShowManual(true), MANUAL_AFTER_MS)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    if (det.error) setShowManual(true)
  }, [det.error])

  // Manual countdown
  useEffect(() => {
    if (count === null) return
    if (count === 0) {
      setCount(null)
      void finish(null)
      return
    }
    const id = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 700)
    return () => clearTimeout(id)
  }, [count, finish])

  // Draw the "Oracle sees your hand" skeleton.
  useEffect(() => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    const lm = det.landmarks
    if (!lm.length || phase !== 'live') return
    const good = det.status === 'ok'
    const W = c.width
    ctx.lineCap = 'round'
    ctx.shadowColor = 'rgba(255,190,80,0.9)'
    ctx.shadowBlur = good ? 18 : 8
    ctx.strokeStyle = good ? 'rgba(255,215,120,0.9)' : 'rgba(255,240,210,0.55)'
    ctx.lineWidth = good ? 5 : 3
    for (const [a, b] of HAND_EDGES) {
      ctx.beginPath()
      ctx.moveTo(lm[a].x * W, lm[a].y * W)
      ctx.lineTo(lm[b].x * W, lm[b].y * W)
      ctx.stroke()
    }
    ctx.fillStyle = good ? '#fff4cf' : 'rgba(255,245,225,0.8)'
    for (const p of lm) {
      ctx.beginPath()
      ctx.arc(p.x * W, p.y * W, good ? 7 : 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [det.landmarks, det.status, phase])

  const message =
    phase === 'processing'
      ? t.palmProcessing
      : cam.status === 'error'
        ? t.cameraCloudedBody
        : !det.ready && !det.error
          ? t.palmWaking
          : det.hold > 0
            ? t.palmHold
            : t.palmStatus[det.status]

  const perim = 4 * (SIZE - 6)

  return (
    <div className="screen">
      <Plate plate={plates.oracle} dim={0.78} blur={12} />
      <Corners />
      <Sparkles count={14} />

      <div className="screen-head">
        <Title size={84}>{t.palmTitle}</Title>
        <p className="hint">{t.palmHint}</p>
      </div>

      <div className={`cam-frame square${det.status === 'ok' ? ' good' : ''}`} style={{ width: SIZE, height: SIZE, left: (1080 - SIZE) / 2, top: 400 }}>
        {cam.status === 'error' ? (
          <div className="cam-error">
            <div className="kuri-title" style={{ fontSize: 46 }}>
              {t.cameraClouded}
            </div>
            <p className="body-text">{t.cameraCloudedBody}</p>
          </div>
        ) : (
          <video ref={cam.videoRef} className="cam-video" muted playsInline autoPlay />
        )}
        {!det.landmarks.length && phase === 'live' && cam.status !== 'error' && (
          <svg className="palm-guide" viewBox="0 0 400 400" aria-hidden>
            <path
              d="M150 372 C120 330 96 292 82 250 C72 220 60 196 44 176 C34 162 46 146 62 154 C84 166 102 190 116 210 L118 104 C118 88 140 88 141 104 L146 186 L150 70 C151 54 175 54 175 70 L178 182 L184 82 C185 66 208 66 208 82 L208 188 L218 112 C220 96 242 98 240 114 L232 236 C228 300 212 340 196 372 Z"
              fill="none"
              stroke="rgba(255,226,150,0.85)"
              strokeWidth="3"
              strokeDasharray="10 8"
              transform="translate(60 6)"
            />
          </svg>
        )}
        <canvas ref={canvasRef} className="hand-overlay" width={SIZE} height={SIZE} />
        <span className="bracket tl" />
        <span className="bracket tr" />
        <span className="bracket bl" />
        <span className="bracket br" />
        {phase === 'live' && <div className="scanline" />}
        {/* steady-hold progress traced around the frame */}
        <svg className="hold-ring" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <rect x="3" y="3" width={SIZE - 6} height={SIZE - 6} rx="26" fill="none" stroke="#ffe39a" strokeWidth="8" strokeDasharray={`${det.hold * perim} ${perim}`} />
        </svg>
        <AnimatePresence>
          {count !== null && count > 0 && (
            <motion.div key={count} className="countdown" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
              {count}
            </motion.div>
          )}
        </AnimatePresence>
        {phase === 'processing' && <div className="processing-glow" />}
        {flash && <div className="flash" />}
      </div>

      <motion.p key={message} className="palm-status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {message}
      </motion.p>

      <div className="actions" style={{ top: 1460 }}>
        {cam.status === 'error' ? (
          <OrnateButton variant="gold" onClick={() => onDone(null)} style={{ width: 560, height: 120, fontSize: 44 }}>
            {t.skip}
          </OrnateButton>
        ) : (
          showManual &&
          phase === 'live' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <OrnateButton variant="glass" disabled={count !== null} onClick={() => setCount(3)} style={{ width: 560, height: 110, fontSize: 40 }}>
                {t.palmCapture}
              </OrnateButton>
            </motion.div>
          )
        )}
      </div>
    </div>
  )
}
