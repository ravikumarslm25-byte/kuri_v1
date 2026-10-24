import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { plates } from '../config/plates'
import type { Strings } from '../config/strings'
import { Plate } from '../components/Plate'
import { Sparkles, Title } from '../components/Decor'

const RETURN_SEC = 18

/**
 * Shows the exact card image being printed sliding out of a "slot", then returns to Idle.
 * `cardImage` is null for the ~0.5 s while the card is being rendered.
 */
export function PrintingScreen({ t, cardImage, onDone }: { t: Strings; cardImage: string | null; onDone: () => void }) {
  const [left, setLeft] = useState(RETURN_SEC)
  useEffect(() => {
    const iv = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(iv)
  }, [])
  useEffect(() => {
    if (left <= 0) onDone()
  }, [left, onDone])

  return (
    <div className="screen" onPointerUp={() => left < RETURN_SEC - 6 && onDone()}>
      <Plate plate={plates.idle} dim={0.7} blur={8} />
      <Sparkles count={36} />

      <div className="screen-head" style={{ top: 170 }}>
        <Title size={84}>{t.printingTitle}</Title>
        <p className="hint">{t.collect}</p>
      </div>

      <div className="printer-slot" />
      <div className="card-slide">
        {cardImage ? (
          <motion.img
            src={cardImage}
            alt=""
            className="card-preview"
            initial={{ y: -900 }}
            animate={{ y: 0 }}
            transition={{ duration: 6, ease: [0.3, 0.1, 0.3, 1] }}
          />
        ) : (
          <div className="card-pending" />
        )}
      </div>

      <div className="returning">{t.returning(Math.max(0, left))}</div>
    </div>
  )
}
