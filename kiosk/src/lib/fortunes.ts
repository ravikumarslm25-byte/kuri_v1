import type { Language } from '../config/settings'

// On-device fallback for when the kiosk cannot reach the server at all.
const EN = [
  'Your palm carries the mark of a steady flame. What you begin this season will outlast the doubts of others and bring quiet pride to your house.',
  'The line of your heart runs deep and unbroken. A kindness you gave long ago is returning to you, larger than you remember giving it.',
  'Your head line bends toward the moon, the sign of a mind that sees what others miss. Trust the idea you keep returning to; its hour has come.',
  'I see a crossing of paths beneath your fingers. A meeting in the coming months will open a door you did not know was there.',
  'Your fate line rises clear and strong. The road ahead asks for courage once, and rewards it many times over.',
  'There is music in your palm, a gift for bringing people together. Where you go, celebrations follow.',
]
const TA = [
  'உங்கள் உள்ளங்கையில் உறுதியான தீபத்தின் அடையாளம் தெரிகிறது. இந்தப் பருவத்தில் நீங்கள் தொடங்குவது நீண்ட காலம் நிலைத்து உங்கள் குடும்பத்திற்குப் பெருமை சேர்க்கும்.',
  'உங்கள் விதி ரேகை தெளிவாக உயர்கிறது. வரும் பாதை ஒருமுறை துணிவைக் கேட்கும்; அதற்குப் பலமுறை பலன் தரும்.',
]

export function localFortune(lang: Language): string {
  const pool = lang === 'ta' ? TA : EN
  return pool[Math.floor(Math.random() * pool.length)]
}
