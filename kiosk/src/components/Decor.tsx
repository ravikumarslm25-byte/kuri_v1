import { useMemo, type CSSProperties, type ReactNode } from 'react'

/** Display heading in the concept-art lettering (Berkshire Swash, cream with gold glow). */
export function Title({ children, size = 88, style }: { children: ReactNode; size?: number; style?: CSSProperties }) {
  return (
    <h1 className="kuri-title" style={{ fontSize: size, ...style }}>
      {children}
    </h1>
  )
}

/** Drifting gold motes. Pure CSS animation, cheap on the kiosk GPU. */
export function Sparkles({ count = 26, area }: { count?: number; area?: CSSProperties }) {
  const motes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        top: 30 + Math.random() * 70,
        size: 3 + Math.random() * 6,
        delay: -Math.random() * 9,
        dur: 6 + Math.random() * 7,
        key: i,
      })),
    [count],
  )
  return (
    <div className="sparkles" style={area} aria-hidden>
      {motes.map((m) => (
        <span
          key={m.key}
          className="mote"
          style={{ left: `${m.left}%`, top: `${m.top}%`, width: m.size, height: m.size, animationDelay: `${m.delay}s`, animationDuration: `${m.dur}s` }}
        />
      ))}
    </div>
  )
}

/** Thin gold corner brackets around the stage edge. */
export function Corners() {
  return (
    <div className="corners" aria-hidden>
      <span className="c tl" />
      <span className="c tr" />
      <span className="c bl" />
      <span className="c br" />
    </div>
  )
}

/** Gold-framed box (photo frames on the result screen, camera frames). */
export function GoldFrame({ children, style, className = '' }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={`gold-frame ${className}`} style={style}>
      {children}
    </div>
  )
}
