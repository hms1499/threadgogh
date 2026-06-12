import type { Tone } from './config';

const TONE_GUIDE: Record<Tone, string> = {
  educational: 'clear, informative, expert but approachable tone',
  funny: 'witty, meme-aware humor, still delivers real substance',
  threadboi: 'punchy growth-hacker style, bold hooks, strategic emoji (incl. 🧵)',
};

// ── Provider abstraction ──────────────────────────────────────────────
// Doi nha cung cap LLM chi bang env LLM_PROVIDER (mac dinh: groq mien phi).
// Groq/OpenRouter/Ollama dung chuan OpenAI chat-completions; Gemini rieng.

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
    keyEnv: '', // local, khong can key
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
        generationConfig: { maxOutputTokens: 2000, temperature: 0.8 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    return extractText('gemini', await res.json());
  }

  // OpenAI-compatible: groq, openrouter, ollama
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
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${config.provider} API ${res.status}: ${await res.text()}`);
  return extractText(config.provider, await res.json());
}

export function parseThreadJson(raw: string): string[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('LLM output is not valid JSON');
  }
  if (!Array.isArray(parsed) || !parsed.every((t) => typeof t === 'string')) {
    throw new Error('LLM output is not a JSON array of strings');
  }
  return parsed.map((t: string) =>
    t.length > 280 ? `${t.slice(0, 277)}...` : t,
  );
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
    'Return ONLY a JSON array of strings — one string per tweet.',
    'No markdown fences, no commentary, no numbering prefixes.',
    'Each tweet must be under 270 characters.',
    'Tweet 1 must be a strong hook. The last tweet wraps up with a takeaway or CTA.',
    'Write in the same language as the topic given by the user.',
  ].join(' ');
  const user = `Topic: ${topic}\nNumber of tweets: ${length}\nStyle: ${TONE_GUIDE[tone]}`;
  const raw = await callLlm(config, system, user);
  return parseThreadJson(raw);
}
