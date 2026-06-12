# LLM Providers

All generation lives in `frontend/src/lib/generate-thread.ts`. The provider is pluggable
via env — **do not** hardwire one or add `@anthropic-ai/sdk`. This is NOT the Claude API.

## Switching providers

Set `LLM_PROVIDER` (default `groq`). Supported: `groq | gemini | openrouter | ollama`.
Only the selected provider's key is needed.

| Provider | Default model | Key env | Endpoint shape |
|----------|---------------|---------|----------------|
| `groq` (default, free) | `llama-3.3-70b-versatile` | `GROQ_API_KEY` | OpenAI chat-completions |
| `gemini` | `gemini-2.0-flash` | `GEMINI_API_KEY` | Google generateContent |
| `openrouter` | `meta-llama/llama-3.3-70b-instruct:free` | `OPENROUTER_API_KEY` | OpenAI chat-completions |
| `ollama` (local) | `llama3.2` | — (none) | OpenAI chat-completions |

Optional overrides: `LLM_MODEL` (model id), `LLM_BASE_URL` (endpoint, e.g. a remote
Ollama). `resolveLlmConfig(env)` resolves all of this and throws on an unknown provider
or a missing key (except ollama).

## Output contract

The system prompt forces a strict format and `parseThreadJson(raw)` enforces it:

- input may be a bare JSON array or fenced in ```` ```json ```` — both are stripped.
- must be a **JSON array of strings**, else it throws (`not valid JSON` / `not a JSON
  array of strings`).
- each tweet is hard-capped at 280 chars (truncated with `…`).

`extractText(provider, json)` pulls the text out of the provider-specific response shape
(`choices[0].message.content` for OpenAI-compatible, `candidates[0].content.parts[0].text`
for Gemini). Tone presets live in `TONE_GUIDE` (`educational | funny | threadboi`),
matching `TONES` in `lib/config.ts`.

## Adding a provider

1. Add it to `PROVIDERS` and `DEFAULTS` (baseUrl, model, keyEnv).
2. If its response shape differs from OpenAI/Gemini, extend `extractText` and `callLlm`.
3. Add a unit test in `lib/__tests__/generate-thread.test.ts` for parsing/extraction.

Keep generation gated behind verified payment (it runs only after the receipt check in
`route.ts`), so provider cost is never incurred without an on-chain payment.
