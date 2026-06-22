export type ServiceId = 'x-thread' | 'repurpose-thread' | 'hot-takes';
export type ServiceField =
  | { name: string; type: 'text';     label: string; placeholder?: string; maxLen: number; required?: boolean }
  | { name: string; type: 'textarea'; label: string; placeholder?: string; maxLen: number; required?: boolean }
  | { name: string; type: 'select';   label: string; options: { value: string; label: string }[]; default: string }
  | { name: string; type: 'number';   label: string; options: number[]; default: number };
export type GenCtx = { previewHook: string | null; previewOutline: string[] | null };
export type PreviewResult = { hook: string | null; outline: string[] | null };
export type ValidateResult<P> = { ok: true; params: P } | { ok: false; error: string };
export type ServiceDef<P = Record<string, unknown>> = {
  id: ServiceId;
  label: string;
  blurb: string;
  chained: boolean;
  priceStx: number;
  priceSbtc: number;
  fields: ServiceField[];
  validate(raw: unknown): ValidateResult<P>;
  generatePreview(p: P): Promise<PreviewResult>;
  generate(p: P, ctx: GenCtx): Promise<string[]>;
  regenerateOne(p: P, thread: string[], i: number): Promise<string>;
};
export type PublicServiceDef = Pick<ServiceDef,
  'id' | 'label' | 'blurb' | 'chained' | 'priceStx' | 'priceSbtc' | 'fields'>;
