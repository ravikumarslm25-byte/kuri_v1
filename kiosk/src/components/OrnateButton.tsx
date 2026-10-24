import type { CSSProperties, ReactNode } from 'react'

type Variant = 'glass' | 'gold' | 'ghost'

/**
 * Temple-style button: pointed ends, double gold rule, soft glow (matches the concept art).
 * Drawn as an SVG so it scales cleanly to any box.
 */
export function OrnateButton({
  children,
  onClick,
  variant = 'glass',
  style,
  disabled,
  pulse,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: Variant
  style?: CSSProperties
  disabled?: boolean
  pulse?: boolean
}) {
  const id = `ob-${variant}`
  return (
    <button
      type="button"
      className={`ornate-btn ornate-${variant}${pulse ? ' pulse' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      <svg className="ornate-svg" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            {variant === 'gold' ? (
              <>
                <stop offset="0" stopColor="#f6dd94" />
                <stop offset="0.45" stopColor="#d9a842" />
                <stop offset="1" stopColor="#a8701e" />
              </>
            ) : (
              <>
                <stop offset="0" stopColor="#3a2a1e" stopOpacity="0.82" />
                <stop offset="1" stopColor="#140c07" stopOpacity="0.9" />
              </>
            )}
          </linearGradient>
          <linearGradient id={`${id}-rule`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#b8862e" />
            <stop offset="0.5" stopColor="#ffe9a8" />
            <stop offset="1" stopColor="#b8862e" />
          </linearGradient>
        </defs>
        {variant !== 'ghost' && (
          <path d="M18 60 L58 8 H542 L582 60 L542 112 H58 Z" fill={`url(#${id}-fill)`} />
        )}
        <path d="M18 60 L58 8 H542 L582 60 L542 112 H58 Z" fill="none" stroke={`url(#${id}-rule)`} strokeWidth="4" vectorEffect="non-scaling-stroke" />
        <path d="M34 60 L66 18 H534 L566 60 L534 102 H66 Z" fill="none" stroke={`url(#${id}-rule)`} strokeWidth="1.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="ornate-label">{children}</span>
    </button>
  )
}
