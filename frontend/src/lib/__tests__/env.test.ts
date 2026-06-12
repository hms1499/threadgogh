import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// assertServerEnv caches after the first success, so each test imports a fresh module.
async function freshAssert() {
  vi.resetModules();
  const mod = await import('../env');
  return mod.assertServerEnv;
}

const SAVED = { ...process.env };

beforeEach(() => {
  // Start from a clean slate for the vars under test.
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_CONTRACT;
  delete process.env.LLM_PROVIDER;
  delete process.env.GROQ_API_KEY;
});

afterEach(() => {
  process.env = { ...SAVED };
});

function setValidEnv() {
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.NEXT_PUBLIC_CONTRACT = 'ST000.thread-pay';
  process.env.LLM_PROVIDER = 'groq';
  process.env.GROQ_API_KEY = 'gsk_test';
}

describe('assertServerEnv', () => {
  it('throws listing every missing var', async () => {
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).toThrow(/SUPABASE_URL/);
    try {
      assertServerEnv();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(msg).toMatch(/NEXT_PUBLIC_CONTRACT/);
      expect(msg).toMatch(/LLM key missing/);
    }
  });

  it('passes with a complete env', async () => {
    setValidEnv();
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).not.toThrow();
  });

  it('flags an unknown LLM_PROVIDER', async () => {
    setValidEnv();
    process.env.LLM_PROVIDER = 'gpt5';
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).toThrow(/LLM_PROVIDER/);
  });

  it('ollama needs no key', async () => {
    setValidEnv();
    process.env.LLM_PROVIDER = 'ollama';
    delete process.env.GROQ_API_KEY;
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).not.toThrow();
  });
});
