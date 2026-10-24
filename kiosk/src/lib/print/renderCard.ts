/**
 * Renders the 4x6" keepsake card to a 1200x1800 canvas (300 dpi, portrait).
 * The same image is shown on the Printing screen, printed, and uploaded, so what the guest
 * sees is exactly what comes out of the DNP printer.
 *
 * Safe area: everything important stays >= 60 px (0.2") inside the edge, because
 * borderless dye-sub prints trim a little.
 */
import type { Language } from '../../config/settings'
import { drawLayoutCard, ensureCardFonts, type CardLayout } from './cardLayout'

export const CARD = { w: 1200, h: 1800 }

export interface CardInput {
  facePhoto: string | null
  palmArt: string | null // gold-lined palm (falls back to raw palm)
  fortune: string
  sessionId: string
  dateLabel: string
  footer: string // event name / branding line
  language: Language
  /** Optional full-bleed artwork from the event template; content is drawn on top. */
  frameUrl?: string
  /**
   * Where the photos and fortune go on that artwork (set in Admin -> Templates -> Card layout).
   * With artwork + layout the card is the client's design only; without a layout the standard
   * Kuri design is drawn over the artwork; without artwork the standard design is printed.
   */
  layout?: CardLayout | null
}

const GOLD = '#dcb15c'
const GOLD_HI = '#f7dd9a'
const CREAM = '#fff1d2'

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => res(im)
    im.onerror = () => res(null)
    im.src = src
  })
}

function coverDraw(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / im.naturalWidth, h / im.naturalHeight)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, y, w, h)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Greedy word wrap; for Tamil (no spaces issue) it still splits on spaces. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.trim().split(/\s+/)
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

function photoFrame(ctx: CanvasRenderingContext2D, im: HTMLImageElement | null, x: number, y: number, w: number, h: number, label: string) {
  ctx.save()
  ctx.shadowColor = 'rgba(255,190,80,0.45)'
  ctx.shadowBlur = 36
  roundRect(ctx, x - 10, y - 10, w + 20, h + 20, 16)
  ctx.fillStyle = '#120a04'
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundRect(ctx, x, y, w, h, 10)
  ctx.clip()
  ctx.fillStyle = '#1d130a'
  ctx.fillRect(x, y, w, h)
  if (im) coverDraw(ctx, im, x, y, w, h)
  ctx.restore()
  ctx.lineWidth = 5
  ctx.strokeStyle = GOLD
  roundRect(ctx, x, y, w, h, 10)
  ctx.stroke()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(220,177,92,0.6)'
  roundRect(ctx, x - 10, y - 10, w + 20, h + 20, 16)
  ctx.stroke()
  ctx.fillStyle = GOLD
  ctx.font = '30px Marcellus, serif'
  ctx.letterSpacing = '6px'
  ctx.textAlign = 'center'
  ctx.fillText(label.toUpperCase(), x + w / 2, y + h + 58)
  ctx.letterSpacing = '0px'
}

function cornerOrnament(ctx: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(sx, sy)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 90)
  ctx.lineTo(0, 0)
  ctx.lineTo(90, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(22, 22, 9, 0, Math.PI * 2)
  ctx.fillStyle = GOLD
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(14, 60)
  ctx.quadraticCurveTo(14, 14, 60, 14)
  ctx.stroke()
  ctx.restore()
}

export async function renderCard(input: CardInput): Promise<string> {
  await document.fonts.ready
  // Make sure the faces we draw with are actually loaded before measuring text.
  await Promise.all([
    document.fonts.load('150px "Berkshire Swash"'),
    document.fonts.load('40px Marcellus'),
    document.fonts.load('40px "Noto Serif Tamil"'),
  ]).catch(() => undefined)

  const [face, palm, frame] = await Promise.all([
    input.facePhoto ? load(input.facePhoto) : Promise.resolve(null),
    input.palmArt ? load(input.palmArt) : Promise.resolve(null),
    input.frameUrl ? load(input.frameUrl) : Promise.resolve(null),
  ])

  const c = document.createElement('canvas')
  c.width = CARD.w
  c.height = CARD.h
  const ctx = c.getContext('2d')!
  const { w: W, h: H } = CARD

  // Client's own design. If its artwork can't be loaded (never downloaded + offline), the
  // standard design below is printed instead of photos floating on a blank card.
  if (input.layout && !frame) console.warn('[print] card artwork unavailable (never downloaded and offline?) — printing the standard design')
  if (input.layout && frame) {
    await ensureCardFonts()
    drawLayoutCard(ctx, input.layout, {
      frame,
      face,
      palm,
      fortune: input.fortune,
      language: input.language === 'ta' ? 'ta' : 'en',
      sessionId: input.sessionId,
      dateLabel: input.dateLabel,
    })
    return c.toDataURL('image/jpeg', 0.95)
  }

  // Background
  if (frame) {
    coverDraw(ctx, frame, 0, 0, W, H)
  } else {
    const g = ctx.createRadialGradient(W / 2, H * 0.3, 80, W / 2, H * 0.45, H * 0.8)
    g.addColorStop(0, '#3a2412')
    g.addColorStop(0.55, '#1c1108')
    g.addColorStop(1, '#0c0703')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    // faint temple arches
    ctx.strokeStyle = 'rgba(220,177,92,0.07)'
    ctx.lineWidth = 2
    for (let i = 0; i < 6; i++) {
      ctx.beginPath()
      ctx.arc(W / 2, 560, 300 + i * 90, Math.PI, 0)
      ctx.stroke()
    }
    // borders
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 5
    ctx.strokeRect(54, 54, W - 108, H - 108)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(220,177,92,0.6)'
    ctx.strokeRect(72, 72, W - 144, H - 144)
    cornerOrnament(ctx, 72, 72, 1, 1)
    cornerOrnament(ctx, W - 72, 72, -1, 1)
    cornerOrnament(ctx, 72, H - 72, 1, -1)
    cornerOrnament(ctx, W - 72, H - 72, -1, -1)
  }

  // Header
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.save()
  ctx.shadowColor = 'rgba(255,200,90,0.55)'
  ctx.shadowBlur = 30
  ctx.fillStyle = GOLD_HI
  ctx.font = '150px "Berkshire Swash", serif'
  ctx.fillText('Kuri', W / 2, 250)
  ctx.restore()
  ctx.fillStyle = GOLD
  ctx.font = '36px Marcellus, serif'
  ctx.letterSpacing = '14px'
  ctx.fillText('THE DIGITAL ORACLE', W / 2 + 7, 318)
  ctx.letterSpacing = '0px'

  // Photos
  const top = 400
  if (face) {
    photoFrame(ctx, face, 130, top, 440, 590, 'The Seeker')
    photoFrame(ctx, palm, 630, top, 440, 590, 'Lines of Fate')
  } else {
    photoFrame(ctx, palm, 300, top, 600, 590, 'Lines of Fate')
  }

  // Fortune
  const box = { x: 140, y: 1100, w: W - 280, h: 430 }
  const ta = input.language === 'ta'
  let size = ta ? 44 : 52
  let lines: string[] = []
  for (; size >= 30; size -= 2) {
    ctx.font = ta ? `${size}px "Noto Serif Tamil", serif` : `${size}px Marcellus, serif`
    lines = wrapLines(ctx, input.fortune, box.w)
    if (lines.length * size * (ta ? 1.6 : 1.38) <= box.h) break
  }
  const lh = size * (ta ? 1.6 : 1.38)
  const startY = box.y + (box.h - lines.length * lh) / 2 + size
  ctx.fillStyle = CREAM
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * lh))
  ctx.fillStyle = GOLD
  ctx.font = '120px "Berkshire Swash", serif'
  ctx.fillText('“', box.x + 10, box.y + 70)
  ctx.fillText('”', box.x + box.w - 10, box.y + box.h + 30)

  // Footer
  ctx.strokeStyle = 'rgba(220,177,92,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(130, 1590)
  ctx.lineTo(W - 130, 1590)
  ctx.stroke()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#b8955a'
  ctx.font = '26px Marcellus, serif'
  ctx.letterSpacing = '5px'
  ctx.fillText('READING', 130, 1640)
  ctx.textAlign = 'right'
  ctx.fillText(input.dateLabel.toUpperCase(), W - 130, 1640)
  ctx.letterSpacing = '0px'
  ctx.fillStyle = GOLD_HI
  ctx.font = '40px Marcellus, serif'
  ctx.textAlign = 'left'
  ctx.fillText(`#${input.sessionId}`, 130, 1692)
  ctx.textAlign = 'right'
  ctx.font = '34px Marcellus, serif'
  let footer = input.footer
  while (ctx.measureText(footer).width > 560 && footer.length > 4) footer = footer.slice(0, -2)
  if (footer !== input.footer) footer = footer.trimEnd() + '…'
  ctx.fillText(footer, W - 130, 1692)

  return c.toDataURL('image/jpeg', 0.95)
}
