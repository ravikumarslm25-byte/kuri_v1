import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { plates } from '../config/plates'
import type { Strings } from '../config/strings'
import { Plate } from '../components/Plate'
import { OrnateButton } from '../components/OrnateButton'
import { Corners, Sparkles, Title } from '../components/Decor'
import { useCamera } from '../lib/useCamera'

const FRAME = { w: 720, h: 960 } // 3:4 portrait

export function FaceScreen({ t, cameraLabel, onDone }: { t: Strings; cameraLabel: string; onDone: (photo: string | null) => void }) {
  const cam = useCamera('face', cameraLabel)
  const [count, setCount] = useState<number | null>(null)
  const [flash, setFlash] = useState(false)
  const [shot, setShot] = useState<string | null>(null)

  useEffect(() => {
    if (count === null) return
    if (count === 0) {
      const img = cam.capture({ aspect: FRAME.w / FRAME.h, mirror: true, maxEdge: 1400 })
      setFlash(true)
      setTimeout(() => setFlash(false), 350)
      setShot(img)
      setCount(null)
      return
    }
    const id = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 800)
    return () => clearTimeout(id)
  }, [count, cam])

  return (
    <div className="screen">
      <Plate plate={plates.oracle} dim={0.72} blur={10} />
      <Corners />
      <Sparkles count={14} />

      <div className="screen-head">
        <Title size={84}>{t.faceTitle}</Title>
        <p className="hint">{shot ? '' : t.faceHint}</p>
      </div>

      <div className="cam-frame arch" style={{ width: FRAME.w, height: FRAME.h, left: (1080 - FRAME.w) / 2, top: 360 }}>
        {cam.status === 'error' ? (
          <div className="cam-error">
            <div className="kuri-title" style={{ fontSize: 46 }}>
              {t.cameraClouded}
            </div>
            <p className="body-text">{t.cameraCloudedBody}</p>
          </div>
        ) : (
          <video ref={cam.videoRef} className="cam-video mirror" muted playsInline autoPlay />
        )}
        {shot && <img className="cam-shot" src={shot} alt="" />}
        <AnimatePresence>
          {count !== null && count > 0 && (
            <motion.div key={count} className="countdown" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
              {count}
            </motion.div>
          )}
        </AnimatePresence>
        {flash && <div className="flash" />}
      </div>

      <div className="actions" style={{ top: 1420 }}>
        {cam.status === 'error' ? (
          <OrnateButton variant="gold" onClick={() => onDone(null)} style={{ width: 560, height: 120, fontSize: 44 }}>
            {t.skip}
          </OrnateButton>
        ) : shot ? (
          <div className="row-center" style={{ gap: 36 }}>
            <OrnateButton variant="ghost" onClick={() => setShot(null)} style={{ width: 340, height: 110, fontSize: 40 }}>
              {t.retake}
            </OrnateButton>
            <OrnateButton variant="gold" onClick={() => onDone(shot)} style={{ width: 440, height: 120, fontSize: 46 }}>
              {t.continue}
            </OrnateButton>
          </div>
        ) : (
          <OrnateButton
            variant="gold"
            pulse={count === null}
            disabled={cam.status !== 'ready' || count !== null}
            onClick={() => setCount(3)}
            style={{ width: 520, height: 124, fontSize: 50 }}
          >
            {t.capture}
          </OrnateButton>
        )}
      </div>
    </div>
  )
}
