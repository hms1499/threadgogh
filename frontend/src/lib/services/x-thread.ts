import { TONES, LENGTHS, LANGUAGE_CODES, PRICE_STX, PRICE_SBTC, type Tone, type LanguageCode } from '@/lib/config';
import { generateThread, generateHook, regenerateTweet } from '@/lib/generate-thread';
import type { ServiceDef, GenCtx, ValidateResult } from './types';

export type XThreadParams = { topic: string; tone: Tone; length: 5 | 8 | 12; language: LanguageCode };

function validate(raw: unknown): ValidateResult<XThreadParams> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const topic = typeof b.topic === 'string' ? b.topic.trim() : '';
  const tone = b.tone as Tone;
  const length = Number(b.length);
  const language = (LANGUAGE_CODES as readonly string[]).includes(b.language as string)
    ? (b.language as LanguageCode) : 'auto';
  if (!topic || topic.length > 300) return { ok: false, error: 'topic is required (max 300 chars)' };
  if (!TONES.includes(tone) || !LENGTHS.includes(length as 5 | 8 | 12)) {
    return { ok: false, error: 'invalid tone or length' };
  }
  return { ok: true, params: { topic, tone, length: length as 5 | 8 | 12, language } };
}

export const xThreadService: ServiceDef<XThreadParams> = {
  id: 'x-thread',
  label: 'X Thread',
  blurb: 'Turn an idea into a ready-to-post X thread.',
  chained: true,
  priceStx: PRICE_STX,
  priceSbtc: PRICE_SBTC,
  fields: [
    { name: 'topic', type: 'text', label: 'Topic', placeholder: 'What is the thread about?', maxLen: 300, required: true },
    { name: 'tone', type: 'select', label: 'Tone', default: 'educational',
      options: TONES.map((t) => ({ value: t, label: t })) },
    { name: 'length', type: 'number', label: 'Length', default: 8, options: [...LENGTHS] },
    { name: 'language', type: 'select', label: 'Language', default: 'auto',
      options: [{ value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' },
        { value: 'es', label: 'Español' }, { value: 'fr', label: 'Français' }, { value: 'ja', label: '日本語' }, { value: 'zh', label: '中文' }] },
  ],
  validate,
  generatePreview: (p) => generateHook(p.topic, p.tone, p.language),
  generate: (p, ctx: GenCtx) =>
    generateThread(p.topic, p.tone, p.length, { firstTweet: ctx.previewHook, language: p.language }),
  regenerateOne: (p, thread, i) => regenerateTweet(p.topic, p.tone, thread, i, { language: p.language }),
};
