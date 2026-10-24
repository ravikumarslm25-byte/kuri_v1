import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'

export const n = (v: number | null | undefined) => (v === null || v === undefined ? '–' : v.toLocaleString('en-IN'))

/** ₹3,45,390 · or compact ₹3.45L / ₹1.2Cr */
export function inr(v: number | null | undefined, compact = false) {
  if (v === null || v === undefined) return '–'
  if (compact) {
    if (v >= 1e7) return `₹${(v / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`
    if (v >= 1e5) return `₹${(v / 1e5).toFixed(2).replace(/\.?0+$/, '')}L`
  }
  return '₹' + Math.round(v).toLocaleString('en-IN')
}

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${v}%`)
export const signedPct = (v: number | null | undefined) => (v === null || v === undefined ? 'new' : `${v > 0 ? '+' : ''}${v}%`)

const d = (s: string | Date) => (typeof s === 'string' ? parseISO(s) : s)
export const date = (s?: string | null) => (s ? format(d(s), 'MMM d, yyyy') : '–')
export const dateShort = (s?: string | null) => (s ? format(d(s), 'MMM d') : '–')
export const dateTime = (s?: string | null) => (s ? format(d(s), 'MMM d, yyyy · h:mm a') : '–')
export const ago = (s?: string | null) => (s ? `${formatDistanceToNowStrict(d(s))} ago` : 'never')
export const range = (a: string, b: string) => {
  const A = d(a)
  const B = d(b)
  return A.getFullYear() === B.getFullYear() ? `${format(A, 'MMM d')} – ${format(B, 'MMM d, yyyy')}` : `${date(a)} – ${date(b)}`
}

/** <input type="date"> value (local date) */
export const inputDate = (s?: string | Date | null) => (s ? format(d(s), 'yyyy-MM-dd') : '')

export const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  event_manager: 'Event Manager',
  operations_manager: 'Operations Manager',
  support: 'Support Staff',
}

export const PERM_LABEL: Record<string, string> = {
  dashboard: 'Dashboard',
  events: 'Events',
  bookings: 'Bookings',
  machines: 'Machines',
  templates: 'Templates',
  sessions: 'Readings',
  team: 'Team',
  reports: 'Reports',
}

export const STEP_LABEL: Record<string, string> = {
  consent: 'Consent screen',
  face: 'Face photo',
  palm: 'Palm scan',
  result: 'Result',
  unknown: 'Unknown',
}
