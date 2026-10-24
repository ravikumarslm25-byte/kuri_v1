import { motion } from 'motion/react'
import { Home } from 'lucide-react'
import { boxStyle, layout, plates } from '../config/plates'
import type { Strings } from '../config/strings'
import { Plate } from '../components/Plate'
import { OrnateButton } from '../components/OrnateButton'
import { Sparkles, Title } from '../components/Decor'

function fortuneSize(text: string) {
  const n = text.length
  return n < 120 ? 34 : n < 170 ? 31 : n < 230 ? 28 : 25
}

export function ResultScreen({
  t,
  facePhoto,
  palm,
  fortune,
  sessionId,
  canPrint,
  onPrint,
  onHome,
}: {
  t: Strings
  facePhoto: string | null
  palm: string | null
  fortune: string
  sessionId: string
  canPrint: boolean
  onPrint: () => void
  onHome: () => void
}) {
  const L = layout.result
  return (
    <div className="screen">
      <Plate plate={plates.result} />
      <div className="vignette-bottom" />

      <button className="home-btn" style={boxStyle(L.home)} onClick={onHome}>
        <Home size={30} /> {t.home}
      </button>

      <div style={{ ...boxStyle(L.title), textAlign: 'center' }}>
        <Title size={76}>{t.resultTitle}</Title>
      </div>

      <motion.div className="result-frame" style={boxStyle(L.photo)} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
        {facePhoto ? <img src={facePhoto} alt="" /> : <div className="frame-empty" />}
        <div className="frame-label">{t.yourPhoto}</div>
      </motion.div>
      <motion.div className="result-frame palm" style={boxStyle(L.palm)} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}>
        {palm ? <img src={palm} alt="" /> : <div className="frame-empty" />}
        <div className="frame-label">{t.yourPalm}</div>
      </motion.div>

      <motion.div className="scroll" style={boxStyle(L.scroll)} initial={{ opacity: 0, scaleY: 0.2 }} animate={{ opacity: 1, scaleY: 1 }} transition={{ delay: 0.3, duration: 0.9, ease: 'easeOut' }}>
        <span className="scroll-orn tl" />
        <span className="scroll-orn tr" />
        <span className="scroll-orn bl" />
        <span className="scroll-orn br" />
        <motion.p className="scroll-text" style={{ fontSize: fortuneSize(fortune) }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 1.2 }}>
          {fortune}
        </motion.p>
      </motion.div>

      <Sparkles count={18} area={{ top: 1300, height: 400 }} />

      {canPrint && (
        <motion.div style={boxStyle(L.button)} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }}>
          <OrnateButton variant="gold" pulse onClick={onPrint} style={{ width: '100%', height: '100%', fontSize: 52 }}>
            {t.print}
          </OrnateButton>
        </motion.div>
      )}

      <div className="reading-id">
        {t.readingNo} #{sessionId}
      </div>
    </div>
  )
}
