import { useEffect, useState } from 'react'
import { CARD, drawLayoutCard, ensureCardFonts, loadImage, type CardLanguage, type CardLayout } from './cardLayout'
import { fileUrl } from './api'

export const SAMPLE_FORTUNES: {
  id: string
  label: string
  text: string
  language: CardLanguage
}[] = [
  {
    id: 'typical',
    label: 'Typical fortune (English)',
    language: 'en',
    text: 'Your heart line runs deep and unbroken. A kindness you gave long ago is returning to you, and this season opens a door you thought was closed.',
  },
  {
    id: 'longest',
    label: 'Longest fortune (45 words)',
    language: 'en',
    text: 'Your heart line runs deep and unbroken, and your fate line climbs strongly toward the mount of the sun. A kindness you gave long ago is returning to you, opening a door you once thought was closed, bringing respect, steady fortune and joyful days ahead.',
  },
  {
    id: 'tamil',
    label: 'Tamil fortune',
    language: 'ta',
    text: 'உங்கள் உள்ளங்கையில் உறுதியான தீபத்தின் அடையாளம் தெரிகிறது. இந்தப் பருவத்தில் நீங்கள் தொடங்குவது நீண்ட காலம் நிலைத்து உங்கள் குடும்பத்திற்குப் பெருமை சேர்க்கும்.',
  },
]

/** Artwork from the API with CORS (so the canvas can be exported); `&cors` avoids a non-CORS cached copy. */
export const loadArtwork = (url: string) => loadImage(fileUrl(url) + (url.includes('?') ? '&' : '?') + 'cors=1')

export interface Samples {
  face: HTMLImageElement | null
  palm: HTMLImageElement | null
}
let samplesP: Promise<Samples> | null = null
export function loadSamples(): Promise<Samples> {
  samplesP ??= Promise.all([loadImage(`${import.meta.env.BASE_URL}samples/face.jpg`), loadImage(`${import.meta.env.BASE_URL}samples/palm.jpg`), ensureCardFonts()]).then(([face, palm]) => ({ face, palm }))
  return samplesP
}

export function sampleDate() {
  return new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Renders a template's card with sample photos + fortune to a small data URL (for the template list). */
export function useCardPreview(artUrl: string, layout: CardLayout | null, width = 400) {
  const [src, setSrc] = useState('')
  const key = JSON.stringify(layout)
  useEffect(() => {
    let alive = true
    if (!artUrl || !layout) {
      setSrc('')
      return
    }
    ;(async () => {
      const [art, s] = await Promise.all([loadArtwork(artUrl), loadSamples()])
      if (!alive || !art) return
      const big = document.createElement('canvas')
      big.width = CARD.w
      big.height = CARD.h
      drawLayoutCard(big.getContext('2d')!, layout, {
        frame: art,
        face: s.face,
        palm: s.palm,
        fortune: SAMPLE_FORTUNES[0].text,
        language: 'en',
        sessionId: 'K7X2M9',
        dateLabel: sampleDate(),
      })
      const small = document.createElement('canvas')
      small.width = width
      small.height = Math.round((width * CARD.h) / CARD.w)
      const sc = small.getContext('2d')!
      sc.imageSmoothingQuality = 'high'
      sc.drawImage(big, 0, 0, small.width, small.height)
      if (alive) setSrc(small.toDataURL('image/jpeg', 0.85))
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artUrl, key, width])
  return src
}
