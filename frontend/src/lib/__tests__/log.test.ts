import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log } from '@/lib/log';

let spyError: ReturnType<typeof vi.spyOn>;
let spyWarn: ReturnType<typeof vi.spyOn>;
let spyLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
  spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

function parseLastLine(spy: ReturnType<typeof vi.spyOn>) {
  expect(spy).toHaveBeenCalledTimes(1);
  const arg = spy.mock.calls[0][0];
  expect(typeof arg).toBe('string'); // exactly one JSON string, not multiple args
  return JSON.parse(arg as string);
}

describe('log', () => {
  it('error level emits one JSON line to console.error', () => {
    log.error('generate.unhandled_error', { invoiceId: 'abc' });
    expect(spyWarn).not.toHaveBeenCalled();
    expect(spyLog).not.toHaveBeenCalled();
    const o = parseLastLine(spyError);
    expect(o.level).toBe('error');
    expect(o.event).toBe('generate.unhandled_error');
    expect(o.invoiceId).toBe('abc');
    expect(Number.isNaN(Date.parse(o.ts))).toBe(false); // parseable ISO timestamp
  });

  it('warn level emits to console.warn', () => {
    log.warn('rate_limit.check_failed', { key: 'quote:1.2.3.4' });
    const o = parseLastLine(spyWarn);
    expect(o.level).toBe('warn');
    expect(o.event).toBe('rate_limit.check_failed');
    expect(o.key).toBe('quote:1.2.3.4');
  });

  it('info level emits to console.log', () => {
    log.info('generate.stale_lock_reclaimed', { invoiceId: 'xyz' });
    const o = parseLastLine(spyLog);
    expect(o.level).toBe('info');
    expect(o.event).toBe('generate.stale_lock_reclaimed');
  });

  it('serializes an Error in err to { name, message, stack }', () => {
    const err = new TypeError('boom');
    log.error('x.y', { err });
    const o = parseLastLine(spyError);
    expect(o.err.name).toBe('TypeError');
    expect(o.err.message).toBe('boom');
    expect(typeof o.err.stack).toBe('string');
  });

  it('stringifies a non-Error err', () => {
    log.error('x.y', { err: 'plain string failure' });
    const o = parseLastLine(spyError);
    expect(o.err).toBe('plain string failure');
  });

  it('serializes a BigInt field without throwing', () => {
    expect(() => log.error('x.y', { amount: 100000n })).not.toThrow();
    const o = parseLastLine(spyError);
    expect(o.amount).toBe('100000'); // coerced to string, no precision loss
  });

  it('merges arbitrary fields through', () => {
    log.warn('x.y', { invoiceId: 'i', txId: 't', payer: 'ST1', count: 3 });
    const o = parseLastLine(spyWarn);
    expect(o).toMatchObject({ invoiceId: 'i', txId: 't', payer: 'ST1', count: 3 });
  });
});
