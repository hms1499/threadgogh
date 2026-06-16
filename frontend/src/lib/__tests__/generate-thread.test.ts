import { describe, expect, it } from 'vitest';
import { parseThreadJson, resolveLlmConfig, extractText, parseHook } from '../generate-thread';

describe('parseThreadJson', () => {
  it('parses a plain JSON array', () => {
    expect(parseThreadJson('["tweet 1", "tweet 2"]')).toEqual(['tweet 1', 'tweet 2']);
  });

  it('parses when wrapped in a code fence', () => {
    const raw = '```json\n["a", "b", "c"]\n```';
    expect(parseThreadJson(raw)).toEqual(['a', 'b', 'c']);
  });

  it('truncates tweets over 280 chars', () => {
    const long = 'x'.repeat(300);
    const out = parseThreadJson(JSON.stringify([long]));
    expect(out[0].length).toBeLessThanOrEqual(280);
  });

  it('throws when not an array of strings', () => {
    expect(() => parseThreadJson('{"a":1}')).toThrow();
    expect(() => parseThreadJson('not json')).toThrow();
  });

  it('unwraps an object wrapper like {"tweets":[...]}', () => {
    expect(parseThreadJson('{"tweets":["a","b"]}')).toEqual(['a', 'b']);
    expect(parseThreadJson('{"thread":["x"]}')).toEqual(['x']);
  });

  it('extracts the JSON array from surrounding prose', () => {
    const raw = 'Sure! Here is your thread:\n["one", "two"]\nHope that helps!';
    expect(parseThreadJson(raw)).toEqual(['one', 'two']);
  });

  it('extracts a JSON object wrapper from surrounding prose', () => {
    const raw = 'Here you go:\n```json\n{"tweets": ["a", "b"]}\n```\nEnjoy';
    expect(parseThreadJson(raw)).toEqual(['a', 'b']);
  });
});

describe('resolveLlmConfig', () => {
  it('defaults to groq with the llama 3.3 model', () => {
    const c = resolveLlmConfig({ GROQ_API_KEY: 'k' });
    expect(c.provider).toBe('groq');
    expect(c.baseUrl).toContain('groq.com');
    expect(c.model).toContain('llama');
    expect(c.apiKey).toBe('k');
  });

  it('reads LLM_PROVIDER to switch provider', () => {
    const c = resolveLlmConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' });
    expect(c.provider).toBe('gemini');
    expect(c.apiKey).toBe('g');
  });

  it('LLM_MODEL overrides the default model', () => {
    const c = resolveLlmConfig({ LLM_PROVIDER: 'openrouter', LLM_MODEL: 'org/x:free' });
    expect(c.model).toBe('org/x:free');
  });

  it('ollama needs no api key', () => {
    const c = resolveLlmConfig({ LLM_PROVIDER: 'ollama' });
    expect(c.provider).toBe('ollama');
    expect(c.apiKey).toBe('');
  });

  it('throws for an unknown provider', () => {
    expect(() => resolveLlmConfig({ LLM_PROVIDER: 'foobar' })).toThrow();
  });
});

describe('parseHook', () => {
  it('returns a single string from a JSON array', () => {
    expect(parseHook('["a strong hook"]')).toBe('a strong hook');
  });

  it('returns the string from a {"tweet": "..."} wrapper', () => {
    expect(parseHook('{"tweet":"hooky"}')).toBe('hooky');
  });

  it('returns a bare quoted string', () => {
    expect(parseHook('"just a hook"')).toBe('just a hook');
  });

  it('truncates a hook over 280 chars', () => {
    const long = 'x'.repeat(300);
    const out = parseHook(JSON.stringify([long]));
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out).toMatch(/\.\.\.$/);
  });

  it('throws when there is no usable string', () => {
    expect(() => parseHook('{"a":1}')).toThrow();
  });

  it('throws on a whitespace-only string', () => {
    expect(() => parseHook('"   "')).toThrow();
  });
});

describe('extractText', () => {
  it('extracts text from the OpenAI-compatible shape (groq/openrouter/ollama)', () => {
    const json = { choices: [{ message: { content: '["a","b"]' } }] };
    expect(extractText('groq', json)).toBe('["a","b"]');
  });

  it('extracts text from the Gemini shape', () => {
    const json = { candidates: [{ content: { parts: [{ text: '["c"]' }] } }] };
    expect(extractText('gemini', json)).toBe('["c"]');
  });

  it('throws when the shape is unexpected', () => {
    expect(() => extractText('groq', {})).toThrow();
    expect(() => extractText('gemini', {})).toThrow();
  });
});
