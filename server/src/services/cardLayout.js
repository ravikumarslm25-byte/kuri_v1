// Card layout = where the kiosk prints the face photo, palm photo and fortune on a template's
// artwork. Units are pixels on the 4x6" card at 300 dpi (1200 x 1800, portrait).
// The admin layout editor writes it; the kiosk renderer (kiosk/src/lib/print/cardLayout.ts) reads it.
import { httpError } from './http.js';

export const CARD_W = 1200;
export const CARD_H = 1800;
const MIN_BOX = 40;

const SHAPES = ['rect', 'rounded', 'circle'];
const FONTS = ['Marcellus', 'Poppins', 'Berkshire Swash'];
const ALIGNS = ['left', 'center', 'right'];
const HEX = /^#[0-9a-f]{6}$/i;

const num = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Keeps a box inside the card and at least MIN_BOX in each direction. */
function box(raw, d) {
  const w = clamp(num(raw?.w, d.w), MIN_BOX, CARD_W);
  const h = clamp(num(raw?.h, d.h), MIN_BOX, CARD_H);
  return { x: clamp(num(raw?.x, d.x), 0, CARD_W - w), y: clamp(num(raw?.y, d.y), 0, CARD_H - h), w, h };
}

function photo(raw, d) {
  return {
    ...box(raw, d),
    enabled: raw?.enabled === undefined ? d.enabled : !!raw.enabled,
    shape: SHAPES.includes(raw?.shape) ? raw.shape : d.shape,
    borderColor: HEX.test(String(raw?.borderColor || '')) ? raw.borderColor : d.borderColor,
    borderWidth: clamp(num(raw?.borderWidth, d.borderWidth), 0, 40),
  };
}

function text(raw, d) {
  return {
    ...box(raw, d),
    enabled: raw?.enabled === undefined ? d.enabled : !!raw.enabled,
    color: HEX.test(String(raw?.color || '')) ? raw.color : d.color,
    font: FONTS.includes(raw?.font) ? raw.font : d.font,
    align: ALIGNS.includes(raw?.align) ? raw.align : d.align,
    maxSize: clamp(num(raw?.maxSize, d.maxSize), 16, 160),
  };
}

/** Same values as DEFAULT_LAYOUT in kiosk/src/lib/print/cardLayout.ts. */
export const DEFAULT_LAYOUT = {
  version: 1,
  face: { x: 130, y: 400, w: 440, h: 590, enabled: true, shape: 'rounded', borderColor: '#dcb15c', borderWidth: 6 },
  palm: { x: 630, y: 400, w: 440, h: 590, enabled: true, shape: 'rounded', borderColor: '#dcb15c', borderWidth: 6 },
  fortune: { x: 140, y: 1100, w: 920, h: 430, enabled: true, color: '#fff1d2', font: 'Marcellus', align: 'center', maxSize: 56 },
  meta: { x: 130, y: 1620, w: 940, h: 70, enabled: false, color: '#dcb15c', font: 'Marcellus', align: 'center', maxSize: 34 },
};

/** Validates + normalises a layout from the admin. null/'' clears it (kiosk prints the standard design). */
export function cleanLayout(raw) {
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw httpError(400, 'cardLayout must be an object');
  const d = DEFAULT_LAYOUT;
  const out = {
    version: 1,
    face: photo(raw.face, d.face),
    palm: photo(raw.palm, d.palm),
    fortune: text(raw.fortune, d.fortune),
    meta: text(raw.meta, d.meta),
  };
  // The fortune is the point of the card: it can't be switched off.
  out.fortune.enabled = true;
  if (out.fortune.w < 200 || out.fortune.h < 120) throw httpError(400, 'The fortune box must be at least 200 × 120 px so the message fits');
  return out;
}
