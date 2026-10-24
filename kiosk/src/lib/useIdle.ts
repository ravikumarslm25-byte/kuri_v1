import { useEffect, useRef, useState } from 'react'

/**
 * Walk-away detection. After `timeoutSec` without a touch, `warning` becomes true and
 * a `graceSec` countdown starts; if nobody touches the screen, `onExpire` fires.
 */
export function useIdle(active: boolean, timeoutSec: number, graceSec: number, onExpire: () => void) {
  const [warning, setWarning] = useState(false)
  const [remaining, setRemaining] = useState(graceSec)
  const lastTouch = useRef(Date.now())
  const expireRef = useRef(onExpire)
  expireRef.current = onExpire

  useEffect(() => {
    if (!active) {
      setWarning(false)
      return
    }
    lastTouch.current = Date.now()
    const bump = () => {
      lastTouch.current = Date.now()
      setWarning(false)
    }
    const evts = ['pointerdown', 'keydown'] as const
    evts.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    const iv = setInterval(() => {
      const idle = (Date.now() - lastTouch.current) / 1000
      if (idle >= timeoutSec + graceSec) {
        setWarning(false)
        expireRef.current()
      } else if (idle >= timeoutSec) {
        setWarning(true)
        setRemaining(Math.ceil(timeoutSec + graceSec - idle))
      }
    }, 250)
    return () => {
      clearInterval(iv)
      evts.forEach((e) => window.removeEventListener(e, bump))
    }
  }, [active, timeoutSec, graceSec])

  return { warning, remaining }
}
