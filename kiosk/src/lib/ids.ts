// Session IDs like "K7M2-QX9P": short enough to print on the card and read aloud,
// no ambiguous characters (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newSessionId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const c = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length])
  return `${c.slice(0, 4).join('')}-${c.slice(4).join('')}`
}
