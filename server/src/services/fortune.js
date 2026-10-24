import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config.js';
import { pickFallback } from '../data/fallbackFortunes.js';

let client = null;
function getClient() {
  if (!config.gemini.apiKey) return null;
  if (!client) client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  return client;
}

const THEME_HINTS = {
  general: 'Speak to their overall path: purpose, prosperity and the people around them.',
  love: 'Lean toward love, friendship and the bonds of the heart.',
  career: 'Lean toward work, ambition, recognition and new opportunities.',
  wealth: 'Lean toward abundance, good fortune and wise choices.',
  health: 'Lean toward energy, balance and inner strength (never mention illness).',
};

export function buildPrompt({ theme = 'general', language = 'en', promptHint = '' }) {
  const lang =
    language === 'ta'
      ? 'Write the fortune in Tamil (தமிழ்), in simple modern Tamil that a general audience reads easily.'
      : 'Write the fortune in English.';
  return [
    "You are Kurathi, the wise palm reader of the Tamil 'Kuri' tradition, speaking at a celebration.",
    'You are shown a photo of a guest\'s open palm. Look at its lines (heart line, head line, life line, fate line) and the shape of the hand, and give a fortune inspired by what you see.',
    'Rules:',
    '- Exactly two sentences, at most 45 words in total.',
    '- Warm, mystical, uplifting and specific to the palm; mention one palm feature by name.',
    '- Never predict death, illness, accidents, divorce, money loss or anything frightening.',
    '- Never guess or mention age, gender, caste, religion, appearance or skin colour.',
    '- No guarantees about exams, jobs, medical or financial outcomes; speak in imagery, not promises.',
    '- Suitable for all ages and for a corporate event.',
    THEME_HINTS[theme] || THEME_HINTS.general,
    promptHint ? `Event note: ${promptHint}` : '',
    lang,
    'If the image does not clearly show a palm, still give a gentle general fortune.',
  ]
    .filter(Boolean)
    .join('\n');
}

function splitDataUrl(dataUrl) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

function withTimeout(promise, ms, controller) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => {
      controller?.abort();
      reject(new Error(`AI timeout after ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

/**
 * Generate a fortune from a palm image. Never throws: on any failure it returns
 * an offline line so the guest always gets a reading.
 * @returns {{ fortune: string, source: 'ai'|'fallback', error?: string }}
 */
export async function generateFortune({ palmImage, theme = 'general', language = 'en', promptHint = '', fallbackPool = [] }) {
  const fallback = (error) => ({ fortune: pickFallback({ theme, language, extra: fallbackPool }), source: 'fallback', error });

  const ai = getClient();
  if (!ai) return fallback('AI not configured');
  const img = splitDataUrl(palmImage);
  if (!img) return fallback('No palm image');

  const controller = new AbortController();
  try {
    const res = await withTimeout(
      ai.models.generateContent({
        model: config.gemini.model,
        contents: [{ role: 'user', parts: [{ text: buildPrompt({ theme, language, promptHint }) }, { inlineData: img }] }],
        config: {
          temperature: 0.9,
          maxOutputTokens: 400,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: { fortune: { type: Type.STRING } },
            required: ['fortune'],
          },
          abortSignal: controller.signal,
        },
      }),
      config.gemini.timeoutMs,
      controller,
    );
    const parsed = JSON.parse(res.text || '{}');
    const fortune = String(parsed.fortune || '').trim();
    if (fortune.length < 20 || fortune.length > 600) return fallback('AI returned unusable text');
    return { fortune, source: 'ai' };
  } catch (err) {
    return fallback(err?.message || 'AI error');
  }
}
