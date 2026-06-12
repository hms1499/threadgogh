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

  // LLM provider name + key (resolveLlmConfig throws on an unknown provider name).
  try {
    const llm = resolveLlmConfig(process.env);
    if (llm.provider !== 'ollama' && !llm.apiKey) {
      problems.push(`LLM key missing for LLM_PROVIDER="${llm.provider}"`);
    }
  } catch (e) {
    problems.push(e instanceof Error ? e.message : 'invalid LLM_PROVIDER');
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid server environment:\n  - ${problems.join('\n  - ')}\n` +
      'See frontend/.env.example for the full list.',
    );
  }

  validated = true;
}
