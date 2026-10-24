import { motion } from 'motion/react'
import type { Strings } from '../config/strings'
import { OrnateButton } from './OrnateButton'

export function StillThere({ t, remaining }: { t: Strings; remaining: number }) {
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="overlay-card">
        <div className="overlay-count">{remaining}</div>
        <h2 className="kuri-title" style={{ fontSize: 60 }}>
          {t.stillThere}
        </h2>
        <p className="body-text">{t.stillThereBody(remaining)}</p>
        <OrnateButton variant="gold" style={{ width: 460, height: 110, marginTop: 24, fontSize: 46 }}>
          {t.imHere}
        </OrnateButton>
      </div>
    </motion.div>
  )
}
