/**
 * Keeps the template's card artwork on the kiosk (browser Cache Storage), so cards still print
 * with the client's design when the venue Wi-Fi drops. The URL carries ?v=<updated time>, so a
 * new upload is a new URL and is fetched fresh; older versions are pruned.
 */
const CACHE = 'kuri-card-art'
let current: { url: string; objectUrl: string } | null = null

async function openCache(): Promise<Cache | null> {
  try {
    return 'caches' in window ? await caches.open(CACHE) : null
  } catch {
    return null
  }
}

/** Returns a local object URL for the artwork (cache first, then network), or null if neither has it. */
export async function artworkSrc(url: string): Promise<string | null> {
  if (current?.url === url) return current.objectUrl
  const cache = await openCache()
  let blob: Blob | null = null
  try {
    const hit = await cache?.match(url)
    if (hit) blob = await hit.blob()
  } catch {
    /* ignore */
  }
  if (!blob) {
    try {
      const r = await fetch(url, { mode: 'cors', cache: 'no-store' })
      if (r.ok) {
        blob = await r.clone().blob()
        if (cache) {
          await cache.put(url, r)
          // keep only this version of this template's artwork
          const base = url.split('?')[0]
          for (const req of await cache.keys()) if (req.url.split('?')[0] === base && req.url !== new URL(url, location.href).href) await cache.delete(req)
        }
      }
    } catch {
      /* offline: fall through */
    }
  }
  if (!blob) {
    // Offline and this exact version was never downloaded: an older version beats no artwork.
    try {
      const old = await cache?.match(url, { ignoreSearch: true })
      if (old) blob = await old.blob()
    } catch {
      /* ignore */
    }
  }
  if (!blob) return null
  if (current) URL.revokeObjectURL(current.objectUrl)
  current = { url, objectUrl: URL.createObjectURL(blob) }
  return current.objectUrl
}
