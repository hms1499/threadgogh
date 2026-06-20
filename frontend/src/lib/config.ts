// Public — usable on both client and server
export const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT ?? '';
export const SBTC_CONTRACT =
  process.env.NEXT_PUBLIC_SBTC_CONTRACT ??
  'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token';
export const HIRO_API =
  process.env.NEXT_PUBLIC_HIRO_API ?? 'https://api.testnet.hiro.so';

// App domain bound into the sign-in message (host only, no scheme/trailing slash).
// Both client and server read this so the message stays byte-identical; binding it
// stops a signature from being replayed against a phishing clone. Override to
// 'localhost' in .env.local for dev.
export const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'threadgogh.vercel.app';

// Stacks network — drives on-chain calls (receipt read, payInvoice) and explorer
// links. Set NEXT_PUBLIC_HIRO_API + NEXT_PUBLIC_CONTRACT to match when changing it.
export type StacksNetwork = 'mainnet' | 'testnet';
const RAW_NETWORK = process.env.NEXT_PUBLIC_STACKS_NETWORK ?? 'testnet';
if (RAW_NETWORK !== 'mainnet' && RAW_NETWORK !== 'testnet') {
  throw new Error(
    `Invalid NEXT_PUBLIC_STACKS_NETWORK "${RAW_NETWORK}". Allowed: mainnet, testnet`,
  );
}
export const STACKS_NETWORK: StacksNetwork = RAW_NETWORK;

// Server-only
export const PRICE_STX = Number(process.env.PRICE_STX ?? 100000);
export const PRICE_SBTC = Number(process.env.PRICE_SBTC ?? 100);
export const INVOICE_TTL_MINUTES = 15;
// Free whole-thread re-rolls allowed per paid invoice (#2).
export const MAX_FREE_REGENS = Number(process.env.MAX_FREE_REGENS ?? 3);

// Caps the unauthenticated quote branch of /api/generate (LLM call + DB row per hit)
// at RATE_LIMIT_QUOTE_MAX requests per IP per RATE_LIMIT_QUOTE_WINDOW_SEC seconds.
export const RATE_LIMIT_QUOTE_MAX = Number(process.env.RATE_LIMIT_QUOTE_MAX ?? 10);
export const RATE_LIMIT_QUOTE_WINDOW_SEC = Number(process.env.RATE_LIMIT_QUOTE_WINDOW_SEC ?? 60);

// A 'generating' lock older than this is considered stale (server likely crashed
// mid-generation). It can be reclaimed so a paid user is never stuck forever.
export const GENERATING_STALE_MS = 2 * 60_000;

export const TONES = ['educational', 'funny', 'threadboi'] as const;
export type Tone = (typeof TONES)[number];
export const LENGTHS = [5, 8, 12] as const;

// Output language for the generated thread. 'auto' keeps the model's default
// (match the topic's language); every other code forces the whole thread into
// that language regardless of the topic's. `name` is the English language name
// fed to the LLM; `label` is what the picker shows.
export const LANGUAGES = [
  { value: 'auto', label: '🌐 Auto', name: '' },
  { value: 'en', label: 'English', name: 'English' },
  { value: 'vi', label: 'Tiếng Việt', name: 'Vietnamese' },
  { value: 'es', label: 'Español', name: 'Spanish' },
  { value: 'fr', label: 'Français', name: 'French' },
  { value: 'ja', label: '日本語', name: 'Japanese' },
  { value: 'zh', label: '中文', name: 'Chinese' },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['value'];
export const LANGUAGE_CODES = LANGUAGES.map((l) => l.value) as readonly LanguageCode[];

// English name for the LLM prompt, or '' for 'auto'/unknown (caller then falls
// back to "same language as the topic"). Tolerant of null/undefined from the DB.
export function languageName(code: string | null | undefined): string {
  return LANGUAGES.find((l) => l.value === code)?.name ?? '';
}
