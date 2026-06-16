import type { Tone } from './config';

const TONE_GUIDE: Record<Tone, string> = {
  educational: 'clear, informative, expert but approachable tone',
  funny: 'witty, meme-aware humor, still delivers real substance',
  threadboi: 'punchy growth-hacker style, bold hooks, strategic emoji (incl. 🧵)',
};

// ── Provider abstraction ──────────────────────────────────────────────
// Switch LLM provider with just the LLM_PROVIDER env var (default: groq, free).
// Groq/OpenRouter/Ollama use the OpenAI chat-completions shape; Gemini is separate.

const PROVIDERS = ['groq', 'gemini', 'openrouter', 'ollama'] as const;
export type Provider = (typeof PROVIDERS)[number];

const DEFAULTS: Record<Provider, { baseUrl: string; model: string; keyEnv: string }> = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keyEnv: 'GROQ_API_KEY',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
    keyEnv: 'GEMINI_API_KEY',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    keyEnv: 'OPENROUTER_API_KEY',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    keyEnv: '', // local, no key needed
  },
};

export type LlmConfig = {
  provider: Provider;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export function resolveLlmConfig(env: Record<string, string | undefined>): LlmConfig {
  const provider = (env.LLM_PROVIDER ?? 'groq').toLowerCase();
  if (!PROVIDERS.includes(provider as Provider)) {
    throw new Error(`Unknown LLM_PROVIDER "${provider}". Allowed: ${PROVIDERS.join(', ')}`);
  }
  const d = DEFAULTS[provider as Provider];
  return {
    provider: provider as Provider,
    baseUrl: env.LLM_BASE_URL ?? d.baseUrl,
    model: env.LLM_MODEL ?? d.model,
    apiKey: d.keyEnv ? (env[d.keyEnv] ?? '') : '',
  };
}

export function extractText(provider: Provider, json: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = json as any;
  if (provider === 'gemini') {
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') throw new Error('Unexpected Gemini response shape');
    return text;
  }
  const text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('Unexpected OpenAI-compatible response shape');
  return text;
}

async function callLlm(config: LlmConfig, system: string, user: string): Promise<string> {
  if (config.provider === 'gemini') {
    const url = `${config.baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.8,
          responseMimeType: 'application/json',
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    return extractText('gemini', await res.json());
  }

  // OpenAI-compatible: groq, openrouter, ollama
  // (handled here; gemini returned above)
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 2000,
      temperature: 0.8,
      // Groq & OpenRouter support OpenAI JSON mode; it forces syntactically valid
      // JSON. Ollama doesn't, and rejects unknown fields, so skip it there.
      ...(config.provider === 'groq' || config.provider === 'openrouter'
        ? { response_format: { type: 'json_object' } }
        : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${config.provider} API ${res.status}: ${await res.text()}`);
  return extractText(config.provider, await res.json());
}

// Pull the first balanced JSON value (array or object) out of surrounding prose,
// respecting string literals so brackets inside text don't trip the scan.
function extractJsonSlice(s: string): string | null {
  const start = s.search(/[[{]/);
  if (start === -1) return null;
  const open = s[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

export function parseThreadJson(raw: string): string[] {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();

  // LLMs often wrap the JSON in prose ("Sure! Here is..."). Try a direct parse
  // first, then fall back to extracting the first balanced JSON value.
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const slice = extractJsonSlice(cleaned);
    if (slice === null) throw new Error('LLM output is not valid JSON');
    try {
      parsed = JSON.parse(slice);
    } catch {
      throw new Error('LLM output is not valid JSON');
    }
  }

  // Accept an object wrapper like {"tweets":[...]} / {"thread":[...]} — what
  // JSON-mode responses return — as well as a bare array.
  let arr: unknown = parsed;
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    arr = obj.tweets ?? obj.thread ?? obj.items
      ?? Object.values(obj).find((v) => Array.isArray(v));
  }

  if (!Array.isArray(arr) || !arr.every((t) => typeof t === 'string')) {
    throw new Error('LLM output is not a JSON array of strings');
  }
  return arr.map((t: string) =>
    t.length > 280 ? `${t.slice(0, 277)}...` : t,
  );
}

// Parse a single hook tweet from the LLM. Accepts a JSON array of one string,
// a {"tweet": "..."} / {"hook": "..."} object, or a bare quoted string.
export function parseHook(raw: string): string {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    const slice = extractJsonSlice(cleaned);
    value = slice === null ? cleaned : (() => { try { return JSON.parse(slice); } catch { return cleaned; } })();
  }
  let hook: unknown = value;
  if (Array.isArray(value)) hook = value[0];
  else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    hook = obj.tweet ?? obj.hook ?? Object.values(obj).find((v) => typeof v === 'string');
  }
  if (typeof hook !== 'string' || hook.trim() === '') {
    throw new Error('LLM hook output is not a usable string');
  }
  const trimmed = hook.trim();
  return trimmed.length > 280 ? `${trimmed.slice(0, 277)}...` : trimmed;
}

// One free, cheap LLM call: just the opening hook tweet. Used at quote time.
export async function generateHook(topic: string, tone: Tone): Promise<string> {
  const config = resolveLlmConfig(process.env);
  if (config.provider !== 'ollama' && !config.apiKey) {
    throw new Error(
      `Missing API key for "${config.provider}". Set ${DEFAULTS[config.provider].keyEnv} in .env.local`,
    );
  }
  const system = [
    'You are an expert X (Twitter) thread writer.',
    'Return ONLY a JSON object of the form {"tweet": "..."} — a single opening hook tweet.',
    'No markdown fences, no commentary, no numbering.',
    'The tweet must be under 270 characters and be a strong, scroll-stopping hook.',
    'Write in the same language as the topic given by the user.',
  ].join(' ');
  const user = `Topic: ${topic}\nStyle: ${TONE_GUIDE[tone]}`;
  const raw = await callLlm(config, system, user);
  return parseHook(raw);
}

export async function generateThread(
  topic: string, tone: Tone, length: number,
): Promise<string[]> {
  const config = resolveLlmConfig(process.env);
  if (config.provider !== 'ollama' && !config.apiKey) {
    throw new Error(
      `Missing API key for "${config.provider}". Set ${DEFAULTS[config.provider].keyEnv} in .env.local`,
    );
  }
  const system = [
    'You are an expert X (Twitter) thread writer.',
    'Return ONLY a JSON object of the form {"tweets": ["...", "..."]} — one string per tweet.',
    'No markdown fences, no commentary, no numbering prefixes.',
    'Each tweet must be under 270 characters.',
    'Tweet 1 must be a strong hook. The last tweet wraps up with a takeaway or CTA.',
    'Write in the same language as the topic given by the user.',
  ].join(' ');
  const user = `Topic: ${topic}\nNumber of tweets: ${length}\nStyle: ${TONE_GUIDE[tone]}`;
  const raw = await callLlm(config, system, user);
  return parseThreadJson(raw);
}
