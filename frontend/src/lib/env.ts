import { resolveLlmConfig } from './generate-thread';

// Server-only env validation. Fail fast with ONE aggregated, actionable error listing
// every problem, rather than a cryptic failure mid-request. Called at boot
// (instrumentation.ts) and defensively at the top of routes that need the full set.
//
// Note: NEXT_PUBLIC_* are inlined at build time, so this runs meaningfully on the
// server where the non-public vars (Supabase, LLM key) actually exist.

let validated = false;

export function assertServerEnv(): void {
  if (validated) return;

  const problems: string[] = [];

  if (!process.env.SUPABASE_URL) problems.push('SUPABASE_URL is missing');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) problems.push('SUPABASE_SERVICE_ROLE_KEY is missing');
  if (!process.env.NEXT_PUBLIC_CONTRACT) {
    problems.push('NEXT_PUBLIC_CONTRACT is missing (e.g. ST....thread-pay)');
  }

  // Secret that signs the history session cookie. Short keys weaken the HMAC.
  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  if (!sessionSecret) {
    problems.push('AUTH_SESSION_SECRET is missing (>=32 chars; signs history session cookies)');
  } else if (sessionSecret.length < 32) {
    problems.push('AUTH_SESSION_SECRET must be at least 32 characters');
  }

  // LLM provider name + key (resolveLlmConfig throws on an unknown provider name).
  try {
    const llm = resolveLlmConfig(process.env);
    if (llm.provider !== 'ollama' && !llm.apiKey) {
      problems.push(`LLM key missing for LLM_PROVIDER="${llm.provider}"`);
    }
  } catch (e) {
    problems.push(e instanceof Error ? e.message : 'invalid LLM_PROVIDER');
  }

  // Network consistency. config.ts falls back to TESTNET defaults for HIRO_API and
  // SBTC_CONTRACT when they're unset — on a mainnet build that silently wires the
  // app to testnet (mainnet contract read over a testnet API, testnet sBTC token).
  // Fail fast instead. Mainnet addresses start SP/SM; testnet ST/SN.
  const network = process.env.NEXT_PUBLIC_STACKS_NETWORK ?? 'testnet';
  const contract = process.env.NEXT_PUBLIC_CONTRACT ?? '';
  const sbtc = process.env.NEXT_PUBLIC_SBTC_CONTRACT;
  const hiro = process.env.NEXT_PUBLIC_HIRO_API;
  if (network === 'mainnet') {
    if (!hiro) problems.push('NEXT_PUBLIC_HIRO_API must be set on mainnet (else it falls back to testnet)');
    else if (hiro.includes('testnet')) problems.push(`NEXT_PUBLIC_HIRO_API points to testnet on a mainnet build: ${hiro}`);
    if (!sbtc) problems.push('NEXT_PUBLIC_SBTC_CONTRACT must be set on mainnet (else it falls back to testnet)');
    else if (!/^S[PM]/.test(sbtc)) problems.push(`NEXT_PUBLIC_SBTC_CONTRACT is not a mainnet (SP/SM) address: ${sbtc}`);
    if (contract && !/^S[PM]/.test(contract)) problems.push(`NEXT_PUBLIC_CONTRACT is not a mainnet (SP/SM) address: ${contract}`);
  } else {
    if (hiro && !hiro.includes('testnet')) problems.push(`NEXT_PUBLIC_HIRO_API does not look like testnet on a testnet build: ${hiro}`);
    if (sbtc && !/^S[TN]/.test(sbtc)) problems.push(`NEXT_PUBLIC_SBTC_CONTRACT is not a testnet (ST/SN) address: ${sbtc}`);
    if (contract && !/^S[TN]/.test(contract)) problems.push(`NEXT_PUBLIC_CONTRACT is not a testnet (ST/SN) address: ${contract}`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid server environment:\n  - ${problems.join('\n  - ')}\n` +
      'See frontend/.env.example for the full list.',
    );
  }

  validated = true;
}
