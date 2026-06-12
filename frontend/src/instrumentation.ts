// Runs once when the server process starts. Validates the environment up front so a
// misconfigured deploy fails immediately with a clear message, instead of 500-ing on
// the first paid request. Node runtime only (env vars don't exist on the edge).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertServerEnv } = await import('./lib/env');
    assertServerEnv();
  }
}
