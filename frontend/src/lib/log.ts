// Dependency-free structured logger. Emits one JSON line per call to the console
// method matching the level, so logs still flow to stdout/stderr and any drain
// (e.g. Vercel). One short `scope.event` key + a bag of correlation fields
// (invoiceId, txId, payer, key, err) makes incidents greppable and joinable.
//
// Never log request content (topic/thread) — only metadata. invoiceId/payer are
// correlation keys; server-side logging of them is acceptable.

type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const sinks: Record<Level, (line: string) => void> = {
  info: (l) => console.log(l),
  warn: (l) => console.warn(l),
  error: (l) => console.error(l),
};

// Errors don't JSON.stringify usefully (message/stack are non-enumerable). Normalize
// any `err` field to a serializable shape; leave everything else untouched.
function normalize(fields?: Fields): Fields {
  if (!fields || !('err' in fields)) return { ...fields };
  const { err, ...rest } = fields;
  if (err instanceof Error) {
    return { ...rest, err: { name: err.name, message: err.message, stack: err.stack } };
  }
  return { ...rest, err: String(err) };
}

// BigInt has no JSON representation and would otherwise throw — and a logger must never
// throw, least of all from inside a catch block. Coerce to string (no precision loss).
function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function emit(level: Level, event: string, fields?: Fields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...normalize(fields),
  }, replacer);
  sinks[level](line);
}

export const log = {
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
};
