// Used when the AI is unreachable (hall Wi-Fi down, quota hit, timeout).
// Same tone rules as the AI prompt: warm, mystical, two sentences, never negative.
export const fallbackFortunes = {
  general: [
    'Your palm carries the mark of a steady flame. What you begin this season will outlast the doubts of others and bring quiet pride to your house.',
    'The line of your heart runs deep and unbroken. A kindness you gave long ago is returning to you, larger than you remember giving it.',
    'Your head line bends toward the moon, the sign of a mind that sees what others miss. Trust the idea you keep returning to; its hour has come.',
    'I see a crossing of paths beneath your fingers. A meeting in the coming months will open a door you did not know was there.',
    'Your hand is the hand of a builder. Stone by stone, the life you are shaping will become a temple others come to for shelter.',
    'The stars gathered at the base of your thumb speak of fortune that arrives slowly and stays. Be patient; the harvest is already growing.',
    'Your fate line rises clear and strong. The road ahead asks for courage once, and rewards it many times over.',
    'There is music in your palm, a gift for bringing people together. Where you go, celebrations follow.',
  ],
  love: [
    'Your heart line curves like a river finding the sea. A bond in your life is about to deepen into something that will carry you both for years.',
    'I see two lines meeting near your smallest finger. Love that is patient is walking toward you, and it already knows your name.',
  ],
  career: [
    'Your line of Saturn climbs without breaking. Recognition for your work is closer than it looks, and it will come from an unexpected voice.',
    'The mount beneath your first finger is strong, the mark of a leader. Step forward when the moment asks; others are waiting to follow.',
  ],
  wealth: [
    'Small branches rise from your fate line like new leaves. Many small gains are gathering into one great harvest.',
    'Your palm holds the triangle of plenty. Guard what you earn this year and it will multiply beyond your plans.',
  ],
  ta: [
    'உங்கள் உள்ளங்கையில் உறுதியான தீபத்தின் அடையாளம் தெரிகிறது. இந்தப் பருவத்தில் நீங்கள் தொடங்குவது நீண்ட காலம் நிலைத்து உங்கள் குடும்பத்திற்குப் பெருமை சேர்க்கும்.',
    'உங்கள் இதய ரேகை ஆழமாகவும் தடையின்றியும் ஓடுகிறது. நீங்கள் முன்பு செய்த நன்மை பல மடங்காக உங்களிடம் திரும்பி வருகிறது.',
    'உங்கள் விதி ரேகை தெளிவாக உயர்கிறது. வரும் பாதை ஒருமுறை துணிவைக் கேட்கும்; அதற்குப் பலமுறை பலன் தரும்.',
  ],
};

export function pickFallback({ theme = 'general', language = 'en', extra = [] } = {}) {
  if (language === 'ta') {
    const pool = fallbackFortunes.ta;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const pool = [...(extra || []), ...(fallbackFortunes[theme] || []), ...fallbackFortunes.general];
  return pool[Math.floor(Math.random() * pool.length)];
}
