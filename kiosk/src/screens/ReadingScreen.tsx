import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { boxStyle, layout, plates } from '../config/plates'
import type { Strings } from '../config/strings'
import { Plate } from '../components/Plate'
import { Sparkles, Title } from '../components/Decor'
import type { PalmCapture } from './PalmScreen'

export interface FortuneOutcome {
  fortune: string
  source: 'ai' | 'fallback'
}

const MIN_MS = 7000 // the ritual always takes at least this long, even if the AI is fast

/**
 * The guest's own palm floats inside the oracle's energy sphere while the fortune is fetched.
 * When the palm was detected, its own destiny lines (snapped to real creases) are drawn on it.
 */
export function ReadingScreen({ t, palm, getFortune, onDone }: { t: Strings; palm: PalmCapture | null; getFortune: () => Promise<FortuneOutcome>; onDone: (r: FortuneOutcome) => void }) {
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState(0)
  const started = useRef(Date.now())
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const R = layout.scan.ring

  useEffect(() => {
    let alive = true
    let result: FortuneOutcome | null = null
    getFortune().then((r) => {
      result = r
    })
    const iv = setInterval(() => {
      if (!alive) return
      const el = Date.now() - started.current
      // Ease toward 92% while waiting; finish only when the fortune is in and MIN_MS passed.
      const target = result && el >= MIN_MS ? 100 : Math.min(92, (el / MIN_MS) * 92)
      setProgress((p) => Math.max(p, target))
      setPhase(el < 2600 ? 0 : el < 5200 ? 1 : 2)
      if (result && el >= MIN_MS) {
        clearInterval(iv)
        const r = result
        setTimeout(() => alive && doneRef.current(r), 600)
      }
    }, 100)
    return () => {
      alive = false
      clearInterval(iv)
    }
    // getFortune is created once per session by the parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const captions = [t.keepStill, t.reading, t.almost]

  return (
    <div className="screen">
      <Plate plate={plates.scan} />
      <div className="vignette-bottom" />

      {/* Guest palm inside the sphere */}
      <div className="sphere" style={{ left: R.cx - R.r, top: R.cy - R.r, width: R.r * 2, height: R.r * 2 }}>
        {palm && <img className="sphere-palm" src={palm.enhanced || palm.raw} alt="" />}
        <div className="sphere-tint" />
        {palm && palm.lines.length > 0 ? (
          // The guest's own destiny lines, placed on their real palm creases (Stage C)
          <svg className="destiny-real" viewBox="0 0 1 1" aria-hidden>
            {palm.lines.map((l, i) => (
              <path key={l.name} pathLength={1} style={{ animationDelay: `${0.8 + i * 1.3}s` }} d={'M' + l.points.map((p) => `${p.x.toFixed(4)} ${p.y.toFixed(4)}`).join(' L')} />
            ))}
          </svg>
        ) : (
          <svg className="destiny-lines" viewBox="0 0 200 200" aria-hidden>
            <path className="dl dl1" d="M52 118 C72 96 104 88 150 92" />
            <path className="dl dl2" d="M58 104 C86 112 118 124 146 132" />
            <path className="dl dl3" d="M96 78 C78 104 76 140 92 176" />
            <path className="dl dl4" d="M112 176 C110 150 112 120 118 90" />
          </svg>
        )}
        <div className="sphere-ring r1" />
        <div className="sphere-ring r2" />
        <div className="sphere-sweep" />
      </div>
      <Sparkles count={22} area={{ left: R.cx - R.r - 60, top: R.cy - R.r - 60, width: R.r * 2 + 120, height: R.r * 2 + 120 }} />

      <div style={{ ...boxStyle(layout.scan.caption), textAlign: 'center' }}>
        <Title size={78}>{t.scanning}</Title>
        <div className="progress">
          <svg viewBox="0 0 700 56" preserveAspectRatio="none" className="progress-frame" aria-hidden>
            <path d="M10 28 L34 6 H666 L690 28 L666 50 H34 Z" fill="rgba(10,6,3,0.55)" stroke="#e8c36a" strokeWidth="2.5" />
          </svg>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <motion.p key={phase} className="caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {captions[phase]}
        </motion.p>
      </div>
    </div>
  )
}
