import mongoose from 'mongoose';

/** Wrap async route handlers so errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export function oid(id, what = 'id') {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, `Invalid ${what}`);
  return new mongoose.Types.ObjectId(String(id));
}

export function pageParams(q, maxLimit = 100) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(q.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

/** Parse YYYY-MM-DD or ISO. `endOfDay` makes a bare date inclusive of the whole day (IST). */
export function parseDate(v, { endOfDay = false } = {}) {
  if (!v) return undefined;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:30`);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw httpError(400, `Invalid date: ${s}`);
  return d;
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body?.[f] === undefined || body?.[f] === null || body?.[f] === '');
  if (missing.length) throw httpError(400, `Missing: ${missing.join(', ')}`);
}

/** Copy only allowed keys from the request body. */
export function pick(body, keys) {
  const out = {};
  for (const k of keys) if (body?.[k] !== undefined) out[k] = body[k];
  return out;
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v === undefined || v === null ? '' : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))].join('\n');
}

/** YYYY-MM-DD and hour in the business time zone. */
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false });
export const istDay = (d) => dayFmt.format(d);
export const istHour = (d) => Number(hourFmt.format(d)) % 24;
