import type { ServiceField } from './types';

export function defaultParams(fields: ServiceField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    out[f.name] = f.type === 'text' || f.type === 'textarea' ? '' : f.default;
  }
  return out;
}

export function clientValidate(fields: ServiceField[], params: Record<string, unknown>): string | null {
  for (const f of fields) {
    if (f.type === 'text' || f.type === 'textarea') {
      const val = typeof params[f.name] === 'string' ? (params[f.name] as string) : '';
      if (f.required && val.trim() === '') return `${f.label} is required`;
      if (val.length > f.maxLen) return `${f.label} is too long (max ${f.maxLen})`;
    }
  }
  return null;
}
