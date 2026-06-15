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
  delete process.env.NEXT_PUBLIC_STACKS_NETWORK;
  delete process.env.NEXT_PUBLIC_HIRO_API;
  delete process.env.NEXT_PUBLIC_SBTC_CONTRACT;
  delete process.env.AUTH_SESSION_SECRET;
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
  process.env.AUTH_SESSION_SECRET = 'test-secret-at-least-32-bytes-long-xxxxxx';
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

  it('rejects a missing AUTH_SESSION_SECRET', async () => {
    setValidEnv();
    delete process.env.AUTH_SESSION_SECRET;
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).toThrow(/AUTH_SESSION_SECRET/);
  });

  it('rejects a too-short AUTH_SESSION_SECRET', async () => {
    setValidEnv();
    process.env.AUTH_SESSION_SECRET = 'short';
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).toThrow(/AUTH_SESSION_SECRET/);
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

  function setValidMainnetEnv() {
    setValidEnv();
    process.env.NEXT_PUBLIC_STACKS_NETWORK = 'mainnet';
    process.env.NEXT_PUBLIC_CONTRACT = 'SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.thread-pay';
    process.env.NEXT_PUBLIC_SBTC_CONTRACT = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token';
    process.env.NEXT_PUBLIC_HIRO_API = 'https://api.hiro.so';
  }

  it('passes with a consistent mainnet env', async () => {
    setValidMainnetEnv();
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).not.toThrow();
  });

  it('rejects a testnet HIRO_API on a mainnet build', async () => {
    setValidMainnetEnv();
    process.env.NEXT_PUBLIC_HIRO_API = 'https://api.testnet.hiro.so';
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).toThrow(/testnet/);
  });

  it('rejects a testnet contract address on a mainnet build', async () => {
    setValidMainnetEnv();
    process.env.NEXT_PUBLIC_CONTRACT = 'ST2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB4PBYSC2.thread-pay';
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).toThrow(/mainnet \(SP\/SM\) address/);
  });

  it('rejects a missing SBTC_CONTRACT on mainnet (would fall back to testnet)', async () => {
    setValidMainnetEnv();
    delete process.env.NEXT_PUBLIC_SBTC_CONTRACT;
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).toThrow(/NEXT_PUBLIC_SBTC_CONTRACT must be set/);
  });

  it('rejects a mainnet contract on a testnet build', async () => {
    setValidEnv(); // network unset -> testnet
    process.env.NEXT_PUBLIC_CONTRACT = 'SP2CMK69QNY60HBG8BJ4X5TD7XX2ZT4XB62V13SV.thread-pay';
    const assertServerEnv = await freshAssert();
    expect(() => assertServerEnv()).toThrow(/testnet \(ST\/SN\) address/);
  });
});
