import { useEffect, useState, type ReactNode } from 'react'
import { STAGE } from '../config/plates'

/**
 * Fixed 1080x1920 design canvas, uniformly scaled and centred on any screen.
 * Every screen is laid out in stage pixels, so it looks identical on a 32" or 55" panel.
 */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return (
    <div className="stage-viewport">
      <div className="stage" style={{ width: STAGE.w, height: STAGE.h, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}
