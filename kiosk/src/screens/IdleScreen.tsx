import { useRef, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { boxStyle, layout, plates } from '../config/plates'
import type { Strings } from '../config/strings'
import { Plate } from '../components/Plate'
import { OrnateButton } from '../components/OrnateButton'
import { Sparkles, Title } from '../components/Decor'

export function IdleScreen({
  t,
  eventName,
  connection,
  pending,
  onBegin,
  onSecretTap,
}: {
  t: Strings
  eventName?: string
  connection: 'online' | 'offline' | 'unregistered'
  pending: number
  onBegin: () => void
  onSecretTap: () => void
}) {
  const taps = useRef<number[]>([])
  const L = layout.idle

  // 5 taps in the top-left corner within 3 s opens Setup (staff only).
  const secret = (e: PointerEvent) => {
    e.stopPropagation()
    const now = Date.now()
    taps.current = [...taps.current.filter((x) => now - x < 3000), now]
    if (taps.current.length >= 5) {
      taps.current = []
      onSecretTap()
    }
  }

  return (
    <div className="screen" onPointerUp={onBegin}>
      <Plate plate={plates.idle} />
      <div className="vignette-top" />
      <div className="vignette-bottom" />
      <Sparkles count={30} area={{ top: 1100, height: 820 }} />

      <motion.div style={{ ...boxStyle(L.title), textAlign: 'center' }} initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2 }}>
        <Title size={96}>{t.title}</Title>
        <div className="subtitle">{t.subtitle}</div>
      </motion.div>

      <motion.div style={boxStyle(L.button)} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8, duration: 0.6 }}>
        <OrnateButton pulse style={{ width: '100%', height: '100%', fontSize: 50 }}>
          {t.touchToBegin}
        </OrnateButton>
      </motion.div>

      {eventName && (
        <div className="event-ribbon">
          {t.welcomeTo} <b>{eventName}</b>
        </div>
      )}

      <div className="secret-zone" onPointerUp={secret} />
      {/* Staff-only status: tiny dot, bottom-right. Green = synced, amber = offline or readings waiting, red = not registered. */}
      <div className={`status-dot ${connection === 'unregistered' ? 'red' : connection === 'offline' || pending > 0 ? 'amber' : 'green'}`} title={`${connection}${pending ? `, ${pending} waiting` : ''}`}>
        {pending > 0 && <span>{pending}</span>}
      </div>
    </div>
  )
}
