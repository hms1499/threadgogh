'use client';
import { Segmented, Typography } from 'antd';
import type { PublicServiceDef } from '@/lib/services/types';

const { Text } = Typography;

export function ServicePicker({ services, selectedId, onSelect, disabled }: {
  services: PublicServiceDef[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const selected = services.find((s) => s.id === selectedId);
  return (
    <div style={{ marginBottom: 16 }}>
      <Segmented
        block
        disabled={disabled}
        value={selectedId}
        onChange={(v) => onSelect(String(v))}
        options={services.map((s) => ({ label: s.label, value: s.id }))}
      />
      {selected && (
        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
          {selected.blurb}
        </Text>
      )}
    </div>
  );
}
