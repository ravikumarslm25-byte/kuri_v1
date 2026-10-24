/**
 * Palm image pipeline (runs in the kiosk browser, no network):
 *   1. align  – rotate so the fingers point up, crop square around the hand
 *   2. enhance – CLAHE on luminance (keeps natural skin colour) + unsharp mask, so creases pop
 *   3. lines   – place heart / head / life / fate lines from the hand landmarks, then snap
 *                each one onto the darkest real crease nearby
 *   4. art     – enhanced palm + glowing gold destiny lines (for the screen, card and print)
 */
import type { Pt } from '../hand/analyze'

export const OUT = 1024 // output square size

export interface DestinyLine {
  name: 'heart' | 'head' | 'life' | 'fate'
  /** Polyline in output-image coords normalised 0..1. */
  points: Pt[]
}

export interface PalmResult {
  enhanced: string // dataURL, clean (sent to the AI and stored)
  art: string // dataURL, with gold destiny lines (shown + printed)
  lines: DestinyLine[]
}

// ---------------------------------------------------------------- geometry

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const len = (a: Pt) => Math.hypot(a.x, a.y)

/** Similarity transform that puts the hand upright, centred, filling ~80% of OUT. */
export function alignTransform(lm: Pt[], srcSize: number) {
  const P = lm.map((p) => mul(p, srcSize))
  const up = sub(P[9], P[0]) // wrist -> middle MCP
  const angle = Math.atan2(up.y, up.x) + Math.PI / 2 // rotate so `up` points to -y
  const cos = Math.cos(-angle)
  const sin = Math.sin(-angle)
  const rot = (p: Pt): Pt => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos })
  const R = P.map(rot)
  const xs = R.map((p) => p.x)
  const ys = R.map((p) => p.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.22
  const scale = OUT / side
  const map = (p: Pt): Pt => {
    const r = rot(mul(p, srcSize))
    return { x: (r.x - cx) * scale + OUT / 2, y: (r.y - cy) * scale + OUT / 2 }
  }
  return { angle, scale, cx, cy, map }
}

/**
 * Traditional line positions (palmistry charts) built from hand landmarks.
 * 0 wrist · 1 thumb CMC · 2 thumb MCP · 5 index MCP · 9 middle MCP · 13 ring MCP · 17 pinky MCP
 */
export function lineTemplates(A: Pt[]): Record<DestinyLine['name'], Pt[]> {
  const W = A[0]
  const T1 = A[1]
  const T2 = A[2]
  const I = A[5]
  const M = A[9]
  const R = A[13]
  const Pk = A[17]
  const down = sub(W, M) // knuckles -> wrist
  const edge = add(Pk, mul(sub(Pk, R), 0.55)) // outer palm edge beside the pinky
  const web = add(lerp(I, T2, 0.3), mul(down, 0.1)) // between thumb and index
  const centre = lerp(M, W, 0.42)
  const thumbBase = lerp(W, T1, 0.45)
  return {
    heart: [add(edge, mul(down, 0.12)), add(lerp(R, M, 0.3), mul(down, 0.17)), add(lerp(M, I, 0.3), mul(down, 0.13)), add(lerp(M, I, 0.55), mul(down, 0.05))],
    head: [web, add(lerp(web, centre, 0.55), mul(down, 0.02)), add(lerp(centre, edge, 0.35), mul(down, 0.12)), add(lerp(centre, edge, 0.75), mul(down, 0.2))],
    life: [web, add(lerp(web, centre, 0.35), mul(down, 0.18)), lerp(lerp(I, W, 0.62), T1, 0.12), add(thumbBase, mul(sub(centre, thumbBase), 0.15))],
    fate: [lerp(W, M, 0.12), lerp(W, M, 0.34), add(lerp(W, M, 0.52), mul(sub(R, M), 0.05)), add(lerp(W, M, 0.74), mul(sub(R, M), 0.1))],
  }
}

/** Catmull-Rom through control points, `n` samples. */
export function spline(ctrl: Pt[], n = 48): Pt[] {
  const pts: Pt[] = []
  const c = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]]
  const segs = ctrl.length - 1
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * segs
    const s = Math.min(Math.floor(t), segs - 1)
    const u = t - s
    const [p0, p1, p2, p3] = [c[s], c[s + 1], c[s + 2], c[s + 3]]
    const u2 = u * u
    const u3 = u2 * u
    const f = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * u + (2 * a - 5 * b + 4 * cc - d) * u2 + (-a + 3 * b - 3 * cc + d) * u3)
    pts.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) })
  }
  return pts
}

// ---------------------------------------------------------------- image ops

/** CLAHE on an 8-bit channel (in place). tiles x tiles grid, clip = multiple of mean bin height. */
export function clahe(L: Uint8ClampedArray, w: number, h: number, tiles = 8, clip = 2.6) {
  const tw = w / tiles
  const th = h / tiles
  const maps: Uint8Array[] = []
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const x0 = Math.floor(tx * tw)
      const x1 = Math.floor((tx + 1) * tw)
      const y0 = Math.floor(ty * th)
      const y1 = Math.floor((ty + 1) * th)
      const hist = new Uint32Array(256)
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[L[y * w + x]]++
      const n = (x1 - x0) * (y1 - y0)
      const limit = Math.max(1, Math.floor((clip * n) / 256))
      let excess = 0
      for (let i = 0; i < 256; i++) if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit }
      const add1 = Math.floor(excess / 256)
      let rem = excess - add1 * 256
      for (let i = 0; i < 256; i++) { hist[i] += add1; if (rem > 0) { hist[i]++; rem-- } }
      const map = new Uint8Array(256)
      let cdf = 0
      for (let i = 0; i < 256; i++) { cdf += hist[i]; map[i] = Math.min(255, Math.round((cdf * 255) / n)) }
      maps.push(map)
    }
  }
  const out = new Uint8ClampedArray(L.length)
  for (let y = 0; y < h; y++) {
    const gy = Math.min(Math.max(y / th - 0.5, 0), tiles - 1)
    const y0 = Math.floor(gy)
    const y1 = Math.min(y0 + 1, tiles - 1)
    const fy = gy - y0
    for (let x = 0; x < w; x++) {
      const gx = Math.min(Math.max(x / tw - 0.5, 0), tiles - 1)
      const x0 = Math.floor(gx)
      const x1 = Math.min(x0 + 1, tiles - 1)
      const fx = gx - x0
      const v = L[y * w + x]
      const a = maps[y0 * tiles + x0][v]
      const b = maps[y0 * tiles + x1][v]
      const c = maps[y1 * tiles + x0][v]
      const d = maps[y1 * tiles + x1][v]
      out[y * w + x] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
    }
  }
  L.set(out)
}

/** Separable box blur (3 passes ≈ gaussian). Returns a new Float32Array. */
export function blur(src: ArrayLike<number>, w: number, h: number, r: number): Float32Array {
  const a = Float32Array.from(src)
  const b = new Float32Array(a.length)
  const k = 2 * r + 1
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let s = 0
      const row = y * w
      for (let x = -r; x <= r; x++) s += a[row + Math.min(w - 1, Math.max(0, x))]
      for (let x = 0; x < w; x++) {
        b[row + x] = s / k
        s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x]
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / k
        s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]
      }
    }
  }
  return a
}

// ---------------------------------------------------------------- line snapping

/**
 * Moves each line's control points (independently, along the palm's "up" axis) to sit on
 * real creases: creases are darker than their surroundings, so we maximise
 * valley = blur(L) - L along the curve, with a small penalty for straying from the template.
 */
export function snapLine(ctrl: Pt[], valley: Float32Array, w: number, h: number, step: number, steps = 4): Pt[] {
  const sample = (pts: Pt[]) => {
    let s = 0
    let n = 0
    for (const p of pts) {
      const x = Math.round(p.x)
      const y = Math.round(p.y)
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      s += valley[y * w + x]
      n++
    }
    return n ? s / n : -Infinity
  }
  // Normal of the whole template (perpendicular to start→end).
  const dir = sub(ctrl[ctrl.length - 1], ctrl[0])
  const nrm = mul({ x: -dir.y, y: dir.x }, 1 / (len(dir) || 1))
  const offsets = Array.from({ length: steps * 2 + 1 }, (_, i) => (i - steps) * step)
  let best = ctrl
  let bestCost = -Infinity
  // Endpoints share one offset (keeps the line anchored), the two inner points move freely.
  for (const oe of offsets)
    for (const o1 of offsets)
      for (const o2 of offsets) {
        const os = [oe, o1, o2, oe]
        const cand = ctrl.map((p, i) => add(p, mul(nrm, os[i] ?? oe)))
        const penalty = (Math.abs(oe) + Math.abs(o1 - oe) + Math.abs(o2 - oe) + Math.abs(o1 - o2)) / (step * steps)
        const cost = sample(spline(cand, 32)) - penalty * 0.6
        if (cost > bestCost) {
          bestCost = cost
          best = cand
        }
      }
  // Keep the template unless the snapped curve is clearly on a crease (valley is z-scored).
  return bestCost - sample(spline(ctrl, 32)) > 0.25 ? best : ctrl
}

/** Normalise to z-scores (in place) so penalties mean the same on every photo. */
function zscore(a: Float32Array) {
  let m = 0
  for (let i = 0; i < a.length; i++) m += a[i]
  m /= a.length
  let v = 0
  for (let i = 0; i < a.length; i++) v += (a[i] - m) ** 2
  const sd = Math.sqrt(v / a.length) || 1
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - m) / sd
}

// ---------------------------------------------------------------- main

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })
}

/**
 * @param src  square palm capture (dataURL / URL)
 * @param lm   21 hand landmarks in that square's 0..1 coords
 */
export async function processPalm(src: string, lm: Pt[]): Promise<PalmResult> {
  const img = await loadImage(src)
  const size = img.naturalWidth
  const T = alignTransform(lm, size)

  // 1. align + crop
  const c = document.createElement('canvas')
  c.width = c.height = OUT
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, OUT, OUT)
  ctx.translate(OUT / 2, OUT / 2)
  ctx.scale(T.scale, T.scale)
  ctx.translate(-T.cx, -T.cy)
  ctx.rotate(-T.angle)
  ctx.drawImage(img, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  // 2. enhance luminance, keep chroma
  const data = ctx.getImageData(0, 0, OUT, OUT)
  const px = data.data
  const n = OUT * OUT
  const L = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) L[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
  const L0 = Float32Array.from(L)
  clahe(L, OUT, OUT, 6, 1.8)
  const soft = blur(L, OUT, OUT, 2)
  for (let i = 0; i < n; i++) {
    const eq = L0[i] * 0.35 + L[i] * 0.65 // blend: keep it photographic
    const sharp = Math.min(255, Math.max(0, eq + 0.45 * (eq - soft[i])))
    const k = L0[i] > 4 ? sharp / L0[i] : 1
    px[i * 4] = Math.min(255, px[i * 4] * k)
    px[i * 4 + 1] = Math.min(255, px[i * 4 + 1] * k)
    px[i * 4 + 2] = Math.min(255, px[i * 4 + 2] * k)
    L[i] = sharp
  }
  ctx.putImageData(data, 0, 0)
  const enhanced = c.toDataURL('image/jpeg', 0.92)

  // 3. destiny lines on real creases
  const A = lm.map(T.map)
  const palmLen = len(sub(A[9], A[0]))
  const valley = blur(L, OUT, OUT, Math.max(4, Math.round(palmLen / 40)))
  for (let i = 0; i < n; i++) valley[i] = valley[i] - L[i]
  zscore(valley)
  const tpl = lineTemplates(A)
  const lines: DestinyLine[] = (Object.keys(tpl) as DestinyLine['name'][]).map((name) => {
    const ctrl = tpl[name]
    const snapped = snapLine(ctrl, valley, OUT, OUT, palmLen * 0.016, 3)
    return { name, points: spline(snapped, 48).map((p) => ({ x: p.x / OUT, y: p.y / OUT })) }
  })

  // 4. art: soft vignette + glowing gold lines
  const g = ctx.createRadialGradient(OUT / 2, OUT / 2, OUT * 0.35, OUT / 2, OUT / 2, OUT * 0.72)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(8,4,0,0.55)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, OUT, OUT)
  const lw = Math.max(3, palmLen / 70)
  ctx.lineCap = 'round'
  // Tapered strokes: width and opacity fade toward both ends, like a brush.
  const taper = (t: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.6
  for (const pass of [
    { w: lw * 3.2, rgb: '255,170,60', a: 0.32, b: lw * 6 },
    { w: lw * 1.4, rgb: '255,214,120', a: 0.95, b: lw * 2.5 },
    { w: lw * 0.55, rgb: '255,250,225', a: 1, b: 0 },
  ]) {
    ctx.shadowColor = 'rgba(255,190,80,0.9)'
    ctx.shadowBlur = pass.b
    for (const ln of lines) {
      const pts = ln.points
      for (let i = 1; i < pts.length; i++) {
        const k = taper(i / (pts.length - 1))
        ctx.strokeStyle = `rgba(${pass.rgb},${(pass.a * (0.25 + 0.75 * k)).toFixed(3)})`
        ctx.lineWidth = pass.w * (0.35 + 0.65 * k)
        ctx.beginPath()
        ctx.moveTo(pts[i - 1].x * OUT, pts[i - 1].y * OUT)
        ctx.lineTo(pts[i].x * OUT, pts[i].y * OUT)
        ctx.stroke()
      }
    }
  }
  ctx.shadowBlur = 0
  const art = c.toDataURL('image/jpeg', 0.92)
  return { enhanced, art, lines }
}

/** Dev aid: template lines (before snapping) in output pixel coords. */
export function __debugTemplates(A: Pt[]) {
  return Object.fromEntries(Object.entries(lineTemplates(A)).map(([k, t]) => [k, spline(t, 32)]))
}
