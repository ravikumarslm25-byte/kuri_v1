/**
 * Custom card layouts: the client designs the 4x6" artwork with empty spaces, and the admin
 * drags three boxes onto those spaces (face photo, palm photo, fortune) plus an optional
 * reading-ID line. This file draws a card from that layout.
 *
 * ONE renderer, TWO copies: this file (kiosk, canonical) is copied byte-for-byte to
 * admin/src/app/lib/cardLayout.ts so the admin preview is exactly what the kiosk prints.
 * After editing, run `node tools/sync-card-layout.mjs` (the kiosk test fails if they differ).
 *
 * Units: pixels on the card at 300 dpi, 1200 x 1800, portrait. No imports on purpose.
 */

export const CARD = { w: 1200, h: 1800 }
/** Dye-sub borderless prints trim ~0.1"; keep important content this far inside the edge. */
export const SAFE_MARGIN = 60

export type PhotoShape = 'rect' | 'rounded' | 'circle'
export type CardFont = 'Marcellus' | 'Poppins' | 'Berkshire Swash'
export type TextAlign = 'left' | 'center' | 'right'
export type CardLanguage = 'en' | 'ta'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export interface PhotoSlot extends Box {
  enabled: boolean
  shape: PhotoShape
  borderColor: string
  borderWidth: number
}
export interface TextSlot extends Box {
  enabled: boolean
  color: string
  font: CardFont
  align: TextAlign
  /** Largest font size in card px; the text shrinks from here until it fits the box. */
  maxSize: number
}
export interface CardLayout {
  version: 1
  face: PhotoSlot
  palm: PhotoSlot
  fortune: TextSlot
  /** Small "#READING-ID · DATE" line. Off by default. */
  meta: TextSlot
}
export type SlotKey = 'face' | 'palm' | 'fortune' | 'meta'

/** Same values as DEFAULT_LAYOUT in server/src/services/cardLayout.js. */
export const DEFAULT_LAYOUT: CardLayout = {
  version: 1,
  face: { x: 130, y: 400, w: 440, h: 590, enabled: true, shape: 'rounded', borderColor: '#dcb15c', borderWidth: 6 },
  palm: { x: 630, y: 400, w: 440, h: 590, enabled: true, shape: 'rounded', borderColor: '#dcb15c', borderWidth: 6 },
  fortune: { x: 140, y: 1100, w: 920, h: 430, enabled: true, color: '#fff1d2', font: 'Marcellus', align: 'center', maxSize: 56 },
  meta: { x: 130, y: 1620, w: 940, h: 70, enabled: false, color: '#dcb15c', font: 'Marcellus', align: 'center', maxSize: 34 },
}

export const FONT_LABELS: Record<CardFont, string> = {
  Marcellus: 'Classic serif (Marcellus)',
  Poppins: 'Clean sans (Poppins)',
  'Berkshire Swash': 'Script (Berkshire Swash) — short text only',
}

/** Fills any missing field from the defaults (layouts saved by older versions keep working). */
export function withDefaults(raw: Partial<CardLayout> | null | undefined): CardLayout | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    version: 1,
    face: { ...DEFAULT_LAYOUT.face, ...(raw.face || {}) },
    palm: { ...DEFAULT_LAYOUT.palm, ...(raw.palm || {}) },
    fortune: { ...DEFAULT_LAYOUT.fortune, ...(raw.fortune || {}), enabled: true },
    meta: { ...DEFAULT_LAYOUT.meta, ...(raw.meta || {}) },
  }
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => res(im)
    im.onerror = () => res(null)
    im.src = src
  })
}

/** Draws `im` to fill the box, cropping the overflow evenly (CSS object-fit: cover). */
export function coverDraw(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iw = im.naturalWidth
  const ih = im.naturalHeight
  if (!iw || !ih) return
  const s = Math.max(w / iw, h / ih)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h)
}

function shapePath(ctx: CanvasRenderingContext2D, shape: PhotoShape, x: number, y: number, w: number, h: number) {
  ctx.beginPath()
  if (shape === 'circle') {
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2)
  } else if (shape === 'rounded') {
    const r = Math.min(w, h) * 0.06
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  } else {
    ctx.rect(x, y, w, h)
  }
}

export function drawPhoto(ctx: CanvasRenderingContext2D, slot: PhotoSlot, im: HTMLImageElement | null) {
  // No photo (e.g. face skipped): leave the client's artwork visible in that space.
  if (!slot.enabled || !im) return
  const { x, y, w, h } = slot
  ctx.save()
  shapePath(ctx, slot.shape, x, y, w, h)
  ctx.clip()
  coverDraw(ctx, im, x, y, w, h)
  ctx.restore()
  if (slot.borderWidth > 0) {
    // Stroke inside the box so the border never spills onto the artwork around it.
    const b = slot.borderWidth
    ctx.save()
    ctx.lineWidth = b
    ctx.strokeStyle = slot.borderColor
    shapePath(ctx, slot.shape, x + b / 2, y + b / 2, w - b, h - b)
    ctx.stroke()
    ctx.restore()
  }
}

/** Greedy word wrap (Tamil also separates words with spaces). */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width <= maxW || !line) line = test
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  return lines
}

function fontFor(slot: TextSlot, language: CardLanguage, size: number) {
  // Marcellus/Poppins/Berkshire have no Tamil letters: Tamil always uses Noto Serif Tamil.
  if (language === 'ta') return `${size}px "Noto Serif Tamil", serif`
  return `${size}px "${slot.font}", ${slot.font === 'Poppins' ? 'sans-serif' : 'serif'}`
}
const lineFactor = (slot: TextSlot, language: CardLanguage) => (language === 'ta' ? 1.6 : slot.font === 'Berkshire Swash' ? 1.3 : 1.38)
const MIN_TEXT = 18

export interface FittedText {
  size: number
  lineHeight: number
  lines: string[]
}

/** Largest size (maxSize down to 18 px) at which the text fits the box; the last line is cut with … if even 18 px overflows. */
export function fitText(ctx: CanvasRenderingContext2D, slot: TextSlot, text: string, language: CardLanguage): FittedText {
  const pad = Math.round(Math.min(slot.w, slot.h) * 0.04)
  const maxW = Math.max(10, slot.w - pad * 2)
  const maxH = Math.max(10, slot.h - pad * 2)
  const top = Math.max(MIN_TEXT, Math.round(slot.maxSize))
  let size = top
  let lines: string[] = []
  for (; size >= MIN_TEXT; size -= 2) {
    ctx.font = fontFor(slot, language, size)
    lines = wrapLines(ctx, text, maxW)
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width))
    if (lines.length * size * lineFactor(slot, language) <= maxH && widest <= maxW) break
  }
  size = Math.max(MIN_TEXT, size)
  ctx.font = fontFor(slot, language, size)
  const lh = size * lineFactor(slot, language)
  const fit = Math.max(1, Math.floor(maxH / lh))
  if (lines.length > fit) {
    lines = lines.slice(0, fit)
    let last = lines[fit - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1)
    lines[fit - 1] = `${last.trimEnd()}…`
  }
  return { size, lineHeight: lh, lines }
}

export function drawText(ctx: CanvasRenderingContext2D, slot: TextSlot, text: string, language: CardLanguage) {
  if (!slot.enabled || !text.trim()) return
  const f = fitText(ctx, slot, text, language)
  const pad = Math.round(Math.min(slot.w, slot.h) * 0.04)
  ctx.save()
  ctx.font = fontFor(slot, language, f.size)
  ctx.fillStyle = slot.color
  ctx.textAlign = slot.align
  ctx.textBaseline = 'middle'
  const x = slot.align === 'left' ? slot.x + pad : slot.align === 'right' ? slot.x + slot.w - pad : slot.x + slot.w / 2
  const blockH = f.lines.length * f.lineHeight
  const y0 = slot.y + (slot.h - blockH) / 2 + f.lineHeight / 2
  f.lines.forEach((ln, i) => ctx.fillText(ln, x, y0 + i * f.lineHeight))
  ctx.restore()
}

/** Waits for the faces the card uses, so text is measured with the real font. */
export async function ensureCardFonts() {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.all(
    ['40px Marcellus', '40px Poppins', '40px "Berkshire Swash"', '40px "Noto Serif Tamil"'].map((f) => document.fonts.load(f).catch(() => undefined)),
  )
}

export interface LayoutCardInput {
  frame: HTMLImageElement | null
  face: HTMLImageElement | null
  palm: HTMLImageElement | null
  fortune: string
  language: CardLanguage
  sessionId: string
  dateLabel: string
}

/** Draws the whole card: artwork (full bleed), then photos, fortune and the reading line. */
export function drawLayoutCard(ctx: CanvasRenderingContext2D, layout: CardLayout, input: LayoutCardInput) {
  const { w: W, h: H } = CARD
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  if (input.frame) coverDraw(ctx, input.frame, 0, 0, W, H)
  drawPhoto(ctx, layout.face, input.face)
  drawPhoto(ctx, layout.palm, input.palm)
  drawText(ctx, layout.fortune, input.fortune, input.language)
  // The reading line is always Latin text (ID + date), so it uses the slot's own font.
  drawText(ctx, layout.meta, `#${input.sessionId} · ${input.dateLabel}`.toUpperCase(), 'en')
}
