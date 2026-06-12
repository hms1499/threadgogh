import { describe, expect, it } from 'vitest';
import { parseThreadJson, resolveLlmConfig, extractText } from '../generate-thread';

describe('parseThreadJson', () => {
  it('parse JSON array tran', () => {
    expect(parseThreadJson('["tweet 1", "tweet 2"]')).toEqual(['tweet 1', 'tweet 2']);
  });

  it('parse khi bi boc trong code fence', () => {
    const raw = '```json\n["a", "b", "c"]\n```';
    expect(parseThreadJson(raw)).toEqual(['a', 'b', 'c']);
  });

  it('cat tweet vuot 280 ky tu', () => {
    const long = 'x'.repeat(300);
    const out = parseThreadJson(JSON.stringify([long]));
    expect(out[0].length).toBeLessThanOrEqual(280);
  });

  it('throw khi khong phai array of strings', () => {
    expect(() => parseThreadJson('{"a":1}')).toThrow();
    expect(() => parseThreadJson('not json')).toThrow();
  });
});

describe('resolveLlmConfig', () => {
  it('mac dinh la groq voi model llama 3.3', () => {
    const c = resolveLlmConfig({ GROQ_API_KEY: 'k' });
    expect(c.provider).toBe('groq');
    expect(c.baseUrl).toContain('groq.com');
    expect(c.model).toContain('llama');
    expect(c.apiKey).toBe('k');
  });

  it('doc LLM_PROVIDER de doi nha cung cap', () => {
    const c = resolveLlmConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' });
    expect(c.provider).toBe('gemini');
    expect(c.apiKey).toBe('g');
  });

  it('LLM_MODEL override model mac dinh', () => {
    const c = resolveLlmConfig({ LLM_PROVIDER: 'openrouter', LLM_MODEL: 'org/x:free' });
    expect(c.model).toBe('org/x:free');
  });

  it('ollama khong can api key', () => {
    const c = resolveLlmConfig({ LLM_PROVIDER: 'ollama' });
    expect(c.provider).toBe('ollama');
    expect(c.apiKey).toBe('');
  });

  it('throw voi provider la', () => {
    expect(() => resolveLlmConfig({ LLM_PROVIDER: 'foobar' })).toThrow();
  });
});

describe('extractText', () => {
  it('boc text tu OpenAI-compatible shape (groq/openrouter/ollama)', () => {
    const json = { choices: [{ message: { content: '["a","b"]' } }] };
    expect(extractText('groq', json)).toBe('["a","b"]');
  });

  it('boc text tu Gemini shape', () => {
    const json = { candidates: [{ content: { parts: [{ text: '["c"]' }] } }] };
    expect(extractText('gemini', json)).toBe('["c"]');
  });

  it('throw khi shape khong nhu mong doi', () => {
    expect(() => extractText('groq', {})).toThrow();
    expect(() => extractText('gemini', {})).toThrow();
  });
});
