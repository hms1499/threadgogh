import { TONES, LENGTHS, LANGUAGE_CODES, PRICE_STX, PRICE_SBTC, type Tone, type LanguageCode } from '@/lib/config';
import {
  resolveLlmConfig, assertApiKey, callLlm, parseThreadJson, parseHook, languageInstruction,
} from '@/lib/generate-thread';
import type { ServiceDef, GenCtx, ValidateResult } from './types';

export type RepurposeParams = { sourceText: string; tone: Tone; length: 5 | 8 | 12; language: LanguageCode };

const TONE_GUIDE: Record<Tone, string> = {
  educational: 'clear, informative, expert but approachable tone',
  funny: 'witty, meme-aware humor, still delivers real substance',
  threadboi: 'punchy growth-hacker style, bold hooks, strategic emoji (incl. 🧵)',
};

export function buildRepurposeSystem(length: number, language: LanguageCode): string {
  return [
    'You are an expert X (Twitter) thread writer.',
    'You are given a long source text. Distill it into a thread that captures its key points.',
    'Return ONLY a JSON object of the form {"tweets": ["...", "..."]} — one string per tweet.',
    'No markdown fences, no commentary, no numbering prefixes.',
    'Tweet 1 must be a strong hook. The last tweet wraps up with a takeaway or CTA.',
    `Write about ${length} tweets. Each tweet must be under 270 characters.`,
    languageInstruction(language),
  ].join(' ');
}

function validate(raw: unknown): ValidateResult<RepurposeParams> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const sourceText = typeof b.sourceText === 'string' ? b.sourceText.trim() : '';
  const tone = b.tone as Tone;
  const length = Number(b.length);
  const language = (LANGUAGE_CODES as readonly string[]).includes(b.language as string)
    ? (b.language as LanguageCode) : 'auto';
  if (!sourceText || sourceText.length > 4000) return { ok: false, error: 'sourceText is required (max 4000 chars)' };
  if (!TONES.includes(tone) || !LENGTHS.includes(length as 5 | 8 | 12)) {
    return { ok: false, error: 'invalid tone or length' };
  }
  return { ok: true, params: { sourceText, tone, length: length as 5 | 8 | 12, language } };
}

async function generate(p: RepurposeParams, ctx: GenCtx): Promise<string[]> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const head = ctx.previewHook && ctx.previewHook.trim() !== '' ? [ctx.previewHook] : [];
  const want = head.length ? p.length - 1 : p.length;
  const system = buildRepurposeSystem(want, p.language);
  const user = `Source text:\n${p.sourceText}\nStyle: ${TONE_GUIDE[p.tone]}`;
  const rest = parseThreadJson(await callLlm(config, system, user));
  return [...head, ...rest].slice(0, p.length);
}

async function generatePreview(p: RepurposeParams): Promise<string | null> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const system = [
    'You are an expert X (Twitter) thread writer.',
    'Read the source text and return ONLY {"tweet": "..."} — a single scroll-stopping hook tweet for a thread that summarizes it.',
    'Under 270 characters. No fences, no commentary.',
    languageInstruction(p.language),
  ].join(' ');
  return parseHook(await callLlm(config, system, `Source text:\n${p.sourceText}\nStyle: ${TONE_GUIDE[p.tone]}`));
}

async function regenerateOne(p: RepurposeParams, thread: string[], i: number): Promise<string> {
  const config = resolveLlmConfig(process.env);
  assertApiKey(config);
  const system = [
    'You are an expert X (Twitter) thread writer.',
    'You are given a thread distilled from a source text and the 1-based position of ONE tweet to rewrite.',
    'Return ONLY {"tweet": "..."} — just the rewritten tweet. Keep the others as-is.',
    'Under 270 characters. No numbering prefixes, no commentary, no fences.',
    languageInstruction(p.language),
  ].join(' ');
  const numbered = thread.map((t, idx) => `${idx + 1}. ${t}`).join('\n');
  const user = `Source text:\n${p.sourceText}\nStyle: ${TONE_GUIDE[p.tone]}\nThread:\n${numbered}\n\nRewrite tweet number ${i + 1}.`;
  return parseHook(await callLlm(config, system, user));
}

export const repurposeThreadService: ServiceDef<RepurposeParams> = {
  id: 'repurpose-thread',
  label: 'Repurpose → Thread',
  blurb: 'Paste an article or notes; get a distilled X thread.',
  chained: true,
  priceStx: PRICE_STX,
  priceSbtc: PRICE_SBTC,
  fields: [
    { name: 'sourceText', type: 'textarea', label: 'Source text', placeholder: 'Paste the article or notes…', maxLen: 4000, required: true },
    { name: 'tone', type: 'select', label: 'Tone', default: 'educational', options: TONES.map((t) => ({ value: t, label: t })) },
    { name: 'length', type: 'number', label: 'Length', default: 8, options: [...LENGTHS] },
    { name: 'language', type: 'select', label: 'Language', default: 'auto',
      options: [{ value: 'auto', label: 'Auto' }, { value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' },
        { value: 'es', label: 'Español' }, { value: 'fr', label: 'Français' }, { value: 'ja', label: '日本語' }, { value: 'zh', label: '中文' }] },
  ],
  validate, generatePreview, generate, regenerateOne,
};
