// Public — usable on both client and server
export const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT ?? '';
export const SBTC_CONTRACT =
  process.env.NEXT_PUBLIC_SBTC_CONTRACT ??
  'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token';
export const HIRO_API =
  process.env.NEXT_PUBLIC_HIRO_API ?? 'https://api.testnet.hiro.so';

// Server-only
export const PRICE_STX = Number(process.env.PRICE_STX ?? 100000);
export const PRICE_SBTC = Number(process.env.PRICE_SBTC ?? 100);
export const INVOICE_TTL_MINUTES = 15;

// A 'generating' lock older than this is considered stale (server likely crashed
// mid-generation). It can be reclaimed so a paid user is never stuck forever.
export const GENERATING_STALE_MS = 2 * 60_000;

export const TONES = ['educational', 'funny', 'threadboi'] as const;
export type Tone = (typeof TONES)[number];
export const LENGTHS = [5, 8, 12] as const;
