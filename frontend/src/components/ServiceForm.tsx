'use client';
import { Input, Select, Segmented, Typography } from 'antd';
import type { ServiceField } from '@/lib/services/types';

const { Text } = Typography;

export function ServiceForm({ fields, params, onChange, disabled }: {
  fields: ServiceField[];
  params: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      {fields.map((f) => (
        <div key={f.name} style={{ marginBottom: 12 }}>
          <Text style={{ display: 'block', marginBottom: 6 }}>{f.label}</Text>
          {f.type === 'text' && (
            <Input maxLength={f.maxLen} showCount placeholder={f.placeholder} disabled={disabled}
              value={params[f.name] as string} onChange={(e) => onChange(f.name, e.target.value)} />
          )}
          {f.type === 'textarea' && (
            <Input.TextArea maxLength={f.maxLen} showCount rows={6} placeholder={f.placeholder} disabled={disabled}
              value={params[f.name] as string} onChange={(e) => onChange(f.name, e.target.value)} />
          )}
          {f.type === 'select' && (
            <Select style={{ width: '100%' }} disabled={disabled} value={params[f.name]}
              options={f.options} onChange={(v) => onChange(f.name, v)} />
          )}
          {f.type === 'number' && (
            <Segmented disabled={disabled} value={params[f.name] as number}
              options={f.options.map((n) => ({ label: String(n), value: n }))}
              onChange={(v) => onChange(f.name, v)} />
          )}
        </div>
      ))}
    </div>
  );
}
