import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, AlignCenter, AlignLeft, AlignRight, CheckCircle2, Circle, Eye, EyeOff, Hand, RotateCcw, Square, SquareRoundCorner, Type, User, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Confirm, FormError, NativeSelect, SaveButton } from './common'
import { api, type Template } from '../lib/api'
import {
  CARD,
  DEFAULT_LAYOUT,
  FONT_LABELS,
  SAFE_MARGIN,
  drawLayoutCard,
  withDefaults,
  type Box,
  type CardFont,
  type CardLayout,
  type PhotoSlot,
  type SlotKey,
  type TextSlot,
} from '../lib/cardLayout'
import { SAMPLE_FORTUNES, loadArtwork, loadSamples, sampleDate, type Samples } from '../lib/cardPreview'

const SLOTS: {
  key: SlotKey
  label: string
  color: string
  icon: ReactNode
  hint: string
}[] = [
  {
    key: 'face',
    label: 'Face photo',
    color: '#2563eb',
    icon: <User className="w-4 h-4" />,
    hint: 'The guest’s portrait (3:4 from the camera; cropped to fill the box).',
  },
  {
    key: 'palm',
    label: 'Palm photo',
    color: '#059669',
    icon: <Hand className="w-4 h-4" />,
    hint: 'The enhanced palm with the gold destiny lines (square; cropped to fill the box).',
  },
  {
    key: 'fortune',
    label: 'Fortune text',
    color: '#d97706',
    icon: <Type className="w-4 h-4" />,
    hint: 'The text shrinks automatically until the whole fortune fits the box.',
  },
  {
    key: 'meta',
    label: 'Reading ID & date',
    color: '#9333ea',
    icon: <Type className="w-4 h-4" />,
    hint: 'Optional small line, e.g. “#K7X2M9 · 15 OCT 2026”. Helps staff find a reading later.',
  },
]
const MIN = 40
const minSize = (k: SlotKey) => (k === 'fortune' ? { w: 200, h: 120 } : { w: MIN, h: MIN })
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
interface Drag {
  key: SlotKey
  mode: 'move' | Handle
  sx: number
  sy: number
  orig: Box
}
interface Guides {
  x: number[]
  y: number[]
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * A typed number is kept as typed wherever possible: a new X/Y keeps the position and shrinks
 * the box to stay on the card; a new width/height keeps the position and is capped at the edge.
 * (So typing X, Y, W, H in any order gives the box you typed.)
 */
export function applyNumber<B extends Box>(b: B, k: keyof Box, v: number, m: { w: number; h: number }): B {
  const n = { ...b }
  if (k === 'x') {
    n.x = clamp(v, 0, CARD.w - m.w)
    n.w = clamp(n.w, m.w, CARD.w - n.x)
  } else if (k === 'y') {
    n.y = clamp(v, 0, CARD.h - m.h)
    n.h = clamp(n.h, m.h, CARD.h - n.y)
  } else if (k === 'w') {
    n.w = clamp(v, m.w, CARD.w - n.x)
  } else {
    n.h = clamp(v, m.h, CARD.h - n.y)
  }
  return n
}

/** Snap targets: edges snap to card edges, the trim line and other boxes' edges; centres snap to centres. */
function targets(layout: CardLayout, except: SlotKey) {
  const xs = [0, SAFE_MARGIN, CARD.w - SAFE_MARGIN, CARD.w]
  const ys = [0, SAFE_MARGIN, CARD.h - SAFE_MARGIN, CARD.h]
  const cx = [CARD.w / 2]
  const cy = [CARD.h / 2]
  for (const s of SLOTS) {
    const b = layout[s.key]
    if (s.key === except || !b.enabled) continue
    xs.push(b.x, b.x + b.w)
    ys.push(b.y, b.y + b.h)
    cx.push(b.x + b.w / 2)
    cy.push(b.y + b.h / 2)
  }
  return { xs, ys, cx, cy }
}
function nearest(values: number[], list: number[], thr: number) {
  let best: { d: number; t: number } | null = null
  for (const v of values) for (const t of list) if (Math.abs(t - v) <= thr && (!best || Math.abs(t - v) < Math.abs(best.d))) best = { d: t - v, t }
  return best
}

const best = (a: ReturnType<typeof nearest>, b: ReturnType<typeof nearest>) => (!a ? b : !b ? a : Math.abs(a.d) <= Math.abs(b.d) ? a : b)

/** Moves/resizes a box from a pointer delta, keeping it on the card, with optional snapping. */
function dragBox(d: Drag, dx: number, dy: number, layout: CardLayout, opts: { snap: boolean; thr: number; keepRatio: boolean }): { box: Box; guides: Guides } {
  const o = d.orig
  const m = minSize(d.key)
  const guides: Guides = { x: [], y: [] }
  const T = targets(layout, d.key)
  if (d.mode === 'move') {
    let x = clamp(o.x + dx, 0, CARD.w - o.w)
    let y = clamp(o.y + dy, 0, CARD.h - o.h)
    if (opts.snap) {
      const sx = best(nearest([x, x + o.w], T.xs, opts.thr), nearest([x + o.w / 2], T.cx, opts.thr))
      if (sx) {
        x = clamp(x + sx.d, 0, CARD.w - o.w)
        guides.x.push(sx.t)
      }
      const sy = best(nearest([y, y + o.h], T.ys, opts.thr), nearest([y + o.h / 2], T.cy, opts.thr))
      if (sy) {
        y = clamp(y + sy.d, 0, CARD.h - o.h)
        guides.y.push(sy.t)
      }
    }
    return {
      box: { x: Math.round(x), y: Math.round(y), w: o.w, h: o.h },
      guides,
    }
  }
  let left = o.x
  let right = o.x + o.w
  let top = o.y
  let bottom = o.y + o.h
  const mode = d.mode
  if (mode.includes('w')) left = clamp(o.x + dx, 0, right - m.w)
  if (mode.includes('e')) right = clamp(o.x + o.w + dx, left + m.w, CARD.w)
  if (mode.includes('n')) top = clamp(o.y + dy, 0, bottom - m.h)
  if (mode.includes('s')) bottom = clamp(o.y + o.h + dy, top + m.h, CARD.h)
  if (opts.snap) {
    const snapEdge = (v: number, list: number[], push: number[]) => {
      const s = nearest([v], list, opts.thr)
      if (!s) return v
      push.push(s.t)
      return s.t
    }
    if (mode.includes('w')) left = clamp(snapEdge(left, T.xs, guides.x), 0, right - m.w)
    if (mode.includes('e')) right = clamp(snapEdge(right, T.xs, guides.x), left + m.w, CARD.w)
    if (mode.includes('n')) top = clamp(snapEdge(top, T.ys, guides.y), 0, bottom - m.h)
    if (mode.includes('s')) bottom = clamp(snapEdge(bottom, T.ys, guides.y), top + m.h, CARD.h)
  }
  // Shift on a corner keeps the box's proportions.
  if (opts.keepRatio && mode.length === 2) {
    const ratio = o.w / o.h
    const w = right - left
    let h = w / ratio
    if (mode.includes('n')) top = bottom - h
    else bottom = top + h
    if (top < 0 || bottom > CARD.h) {
      h = mode.includes('n') ? bottom - Math.max(0, top) : Math.min(CARD.h, bottom) - top
      const nw = h * ratio
      if (mode.includes('w')) left = right - nw
      else right = left + nw
      if (mode.includes('n')) top = bottom - h
      else bottom = top + h
    }
    guides.x = []
    guides.y = []
  }
  return {
    box: {
      x: Math.round(left),
      y: Math.round(top),
      w: Math.round(right - left),
      h: Math.round(bottom - top),
    },
    guides,
  }
}

export function CardLayoutEditor({ template, onClose, onSaved }: { template: Template; onClose: () => void; onSaved: (t: Template) => void }) {
  const initial = useRef(withDefaults(template.cardLayout) ?? structuredClone(DEFAULT_LAYOUT))
  const [layout, setLayout] = useState<CardLayout>(initial.current)
  const [sel, setSel] = useState<SlotKey>('face')
  const [art, setArt] = useState<HTMLImageElement | null>(null)
  const [artErr, setArtErr] = useState(false)
  const [samples, setSamples] = useState<Samples | null>(null)
  const [sample, setSample] = useState(SAMPLE_FORTUNES[0].id)
  const [showContent, setShowContent] = useState(true)
  const [showTrim, setShowTrim] = useState(true)
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ w: 400, h: 600 })
  const drag = useRef<Drag | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const scale = stage.w / CARD.w
  const dirty = JSON.stringify(layout) !== JSON.stringify(initial.current)

  useEffect(() => {
    let alive = true
    loadArtwork(template.cardImageUrl).then((im) => {
      if (!alive) return
      setArt(im)
      setArtErr(!im)
    })
    loadSamples().then((s) => alive && setSamples(s))
    return () => {
      alive = false
    }
  }, [template.cardImageUrl])

  // Fit a 2:3 stage into the space available.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const fit = () => {
      const r = el.getBoundingClientRect()
      const h = Math.max(300, Math.min(r.height, r.width * 1.5))
      setStage({ w: Math.round(h / 1.5), h: Math.round(h) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Live preview: the same drawing code the kiosk prints with.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const id = requestAnimationFrame(() => {
      const ctx = c.getContext('2d')!
      const f = SAMPLE_FORTUNES.find((s) => s.id === sample) ?? SAMPLE_FORTUNES[0]
      if (showContent && samples) {
        drawLayoutCard(ctx, layout, {
          frame: art,
          face: samples.face,
          palm: samples.palm,
          fortune: f.text,
          language: f.language,
          sessionId: 'K7X2M9',
          dateLabel: sampleDate(),
        })
      } else {
        drawLayoutCard(
          ctx,
          {
            ...layout,
            face: { ...layout.face, enabled: false },
            palm: { ...layout.palm, enabled: false },
            fortune: layout.fortune,
            meta: { ...layout.meta, enabled: false },
          },
          {
            frame: art,
            face: null,
            palm: null,
            fortune: '',
            language: 'en',
            sessionId: '',
            dateLabel: '',
          },
        )
      }
    })
    return () => cancelAnimationFrame(id)
  }, [layout, art, samples, sample, showContent])

  const update = useCallback(<K extends SlotKey>(key: K, patch: Partial<CardLayout[K]>) => setLayout((l) => ({ ...l, [key]: { ...l[key], ...patch } })), [])

  const onPointerDown = (e: RPointerEvent, key: SlotKey, mode: Drag['mode']) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setSel(key)
    const b = layout[key]
    drag.current = {
      key,
      mode,
      sx: e.clientX,
      sy: e.clientY,
      orig: { x: b.x, y: b.y, w: b.w, h: b.h },
    }
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const r = dragBox(d, (ev.clientX - d.sx) / scale, (ev.clientY - d.sy) / scale, layoutRef.current, { snap: !ev.altKey, thr: 6 / scale, keepRatio: ev.shiftKey })
      setGuides(r.guides)
      setLayout((l) => ({ ...l, [d.key]: { ...l[d.key], ...r.box } }))
    }
    const up = () => {
      drag.current = null
      setGuides({ x: [], y: [] })
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // Arrow keys nudge the selected box (Shift = 10 px).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, select, textarea, [role="alertdialog"]')) return
      const step = e.shiftKey ? 10 : 1
      const d = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }[e.key]
      if (!d) return
      e.preventDefault()
      setLayout((l) => {
        const b = l[sel]
        return {
          ...l,
          [sel]: {
            ...b,
            x: clamp(b.x + d[0], 0, CARD.w - b.w),
            y: clamp(b.y + d[1], 0, CARD.h - b.h),
          },
        }
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel])

  const close = () => (dirty ? setConfirmClose(true) : onClose())

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const t = await api.patch<Template>(`/admin/templates/${template.id}`, {
        cardLayout: layout,
      })
      toast.success('Card layout saved. Kiosks print it from their next reading.')
      initial.current = layout
      onSaved(t)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Artwork checks: 4x6 portrait (2:3) at print resolution.
  const warnings: string[] = []
  if (art) {
    const { naturalWidth: w, naturalHeight: h } = art
    if (Math.abs(w / h - 2 / 3) > 0.02)
      warnings.push(`The artwork is ${w}×${h} px, not 4×6 portrait (2:3). The kiosk crops it to fill the card; edges may be cut. Design at 1200×1800 px.`)
    if (w < 1000) warnings.push(`Low resolution (${w}×${h} px). Prints may look soft; use 1200×1800 px (300 dpi).`)
  }
  const outside = SLOTS.filter((s) => {
    const b = layout[s.key]
    return b.enabled && (b.x < SAFE_MARGIN || b.y < SAFE_MARGIN || b.x + b.w > CARD.w - SAFE_MARGIN || b.y + b.h > CARD.h - SAFE_MARGIN)
  })

  const selSlot = SLOTS.find((s) => s.key === sel)!
  const b = layout[sel]

  return (
    <div className="fixed inset-0 z-50 bg-[#f4f1ec] flex flex-col" role="dialog" aria-modal="true" aria-label="Card layout editor">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-white border-b border-gray-200">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-lg font-semibold text-gray-900">Card layout · {template.name}</h2>
          <p className="text-sm text-gray-500">Drag the boxes onto the empty spaces in your design. Drag a corner to resize (Shift keeps proportions, Alt turns off snapping).</p>
        </div>
        <Button variant="outline" onClick={() => setConfirmReset(true)}>
          <RotateCcw className="w-4 h-4 mr-1" /> Reset
        </Button>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <SaveButton busy={busy} onClick={save}>
          Save layout
        </SaveButton>
        <button onClick={close} className="p-2 rounded-md hover:bg-gray-100" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Stage */}
        <div className="flex-1 min-h-[420px] min-w-0 p-5 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
            <NativeSelect value={sample} onChange={setSample} className="w-auto">
              {SAMPLE_FORTUNES.map((s) => (
                <option key={s.id} value={s.id}>
                  Sample: {s.label}
                </option>
              ))}
            </NativeSelect>
            <Button variant="outline" size="sm" onClick={() => setShowContent((v) => !v)}>
              {showContent ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
              {showContent ? 'Show my artwork only' : 'Show sample photos & text'}
            </Button>
            <label className="flex items-center gap-2 text-gray-600 ml-1">
              <input type="checkbox" checked={showTrim} onChange={(e) => setShowTrim(e.target.checked)} className="accent-[#34211e]" />
              Trim line
            </label>
          </div>
          <div ref={wrapRef} className="flex-1 min-h-0 flex items-start justify-center">
            <div className="relative shadow-xl bg-white select-none touch-none" style={{ width: stage.w, height: stage.h }} onPointerDown={() => undefined}>
              <canvas ref={canvasRef} width={CARD.w} height={CARD.h} className="absolute inset-0 w-full h-full" />
              {artErr && (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 bg-white/80 p-6 text-center">
                  The artwork could not be loaded. Check the server is running, then reopen the editor.
                </div>
              )}
              {showTrim && (
                <div
                  className="absolute pointer-events-none border border-dashed border-red-400/80"
                  style={{
                    left: SAFE_MARGIN * scale,
                    top: SAFE_MARGIN * scale,
                    right: SAFE_MARGIN * scale,
                    bottom: SAFE_MARGIN * scale,
                  }}
                  title="The printer may trim up to here"
                />
              )}
              {guides.x.map((x, i) => (
                <div key={`gx${i}`} className="absolute top-0 bottom-0 w-px bg-pink-500 pointer-events-none" style={{ left: x * scale }} />
              ))}
              {guides.y.map((y, i) => (
                <div key={`gy${i}`} className="absolute left-0 right-0 h-px bg-pink-500 pointer-events-none" style={{ top: y * scale }} />
              ))}
              {SLOTS.filter((s) => layout[s.key].enabled).map((s) => {
                const bx = layout[s.key]
                const active = s.key === sel
                return (
                  <div
                    key={s.key}
                    className="absolute cursor-move"
                    style={{
                      left: bx.x * scale,
                      top: bx.y * scale,
                      width: bx.w * scale,
                      height: bx.h * scale,
                      outline: `${active ? 2 : 1.5}px ${active ? 'solid' : 'dashed'} ${s.color}`,
                      background: active ? `${s.color}14` : 'transparent',
                      zIndex: active ? 3 : 2,
                    }}
                    onPointerDown={(e) => onPointerDown(e, s.key, 'move')}
                  >
                    <span className="absolute -top-[22px] left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow" style={{ background: s.color }}>
                      {s.label}
                      {active && ` · ${bx.w}×${bx.h}`}
                    </span>
                    {active &&
                      HANDLES.map((h) => (
                        <span
                          key={h}
                          onPointerDown={(e) => onPointerDown(e, s.key, h)}
                          className="absolute w-3 h-3 bg-white border-2 rounded-sm"
                          style={{
                            borderColor: s.color,
                            left: h.includes('w') ? -6 : h.includes('e') ? 'calc(100% - 6px)' : 'calc(50% - 6px)',
                            top: h.includes('n') ? -6 : h.includes('s') ? 'calc(100% - 6px)' : 'calc(50% - 6px)',
                            cursor: `${h}-resize`,
                          }}
                        />
                      ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Properties */}
        <aside className="lg:w-[340px] shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 overflow-y-auto p-5 space-y-5">
          <div className="space-y-1.5">
            {SLOTS.map((s) => {
              const on = layout[s.key].enabled
              return (
                <div key={s.key} className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${sel === s.key ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}>
                  <button className="flex-1 flex items-center gap-2 text-left text-sm font-medium" onClick={() => setSel(s.key)} disabled={!on}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                    <span className={on ? 'text-gray-900' : 'text-gray-400'}>{s.label}</span>
                  </button>
                  {s.key !== 'fortune' && (
                    <label className="flex items-center gap-1.5 text-xs text-gray-500">
                      <input
                        type="checkbox"
                        checked={on}
                        className="accent-[#34211e]"
                        onChange={(e) => {
                          update(s.key, { enabled: e.target.checked })
                          if (e.target.checked) setSel(s.key)
                          else if (sel === s.key) setSel('fortune')
                        }}
                      />
                      Print
                    </label>
                  )}
                </div>
              )
            })}
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: selSlot.color }} /> {selSlot.label}
              </h3>
              <p className="text-xs text-gray-500 mt-1">{selSlot.hint}</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <label key={k} className="text-xs text-gray-500 space-y-1">
                  <span className="block uppercase">{k === 'w' ? 'Width' : k === 'h' ? 'Height' : k}</span>
                  <Input
                    type="number"
                    value={b[k]}
                    className="px-2 h-8"
                    onChange={(e) => {
                      const v = Math.round(Number(e.target.value) || 0)
                      update(sel, applyNumber(b, k, v, minSize(sel)))
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 -mt-2">Pixels on the 1200 × 1800 px card (300 dpi). Arrow keys nudge 1 px, Shift + arrow 10 px.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => update(sel, { x: Math.round((CARD.w - b.w) / 2) })}>
                Centre across
              </Button>
              {sel !== 'fortune' && sel !== 'meta' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    update(sel, {
                      h: clamp(Math.round(b.w * (sel === 'face' ? 4 / 3 : 1)), MIN, CARD.h - b.y),
                    })
                  }
                >
                  {sel === 'face' ? 'Camera shape (3:4)' : 'Square'}
                </Button>
              )}
            </div>

            {(sel === 'face' || sel === 'palm') && <PhotoOptions slot={layout[sel]} onChange={(p) => update(sel, p)} />}
            {(sel === 'fortune' || sel === 'meta') && <TextOptions slot={layout[sel]} onChange={(p) => update(sel, p)} isMeta={sel === 'meta'} />}
          </div>

          <div className="space-y-2 border-t pt-4">
            {art && !warnings.length && (
              <p className="flex items-start gap-2 text-xs text-green-700">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> Artwork {art.naturalWidth}×{art.naturalHeight} px fits a 4×6 card.
              </p>
            )}
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 text-xs text-orange-700">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {w}
              </p>
            ))}
            {outside.length > 0 && (
              <p className="flex items-start gap-2 text-xs text-orange-700">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {outside.map((s) => s.label).join(', ')} {outside.length > 1 ? 'cross' : 'crosses'} the red trim line; the printer
                may cut off a few millimetres there.
              </p>
            )}
            <p className="text-xs text-gray-500">The preview is drawn with the same code the kiosk prints with, using sample photos. Real fortunes are at most 45 words.</p>
          </div>
          <FormError message={err} />
        </aside>
      </div>

      <Confirm
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard layout changes?"
        body="Your changes to this layout have not been saved."
        confirmLabel="Discard"
        onConfirm={async () => onClose()}
      />
      <Confirm
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset to the default positions?"
        body="All boxes go back to the standard positions. Nothing is saved until you press Save layout."
        confirmLabel="Reset"
        destructive={false}
        onConfirm={async () => setLayout(structuredClone(DEFAULT_LAYOUT))}
      />
    </div>
  )
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border border-gray-200 overflow-hidden">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs ${value === o.v ? 'bg-[#34211e] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <label className="text-xs text-gray-500 space-y-1 block">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 rounded border border-gray-200 bg-white p-0.5" />
        <Input
          value={text}
          className="h-8 px-2 font-mono text-xs"
          onChange={(e) => {
            setText(e.target.value)
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value)
          }}
        />
      </span>
    </label>
  )
}

function PhotoOptions({ slot, onChange }: { slot: PhotoSlot; onChange: (p: Partial<PhotoSlot>) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className="text-xs text-gray-500">Shape</span>
        <Seg
          value={slot.shape}
          onChange={(shape) => onChange({ shape })}
          options={[
            {
              v: 'rect',
              label: 'Square',
              icon: <Square className="w-3.5 h-3.5" />,
            },
            {
              v: 'rounded',
              label: 'Rounded',
              icon: <SquareRoundCorner className="w-3.5 h-3.5" />,
            },
            {
              v: 'circle',
              label: 'Circle / oval',
              icon: <Circle className="w-3.5 h-3.5" />,
            },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-gray-500 space-y-1 block">
          <span>Border width (px, 0 = none)</span>
          <Input
            type="number"
            min={0}
            max={40}
            value={slot.borderWidth}
            className="h-8 px-2"
            onChange={(e) =>
              onChange({
                borderWidth: clamp(Math.round(Number(e.target.value) || 0), 0, 40),
              })
            }
          />
        </label>
        <ColorField label="Border colour" value={slot.borderColor} onChange={(borderColor) => onChange({ borderColor })} />
      </div>
    </div>
  )
}

function TextOptions({ slot, onChange, isMeta }: { slot: TextSlot; onChange: (p: Partial<TextSlot>) => void; isMeta: boolean }) {
  return (
    <div className="space-y-3">
      <label className="text-xs text-gray-500 space-y-1 block">
        <span>Font{!isMeta && ' (Tamil fortunes always use Noto Serif Tamil)'}</span>
        <NativeSelect value={slot.font} onChange={(v) => onChange({ font: v as CardFont })}>
          {(Object.keys(FONT_LABELS) as CardFont[]).map((f) => (
            <option key={f} value={f}>
              {FONT_LABELS[f]}
            </option>
          ))}
        </NativeSelect>
      </label>
      <div className="space-y-1">
        <span className="text-xs text-gray-500">Alignment</span>
        <Seg
          value={slot.align}
          onChange={(align) => onChange({ align })}
          options={[
            {
              v: 'left',
              label: 'Left',
              icon: <AlignLeft className="w-3.5 h-3.5" />,
            },
            {
              v: 'center',
              label: 'Centre',
              icon: <AlignCenter className="w-3.5 h-3.5" />,
            },
            {
              v: 'right',
              label: 'Right',
              icon: <AlignRight className="w-3.5 h-3.5" />,
            },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-gray-500 space-y-1 block">
          <span>Largest text size (px)</span>
          <Input
            type="number"
            min={16}
            max={160}
            value={slot.maxSize}
            className="h-8 px-2"
            onChange={(e) =>
              onChange({
                maxSize: clamp(Math.round(Number(e.target.value) || 16), 16, 160),
              })
            }
          />
        </label>
        <ColorField label="Text colour" value={slot.color} onChange={(color) => onChange({ color })} />
      </div>
      {!isMeta && (
        <p className="text-[11px] text-gray-400">
          Short fortunes print at the largest size; longer ones shrink (down to 18 px) to fit the box. Check the “Longest fortune” sample.
        </p>
      )}
    </div>
  )
}
